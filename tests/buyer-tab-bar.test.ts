/**
 * ===========================================================================
 *  THE BUYER'S TAB BAR AND THE ACCOUNT PAGE
 * ===========================================================================
 * The owner asked for two things on the buyer's side of storelib.com:
 *
 *   A phone's tab bar outside /app, "Home, Search, Library, Profile avatar,
 *   in this order", a plain white bar with the /app pill's touch (the slide,
 *   the glass bubble, the icon fill), no red badges.
 *
 *   A profile for the buyer, /account: who they are and what they have
 *   (Overview), and one tab over photo, name, email, password, preferences,
 *   log out, delete (/account/settings). /library/settings folds into it.
 *
 * Where the bar is and which tab a page belongs to are pure functions and are
 * asked about every address here. What it looks like under a finger is
 * measured in scripts/check-buyer-tab-bar.mjs; this is the wiring a browser
 * probe cannot see.
 */
import { legacyLibraryTarget } from "../lib/library/paths"
import { readFileSync, existsSync } from "node:fs"
import { join } from "node:path"
import {
  BUYER_TABS,
  SEARCH_HREF,
  SIGNED_OUT_PROFILE_HREF,
  buyerTabFor,
  buyerTabsBelongOn,
  buyerTabsForMarketplace,
} from "../lib/nav/buyer-tabs"
import { isSellerProductPath } from "../lib/url-helpers"
import { RESERVED_ROOT_SEGMENTS } from "../lib/routes/reserved-segments"
import { untt } from "./i18n-source"

let passed = 0
let failed = 0
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; console.log(`  FAIL  ${label}${detail === undefined ? "" : `   (${JSON.stringify(detail)})`}`) }
}
const read = (p: string) => untt(readFileSync(join(process.cwd(), p), "utf8"), p)
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")

console.log("\nThe four tabs, in the owner's order")
check("Home, Search, Library, Profile", BUYER_TABS.map((t) => t.label).join() === "Home,Search,Library,Profile", BUYER_TABS.map((t) => t.label))
check("Home is Explore, Library the library, Profile the account page", BUYER_TABS[0].href === "/explore" && BUYER_TABS[2].href === "/account/library" && BUYER_TABS[3].href === "/account")
check("Search is a static screen under /explore, so no creator's handle is taken from them", SEARCH_HREF === "/explore/search" && !RESERVED_ROOT_SEGMENTS.includes("search") && existsSync(join(process.cwd(), "app/(storelib)/(marketing)/explore/search/page.tsx")))
check("signed out, Profile is sign in and then the account page", SIGNED_OUT_PROFILE_HREF === "/login?next=%2Faccount")

console.log("\nWhere it is drawn")
const on = ["/explore", "/explore/design", SEARCH_HREF, "/account/library", "/account/library/products/abc", "/account/library/wishlist", "/account/communities", "/account", "/wishlist"]
for (const p of on) check(`on ${p}`, buyerTabsBelongOn(p))
const off = ["/", "/app", "/app/products", "/admin", "/checkout", "/checkout/abc", "/login", "/signup", "/reset-password", "/purchase/x", "/creator-page", "/website-builder", "/blog", "/pricing", "/sell", "/account/continue", "/w/someone"]
for (const p of off) check(`not on ${p}`, !buyerTabsBelongOn(p))
/* Round 10: a receipt is one of the person's own pages, with the bar and Library lit (image 64: it had no way back). */
check("on a receipt, with Library lit", buyerTabsBelongOn("/receipt/tok") && buyerTabFor("/receipt/tok") === 2 && buyerTabFor("/receipt/tok", { exploreMarketplaceEnabled: false }) === 0)

