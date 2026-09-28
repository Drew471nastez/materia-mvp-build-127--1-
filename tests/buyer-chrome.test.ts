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

let passed = 0
let failed = 0
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; console.log(`  FAIL  ${label}${detail === undefined ? "" : `   (${JSON.stringify(detail)})`}`) }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "")

console.log("\nThe black footer, by page and by who is looking")
for (const p of ["/", "/features", "/pricing", "/blog", "/blog/a-post", "/faq", "/developers", "/privacy", "/terms", "/help", "/account-deletion"]) {
  check(`${p}: always`, siteFooterFor(p, { signedIn: false }) && siteFooterFor(p, { signedIn: true }))
}
for (const p of ["/explore", "/explore/design", "/wishlist"]) {
  check(`${p}: signed out yes, signed in no`, siteFooterFor(p, { signedIn: false }) && !siteFooterFor(p, { signedIn: true }))
}
for (const p of ["/library", "/library/products/abc", "/library/wishlist", "/account", "/account/security", "/explore/search"]) {
  check(`${p}: never, whoever is looking`, !siteFooterFor(p, { signedIn: false }) && !siteFooterFor(p, { signedIn: true }))
}
check("/account-deletion is a legal page, not the account", !isFooterlessPage("/account-deletion") && isFooterlessPage("/account"))
check("every page with the tab bar is a shop page or footerless", ["/explore", "/explore/design", "/explore/search", "/library", "/library/x", "/account", "/wishlist"].every((p) => buyerTabsBelongOn(p) && (isShopPage(p) || isFooterlessPage(p))))

const footer = code("components/marketing/conditional-footer.tsx")
check("the footer asks the rule, with the header's record of who is signed in", /siteFooterFor\(pathname, \{ signedIn \}\)/.test(footer) && /useSyncExternalStore\(subscribeAuthSnapshot, readSignedIn, \(\) => false\)/.test(footer))
check("and hears a sign in or out without a reload", /\[pathname, searchParams, isHydrated, signedIn\]/.test(footer))

console.log("\nThe phone header where the tab bar is")
const header = code("components/platform/platform-header-client.tsx")
check("asks the tab bar's own question", /const tabsHere = useBuyerTabsHere\(pathname\)/.test(header) && /from "@\/lib\/nav\/use-buyer-tabs-where"/.test(read("components/platform/platform-header-client.tsx")))
check("the tab bar asks it the same way", /const where = useBuyerTabsWhere\(pathname\)/.test(code("components/nav/buyer-tab-bar.tsx")))
check("no Library icon in the phone row there", /\{user && !tabsHere && \(\s*<Link\s+href=\{getCanonicalOrRelativePath\("\/library"\)\}/.test(header))
check("the heart and the photo stay (the photo opens the account sheet)", /aria-label="Wishlist"/.test(header) && /onClick=\{\(\) => setMobileProfileOpen\(true\)\}/.test(header))
check("the menu sheet drops My Library and its search link there", /\{!tabsHere && \(\s*<div className="border-b border-\[#eef0f2\] pb-1">\s*<MenuRow href="\/library"/.test(header) && /isDiscoverProductContext && !tabsHere/.test(header))
check("the search strip under the header: not with the tab bar, never on the library or the account", /\{searchInHeader && !tabsHere && !isOwnPages && \(/.test(header) && /const isOwnPages = pathname === "\/library" \|\| pathname\.startsWith\("\/library\/"\) \|\| pathname === "\/account" \|\| pathname\.startsWith\("\/account\/"\)/.test(header))

console.log("\nThe header on /account")
const cond = code("components/marketing/conditional-header.tsx")
check("/account is a known platform path, so the header draws there on the first paint", /p === "\/account" \|\|\s*p\.startsWith\("\/account\/"\)/.test(cond))
check("and the account layout mounts it, as the library's does", /<ConditionalHeader initialWishlistCount=\{initialWishlistCount\} onPlatformDomain=\{onPlatformDomain\} \/>/.test(read("app/account/layout.tsx")))

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed > 0) process.exit(1)
