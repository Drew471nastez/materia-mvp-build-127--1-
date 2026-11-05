/**
 * ===========================================================================
 *  ROUND 49: "WE COULD NOT CHECK YOUR SIGN IN JUST NOW" INSIDE /app
 * ===========================================================================
 * Production, Nov 2 07:52-07:54 UTC: /app pages rendered from the locally
 * verified token ("auth_degraded","outcome":"claims"), while the API routes
 * behind the same screen (Integrations › Send analytics, markets,
 * translations, own/token) asked Supabase Auth on their own, strictly, and
 * the panel showed the 503's words at once.
 *
 * Driven through the real code: @supabase/ssr's server client over the
 * real cookies (next/headers held by the suite), lib/auth/request-scope,
 * routeUser, the real GET /api/analytics/destinations and /api/auth/state,
 * and lib/net/request requestJson, with a stand-in Supabase whose
 * /auth/v1/user is healthy, hangs, hangs once, answers 503, or says the
 * session was revoked. Tokens are real HS256 JWTs.
 */
import { createHmac } from "node:crypto"
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import { currentUserForRequest } from "@/lib/auth/request-scope"
import { authUnavailableResponse, readerForRequest, readUserForRoute, routeUser, strictUserForRequest } from "@/lib/auth/route-user"
import { forgetSigningKeys, verifierKind } from "@/lib/auth/verify-token"
import { AUTH_READ_RETRY_DELAYS_MS, AUTH_RETRY_DELAYS_MS, authRetryDelays, requestJson } from "@/lib/net/request"
import { AUTH_CHECK_HEADER } from "@/lib/auth/auth-check-header"
import { GET as destinationsGet } from "@/app/api/analytics/destinations/route"
import { GET as authStateGet } from "@/app/api/auth/state/route"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; failures.push(label); console.log(`  FAIL  ${label}${detail !== undefined ? ` — ${JSON.stringify(detail)?.slice(0, 400)}` : ""}`) }
}
console.warn = () => {}
console.error = () => {}

const URL_ = "https://abcd.supabase.co"
const SECRET = "test-secret-only-for-this-suite-0123456789abcdef"
process.env.NEXT_PUBLIC_SUPABASE_URL = URL_
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon"
process.env.SUPABASE_SERVICE_ROLE_KEY = "service"
const now = () => Math.floor(Date.now() / 1000)
const b64url = (s: string) => Buffer.from(s).toString("base64url")
const hs256 = (p: Record<string, unknown>, secret = SECRET) => {
  const h = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }))
  const b = b64url(JSON.stringify(p))
  return `${h}.${b}.${createHmac("sha256", secret).update(`${h}.${b}`).digest("base64url")}`
}
const person = { id: "u1", aud: "authenticated", role: "authenticated", email: "a@example.test", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" }
const claims = () => ({ sub: "u1", aud: "authenticated", role: "authenticated", iss: `${URL_}/auth/v1`, exp: now() + 3600, iat: now(), email: "a@example.test", session_id: "s1" })
const COOKIE = "sb-abcd-auth-token"
const cookieOf = (token: string) => "base64-" + Buffer.from(JSON.stringify({ access_token: token, refresh_token: "rt", token_type: "bearer", expires_in: 3600, expires_at: now() + 3600, user: person })).toString("base64url")
const good = hs256(claims())
const forged = hs256(claims(), "an-attacker-secret-of-enough-length-012345")

/* The stand-in Supabase. */
type Mode = "ok" | "never" | "hang-once" | "503-twice" | "revoked"
const auth = { mode: "ok" as Mode, n: 0, hits: 0 }
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })
const later = (ms: number, f: () => Response, signal?: AbortSignal | null) =>
  new Promise<Response>((res, rej) => {
    const t = setTimeout(() => res(f()), ms)
    signal?.addEventListener("abort", () => { clearTimeout(t); rej(signal.reason) }, { once: true })
  })
