/**
 * ===========================================================================
 *  ONE ACCOUNT, BUYER FIRST, AND SELL ON STORELIB THAT SURVIVES SIGNING IN
 * ===========================================================================
 * The owner's model (the account model big platforms use):
 *
 *   Sign up   one /signup, lands in the buyer side (Discover).
 *   Log in    one /login; Storelib knows whether the account sells.
 *   Sell      /sell. Signed out, it goes through the same signup or login
 *             and remembers why, then continues into seller onboarding.
 *   /app      for sellers; anybody else who opens it is sent to /sell.
 *
 * The decisions are pure functions (lib/auth/continue.ts,
 * lib/account/seller-access.ts), so they are executed here, including every
 * hop the intent has to survive and every shape of `next` that has been used
 * to smuggle an open redirect. The wiring (which screen calls which) is
 * checked from source at the end.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import {
  BUYER_HOME,
  SELLER_HOME,
  SELL_PATH,
  continueHref,
  decodeCarry,
  destinationAfterAuth,
  encodeCarry,
  readCarry,
  readIntent,
  safeNext,
  sameOriginPath,
  sellDecision,
  withCarry,
  type AuthCarry,
} from "../lib/auth/continue"
import { hasSellerAccess, sellerAccessFrom, type SellerAccess } from "../lib/account/seller-access"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail?: string) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; failures.push(label + (detail ? `: ${detail}` : "")); console.log(`  FAIL  ${label}${detail ? `: ${detail}` : ""}`) }
}
function eq(label: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  check(label, ok, ok ? undefined : `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`)
}

const MAIN = "storelib.com"
const root = process.cwd()
const read = (p: string) => readFileSync(join(root, p), "utf8")
/** Source without comments, so a sentence about a thing is not mistaken for the thing. */
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1")

const NONE: SellerAccess = { state: "none" }
const STARTED: SellerAccess = { state: "started" }
const SELLER: SellerAccess = { state: "seller" }
const carry = (intent: "sell" | null, next: string | null): AuthCarry => ({ intent, next })
/** The query of a path, as the next screen reads it. */
const paramsOf = (href: string) => new URLSearchParams(href.split("?")[1]?.split("#")[0] ?? "")

