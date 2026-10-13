/**
 * ===========================================================================
 *  MEMBERSHIPS ARE COMMUNITIES: THE SEPARATE THING IS GONE, NOTHING BREAKS
 * ===========================================================================
 * The owner: "get rid of Memberships across the entire Storelib, because
 * memberships are communities". Held here:
 *
 *   NO NEW ONE    the New product question never offers Membership (Paid
 *                 community instead, only while communities are on); no
 *                 screen makes a membership draft; the old create route
 *                 answers 410 and makes nothing.
 *   NO NAV        the /app sidebar, the /app search and the library's pills
 *                 have no Memberships entry; nothing in the navigation
 *                 links to /app/memberships or the library's list.
 *   STILL THERE   every route an existing membership uses still answers:
 *                 the creator's /app/memberships and /app/memberships/<id>,
 *                 the buyer's /account/library/memberships and
 *                 /account/library/memberships/<id>, the old /library
 *                 addresses, a membership product's own /app/products/<id>.
 *                 /app/memberships sends a creator with none to Community.
 *   THE BUYER     still sees each membership bought on its own, as a row of
 *                 the library's Products labelled Membership; a paid
 *                 community's is left to Communities only while that page
 *                 exists (the switch is on).
 *   UNTOUCHED     billing, the webhook, access, member emails and paid
 *                 communities run on the same engine: their files keep what
 *                 they do.
 *   COPY          no "Memberships" as a product kind in the marketing,
 *                 help, onboarding or welcome email copy.
 *
 * Run with:  npm run test:push
 */
import { existsSync, readFileSync } from "node:fs"

import { fakeDb } from "./_fake-db"
import { stripComments } from "./_source"
import { KIND_OPTIONS, kindFromParam, kindHref, kindOptions } from "@/app/app/products/new/product-kinds"
import { APP_PAGES, matchPages } from "@/lib/search/app-pages"
import { LIBRARY_TABS, showsLibraryTabs } from "@/components/library/library-tab-list"
import { legacyLibraryTarget, libraryMembershipPath } from "@/lib/library/paths"
import { membershipMatches } from "@/components/library/library-memberships"
import { countLine } from "@/components/library/library-home"
import type { MembershipCard } from "@/lib/memberships/view-types"
import { untt } from "./i18n-source"

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
    console.log(`  FAIL  ${name}${detail === undefined ? "" : `   ${JSON.stringify(detail)}`}`)
  }
}
const read = (p: string) => untt(readFileSync(p, "utf8"), p)
const code = (p: string) => stripComments(read(p))

