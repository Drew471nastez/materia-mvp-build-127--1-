/**
 * ===========================================================================
 *  THE PROXY'S SIGN IN CHECK, TIMED AGAINST A SLOW SUPABASE AUTH
 * ===========================================================================
 * proxy.ts runs on every page, prefetch and /api call. It used to ask
 * Supabase Auth (getUser) each time, so a slow minute for Supabase Auth was a
 * slow minute for all of Storelib. readVerifiedSession checks the token's
 * signature against Supabase's public keys instead, kept per instance.
 *
 * The real @supabase/ssr client runs here against a stand-in Supabase whose
 * /user answers after 800ms, with tokens signed the way Supabase signs them
 * (ES256, a kid, a JWKS). Measured: round trips to Supabase Auth per request
 * and time per request, before (readCurrentUser) and after. And the safety
 * that matters more than the speed: a forged token, an altered token and a
 * token signed by another key are still refused.
 */
import { createServerClient } from "@supabase/ssr"
import { readCurrentUser, readVerifiedSession, forgetSigningKeys, shouldSendToLogin } from "@/lib/auth/current-user"
import { readFileSync } from "node:fs"
import { join } from "node:path"

let passed = 0
let failed = 0
const failures: string[] = []
const out = console.log.bind(console)
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) { passed++; out(`  ok    ${label}`) }
  else { failed++; failures.push(label); out(`  FAIL  ${label}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ""}`) }
}
console.warn = () => {}

const URL_ = "https://abcd.supabase.co"
const SLOW_MS = 800
const b64url = (b: ArrayBuffer | Uint8Array | string) =>
  Buffer.from(typeof b === "string" ? b : b instanceof Uint8Array ? b : new Uint8Array(b)).toString("base64url")

async function keyPair() {
  return crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"])
}

async function sign(key: CryptoKey, kid: string, payload: Record<string, unknown>) {
  const head = b64url(JSON.stringify({ alg: "ES256", typ: "JWT", kid }))
  const body = b64url(JSON.stringify(payload))
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, new TextEncoder().encode(`${head}.${body}`))
  return `${head}.${body}.${b64url(sig)}`
}

const now = () => Math.floor(Date.now() / 1000)
const user = { id: "u1", aud: "authenticated", role: "authenticated" }

function client(accessToken: string, jwks: unknown, calls: string[]) {
  const session = { access_token: accessToken, refresh_token: "rt", token_type: "bearer", expires_in: 3600, expires_at: now() + 3600, user }
  const cookie = { name: "sb-abcd-auth-token", value: "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url") }
  const fetch = async (url: string | URL) => {
    const u = String(url)
    calls.push(u.replace(URL_, ""))
    if (u.endsWith("/.well-known/jwks.json")) return new Response(JSON.stringify(jwks), { status: 200, headers: { "content-type": "application/json" } })
    if (u.endsWith("/user")) {
      await new Promise((r) => setTimeout(r, SLOW_MS))
      return new Response(JSON.stringify(user), { status: 200, headers: { "content-type": "application/json" } })
    }
    return new Response("{}", { status: 404 })
  }
  return createServerClient(URL_, "anon", {
    global: { fetch: fetch as typeof globalThis.fetch },
    cookies: { getAll: () => [cookie], setAll: () => {} },
  })
}

