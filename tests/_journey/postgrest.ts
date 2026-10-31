/**
 * AN IN-MEMORY POSTGREST, SPOKEN TO OVER HTTP.
 *
 * The journey suite runs the real route handlers, which make their own
 * Supabase clients (createAdminClient, the cookie client, the webhook's
 * module level client). Rather than reach into each, the suite answers the
 * HTTP those clients send: this module turns a PostgREST request (the URL's
 * select, filters, order, limit; the Prefer and Accept headers; an insert,
 * upsert, update or delete body; /rpc/<fn>) into reads and writes on plain
 * arrays, and answers the way PostgREST does, error codes included:
 *
 *   42703 / PGRST204   a column the SQL never created (select / write)
 *   PGRST205           a table the SQL never created
 *   23505              a unique key (from the SQL's UNIQUE and unique indexes)
 *   PGRST116           .single() with 0 or 2+ rows
 *   PGRST202           a function with no implementation here
 *
 * Defaults, primary keys, unique keys and foreign keys come from the
 * repository's SQL (./sql-model.ts). CHECK constraints are evaluated where
 * they are simple and a violation is recorded in `checkViolations` (not
 * refused: the SQL files are a union, not one ordered history).
 */
import { randomUUID } from "node:crypto"
import { loadModel, type TableModel } from "./sql-model"

export type Row = Record<string, any>
export type RpcFn = (db: MemoryDb, args: Record<string, any>) => any

export interface SchemaIssue {
  kind: "unknown_table" | "unknown_column"
  table: string
  column?: string
  op: string
}

export class PgError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
    public details: string | null = null,
  ) {
    super(message)
  }
}

let identity = 1000

export class MemoryDb {
  tables: Record<string, Row[]> = {}
  model: Map<string, TableModel>
  rpcs: Record<string, RpcFn> = {}
  /**
   * Database blips for reliability suites (tests/rel-commerce.test.ts): the next `times` requests to `table` (a
   * table, or an rpc's name) with `method` (any when absent) answer this error, as a timeout or an outage would.
   */
  faults: { table: string; method?: string; times: number; code: string; status: number; hang?: boolean }[] = []
  /** PostgREST's max-rows (1,000 on Supabase), when a suite sets it: a read answers at most this many rows. Off by default. */
  maxRows: number | null = null
  /** `hang`: the request is accepted and never answered (it ends only when its caller aborts it, as a deadline does). */
  failNext(table: string, opts: { method?: string; times?: number; code?: string; status?: number; hang?: boolean } = {}) {
    this.faults.push({ table, method: opts.method?.toUpperCase(), times: opts.times ?? 1, code: opts.code ?? "57014", status: opts.status ?? 500, hang: opts.hang })
  }
  /** Generated columns: computed on every read. */
  generated: Record<string, (r: Row) => Record<string, unknown>> = {
    inventory_levels: (r) => ({ available: (Number(r.on_hand) || 0) - (Number(r.committed) || 0) }),
  }
  schemaIssues: SchemaIssue[] = []
  missingRpcs: string[] = []
  log: { method: string; table: string; detail?: string }[] = []
  /** Tables a suite declares exist even when no SQL file creates them (made in the dashboard). */
  extraTables = new Set<string>()
  /** Columns that exist on the live database although no SQL file in the repository adds them, "table.column". */
  extraColumns = new Set<string>()
  /** BEFORE INSERT OR UPDATE triggers the SQL defines (ported where the flow reads what they write). */
  beforeWrite: Record<string, (row: Row, db: MemoryDb) => void> = {}
  /** Rows refused by a trigger (append only tables). */
  appendOnly = new Set<string>(["commerce_order_events"])

  constructor() {
    this.model = loadModel()
  }

  rows(table: string): Row[] {
    return (this.tables[table] ??= [])
  }

  private known(table: string): TableModel | null {
    return this.model.get(table) ?? null
  }

