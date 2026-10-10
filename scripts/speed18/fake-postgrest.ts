/**
 * ===========================================================================
 *  SUPABASE, AS FAR AS supabase-js CAN TELL, OVER A FIXTURE IN MEMORY
 * ===========================================================================
 * Installed as `globalThis.fetch`. Every request supabase-js makes to
 * PostgREST is answered from the fixture's tables after a fixed round trip
 * (`rtt`, in ms), and written to the visit's list of trips
 * (./context.ts). The route code is the real code: the selects, filters,
 * embeds, counts and single-row reads it sends are the ones production
 * sends, so the count of round trips per visit is what production pays.
 *
 * Covers the PostgREST that this codebase uses: select lists with aliases,
 * json paths and embeds (`alias:table!hint(cols)`, `!inner`), the filters
 * eq, neq, gt, gte, lt, lte, like, ilike, in, is, not.<op> and or=(...),
 * order, limit, offset, counts (exact, head), single and maybeSingle,
 * insert, upsert, update, delete and rpc.
 */
import { current, orphanTrips } from "./context"

export type Row = Record<string, unknown>
export interface Relation {
  /** The parent row's column. */
  local: string
  /** The embedded table's column. */
  foreign: string
  /** An array of rows (one to many) or one row (many to one). */
  many: boolean
}
export interface Fixture {
  tables: Record<string, Row[]>
  /** "parent>child" or "parent>child!hint" to how they join. */
  relations?: Record<string, Relation>
  rpc?: Record<string, (args: Record<string, unknown>) => unknown>
  /** Tables whose every request answers a server error, for the "database did not answer" paths. */
  fail?: string[]
}

let fixture: Fixture = { tables: {} }
let rtt = 20
const unknownRelations = new Set<string>()

export function useFixture(f: Fixture) {
  fixture = f
}
export function setRtt(ms: number) {
  rtt = ms
}
export function missingRelations(): string[] {
  return [...unknownRelations]
}

/* ── select parsing ─────────────────────────────────────────────────────── */

type SelectItem =
  | { kind: "star" }
  | { kind: "col"; alias: string; path: string[]; last: "json" | "text" | null }
  | { kind: "embed"; alias: string; table: string; hint: string | null; inner: boolean; items: SelectItem[] }
  | { kind: "count"; alias: string }

function splitTop(s: string): string[] {
  const out: string[] = []
  let depth = 0
  let cur = ""
  let quoted = false
  for (const ch of s) {
    if (ch === '"') quoted = !quoted
    if (!quoted && ch === "(") depth++
    if (!quoted && ch === ")") depth--
    if (!quoted && ch === "," && depth === 0) {
      out.push(cur)
      cur = ""
    } else cur += ch
  }
  if (cur.trim()) out.push(cur)
  return out.map((x) => x.trim()).filter(Boolean)
}

export function parseSelect(s: string): SelectItem[] {
  return splitTop(s.replace(/\s+/g, "")).map((raw) => {
    if (raw === "*") return { kind: "star" }
    const open = raw.indexOf("(")
    if (open > 0 && raw.endsWith(")")) {
      const head = raw.slice(0, open)
      const inside = raw.slice(open + 1, -1)
      const [aliasPart, rest] = head.includes(":") ? [head.slice(0, head.indexOf(":")), head.slice(head.indexOf(":") + 1)] : [null, head]
      const bits = rest.split("!")
      const table = bits[0]
      const inner = bits.slice(1).includes("inner")
      const hint = bits.slice(1).find((b) => b !== "inner" && b !== "left") ?? null
      if (table === "count" && inside === "") return { kind: "count", alias: aliasPart ?? "count" }
      return { kind: "embed", alias: aliasPart ?? table, table, hint, inner, items: parseSelect(inside) }
    }
    const [aliasPart, expr0] = raw.includes(":") && !raw.startsWith("::") ? [raw.slice(0, raw.indexOf(":")), raw.slice(raw.indexOf(":") + 1)] : [null, raw]
    const expr = expr0.replace(/::\w+$/, "")
    const parts = expr.split(/->>|->/)
    const ops = expr.match(/->>|->/g) ?? []
    const last = ops.length ? (ops[ops.length - 1] === "->>" ? "text" : "json") : null
    return { kind: "col", alias: aliasPart ?? parts[parts.length - 1], path: parts, last }
  })
}

