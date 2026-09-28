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
import { accountOverview, RECENT_PURCHASES, sellingEntry } from "../lib/account/overview"
import { sellerAccessFrom, hasSellerAccess } from "../lib/account/seller-access"
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
  check("photo, name, @username when there is one, member since", /<AccountAvatar\b/.test(hub) && /useShellAvatar\(identity\.avatarUrl\)/.test(hub) && /@\{identity\.username\}/.test(hub) && /Member since \{identity\.memberSince\}/.test(hub))
  check("centred: the person in one column, the tabs centred under them", /data-account-profile="" className="flex flex-col items-center[^"]*text-center/.test(hub) && /data-account-tabs="" className="[^"]*flex justify-center/.test(hub))
  check("the photo is large: 96px on a phone, 112 from 768px", /className="h-24 w-24 md:h-28 md:w-28"/.test(hub))
  check("member since is written on the server in UTC, so both renders agree", /timeZone: "UTC"/.test(layout) && /memberSince: memberSince\(user\.created_at\)/.test(layout))
  check("Edit profile goes to Settings", /href="\/account\/settings"[\s\S]{0,200}data-account-edit=""/.test(hub))
  check("the tabs are links to their routes, prefetched in full", /href=\{tab\.href\}\s+prefetch=\{true\}/.test(hub))
  check("/app Settings' switch: each tab's own fill fades and grows in place over 150ms, one ease out", /const TAB_FADE_MS = 150/.test(hub) && /const TAB_EASE = "cubic-bezier\(0\.33, 1, 0\.68, 1\)"/.test(hub) && /on \? "scale-100 opacity-100" : "scale-\[0\.96\] opacity-0"/.test(hub))
  check("and it is the same numbers as /app Settings", /const TAB_FADE_MS = 150/.test(read("components/app/settings-form-new.tsx")) && /const TAB_EASE = "cubic-bezier\(0\.33, 1, 0\.68, 1\)"/.test(read("components/app/settings-form-new.tsx")))
  check("the pressed tab lights at once, before its page arrives", /setPressed\(i\)/.test(hub) && /const active = pressed \?\? routeTab/.test(hub))
  check("the page settles in from 20% over 200ms, before its first paint, and not with less motion", /useLayoutEffect\(/.test(hub) && /const PANEL_MS = 200/.test(hub) && /const PANEL_FROM = 0\.2/.test(hub) && /prefers-reduced-motion: reduce/.test(hub))
  check("only the compositor's properties move", !/transition-\[[^\]]*(width|height|left|top|padding|margin)/.test(hub))
}

console.log("\nOn a phone, a light bar of the profile's own instead of the black header")
{
  const hub = code("components/account/account-hub.tsx")
  const layout = code("app/account/layout.tsx")
  check("only below 768px, the width the site header is hidden at on /account", /data-account-bar=""[\s\S]{0,120}className="sticky top-0 z-30 bg-\[#fafafa\] md:hidden"/.test(hub))
  check("under the status bar's safe area", /paddingTop: "env\(safe-area-inset-top, 0px\)"/.test(hub))
  check("the page's title in the middle: Profile, or Settings", /overview: "Profile", settings: "Settings"/.test(hub) && /justify-center/.test(hub))
  check("a hairline only once the page has scrolled under it", /setScrolled\(window\.scrollY > 2\)/.test(hub) && /scrolled \? "opacity-100" : "opacity-0"/.test(hub) && /\{ passive: true \}/.test(hub))
  check("edge to edge: it steps out of the column by the column's own gutter, written once", /marginLeft: `calc\(-1 \* \$\{ACCOUNT_GUTTER_LEFT\}\)`/.test(hub) && /paddingLeft: ACCOUNT_GUTTER_LEFT, paddingRight: ACCOUNT_GUTTER_RIGHT/.test(layout))
  check("and the column has no top padding on a phone, the bar is the top", /className="mx-auto w-full max-w-\[720px\] pb-10 md:pt-10"/.test(layout))
}

