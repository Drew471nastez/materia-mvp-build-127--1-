/**
 * ===========================================================================
 *  SUPABASE AUTH SILENT FOR 15 SECONDS, AND /app STILL RENDERS
 * ===========================================================================
 * Round rel3-auth. Production, Nov 1 09:03 UTC: "auth/v1/user took longer
 * than 10s" on /app, /auth/sync-session and the proxy, and people saw "We
 * could not check your sign in just now" and "Cannot reach the server" with
 * a valid session. The project signs with the shared secret (HS256, empty
 * JWKS), so the claims fallback never ran; and it read the token through
 * getClaims(), which waited on the lock the hung getUser() held.
 *
 * Driven through the real code: @supabase/ssr's server client over the
 * real cookies (next/headers held by the suite), lib/auth/request-scope
 * currentUserForRequest and pageUser (what /app's layout and pages ask),
 * readVerifiedSession (the proxy), routeUser({ fresh: false }) and the real
 * POST /auth/sync-session, with a stand-in Supabase whose /auth/v1/user
 * answers after 15s or never. Tokens are real HS256 JWTs.
 */
import { createHmac } from "node:crypto"
import { createServerClient } from "@supabase/ssr"
import { readCurrentUser, readVerifiedSession, shouldSendToLogin } from "@/lib/auth/current-user"
import { forgetSigningKeys } from "@/lib/auth/verify-token"
import { currentUserForRequest } from "@/lib/auth/request-scope"
import { pageUser } from "@/lib/auth/page-user"
import { routeUser } from "@/lib/auth/route-user"
import { POST as syncPost } from "@/app/auth/sync-session/route"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; failures.push(label); console.log(`  FAIL  ${label}${detail !== undefined ? ` — ${JSON.stringify(detail)?.slice(0, 400)}` : ""}`) }
}
const quiet = () => {}
console.warn = quiet
console.error = quiet

const URL_ = "https://abcd.supabase.co"
const SECRET = "test-secret-only-for-this-suite-0123456789abcdef"
process.env.NEXT_PUBLIC_SUPABASE_URL = URL_
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon"
process.env.SUPABASE_SERVICE_ROLE_KEY = "service"
const now = () => Math.floor(Date.now() / 1000)
const b64url = (s: string) => Buffer.from(s).toString("base64url")
function hs256(payload: Record<string, unknown>, secret = SECRET) {
  const h = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }))
  const p = b64url(JSON.stringify(payload))
  return `${h}.${p}.${createHmac("sha256", secret).update(`${h}.${p}`).digest("base64url")}`
}
const person = { id: "u1", aud: "authenticated", role: "authenticated", email: "a@example.test", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" }
const claims = (over: Record<string, unknown> = {}) => ({ sub: "u1", aud: "authenticated", role: "authenticated", iss: `${URL_}/auth/v1`, exp: now() + 3600, iat: now(), email: "a@example.test", session_id: "s1", ...over })
const COOKIE = "sb-abcd-auth-token"
function sessionCookie(token: string, expiresIn = 3600) {
  const session = { access_token: token, refresh_token: "rt", token_type: "bearer", expires_in: expiresIn, expires_at: now() + expiresIn, user: person }
  return { name: COOKIE, value: "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url") }
}

/* The stand-in Supabase: /auth/v1/user as the mode says, every request counted. */
type Mode = "ok" | "15s" | "never" | "503" | "revoked"
const auth = { mode: "never" as Mode, refresh: "never" as "never" | "ok", hits: [] as string[] }
const timers: ReturnType<typeof setTimeout>[] = []
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })
const standIn = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url
  const path = url.replace(URL_, "").split("?")[0]
  auth.hits.push(path)
  const signal = init?.signal
  const wait = (ms: number | null, then: () => Response) =>
    new Promise<Response>((resolve, reject) => {
      if (ms !== null) timers.push(setTimeout(() => resolve(then()), ms))
      signal?.addEventListener("abort", () => reject(signal.reason ?? new DOMException("aborted", "AbortError")), { once: true })
    })
  if (path.endsWith("/.well-known/jwks.json")) return json(200, { keys: [] })
  if (path === "/auth/v1/token") return auth.refresh === "ok" ? json(200, { access_token: hs256(claims()), refresh_token: "rt2", token_type: "bearer", expires_in: 3600, expires_at: now() + 3600, user: person }) : wait(null, () => json(200, {}))
  if (path === "/auth/v1/user") {
    if (auth.mode === "ok") return json(200, person)
    if (auth.mode === "503") return json(503, { message: "upstream unavailable" })
    if (auth.mode === "revoked") return json(403, { code: "session_not_found", message: "Session from session_id claim in JWT does not exist" })
    return wait(auth.mode === "15s" ? 15_000 : null, () => json(200, person))
  }
  return json(404, {})
}) as typeof fetch
globalThis.fetch = standIn

