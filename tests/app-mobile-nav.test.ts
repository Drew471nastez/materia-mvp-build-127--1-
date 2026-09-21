/**
 * ===========================================================================
 *  THE PHONE'S NAVIGATION, IN THE PARTS A BROWSER CANNOT SEE
 * ===========================================================================
 * scripts/check-app-mobile-nav.mjs renders the pill and the menu at 390x844,
 * presses them and measures what comes out — the geometry, the glass, the
 * light page, the frames a group takes to open. That is the half that has to
 * be looked at.
 *
 * This is the other half: that the SHELL still wires it up. A probe mounts
 * the two components directly, so it cannot tell whether components/app/
 * sidebar.tsx passes them the right things, whether the old drawer is really
 * gone, or whether the back button still knows what to close.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail?: string) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; failures.push(label + (detail ? ` — ${detail}` : "")); console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ""}`) }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

function main() {
  /*
    NEGATIVE ASSERTIONS READ CODE, NOT PROSE.

    "There is no `scrollHeight` any more" is a claim about what the file
    DOES, and the comment explaining why it no longer does it says the word
    too. Three separate checks in this repo have failed against their own
    explanations. So anything asking whether something is gone reads the
    file with its comments taken out.
  */
  const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")
  const shell = read("components/app/sidebar.tsx")
  const nav = read("components/app/sidebar-mobile-nav.tsx")
  const back = read("components/app/native-back-handler.tsx")
  const css = read("app/globals.css")

  console.log("\n  the drawer is gone, and so is what only it used")

  check("no 260px drawer is rendered any more",
    !/w-\[260px\]/.test(strip(shell)), "the fixed-width drawer is still there")
  check("and nothing is left rendering it",
    !/MobileSidebarContent/.test(strip(shell)))
  check("the hamburger and its Menu icon are gone from the header",
    !/aria-label=\{mobileMenuOpen \? "Close menu" : "Open menu"\}/.test(shell)
      && !/^ {2}Menu,$/m.test(shell))
  check("Home is not in the header as well as in the pill",
    !/aria-label="Home"/.test(strip(shell)))

  /*
    The imperative Collapsible measured scrollHeight, pinned a pixel height,
    forced a reflow and released the height on transitionend — four layout
    flushes per toggle. Both surfaces animate a grid track now, so it and the
    two row components that were its only callers have nothing left to do.
  */
  check("the imperative height Collapsible is gone with it",
    !/void outer\.offsetHeight/.test(strip(shell)) && !/function Collapsible/.test(strip(shell)))
  check("and so are the rows only it rendered",
    !/const MobileNavItem = /.test(strip(shell)) && !/const SubNavItem = /.test(strip(shell))
      && !/const NavItem = /.test(strip(shell)) && !/const SoonItem = /.test(strip(shell)))

  console.log("\n  and the shell wires up what replaced it")

  check("the pill and the menu are both mounted",
    /<MobileNavPill/.test(shell) && /<MobileMenuPage/.test(shell))
  check("the menu is given the same nav list the desktop rail gets",
    /items=\{mainNavItems\}/.test(shell))
  check("and the same expand state, so a group opens on both",
    /expandedGroups=\{expandedGroups\}/.test(shell) && /onToggle=\{toggleGroup\}/.test(shell))
  check("a row that leaves the /app router tree still leaves it the hard way",
    /onForceNavigate=\{\(href\) => \{[\s\S]{0,400}?isNativePlatform\(\)/.test(shell),
    "a full reload in Capacitor loses the session, which lives in Preferences")
  check("the page behind the menu is locked while it is open",
    /useLockAppScroll\(mobileMenuOpen\)/.test(shell))
  check("explore opens outside the shell in the native app",
    /onExplore=\{\(e\) => \{[\s\S]{0,200}?isNativeApp\(\)[\s\S]{0,120}?openExternal\(EXPLORE_FULL_URL\)/.test(shell))
  check("settings is passed as a row, with the rail's own icon",
    /settingsIcon=\{NAV_ICONS_EXTRA\.settings\}/.test(shell))

  console.log("\n  the back button closes what is on top")

  check("the handler looks for an open menu before anything else",
    back.indexOf('[data-mobile-menu="open"]') > 0
      && back.indexOf('[data-mobile-menu="open"]') < back.indexOf("isRootRoute(window.location.pathname)"),
    "back would offer to exit the app with a full screen menu open over it")
  check("it asks by event rather than by importing the component",
    /dispatchEvent\(new CustomEvent\(CLOSE_EVENT\)\)/.test(back))
  check("and the menu is listening for exactly that event",
    /export const CLOSE_EVENT = "storelib:close-mobile-menu"/.test(nav)
      && /node\.addEventListener\(CLOSE_EVENT, handler\)/.test(nav))
  check("the listener reads the CURRENT onClose, not the one from its first render",
    /closeRef\.current = onClose/.test(nav) && /const handler = \(\) => closeRef\.current\(\)/.test(nav),
    "a handler registered once with [] deps freezes whatever prop it closed over")

  console.log("\n  and nothing is left underneath the pill")

  check("the phone's scroll container is padded for it",
    /@media \(max-width: 767px\) \{\s*\n\s*html\.app-layout \.app-content-scroll \{\s*\n\s*padding-bottom: calc\(92px \+ env\(safe-area-inset-bottom, 0px\)\);/.test(css))
  check("the pill clears the home indicator",
    /paddingBottom: "calc\(10px \+ env\(safe-area-inset-bottom, 0px\)\)"/.test(nav))
  check("and it is not rendered at all on a desktop",
    (nav.match(/md:hidden/g) ?? []).length >= 2,
    "the pill or the menu would show beside the desktop rail")

  console.log("\n  the motion is the compositor's")

  check("the menu page moves on transform and opacity",
    /transform: open \? "translateY\(0\)" : "translateY\(14px\)"/.test(nav)
      && /opacity: open \? 1 : 0/.test(nav))
  check("it is hidden with visibility rather than unmounted, so it keeps its place",
    /visibility: open \? "visible" : "hidden"/.test(nav),
    "unmounting throws away the scroll position and every open group")
  check("a group animates a grid track, with nothing measured and nothing released",
    /gridTemplateRows: open \? "1fr" : "0fr"/.test(nav) && !/scrollHeight/.test(strip(nav)))
  check("and the driven measurement of all of it is in the probe",
    /a group opens and closes/.test(read("scripts/check-app-mobile-nav.mjs")))

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) { console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`); process.exit(1) }
}
main()
