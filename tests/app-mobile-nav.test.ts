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
    /onExplore=\{\(\) => \{[\s\S]{0,400}?isNativeApp\(\)\) openExternal\(EXPLORE_FULL_URL\)/.test(shell),
    "in Capacitor a navigation to the public site would strand somebody inside the app's own WebView")
  check("the bar is given the five glyphs it draws, all from the rail's own family",
    /icons=\{\{[\s\S]{0,400}?home: NAV_ICONS\.dashboard[\s\S]{0,400}?orders: NAV_ICONS\.orders[\s\S]{0,400}?products: NAV_ICONS\.products[\s\S]{0,400}?explore: NAV_ICONS_EXTRA\.explore[\s\S]{0,400}?settings: NAV_ICONS_EXTRA\.settings/.test(shell))
  check("and the compass comes from Solar too, not from a second icon library",
    /from "@solar-icons\/react\/linear\/compass"/.test(read("components/app/sidebar-desktop-nav.tsx"))
      && !/from "lucide-react"/.test(nav),
    "one glyph from a different library at 21px beside four Solar ones reads as heavier than all of them")

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
    /@media \(max-width: 767px\) \{\s*\n\s*html\.app-layout \.app-content-scroll \{\s*\n\s*padding-bottom: calc\(98px \+ env\(safe-area-inset-bottom, 0px\)\);/.test(css))
  check("the pill clears the home indicator",
    /paddingBottom: "calc\(10px \+ env\(safe-area-inset-bottom, 0px\)\)"/.test(nav))
  check("and it is not rendered at all on a desktop",
    (nav.match(/md:hidden/g) ?? []).length >= 2,
    "the pill or the menu would show beside the desktop rail")

  console.log("\n  it is glass, and it answers a finger")

  /*
    The first version was a white pill at 82% sitting ON a blurred band: an
    opaque object on glass rather than an object made of it. "It needs to not
    have solid in the background, it needs a very smooth layer of
    glassmorphism." So the blur is on the objects, and the band behind them
    has no fill of its own to be solid with.
  */
  check("the bar and the menu button are made of one glass",
    /const GLASS: React\.CSSProperties = \{/.test(nav)
      && /backdropFilter: "blur\(\d+px\) saturate\(\d+%\)"/.test(nav))
  check("its tint is thin enough to see the page through",
    (() => {
      const a = Number((nav.match(/backgroundColor: "rgba\(255,255,255,([\d.]+)\)"/) ?? [])[1] ?? 1)
      return a > 0 && a <= 0.55
    })(),
    "above about half, a white tint stops being glass and becomes a panel")
  check("the fade behind them has no fill, only a mask",
    /maskImage: "linear-gradient\(to top/.test(nav)
      && !/background: "linear-gradient\(to top, rgba\(248/.test(strip(nav)))
  check("nothing in the bar is painted in the accent colour",
    !new RegExp(String.raw`ACCENT`).test(strip(nav).slice(strip(nav).indexOf("function MobileNavPill"))),
    "the violet fill behind the active icon was the first thing called out")
  check("the depth is two soft drops and a half pixel of inner light, not a cast shadow",
    /0 1px 2px rgba\(16,18,27,0\.05\), 0 8px 22px rgba\(16,18,27,0\.10\)/.test(nav))

  check("a finger can slide along the bar, and the slot follows it",
    /function useSlide\(/.test(nav) && /onPointerMove: \(e: React\.PointerEvent\) => \{/.test(nav))
  check("the selector is square in its box, which is what makes it a circle",
    /width: DOT,\s*\n\s*height: DOT,/.test(nav) && /const DOT = BAR_H - PAD \* 2/.test(nav))
  check("a tap is a drag of zero length, so the two can never disagree",
    !/onClick=\{\(\) => pick\(/.test(nav) && /const picked = slotAt\(e\.clientX\)/.test(nav))
  check("and it ticks once per slot crossed, not once per frame",
    /if \(lastRef\.current !== next\) \{[\s\S]{0,200}?hapticTap\("light"\)/.test(nav))
  check("with a second tick on the lift, when it commits",
    /hapticTap\("medium"\)\s*\n\s*onPick\(picked\)/.test(nav))
  check("a gesture that leaves the bar vertically is not a navigation",
    /const away = escaped\(e\.clientY\)/.test(nav) && /if \(away\) return/.test(nav),
    "a finger that lands on the bar and travels up the screen was trying to scroll")
  check("and losing pointer capture ends the drag rather than stranding it",
    /onLostPointerCapture: end,/.test(nav))

  /*
    ── THE GLITCH ──────────────────────────────────────────────────────────
    Lift the finger and the drag's own answer is gone, so until the route
    resolves the circle is drawn on the slot the CURRENT path names — the one
    you just left. It springs back to it and then travels to the picked slot
    a second time. How far and for how long depend on how fast the route
    lands, which is why it reads as random.

    Driven in the probe, which never changes its path at all: 5px of travel
    with the pick remembered, 103px without.
  */
  check("a pick is remembered until the route catches up with it",
    /const marked = slide\.at \?\? pending \?\? current/.test(nav)
      && /setPending\(index\)/.test(nav),
    "without this the circle springs back to the page you left and then comes again")
  check("and it is let go of when the route arrives, or on a timer if it never does",
    /if \(current === pending\) \{ setPending\(null\); return \}/.test(nav)
      && /window\.setTimeout\(\(\) => setPending\(null\), 1500\)/.test(nav))
  check("a circle with no slot to sit on fades where it stands",
    /const restRef = useRef\(0\)/.test(nav) && /if \(marked >= 0\) restRef\.current = marked/.test(nav),
    "reading its position as slot zero would send it flying home as it shrank")

  /*
    Two jobs, two curves. Under a finger it has to be where the finger is,
    now; let go of it and it should arrive rather than stop.
  */
  check("it tracks a finger with no overshoot and settles with a little",
    /const TRACK = `transform 150ms cubic-bezier\(0\.2, 0, 0, 1\)`/.test(nav)
      && /const SETTLE = `transform 440ms cubic-bezier\(0\.34, 1\.32, 0\.42, 1\)`/.test(nav)
      && /slide\.dragging \? TRACK : SETTLE/.test(nav))

  console.log("\n  and the menu keeps the navigation, with settings beside the X")

  check("the bar's four slots are the same open or shut",
    !/menuOpen\s*\n?\s*\?\s*\[\{ key: "settings"/.test(strip(nav)),
    "the navigation used to be replaced by a single Settings slot while the menu was open")
  check("settings is its own circle, to the right of the close button",
    /aria-label="Settings"/.test(nav) && /left: "100%",\s*\n\s*marginLeft: GAP,/.test(nav))
  check("it is out of the flow, and the group slides instead of being laid out again",
    /transform: `translateX\(\$\{menuOpen \? -\(BAR_H \+ GAP\) \/ 2 : 0\}px\)`/.test(nav),
    "animating a width would relayout the row on every frame of the open")
  check("and it takes no presses and no tab stop while it is hidden",
    /tabIndex=\{menuOpen \? 0 : -1\}/.test(nav) && /menuOpen \? "pointer-events-auto" : "pointer-events-none"/.test(nav))

  check("the hamburger's lines have a little more air between them",
    /top-\[3\.2px\]/.test(nav) && /top-\[13\.2px\]/.test(nav) && /h-\[1\.6px\]/.test(nav),
    "at 1.6px of stroke, 4px apart leaves 2.4px of air and reads as a stack rather than three lines")
  check("keyboard activation still works, although the pointer decides",
    /if \(e\.detail === 0\) pick\(i\)/.test(nav))
  check("all of it driven in the probe, not asserted from the source",
    /a finger sliding along the bar drags the circle with it/.test(read("scripts/check-app-mobile-nav.mjs"))
      && /haptic ticks/.test(read("scripts/check-app-mobile-nav.mjs")))

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
