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
import { LIBRARY_TABS, isLibraryProduct, libraryTabs, showsLibraryTabs } from "@/components/library/library-tab-list"
import { navFadeKey } from "@/components/account/account-nav-fade"
import { cropFromBody, parseProfileCover, profileBandAspect, profileCoverValue } from "@/lib/profile/cover"
import { EDIT_PROFILE_HREF, ownerPillFor, ownerPillLinks, showsProfileHeader } from "@/lib/profile/owner-pills"
import { profileShareUrl } from "@/lib/profile/share-profile"
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
  check("the library keeps its gates, its purchase sync, its stage with the sub pills and the app banner", /email_verified/.test(lib) && /<PurchaseSyncProvider \/>/.test(lib) && /<LibraryPanel head=\{<LibraryTabs communities=\{communities\} \/>\}>/.test(lib) && /<OpenInApp phone=\{bannerFor\} \/>/.test(lib) && /NativeAuthGate requireAuth/.test(lib))
}

console.log("\nThe profile center's pills")
{
  /* Round 5: Edit profile left the pills for a button on the cover. */
  check("Activity, Communities, Library, Settings (Edit profile is on the cover now)", ownerPillLinks(true).map((p) => `${p.label} ${p.href}`).join() === "Activity /account,Communities /account/communities,Library /account/library,Settings /account/settings?section=account")
  check("Communities only while the switch is on", ownerPillLinks(false).map((p) => p.key).join() === "activity,library,settings")
  check("every library address lights Library", ["/account/library", "/account/library/courses", "/account/library/products/x"].every((p) => ownerPillFor(p) === "library"))
  /* Round 5: "Library opens as its own page ... WITHOUT the profile hero above them". */
  check("the person's header stands over Activity and Communities only: not over the library, not over Settings", showsProfileHeader("/account") && showsProfileHeader("/account/communities") && !showsProfileHeader("/account/library") && !showsProfileHeader("/account/library/wishlist") && !showsProfileHeader("/account/library/courses/c1") && !showsProfileHeader("/account/settings"))
  const pills = read("components/profile/profile-owner-pills.tsx")
  check("the pressed pill answers the press, its fill fading in where it is", /setPressed\(p\.key\)/.test(pills) && /transition-\[opacity,scale\]/.test(pills) && /scale-100 opacity-100" : "scale-\[0\.96\] opacity-0"/.test(pills))
  const member = read("components/profile/member-profile-page.tsx")
  check("/@<my handle> for me is the same owner view: the pills, Activity lit, my activity under them, no Follow (a creator: no Activity, round 6)", /(\{|: )isSelf \? \(/.test(member) && /\{isSelf && creator \? \(/.test(member) && /active="activity"/.test(member) && /isSelf=\{isSelf\}/.test(member))
}

console.log("\nThe cover, Edit profile, and the person under them (round 5)")
{
  const hero = code("components/profile/profile-hero.tsx")
  const cover = hero.slice(hero.indexOf("data-profile-cover="), hero.indexOf("data-profile-header="))
  check("the cover runs edge to edge: no card, no rounding, no border, taller than the creator page's (round 10 about +15%, round 11 about +6% more)", /className="relative w-full overflow-hidden bg-\[#eceef1\]"/.test(hero) && !/rounded-2xl/.test(cover) && !/border-\[#e5e7eb\]/.test(cover) && /h-\[157px\] sm:h-\[233px\] lg:h-\[312px\]/.test(hero))
  check("  so the hero is drawn outside the 960px column and keeps one of its own for the person", /<header className=\{cn\(COLUMN, "relative -mt-\[62\.5px\]/.test(hero) && /const COLUMN = "mx-auto w-full max-w-\[960px\]"/.test(hero))
  check("  /account draws the column under the hero, and around a page without one", /<AccountColumn top=\{false\}>/.test(code("components/account/account-hub.tsx")) && /<AccountColumn>\{children\}<\/AccountColumn>/.test(code("components/account/account-hub.tsx")) && !/max-w-\[960px\]/.test(code("app/account/layout.tsx")))
  check("  and /@handle draws the hero before its column too", (() => { const m = code("components/profile/member-profile-page.tsx"); return m.indexOf("<ProfileHero") < m.indexOf('max-w-[960px] px-4') })())
  check("no Joined line under the name", !/Joined/.test(hero) && !/memberSince/.test(hero))
  check("a lighter ring on the photo: 2px, a softer shadow", /ring-2 ring-\[#f8f9fa\]/.test(hero) && !/ring-4/.test(hero))
  check("Edit profile is a Storelib button on the cover, to /account/settings", EDIT_PROFILE_HREF === "/account/settings" && /<Link href=\{EDIT_PROFILE_HREF\}[^>]*className=\{cn\(secondaryDepth, "h-10 rounded-\[10px\] px-4 text-\[14px\]"\)\}>\s*Edit profile\s*<\/Link>/.test(hero))
  /* Round 8, changed on purpose: "Remove the camera icon button next to Edit profile on the profile cover." The cover is changed in Settings, which Edit profile opens. */
  check("  and nothing beside it: no camera button for the cover", !/<Camera|COVER_SETTINGS_HREF|data-profile-cover-edit|iconDepth/.test(hero) && cover.indexOf("EDIT_PROFILE_HREF") > 0)
  check("  only on your own page", /\{isSelf \? \(\s*<div className="absolute inset-x-0 top-3 sm:bottom-4 sm:top-auto" data-profile-cover-actions="">/.test(hero))
}

console.log("\nThe library, a page of its own (round 5)")
{
  const tabs = code("components/library/library-tabs.tsx")
  const ui = code("components/library/library-ui.ts")
  check("its own title over its sub pills", /<h1 className=\{`\$\{LIBRARY_TITLE\} \$\{LIBRARY_TITLE_GAP\}`\} data-library-title="">\s*Library\s*<\/h1>/.test(tabs) && /export const LIBRARY_TITLE = "[^"]*text-\[24px\] font-bold[^"]*sm:text-\[28px\]"/.test(ui))
  check("  drawn in the still copy a move back from a purchase shows, so nothing jumps", /<p className=\{`\$\{LIBRARY_TITLE\} \$\{LIBRARY_TITLE_GAP\}`\}>Library<\/p>/.test(code("components/library/library-skeletons.tsx")))
  check("  the constants live in a module the server can read (no \"use client\")", !/^"use client"/.test(read("components/library/library-ui.ts")))
  check("  and the tab's title says Library", /title: "Library"/.test(code("app/account/library/layout.tsx")))
  check("the profile's Library pill still leads there", ownerPillLinks(true).some((p) => p.key === "library" && p.href === LIBRARY_HOME))
}

console.log("\nOn a phone, your profile's header is a plain bar (round 5)")
{
  const header = code("components/platform/platform-header-client.tsx")
  check("only over the pages that draw the profile", /const profileBar = showsProfileHeader\(pathname\)/.test(header))
  const bar = header.slice(header.indexOf("{profileBar ? ("), header.indexOf(") : (", header.indexOf("{profileBar ? (")))
  check("  the logo stays; the navigator is not drawn below md", /chrome\.navigator, profileBar && "max-md:hidden"\)/.test(header))
  check("  the right of the row is one \"...\" button, below md only, 42px like the icons it replaces", /md:hidden flex items-center justify-end flex-1" data-header-profile-bar=""/.test(bar) && /<MoreHorizontal /.test(bar) && /h-\[42px\] w-\[42px\]/.test(bar) && /aria-label="More"/.test(bar))
  check("  no photo, no bell, no heart, no library there", !/NotificationBell|<Heart|AppAvatar|<Library/.test(bar))
  const sheet = header.slice(header.indexOf("data-profile-bar-sheet"), header.indexOf("What Share profile did"))
  /* Round 6: Log out is the shared red row of both phone sheets (SheetLogOut, "Log out"), still last. */
  const order = ["Share profile", "Settings", "settings.language", "Help", "<SheetLogOut "].map((w) => sheet.indexOf(w))
  check("  its sheet: Share profile, Settings, Language, Help, Log out, in that order", order.every((i, n) => i >= 0 && (n === 0 || i > order[n - 1])) && /function SheetLogOut[\s\S]{0,400}<span>Log out<\/span>/.test(header), order)
  check("  Settings opens the account's settings, Help the help center", /headerLink\("\/account\/settings\?section=account"\)[\s\S]{0,120}label="Settings"/.test(sheet) && /headerLink\("\/help"\)/.test(sheet))
  check("  the computer's row is untouched: the bell, the heart and the photo menu are still there", /hidden md:flex items-center gap-2\.5 shrink-0/.test(header) && /\{desktopAccountMenu\}/.test(header))
  const share = code("lib/profile/share-profile.ts")
  check("Share profile: the phone's share sheet first, a cancel is final, else the link is copied", /nav\.share\(\{/.test(share) && /AbortError"\) return "cancelled"/.test(share) && /clipboard\?\.writeText\(input\.url\)/.test(share) && share.indexOf("nav.share(") < share.indexOf("writeText("))
  check("  the address is the public /@handle on this origin", profileShareUrl("https://storelib.com", "Alex") === "https://storelib.com/@alex" && profileShareUrl("https://storelib.com/", "alex") === "https://storelib.com/@alex" && profileShareUrl("https://storelib.com", null) === null)
  check("  and a copied link says so", /"Link copied"/.test(header) && /data-profile-share-note=\{shareNote\}/.test(header))
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
  check("labelled for what it is, and says sale and payout alerts are not affected", /PUSH_TITLE = "Allow push notifications"/.test(row) && /From your communities and the people you follow/.test(row) && /Sale and payout alerts are not affected/.test(row))
  /* Round 12: it moved from Preferences to its own Notifications section, with the kinds under it. */
  check("it saves with PATCH { enabled } and heads Settings, Notifications", /method: "PATCH"/.test(row) && /JSON\.stringify\(\{ enabled \}\)/.test(row) && /<PushSwitchRow initial=/.test(read("components/account/notification-settings.tsx")) && /<NotificationSettings \/>/.test(read("components/account/account-settings.tsx")))
}

console.log("\nThe cover you place in Settings, drawn where you put it (round 8)")
{
  const host = "https://abc.supabase.co/storage/v1/object/public/covers/u1/1.webp"
  check("a stored address without a crop is a centred cover at its own size", JSON.stringify(parseProfileCover(host)) === JSON.stringify({ url: host, crop: { x: 50, y: 50, zoom: 1 } }))
  check("the crop rides on the address's fragment, which no server is sent", profileCoverValue(host, { x: 42.5, y: 30, zoom: 1.25 }) === `${host}#crop=42.5,30,1.25`)
  check("  and comes back as it went in", JSON.stringify(parseProfileCover(`${host}#crop=42.5,30,1.25`)) === JSON.stringify({ url: host, crop: { x: 42.5, y: 30, zoom: 1.25 } }))
  check("  the centred default adds nothing to the address", profileCoverValue(host, { x: 50, y: 50, zoom: 1 }) === host)
  check("  out of range values are held to the band (0..100, zoom 1..4), anything else after # is dropped", JSON.stringify(parseProfileCover(`${host}#crop=140,-3,9`).crop) === JSON.stringify({ x: 100, y: 0, zoom: 4 }) && parseProfileCover(`${host}#x`).url === host && parseProfileCover(`${host}#x`).crop.zoom === 1)
  check("  a crop from the browser is three finite numbers or nothing", cropFromBody({ x: 10, y: 20, zoom: 1 })?.x === 10 && cropFromBody({ x: "1", y: 2, zoom: 1 }) === null && cropFromBody([1, 2, 3]) === null && cropFromBody({ x: NaN, y: 2, zoom: 1 }) === null)
  check("the frame's shape is the profile band's: the window over 157, 233 or 312px (round 11, about +6%)", profileBandAspect(390) === Math.round((390 / 157) * 1000) / 1000 && profileBandAspect(800) === Math.round((800 / 233) * 1000) / 1000 && profileBandAspect(1440) === Math.round((1440 / 312) * 1000) / 1000 && profileBandAspect(5000) === 12)
  const field = code("components/account/cover-field.tsx")
  check("Settings' cover is the creator editor's control: the frame repositions, a new picture uploads with a live preview", /<ImageUpload\s+bucket="covers"\s+aspectRatio="cover"/.test(field) && /reposition=\{reposition\}/.test(field) && /livePreview/.test(field) && /emptyBand=\{/.test(field))
  check("  a move is saved alone, after the gesture, and the profile refreshed", /saveCover\(\{ crop: next \}\)/.test(field) && /CROP_SAVE_MS = \d+/.test(field) && /router\.refresh\(\)/.test(field))
  const route = code("app/api/profile/cover/route.ts")
  check("the route keeps the crop on the address, and moves only the picture already there", /cropFromBody\(body\.crop\)/.test(route) && /profileCoverValue\(picture, crop\)/.test(route) && /parseProfileCover\(/.test(route) && /ownCoverUrl\(body\.coverUrl, user\.id/.test(route))
  const hero = code("components/profile/profile-hero.tsx")
  check("the profile draws the cover with the creator page's crop model", /parseProfileCover\(person\.coverUrl\)/.test(hero) && /style=\{coverCropStyle\(cover\.crop\)\}/.test(hero))
  const upload = code("components/app/image-upload.tsx")
  check("with no cover, the band's own shape in the profile's grey and one button, not a dashed box", /emptyBand && reposition && !value && !pending/.test(upload) && /data-upload-empty-band=""/.test(upload))
  check("the probe exists", existsSync(join(root, "scripts/check-account-cover.mjs")) && existsSync(join(root, "scripts/render-account-cover.tsx")))
}

console.log("\nThe library's pills switch smoothly, and Communities is one of them (round 8)")
{
  check("Communities after Courses, only while communities are on", libraryTabs(false).map((t) => t.label).join() === "Products,Courses,Wishlist,Reviews,Receipts" && libraryTabs(true).map((t) => `${t.label} ${t.href}`).join() === "Products /account/library,Courses /account/library/courses,Communities /account/library/communities,Wishlist /account/library/wishlist,Reviews /account/library/reviews,Receipts /account/library/receipts")
  check("  its screen is a pill screen", showsLibraryTabs("/account/library/communities") && !showsLibraryTabs("/account/communities"))
  const page = code("app/account/library/communities/page.tsx")
  check("  the same list as the profile's Communities, and a 404 while off", /accountCommunitiesBody\(user\.id\)/.test(page) && /if \(!\(await communitiesEnabled\(\)\)\) notFound\(\)/.test(page) && existsSync(join(root, "app/account/library/communities/loading.tsx")))
  check("  the layout reads the switch and hands it to the pills", /communitiesEnabled\(\)/.test(code("app/account/library/layout.tsx")) && /libraryTabs\(communities\)/.test(code("components/library/library-tabs.tsx")))
  check("the account no longer rebuilds the library on every pill: one key for all the pill screens", navFadeKey("/account/library") === navFadeKey("/account/library/reviews") && navFadeKey("/account/library/communities") === navFadeKey("/account/library") && navFadeKey("/account/library/products/p1") !== navFadeKey("/account/library") && navFadeKey("/account") !== navFadeKey("/account/settings") && /key=\{navFadeKey\(pathname\)\}/.test(code("components/account/account-nav-fade.tsx")))
  const panel = code("components/library/library-panel.tsx")
  check("a pill's screen cross fades into the next: a copy of the old one, on the page's colour, dissolves over the new one as it commits", /getSnapshotBeforeUpdate/.test(panel) && /leaveCopy\(live, CROSS_MS, false, 1, true\)/.test(panel) && /groundOf\(el\)/.test(panel) && /export const CROSS_MS = \d+/.test(panel))
  check("  seen whole for the commit's frame, then faded on the compositor", /anim\.pause\(\)\s*requestAnimationFrame\(\(\) => requestAnimationFrame\(\(\) => anim\.play\(\)\)\)/.test(panel) && /\[\{ opacity: from \}, \{ opacity: 0 \}\]/.test(panel))
  check("  a cold pill's route skeleton dissolves into its screen the same way", /const watchSkeleton = useCallback/.test(panel) && /stillCopy\(skeleton, true\)/.test(panel))
  check("  no second entrance on top (the dip to a fifth), and the panel holds its height through the fade", !/panelEnter|className="library-panel/.test(panel) && !/library-panel(?!\.tsx)/.test(code("components/library/library-content-shell.tsx")) && /panel\.style\.minHeight = `\$\{Math\.ceil\(panel\.getBoundingClientRect\(\)\.height\)\}px`/.test(panel))
  check("the probe exists", existsSync(join(root, "scripts/check-library-switch.mjs")) && existsSync(join(root, "scripts/render-library-switch.tsx")))
}

console.log("\nCopy")
{
  const files = ["lib/library/paths.ts", "lib/profile/owner-pills.ts", "app/library/[[...path]]/route.ts", "app/account/library/layout.tsx", "app/account/page.tsx", "app/account/communities/page.tsx", "components/account/account-hub.tsx", "components/account/push-switch-row.tsx", "components/account/cover-field.tsx", "components/profile/profile-owner-pills.tsx", "components/profile/profile-hero.tsx", "components/library/library-tab-list.ts", "components/library/library-tabs.tsx", "components/account/account-column.tsx", "lib/profile/share-profile.ts", "scripts/check-account-center.mjs", "scripts/render-account-center.tsx", "lib/profile/cover.ts", "app/api/profile/cover/route.ts", "app/account/library/communities/page.tsx", "components/account/account-nav-fade.tsx", "components/library/library-panel.tsx", "components/library/library-content-shell.tsx", "components/library/library-skeletons.tsx", "scripts/check-library-switch.mjs", "scripts/render-library-switch.tsx", "scripts/check-account-cover.mjs", "scripts/render-account-cover.tsx"].filter((f) => existsSync(join(root, f)))
  const banned = /—|\b(unlock|elevate|seamless|powerful|effortless(ly)?|supercharge|transform)\b/i
  for (const f of files) check(`${f}: no em dash, no banned word`, !banned.test(read(f)), read(f).match(banned)?.[0])
}

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed > 0) process.exit(1)
