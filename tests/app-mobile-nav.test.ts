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
import { readdirSync, readFileSync } from "node:fs"
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
  check("the bar is given the five glyphs it draws, all from the rail's own family",
    /icons=\{\{[\s\S]{0,400}?home: NAV_ICONS\.dashboard[\s\S]{0,400}?orders: NAV_ICONS\.orders[\s\S]{0,400}?products: NAV_ICONS\.products[\s\S]{0,400}?analytics: NAV_ICONS\.analytics[\s\S]{0,400}?settings: NAV_ICONS_EXTRA\.settings/.test(shell))
  /*
    ── A TAB BAR IS ONLY A TAB BAR IF THE TABS ARE STILL THERE ─────────────
    Since Next 15 the client router keeps a dynamic page's payload for zero
    seconds, so every press on the bar refetched the page and showed its
    loading.tsx skeleton, even one you were on a moment ago. "If I already
    loaded the page, why does every switch load it as a new thing." The
    config keeps a visited page for five minutes, and the bar warms its four
    routes on mount so the first press does not start from cold.
  */
  check("the router keeps a visited page rather than refetching it on every press",
    /staleTimes: \{\s*\n\s*dynamic: 300,\s*\n\s*static: 300,/.test(read("next.config.mjs")),
    "with staleTimes.dynamic at 0, every tab press shows the skeleton again")
  check("and the shell warms the bar's routes",
    /onPrefetch=\{\(href\) => \{[\s\S]{0,120}?router\.prefetch\(href\)/.test(shell)
      && /for \(const item of items\) onPrefetch\(item\.href\)/.test(nav))
  check("and it draws no glyph from a second icon library",
    !/from "lucide-react"/.test(nav),
    "one glyph from a different library at 22px beside three Solar ones reads as heavier than all of them")

  /*
    ── EXPLORE IS NOT ONE OF THIS PERSON'S PLACES ─────────────────────────
    It spent a while as the fourth slot beside Home, Orders and Products,
    which are three pages of their own shop. It is the public site, and it
    leaves this shell entirely — in the native app it has to open OUTSIDE the
    WebView, or somebody ends up stranded in it with no way back.
  */
  check("explore is in the header, to the left of the bell",
    shell.indexOf('aria-label="Explore"') > 0
      && shell.indexOf('aria-label="Explore"') < shell.indexOf('aria-label="Notifications"'))
  check("and it is drawn with the same compass the rail knows",
    /import \{ CompassIcon as ExploreIcon \} from "@solar-icons\/react\/linear\/compass"/.test(shell))
  check("it opens outside the shell in the native app",
    /aria-label="Explore"[\s\S]{0,300}?isNativeApp\(\)\) openExternal\(EXPLORE_FULL_URL\)/.test(shell),
    "in Capacitor a navigation to the public site would strand somebody inside the app's own WebView")
  check("and the bar does not carry it any more",
    !/onExplore/.test(strip(nav)) && !/onExplore/.test(strip(shell)))

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
    /@media \(max-width: 767px\) \{\s*\n\s*html\.app-layout \.app-content-scroll \{\s*\n\s*padding-bottom: calc\(104px \+ env\(safe-area-inset-bottom, 0px\)\);/.test(css))
  check("the pill clears the home indicator",
    /const PILL_LIFT = "max\(4px, env\(safe-area-inset-bottom, 0px\)\)"/.test(nav)
      && /paddingBottom: `calc\(\$\{PILL_LIFT\}\)`/.test(nav))
  /*
    ── THE PAGE HAS TO BE ABLE TO GET PAST IT ──────────────────────────────
    Every other /app page scrolls in .app-content-scroll. The dashboard puts
    its own `h-full overflow-y-auto` container inside that one and scrolls in
    THAT, so the rule above never reached the thing that moves — and worse,
    padding the outer box shrank the inner one's `h-full`, so the dashboard's
    content ended 98px above the bottom of the screen and the bar floated in
    an empty strip.

    A glass bar over nothing is the colour of nothing. That is the whole of
    "there is still a solid background there", said four times about a bar
    that measured as transparent every time, and no tint or blur on the bar
    could ever have answered it.

    scripts/check-dashboard-nav mounts the real DashboardClient inside the
    real shell and photographs it: 10 elements of the page pass behind the
    bar mid-scroll, and the pixel through the bar reads rgb(157,158,158)
    against rgb(248,249,250) for the bare page beside it.
  */
  check("the clearance is taken off the container that does not scroll, on every page that nests one",
    /\.app-content-scroll:has\(> \.page-scroll, > \.dashboard-scroll-container, > \.sales-scroll-container\) \{\s*\n\s*padding-bottom: 0;/.test(css),
    "padding the outer box only shrinks the inner one and holds the page away from the bar")
  check("and put on the one that does",
    /\.app-content-scroll > \.page-scroll,\s*\n\s*html\.app-layout \.app-content-scroll > \.dashboard-scroll-container,\s*\n\s*html\.app-layout \.app-content-scroll > \.sales-scroll-container \{\s*\n\s*padding-bottom: calc\(104px \+ env\(safe-area-inset-bottom, 0px\)\);/.test(css))
  /*
    AND EVERY PAGE THAT NESTS ONE IS FOUND, not listed. The list used to be
    five files kept by hand, and analytics was the sixth: `h-full
    overflow-y-auto` with no class on it, so the rule above padded the outer
    box, the inner `h-full` shrank to match, and the page stopped 104px above
    the bar with nothing under it to show through the glass. Reported as the
    bar having "a solid background on analytics, not like on home or
    products", which is exactly what it was. Three skeletons had it too.

    So this walks the tree instead. Anything that scrolls a whole page has to
    name itself, and a new page cannot be added without this noticing.
  */
  check("which covers every page that really does nest one, found rather than listed",
    (() => {
      const named = /\b(page-scroll|dashboard-scroll-container|sales-scroll-container)\b/
      /* It is centred, not scrolled: it has no last row to hold off the bar. */
      const exempt = new Set(["app/app/not-found.tsx"])
      const missing: string[] = []
      const walk = (dir: string) => {
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
          const path = `${dir}/${entry.name}`
          if (entry.isDirectory()) { walk(path); continue }
          if (!entry.name.endsWith(".tsx")) continue
          for (const line of read(path).split("\n")) {
            if (!/className="h-full overflow-y-auto/.test(line)) continue
            if (!named.test(line) && !exempt.has(path)) missing.push(path)
          }
        }
      }
      walk("app/app")
      for (const f of ["components/app/dashboard-client.tsx", "components/app/settings-form.tsx"]) {
        if (!named.test(read(f))) missing.push(f)
      }
      if (missing.length) console.log(`        unnamed page scrollers: ${[...new Set(missing)].join(", ")}`)
      return missing.length === 0
    })(),
    "a page that scrolls under a class this rule does not name gets the dashboard's old fault: content stops above the bar and the glass has nothing to frost")
  check("with the real dashboard driven under the real bar to prove it",
    (() => {
      const probe = read("scripts/check-dashboard-nav.mjs")
      return /mid-scroll the page really does pass behind the bar/.test(probe)
        && /puts pure red\s+and then pure blue behind it/.test(probe)
    })(),
    "a page of plain cards is the one page that cannot show this, which is why it took four goes")

  console.log("\n  the document itself never scrolls")

  /*
    THE ANNOUNCEMENT BAR UNDER THE HEADER. The header is fixed and the page
    scrolls inside .app-content-scroll, so the document has nothing to
    scroll. Then a focused input, a scrollIntoView, or the overscroll chain
    on a phone scrolls it anyway, and everything fixed stays where it was
    while everything in flow moves up under it: the purple bar half under
    the header, on every /app page, on a desktop as well as a phone.
    html { overflow: hidden } does not stop any of those. Two answers, one
    on each side: the nested scrollers refuse to chain in CSS, and a guard
    puts the document back the frame it moves.
  */
  check("the nested page scrollers refuse to hand their overscroll to the document",
    /html\.app-layout \.app-content-scroll > \.page-scroll,\s*\n\s*html\.app-layout \.app-content-scroll > \.dashboard-scroll-container,\s*\n\s*html\.app-layout \.app-content-scroll > \.sales-scroll-container \{\s*\n\s*overscroll-behavior: none;/.test(css),
    "overscroll-behavior does not inherit, so it has to sit on the element that scrolls")
  check("and the shell mounts a guard that puts the document back",
    /import \{ DocumentScrollGuard \} from "@\/components\/app\/document-scroll-guard"/.test(read("components/app/app-layout-wrapper.tsx"))
      && /<DocumentScrollGuard \/>/.test(read("components/app/app-layout-wrapper.tsx")))
  check("which listens rather than polls, and settles once per frame",
    (() => {
      const g = read("components/app/document-scroll-guard.tsx")
      return /addEventListener\("scroll", onScroll, \{ passive: true \}\)/.test(g)
        && /requestAnimationFrame\(settle\)/.test(g) && !/setInterval/.test(strip(g))
    })())
  check("with the push and the recovery measured in the dashboard probe",
    /put back within a frame/.test(read("scripts/check-dashboard-nav.mjs")))

  /*
    ── WHERE THE PILL DOES NOT GO ──────────────────────────────────────────
    OnePage is an editor that owns the screen and has its own controls along
    the bottom of it, so a second bar floating over them is one too many.
    The route decides, not the page, because a page that has to remember to
    say so is a page that will forget.
  */
  check("the pill knows the routes it does not belong on",
    /const NO_PILL = \["\/app\/onepage"\]/.test(nav)
      && /export const pillBelongsOn = \(pathname: string\): boolean =>/.test(nav)
      && /pathname === base \|\| pathname\.startsWith\(`\$\{base\}\/`\)/.test(nav),
    "a prefix, so anything under the route is covered too")
  /*
    AND THE GATE IS AT THE MOUNT, not inside the component. Inside, it would
    be a return after every hook the pill owns, and tests/hook-order reads a
    file at a time: the rule it enforces does not care that the hook below
    the return belongs to a different component further down. Not rendering
    a component is the ordinary way to say this in any case.
  */
  check("and the shell mounts it only where it belongs",
    (() => {
      const shell = read("components/app/sidebar.tsx")
      return /\{pillBelongsOn\(pathname\) \? \(\s*\n\s*<MobileNavPill/.test(shell)
        && /import \{[^}]*\bpillBelongsOn\b[^}]*\} from "@\/components\/app\/sidebar-mobile-nav"/.test(shell)
    })(),
    "a pill mounted without the gate is a pill on every route")
  check("with no early return left inside the component itself",
    !/return null/.test(strip(nav).slice(strip(nav).indexOf("export function MobileNavPill"))),
    "a hook below a return is the crash tests/hook-order.test.ts exists for")
  check("and the probe's harness mounts it behind the same gate, so what it measures is what ships",
    /\{pillBelongsOn\(usePathname\(\)\) \? \(/.test(read("scripts/render-app-mobile-nav.tsx")))
  check("with the disappearance driven in the probe rather than read",
    /the pill is not rendered at all on OnePage/.test(read("scripts/check-app-mobile-nav.mjs"))
      && /and it is back on the next page that is a page/.test(read("scripts/check-app-mobile-nav.mjs")))

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
  /*
    WHITE, NOT GREY. The tint went down to 18% while "solid" was the
    complaint, and over artwork that left the glyphs sitting on saturated
    red. "The bar itself doesn't need to be transparent" put it to 70%, and
    over the dark cover of the dashboard 70% white reads as warm grey. "I
    don't want it greyish in any circumstances." 90% is white over anything
    and still, measurably, not a panel: the probe reads 16 of movement
    between red and blue through it, where a panel reads 0.
  */
  check("its tint is white over anything, and not a panel",
    (() => {
      const a = Number((nav.match(/backgroundColor: "rgba\(255,255,255,([\d.]+)\)"/) ?? [])[1] ?? 1)
      return a >= 0.9 && a <= 0.96
    })(),
    "under 90% the bar goes grey over a dark page; at 100% it is a panel")
  /*
    And the only test of that claim that means anything is the photograph:
    the probe puts red behind the bar, photographs a square between two
    glyphs, changes it to blue and photographs again. A panel moves 0; this
    moves 150, where the version reported as "still solid" moved 133.
  */
  check("and the claim is settled by photographing it over two colours",
    /change what is behind the bar and the bar changes/.test(read("scripts/check-app-mobile-nav.mjs"))
      && /function decodePng\(buf\)/.test(read("scripts/check-app-mobile-nav.mjs")))
  check("with a column of pixels read down the screen to catch a plate",
    /a column down the left margin/.test(read("scripts/check-app-mobile-nav.mjs"))
      && /the screen is one colour from the content down to the bottom edge/.test(read("scripts/check-app-mobile-nav.mjs")),
    "a single square cannot find a region with an edge across the screen; a column can")
  check("and the pair held apart in the probe too",
    /nothing behind the bar masks a backdrop-filter/.test(read("scripts/check-app-mobile-nav.mjs")))
  /*
    ── THE ONE THAT CHROMIUM COULD NOT SHOW ────────────────────────────────
    A full width strip used to sit behind the bar carrying `backdrop-filter`
    AND `mask-image`, to blur the page under it and dissolve upward instead
    of ending on an edge.

    WKWebView does not composite those two on one element: it drops the mask
    and paints the filtered region as a flat light fill. On an iPhone that
    strip was a pale rectangle across the foot of the screen with a hard top
    edge — reported three times as "the background is still solid", and never
    once reproducible in the probe, which photographed a flat rgb(248,249,250)
    all the way down because Chromium honours the mask.

    Since the browser here cannot show the fault, the guard is structural:
    nothing in this file may carry the pair, and there is no full width layer
    behind the bar at all. A sweep of the repository found this was the only
    place the two had ever been put together.
  */
  check("no element carries a mask over a backdrop-filter",
    (() => {
      const styles = strip(nav).match(/style=\{\{(?:[^{}]|\{[^{}]*\})*\}\}/g) ?? []
      return !styles.some((t) => /backdropFilter/.test(t) && /askImage/.test(t))
    })(),
    "WKWebView drops the mask and paints the filtered region as a flat fill, which is a plate across the bottom of the screen")
  /*
    The fade came back, built out of the one thing every engine draws the
    same way: plain rectangles. Six of them, anchored to the bottom, each a
    little shorter than the last and each with a small blur, so the blurs
    compound where they overlap. Measured by the probe with stripes behind
    them: 255 of contrast above the fade, 181 at its top, 28 at the bar.
  */
  /*
    The fade was six full-width strips with blurs of 1 to 6, and each strip's
    top edge was a step in radius the eye could find. It is a HALO now:
    concentric ellipses around the bar group, every one carrying the same
    1.2px blur, compounding toward the bar. No edge changes the radius by more
    than that, and the halo reaches nowhere near the screen's edge. Measured
    through stripes: 255 above it, 255 at its edge, 12 beside the bar, 255 in
    the left margin.

    ELLIPSES, NOT STADIUMS. The first halo's layers were stadiums, and a
    stadium has a straight top: a line 200px long where every layer's blur
    began together. "The ending should not be that direct, it should morph."
    An ellipse has no straight edge anywhere, so twelve of them, each 3px in
    from the last, end twelve different places along a curve.

    AND THE BLUR RAMPS. Ten ellipses each carrying 1.2px still had an edge,
    the outermost, where 1.2px began all at once on crisp text: the cut drawn
    on the screenshot of the menu, down the halo's left side. The outermost
    layer carries next to nothing now and each one inward carries more.
  */
  check("the fade is a halo of concentric elliptical layers",
    /const HALO_LAYERS = 12/.test(nav)
      && /data-app-nav-fade-step=""[\s\S]{0,200}borderRadius: "50%"/.test(nav)
      && /inset: i \* HALO_STEP,/.test(nav))
  check("whose blur ramps from nothing at the outermost to 0.45px at the innermost",
    /const HALO_BLUR = 0\.45/.test(nav)
      && /const haloBlur = \(i: number\) => Math\.round\(HALO_BLUR \* \(\(i \+ 1\) \/ HALO_LAYERS\) \*\* 2/.test(nav)
      && /backdropFilter: `blur\(\$\{haloBlur\(i\)\}px\)`/.test(nav),
    "the same blur on every layer puts an edge on the outermost one")
  check("wider than the screen, low, and centred on the screen rather than on the bar group",
    /const HALO_REACH = \{ top: 30, below: 44, side: 56 \}/.test(nav)
      && /width: `calc\(100% \+ \$\{HALO_REACH\.side \* 2\}px\)`/.test(nav)
      && /className="pointer-events-none absolute left-1\/2"/.test(nav),
    "hung on the group, the halo left the settings circle standing on bare page while the menu was open")
  /*
    ITS BOTTOM EDGE IS UNDER THE DISPLAY. It used to be PILL_LIFT - 22px,
    which on a phone with a home indicator is 18px ABOVE the bottom of the
    screen: a bare strip under the pill, where a thumb rests. Anchored below
    the display, the screen's edge cuts across the ellipse where it is still
    near its full width, and the part that tapers is the part nobody sees.
  */
  check("and its lower edge is under the display, not above the home indicator",
    /bottom: -HALO_REACH\.below,/.test(nav)
      && /height: `calc\(\$\{BAR_H \+ HALO_REACH\.top \+ HALO_REACH\.below\}px \+ \$\{PILL_LIFT\}\)`/.test(nav),
    "tied to the pill's own lift, the halo stopped short of the bottom of the screen")
  check("with the strip under the pill measured in the probe",
    /it covers the strip under the pill, where a home indicator sits/.test(read("scripts/check-app-mobile-nav.mjs"))
      && /past the bottom of the screen, so there is no bare strip/.test(read("scripts/check-app-mobile-nav.mjs")))
  check("with the pill's lift above the screen's bottom read once, by the pill and by the halo",
    /const PILL_LIFT = "max\(4px, env\(safe-area-inset-bottom, 0px\)\)"/.test(nav)
      && /paddingBottom: `calc\(\$\{PILL_LIFT\}\)`/.test(nav)
      && /height: `calc\([^`]*\$\{PILL_LIFT\}\)`/.test(nav),
    "the same number computed twice is where the editor's black bands came from")
  check("and its tint is one vertical ramp in the page's own colour",
    /const HALO_TINT = "rgba\(248,249,250,0\.18\)"/.test(nav)
      && /linear-gradient\(to bottom, \$\{HALO_TINT_NONE\} 0%, \$\{HALO_TINT_NONE\} 30%, \$\{HALO_TINT\} 100%\)/.test(nav),
    "a radial one came up in the middle and fell away at the sides, which over a picture reads as a patch rather than the bottom of the screen")
  check("with every layer of it measured as an ellipse in the probe, and the ramp read off the layers",
    /nothing in it ends on a straight line/.test(read("scripts/check-app-mobile-nav.mjs"))
      && /no radius at which it begins/.test(read("scripts/check-app-mobile-nav.mjs")))
  check("with the halo measured through stripes in the probe, and its reach measured as geometry",
    /rather than stopping in an arc short of the edges/.test(read("scripts/check-app-mobile-nav.mjs"))
      && /the blur is progressive/.test(read("scripts/check-app-mobile-nav.mjs")))
  /*
    The reach used to be inferred from how blurred the stripes were at the
    screen's edge, which worked while the blur was strong. Asked down five
    times — 2.4 to 1.2 to 0.9 to 0.6 to 0.35 — that reading stopped being able
    to tell "the halo stops short" from "the halo is gentle", so reach is the
    halo's own box against the screen now and strength keeps one loose floor
    of its own.
  */
  check("reach is the halo's width, not how hard it blurs",
    /REACH IS GEOMETRY\. STRENGTH IS A SEPARATE QUESTION/.test(read("scripts/check-app-mobile-nav.mjs"))
      && /must\(shut\.fade\.w >= VIEW_W/.test(read("scripts/check-app-mobile-nav.mjs")),
    "a strength threshold doing duty as a coverage test fails the moment the strength is tuned")
  check("and the overhang is measured as costing the page no sideways scroll",
    /the document is still the width of the screen/.test(read("scripts/check-app-mobile-nav.mjs")),
    "an element wider than the viewport is how a page gets a horizontal scrollbar")
  check("nothing in the bar is painted in the accent colour",
    !new RegExp(String.raw`ACCENT`).test(strip(nav).slice(strip(nav).indexOf("function MobileNavPill"))),
    "the violet fill behind the active icon was the first thing called out")
  /* "Add some more depth." Three drops: the contact line under the edge, a
     near one for the glass's thickness, a far one that lifts the whole pill
     off the page. Soft, so it reads as distance rather than as a sticker. */
  check("the depth is three soft drops and a half pixel of inner light, not a cast shadow",
    /0 1px 2px rgba\(16,18,27,0\.06\), 0 4px 10px rgba\(16,18,27,0\.07\), 0 14px 30px rgba\(16,18,27,0\.14\)/.test(nav)
      && /inset 0 0 0 0\.5px rgba\(255,255,255,0\.65\)/.test(nav))
  check("and the circle under a finger is lifted off the bar the same way, one step down",
    /0 1px 2px rgba\(16,18,27,0\.07\), 0 3px 8px rgba\(16,18,27,0\.10\)/.test(nav))

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
    Two jobs, two mechanisms. Under a finger it is where the finger is, every
    frame, with no transition to be a delay and no slot to be a step: the
    90ms hop from slot to slot was "very snappy, very direct, landing on it,
    not smooth at all". Let go of it and it springs to the slot.
  */
  check("under a finger the circle follows the finger itself, not the finger's slot, with no transition",
    /const FOLLOW = 0\.6/.test(nav)
      && /targetRef\.current = movedRef\.current \? leftFor\(clientX\) : leftForSlot\(next\)/.test(nav)
      && /posRef\.current \+= gap \* FOLLOW/.test(nav)
      && /frameRef\.current = requestAnimationFrame\(step\)/.test(nav)
      && /slide\.dragging \? "translate 0s" : slide\.bounce \? SETTLE : LAND/.test(nav),
    "a transition under the finger is a delay; a slot under the finger is a step")
  check("written straight to the element by the loop, and never by a style prop",
    /dot\.style\.translate = `\$\{posRef\.current\}px 0`/.test(nav)
      && /dot\.style\.translate = `\$\{x\}px 0`/.test(nav)
      && !/translate: `/.test(strip(nav)) && !/transform: `translateX\(\$\{x\}px\)/.test(strip(nav)),
    "a position prop would fight the loop, or on the lift be a string React already rendered and never written")
  check("a render happens when the slot changes, not on every move",
    /if \(lastRef\.current !== next\) \{\s*\n\s*lastRef\.current = next\s*\n[^\n]*\n[^\n]*\n\s*setAt\(next\)/.test(nav)
      && !/^\s*setAt\(next\)\s*$/m.test(strip(nav).split("const move")[1].split("if (lastRef")[0]))
  /*
    But a press is not a drag, and aiming a press at the fingertip is what the
    bump was: press Orders 21px off its centre and the circle sprang 21px past
    the slot towards the finger, then the lift pulled it back. Measured in the
    probe, which presses off centre on purpose: 21px past before, 0px after.
    Under the finger once the gesture has actually moved, on the slot until
    then, and the slot's left edge is computed by the arithmetic the component
    already uses at rest, so the press and the rest cannot disagree by a pixel.
  */
  check("and a press that has not moved yet aims at the slot, not at the fingertip",
    /const movedRef = useRef\(false\)/.test(nav)
      && /const DRAG_SLOP = 8/.test(nav)
      && /if \(!movedRef\.current && Math\.abs\(clientX - downXRef\.current\) > DRAG_SLOP\) \{/.test(nav),
    "a press aimed at the fingertip springs off the slot and is dragged back on the lift: the bump")
  check("with the slot's edge computed the one way the component computes it at rest",
    /const leftForSlot = \(index: number\): number => PAD \+ index \* SLOT \+ \(SLOT - DOT\) \/ 2/.test(nav)
      && /const leftFor = /.test(nav),
    "a second piece of arithmetic for the same number is how the press and the rest drift apart")
  check("and the press is a press again as soon as the finger lifts",
    /movedRef\.current = false/.test(nav) && (nav.match(/movedRef\.current = false/g) || []).length >= 2,
    "left set, the next tap would be treated as a continuing drag")

  check("and a press during a spring picks the circle up from where it is drawn",
    /posRef\.current = drawnAt\(\) \?\? leftFor\(e\.clientX\)/.test(nav)
      && /getComputedStyle\(dot\)\.translate/.test(nav))
  check("it settles with a little overshoot, on its own property, and lifts on another",
    /const SETTLE = `translate 420ms cubic-bezier\(0\.32, 1\.24, 0\.44, 1\)`/.test(nav)
      && /const LIFT = 1\.06/.test(nav) && /slide\.following \? LIFT : 1/.test(nav)
      && /const LIFT_EASE = `scale 200ms/.test(nav))
  /*
    AND NEITHER OF THOSE BELONGS TO A PRESS. `dragging` meant "a finger is
    down", so a tap grew the circle 6% and shrank it back with nothing being
    held — 2.35px across, measured in the probe, and a different amount every
    time because a 200ms lift was being cut short by a 60ms press. Every
    check in this file read the circle's POSITION, which was clean, so this
    went two rounds without being found.

    So there are two pieces of state, and they answer different questions.
    `dragging` is where the circle IS, from the moment a finger lands.
    `following` is whether a finger is actually dragging it, and the lift,
    the brighter fill and the waiting glyphs all belong to that.
  */
  /*
    AND THE ICONS THEMSELVES. They used to cross-fade a line glyph out and a
    fill glyph in, which is fading one shape into a DIFFERENT shape: a stroke
    reaches half a stroke past its path where a solid stops at it, and three
    of the four are separate drawings from the icon set besides. Photographed
    on and off in the probe, every one shrank when its tab turned on — 1 to
    2px off the ink box, and Home's ink moved 1.6px up the way with it.

    The outline is drawn in both states now and the solid fades in behind it,
    so the silhouette is the outline's either way and there is nothing left
    that can change size. Measured at +0 x +0 on all four.
  */
  check("an icon keeps its outline when it fills, so its shape cannot change",
    /<Line size=\{size\} strokeWidth=\{1\.5\} style=\{\{ position: "absolute", inset: 0 \}\} \/>/.test(nav),
    "fading a stroked glyph out and a solid one in is two different shapes trading places")
  check("and the fill is the one that arrives, behind it",
    /<Fill\s+size=\{size\}\s+style=\{\{ position: "absolute", inset: 0, opacity: active \? 1 : 0, transition: "opacity 180ms ease-out" \}\}/.test(nav)
      && nav.indexOf("<Fill") < nav.indexOf("<Line size={size} strokeWidth={1.5}"),
    "in front of the outline it would spill past it on any icon drawn larger")

  check("and the lift belongs to a finger that is dragging, not to one that has landed",
    /const \[following, setFollowing\] = useState\(false\)/.test(nav)
      && /setFollowing\(true\)/.test(nav)
      && /slide\.following \? "rgba\(255,255,255,0\.92\)" : "rgba\(255,255,255,0\.82\)"/.test(nav)
      && !/slide\.dragging \? LIFT/.test(strip(nav)),
    "a tap holds nothing, so growing the circle under one is movement for no reason")
  check("and every gesture starts as a press, and is promoted only if a finger travels",
    /setFollowing\(false\)\s*\n\s*setBounce\(false\)/.test(nav)
      && /movedRef\.current = true\s*\n\s*setFollowing\(true\)/.test(nav),
    "left over from the last gesture, the first tap after a drag would lift and bounce")
  check("and a press lands where a released drag bounces",
    /const LAND = `translate 260ms cubic-bezier\(0\.22, 0\.61, 0\.36, 1\)`/.test(nav)
      && /slide\.bounce \? SETTLE : LAND/.test(nav),
    "SETTLE's third control point is 1.24: past the slot and back, which a press never asked for")
  check("the finger is known from a ref, not from state a render behind",
    /if \(!activeRef\.current\) return/.test(nav) && !/if \(!dragging\) return/.test(strip(nav)))
  /*
    THE GLYPHS HOLD STILL WHILE THE CIRCLE MOVES. Cross-fading four glyphs on
    every slot the circle crossed is what read as "icons glitch, scale
    randomly, jumpy". The fill follows what has been committed; the lens
    follows the finger.
  */
  check("the glyphs follow the committed slot, not the finger",
    /const shown = slide\.following \? \(pending \?\? current\) : marked/.test(nav)
      && /const on = i === shown/.test(nav))

  console.log("\n  and the menu changes nothing about the bar")

  check("analytics is the fourth slot",
    /\{ key: "analytics", label: "Analytics", href: "\/app\/analytics"/.test(nav)
      && !/\{ key: "settings"/.test(strip(nav)))
  check("and settings is a circle to the LEFT of the bar while the menu is open, mirroring the X",
    /aria-label="Settings"/.test(nav) && /right: "100%",\s*\n\s*marginRight: GAP,/.test(nav)
      && /tabIndex=\{menuOpen \? 0 : -1\}/.test(nav))
  check("out of the flow, with the group sliding half its width to stay centred",
    /transform: `translateX\(\$\{menuOpen \? \(BAR_H \+ GAP\) \/ 2 : 0\}px\)`/.test(nav),
    "animating a width would relayout the row on every frame of the open")

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
