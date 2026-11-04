/**
 * ===========================================================================
 *  "WE COULD NOT CHECK YOUR SIGN IN" AND "CANNOT REACH THE SERVER", ONLY LAST
 * ===========================================================================
 * Round rel3-auth. Both appeared on the first failure. Now:
 *   requestJson   a 503 marked X-Storelib-Auth (the route refused before
 *                 doing anything) is asked again twice, with jitter, inside
 *                 the request's own deadline; other 503s are not
 *   the gate      three quiet tries over ~6s before the screen; while it is
 *                 up, ten background tries 2s..30s apart, and the page put
 *                 back by itself when GET /api/auth/state says signed in
 * The real requestJson, the real backoff helpers, the real authUnavailable
 * response and the real /api/auth/state handler (with Auth hanging and the
 * token checked by its HS256 signature).
 */
import { createHmac } from "node:crypto"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { requestJson } from "@/lib/net/request"
import { AUTH_UNAVAILABLE_HEADER, BACKGROUND_CAP_MS, BACKGROUND_MAX_TRIES, PRE_SCREEN_DELAYS_MS, backgroundDelayMs, retryQuietly } from "@/lib/auth/recovery-backoff"
import { authUnavailableResponse } from "@/lib/auth/route-user"
import { GET as authState } from "@/app/api/auth/state/route"
import { forgetSigningKeys } from "@/lib/auth/verify-token"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; failures.push(label); console.log(`  FAIL  ${label}${detail !== undefined ? ` — ${JSON.stringify(detail)?.slice(0, 300)}` : ""}`) }
}
console.warn = () => {}
console.error = () => {}

const authDown = () => new Response(JSON.stringify({ error: "We could not check your sign in just now. Try again in a moment.", retry: true }), { status: 503, headers: { "content-type": "application/json", [AUTH_UNAVAILABLE_HEADER]: "unavailable" } })
const ok = () => new Response(JSON.stringify({ fine: true }), { status: 200, headers: { "content-type": "application/json" } })

