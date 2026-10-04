/**
 * ===========================================================================
 *  /ACCOUNT, THE PROFILE CENTER, AND THE LIBRARY THAT MOVED INTO IT
 * ===========================================================================
 * The owner: "/account becomes the profile center: it is MY profile page ...
 * The library lives inside /account as subpages (/account/library,
 * /account/library/courses, ...); every old /library/* URL redirects to its
 * new place (keep query strings), the buyer tab bar's Library tab and every
 * internal link point to the new places, and nothing that worked before
 * breaks." And: "/@<my handle> for me = the same page."
 *
 * The redirect table is asked of the one function the route answers with
 * (lib/library/paths.ts legacyLibraryTarget), the route itself is read for
 * keeping the query string, and every internal link is looked for.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import { stripComments } from "./_source"
import { ACCOUNT_COMMUNITIES, ACCOUNT_SETTINGS, LIBRARY_HOME, isLibraryPath, legacyLibraryTarget, libraryCoursePath, libraryMembershipPath, libraryProductPath } from "@/lib/library/paths"
import { LIBRARY_TABS, isLibraryProduct, showsLibraryTabs } from "@/components/library/library-tab-list"
import { ownerPillFor, ownerPillLinks, showsProfileHeader } from "@/lib/profile/owner-pills"
import { BUYER_TABS, buyerTabFor } from "@/lib/nav/buyer-tabs"
import { pushStateFrom } from "@/lib/account/push-state"

let passed = 0
let failed = 0
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${label}`)
  } else {
    failed++
    console.log(`  FAIL  ${label}${detail === undefined ? "" : `   (${JSON.stringify(detail)})`}`)
  }
}
const root = process.cwd()
const read = (p: string) => readFileSync(join(root, p), "utf8")
const code = (p: string) => stripComments(read(p))

console.log("\nEvery old /library address, and where it goes now")
{
  const table: Array<[string, string]> = [
    ["/library", "/account/library"],
    ["/library/", "/account/library"],
    ["/library/products", "/account/library"],
    ["/library/my-downloads", "/account/library"],
    ["/library/products/abc-123", "/account/library/products/abc-123"],
    ["/library/courses", "/account/library/courses"],
    ["/library/courses/c1", "/account/library/courses/c1"],
    ["/library/memberships", "/account/library/memberships"],
    ["/library/memberships/m1", "/account/library/memberships/m1"],
    ["/library/wishlist", "/account/library/wishlist"],
    ["/library/reviews", "/account/library/reviews"],
    ["/library/receipts", "/account/library/receipts"],
    ["/library/communities", "/account/communities"],
    ["/library/settings", "/account/settings"],
  ]
  for (const [from, to] of table) check(`${from} -> ${to}`, legacyLibraryTarget(from) === to, legacyLibraryTarget(from))
  check("an address that is not the library's is not answered", legacyLibraryTarget("/libraryx") === null && legacyLibraryTarget("/account/library") === null && legacyLibraryTarget("/explore") === null)
  const route = code("app/library/[[...path]]/route.ts")
  check("one route answers every old address, GET and HEAD", existsSync(join(root, "app/library/[[...path]]/route.ts")) && /export const GET = moved/.test(route) && /export const HEAD = moved/.test(route))
  /* nextUrl.clone() keeps ?purchase=success&highlight=<id>, ?product=<id>, ?welcome=1, ?lesson=<id>; only the path is changed. */
  check("the query string is kept: only the path of a clone of the URL is changed", /const url = request\.nextUrl\.clone\(\)/.test(route) && /url\.pathname = legacyLibraryTarget\(url\.pathname\)/.test(route) && !/url\.search\s*=/.test(route))
  check("a temporary redirect, so a browser asks again", /NextResponse\.redirect\(url, 307\)/.test(route))
  const left = readdirSync(join(root, "app/library"))
  check("nothing else is left under app/library", left.length === 1 && left[0] === "[[...path]]", left)
}