  private checkTable(table: string, op: string) {
    if (this.model.has(table) || this.extraTables.has(table)) return
    this.schemaIssues.push({ kind: "unknown_table", table, op })
    throw new PgError("PGRST205", `Could not find the table 'public.${table}' in the schema cache`, 404)
  }

  private checkColumn(table: string, column: string, op: string, code: string) {
    const t = this.known(table)
    if (!t || t.columns.size === 0) return
    if (t.columns.has(column) || this.extraColumns.has(`${table}.${column}`)) return
    if (this.generated[table] && Object.keys(this.generated[table]({})).includes(column)) return
    this.schemaIssues.push({ kind: "unknown_column", table, column, op })
    throw new PgError(code, code === "PGRST204" ? `Could not find the '${column}' column of '${table}' in the schema cache` : `column ${table}.${column} does not exist`, 400)
  }

  private withGenerated(table: string, r: Row): Row {
    const g = this.generated[table]
    return g ? { ...r, ...g(r) } : { ...r }
  }

  /** A row as an insert writes it: defaults filled, generated columns left to reads. */
  private complete(table: string, input: Row, missingDefault: boolean): Row {
    const t = this.known(table)
    const out: Row = {}
    if (t) {
      for (const [name, col] of t.columns) {
        if (name in input) continue
        const d = col.default
        if (!d) continue
        if (d.kind === "now") out[name] = new Date().toISOString()
        else if (d.kind === "uuid") out[name] = randomUUID()
        else if (d.kind === "identity") out[name] = ++identity
        else out[name] = structuredClone(d.value)
      }
    }
    if (!("id" in out) && !("id" in input) && (!t || t.columns.has("id") || t.columns.size === 0)) out.id = randomUUID()
    if (!("created_at" in out) && !("created_at" in input) && t?.columns.has("created_at")) out.created_at = new Date().toISOString()
    for (const [k, v] of Object.entries(input)) out[k] = v === undefined && missingDefault ? out[k] : v
    return out
  }

  private uniqueClash(table: string, row: Row, except: Row | null): string | null {
    const t = this.known(table)
    if (!t) return null
    const keys = [...t.uniques]
    if (t.primaryKey.length) keys.push({ columns: t.primaryKey, lower: [] })
    for (const u of keys) {
      if (u.columns.some((c) => row[c] === null || row[c] === undefined)) continue
      if (u.where) {
        const v = row[u.where.column]
        if (u.where.test === "truthy" ? !v : v === null || v === undefined) continue
      }
      const same = (a: unknown, b: unknown, c: string) => (u.lower.includes(c) ? String(a).toLowerCase() === String(b).toLowerCase() : JSON.stringify(a) === JSON.stringify(b))
      const hit = this.rows(table).find((x) => {
        if (x === except) return false
        if (u.where) {
          const v = x[u.where.column]
          if (u.where.test === "truthy" ? !v : v === null || v === undefined) return false
        }
        return u.columns.every((c) => same(x[c], row[c], c))
      })
      if (hit) return u.columns.join(", ")
    }
    return null
  }

  /* ── select ─────────────────────────────────────────────────────────── */

  select(table: string, select: string, filters: Filter[], opts: { order?: string | null; limit?: number | null; offset?: number }): Row[] {
    this.checkTable(table, "select")
    const items = parseSelect(select)
    for (const f of filters) if (!f.path.includes(".") && f.op !== "or" && f.op !== "and") this.checkColumn(table, f.path.split("->")[0], "filter", "42703")
    for (const it of items) if (it.kind === "column" && it.column !== "*") this.checkColumn(table, it.column, "select", "42703")
    let rows = this.rows(table).map((r) => this.withGenerated(table, r))
    const embedFilters = filters.filter((f) => f.path.includes(".") && f.op !== "or" && f.op !== "and")
    const own = filters.filter((f) => !embedFilters.includes(f))
    rows = rows.filter((r) => own.every((f) => matches(f, r)))
    /* Embedded resources, and !inner filtering. */
    let shaped = rows.map((r) => ({ src: r, out: this.shape(table, r, items, embedFilters) }))
    shaped = shaped.filter((s) => s.out !== null)
    let list = shaped.map((s) => s)
    if (opts.order) list = sortRows(list, opts.order)
    const offset = opts.offset ?? 0
    if (offset || opts.limit !== null && opts.limit !== undefined) list = list.slice(offset, opts.limit !== null && opts.limit !== undefined ? offset + opts.limit : undefined)
    return list.map((s) => s.out as Row)
  }

