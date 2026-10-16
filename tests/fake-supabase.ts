/**
 * ===========================================================================
 *  A DATABASE THAT KEEPS POSTGRES'S PROMISES, IN MEMORY
 * ===========================================================================
 * The real query code (lib/automations/supabase-store.ts, lib/contacts/
 * checkout-contact.ts, lib/automations/track-events.ts) talks to Supabase
 * through `from(table)` chains and `rpc(name)`. This answers those chains the
 * way PostgREST and Postgres would, with the parts that make the code
 * correct and nothing kinder:
 *
 *   unique       a table's unique keys refuse a second row with 23505, an
 *                upsert with ignoreDuplicates writes nothing for it
 *   checks       a table's checks refuse a row with 23514
 *   missing      a table or function that is not registered answers 42P01
 *                or 42883, the way a database that has not run its SQL does
 *   defaults     ids, tokens and timestamps, on the fake clock
 *   filters      eq, neq, in, is, ilike (with \ escapes), gt, gte, lt, lte,
 *                order, limit, count with head, maybeSingle and single
 *
 * One call is one synchronous pass, as one statement is: nothing awaits
 * between reading and writing inside a call, so a conditional UPDATE is
 * atomic here as it is there.
 */

import { randomUUID } from "node:crypto"

export type Row = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
type PgError = { code: string; message: string }
type Result = { data: any; error: PgError | null; count?: number | null } // eslint-disable-line @typescript-eslint/no-explicit-any

export interface TableSpec {
  /** Each entry is a unique key: its columns, or a function of the row (an expression index). */
  unique?: Array<string[] | ((row: Row) => string)>
  /** A message when the row breaks a check, or null. */
  checks?: Array<(row: Row) => string | null>
  defaults?: (db: FakeSupabase) => Row
  /** Embedded relations a select may name: `name ( columns )`. */
  embeds?: Record<string, (row: Row, db: FakeSupabase) => unknown>
}

type Filter = (row: Row) => boolean

function likeToRegExp(pattern: string): RegExp {
  let out = ""
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i]
    if (c === "\\" && i + 1 < pattern.length) {
      out += pattern[++i].replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    } else if (c === "%") out += ".*"
    else if (c === "_") out += "."
    else out += c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  }
  return new RegExp(`^${out}$`, "is")
}

const cmp = (a: unknown, b: unknown): number => {
  if (typeof a === "string" && typeof b === "string") {
    const da = Date.parse(a)
    const db = Date.parse(b)
    if (/^\d{4}-\d\d-\d\dT/.test(a) && /^\d{4}-\d\d-\d\dT/.test(b) && !Number.isNaN(da) && !Number.isNaN(db)) return da - db
    return a < b ? -1 : a > b ? 1 : 0
  }
  return Number(a) - Number(b)
}

export class FakeSupabase {
  tables: Record<string, Row[]> = {}
  specs: Record<string, TableSpec> = {}
  rpcs: Record<string, (args: Row, db: FakeSupabase) => Result> = {}
  clock = Date.parse("2026-09-24T12:00:00Z")
  /** Every write, as "insert table", "update table", for tests that care about order. */
  writes: string[] = []

  now(): string {
    return new Date(this.clock).toISOString()
  }

  table(name: string, spec: TableSpec = {}, rows: Row[] = []): this {
    this.specs[name] = spec
    this.tables[name] = []
    for (const r of rows) this.tables[name].push({ ...(spec.defaults?.(this) ?? {}), ...r })
    return this
  }

  rows(name: string): Row[] {
    return this.tables[name] ?? []
  }

  from(name: string): Query {
    return new Query(this, name)
  }

  rpc(name: string, args: Row = {}): Promise<Result> {
    const fn = this.rpcs[name]
    if (!fn) return Promise.resolve({ data: null, error: { code: "42883", message: `function ${name} does not exist` } })
    try {
      return Promise.resolve(fn(args, this))
    } catch (e) {
      return Promise.resolve({ data: null, error: { code: "P0001", message: (e as Error).message } })
    }
  }

  /** The unique and check rules for a candidate row set. Null when it holds. */
  violation(name: string, all: Row[]): PgError | null {
    const spec = this.specs[name] ?? {}
    for (const r of all) for (const check of spec.checks ?? []) {
      const m = check(r)
      if (m) return { code: "23514", message: `new row violates check constraint: ${m}` }
    }
    for (const key of spec.unique ?? []) {
      const seen = new Set<string>()
      for (const r of all) {
        const k = typeof key === "function" ? key(r) : key.map((c) => JSON.stringify(r[c] ?? null)).join("|")
        if (typeof key !== "function" && key.some((c) => r[c] === null || r[c] === undefined)) continue
        if (seen.has(k)) return { code: "23505", message: "duplicate key value violates unique constraint" }
        seen.add(k)
      }
    }
    return null
  }
}

