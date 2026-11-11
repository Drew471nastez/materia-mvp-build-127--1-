/**
 * ===========================================================================
 *  WHICH BUTTONS THE HEADER SHOWS, TO WHOM, ON WHICH PAGE
 * ===========================================================================
 * The owner's rules for the storelib.com header, read off the source. The
 * same rules are measured on the rendered header, logged out, signed in
 * without seller access and signed in as a seller, at phone and desktop
 * widths, by scripts/check-header-states.mjs.
 *
 *   1. Computer, logged out, marketing pages: a thin rule, Sell on Storelib
 *      (text, /sell), Log in (outlined, /login), Sign up (filled purple,
 *      /signup). Small shared corner, no pill, no Start selling.
 *   2. Computer, logged out, Explore and the pages that share its header:
 *      the same without Log in, after the wishlist and library icons.
 *   3. The hero's button and search field take the Log in button's corner;
 *      since the remake (round AA1) they sit under the subheading.
 *   4. Phone menu on the marketing pages: Sign up (purple), Discover
 *      (outlined, compass), Sell on Storelib (purple text).
 *   5. Phone menu on Explore: Sign up, Log in, Sell on Storelib. No Discover.
 *   6. Signed in: no Dashboard or Start selling for a buyer; Dashboard (/app)
 *      for a seller. Become a seller (/sell) for a buyer in the phone sheets
 *      and the account menu. The account is /account. The seller check is
 *      marked SELLER ACCESS.
 *   7. The logo is 5% smaller in every header, by its size, not a CSS scale.
 *   And before the session is known, an invisible stand in of the logged out
 *   row rather than grey pills.
 */
import { readSource, readCode } from "./_source"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; failures.push(label); console.log(`  FAIL  ${label}${detail === undefined ? "" : `   (${typeof detail === "string" ? detail : JSON.stringify(detail)})`}`) }
}

const HEADER = "components/platform/platform-header-client.tsx"
const header = readCode(HEADER)
const headerSrc = readSource(HEADER)
/* A function's body, from its declaration to the next top level declaration. */
const fn = (src: string, name: string) => {
  const i = src.indexOf(`function ${name}(`)
  if (i < 0) return ""
  const next = src.slice(i + 10).search(/\n(?:function |const |export |type )/)
  return next < 0 ? src.slice(i) : src.slice(i, i + 10 + next)
}