console.log("\nDiscover off: library and profile only")
check("two tabs when marketplace is off", buyerTabsForMarketplace(false).map((t) => t.key).join() === "library,profile")
for (const p of ["/explore", "/explore/design", SEARCH_HREF, "/wishlist"]) {
  check(`not on ${p} when discover is off`, !buyerTabsBelongOn(p, { exploreMarketplaceEnabled: false }))
}
for (const p of ["/account/library", "/account/library/wishlist", "/account"]) {
  check(`still on ${p} when discover is off`, buyerTabsBelongOn(p, { exploreMarketplaceEnabled: false }))
}
check("/account/library is tab 0 and /account is tab 1 when discover is off", buyerTabFor("/account/library", { exploreMarketplaceEnabled: false }) === 0 && buyerTabFor("/account/library/courses", { exploreMarketplaceEnabled: false }) === 0 && buyerTabFor("/account", { exploreMarketplaceEnabled: false }) === 1)
/*
  A CREATOR'S PRODUCT HAS NO BAR; THEIR PAGE DOES. The bar came off both,
  because on a product the page's own buy bar already stands at the foot and
  a second row under it is two navigations over the thing being sold. A
  creator's page has no buy bar, and opening one from the library left no
  way back, so the two are told apart now: the product by its address, the
  page by being a seller surface that is not one.
*/
check("a creator's product never has the bar: its own buy bar is already there",
  !buyerTabsBelongOn("/maria/preset-pack", { sellerSurface: true, sellerProduct: true }) && !buyerTabsBelongOn("/p/preset-pack", { sellerSurface: true, sellerProduct: true }))
/* Round 24: the owner asked for the creator's page without it; the header's Back leads out. */
check("  nor their page: it is the creator's, whole",
  !buyerTabsBelongOn("/maria", { sellerSurface: true, sellerStore: true }) && !buyerTabsBelongOn("/u/maria", { sellerSurface: true, sellerStore: true }))
check("  and never on their own subdomain: that is their site, not Storelib browsing",
  !buyerTabsBelongOn("/", { sellerSurface: true, sellerSite: true }) && !buyerTabsBelongOn("/preset-pack", { sellerSurface: true, sellerSite: true, sellerProduct: true }))
check("never on a creator's own domain, whatever the path", !buyerTabsBelongOn("/explore", { customDomain: true }) && !buyerTabsBelongOn("/", { customDomain: true, sellerStore: true }))
/* Which address is a product, read the way the bar reads it. */
check("a product is known by its address, in every spelling it has",
  isSellerProductPath("/maria/preset-pack") && isSellerProductPath("/p/preset-pack") && isSellerProductPath("/l/abc") && !isSellerProductPath("/maria") && !isSellerProductPath("/u/maria") && !isSellerProductPath("/explore"))

console.log("\nWhich tab a page belongs to")
const cases: Array<[string, { query?: boolean; sellerSurface?: boolean }, number]> = [
  ["/explore", {}, 0],
  ["/explore/design", {}, 0],
  ["/explore", { query: true }, 1],
  [SEARCH_HREF, {}, 1],
  ["/account/library", {}, 2],
  ["/account/library/wishlist", {}, 2],
  ["/account/library/products/abc", {}, 2],
  ["/account/communities", {}, 3],
  ["/wishlist", {}, 2],
  ["/account", {}, 3],
  ["/maria/preset-pack", { sellerSurface: true }, 0],
  ["/checkout", {}, -1],
]
for (const [p, where, want] of cases) check(`${p}${where.query ? "?q=" : ""} is ${want < 0 ? "no tab" : BUYER_TABS[want].label}`, buyerTabFor(p, where) === want, buyerTabFor(p, where))

