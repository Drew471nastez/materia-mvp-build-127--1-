/**
 * ===========================================================================
 *  A SUPABASE THAT ANSWERS FROM A FIXTURE, FOR A REAL BUILD TO READ
 * ===========================================================================
 * A production build of the app (`pnpm build`, `next start`) reads Supabase
 * on the server and in the browser. With the placeholder address from
 * CLAUDE.md every read fails, so a public page renders its not-found and
 * nothing about the real page can be measured. Built with
 *
 *   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
 *
 * the app reads this instead: PostgREST's shape (filters by eq, neq, in,
 * ilike, is, gt/gte/lt/lte; select, order, limit; one row or a list; a count
 * in Content-Range), Auth's /user and /token for one signed in creator (or
 * several people, `users`), and nothing else. Writes are accepted and
 * forgotten, unless `writes: true` (round 50): then PATCH, POST and DELETE
 * change `tables`, so a save can be read back. `tables` is read on every request, so a probe can change a row
 * between two page loads. Used by scripts/check-creator-page-audit.mjs
 * (LOCAL=1) and scripts/check-archive-lifecycle.mjs.
 *
 *   const stub = await serveSupabaseStub({ port: 54321, tables })
 *   stub.sessionCookie()        the cookie a signed in browser carries
 *   stub.sessionCookie(userId)  the same, for one of `users`
 *
 * THE CONTROL (round rel2-db, scripts/load-public.mjs). A load test makes the
 * database slow or down part way through a run and counts what reached it:
 *
 *   stub.control.set({ delayMs: 3000, failStatus: 503 })   every answer 3 s late, then a 503
 *   stub.control.set({ delayMs: 0, failStatus: null })     recovered
 *   stub.control.requests()                                requests answered since the start
 *   stub.control.reset()                                   that count back to 0
 *
 * With `controlPath: "/__stub"` the same is reachable over HTTP for a stub
 * in another process: GET /__stub reads { requests, delayMs, failStatus },
 * POST /__stub with a JSON body sets it (`reset: true` zeroes the count). A
 * forced failure answers /rest/v1 and /auth/v1 alike, with PostgREST's error
 * shape. `keepLog: false` stops `log` growing for a run of millions. The
 * defaults change nothing for an existing caller: no delay but `delayMs`, no
 * failure, no control path, a log of every request.
 */
import { createServer } from "node:http"

const b64url = (s) => Buffer.from(s).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_")

/** An unsigned token in a JWT's shape: nothing here checks a signature, and code that reads the claims can. */
export function fakeJwt(claims) {
  return `${b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }))}.${b64url(JSON.stringify(claims))}.${b64url("probe")}`
}

function matches(row, key, raw) {
  const value = row[key]
  const [op, ...rest] = raw.split(".")
  const arg = rest.join(".")
  const str = value == null ? null : String(value)
  switch (op) {
    case "eq": return str === arg
    case "neq": return str !== arg
    case "gt": return value != null && value > arg
    case "gte": return value != null && value >= arg
    case "lt": return value != null && value < arg
    case "lte": return value != null && value <= arg
    case "is": return arg === "null" ? value == null : String(value) === arg
    case "in": return arg.replace(/^\(|\)$/g, "").split(",").map((x) => x.replace(/^"|"$/g, "")).includes(str)
    case "ilike":
    case "like": {
      const re = new RegExp(`^${arg.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/[*%]/g, ".*")}$`, op === "ilike" ? "i" : "")
      return str != null && re.test(str)
    }
    /* `not.is.null` and the like: the filter after it, turned round. */
    case "not": return arg ? !matches(row, key, arg) : true
    default: return true
  }
}

/**
 * `files`: public storage objects by path under /storage/v1/object/public/
 * ("media/nova/favicon.png"), each { type, body }, for a probe whose page
 * reads a picture through the server (a website's favicon, round 53).
 */
/**
 * `writable`: a PATCH changes the rows its filters pick (the JSON body merged
 * over each) and a POST adds them, so a probe can save through a real route
 * and read the page back (round 50, scripts/check-story-r50.mjs). Off by
 * default: every other probe expects writes to be forgotten.
 */
