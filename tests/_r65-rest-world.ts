/**
 * A stand-in Supabase for tests/builder-canvas-open-r65.test.ts: PostgREST,
 * Auth and Storage answered from tables held in memory, at the network edge
 * (globalThis.fetch), so the real route handlers, supabase-js and every
 * helper under them run as they do on Vercel.
 *
 * Every answer is timed by a model stated in one place (`net`): a round trip
 * plus the bytes of the answer over a link, so the numbers it gives are
 * round trips and megabytes, not this machine's speed. It counts requests
 * and bytes per table.
 */
import { createHmac, randomUUID } from "node:crypto"

type Row = Record<string, unknown>

export const URL_ = "https://abcd.supabase.co"
const SECRET = "test-secret-only-for-this-suite-0123456789abcdef"
process.env.NEXT_PUBLIC_SUPABASE_URL = URL_
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon"
process.env.SUPABASE_SERVICE_ROLE_KEY = "service"
process.env.SUPABASE_JWT_SECRET = SECRET

const nowS = () => Math.floor(Date.now() / 1000)
const b64url = (s: string) => Buffer.from(s).toString("base64url")
const hs256 = (p: Record<string, unknown>) => {
  const h = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }))
  const b = b64url(JSON.stringify(p))
  return `${h}.${b}.${createHmac("sha256", SECRET).update(`${h}.${b}`).digest("base64url")}`
}
export const USER_ID = "00000000-0000-4000-8000-0000000000u1".replace("u1", "01")
export const CREATOR_ID = "00000000-0000-4000-8000-0000000000c1".replace("c1", "02")
const person = { id: USER_ID, aud: "authenticated", role: "authenticated", email: "a@example.test", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" }
const token = hs256({ sub: USER_ID, aud: "authenticated", role: "authenticated", iss: `${URL_}/auth/v1`, exp: nowS() + 3600, iat: nowS(), email: "a@example.test", session_id: "s1" })
const COOKIE = "sb-abcd-auth-token"
const cookie = "base64-" + Buffer.from(JSON.stringify({ access_token: token, refresh_token: "rt", token_type: "bearer", expires_in: 3600, expires_at: nowS() + 3600, user: person })).toString("base64url")

/**
 * The network: each answer takes `rttMs` plus its bytes at `mbps` megabytes a
 * second. `shared`: one link for every answer at once, split evenly between
 * those in flight (a database that has so much reading to do a second), so a
 * large read slows a small one beside it.
 */
export const net = { rttMs: 25, mbps: 25, authMs: 40, shared: false }

type Flow = { left: number; done: () => void }
const flows = new Set<Flow>()
let ticking: ReturnType<typeof setInterval> | null = null
let lastTick = 0
function tick() {
  const now = performance.now()
  const dt = now - lastTick
  lastTick = now
  if (flows.size === 0) {
    if (ticking) clearInterval(ticking)
    ticking = null
    return
  }
  const each = ((net.mbps * 1e6) / 1000) * dt / flows.size
  for (const f of [...flows]) {
    f.left -= each
    if (f.left <= 0) {
      flows.delete(f)
      f.done()
    }
  }
}
function sharedTransfer(bytes: number): Promise<void> {
  return new Promise((resolve) => {
    flows.add({ left: bytes, done: resolve })
    if (!ticking) {
      lastTick = performance.now()
      ticking = setInterval(tick, 2)
    }
  })
}
async function transfer(bytes: number): Promise<void> {
  await new Promise((r) => setTimeout(r, net.rttMs))
  if (net.shared) await sharedTransfer(bytes)
  else await new Promise((r) => setTimeout(r, (bytes / (net.mbps * 1e6)) * 1000))
}

export const world = {
  tables: new Map<string, Row[]>(),
  requests: 0,
  bytes: 0,
  byTable: new Map<string, { n: number; bytes: number }>(),
  writes: [] as { table: string; method: string }[],
  rpc: new Map<string, (body: Record<string, unknown>) => { status: number; body: unknown }>(),
  /** Every PostgREST ask in order, when set to a list (round 66): table, method, select, bytes, start and end times. */
  log: null as null | { table: string; method: string; select: string; bytes: number; at: number; end: number }[],
}
export const table = (name: string): Row[] => {
  let t = world.tables.get(name)
  if (!t) world.tables.set(name, (t = []))
  return t
}
export function resetCounts() {
  world.requests = 0
  world.bytes = 0
  world.byTable.clear()
  world.writes = []
}
export function seedStore() {
  world.tables.clear()
  table("creators").push({ id: CREATOR_ID, user_id: USER_ID, slug: "shop", display_name: "Shop" })
  table("profiles").push({ id: USER_ID, username: "shop" })
  table("themes").push({ id: "a1b2c3d4-e5f6-7890-abcd-ef1234567890", name: "Storelib Default", slug: "storelib-default" })
}

/* ── select=... with embeds ─────────────────────────────────────────────── */
type Sel = { cols: string[]; star: boolean; embeds: { alias: string; table: string; sel: Sel }[] }
function splitTop(s: string): string[] {
  const out: string[] = []
  let depth = 0
  let cur = ""
  for (const ch of s) {
    if (ch === "(") depth++
    if (ch === ")") depth--
    if (ch === "," && depth === 0) {
      out.push(cur)
      cur = ""
    } else cur += ch
  }
  if (cur.trim()) out.push(cur)
  return out.map((x) => x.trim()).filter(Boolean)
}
function parseSel(s: string): Sel {
  const sel: Sel = { cols: [], star: false, embeds: [] }
  for (const part of splitTop(s.replace(/\s+/g, ""))) {
    const m = /^(?:([a-z_]+):)?([a-z_]+)(?:!inner)?\((.*)\)$/i.exec(part)
    if (m) sel.embeds.push({ alias: m[1] ?? m[2], table: m[2], sel: parseSel(m[3]) })
    else if (part === "*") sel.star = true
    else sel.cols.push(part.split(":").pop()!.split("::")[0])
  }
  if (!sel.cols.length && !sel.embeds.length) sel.star = true
  return sel
}
function project(tableName: string, row: Row, sel: Sel): Row {
  const out: Row = sel.star ? { ...row } : {}
  for (const c of sel.cols) out[c] = row[c] ?? null
  for (const e of sel.embeds) {
    if (e.table === "themes") {
      const t = table("themes").find((x) => x.id === row.theme_id)
      out[e.alias] = t ? project("themes", t, e.sel) : null
    } else if (e.table === "store_theme_settings") {
      const s = table(e.table).find((x) => x.install_id === row.id)
      out[e.alias] = s ? project(e.table, s, e.sel) : null
    } else {
      out[e.alias] = table(e.table).filter((x) => x.install_id === row.id).map((x) => project(e.table, x, e.sel))
    }
  }
  void tableName
  return out
}

/* ── filters ───────────────────────────────────────────────────────────── */
const RESERVED = new Set(["select", "order", "limit", "offset", "on_conflict", "columns"])
function parseList(v: string): string[] {
  return v.replace(/^\(|\)$/g, "").split(",").map((x) => x.replace(/^"|"$/g, ""))
}
function likeRe(p: string): RegExp {
  return new RegExp("^" + p.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/[%*]/g, ".*") + "$")
}
function matches(row: Row, url: URL): boolean {
  for (const [k, raw] of url.searchParams) {
    if (RESERVED.has(k) || k === "or" || k === "and") continue
    const v = raw
    const dot = v.indexOf(".")
    let op = v.slice(0, dot)
    let arg = v.slice(dot + 1)
    let neg = false
    if (op === "not") {
      neg = true
      const d2 = arg.indexOf(".")
      op = arg.slice(0, d2)
      arg = arg.slice(d2 + 1)
    }
    const cell = row[k]
    let ok: boolean
    if (op === "eq") ok = String(cell) === arg
    else if (op === "neq") ok = String(cell) !== arg
    else if (op === "in") ok = parseList(arg).includes(String(cell))
    else if (op === "like" || op === "ilike") ok = typeof cell === "string" && likeRe(arg).test(cell)
    else if (op === "is") ok = arg === "null" ? cell === null || cell === undefined : String(cell) === arg
    else if (op === "lt") ok = String(cell) < arg
    else if (op === "gt") ok = String(cell) > arg
    else if (op === "gte") ok = String(cell) >= arg
    else if (op === "lte") ok = String(cell) <= arg
    else ok = true
    if (neg ? ok : !ok) return false
  }
  return true
}