function relationFor(parent: string, child: string, hint: string | null, sample: Row | undefined): Relation | null {
  const rel = fixture.relations ?? {}
  if (hint && rel[`${parent}>${child}!${hint}`]) return rel[`${parent}>${child}!${hint}`]
  if (rel[`${parent}>${child}`]) return rel[`${parent}>${child}`]
  if (hint && sample && hint in sample) return { local: hint, foreign: "id", many: false }
  if (hint && /_fkey$/.test(hint)) {
    const col = hint.replace(new RegExp(`^${parent}_`), "").replace(/_fkey$/, "")
    if (sample && col in sample) return { local: col, foreign: "id", many: false }
  }
  const single = (t: string) => t.replace(/ies$/, "y").replace(/s$/, "")
  if (sample && `${single(child)}_id` in sample) return { local: `${single(child)}_id`, foreign: "id", many: false }
  const childRows = fixture.tables[child] ?? []
  if (childRows.some((r) => `${single(parent)}_id` in r)) return { local: "id", foreign: `${single(parent)}_id`, many: true }
  return null
}

function project(table: string, row: Row, items: SelectItem[], embedFilters: Map<string, Filter[]>, prefix = ""): Row | null {
  const out: Row = {}
  for (const item of items) {
    if (item.kind === "star") Object.assign(out, row)
    else if (item.kind === "col") {
      let v: unknown = row[item.path[0]]
      for (const key of item.path.slice(1)) v = v && typeof v === "object" ? (v as Row)[key] : undefined
      if (item.last === "text" && v !== undefined && v !== null && typeof v !== "string") v = typeof v === "object" ? JSON.stringify(v) : String(v)
      out[item.alias] = v === undefined ? null : v
    } else if (item.kind === "count") out[item.alias] = 1
    else {
      const rel = relationFor(table, item.table, item.hint, row)
      const path = `${prefix}${item.alias}`
      if (!rel) {
        unknownRelations.add(`${table}>${item.table}${item.hint ? `!${item.hint}` : ""}`)
        out[item.alias] = null
        if (item.inner) return null
        continue
      }
      const filters = embedFilters.get(path) ?? []
      const matches = (fixture.tables[item.table] ?? [])
        .filter((r) => r[rel.foreign] !== undefined && r[rel.foreign] === row[rel.local])
        .filter((r) => filters.every((f) => f.test(r)))
        .map((r) => project(item.table, r, item.items, embedFilters, `${path}.`))
        .filter((r): r is Row => r !== null)
      if (item.inner && matches.length === 0) return null
      out[item.alias] = rel.many ? matches : matches[0] ?? null
    }
  }
  return out
}

/* ── filters ────────────────────────────────────────────────────────────── */

interface Filter {
  test: (r: Row) => boolean
}

function unquote(v: string) {
  return v.startsWith('"') && v.endsWith('"') ? v.slice(1, -1) : v
}

function colValue(r: Row, col: string): unknown {
  const parts = col.split(/->>|->/)
  let v: unknown = r[parts[0]]
  for (const key of parts.slice(1)) v = v && typeof v === "object" ? (v as Row)[key] : undefined
  if (col.includes("->>") && v !== undefined && v !== null && typeof v !== "string") v = typeof v === "object" ? JSON.stringify(v) : String(v)
  return v
}

const likeToRegex = (pattern: string, flags: string) =>
  new RegExp(`^${pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/[*%]/g, ".*").replace(/_/g, ".")}$`, flags)

function cmp(a: unknown, b: string): number {
  if (typeof a === "number") return a - Number(b)
  return String(a ?? "") < b ? -1 : String(a ?? "") > b ? 1 : 0
}