function main() {
  console.log("\n  seller access: one definition")

  eq("no creator row, no old flag: a buyer who never started", sellerAccessFrom({ creator: null, profile: { is_creator: false } }), NONE)
  eq("a finished creator row: a seller", sellerAccessFrom({ creator: { onboarding_completed: true }, profile: { is_creator: true } }), SELLER)
  eq("a creator row not finished (the paid plan placeholder): started, not a seller", sellerAccessFrom({ creator: { onboarding_completed: false }, profile: null }), STARTED)
  eq("the old I'm a creator flag with no row behind it: started, not a seller", sellerAccessFrom({ creator: null, profile: { is_creator: true } }), STARTED)
  eq("a finished row wins over anything the profile says", sellerAccessFrom({ creator: { onboarding_completed: true }, profile: { is_creator: false } }), SELLER)
  check("only a seller has seller access", hasSellerAccess(SELLER) && !hasSellerAccess(STARTED) && !hasSellerAccess(NONE) && !hasSellerAccess(null))
  check("welcome_completed plays no part (the creator or buyer question is gone)",
    !/welcome_completed/.test(code("lib/account/seller-access.ts")))

  console.log("\n  the intent")

  check("sell is the intent", readIntent("sell") === "sell" && readIntent(" SELL ") === "sell")
  check("anything else is none", readIntent("admin") === null && readIntent("") === null && readIntent(null) === null && readIntent(["sell"]) === null)

  console.log("\n  next: ours, never an open redirect, never a loop")

  const ok = (v: unknown) => safeNext(v, MAIN)
  check("a path on the platform", ok("/library") === "/library" && ok("/p/abc?x=1") === "/p/abc?x=1")
  check("a creator's subdomain (the shop Account button)", ok("https://andrew.storelib.com/cart") !== null)
  for (const bad of [
    "https://evil.com",
    "//evil.com",
    "/\\evil.com",
    "https://storelib.com@evil.com/",
    "https://storelib.com.evil.com/",
    "https://notstorelib.com/",
    "javascript:alert(1)",
    "data:text/html,hi",
    "http://storelib.com/library",
    "/library\nhttps://evil.com",
    "",
  ]) check(`refused: ${JSON.stringify(bad)}`, ok(bad) === null)
  for (const loop of ["/login", "/login?next=/x", "/signup", "/signup/verify?userId=1", "/auth/continue", "/auth/callback", "/sell", "/onboarding", "/welcome", "/reset-password", "/request", "/native-start", "/verify-email"]) {
    check(`an auth screen is no destination: ${loop}`, ok(loop) === null)
  }
  check("but a page that merely starts with the same letters is", ok("/selling-tips") === "/selling-tips" && ok("/signups") === "/signups")
  eq("the receipt page's older `redirect` is read as next", readCarry(new URLSearchParams("redirect=/receipt/9"), MAIN), carry(null, "/receipt/9"))
  eq("next wins over redirect", readCarry(new URLSearchParams("next=/library&redirect=/receipt/9"), MAIN), carry(null, "/library"))
  eq("a bad next and a bad intent both vanish", readCarry(new URLSearchParams("intent=admin&next=https://evil.com"), MAIN), carry(null, null))

  console.log("\n  a path for `${origin}${next}` is a path")

  check("a path stays", sameOriginPath("/auth/continue?intent=sell", "/app") === "/auth/continue?intent=sell")
  for (const bad of ["@evil.com", "//evil.com", "/\\evil.com", "https://evil.com", "javascript:alert(1)", ".evil.com", "/a b", null]) {
    check(`falls back: ${JSON.stringify(bad)}`, sameOriginPath(bad, "/app") === "/app")
  }

  console.log("\n  carrying it onto a link")

  eq("nothing to carry leaves a link alone", withCarry("/login", carry(null, null)), "/login")
  eq("sell onto signup", withCarry("/signup", carry("sell", null)), "/signup?intent=sell")
  eq("both, encoded", withCarry("/signup", carry("sell", "/p/a?b=1")), "/signup?intent=sell&next=%2Fp%2Fa%3Fb%3D1")
  eq("kept beside what the link already has", withCarry("/auth/start?provider=google", carry("sell", null)), "/auth/start?provider=google&intent=sell")
  eq("the continue link", continueHref(carry("sell", "/library")), "/auth/continue?intent=sell&next=%2Flibrary")

  console.log("\n  where signing in ends (destinationAfterAuth)")

  const table: [string, AuthCarry, SellerAccess, string][] = [
    ["sell, seller, nothing else: the dashboard", carry("sell", null), SELLER, SELLER_HOME],
    ["sell, seller, a deep link into /app: that page", carry("sell", "/app/products/1"), SELLER, "/app/products/1"],
    ["sell, seller, next elsewhere: still the dashboard", carry("sell", "/library"), SELLER, SELLER_HOME],
    ["sell, buyer: seller onboarding", carry("sell", null), NONE, SELL_PATH],
    ["sell, buyer, with a page to go back to: onboarding, carrying it", carry("sell", "/p/x"), NONE, "/sell?next=%2Fp%2Fx"],
    ["sell, half onboarded: onboarding again", carry("sell", null), STARTED, SELL_PATH],
    ["sell, buyer, next into /app: onboarding, not a loop", carry("sell", "/app"), NONE, SELL_PATH],
    ["plain signup or login, buyer: Discover", carry(null, null), NONE, BUYER_HOME],
    ["plain login, half onboarded: a buyer, so Discover", carry(null, null), STARTED, BUYER_HOME],
    ["plain login, seller: the dashboard", carry(null, null), SELLER, SELLER_HOME],
    ["plain login from a page: back to it, buyer", carry(null, "/p/x"), NONE, "/p/x"],
    ["plain login from a page: back to it, seller", carry(null, "/explore"), SELLER, "/explore"],
    ["a seller's deep link into /app survives login", carry(null, "/app/orders/7?tab=x"), SELLER, "/app/orders/7?tab=x"],
    ["a buyer's link into /app goes to /sell", carry(null, "/app/orders/7"), NONE, SELL_PATH],
    ["back to a creator's shop", carry(null, "https://andrew.storelib.com/cart"), NONE, "https://andrew.storelib.com/cart"],
  ]
  for (const [label, c, a, want] of table) eq(label, destinationAfterAuth(c, a), want)

  console.log("\n  /sell (sellDecision)")

  const u = { id: "u1", email: "a@b.co" }
  eq("logged out: signup, remembering sell", sellDecision({ user: null, emailVerified: false, access: NONE, next: null }), { kind: "redirect", to: "/signup?intent=sell" })
  eq("logged out with a page to return to", sellDecision({ user: null, emailVerified: false, access: NONE, next: "/p/x" }), { kind: "redirect", to: "/signup?intent=sell&next=%2Fp%2Fx" })
  eq("signed in, address not verified: the code, remembering sell", sellDecision({ user: u, emailVerified: false, access: NONE, next: null }), { kind: "redirect", to: "/signup/verify?userId=u1&email=a%40b.co&intent=sell" })
  eq("a buyer: onboarding", sellDecision({ user: u, emailVerified: true, access: NONE, next: null }), { kind: "onboarding" })
  eq("half onboarded: onboarding resumes", sellDecision({ user: u, emailVerified: true, access: STARTED, next: null }), { kind: "onboarding" })
  eq("a seller: /app", sellDecision({ user: u, emailVerified: true, access: SELLER, next: null }), { kind: "redirect", to: "/app" })

  console.log("\n  the intent survives every hop")

  // Sell on Storelib, signed out -> /signup
  const toSignup = (sellDecision({ user: null, emailVerified: false, access: NONE, next: "/p/x" }) as { to: string }).to
  const onSignup = readCarry(paramsOf(toSignup), MAIN)
  eq("  /sell -> /signup", onSignup, carry("sell", "/p/x"))
  // /signup -> Log in link -> /login
  const onLogin = readCarry(paramsOf(withCarry("/login", onSignup)), MAIN)
  eq("  /signup -> Log in -> /login", onLogin, carry("sell", "/p/x"))
  // /login -> Sign up link and back
  eq("  /login -> Sign up -> /signup", readCarry(paramsOf(withCarry("/signup", onLogin)), MAIN), carry("sell", "/p/x"))
  // email signup -> the code page
  const verifyHref = withCarry("/signup/verify?userId=u1&email=a%40b.co&sent=1", onSignup)
  const onVerify = readCarry(paramsOf(verifyHref), MAIN)
  eq("  /signup -> /signup/verify (email code)", onVerify, carry("sell", "/p/x"))
  check("  the code page keeps its own parameters", paramsOf(verifyHref).get("userId") === "u1" && paramsOf(verifyHref).get("sent") === "1")
  // code page -> /auth/continue -> onboarding
  const onContinue = readCarry(paramsOf(continueHref(onVerify)), MAIN)
  eq("  /signup/verify -> /auth/continue -> /sell", destinationAfterAuth(onContinue, NONE), "/sell?next=%2Fp%2Fx")
  // OAuth on the web and the Android Custom Tab: /auth/start -> cookie -> /auth/callback
  const startHref = withCarry("/auth/start?provider=google", onLogin)
  const cookie = encodeCarry(readCarry(paramsOf(startHref), MAIN))
  eq("  Google or Apple: /auth/start -> cookie -> /auth/callback", decodeCarry(cookie, MAIN), carry("sell", "/p/x"))
  eq("  a new Google account with sell goes into onboarding", destinationAfterAuth(decodeCarry(cookie, MAIN), NONE), "/sell?next=%2Fp%2Fx")
  eq("  a tampered cookie is checked again", decodeCarry("intent=sell&next=https%3A%2F%2Fevil.com", MAIN), carry("sell", null))
  eq("  no cookie is nothing", decodeCarry(undefined, MAIN), carry(null, null))
  // Native OAuth: the page keeps the same encoded value, native-oauth reads it
  eq("  native OAuth: kept in the page, read after the deep link", decodeCarry(encodeCarry(onLogin), MAIN), carry("sell", "/p/x"))
  // Native session sync: /auth/sync-session?next=/auth/continue?...
  const syncNext = sameOriginPath(continueHref(onLogin), "/app")
  eq("  native: sync-session follows /auth/continue with the carry", readCarry(paramsOf(syncNext), MAIN), carry("sell", "/p/x"))
  // Password reset: /login -> /request -> email link -> /reset-password -> /login
  const onRequest = readCarry(paramsOf(withCarry("/request", onLogin)), MAIN)
  const emailLink = `https://storelib.com/reset-password?code=abc&${encodeCarry({ intent: readIntent(onRequest.intent), next: safeNext(onRequest.next, MAIN) })}`
  const onReset = readCarry(new URL(emailLink).searchParams, MAIN)
  eq("  password reset: /request -> the email's link -> /reset-password", onReset, carry("sell", "/p/x"))
  eq("  and the reset ends on the same login", readCarry(paramsOf(withCarry("/login", onReset)), MAIN), carry("sell", "/p/x"))
  eq("  the app's reset deep link carries it too", readCarry(paramsOf(withCarry("storelib://reset-password?code=abc", onReset)), MAIN), carry("sell", "/p/x"))
  // Native welcome screen
  eq("  the app's welcome screen -> Sign up", readCarry(paramsOf(withCarry("/signup", readCarry(paramsOf("/welcome?intent=sell"), MAIN))), MAIN), carry("sell", null))
  // A plain signup never picks it up
  eq("  a plain signup carries nothing and lands on Discover", destinationAfterAuth(readCarry(paramsOf(continueHref(readCarry(paramsOf("/signup"), MAIN))), MAIN), NONE), BUYER_HOME)

  console.log("\n  wiring (from source)")

  const signup = code("app/(auth)/signup/page.tsx")
  check("signup: Google and Apple carry it to /auth/start",
    /withCarry\("\/auth\/start\?provider=google", carry\)/.test(signup) && /withCarry\("\/auth\/start\?provider=apple", carry\)/.test(signup) && !/next=\/app/.test(signup))
  check("signup: the email code page and Log in carry it",
    /withCarry\(`\/signup\/verify\?userId=\$\{data\.user\.id\}[^`]*`, carry\)/.test(signup) && /const loginHref = withCarry\("\/login", carry\)/.test(signup))
  check("signup: nobody is sent to the creator or buyer question, and a new profile is a buyer",
    !/signup\/success/.test(signup) && /welcome_completed: true/.test(signup) && /goOnAfterAuth\(carry, session\)/.test(signup))
  check("signup: the native Apple sheet remembers it", /rememberNativeCarry\(carry\)[\s\S]{0,80}Browser\.open/.test(signup))

  const login = code("app/(auth)/login/page.tsx")
  check("login: Sign up, Forgot password, Google and Apple all carry it",
    /withCarry\("\/signup", carry\)/.test(login) && /withCarry\("\/request", carry\)/.test(login)
      && /withCarry\("\/auth\/start\?provider=google", carry\)/.test(login) && /withCarry\("\/auth\/start\?provider=apple", carry\)/.test(login))
  check("login: both native sheets remember it", (login.match(/rememberNativeCarry\(carry\)\s*await Browser\.open/g) ?? []).length === 2)
  check("login: signed in (either way) ends at /auth/continue, not a client side guess",
    /goOnAfterAuth\(carry, gateSession\)/.test(login) && /goOnAfterAuth\(carry, data\.session\)/.test(login)
      && !/signup\/success/.test(login) && !/from\("creators"\)/.test(login) && !/next=\/app/.test(login))

  const verify = code("app/(auth)/signup/verify/page.tsx")
  check("the email code page goes on with the carry", /readCarry\(searchParams, getMainDomain\(\)\)/.test(verify) && /goOnAfterAuth\(carry, data\.session\)/.test(verify) && !/signup\/success/.test(verify))
  check("the other verify page too", /continueHref\(readCarry\(searchParams, getMainDomain\(\)\)\)/.test(code("app/(auth)/verify-email/verify-email-content.tsx")))

  const start = code("app/auth/start/route.ts")
  check("/auth/start keeps the carry in a short lived httpOnly cookie",
    /response\.cookies\.set\(CARRY_COOKIE, carry, \{[\s\S]*httpOnly: true[\s\S]*maxAge: carry \? CARRY_MAX_AGE_SECONDS : 0/.test(start))
  const callback = code("app/auth/callback/route.ts")
  check("/auth/callback reads it once and decides with the shared table",
    /decodeCarry\(jar\.get\(CARRY_COOKIE\)\?\.value/.test(callback) && /jar\.delete\(CARRY_COOKIE\)/.test(callback)
      && /destinationAfterAuth\(carry, access\)/.test(callback) && !/signup\/success/.test(callback) && /welcome_completed: true/.test(callback))
  const cont = code("app/auth/continue/route.ts")
  check("/auth/continue: signed out to login, unverified to the code, else the table",
    /if \(!user\) return go\(withCarry\("\/login", carry\)\)/.test(cont) && /\/signup\/verify\?userId=/.test(cont) && /destinationAfterAuth\(carry, access\)/.test(cont))
  check("sync-session and the App Link follow a path only",
    /sameOriginPath\(searchParams\.get\("next"\), CONTINUE_PATH\)/.test(code("app/auth/sync-session/route.ts"))
      && /sameOriginPath\(searchParams\.get\("next"\), "\/app"\)/.test(code("app/app/auth/callback/route.ts"))
      && /sameOriginPath\(searchParams\.get\("next"\), "\/app"\)/.test(code("app/auth/app-callback/page.tsx")))

  const native = code("lib/native-oauth.ts")
  check("native OAuth hands the carry to /auth/continue through sync-session",
    /const carry = takeNativeCarry\(\)/.test(native) && /const nextPath = continueHref\(carry\)/.test(native) && !/nextPath = "\/signup\/success"/.test(native))
  check("the app's cold start: seller to /app, anybody else to the library (a home the installed offline shell knows)",
    /hasSellerAccess\(await readSellerAccess\(supabase, session\.user\.id\)\) \? "\/app" : "\/library"/.test(code("app/native-start/page.tsx"))
      && !/safeRedirect\("\/signup\/success"\)/.test(code("app/native-start/page.tsx")))

  const sell = code("app/(auth)/sell/page.tsx")
  check("/sell decides on the server with sellDecision", !/^"use client"/.test(read("app/(auth)/sell/page.tsx")) && /sellDecision\(\{ user, emailVerified: !!profile\?\.email_verified, access, next \}\)/.test(sell) && /if \(decision\.kind === "redirect"\) redirect\(decision\.to\)/.test(sell))
  check("/sell: Not now never goes to /app", /find\(\(p\) => p && !isApp\(p\)\) \?\? BUYER_HOME/.test(sell))
  check("/sell opens the onboarding with no second check and the same first frame as its loading",
    /<CreatorOnboardingModal[\s\S]*open=\{open\}[\s\S]*leave=\{\{ label: "Not now", href: leaveHref \}\}/.test(code("app/(auth)/sell/sell-onboarding.tsx"))
      && !/auth\.get(User|Session)/.test(code("app/(auth)/sell/sell-onboarding.tsx"))
      && /AuthResolvingScreen/.test(code("app/(auth)/sell/loading.tsx")))
  check("a paid plan's checkout comes back to /sell",
    /successUrl: `\$\{origin\}\/sell\?stripe_success=1&tier=\$\{planId\}`/.test(code("components/app/creator-onboarding-modal.tsx")) && /cancelUrl: `\$\{origin\}\/sell`/.test(code("components/app/creator-onboarding-modal.tsx")))

  const app = code("app/app/layout.tsx")
  check("/app: no seller access goes to /sell, and the role gate is gone",
    /if \(!creator \|\| !hasSellerAccess\(sellerAccessFrom\(\{ creator, profile: gateCheck \}\)\)\) \{\s*redirect\("\/sell"\)/.test(app) && !/roleSelected/.test(app) && !/signup\/success/.test(app))
  for (const layout of ["app/library/layout.tsx", "app/dashboard/layout.tsx", "app/creator-page/layout.tsx"]) {
    check(`${layout}: a buyer is not sent to the creator or buyer question`, !/roleSelected/.test(code(layout)) && !/signup\/success/.test(code(layout)))
  }
  check("/app pages with no creator row go to /sell, not the old chooser",
    ["app/app/reviews/page.tsx", "app/app/coupons/page.tsx", "app/app/coupons/new/page.tsx", "app/app/coupons/[id]/page.tsx", "app/app/settings/billing/upgrade/page.tsx"].every((f) => !/signup\/success/.test(code(f))))
  const proxy = code("proxy.ts")
  check("a signed out deep link into /app keeps its page as next",
    /url\.pathname = "\/login"\s*url\.search = ""\s*url\.searchParams\.set\("next", `\$\{request\.nextUrl\.pathname\}\$\{request\.nextUrl\.search\}`\)/.test(proxy))
  check("/sell signed out is a real 307 to sign up before anything streams",
    /request\.nextUrl\.pathname === "\/sell" && shouldSendToLogin\(current\)/.test(proxy)
      && /url\.pathname = "\/signup"[\s\S]{0,120}url\.searchParams\.set\("intent", "sell"\)/.test(proxy)
      && proxy.indexOf('request.nextUrl.pathname === "/sell"') < proxy.indexOf("const guarded ="))
  check("/sell is a platform route on every host", /"\/sell",/.test(proxy) && /"sell", "signup"/.test(proxy) && /"sell",/.test(code("lib/routes/reserved-segments.ts")))

  check("/onboarding goes to /sell on the server", !/use client/.test(read("app/(auth)/onboarding/page.tsx")) && /redirect\(withCarry\(SELL_PATH/.test(code("app/(auth)/onboarding/page.tsx")))
  const success = code("app/(auth)/signup/success/page.tsx")
  check("/signup/success asks nothing: New business draws the setup, everything else is sent on",
    !/^"use client"/.test(read("app/(auth)/signup/success/page.tsx")) && /query\.get\("business"\) === "new"/.test(success)
      && /redirect\(withCarry\(`\$\{SELL_PATH\}/.test(success) && /redirect\(continueHref\(readCarry\(query, getMainDomain\(\)\)\)\)/.test(success)
      && !/I'm a buyer|I'm a creator|handleChoice/.test(code("app/(auth)/signup/success/success-content.tsx")))

  check("the reset email's link carries it, checked", /encodeCarry\(\{ intent: readIntent\(body\.intent\), next: safeNext\(body\.next, getMainDomain\(\)\) \}\)/.test(code("app/api/auth/request-password-reset/route.ts")))
  check("and the reset page ends on the login with it", /withCarry\("\/login", carry\)/.test(code("app/(auth)/reset-password/page.tsx")) && /withCarry\("\/welcome", carry\)/.test(code("app/(auth)/reset-password/page.tsx")))

  check("seller-access and the carry are safe in a client component",
    !/next\/headers|server-only/.test(read("lib/account/seller-access.ts")) && !/next\/headers|server-only/.test(read("lib/auth/continue.ts")) && !/next\/headers|server-only/.test(read("lib/auth/continue-client.ts")))

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) { console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`); process.exit(1) }
}
main()
