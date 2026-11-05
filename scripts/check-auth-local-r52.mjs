/**
 * ===========================================================================
 *  "WE COULD NOT CHECK YOUR SIGN IN JUST NOW", COUNTED: THE REAL AUTH MODULES
 *  AGAINST A SUPABASE AUTH THAT IS SLOW (3s, 10s) OR DOWN
 * ===========================================================================
 * Round 52. The real lib/auth/route-user.ts, lib/auth/request-scope.ts,
 * lib/auth/page-user.ts and lib/website-builder/owned-install.ts are bundled
 * with esbuild (the real @supabase/ssr and supabase-js; next/headers stubbed
 * with one cookie store per request) and asked, once per simulated request,
 * who is signing in, with a real signed access token in the cookie:
 *
 *   ordinary   a page render, pageUser, a route read, a route change (save,
 *              publish, setting), readUserForRoute, the editor's save and
 *              read, an account setting
 *   strict     routeUser({ fresh: true }), the routes where a session ended
 *              within the token's life must not act (r52 only; the round 51
 *              tree has no such option, and its default was strict)
 *
 * against /auth/v1/user answering: at once, after 3s, after 10s, a network
 * failure, a 503. Each answer that is not the person counts as a failure,
 * and "unavailable" is the 503 that says "We could not check your sign in".
 *
 *   node scripts/check-auth-local-r52.mjs                          # this tree
 *   SRC_ROOT=/path/to/older/tree node scripts/check-auth-local-r52.mjs
 *   VERIFIER=hs256|jwks|none (default hs256)                        # what the server can check with
 *   R52_JSON=1                                                      # one JSON line with every number
 */
import { execFileSync } from "node:child_process"
import { createHmac, generateKeyPairSync, createSign } from "node:crypto"
import { mkdirSync, rmSync, writeFileSync, existsSync } from "node:fs"
import { join } from "node:path"
import { createRequire } from "node:module"

const root = process.cwd()
const src = process.env.SRC_ROOT ?? root
const verifier = process.env.VERIFIER ?? "hs256"
const out = join(root, `.r52auth-probe-${process.pid}`)
mkdirSync(out, { recursive: true })
const empty = join(out, "empty.js")
writeFileSync(empty, "export {}\n")
/* next/headers: the request's cookie store and headers, from a global the harness sets per request. */
const headersStub = join(out, "next-headers.js")
writeFileSync(headersStub, "export async function cookies() { return globalThis.__R52_REQ.cookies }\nexport async function headers() { return globalThis.__R52_REQ.headers }\n")
const navStub = join(out, "next-navigation.js")
writeFileSync(navStub, "export function redirect(to) { const e = new Error('NEXT_REDIRECT ' + to); e.digest = 'NEXT_REDIRECT;' + to; throw e }\nexport function notFound() { throw new Error('NEXT_NOT_FOUND') }\n")
const hasFull = existsSync(join(src, "lib/auth/request-scope.ts")) && /fullUserForRequest/.test(execFileSync("cat", [join(src, "lib/auth/request-scope.ts")], { encoding: "utf8" }))
const entry = join(out, "entry.ts")
writeFileSync(
  entry,
  [
    `export { routeUser, readUserForRoute, readerForRequest } from ${JSON.stringify(join(src, "lib/auth/route-user.ts"))}`,
    `export { currentUserForRequest } from ${JSON.stringify(join(src, "lib/auth/request-scope.ts"))}`,
    `export { pageUser } from ${JSON.stringify(join(src, "lib/auth/page-user.ts"))}`,
    `export { editorUser } from ${JSON.stringify(join(src, "lib/website-builder/owned-install.ts"))}`,
    `export { forgetSigningKeys } from ${JSON.stringify(join(src, "lib/auth/verify-token.ts"))}`,
    "",
  ].join("\n"),
)
const bundle = join(out, "probe.cjs")
execFileSync(
  "pnpm",
  [
    "exec", "esbuild", entry, "--bundle", "--platform=node", "--format=cjs", "--log-level=error", `--outfile=${bundle}`,
    `--alias:server-only=${empty}`, `--alias:next/headers=${headersStub}`, `--alias:next/navigation=${navStub}`, `--alias:@=${src}`, "--packages=external",
  ],
  { stdio: ["ignore", "ignore", "inherit"] },
)