console.log("\nThe new places")
{
  check("the library's pages live under app/account/library", ["page.tsx", "layout.tsx", "loading.tsx", "products/[id]/page.tsx", "courses/page.tsx", "courses/[id]/page.tsx", "memberships/page.tsx", "memberships/[id]/page.tsx", "wishlist/page.tsx", "reviews/page.tsx", "receipts/page.tsx"].every((f) => existsSync(join(root, "app/account/library", f))))
  check("the communities a person is in are /account/communities", existsSync(join(root, "app/account/communities/page.tsx")) && ACCOUNT_COMMUNITIES === "/account/communities")
  check("the helpers spell them", libraryProductPath("p 1") === "/account/library/products/p%201" && libraryCoursePath("c1") === "/account/library/courses/c1" && libraryMembershipPath("m1") === "/account/library/memberships/m1" && ACCOUNT_SETTINGS === "/account/settings")
  /* Changed on purpose in round 5: memberships are communities, so Memberships is no longer a pill (its pages still answer; tests/memberships-folded.test.ts). */
  check("the library's sub pills: Products, Courses, Wishlist, Reviews, Receipts", LIBRARY_TABS.map((t) => `${t.label} ${t.href}`).join() === "Products /account/library,Courses /account/library/courses,Wishlist /account/library/wishlist,Reviews /account/library/reviews,Receipts /account/library/receipts", LIBRARY_TABS)
  check("the pills are drawn on the lists, not on a purchase", showsLibraryTabs("/account/library/") && showsLibraryTabs("/account/library/receipts") && !showsLibraryTabs("/account/library/products/p1") && isLibraryProduct("/account/library/products/p1?x=1") && !isLibraryProduct("/library/products/p1"))
  check("isLibraryPath knows the whole library and nothing else", isLibraryPath("/account/library") && isLibraryPath("/account/library/courses/c1") && !isLibraryPath("/account/libraryx") && !isLibraryPath("/account"))
  const lib = code("app/account/library/layout.tsx")
  check("the library keeps its gates, its purchase sync, its stage with the sub pills and the app banner", /email_verified/.test(lib) && /<PurchaseSyncProvider \/>/.test(lib) && /<LibraryPanel head=\{<LibraryTabs \/>\}>/.test(lib) && /<OpenInApp phone=\{bannerFor\} \/>/.test(lib) && /NativeAuthGate requireAuth/.test(lib))
}

