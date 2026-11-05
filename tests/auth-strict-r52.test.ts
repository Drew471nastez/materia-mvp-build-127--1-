/**
 * ===========================================================================
 *  ROUND 52: SUPABASE AUTH IS NOT A DEPENDENCY OF AN ORDINARY REQUEST
 * ===========================================================================
 * The owner: "We could not check your sign in just now. Try again in a
 * moment", on saves, publishes and settings across the platform, whenever
 * Supabase Auth had a slow minute. routeUser() defaulted to `fresh`, so every
 * change waited for a round trip to Auth (getUser), with retries, and was
 * refused when Auth was slow, though the page around it had the person.
 *
 *   1. The access token is checked here first, by its signature, expiry,
 *      issuer, audience and role (lib/auth/verify-token.ts), for page reads,
 *      route reads and ordinary changes alike; Auth is not asked.
 *   2. The strict list still asks Auth itself (routeUser({ fresh: true }) or
 *      a direct Auth read), named here route by route.
 *   3. A token that fails the check is never a user: forged, expired, wrong
 *      issuer. Auth's own "no" is final wherever Auth is asked.
 *   4. The user built from the token takes user_metadata and created_at from
 *      the session cookie (never app_metadata, email or email_confirmed_at),
 *      without supabase-js's "could be insecure" warning on every request.
 *   5. The server says once per instance which local check it has.
 *
 * scripts/check-auth-local-r52.mjs counts it against a slow (3s, 10s) or
 * down Auth: ordinary actions failing with "could not check your sign in",
 * before 8 of 40, after 0 of 40 (VERIFIER=hs256 or jwks).
 */
import { createHmac } from "node:crypto"
import { readCurrentUser, type CurrentUser } from "@/lib/auth/current-user"
import { forgetSigningKeys, userFromClaims, type VerifiedClaims } from "@/lib/auth/verify-token"
import { routeUserFrom } from "@/lib/auth/route-user"
import { isRecoveryToken } from "@/lib/auth/recovery-session"
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
    console.log(`  FAIL  ${name}${detail === undefined ? "" : ` — ${JSON.stringify(detail).slice(0, 300)}`}`)
  }
}

const URL_ = "https://abcdefgh.supabase.co"
const SECRET = "r52-unit-secret-of-plenty-of-length-0123456789"
const b64u = (s: string) => Buffer.from(s).toString("base64url")
const nowS = () => Math.floor(Date.now() / 1000)
function hs256(claims: Record<string, unknown>, secret = SECRET) {
  const h = b64u(JSON.stringify({ alg: "HS256", typ: "JWT" }))
  const p = b64u(JSON.stringify(claims))
  return `${h}.${p}.${createHmac("sha256", secret).update(`${h}.${p}`).digest("base64url")}`
}
const claims = (over: Record<string, unknown> = {}) => ({ iss: `${URL_}/auth/v1`, sub: "u1", aud: "authenticated", role: "authenticated", exp: nowS() + 600, email: "a@example.test", app_metadata: { provider: "email" }, user_metadata: { name: "Token name" }, ...over })

/* A supabase client shaped enough for readCurrentUser: getSession from "the cookie", getUser counting its calls. */
function fakeClient(token: string | null, getUserAnswer: "hang" | "ok" | "revoked", sessionUser: unknown = null) {
  const calls = { getUser: 0 }
  const client = {
    auth: {
      getSession: async () => ({ data: { session: token ? { access_token: token, user: sessionUser } : null }, error: null }),
      getUser: (jwt?: string) => {
        calls.getUser++
        void jwt
        if (getUserAnswer === "hang") return new Promise(() => {})
        if (getUserAnswer === "revoked") return Promise.resolve({ data: { user: null }, error: { name: "AuthApiError", status: 403, code: "session_not_found", message: "Session from session_id claim in JWT does not exist" } })
        return Promise.resolve({ data: { user: { id: "u1", email: "a@example.test", email_confirmed_at: "2026-01-01T00:00:00Z" } }, error: null })
      },
    },
  }
  return { client: client as unknown as Parameters<typeof readCurrentUser>[0], calls }
}
const local = (c: ReturnType<typeof fakeClient>) => readCurrentUser(c.client, { fallbackClaims: URL_, localFirst: true, timeoutMs: 300, firstTryMs: 200 })

