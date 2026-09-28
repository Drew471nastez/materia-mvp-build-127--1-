/**
 * ===========================================================================
 *  THE BUYER'S PROFILE: OVERVIEW AND SETTINGS
 * ===========================================================================
 * The owner, about /account: "When I click on it, it should not be direct
 * account settings. It needs to be the account with multiple subpages there,
 * such as settings, overview. Like a profile, a user profile, not directly
 * changing the name or profile photo." And: "in the profile page there
 * should be the header present like in the library page".
 *
 * The addresses and the overview's facts are pure functions and are asked
 * here. The wiring (the header, the tabs' switch, where signed out goes) is
 * read off the source. How it looks and how the switch moves is measured in
 * scripts/check-account-hub.mjs.
 */
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"
import { ACCOUNT_TABS, accountLoginPath, accountTabFor } from "../lib/account/account-tabs"
import { accountOverview, RECENT_PURCHASES } from "../lib/account/overview"
import { buyerTabFor, buyerTabsBelongOn } from "../lib/nav/buyer-tabs"
import type { LibraryItem } from "../lib/library/library-view"

let passed = 0
let failed = 0
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; console.log(`  FAIL  ${label}${detail === undefined ? "" : `   (${JSON.stringify(detail)})`}`) }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")

console.log("\nThe profile's pages")
check("Overview, then Settings", ACCOUNT_TABS.map((t) => `${t.label} ${t.href}`).join() === "Overview /account,Settings /account/settings", ACCOUNT_TABS)
const tabCases: Array<[string, number]> = [["/account", 0], ["/account/", 0], ["/account/settings", 1], ["/account/settings/", 1], ["/account/settingsx", 0], ["", 0]]
for (const [p, want] of tabCases) check(`${p || "(no path)"} is ${ACCOUNT_TABS[want].label}`, accountTabFor(p) === want, accountTabFor(p))
check("signed out, each page comes back to itself", accountLoginPath("/account") === "/login?next=%2Faccount" && accountLoginPath("/account/settings") === "/login?next=%2Faccount%2Fsettings")
check("both are the Profile tab of the phone's bar, with the bar drawn", buyerTabFor("/account/settings") === 3 && buyerTabsBelongOn("/account/settings") && buyerTabFor("/account") === 3)