/* next/headers for lib/supabase/server: one request's cookies, and what was written to them. */
function holdRequest(cookies: { name: string; value: string }[], written: string[] = []) {
  const jar = new Map(cookies.map((c) => [c.name, c.value]))
  ;(globalThis as Record<string, unknown>).__PUSH_TEST_NEXT_HEADERS__ = {
    cookies: () => ({
      getAll: () => [...jar].map(([name, value]) => ({ name, value })),
      get: (n: string) => (jar.has(n) ? { name: n, value: jar.get(n) } : undefined),
      set: (n: string, v: string) => { jar.set(n, v); written.push(`${n}=${v ? "set" : "cleared"}`) },
    }),
    headers: () => new Headers({ host: "storelib.com" }),
  }
  return written
}

function proxyClient(cookies: { name: string; value: string }[]) {
  return createServerClient(URL_, "anon", { global: { fetch: standIn }, cookies: { getAll: () => cookies, setAll: () => {} } })
}

async function main() {
  const good = hs256(claims())
  process.env.SUPABASE_JWT_SECRET = SECRET
  forgetSigningKeys()

  console.log("\n1. /app's server render: Auth answers after 15s, or never")
  for (const mode of ["15s", "never", "503"] as const) {
    auth.mode = mode
    auth.hits = []
    holdRequest([sessionCookie(good)])
    const t = Date.now()
    const current = await currentUserForRequest()
    const took = Date.now() - t
    check(`${mode}: signed in, from the token's verified claims`, current.state === "authenticated" && current.user?.id === "u1" && current.verifiedBy === "claims", current)
    check(`  ${mode}: well under the 10s deadline (${took}ms)`, took < 3_200, took)
    /* One readCurrentUser per request. A 503 is asked again by lib/net/deadline's read retry, inside the same short budget. */
    const asked = auth.hits.filter((h) => h === "/auth/v1/user").length
    check(`  ${mode}: one question to Supabase Auth (${asked} request${asked === 1 ? "" : "s"})`, mode === "503" ? asked >= 1 && asked <= 3 : asked === 1, auth.hits)
    const u = await pageUser().catch((e) => e)
    check(`  ${mode}: pageUser hands the page its user, no redirect to /login`, (u as { id?: string })?.id === "u1", String(u))
  }

  console.log("\n2. Never a yes for a token that does not check out")
  auth.mode = "never"
  for (const [label, token] of [
    ["signed with another secret (forged)", hs256(claims(), "an-attacker-secret-of-enough-length-012345")],
    ["claims altered after signing", (() => { const [h, , s] = good.split("."); return `${h}.${b64url(JSON.stringify(claims({ sub: "someone-else" })))}.${s}` })()],
    ["another project's issuer", hs256(claims({ iss: "https://evil.supabase.co/auth/v1" }))],
    ["the anon role", hs256(claims({ role: "anon" }))],
  ] as const) {
    holdRequest([sessionCookie(token)])
    const c = await currentUserForRequest()
    check(`${label}: no user, could not tell (not signed in)`, !c.user && c.state === "indeterminate", c)
    const p = await readVerifiedSession(proxyClient([sessionCookie(token)]), URL_, { timeoutMs: 300, retries: 0 })
    check(`  proxy: not signed in`, p.state !== "authenticated", p)
  }
  {
    /* Expired: getSession must renew it first; with the renewal hanging the old token is never accepted. */
    holdRequest([sessionCookie(hs256(claims({ exp: now() - 120 })), -120)])
    const c = await readCurrentUser((await import("@/lib/supabase/server").then((m) => m.createClient())) as never, { fallbackClaims: URL_, timeoutMs: 500 })
    check("expired token, renewal hanging: no user", !c.user && c.state === "indeterminate", c)
  }

  console.log("\n3. Auth's own no still signs out")
  auth.mode = "revoked"
  holdRequest([sessionCookie(good)])
  {
    const c = await currentUserForRequest()
    check("a session Auth says no longer exists: anonymous, even with a good signature", c.state === "anonymous" && !c.user && shouldSendToLogin(c), c)
  }

  console.log("\n4. Without the secret: as before (could not tell, never signed out)")
  delete process.env.SUPABASE_JWT_SECRET
  forgetSigningKeys()
  auth.mode = "never"
  holdRequest([sessionCookie(good)])
  {
    const t = Date.now()
    const c = await readCurrentUser((await import("@/lib/supabase/server").then((m) => m.createClient())) as never, { fallbackClaims: URL_, timeoutMs: 300, retries: 1 })
    check("indeterminate, no user, two bounded tries", c.state === "indeterminate" && !c.user && Date.now() - t < 1_500, { c, took: Date.now() - t })
  }
  process.env.SUPABASE_JWT_SECRET = SECRET
  forgetSigningKeys()

  console.log("\n5. The proxy: no request to Supabase Auth for a token that checks out")
  {
    auth.hits = []
    auth.mode = "never"
    const t = Date.now()
    const p = await readVerifiedSession(proxyClient([sessionCookie(good)]), URL_)
    check("signed in, no /auth/v1/user call, at once", p.state === "authenticated" && !auth.hits.includes("/auth/v1/user") && Date.now() - t < 200, { p, hits: auth.hits })
    auth.mode = "revoked"
    const forged = await readVerifiedSession(proxyClient([sessionCookie(hs256(claims(), "an-attacker-secret-of-enough-length-012345"))]), URL_)
    check("a forged token goes to Auth, and Auth's no is anonymous", forged.state === "anonymous" && shouldSendToLogin(forged), forged)
  }

  console.log("\n6. An API read (routeUser fresh: false); a change stays fresh")
  auth.mode = "never"
  holdRequest([sessionCookie(good)])
  {
    const r = await routeUser({ fresh: false })
    check("a read: the user", r.kind === "user" && r.user.id === "u1", r)
    const t = Date.now()
    const w = await routeUser()
    check("  a change (fresh): unavailable (503), never the signature alone", w.kind === "unavailable", { w, took: Date.now() - t })
  }

  console.log("\n7. POST /auth/sync-session while Auth hangs")
  for (const [label, token, want] of [
    ["a good token", good, "written"],
    ["a forged token", hs256(claims(), "an-attacker-secret-of-enough-length-012345"), "not written"],
  ] as const) {
    auth.mode = "never"
    const written = holdRequest([])
    const form = new FormData()
    form.set("access_token", token)
    form.set("refresh_token", "rt")
    form.set("next", "/app")
    const t = Date.now()
    const res = await syncPost(new Request("https://storelib.com/auth/sync-session", { method: "POST", body: form, headers: { origin: "https://storelib.com" } }))
    const took = Date.now() - t
    const set = written.some((w) => w.startsWith(COOKIE) && w.endsWith("=set"))
    check(`${label}: session cookie ${want} (${took}ms)`, want === "written" ? set : !set, written)
    check(`  ${label}: on to /app, not /login`, res.status === 303 && (res.headers.get("location") ?? "").endsWith("/app"), res.headers.get("location"))
    check(`  ${label}: bounded`, took < 3_500, took)
  }
  {
    auth.mode = "revoked"
    const written = holdRequest([])
    const form = new FormData()
    form.set("access_token", good)
    form.set("refresh_token", "rt")
    form.set("next", "/app")
    const res = await syncPost(new Request("https://storelib.com/auth/sync-session", { method: "POST", body: form, headers: { origin: "https://storelib.com" } }))
    check("a session Auth refused: no cookie, to /login as before", !written.some((w) => w.endsWith("=set")) && (res.headers.get("location") ?? "").includes("/login"), { written, at: res.headers.get("location") })
  }

  console.log("\n8. Through the real proxy, Auth hanging")
  {
    auth.mode = "never"
    process.env.SUPABASE_JWT_SECRET = SECRET
    forgetSigningKeys()
    const { proxy } = await import("@/proxy")
    const { NextRequest } = await import("next/server")
    const ask = async (url: string, cookie: string | null) => {
      auth.hits = []
      const headers: Record<string, string> = { host: new URL(url).host, accept: "text/html" }
      if (cookie) headers.cookie = cookie
      const t = Date.now()
      const res = (await proxy(new NextRequest(url, { headers }) as never)) as Response
      return { status: res.status, location: res.headers.get("location"), hits: [...auth.hits], took: Date.now() - t }
    }
    const c = sessionCookie(good)
    const signed = `${c.name}=${c.value}`
    const app = await ask("https://storelib.com/app/reviews", signed)
    check(`/app/reviews, a good token: through, not to /login, no Auth call (${app.took}ms)`, !(app.location ?? "").includes("/login") && !app.hits.includes("/auth/v1/user") && app.took < 1_000, app)
    const f = sessionCookie(hs256(claims(), "an-attacker-secret-of-enough-length-012345"))
    auth.mode = "revoked"
    const forged = await ask("https://storelib.com/app/reviews", `${f.name}=${f.value}`)
    check("/app/reviews, a forged token: Auth asked, and its no sends to /login", (forged.location ?? "").includes("/login") && forged.hits.includes("/auth/v1/user"), forged)
    auth.mode = "never"
    const none = await ask("https://storelib.com/app", null)
    check("/app, no cookie: to /login with no Supabase request at all", (none.location ?? "").includes("/login") && none.hits.length === 0, none)
    /* Public creator pages: nothing asked of Supabase Auth, with or without a session (the token is only renewed once it has run out). */
    for (const url of ["https://storelib.com/w/maya", "https://storelib.com/w/maya/collections/all", "https://storelib.com/andrewrullz"]) {
      const anon = await ask(url, null)
      check(`${new URL(url).pathname}, no cookie: no Supabase Auth request`, !anon.hits.some((h) => h.startsWith("/auth/v1/")), anon)
      const with_ = await ask(url, signed)
      check(`  ${new URL(url).pathname}, signed in, token in date: no Supabase Auth request`, !with_.hits.some((h) => h.startsWith("/auth/v1/")), with_)
    }
  }

  for (const t of timers) clearTimeout(t)
  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) { for (const f of failures) console.log(`  - ${f}`); process.exit(1) }
  process.exit(0)
}
main().catch((e) => { console.error(e); process.exit(1) })