console.log("\n1 and 2. the logged out row on a computer")
{
  const row = fn(header, "GuestHeaderActions")
  check("there is one component for it", row.length > 0)
  /* Changed on purpose: 158acdef (light buyer header theme) takes the row's colours from lib/platform/header-chrome.ts, the dark bar's still white at 15%. */
  const chromeSrc = readCode("lib/platform/header-chrome.ts")
  check("a thin vertical rule first", /data-guest-divider=""[^>]*className=\{cn\("ml-1 h-6 w-px", chrome\.guestDivider\)\}/.test(row) && /guestDivider: "bg-white\/15"/.test(chromeSrc))
  check("Sell on Storelib is a plain text link to /sell", /link\("\/sell"\)/.test(row) && /Sell on Storelib/.test(row) && !/data-guest-sell=""[^>]*bg-violet/.test(row))
  /* Changed on purpose: 158acdef (light buyer header theme) moved the outline's colour into lib/platform/header-chrome.ts, the dark bar's still white at 30%. */
  check("Log in is outlined, to /login, and only where asked for", /\{withLogin && \(\s*<Link\s+\{\.\.\.link\("\/login"\)\}/.test(row) && /data-guest-login=""[\s\S]{0,40}className=\{cn\("[^"]*rounded-action border [^"]*", chrome\.guestLogin/.test(row) && /guestLogin: "border-white\/30 /.test(chromeSrc))
  check("Sign up is filled Storelib purple, to /signup", /link\("\/signup"\)/.test(row) && /data-guest-signup=""[\s\S]{0,140}rounded-action bg-violet-600/.test(row) && />\s*Sign up\s*</.test(row))
  check("both buttons take the shared corner, and nothing in it is a pill", (row.match(/rounded-action/g) ?? []).length === 2 && !/rounded-full/.test(row))
  check("the marketing pages carry Log in", (header.match(/<GuestHeaderActions withLogin link=\{guestLink\}/g) ?? []).length === 2)
  check("Explore's header leaves it out", (header.match(/<GuestHeaderActions withLogin=\{false\} link=\{guestLink\}/g) ?? []).length === 2)
  check("no Start selling anywhere in the header", !/start[ _]selling/i.test(header), (header.match(/.{0,40}start[ _]selling.{0,40}/gi) ?? []).join(" | "))
  check("the library icon is still on Explore's bar, the heart is not", !/data-header-wishlist/.test(header) && /aria-label=\{t\("library"\)\}/.test(header))
  check("a single place defines the corner: --radius-action is 8px", /--radius-action: 8px;/.test(readSource("app/globals.css")))
}

console.log("\n   before the session is known")
/* Changed on purpose: 158acdef (light buyer header theme) hands every row the bar's colours as chrome. */
check("both computer rows wait with an invisible copy of the logged out row", (header.match(/<GuestHeaderActions [^>]*placeholder chrome=\{chrome\} \/>/g) ?? []).length === 2 && /placeholder && "invisible"/.test(header))
check("the stand in cannot be reached or read", /aria-hidden=\{placeholder \|\| undefined\}/.test(header) && /inert=\{placeholder \|\| undefined\}/.test(header))
check("no grey pills: the old skeleton is gone", !/HeaderActionsSkeleton|<Skeleton\b/.test(header))

console.log("\n3. the cinematic hero signup")
{
  const hero = readCode("components/marketing/hero.tsx")
  const css = hero
  check("signup stays below the description", hero.indexOf("<HeroCta") > hero.indexOf("cinematic-description"))
  check("signup and search use one shared corner and the marketplace is a link", /--hero-control-radius: 12px/.test(css) && /className="cinematic-marketplace"/.test(readCode("components/marketing/hero-cta.tsx")) && !/role="search"/.test(hero))
}


console.log("\n4 and 5. the phone menu, logged out")
{
  const sheet = fn(header, "GuestSheetActions")
  check("one component for both menus", sheet.length > 0)
  check("Sign up first, filled purple, not blue", /data-menu-sign-up=""[^>]*bg-violet-600/.test(sheet) && !/blue-|#2563eb|#3b82f6|#4f46e5/i.test(sheet))
  check("Discover outlined with its compass, to /explore", /go\("\/explore"\)\}\s*data-menu-discover=""[^>]*border border-/.test(sheet) && /<Compass /.test(sheet))
  check("or Log in outlined, to /login", /go\("\/login"\)\}\s*data-menu-log-in=""[^>]*border border-/.test(sheet))
  check("Sell on Storelib as purple text, to /sell", /go\("\/sell"\)\}\s*data-menu-sell=""[^>]*text-violet-600/.test(sheet))
  check("the buttons take the shared corner", /SHEET_BUTTON =\s*"[^"]*rounded-action/.test(header))
  /* Changed on purpose: e6a207bd (admin toggle to hide Discover) offers Discover only while the marketplace is on, and Log in in its place otherwise. */
  check("the marketing menu has Discover", /<GuestSheetActions second=\{exploreMarketplaceOn \? "discover" : "login"\}/.test(header))
  /* Round 3: Explore's hamburger is the navigator, whose signed out foot is Log in and Start creating (lib/nav/places-shared navigatorModel). */
  check("Explore's menu is the navigator, with Log in and Start creating", /<PlaceNavigator\b/.test(header) && /key: "log-in", label: "Log in", href: "\/login"/.test(readCode("lib/nav/places-shared.ts")))
  check("and neither keeps the old Sign in and black Discover pair", !/data-menu-sign-in|bg-gray-900 text-white/.test(header))
}

console.log("\n6. signed in")
{
  const seller = header.match(/const sellerDashboardButton = hasCompletedSellerOnboarding \? \([\s\S]*?\) : null/)?.[0] ?? ""
  check("Dashboard beside the photo only with seller access, to /app", /headerLink\("\/app"\)/.test(seller))
  check("no purple Library button for a buyer", !/user \? "Library"/.test(header) && !/hasCompletedSellerOnboarding \? "Dashboard" : "Library"/.test(header))
  check("both computer rows show the Dashboard button and the photo's menu only when signed in", (header.match(/\{sellerDashboardButton\}\s*\{desktopAccountMenu\}/g) ?? []).length === 2)
  check("no link in the header goes to /onboarding: /sell decides", !/["']\/onboarding["']/.test(header))
  check("Become a seller goes to /sell from the marketing menu",
    /function BecomeSellerRow[\s\S]{0,200}link\("\/sell"\)/.test(header) && (header.match(/<BecomeSellerRow link=\{headerLink\} state=\{sellerState\}/g) ?? []).length === 1)
  /* The profile's three (sellingEntry in lib/account/overview.ts): a seller who left the setup half done is asked to finish it. */
  check("a seller who began the setup and left it is asked to finish it, not to become one",
    /export const sellingLabel = \(state: SellerState\) => \(state === "started" \? "Finish setting up your store" : "Become a seller"\)/.test(header) && /setSellerState\(access\.state\)/.test(header))
  check("a profile that could not be read does not undo what the creators row says",
    /if \(profileErr\) \{[\s\S]{0,700}?const state = sellerAccessFrom\(\{ creator: creatorData, profile: null \}\)\.state\s*setIsCreator\(state === "seller"\)\s*setHasCompletedSellerOnboarding\(state === "seller"\)/.test(header))
  check("it is a calm row, not a badge: a pale violet ground, the height of its neighbours", /data-become-seller=""\s*className="[^"]*rounded-xl bg-\[#f5f3ff\] px-4 py-3\.5 text-base font-medium text-violet-700/.test(header))
  /* Round 7: the phone's account sheet is its own component (AccountSheet), shared with a community's bar, and takes the seller answer as `seller`. */
  check("a seller gets Dashboard there instead", (header.match(/hasCompletedSellerOnboarding \? \(/g) ?? []).length + (fn(header, "AccountSheet").match(/\{seller \? \(/g) ?? []).length >= 3 && /<AccountSheet[\s\S]{0,500}seller=\{hasCompletedSellerOnboarding\}/.test(header))
  /*
    ROUND 3, ask 8: "clicking my avatar on desktop opens an inline dropdown
    like the phone menu and like /app's account dropdown (not a navigation to
    /account): first Start creating (non creators, to /sell) or Dashboard
    (creators, /app), then Profile (/account), Settings, Language, Help,
    Discover (/explore), and Log out last."
  */
  /*
    ROUND 11: a community's bar asks for the short list (rows="community": Profile, Settings, Dashboard for a seller); the
    Storelib header's own menu is every row below, unchanged. The community's branch is set aside to read the header's.
  */
  const storelibRows = (src: string) => src.replace(/\{rows === "community" \? \(\s*<>[\s\S]*?<\/>\s*\) : /g, "{").replace(/\{rows === "community" \? null : \(/g, "{(")
  {
    const full = fn(header, "DesktopAccountMenu")
    const menu = storelibRows(full)
    const order = [...menu.matchAll(/data-account-item="([a-z-]+)"/g)].map((m) => m[1])
    const short = /\{rows === "community" \? \(\s*<>([\s\S]*?)<\/>/.exec(full)?.[1] ?? ""
    check("round 11: a community's short list is Profile, Settings and Dashboard for a seller", [...short.matchAll(/data-account-item="([a-z-]+)"/g)].map((m) => m[1]).join(",") === "profile,settings,dashboard" && /rows = "storelib"/.test(full))
    check("on a computer the photo opens a menu, not a page", /aria-haspopup="menu"/.test(menu) && /data-header-avatar=""/.test(menu) && /role="menu"/.test(menu) && !/<Link\s+\{\.\.\.headerLink\("\/account"\)\}\s+aria-label="Your account"/.test(header))
    check("in the owner's order: Dashboard or Start creating, Profile, Settings, Language, Help, Discover, Log out", order.join(",") === "dashboard,start-creating,profile,settings,language,help,discover,log-out", order)
    check("Dashboard for a seller and Start creating for anybody else", /\{seller \? \(\s*<Link \{\.\.\.go\("\/app"\)\}[\s\S]{0,200}Dashboard[\s\S]{0,80}\) : \(\s*<Link \{\.\.\.go\("\/sell"\)\}[\s\S]{0,200}Start creating/.test(menu))
    check("Profile is /account, Settings /account/settings, Help /help, Discover /explore", /go\("\/account"\)\} role="menuitem" data-account-item="profile"/.test(menu) && /go\("\/account\/settings"\)/.test(menu) && /go\("\/help"\)/.test(menu) && /go\("\/explore"\)\} role="menuitem" data-account-item="discover"/.test(menu))
    check("Language is the one language picker, and Log out is the header's own", /onLanguage=\{\(\) => setLanguageOpen\(true\)\}/.test(header) && /onLogout=\{handleLogout\}/.test(header))
    check("a second click, a click outside, Escape and a new page close it", /onClick=\{\(\) => setOpen\(\(o\) => !o\)\}/.test(menu) && /document\.addEventListener\("pointerdown", away, true\)/.test(menu) && /e\.key !== "Escape"/.test(menu) && /useEffect\(\(\) => setOpen\(false\), \[pathname\]\)/.test(menu))
    check("it moves by opacity, scale and translate only, and kept while it leaves", /transition-\[opacity,scale,translate\] motion-reduce:transition-none/.test(header) && /open \? HEADER_MENU_OPEN : HEADER_MENU_LEAVING/.test(menu) && /setPresent\(false\)/.test(menu))
  }
  check("the phone sheets lead to /account too (the profile card, Settings)", (header.match(/headerLink\("\/account"\)/g) ?? []).length === 1 && /link\("\/account"\)\} onDone=\{onClose\} item="profile"/.test(fn(header, "AccountSheet")) && /<AccountSheet[\s\S]{0,500}link=\{headerLink\}/.test(header))
  check("no settings link in the header goes anywhere but /account", !/"\/library\/settings"|"\/app\/settings"/.test(header))
  /* Round 3 follow up: the phone's account sheet has the computer menu's rows, in the same order; no My Library (the library lives inside /account). */
  {
    /* Round 7: the sheet is AccountSheet, drawn by the header with its own link, language picker and log out, and by a community's bar. */
    const sheetFn = fn(header, "AccountSheet")
    const sheet = storelibRows(sheetFn.slice(sheetFn.indexOf('data-account-sheet=""')))
    const order = [...sheet.matchAll(/item="([a-z-]+)"|data-account-item="([a-z-]+)"|<(SheetLogOut) /g)].map((m) => m[1] || m[2] || (m[3] && "log-out"))
    check("the phone's account sheet: Dashboard or Start creating, Profile, Settings, Language, Help, Discover, Log out", order.join(",") === "dashboard,start-creating,profile,settings,language,help,discover,log-out", order)
    /*
      ROUND 6, ask 2: "The phone account bottom sheet must never hide the Log
      out row at the bottom (safe area, sheet height, scroll) ... Its top area
      with the avatar and name inherits the look of the /app phone menu's
      account block." Measured at four phone sizes in
      scripts/check-place-navigator.mjs.
    */
    check("Log out is pinned at the foot: the rows scroll on their own above it, and the foot never shrinks", /fill\s+maxHeight="min\(88dvh, 720px\)"/.test(sheetFn) && /className="min-h-0 flex-1 overflow-y-auto overscroll-contain" data-account-sheet=""/.test(sheetFn) && /<div className="shrink-0" data-account-sheet-foot="">\s*<SheetLogOut onPress=\{onLogout\} \/>/.test(sheetFn) && /<AccountSheet[\s\S]{0,600}onLogout=\{handleLogout\}/.test(header))
    /* Changed on purpose (round 27, the owner: the name at the top opens the profile): the row is a link, with a press tint. */
    check("the top is /app's: a rounded row with a 32px photo in a hairline ring, the name and the @handle, a one pixel rule under it; it opens the profile", /<Link \{\.\.\.link\("\/account"\)\}[\s\S]{0,160}className="flex min-h-\[52px\] shrink-0 items-center gap-3 rounded-xl px-3 py-2[^"]*" data-account-who="">\s*<AppAvatar src=\{avatarUrl\}[^>]*size=\{32\} className="shrink-0 ring-1 ring-neutral-200" \/>/.test(header) && /data-account-who=""[\s\S]{0,700}<div aria-hidden className="my-1\.5 h-px shrink-0 bg-neutral-100" \/>/.test(header) && /@\{username\}/.test(sheetFn) && /<AccountSheet[\s\S]{0,500}username=\{profile\?\.username\}/.test(header))
    check("and the rows are /app's rows: 18px icons, 15px words, no chevrons", /const SHEET_ROW =\s*"flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-\[15px\] font-medium text-neutral-800/.test(header) && !/<ChevronRight/.test(fn(header, "SheetRow")))
    check("its links: /app or /sell, /account, /account/settings, /help, /explore; Language is the picker", /link\("\/app"\)\} onDone=[\s\S]{0,80}item="dashboard"/.test(sheet) && /link\("\/sell"\)\} onDone=[\s\S]{0,80}item="start-creating"/.test(sheet) && /link\("\/account"\)\} onDone=[\s\S]{0,80}item="profile"/.test(sheet) && /link\("\/account\/settings"\)/.test(sheet) && /link\("\/help"\)/.test(sheet) && /link\("\/explore"\)\} onDone=[\s\S]{0,80}item="discover"/.test(sheet) && /onLanguage\(\) \}\} item="language"/.test(sheet) && /<AccountSheet[\s\S]{0,600}onLanguage=\{\(\) => setLanguageOpen\(true\)\}/.test(header))
    check("and no My Library row in it", !/My Library|"\/library"/.test(sheet))
  }
  check("and it does not put the email under the name", !/\{user\?\.email && <p className="text-sm text-gray-500 truncate">\{user\.email\}<\/p>\}/.test(header))
  check("the seller check is the shared helper, marked SELLER ACCESS", /\/\/ SELLER ACCESS:[\s\S]{0,500}const access = sellerAccessFrom\(\{ creator: creatorData, profile: profileData \}\)\s*const isSellerByState = hasSellerAccess\(access\)/.test(headerSrc) && /from "@\/lib\/account\/seller-access"/.test(header))
  for (const f of ["components/marketing/user-nav.tsx", "components/marketing/user-nav-client.tsx", "components/dashboard/sidebar.tsx"]) {
    const src = readCode(f)
    check(`${f}: Become a seller goes to /sell, not through signup/success, and settings to /account`, /href="\/sell"/.test(src) && !/become-creator/.test(src) && !/Start Selling|Become a Seller/.test(src) && /href="\/account"/.test(src) && !/\/library\/settings|"\/app\/settings"/.test(src))
  }
  check("the old marketing headers say Sign up, not Start selling", ["components/marketing/header.tsx", "components/marketing/header-client.tsx"].every((f) => !/Start selling/i.test(readCode(f))))
  check("the phone's white Sign in is one link, not a button in a link", /<Button asChild className=\{cn\("ml-2 h-9 px-5 rounded-lg text-sm font-semibold bg-white text-black[^"]*", loading && "invisible"\)\}>\s*<Link \{\.\.\.guestLink\("\/login"\)\}/.test(header))
}

console.log("\n7. the logo, a touch smaller in headers only")
{
  const m = header.match(/HEADER_LOGO = \{ desktop: ([\d.]+), marketingPhone: ([\d.]+), phone: ([\d.]+) \}/)
  const [d, mp, p] = (m?.slice(1) ?? []).map(Number)
  const five = (was: number, now: number) => Math.abs(now - was * 0.95) < 0.02
  check("the site header: another ~5% under the last header sizes", !!m && five(41.8, d) && five(39.9, mp) && five(36.1, p), m?.slice(1))
  check("every logo in the site header draws at one of them", (header.match(/<StorelibLogo size=\{HEADER_LOGO\.(desktop|marketingPhone|phone)\}/g) ?? []).length === 4 && !/<StorelibLogo size=\{\d/.test(header))
  check("the /app top bar: 27 becomes 25.65", /<StorelibLogo size=\{25\.65\} priority \/>/.test(readCode("components/app/sidebar.tsx")) && five(27, 25.65))
  check("and its still copy matches it", /<StorelibLogo size=\{25\.65\} alt="" \/>/.test(readCode("components/app/shell-header-still.tsx")))
  check("the public wishlist's header: 32 becomes 30.4", /<StorelibLogo size=\{30\.4\} \/>/.test(readCode("components/wishlist/public-wishlist-shell.tsx")) && five(32, 30.4))
  check("by size, not by a CSS scale on the logo", !/scale|matrix/.test(readCode("components/brand/storelib-logo.tsx")))
  check("and the footer keeps its size", /<StorelibLogo size=\{40\} \/>/.test(readCode("components/marketing/footer.tsx")))
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) { console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`); process.exit(1) }
