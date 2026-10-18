/**
 * ===========================================================================
 *  WHAT AN /app PAGE WAITS FOR ON THE SERVER
 * ===========================================================================
 * "It takes too much." The client half is the stage and the spinner
 * (tests/app-shell-motion.test.ts). This is the server half: a page is on
 * screen only when its last read has answered, so what matters is how many
 * reads it makes ONE AFTER ANOTHER. Every page asked the auth service who was
 * signed in (a network round trip) and then asked its questions in a line,
 * each waiting for the one before even when it needed nothing from it.
 *
 * Held here, per page, in round trips before and after (auth counts as one):
 *
 *   Home        4 -> 3   and its title no longer asks for the user and two
 *                        rows a second time (3 more reads, now shared)
 *   Products    4 -> 3   user, then creator and profile together, then products
 *   Settings    6 -> 3   (4 with the first visit's profile upsert)
 *   Payouts    ~10 -> 4  (5 outside USD, for the market rate)
 *   Customers   5 -> 4
 *   the layout  5 -> 4   on a full load; its user, profile and creator are
 *                        the pages' own answers through the request cache
 *
 * And what must not change while doing it: every read keeps its client (the
 * caller's own, under row-level security, or the service role where it was
 * already), and its filters. Nothing that read as the user reads as the
 * service role now.
 *
 * Run with:  npm run test:push
 */

import { readFileSync } from "node:fs"
import { join } from "node:path"

const root = process.cwd()
const read = (p: string) => readFileSync(join(root, p), "utf8")
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")
const flat = (s: string) => s.replace(/\s+/g, " ")

let passed = 0
let failed = 0
const failures: string[] = []
function check(name: string, ok: boolean) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    failures.push(name)
    console.log(`  FAIL  ${name}`)
  }
}
function section(title: string) {
  console.log(`\n${title}`)
}

/** The source of the first `Promise.all([` ... `])` after `from`, flattened. */
function batchAfter(src: string, from: RegExp): string {
  const at = src.search(from)
  if (at < 0) return ""
  const start = src.indexOf("Promise.all([", at)
  if (start < 0) return ""
  let depth = 0
  for (let i = start + "Promise.all(".length; i < src.length; i++) {
    if (src[i] === "[" || src[i] === "(") depth++
    else if (src[i] === "]" || src[i] === ")") {
      depth--
      if (depth === 0) return flat(src.slice(start, i + 1))
    }
  }
  return ""
}

/* The main destinations, and the one call none of them makes any more. */
const PAGES = [
  "app/app/page.tsx",
  "app/app/products/page.tsx",
  "app/app/orders/sales/page.tsx",
  "app/app/analytics/page.tsx",
  "app/app/payouts/page.tsx",
  "app/app/settings/_server.ts",
  "app/app/customers/page.tsx",
  "app/app/coupons/load-coupons.ts",
  "app/app/layout.tsx",
]

