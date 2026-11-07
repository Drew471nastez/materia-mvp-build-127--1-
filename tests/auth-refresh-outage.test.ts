/**
 * ===========================================================================
 *  AN AUTH OUTAGE DURING A TOKEN REFRESH DOES NOT SIGN ANYBODY OUT
 * ===========================================================================
 * Round rel-security (F3). @supabase/auth-js 2.87.3 removes the stored
 * session when a refresh fails with anything but a thrown fetch or a
 * 502/503/504: a 500 or a 429 from /auth/v1/token signed people out at random
 * during an Auth incident. lib/net/deadline.ts deadlineFetch, which every
 * Supabase client in the app fetches through (proxy, server, browser and the
 * app), hands those to the library as a 503.
 *
 * This suite drives the REAL GoTrue client (AuthClient from
 * @supabase/supabase-js, the version in pnpm-lock.yaml) with a stub fetch
 * underneath deadlineFetch and an expired stored session, and reads what is
 * left in storage afterwards.
 */
import { AuthClient, isAuthRetryableFetchError } from "@supabase/supabase-js"
import { AUTH_BREAKER, deadlineFetch, isRefreshTokenRequest, refreshOutageAsRetryable } from "@/lib/net/deadline"
import { breakerFor, isCircuitOpen, resetBreakers } from "@/lib/net/breaker"
import { readCode } from "./_source"

let passed = 0
let failed = 0
const failures: string[] = []
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    failures.push(name)
    console.log(`  FAIL  ${name}${detail === undefined ? "" : `\n        ${JSON.stringify(detail)?.slice(0, 400)}`}`)
  }
}
const section = (name: string) => console.log(`\n${name}`)

const URL_BASE = "https://project.supabase.co/auth/v1"
const KEY = "sb-project-auth-token"
const realNow = Date.now.bind(Date)
let skew = 0
/* The library retries a retryable refresh until 30 seconds have passed on its clock; each stub answer moves that clock on 11 seconds so a run takes a moment. */
Date.now = () => realNow() + skew

function memoryStorage() {
  const m = new Map<string, string>()
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), m }
}

const user = { id: "11111111-1111-4111-8111-111111111111", aud: "authenticated", role: "authenticated", email: "a@example.com", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" }

function expiredSession() {
  const now = Math.floor(realNow() / 1000)
  return { access_token: "old-access", refresh_token: "old-refresh", token_type: "bearer", expires_in: 3600, expires_at: now - 120, user }
}

type Answer = { status: number; body: unknown }

async function run(answers: Answer[], { shim = true }: { shim?: boolean } = {}) {
  const storage = memoryStorage()
  storage.setItem(KEY, JSON.stringify(expiredSession()))
  const calls: string[] = []
  const stub = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url
    calls.push(`${(init?.method ?? "GET").toUpperCase()} ${url}`)
    skew += 11_000
    const a = answers[Math.min(calls.length - 1, answers.length - 1)]
    return new Response(JSON.stringify(a.body), { status: a.status, headers: { "content-type": "application/json" } })
  }) as typeof fetch
  const client = new AuthClient({
    url: URL_BASE,
    storageKey: KEY,
    storage,
    autoRefreshToken: false,
    persistSession: true,
    detectSessionInUrl: false,
    fetch: shim ? ((i: RequestInfo | URL, init?: RequestInit) => deadlineFetch(i, init, { base: stub })) as typeof fetch : stub,
  })
  const { data, error } = await client.getSession()
  skew = 0
  const stored = storage.getItem(KEY)
  return { data, error, stored: stored ? JSON.parse(stored) : null, calls }
}

const refreshed = { access_token: "new-access", refresh_token: "new-refresh", token_type: "bearer", expires_in: 3600, expires_at: Math.floor(realNow() / 1000) + 3600, user }