async function main() {
  console.log("\n1. requestJson and a 503 that says Auth did not answer")
  {
    const res = authUnavailableResponse()
    check("authUnavailableResponse carries the marker", res.status === 503 && res.headers.get(AUTH_UNAVAILABLE_HEADER) === "unavailable")
  }
  {
    let n = 0
    globalThis.fetch = (async () => (++n < 3 ? authDown() : ok())) as typeof fetch
    const t = Date.now()
    const r = await requestJson<{ fine?: boolean }>("/api/store/integrations")
    check(`two refusals then an answer: ok, ${n} requests, ${Date.now() - t}ms`, r.ok && r.data.fine === true && n === 3 && Date.now() - t < 6_000, { r, n })
  }
  {
    let n = 0
    globalThis.fetch = (async () => (n++, authDown())) as typeof fetch
    const r = await requestJson("/api/x", { json: { a: 1 } })
    check(`a change refused every time: three requests, then the message (${n})`, !r.ok && r.status === 503 && n === 3 && /could not check your sign in/.test(String(r.data.error)), { n, r })
  }
  {
    let n = 0
    globalThis.fetch = (async () => (n++, new Response("{}", { status: 503 }))) as typeof fetch
    await requestJson("/api/x")
    /* Changed on purpose (round 50): a read gets one quiet retry on a 502, 503 or 504 (lib/net/request READ_RETRY_STATUSES), never the auth loop's three. */
    check("an ordinary 503 on a read is asked again once, not by the auth loop", n === 2, n)
    let m = 0
    globalThis.fetch = (async () => (m++, new Response("{}", { status: 503 }))) as typeof fetch
    await requestJson("/api/x", { json: { a: 1 } })
    check("an ordinary 503 on a change is not asked again here", m === 1, m)
  }
  {
    let n = 0
    globalThis.fetch = (async () => (n++, authDown())) as typeof fetch
    const t = Date.now()
    await requestJson("/api/x", { timeoutMs: 1_000 })
    check("never past the request's own deadline", Date.now() - t < 1_500 && n === 1, { n, took: Date.now() - t })
  }

  console.log("\n2. The backoff: quiet, capped, jittered")
  {
    const waits: number[] = []
    let tries = 0
    const back = await retryQuietly(async () => ++tries === 2, { sleep: async (ms) => void waits.push(ms), random: () => 0.5 })
    check("stops at the first try that works", back && tries === 2 && waits.length === 2)
  }
  {
    const waits: number[] = []
    const back = await retryQuietly(async () => false, { sleep: async (ms) => void waits.push(ms), random: () => 1 })
    const total = waits.reduce((a, b) => a + b, 0)
    check(`three quiet tries over about six seconds (${total}ms at most)`, !back && waits.length === PRE_SCREEN_DELAYS_MS.length && total >= 5_000 && total <= 7_000, waits)
  }
  {
    const all = Array.from({ length: BACKGROUND_MAX_TRIES }, (_, i) => backgroundDelayMs(i, () => 1))
    const low = Array.from({ length: BACKGROUND_MAX_TRIES }, (_, i) => backgroundDelayMs(i, () => 0))
    check("background: doubling from 2s, capped at 30s (plus jitter)", low[0] === 2_000 && low[1] === 4_000 && Math.max(...all) <= BACKGROUND_CAP_MS * 1.25, all)
    const total = all.reduce((a, b) => a + b, 0)
    check(`background: ends (ten tries, ${Math.round(total / 1000)}s at most)`, BACKGROUND_MAX_TRIES === 10 && total < 5 * 60_000)
  }

  console.log("\n3. The gate uses them")
  {
    const gate = readFileSync(join(process.cwd(), "components/native-auth-gate.tsx"), "utf8")
    check("tries exhausted: asks the server quietly before the screen", /recoveryCount\(\) >= MAX_RECOVERIES\)[\s\S]{0,600}retryQuietly\(async \(\) => \(await askServerState\(\)\) === "authenticated"/.test(gate))
    check("a renewal that failed is asked again quietly before the screen", /if \(!session && !isSignedOutAnswer\(false, error\)\) \{\s*await retryQuietly/.test(gate))
    check("while shown: background tries, capped, put back by itself", /attempt >= BACKGROUND_MAX_TRIES/.test(gate) && /backgroundDelayMs\(attempt\+\+\)/.test(gate) && /state === "authenticated"[\s\S]{0,80}window\.location\.reload\(\)/.test(gate))
    check("  no hot loop (no setInterval in the recovery)", !/setInterval\([^)]*askServerState/.test(gate))
    check("  the sync from the background at most once per screen", /!synced && hasStoredSessionToken\(\)/.test(gate) && /synced = true/.test(gate))
  }

  console.log("\n4. GET /api/auth/state while Auth hangs")
  {
    const URL_ = "https://abcd.supabase.co"
    const SECRET = "test-secret-only-for-this-suite-0123456789abcdef"
    process.env.NEXT_PUBLIC_SUPABASE_URL = URL_
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon"
    process.env.SUPABASE_JWT_SECRET = SECRET
    forgetSigningKeys()
    const now = Math.floor(Date.now() / 1000)
    const b = (s: string) => Buffer.from(s).toString("base64url")
    const h = b(JSON.stringify({ alg: "HS256", typ: "JWT" }))
    const p = b(JSON.stringify({ sub: "u1", aud: "authenticated", role: "authenticated", iss: `${URL_}/auth/v1`, exp: now + 3600, email: "a@example.test" }))
    const token = `${h}.${p}.${createHmac("sha256", SECRET).update(`${h}.${p}`).digest("base64url")}`
    const session = { access_token: token, refresh_token: "rt", token_type: "bearer", expires_in: 3600, expires_at: now + 3600, user: { id: "u1" } }
    const cookies = [{ name: "sb-abcd-auth-token", value: "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url") }]
    ;(globalThis as Record<string, unknown>).__PUSH_TEST_NEXT_HEADERS__ = {
      cookies: () => ({ getAll: () => cookies, get: (n: string) => cookies.find((c) => c.name === n), set() {} }),
      headers: () => new Headers({ host: "storelib.com" }),
    }
    const pending: Array<() => void> = []
    globalThis.fetch = (async (u: RequestInfo | URL, init?: RequestInit) => {
      const url = String(u instanceof Request ? u.url : u)
      if (url.includes("jwks")) return new Response(JSON.stringify({ keys: [] }), { status: 200 })
      return new Promise<Response>((_, reject) => { init?.signal?.addEventListener("abort", () => reject(init.signal!.reason), { once: true }); pending.push(() => reject(new Error("end"))) })
    }) as typeof fetch
    const t = Date.now()
    const res = await authState()
    const body = await res.text()
    check(`signed in, from the token, in ${Date.now() - t}ms`, JSON.parse(body).state === "authenticated" && Date.now() - t < 3_200, body)
    check("  one word only: no id, no email, no token", !/u1|example|eyJ/.test(body) && res.headers.get("cache-control") === "no-store", body)
    for (const end of pending) end()
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) { for (const f of failures) console.log(`  - ${f}`); process.exit(1) }
  process.exit(0)
}
main().catch((e) => { console.error(e); process.exit(1) })
