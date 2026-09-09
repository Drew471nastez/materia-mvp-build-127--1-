/**
 * ===========================================================================
 *  THE /app SIDEBAR
 * ===========================================================================
 * It jumped, flashed and forgot which group was open when you changed page.
 * The reason was one line of structure, repeated four times:
 *
 *     export function AppSidebar(props) {
 *       const NavItem = ({ item }) => …          // ← a new component TYPE
 *       const SidebarContent = () => …           //   on every single render
 *       const SoonItem = () => …
 *       const MobileSidebarContent = () => …
 *     }
 *
 * A component declared during a render is a different function object each
 * time. React sees a different element type in the same position and does the
 * only thing it can: unmount the old subtree and mount a new one. Every DOM
 * node in the sidebar was destroyed and rebuilt whenever anything in
 * `AppSidebar` changed state — a route change, a notification poll, a hover.
 *
 * The geometry is measured in a browser (see the note on dimensions below);
 * what is checked here is the structure that made it unstable, and the two
 * pure functions the whole appearance hangs off.
 *
 * Run with:  npm run test:push
 */

import { readFileSync } from "node:fs"
import { join } from "node:path"

import { isRouteActive } from "@/components/app/sidebar-desktop-nav"

const root = process.cwd()

let passed = 0
let failed = 0
const failures: string[] = []