const never = (signal?: AbortSignal | null) => new Promise<Response>((_, rej) => signal?.addEventListener("abort", () => rej(signal.reason), { once: true }))
let token = good
const sent: { url: string; method: string }[] = []
const standIn = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const req = input instanceof Request ? input : null
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url
  const signal = init?.signal ?? req?.signal
  if (url.startsWith("/")) return app(url, init)
  const path = url.replace(URL_, "").split("?")[0]
  if (path.endsWith("/jwks.json")) return json(200, { keys: [] })
  if (path === "/auth/v1/user") {
    auth.hits++
    const n = auth.n++
    if (auth.mode === "ok") return later(60, () => json(200, person), signal)
    if (auth.mode === "revoked") return later(60, () => json(403, { code: "session_not_found", message: "Session from session_id claim in JWT does not exist" }), signal)
    if (auth.mode === "503-twice") return later(60, () => (n < 2 ? json(503, { message: "upstream" }) : json(200, person)), signal)
    if (auth.mode === "hang-once" && n > 0) return later(60, () => json(200, person), signal)
    return never(signal)
  }
  if (path.startsWith("/rest/v1/")) {
    const table = path.slice(9)
    const accept = new Headers(init?.headers ?? req?.headers).get("accept") ?? ""
    const rows = table === "creators" ? [{ id: "c1" }] : []
    return later(20, () => (accept.includes("vnd.pgrst.object") ? (rows.length ? json(200, rows[0]) : json(406, { code: "PGRST116" })) : json(200, rows)), signal)
  }
  return json(404, {})
}) as typeof fetch
globalThis.fetch = standIn

/* One request: one cookie store object for its whole life, as Next keeps it. */
function holdRequest() {
  const jar = new Map([[COOKIE, cookieOf(token)]])
  const store = {
    getAll: () => [...jar].map(([name, value]) => ({ name, value })),
    get: (n: string) => (jar.has(n) ? { name: n, value: jar.get(n) } : undefined),
    set: (n: string, v: string) => void jar.set(n, v),
  }
  const headers = new Headers({ host: "storelib.com" })
  ;(globalThis as Record<string, unknown>).__PUSH_TEST_NEXT_HEADERS__ = { cookies: () => store, headers: () => headers }
}
/* The browser's fetch of a same-origin path: each is its own request to the real route. */
async function app(path: string, init?: RequestInit): Promise<Response> {
  sent.push({ url: path, method: init?.method ?? "GET" })
  holdRequest()
  if (path.startsWith("/api/analytics/destinations")) return (await destinationsGet()) as Response
  if (path.startsWith("/api/test-503")) return authUnavailableResponse()
  return json(404, {})
}
const reset = (mode: Mode) => { auth.mode = mode; auth.n = 0; auth.hits = 0 }

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f)
    return statSync(p).isDirectory() ? walk(p) : [p]
  })
}

