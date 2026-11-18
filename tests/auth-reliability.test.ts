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
 *   6. Round rel2-auth: no API route or server action turns "Supabase Auth
 *      did not answer" into 401 / "sign in again": a scan of every route
 *      file, with an allowlist that says why for each exception, and the
 *      shared helpers (readUserForRoute, sessionUserId, requestUser,
 *      requestViewer, pushRequestUser, ownInstall) say "could not tell".
 *   7. A team membership or plan read that FAILED is not "none": it never
 *      redirects to /sell, never reads a paying store as Free, never grants.
 */
import { createServerClient } from "@supabase/ssr"
import { createServer, type IncomingMessage, type ServerResponse } from "node:http"
import type { AddressInfo } from "node:net"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { readCurrentUser, readVerifiedSession, readSessionPresence, forgetSigningKeys, shouldSendToLogin } from "@/lib/auth/current-user"
import { routeUserFrom, readUserForRoute, signedOutOrRetry, authUnavailableForRequest } from "@/lib/auth/route-user"
import { NextResponse } from "next/server"
import { readdirSync, statSync } from "node:fs"
import { actingStoreIn, creatorFor, memberRowsOf, onATeamRead, storeAccessOf, storesRead } from "@/lib/team/server"
import { readPlanOverride } from "@/lib/billing/plan-override"
import { checkUploadAllowed } from "@/lib/storage/quota"
import { requestUser, signedOutAnswer, requestUserUnavailable } from "@/lib/businesses/server"
import { isServiceUnavailable } from "@/lib/net/service-error"
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
    /* Changed on purpose (r52): routeUser takes the token's verified signature unless a caller asks for fresh (the strict list, tests/auth-strict-r52.test.ts); fresh still means no claims fallback. */
    check("  routeUser is fresh only when a caller says so, and fresh means no claims fallback", /fresh = false/.test(routeSrc) && /fresh \? strictUserForRequest\(\) : full \? fullReaderForRequest\(\) : readerForRequest\(\)/.test(routeSrc) && /verifiedBy === "user" \|\| first\.state === "anonymous"/.test(routeSrc))
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
    /* Changed on purpose (r52): no team area is on the strict list (role changes go through lib/businesses/server requestUser, which asks Auth). */
    check("requireTeamPermission: bounded, retried, and a 503 when Auth did not answer", /await routeUser\(\)/.test(gate) && /who\.kind === "unavailable"\) return authUnavailableResponse\(\)/.test(gate) && !/auth\.getUser\(\)/.test(gate))
    check("  401 only when Auth said nobody", /who\.kind !== "user"\) return NextResponse\.json\(\{ error: "Sign in again to do this\." \}, \{ status: 401/.test(gate))
    const current = read("lib/creators/current.ts")
    const body = current.slice(current.indexOf("export async function currentCreatorId"))
    check("currentCreatorId (Storelib AI, Integrations, Support pages) shares the request's answer", /currentUserForRequest\(\)/.test(body) && !/auth\.getUser\(\)/.test(body))
    /* Changed on purpose (r52): AI keys ask fresh (the strict list); the sites routes take the verified token. */
    check("  routes that change something say 503 when Auth did not answer; AI keys ask fresh", /routeUser\(\{ fresh: true \}\)/.test(read("app/api/ai-keys/route.ts")) && ["app/api/ai-keys/route.ts", "app/api/sites/route.ts", "app/api/sites/[siteId]/agent/route.ts", "app/api/sites/[siteId]/agent/answer/route.ts"].every((f) => /routeUser\((\{ fresh: true \})?\)/.test(read(f)) && /authUnavailableResponse\(\)/.test(read(f))))
  }

  console.log("\n5. Noncritical reads have their own ceiling")
  {
    const layout = read("app/(storelib)/app/layout.tsx")
    check("the account menu's businesses never hold the shell", /within\(listBusinesses\(user\.id\), SHELL_EXTRA_MS, \[\]\)/.test(layout))
    const home = read("app/(storelib)/app/page.tsx")
    check("Home's banner sales never hold Home", /within\(creatorSalesRows\(adminSupabase, creator\.id, now(, \{ noFetch: true \})?\), HOME_EXTRA_MS, NO_BANNER_ROWS\)/.test(home))
  }


  console.log("\n6. No route says \"sign in\" because Supabase Auth did not answer")
  {
    const walk = (d: string): string[] => readdirSync(join(process.cwd(), d)).flatMap((n) => (statSync(join(process.cwd(), d, n)).isDirectory() ? walk(`${d}/${n}`) : [`${d}/${n}`]))
    /* Comments out, so a route that only mentions getUser() in its notes is not counted. */
    const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1")
    /*
      THE ALLOWLIST: files that read Supabase Auth's own answer on purpose and may treat "no answer" as signed out. Each
      says why. A new entry needs a reason as good as these; a route that refuses somebody belongs in none of them.
    */
    const RAW_GET_USER_ALLOWED: Record<string, string> = {
      "app/(storelib)/auth/callback/route.ts": "sign in itself: right after the code exchange, Auth's own answer decides where the browser lands, and not knowing lands on /login, which is where it already is",
      "app/(storelib)/account/continue/route.ts": "a sign in redirect: not knowing sends to sign in, which costs a click; sending to a library they cannot see costs an error page (its own comment)",
    }
    /*
      Routes whose 401 has nothing to do with a Supabase session (an admin cookie, a webhook signature, a cron secret, a
      signed link, a store site's own customer cookie) never read an identity below, so the scan does not look at them.
      Optional sign in on purpose (guest checkout, receipts and downloads by token, status probes that answer signed out
      as data: purchases/check, native/checkout-status, help/me, wishlist/check) reads the request's one answer and
      sends no 401, so it passes without an entry; where a signed in buyer could be mistaken for a guest (checkouts,
      the wishlist, reviews), "could not tell" is a 503 there too.
    */
    const IDENTITY = /auth\.getUser\(\)|routeUser\(|readUserForRoute\(|sessionUserId\(|requestUserId\(|requestViewer\(|requestUser\(|pushRequestUser\(|currentUserForRequest\(|readerForRequest\(|fullReaderForRequest\(/
    const ANSWERS_UNAVAILABLE = /authUnavailableResponse\(|signedOutOrRetry\(|signedOutAnswer\(|requestUserUnavailable\(|"unavailable"|\bunavailable\b|"indeterminate"/
    const routes = walk("app").filter((f) => /\.tsx?$/.test(f)).filter((f) => /\/route\.tsx?$/.test(f) || /^\s*["']use server["']/.test(read(f)))
    const raw: string[] = []
    const mapped: string[] = []
    for (const f of routes) {
      const src = code(read(f))
      if (/\.auth\.getUser\(\)/.test(src) && !RAW_GET_USER_ALLOWED[f]) raw.push(f)
      if (!IDENTITY.test(src) || RAW_GET_USER_ALLOWED[f]) continue
      /* Per function: each one that answers 401 must also have a way to say 503 (a helper's own read counts for the file). */
      for (const chunk of src.split(/\n(?=(?:export )?(?:async )?function |export const |const \w+ = async)/)) {
        if (/status: ?401|answer\(401/.test(chunk) && !ANSWERS_UNAVAILABLE.test(chunk)) mapped.push(`${f}: ${chunk.trim().slice(0, 60)}`)
      }
    }
    check(`the scan found the routes (${routes.length})`, routes.length > 400)
    check("no route or server action asks Supabase Auth itself with getUser() outside the allowlist (the request's one read says when it could not tell)", raw.length === 0, raw)
    check("every route function that answers 401 to a missing session can also answer 503 when Auth did not answer", mapped.length === 0, mapped)
    check("  every allowlisted file still exists (an entry for a deleted route is removed with it)", Object.keys(RAW_GET_USER_ALLOWED).every((f) => { try { return !!read(f) } catch { return false } }))


    /*
      NOTHING THAT ASKED SUPABASE AUTH ITSELF NOW TAKES LESS. Every file below called auth.getUser() on origin/main
      (682605d55), so a session ended within its token's life was refused there. Each one now goes through
      lib/auth/route-user `fresh` (Supabase Auth itself, with retries, and "could not tell" as its own answer), never
      the token's signature alone: no routeUser() or routeUser({ full: true }), no readUserForRoute, no reader. A
      file that only ever read through the signature on main (readUserForRoute's routes) is not on this list.
    */
    const WAS_GET_USER = [
      "app/(storelib)/app/products/new/description-action.ts",
      "app/(storelib)/app/reviews/widgets/add/route.ts",
      "app/api/ai-memory/caller.ts",
      "app/api/app/reviews/[id]/route.ts",
      "app/api/auth/reset-password/route.ts",
      "app/api/auth/signup-attribution/route.ts",
      "app/api/checkout/cart/complete/route.ts",
      "app/api/checkout/cart/route.ts",
      "app/api/checkout/process/route.ts",
      "app/api/checkout/quick-free/route.ts",
      "app/api/checkout/stripe-session/route.ts",
      "app/api/community/[communityId]/contact/route.ts",
      "app/api/community/[communityId]/events/[eventId]/checkout/route.ts",
      "app/api/community/[communityId]/learn/[programId]/checkout/route.ts",
      "app/api/community/[communityId]/library/[itemId]/checkout/route.ts",
      "app/api/community/[communityId]/membership/plan/route.ts",
      "app/api/community/[communityId]/membership/route.ts",
      "app/api/community/[communityId]/moderation/act/route.ts",
      "app/api/community/[communityId]/moderation/members/route.ts",
      "app/api/community/[communityId]/moderation/reports/route.ts",
      "app/api/community/[communityId]/onboarding/route.ts",
      /* app/api/debug/orders/route.ts was here: deleted in round AV (it showed any signed in account the newest orders of every store). */
      "app/api/download/[assetId]/route.ts",
      "app/api/help/me/route.ts",
      "app/api/memberships/checkout/route.ts",
      "app/api/native/checkout-status/route.ts",
      "app/api/onboarding/finalize/route.ts",
      "app/api/onepage/access/route.ts",
      "app/api/onepage/product/route.ts",
      "app/api/payments/disputes/route.ts",
      "app/api/payouts-demo/unlock/route.ts",
      "app/api/physical/checkout/quote/route.ts",
      "app/api/physical/checkout/route.ts",
      "app/api/products/files/[assetId]/download/route.ts",
      "app/api/profile/contributions/route.ts",
      "app/api/profile/shared-posts/route.ts",
      "app/api/profile/username/route.ts",
      "app/api/purchases/check/route.ts",
      "app/api/purchases/verify/route.ts",
      "app/api/receipt/resend/route.ts",
      "app/api/receipt/update-email/route.ts",
      "app/api/reviews/[id]/reply/route.ts",
      "app/api/reviews/[id]/report/route.ts",
      "app/api/reviews/[id]/route.ts",
      "app/api/reviews/check/route.ts",
      "app/api/reviews/route.ts",
      "app/api/settings/statement-descriptor/route.ts",
      "app/api/site-password/owner/route.ts",
      "app/api/v2/download/[token]/route.ts",
      "app/api/website-address/route.ts",
      "app/api/wishlist/check/route.ts",
      "app/api/wishlist/route.ts",
      "lib/billing/overview.ts",
      "lib/businesses/server.ts",
      "lib/communities/server/feed.ts",
      "lib/courses/route-auth.ts",
      "lib/github-sync/own-install.ts",
      "lib/memberships/viewer.ts",
      "lib/push/request-user.ts",
      "lib/sites/agent/run.ts",
    ]
    const NON_FRESH = /routeUser\(\)|routeUser\(\{ full: true \}\)|routeUser\(\{ fresh: false|readUserForRoute\(|readerForRequest\(|fullReaderForRequest\(|currentUserForRequest\(|fresh: false/
    const weakened = WAS_GET_USER.filter((f) => NON_FRESH.test(code(read(f))) || !/routeUser\(\{ fresh: true \}\)|requestUserId\(\)|sessionUserId\(\)|requestUser\(|requestViewer\(|pushRequestUser\(|ownInstall\(/.test(code(read(f))))
    check(`every route and helper that asked Supabase Auth itself on main still does (${WAS_GET_USER.length} files, fresh), never the signature alone`, weakened.length === 0, weakened)
    const ru = code(read("lib/auth/route-user.ts"))
    check("  requestUserId (sessionUserId's) asks fresh, and signedOutOrRetry asks the same read by default", /export async function requestUserId\(\)[^{]*\{\s*const who = await routeUser\(\{ fresh: true \}\)/.test(ru) && /authUnavailableForRequest\(\{ full = false, fresh = !full \}/.test(ru))

    /* The shared helpers the routes stand on. */
    const helpers: Array<[string, string, RegExp]> = [
      ["lib/courses/route-auth.ts", "sessionUserId (courses, notifications, the account's posts)", /return requestUserId\(\)/],
      ["lib/communities/server/feed.ts", "sessionUserId (every community member route)", /return requestUserId\(\)/],
      ["lib/memberships/viewer.ts", "requestViewer (a buyer's membership routes)", /await routeUser\(/],
      ["lib/push/request-user.ts", "pushRequestUser (the app's push routes)", /await routeUser\(\{ fresh: true \}\)[\s\S]*unavailable/],
      ["lib/github-sync/own-install.ts", "ownInstall (GitHub and Supabase connections)", /who\.kind === "unavailable"\) return "unavailable"/],
      ["lib/businesses/server.ts", "requestUser (businesses, the team, handoffs)", /routeUser\(\{ fresh: true \}\)[\s\S]*couldNotTell\.add\(request\)/],
    ]
    for (const [f, what, re] of helpers) check(`${what}: the request's read, and it says "could not tell"`, re.test(read(f)) && !/\.auth\.getUser\(\)/.test(code(read(f))), f)
    const ctx = read("lib/communities/server/context.ts")
    check("requireMember: no id is \"sign_in\" only when Auth said nobody", /if \(!userId\) return signedOutOrRetry\(answer\(401, "sign_in"\)\)/.test(ctx))
    check("requireCreatorCommunity passes a 503 through as itself, never \"not_creator\"", /ctx\.status === 401 \? answer\(401, "sign_in"\) : ctx\.status === 503 \? ctx : answer\(403, "not_creator"\)/.test(ctx))
    check("automations: a gate's refusal is handed back, not read as \"Sign in again.\"", /gate\.status === 401 \? NextResponse\.json\(\{ error: "Sign in again\." \}, \{ status: 401 \}\) : gate/.test(read("lib/automations/flow-io.ts")) && !/if \(!me\) return NextResponse\.json\(\{ error: "Sign in again\." \}/.test(read("app/api/automations/flows/route.ts")))

    /* What the helpers answer. Outside a request there is no session to ask about: signed out, as before. */
    check("signedOutOrRetry hands a 401 back when nobody is asking (no request)", (await signedOutOrRetry(NextResponse.json({}, { status: 401 }))).status === 401 && !(await authUnavailableForRequest()))
    check("  and never changes anything but a 401", (await signedOutOrRetry(NextResponse.json({}, { status: 403 }))).status === 403)
    /*
      THE REAL READ against the stand in Supabase Auth, inside a request (the suite's next/headers hook hands the route
      its cookie jar, as Next would): the request's one read, readUserForRoute and signedOutOrRetry together.
    */
    const g = globalThis as { __PUSH_TEST_NEXT_HEADERS__?: unknown }
    const env = { url: process.env.NEXT_PUBLIC_SUPABASE_URL, key: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY }
    process.env.NEXT_PUBLIC_SUPABASE_URL = auth.url
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon"
    const inRequest = async <T,>(cookies: { name: string; value: string }[], run: () => Promise<T>): Promise<T> => {
      /* One jar per request: the request's answer is kept on it (lib/auth/request-scope oncePerRequest). */
      const jar = { getAll: () => cookies, get: (n: string) => cookies.find((c) => c.name === n), set() {} }
      g.__PUSH_TEST_NEXT_HEADERS__ = { cookies: () => jar, headers: () => new Map() }
      try {
        return await run()
      } finally {
        delete g.__PUSH_TEST_NEXT_HEADERS__
      }
    }
    const ask = () => Promise.all([readUserForRoute(), signedOutOrRetry(NextResponse.json({ error: "Sign in" }, { status: 401 }))])
    for (const [mode, want] of [["503", 503], ["hang", 503], ["revoked", 401]] as const) {
      auth.state.mode = mode
      forgetSigningKeys()
      const [read, refused] = await inRequest([cookie], ask)
      check(`a signed in request, Auth ${mode}: ${want === 503 ? "unavailable, and the route's 401 becomes 503 Try again" : "signed out, and the 401 stands"}`, read.data.user === null && read.unavailable === (want === 503) && refused.status === want, { unavailable: read.unavailable, status: refused.status })
    }
    auth.state.mode = "ok"
    const [nobody, nobodyRefused] = await inRequest([], ask)
    check("no session cookie at all: signed out, 401, and Auth not even asked about it", nobody.unavailable === false && nobodyRefused.status === 401)
    process.env.NEXT_PUBLIC_SUPABASE_URL = env.url
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = env.key
    if (env.url === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL
    if (env.key === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    const req = new Request("https://storelib.test/api/team", { method: "POST" })
    const u = await requestUser(req)
    const answered = signedOutAnswer(req, NextResponse.json({ error: "Sign in again." }, { status: 401 }))
    check("requestUser could not check the session: no user, and the route's refusal is 503 Try again, not 401", u === null && requestUserUnavailable(req) && answered.status === 503 && answered.headers.get("Retry-After") === "2")
    check("  another request is not marked by it", !requestUserUnavailable(new Request("https://storelib.test/api/team")))
  }

  console.log("\n7. A failed team or plan read is not \"none\": no /sell, no Free, no grant")
  {
    type Answer = { data: unknown; error: unknown }
    /* A supabase-js stand in: every chain resolves to what `answer` says for its table. */
    const fakeDb = (answer: (table: string) => Answer) => ({
      from: (table: string) => {
        const result = answer(table)
        const chain: unknown = new Proxy(function () {}, {
          get: (_t, key) => (key === "then" ? (res: (v: Answer) => unknown, rej: (e: unknown) => unknown) => Promise.resolve(result).then(res, rej) : () => chain),
        })
        return chain
      },
    })
    const down = { data: null, error: { message: "TypeError: fetch failed", code: "" } }
    const missing = { data: null, error: { code: "42P01", message: 'relation "store_team_members" does not exist' } }
    const store = "22222222-2222-4222-8222-222222222222"
    const member = { id: "m1", creator_id: store, user_id: person.id, role: "manager", permissions: ["orders"], status: "active" }
    const rejects = async (p: Promise<unknown>) => p.then(() => false, (e) => isServiceUnavailable(e))

    check("actingStoreIn: the membership read failed, so it throws, never \"their own account\"", await rejects(actingStoreIn(fakeDb(() => down), person.id, store)))
    check("  the store's row read failed: throws too", await rejects(actingStoreIn(fakeDb((t) => (t === "store_team_members" ? { data: member, error: null } : down)), person.id, store)))
    check("  the team table not set up yet is still no store", (await actingStoreIn(fakeDb(() => missing), person.id, store)) === null)
    check("creatorFor: a failed store read throws (requireTeamPermission answers it 503), never \"none\"", await rejects(creatorFor(fakeDb(() => down), person.id, "orders", "id", null)))
    const listed = await storesRead(fakeDb((t) => (t === "store_team_members" ? { data: [member], error: null } : down)), person.id)
    check("storesRead: the stores' rows failed, so failed, never \"on no team\"", listed.failed === true && listed.stores.length === 0)
    check("  the membership read failed: failed", (await storesRead(fakeDb(() => down), person.id)).failed === true)
    check("  nothing listed is no team, read fine", (await storesRead(fakeDb(() => ({ data: [], error: null })), person.id)).failed === false)
    check("memberRowsOf: a failed read throws, never [] (which sent a member to /sell)", await rejects(memberRowsOf(fakeDb(() => down), person.id)))
    const onTeam = await onATeamRead(fakeDb(() => down), person.id)
    check("  onATeamRead says failed, not \"on no team\"", onTeam.failed === true && onTeam.onTeam === false)
    const access = await storeAccessOf(fakeDb((t) => (t === "creators" ? { data: { id: store, user_id: "someone-else" }, error: null } : down)), person.id, store, "analytics")
    check("storeAccessOf: a failed membership read is failed, never a yes", access.ok === false && (access as { failed?: boolean }).failed === true)

    const team = read("lib/team/server.ts")
    const noStore = team.slice(team.indexOf("export async function noStorePage"))
    check("noStorePage: a membership read that failed draws nothing, never /sell", /if \(read\.failed \|\| read\.acting\) return null/.test(noStore) && /memberRowsOf\(db, user\.id\)\.catch\(\(\) => null\)\s*if \(rows === null\) return null/.test(noStore))
    check("teamPageStore and the store pages: a failed read throws (the page's boundary), never their own account", /const team = await teamStoreForRequest\(user\.id\)\n/.test(team) && !/teamStoreForRequest\(user\.id\)\.catch\(\(\) => null\)/.test(read("lib/communities/server/creator.ts") + read("app/(storelib)/app/products/load-editor.ts") + read("app/(storelib)/app/settings/_server.ts")))
    const layout = read("app/(storelib)/app/layout.tsx")
    check("the /app shell decides no gate from a team store read that failed", /within\(teamStoreReadForRequest\(user\.id\), SHELL_ROWS_MS, \{ team: null, failed: true \}\)/.test(layout) && /if \(known && !teamRead\.failed\) \{/.test(layout))
    check("Settings: memberships that could not be read are not \"on no team\", so never onboarding", /if \(stores\.failed\) throw new ServiceUnavailable/.test(read("app/(storelib)/app/settings/_server.ts")))
    for (const f of ["lib/team/onepage.ts", "lib/team/money.ts", "lib/team/areas.ts", "app/api/team/upload-url/route.ts", "app/api/app/search/route.ts"]) {
      check(`  ${f}: a failed membership read is a 503, not their own store`, /actingStoreRead\(/.test(read(f)) && /failed/.test(read(f)) && !/actingStore\([^)]*\)\.catch\(\(\) => null\)/.test(read(f)))
    }
    check("  uploads and the physical routes let a failed read throw: never their own folder in the store's place", !/actingStore\([^)]*\)\.catch\(\(\) => null\)/.test(read("lib/team/uploads.ts") + read("lib/physical/auth.ts")))

    /* The plan. */
    check("readPlanOverride: a failed read throws, never \"no override\" (a store given Pro read as Free)", await rejects(readPlanOverride(fakeDb(() => down), store)))
    check("  before part 252 it is still no override", (await readPlanOverride(fakeDb(() => ({ data: null, error: { code: "42P01" } })), store)) === null)
    const upload = await checkUploadAllowed(fakeDb(() => down) as never, store, 1024)
    check("checkUploadAllowed: a failed plan read refuses with a true reason, never Free's limits", upload.allowed === false && /not answering/.test((upload as { reason: string }).reason))
    const plan = read("lib/sites/plan-server.ts")
    check("creatorSitePlan: a failed read throws (dataOrThrow), never Free; only no row is Free", /dataOrThrow\("site plan"/.test(plan) && !/catch \{\s*return "free"/.test(plan))
    for (const f of ["app/api/sites/route.ts", "app/api/sites/[siteId]/agent/route.ts", "app/api/themes/marketplace/add/route.ts"]) {
      check(`  ${f}: a plan that could not be read is 503, not the Free gate`, /creatorSitePlan\([^)]*\)\.catch\(\(\) => null\)[^\n]*\n\s*if \(plan === null\) return storeUnavailableResponse\(\)/.test(read(f)))
    }
    check("  /api/domains: a plan that could not be read is 503, never \"upgrade\"", (read("app/api/domains/route.ts").match(/if \(isServiceUnavailable\(error\)\) return storeUnavailableResponse\(\)/g) ?? []).length >= 2)
    for (const f of ["lib/communities/server/creator.ts", "lib/communities/server/creator-policies.ts"]) {
      check(`  ${f}: a community is never refused or taken back on a plan nobody could read`, /communityRoom\(db, a\.creatorId\)\.catch\(\(\) => null\)/.test(read(f)) && /within === null \? no\(503/.test(read(f)))
    }
    check("  undoing a deletion: the claim goes back on a plan nobody could read", /if \(room === "failed"\) \{[\s\S]{0,300}state: "scheduled"/.test(read("lib/communities/server/community-deletion.ts")))
    check("Billing: a store read that failed is 503, never \"Not signed in\"", /if \(overview === "unavailable"\) return storeUnavailableResponse\(\)/.test(read("app/api/billing/overview/route.ts")) && /dataOrThrow\("billing creator"/.test(read("lib/billing/request-reads.ts")))
    check("  the upgrade page never draws a paying store as Free with every plan on offer", /if \(isServiceUnavailable\(error\)\) throw error/.test(read("app/(storelib)/app/settings/billing/upgrade/page.tsx")) && /dataOrThrow\(\s*"upgrade creator"/.test(read("app/(storelib)/app/settings/billing/upgrade/page.tsx")))
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
