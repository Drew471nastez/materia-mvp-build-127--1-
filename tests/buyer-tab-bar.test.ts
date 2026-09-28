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
import { readFileSync, existsSync } from "node:fs"
import { join } from "node:path"
import { BUYER_TABS, SEARCH_HREF, SIGNED_OUT_PROFILE_HREF, buyerTabFor, buyerTabsBelongOn } from "../lib/nav/buyer-tabs"
import { RESERVED_ROOT_SEGMENTS } from "../lib/routes/reserved-segments"

let passed = 0
let failed = 0
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; console.log(`  FAIL  ${label}${detail === undefined ? "" : `   (${JSON.stringify(detail)})`}`) }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")

console.log("\nThe four tabs, in the owner's order")
check("Home, Search, Library, Profile", BUYER_TABS.map((t) => t.label).join() === "Home,Search,Library,Profile", BUYER_TABS.map((t) => t.label))
check("Home is Explore, Library the library, Profile the account page", BUYER_TABS[0].href === "/explore" && BUYER_TABS[2].href === "/library" && BUYER_TABS[3].href === "/account")
check("Search is a static screen under /explore, so no creator's handle is taken from them", SEARCH_HREF === "/explore/search" && !RESERVED_ROOT_SEGMENTS.includes("search") && existsSync(join(process.cwd(), "app/(marketing)/explore/search/page.tsx")))
check("signed out, Profile is sign in and then the account page", SIGNED_OUT_PROFILE_HREF === "/login?next=%2Faccount")

console.log("\nWhere it is drawn")
const on = ["/explore", "/explore/design", SEARCH_HREF, "/library", "/library/products/abc", "/library/wishlist", "/library/my-downloads", "/account", "/wishlist"]
for (const p of on) check(`on ${p}`, buyerTabsBelongOn(p))
const off = ["/", "/app", "/app/products", "/admin", "/checkout", "/checkout/abc", "/login", "/signup", "/reset-password", "/receipt/tok", "/purchase/x", "/creator-page", "/website-builder", "/blog", "/pricing", "/sell", "/account/continue", "/w/someone"]
for (const p of off) check(`not on ${p}`, !buyerTabsBelongOn(p))
check("a creator's page or product never has the bar: it is their shop, and its own buy bar is already there",
  !buyerTabsBelongOn("/maria/preset-pack", { sellerSurface: true }) && !buyerTabsBelongOn("/maria", { sellerSurface: true }))
check("never on a creator's own domain, whatever the path", !buyerTabsBelongOn("/explore", { customDomain: true }) && !buyerTabsBelongOn("/", { customDomain: true, sellerSurface: true }))