const json = (status: number, body: unknown, headers: Record<string, string> = {}) => {
  const text = JSON.stringify(body)
  return { status, text, headers: { "content-type": "application/json", ...headers } }
}

function rest(url: URL, method: string, accept: string, prefer: string, body: unknown) {
  const path = url.pathname.slice("/rest/v1/".length)
  if (path.startsWith("rpc/")) {
    const f = world.rpc.get(path.slice(4))
    if (!f) return json(404, { code: "PGRST202", message: "Could not find the function in the schema cache" })
    const r = f((body ?? {}) as Record<string, unknown>)
    return json(r.status, r.body)
  }
  const t = table(path)
  const one = accept.includes("vnd.pgrst.object")
  const sel = parseSel(url.searchParams.get("select") ?? "*")
  const answer = (list: Row[]) => {
    const shaped = list.map((r) => project(path, r, sel))
    if (one) return shaped.length === 1 ? json(200, shaped[0]) : json(406, { code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned" })
    return json(200, shaped, { "content-range": `0-${shaped.length}/${shaped.length}` })
  }
  if (method === "GET" || method === "HEAD") {
    let list = t.filter((r) => matches(r, url))
    const lim = url.searchParams.get("limit")
    const off = Number(url.searchParams.get("offset") ?? 0)
    /* order=col.desc,col2 (round 66: a backup's "newest row" is read by created_at, descending). */
    const order = url.searchParams.get("order")
    if (order) {
      const keys = order.split(",").map((k) => { const [col, dir] = k.split("."); return { col, desc: dir === "desc" } })
      list = [...list].sort((a, b) => {
        for (const { col, desc } of keys) {
          const x = String(a[col] ?? ""), y = String(b[col] ?? "")
          if (x !== y) return (x < y ? -1 : 1) * (desc ? -1 : 1)
        }
        return 0
      })
    }
    if (off) list = list.slice(off)
    if (lim) list = list.slice(0, Number(lim))
    if (method === "HEAD") return { status: 200, text: "", headers: { "content-range": `*/${list.length}` } }
    return answer(list)
  }
  world.writes.push({ table: path, method })
  if (method === "POST") {
    const list = (Array.isArray(body) ? body : [body]) as Row[]
    const conflict = url.searchParams.get("on_conflict")
    const made: Row[] = []
    for (const r of list) {
      if (conflict) {
        const keys = conflict.split(",")
        const hit = t.find((x) => keys.every((k) => x[k] === r[k]))
        if (hit) {
          /* An update, as the table's BEFORE UPDATE trigger stamps it (round 66: the canvas's revision reads updated_at). */
          if (!prefer.includes("ignore-duplicates")) Object.assign(hit, r, { updated_at: new Date().toISOString() })
          continue
        }
      }
      /* Column defaults the routes count on (round 66): the live release pointer's rev starts at 0, as part 180 declares it. */
      const defaults: Row = path === "site_live_releases" ? { rev: 0, release_id: null } : {}
      const row = { id: randomUUID(), created_at: new Date().toISOString(), updated_at: new Date().toISOString(), ...defaults, ...r }
      t.push(row)
      made.push(row)
    }
    return prefer.includes("return=representation") ? answer(made) : { status: 201, text: "", headers: {} }
  }
  if (method === "PATCH") {
    const hit = t.filter((r) => matches(r, url))
    for (const r of hit) Object.assign(r, body as Row, { updated_at: new Date().toISOString() })
    return prefer.includes("return=representation") ? answer(hit) : { status: 204, text: "", headers: {} }
  }
  if (method === "DELETE") {
    const keep = t.filter((r) => !matches(r, url))
    const gone = t.length - keep.length
    world.tables.set(path, keep)
    void gone
    return { status: 204, text: "", headers: {} }
  }
  return json(405, {})
}

const later = <T>(ms: number, f: () => T, signal?: AbortSignal | null) =>
  new Promise<T>((res, rej) => {
    const t = setTimeout(() => {
      try {
        res(f())
      } catch (e) {
        rej(e)
      }
    }, ms)
    signal?.addEventListener("abort", () => { clearTimeout(t); rej(signal.reason) }, { once: true })
  })

export function installFetch(app: (path: string, init?: RequestInit) => Promise<Response>) {
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const req = input instanceof Request ? input : null
    const href = typeof input === "string" ? input : input instanceof URL ? input.href : input.url
    if (href.startsWith("/")) return app(href, init)
    const signal = init?.signal ?? req?.signal
    const url = new URL(href)
    const method = (init?.method ?? req?.method ?? "GET").toUpperCase()
    if (url.pathname.endsWith("/jwks.json")) return new Response(JSON.stringify({ keys: [] }), { status: 200 })
    if (url.pathname === "/auth/v1/user") return later(net.authMs, () => new Response(JSON.stringify(person), { status: 200, headers: { "content-type": "application/json" } }), signal)
    if (url.pathname.startsWith("/storage/v1/")) {
      return later(net.rttMs, () => new Response(JSON.stringify(method === "POST" && url.pathname.includes("/list/") ? [] : { Key: "x" }), { status: 200, headers: { "content-type": "application/json" } }), signal)
    }
    if (url.pathname.startsWith("/rest/v1/")) {
      const headers = new Headers(init?.headers ?? req?.headers)
      const raw = init?.body ?? (req ? await req.clone().text() : null)
      const body = typeof raw === "string" && raw ? JSON.parse(raw) : null
      const a = rest(url, method, headers.get("accept") ?? "", headers.get("prefer") ?? "", body)
      const size = a.text.length + (typeof raw === "string" ? raw.length : 0)
      world.requests++
      world.bytes += size
      const name = url.pathname.slice(9)
      const seen = world.byTable.get(name) ?? { n: 0, bytes: 0 }
      seen.n++
      seen.bytes += size
      world.byTable.set(name, seen)
      const at = performance.now()
      await transfer(size)
      world.log?.push({ table: name, method, select: url.searchParams.get("select") ?? "", bytes: size, at, end: performance.now() })
      if (signal?.aborted) throw signal.reason
      return new Response(a.status === 204 || a.text === "" ? null : a.text, { status: a.status, headers: a.headers })
    }
    return new Response("{}", { status: 404 })
  }) as typeof fetch
}

/** One request: one cookie store for its whole life, as Next keeps it. */
export function holdRequest() {
  const jar = new Map([[COOKIE, cookie]])
  const store = {
    getAll: () => [...jar].map(([name, value]) => ({ name, value })),
    get: (n: string) => (jar.has(n) ? { name: n, value: jar.get(n) } : undefined),
    set: (n: string, v: string) => void jar.set(n, v),
  }
  const headers = new Headers({ host: "storelib.com" })
  ;(globalThis as Record<string, unknown>).__PUSH_TEST_NEXT_HEADERS__ = { cookies: () => store, headers: () => headers }
}
