import { createHmac } from "node:crypto"
/**
 * ===========================================================================
 *  WHEN SUPABASE IS SLOW, DOWN OR SAYS NO (round net-1028)
 * ===========================================================================
 * "Cannot reach the server" over /app/settings, and the logs of Oct 28 2026:
 * 300 second function timeouts beside fetch HeadersTimeoutError, "proxy auth
 * indeterminate" and 503s from the website builder. Each case here is one way
 * production goes wrong, and what must happen:
 *
 *   a request nobody answers      ends at its deadline (lib/net/deadline.ts)
 *   a network blip on a read      asked again, at most twice, with backoff
 *   500 / 502 / 503 / 504 / 429   a read asked again where safe; a write never
 *   auth expired or revoked       anonymous: the login form is right
 *   auth did not answer           the token's signature decides, or "could not tell"
 *   a failed read                 a ServiceUnavailable, never "no row"
 *   a deploy mismatch / offline   a section says which, and Reload only for a deploy
 *   logs                          one JSON line, no token, no email, an id
 *
 *   npx tsx --conditions=react-server tests/net-resilience.test.ts
 */
import { createServer } from "node:http"
import type { AddressInfo } from "node:net"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { DeadlineExceeded, backoffMs, deadlineFetch, deadlineFor, kindOf, READ_RETRIES, safePath } from "@/lib/net/deadline"
import { ServiceUnavailable, classifyServiceError, dataOrThrow, isServiceUnavailable } from "@/lib/net/service-error"
import { cleanRequestId, requestIdOf } from "@/lib/net/request-id"
import { logLine, sanitizeForLog } from "@/lib/net/log"
import { forgetSigningKeys, readCurrentUser } from "@/lib/auth/current-user"
import { sectionFailure } from "@/lib/client-errors"
import { mediaFetch } from "@/lib/storage/media-url"
import { hrefForLog, syncTargetOf } from "@/lib/auth/session-sync"
import { syncSessionHref } from "@/lib/auth/native-session"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${label}`)
  } else {
    failed++
    failures.push(label)
    console.log(`  FAIL  ${label}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ""}`)
  }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const json = (status: number, body: unknown = {}, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } })

/** A fetch that answers from a list, counting every call. */
function scripted(answers: Array<Response | Error>) {
  const calls: Array<{ url: string; method: string }> = []
  const f = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), method: (init?.method ?? "GET").toUpperCase() })
    const next = answers[Math.min(calls.length - 1, answers.length - 1)]
    if (next instanceof Error) throw next
    return next.clone()
  }) as typeof fetch
  return { f, calls }
}

const REST = "https://abc.supabase.co/rest/v1/products?select=id&email=a%40b.c"

async function run() {
  console.log("\n1. Every request to Supabase has a deadline, by what it is")
  check("auth, reads, writes, RPCs and uploads each have their own", kindOf("https://x.supabase.co/auth/v1/user", "GET") === "auth" && kindOf(REST, "GET") === "read" && kindOf(REST, "POST") === "write" && kindOf("https://x.supabase.co/rest/v1/rpc/f", "POST") === "rpc" && kindOf("https://x.supabase.co/storage/v1/object/b/p", "POST") === "storage-write")
  check("  every one of them far short of Vercel's 300s", ["auth", "read", "write", "rpc", "storage-read", "functions", "other"].every((k) => {
    const ms = deadlineFor(k === "auth" ? "https://x/auth/v1/user" : k === "rpc" ? "https://x/rest/v1/rpc/f" : k === "storage-read" ? "https://x/storage/v1/object/b" : k === "functions" ? "https://x/functions/v1/f" : k === "other" ? "https://x/y" : "https://x/rest/v1/t", k === "write" || k === "rpc" ? "POST" : "GET", false)
    return typeof ms === "number" && ms > 0 && ms <= 120_000
  }))
  check("  a person's upload from the browser is not cut off by ours", deadlineFor("https://x.supabase.co/storage/v1/object/b/p", "POST", true) === null)

  /* A real server that takes the request and never answers: what undici waits 300s for. */
  const server = createServer((req) => {
    void req
    /* no answer, ever */
  })
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r))
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  const t0 = Date.now()
  let ended: unknown = null
  try {
    await deadlineFetch(`${base}/rest/v1/products`, { method: "POST", body: "{}" }, { ms: 300 })
  } catch (e) {
    ended = e
  }
  const took = Date.now() - t0
  check("a request that is never answered ends at its deadline, not at 300s", took < 1500 && !!ended, { took })
  check("  and says it was the deadline", (ended as { name?: string } | null)?.name === "DeadlineExceeded" || /DeadlineExceeded|abort/i.test(String((ended as Error)?.message ?? ended)), String(ended))
  const caller = new AbortController()
  const t1 = Date.now()
  const leaving = deadlineFetch(`${base}/auth/v1/user`, { signal: caller.signal }, { ms: 5_000 }).catch((e) => e)
  setTimeout(() => caller.abort(), 100)
  await leaving
  check("  the caller's own signal still ends it first", Date.now() - t1 < 1000)
  server.closeAllConnections?.()
  server.close()
  check("the deadline's message names the host and path, never the query", !new DeadlineExceeded(REST, 1000).message.includes("email") && safePath(REST) === "abc.supabase.co/rest/v1/products")

  console.log("\n2. A read that hit a blip is asked again; a write never")
  {
    const net = scripted([new TypeError("fetch failed"), json(200, [{ id: 1 }])])
    const r = await deadlineFetch(REST, undefined, { base: net.f })
    check("transient network loss on a read: asked again and answered", r.status === 200 && net.calls.length === 2)
  }
  for (const status of [500, 502, 503, 504]) {
    const s = scripted([json(status), json(200)])
    const r = await deadlineFetch("https://abc.supabase.co/auth/v1/user", undefined, { base: s.f })
    const retried = status !== 500
    check(`  ${status} on a read: ${retried ? "asked again" : "handed back (a 500 is an answer, not a blip)"}`, retried ? r.status === 200 && s.calls.length === 2 : r.status === 500 && s.calls.length === 1, { status: r.status, calls: s.calls.length })
  }
  {
    const s = scripted([json(503)])
    const r = await deadlineFetch(REST, undefined, { base: s.f })
    check(`  bounded: at most ${READ_RETRIES} more tries, then the 503 is handed back`, r.status === 503 && s.calls.length === READ_RETRIES + 1, s.calls.length)
  }
  {
    const s = scripted([json(429, {}, { "retry-after": "0" }), json(200)])
    const r = await deadlineFetch(REST, undefined, { base: s.f })
    check("  429 with a short Retry-After: asked again", r.status === 200 && s.calls.length === 2)
    const long = scripted([json(429, {}, { "retry-after": "30" }), json(200)])
    const r2 = await deadlineFetch(REST, undefined, { base: long.f })
    check("  429 asking for 30s: handed back at once, not waited out", r2.status === 429 && long.calls.length === 1)
  }
  for (const method of ["POST", "PATCH", "DELETE"]) {
    const s = scripted([new TypeError("fetch failed"), json(200)])
    let threw = false
    try {
      await deadlineFetch(REST, { method, body: method === "DELETE" ? undefined : "{}" }, { base: s.f })
    } catch {
      threw = true
    }
    const s2 = scripted([json(503), json(200)])
    const r = await deadlineFetch(REST, { method, body: "{}" }, { base: s2.f })
    check(`no duplicate writes: a ${method} is sent once, on a network error and on a 503`, threw && s.calls.length === 1 && r.status === 503 && s2.calls.length === 1)
  }
  {
    const s = scripted([new TypeError("fetch failed"), json(200)])
    let threw = false
    try {
      await deadlineFetch("https://abc.supabase.co/rest/v1/rpc/place_order", { method: "POST", body: "{}" }, { base: s.f })
    } catch {
      threw = true
    }
    check("  an RPC (an order, a payment) is never repeated either", threw && s.calls.length === 1)
  }
  check("backoff grows and has jitter", backoffMs(0, () => 0) === 200 && backoffMs(1, () => 0) === 400 && backoffMs(1, () => 1) === 600)
  {
    const realFetch = globalThis.fetch
    let calls = 0
    globalThis.fetch = (async () => {
      calls++
      return calls === 1 ? json(502) : json(200, [])
    }) as typeof fetch
    const r = await mediaFetch("https://abc.supabase.co/rest/v1/products?select=id")
    check("every Supabase client's fetch (mediaFetch) asks a read again after a 502", r.status === 200 && calls === 2, calls)
    calls = 0
    globalThis.fetch = (async () => {
      calls++
      return json(502)
    }) as typeof fetch
    const w = await mediaFetch("https://abc.supabase.co/rest/v1/orders", { method: "POST", body: "{}" })
    check("  and never a write", w.status === 502 && calls === 1, calls)
    globalThis.fetch = realFetch
  }

  console.log("\n3. A failed read is not a missing row")
  check("an abort or a deadline reads as a timeout", classifyServiceError({ message: "DeadlineExceeded: x took longer than 20s" }) === "timeout" && classifyServiceError({ message: "AbortError: This operation was aborted" }) === "timeout")
  check("  HeadersTimeoutError too", classifyServiceError({ message: "TypeError: fetch failed", name: "HeadersTimeoutError" }) === "timeout")
  check("  a dropped connection as network", classifyServiceError({ message: "TypeError: fetch failed" }) === "network")
  check("  a 5xx or a 429 as upstream", classifyServiceError({ message: "x" }, 503) === "upstream" && classifyServiceError({ message: "x" }, 429) === "upstream")
  check("  a bad column as the query's own fault, not a blip", classifyServiceError({ message: "column x does not exist", code: "42703" }, 400) === "query" && !new ServiceUnavailable("w", "query").transient)
  check("no row is still null", dataOrThrow("creator", { data: null, error: null }) === null)
  let thrown: unknown = null
  try {
    dataOrThrow("creator", { data: null, error: { message: "TypeError: fetch failed", code: "" }, status: 0 })
  } catch (e) {
    thrown = e
  }
  check("  a failed read throws ServiceUnavailable, with its kind", isServiceUnavailable(thrown) && (thrown as ServiceUnavailable).kind === "network" && (thrown as ServiceUnavailable).where === "creator")

  console.log("\n4. Who is signed in, when Auth is slow, down or says no")
  const realFetch = globalThis.fetch
  const user = { id: "u1", email: "a@b.c", aud: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "" }
  const fake = (getUser: () => Promise<unknown>, getClaims: () => Promise<unknown> = async () => ({ data: null, error: new Error("no") })) =>
    ({ auth: { getUser, getClaims } }) as unknown as Parameters<typeof readCurrentUser>[0]
  const never = () => new Promise<never>(() => {})
  check("a user: authenticated, verified by Auth", (await readCurrentUser(fake(async () => ({ data: { user }, error: null })))).verifiedBy === "user")
  for (const code of ["session_expired", "refresh_token_already_used", "session_not_found"]) {
    const c = await readCurrentUser(fake(async () => ({ data: { user: null }, error: { code, status: 400, message: code } })), { fallbackClaims: "https://abc.supabase.co" })
    check(`auth expired (${code}): anonymous, and the token is not asked instead`, c.state === "anonymous" && !c.user)
  }
  {
    const c = await readCurrentUser(fake(async () => ({ data: { user: null }, error: { status: 401, message: "invalid" } })))
    check("  a 401 from Auth: anonymous", c.state === "anonymous")
  }
  {
    const c = await readCurrentUser(fake(async () => ({ data: { user: null }, error: { name: "AuthRetryableFetchError", status: 503, message: "x" } })), { retries: 1 })
    check("a 503 from Auth with no fallback: could not tell, never signed out", c.state === "indeterminate" && !c.user)
  }
  {
    const t = Date.now()
    const c = await readCurrentUser(fake(never), { timeoutMs: 100, retries: 1 })
    check("  Auth not answering: could not tell, in about two ceilings", c.state === "indeterminate" && c.reason === "timed out" && Date.now() - t < 1500)
  }
  /*
    Round rel3-auth: the fallback reads the token (getSession), asks Auth about it (getUser(jwt), no lock), and when
    Auth does not answer checks the token here (lib/auth/verify-token.ts). The project signs with the shared secret,
    so the check is HS256 with SUPABASE_JWT_SECRET; tests/auth-hs256-outage.test.ts drives the real client.
  */
  const SECRET = "net-resilience-secret-0123456789abcdef0123"
  const hs = (payload: Record<string, unknown>, secret = SECRET) => {
    const h = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url")
    const p = Buffer.from(JSON.stringify(payload)).toString("base64url")
    return `${h}.${p}.${createHmac("sha256", secret).update(`${h}.${p}`).digest("base64url")}`
  }
  const tokenClaims = { sub: "u1", email: "a@b.c", user_metadata: { full_name: "A" }, role: "authenticated", aud: "authenticated", iss: "https://abc.supabase.co/auth/v1", exp: Math.floor(Date.now() / 1000) + 3600 }
  const withToken = (token: string, getUser: () => Promise<unknown>) =>
    ({ auth: { getUser, getSession: async () => ({ data: { session: { access_token: token } }, error: null }) } }) as unknown as Parameters<typeof readCurrentUser>[0]
  forgetSigningKeys()
  process.env.SUPABASE_JWT_SECRET = SECRET
  globalThis.fetch = (async () => json(200, { keys: [] })) as typeof fetch
  {
    const c = await readCurrentUser(withToken(hs(tokenClaims), never), { timeoutMs: 100, firstTryMs: 100, fallbackClaims: "https://abc.supabase.co" })
    check("Auth not answering, token signature checks out: signed in, verified by the claims", c.state === "authenticated" && c.verifiedBy === "claims" && c.user?.id === "u1" && c.user?.email === "a@b.c" && (c.user?.user_metadata as { full_name?: string })?.full_name === "A")
  }
  {
    const c = await readCurrentUser(withToken(hs(tokenClaims, "another-secret-entirely-0123456789abcdef"), never), { timeoutMs: 100, firstTryMs: 100, fallbackClaims: "https://abc.supabase.co" })
    check("  a token that fails the check is never a user", c.state === "indeterminate" && !c.user)
  }
  delete process.env.SUPABASE_JWT_SECRET
  forgetSigningKeys()
  {
    const c = await readCurrentUser(withToken(hs(tokenClaims), never), { timeoutMs: 100, retries: 0, fallbackClaims: "https://abc.supabase.co" })
    check("  the shared secret not set (and no public keys): no fallback, could not tell", c.state === "indeterminate" && !c.user)
  }
  forgetSigningKeys()
  globalThis.fetch = realFetch

  console.log("\n5. A section that fails says which way")
  const chunk = new Error("Failed to load chunk /_next/static/chunks/abc.js from module 1")
  const timeout = Object.assign(new Error("settings section taxes code took longer than 8s"), { name: "SettingsCodeTimeout" })
  check("code that never came: slow, Try again", sectionFailure(timeout, true) === "slow")
  check("deploy mismatch (a chunk a deploy removed): stale, Reload", sectionFailure(chunk, true) === "stale")
  check("  Safari's 'Load failed' is stale only once a newer deploy is known", sectionFailure(new Error("Load failed"), true, true) === "stale" && sectionFailure(new Error("Load failed"), true, false) === "fault")
  check("offline: never Reload, whatever the error", sectionFailure(chunk, false) === "offline" && sectionFailure(timeout, false) === "offline")
  check("a section that threw for itself: fault", sectionFailure(new TypeError("x is undefined"), true) === "fault")

  console.log("\n6. Logs: one id per request, nothing private")
  check("a client's id is kept only when it looks like one", cleanRequestId("iad1::abcd-1234") === "iad1::abcd-1234" && cleanRequestId("x\n{\"evt\":\"forged\"}") === null && cleanRequestId("short") === null)
  check("  else Vercel's own id, else a new one", requestIdOf(new Headers({ "x-vercel-id": "iad1::xyz-123456" })) === "iad1::xyz-123456" && requestIdOf(new Headers()).length >= 8)
  const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1MSIsImV4cCI6MX0.abcdefghijklmnop"
  const line = logLine("t", { a: `token ${jwt} for ann@shop.se at /x?access_token=secret&next=/app`, n: 3 })
  check("a log line has no token, no email and no query values", !line.includes(jwt) && !line.includes("ann@shop.se") && !line.includes("secret") && JSON.parse(line).n === 3, line)
  check("  sanitizeForLog caps length", sanitizeForLog("x".repeat(1000)).length === 200)

  console.log("\n7. Wired where it matters")
  const proxy = read("proxy.ts")
  /* Round 50: deadlineFetch under watchRenewals (lib/auth/renewal-watch.ts), which only counts renewals. */
  check("the proxy's session client fetches with a deadline", /watchRenewals\(deadlineFetch\)/.test(proxy) && /createServerClient\(supabaseUrl, supabaseAnonKey, \{[\s\S]{0,700}global: \{ fetch: renewalWatch\.fetch \}/.test(proxy))
  check("  and every other client in the proxy ends in 5s", (proxy.match(/createClient\(/g) ?? []).length === (proxy.match(/createClient\([^)]*PROXY_DB/g) ?? []).length && /PROXY_READ_MS = 5_000/.test(proxy))
  check("  the proxy sends the request id on and back", /request\.headers\.set\(REQUEST_ID_HEADER, rid\)/.test(proxy) && /res\.headers\.set\(REQUEST_ID_HEADER, rid\)/.test(proxy))
  const layout = read("app/(storelib)/app/layout.tsx")
  /* Changed on purpose (round 42 merge fixes): the batch is inline in the layout again, keyed by user.id. */
  check("the /app shell decides its gates from reads that throw on failure", /profileOrThrowForRequest\((userId|user\.id)\)/.test(layout) && /creatorOrThrowForRequest\((userId|user\.id)\)/.test(layout) && /* Changed on purpose (r53): a failed or slow read is never the whole page screen; the kept rows stand in, else the shell draws from the session and no gate is decided (tests/app-resilience-r53.test.ts). */ /if \(isServiceUnavailable\(e\)\) return TIMED_OUT/.test(layout) && !/<ServiceUnavailable/.test(layout))
  const settings = read("app/(storelib)/app/settings/_server.ts")
  check("Settings never sends a seller to /onboarding for a read that failed", /dataOrThrow\("settings creator", creatorRead\)/.test(settings) && /dataOrThrow\("settings profile", profileRead\)/.test(settings) && /<ServiceUnavailable inline \/>/.test(read("app/(storelib)/app/settings/_view.tsx")))
  const gate = read("components/native-auth-gate.tsx")
  check("recovery posts the tokens, never puts them in an address", /postSessionSync\(session, currentPath\)/.test(gate) && !/access_token=\$\{/.test(gate))
  const sync = read("app/(storelib)/auth/sync-session/route.ts")
  check("sync-session takes a same origin POST", /export async function POST/.test(sync) && /from !== origin/.test(sync))
  check("  and a Supabase that did not answer goes back, not to /login", /if \(!classifyAuthError\(error\)\.signedOut\) \{[\s\S]{0,300}NextResponse\.redirect\(`\$\{origin\}\$\{next\}`, status\)/.test(sync))
  console.log("\n8. Every native sign in posts its tokens, none puts them in an address")
  const href = syncSessionHref({ access_token: "a.b.c", refresh_token: "r1" }, "/auth/continue?intent=sell")
  const target = syncTargetOf(href)
  check("a sync-session destination is read back as a post's fields", target?.access_token === "a.b.c" && target?.refresh_token === "r1" && target?.next === "/auth/continue?intent=sell")
  check("  any other destination is navigated to as before", syncTargetOf("/app") === null && syncTargetOf("/auth/sync-session?next=/app") === null)
  check("  and a log line of it names no token", !hrefForLog(href).includes("r1") && !hrefForLog(href).includes("a.b.c"))
  for (const [f, re] of [
    ["lib/native-oauth.ts", /goToAuthHref\(nextUrl\)/],
    ["lib/auth/continue-client.ts", /goToAuthHref\(afterAuthUrl\(carry, session, native\), \{ replace: true \}\)/],
    ["components/auth/viewer-sync.tsx", /goToAuthHref\(syncSessionHref\(/],
    ["app/(storelib)/(auth)/login/page.tsx", /goToAuthHref\(sheet\.href\)/],
    ["app/(storelib)/(auth)/signup/page.tsx", /goToAuthHref\(sheet\.href\)/],
  ] as const) {
    const src = read(f)
    check(`${f} goes through goToAuthHref, never location.assign of a sync address`, re.test(src) && !/location\.(assign|replace)\((nextUrl|sheet\.href|syncSessionHref|afterAuthUrl)/.test(src))
  }
  check("the native log line names no token", /hrefForLog\(nextUrl\)/.test(read("lib/native-oauth.ts")) && !/destination: \$\{nextUrl\}/.test(read("lib/native-oauth.ts")))
  const health = read("app/api/health/route.ts")
  check("/api/health answers within its own deadline, with the build", /abortSignal\(AbortSignal\.timeout\(HEALTH_DB_MS\)\)/.test(health) && /build,/.test(health))
  const lazy = read("components/app/settings/lazy-panels.tsx")
  check("a Settings section's code is waited for at most CODE_WAIT_MS", /export const CODE_WAIT_MS = 8_000/.test(lazy) && /return within\(/.test(lazy))
  check("  and a press shows the section's spinner, not the section before, while it comes", /setPanelTab\(activeTab\)\s*\}, CODE_SLOW_MS\)/.test(read("components/app/settings-form-new.tsx")))
  check("Plan's own read has a deadline", /fetchWithDeadline\("\/api\/billing\/overview"/.test(read("components/app/settings-form-new.tsx")))

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) {
    console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
    process.exit(1)
  }
}

run().catch((e) => {
  console.error(e)
  process.exit(1)
})
