/**
 * ===========================================================================
 *  THE HEADER AND THE FOOTER AROUND THE PHONE'S TAB BAR
 * ===========================================================================
 * The owner, after using the tab bar on a phone:
 *
 *   "When logged in, on phones where the bottom tab bar shows, do not show
 *   the Library icon in the header. Keep the wishlist heart and the avatar."
 *   "When the Search tab is in the bottom bar the explore search bar under
 *   the header must not appear. And remove the Search for anything bar from
 *   the library and account pages entirely."
 *   "On /explore and the other pages that have the bottom tab bar, do not
 *   show the black site footer. It shows only on the homepage and marketing
 *   pages, and on /explore only when the user is not logged in."
 *   "The header must be present on /account the same way it is on the
 *   library pages."
 *
 * The rules are pure functions and are asked about every address here; the
 * wiring is read off the source. What it looks like is measured by
 * scripts/check-buyer-chrome.mjs.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { isFooterlessPage, isShopPage, siteFooterFor } from "../lib/nav/site-footer"
import { buyerTabsBelongOn } from "../lib/nav/buyer-tabs"
import { untt } from "./i18n-source"

let passed = 0
let failed = 0
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; console.log(`  FAIL  ${label}${detail === undefined ? "" : `   (${JSON.stringify(detail)})`}`) }
}
const read = (p: string) => untt(readFileSync(join(process.cwd(), p), "utf8"), p)
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "")

console.log("\nThe black footer, by page and by who is looking")
for (const p of ["/", "/features", "/pricing", "/blog", "/blog/a-post", "/faq", "/developers", "/privacy", "/terms", "/help", "/account-deletion"]) {
  check(`${p}: always`, siteFooterFor(p, { signedIn: false }) && siteFooterFor(p, { signedIn: true }))
}
for (const p of ["/explore", "/explore/design", "/wishlist"]) {
  check(`${p}: signed out yes, signed in no`, siteFooterFor(p, { signedIn: false }) && !siteFooterFor(p, { signedIn: true }))
}
for (const p of ["/account/library", "/account/library/products/abc", "/account/library/wishlist", "/account", "/account/security", "/explore/search"]) {
  check(`${p}: never, whoever is looking`, !siteFooterFor(p, { signedIn: false }) && !siteFooterFor(p, { signedIn: true }))
}
check("/account-deletion is a legal page, not the account", !isFooterlessPage("/account-deletion") && isFooterlessPage("/account"))
check("every page with the tab bar is a shop page or footerless", ["/explore", "/explore/design", "/explore/search", "/account/library", "/account/library/x", "/account", "/wishlist"].every((p) => buyerTabsBelongOn(p) && (isShopPage(p) || isFooterlessPage(p))))

const footer = code("components/marketing/conditional-footer.tsx")
check("the footer asks the rule, with the header's record of who is signed in", /siteFooterFor\(pathname, \{ signedIn \}\)/.test(footer) && /useSyncExternalStore\(subscribeAuthSnapshot, readSignedIn, \(\) => false\)/.test(footer))
check("signed in on explore gets the light compact footer, not the black one", /isExploreBrowsePage\(pathname\)/.test(footer) && /signedIn && !isNativeApp\(\)/.test(footer) && /ShopCompactFooter/.test(footer))
check("and hears a sign in or out without a reload", /\[pathname, searchParams, isHydrated, signedIn\]/.test(footer))

console.log("\nThe phone header where the tab bar is")
const header = code("components/platform/platform-header-client.tsx")
check("asks the tab bar's own question", /const tabsHere = useBuyerTabsHere\(pathname\)/.test(header) && /from "@\/lib\/nav\/use-buyer-tabs-where"/.test(read("components/platform/platform-header-client.tsx")))
check("the tab bar asks it the same way", /const where = useBuyerTabsWhere\(pathname\)/.test(code("components/nav/buyer-tab-bar.tsx")))
check("no Library icon in the phone row there", /\{user && !tabsHere && \(\s*<Link\s+href=\{getCanonicalOrRelativePath\("\/account\/library"\)\}/.test(header))
check("the photo stays (it opens the account sheet), the heart is gone", !/data-header-wishlist/.test(header) && /onClick=\{\(\) => setMobileProfileOpen\(true\)\}/.test(header))
/* Round 3: Explore's hamburger is the navigator now, which carries no Library row and no search link, so there is nothing of the tab bar's to drop. */
check("the menu there is the navigator: no My Library row and no search link to repeat the tab bar", /<PlaceNavigator\b/.test(header) && !/<MenuRow href="\/(account\/)?library"/.test(header) && !/isDiscoverProductContext && !tabsHere/.test(header))
/* Changed on purpose (r55): main 213cac29d keeps the strip off a receipt too (!isReceiptRoute). */
check("the search strip under the header: not with the tab bar, never on the library or the account", /\{(?:headerH > 0 && )?searchInHeader && (?:!isReceiptRoute && )?!tabsHere && !isOwnPages && !isCommunityRoute && \(/.test(header) && /const isOwnPages = pathname === "\/account\/library" \|\| pathname\.startsWith\("\/account\/library\/"\) \|\| pathname === "\/account" \|\| pathname\.startsWith\("\/account\/"\)/.test(header))
/* The strip is `fixed` at the foot of the header; a community's own tab row
   is `sticky` at the same offset, so the marketplace search landed on top of
   the community's spaces on a phone. Every /community address is out. */
check(
  "and never inside a community, where it covered the community's own nav",
  /const isCommunityRoute = pathname === "\/community" \|\| pathname\.startsWith\("\/community\/"\)/.test(header),
)

console.log("\nThe header's menu sheet opens smoothly")
{
  const src = read("components/platform/platform-header-client.tsx")
  /* "The animation when I open it needs to be smooth and clean": built ahead and kept on a phone, so the tap is only the slide. */
  /* Round 3: the marketing menu is the only one left in the header (Explore's is the navigator, which keeps its own sheet). */
  /* Changed on purpose (wave 18): the marketing menu is full screen, not a sheet (the owner, after the Fourthwall reference); it is still built ahead and kept on a phone, only where it can be opened, and the tap only fades it in. */
  check("the marketing menu is kept on a phone, and only where it can be opened",
    /\{isMarketingNavRoute && belowMd \? \(\s*<MarketingPhoneMenu\s+open=\{mobileMenuOpen\}/.test(src))
  check("and the navigator's sheet is kept on a phone too", /keepMounted=\{phone\}/.test(read("components/nav/place-navigator.tsx")))
  /* Changed on purpose (wave 18): the lines turn into an X as the reference's do, by transform (translate, rotate, scale) and opacity: still on the compositor, never width. */
  check("the menu button's lines move by opacity and transform only, never width", /transition-\[opacity,transform\]/.test(src) && /translateY\(7px\)_rotate\(45deg\)/.test(src) && !/transition-all duration-200 ease-out \$\{\s*isOpen \? "opacity-60 w-4"/.test(src) && !/opacity-60 w-4/.test(src))
}

console.log("\nThe header on /account")
const cond = code("components/marketing/conditional-header.tsx")
check("/account is a known platform path, so the header draws there on the first paint", /p === "\/account" \|\|\s*p\.startsWith\("\/account\/"\)/.test(cond))
/* "The profile page reached from Explore needs to have the header on it." The rule that kept it off /account on a phone is gone, and so is the light bar the profile drew instead. */
check("nothing hides the header on a phone any more: no rule, no wrapper", !/hidesHeaderOnPhone/.test(cond) && !/data-header-phone/.test(cond))
check("the header is returned plainly, whatever the width", /if \(!showPlatformHeader\) return null/.test(cond) && /\n  return header\n\}/.test(cond))
check("and the profile draws no bar of its own, so there is never a second one", !/data-account-bar/.test(code("components/account/account-hub.tsx")))
check("decided from the path the server renders with, not after hydration", !/matchMedia/.test(cond))
/* Changed on purpose: 158acdef added the light header's prop, and 84d43680 mounts the header through AccountHeaderSwitch, which draws it unless a community's own bar is on the profile. */
check("and the account layout mounts it, as the library's does", /<AccountHeaderSwitch initialWishlistCount=\{initialWishlistCount\} onPlatformDomain=\{onPlatformDomain\} buyerHeaderLight=\{buyerHeaderLight\} \/>/.test(read("app/(storelib)/account/layout.tsx")) && /return <ConditionalHeader \{\.\.\.props\} \/>/.test(code("components/account/account-header-switch.tsx")))

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed > 0) process.exit(1)
