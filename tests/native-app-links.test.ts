/**
 * ===========================================================================
 *  THE PHONE APP STAYS IN THE APP, OPENS WHERE IT WAS, AND A COMMUNITY HAS
 *  THE TAB BAR
 * ===========================================================================
 * Round 7, the app items:
 *
 *   2  /explore, product pages, creator pages, the buyer side and checkout
 *      never open the system browser inside the iOS / Android app. A Storelib
 *      address (storelib.com, www., <name>.storelib.com, storelib.me)
 *      navigates the app's WebView; only somebody else's site leaves it.
 *   3  A cold start opens the page the person was last on (safe pages only),
 *      else sellers /app and everybody else /explore.
 *   4  Inside a community the phone's tab bar is there and is the
 *      community's: Home its home, Search its search; Library and Profile
 *      as anywhere. Outside, unchanged.
 *
 * The rules are pure and asked about every kind of link and page here; the
 * wiring is read from the source. scripts/check-community-tab-bar.mjs draws
 * the bar in a community at 390px and presses Home and Search.
 */
import { readFileSync, existsSync } from "node:fs"
import { join } from "node:path"
import { NATIVE_ALLOW_NAVIGATION, isStorelibHost, nativeLinkFor, needsDocumentLoad } from "../lib/native-links"
import { isResumablePlace, resumablePlace, startTarget } from "../lib/native-resume"
import { BUYER_TABS, buyerTabFor, buyerTabsAt, buyerTabsBelongOn, communityOf } from "../lib/nav/buyer-tabs"
import { openCommunitySearch, registerCommunitySearch } from "../lib/nav/community-search-bridge"

let passed = 0
let failed = 0
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; console.log(`  FAIL  ${label}${detail === undefined ? "" : `   (${JSON.stringify(detail)})`}`) }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
const H = { mainDomain: "storelib.com", onePageDomain: "storelib.me" }
const link = (href: string) => nativeLinkFor(href, H)

/* ── 2. Every kind of link ────────────────────────────────────────────── */
console.log("\nA link in the app, by kind")
const cases: Array<[string, string, ReturnType<typeof nativeLinkFor>]> = [
  ["a path on this site", "/explore/design", { kind: "path", path: "/explore/design" }],
  ["a product as getProductUrl spells it (every Explore card)", "https://storelib.com/maria/preset-pack?layout=discover&recommended=1", { kind: "path", path: "/maria/preset-pack?layout=discover&recommended=1" }],
  ["a creator's page, absolute", "https://storelib.com/maria", { kind: "path", path: "/maria" }],
  ["www.storelib.com", "https://www.storelib.com/maria/preset-pack#reviews", { kind: "path", path: "/maria/preset-pack#reviews" }],
  ["storelib.com itself (the Made with Storelib mark) is Discover", "https://storelib.com", { kind: "path", path: "/explore" }],
  ["the OnePage at storelib.me", "https://storelib.me/Maria?utm_source=ig", { kind: "path", path: "/maria/links?utm_source=ig" }],
  ["the OnePage's old /l/ address there", "https://storelib.me/l/maria", { kind: "path", path: "/maria/links" }],
  ["a platform page on storelib.me", "https://storelib.me/checkout?productId=1", { kind: "path", path: "/checkout?productId=1" }],
  ["storelib.me alone", "https://storelib.me/", { kind: "path", path: "/explore" }],
  ["checkout begun on a creator's subdomain", "https://maria.storelib.com/checkout?productId=1", { kind: "path", path: "/checkout?productId=1" }],
  ["a receipt there", "https://maria.storelib.com/receipt/tok", { kind: "path", path: "/receipt/tok" }],
  ["an old product address on a subdomain", "https://maria.storelib.com/p/preset-pack", { kind: "path", path: "/p/preset-pack" }],
  ["the OnePage's old subdomain address", "https://maria.storelib.com/links", { kind: "path", path: "/maria/links" }],
  ["a platform subdomain", "https://app.storelib.com/explore", { kind: "path", path: "/explore" }],
  ["a creator's website stays theirs, in the WebView", "https://maria.storelib.com/about", { kind: "host", url: "https://maria.storelib.com/about" }],
  ["protocol relative", "//www.storelib.com/maria", { kind: "path", path: "/maria" }],
  ["a creator's own external link", "https://instagram.com/maria", { kind: "external", url: "https://instagram.com/maria" }],
  ["Stripe's docs", "https://stripe.com/legal", { kind: "external", url: "https://stripe.com/legal" }],
  ["a creator's own domain", "https://www.mariapresets.com/", { kind: "external", url: "https://www.mariapresets.com/" }],
  ["a look-alike host is not ours", "https://storelib.com.evil.example/x", { kind: "external", url: "https://storelib.com.evil.example/x" }],
  ["a user name in front of the host is not ours", "https://storelib.com@evil.example/x", { kind: "external", url: "https://storelib.com@evil.example/x" }],
  ["an anchor", "#reviews", { kind: "none" }],
  ["mail", "mailto:hi@storelib.com", { kind: "none" }],
  ["a phone number", "tel:+100", { kind: "none" }],
  ["a script", "javascript:alert(1)", { kind: "none" }],
]
for (const [label, href, want] of cases) check(`${label}: ${href}`, same(link(href), want), link(href))
check("our hosts, and only ours", isStorelibHost("storelib.com", H) && isStorelibHost("www.storelib.com", H) && isStorelibHost("maria.storelib.com", H) && isStorelibHost("storelib.me", H) && !isStorelibHost("storelib.com.evil.example", H) && !isStorelibHost("notstorelib.com", H))
check("the dashboard and the builders load as a document; Discover, products and the library on the client",
  needsDocumentLoad("/app/products") && !needsDocumentLoad("/account/library/x") && !needsDocumentLoad("/account/library/products/abc") && needsDocumentLoad("/store-builder") && !needsDocumentLoad("/explore") && !needsDocumentLoad("/maria/preset-pack") && !needsDocumentLoad("/community/club"))
