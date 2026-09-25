/**
 * A small stand-in for the PostgREST client, enough to run the campaign
 * queue against. Not a suite: tests/email-sending.test.ts imports it.
 *
 * What it keeps honest:
 *   - every update, insert and delete is applied whole before the next
 *     await, which is what a single SQL statement gives the queue;
 *   - check constraints on status (the old five words, or the new set);
 *   - the unique (campaign_id, email) index on recipient rows;
 *   - columns the database does not have yet refuse like PostgREST does;
 *   - updated_at moves on every update, like the trigger.
 */

type Row = Record<string, unknown>
type Err = { code: string; message: string }

export interface FakeOptions {
  modern: boolean
}

const LEGACY_CAMPAIGN = ["draft", "scheduled", "sending", "sent", "failed"]
const MODERN_CAMPAIGN = ["draft", "scheduled", "queued", "sending", "sent", "partially_failed", "failed", "cancelled"]
const LEGACY_RECIPIENT = ["pending", "sent", "delivered", "bounced", "failed"]
const MODERN_RECIPIENT = ["pending", "sending", "sent", "delivered", "bounced", "complained", "failed", "skipped", "unknown"]

const MODERN_ONLY: Record<string, string[]> = {
  email_campaigns: ["last_error", "send_idempotency_key", "completed_at", "track_opens", "rendered_html"],
  campaign_recipients: ["attempts", "next_attempt_at", "claimed_at"],
}

/** The wall clock, but never the same instant twice, like clock_timestamp(). */
let clock = 0
export function tick(): string {
  clock = Math.max(Date.now(), clock + 1)
  return new Date(clock).toISOString()
}

let seq = 0
const uuid = () => `00000000-0000-4000-8000-${(++seq).toString(16).padStart(12, "0")}`

export class FakeDb {
  tables: Record<string, Row[]> = {
    email_campaigns: [],
    campaign_recipients: [],
    subscribers: [],
    creators: [],
    profiles: [],
    email_segments: [],
  }
  modern: boolean
  /** How many statements have run, for "it asked the database N times". */
  statements = 0

  constructor(o: FakeOptions) {
    this.modern = o.modern
  }

  from(table: string) {
    if (!this.tables[table]) this.tables[table] = []
    return new Query(this, table)
  }

  missingColumn(table: string, cols: string[]): Err | null {
    if (this.modern) return null
    const missing = (MODERN_ONLY[table] ?? []).find((c) => cols.includes(c))
    return missing ? { code: "PGRST204", message: `column ${missing} does not exist` } : null
  }

  checkStatus(table: string, row: Row): Err | null {
    const allowed =
      table === "email_campaigns" ? (this.modern ? MODERN_CAMPAIGN : LEGACY_CAMPAIGN) : table === "campaign_recipients" ? (this.modern ? MODERN_RECIPIENT : LEGACY_RECIPIENT) : null
    if (allowed && row.status !== undefined && !allowed.includes(String(row.status))) return { code: "23514", message: "check violation" }
    return null
  }
}

type Filter = (r: Row) => boolean

function cmp(a: unknown, b: unknown): number {
  const x = typeof a === "string" && /^\d{4}-\d\d-\d\dT/.test(a) ? Date.parse(a) : a
  const y = typeof b === "string" && /^\d{4}-\d\d-\d\dT/.test(b) ? Date.parse(b) : b
  if (x === y) return 0
  if (x === null || x === undefined) return -1
  if (y === null || y === undefined) return 1
  return (x as number) < (y as number) ? -1 : 1
}

class Query {
  private filters: Filter[] = []
  private op: "select" | "insert" | "upsert" | "update" | "delete" = "select"
  private cols: string[] = []
  private payload: Row[] | Row | null = null
  private opts: { count?: string; head?: boolean; onConflict?: string; ignoreDuplicates?: boolean } = {}
  private returning = false
  private orderBy: { col: string; asc: boolean } | null = null
  private lim: number | null = null
  private rangeFrom: number | null = null
  private rangeTo: number | null = null
  private single: "maybe" | "one" | null = null

  constructor(private db: FakeDb, private table: string) {}