async function main() {
  /* The loader reaches lib/memberships/sync, which makes its Stripe client when it loads: a test key, then the import. */
  process.env.STRIPE_SECRET_KEY ||= "sk_test_placeholder"
  const { libraryMemberships } = await import("../lib/library/library-memberships")
  console.log("\nNo new membership can be made")
  {
    const every = [false, true].flatMap((physical) => [false, true].map((communities) => kindOptions(physical, communities)))
    check("no combination of switches offers Membership in the New product question", every.every((list) => !list.some((o) => /membership/i.test(`${o.kind} ${o.title} ${o.line}`))))
    check("the always there answers are a digital product and a video course", KIND_OPTIONS.map((o) => o.kind).join() === "digital,course")
    check("Paid community is offered only while communities are on, and opens /app/community/new", !kindOptions(false, false).some((o) => o.kind === "community") && kindOptions(false, true).at(-1)?.title === "Paid community" && kindHref("community") === "/app/community/new")
    check("the old ?type=membership is no answer: the question is asked again", kindFromParam("membership") === null)

    const chooser = code("app/app/products/new/kind-chooser.tsx")
    check("the chooser makes no membership draft", !/\/api\/app\/memberships/.test(chooser) && !/makeMembership|membershipHref/.test(chooser))
    const page = code("app/app/products/new/page.tsx")
    check("the new product page makes nothing and sends a community pick to its setup only while the switch is on", !/api\/app\/memberships|createMembershipProduct/.test(page) && /redirect\(NEW_COMMUNITY_HREF\)/.test(page) && /communitiesEnabled\(\)/.test(page))

    const list = code("components/memberships/creator-list.tsx")
    check("the creator's memberships list has no New membership and posts nothing", !/New membership/.test(list) && !/fetch\(/.test(list) && !/method: "POST"/.test(list))

    const route = code("app/api/app/memberships/route.ts")
    check("POST /api/app/memberships answers 410 after the creator check and makes nothing", /export async function POST\(\)/.test(route) && /requireCreator\(\)/.test(route) && /status: 410/.test(route) && !/createMembershipProduct|\.insert\(/.test(route))
    check("paid communities still make their recurring tier through the engine directly", /createMembershipProduct\(db, t\.creatorId, title\)/.test(code("lib/communities/server/tiers.ts")))

    /* Anywhere in the app's screens: a POST to the bare create route would be a way back in. */
    const screens = ["app/app/products/products-client.tsx", "components/app/home/quick-actions.tsx", "components/app/app-search.tsx", "components/memberships/creator-screen.tsx", "components/memberships/creator-list.tsx", "app/app/products/new/kind-chooser.tsx"]
    check("no /app screen calls the create route", screens.every((f) => !/fetch\(\s*["'`]\/api\/app\/memberships["'`]/.test(code(f))))
  }

  console.log("\nNo navigation points at memberships")
  {
    const sidebar = code("components/app/sidebar.tsx")
    check("the /app sidebar has no Memberships row", !/\/app\/memberships/.test(sidebar) && !/label: "Memberships"/.test(sidebar))
    check("Products keeps Coupons and Reviews as its children", /children: \[\s*\{ href: "\/app\/coupons", label: "Coupons" \},\s*\{ href: "\/app\/reviews", label: "Reviews" \},?\s*\]/.test(sidebar))
    check("the /app search has no Memberships page", !APP_PAGES.some((p) => p.href === "/app/memberships" || /^memberships?$/i.test(p.label)))
    check("typing membership finds nothing while communities are off", matchPages("membership").length === 0, matchPages("membership"))
    check("and finds Community (and New community) while they are on", matchPages("membership", 5, { communities: true }).map((p) => p.href).join() === "/app/community,/app/community/new", matchPages("membership", 5, { communities: true }))
    check("the library's pills have no Memberships", !LIBRARY_TABS.some((t) => /membership/i.test(`${t.label} ${t.href}`)) && LIBRARY_TABS.map((t) => t.label).join() === "Products,Courses,Wishlist,Reviews,Receipts")
    check("so the list address is not drawn as a pill screen", !showsLibraryTabs("/account/library/memberships"))
    const nav = ["components/app/sidebar.tsx", "components/app/sidebar-desktop-nav.tsx", "components/library/library-tabs.tsx", "components/library/library-tab-list.ts", "lib/profile/owner-pills.ts", "components/platform/platform-header-client.tsx"].filter((f) => existsSync(f))
    check("no navigation file links to /app/memberships or the library's memberships list", nav.every((f) => !/["'`]\/app\/memberships["'`/]|\/account\/library\/memberships["'`]|LIBRARY_MEMBERSHIPS/.test(code(f))), nav)
    check("the member page goes back to the library, not to a list nobody navigates to", /<Link href="\/account\/library" className=/.test(code("components/memberships/member-page.tsx")) && !/href="\/account\/library\/memberships"/.test(code("components/memberships/member-page.tsx")))
    check("an owned membership in the wishlist opens the library", /e\.type === "membership" \? "\/account\/library"/.test(code("components/wishlist/wishlist-entry.ts")))
  }

  console.log("\nEvery route an existing membership uses still answers")
  {
    for (const f of ["app/app/memberships/page.tsx", "app/app/memberships/[id]/page.tsx", "app/account/library/memberships/page.tsx", "app/account/library/memberships/[id]/page.tsx", "app/account/library/memberships/loading.tsx"]) {
      check(`  ${f} is there`, existsSync(f))
    }
    const one = code("app/app/memberships/[id]/page.tsx")
    check("the creator's screen still reads and draws its membership", /loadCreatorMembership\(createAdminClient\(\), creator\.id, id,/.test(one) && /<CreatorMembershipScreenView screen=\{read\.screen\}/.test(one))
    const list = code("app/app/memberships/page.tsx")
    check("/app/memberships sends a creator with none to Community, or Products while the switch is off", /if \(!list\.available \|\| list\.rows\.length === 0\) redirect\(\(await communitiesEnabled\(\)\.catch\(\(\) => false\)\) \? "\/app\/community" : "\/app\/products"\)/.test(list))
    check("and lists them for a creator who has some", /return <CreatorMembershipsList rows=\{list\.rows\} \/>/.test(list) && /loadCreatorMemberships\(createAdminClient\(\), creator\.id\)/.test(list))
    check("a membership product's own address still opens its screen", /if \(load\.loaded\?\.product\.type === "membership"\) redirect\(`\/app\/memberships\/\$\{encodeURIComponent\(id\)\}`\)/.test(code("app/app/products/[id]/page.tsx")))
    const member = code("app/account/library/memberships/[id]/page.tsx")
    check("the buyer's membership page still loads it", /loadMembershipPage|viewerMembership|MemberPage/.test(member))
    check("the buyer's list page still lists every membership", /loadLibraryMemberships\(createAdminClient\(\), viewer\)/.test(code("app/account/library/memberships/page.tsx")) && /<MembershipsList current=\{list\.current\} ended=\{list\.ended\} \/>/.test(code("app/account/library/memberships/page.tsx")))
    check("the old /library addresses still land there", legacyLibraryTarget("/library/memberships") === "/account/library/memberships" && legacyLibraryTarget("/library/memberships/m1") === "/account/library/memberships/m1" && libraryMembershipPath("m1") === "/account/library/memberships/m1")
    check("a paid community's member still manages billing at the membership page", /manageHref: paying \? `\/account\/library\/memberships\/\$\{v\.membershipId\}`/.test(code("components/community/public/join-state.ts")))
  }

  console.log("\nThe buyer still sees a membership bought on its own")
  {
    const page = code("app/account/library/page.tsx")
    check("the library reads them beside the products, in the same Promise.all", /const \[downloads, extras, \{ count: wishlistCount \}, memberships\] = await Promise\.all\(\[/.test(page) && /libraryMemberships\(createAdminClient\(\), user, \{ communities \}\)/.test(page) && /memberships=\{memberships\}/.test(page))
    const home = code("components/library/library-home.tsx")
    check("they are rows at the top of the products list, found by its search", /shownMemberships\.map\(\(card\) => \(\s*<LibraryMembershipRow/.test(home) && home.indexOf("<LibraryMembershipRow") < home.indexOf("<ProductRow") && /membershipMatches\(m, query\)/.test(home))
    check("a buyer with only memberships does not see Nothing bought yet", /if \(total === 0\) return <NothingYet/.test(home) && /const total = items\.length \+ memberships\.length/.test(home))
    const row = code("components/library/library-memberships.tsx")
    check("each row is labelled Membership and opens its page", />\s*Membership\s*</.test(row) && /libraryMembershipPath\(card\.id\)/.test(row) && /<StatusLabel view=\{card\.view\}/.test(row))
    check("no server code in the row", !/server-only|next\/headers|lib\/memberships\/(server|library|access|sync|billing|webhook)"/.test(read("components/library/library-memberships.tsx")))
    check("the count says what the list holds", countLine(3, 0) === "3 products" && countLine(3, 1) === "3 products · 1 membership" && countLine(0, 2) === "2 memberships" && countLine(1, 0) === "1 product" && countLine(0, 0) === "0 products")

    const card = { title: "Inner circle", creator: { id: "c1", name: "Ana Lopez", avatarUrl: null, handle: "ana" } } as MembershipCard
    check("search finds a membership by its name or its creator", membershipMatches(card, "inner") && membershipMatches(card, "ANA") && membershipMatches(card, " ") && !membershipMatches(card, "zzz"))

    /* The loader, end to end on a fake database: one on its own, one a paid community sells. */
    const future = new Date(Date.now() + 20 * 86400000).toISOString()
    const base = { buyer_id: "u1", buyer_email: "ana@example.com", creator_id: "c1", billing_interval: "month", amount_cents: 900, currency: "usd", stripe_status: "active", trial_end: null, current_period_start: new Date().toISOString(), current_period_end: future, cancel_at_period_end: false, canceled_at: null, ended_at: null, past_due_since: null, started_at: new Date().toISOString(), created_at: new Date().toISOString() }
    const tables = () => ({
      memberships: [
        { ...base, id: "m-own", product_id: "p-own", title: "Updates", status: "active" },
        { ...base, id: "m-com", product_id: "p-com", title: "Circle monthly", status: "active" },
      ],
      products: [
        { id: "p-own", title: "Monthly updates", thumbnail_url: null, community_id: null },
        { id: "p-com", title: "Circle monthly", thumbnail_url: null, community_id: "k1" },
      ],
      creators: [{ id: "c1", user_id: "u9", slug: "ana" }],
      profiles: [{ id: "u9", display_name: "Ana Lopez", username: "ana", avatar_url: null }],
      membership_posts: [],
      membership_post_reads: [],
    })
    /* PostgREST's or() is the owner filter; the loader checks ownership again itself (belongsTo). */
    const withOr = (db: ReturnType<typeof fakeDb>) => ({ ...db, from: (t: string) => Object.assign(db.from(t), { or() { return this } }) })
    const user = { id: "u1", email: "ana@example.com", email_confirmed_at: new Date().toISOString() }
    const on = await libraryMemberships(withOr(fakeDb(tables())), user, { communities: true })
    check("communities on: only the membership bought on its own (the paid community's is under Communities)", on.map((c) => c.id).join() === "m-own", on.map((c) => c.id))
    const off = await libraryMemberships(withOr(fakeDb(tables())), user, { communities: false })
    check("communities off: both, so nobody loses the way to their billing", off.map((c) => c.id).sort().join() === "m-com,m-own", off.map((c) => c.id))
    check("each card knows its product and says where it stands", on[0]?.productId === "p-own" && on[0]?.title === "Monthly updates" && on[0]?.access === true && typeof on[0]?.view?.label === "string")
    const missing = await libraryMemberships(withOr(fakeDb(tables(), { failWith: { memberships: { code: "42P01", message: "relation does not exist" } } })), user, { communities: true })
    check("before the memberships tables exist the library simply has none", missing.length === 0)
    check("signed out: none", (await libraryMemberships(withOr(fakeDb(tables())), null, { communities: true })).length === 0)
  }

  console.log("\nBilling, the webhook, access and member emails are untouched")
  {
    const webhook = read("app/api/stripe/webhook/route.ts")
    check("the Stripe webhook still asks memberships first", webhook.indexOf("handleMembershipEvent(supabaseAdmin, event)") > 0)
    check("the memberships webhook still handles every subscription and invoice event", ["customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted", "invoice.paid", "invoice.payment_failed"].every((e) => read("lib/memberships/webhook.ts").includes(`"${e}"`)))
    check("every sync still updates a paid community's access", /await quietly\("community access", \(\) => communityAccessAfterMembership\(admin, row,/.test(read("lib/memberships/sync.ts")))
    check("checkout, manage and the member's own routes are all still there", ["app/api/memberships/checkout/route.ts", "app/api/memberships/[id]/manage/route.ts", "app/api/memberships/[id]/portal/route.ts", "app/api/memberships/files/[postId]/[assetId]/route.ts", "app/api/memberships/unsubscribe/route.ts", "app/api/cron/memberships/route.ts", "app/checkout/membership-checkout.tsx"].every((f) => existsSync(f)))
    check("the creator's edit, posts and settings routes for an existing membership are still there", ["app/api/app/memberships/[productId]/route.ts", "app/api/app/memberships/[productId]/posts/route.ts", "app/api/app/memberships/[productId]/posts/[postId]/route.ts"].every((f) => existsSync(f)))
    const catalog = read("lib/notify/templates/catalog.ts")
    check("member emails still link to the membership's page", /membership: \(id: string\) => \(id \? `\/account\/library\/memberships\/\$\{id\}` : "\/account\/library\/memberships"\)/.test(catalog) && /MEMBERSHIP_RENEWED: \(d\) =>/.test(catalog) && /MEMBERSHIP_PAYMENT_FAILED: \(d\) =>/.test(catalog))
  }

  console.log("\nCopy: not a product kind any more")
  {
    check("the home page's Sell anything says communities", /Courses, digital products, communities, bookings\. If you made it, you can sell it here on Storelib\./.test(read("components/marketing/bento-grid.tsx")))
    check("the marquee says Communities", /label: "Communities"/.test(read("components/marketing/product-marquee.tsx")) && !/label: "Memberships"/.test(read("components/marketing/product-marquee.tsx")))
    check("onboarding and the store builder offer Communities as a niche, not Memberships", ["components/app/creator-onboarding-modal.tsx", "components/store-builder/sections-sidebar.tsx"].every((f) => !/"Memberships"/.test(read(f)) && /"Communities"/.test(read(f))))
    check("a new site's goals say Run a community", /"Run a community"/.test(read("components/sites/new-site-flow.tsx")) && !/Sell memberships/.test(read("components/sites/new-site-flow.tsx")))
    check("the help figure of the question has no Membership", !/title="Membership"/.test(read("components/help/help-figures.tsx")) && /title="Community"/.test(read("components/help/help-figures.tsx")))
    check("the welcome email lists communities, not memberships", /courses, services, communities or anything else/.test(read("lib/notify/templates/catalog.ts")))
    const touched = ["app/app/products/new/product-kinds.ts", "app/app/products/new/kind-chooser.tsx", "app/app/memberships/page.tsx", "app/api/app/memberships/route.ts", "components/memberships/creator-list.tsx", "components/library/library-memberships.tsx", "lib/library/library-memberships.ts", "components/library/library-tab-list.ts", "lib/search/app-pages.ts"]
    check("no em dash and none of the banned words in the files this change wrote", touched.every((f) => !/—|\b(unlock|elevate|seamless|powerful|effortless(ly)?|supercharge|transform)\b/i.test(read(f))))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) {
    for (const f of failures) console.log(`  - ${f}`)
    process.exit(1)
  }
}

main()