const URL_ = "https://abcdefgh.supabase.co"
process.env.NEXT_PUBLIC_SUPABASE_URL = URL_
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon"
process.env.SUPABASE_SERVICE_ROLE_KEY = "service"
process.env.NEXT_PUBLIC_MAIN_DOMAIN = "storelib.com"
const SECRET = "r52-test-secret-of-plenty-of-length-0123456789"
if (verifier === "hs256") process.env.SUPABASE_JWT_SECRET = SECRET
else delete process.env.SUPABASE_JWT_SECRET

const quiet = { log: console.log }
const say = (...a) => quiet.log(...a)
console.warn = () => {}
console.error = () => {}
console.info = () => {}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const nowS = () => Math.floor(Date.now() / 1000)
const b64u = (b) => Buffer.from(b).toString("base64url")

/* ------------------------------------------------------------- the token */
const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" })
const jwk = { ...publicKey.export({ format: "jwk" }), kid: "k1", alg: "ES256", use: "sig" }
const user = { id: "11111111-1111-4111-8111-111111111111", aud: "authenticated", role: "authenticated", email: "owner@example.com", email_confirmed_at: "2026-01-01T00:00:00Z", created_at: "2026-01-01T00:00:00Z", app_metadata: { provider: "email" }, user_metadata: { display_name: "Owner" } }
function token({ exp = nowS() + 3000 } = {}) {
  const payload = { iss: `${URL_}/auth/v1`, sub: user.id, aud: "authenticated", role: "authenticated", exp, iat: nowS() - 10, email: user.email, app_metadata: user.app_metadata, user_metadata: user.user_metadata, session_id: "s1" }
  if (verifier === "jwks") {
    const h = b64u(JSON.stringify({ alg: "ES256", typ: "JWT", kid: "k1" }))
    const p = b64u(JSON.stringify(payload))
    const sig = createSign("SHA256").update(`${h}.${p}`).sign({ key: privateKey, dsaEncoding: "ieee-p1363" })
    return `${h}.${p}.${b64u(sig)}`
  }
  const h = b64u(JSON.stringify({ alg: "HS256", typ: "JWT" }))
  const p = b64u(JSON.stringify(payload))
  return `${h}.${p}.${createHmac("sha256", verifier === "hs256" ? SECRET : "a-secret-this-server-does-not-have-0123456789").update(`${h}.${p}`).digest("base64url")}`
}

/* --------------------------------------------------------- the fake Auth */
const auth = { mode: "ok", userCalls: 0 }
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })
globalThis.fetch = async (input, init = {}) => {
  const url = new URL(typeof input === "string" ? input : input.url)
  if (url.pathname === "/auth/v1/user") {
    auth.userCalls++
    const signal = init.signal
    const wait = (ms) =>
      new Promise((resolve, reject) => {
        const t = setTimeout(resolve, ms)
        signal?.addEventListener?.("abort", () => { clearTimeout(t); reject(new DOMException("aborted", "AbortError")) })
      })
    if (auth.mode === "slow3") await wait(3_000)
    if (auth.mode === "slow10") await wait(10_000)
    if (auth.mode === "down") throw new TypeError("fetch failed")
    if (auth.mode === "503") return json({ message: "upstream" }, 503)
    return json(user)
  }
  if (url.pathname === "/auth/v1/.well-known/jwks.json") return json({ keys: verifier === "jwks" ? [jwk] : [] })
  if (url.pathname.startsWith("/rest/v1/")) return json([])
  return json({}, 404)
}

const require = createRequire(bundle)
const probe = require(bundle)

/* ------------------------------------------------------ one request each */
const KEY = "sb-abcdefgh-auth-token"
function newRequest() {
  const access = token()
  const session = { access_token: access, token_type: "bearer", expires_in: 3600, expires_at: nowS() + 3000, refresh_token: "rt.s1.0", user }
  const jar = new Map([[KEY, `base64-${Buffer.from(JSON.stringify(session)).toString("base64url")}`]])
  globalThis.__R52_REQ = {
    cookies: { getAll: () => [...jar].map(([name, value]) => ({ name, value })), get: (n) => (jar.has(n) ? { name: n, value: jar.get(n) } : undefined), set: (n, v) => jar.set(n, v) },
    headers: new Headers({ host: "storelib.com" }),
  }
}