async function main() {
  process.env.SUPABASE_JWT_SECRET = SECRET
  forgetSigningKeys()

  console.log("\n1. One Auth question per request, however many places ask")
  reset("ok")
  holdRequest()
  {
    const a = await currentUserForRequest()
    const b = await routeUser({ fresh: false })
    const c = await routeUser()
    const d = await readUserForRoute()
    check("page read, route read, route change and a raw read: all the user", a.user?.id === "u1" && b.kind === "user" && c.kind === "user" && d.data.user?.id === "u1", { a, b, c, d })
    /* Changed on purpose (r52): the token's signature is checked here first, so none of them asks Supabase Auth. */
    check(`  no /auth/v1/user call between them (${auth.hits}; was 1 in round 49, 3 before)`, auth.hits === 0, auth.hits)
    check("  verified by the token's signature", a.verifiedBy === "claims", a)
    const e = await routeUser({ fresh: true })
    check(`  a strict change asks Auth itself, once (${auth.hits})`, e.kind === "user" && auth.hits === 1, { e, hits: auth.hits })
  }
  holdRequest()
  await routeUser({ fresh: true })
  check("  the next request asks again (nothing kept between requests)", auth.hits === 2, auth.hits)

  console.log("\n2. Send analytics while Supabase Auth hangs (the screenshot)")
  reset("never")
  {
    const t = Date.now()
    const r = await requestJson<{ destinations?: unknown[]; error?: string }>("/api/analytics/destinations")
    const took = Date.now() - t
    check(`options shown, from the token's verified signature (${took}ms; was a 503 and "We could not check your sign in" after ~14s)`, r.ok && Array.isArray(r.data.destinations), r)
    check("  under 3.2s", took < 3_200, took)
    /* Changed on purpose (r52): was one Auth question. */
    check(`  no Auth question (${auth.hits})`, auth.hits === 0, auth.hits)
  }

  /* Changed on purpose (r52): "a change" here is a strict one (routeUser fresh: true); an ordinary change takes the signature. */
  console.log("\n3. A strict change stays strict, and asks Auth again before refusing")
  reset("never")
  holdRequest()
  {
    const plain = await routeUser()
    check("an ordinary change while Auth is silent: the user, from the signature", plain.kind === "user" && auth.hits === 0, { plain, hits: auth.hits })
    const t = Date.now()
    const w = await routeUser({ fresh: true })
    const took = Date.now() - t
    check(`Auth silent: unavailable, never the signature alone (${took}ms)`, w.kind === "unavailable", w)
    check(`  Auth asked three times in all, with pauses (${auth.hits})`, auth.hits === 3, auth.hits)
    check("  bounded (under 11s)", took < 11_000, took)
    const s = await strictUserForRequest()
    check("  the same request asks no more", auth.hits === 3 && s.state === "indeterminate", { hits: auth.hits, s })
  }
  reset("hang-once")
  holdRequest()
  {
    const t = Date.now()
    const w = await routeUser({ fresh: true })
    const took = Date.now() - t
    check(`Auth hangs once, then answers: the change goes through (${took}ms; was "unavailable" after 6.3s, the retry queued on the hung try's lock)`, w.kind === "user" && w.user.id === "u1", w)
    check("  verified by Auth, not by the signature", (await strictUserForRequest()).verifiedBy === "user")
  }
  reset("hang-once")
  holdRequest()
  {
    const r = await routeUser({ fresh: false })
    check("a read in the same outage: the user from the signature", r.kind === "user", r)
  }

  console.log("\n4. Auth's own no is final, for reads and changes")
  reset("revoked")
  holdRequest()
  {
    /* Changed on purpose (r52): Auth's no is final wherever Auth is asked: the strict routes and the full read. The ordinary read trusts the signed token until it expires (the JWT expiry setting bounds it). */
    const w = await routeUser({ fresh: true })
    check("revoked session: anonymous for a strict change, with no extra tries", w.kind === "anonymous" && auth.hits === 1, { w, hits: auth.hits })
    const f = await routeUser({ full: true })
    check("  and for the full read", f.kind === "anonymous", f)
    const r = await routeUser({ fresh: false })
    check("  an ordinary read: the signed token, until it expires", r.kind === "user", r)
  }
  token = forged
  reset("never")
  holdRequest()
  {
    const r = await routeUser({ fresh: false })
    check("a forged token while Auth hangs: never a user", r.kind !== "user", r)
  }
  token = good

  console.log("\n5. Without a local verifier: a read asks Auth again, with backoff")
  delete process.env.SUPABASE_JWT_SECRET
  forgetSigningKeys()
  check("verifierKind: none without the secret or public keys", (await verifierKind(URL_)) === "none")
  reset("503-twice")
  holdRequest()
  {
    const r = await readerForRequest()
    check("Auth 503 twice, then fine: the read gets the user", r.user?.id === "u1" && r.verifiedBy === "user", r)
  }
  reset("never")
  {
    const t = Date.now()
    const r = await requestJson<{ error?: string }>("/api/analytics/destinations")
    const took = Date.now() - t
    check(`Auth silent, nothing to check the token with: the 503's words, inside the read's 15s (${took}ms)`, r.status === 503 && took < 15_000, { status: r.status, took })
  }
  process.env.SUPABASE_JWT_SECRET = SECRET
  forgetSigningKeys()
  check("verifierKind: hs256 with the secret", (await verifierKind(URL_)) === "hs256")

  console.log("\n6. X-Storelib-Auth-Check: which check ran (never a key)")
  reset("never")
  holdRequest()
  {
    const res = (await authStateGet()) as Response
    const h = res.headers.get(AUTH_CHECK_HEADER)
    check(`/api/auth/state while Auth hangs: "${h}"`, h === "local; verifier=hs256", h)
  }
  reset("ok")
  holdRequest()
  {
    const res = (await authStateGet()) as Response
    /* Changed on purpose (r52): the signature is the first check, Auth fine or not. */
    check(`/api/auth/state, Auth fine: "${res.headers.get(AUTH_CHECK_HEADER)}"`, res.headers.get(AUTH_CHECK_HEADER) === "local; verifier=hs256")
    const body = JSON.stringify(await res.json())
    check("  the body is one word, no token or secret", !body.includes(SECRET) && !body.includes(good.split(".")[2]), body)
  }
  {
    const r = authUnavailableResponse()
    check("the 503 says none, and keeps its retry mark", r.headers.get(AUTH_CHECK_HEADER) === "none" && r.headers.get("X-Storelib-Auth") === "unavailable")
  }

  console.log("\n7. The browser: a read asks again quietly for about 10s, a change twice")
  check("read: three quiet tries, about 6s of waiting plus the requests themselves (about 10s)", AUTH_READ_RETRY_DELAYS_MS.length === 3 && AUTH_READ_RETRY_DELAYS_MS.reduce((a, b) => a + b, 0) >= 6_000)
  check("GET and HEAD use the read waits, POST the change waits", authRetryDelays("GET") === AUTH_READ_RETRY_DELAYS_MS && authRetryDelays(undefined) === AUTH_READ_RETRY_DELAYS_MS && authRetryDelays("POST") === AUTH_RETRY_DELAYS_MS)
  {
    sent.length = 0
    const t = Date.now()
    const r = await requestJson("/api/test-503")
    const gets = sent.filter((s) => s.url === "/api/test-503").length
    check(`a GET that keeps getting the marked 503: asked ${gets} times over ${Date.now() - t}ms, then its words`, gets === 4 && r.status === 503, { gets, took: Date.now() - t })
    sent.length = 0
    const w = await requestJson("/api/test-503", { method: "POST", json: { a: 1 } })
    const posts = sent.filter((s) => s.url === "/api/test-503").length
    check(`a POST: asked ${posts} times, as before`, posts === 3 && w.status === 503, posts)
  }

  console.log("\n8. Every read-only GET the dashboard panels use takes a page's answer; no change does")
  {
    const routes = walk("app/api").filter((f) => f.endsWith("route.ts"))
    const bad: string[] = []
    let reads = 0
    for (const f of routes) {
      /*
        Every lenient call is checked against the top level function it sits in:
        it must be the GET (or HEAD) handler itself. A helper a write calls
        (`async function write(...)` under POST, PUT, PATCH and DELETE) never
        takes it, even when it sits in the same file as a GET.
      */
      const lines = readFileSync(f, "utf8").split("\n")
      lines.forEach((line, i) => {
        if (!/\{ read: true\b|fresh: false|readUserForRoute\(\)/.test(line)) return
        let j = i
        while (j >= 0 && !/^(export |async function|function|const |type |let )/.test(lines[j])) j--
        const head = lines[j] ?? ""
        if (/^export (async )?function (GET|HEAD)\b|^export const (GET|HEAD)\b/.test(head)) reads++
        /* The two email confirmations read the token on purpose since wave 2 (lib/auth/route-user). */
        else if (!/app\/api\/auth\/(confirm-email|verify-email)\//.test(f)) bad.push(`${f}:${i + 1} in ${head.slice(0, 50)}`)
      })
    }
    check(`no POST, PUT, PATCH or DELETE takes the lenient answer (${reads} GETs do)`, bad.length === 0, bad)
    check("  over 90 lenient reads in GET handlers", reads > 90, reads)
    for (const f of ["app/api/analytics/destinations/route.ts", "app/api/analytics/own/token/route.ts", "app/api/store/markets/route.ts", "app/api/store/translations/route.ts", "app/api/analytics/reports/route.ts", "app/api/store/reviews-app/route.ts", "app/api/store/integrations/apps/route.ts", "app/api/integrations/popularity/route.ts", "app/api/website-builder/products/route.ts", "app/api/website-builder/themes/[installId]/agent-activity/route.ts"]) {
      const get = readFileSync(f, "utf8").split(/^export /m).find((b) => /^(?:async function|function) GET\b/.test(b)) ?? ""
      check(`  ${f}: GET reads leniently`, /\{ read: true\b|fresh: false|readUserForRoute\(\)/.test(get))
    }
    const panel = readFileSync("components/app/analytics/send-analytics.tsx", "utf8")
    check("Send analytics fetches through requestJson (quiet retries), with a Try again", /requestJson/.test(panel) && /data-destinations-failed/.test(panel) && !/await fetch\(input/.test(panel))
    const proxy = readFileSync("proxy.ts", "utf8")
    check("proxy sets X-Storelib-Auth-Check on /app with the verifier kind only", /AUTH_CHECK_HEADER, `proxy-\$\{how\}; verifier=\$\{await verifierKind/.test(proxy))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) { for (const f of failures) console.log(`  - ${f}`); process.exit(1) }
  process.exit(0)
}
main().catch((e) => { console.error(e); console.log(String(e)); process.exit(1) })