check("the header and SmartLink ask the same list, so the navigator opens a library product on the client in the app",
  /const isCrossLayoutPath = needsDocumentLoad/.test(read("components/platform/platform-header-client.tsx")) && /needsDocumentLoad\(internalPath\)/.test(read("components/smart-link.tsx")))

console.log("\nThe places that sent it to Safari")
const bridge = code("lib/native-bridge.ts")
check("openExternal navigates the app for a Storelib address before anything opens a browser",
  /if \(isNativeApp\(\)\) \{\s*if \(navigateInApp\(url\)\) return\s*if \(isIOS\(\)\)/.test(bridge) && /export function navigateInApp\(/.test(bridge) && /const link = nativeLinkFor\(href\)/.test(bridge))
const smart = code("components/smart-link.tsx")
check("SmartLink: no target=\"_blank\" branch to the browser, and an absolute storelib.com address is a path",
  !/target === "_blank"/.test(smart) && /const link = href \? nativeLinkFor\(href\)/.test(smart) && /<Link href=\{link\.path\} \{\.\.\.linkSafeProps\}/.test(smart) && /openExternal\(link\.url\)/.test(smart) && !/toInternalHref/.test(smart))
check("  and the browser only for the external kind", (smart.match(/openExternal\(/g) ?? []).length === 1 && /\} else \{\s*openExternal\(link\.url\)/.test(smart))
check("the OnePage's Made with Storelib mark navigates the app rather than opening a browser sheet", /const openExternalUrl = async \(url: string\) => \{\s*if \(navigateInApp\(url\)\) return/.test(code("components/onepage/public-onepage.tsx")))
const wish = code("components/wishlist/wishlist-content.tsx")
check("the wishlist opens a product in this window in the app too", !/target: native \? "_blank"/.test(wish) && !/getProductShareUrl/.test(wish))
const guard = code("components/platform/native-link-guard.tsx")
check("the guard is installed in the app only, on every page", /if \(!isNativeApp\(\)\) return/.test(guard) && /<NativeLinkGuard \/>/.test(read("app/layout.tsx")))
check("  it reads clicks after React's handlers and leaves handled, modified and download clicks alone",
  /window\.addEventListener\("click", onClick\)/.test(guard) && /if \(e\.defaultPrevented \|\| e\.button !== 0/.test(guard) && /a\.hasAttribute\("download"\)/.test(guard))
check("  somebody else's site is left to the browser", /if \(link\.kind === "none" \|\| link\.kind === "external"\) return/.test(guard))
check("  a new window or another of our hosts navigates the app", /const newWindow = /.test(guard) && /if \(!newWindow && sameHost\(a\.href\)\) return/.test(guard) && /navigateInApp\(link\.kind === "path" \? link\.path : link\.url, routerRef\.current\)/.test(guard))
check("  from checkout a new window page opens in the sheet over it, keeping the payment", /const FLOW_PAGES = \["\/checkout", "\/purchase"\]/.test(guard) && /openInApp\(new URL\(link\.path, window\.location\.origin\)\.toString\(\)\)/.test(guard))
check("  but the in-app sheet's own window (openInApp) is let through", /__storelibSheet = url/.test(bridge) && /if \(href && sheet\.__storelibSheet === href\)/.test(guard))
check("  window.open of one of our pages navigates the app and never answers null", /window\.open = wrapped/.test(guard) && /\)\) return window/.test(guard) && /return before\.call\(window, url as string, target, features\)/.test(guard))
const cap = read("capacitor.config.ts")
const allow = (cap.match(/allowNavigation:\s*\[([\s\S]*?)\]/)?.[1] ?? "").match(/'[^']+'/g)?.map((h) => h.slice(1, -1)) ?? []
check("capacitor.config.ts allows every host the app may load (ships with the next native release)", NATIVE_ALLOW_NAVIGATION.every((h) => allow.includes(h)), allow)
check("  and still the three Stripe hosts it had", ["js.stripe.com", "hooks.stripe.com", "connect-js.stripe.com"].every((h) => allow.includes(h)))
check("  and nothing that is not ours or Stripe's", allow.every((h) => /storelib\.(com|me)$/.test(h) || /\.stripe\.com$/.test(h)), allow)

/* ── 3. Where the app opens ───────────────────────────────────────────── */
console.log("\nThe page the app opens on")
const keep: Array<[string, string, string | null]> = [
  ["/explore", "", "/explore"],
  ["/explore", "?q=presets&category=design&utm_source=x&token=abc", "/explore?q=presets&category=design"],
  ["/explore/search", "", "/explore/search"],
  ["/community/mara-club", "", "/community/mara-club"],
  ["/community/mara-club", "?space=general&utm_source=x", "/community/mara-club?space=general"],
  ["/community/mara-club/post/42", "", "/community/mara-club/post/42"],
  ["/community/mara-club/classroom", "?lesson=3", "/community/mara-club/classroom"],
  ["/account/library", "", "/account/library"],
  ["/account/library/products/abc", "?download=1", "/account/library/products/abc"],
  ["/account", "", "/account"],
  ["/wishlist", "", "/wishlist"],
  ["/maria", "", "/maria"],
  ["/maria/preset-pack", "?ref=x", "/maria/preset-pack"],
  ["/p/preset-pack", "", "/p/preset-pack"],
  ["/app", "", "/app"],
  ["/app/products", "?session_id=cs_x", "/app/products"],
  ["/maria/preset-pack/", "", "/maria/preset-pack"],
]
for (const [p, q, want] of keep) check(`kept: ${p}${q} -> ${want}`, resumablePlace(p, q) === want, resumablePlace(p, q))
const never = ["/", "/checkout", "/checkout/physical", "/checkout/physical/order/tok", "/purchase/x", "/receipt/tok", "/access/x", "/downloads/x", "/login", "/signup/verify", "/auth/callback", "/welcome", "/reset-password", "/native-start", "/onboarding", "/account/continue", "/unsubscribe/x", "/upgrade", "/api/x", "/community", "/community/mara-club/join", "/community/Bad_Slug", "/store-builder", "/website-builder/x", "/creator-page", "/admin", "/sell", "/w/maria", "/maria/preset-pack/extra", "//evil.example", "/a\\b", "/a b", "/a/../b", "/%2e%2e"]
for (const p of never) check(`never kept: ${p}`, resumablePlace(p, "") === null, resumablePlace(p, ""))
check("a kept place is read back only in the shape it was kept", isResumablePlace("/explore?q=a") && !isResumablePlace("/explore?token=a") && !isResumablePlace("/checkout") && !isResumablePlace(null) && !isResumablePlace("https://storelib.com/explore"))
check("nothing kept: a seller to /app", startTarget({ last: null, home: "/app" }) === "/app")
check("nothing kept: anybody else to /explore", startTarget({ last: null, home: "/library" }) === "/explore" && startTarget({ last: null, home: null }) === "/explore")
check("kept: there, for a seller and a buyer alike", startTarget({ last: "/community/mara-club", home: "/library" }) === "/community/mara-club" && startTarget({ last: "/maria/preset-pack", home: "/app" }) === "/maria/preset-pack")
check("a kept page that is not safe is ignored", startTarget({ last: "/checkout?productId=1", home: "/library" }) === "/explore")
check("Discover off: the library, and never a kept Discover page (it would loop through /native-start)",
  startTarget({ last: null, home: "/library", exploreOn: false }) === "/account/library" && startTarget({ last: "/explore?q=a", home: "/library", exploreOn: false }) === "/account/library" && startTarget({ last: "/community/x", home: "/library", exploreOn: false }) === "/community/x")

const start = code("app/native-start/page.tsx")
check("the start asks startTarget with the kept place, at every layer that knows a home",
  (start.match(/safeRedirect\(go\(/g) ?? []).length === 3 && /safeRedirect\(cached \? go\(cached\) : "\/app"\)/.test(start) && /startTarget\(\{ last: kept \? readLastPlace\(\) : null, home, exploreOn \}\)/.test(start))
check("the community start it replaces is gone", !/communityStart|\/api\/native\/start|isCommunityStart|isLibraryHome/.test(start))
check("a kept place passes the redirect's own check, anything else is a home or /app", /const target = isHandoff \|\| isResumablePlace\(url\) \? url : sanitizeNativeHome\(url\)/.test(start) && /target === "\/native-start"/.test(start))
check("only a start opens the kept page: the logo's '/' from inside the app goes home", /function documentOpenedHere\(\)/.test(start) && /new URL\(nav\.name\)\.pathname === "\/native-start"/.test(start) && /const kept = !startUsed && documentOpenedHere\(\) && !startedJustNow\(\)/.test(start) && /startUsed = true/.test(start))
check("and a start that comes straight back is not tried twice", /const RETRY_MS = 8000/.test(start) && /startedAgain = Date\.now\(\) - at < RETRY_MS/.test(start))
const keeper = code("components/platform/native-place-keeper.tsx")
check("the place is kept on every navigation, in the app only", /if \(!pathname \|\| !isNativeApp\(\)\) return/.test(keeper) && /resumablePlace\(path, window\.location\.search\)/.test(keeper) && /\}, \[pathname\]\)/.test(keeper) && /<NativePlaceKeeper \/>/.test(read("app/layout.tsx")))
check("and forgotten on log out: /welcome, and both log out helpers", /if \(path === "\/welcome"\) \{\s*forgetLastPlace\(\)/.test(keeper) && (bridge.match(/forgetLastPlace\(\)/g) ?? []).length === 2)

/* ── 4. The tab bar in a community ────────────────────────────────────── */
console.log("\nThe tab bar inside a community")
check(
  "a community's pages have the bar for signed-in members",
  ["/community/mara-club", "/community/mara-club/space/general", "/community/mara-club/post/1", "/community/mara-club/members", "/community/mara-club/about"].every((p) => buyerTabsBelongOn(p, { signedIn: true })),
)
check(
  "signed-out visitors on a community see no tab bar",
  ["/community/mara-club", "/community/mara-club/about"].every((p) => !buyerTabsBelongOn(p, { signedIn: false })),
)
check("  Discover off too: Home and Search here are the community's", buyerTabsBelongOn("/community/mara-club", { exploreMarketplaceEnabled: false, signedIn: true }) && buyerTabsAt("/community/mara-club", false).length === 4)
check("  /community alone keeps none, and nor does a creator's own host", !buyerTabsBelongOn("/community") && !buyerTabsBelongOn("/community/mara-club", { customDomain: true }) && !buyerTabsBelongOn("/community/mara-club", { sellerSite: true }))
check("the community from the address, and nothing that is not a slug", communityOf("/community/mara-club/post/1") === "mara-club" && communityOf("/community/mara-club") === "mara-club" && communityOf("/community") === null && communityOf("/community/Bad_Slug") === null && communityOf("/explore") === null)
const inside = buyerTabsAt("/community/mara-club/space/general")
check("Home goes to the community's home", inside[0].key === "home" && inside[0].href === "/community/mara-club")
check("Search, Library and Profile in the same order, Library and Profile global", same(inside.map((t) => t.key), ["home", "search", "library", "profile"]) && inside[2].href === "/account/library" && inside[3].href === "/account")
check("every page of the community lights Home", buyerTabFor("/community/mara-club/members") === 0 && buyerTabFor("/community/mara-club", { exploreMarketplaceEnabled: false }) === 0)
check("outside a community nothing changed", same(buyerTabsAt("/explore"), BUYER_TABS) && buyerTabsAt("/explore")[0].href === "/explore" && buyerTabsAt("/explore", false).map((t) => t.key).join() === "library,profile" && buyerTabFor("/account") === 3)
let opened = 0
const off = registerCommunitySearch("mara-club", { open: () => { opened++ }, refocus: () => {} })
check("the community's search is opened by its slug, and only while it is on the page",
  openCommunitySearch("mara-club") && opened === 1 && !openCommunitySearch("other-club") && !openCommunitySearch(null) && (off(), !openCommunitySearch("mara-club")))
const bar = code("components/nav/buyer-tab-bar.tsx")
check("the bar takes the community's tabs and opens its search first, the site's when there is none",
  /const community = communityOf\(pathname\)/.test(bar) && /const tabs = buyerTabsAt\(pathname, exploreMarketplaceEnabled(, homeCommunity)?\)/.test(bar)
    && /if \(tab\.key === "search" && community && openCommunitySearch\(community\)\) return\s*if \(tab\.key === "search" && openSearchOverlay\(query\)\) return/.test(bar) && /refocusCommunitySearch\(community\)/.test(bar))
const search = code("components/community/member/search.tsx")
check("the community's search button lends its screen to the bar, opened inside the tap", /registerCommunitySearch\(slug, \{\s*open: \(\) => \{\s*flushSync\(\(\) => setOpen\(true\)\)\s*input\.current\?\.focus\(\)/.test(search))
const css = read("app/globals.css")
/* Round 10: the join bar runs on under the tab bar to the screen's foot (its own padding reads --buyer-tabs-h), so no page shows between them. */
check("the join bar's white runs on under the tab bar, and a chat's field is lifted over it", !/\[data-join-bar\] \{\s*bottom: var\(--buyer-tabs-h\)/.test(css) && /paddingBottom: "calc\(12px \+ var\(--buyer-tabs-h, env\(safe-area-inset-bottom, 0px\)\)\)"/.test(read("components/community/public/join-controls.tsx")) && /html\[data-buyer-tabs="shown"\] \[data-chat\] \{\s*padding-bottom: calc\(var\(--buyer-tabs-h\) \+ 12px\);/.test(css))
check("the probes exist", ["scripts/check-community-tab-bar.mjs", "scripts/render-community-tab-bar.tsx", "scripts/check-native-links.mjs", "scripts/render-native-links.tsx"].every((f) => existsSync(join(process.cwd(), f))))

/* ── Copy ─────────────────────────────────────────────────────────────── */
console.log("\nCopy")
const mine = ["lib/native-links.ts", "lib/native-resume.ts", "lib/nav/community-search-bridge.ts", "components/platform/native-link-guard.tsx", "components/platform/native-place-keeper.tsx", "scripts/check-community-tab-bar.mjs", "scripts/render-community-tab-bar.tsx", "scripts/check-native-links.mjs", "scripts/render-native-links.tsx"]
const offenders = mine.filter((f) => existsSync(f) && (/—/.test(read(f)) || /\b(unlock\w*|elevate|seamless|powerful|effortless(ly)?|supercharge|transform\w*)\b/i.test(read(f))))
check("no em dash and no banned word in this round's new files", offenders.length === 0, offenders)

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