  private shape(table: string, row: Row, items: SelectItem[], embedFilters: Filter[]): Row | null {
    const out: Row = {}
    for (const it of items) {
      if (it.kind === "column") {
        if (it.column === "*") Object.assign(out, row)
        else out[it.alias] = it.json ? jsonPath(row[it.column], it.json) : row[it.column] ?? null
        continue
      }
      if (it.kind === "count") continue
      const childFilters = embedFilters.filter((f) => f.path.startsWith(`${it.alias}.`)).map((f) => ({ ...f, path: f.path.slice(it.alias.length + 1) }))
      const rel = this.relation(table, row, it)
      if (rel.kind === "one") {
        let target = rel.row ? this.withGenerated(it.table, rel.row) : null
        if (target && childFilters.length && !childFilters.every((f) => matches(f, target!))) target = null
        if (!target && it.inner) return null
        out[it.alias] = target ? this.shape(it.table, target, it.children, []) : null
      } else {
        let kids = rel.rows.map((k) => this.withGenerated(it.table, k))
        if (childFilters.length) kids = kids.filter((k) => childFilters.every((f) => matches(f, k)))
        if (it.inner && kids.length === 0) return null
        if (it.children.length === 1 && it.children[0].kind === "count") out[it.alias] = [{ count: kids.length }]
        else out[it.alias] = kids.map((k) => this.shape(it.table, k, it.children, []))
      }
    }
    return out
  }

  private relation(table: string, row: Row, it: EmbedItem): { kind: "one"; row: Row | null } | { kind: "many"; rows: Row[] } {
    this.checkTable(it.table, "embed")
    const parent = this.known(table)
    const child = this.known(it.table)
    const hint = it.hint && it.hint !== "inner" ? it.hint : null
    /* Many to one: a column on this row that references the embedded table. */
    const fkCols: string[] = []
    if (hint && parent?.columns.has(hint)) fkCols.push(hint)
    if (parent) for (const [col, ref] of parent.references) if (ref === it.table && !fkCols.includes(col)) fkCols.push(col)
    if (!hint && parent?.columns.has(`${it.alias}_id`) && !fkCols.includes(`${it.alias}_id`)) fkCols.unshift(`${it.alias}_id`)
    if (fkCols.length && !(hint && child?.columns.has(hint))) {
      const col = fkCols[0]
      return { kind: "one", row: this.rows(it.table).find((r) => r.id === row[col]) ?? null }
    }
    /* One to many: a column on the embedded table that references this one. */
    const back: string[] = []
    if (hint && child?.columns.has(hint)) back.push(hint)
    if (child) for (const [col, ref] of child.references) if (ref === table && !back.includes(col)) back.push(col)
    if (back.length) return { kind: "many", rows: this.rows(it.table).filter((r) => r[back[0]] === row.id) }
    /* One to one through the primary key (a settings row keyed by creator_id). */
    return { kind: "many", rows: [] }
  }

  /* ── writes ─────────────────────────────────────────────────────────── */