const isUser = (u) => !!u && u.id === user.id
const ACTIONS = [
  ["page render (currentUserForRequest)", "ordinary", async () => { const c = await probe.currentUserForRequest(); return isUser(c.user) ? "ok" : c.state === "anonymous" ? "signed-out" : "unavailable" }],
  ["page (pageUser)", "ordinary", async () => { try { return isUser(await probe.pageUser()) ? "ok" : "unavailable" } catch { return "signed-out" } }],
  ["route read (routeUser fresh: false)", "ordinary", async () => { const w = await probe.routeUser({ fresh: false }); return w.kind === "user" ? "ok" : w.kind === "anonymous" ? "signed-out" : "unavailable" }],
  ["route change: save, publish, setting (routeUser())", "ordinary", async () => { const w = await probe.routeUser(); return w.kind === "user" ? "ok" : w.kind === "anonymous" ? "signed-out" : "unavailable" }],
  ["route read (readUserForRoute)", "ordinary", async () => (isUser((await probe.readUserForRoute()).data.user) ? "ok" : "unavailable")],
  ["editor save (editorUser)", "ordinary", async () => { const r = await probe.editorUser(null); return r.user ? "ok" : r.status === 401 ? "signed-out" : "unavailable" }],
  ["editor read (editorUser read)", "ordinary", async () => { const r = await probe.editorUser(null, { read: true }); return r.user ? "ok" : r.status === 401 ? "signed-out" : "unavailable" }],
  ["account setting (readerForRequest)", "ordinary", async () => { const c = await probe.readerForRequest(); return isUser(c.user) ? "ok" : c.state === "anonymous" ? "signed-out" : "unavailable" }],
  ...(hasFull ? [["strict: password, payouts, keys (routeUser fresh: true)", "strict", async () => { const w = await probe.routeUser({ fresh: true }); return w.kind === "user" ? "ok" : w.kind === "anonymous" ? "signed-out" : "unavailable" }]] : []),
]

const MODES = ["ok", "slow3", "slow10", "down", "503"]
const results = []
say(`\nRound 52: who is signing in, while Supabase Auth is slow or down (verifier ${verifier})`)
say(`  source: ${src === root ? "this tree" : src}\n`)
try {
  for (const mode of MODES) {
    auth.mode = mode
    auth.userCalls = 0
    probe.forgetSigningKeys?.()
    const row = { mode, ordinaryFailed: 0, ordinarySignInMessage: 0, strictFailed: 0, authCalls: 0, slowestMs: 0, actions: {} }
    for (const [name, kind, run] of ACTIONS) {
      newRequest()
      const t = Date.now()
      const verdict = await run().catch(() => "threw")
      const ms = Date.now() - t
      row.actions[name] = { verdict, ms }
      if (kind === "ordinary") {
        row.slowestMs = Math.max(row.slowestMs, ms)
        if (verdict !== "ok") row.ordinaryFailed++
        if (verdict === "unavailable") row.ordinarySignInMessage++
      } else if (verdict !== "ok") row.strictFailed++
    }
    row.authCalls = auth.userCalls
    results.push(row)
    say(`  Auth ${mode.padEnd(7)} ordinary failed ${row.ordinaryFailed}/${ACTIONS.filter((a) => a[1] === "ordinary").length}  ("could not check" ${row.ordinarySignInMessage})  slowest ${String(row.slowestMs).padStart(5)}ms  strict failed ${hasFull ? row.strictFailed : "n/a"}  /auth/v1/user calls ${row.authCalls}`)
    for (const [name, a] of Object.entries(row.actions)) if (a.verdict !== "ok") say(`      ${name}: ${a.verdict} after ${a.ms}ms`)
  }
  const total = results.reduce((t, r) => ({ failed: t.failed + r.ordinaryFailed, message: t.message + r.ordinarySignInMessage }), { failed: 0, message: 0 })
  say(`\n  TOTAL ordinary actions failed ${total.failed}, of them "could not check your sign in" ${total.message}\n`)
  if (process.env.R52_JSON) say(JSON.stringify({ verifier, total, results }))
  /* Wait out the slow answers still in flight, so the process ends on its own. */
  await sleep(50)
  process.exitCode = verifier === "none" ? 0 : total.failed === 0 ? 0 : 1
} finally {
  rmSync(out, { recursive: true, force: true })
}
process.exit(process.exitCode ?? 0)