export async function serveSupabaseStub({ port = 54321, tables = {}, user = null, users = [], delayMs = 0, files = {}, writable = false, writes = false, controlPath = null, keepLog = true } = {}) {
  const log = []
  const state = { delayMs: Math.max(0, Number(delayMs) || 0), failStatus: null, requests: 0 }
  const control = {
    set({ delayMs: d, failStatus: f } = {}) {
      if (d !== undefined) state.delayMs = Math.max(0, Number(d) || 0)
      if (f !== undefined) state.failStatus = f == null ? null : Number(f)
      return control.read()
    },
    read: () => ({ requests: state.requests, delayMs: state.delayMs, failStatus: state.failStatus }),
    requests: () => state.requests,
    reset() { state.requests = 0 },
  }
  const tokenOf = (u) => fakeJwt({ sub: u.id, role: "authenticated", aud: "authenticated", exp: Math.floor(Date.now() / 1000) + 86400, email: u.email })
  const token = user ? tokenOf(user) : null
  /* Everybody who can be signed in, by their token and by their refresh token. */
  const people = [...(user ? [user] : []), ...users].map((u) => ({ user: u, token: tokenOf(u), refresh: `probe-refresh-${u.id}` }))
  /* `delayMs`: every answer that long late, the way a real database across a network is, so serial round trips show in a measured time. */
  const onControl = (req, res) => {
    const reply = () => {
      res.writeHead(200, { "content-type": "application/json" })
      res.end(JSON.stringify(control.read()))
    }
    if (req.method !== "POST") return reply()
    let raw = ""
    req.on("data", (d) => { raw += d })
    req.on("end", () => {
      let body = {}
      try { body = JSON.parse(raw || "{}") } catch { body = {} }
      if (body && body.reset) control.reset()
      control.set(body || {})
      reply()
    })
  }
  const server = createServer((req, res) => {
    if (controlPath && req.url && (req.url === controlPath || req.url.startsWith(`${controlPath}?`))) return onControl(req, res)
    return state.delayMs > 0 ? setTimeout(() => answer(req, res), state.delayMs) : answer(req, res)
  })
  const answer = (req, res) => {
    const url = new URL(req.url, `http://127.0.0.1:${port}`)
    const send = (status, body, headers = {}) => {
      res.writeHead(status, { "content-type": "application/json", "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*", "access-control-expose-headers": "content-range", ...headers })
      res.end(body === undefined ? "" : JSON.stringify(body))
    }
    if (req.method === "OPTIONS") return send(204)
    state.requests++
    if (keepLog) log.push(`${req.method} ${url.pathname}${url.search}`)
    if (state.failStatus) {
      req.resume()
      return send(state.failStatus, { code: String(state.failStatus), message: "stub: forced failure", details: null, hint: null })
    }
    const auth = req.headers.authorization || ""

    if (url.pathname === "/auth/v1/user") {
      const who = people.find((p) => auth === `Bearer ${p.token}`)
      if (who) return send(200, who.user)
      return send(401, { code: 401, error_code: "no_authorization", msg: "no user" })
    }
    if (url.pathname.startsWith("/auth/v1/token")) {
      if (people.length === 0) return send(400, { error: "invalid_grant" })
      let body = ""
      req.on("data", (d) => { body += d })
      req.on("end", () => {
        let asked = null
        try { asked = JSON.parse(body || "{}").refresh_token ?? null } catch { asked = null }
        const who = people.find((p) => p.refresh === asked) ?? people[0]
        send(200, { access_token: who.token, token_type: "bearer", expires_in: 86400, expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: who.refresh, user: who.user })
      })
      return
    }
    if (url.pathname.startsWith("/auth/v1/")) return send(200, {})
    if (url.pathname.startsWith("/storage/v1/object/public/")) {
      const file = files[decodeURIComponent(url.pathname.slice("/storage/v1/object/public/".length))]
      if (file) {
        res.writeHead(200, { "content-type": file.type, "content-length": String(file.body.length), "access-control-allow-origin": "*" })
        return res.end(file.body)
      }
    }
    if (url.pathname.startsWith("/storage/v1/")) return send(404, { error: "not found" })
    if (url.pathname.startsWith("/rest/v1/rpc/")) return send(200, null)

    const m = url.pathname.match(/^\/rest\/v1\/([a-z_0-9]+)$/)
    if (!m) return send(404, { message: "no route" })
    if (writable && (req.method === "PATCH" || req.method === "POST")) {
      let body = ""
      req.on("data", (d) => { body += d })
      req.on("end", () => {
        let input = null
        try { input = JSON.parse(body || "null") } catch { input = null }
        const table = (tables[m[1]] = tables[m[1]] || [])
        if (req.method === "POST") {
          const added = (Array.isArray(input) ? input : [input]).filter(Boolean)
          table.push(...added)
          return send(201, added)
        }
        const changed = []
        for (const row of table) {
          let hit = true
          for (const [k, v] of url.searchParams) {
            if (["select", "order", "limit", "offset", "or", "and", "on_conflict", "columns"].includes(k)) continue
            if (!matches(row, k, v)) { hit = false; break }
          }
          if (hit && input && typeof input === "object") { Object.assign(row, input); changed.push(row) }
        }
        return send(200, changed)
      })
      return
    }
    if (req.method !== "GET" && req.method !== "HEAD") {
      /* Written and forgotten, unless `writes`: then a PATCH changes the rows its filters match and a POST adds its rows (round 50, so an editor's save can be read back). */
      if (!writes) {
        req.resume()
        return send(req.method === "POST" ? 201 : 200, [])
      }
      let raw = ""
      req.on("data", (d) => { raw += d })
      req.on("end", () => {
        let body = null
        try { body = JSON.parse(raw || "null") } catch { body = null }
        const table = (tables[m[1]] ||= [])
        const filters = [...url.searchParams].filter(([k]) => !["select", "order", "limit", "offset", "or", "and", "on_conflict", "columns"].includes(k))
        let changed = []
        if (req.method === "PATCH" && body && typeof body === "object") {
          changed = table.filter((r) => filters.every(([k, v]) => matches(r, k, v)))
          for (const r of changed) Object.assign(r, body)
        } else if (req.method === "POST" && body) {
          changed = (Array.isArray(body) ? body : [body]).map((r) => ({ ...r }))
          table.push(...changed)
        } else if (req.method === "DELETE") {
          changed = table.filter((r) => filters.every(([k, v]) => matches(r, k, v)))
          tables[m[1]] = table.filter((r) => !changed.includes(r))
        }
        if (keepLog) log.push(`  wrote ${changed.length} ${m[1]}`)
        send(req.method === "POST" ? 201 : 200, changed)
      })
      return
    }
    let rows = [...(tables[m[1]] || [])]
    for (const [k, v] of url.searchParams) {
      if (["select", "order", "limit", "offset", "or", "and", "on_conflict", "columns"].includes(k)) continue
      rows = rows.filter((r) => matches(r, k, v))
    }
    const order = url.searchParams.get("order")
    if (order) {
      const [col, dir] = order.split(",")[0].split(".")
      rows.sort((a, b) => (a[col] > b[col] ? 1 : a[col] < b[col] ? -1 : 0) * (dir === "desc" ? -1 : 1))
    }
    const total = rows.length
    const offset = Number(url.searchParams.get("offset") || 0)
    const limit = url.searchParams.get("limit")
    rows = rows.slice(offset, limit ? offset + Number(limit) : undefined)
    const range = { "content-range": `${rows.length ? `${offset}-${offset + rows.length - 1}` : "*"}/${total}` }
    if (req.method === "HEAD") return send(200, undefined, range)
    if ((req.headers.accept || "").includes("vnd.pgrst.object")) {
      if (rows.length !== 1) return send(406, { code: "PGRST116", details: `The result contains ${rows.length} rows`, hint: null, message: "JSON object requested, multiple (or no) rows returned" })
      return send(200, rows[0], range)
    }
    return send(200, rows, range)
  }
  await new Promise((r) => server.listen(port, "127.0.0.1", r))
  return {
    server,
    log,
    token,
    control,
    /** The cookie @supabase/ssr reads a session from, for this address. */
    sessionCookie(userId) {
      const who = userId ? people.find((p) => p.user.id === userId) : people[0]
      if (!who) return null
      const session = { access_token: who.token, token_type: "bearer", expires_in: 86400, expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: who.refresh, user: who.user }
      return { name: "sb-127-auth-token", value: `base64-${b64url(JSON.stringify(session))}` }
    },
  }
}