function opTest(col: string, opExpr: string): (r: Row) => boolean {
  let negate = false
  let rest = opExpr
  if (rest.startsWith("not.")) {
    negate = true
    rest = rest.slice(4)
  }
  const dot = rest.indexOf(".")
  const op = rest.slice(0, dot)
  const value = rest.slice(dot + 1)
  const test = (r: Row): boolean => {
    const v = colValue(r, col)
    switch (op) {
      case "eq":
        return v !== null && v !== undefined && String(v) === unquote(value)
      case "neq":
        return v !== null && v !== undefined && String(v) !== unquote(value)
      case "gt":
        return v !== null && v !== undefined && cmp(v, unquote(value)) > 0
      case "gte":
        return v !== null && v !== undefined && cmp(v, unquote(value)) >= 0
      case "lt":
        return v !== null && v !== undefined && cmp(v, unquote(value)) < 0
      case "lte":
        return v !== null && v !== undefined && cmp(v, unquote(value)) <= 0
      case "like":
        return typeof v === "string" && likeToRegex(unquote(value), "").test(v)
      case "ilike":
        return typeof v === "string" && likeToRegex(unquote(value).replace(/\\([%_\\])/g, "$1"), "i").test(v)
      case "in": {
        const list = splitTop(value.replace(/^\(/, "").replace(/\)$/, "")).map(unquote)
        return v !== null && v !== undefined && list.includes(String(v))
      }
      case "is":
        return value === "null" ? v === null || v === undefined : value === "true" ? v === true : value === "false" ? v === false : false
      case "cs": {
        const want = value.replace(/^[{[]/, "").replace(/[}\]]$/, "").split(",").map(unquote).filter(Boolean)
        return Array.isArray(v) && want.every((w) => (v as unknown[]).map(String).includes(w))
      }
      case "ov": {
        const want = value.replace(/^[{[]/, "").replace(/[}\]]$/, "").split(",").map(unquote).filter(Boolean)
        return Array.isArray(v) && want.some((w) => (v as unknown[]).map(String).includes(w))
      }
      case "fts":
      case "plfts":
      case "wfts":
        return true
      default:
        return true
    }
  }
  return negate ? (r) => !test(r) : test
}

function orTest(expr: string): (r: Row) => boolean {
  const inner = expr.replace(/^\(/, "").replace(/\)$/, "")
  const tests = splitTop(inner).map((part) => {
    if (part.startsWith("and(")) {
      const ands = splitTop(part.slice(4, -1)).map((p) => {
        const d = p.indexOf(".")
        return opTest(p.slice(0, d), p.slice(d + 1))
      })
      return (r: Row) => ands.every((t) => t(r))
    }
    const d = part.indexOf(".")
    return opTest(part.slice(0, d), part.slice(d + 1))
  })
  return (r) => tests.some((t) => t(r))
}

/* ── the server ─────────────────────────────────────────────────────────── */

let nextId = 1
const newId = () => `00000000-0000-4000-8000-${String(nextId++).padStart(12, "0")}`

function respond(status: number, body: unknown, headers: Record<string, string> = {}) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...headers },
  })
}

function record(table: string, method: string, query: string, key?: string) {
  const state = current()
  const trip = { table, method, query: decodeURIComponent(query).slice(0, 240), at: performance.now(), background: !!state?.background, key }
  if (state) state.trips.push(trip)
  else orphanTrips.push(trip)
}

async function wait() {
  if (rtt > 0) await new Promise((r) => setTimeout(r, rtt))
}