console.log("\nThe bar: the pill's touch, not a copy of it")
const bar = code("components/nav/buyer-tab-bar.tsx")
const lens = code("components/nav/tab-lens.tsx")
const pill = code("components/app/sidebar-mobile-nav.tsx")
check("the slide, the lens and the pick are the shared hook's, in both bars", /useTabLens\(\{/.test(bar) && /useTabLens\(\{/.test(pill) && /export function useTabLens\(/.test(lens) && /export function useSlide\(/.test(lens))
/* "I don't really like the bump when I click an icon." The buyer's bar asks the shared lens for no give, and its glass never grows in. */
/*
  Changed on purpose (round 29): "smoother in and out, a spring-like transform with a good curve". The icon still never
  squeezes (give: false), and the glass no longer switches on in a frame: it swells from 0.9 to whole on a spring and sinks
  back as it fades, on scale and opacity alone. Still never the 55% grow that was the bump.
*/
check("no squeeze on a tap; the glass swells in from 0.9 on a spring and sinks back, never from 55%", /give: false,/.test(bar) && /if \(give\) pulse\(index\)/.test(lens) && /scale: String\(slide\.following \? LIFT : shows && !arriving \? 1 : LENS_REST\)/.test(bar) && /const LENS_REST = 0\.9/.test(bar) && /scale 420ms \$\{LENS_SPRING\}/.test(bar) && !/0\.55/.test(bar))
check("the other tabs' pages are fetched while the phone is idle, on a phone only, as the device and network allow", /requestIdleCallback/.test(read("lib/nav/prefetch-policy.ts")) && /return prefetchOnIdle\(router, hrefs\)/.test(bar) && /matchMedia\?\.\("\(max-width: 767px\)"\)\.matches\) return/.test(bar))
check("and nothing of the slide is written twice", !/function useSlide\(/.test(bar + pill) && !/function settleSpring\(/.test(bar + pill) && !/const TAP_PULSE\b/.test(bar + pill))
check("the icons cross fade through the shared NavIcon, drawn on their own layers", /<NavIcon icon=\{[^}]+\} active=\{on\} color="currentColor" box=\{GLYPH\} layer \/>/.test(bar))
check("the finger's gesture decides, and a keyboard's Enter still picks", /\{\.\.\.slide\.handlers\}/.test(bar) && /if \(e\.detail === 0\) pick\(i\)/.test(bar) && /touchAction: "none"/.test(bar))
/*
  Changed on purpose (round 29): the glass's look is fixed (fill, sheen and edge from --sl-tab-lens*, dark values in
  scripts/gen-theme-dark.mjs) and only its opacity comes and goes, so a fade is the compositor's and not a repaint. It
  is there while a finger is, and for LENS_HOLD_MS after a tap, so a short tap still shows it whole.
*/
/* Changed on purpose (round 30): a tap shows the glass at a strength of its own, less than a drag. */
check("the glass is there while a finger is, and a tap's moment after, by opacity alone", /const lit = slide\.pressed \|\| slide\.following/.test(bar) && /const shows = lit \|\| holding/.test(bar) && /opacity: shows && !arriving \? \(slide\.following \? LENS_DRAG_STRENGTH : LENS_TAP_STRENGTH\) : 0,/.test(bar) && /backgroundColor: LENS_FILL,/.test(bar) && !/backdropFilter/.test(bar))
check("the glass is a translucent tint with a thin highlight, its dark look from variables", /const LENS_FILL = "var\(--sl-tab-lens, rgba\(120,128,150,0\.1\)\)"/.test(bar) && /--sl-tab-lens-sheen/.test(bar) && /--sl-tab-lens-edge/.test(bar) && /--sl-tab-lens: rgba\(255,255,255,0\.045\);/.test(read("scripts/gen-theme-dark.mjs")))
/*
  Round 31: "the liquid thing as I'm dragging ... too solid and looks really weird". Under a dragging finger the glass gets
  a rim and a sheen of its own, by opacity only and only while dragging (a tap is round 30's, unchanged); the sheen is on
  its own layer and the slide moves it with the glass's place. Measured in scripts/check-lens-round31.mjs.
*/
{
  const glassEl = bar.slice(bar.indexOf("data-buyer-tabs-lens-glass"), bar.indexOf("{tabs.map("))
  check("round 31: a drag adds a rim and a sheen, faded in by opacity while dragging only",
    /const LENS_RIM = "var\(--sl-tab-lens-rim, /.test(bar) && /const LENS_SPEC = "var\(--sl-tab-lens-spec, radial-gradient\(/.test(bar)
      && /boxShadow: LENS_RIM,/.test(glassEl) && /opacity: slide\.following && !arriving \? 1 : 0,/.test(glassEl) && /willChange: "opacity"/.test(glassEl))
  check("the sheen is its own layer, moved by the slide, never by a render", /data-lens-sheen=""/.test(glassEl) && /backgroundImage: LENS_SPEC, willChange: "translate"/.test(glassEl)
    && /querySelector<HTMLElement>\("\[data-lens-sheen\]"\)/.test(lens) && /sheen\.style\.translate = /.test(lens))
  check("still no backdrop blur and nothing on the glass that is not opacity or a transform", !/backdropFilter|filter:/.test(glassEl) && !/background-color \$\{|box-shadow \$\{/.test(glassEl))
  const gen = read("scripts/gen-theme-dark.mjs")
  check("its dark look is fainter, from the generated sheet", /--sl-tab-lens-rim: inset 0 1px 1\.5px -0\.5px rgba\(255,255,255,0\.12\)/.test(gen) && /--sl-tab-lens-spec: radial-gradient\(34% 26% at 36% 32%, rgba\(255,255,255,0\.06\)/.test(gen)
    && /--sl-tab-lens-rim:/.test(read("app/theme-dark.css")) && /--sl-tab-lens-spec:/.test(read("app/theme-dark.css")))
  check("and the round 30 strengths are kept: a tap at half in the light and none in the dark", /const LENS_TAP_STRENGTH = "var\(--sl-tab-lens-tap, 0\.5\)"/.test(bar) && /--sl-tab-lens-tap: 0;/.test(gen) && /--sl-tab-lens-drag: 0\.75;/.test(gen))
  check("the drag is measured: follow, stretch, landing, paints and pictures", existsSync(join(process.cwd(), "scripts/check-lens-round31.mjs")) && /Input\.dispatchTouchEvent/.test(read("scripts/check-lens-round31.mjs")) && /setCPUThrottlingRate/.test(read("scripts/check-lens-round31.mjs")))
}
check("a plain white bar across the foot, not a pill: full width, phones only", /className="fixed inset-x-0 bottom-0 z-50 bg-white md:hidden"/.test(bar) && !/rounded-full"[^>]*data-buyer-tab-bar/.test(bar))
check("with a hairline and a little depth along its top", /const BAR_SHADOW = "0 -0\.5px 0 rgba\(16,18,27,0\.09\)/.test(bar))
check("the home indicator's inset under it", /paddingBottom: "env\(safe-area-inset-bottom, 0px\)"/.test(bar))
check("no badges", !/badge|count\b.*bg-red|bg-red/i.test(bar))
const icons = code("components/nav/buyer-tab-icons.tsx")
check("the Profile tab is a person icon, never the photo (the photo is in the header)", !/AppAvatar/.test(bar) && /profile: PERSON_ICONS/.test(bar) && /PERSON_ICONS: NavIconPair = \{ line: PersonLinear, fill: PersonBold \}/.test(icons) && /@solar-icons\/react\/bold\/user"/.test(icons))
check("signed out it is still the person, named Log in", /readAuthSnapshot/.test(bar) && /aria-label=\{tab\.key === "profile" && !signedIn \? "Log in" : tab\.label\}/.test(bar))
check("Search's active glyph keeps its glass: a heavier rim and a faint tint, not Solar's solid disc", /search: SEARCH_ICONS/.test(bar) && !/bold\/magnifier/.test(bar + icons) && /fillOpacity=\{TINT\}/.test(icons) && /const HEAVY = 2\.25/.test(icons) && /const TINT = 0\.1\d?/.test(icons))
check("it slides away while a field has the focus, and says so to the page", /const away = typing/.test(bar) && /translate: away \? "0 calc\(100% \+ 12px\)" : "0 0"/.test(bar) && /root\.setAttribute\("data-buyer-tabs", away \? "away" : "shown"\)/.test(bar))
const overlay = code("components/search/search-overlay.tsx")
check("Search opens the full screen search from inside the press, so the keyboard comes with it", /if \(tab\.key === "search" && openSearchOverlay\(query\)\) return/.test(bar) && /flushSync\(\(\) => \{[\s\S]*?setOpen\(true\)[\s\S]*?\}\)\s*screen\.current\.field\?\.focus\(\{ preventScroll: true \}\)/.test(overlay))
check("and the touch's end gives the field the focus again, for a WebKit that did not count the pointer's", /refocusSearchOverlay\(\)/.test(bar))
check("the bar mounts the screen beside itself, so a result leading off the bar's pages does not unmount it mid fade", /<SearchOverlay \/>/.test(bar))
check("the tab you are on scrolls to the top", /window\.scrollTo\(\{ top: 0/.test(bar))
/* A phone cancels the touch's click, so the loading line never heard a tab. The push says so itself. */
check("a tab's push tells the loading line, because the click is cancelled (round 20: through the app's tab swap when it crosses layouts)", /startRouteLoading\(\{ lineOnly: true \}\)[\s\S]{0,400}swapTabPage\(\(\) => router\.push\(href, \{ scroll: false \}\), href\)\)\) router\.push\(href, \{ scroll: false \}\)/.test(bar))
check("its hooks are never behind a return: the question is asked where it is mounted", /buyerTabsBelongOn\(pathname, whereWithExplore\)/.test(bar) && /exploreMarketplaceEnabled=\{exploreMarketplaceEnabled\}/.test(bar))
/* A creator's page is read from the address, so the bar is gone on the frame
   the product opens: nothing is carried between pages and nothing blinks. */
const where = code("lib/nav/use-buyer-tabs-where.ts")
check("where the bar is comes from the address, and only the host waits for an effect",
  /const surface = isSellerPage\(pathname\)/.test(where) && /const product = isSellerProductPath\(pathname\)/.test(where)
    && /sellerSurface: host\.subdomain \|\| surface/.test(where) && /customDomain: host\.customDomain/.test(where)
    && !/forPath/.test(where) && !/isDiscoverMode/.test(where))
check("the discover flag is folded into the same answer the header uses", /useExploreMarketplaceEnabled\(\)/.test(where) && /exploreMarketplaceEnabled/.test(where))
check("  and a creator's page counts as their store only on storelib.com",
  /sellerStore: surface && !product && !host\.subdomain && !host\.customDomain/.test(where))
check("the native shell's press dimming is taken off its icons, as on the pill", /html\.capacitor \[data-buyer-tab-bar\] nav a:active/.test(read("app/globals.css")))

console.log("\nNothing ends under it, and nothing fights it")
const css = read("app/globals.css")
check("its height is said once, in globals.css", /--buyer-tabs-bar: 56px;/.test(css) && /--buyer-tabs-room: calc\(var\(--buyer-tabs-bar\) \+ env\(safe-area-inset-bottom, 0px\)\);/.test(css))
check("and --buyer-tabs-h exists only while it is on screen on a phone", /@media \(max-width: 767px\) \{\s*html\[data-buyer-tabs="shown"\] \{\s*--buyer-tabs-h: var\(--buyer-tabs-room\);/.test(css))
/* Changed on purpose (round 39): the room is marked pending with the bar until the page knows who is signed in (below). */
check("it brings its own room at the end of the page", /data-buyer-tabs-room="" data-tabs-auth=\{pending \? "pending" : undefined\} className="shrink-0 md:hidden" style=\{\{ height: "var\(--buyer-tabs-room\)" \}\}/.test(bar))
const buy = read("components/store-builder/sticky-add-to-cart.tsx")
check("the product page's buy bar stands on it, and hands it the home indicator", /bottom: "var\(--buyer-tabs-h, 0px\)"/.test(buy) && /paddingBottom: "max\(0px, env\(safe-area-inset-bottom, 0px\) - var\(--buyer-tabs-h, 0px\)\)"/.test(buy))
check("the cookie card lifts over it", /html\[data-buyer-tabs="shown"\] \[data-cookie-banner\] \{\s*bottom: var\(--buyer-tabs-h\);/.test(css))
/* The library lives inside the profile now, so the profile's layout is the one that mounts it there. */
for (const layout of ["app/(storelib)/(marketing)/layout.tsx", "app/(storelib)/account/layout.tsx"]) {
  check(`${layout} mounts it`, /<BuyerTabBar \/>/.test(read(layout)) && /from "@\/components\/nav\/buyer-tab-bar"/.test(read(layout)))
}
check("and the /app shell does not", !/BuyerTabBar/.test(read("app/(storelib)/app/layout.tsx")))

console.log("\nThe search screen")
const search = code("components/search/search-screen.tsx")
const page = code("components/search/search-page.tsx")
check("one screen: the tab bar's overlay and /explore/search both draw components/search/search-screen", /<SearchScreen ref=\{screen\}/.test(overlay) && /<SearchScreen autoFocus/.test(page) && /<SearchPage \/>/.test(read("app/(storelib)/(marketing)/explore/search/page.tsx")) && !existsSync(join(process.cwd(), "components/explore/search-screen.tsx")))
check("image 27: a big Search title, an X to close, a rounded field under them", /text-\[30px\] font-bold[^"]*"[^>]*>\s*Search\s*</.test(search) && /aria-label="Close search"/.test(search) && /rounded-\[12px\] border border-neutral-200\/80/.test(search))
/* Round 9, changed on purpose: "no Browse categories list; it searches products AND communities, recent searches when empty, live results like the header dropdown, View all results at the end" (image 58). */
check("Enter and View all go to Explore's results, in the mode being browsed", /onNavigate\(viewAllHref\(word, modeHere\(\)\)\)/.test(search) && /if \(active >= 0 && active < hits\.length\) pickHit\(hits\[active\]\)\s*else viewAll\(\)/.test(search))
check("products and communities as you type, the header's questions ranked by the header's topHits, debounced, a stale answer dropped", /quickSearch\(createClient\(\), term, \{ communities: communitiesOn, creators: false \}\)/.test(search) && /setHits\(topHits\(answer, SCREEN_LIMIT\)\)/.test(search) && /DEBOUNCE_MS\)/.test(search) && /if \(n !== ask\.current\) return/.test(search))
check("the header's own rows (components/platform/header-search-results), so the two searches cannot drift", /<HeaderSearchResults[\s\S]{0,600}phone\s*\/>/.test(search) && /from "@\/components\/platform\/header-search-results"/.test(search))
check("the field says products and communities (products alone while communities are off)", /placeholder=\{communitiesOn \? "Search products and communities" : "Search products"\}/.test(search))
check("a combobox: arrows walk the rows, Enter opens the lit one, Escape closes", /role="combobox"/.test(search) && /aria-activedescendant=/.test(search) && /e\.key === "ArrowDown"/.test(search) && /e\.key === "Escape"/.test(search))
check("no Browse categories: nothing typed is the recent searches, and a search is remembered", !/Browse categories/.test(search) && !/CATEGORY_NAV|matchCategories|category-browser/.test(search) && /useEffect\(\(\) => setRecents\(readRecent\(\)\), \[\]\)/.test(search) && /setRecents\(addRecent\(draft\)\)/.test(search) && /setRecents\(addRecent\(word\)\)/.test(search) && /onClearRecent=\{\(\) => setRecents\(clearRecent\(\)\)\}/.test(search))
check("16px type, so iOS does not zoom to it", /text-\[16px\]/.test(search))
/*
  AND IT WEARS STORELIB'S FIELD, NOT A BLACK FRAME. The rectangle had a
  1.5px near-black outline with a shade pressed in along its top edge, and
  this check held both there. "Should not have the black bar around it,
  should be matching more the Storelib UI": it is now the hairline and the
  soft shadow every other field on the site has, the search on Explore that
  opens this screen included (components/explore/explore-hero), and focus
  darkens the hairline instead of adding a ring.
*/
check("the field is a 12px rounded rectangle, not a pill, and wears the same hairline and shadow as Explore's own search", /rounded-\[12px\]/.test(search) && !/h-\[50px\] w-full rounded-full/.test(search) && !/border-\[1\.5px\]/.test(search) && !/inset_0_1px_2px/.test(search) && /border border-neutral-200\/80/.test(search) && /shadow-\[0_1px_3px_rgba\(15,23,42,0\.045\),0_9px_27px_-16px_rgba\(15,23,42,0\.315\)\]/.test(search) && /focus:border-neutral-300/.test(search))
const hero = code("components/explore/explore-hero.tsx")
check("  the same two, read off Explore's field, so the pair cannot drift", /border border-neutral-200\/80/.test(hero) && /shadow-\[0_1px_3px_rgba\(15,23,42,0\.045\),0_9px_27px_-16px_rgba\(15,23,42,0\.315\)\]/.test(hero))
check("the screen keeps its layer until its move has ended, and leaves on an ease in and out", /willChange: open \|\| moving \? "opacity, translate" : undefined/.test(overlay) && /const EASE_OUT = "cubic-bezier\(0\.4, 0, 0\.2, 1\)"/.test(overlay) && /const OPEN_FADE_MS = 200/.test(overlay))
check("the page at its own address carries Explore's anchor, so the header does not grow a second field", /\[SEARCH_ANCHOR_ATTR\]: ""/.test(page))
check("the overlay: a declared modal, covering the header, animated on opacity and translate only", /aria-modal=\{open \? true : undefined\}/.test(overlay) && /className="fixed inset-0 z-\[70\] bg-white md:hidden"/.test(overlay) && /transition: !open && !moving\s*\? "none"\s*: reduce/.test(overlay) && !/transition:[^\n]*\b(top|height|transform)\b/.test(overlay))
check("Back closes it: one history entry of its own, popped by the X, replaced by a result", /pushState\(\{ \.\.\.\(window\.history\.state \|\| \{\}\), \[SEARCH_ENTRY\]: 1 \}, ""\)/.test(overlay) && /closing\.current = true\s*backThen\(\(\) => \{\s*closing\.current = false\s*shut\(\)\s*\}\)/.test(overlay) && /if \(ownsEntry\(\)\) router\.replace\(href\)/.test(overlay) && /addEventListener\("popstate", onPop\)/.test(overlay))
/*
  A close is a history.back(), which lands a task later: Search, X, Search in
  quick succession found the screen's own mark still on the entry, pushed
  nothing, and then the first close's pop shut the screen the second press had
  opened, with no entry left to hold it.
*/
check("opening and closing twice quickly leaves it holding exactly one entry", /if \(closing\.current\) reopened\.current = true\s*else if \(!ownsEntry\(\)\) pushEntry\(\)/.test(overlay) && /if \(reopened\.current\) \{\s*reopened\.current = false\s*if \(isOpen\.current && !ownsEntry\(\)\) pushEntry\(\)/.test(overlay))
/* A back through the page behind is not this screen's: taking the document's overflow off there would undo whatever layer holds it now. */
check("and a back with the screen already closed is left alone", /if \(!isOpen\.current\) return/.test(overlay))
check("the page under it holds still while it is open", /el\.style\.setProperty\("overflow", "hidden"\)/.test(overlay) && /el\.style\.removeProperty\("overflow"\)/.test(overlay))

console.log("\nThe account page: a profile, with its settings one tab over (tests/account-hub.test.ts has the rest)")
const account = code("components/account/account-settings.tsx")
const route = code("app/(storelib)/account/settings/page.tsx")
const home = code("app/(storelib)/account/page.tsx")
const layout = code("app/(storelib)/account/layout.tsx")
check("signed out it is sign in first, then back to the page that was opened", /pageUser\(accountLoginPath\("\/account"\)\)/.test(home) && /pageUser\(accountLoginPath\("\/account\/settings"\)\)/.test(route) && !/redirect\(/.test(layout))
check("the native app's session is recovered before it decides, as the library's is", /<NativeAuthGate requireAuth/.test(layout))
check("/account has nothing to type: no photo control, no name field", !/<ProfilePhoto\b|<input\b/.test(home) && !/<input\b/.test(code("components/account/account-hub.tsx")))
check("the photo is changed on Settings' own one photo, through the one photo route", /<AccountAvatar src=\{shown\} name=\{name\} photo=\{photo\} editable/.test(account) && /fetch\("\/api\/account\/avatar"/.test(code("components/account/account-photo.tsx")))
check("the name and the bio save on the person's own client and their copies follow", /\.from\("profiles"\)\.update\(patch\)\.eq\("id", userId\)/.test(account) && /patch\.bio = nextBio \|\| null/.test(account) && /\/api\/account\/profile-changed/.test(account))
check("the email changes with a code to each address", /<EmailChangeFlow\b/.test(account))
/* Changed on purpose: 89c6f3ba moved the settings route's reads into lib/account/load-account-settings.ts, shared with the settings sheet's bundle route. */
check("the password is Settings' card, which can set one on a Google or Apple only account", /<PasswordCard email=\{email\} hasPassword=\{hasPassword\} via=\{via\} \/>/.test(account) && /loadAccountSettingsForUser\(user,/.test(route) && /const hasPassword = providers\.length === 0 \|\| providers\.includes\("email"\)/.test(code("lib/account/load-account-settings.ts")))
check("preferences: language, the newsletter, recommendations, saved where they are read", /<LanguageModal\b/.test(account) && /savePreference\(\{ newsletter: v \}\)/.test(account) && /savePreference\(\{ personalizedRecommendations: v \}\)/.test(account))
check("the wishlist counts only what is still on sale", /\.eq\("products\.status", "published"\)/.test(code("app/(storelib)/account/library/page.tsx")))
check("log out here or everywhere, and the header forgets the session at once", /* Changed on purpose (r53): the browser's sign out, then the server's (lib/auth/log-out). */ /endDeviceSession\(scope, createClient\(\)\.auth\)/.test(account) && /clearAuthSnapshot\(\)/.test(account))
check("deleting is the existing flow: a code, then the code", /action: "send-code"/.test(account) && /action: "verify", code/.test(account))
check("no em dashes in what a person reads", ["components/account/account-settings.tsx", "components/account/account-hub.tsx", "components/nav/buyer-tab-bar.tsx", "components/nav/buyer-tab-icons.tsx", "components/search/search-screen.tsx", "components/search/search-overlay.tsx"].every((f) => !/\u2014/.test(read(f))))
check("/library/settings is the profile's Settings now", legacyLibraryTarget("/library/settings") === "/account/settings" && !existsSync(join(process.cwd(), "app/(storelib)/library/settings")) && !existsSync(join(process.cwd(), "app/(storelib)/account/library/settings")))

/*
  ROUND 39, the owner: "inside Storelib when logged out it should not have on mobile the mobile bottom navigation bar".
  Measured frame by frame, server HTML then hydration, in scripts/check-tab-bar-auth-r39.mjs; this is the wiring.
*/
console.log("\nRound 39: signed out, no bar in a browser, decided before the first paint")
for (const p of ["/explore", "/explore/design", SEARCH_HREF, "/wishlist", "/receipt/tok", "/community/clay-studio", "/community/clay-studio/members", "/u/alex"]) {
  check(`signed out, not on ${p}`, !buyerTabsBelongOn(p, { signedIn: false }))
}
for (const p of ["/explore", "/account/library", "/receipt/tok", "/community/clay-studio"]) check(`signed in, still on ${p}`, buyerTabsBelongOn(p, { signedIn: true }))
check("not known yet (the server, the page waking up): drawn, so the page can decide before it paints", buyerTabsBelongOn("/explore") && buyerTabsBelongOn("/explore", { signedIn: undefined }) && buyerTabsBelongOn("/community/clay-studio"))
check("the app keeps it signed out outside a community, as its signed-out start is Explore; inside one, as before, a visitor has none", buyerTabsBelongOn("/explore", { signedIn: false, native: true }) && !buyerTabsBelongOn("/community/clay-studio", { signedIn: false, native: true }))
{
  const where = code("lib/nav/use-buyer-tabs-where.ts")
  check("who is signed in is null on the server and while the page wakes, never a guess", /useSyncExternalStore\(subscribeAuthSnapshot, readSignedIn, unknown\)/.test(where) && /const unknown = \(\) => null/.test(where))
  check("the app is the class the root layout's first script puts on <html>", /classList\.contains\("capacitor"\)/.test(where) && /html\.classList\.add\('capacitor'\)|h\.classList\.add\('capacitor'\)/.test(read("app/(storelib)/layout.tsx")))
  check("the bar and the header ask the same question with the same answers", /signedIn: signedIn \?\? undefined, native: native \?\? false/.test(where) && /signedIn: signedIn \?\? undefined, native: native \?\? false/.test(bar))
  check("drawn pending until the page knows: the bar and its room marked, the record read in a line printed before them", /pending=\{signedIn === null\}/.test(bar) && /<script dangerouslySetInnerHTML=\{\{ __html: SIGNED_IN_BOOT \}\} \/>[\s{}]*<div aria-hidden="true" data-buyer-tabs-room=""/.test(bar) && /data-buyer-tab-bar=\{away \? "away" : "shown"\}\s*data-tabs-auth=\{pending \? "pending" : undefined\}/.test(bar) && /localStorage\.getItem\('_sl_auth_v1'\)/.test(bar) && /setAttribute\('data-sl-signed-in',''\)/.test(bar))
  check("a pending bar and its room are not drawn on an <html> not marked signed in (the app's excepted)", /html:not\(\[data-sl-signed-in\]\):not\(\.capacitor\) \[data-tabs-auth="pending"\] \{\s*display: none;/.test(css))
  check("a pending bar makes no room in the page and keeps the body's inset unless it will be seen", /if \(pending\) return\s*const root = document\.documentElement/.test(bar) && /\[away, pending\]/.test(bar) && /<style>\{pending \? TAB_BAR_BODY_PENDING : TAB_BAR_BODY\}<\/style>/.test(bar) && /html\[data-sl-signed-in\] body,html\.capacitor body\{padding-bottom:0\}/.test(bar))
}

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed > 0) process.exit(1)