async function main() {
  process.env.SUPABASE_JWT_SECRET = SECRET
  forgetSigningKeys()
  const realFetch = globalThis.fetch
  /* The JWKS: empty, as for a project on the shared secret. */
  globalThis.fetch = (async () => new Response(JSON.stringify({ keys: [] }), { status: 200, headers: { "content-type": "application/json" } })) as typeof fetch

  console.log("\n1. The token's signature first: Auth not asked, whatever it is doing")
  for (const mode of ["ok", "hang", "revoked"] as const) {
    const c = fakeClient(hs256(claims()), mode)
    const t = Date.now()
    const r = await local(c)
    check(`Auth ${mode}: the person, from the token (${Date.now() - t}ms), Auth asked ${c.calls.getUser} times`, r.user?.id === "u1" && r.verifiedBy === "claims" && c.calls.getUser === 0 && !r.reason, r)
  }
  {
    const r = await local(fakeClient(hs256(claims()), "hang"))
    check("  a route sees a user, not 'could not check'", routeUserFrom(r).kind === "user")
  }

  console.log("\n2. Nothing that fails the check is let in")
  for (const [label, token] of [
    ["expired", hs256(claims({ exp: nowS() - 120 }))],
    ["forged (another secret)", hs256(claims(), "an-attacker-secret-of-plenty-of-length-0123")],
    ["another project's issuer", hs256(claims({ iss: "https://other.supabase.co/auth/v1" }))],
    ["the anon role", hs256(claims({ role: "anon" }))],
    ["no audience", hs256(claims({ aud: "something" }))],
  ] as const) {
    const c = fakeClient(token, "hang")
    const r = await local(c)
    check(`${label}, Auth silent: not a user (${r.state})`, !r.user && r.state === "indeterminate" && c.calls.getUser >= 1, r)
    const revoked = await local(fakeClient(token, "revoked"))
    check(`  ${label}, Auth says no: anonymous`, !revoked.user && revoked.state === "anonymous", revoked)
  }
  {
    const r = await local(fakeClient(null, "ok"))
    check("no session: anonymous, Auth not asked", r.state === "anonymous" && !r.user)
  }

  console.log("\n3. Without a local verifier: Auth answers, exactly as before")
  delete process.env.SUPABASE_JWT_SECRET
  forgetSigningKeys()
  {
    const ok = fakeClient(hs256(claims()), "ok")
    const r = await local(ok)
    check("no secret, no keys: Auth asked, its user", r.user?.id === "u1" && r.verifiedBy === "user" && ok.calls.getUser === 1, r)
    const silent = await local(fakeClient(hs256(claims()), "hang"))
    check("  and Auth silent: could not tell, never a yes", !silent.user && silent.state === "indeterminate", silent)
  }
  process.env.SUPABASE_JWT_SECRET = SECRET
  forgetSigningKeys()

  console.log("\n4. The user from the token, with the cookie's own metadata")
  {
    const c = claims() as unknown as VerifiedClaims
    /* What supabase-js hands back on the server: the cookie's user inside a Proxy that warns on its first property get. */
    let warned = 0
    const cookieUser = new Proxy(
      { id: "u1", created_at: "2026-02-03T00:00:00Z", user_metadata: { name: "Saved name" }, app_metadata: { role: "admin" }, email: "attacker@example.test", email_confirmed_at: "2026-01-01T00:00:00Z" },
      { get: (t, k, r) => { if (typeof k === "string") warned++; return Reflect.get(t, k, r) } },
    )
    const u = userFromClaims(c, cookieUser)
    check("user_metadata from the cookie (fresh after a save)", (u.user_metadata as Record<string, unknown>).name === "Saved name", u.user_metadata)
    check("  created_at from the cookie", u.created_at === "2026-02-03T00:00:00Z", u.created_at)
    check("  app_metadata, email and role from the verified token only", (u.app_metadata as Record<string, unknown>).provider === "email" && !(u.app_metadata as Record<string, unknown>).role && u.email === "a@example.test" && u.role === "authenticated")
    check("  email_confirmed_at never taken from the cookie", !(u as unknown as Record<string, unknown>).email_confirmed_at)
    check("  the cookie read without the 'could be insecure' warning", warned === 0, warned)
    const other = userFromClaims(c, { id: "someone-else", user_metadata: { name: "Not mine" }, created_at: "2020-01-01T00:00:00Z" })
    check("  a cookie user of another account is ignored", (other.user_metadata as Record<string, unknown>).name === "Token name" && other.created_at === "", other)
    const viaRead = await local(fakeClient(hs256(claims()), "hang", { id: "u1", created_at: "2026-02-03T00:00:00Z", user_metadata: { name: "Saved name" } }))
    check("  readCurrentUser passes the cookie's user through", (viaRead.user?.user_metadata as Record<string, unknown>)?.name === "Saved name" && viaRead.user?.created_at === "2026-02-03T00:00:00Z", viaRead)
  }
  globalThis.fetch = realFetch

  console.log("\n5. Where it is decided: centrally")
  {
    const scope = readCode("lib/auth/request-scope.ts")
    const route = readCode("lib/auth/route-user.ts")
    check("currentUserForRequest checks the token here first", /readCurrentUser\(supabase, \{ fallbackClaims: url, localFirst: true \}\)/.test(scope))
    check("  fullUserForRequest keeps Auth first, the signature when Auth is slow", /export const fullUserForRequest[\s\S]*?readCurrentUser\(supabase, \{ fallbackClaims: process\.env\.NEXT_PUBLIC_SUPABASE_URL \?\? null \}\)/.test(scope))
    check("  the verifier mode is logged once per instance", /let verifierLogged/.test(scope) && /logLine\("auth_verifier"/.test(scope) && /void logVerifierOnce\(url\)/.test(scope))
    check("  a local answer with no Auth trouble is not logged as degraded", /current\.verifiedBy === "claims" && current\.reason \? "claims"/.test(scope))
    check("routeUser: not fresh unless asked", /routeUser\(\{ fresh = false, full = false \}/.test(route))
    check("  strict asks Auth first (the full read), then again before refusing", /oncePerRequest\("strict"[\s\S]*?await fullUserForRequest\(\)[\s\S]*?askAuthAgain/.test(route))
    const editor = readCode("lib/website-builder/owned-install.ts")
    check("the editor's save takes the request's read, not the strict one", /const current = await readerForRequest\(\)/.test(editor) && !/strictUserForRequest/.test(editor))
    check("shopCaller and physicalCaller: strict only when a route says so", /routeUser\(\{ fresh: opts\.strict === true \}\)/.test(readCode("lib/physical/auth.ts")))
    check("requireTeamPermission and domainOwner: the request's read", /const who = await routeUser\(\)/.test(readCode("lib/team/server.ts")) && /const who = await routeUser\(\)/.test(readCode("lib/custom-domains/owner.ts")))
    for (const f of ["app/api/account/time-zone/route.ts", "app/api/account/appearance/route.ts", "app/api/account/preferences/route.ts", "app/api/account/avatar/route.ts", "app/api/account/welcome/route.ts", "app/api/notifications/preferences/route.ts", "app/api/home/guide/route.ts", "app/api/home/progress/route.ts"]) {
      check(`  ${f}: the request's read`, /await readerForRequest\(\)/.test(readCode(f)) && !/readCurrentUser\(supabase\)/.test(readCode(f)))
    }
  }

  console.log("\n6. The strict list: Supabase Auth itself must answer")
  const STRICT: [string, string, RegExp][] = [
    ["account deletion", "app/api/auth/delete-account/route.ts", /routeUser\(\{ fresh: true \}\)/],
    ["email change, step one", "app/api/auth/change-email/route.ts", /await readCurrentUser\(supabase\)/],
    ["email change, step two", "app/api/auth/verify-email-change/route.ts", /await readCurrentUser\(supabase\)/],
    ["password changed", "app/api/auth/password-changed/route.ts", /await readCurrentUser\(supabase\)/],
    ["AI keys, save and remove", "app/api/ai-keys/route.ts", /routeUser\(\{ fresh: true \}\)[\s\S]*routeUser\(\{ fresh: true \}\)/],
    ["agent connection keys, make and end", "app/api/website-builder/themes/[installId]/agent-connections/route.ts", /ownInstall\(installId, \{ strict: true \}\)[\s\S]*ownInstall\(installId, \{ strict: true \}\)/],
    ["marketing integration keys", "app/api/store/integrations/marketing/route.ts", /shopCaller\("store", \{ strict: true \}\)/],
    ["tracking app keys", "app/api/store/tracking-app/route.ts", /physicalCaller\("store", \{ strict: true \}\)/],
    ["payout settings (currency, PayPal)", "app/api/settings/payments/route.ts", /routeUser\(\{ fresh: true \}\)/],
    ["payouts, bank details, billing and Stripe Connect (every manage through moneyCaller)", "lib/team/money.ts", /routeUser\(\{ fresh: level !== "view" && !opts\.read \}\)/],
    ["Stripe Connect disconnect", "app/api/stripe/connect/disconnect/route.ts", /routeUser\(\{ fresh: true \}\)/],
    ["refunds", "app/api/stripe/refund/route.ts", /routeUser\(\{ fresh: true \}\)/],
    ["team roles, invites and removals (requestUser)", "lib/businesses/server.ts", /auth\.getUser\(\)/],
    ["statement descriptor", "app/api/settings/statement-descriptor/route.ts", /auth\.getUser\(\)/],
    ["web push subscriptions (app_metadata merge)", "app/api/push/web/route.ts", /await readCurrentUser\(supabase\)/],
    ["admin (its own signed cookie, not Supabase)", "lib/admin/gate.ts", /isAdminAuthenticated/],
  ]
  for (const [what, file, re] of STRICT) check(`${what}: ${file}`, re.test(readCode(file)))
  for (const [file, re] of [["lib/team/money.ts", /routeUser\(\)/], ["app/api/auth/delete-account/route.ts", /routeUser\(\)/]] as const) {
    check(`  ${file} never takes the default`, !re.test(readCode(file)))
  }

  console.log("\n7. Reads that need what a token does not carry ask Auth first")
  for (const f of ["app/checkout/page.tsx", "app/checkout/physical/page.tsx", "app/account/library/page.tsx", "app/account/library/memberships/page.tsx", "app/account/library/memberships/[id]/page.tsx"]) {
    check(`${f}: fullUserForRequest (email_confirmed_at)`, /fullUserForRequest\(\)/.test(readCode(f)) && !/currentUserForRequest\(\)/.test(readCode(f)))
  }
  check("community checkout: routeUser({ full: true })", /routeUser\(\{ full: true \}\)/.test(readCode("app/api/community/[communityId]/checkout/route.ts")))

  console.log("\n8. Reset password: Back to log in ends a recovery session first (the owner's report)")
  {
    const tok = (amr: unknown) => `x.${Buffer.from(JSON.stringify({ sub: "u1", amr })).toString("base64url")}.y`
    check("a token from a reset link is a recovery session", isRecoveryToken(tok([{ method: "recovery", timestamp: 1 }])))
    check("  a password, OAuth or OTP session is not", !isRecoveryToken(tok([{ method: "password", timestamp: 1 }])) && !isRecoveryToken(tok([{ method: "oauth" }])) && !isRecoveryToken(tok([{ method: "otp" }])))
    check("  nothing, junk or no amr: not", !isRecoveryToken(null) && !isRecoveryToken("junk") && !isRecoveryToken(tok(undefined)))
    const page = readCode("app/(auth)/reset-password/page.tsx")
    check("both Back to log in links end a recovery session, then open /login", (page.match(/<BackToLogin \/>/g) ?? []).length === 2 && !/<a href="\/login"/.test(page) && /await endRecoverySession\(\)[\s\S]{0,80}window\.location\.assign\("\/login"\)/.test(page))
    check("  on this device only, and never held up by a slow Auth", /signOut\(\{ scope: "local" \}\)/.test(page) && /setTimeout\(r, 2_000\)/.test(page))
  }

  void ({} as CurrentUser)
  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) {
    console.log(failures.map((f) => `  - ${f}`).join("\n"))
    process.exit(1)
  }
}

main().catch((e) => {
  process.stdout.write(`${e instanceof Error ? e.stack : String(e)}\n`)
  process.exit(1)
})