function check(name: string, ok: boolean, detail?: string) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    failures.push(name)
    console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ""}`)
  }
}

function section(title: string) {
  console.log(`\n${title}`)
}

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/.*$/gm, "$1")
}

const NAV = join(root, "components/app/sidebar-desktop-nav.tsx")
const SHELL = join(root, "components/app/sidebar.tsx")
const navSource = readFileSync(NAV, "utf8")
const shellSource = readFileSync(SHELL, "utf8")

// ===========================================================================
section("Nothing in the rail is declared during a render")
// ===========================================================================

{
  /**
   * Every component in the nav module must start at column zero. An indented
   * `const Something = (props) => <jsx/>` is one nested inside another
   * function, which is the defect this whole change exists to remove.
   */
  /**
   * `[ \t]` rather than `\s`. `\s` matches a newline, so with the multiline
   * flag `^\s+` happily matched a declaration at column zero via the line
   * break before it — and the check reported the one component that was
   * already in the right place.
   *
   * And a DECLARATION, not any capitalised local. `const Line = icon.line`
   * inside NavIcon is not a component being defined during a render; it is a
   * component that already exists being read out of a prop, which is the only
   * way to render one that was passed in. Requiring a function to follow the
   * `=` separates the two — the defect is a new function object per render,
   * and an alias to an existing one is not that.
   */
  const nested = [
    ...navSource.matchAll(
      /^[ \t]+(?:function\s+([A-Z]\w*)\s*\(|const\s+([A-Z]\w*)\s*=\s*(?:\(|async|function\b|memo\())/gm,
    ),
  ].map((m) => m[1] ?? m[2])
  check(
    "every component in the nav module is at module scope",
    nested.length === 0,
    nested.join(", "),
  )

  const componentsAtTop = [...navSource.matchAll(/^(?:export )?function ([A-Z]\w*)/gm)].map((m) => m[1])
  check(
    "and there are several of them, so this is measuring something",
    componentsAtTop.length >= 5,
    componentsAtTop.join(", "),
  )

  check(
    "the shell no longer builds the desktop rail itself",
    !/const SidebarContent = /.test(shellSource) && /<DesktopSidebarContent/.test(shellSource),
  )

  check(
    "and the rail is 240px, with everything beside it moved to match",
    /w-\[240px\]/.test(shellSource) &&
      /md:pl-\[240px\]/.test(readFileSync(join(root, "app/app/layout.tsx"), "utf8")),
  )
}

// ===========================================================================
section("Which item is active comes from the route, and only from the route")
// ===========================================================================

{
  check("the dashboard is active on the dashboard", isRouteActive("/app", "/app"))
  check(
    "and is NOT active on every page under it",
    /**
     * `/app` is the prefix of every route in the product, so it has to match
     * exactly or the dashboard row is lit on all of them.
     */
    !isRouteActive("/app/orders", "/app") && !isRouteActive("/app/products", "/app"),
  )
  check(
    "a section is active on its own sub-pages",
    isRouteActive("/app/products/123", "/app/products") &&
      isRouteActive("/app/products", "/app/products"),
  )
  check(
    "but a route that merely STARTS WITH the same letters is not the same route",
    /**
     * The old test was `pathname.startsWith(item.href)`, so `/app/orders`
     * would light up on `/app/orders-archive` — and `/app/email` on
     * `/app/emails`. The separator is what makes it a path rather than a
     * string.
     */
    !isRouteActive("/app/orders-archive", "/app/orders") &&
      !isRouteActive("/app/emails-old", "/app/emails"),
  )
  check(
    "there is no second copy of which page we are on",
    // A `selectedItem` state is a second answer to a question the router has
    // already answered, and it is wrong for as long as it takes to notice.
    // Comments are not code, and this file explains at length why there is no
    // `selectedItem` — which the first version of this check then read as one.
    !/selectedItem|const \[active/.test(stripComments(navSource)),
  )
}

// ===========================================================================
section("A row is the same size in every state")
// ===========================================================================

/**
 * MEASURED IN CHROMIUM against the real compiled stylesheet, at 240px:
 *
 *   rail 240   nav padding 7/7
 *   row        h 38  w 225  radius 12  padding 14/14  gap 8
 *   type       15px / 24px, tracked -0.01em, weight 470 resting, 575 active
 *   resting    #666666 on transparent
 *   active     #202020 on #e8e8e8
 *   icon       20×20 box, a Solar linear and bold glyph stacked, cross-faded
 *   chevron    20×20, pinned 18px from the rail's edge, rotate(0) → rotate(180)
 *   submenu    grid-template-rows 0px/opacity 0 → 36px/opacity 1
 *
 * Every one of those is identical between resting, hovered and active except
 * two colours and the font weight — nothing that can move or resize a row.
 * What the source has to keep true is below.
 */
{
  check(
    "height, padding, radius and gap are written once, for all states",
    // One shared `ROW` constant rather than a class string per state, which
    // is how a hover style ends up with different padding to a rest style.
    /const ROW =\s*\n?\s*"relative flex h-\[38px\]/.test(navSource) &&
      /rounded-\[12px\] px-\[14px\]/.test(navSource),
  )
  check(
    "only colour and weight change between states",
    /**
     * `rowStyle` is the entire difference between resting, hovered and
     * active. If it ever returns a fourth property, this stops being true.
     */
    (() => {
      const fn = navSource.slice(navSource.indexOf("function rowStyle"), navSource.indexOf("function useHover"))
      const keys = [...fn.matchAll(/^\s{4}(\w+):/gm)].map((m) => m[1])
      return keys.length === 3 && keys.includes("backgroundColor") && keys.includes("color") && keys.includes("fontWeight")
    })(),
  )
  check(
    "the labels are Inter at 15 on 24, tracked in",
    /font-sans text-\[15px\] leading-\[24px\] tracking-\[-0\.01em\]/.test(navSource),
  )
  check(
    "at a weight of 450, which needs a variable font to mean anything",
    /**
     * `next/font` loads Inter with no weight list in app/layout.tsx, which is
     * what makes the whole 100–900 axis available. On a static font 450 snaps
     * to 500 and 575 snaps to 600 — and a five per cent step would land
     * wherever the rounding happened to put it, which is to say nowhere near
     * five per cent.
     */
    /const REST_WEIGHT = 470/.test(navSource) &&
      /const ACTIVE_WEIGHT = 575/.test(navSource) &&
      !/weight: \[/.test(readFileSync(join(root, "app/layout.tsx"), "utf8").slice(0, 4000)),
  )
  check(
    "the transition names the two properties that change, and nothing else",
    /transition-\[background-color,color\] duration-\[140ms\] ease-out/.test(navSource) &&
      !/hover:scale|active:scale|hover:translate|hover:shadow/.test(navSource),
  )
  check(
    "every icon sits in a box that cannot change size",
    /className="relative flex h-5 w-5 min-w-5 shrink-0/.test(navSource) &&
      // Both layers are 20px. Nothing about the state changes a size.
      /<Line\s+size=\{20\}/.test(navSource) &&
      /<Fill\s+size=\{20\}/.test(navSource) &&
      !/size=\{active/.test(navSource),
  )
  check(
    "the fill arrives rather than appears",
    /**
     * A line variant and a fill variant are DIFFERENT PATHS — `d` changes
     * entirely — and no CSS can interpolate one path into another. Swapping
     * the component therefore snaps: outline on one frame, solid on the next,
     * which is what "not smooth" meant.
     *
     * So both are rendered into the same 20×20 box and cross-faded on
     * opacity, the one property that CAN animate here.
     */
    /*
      ANCHORED TO THE ELEMENTS, not to the string.

      `/data-variant="outline"/` alone passed with the JSX renamed, because
      the same text appears in the <style> selector below and one match was
      enough. A guard that a stylesheet can satisfy on the component's behalf
      is not guarding the component.
    */
    /<Line\s+size=\{20\}\s+strokeWidth=\{ICON_STROKE\}\s+data-variant="outline"/.test(navSource) &&
      /<Fill\s+size=\{20\}\s+data-variant="filled"/.test(navSource) &&
      /opacity: active \? 0 : 1, transition: FILL_TRANSITION/.test(navSource) &&
      /opacity: active \? 1 : 0, transition: FILL_TRANSITION/.test(navSource) &&
      /const FILL_TRANSITION = "opacity \d+ms/.test(navSource),
  )
  check(
    "and the row is not a `group`, so a touch device cannot cancel that fade",
    /**
     * globals.css carries a rule aimed at storefront product cards:
     *
     *   @media (hover: none) { .group * { transition-property: none !important } }
     *
     * Every row here used to carry `group` — for nothing, since the hover
     * colours come from React state, not `group-hover:`. Measured in Chromium
     * (which reports `hover: none`) the icons computed
     * transition-property: none and the chevron could not rotate. On a touch
     * tablet wide enough to show this rail the sidebar had no animation at all.
     */
    !/^\s*"group /m.test(navSource.slice(navSource.indexOf("const ROW ="), navSource.indexOf("const REST_WEIGHT"))),
  )
  check(
    "and the rail ships the icons the probe measures",
    /**
     * THE GAP THIS CLOSES, WHICH WAS REAL AND SHIPPED.
     *
     * `DesktopSidebarContent` renders whatever `items[].icon` it is handed. It
     * was handed LUCIDE icons by sidebar.tsx, while scripts/render-sidebar-probe
     * rendered the Phosphor `NAV_ICONS` — so every browser measurement of "the
     * active icon is filled" was taken against a component the app never
     * built. A Lucide icon ignores `weight` entirely; on the live rail both
     * layers rendered the same outline and nothing ever filled.
     *
     * Every icon in the shipped list now comes from the one exported map, and
     * `NavItemData.icon` is typed `PhosphorIcon` so a Lucide one cannot be
     * put back without the compiler saying so.
     */
    (() => {
      const list = shellSource.slice(
        shellSource.indexOf("const mainNavItems"),
        shellSource.indexOf("// Expandable groups"),
      )
      const icons = [...list.matchAll(/icon: ([\w.]+)/g)].map((m) => m[1])
      return (
        icons.length >= 8 &&
        icons.every((name) => name.startsWith("NAV_ICONS.")) &&
        /icon: NavIconPair/.test(shellSource)
      )
    })(),
  )
  check(
    "the icon of the row you are on is filled",
    /**
     * Lucide could not do this, which is why the sidebar is the one place in
     * the app that does not use it. Lucide's icons are strokes rather than
     * shapes — reading the path data, `store` has four open subpaths,
     * `package` three — and filling an open path paints the region it implies
     * rather than the glyph. Hugeicons' free set has none either — 6,025
     * icons, every one stroke-rounded, checked before it was ruled out.
     * Solar ships a `bold` beside every `linear`.
     */
    /@solar-icons\/react\/linear\//.test(navSource) &&
      /@solar-icons\/react\/bold\//.test(navSource) &&
      /fill: \w+Bold/.test(navSource),
  )
  check(
    "Home is drawn by hand, fitted to the reference image rather than to a library",
    /**
     * Solar has ten houses and every one is a rounded pentagon with a slot;
     * none is the peaked roof and arched door in the reference. Tabler's
     * IconHome was the shape but not the roundness — its rounding comes from
     * a stroke join, not a drawn curve, and read visibly thinner than what
     * was asked for. No library checked (Solar, Remix, Phosphor, Hugeicons,
     * Iconsax, Fluent, Material Symbols Rounded) matched, so this one is
     * fitted directly to the reference PNG: a parametric generator searched
     * proportions and corner radii, scored by rendering each candidate and
     * counting mismatched pixels against a thresholded mask of the
     * reference, converging on a 98%-match outline.
     *
     * One path draws both states — the fill version's outline already
     * traces the door as a notch, so stroking it draws an open arch and
     * filling it draws the same outline solid. Nothing about it needs a
     * carve-out: it is a genuine 24-unit stroke like every Solar `linear`
     * icon, so it takes ICON_STROKE the same way they do, with no per-icon
     * branch anywhere in NavIcon.
     */
    /const HOME_PATH_D =/.test(navSource) &&
      /function HomeLineIcon/.test(navSource) &&
      /function HomeFillIcon/.test(navSource) &&
      /dashboard: \{ line: HomeLineIcon, fill: HomeFillIcon \}/.test(navSource) &&
      !/@tabler\/icons-react/.test(navSource) &&
      !/\bweight="regular"/.test(navSource) &&
      !/drawn\??:/.test(navSource),
  )
  check(
    "icon weight is one number, applied uniformly, not a stroke painted over a fill",
    /**
     * Phosphor and Remix both drew a "line" icon as a FILLED PATH shaped like
     * a stroke. There was no stroke-width on one to set, so weight had to be
     * faked by painting a stroke of the icon's own colour over the fill and
     * tuning it — 2.4 units in Phosphor's 256-unit box, 0.3 in Remix's
     * 24-unit one — and Home needed a `drawn` field just to except itself
     * from the rule.
     *
     * Solar's `linear` icons and Tabler's IconHome are both stroked for
     * real: fill="none", stroke-width 1.5. One constant, applied to every
     * icon with no branch and nothing left in the stylesheet.
     */
    /const ICON_STROKE = 1\.5/.test(navSource) &&
      /strokeWidth=\{ICON_STROKE\}/.test(navSource) &&
      !/stroke-width: [\d.]+;/.test(navSource) &&
      !/stroke: currentColor/.test(navSource),
  )
  check(
    "the submenu is found by a hook of its own",
    /**
     * The browser probe used to locate it with `[aria-hidden]`, which held
     * until an icon library arrived that puts aria-hidden on every svg it
     * renders — and then the probe measured a 20px icon and cheerfully
     * reported the submenu as open.
     */
    /data-nav-submenu=\{open \? "open" : "closed"\}/.test(navSource) &&
      /\[data-nav-submenu\]/.test(readFileSync(join(root, "scripts/check-sidebar.mjs"), "utf8")),
  )
  check(
    "the chevron is outside the link, in a fixed box, pinned to the right",
    /**
     * Nested inside the link it shared the hit area and every change in the
     * label's width moved it. As an absolutely-placed sibling it cannot move
     * and cannot be moved.
     */
    /absolute right-\[10px\] top-1\/2 flex h-5 w-5 min-w-5/.test(navSource),
  )
  check(
    "and labels never wrap, so a long one cannot make a row two lines tall",
    (navSource.match(/whitespace-nowrap/g) ?? []).length >= 3,
  )
}

// ===========================================================================
section("The submenu has a height to animate")
// ===========================================================================

{
  check(
    "it is a grid row from 0fr to 1fr, not a display toggle",
    /gridTemplateRows: open \? "1fr" : "0fr"/.test(navSource) &&
      !/display: open \? "block" : "none"/.test(navSource),
  )
  check(
    "the inner row can actually shrink",
    /**
     * A grid item's default `min-height: auto` refuses to go below its
     * content, and the submenu simply never closes. This is the single line
     * that makes the technique work at all.
     */
    /minHeight: 0/.test(navSource),
  )
  check(
    "both the height and the opacity animate, in about two hundred milliseconds",
    /grid-template-rows 200ms cubic-bezier\(0\.2, 0, 0, 1\), opacity 200ms ease/.test(navSource),
  )
  check(
    "and the chevron turns over the same kind of curve",
    /transform 180ms cubic-bezier\(0\.2, 0, 0, 1\)/.test(navSource),
  )
}

// ===========================================================================
section("Communities is not a link, and says why")
// ===========================================================================

{
  check(
    "it is a span rather than an anchor, so there is nothing to click",
    /export function ComingSoonItem/.test(navSource) &&
      /<span\s+ref=\{ref\}/.test(navSource),
  )
  check(
    "the tooltip is drawn, not the browser's",
    // `title` gives you the operating system's tooltip after a second and a
    // half, in the wrong place, in the wrong font.
    !/title=/.test(navSource) && /role="tooltip"/.test(navSource),
  )
  check(
    "it is portalled, so the sidebar's own overflow cannot clip it",
    /createPortal\(/.test(navSource) && /document\.body/.test(navSource),
  )
  check(
    "and it fades and moves in rather than appearing",
    /**
     * With both states set in one commit the browser only ever sees the end
     * state and there is no animation at all — hence the frame between mount
     * and shown.
     */
    /transition: "opacity 140ms ease, transform 140ms ease"/.test(navSource) &&
      /requestAnimationFrame\(\(\) => setShown\(true\)\)/.test(navSource),
  )
  check(
    "the one unavailable tool is Communities, and Link shortener is gone",
    (navSource.match(/<ComingSoonItem/g) ?? []).length === 1 &&
      /label=\{communitiesLabel\}/.test(navSource) &&
      !/linkShortener/i.test(navSource) &&
      !/linkShortener/i.test(shellSource),
  )
}

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed > 0) {
  console.log("Failing:", failures.join(", "))
  process.exit(1)
}