async function main() {
  const real = await keyPair()
  const other = await keyPair()
  const kid = "key-1"
  const publicJwk = { ...(await crypto.subtle.exportKey("jwk", real.publicKey)), kid, alg: "ES256", use: "sig" }
  const jwks = { keys: [publicJwk] }
  const claims = { sub: "u1", aud: "authenticated", role: "authenticated", exp: now() + 3600, iat: now() }
  const good = await sign(real.privateKey, kid, claims)

  /* The proxy's key fetch goes through the global fetch, the client's through its own. */
  const keyCalls: string[] = []
  globalThis.fetch = (async (url: string | URL) => {
    keyCalls.push(String(url))
    return new Response(JSON.stringify(jwks), { status: 200, headers: { "content-type": "application/json" } })
  }) as typeof fetch

  out("\nBefore: readCurrentUser, 10 requests in a row")
  let beforeMs = 0
  let beforeAuthCalls = 0
  for (let i = 0; i < 10; i++) {
    const calls: string[] = []
    const t = performance.now()
    const r = await readCurrentUser(client(good, jwks, calls) as never)
    beforeMs += performance.now() - t
    beforeAuthCalls += calls.filter((c) => c.endsWith("/user")).length
    if (r.state !== "authenticated") check("before: signed in", false, r)
  }
  out(`        ${beforeAuthCalls} round trips to /auth/v1/user, ${(beforeMs / 10).toFixed(0)}ms per request`)
  check("before: every request waits on Supabase Auth", beforeAuthCalls === 10 && beforeMs / 10 >= SLOW_MS)

  out("\nAfter: readVerifiedSession, 10 requests in a row")
  forgetSigningKeys()
  keyCalls.length = 0
  let afterMs = 0
  let afterAuthCalls = 0
  let allIn = true
  for (let i = 0; i < 10; i++) {
    const calls: string[] = []
    const t = performance.now()
    const r = await readVerifiedSession(client(good, jwks, calls) as never, URL_)
    afterMs += performance.now() - t
    afterAuthCalls += calls.length
    allIn &&= r.state === "authenticated" && !shouldSendToLogin(r)
  }
  out(`        ${afterAuthCalls} round trips to Supabase Auth, ${keyCalls.length} key fetch, ${(afterMs / 10).toFixed(1)}ms per request`)
  check("the signed in person is signed in, every time", allIn)
  check("no round trip to Supabase Auth at all", afterAuthCalls === 0)
  check("the public keys fetched once for all ten", keyCalls.length === 1, keyCalls)
  check("each request well under the time one /user call took", afterMs / 10 < SLOW_MS / 10, afterMs / 10)

  out("\nStill a verification")
  for (const [label, token] of [
    ["a token signed by another key", await sign(other.privateKey, kid, claims)],
    ["a token whose claims were altered after signing", (() => { const [h, , s] = good.split("."); return `${h}.${b64url(JSON.stringify({ ...claims, sub: "someone-else" }))}.${s}` })()],
  ] as const) {
    const calls: string[] = []
    const r = await readVerifiedSession(client(token, jwks, calls) as never, URL_)
    check(`${label} is not signed in`, r.state !== "authenticated", r)
  }

  out("\nA project on the shared secret keeps the old check")
  {
    const head = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }))
    const token = `${head}.${b64url(JSON.stringify(claims))}.${b64url("sig")}`
    const calls: string[] = []
    const r = await readVerifiedSession(client(token, { keys: [] }, calls) as never, URL_)
    check("it asks Supabase Auth, as getUser did", r.state === "authenticated" && calls.some((c) => c.endsWith("/user")), calls)
  }

  out("\nNobody signed in")
  {
    const anon = createServerClient(URL_, "anon", { cookies: { getAll: () => [], setAll: () => {} } })
    const r = await readVerifiedSession(anon as never, URL_)
    check("is anonymous, so /app sends them to sign in", r.state === "anonymous" && shouldSendToLogin(r), r)
  }

  out("\nThe key endpoint down")
  {
    forgetSigningKeys()
    let asked = 0
    globalThis.fetch = (async () => { asked++; throw new TypeError("fetch failed") }) as typeof fetch
    const calls: string[] = []
    const r1 = await readVerifiedSession(client(good, { keys: [] }, calls) as never, URL_)
    await readVerifiedSession(client(good, { keys: [] }, []) as never, URL_)
    check("a failed key fetch is remembered, not retried on every request", asked === 1, asked)
    check("and a signed in person is never sent to sign in for it", !shouldSendToLogin(r1), r1)
  }

  out("\nThe proxy uses it")
  {
    const proxy = readFileSync(join(process.cwd(), "proxy.ts"), "utf8")
    check("readVerifiedSession in the proxy, readCurrentUser gone from it", /await readVerifiedSession\(supabase, supabaseUrl\)/.test(proxy) && !/await readCurrentUser\(/.test(proxy))
  }

  out(`\n${passed} passed, ${failed} failed`)
  if (failed) { for (const f of failures) out(`  - ${f}`); process.exit(1) }
}
main()
