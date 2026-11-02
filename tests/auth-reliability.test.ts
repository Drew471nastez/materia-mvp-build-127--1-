/**
 * ===========================================================================
 *  AUTH THAT DOES NOT ANSWER IS NOT A SIGN OUT, AND NOT A YES EITHER
 * ===========================================================================
 * Round rel-auth. The real @supabase/ssr client against a stand in Supabase
 * Auth that times out, answers 5xx, answers slowly, or says the session is
 * gone, with every request to it counted:
 *
 *   1. readCurrentUser + routeUserFrom (what every guarded API route that
 *      goes through lib/auth/route-user asks): a timeout or a 5xx is
 *      "unavailable" (503, Try again), never "anonymous" (401, sign in) and
 *      never a user. A revoked session is anonymous. At most two auth
 *      requests per check, and a bounded time.
 *   2. A change (fresh) never takes the token's signature alone, even a
 *      valid one, when Auth did not answer. A read may.
 *   3. The proxy reads no session for a request that carries none (no
 *      client, no signing keys fetched) and still sends it to /login from
 *      /app.
 *   4. The pages and routes that skipped the per request answer now share it,
 *      so a /app render asks Supabase Auth once, and no page sends somebody to
 *      /sell or /login because Auth was slow.
 *   5. Noncritical reads on the shell and Home have their own ceiling.
 */
import { createServerClient } from "@supabase/ssr"
import { createServer, type IncomingMessage, type ServerResponse } from "node:http"
import type { AddressInfo } from "node:net"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { readCurrentUser, readVerifiedSession, readSessionPresence, forgetSigningKeys, shouldSendToLogin } from "@/lib/auth/current-user"
import { routeUserFrom } from "@/lib/auth/route-user"
import { carriesSignIn } from "@/lib/auth/no-session-paths"

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
console.warn = () => {}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

type Mode = "ok" | "hang" | "503" | "502" | "slow" | "revoked" | "jwt-expired"
type RefreshMode = "ok" | "hang" | "503" | "used"
const person = { id: "11111111-1111-4111-8111-111111111111", aud: "authenticated", role: "authenticated", email: "a@b.c", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" }

/** A stand in Supabase Auth: /auth/v1/user answers by `mode`, every request counted. */
async function standIn() {
  const state = { mode: "ok" as Mode, refresh: "ok" as RefreshMode, hits: [] as string[] }
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const path = (req.url ?? "").split("?")[0]
    state.hits.push(path)
    const send = (status: number, body: unknown) => {
      res.writeHead(status, { "content-type": "application/json" })
      res.end(JSON.stringify(body))
    }
    if (path === "/auth/v1/.well-known/jwks.json") return send(200, { keys: [] })
    if (path === "/auth/v1/token") {
      if (state.refresh === "hang") return
      if (state.refresh === "503") return send(503, { message: "upstream unavailable" })
      if (state.refresh === "used") return send(400, { code: "refresh_token_already_used", message: "Invalid Refresh Token: Already Used" })
      return send(200, { access_token: "new", refresh_token: "rt2", token_type: "bearer", expires_in: 3600, expires_at: now() + 3600, user: person })
    }
    if (path !== "/auth/v1/user") return send(404, {})
    switch (state.mode) {
      case "ok":
        return send(200, person)
      case "slow":
        return void setTimeout(() => send(200, person), 400)
      case "hang":
        return /* never answers */
      case "503":
        return send(503, { message: "upstream unavailable" })
      case "502":
        return send(502, { message: "bad gateway" })
      case "revoked":
        return send(403, { code: "session_not_found", message: "Session from session_id claim in JWT does not exist" })
      case "jwt-expired":
        return send(401, { code: "bad_jwt", message: "invalid JWT" })
    }
  })
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r))
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  return { url, state, close: () => new Promise<void>((r) => { server.closeAllConnections?.(); server.close(() => r()) }) }
}

const b64url = (s: string) => Buffer.from(s).toString("base64url")
const now = () => Math.floor(Date.now() / 1000)
const took = (t: number) => Date.now() - t

/** A cookie session the way @supabase/ssr writes it, on the shared secret (no public key: getClaims asks Auth). */
function sessionCookie(url: string, expiresIn = 3600) {
  const token = `${b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }))}.${b64url(JSON.stringify({ sub: person.id, aud: "authenticated", role: "authenticated", exp: now() + expiresIn, iat: now() }))}.${b64url("sig")}`
  const session = { access_token: token, refresh_token: "rt", token_type: "bearer", expires_in: expiresIn, expires_at: now() + expiresIn, user: person }
  const ref = new URL(url).hostname.split(".")[0]
  return { name: `sb-${ref}-auth-token`, value: "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url") }
}

function client(url: string, cookies: { name: string; value: string }[], written: string[]) {
  return createServerClient(url, "anon", {
    cookies: {
      getAll: () => cookies,
      setAll: (all) => {
        for (const c of all) written.push(`${c.name}=${c.value ? "set" : "cleared"}`)
      },
    },
  })
}