  insert(table: string, payload: Row | Row[], opts: { onConflict?: string[] | null; resolution?: "merge" | "ignore" | null; missingDefault?: boolean; columns?: string[] | null }): Row[] {
    // One PostgREST insert is one PostgreSQL statement, including a batch or
    // upsert. A later constraint failure rolls back earlier rows and trigger
    // writes in that statement. Keep existing row references alive on rollback
    // because journey fixtures can hold them. Sequences are not rolled back.
    const snapshot = Object.entries(this.tables).map(([name, rows]) => ({
      name, rows, entries: rows.map((row) => ({ row, value: structuredClone(row) })),
    }))
    const violations = this.checkViolations.length
    try {
      return this.insertRows(table, payload, opts)
    } catch (error) {
      const names = new Set(snapshot.map(({ name }) => name))
      for (const name of Object.keys(this.tables)) if (!names.has(name)) delete this.tables[name]
      for (const { name, rows, entries } of snapshot) {
        for (const { row, value } of entries) {
          for (const key of Object.keys(row)) delete row[key]
          Object.assign(row, value)
        }
        rows.splice(0, rows.length, ...entries.map(({ row }) => row))
        this.tables[name] = rows
      }
      this.checkViolations.length = violations
      throw error
    }
  }

  private insertRows(table: string, payload: Row | Row[], opts: { onConflict?: string[] | null; resolution?: "merge" | "ignore" | null; missingDefault?: boolean; columns?: string[] | null }): Row[] {
    this.checkTable(table, "insert")
    if (this.appendOnly.has(table) && opts.resolution === "merge") {
      /* An upsert that would update is refused by the trigger only when it meets a row; checked below. */
    }
    const list = Array.isArray(payload) ? payload : [payload]
    const out: Row[] = []
    const t = this.known(table)
    for (const raw of list) {
      for (const k of Object.keys(raw)) this.checkColumn(table, k, "insert", "PGRST204")
      if (opts.columns) for (const k of opts.columns) this.checkColumn(table, k, "insert", "PGRST204")
      const row = this.complete(table, raw, !!opts.missingDefault)
      this.beforeWrite[table]?.(row, this)
      if (opts.resolution) {
        const key = opts.onConflict && opts.onConflict.length ? opts.onConflict : t?.primaryKey.length ? t.primaryKey : ["id"]
        const hit = this.rows(table).find((x) => key.every((c) => JSON.stringify(x[c]) === JSON.stringify(row[c])))
        if (hit) {
          if (opts.resolution === "ignore") continue
          if (this.appendOnly.has(table)) throw new PgError("P0001", `${table} is append only`, 400)
          for (const k of Object.keys(raw)) hit[k] = raw[k]
          this.checkRow(table, hit)
          out.push(this.withGenerated(table, hit))
          continue
        }
        if (opts.onConflict && opts.onConflict.length && t) {
          const declared = [...t.uniques.map((u) => u.columns.join()), t.primaryKey.join()]
          if (!declared.includes(opts.onConflict.join())) {
            throw new PgError("42P10", `there is no unique or exclusion constraint matching the ON CONFLICT specification (${table}: ${opts.onConflict.join(", ")})`, 400)
          }
        }
      }
      const clash = this.uniqueClash(table, row, null)
      if (clash) {
        if (opts.resolution === "ignore") continue
        throw new PgError("23505", `duplicate key value violates unique constraint on ${table} (${clash})`, 409, `Key (${clash}) already exists.`)
      }
      this.checkRow(table, row)
      this.rows(table).push(row)
      out.push(this.withGenerated(table, row))
    }
    return out
  }

  update(table: string, patch: Row, filters: Filter[]): Row[] {
    this.checkTable(table, "update")
    for (const k of Object.keys(patch)) this.checkColumn(table, k, "update", "PGRST204")
    for (const f of filters) if (f.op !== "or" && f.op !== "and") this.checkColumn(table, f.path.split("->")[0], "filter", "42703")
    const hit = this.rows(table).filter((r) => filters.every((f) => matches(f, this.withGenerated(table, r))))
    if (hit.length && this.appendOnly.has(table)) throw new PgError("P0001", `${table} is append only`, 400)
    for (const r of hit) {
      const next = { ...r, ...patch }
      const clash = this.uniqueClash(table, next, r)
      if (clash) throw new PgError("23505", `duplicate key value violates unique constraint on ${table} (${clash})`, 409)
    }
    for (const r of hit) {
      Object.assign(r, patch)
      if ("product_id" in patch) this.beforeWrite[table]?.(r, this)
      this.checkRow(table, r)
    }
    return hit.map((r) => this.withGenerated(table, r))
  }

