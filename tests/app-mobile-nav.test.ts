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
  /* Whole pages, not their frames: with no loading boundary under /app an
     ordinary prefetch of a dynamic page brings back almost nothing. */
  check("and the shell warms the bar's routes, whole",
    /onPrefetch=\{\(href\) => \{[\s\S]{0,120}?prefetchAppPage\(router, href\)/.test(shell)
      && /for \(const item of items\) onPrefetch\(item\.href\)/.test(nav)
      && /router\.prefetch\(href, \{ kind: "full" \}/.test(read("lib/ui/app-navigation.ts")))
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

  check("the phone's scroll container is padded for it, by the pill's own room",
    /@media \(max-width: 767px\) \{\s*\n\s*html\.app-layout \.app-content-scroll \{\s*\n\s*padding-bottom: var\(--app-nav-room\);/.test(css)
      && /--app-nav-top: calc\(var\(--app-nav-bar\) \+ var\(--app-nav-lift\)\);/.test(css)
      && /--app-nav-room: calc\(var\(--app-nav-top\) \+ 40px\);/.test(css))
  check("the pill clears the home indicator",
    /--app-nav-lift: max\(4px, env\(safe-area-inset-bottom, 0px\)\);/.test(css)
      && /const PILL_LIFT = "var\(--app-nav-lift\)"/.test(nav)
      && /paddingBottom: `calc\(\$\{PILL_LIFT\}\)`/.test(nav))
  /*
    NO COPY OF THE PILL'S HEIGHT ANYWHERE. It was 104px written out four
    times in globals.css, 116px in the menu page and 80px under the Android
    exit toast, for a bar that has since changed size twice. Every one of
    them reads the pill's variables now.
  */
  check("and nothing holds a copy of the pill's room: every rule reads the one variable",
    !/calc\(104px \+ env\(safe-area-inset-bottom/.test(css)
      && (css.match(/padding-bottom: var\(--app-nav-room\);/g) ?? []).length === 4
      && /paddingBottom: "calc\(var\(--app-nav-room\) \+ 12px\)"/.test(nav) && !/116px/.test(strip(nav))
      && /bottom: "calc\(var\(--app-nav-top\) \+ 16px\)"/.test(back))
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
    /\.app-content-scroll:has\(> \.page-scroll, > \.dashboard-scroll-container, > \.sales-scroll-container, > \.orders-stage\) \{\s*\n\s*padding-bottom: 0;/.test(css),
    "padding the outer box only shrinks the inner one and holds the page away from the bar")
  check("and put on the one that does",
    /\.app-content-scroll > \.page-scroll,\s*\n\s*html\.app-layout \.app-content-scroll > \.dashboard-scroll-container,\s*\n\s*html\.app-layout \.app-content-scroll > \.sales-scroll-container,[\s\S]{0,300}?html\.app-layout \.app-content-scroll > \.orders-stage > \.orders-pane \{\s*\n\s*padding-bottom: var\(--app-nav-room\);/.test(css))
  /*
    ORDERS SCROLLS IN TWO PANES, the list and the order open over it
    (app/app/orders/orders-client.tsx). Neither is the stage's direct child
    scroller, so each carries the clearance itself; the stage, which does not
    scroll, carries none.
  */
  check("Orders' two panes each get the clearance, the stage none",
    (() => {
      const client = read("app/app/orders/orders-client.tsx")
      const panes = client.match(/className="orders-pane [^"]*overflow-y-auto/g) ?? []
      return /className=(?:"|\{cn\(")orders-stage [^"]*h-full overflow-hidden/.test(client) && panes.length === 2
    })())
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
      for (const f of ["components/app/dashboard-client.tsx"]) {
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

  /*
    A SHEET COVERS THE PILL. The page wrapper's fade-in filled forwards, which
    kept every page a stacking context for good, so a bottom sheet inside a
    page (Analytics' period picker, any page's own sheet) was drawn under the
    navigation pill whatever its z-index. Measured in Chromium with the real
    CSS: the pill won the point under it with \`both\`, the sheet with
    \`backwards\`.
  */
  check("the page's fade-in does not hold on its last frame, so a sheet inside a page covers the pill",
    /\.app-page-enter \{\s*animation: app-page-enter [^;]*backwards;/.test(css) && !/\.app-page-enter \{\s*animation: app-page-enter [^;]*(both|forwards);/.test(css))

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
  check("whose blur ramps from nothing at the outermost to 0.47px at the innermost",
    /const HALO_BLUR = 0\.47/.test(nav)
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
      && /height: `calc\(var\(--app-nav-bar\) \+ \$\{HALO_REACH\.top \+ HALO_REACH\.below\}px \+ \$\{PILL_LIFT\}\)`/.test(nav),
    "tied to the pill's own lift, the halo stopped short of the bottom of the screen")
  check("with the strip under the pill measured in the probe",
    /it covers the strip under the pill, where a home indicator sits/.test(read("scripts/check-app-mobile-nav.mjs"))
      && /past the bottom of the screen, so there is no bare strip/.test(read("scripts/check-app-mobile-nav.mjs")))
  check("with the pill's lift above the screen's bottom read once, by the pill and by the halo",
    /const PILL_LIFT = "var\(--app-nav-lift\)"/.test(nav)
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
  /* "The glass animation circle should feel more like glass, like iOS 2026."
     A clearer fill than the bar with its own blur and saturation, light
     along the top edge, a band of refracted light low inside it, and a soft
     shadow under it. */
  check("and the circle is a lens of glass on the bar: its own blur, light along its top, a soft shadow under it",
    /const DROP = "0 1px 1\.5px rgba\(16,18,27,0\.08\), 0 4px 12px -2px rgba\(16,18,27,0\.14\)"/.test(nav)
      && /const LENS_GLASS = "blur\(8px\) saturate\(180%\)"/.test(nav)
      && /backdropFilter: LENS_GLASS,/.test(nav)
      && /inset 0 1px 0\.5px rgba\(255,255,255,0\.95\)/.test(nav)
      && /background: LENS_LIGHT,/.test(nav) && /radial-gradient\(80% 55% at 50% 4%/.test(nav))

  check("a finger can slide along the bar, and the slot follows it",
    /function useSlide\(/.test(nav) && /onPointerMove: \(e: React\.PointerEvent\) => \{/.test(nav))
  check("the selector is square in its box, which is what makes it a circle",
    /width: "var\(--app-nav-dot\)",\s*\n\s*height: "var\(--app-nav-dot\)",/.test(nav)
      && /--app-nav-dot: calc\(var\(--app-nav-bar\) - var\(--app-nav-pad\) \* 2\);/.test(css))
  check("a tap is a drag of zero length, so the two can never disagree",
    !/onClick=\{\(\) => pick\(/.test(nav) && /: slotAt\(e\.clientX\)/.test(nav))
  /* "Accurate when I land on something": a finger let go while still moving
     means the slot it was heading for. The probe flicks from Home and lets
     go past Products at speed: it lands on Analytics, 0px off its centre. */
  check("and a drag let go at speed picks the slot it was heading for",
    /const PROJECT_MS = 90/.test(nav)
      && /\? slotNearest\(posRef\.current \+ speedRef\.current \* PROJECT_MS\)/.test(nav))
  check("and it ticks once per slot crossed, not once per frame",
    /if \(lastRef\.current !== next\) \{[\s\S]{0,1600}?hapticTap\(first \? "light" : "soft"\)/.test(nav))
  /*
    A DRAG lands, and landing is worth a tick of its own. A TAP already ticked
    at the better moment, when the finger arrived — firing again sixty
    milliseconds later is a stutter, not a second piece of information.
  */
  check("with a second tick when a DRAG lands, and none for a tap that already ticked",
    /if \(dragged\) hapticTap\("light"\)\s*\n\s*onPick\(picked\)/.test(nav))
  /*
    AND EVERY TICK IN THE BAR IS A STEP QUIETER than it was. Medium reads as
    loud on a control you press several times a minute, so the pair moved
    down without losing its shape: light where it was medium, and selection
    feedback — the softest thing the Taptic Engine makes, and the one built
    for moving between options — where it was light.
  */
  /*
    LIGHT IS THE FLOOR, AND THAT IS A PROPERTY OF THE PHONE RATHER THAN A
    CHOICE. These went medium, then light, then soft — and soft turned the bar
    silent. Not broken: soft is selection feedback, and it is so slight that
    on a real device it could not be felt at all. The plugin has Heavy, Medium
    and Light and nothing between Light and selection.

    So a press is Light, and selection feedback is kept for counting slots off
    under a finger that is dragging, where several come in a row and slight is
    exactly right.
  */
  check("a press ticks with the quietest IMPACT, not with selection feedback",
    /hapticTap\(first \? "light" : "soft"\)/.test(nav)
      && !/hapticTap\("medium"\)/.test(strip(nav)),
    "selection feedback is quieter than a thumb can notice: it left the bar silent")
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
  check("a pick is remembered until the route catches up with it, and a navigation from anywhere moves the circle on the press",
    /const marked = slide\.at \?\? pending \?\? heading \?\? current/.test(nav)
      && /const heading = toPath == null \? null : items\.findIndex\(\(i\) => isRouteActive\(toPath, i\.href\)\)/.test(nav)
      && /setPending\(index\)/.test(nav),
    "without this the circle springs back to the page you left and then comes again")
  /*
    The pick used to be dropped after 1500ms on a timer, which brought the
    glitch back for every page slower than that: home at 1.5s, out again on
    landing. It is held for as long as its navigation runs now.
  */
  check("and it is held while its navigation runs, let go of when the route arrives or the navigation ends or goes elsewhere",
    /if \(current === pending\) \{ setPending\(null\); return \}/.test(nav)
      && /if \(heading === pending\) \{ answered\.current = true; return \}/.test(nav)
      && /if \(nav \|\| answered\.current\) \{ setPending\(null\); return \}/.test(nav))
  check("with the timer left only for a pick no navigation record ever answered",
    /window\.setTimeout\(\(\) => setPending\(null\), 1500\)/.test(nav)
      && /\}, \[pending, current, heading, nav\]\)/.test(nav))
  check("a circle with no slot to sit on fades where it stands",
    /const restRef = useRef\(0\)/.test(nav) && /if \(marked >= 0\) restRef\.current = marked/.test(nav),
    "reading its position as slot zero would send it flying home as it shrank")

  /*
    Two jobs, two mechanisms. Under a finger it is where the finger is, every
    frame, with no transition to be a delay and no slot to be a step: the
    90ms hop from slot to slot was "very snappy, very direct, landing on it,
    not smooth at all". Let go of it and it springs to the slot.
  */
  /* One to one now: it closed 72% of the gap a frame and leaned 22% into the
     slot, which left it a few pixels off a moving finger. The probe reads it
     0px from the finger at the median once the pick up is over. */
  check("under a finger the circle is where the finger is, one to one, with no transition",
    !/const FOLLOW =/.test(nav) && !/MAGNET/.test(strip(nav))
      && /targetRef\.current = leftFor\(clientX\)/.test(nav)
      && /const next = targetRef\.current \+ offsetRef\.current/.test(nav)
      && /offsetRef\.current \*= Math\.pow\(CATCH_UP, dt \/ 16\.7\)/.test(nav)
      && /frameRef\.current = requestAnimationFrame\(step\)/.test(nav)
      && /transition: `\$\{NO_TRAVEL\}, \$\{LIFT_EASE\}, transform 0s,/.test(nav),
    "a transition under the finger is a delay; a slot under the finger is a step")
  check("written straight to the element by the loop, and never by a style prop",
    /dot\.style\.translate = `\$\{Math\.round\(posRef\.current \* 100\) \/ 100\}px 0`/.test(nav)
      && /dot\.style\.translate = `\$\{x\}px 0`/.test(nav)
      && !/translate: `/.test(strip(nav)) && !/transform: `translateX\(\$\{x\}px\)/.test(strip(nav)),
    "a position prop would fight the loop, or on the lift be a string React already rendered and never written")
  check("a render happens when the slot changes, not on every move",
    /if \(lastRef\.current !== next\) \{[\s\S]{0,900}?setAt\(next\)/.test(nav)
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
    /const slotLeft = \(index: number, g: Geometry\): number =>\s*\n\s*Math\.round\(\(g\.pad \+ index \* g\.slot \+ \(g\.slot - g\.dot\) \/ 2\) \* 100\) \/ 100/.test(nav)
      && /const leftForSlot = \(index: number\): number => slotLeft\(index, geoRef\.current\)/.test(nav)
      && /const x = slide\.geometry \? slotLeft\(restSlot, slide\.geometry\) : null/.test(nav)
      && /const leftFor = /.test(nav),
    "a second piece of arithmetic for the same number is how the press and the rest drift apart")
  check("and the press is a press again as soon as the finger lifts",
    /movedRef\.current = false/.test(nav) && (nav.match(/movedRef\.current = false/g) || []).length >= 2,
    "left set, the next tap would be treated as a continuing drag")

  /*
    A DRAG that begins during a spring picks the circle up from where it is
    drawn, rather than from where it was going. A PRESS has nothing to pick
    up: it does not animate, so there is no halfway to catch it at.
  */
  check("and a drag beginning during a spring picks the circle up from where it is drawn",
    /stopSettle\(\)\s*\n\s*const drawn = drawnAt\(\) \?\? leftFor\(clientX\)/.test(nav)
      && /offsetRef\.current = drawn - leftFor\(clientX\)/.test(nav)
      && /getComputedStyle\(dot\)\.translate/.test(nav))
  /* Let go, it lands on a spring that starts at the finger's speed: sampled
     into keyframes the compositor plays, ending on the slot's exact centre
     because the resting style is that same number. Probe: 0px off the slot,
     0.5px past it, still 239ms after a flick. */
  check("it springs onto the slot from the finger's speed, on the compositor, and lifts on another property",
    !/const SETTLE =/.test(nav) && /const SPRING = \{ stiffness: 520, damping: 34 \}/.test(nav)
      && /function settleSpring\(from: number, speed: number, to: number, dot: number, drop: Drop = /.test(nav)
      && /dot\.style\.translate = `\$\{to\}px 0`\s*\n\s*dot\.style\.transform = ""/.test(nav)
      && /const a = dot\.animate\(frames, \{ duration: ms, easing: "linear" \}\)/.test(nav)
      && /const LIFT = 1\.04/.test(nav) && /slide\.following \? LIFT : 1/.test(nav)
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
    AND THE SOLID GLYPH IS DRAWN AT THE OUTLINE'S SIZE. They are not drawn the
    same size — a stroke reaches half a stroke past its path where a solid
    stops at it, and three of the four are separate drawings from the icon set
    besides — so filling an icon in made it SHRINK, about half a pixel on
    every edge. That is the little bump on the icon you press.

    Because the two boxes are the same size, no blend of them is a different
    size either, so the cross-fade has nothing left to change but the ink
    inside the outline.

    TWO OTHER WAYS OF DOING THIS ARE WRONG and this is the guard against them:
    drawing the outline over the solid in both states, and giving the solid
    its own stroke. Both close up the gaps the solid is drawn WITH, because a
    stroke runs along every contour a shape has, including the ones cut out of
    its middle, and the receipt goes out as a dark blob. The first shipped.
  */
  check("the solid glyph is drawn at the size of the outline it replaces",
    /const FILL_MATCH = 1\.06/.test(nav) && /scale: String\(FILL_MATCH\)/.test(nav),
    "filling an icon in shrank it by half a pixel on every edge: the bump on the icon you press")
  check("and neither glyph is overdrawn with the other, which closes the gaps it is drawn with",
    !/<Line size=\{size\} strokeWidth=\{1\.5\} style=\{\{ position: "absolute", inset: 0 \}\} \/>/.test(nav)
      && !/<Fill[\s\S]{0,200}stroke="currentColor"/.test(nav),
    "the receipt went out as a dark blob the one time this was got wrong")
  check("and the scale is a constant, not something that animates",
    !/transition:[^\n]*scale/.test(nav) && !/scale 1[0-9]{2}ms/.test(strip(nav)),
    "a scale that animates is the bump this is meant to remove")
  /*
    AND THEY ARE NOT BLENDED. Matching the boxes fixed the two ENDS and the
    icon still moved in between them: fade two different drawings through each
    other and every frame of the fade is a shape that is neither. Products
    measured 40x40 going in, 40x39 halfway, 39x38 coming out, and putting the
    fade back makes the probe catch 32 readings part way between the two.

    Nothing about the layout moves during any of it — button, glyph box and
    both glyphs measure zero every frame of a press — so the movement was only
    ever the ink. A state with no duration cannot be seen moving.
  */
  /*
    THE FILL IS THE ONE THE SIDEBAR HAS. This block has now said three
    different things, and the history is the point rather than clutter.

    FIRST it held the glyph to changing over while the box around it was
    dimmed to a quarter. That hid the swap between two drawings that are not
    the same shape, and put a fade on every press: "too much fade and
    cheapness in the click".

    THEN it held the glyph to swapping OUTRIGHT, in one frame, since a blend
    of two different drawings is a shape that is neither — Products measured
    40x40 going in, 40x39 halfway, 39x38 coming out. A single frame was the
    last hard edge in the bar, so THEN it held the two to being CLIPPED
    against each other, a band of ink opening from the centre line with the
    outline drawn twice outside it, the three exact complements at every
    moment.

    That shipped, was looked at, and was rejected: ink travelling out of the
    middle of a glyph is a gesture, and the icon reads as performing rather
    than as being on. What was asked for instead is the fill the DESKTOP
    SIDEBAR has — both variants stacked and cross-faded, nothing moving.

    So the rule is now the plainest of the four: the phone's bar renders the
    same two elements the sidebar does, with the sidebar's own transition
    imported rather than restated. A second constant holding the same
    intention is the one that drifts when either is tuned.
  */
  check("the glyph cross-fades, the way the desktop sidebar's does",
    /opacity: active \? 0 : 1/.test(nav) && /opacity: active \? 1 : 0/.test(nav)
      && /transition: FILL_TRANSITION/.test(nav),
    "the band that opened from the middle of the glyph read as a gesture rather than as a state")
  check("and it uses the sidebar's transition rather than a copy of the number",
    /FILL_TRANSITION,/.test(nav) && /from "@\/components\/app\/sidebar-desktop-nav"/.test(nav)
      && /export const FILL_TRANSITION = `opacity \$\{FILL_MS\}ms \$\{FILL_CURVE\}`/.test(read("components/app/sidebar-desktop-nav.tsx")),
    "two constants for one intention is the second one going stale")
  /*
    NOTHING IS LEFT OF THE BAND. Its six inset() constants and the two-piece
    outline were load-bearing for each other — a band that is not exactly
    complemented leaves a stripe showing both drawings or neither — so half of
    it surviving a later edit would be worse than either whole design.
  */
  check("and no part of the clipped band is left behind",
    !/INK_NONE|INK_ALL|ABOVE_ALL|ABOVE_NONE|BELOW_ALL|BELOW_NONE/.test(nav)
      && !/outline-above|outline-below/.test(nav) && !/clipPath/.test(nav),
    "a band half removed leaves a stripe of both drawings or of neither")
  /*
    AND NOTHING DIPS. The rule that survived all three rewrites: the glyph
    must never dim out and come back. A cross-fade is not that — one arrives
    exactly as fast as the other leaves, and FILL_MATCH keeps them in one box
    so the pair never goes light or changes size. A DIP is a wait, however
    short it is made, and it lands on the press.
  */
  check("and it does not dim through the change: nothing dips out and comes back",
    !/GLYPH_FLOOR/.test(nav) && !/GLYPH_OUT/.test(nav)
      && !/opacity: dimmed/.test(nav) && !/setDimmed/.test(nav),
    "dipping a thing out and bringing it back is the cheapness, and it lands on the press")
  /*
    AND THE COLOUR TRAVELS WITH THE GLYPH. It was on INK_EASE, 360ms, from
    when the glyph swapped in one frame and the colour was the only thing
    with a duration in it. Against a 160ms cross-fade that is two events: the
    solid arrives, then it darkens for another fifth of a second. INK_EASE
    stays, as the LENS's timing, which is a different thing moving.
  */
  check("and the colour arrives with the fill rather than on the lens's curve",
    /transition: `color \$\{FILL_MS\}ms \$\{FILL_CURVE\}`/.test(nav)
      && !/transition: `color \$\{INK_EASE\}`/.test(nav),
    "one fill, one duration: the glyph must not arrive and then keep darkening")

  /*
    AND THE LENS IS HANDED OVER, NOT THROWN. A press used to send it sliding
    across the bar, and that slide was the reported glitch: it overshot the
    slot and came back by an amount that depended on how fast you tapped.
    Taking it out left it teleporting, which is correct and reads as abrupt.

    So it dips almost out of sight, is put down on the new slot while it is
    faint, and comes back up. The eye follows a dissolve rather than a
    journey, and there is no journey to be caught halfway through, to
    overshoot, or to land a pixel out. Measured: it is 0.21 visible on the
    frame its position changes, and comes back to 1.

    Out is quicker than in, because the dip starts the instant a finger lands
    and so has to keep up with the touch, while the arrival does not.
  */
  /*
    THE LENS DOES NOT FADE EITHER, and this pair of checks is turned round
    from what it said before for the same reason as the glyph above. It used
    to hold the lens to dipping almost out of sight, moving while faint, and
    coming back — which covered the change of place and put a fade on every
    press.

    There is none now. On the frame the finger lands the lens is on the icon
    under it, at full strength, and the change of place is in the open. That
    costs nothing: it does not travel, so there is no path to follow, and it
    does not fade, so there is no flicker to catch. Measured at 17ms from the
    touch, never below full opacity.
  */
  /*
    AND ITS GLASS ARRIVES RATHER THAN APPEARING. With the fades gone the lens
    was simply THERE, at full strength, on the frame the finger landed, and
    that is what reads as too direct: the only thing in the bar taking any
    time at all was the ink filling the icon.

    It is not dipped back out to fix that. A dip is a thing going away and
    coming back, on an element that was already where it belonged, and that
    flicker is the cheapness. This is the other kind of change and the one the
    reference button makes: a colour going from one value to another, once, in
    one direction. The lens carries no colour on the frame it changes slot —
    which is also what hides the change of place — and its glass comes in over
    the ink's curve.

    ITS OPACITY NEVER MOVES, which is what keeps this from being the fade that
    was thrown out, and is asserted separately below. Measured: emptied to 0,
    filled back to 0.82 over 17 steps, changing slot on the empty frame.
  */
  check("the lens's glass empties for the frame it changes slot, and fills back over the ink's curve",
    /const ARRIVING_FILL = "rgba\(255,255,255,0\)"/.test(nav)
      && /backgroundColor: arriving \? ARRIVING_FILL : slide\.pressed \? PRESS_FILL : REST_FILL/.test(nav)
      && /setArriving\(true\)/.test(nav) && /setFilling\(true\)/.test(nav),
    "a lens switched on at full strength is the directness; a lens dipped out and back is the flicker")
  check("and an arrival outranks the press's instant for as long as it lasts",
    /arriving \|\| \(slide\.pressed && !filling\) \? PRESS_ON : `background-color \$\{INK_EASE\}, box-shadow \$\{INK_EASE\}`/.test(nav)
      && /const INK_MS = 360/.test(nav),
    "both are background-color on one element, and the press's instant was switching the glass on rather than filling it")
  check("the lens does not fade or dip: it is simply on the icon you pressed",
    !/HANDOFF_FLOOR/.test(nav) && !/HANDOFF_OUT/.test(nav) && !/setVeiled/.test(nav)
      && /opacity: marked < 0 \? 0 : 1,/.test(nav),
    "a dip is a wait however short it is, and it lands on the press")
  check("and its position is written on the frame its glass is empty, in one step",
    /const lay = \(\) => \{ dot\.style\.translate = `\$\{x\}px 0`; laidAt\.current = restSlot \}/.test(nav)
      && /if \(!arriving\) \{ setArriving\(true\); return \}\s*\n\s*if \(slide\.motion\.current\.settlingTo\(\) != null\) slide\.motion\.current\.stopSettle\(\)\s*\n\s*lay\(\)/.test(nav))
  check("while a released drag still springs into the slot",
    /if \(slide\.bounce\) \{ slide\.motion\.current\.settleTo\(x\); laidAt\.current = restSlot; return \}/.test(nav),
    "a drag is not what was called abrupt, and the bounce was asked for")

  /*
    AND THE BAR ANSWERS A FINGER. Every moving thing was taken out of a press
    one at a time, and the last of them left a control that does nothing when
    you touch it. So the lens brightens under one: no size, no position,
    nothing that can be a pixel out of place.

    THE SHAPE OF IT IS THE POINT. The old lift eased IN over 200ms and a tap
    lasts about sixty, so it was cut off at a different point every time,
    which is why a press looked like a different amount of something on every
    press and read as a glitch. Full on the frame the finger lands, eased only
    on the way off, is the same press whether it is held for a frame or a
    second. Measured: on in 0s, off over 0.26s, 0px wider while held.
  */
  check("the lens brightens under a finger, and that is the whole of the answer",
    /const PRESS_FILL = "rgba\(255,255,255,0\.9\)"/.test(nav)
      && /const REST_FILL = "rgba\(255,255,255,0\.72\)"/.test(nav)
      && /backgroundColor: arriving \? ARRIVING_FILL : slide\.pressed \? PRESS_FILL : REST_FILL/.test(nav),
    "a control that does nothing at all when touched is what taking every moving thing out left behind")
  check("and it goes on instantly and comes off eased, never the other way round",
    /const PRESS_ON = "background-color 0s, box-shadow 0s"/.test(nav)
      && /arriving \|\| \(slide\.pressed && !filling\) \? PRESS_ON/.test(nav),
    "easing IN is what made the old lift a different amount on every press, because a tap interrupts it")
  check("and nothing geometric reads the press at all",
    !/scale: String\([^)]*slide\.pressed/.test(nav)
      && !/slide\.pressed \? (LIFT|NO_TRAVEL|SETTLE)/.test(nav),
    "size and position are the two things that were reported as bumping")
  check("a tap is one tick, at the moment of contact",
    /hapticTap\(first \? "light" : "soft"\)/.test(nav)
      && /if \(dragged\) hapticTap\("light"\)/.test(nav),
    "light going down and medium coming up, sixty milliseconds apart, is a stutter rather than a tick")

  /*
    AND A PRESS DOES NOT TRAVEL. "When I click on the icon, make sure that it
    doesn't bump, scale, or do any of the movements left and right." A finger
    sliding along the bar still carries the circle with it and still bounces
    it into place on release — that gesture was asked for and is untouched.
    A press is not that gesture: the circle is on the icon that was pressed,
    on the frame it was pressed. Measured in the probe as the number of
    places it was seen in between the two slots, which is zero.
  */
  check("a press puts the circle on the icon rather than sending it across the bar",
    /const NO_TRAVEL = "translate 0s"/.test(nav)
      && /transition: `\$\{NO_TRAVEL\}, /.test(nav) && !/SETTLE : NO_TRAVEL/.test(nav),
    "a journey across the bar on every press is the movement that was reported")
  check("and the frame loop is only ever started by a finger that is dragging",
    /if \(movedRef\.current\) \{[\s\S]{0,260}?targetRef\.current = leftFor\(clientX\)\s*\n\s*wake\(\)\s*\n\s*\}/.test(nav)
      && /posRef\.current = null/.test(nav),
    "a loop that runs on a press is a journey with frames in it, whatever the transition says")

  check("and the lift belongs to a finger that is dragging, not to one that has landed",
    /const \[following, setFollowing\] = useState\(false\)/.test(nav)
      && /setFollowing\(true\)/.test(nav)
      && /scale: String\(marked < 0 \? 0\.55 : slide\.following \? LIFT : 1\)/.test(nav)
      && !/slide\.dragging \? LIFT/.test(strip(nav)),
    "a tap holds nothing, so growing the circle under one is movement for no reason")
  check("and every gesture starts as a press, and is promoted only if a finger travels",
    /setFollowing\(false\)\s*\n\s*setBounce\(false\)/.test(nav)
      && /movedRef\.current = true[\s\S]{0,700}?setFollowing\(true\)/.test(nav),
    "left over from the last gesture, the first tap after a drag would lift and bounce")
  check("and only a released drag animates at all",
    /settleTo/.test(nav) && /if \(slide\.bounce\) \{ slide\.motion\.current\.settleTo\(x\)/.test(nav)
      && !/LAND/.test(strip(nav)),
    "a spring on a press is a journey across the bar that nobody asked for")
  check("the finger is known from a ref, not from state a render behind",
    /if \(!activeRef\.current\) return/.test(nav) && !/if \(!dragging\) return/.test(strip(nav)))
  /*
    THE GLYPHS HOLD STILL WHILE THE CIRCLE MOVES. Cross-fading four glyphs on
    every slot the circle crossed is what read as "icons glitch, scale
    randomly, jumpy". The fill follows what has been committed; the lens
    follows the finger.
  */
  check("the glyphs follow the committed slot, not the finger",
    /const shown = slide\.following \? \(pending \?\? heading \?\? current\) : marked/.test(nav)
      && /const on = i === shown/.test(nav))

  console.log("\n  and the menu changes nothing about the bar")

  check("analytics is the fourth slot",
    /\{ key: "analytics", label: "Analytics", href: "\/app\/analytics"/.test(nav)
      && !/\{ key: "settings"/.test(strip(nav)))
  check("and settings is a circle to the LEFT of the bar while the menu is open, mirroring the X",
    /aria-label="Settings"/.test(nav) && /right: "100%",\s*\n\s*marginRight: "var\(--app-nav-gap\)",/.test(nav)
      && /tabIndex=\{menuOpen \? 0 : -1\}/.test(nav))
  check("out of the flow, with the group sliding half its width to stay centred",
    /transform: `translateX\(\$\{menuOpen \? "calc\(\(var\(--app-nav-bar\) \+ var\(--app-nav-gap\)\) \/ 2\)" : "0px"\}\)`/.test(nav),
    "animating a width would relayout the row on every frame of the open")

  check("the hamburger's lines have a little more air between them",
    /style=\{line\(open \? 8\.2 : 3\.2\)\}/.test(nav) && /style=\{line\(open \? 8\.2 : 13\.2\)\}/.test(nav) && /height: gx\(1\.6\)/.test(nav),
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

  console.log("\nThe bar, this round")
  /*
    "Reduce the overall size of the pill by 4%, adapted for every phone since
    2015." The design numbers are the last round's (63, 58, 4, 8, 22) times
    0.96, in globals.css and nowhere else; the pill draws them times
    --app-nav-px, which follows the screen's width; and where the engine can
    round, each lands on a whole pixel so the icons do not shift as they fill.
    scripts/check-app-mobile-nav-widths.mjs measures 320 to 430 a pixel at a
    time: 60 by 232 from 390 up, 50 by 190 at 320, nothing off the screen.
  */
  {
    const n = (name: string) => Number((css.match(new RegExp(`--app-nav-${name}-n: ([\\d.]+);`)) ?? [])[1])
    check("4% smaller: every design number is the one before it times 0.96",
      n("bar") === 60.48 && n("slot") === 55.68 && n("pad") === 3.84 && n("gap") === 7.68 && n("glyph") === 21.12,
      `bar ${n("bar")}, slot ${n("slot")}, pad ${n("pad")}, gap ${n("gap")}, glyph ${n("glyph")}`)
    check("and the pill has no copy of them: it draws only the variables",
      !/const (BAR_H|SLOT|PAD|DOT|GAP|GLYPH) = /.test(nav)
        && /height: "var\(--app-nav-bar\)",\s*\n\s*width: "var\(--app-nav-width\)",\s*\n\s*padding: "var\(--app-nav-pad\)",/.test(nav)
        && (nav.match(/width: "var\(--app-nav-bar\)", height: "var\(--app-nav-bar\)"/g) ?? []).length === 1
        && /width: "var\(--app-nav-bar\)",\s*\n\s*height: "var\(--app-nav-bar\)",/.test(nav))
    /* The widest the group is (settings, gap, bar, gap, menu) has to fit the screen with 8px a side and 3px for rounding. */
    check("a design pixel is the screen over the widest the group ever is, never more than one real pixel, never so small a tab is under 44px",
      /--app-nav-px: clamp\(\s*calc\(44px \/ var\(--app-nav-slot-n\)\),\s*calc\(\(100vw - 19px\) \/ \(var\(--app-nav-bar-n\) \* 2 \+ var\(--app-nav-gap-n\) \* 2 \+ var\(--app-nav-slot-n\) \* var\(--app-nav-tabs\) \+ var\(--app-nav-pad-n\) \* 2\)\),\s*1px\s*\);/.test(css))
    const tabs = (nav.match(/const TABS = \[([\s\S]*?)\] as const/)?.[1].match(/\{ key: "/g) ?? []).length
    check("and the CSS counts the same four tabs the bar draws", tabs === 4 && Number((css.match(/--app-nav-tabs: (\d+);/) ?? [])[1]) === tabs,
      `the bar has ${tabs}, the CSS says ${(css.match(/--app-nav-tabs: (\d+);/) ?? [])[1]}`)
    check("each length on a whole pixel where the engine can round, the padding on a half, the icons at 19px or more",
      /@supports \(width: round\(1\.5px, 1px\)\) \{/.test(css)
        && /--app-nav-bar: round\(calc\(var\(--app-nav-px\) \* var\(--app-nav-bar-n\)\), 1px\);/.test(css)
        && /--app-nav-slot: round\(calc\(var\(--app-nav-px\) \* var\(--app-nav-slot-n\)\), 1px\);/.test(css)
        && /--app-nav-pad: round\(calc\(var\(--app-nav-px\) \* var\(--app-nav-pad-n\)\), 0\.5px\);/.test(css)
        && /--app-nav-glyph: round\(max\(19px, calc\(var\(--app-nav-px\) \* var\(--app-nav-glyph-n\)\)\), 1px\);/.test(css))
    check("the lens is placed from the bar as drawn, measured, never from a second copy of the numbers",
      /pad: Number\.parseFloat\(getComputedStyle\(bar\)\.paddingLeft\)/.test(nav)
        && /slot: Number\.parseFloat\(getComputedStyle\(tab\)\.width\)/.test(nav)
        && /dot: Number\.parseFloat\(getComputedStyle\(lens\)\.width\)/.test(nav)
        && /new ResizeObserver\(read\)/.test(nav))
    check("every tab's box is the whole column a press lands in",
      /left: `calc\(var\(--app-nav-pad\) \+ var\(--app-nav-slot\) \* \$\{i\}\)`,\s*\n\s*top: 0,\s*\n\s*width: "var\(--app-nav-slot\)",\s*\n\s*height: "var\(--app-nav-bar\)",/.test(nav))
    const widths = read("scripts/check-app-mobile-nav-widths.mjs")
    check("and the probe measures it at 320, 360, 375, 390, 393, 414 and 430, and every width between",
      /"320,360,375,390,393,414,430"/.test(widths) && /for \(let w = 320; w <= 430; w\+\+\)/.test(widths)
        && /nav-\$\{w\}-closed\.png/.test(widths) && /Emulation\.setSafeAreaInsetsOverride/.test(widths))
  }
  check("5% more blur in the glass", /backdropFilter: "blur\(25px\) saturate\(120%\)"/.test(nav))
  /* Stretched along the way it moves, by its smoothed speed, to at most
     about 1.12 wide with the lift: the probe reads 1.068 on a slow slide and
     1.104 on a flick. */
  check("under a finger the lens stretches with its speed, like a drop, never past about 1.12",
    /const STRETCH_MAX = 0\.08/.test(nav) && /const STRETCH_AT = 0\.6/.test(nav)
      && /scale\(\$\{Math\.round\(\(1 \+ d\) \* 1000\) \/ 1000\}, \$\{Math\.round\(\(1 - d \* 0\.5\) \* 1000\) \/ 1000\}\)`/.test(nav)
      && /drop\.d = Math\.max\(-SQUASH_MAX, Math\.min\(STRETCH_MAX, drop\.d \+ drop\.dv \* dt\)\)/.test(nav)
      && /speedRef\.current \+= \(\(next - posRef\.current\) \/ dt - speedRef\.current\) \* blend/.test(nav))
  /* "Make the glassy bubble a bit more fluid, like a drop of water stretching slightly in the drag direction and settling." The stretch has a small underdamped spring of its own, leans the way it goes, and runs on into a slight squash when the finger stops; the probe reads 0.994x narrowest after a slow slide, and 1x at rest. */
  check("the stretch is a drop with a body: its own soft spring, leaning the way it goes, a slight squash as it stops, settling round",
    /const DROP_SPRING = \{ stiffness: 420, damping: 9 \}/.test(nav) && /const SQUASH_MAX = 0\.03/.test(nav) && /const DROP_LEAD = 0\.2/.test(nav)
      && /stepDrop\(dropRef\.current, speedRef\.current, dt\)/.test(nav) && /translateX\(\$\{lead\}px\) scale\(/.test(nav))
  check("and rounds off again on the spring as it lets go, the drop's own spring riding along", /dotRef\.current\.style\.transform = ""/.test(nav) && /transform: dropStyle\(drop, dot\)/.test(nav) && /stepDrop\(drop, v \/ 1000, dt \* 1000\)/.test(nav))
  /* "Make tapping an icon feel a touch more satisfying (subtle press scale/spring, nothing big)." One fixed animation from the touch, the same every tap, on the glyph's own `scale`, never the lens. */
  check("a tapped icon gives a little and springs back: one fixed 420ms pulse on its own scale, 0.9 then 1.03, the lens untouched",
    /const TAP_PULSE: Keyframe\[\] = \[/.test(nav) && /\{ scale: "0\.9", offset: 0\.2/.test(nav) && /\{ scale: "1\.03", offset: 0\.6/.test(nav) && /const TAP_PULSE_MS = 420/.test(nav)
      && /const a = glyph\.animate\(TAP_PULSE, \{ duration: TAP_PULSE_MS \}\)/.test(nav) && /pulse\(index\)/.test(nav) && /prefers-reduced-motion: reduce\)"\)\.matches\) return\s*for \(const a of glyph\.getAnimations\(\)\)/.test(nav))
  /* "When I release a button and move to the next one, exactly at that moment
     the button icon glitches and moves a little bit." Two causes: in the
     native shell a:active dimmed the icon under the finger to 72% and put it
     back on the lift; and a glyph was put on a layer of its own only while
     it faded, so it was drawn on another pixel grid for that fade. The probe
     reads every glyph's box across a press, a slide and a release: 0px. */
  check("the pill's icons do not dim under a finger in the native shell",
    /html\.capacitor \[data-app-nav-pill\] nav a:active \{\s*opacity: 1;\s*\}/.test(read("app/globals.css")))
  check("and each glyph is on a layer of its own for good, the solid drawn at its matched size rather than scaled",
    /willChange: "opacity"/.test(nav) && /size=\{layer \? size \* FILL_MATCH : size\}/.test(nav)
      && /<NavIcon icon=\{item\.icon\} active=\{on\} color="currentColor" box=\{GLYPH_BOX\} layer \/>/.test(nav))
  check("all of it measured in the probe: tracking, landing, stretch, and the icons holding still",
    /THE GLASS UNDER A FINGER, EVERY FRAME, IN THE NATIVE SHELL/.test(read("scripts/check-app-mobile-nav.mjs"))
      && /no icon moves, not by half a pixel/.test(read("scripts/check-app-mobile-nav.mjs")))

  /* "The pill's buttons don't work at all, it takes me somewhere weird." The
     app search keeps its panel in the page while closed; it said
     aria-modal="true" all the time, the pill read that as a modal being up
     and turned its buttons off, and every tap went through to the page. */
  {
    const search = read("components/app/app-search.tsx")
    const css = read("app/globals.css")
    check("the search panel says it is a modal only while it is open, and is hidden and inert while closed",
      /aria-modal=\{open \? "true" : undefined\}/.test(search) && /aria-hidden=\{open \? undefined : "true"\}/.test(search) && /inert=\{!open\}/.test(search)
        && !/^\s*aria-modal="true"\s*$/m.test(search))
    /* ... nor the shared sheet's own root (data-sheet-root), which says it is up on <html> instead of through :has()
       (components/ui/bottom-sheet.tsx showSheetState; scripts/check-app-sheets-frames.mjs). */
    check("and the pill never counts a dialog that says it is hidden",
      (css.match(/\[role="dialog"\]\[aria-modal="true"\]:not\(\[data-mobile-menu\], \[aria-hidden="true"\], \[data-sheet-root\]\)\) \[data-app-nav-pill\]/g) ?? []).length === 2
        && !/\[aria-modal="true"\]:not\(\[data-mobile-menu\]\)\)/.test(css))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) { console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`); process.exit(1) }
}
main()