console.log("\nThe profile center's pills")
{
  check("Activity, Communities, Library, Edit profile, Settings", ownerPillLinks(true).map((p) => `${p.label} ${p.href}`).join() === "Activity /account,Communities /account/communities,Library /account/library,Edit profile /account/settings,Settings /account/settings?section=account")
  check("Communities only while the switch is on", ownerPillLinks(false).map((p) => p.key).join() === "activity,library,edit,settings")
  check("every library address lights Library", ["/account/library", "/account/library/courses", "/account/library/products/x"].every((p) => ownerPillFor(p) === "library"))
  check("the header stands over the lists only", showsProfileHeader("/account") && showsProfileHeader("/account/library/wishlist") && !showsProfileHeader("/account/library/courses/c1") && !showsProfileHeader("/account/settings"))
  const pills = read("components/profile/profile-owner-pills.tsx")
  check("the pressed pill answers the press, its fill fading in where it is", /setPressed\(p\.key\)/.test(pills) && /transition-\[opacity,scale\]/.test(pills) && /scale-100 opacity-100" : "scale-\[0\.96\] opacity-0"/.test(pills))
  const member = read("components/profile/member-profile-page.tsx")
  check("/@<my handle> for me is the same owner view: the pills, Activity lit, my activity under them, no Follow", /\{isSelf \? \(/.test(member) && /active="activity"/.test(member) && /isSelf=\{isSelf\}/.test(member))
}

console.log("\nThe buyer tab bar and every internal link")
{
  check("the Library tab is /account/library", BUYER_TABS.find((t) => t.key === "library")?.href === LIBRARY_HOME)
  check("the library's pages are the Library tab, the rest of /account the Profile tab", buyerTabFor("/account/library/courses/c1") === 2 && buyerTabFor("/account") === 3 && buyerTabFor("/account/settings") === 3)
  const walk = (dir: string): string[] =>
    existsSync(join(root, dir))
      ? readdirSync(join(root, dir)).flatMap((f) => {
          const rel = `${dir}/${f}`
          if (f === "node_modules" || f.startsWith(".")) return []
          return statSync(join(root, rel)).isDirectory() ? walk(rel) : /\.(ts|tsx)$/.test(f) ? [rel] : []
        })
      : []
  /*
    Allowed to still say /library: the redirect itself, the table of old
    addresses, the video provider's own API path, and the native shell's
    cached home, which the installed apps' offline page (out/index.html)
    only knows as /library and which answers with the new place.
  */
  const allowed = new Set(["app/library/[[...path]]/route.ts", "lib/library/paths.ts", "lib/video/bunny.ts", "lib/native-bridge.ts", "lib/auth/continue.ts", "app/native-start/page.tsx", "app/NativeOAuthBridge.tsx"])
  const offenders: string[] = []
  for (const f of [...walk("app"), ...walk("components"), ...walk("lib")]) {
    if (allowed.has(f)) continue
    const src = stripComments(read(f))
    const m = src.match(/["'`}]\/library(?![\w-])|\.com\/library(?![\w-])/)
    if (m) offenders.push(`${f}: ${m[0]}`)
  }
  check("no internal link points at an old /library address (header, tab bar, emails, receipts, course player, memberships, wishlist)", offenders.length === 0, offenders.slice(0, 10))
  check("emails link to the new place", /\/account\/library\/courses/.test(read("lib/courses/emails.ts")) && /\/account\/library/.test(read("lib/email-variables.ts")))
  check("the course player's way back is the library's courses", /\/account\/library\/courses/.test(read("components/courses/course-player.tsx")))
  check("a receipt's way to the purchase is the new place", /\/account\/library/.test(read("app/receipt/[token]/receipt-view.tsx")))
  check("the native shell keeps /library as a known home, and allows the new one", /"\/library", "\/account\/library"/.test(read("lib/native-bridge.ts")) && /NATIVE_BUYER_HOME = "\/library"/.test(read("lib/auth/continue.ts")))
}

console.log("\nPush notifications: one switch, only where the route is")
{
  check("a 404 is no row at all", pushStateFrom(404, { error: "x" }) === null)
  check("a 503 says it turns on after the next update", pushStateFrom(503, { error: "not_set_up" }) === "not_yet")
  check("a 200 with the saved choice is the switch", pushStateFrom(200, { enabled: true, devices: 2 }) === true && pushStateFrom(200, { enabled: false, devices: 0 }) === false)
  check("anything else is no row", pushStateFrom(200, { enabled: "yes" }) === null && pushStateFrom(500, null) === null)
  const row = read("components/account/push-switch-row.tsx")
  check("labelled for what it is, and says sale and payout alerts are not affected", /Push notifications from communities and people/.test(row) && /Sale and payout alerts are not affected/.test(row))
  check("it saves with PATCH { enabled } and is in Preferences", /method: "PATCH"/.test(row) && /JSON\.stringify\(\{ enabled \}\)/.test(row) && /<PushSwitchRow \/>/.test(read("components/account/account-settings.tsx")))
}

console.log("\nCopy")
{
  const files = ["lib/library/paths.ts", "lib/profile/owner-pills.ts", "app/library/[[...path]]/route.ts", "app/account/library/layout.tsx", "app/account/page.tsx", "app/account/communities/page.tsx", "components/account/account-hub.tsx", "components/account/push-switch-row.tsx", "components/account/cover-field.tsx", "components/profile/profile-owner-pills.tsx", "components/profile/profile-hero.tsx", "components/library/library-tab-list.ts", "scripts/check-account-center.mjs"].filter((f) => existsSync(join(root, f)))
  const banned = /—|\b(unlock|elevate|seamless|powerful|effortless(ly)?|supercharge|transform)\b/i
  for (const f of files) check(`${f}: no em dash, no banned word`, !banned.test(read(f)), read(f).match(banned)?.[0])
}

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed > 0) process.exit(1)