  delete(table: string, filters: Filter[]): Row[] {
    this.checkTable(table, "delete")
    const rows = this.rows(table)
    const gone = rows.filter((r) => filters.every((f) => matches(f, this.withGenerated(table, r))))
    this.tables[table] = rows.filter((r) => !gone.includes(r))
    const ids = gone.map((row) => row.id).filter((id) => id !== null && id !== undefined)
    if (ids.length) {
      for (const child of this.model.values()) {
        for (const column of child.cascadeDeletes) {
          if (child.references.get(column) !== table) continue
          this.delete(child.name, [{ path: column, op: "in", value: `(${ids.map((id) => JSON.stringify(String(id))).join(",")})`, not: false }])
        }
      }
    }
    return gone
  }

  /** CHECK constraints the suite knows to look at, recorded rather than refused. */
  checkViolations: { table: string; column: string; value: unknown; rule: string }[] = []
  checks: Record<string, Record<string, (v: any) => boolean>> = {}
  private checkRow(table: string, row: Row) {
    const rules = this.checks[table]
    if (!rules) return
    for (const [col, ok] of Object.entries(rules)) {
      if (!(col in row)) continue
      if (!ok(row[col])) this.checkViolations.push({ table, column: col, value: row[col], rule: ok.toString().slice(0, 160) })
    }
  }

  /* ── HTTP ───────────────────────────────────────────────────────────── */