export async function fakeFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url)
  const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase()
  const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined))
  const path = url.pathname

  if (path.startsWith("/auth/v1/")) {
    record(`auth:${path.slice(9)}`, method, "")
    await wait()
    return respond(401, { code: 401, error_code: "no_authorization", msg: "This endpoint requires a valid Bearer token" })
  }
  if (path.startsWith("/storage/v1/")) {
    record(`storage:${path.slice(12)}`, method, "")
    await wait()
    return respond(404, { statusCode: "404", error: "not_found", message: "Object not found" })
  }
  if (!path.startsWith("/rest/v1/")) {
    record(`other:${url.host}${path}`, method, "")
    return respond(404, {})
  }

  const name = path.slice("/rest/v1/".length)
  const body = init?.body ? JSON.parse(String(init.body)) : undefined

  if (name.startsWith("rpc/")) {
    const fn = name.slice(4)
    record(`rpc:${fn}`, method, url.search)
    await wait()
    const impl = fixture.rpc?.[fn]
    if (!impl) return respond(404, { code: "PGRST202", message: `Could not find the function public.${fn} in the schema cache`, details: null, hint: null })
    return respond(200, impl(body ?? Object.fromEntries(url.searchParams)))
  }

  const table = name
  const apikey = headers.get("apikey") ?? ""
  const bearer = (headers.get("authorization") ?? "").replace(/^Bearer /, "")
  record(table, method, url.search, bearer && bearer !== apikey ? "user" : apikey === process.env.SUPABASE_SERVICE_ROLE_KEY ? "service" : apikey === process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? "anon" : "other")
  await wait()
  if (fixture.fail?.includes(table)) return respond(503, { code: "XX000", message: "fixture: the database did not answer", details: null, hint: null })

  const rows = (fixture.tables[table] ??= [])
  const params = url.searchParams
  const filters: Filter[] = []
  const embedFilters = new Map<string, Filter[]>()
  let select: SelectItem[] = [{ kind: "star" }]
  let order: { col: string; desc: boolean; nullsFirst: boolean; embed: string | null }[] = []
  let limit: number | null = null
  let offset = 0
  for (const [key, value] of params.entries()) {
    if (key === "select") select = parseSelect(value)
    else if (key === "order")
      order = value.split(",").map((o) => {
        const bits = o.split(".")
        const col = bits[0]
        return { col, desc: bits.includes("desc"), nullsFirst: bits.includes("nullsfirst"), embed: null }
      })
    else if (key === "limit") limit = Number(value)
    else if (key === "offset") offset = Number(value)
    else if (key === "on_conflict" || key === "columns") continue
    else if (key === "or") filters.push({ test: orTest(value) })
    else if (key.endsWith(".or")) {
      const path = key.slice(0, -3)
      embedFilters.set(path, [...(embedFilters.get(path) ?? []), { test: orTest(value) }])
    } else if (key.endsWith(".order") || key.endsWith(".limit")) continue
    else if (key.includes(".") && !key.includes("->")) {
      const at = key.lastIndexOf(".")
      const path = key.slice(0, at)
      embedFilters.set(path, [...(embedFilters.get(path) ?? []), { test: opTest(key.slice(at + 1), value) }])
    } else filters.push({ test: opTest(key, value) })
  }

  const matching = () => rows.filter((r) => filters.every((f) => f.test(r)))
  const prefer = headers.get("prefer") ?? ""
  const wantsObject = (headers.get("accept") ?? "").includes("vnd.pgrst.object+json")

  if (method === "POST" || method === "PATCH" || method === "DELETE") {
    let changed: Row[] = []
    if (method === "POST") {
      const incoming = (Array.isArray(body) ? body : [body]) as Row[]
      for (const row of incoming) {
        const existing = row.id !== undefined ? rows.find((r) => r.id === row.id) : undefined
        if (existing && prefer.includes("merge-duplicates")) {
          Object.assign(existing, row)
          changed.push(existing)
        } else {
          const added = { id: newId(), created_at: new Date().toISOString(), ...row }
          rows.push(added)
          changed.push(added)
        }
      }
    } else if (method === "PATCH") {
      changed = matching()
      for (const r of changed) Object.assign(r, body)
    } else {
      changed = matching()
      fixture.tables[table] = rows.filter((r) => !changed.includes(r))
    }
    if (!prefer.includes("return=representation")) return new Response(null, { status: method === "POST" ? 201 : 204 })
    const out = changed.map((r) => project(table, r, select, embedFilters)).filter(Boolean)
    if (wantsObject) return out.length === 1 ? respond(200, out[0]) : respond(406, { code: "PGRST116", details: `The result contains ${out.length} rows`, message: "JSON object requested, multiple (or no) rows returned" })
    return respond(method === "POST" ? 201 : 200, out)
  }

  let found = matching()
  if (order.length) {
    found = [...found].sort((a, b) => {
      for (const o of order) {
        const av = colValue(a, o.col)
        const bv = colValue(b, o.col)
        if (av === bv) continue
        if (av === null || av === undefined) return o.nullsFirst ? -1 : 1
        if (bv === null || bv === undefined) return o.nullsFirst ? 1 : -1
        const c = av < bv ? -1 : 1
        return o.desc ? -c : c
      }
      return 0
    })
  }
  const projected = found.map((r) => project(table, r, select, embedFilters)).filter((r): r is Row => r !== null)
  const total = projected.length
  const page = projected.slice(offset, limit === null ? undefined : offset + limit)
  const range: Record<string, string> = prefer.includes("count=")
    ? { "content-range": page.length ? `${offset}-${offset + page.length - 1}/${total}` : `*/${total}` }
    : {}
  if (method === "HEAD") return new Response(null, { status: 200, headers: range })
  if (wantsObject) {
    if (page.length !== 1)
      return respond(406, { code: "PGRST116", details: `The result contains ${page.length} rows`, hint: null, message: "JSON object requested, multiple (or no) rows returned" }, range)
    return respond(200, page[0], range)
  }
  return respond(200, page, range)
}