console.log("\nOne photo on the screen")
{
  const hub = code("components/account/account-hub.tsx")
  const photo = code("components/account/account-photo.tsx")
  const settings = code("components/account/account-settings.tsx")
  check("Settings draws no photo of its own (image 29: the same face twice)", !/<AppAvatar\b|<ProfilePhoto\b|<AccountAvatar\b|avatarUrl|useShellAvatar/.test(settings))
  check("the big photo is the control on Settings only: pressed, it opens the picker", /editable=\{editing\}/.test(hub) && /const editing = routeTab === settings/.test(hub) && /\{editable \? \(\s*<button[\s\S]{0,120}onClick=\{photo\.pick\}/.test(photo))
  check("Change photo and Remove take Edit profile's place, in the same cell, so nothing moves", (hub.match(/\[grid-area:1\/1\]/g) ?? []).length === 2 && /data-photo-change=""/.test(hub) && /data-photo-remove=""/.test(hub))
  check("uploaded under the owner's folder, through the one photo route, and announced", /`\$\{userId\}\/avatar-\$\{Date\.now\(\)\}\.jpg`/.test(photo) && /fetch\("\/api\/account\/avatar"/.test(photo) && /announceAvatar\(publicUrl\)/.test(photo) && /announceAvatar\(null\)/.test(photo))
  check("the camera only fades and grows, on the compositor", /transition-\[opacity,scale\]/.test(photo) && /editable \? "scale-100 opacity-100" : "scale-75 opacity-0"/.test(photo))
  check("the layout hands the hub whose photo it is", /userId: user\.id,/.test(code("app/account/layout.tsx")))
}

console.log("\nSelling: Dashboard only with seller access")
{
  const cases: Array<[string, Parameters<typeof sellerAccessFrom>[0], string, string, string]> = [
    ["onboarding finished", { creator: { onboarding_completed: true }, profile: { is_creator: true } }, "dashboard", "/app", "Dashboard"],
    ["a creators row, onboarding not finished", { creator: { onboarding_completed: false }, profile: null }, "finish", "/sell", "Finish setting up your store"],
    ["the old creator choice, no row", { creator: null, profile: { is_creator: true } }, "finish", "/sell", "Finish setting up your store"],
    ["a buyer who never started", { creator: null, profile: { is_creator: false } }, "become", "/sell", "Become a seller"],
    ["no rows at all", { creator: null, profile: null }, "become", "/sell", "Become a seller"],
  ]
  for (const [what, rows, key, href, title] of cases) {
    const entry = sellingEntry(sellerAccessFrom(rows).state)
    check(`${what}: ${title}`, entry.key === key && entry.href === href && entry.title === title, entry)
  }
  check("only the seller state is Dashboard", (["none", "started", "seller"] as const).filter((st) => sellingEntry(st).href === "/app").join() === "seller")
  const data = accountOverview({ items: [], courses: null, memberships: null, wishlist: 0, seller: "started" })
  check("the overview carries the entry for its state", data.selling.key === "finish" && data.seller === "started")

  const overview = code("components/account/account-overview.tsx")
  check("the overview draws the entry it is given, and no Dashboard of its own", /<SellRow entry=\{selling\} \/>/.test(overview) && !/href="\/app"/.test(overview))
  const route = code("app/account/page.tsx")
  check("the page asks for the signed in person's own access, for this request", /const user = await pageUser\(accountLoginPath\("\/account"\)\)/.test(route) && /sellerAccessForRequest\(user\.id\)/.test(route) && !/readAuthSnapshot|createAdminClient\(\)\.from\("creators"\)/.test(route))
  const scope = code("lib/auth/request-scope.ts")
  check("which is their own creators row, by user_id, on their own client (not any row, not the service role)", /creatorForRequest = cache\(async \(userId: string\)[\s\S]{0,200}const supabase = await createClient\(\)[\s\S]{0,120}\.from\("creators"\)\.select\(SHELL_CREATOR_COLUMNS\)\.eq\("user_id", userId\)\.maybeSingle\(\)/.test(scope))
  check("and the user is the one the auth server confirmed this request", /currentUserForRequest = cache\(/.test(scope) && /readCurrentUser\(supabase\)/.test(scope))
  check("a copy the router kept is asked for again, so a finished onboarding is never an old Become a seller", /<AccountOverview data=\{data\} drawnAt=\{Date\.now\(\)\} \/>/.test(route) && /router\.refresh\(\)/.test(code("components/account/account-fresh.tsx")))
  const header = code("components/platform/platform-header-client.tsx")
  check("the header's account sheet asks the same rule (hasSellerAccess of sellerAccessFrom), and says Finish setting up for a started store",
    /const access = sellerAccessFrom\(\{ creator: creatorData, profile: profileData \}\)[\s\S]{0,80}hasSellerAccess\(access\)/.test(header)
      && /state === "started" \? "Finish setting up your store" : "Become a seller"/.test(header))
  check("and the shared rule itself: seller only with a finished onboarding", hasSellerAccess(sellerAccessFrom({ creator: { onboarding_completed: true } })) && !hasSellerAccess(sellerAccessFrom({ creator: { onboarding_completed: false }, profile: { is_creator: true } })))
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
  const files = ["components/account/account-hub.tsx", "components/account/account-photo.tsx", "components/account/account-fresh.tsx", "components/account/account-overview.tsx", "components/account/account-settings.tsx", "components/account/account-skeleton.tsx", "lib/account/overview.ts", "lib/account/account-tabs.ts", "app/account/layout.tsx", "app/account/page.tsx", "app/account/settings/page.tsx"]
  const banned = /—|\bunlock|\belevate|\bseamless|\bpowerful|\beffortless|\bsupercharge|\btransform/i
  for (const f of files) check(`${f}: no em dashes, none of the banned words`, !banned.test(read(f)), (read(f).match(banned) || [])[0])
}

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed > 0) process.exit(1)