  async handle(req: Request): Promise<Response> {
    const url = new URL(req.url)
    const path = url.pathname.replace(/^\/rest\/v1\/?/, "")
    const method = req.method.toUpperCase()
    const prefer = req.headers.get("prefer") ?? ""
    const accept = req.headers.get("accept") ?? ""
    const single = accept.includes("vnd.pgrst.object")
    const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
      new Response(body === undefined ? "" : JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", ...headers } })
    {
      const target = path.startsWith("rpc/") ? path.slice(4) : decodeURIComponent(path)
      const fault = this.faults.find((f) => f.times > 0 && f.table === target && (!f.method || f.method === method))
      if (fault) {
        fault.times--
        if (fault.hang) {
          return new Promise<Response>((_, reject) => {
            const gone = () => reject(req.signal.reason ?? new DOMException("aborted", "AbortError"))
            if (req.signal.aborted) gone()
            else req.signal.addEventListener("abort", gone, { once: true })
          })
        }
        return json({ code: fault.code, message: `canceling statement due to statement timeout (injected on ${target})`, details: null, hint: null }, fault.status)
      }
    }
    const fail = (e: unknown) => {
      if (e instanceof PgError) return json({ code: e.code, message: e.message, details: e.details, hint: null }, e.status)
      return json({ code: "XX000", message: e instanceof Error ? e.message : String(e), details: null, hint: null }, 500)
    }
    try {
      if (path.startsWith("rpc/")) {
        const fn = path.slice(4)
        let args: Record<string, any> = {}
        if (method === "GET" || method === "HEAD") for (const [k, v] of url.searchParams) args[k] = v
        else {
          const text = await req.text()
          args = text ? JSON.parse(text) : {}
        }
        this.log.push({ method: "RPC", table: fn })
        const impl = this.rpcs[fn]
        if (!impl) {
          this.missingRpcs.push(fn)
          throw new PgError("PGRST202", `Could not find the function public.${fn} without parameters in the schema cache`, 404)
        }
        const result = await impl(this, args)
        if (result === undefined) return new Response(null, { status: 204 })
        if (single && Array.isArray(result)) return json(result[0] ?? null)
        return json(result)
      }
      const table = decodeURIComponent(path)
      const filters = readFilters(url.searchParams)
      const selectParam = url.searchParams.get("select")
      const wantRows = prefer.includes("return=representation")
      const countExact = /count=(exact|planned|estimated)/.test(prefer)
      const order = url.searchParams.get("order")
      const limit = url.searchParams.has("limit") ? Number(url.searchParams.get("limit")) : null
      const offset = url.searchParams.has("offset") ? Number(url.searchParams.get("offset")) : 0
      let rows: Row[]
      let total: number | null = null
      if (method === "GET" || method === "HEAD") {
        this.log.push({ method, table, detail: url.search })
        const all = this.select(table, selectParam ?? "*", filters, { order, limit: null, offset: 0 })
        total = all.length
        rows = all.slice(offset, limit !== null ? offset + limit : undefined)
        if (this.maxRows !== null) rows = rows.slice(0, this.maxRows)
        if (method === "HEAD") return new Response(null, { status: 200, headers: { "content-range": `*/${total}` } })
      } else if (method === "POST") {
        const body = JSON.parse((await req.text()) || "null")
        this.log.push({ method, table, detail: JSON.stringify(body).slice(0, 300) })
        const resolution = /resolution=merge-duplicates/.test(prefer) ? "merge" : /resolution=ignore-duplicates/.test(prefer) ? "ignore" : null
        const onConflict = url.searchParams.get("on_conflict")
        const cols = url.searchParams.get("columns")
        const written = this.insert(table, body, {
          resolution,
          onConflict: onConflict ? onConflict.split(",").map((c) => c.trim().replace(/"/g, "")) : null,
          missingDefault: prefer.includes("missing=default"),
          columns: cols ? cols.split(",").map((c) => c.replace(/"/g, "").trim()) : null,
        })
        rows = selectParam ? written.map((r) => this.reshape(table, r, selectParam)) : written
        total = rows.length
      } else if (method === "PATCH") {
        const body = JSON.parse((await req.text()) || "{}")
        this.log.push({ method, table, detail: `${url.search} ${JSON.stringify(body).slice(0, 300)}` })
        const written = this.update(table, body, filters)
        rows = selectParam ? written.map((r) => this.reshape(table, r, selectParam)) : written
        total = rows.length
      } else if (method === "DELETE") {
        this.log.push({ method, table, detail: url.search })
        const gone = this.delete(table, filters)
        rows = selectParam ? gone.map((r) => this.reshape(table, r, selectParam)) : gone
        total = rows.length
      } else {
        return json({ message: "method" }, 405)
      }
      const headers: Record<string, string> = {}
      if (countExact) headers["content-range"] = `${rows.length ? `${offset}-${offset + rows.length - 1}` : "*"}/${total ?? rows.length}`
      if (method !== "GET" && !wantRows) {
        return new Response(null, { status: method === "POST" ? 201 : 204, headers })
      }
      if (single) {
        if (rows.length !== 1) {
          return json({ code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned", details: `The result contains ${rows.length} rows`, hint: null }, 406)
        }
        return json(rows[0], 200, headers)
      }
      return json(rows, method === "POST" ? 201 : 200, headers)
    } catch (e) {
      return fail(e)
    }
  }

  private reshape(table: string, row: Row, select: string): Row {
    return this.shape(table, this.withGenerated(table, row), parseSelect(select), []) ?? row
  }
}

/* ── select parsing ───────────────────────────────────────────────────── */

type ColumnItem = { kind: "column"; column: string; alias: string; json: string[] | null }
type EmbedItem = { kind: "embed"; alias: string; table: string; hint: string | null; inner: boolean; children: SelectItem[] }
type SelectItem = ColumnItem | EmbedItem | { kind: "count" }

function splitTop(s: string): string[] {
  const out: string[] = []
  let depth = 0
  let cur = ""
  let q = false
  for (const ch of s) {
    if (ch === '"') q = !q
    if (!q && ch === "(") depth++
    if (!q && ch === ")") depth--
    if (!q && ch === "," && depth === 0) {
      out.push(cur)
      cur = ""
    } else cur += ch
  }
  if (cur.trim()) out.push(cur)
  return out.map((x) => x.trim()).filter(Boolean)
}

export function parseSelect(select: string): SelectItem[] {
  const items: SelectItem[] = []
  for (const raw of splitTop(select.replace(/\s+/g, " "))) {
    const part = raw.trim()
    const embed = /^(?:([\w]+):)?([\w]+)(?:!([\w]+))?(?:!(inner|left))?\s*\((.*)\)$/s.exec(part)
    if (embed) {
      const [, alias, tbl, hint, joinKind, inner] = embed
      items.push({ kind: "embed", alias: alias ?? tbl, table: tbl, hint: hint === "inner" || hint === "left" ? null : hint ?? null, inner: hint === "inner" || joinKind === "inner", children: parseSelect(inner || "*") })
      continue
    }
    if (part === "count" || part === "count()") {
      items.push({ kind: "count" })
      continue
    }
    const m = /^(?:([\w]+):)?([\w*]+)((?:->>?'?[\w]+'?)*)(?:::[\w]+)?$/.exec(part)
    if (!m) {
      items.push({ kind: "column", column: part, alias: part, json: null })
      continue
    }
    const [, alias, col, path] = m
    const json = path ? [...path.matchAll(/->>?'?([\w]+)'?/g)].map((x) => x[1]) : null
    items.push({ kind: "column", column: col, alias: alias ?? (json ? json[json.length - 1] : col), json })
  }
  return items
}

function jsonPath(v: unknown, path: string[]): unknown {
  let cur: any = v
  for (const k of path) cur = cur && typeof cur === "object" ? cur[k] : null
  return cur ?? null
}

/* ── filters ─────────────────────────────────────────────────────────── */

export type Filter = { path: string; op: string; value: string; not: boolean }

const RESERVED = new Set(["select", "order", "limit", "offset", "on_conflict", "columns"])

function readFilters(params: URLSearchParams): Filter[] {
  const out: Filter[] = []
  for (const [k, v] of params) {
    if (RESERVED.has(k)) continue
    if (k === "or" || k === "and" || k === "not.or" || k === "not.and") {
      out.push({ path: "", op: k.replace("not.", ""), value: v, not: k.startsWith("not.") })
      continue
    }
    if (/\.(limit|offset|order)$/.test(k)) continue
    out.push(parseCondition(k, v))
  }
  return out
}

function parseCondition(path: string, v: string): Filter {
  let rest = v
  let not = false
  if (rest.startsWith("not.")) {
    not = true
    rest = rest.slice(4)
  }
  const dot = rest.indexOf(".")
  const op = dot < 0 ? rest : rest.slice(0, dot)
  const value = dot < 0 ? "" : rest.slice(dot + 1)
  return { path, op, value, not }
}

function terms(expr: string): string[] {
  return splitTop(expr)
}

function logical(f: Filter, row: Row): boolean {
  const inner = f.value.replace(/^\(|\)$/g, "")
  const parts = terms(inner).map((t) => {
    const group = /^(not\.)?(and|or)\((.*)\)$/s.exec(t)
    if (group) return logical({ path: "", op: group[2], value: `(${group[3]})`, not: !!group[1] }, row)
    const m = /^([\w.>-]+?)\.(.*)$/s.exec(t)
    if (!m) return true
    return matches(parseCondition(m[1], m[2]), row)
  })
  const r = f.op === "and" ? parts.every(Boolean) : parts.some(Boolean)
  return f.not ? !r : r
}

function unquote(v: string): string {
  return v.startsWith('"') && v.endsWith('"') ? v.slice(1, -1).replace(/\\"/g, '"') : v
}

function listOf(v: string): string[] {
  const inner = v.replace(/^\(|\)$/g, "")
  return splitTop(inner).map(unquote)
}

function cmp(a: unknown, b: string): number {
  if (typeof a === "number") return a - Number(b)
  if (typeof a === "boolean") return Number(a) - Number(b === "true")
  const as = String(a)
  const an = Number(as)
  const bn = Number(b)
  if (as !== "" && b !== "" && !Number.isNaN(an) && !Number.isNaN(bn) && /^-?[\d.]+$/.test(as) && /^-?[\d.]+$/.test(b)) return an - bn
  /* timestamps written with and without milliseconds or zone compare as times */
  const ad = Date.parse(as)
  const bd = Date.parse(b)
  if (/^\d{4}-\d\d-\d\d/.test(as) && /^\d{4}-\d\d-\d\d/.test(b) && !Number.isNaN(ad) && !Number.isNaN(bd)) return ad - bd
  return as < b ? -1 : as > b ? 1 : 0
}

function likeRe(pattern: string, flags: string): RegExp {
  let re = ""
  for (const c of pattern) re += c === "*" || c === "%" ? ".*" : c === "_" ? "." : c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  return new RegExp(`^${re}$`, flags)
}

function matches(f: Filter, row: Row): boolean {
  if (f.op === "or" || f.op === "and") return logical(f, row)
  const path = f.path.split("->>").join(".").split("->").join(".")
  const segs = path.split(".")
  let v: any = row
  for (const s of segs) v = v && typeof v === "object" ? v[s] : undefined
  const raw = f.value
  let r: boolean
  switch (f.op) {
    case "eq":
      r = v !== null && v !== undefined && cmp(v, unquote(raw)) === 0
      break
    case "neq":
      r = v !== null && v !== undefined && cmp(v, unquote(raw)) !== 0
      break
    case "gt":
      r = v !== null && v !== undefined && cmp(v, unquote(raw)) > 0
      break
    case "gte":
      r = v !== null && v !== undefined && cmp(v, unquote(raw)) >= 0
      break
    case "lt":
      r = v !== null && v !== undefined && cmp(v, unquote(raw)) < 0
      break
    case "lte":
      r = v !== null && v !== undefined && cmp(v, unquote(raw)) <= 0
      break
    case "in":
      r = v !== null && v !== undefined && listOf(raw).some((x) => cmp(v, x) === 0)
      break
    case "is":
      r = raw === "null" ? v === null || v === undefined : raw === "true" ? v === true : raw === "false" ? v === false : v === null || v === undefined
      break
    case "like":
      r = typeof v === "string" && likeRe(unquote(raw), "").test(v)
      break
    case "ilike":
      r = typeof v === "string" && likeRe(unquote(raw), "i").test(v)
      break
    case "cs": {
      if (Array.isArray(v)) r = (raw.startsWith("{") ? raw.slice(1, -1).split(",").map(unquote) : (JSON.parse(raw) as unknown[]).map(String)).every((x) => v.map(String).includes(x))
      else if (v && typeof v === "object") {
        const want = JSON.parse(raw)
        r = Object.entries(want).every(([k, x]) => JSON.stringify(v[k]) === JSON.stringify(x))
      } else r = false
      break
    }
    case "ov":
      r = Array.isArray(v) && raw.replace(/^[{(]|[})]$/g, "").split(",").map(unquote).some((x) => v.map(String).includes(x))
      break
    default:
      r = true
  }
  return f.not ? !r : r
}

function sortRows<T extends { src: Row }>(list: T[], order: string): T[] {
  const keys = order
    .split(",")
    .map((k) => k.trim())
    .filter((k) => k && !k.includes("("))
    .map((k) => {
      const [col, ...mods] = k.split(".")
      return { col, desc: mods.includes("desc"), nullsFirst: mods.includes("nullsfirst") ? true : mods.includes("nullslast") ? false : null }
    })
  return [...list].sort((a, b) => {
    for (const k of keys) {
      const x = a.src[k.col]
      const y = b.src[k.col]
      const xn = x === null || x === undefined
      const yn = y === null || y === undefined
      if (xn || yn) {
        if (xn && yn) continue
        /* Postgres: nulls are largest, so last ascending and first descending, unless told. */
        const nullsFirst = k.nullsFirst ?? k.desc
        return xn ? (nullsFirst ? -1 : 1) : nullsFirst ? 1 : -1
      }
      const c = typeof x === "number" && typeof y === "number" ? x - y : cmp(x, String(y))
      if (c !== 0) return k.desc ? -c : c
    }
    return 0
  })
}
