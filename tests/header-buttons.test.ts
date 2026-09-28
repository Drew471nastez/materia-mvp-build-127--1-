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
 *   3. The hero's Discover and Sign Up take the Log in button's corner and
 *      stay above the subheading.
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
  check("a thin vertical rule first", /data-guest-divider=""[^>]*h-6 w-px bg-white\/15/.test(row))
  check("Sell on Storelib is a plain text link to /sell", /link\("\/sell"\)/.test(row) && /Sell on Storelib/.test(row) && !/data-guest-sell=""[^>]*bg-violet/.test(row))
  check("Log in is outlined, to /login, and only where asked for", /\{withLogin && \(\s*<Link\s+\{\.\.\.link\("\/login"\)\}/.test(row) && /data-guest-login=""[\s\S]{0,40}className=\{cn\("[^"]*rounded-action border border-white\/30/.test(row))
  check("Sign up is filled Storelib purple, to /signup", /link\("\/signup"\)/.test(row) && /data-guest-signup=""[\s\S]{0,140}rounded-action bg-violet-600/.test(row) && />\s*Sign up\s*</.test(row))
  check("both buttons take the shared corner, and nothing in it is a pill", (row.match(/rounded-action/g) ?? []).length === 2 && !/rounded-full/.test(row))
  check("the marketing pages carry Log in", (header.match(/<GuestHeaderActions withLogin link=\{headerLink\}/g) ?? []).length === 2)
  check("Explore's header leaves it out", (header.match(/<GuestHeaderActions withLogin=\{false\} link=\{headerLink\}/g) ?? []).length === 2)
  check("no Start selling anywhere in the header", !/start[ _]selling/i.test(header), (header.match(/.{0,40}start[ _]selling.{0,40}/gi) ?? []).join(" | "))
  check("the wishlist and library icons are still on Explore's bar", /aria-label=\{t\("wishlist"\)\}/.test(header) && /aria-label=\{t\("library"\)\}/.test(header))
  check("a single place defines the corner: --radius-action is 8px", /--radius-action: 8px;/.test(readSource("app/globals.css")))
}

console.log("\n   before the session is known")
check("both computer rows wait with an invisible copy of the logged out row", (header.match(/<GuestHeaderActions [^>]*placeholder \/>/g) ?? []).length === 2 && /placeholder && "invisible"/.test(header))
check("the stand in cannot be reached or read", /aria-hidden=\{placeholder \|\| undefined\}/.test(header) && /inert=\{placeholder \|\| undefined\}/.test(header))
check("no grey pills: the old skeleton is gone", !/HeaderActionsSkeleton|<Skeleton\b/.test(header))

console.log("\n3. the hero's two buttons")
{
  const hero = readCode("components/marketing/hero.tsx")
  const actions = hero.slice(hero.indexOf("data-hero-actions"), hero.indexOf("The #1 e-commerce platform"))
  check("they are above the subheading", hero.indexOf("data-hero-actions") > 0 && hero.indexOf("data-hero-actions") < hero.indexOf("The #1 e-commerce platform"))
  check("Discover and Sign Up take the Log in button's corner", (actions.match(/rounded-action/g) ?? []).length === 2)
  check("and neither is a pill", !/rounded-full/.test(actions))
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
  check("the marketing menu has Discover", /<GuestSheetActions second="discover"/.test(header))
  check("Explore's menu has Log in instead", /<GuestSheetActions second="login"/.test(header))
  check("and neither keeps the old Sign in and black Discover pair", !/data-menu-sign-in|bg-gray-900 text-white/.test(header))
}

console.log("\n6. signed in")
{
  const seller = header.match(/const sellerDashboardButton = hasCompletedSellerOnboarding \? \([\s\S]*?\) : null/)?.[0] ?? ""
  check("Dashboard beside the photo only with seller access, to /app", /headerLink\("\/app"\)/.test(seller))
  check("no purple Library button for a buyer", !/user \? "Library"/.test(header) && !/hasCompletedSellerOnboarding \? "Dashboard" : "Library"/.test(header))
  check("both computer rows show the Dashboard button and the photo's menu only when signed in", (header.match(/\{sellerDashboardButton\}\s*\{desktopAccountMenu\}/g) ?? []).length === 2)
  check("no link in the header goes to /onboarding: /sell decides", !/["']\/onboarding["']/.test(header))
  check("Become a seller goes to /sell from both phone sheets",
    /function BecomeSellerRow[\s\S]{0,200}link\("\/sell"\)/.test(header) && /<MenuRow seller href="\/sell" label="Become a seller"/.test(header) && (header.match(/<BecomeSellerRow link=\{headerLink\}/g) ?? []).length === 2)
  check("it is a calm row, not a badge: a pale violet ground, the height of its neighbours", /data-become-seller=""\s*className="[^"]*rounded-xl bg-\[#f5f3ff\] px-4 py-3\.5 text-base font-medium text-violet-700/.test(header))
  check("a seller gets Dashboard there instead", (header.match(/hasCompletedSellerOnboarding \? \(/g) ?? []).length >= 3)
  check("on a computer the photo is a link to /account, not a menu", /<Link\s+\{\.\.\.headerLink\("\/account"\)\}\s+aria-label="Your account"\s+data-header-avatar=""/.test(header) && !/data-account-menu|desktopProfileOpen/.test(header))
  check("the phone sheets lead to /account too (the profile card, Settings)", (header.match(/headerLink\("\/account"\)/g) ?? []).length === 3)
  check("no settings link in the header goes anywhere but /account", !/"\/library\/settings"|"\/app\/settings"/.test(header))
  check("the account sheet keeps My Library, Settings and Language", /<span>My Library<\/span>/.test(header) && /<span>Settings<\/span>/.test(header) && /t\("settings\.language"\)/.test(header))
  check("the seller check is the shared helper, marked SELLER ACCESS", /\/\/ SELLER ACCESS:[\s\S]{0,500}const isSellerByState = hasSellerAccess\(sellerAccessFrom\(\{ creator: creatorData, profile: profileData \}\)\)/.test(headerSrc) && /from "@\/lib\/account\/seller-access"/.test(header))
  for (const f of ["components/marketing/user-nav.tsx", "components/marketing/user-nav-client.tsx", "components/dashboard/sidebar.tsx"]) {
    const src = readCode(f)
    check(`${f}: Become a seller goes to /sell, not through signup/success, and settings to /account`, /href="\/sell"/.test(src) && !/become-creator/.test(src) && !/Start Selling|Become a Seller/.test(src) && /href="\/account"/.test(src) && !/\/library\/settings|"\/app\/settings"/.test(src))
  }
  check("the old marketing headers say Sign up, not Start selling", ["components/marketing/header.tsx", "components/marketing/header-client.tsx"].every((f) => !/Start selling/i.test(readCode(f))))
  check("the phone's white Sign in is one link, not a button in a link", /<Button asChild className=\{cn\("ml-2 h-9 px-5 rounded-lg text-sm font-semibold bg-white text-black[^"]*", loading && "invisible"\)\}>\s*<Link \{\.\.\.headerLink\("\/login"\)\}/.test(header))
}

console.log("\n7. the logo, 5% smaller in headers only")
{
  const m = header.match(/HEADER_LOGO = \{ desktop: ([\d.]+), marketingPhone: ([\d.]+), phone: ([\d.]+) \}/)
  const [d, mp, p] = (m?.slice(1) ?? []).map(Number)
  const five = (was: number, now: number) => Math.abs(now - was * 0.95) < 1e-9
  check("the site header: 44, 42 and 38 become 95% of themselves", !!m && five(44, d) && five(42, mp) && five(38, p), m?.slice(1))
  check("every logo in the site header draws at one of them", (header.match(/<StorelibLogo size=\{HEADER_LOGO\.(desktop|marketingPhone|phone)\}/g) ?? []).length === 4 && !/<StorelibLogo size=\{\d/.test(header))
  check("the /app top bar: 27 becomes 25.65", /<StorelibLogo size=\{25\.65\} priority \/>/.test(readCode("components/app/sidebar.tsx")) && five(27, 25.65))
  check("and its still copy matches it", /<StorelibLogo size=\{25\.65\} alt="" \/>/.test(readCode("components/app/shell-header-still.tsx")))
  check("the public wishlist's header: 32 becomes 30.4", /<StorelibLogo size=\{30\.4\} \/>/.test(readCode("components/wishlist/public-wishlist-shell.tsx")) && five(32, 30.4))
  check("by size, not by a CSS scale on the logo", !/scale|matrix/.test(readCode("components/brand/storelib-logo.tsx")))
  check("and the footer keeps its size", /<StorelibLogo size=\{40\} \/>/.test(readCode("components/marketing/footer.tsx")))
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) { console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`); process.exit(1) }