async function main() {
  section("THE BUG, without the shim: the library forgets the session on a 500")
  {
    const r = await run([{ status: 500, body: { message: "Internal Server Error" } }], { shim: false })
    check("a plain 500 from the refresh removes the stored session (what this round fixes)", r.stored === null && !!r.error && !isAuthRetryableFetchError(r.error), { stored: r.stored, error: String(r.error) })
  }

  section("WITH the shim: an outage keeps the session")
  for (const status of [500, 429, 502, 504]) {
    const r = await run([{ status, body: { message: "Auth is having a moment" } }])
    check(`${status} on the refresh: the session stays in storage`, r.stored?.refresh_token === "old-refresh", r.stored)
    check(`  and the error is retryable, never a sign out`, !!r.error && isAuthRetryableFetchError(r.error), String(r.error))
    check(`  the refresh was what was asked`, r.calls.length >= 1 && r.calls.every((c) => c.startsWith("POST ") && c.includes("grant_type=refresh_token")), r.calls)
  }
  {
    const r = await run([{ status: 500, body: {} }, { status: 200, body: refreshed }])
    check("a 500 then an answer: the library tries again and the new tokens are kept", r.stored?.access_token === "new-access" && !r.error && r.data.session?.access_token === "new-access", r.calls)
  }

  section("CONTROL: a refresh token Auth refused still signs out")
  {
    const r = await run([{ status: 400, body: { code: "refresh_token_already_used", error: "invalid_grant", error_description: "Invalid Refresh Token: Already Used" } }])
    check("400 refresh_token_already_used removes the session, as before", r.stored === null && !!r.error && !isAuthRetryableFetchError(r.error), String(r.error))
  }

  section("ONLY the refresh is touched")
  {
    const res500 = () => new Response("{}", { status: 500 })
    check("a sign in's 500 is handed back as it is", refreshOutageAsRetryable(`${URL_BASE}/token?grant_type=password`, "POST", res500()).status === 500)
    check("a code exchange's 500 is handed back as it is", refreshOutageAsRetryable(`${URL_BASE}/token?grant_type=pkce`, "POST", res500()).status === 500)
    check("a database read's 500 is handed back as it is", refreshOutageAsRetryable("https://project.supabase.co/rest/v1/orders?select=id", "GET", res500()).status === 500)
    check("a 400 on the refresh is handed back as it is", refreshOutageAsRetryable(`${URL_BASE}/token?grant_type=refresh_token`, "POST", new Response("{}", { status: 400 })).status === 400)
    check("the refresh is recognised by its grant, not its path alone", isRefreshTokenRequest(`${URL_BASE}/token?grant_type=refresh_token`, "POST") && !isRefreshTokenRequest(`${URL_BASE}/token?grant_type=refresh_token`, "GET"))
  }

  section("WIRING: every Supabase client fetches through deadlineFetch")
  check("the server client (mediaFetch)", /global: \{ fetch: mediaFetch \}/.test(readCode("lib/supabase/server.ts")))
  check("the browser and app client (mediaFetch)", (readCode("lib/supabase/client.ts").match(/global: \{ fetch: mediaFetch \}/g) ?? []).length >= 1)
  check("mediaFetch is deadlineFetch for auth", /if \(!url\.includes\("\/rest\/v1\/"\)\) return deadlineFetch\(input, init\)/.test(readCode("lib/storage/media-url.ts")))
  /* Round 50: through watchRenewals, which is deadlineFetch underneath and only counts renewals. */
  check("the proxy's session client", /watchRenewals\(deadlineFetch\)/.test(readCode("proxy.ts")) && /global: \{ fetch: renewalWatch\.fetch \}/.test(readCode("proxy.ts")))

  Date.now = realNow

  section("Round AL: Auth that does not answer is not waited on by every request")
  {
    /* Our deadline's timer is unref'd (never what keeps a process alive): this one keeps the test alive while it runs. */
    const alive = setInterval(() => {}, 1000)
    resetBreakers()
    let asked = 0
    const hang = (async (_i: RequestInfo | URL, init?: RequestInit) => {
      asked++
      /* Never answers: only our deadline ends it. */
      await new Promise((_, reject) => init?.signal?.addEventListener("abort", () => reject(init.signal!.reason), { once: true }))
      return new Response(null)
    }) as typeof fetch
    const user = `${URL_BASE}/user`
    for (let i = 0; i < AUTH_BREAKER.failures; i++) await deadlineFetch(user, { method: "GET" }, { base: hang, ms: 20, retry: false }).catch(() => null)
    const began = realNow()
    let refused: unknown = null
    await deadlineFetch(user, { method: "GET" }, { base: hang, ms: 20, retry: false }).catch((e) => (refused = e))
    check("after four requests with no answer, the next fails at once without asking", asked === AUTH_BREAKER.failures && isCircuitOpen(refused) && realNow() - began < 15, { asked, refused: String(refused) })
    resetBreakers()
    let quick = 0
    const fiveHundred = (async () => { quick++; return new Response("{}", { status: 500 }) }) as typeof fetch
    for (let i = 0; i < 8; i++) await deadlineFetch(user, { method: "GET" }, { base: fiveHundred, retry: false })
    check("a 5xx is an answer: it never opens the breaker, the library's own retries keep going", quick === 8 && breakerFor("supabase-auth").state === "closed")
    let rest = 0
    const restHang = (async (_i: RequestInfo | URL, init?: RequestInit) => {
      rest++
      await new Promise((_, reject) => init?.signal?.addEventListener("abort", () => reject(init.signal!.reason), { once: true }))
      return new Response(null)
    }) as typeof fetch
    for (let i = 0; i < 6; i++) await deadlineFetch("https://project.supabase.co/rest/v1/products", { method: "GET" }, { base: restHang, ms: 20, retry: false }).catch(() => null)
    check("only Auth has it: a database read is still asked every time", rest === 6)
    resetBreakers()
    clearInterval(alive)
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) {
    console.log(failures.map((f) => `  - ${f}`).join("\n"))
    process.exit(1)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
