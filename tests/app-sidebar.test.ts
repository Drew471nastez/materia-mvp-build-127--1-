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
 *   type       15px / 20px, weight 400 resting, 500 active
 *   resting    #646464 on transparent
 *   active     #202020 on #e8e8e8
 *   icon       20×20 box, 18×18 glyph, stroke 1.75 resting, 2 active
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
    /const ROW =\s*\n?\s*"group relative flex h-\[38px\]/.test(navSource) &&
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
    "the labels are Inter at 16 on 24, tracked in",
    /font-sans text-\[16px\] leading-\[24px\] tracking-\[-0\.01em\]/.test(navSource),
  )
  check(
    "at a weight of 450, which needs a variable font to mean anything",
    /**
     * `next/font` loads Inter with no weight list in app/layout.tsx, which is
     * what makes the whole 100–900 axis available. On a static font 450 snaps
     * to 400 or 500 and the step to the active 600 is twice what it should be.
     */
    /const REST_WEIGHT = 450/.test(navSource) &&
      /const ACTIVE_WEIGHT = 600/.test(navSource) &&
      !/weight: \[/.test(readFileSync(join(root, "app/layout.tsx"), "utf8").slice(0, 4000)),
  )
  check(
    "the transition names the two properties that change, and nothing else",
    /transition-\[background-color,color\] duration-\[140ms\] ease-out/.test(navSource) &&
      !/hover:scale|active:scale|hover:translate|hover:shadow/.test(navSource),
  )
  check(
    "every icon sits in a box that cannot change size",
    /className="flex h-5 w-5 min-w-5 shrink-0/.test(navSource) &&
      // Size is fixed; only the WEIGHT changes between states.
      /<Icon size=\{20\} weight=\{active \? "fill" : "regular"\} \/>/.test(navSource),
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
    /@phosphor-icons\/react/.test(navSource) && /weight=\{active \? "fill" : "regular"\}/.test(navSource),
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
    /\[data-nav-icon="outline"\] svg path \{\s*stroke: currentColor;\s*stroke-width: 2\.4;/.test(navSource) &&
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