console.log("\nEvery page under /account sends signed out people to sign in with its own address")
{
  const pages: string[] = []
  const walk = (dir: string) => {
    for (const name of readdirSync(join(process.cwd(), dir))) {
      const rel = `${dir}/${name}`
      if (statSync(join(process.cwd(), rel)).isDirectory()) walk(rel)
      else if (name === "page.tsx") pages.push(rel)
    }
  }
  walk("app/account")
  check("Overview and Settings are routes of their own", pages.includes("app/account/page.tsx") && pages.includes("app/account/settings/page.tsx"), pages)
  for (const page of pages) {
    const href = page.replace(/^app/, "").replace(/\/page\.tsx$/, "") || "/account"
    const escaped = href.replace(/\//g, "\\/")
    check(`${page} asks with next=${href}`, new RegExp(`pageUser\\(accountLoginPath\\("${escaped}"\\)\\)`).test(code(page)))
  }
  check("no loading.tsx above the pages, so that redirect is a real one and not a hop after a skeleton", !existsSync(join(process.cwd(), "app/account/loading.tsx")))
  check("and the layout does not redirect for them (it cannot know which page it is)", !/redirect\(/.test(code("app/account/layout.tsx")))
}

console.log("\nThe header, as on the library")
{
  const layout = code("app/account/layout.tsx")
  const library = code("app/library/layout.tsx")
  const mount = /<ConditionalHeader initialWishlistCount=\{initialWishlistCount\} onPlatformDomain=\{onPlatformDomain\} \/>/
  check("the layout mounts the platform header the way /library does", mount.test(layout) && mount.test(library))
  check("with the footer and the phone's tab bar", /<ConditionalFooter \/>/.test(layout) && /<BuyerTabBar \/>/.test(layout))
  const header = code("components/marketing/conditional-header.tsx")
  const footer = code("components/marketing/conditional-footer.tsx")
  check("and the header draws on /account and its pages (it was not on the list, so it drew nothing there)", /\(\(p === "\/account" \|\| p\.startsWith\("\/account\/"\)\) && !p\.startsWith\("\/account\/continue"\)\)/.test(header))
  check("the footer too", /\(\(pathname === "\/account" \|\| pathname\.startsWith\("\/account\/"\)\) && !pathname\.startsWith\("\/account\/continue"\)\)/.test(footer))
}

console.log("\nThe hub: the person, the tabs, the page under them")
{
  const hub = code("components/account/account-hub.tsx")
  const layout = code("app/account/layout.tsx")
  check("in the layout, so the header and tabs stay put while the page changes", /<AccountHub identity=\{identity\}>\{children\}<\/AccountHub>/.test(layout))
  check("photo, name, @username when there is one, member since", /<AppAvatar\b/.test(hub) && /useShellAvatar\(identity\.avatarUrl\)/.test(hub) && /@\{identity\.username\}/.test(hub) && /Member since \{identity\.memberSince\}/.test(hub))
  check("member since is written on the server in UTC, so both renders agree", /timeZone: "UTC"/.test(layout) && /memberSince: memberSince\(user\.created_at\)/.test(layout))
  check("Edit profile goes to Settings", /href="\/account\/settings"[\s\S]{0,200}data-account-edit=""/.test(hub))
  check("the tabs are links to their routes, prefetched in full", /href=\{tab\.href\}\s+prefetch=\{true\}/.test(hub))
  check("/app Settings' switch: each tab's own fill fades and grows in place over 150ms, one ease out", /const TAB_FADE_MS = 150/.test(hub) && /const TAB_EASE = "cubic-bezier\(0\.33, 1, 0\.68, 1\)"/.test(hub) && /on \? "scale-100 opacity-100" : "scale-\[0\.96\] opacity-0"/.test(hub))
  check("and it is the same numbers as /app Settings", /const TAB_FADE_MS = 150/.test(read("components/app/settings-form-new.tsx")) && /const TAB_EASE = "cubic-bezier\(0\.33, 1, 0\.68, 1\)"/.test(read("components/app/settings-form-new.tsx")))
  check("the pressed tab lights at once, before its page arrives", /setPressed\(i\)/.test(hub) && /const active = pressed \?\? routeTab/.test(hub))
  check("the page settles in from 20% over 200ms, before its first paint, and not with less motion", /useLayoutEffect\(/.test(hub) && /const PANEL_MS = 200/.test(hub) && /const PANEL_FROM = 0\.2/.test(hub) && /prefers-reduced-motion: reduce/.test(hub))
  check("only the compositor's properties move", !/transition-\[[^\]]*(width|height|left|top|padding|margin)/.test(hub))
}

console.log("\nThe overview has nothing to type")
{
  const overview = code("components/account/account-overview.tsx")
  const route = code("app/account/page.tsx")
  check("no field, no photo control, no save", !/<input\b|<textarea\b|<ProfilePhoto\b|onSubmit|\.update\(/.test(overview + route))
  check("each fact opens its library page", ["/library", "/library/courses", "/library/memberships", "/library/reviews", "/library/wishlist"].every((h) => read("lib/account/overview.ts").includes(`href: "${h}"`)))
  check("the facts are the library's own loaders, not a second count", /loadLibrary\(user\.id\)/.test(route) && /loadMyCourses\(/.test(route) && /loadLibraryMemberships\(/.test(route))
  check("a read that fails leaves its fact out, not the page", /orNull\(\(\) => loadLibrary/.test(route))
  check("the slow part streams in under the header, behind a deferred skeleton", /<Suspense fallback=\{<OverviewSkeleton \/>\}>/.test(route) && /skeleton-deferred/.test(read("components/account/account-skeleton.tsx")))
  check("seller access is lib/account/seller-access's answer", /sellerAccessForRequest\(user\.id\)/.test(route))
}

console.log("\nThe overview's facts")
{
  const item = (id: string, at: string, extra: Partial<LibraryItem> = {}): LibraryItem => ({
    productId: id, title: `P${id}`, thumbnailUrl: null, productSlug: null, archived: false, purchasedAt: at,
    creator: { id: "c", name: "Maria", slug: "maria", avatarUrl: null }, files: [], state: "open", receiptToken: null,
    review: null, canReview: false, ...extra,
  } as LibraryItem)
  const review = { id: "r", rating: 5, content: "", createdAt: "", editedAt: null, hidden: false, sellerReply: null }
  const items = [
    item("1", "2026-01-01T00:00:00Z", { review }),
    item("2", "2026-03-01T00:00:00Z", { canReview: true }),
    item("3", "2026-02-01T00:00:00Z", { canReview: true }),
    item("4", "2026-04-01T00:00:00Z"),
  ]
  const full = accountOverview({
    items,
    courses: [{ title: "Lighting", status: "in_progress" }, { title: "Colour", status: "not_started" }],
    memberships: { current: 1, ended: 0 },
    wishlist: 7,
    seller: "none",
  })
  check("purchases, courses in progress, memberships, reviews written, wishlist", full.facts.map((f) => f.key).join() === "purchases,courses,memberships,reviews,wishlist", full.facts.map((f) => f.key))
  check("with the library's numbers", full.facts.map((f) => f.value).join() === "4,1,1,1,7", full.facts.map((f) => f.value))
  check("the course they had open last is where Continue goes", full.facts[1].detail === "Continue Lighting", full.facts[1].detail)
  check("purchases still to review are said", full.facts[3].detail === "2 purchases to review", full.facts[3].detail)
  check(`the newest ${RECENT_PURCHASES} purchases, newest first, into the library`, full.recent.map((r) => r.productId).join() === "4,2,3" && full.recent[0].href === "/library/products/4", full.recent.map((r) => r.productId))

  const fresh = accountOverview({ items: [], courses: [], memberships: null, wishlist: 0, seller: "seller" })
  check("a new account: purchases and the wishlist, no zeros about things never had", fresh.facts.map((f) => f.key).join() === "purchases,wishlist", fresh.facts.map((f) => f.key))
  check("and nothing in recent purchases", fresh.recent.length === 0)
  const done = accountOverview({ items: [], courses: [{ title: "A", status: "completed" }], memberships: { current: 0, ended: 2 }, wishlist: 0, seller: "started" })
  check("courses all finished say so; ended memberships say none are running", done.facts.find((f) => f.key === "courses")?.detail === "All finished" && done.facts.find((f) => f.key === "memberships")?.detail === "None running")
  const unread = accountOverview({ items: null, courses: null, memberships: null, wishlist: 3, seller: "none" })
  check("a library that could not be read is not an error on the page", unread.facts.map((f) => f.key).join() === "purchases,wishlist")
}

console.log("\nThe copy")
{
  const files = ["components/account/account-hub.tsx", "components/account/account-overview.tsx", "components/account/account-settings.tsx", "components/account/account-skeleton.tsx", "lib/account/overview.ts", "lib/account/account-tabs.ts", "app/account/layout.tsx", "app/account/page.tsx", "app/account/settings/page.tsx"]
  const banned = /—|\bunlock|\belevate|\bseamless|\bpowerful|\beffortless|\bsupercharge|\btransform/i
  for (const f of files) check(`${f}: no em dashes, none of the banned words`, !banned.test(read(f)), (read(f).match(banned) || [])[0])
}

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed > 0) process.exit(1)