section("Who is signed in: asked once per request")
{
  for (const f of PAGES) {
    const src = code(f)
    /* pageUser() (lib/auth/page-user.ts) is the request cache with the one
       decision a page makes: /login only when Supabase said nobody. */
    check(`${f} asks through the request cache, not straight off the auth client`, /(currentUserForRequest|pageUser)\(\)/.test(src) && !/auth\.getUser\(\)/.test(src))
  }
  check("pageUser is the request cache, and redirects only on a definite nobody",
    /const current = await currentUserForRequest\(\)/.test(code("lib/auth/page-user.ts")) && /if \(shouldSendToLogin\(current\)\) redirect\(loginPath\)/.test(code("lib/auth/page-user.ts")))
  const scope = code("lib/auth/request-scope.ts")
  check("the cache is React's, per request", /export const currentUserForRequest = cache\(/.test(scope) && /export const creatorForRequest = cache\(/.test(scope) && /export const profileForRequest = cache\(/.test(scope))
  /* Changed with run-now part 63: a visitor's client may not name a private column at all (the
     select errors and the row came back empty, so /app sent every creator to /sell). The row is
     still found on the caller's own client; the service role reads only the private columns of
     the row that client returned, by its id. */
  check("the creator row it shares is read on the caller's own client, by their own user id; the service role only adds its private columns",
    /creatorForRequest = cache\(async \(userId: string\)[\s\S]{0,200}const supabase = await createClient\(\)[\s\S]{0,200}\.from\("creators"\)\.select\(SHELL_CREATOR_COLUMNS\)\.eq\("user_id", userId\)/.test(scope)
      /* Round 18: both halves are asked at once, the private one by the same signed in user's id
         (creators.user_id is unique, so it is the same row), and it is used only when the caller's
         own client returned the row (lib/perf/optimizations.ts). */
      && /createAdminClient\(\)\.from\("creators"\)\.select\(SHELL_PRIVATE_CREATOR_COLUMNS\)\.eq\("user_id", userId\)\.maybeSingle\(\),\s*\]\)\s*if \(!data\) return null/.test(scope)
      && (scope.match(/createAdminClient\(\)/g) || []).length === 1)
  {
    const cols = (name: string) => (scope.match(new RegExp(`const ${name} =\\s*"([^"]+)"`)) || [])[1]?.split(",").map((c) => c.trim()) ?? []
    const privateList = code("lib/security/public-columns.ts")
    check("the columns asked on the caller's client are none of part 63's private ones", cols("SHELL_CREATOR_COLUMNS").length > 5 && cols("SHELL_CREATOR_COLUMNS").every((c) => !new RegExp(`["']${c}["']`).test(privateList.slice(privateList.indexOf("PRIVATE_CREATOR_COLUMNS"), privateList.indexOf("PRIVATE_PROFILE_COLUMNS")))))
  }
}

section("The layout: everything that needs only the user, together")
{
  const layout = code("app/app/layout.tsx")
  /* Changed on purpose (round AA, Team): the account's own creator row is
     ownCreator, and a team member's store (lib/team/server teamStoreForRequest,
     checked against the membership in the database) is read in the same batch. */
  const first = batchAfter(layout, /const \[gateCheck, ownCreator/)
  check("the gates, the creator row and the OnePage are one batch",
    /profileForRequest\(user\.id\)/.test(first) && /creatorForRequest\(user\.id\)/.test(first) && /\.from\("onepages"\)/.test(first) && /teamStoreForRequest\(user\.id\)/.test(first))
  /* The header's photo is the profile's own (lib/account/avatar): the store
     header was read only to fall back to its photo, so it is not read at all. */
  check("and the store header is not read for a photo any more", !/store_builder_configs/.test(layout) && /profileAvatar\(profile\?\.avatar_url\)/.test(layout))
  /* Changed on purpose: there is no creator or buyer question any more, so no role gate; seller access (lib/account/seller-access.ts) sends anybody without it to /sell. */
  check("and the redirects are still decided in their order: verified, then seller access",
    /* Changed on purpose (round AA, Team): a member working in a store has the store's seller access. */
    /* Round Y2: seller access is decided by lib/team/landing appLanding, after the same verified gate (tests/team-landing.test.ts). */
    /if \(!gateCheck\?\.email_verified\)[\s\S]*const landing = appLanding\([\s\S]*if \(!creator \|\| landing\.kind === "sell"\)/.test(layout))
  check("on the caller's own client only", !/createAdminClient/.test(layout))
}

section("Home: three trips, and its title shares them")
{
  const home = code("app/app/page.tsx")
  check("the profile and creator rows are per request (React cache), on the service role as both reads were, by the user's id",
    /const homeProfile = cache\(async \(userId: string\)/.test(home) && /const homeCreator = cache\(async \(userId: string\)/.test(home)
      && /\.from\("profiles"\)[\s\S]{0,120}\.eq\("id", userId\)/.test(home) && /\.from\("creators"\)[\s\S]{0,400}\.eq\("user_id", userId\)/.test(home))
  const meta = home.slice(home.indexOf("export async function generateMetadata"), home.indexOf("export const dynamic"))
  check("the title reads the same cached answers, and nothing of its own", /Promise\.all\(\[homeProfile\(user\.id\), homeCreator\(user\.id\)\]\)/.test(meta) && !/\.from\(/.test(meta))
  const body = home.slice(home.indexOf("export default async function AppDashboard"))
  const first = batchAfter(body, /pageUser\(\)/)
  check("the creator row, the profile and the OnePage go together", /homeCreator\(user\.id\)/.test(first) && /homeProfile\(user\.id\)/.test(first) && /\.from\("onepages"\)/.test(first))
  const second = batchAfter(body, /onboarding_completed/)
  /* Changed on purpose: Home reads no order rows now. Its figures are the Analytics answer (app/api/analytics/reports),
     and a read of every order here stopped at 1,000 rows. The sales are counted over every order, in the same batch. */
  check("then the products, the domain, the live website and the sales count go together",
    /\.from\("products"\)/.test(second) && /\.from\("custom_domains"\)/.test(second) && /\.from\("store_theme_installs"\)/.test(second) && /creatorSalesTotals\(adminSupabase, creator\.id\)/.test(second))
  check("no orders are read for the figures, and never by a list of product ids",
    !/\.from\("orders"\)/.test(body) && !/\.in\("product_id"/.test(body) && !/initialOrders=/.test(body))
  check("still on the service role, as before, never the caller's client swapped in or out", /createAdminClient\(\)/.test(body) && !/createClient\(\)/.test(home))
}

section("Products: the creator and the profile together")
{
  const src = code("app/app/products/page.tsx")
  check("both rows in one batch, through the request cache the layout filled",
    /Promise\.all\(\[creatorForRequest\(user\.id\), profileForRequest\(user\.id\)\]\)/.test(src))
  check("the products on the caller's own client, by the creator's id", /\.from\("products"\)\s*\.select\("\*"\)\s*\.eq\("creator_id", creator\.id\)/.test(src) && !/createAdminClient/.test(src))
  check("no user or no creator is sent where that is sorted out, rather than reading an id off nothing",
    /const user = await pageUser\(\)/.test(src) && /if \(!user\) return null/.test(src) && /if \(!creator\) redirect\("\/app"\)/.test(src) && !/!\.id/.test(src))
}

section("Settings: six trips to three")
{
  const src = code("app/app/settings/_server.ts")
  const first = batchAfter(src, /pageUser\(\)/)
  check("the profile and the creator row together", /\.from\("profiles"\)/.test(first) && /\.from\("creators"\)/.test(first))
  /* Their photos were read only for the avatar's fallback chain, which is gone (lib/account/avatar).
     The OnePage and the creator page header are read again for the share pill (whether the
     OnePage is live, and the platforms both link to), and for that alone: never a photo, and
     only the header's socials rather than the whole page config. */
  const onePageRead = src.match(/\.from\("onepages"\)\s*\.select\("([^"]*)"\)/)?.[1] ?? ""
  const headerRead = src.match(/\.from\("store_builder_configs"\)\s*\.select\("([^"]*)"\)/)?.[1] ?? ""
  check("and no OnePage, store header or Google photo is read for the avatar",
    !/avatar/i.test(onePageRead) && !/avatar/i.test(headerRead) && (!headerRead || /headerSettings->socialLinks/.test(headerRead)) && !/googleAvatarUrl/.test(src))
  const second = batchAfter(src, /redirect\("\/onboarding"\)/)
  check("then the published website and its address together, by the creator's id",
    /\.from\("store_theme_installs"\)[\s\S]*\.eq\("creator_id", creator\.id\)/.test(second) && /websiteHandleOf\(creator\.id\)/.test(second))
  /* One exception, and only one: whether the account's own address is on
     Storelib's newsletter. That table is closed to browsers (RLS on, no
     policies), so it is read with the service role, by the signed in
     person's own address, in the same batch. */
  /* The account's own profile and creator rows too, since run-now part 63 made
     some of their columns private: read with the service role, by the signed
     in person's own id and nobody else's. */
  const serverReads = [...src.matchAll(/createAdminClient\(\)\s*\.from\("(profiles|creators)"\)[\s\S]{0,120}?\.(eq\([^)]*\)|upsert\()/g)].map((m) => m[0])
  check("on the caller's own client, but for the newsletter row and the account's own rows",
    serverReads.length >= 2 && serverReads.every((r) => /\.eq\("(id|user_id)", user\.id\)|\.upsert\(/.test(r)) && /readNewsletter\(createAdminClient\(\), user\.email, user\.user_metadata\?\.storelib_newsletter === true\)/.test(src) && /\.from\("newsletter|storelib_newsletter"\)/.test(src) === false)
}

section("Payouts: its questions asked together")
{
  const src = code("app/app/payouts/page.tsx")
  const first = batchAfter(src, /const stripeAccount/)
  check("with the creator: the products, Stripe and the ledger row, and no Express dashboard link",
    /\.from\("products"\)/.test(first) && /stripe\.balance\.retrieve/.test(first) && /stripe\.accounts\.retrieve/.test(first)
      && !/createLoginLink/.test(src) && /\.from\("seller_ledger"\)/.test(first))
  /* The balance transactions went with the exchange rate: nothing is converted for display any more (lib/payments/display-currency). */
  check("  and no exchange rate read, because the balance is drawn in its own currency",
    !/balanceTransactions/.test(src) && !/getMarketExchangeRate/.test(src) && /pickBalance\(balance, account\.default_currency\)/.test(src))
  check("the ledger row is read once, with every column the page uses",
    (src.match(/\.from\("seller_ledger"\)/g) ?? []).length === 1 && /\.select\("available_amount, pending_amount, negative_balance"\)/.test(src))
  const second = batchAfter(src, /const productIds = /)
  check("with the products: the orders, the tax year's orders and the disputed orders",
    (second.match(/\.from\("orders"\)/g) ?? []).length === 3 && /\.gte\("created_at"/.test(second) && /\.eq\("status", "disputed"\)/.test(second))
  /* The owner, October 2026: accurate figures, no made up ones. A balance Stripe did not answer is not the creator's all time order total. */
  check("a Stripe failure shows nothing rather than the orders' own figures",
    /stripeRead && !stripeRead\.ok/.test(src) && /\[Payouts\] Stripe balance not read:/.test(src)
      && !/orderPendingUsd|orderNetUsd|totalEarnings/.test(src) && !/stripePendingBalance = Math\.round/.test(src))
  check("and a failed tax or ledger read is nothing, not a failed page",
    (src.match(/\.then\(\(r\) => r, \(\) => nothing\)/g) ?? []).length === 2 && !/accountLinks\.create/.test(src))
  check("scoped as before: the creator by the user's id, everything else by that creator or its products, on the service role",
    /\.from\("creators"\)\s*\.select\("\*"\)\s*\.eq\("user_id", user\.id\)/.test(src) && (src.match(/\.in\("product_id", productIds\)/g) ?? []).length === 3 && !/createClient\(\)/.test(src))
}

section("Customers, Coupons, Analytics, Orders")
{
  const customers = code("app/app/customers/page.tsx")
  const batch = batchAfter(customers, /const readOrders/)
  check("Customers reads its customers while the orders' product ids come back", /\.from\("customers"\)/.test(batch) && /readOrders\(\)/.test(batch))
  check("its creator row is the layout's, on the caller's own client, as it was", /const creator = await creatorForRequest\(user\.id\)/.test(customers))
  check("Coupons' creator row is the layout's too", /const creator = await creatorForRequest\(user\.id\)/.test(code("app/app/coupons/load-coupons.ts")))
  for (const f of ["app/app/analytics/page.tsx"]) {
    check(`${f} keeps its service role reads by the creator found from the user`, /\.from\("creators"\)[\s\S]{0,80}\.eq\("user_id", user\.id\)/.test(code(f)))
  }
  /* Changed on purpose (round AA, Team): Orders finds the creator from the user through
     lib/team/server creatorFor, which reads it by user_id for the owner, or the store a
     team member works in after checking the membership in the database. */
  check("app/app/orders/sales/page.tsx keeps its service role reads by the creator found from the user",
    /creatorFor<[^>]+>\(admin, user\.id, "orders", "id, stripe_onboarding_status"\)/.test(code("app/app/orders/sales/page.tsx"))
      && /\.from\("creators"\)\.select\(columns\)\.eq\("user_id", userId\)\.maybeSingle\(\)/.test(code("lib/team/server.ts")))
}

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed > 0) {
  console.log("Failing:", failures.join(", "))
  process.exit(1)
}