  select(cols = "*", opts: { count?: string; head?: boolean } = {}) {
    if (this.op === "select") {
      this.cols = cols.split(",").map((c) => c.trim())
      this.opts = { ...this.opts, ...opts }
    } else {
      this.returning = true
      this.cols = cols.split(",").map((c) => c.trim())
    }
    return this
  }
  insert(rows: Row[] | Row) {
    this.op = "insert"
    this.payload = rows
    return this
  }
  upsert(rows: Row[] | Row, opts: { onConflict?: string; ignoreDuplicates?: boolean } = {}) {
    this.op = "upsert"
    this.payload = rows
    this.opts = { ...this.opts, ...opts }
    return this
  }
  update(patch: Row) {
    this.op = "update"
    this.payload = patch
    return this
  }
  delete() {
    this.op = "delete"
    return this
  }
  eq(col: string, v: unknown) {
    this.filters.push((r) => cmp(r[col], v) === 0 && r[col] !== undefined && r[col] !== null)
    return this
  }
  neq(col: string, v: unknown) {
    this.filters.push((r) => r[col] !== v)
    return this
  }
  in(col: string, vs: unknown[]) {
    this.filters.push((r) => vs.includes(r[col]))
    return this
  }
  lt(col: string, v: unknown) {
    this.filters.push((r) => r[col] !== null && r[col] !== undefined && cmp(r[col], v) < 0)
    return this
  }
  lte(col: string, v: unknown) {
    this.filters.push((r) => r[col] !== null && r[col] !== undefined && cmp(r[col], v) <= 0)
    return this
  }
  gte(col: string, v: unknown) {
    this.filters.push((r) => r[col] !== null && r[col] !== undefined && cmp(r[col], v) >= 0)
    return this
  }
  not(col: string, op: string, v: unknown) {
    if (op === "is") this.filters.push((r) => r[col] !== null && r[col] !== undefined)
    else if (op === "in") {
      const list = String(v).replace(/[()]/g, "").split(",")
      this.filters.push((r) => !list.includes(String(r[col])))
    }
    return this
  }
  or(expr: string) {
    const parts = expr.split(",").map((p) => {
      const [col, op, ...rest] = p.split(".")
      const val = rest.join(".")
      return (r: Row) => (op === "is" ? r[col] === null || r[col] === undefined : op === "lte" ? r[col] != null && cmp(r[col], val) <= 0 : false)
    })
    this.filters.push((r) => parts.some((f) => f(r)))
    return this
  }
  order(col: string, o: { ascending?: boolean } = {}) {
    this.orderBy = { col, asc: o.ascending !== false }
    return this
  }
  limit(n: number) {
    this.lim = n
    return this
  }
  range(a: number, b: number) {
    this.rangeFrom = a
    this.rangeTo = b
    return this
  }
  maybeSingle() {
    this.single = "maybe"
    return this
  }

  then<T>(resolve: (v: { data: unknown; error: Err | null; count?: number | null }) => T, reject?: (e: unknown) => T) {
    try {
      return Promise.resolve(resolve(this.run()))
    } catch (e) {
      return reject ? Promise.resolve(reject(e)) : Promise.reject(e)
    }
  }

  private matches(): Row[] {
    return this.db.tables[this.table].filter((r) => this.filters.every((f) => f(r)))
  }

  private run(): { data: unknown; error: Err | null; count?: number | null } {
    this.db.statements++
    const rows = this.db.tables[this.table]
    if (this.op === "select") {
      const missing = this.db.missingColumn(this.table, this.cols)
      if (missing) return { data: null, error: missing }
      let out = this.matches()
      if (this.orderBy) {
        const { col, asc } = this.orderBy
        out = [...out].sort((a, b) => (asc ? cmp(a[col], b[col]) : cmp(b[col], a[col])))
      }
      if (this.rangeFrom !== null) out = out.slice(this.rangeFrom, (this.rangeTo ?? out.length) + 1)
      if (this.lim !== null) out = out.slice(0, this.lim)
      if (this.opts.head) return { data: null, error: null, count: out.length }
      const copy = out.map((r) => ({ ...r }))
      if (this.single) return { data: copy[0] ?? null, error: null }
      return { data: copy, error: null, count: this.opts.count ? copy.length : null }
    }
    if (this.op === "insert" || this.op === "upsert") {
      const list = Array.isArray(this.payload) ? this.payload : [this.payload as Row]
      const missing = this.db.missingColumn(this.table, list.flatMap((r) => Object.keys(r)))
      if (missing) return { data: null, error: missing }
      if (this.op === "upsert" && this.table === "campaign_recipients" && !this.db.modern && (this.db as FakeDb & { noUniqueIndex?: boolean }).noUniqueIndex) {
        return { data: null, error: { code: "42P10", message: "no unique constraint" } }
      }
      const added: Row[] = []
      for (const r of list) {
        const bad = this.db.checkStatus(this.table, r)
        if (bad) return { data: null, error: bad }
        if (this.table === "campaign_recipients") {
          const dupe = rows.some((x) => x.campaign_id === r.campaign_id && x.email === r.email)
          if (dupe) {
            if (this.op === "upsert" && this.opts.ignoreDuplicates) continue
            return { data: null, error: { code: "23505", message: "duplicate" } }
          }
        }
        const row: Row = {
          id: uuid(),
          created_at: tick(),
          updated_at: tick(),
          ...(this.table === "campaign_recipients" ? { tracking_token: uuid(), ...(this.db.modern ? { attempts: 0, next_attempt_at: null, claimed_at: null } : {}), error_message: null } : {}),
          ...r,
        }
        rows.push(row)
        added.push(row)
      }
      return { data: this.returning ? added.map((r) => ({ ...r })) : null, error: null }
    }
    if (this.op === "update") {
      const patch = this.payload as Row
      const missing = this.db.missingColumn(this.table, Object.keys(patch))
      if (missing) return { data: null, error: missing }
      const bad = this.db.checkStatus(this.table, patch)
      if (bad) return { data: null, error: bad }
      const hit = this.matches()
      for (const r of hit) {
        Object.assign(r, patch)
        if (this.table === "email_campaigns") r.updated_at = tick()
      }
      return { data: this.returning ? hit.map((r) => ({ ...r })) : null, error: null }
    }
    const hit = this.matches()
    this.db.tables[this.table] = rows.filter((r) => !hit.includes(r))
    return { data: null, error: null }
  }
}