async function run() {
  const auth = await standIn()
  const cookie = sessionCookie(auth.url)

  console.log("\n1. A route's check against a failing Supabase Auth")
  const cases: Array<{ mode: Mode; want: "user" | "anonymous" | "unavailable" }> = [
    { mode: "ok", want: "user" },
    { mode: "slow", want: "user" },
    { mode: "hang", want: "unavailable" },
    { mode: "503", want: "unavailable" },
    { mode: "502", want: "unavailable" },
    { mode: "revoked", want: "anonymous" },
    { mode: "jwt-expired", want: "anonymous" },
  ]
  for (const { mode, want } of cases) {
    auth.state.mode = mode
    auth.state.hits = []
    const written: string[] = []
    const t = Date.now()
    const current = await readCurrentUser(client(auth.url, [cookie], written), { timeoutMs: 600, retries: 1 })
    const took = Date.now() - t
    const answer = routeUserFrom(current)
    const userCalls = auth.state.hits.filter((h) => h === "/auth/v1/user").length
    check(`${mode}: ${want}`, answer.kind === want, { got: answer.kind, reason: current.reason })
    if (want === "unavailable") {
      check(`  ${mode}: not sent to sign in (no 401, no /login)`, !shouldSendToLogin(current) && current.state === "indeterminate")
      check(`  ${mode}: and no user, so nothing is allowed`, current.user === null && answer.kind !== "user")
      check(`  ${mode}: no cookie cleared`, !written.some((w) => w.endsWith("=cleared")), written)
      /* A hung request holds supabase-js's session lock, so the retry waits behind it rather than sending a second one: one or two, never more. */
      check(`  ${mode}: retried once at most (${userCalls} auth requests)`, userCalls >= 1 && userCalls <= 2, auth.state.hits)
      check(`  ${mode}: bounded (${took}ms, two ceilings and a pause)`, took < 600 * 2 + 600)
    } else {
      check(`  ${mode}: one auth request, no retry of an answer`, userCalls === 1, auth.state.hits)
    }
  }

  console.log("\n2. A change never takes the token's signature alone")
  {
    /* Auth hangs; the token's signature would check out against a public key. A change asks with no fallback (routeUser fresh). */
    auth.state.mode = "hang"
    forgetSigningKeys()
    let claimsAsked = 0
    const fake = {
      auth: {
        getUser: () => new Promise(() => {}),
        getClaims: async () => (claimsAsked++, { data: { claims: { sub: person.id, role: "authenticated" } }, error: null }),
      },
    } as unknown as Parameters<typeof readCurrentUser>[0]
    const fresh = await readCurrentUser(fake, { timeoutMs: 100, retries: 1, fallbackClaims: null })
    check("fresh: unavailable, the token's claims never asked", routeUserFrom(fresh).kind === "unavailable" && claimsAsked === 0)
    const routeSrc = read("lib/auth/route-user.ts")
    check("  routeUser is fresh unless a caller says otherwise, and fresh means no claims fallback", /fresh = true/.test(routeSrc) && /fresh \? strictUserForRequest\(\) : readerForRequest\(\)/.test(routeSrc) && /verifiedBy === "user" \|\| first\.state === "anonymous"/.test(routeSrc))
    check("  unavailable is a 503 with Retry-After, never cached", /status: 503/.test(routeSrc) && /"Retry-After": "2"/.test(routeSrc) && /"Cache-Control": "no-store"/.test(routeSrc))
  }

  console.log("\n3. The proxy reads no session for a request that carries none")
  {
    auth.state.mode = "ok"
    auth.state.hits = []
    forgetSigningKeys()
    const proxy = read("proxy.ts")
    check("no session cookie: no Supabase client, no signing keys, answered anonymous", /const signedIn = carriesSignIn\(cookieNames\)/.test(proxy) && /!signedIn \? \{ user: null, state: "anonymous" \} : decidesHere \?/.test(proxy))
    check("  decided before the client is made", proxy.indexOf("const signedIn = carriesSignIn(cookieNames)") < proxy.indexOf("createServerClient(supabaseUrl"))
    check("  and /app without one still goes to /login", /if \(guarded && shouldSendToLogin\(current\)\)/.test(proxy))
    check("carriesSignIn: the session cookie whole or chunked, the PKCE verifier too; nothing else", carriesSignIn(["sb-abc-auth-token"]) && carriesSignIn(["sb-abc-auth-token.0"]) && carriesSignIn(["sb-abc-auth-token-code-verifier"]) && !carriesSignIn(["visitor_id", "sl_lang"]))
    /* What the skipped work would have cost: with no cookie the real client answers anonymous, but the keys were fetched first. */
    const written: string[] = []
    const before = await readVerifiedSession(client(auth.url, [], written), auth.url)
    /* Round rel3-auth: readVerifiedSession reads the token first, so even when asked it fetches no keys for nobody. */
    check("  (and even asked, an anonymous visitor's read now fetches nothing)", before.state === "anonymous" && auth.state.hits.length === 0, auth.state.hits)
  }

  console.log("\n3b. Off /app, /dashboard and /sell the proxy only renews")
  {
    const proxy = read("proxy.ts")
    check("verified only where the answer decides a redirect", /const decidesHere = request\.nextUrl\.pathname === "\/sell" \|\| request\.nextUrl\.pathname\.startsWith\("\/app"\) \|\| request\.nextUrl\.pathname\.startsWith\("\/dashboard"\)/.test(proxy) && /decidesHere \? await readVerifiedSession\(supabase, supabaseUrl\) : await readSessionPresence\(supabase\)/.test(proxy))
    check("  and the redirects to sign in are still only on those paths", /if \(request\.nextUrl\.pathname === "\/sell" && shouldSendToLogin\(current\)\)/.test(proxy) && /const guarded =\s*request\.nextUrl\.pathname\.startsWith\("\/app"\) \|\| request\.nextUrl\.pathname\.startsWith\("\/dashboard"\)/.test(proxy))
    auth.state.hits = []
    const fresh = await readSessionPresence(client(auth.url, [cookie], []))
    check("a token still in date: present, and Supabase Auth not asked at all", fresh.state === "authenticated" && auth.state.hits.length === 0, auth.state.hits)
    const expired = sessionCookie(auth.url, -60)
    for (const [mode, want] of [["ok", "authenticated"], ["503", "indeterminate"], ["hang", "indeterminate"], ["used", "anonymous"]] as const) {
      auth.state.refresh = mode
      auth.state.hits = []
      const written: string[] = []
      const t = Date.now()
      const r = await readSessionPresence(client(auth.url, [expired], written), { timeoutMs: 600, retries: 1 })
      const refreshes = auth.state.hits.filter((h) => h === "/auth/v1/token").length
      check(`expired, renewal ${mode}: ${want}${mode === "ok" ? ", and the new cookies written" : ""}`, r.state === want && (mode !== "ok" || written.some((w) => w.endsWith("=set"))), { got: r.state, reason: r.reason, written })
      /* supabase-js retries a renewal that got a 5xx by itself, inside the ceiling; what matters is that the wait ends and nothing is cleared. */
      if (want === "indeterminate") check(`  renewal ${mode}: no cookie cleared, bounded (${took(t)}ms, ${refreshes} renewal requests)`, !written.some((w) => w.endsWith("=cleared")) && refreshes <= 6 && Date.now() - t < 2_000, { refreshes, written })
    }
    auth.state.refresh = "ok"
  }

  console.log("\n4. One auth answer per /app render, and no false redirect")
  {
    const team = read("lib/team/server.ts")
    const noStore = team.slice(team.indexOf("export async function noStorePage"))
    check("noStorePage asks the request's answer, not Supabase again", /currentUserForRequest\(\)/.test(noStore.slice(0, 1200)) && !/auth\.getUser\(\)/.test(noStore.slice(0, 1200)))
    check("  could not tell: renders nothing (the layout's gate recovers), never /sell", /if \(!current\.user\) \{\s*if \(shouldSendToLogin\(current\)\) redirect\("\/sell"\)\s*return null\s*\}/.test(noStore))
    const gate = team.slice(team.indexOf("export async function requireTeamPermission"), team.indexOf("export async function storeAccessOf"))
    check("requireTeamPermission: bounded, retried, and a 503 when Auth did not answer", /await routeUser\(\{ fresh: !opts\.read \}\)/.test(gate) && /who\.kind === "unavailable"\) return authUnavailableResponse\(\)/.test(gate) && !/auth\.getUser\(\)/.test(gate))
    check("  401 only when Auth said nobody", /who\.kind !== "user"\) return NextResponse\.json\(\{ error: "Sign in again to do this\." \}, \{ status: 401/.test(gate))
    const current = read("lib/creators/current.ts")
    const body = current.slice(current.indexOf("export async function currentCreatorId"))
    check("currentCreatorId (Storelib AI, Integrations, Support pages) shares the request's answer", /currentUserForRequest\(\)/.test(body) && !/auth\.getUser\(\)/.test(body))
    check("  routes that change something ask fresh, and say 503 when Auth did not answer", ["app/api/ai-keys/route.ts", "app/api/sites/route.ts", "app/api/sites/[siteId]/agent/route.ts", "app/api/sites/[siteId]/agent/answer/route.ts"].every((f) => /routeUser\(\)/.test(read(f)) && /authUnavailableResponse\(\)/.test(read(f))))
  }

  console.log("\n5. Noncritical reads have their own ceiling")
  {
    const layout = read("app/app/layout.tsx")
    check("the account menu's businesses never hold the shell", /within\(listBusinesses\(user\.id\), SHELL_EXTRA_MS, \[\]\)/.test(layout))
    const home = read("app/app/page.tsx")
    check("Home's banner sales never hold Home", /within\(creatorSalesRows\(adminSupabase, creator\.id, now(, \{ noFetch: true \})?\), HOME_EXTRA_MS, NO_BANNER_ROWS\)/.test(home))
  }

  await auth.close()
  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) {
    console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
    process.exit(1)
  }
  process.exit(0)
}

run().catch((e) => {
  console.error(e)
  process.exit(1)
})
