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
 * in Content-Range), Auth's /user and /token for one signed in creator, and
 * nothing else. Writes are accepted and forgotten. Used by
 * scripts/check-creator-page-audit.mjs (LOCAL=1).
 *
 *   const stub = await serveSupabaseStub({ port: 54321, tables })
 *   stub.sessionCookie()   the cookie a signed in browser carries
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
    case "not": return true
    default: return true
  }
}

export async function serveSupabaseStub({ port = 54321, tables = {}, user = null } = {}) {
  const log = []
  const token = user ? fakeJwt({ sub: user.id, role: "authenticated", aud: "authenticated", exp: Math.floor(Date.now() / 1000) + 86400, email: user.email }) : null
  const server = createServer((req, res) => {
    const url = new URL(req.url, `http://127.0.0.1:${port}`)
    const send = (status, body, headers = {}) => {
      res.writeHead(status, { "content-type": "application/json", "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*", "access-control-expose-headers": "content-range", ...headers })
      res.end(body === undefined ? "" : JSON.stringify(body))
    }
    if (req.method === "OPTIONS") return send(204)
    log.push(`${req.method} ${url.pathname}${url.search}`)
    const auth = req.headers.authorization || ""

    if (url.pathname === "/auth/v1/user") {
      if (user && auth === `Bearer ${token}`) return send(200, user)
      return send(401, { code: 401, error_code: "no_authorization", msg: "no user" })
    }
    if (url.pathname.startsWith("/auth/v1/token")) {
      if (!user) return send(400, { error: "invalid_grant" })
      return send(200, { access_token: token, token_type: "bearer", expires_in: 86400, expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: "probe-refresh", user })
    }
    if (url.pathname.startsWith("/auth/v1/")) return send(200, {})
    if (url.pathname.startsWith("/storage/v1/")) return send(404, { error: "not found" })
    if (url.pathname.startsWith("/rest/v1/rpc/")) return send(200, null)

    const m = url.pathname.match(/^\/rest\/v1\/([a-z_0-9]+)$/)
    if (!m) return send(404, { message: "no route" })
    if (req.method !== "GET" && req.method !== "HEAD") {
      /* Written and forgotten. */
      req.resume()
      return send(req.method === "POST" ? 201 : 200, [])
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
  })
  await new Promise((r) => server.listen(port, "127.0.0.1", r))
  return {
    server,
    log,
    token,
    /** The cookie @supabase/ssr reads a session from, for this address. */
    sessionCookie() {
      if (!user) return null
      const session = { access_token: token, token_type: "bearer", expires_in: 86400, expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: "probe-refresh", user }
      return { name: "sb-127-auth-token", value: `base64-${b64url(JSON.stringify(session))}` }
    },
  }
}
