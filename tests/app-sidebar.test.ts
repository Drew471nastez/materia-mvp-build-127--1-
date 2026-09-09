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
   */
  const nested = [...navSource.matchAll(/^[ \t]+(?:const|function)\s+([A-Z]\w*)\s*[=(]/gm)].map((m) => m[1])
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
 *   type       15px / 24px, tracked -0.01em, weight 450 resting, 550 active
 *   resting    #666666 on transparent
 *   active     #202020 on #e8e8e8
 *   icon       20×20 box, two 20×20 glyphs stacked, cross-faded on opacity
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
     * to 400 or 500 and the step to the active 550 is four times what it
     * should be — 450→550 is one hundred units, 400→500 is the same distance
     * only because both ends have moved to the wrong place.
     */
    /const REST_WEIGHT = 450/.test(navSource) &&
      /const ACTIVE_WEIGHT = 550/.test(navSource) &&
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
      navSource.match(/<Icon\s+size=\{20\}/g)?.length === 2 &&
      !/size=\{active/.test(navSource),
  )
  check(
    "the fill arrives rather than appears",
    /**
     * A Phosphor weight is a DIFFERENT PATH — `d` changes entirely between
     * regular and fill — and no CSS can interpolate one path into another.
     * Swapping the prop therefore snaps: outline on one frame, solid on the
     * next, which is what "not smooth" meant.
     *
     * So both weights are rendered into the same 20×20 box and cross-faded on
     * opacity, the one property that CAN animate here.
     */
    /weight="regular"\s+data-variant="outline"/.test(navSource) &&
      /weight="fill"\s+data-variant="filled"/.test(navSource) &&
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
        /icon: PhosphorIcon/.test(shellSource)
      )
    })(),
  )
  check(
    "the icon of the row you are on is filled",
    /**
     * Lucide could not do this, which is why the sidebar is the one place in
     * the app that uses Phosphor. Lucide's icons are strokes rather than
     * shapes — reading the path data, `store` has four open subpaths,
     * `package` three — and filling an open path paints the region it implies
     * rather than the glyph.
     */
    /@phosphor-icons\/react/.test(navSource) && /weight="fill"/.test(navSource),
  )
  check(
    "and a resting one is drawn about fifteen per cent heavier",
    /**
     * Phosphor strokes nothing — every weight is a filled path describing the
     * shape, `regular` included — so there is no stroke-width to raise, and
     * its own weights jump straight from regular to bold. A 2.4 stroke of the
     * icon's own colour over a 16-unit outline adds 1.2 to each side of every
     * edge: that outline plus fifteen per cent.
     */
    /\[data-nav-icon\] svg\[data-variant="outline"\] path \{\s*stroke: currentColor;\s*stroke-width: 2\.4;/.test(navSource) &&
      /data-nav-icon=\{active \? "filled" : "outline"\}/.test(navSource),
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
    "both unavailable tools use the same row",
    (navSource.match(/<ComingSoonItem/g) ?? []).length === 2 &&
      /label=\{communitiesLabel\}/.test(navSource),
  )
}

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed > 0) {
  console.log("Failing:", failures.join(", "))
  process.exit(1)
}