class Query implements PromiseLike<Result> {
  private op: "select" | "insert" | "update" | "upsert" | "delete" = "select"
  private filters: Filter[] = []
  private payload: Row[] = []
  private patch: Row = {}
  private returning = false
  private selectCols = "*"
  private countMode = false
  private head = false
  private orderBy: Array<{ col: string; asc: boolean }> = []
  private max: number | null = null
  private skip = 0
  private one: "one" | "maybe" | null = null
  private conflict: string[] = []
  private ignoreDuplicates = false

  constructor(private db: FakeSupabase, private name: string) {}

  select(cols = "*", opts?: { count?: string; head?: boolean }) {
    if (this.op === "select") this.selectCols = cols
    else this.returning = true
    if (opts?.count) this.countMode = true
    if (opts?.head) this.head = true
    return this
  }
  insert(rows: Row | Row[]) {
    this.op = "insert"
    this.payload = Array.isArray(rows) ? rows : [rows]
    return this
  }
  upsert(rows: Row | Row[], opts?: { onConflict?: string; ignoreDuplicates?: boolean }) {
    this.op = "upsert"
    this.payload = Array.isArray(rows) ? rows : [rows]
    this.conflict = (opts?.onConflict ?? "").split(",").map((s) => s.trim()).filter(Boolean)
    this.ignoreDuplicates = opts?.ignoreDuplicates === true
    return this
  }
  update(patch: Row) {
    this.op = "update"
    this.patch = patch
    return this
  }
  delete() {
    this.op = "delete"
    return this
  }
  eq(col: string, v: unknown) { this.filters.push((r) => r[col] === v); return this }
  neq(col: string, v: unknown) { this.filters.push((r) => r[col] !== v); return this }
  in(col: string, vs: unknown[]) { this.filters.push((r) => vs.includes(r[col])); return this }
  is(col: string, v: null | boolean) { this.filters.push((r) => (v === null ? r[col] === null || r[col] === undefined : r[col] === v)); return this }
  /* `not(col, "is", null)` and `not(col, "eq", v)`, the two shapes the code uses. */
  not(col: string, op: string, v: unknown) {
    if (op === "is") this.filters.push((r) => (v === null ? !(r[col] === null || r[col] === undefined) : r[col] !== v))
    else if (op === "eq") this.filters.push((r) => r[col] !== v)
    else throw new Error(`fake-supabase: not(${op}) is not modelled`)
    return this
  }
  ilike(col: string, pattern: string) { const re = likeToRegExp(pattern); this.filters.push((r) => typeof r[col] === "string" && re.test(r[col])); return this }
  gt(col: string, v: unknown) { this.filters.push((r) => r[col] !== null && r[col] !== undefined && cmp(r[col], v) > 0); return this }
  gte(col: string, v: unknown) { this.filters.push((r) => r[col] !== null && r[col] !== undefined && cmp(r[col], v) >= 0); return this }
  lt(col: string, v: unknown) { this.filters.push((r) => r[col] !== null && r[col] !== undefined && cmp(r[col], v) < 0); return this }
  lte(col: string, v: unknown) { this.filters.push((r) => r[col] !== null && r[col] !== undefined && cmp(r[col], v) <= 0); return this }
  order(col: string, opts?: { ascending?: boolean }) { this.orderBy.push({ col, asc: opts?.ascending !== false }); return this }
  limit(n: number) { this.max = n; return this }
  /* `range(from, to)`, both ends included, as PostgREST pages. */
  range(from: number, to: number) { this.skip = from; this.max = to - from + 1; return this }
  /* `or("col.op.value,col.op.value")` with eq, neq, gt, gte, lt, lte, a quoted value read as text: the keyset's "past this row". */
  or(filters: string) {
    const parts = filters.match(/(?:[^,"]+|"[^"]*")+/g) ?? []
    const tests = parts.map((part) => {
      const m = /^([a-z_]+)\.(eq|neq|gt|gte|lt|lte)\.(.*)$/i.exec(part.trim())
      if (!m) throw new Error(`fake-supabase: or(${part}) is not modelled`)
      const [, col, op, raw] = m
      const v = raw.startsWith('"') && raw.endsWith('"') ? raw.slice(1, -1) : raw
      return (r: Row) => {
        if (r[col] === null || r[col] === undefined) return false
        const c = cmp(r[col], v)
        return op === "eq" ? c === 0 : op === "neq" ? c !== 0 : op === "gt" ? c > 0 : op === "gte" ? c >= 0 : op === "lt" ? c < 0 : c <= 0
      }
    })
    this.filters.push((r) => tests.some((t) => t(r)))
    return this
  }
  maybeSingle() { this.one = "maybe"; return this }
  single() { this.one = "one"; return this }

  then<A = Result, B = never>(onOk?: ((v: Result) => A | PromiseLike<A>) | null, onErr?: ((e: unknown) => B | PromiseLike<B>) | null): Promise<A | B> {
    let result: Result
    try {
      result = this.run()
    } catch (e) {
      return Promise.reject(e).then(onOk, onErr)
    }
    return Promise.resolve(result).then(onOk, onErr)
  }

  private shape(rows: Row[]): Row[] {
    const spec = this.db.specs[this.name] ?? {}
    const embeds = [...this.selectCols.matchAll(/([a-z_]+)\s*\(/gi)].map((m) => m[1]).filter((n) => spec.embeds?.[n])
    return rows.map((r) => {
      const copy = { ...r }
      for (const e of embeds) copy[e] = spec.embeds![e](r, this.db)
      return copy
    })
  }

  private finish(rows: Row[] | null, error: PgError | null = null): Result {
    if (error) return { data: null, error }
    if (this.head) return { data: null, error: null, count: rows?.length ?? 0 }
    const count = this.countMode ? rows?.length ?? 0 : null
    if (this.one) {
      const list = rows ?? []
      if (list.length > 1) return { data: null, error: { code: "PGRST116", message: "more than one row" } }
      if (list.length === 0) return this.one === "one" ? { data: null, error: { code: "PGRST116", message: "no rows" } } : { data: null, error: null, count }
      return { data: list[0], error: null, count }
    }
    return { data: rows, error: null, count }
  }

  private run(): Result {
    const table = this.db.tables[this.name]
    if (!table) return { data: null, error: { code: "42P01", message: `relation "public.${this.name}" does not exist` } }
    const spec = this.db.specs[this.name] ?? {}
    const match = (r: Row) => this.filters.every((f) => f(r))

    if (this.op === "select") {
      let rows = table.filter(match)
      for (const o of [...this.orderBy].reverse()) rows = [...rows].sort((a, b) => (o.asc ? 1 : -1) * cmp(a[o.col], b[o.col]))
      if (this.skip || this.max !== null) rows = rows.slice(this.skip, this.max === null ? undefined : this.skip + this.max)
      return this.finish(this.shape(rows))
    }

    if (this.op === "insert" || this.op === "upsert") {
      const made: Row[] = []
      const next = [...table]
      for (const p of this.payload) {
        const row = { ...(spec.defaults?.(this.db) ?? {}), ...p }
        if (this.op === "upsert" && this.conflict.length > 0) {
          const hit = next.find((r) => this.conflict.every((c) => r[c] === row[c]))
          if (hit) {
            if (!this.ignoreDuplicates) Object.assign(hit, p)
            continue
          }
        }
        next.push(row)
        made.push(row)
      }
      const bad = this.db.violation(this.name, next)
      if (bad) return this.finish(null, bad)
      table.push(...made)
      this.db.writes.push(`${this.op} ${this.name}`)
      return this.finish(this.returning ? this.shape(made) : null)
    }

    if (this.op === "update") {
      const hits = table.filter(match)
      const after = table.map((r) => (hits.includes(r) ? { ...r, ...this.patch } : r))
      const bad = this.db.violation(this.name, after)
      if (bad) return this.finish(null, bad)
      for (const r of hits) Object.assign(r, this.patch)
      if (hits.length) this.db.writes.push(`update ${this.name}`)
      return this.finish(this.returning ? this.shape(hits) : null)
    }

    const gone = table.filter(match)
    this.db.tables[this.name] = table.filter((r) => !gone.includes(r))
    return this.finish(this.returning ? gone : null)
  }
}

/* ─── The automation engine's tables and functions ────────────────────── */

const uuid = () => randomUUID()

/** email_flows, runs, jobs, sends, subscribers, orders, products and the rest, with the SQL's keys. */
export function automationDb(): FakeSupabase {
  const db = new FakeSupabase()
  const stamp = (d: FakeSupabase) => ({ created_at: d.now(), updated_at: d.now() })
  db.table("creators", { defaults: () => ({ id: uuid() }) })
  db.table("profiles", { defaults: () => ({ id: uuid() }) })
  db.table("products", { defaults: () => ({ id: uuid() }) })
  db.table("orders", { defaults: (d) => ({ id: uuid(), status: "completed", ...stamp(d) }), unique: [["receipt_token"]] })
  db.table("store_theme_installs", {
    defaults: () => ({ id: uuid(), sort_order: 0 }),
    embeds: { store_theme_settings: (r, d) => d.rows("store_theme_settings").filter((s) => s.install_id === r.id).map((s) => ({ settings: s.settings })) },
  })
  db.table("store_theme_settings", { defaults: () => ({ id: uuid() }) })
  db.table("email_flows", { defaults: (d) => ({ id: uuid(), status: "draft", trigger_config: {}, ...stamp(d) }) })
  db.table("email_flow_runs", {
    defaults: (d) => ({ id: uuid(), status: "active", context: {}, started_at: d.now(), exit_reason: null, finished_at: null, ...stamp(d) }),
    unique: [["flow_id", "dedupe_key"]],
    checks: [(r) => (["active", "completed", "exited", "cancelled", "failed"].includes(r.status) ? null : "email_flow_runs_status_check")],
  })
  db.table("email_flow_jobs", {
    defaults: (d) => ({ id: uuid(), state: "queued", attempts: 0, max_attempts: 5, run_at: d.now(), last_error: null, claimed_by: null, claimed_until: null, ...stamp(d) }),
    unique: [["run_id", "step_id"]],
  })
  db.table("email_flow_sends", {
    defaults: (d) => ({ id: uuid(), status: "sending", token: uuid(), sent_at: null, opened_at: null, clicked_at: null, provider_id: null, error: null, ...stamp(d) }),
    unique: [["run_id", "step_id"], ["token"]],
  })
  db.table("subscribers", {
    defaults: (d) => ({ id: uuid(), status: "subscribed", is_active: true, source_detail: null, unsubscribed_at: null, created_at: d.now() }),
    unique: [["creator_id", "email"], (r) => `${r.creator_id}|${String(r.email).toLowerCase()}`],
    checks: [(r) => (r.status === null || ["subscribed", "unsubscribed", "bounced", "complained", "cleaned", "customer"].includes(r.status) ? null : "subscribers_status_check")],
  })
  db.table("checkout_starts", {
    defaults: (d) => ({ id: uuid(), email_opt_in: false, handled_at: null, outcome: null, created_at: d.now() }),
    unique: [["payment_intent_id"]],
    checks: [(r) => (r.email === String(r.email).toLowerCase() ? null : "checkout_starts_email_lower")],
  })

  /* enroll_email_flow, as supabase/sql/RUN_EMAIL_AUTOMATIONS.sql writes it. */
  db.rpcs.enroll_email_flow = (a, d) => {
    const email = String(a.p_email).trim().toLowerCase()
    const flow = d.rows("email_flows").find((f) => f.id === a.p_flow_id && f.creator_id === a.p_creator_id && f.status === "active")
    if (!flow) return { data: null, error: null }
    const mine = d.rows("email_flow_runs").filter((r) => r.flow_id === a.p_flow_id && r.email === email)
    if (a.p_window_days < 0 && mine.length > 0) return { data: null, error: null }
    if (a.p_window_days > 0 && mine.some((r) => Date.parse(r.started_at) > d.clock - a.p_window_days * 86_400_000)) return { data: null, error: null }
    if (d.rows("email_flow_runs").some((r) => r.flow_id === a.p_flow_id && r.dedupe_key === a.p_dedupe_key)) return { data: null, error: null }
    const run = { id: uuid(), flow_id: a.p_flow_id, creator_id: a.p_creator_id, email, name: a.p_name, dedupe_key: a.p_dedupe_key, trigger_type: a.p_trigger_type, current_step_id: a.p_first_step_id, context: a.p_context ?? {}, source_detail: a.p_source ?? null, status: "active", started_at: d.now(), exit_reason: null, finished_at: null, created_at: d.now(), updated_at: d.now() }
    d.tables.email_flow_runs.push(run)
    d.tables.email_flow_jobs.push({ id: uuid(), run_id: run.id, flow_id: a.p_flow_id, creator_id: a.p_creator_id, step_id: a.p_first_step_id, after_step_id: null, state: "queued", run_at: d.now(), attempts: 0, max_attempts: 5, last_error: null, claimed_by: null, claimed_until: null, created_at: d.now(), updated_at: d.now() })
    d.writes.push("rpc enroll_email_flow")
    return { data: run.id, error: null }
  }

  /* claim_email_flow_jobs: FOR UPDATE SKIP LOCKED is one pass here. */
  db.rpcs.claim_email_flow_jobs = (a, d) => {
    const lease = Math.max(30, Math.min(Number(a.p_lease_seconds) || 300, 900)) * 1000
    const due = d
      .rows("email_flow_jobs")
      .filter((j) => (j.state === "queued" && Date.parse(j.run_at) <= d.clock) || (j.state === "running" && Date.parse(j.claimed_until) < d.clock))
      .sort((x, y) => Date.parse(x.run_at) - Date.parse(y.run_at))
      .slice(0, Math.max(1, Math.min(Number(a.p_limit) || 10, 50)))
    for (const j of due) {
      j.state = "running"
      j.claimed_by = a.p_worker
      j.claimed_until = new Date(d.clock + lease).toISOString()
      j.attempts += 1
    }
    return { data: due.map((j) => ({ ...j })), error: null }
  }

  db.rpcs.increment_email_usage = () => ({ data: null, error: null })
  return db
}
