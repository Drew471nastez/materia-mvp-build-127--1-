/**
 * ===========================================================================
 *  ROUND Y2: A TEAM MEMBER LANDS IN THE TEAM STORE, NEVER IN ONBOARDING
 * ===========================================================================
 * The owner: "if I joined a team by invite and I try to go to my dashboard
 * I'm always redirected to /sell to start onboarding ... when I click Not now
 * there, take me back to the team I was in." The decisions are pure
 * (lib/team/landing.ts, lib/auth/continue.ts), so they are run here; the
 * wiring (the layout, the pages, /sell, the route) is checked from source.
 *
 *   npx tsx tests/team-landing.test.ts
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { appLanding, ownAccountHref, pickTeamStore, safeAppNext, sellLeaveHref, teamHomeDecision, teamHomeHref, TEAM_HOME_PATH } from "../lib/team/landing"
import { destinationAfterAuth } from "../lib/auth/continue"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, got?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
}
const eq = (name: string, got: unknown, want: unknown) => check(name, JSON.stringify(got) === JSON.stringify(want), got)
const root = join(__dirname, "..")
const read = (p: string) => readFileSync(join(root, p), "utf8")

const STORE = "11111111-2222-4333-8444-555555555555"
const OTHER = "99999999-2222-4333-8444-555555555555"

console.log("\nOpening /app (appLanding)\n")
eq("an owner with their store: their own dashboard", appLanding({ acting: false, ownAccess: true, memberships: 0, path: "/app" }), { kind: "own" })
eq("an owner who is also on a team, no team cookie: still their own dashboard", appLanding({ acting: false, ownAccess: true, memberships: 2, path: "/app" }), { kind: "own" })
eq("a member working in the team store: that store's dashboard", appLanding({ acting: true, ownAccess: false, memberships: 1, path: "/app" }), { kind: "team" })
eq("a team only member with no cookie: back into the team store, never /sell", appLanding({ acting: false, ownAccess: false, memberships: 1, path: "/app" }), { kind: "adopt", to: TEAM_HOME_PATH })
eq("  and to the page they opened", appLanding({ acting: false, ownAccess: false, memberships: 1, path: "/app/orders/7" }), { kind: "adopt", to: `${TEAM_HOME_PATH}?next=%2Fapp%2Forders%2F7` })
eq("a member with a setup begun and not finished: the team store too", appLanding({ acting: false, ownAccess: false, memberships: 1, path: "/app" }).kind, "adopt")
eq("a brand new account, no store, no team: /sell", appLanding({ acting: false, ownAccess: false, memberships: 0, path: "/app" }), { kind: "sell" })

console.log("\n/api/team/home (teamHomeDecision)\n")
const rows = [
  { creatorId: OTHER, acceptedAt: "2026-09-01T10:00:00Z" },
  { creatorId: STORE, acceptedAt: "2026-10-01T10:00:00Z" },
]
eq("signed out: log in", teamHomeDecision({ signedIn: false, ownAccess: false, rows, wanted: null, cookie: null, next: "/app" }), { kind: "login" })
eq("an owner is sent on untouched, no cookie written", teamHomeDecision({ signedIn: true, ownAccess: true, rows, wanted: STORE, cookie: null, next: "/app/orders" }), { kind: "go", to: "/app/orders" })
eq("a member: the store joined last is set, then the page", teamHomeDecision({ signedIn: true, ownAccess: false, rows, wanted: null, cookie: null, next: "/app/orders" }), { kind: "set", store: STORE, to: "/app/orders" })
eq("  the store asked for, when they are on it", teamHomeDecision({ signedIn: true, ownAccess: false, rows, wanted: OTHER, cookie: null, next: "/app" }), { kind: "set", store: OTHER, to: "/app" })
eq("  a store they are not on is never set: theirs instead", teamHomeDecision({ signedIn: true, ownAccess: false, rows, wanted: "aaaaaaaa-2222-4333-8444-555555555555", cookie: null, next: "/app" }), { kind: "set", store: STORE, to: "/app" })
eq("on no team: /sell", teamHomeDecision({ signedIn: true, ownAccess: false, rows: [], wanted: STORE, cookie: null, next: "/app" }), { kind: "sell" })
eq("no loop: asked again for the store the cookie already names ends on /sell", teamHomeDecision({ signedIn: true, ownAccess: false, rows, wanted: null, cookie: STORE, next: "/app" }), { kind: "sell" })
eq("  an outside address is never followed", teamHomeDecision({ signedIn: true, ownAccess: false, rows, wanted: null, cookie: null, next: "https://evil.example/app" }), { kind: "set", store: STORE, to: "/app" })
for (const bad of ["//evil.example/app", "/app/../admin", "/apps", "/explore", "/app\\evil", "javascript:alert(1)", "/app/ x"]) check(`  safeAppNext(${JSON.stringify(bad)}) is /app`, safeAppNext(bad) === "/app", safeAppNext(bad))
check("  a real dashboard page is kept, with its query", safeAppNext("/app/orders?status=open") === "/app/orders?status=open")
eq("pickTeamStore with nothing: null", pickTeamStore([], STORE), null)
check("teamHomeHref drops a store that is not an id", teamHomeHref("/app", "not-an-id") === TEAM_HOME_PATH && teamHomeHref("/app", STORE) === `${TEAM_HOME_PATH}?store=${STORE}`)

console.log("\nNot now on /sell (sellLeaveHref) and Back to my account (ownAccountHref)\n")
eq("a member presses Not now: back to the team store they came from", sellLeaveHref({ memberships: 1, team: STORE, fallback: "/explore" }), `${TEAM_HOME_PATH}?store=${STORE}`)
eq("  with no store named: the team store, never Discover", sellLeaveHref({ memberships: 1, team: null, fallback: "/explore" }), TEAM_HOME_PATH)
eq("anyone else: where they came from, as before", sellLeaveHref({ memberships: 0, team: STORE, fallback: "/p/x" }), "/p/x")
eq("a member with their own dashboard: Back to my account is /app", ownAccountHref({ ownAccess: true, actingIn: STORE }), "/app")
eq("a member with no store of their own: their setup, carrying the store to come back to", ownAccountHref({ ownAccess: false, actingIn: STORE }), `/sell?team=${STORE}`)
eq("  never a store that is not an id", ownAccountHref({ ownAccess: false, actingIn: "x" }), "/sell")

console.log("\nSigning in (destinationAfterAuth)\n")
const NONE = { state: "none" } as const
const SELLER = { state: "seller" } as const
eq("an owner signs in: /app", destinationAfterAuth({ intent: null, next: null }, SELLER), "/app")
eq("a team member signs in with a link into /app: that page, not /sell", destinationAfterAuth({ intent: null, next: "/app/orders/7" }, NONE, { teamMember: true }), "/app/orders/7")
eq("  with nothing else to go to: the dashboard", destinationAfterAuth({ intent: null, next: null }, NONE, { teamMember: true }), "/app")
eq("  Sell on Storelib still opens onboarding for them", destinationAfterAuth({ intent: "sell", next: null }, NONE, { teamMember: true }), "/sell")
eq("a brand new account with a link into /app: /sell, as before", destinationAfterAuth({ intent: null, next: "/app/orders/7" }, NONE), "/sell")
eq("  and with nothing: Discover, as before", destinationAfterAuth({ intent: null, next: null }, NONE), "/explore")

console.log("\nThe wiring\n")
{
  const layout = read("app/app/layout.tsx")
  check("the dashboard asks appLanding with the memberships it already read, and adopts before /sell", /appLanding\(\{ acting: !!teamStore, ownAccess, memberships: memberOf\.length/.test(layout) && /if \(landing\.kind === "adopt"\) redirect\(landing\.to\)/.test(layout) && layout.indexOf('landing.kind === "adopt"') < layout.indexOf('redirect("/sell")'))
  check("  own access is the account's own store, never the team store's", /const ownAccess = !!ownCreator && hasSellerAccess\(sellerAccessFrom\(\{ creator: ownCreator, profile: gateCheck \}\)\)/.test(layout))
  check("  Back to my account opens their own home (ownAccountHref)", /ownHome=\{ownAccountHref\(\{ ownAccess, actingIn: acting\.creatorId \}\)\}/.test(layout) && /window\.location\.href = ownHome/.test(read("components/app/team-bar.tsx")))
  const pages = ["offers", "reviews", "files", "integrations", "inventory", "support", "products/collections", "coupons", "coupons/new", "coupons/[id]"]
  const left = pages.filter((p) => /redirect\("\/sell"\)/.test(read(`app/app/${p}/page.tsx`)) || !/return noStorePage\("\/app\//.test(read(`app/app/${p}/page.tsx`)))
  check("every /app page that sent a storeless account to /sell asks noStorePage instead", left.length === 0, left)
  const server = read("lib/team/server.ts")
  check("  noStorePage: in a team store, nothing (the team bar says what the role has); on a team, back into it; else /sell", /if \(acting\) return null/.test(server) && /if \(rows\.length > 0\) redirect\(teamHomeHref\(path\)\)/.test(server))
  const route = read("app/api/team/home/route.ts")
  check("/api/team/home writes the same cookie as accepting an invite, from the decision only", /teamHomeDecision\(/.test(route) && /res\.cookies\.set\(TEAM_STORE_COOKIE, decision\.store, \{ httpOnly: true, sameSite: "lax", secure: true, path: "\/", maxAge: 60 \* 60 \* 24 \* 90 \}\)/.test(route))
  check("  only memberships the database has, of stores that still exist", /\.eq\("user_id", userId\)\.eq\("status", "active"\)/.test(server) && /memberRowsOf\(db, user\.id\)/.test(route))
  const sell = read("app/(auth)/sell/page.tsx")
  check("/sell's Not now goes back to the team store for a member", /sellLeaveHref\(\{/.test(sell) && /fallback: \[next, fromReferer\]\.find\(\(p\) => p && !isApp\(p\)\) \?\? BUYER_HOME/.test(sell))
  check("the switcher's own account opens its setup when it has no store (no bounce back into the team)", /openTeam\(null, b\.userId, ownAccountHref\(\{ ownAccess: b\.ready, actingIn: actingIn\.creatorId \}\)\)/.test(read("components/app/business-switcher.tsx")))
  for (const f of ["app/auth/continue/route.ts", "app/auth/callback/route.ts"]) check(`${f} tells destinationAfterAuth about the team`, /destinationAfterAuth\(carry, access, \{ teamMember \}\)/.test(read(f)) && /const teamMember = !hasSellerAccess\(access\) && \(await onATeam\(/.test(read(f)))
}

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed > 0) process.exit(1)