console.log("\nWhich tab a page belongs to")
const cases: Array<[string, { query?: boolean; sellerSurface?: boolean }, number]> = [
  ["/explore", {}, 0],
  ["/explore/design", {}, 0],
  ["/explore", { query: true }, 1],
  [SEARCH_HREF, {}, 1],
  ["/library", {}, 2],
  ["/library/wishlist", {}, 2],
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
check("no bump on a tap: no squeeze on the icon, no growing glass, only colour", /give: false,/.test(bar) && /if \(give\) pulse\(index\)/.test(lens) && /scale: String\(slide\.following \? LIFT : 1\)/.test(bar) && !/0\.55/.test(bar))
check("the other tabs' pages are fetched while the phone is idle, on a phone only", /requestIdleCallback/.test(bar) && /for \(const href of hrefs\) router\.prefetch\(href\)/.test(bar) && /matchMedia\?\.\("\(max-width: 767px\)"\)\.matches\) return/.test(bar))
check("and nothing of the slide is written twice", !/function useSlide\(/.test(bar + pill) && !/function settleSpring\(/.test(bar + pill) && !/const TAP_PULSE\b/.test(bar + pill))
check("the icons cross fade through the shared NavIcon, drawn on their own layers", /<NavIcon icon=\{[^}]+\} active=\{on\} color="currentColor" box=\{GLYPH\} layer \/>/.test(bar))
check("the finger's gesture decides, and a keyboard's Enter still picks", /\{\.\.\.slide\.handlers\}/.test(bar) && /if \(e\.detail === 0\) pick\(i\)/.test(bar) && /touchAction: "none"/.test(bar))
check("the glass is there only while a finger is", /const lit = slide\.pressed \|\| slide\.following/.test(bar) && /backgroundColor: arriving \? ARRIVING_FILL : lit \? LENS_FILL : ARRIVING_FILL/.test(bar))
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
check("its hooks are never behind a return: the question is asked where it is mounted", /\{buyerTabsBelongOn\(pathname, where\) \? <TabBar pathname=\{pathname\} sellerSurface=\{where\.sellerSurface\} \/> : null\}/.test(bar))
/* A creator's page is read from the address, so the bar is gone on the frame
   the product opens: nothing is carried between pages and nothing blinks. */
const where = code("lib/nav/use-buyer-tabs-where.ts")
check("where the bar is comes from the address, and only the host waits for an effect",
  /return \{ sellerSurface: host\.subdomain \|\| isSellerPage\(pathname\), customDomain: host\.customDomain \}/.test(where)
    && !/forPath/.test(where) && !/isDiscoverMode/.test(where))
check("the native shell's press dimming is taken off its icons, as on the pill", /html\.capacitor \[data-buyer-tab-bar\] nav a:active/.test(read("app/globals.css")))

console.log("\nNothing ends under it, and nothing fights it")
const css = read("app/globals.css")
check("its height is said once, in globals.css", /--buyer-tabs-bar: 56px;/.test(css) && /--buyer-tabs-room: calc\(var\(--buyer-tabs-bar\) \+ env\(safe-area-inset-bottom, 0px\)\);/.test(css))
check("and --buyer-tabs-h exists only while it is on screen on a phone", /@media \(max-width: 767px\) \{\s*html\[data-buyer-tabs="shown"\] \{\s*--buyer-tabs-h: var\(--buyer-tabs-room\);/.test(css))
check("it brings its own room at the end of the page", /data-buyer-tabs-room="" className="shrink-0 md:hidden" style=\{\{ height: "var\(--buyer-tabs-room\)" \}\}/.test(bar))
const buy = read("components/store-builder/sticky-add-to-cart.tsx")
check("the product page's buy bar stands on it, and hands it the home indicator", /bottom: "var\(--buyer-tabs-h, 0px\)"/.test(buy) && /paddingBottom: "max\(0px, env\(safe-area-inset-bottom, 0px\) - var\(--buyer-tabs-h, 0px\)\)"/.test(buy))
check("the cookie card lifts over it", /html\[data-buyer-tabs="shown"\] \[data-cookie-banner\] \{\s*bottom: var\(--buyer-tabs-h\);/.test(css))
for (const layout of ["app/(marketing)/layout.tsx", "app/library/layout.tsx", "app/account/layout.tsx"]) {
  check(`${layout} mounts it`, /<BuyerTabBar \/>/.test(read(layout)) && /from "@\/components\/nav\/buyer-tab-bar"/.test(read(layout)))
}
check("and the /app shell does not", !/BuyerTabBar/.test(read("app/app/layout.tsx")))

console.log("\nThe search screen")
const search = code("components/search/search-screen.tsx")
const page = code("components/search/search-page.tsx")
check("one screen: the tab bar's overlay and /explore/search both draw components/search/search-screen", /<SearchScreen ref=\{screen\}/.test(overlay) && /<SearchScreen autoFocus/.test(page) && /<SearchPage \/>/.test(read("app/(marketing)/explore/search/page.tsx")) && !existsSync(join(process.cwd(), "components/explore/search-screen.tsx")))
check("image 27: a big Search title, an X to close, a rounded field under them", /text-\[30px\] font-bold[^"]*"[^>]*>\s*Search\s*</.test(search) && /aria-label="Close search"/.test(search) && /rounded-\[12px\] border-\[1\.5px\]/.test(search))
check("Enter and See all results go to Explore's results", /exploreResultsHref = \(q: string\) => `\/explore\?q=\$\{encodeURIComponent\(q\.trim\(\)\)\}`/.test(search) && /See all results for/.test(search))
check("products, creators and categories as you type, debounced, a stale answer dropped", /quickSearch\(createClient\(\), term\)/.test(search) && /DEBOUNCE_MS\)/.test(search) && /if \(n !== ask\.current\) return/.test(search))
check("a combobox: arrows walk the rows, Enter opens the lit one, Escape closes", /role="combobox"/.test(search) && /aria-activedescendant=/.test(search) && /e\.key === "ArrowDown"/.test(search) && /e\.key === "Escape"/.test(search))
check("recent searches and a no results state", /data-search-section="recent"/.test(search) && /data-search-empty=""/.test(search) && /No results for/.test(search))
check("16px type, so iOS does not zoom to it", /text-\[16px\]/.test(search))
check("and the categories that have a page, as the other way in", /CATEGORY_NAV\.filter\(\(c\) => hasCategoryPage\(c\.id\)\)/.test(search))
/* The owner's iPhone round: a rectangle with depth, categories that open, bigger products, a calm wait. */
check("the field is a 12px rounded rectangle, not a pill, with a little depth (a shade pressed in at the top, a soft shadow under)", /rounded-\[12px\]/.test(search) && !/rounded-full border-\[1\.5px\]/.test(search) && /shadow-\[inset_0_1px_2px_rgba\(16,18,27,0\.08\)/.test(search))
check("a category opens its subcategories in the screen, pushed in on the category sheet's own timing, with a back row", /import \{ BROWSE_DIM, BROWSE_EASE, BROWSE_PARALLAX, BROWSE_SLIDE_MS \} from "@\/components\/explore\/category-browser"/.test(search) && /if \(row\.kind === "category" && row\.opens\) \{\s*drillIn\(row\.opens\)/.test(search) && /data-search-back=""/.test(search) && /translate3d\(\$\{BROWSE_PARALLAX\}, 0, 0\)/.test(search) && /`All \$\{c\.label\}`/.test(search))
check("and a level is drawn on the tap, never the press (WebKit's one tap rule)", !/onPointerDown/.test(search))
check("categories 600, subcategories 500, on a card with a little depth", /const GROUP_WEIGHT = "font-semibold"/.test(search) && /const ITEM_WEIGHT = "font-medium"/.test(search) && /const GROUPED =\s*"mx-1 overflow-hidden rounded-2xl bg-white divide-y/.test(search))
check("products: a 60px picture, then title, creator and price, each on its own line", /h-\[60px\] w-\[60px\]/.test(search) && /data-search-title=""/.test(search) && /data-search-creator=""/.test(search) && /data-search-price=""/.test(search))
check("the wait: placeholder rows in the result's own box, and the last answer is only dimmed when an answer is slow", /data-search-loading=""/.test(search) && /className=\{`flex items-center \$\{PRODUCT_ROW\}`\}/.test(search) && /setTimeout\(\(\) => setSlow\(true\), 650\)/.test(search) && !/waiting \? "opacity-70/.test(search))
check("the screen keeps its layer until its move has ended, and leaves on an ease in and out", /willChange: open \|\| moving \? "opacity, translate" : undefined/.test(overlay) && /const EASE_OUT = "cubic-bezier\(0\.4, 0, 0\.2, 1\)"/.test(overlay) && /const OPEN_FADE_MS = 200/.test(overlay))
check("the page at its own address carries Explore's anchor, so the header does not grow a second field", /\[SEARCH_ANCHOR_ATTR\]: ""/.test(page))
check("the overlay: a declared modal, covering the header, animated on opacity and translate only", /aria-modal=\{open \? true : undefined\}/.test(overlay) && /className="fixed inset-0 z-\[70\] bg-white md:hidden"/.test(overlay) && /transition: !open && !moving\s*\? "none"\s*: reduce/.test(overlay) && !/transition:[^\n]*\b(top|height|transform)\b/.test(overlay))
check("Back closes it: one history entry of its own, popped by the X, replaced by a result", /pushState\(\{ \.\.\.\(window\.history\.state \|\| \{\}\), \[SEARCH_ENTRY\]: 1 \}, ""\)/.test(overlay) && /if \(ownsEntry\(\)\) window\.history\.back\(\)/.test(overlay) && /if \(ownsEntry\(\)\) router\.replace\(href\)/.test(overlay) && /addEventListener\("popstate", onPop\)/.test(overlay))
check("the page under it holds still while it is open", /el\.style\.setProperty\("overflow", "hidden"\)/.test(overlay) && /el\.style\.removeProperty\("overflow"\)/.test(overlay))

console.log("\nThe account page: a profile, with its settings one tab over (tests/account-hub.test.ts has the rest)")
const account = code("components/account/account-settings.tsx")
const overview = code("components/account/account-overview.tsx")
const route = code("app/account/settings/page.tsx")
const home = code("app/account/page.tsx")
const layout = code("app/account/layout.tsx")
check("signed out it is sign in first, then back to the page that was opened", /pageUser\(accountLoginPath\("\/account"\)\)/.test(home) && /pageUser\(accountLoginPath\("\/account\/settings"\)\)/.test(route) && !/redirect\(/.test(layout))
check("the native app's session is recovered before it decides, as the library's is", /<NativeAuthGate requireAuth/.test(layout))
check("/account has nothing to type: no photo control, no name field", !/<ProfilePhoto\b|<input\b/.test(overview) && !/<ProfilePhoto\b|<input\b/.test(home))
check("the photo is changed on Settings' own one photo, through the one photo route", /<AccountAvatar src=\{shown\} name=\{name\} photo=\{photo\} editable/.test(account) && /fetch\("\/api\/account\/avatar"/.test(code("components/account/account-photo.tsx")))
check("the name and the bio save on the person's own client and their copies follow", /\.from\("profiles"\)\.update\(patch\)\.eq\("id", userId\)/.test(account) && /patch\.bio = nextBio \|\| null/.test(account) && /\/api\/account\/profile-changed/.test(account))
check("the email changes with a code to each address", /<EmailChangeFlow\b/.test(account))
check("the password is Settings' card, which can set one on a Google or Apple only account", /<PasswordCard email=\{email\} hasPassword=\{hasPassword\} via=\{via\} \/>/.test(account) && /const hasPassword = providers\.length === 0 \|\| providers\.includes\("email"\)/.test(route))
check("preferences: language, the newsletter, recommendations, saved where they are read", /<LanguageModal\b/.test(account) && /savePreference\(\{ newsletter: v \}\)/.test(account) && /savePreference\(\{ personalizedRecommendations: v \}\)/.test(account))
check("the wishlist counts only what is still on sale", /\.eq\("products\.status", "published"\)/.test(home))
check("Become a seller goes to /sell; a seller gets Dashboard", /href: "\/sell"/.test(read("lib/account/overview.ts")) && /href: "\/app"/.test(read("lib/account/overview.ts")) && /<SellRow entry=\{selling\} \/>/.test(overview) && /sellerAccessForRequest\(user\.id\)/.test(home))
check("log out here or everywhere, and the header forgets the session at once", /signOut\(\{ scope \}\)/.test(account) && /clearAuthSnapshot\(\)/.test(account))
check("deleting is the existing flow: a code, then the code", /action: "send-code"/.test(account) && /action: "verify", code/.test(account))
check("no em dashes in what a person reads", ["components/account/account-settings.tsx", "components/account/account-overview.tsx", "components/account/account-hub.tsx", "components/nav/buyer-tab-bar.tsx", "components/nav/buyer-tab-icons.tsx", "components/search/search-screen.tsx", "components/search/search-overlay.tsx"].every((f) => !/\u2014/.test(read(f))))
check("/library/settings is the profile's Settings now", /permanentRedirect\("\/account\/settings"\)/.test(read("app/library/settings/page.tsx")) && !existsSync(join(process.cwd(), "app/library/settings/buyer-settings.tsx")))

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed > 0) process.exit(1)
