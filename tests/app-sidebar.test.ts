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

import { untt } from "./i18n-source"
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
const navSource = untt(readFileSync(NAV, "utf8"), NAV)
const shellSource = untt(readFileSync(SHELL, "utf8"), SHELL)

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
    "and the rail is 240px, or 63 collapsed, one width (--app-rail-w) with everything beside it moved to match",
    /w-\[var\(--app-rail-w,240px\)\]/.test(shellSource) &&
      /md:pl-\[var\(--app-rail-w,240px\)\]/.test(untt(readFileSync(join(root, "app/app/layout.tsx"), "utf8"), "app/app/layout.tsx")) &&
      /RAIL_OPEN_PX = 240/.test(readFileSync(join(root, "lib/ui/app-rail.ts"), "utf8")),
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
    "a row whose address has a query lights on its path with those params showing",
    /**
     * Settings › Integrations and each integration under it are
     * /app/settings?tab=integrations[&integration=…]: the whole href was
     * compared to the path, so they never lit.
     */
    isRouteActive("/app/settings", "/app/settings?tab=integrations", "tab=integrations&integration=meta-pixel") &&
      isRouteActive("/app/settings", "/app/settings?tab=integrations&integration=meta-pixel", "tab=integrations&integration=meta-pixel") &&
      !isRouteActive("/app/settings", "/app/settings?tab=integrations&integration=ga4", "tab=integrations&integration=meta-pixel") &&
      !isRouteActive("/app/settings", "/app/settings?tab=integrations", "tab=general") &&
      !isRouteActive("/app/settings", "/app/settings?tab=integrations") &&
      !isRouteActive("/app/orders", "/app/settings?tab=integrations", "tab=integrations"),
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
    "only colour, weight and a faint shadow change between states",
    /**
     * `rowStyle` is the entire difference between resting, hovered and
     * active. If it ever returns a fourth property, this stops being true.
     */
    (() => {
      const fn = navSource.slice(navSource.indexOf("function rowStyle"), navSource.indexOf("function useHover"))
      const keys = [...fn.matchAll(/^\s{4}(\w+):/gm)].map((m) => m[1])
      /* Changed on purpose (round U): the active row has a faint depth too, a shadow that moves and resizes nothing. */
      return keys.length === 4 && keys.includes("backgroundColor") && keys.includes("color") && keys.includes("fontWeight") && keys.includes("boxShadow")
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
      /* Inter's own call: Roboto beside it loads one weight on purpose, for community card titles only. */
      !/Inter\(\{[^}]*weight:/.test(untt(readFileSync(join(root, "app/layout.tsx"), "utf8"), "app/layout.tsx")),
  )
  check(
    /* Changed on purpose (round U): the active row's faint shadow eases with its colours. */
    "the transition names the three properties that change, and nothing else",
    /transition-\[background-color,color,box-shadow\] duration-\[140ms\] ease-out/.test(navSource) &&
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
      /*
        THE CONSTANT IS NOW BUILT FROM TWO PARTS, AND EXPORTED.

        It was the literal `"opacity 160ms cubic-bezier(...)"`. The phone's
        bar was asked to feel like this one, so it imports this transition
        rather than restating the number, and it needs the duration and the
        curve separately as well — the glyph's colour has to travel with the
        fill, and that is a `color` transition, not an `opacity` one.

        What this line guards is unchanged: the fill is an opacity animation
        with a real duration on it, not a swap.
      */
      /export const FILL_MS = \d+/.test(navSource) &&
      /export const FILL_CURVE = "cubic-bezier\(/.test(navSource) &&
      /export const FILL_TRANSITION = `opacity \$\{FILL_MS\}ms \$\{FILL_CURVE\}`/.test(navSource),
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
        icons.every((name) => name.startsWith("NAV_ICONS.") || name.startsWith("NAV_ICONS_EXTRA.")) &&
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
    "Home is Lucide's plain House glyph, not a bespoke shape",
    /**
     * Fitted to a reference image once already — a bespoke silhouette,
     * converged on by measuring pixel mismatch against a screenshot. Told
     * that result was still wrong and to make it simple and basic, the fix
     * was not a smaller radius on the same shape; a hand-drawn silhouette
     * reads as designed no matter how its corners are tuned. Home is the
     * exact geometry `lucide-react`'s `House` ships now, the same icon every
     * other surface in this app already uses.
     *
     * Two paths, not one — Lucide draws the roof-and-walls as a closed
     * contour and the door as a separate, deliberately UNCLOSED rectangle
     * (three sides only, which is what makes it read as a slot when
     * stroked). The outline layer strokes both, matching Lucide exactly.
     * The filled layer closes the door subpath and renders both paths as
     * ONE path with fill-rule="evenodd" — checked in Chromium with
     * isPointInFill (scripts/check-sidebar.mjs), because "some shape has a
     * real fill" reads identically whether the door is a hole or painted
     * solid over. Two separate `<path>` elements, each filled on its own,
     * was the first attempt and drew a solid black window instead of a
     * hole: fill-rule only relates contours sharing one path's `d`.
     */
    /const HOME_ROOF_D =/.test(navSource) &&
      /const HOME_DOOR_D = "M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/.test(navSource) &&
      /function HomeLineIcon/.test(navSource) &&
      /function HomeFillIcon/.test(navSource) &&
      /dashboard: \{ line: HomeLineIcon, fill: HomeFillIcon \}/.test(navSource) &&
      /fillRule="evenodd"/.test(navSource) &&
      /\$\{HOME_ROOF_D\} \$\{HOME_DOOR_D\}z/.test(navSource) &&
      !/@tabler\/icons-react/.test(navSource) &&
      !/\bweight="regular"/.test(navSource) &&
      !/drawn\??:/.test(navSource),
  )
  check(
    "Website is a browser window, OnePage a phone of buttons, Payouts a bag of money",
    /**
     * "Change the Website icon... what does a globe have to do with OnePage?
     * OnePage is basically Linktree... Payouts: what is a wallet? It should
     * be more money related." And then: "the payouts icon should actually be
     * like payouts: a bag, like cash, not that dollar thing."
     *
     * Website: Solar's window-frame, a title bar and a page split in two.
     * Payouts: a sack tied at the neck with a $ on it, drawn here to Solar's
     * rules (Solar's own "money bag" is a briefcase), where Solar's banknote
     * read as a dollar bill. Its fill is the same bag solid with the tie and
     * the $ cut out through a mask, the outline's own $ path. OnePage: drawn
     * on Solar's own smartphone outline with three solid pills in it, the
     * stacked buttons of a link in bio; the fill is the same phone with the
     * pills cut out through one evenodd path, as Home's is. No globe, no
     * monitor, no card and no banknote is left in the rail.
     * scripts/check-nav-icons.mjs rasterises all of them side by side.
     */
    /websiteBuilder: \{ line: WebsiteBuilderLinear, fill: WebsiteBuilderBold \}/.test(navSource) &&
      /import \{ WindowFrameIcon as WebsiteBuilderLinear \} from "@solar-icons\/react\/linear\/window-frame"/.test(navSource) &&
      /import \{ WindowFrameIcon as WebsiteBuilderBold \} from "@solar-icons\/react\/bold\/window-frame"/.test(navSource) &&
      /payouts: \{ line: PayoutsLineIcon, fill: PayoutsFillIcon \}/.test(navSource) &&
      /function PayoutsLineIcon/.test(navSource) &&
      /function PayoutsFillIcon/.test(navSource) &&
      /<path d=\{PAYOUTS_DOLLAR_D\} stroke="#000"/.test(navSource) &&
      /<g mask=\{`url\(#\$\{cut\}\)`\} fill="currentColor">/.test(navSource) &&
      !/banknote/.test(navSource.replace(/\/\*[\s\S]*?\*\//g, "")) &&
      /onepage: \{ line: OnePageLineIcon, fill: OnePageFillIcon \}/.test(navSource) &&
      /const ONEPAGE_PHONE_D =\s*"M4 10C4 6\.22876/.test(navSource) &&
      /<path d=\{ONEPAGE_PHONE_D\} stroke="currentColor" strokeWidth=\{strokeWidth\} \/>/.test(navSource) &&
      /<path d=\{`\$\{ONEPAGE_PHONE_D\} \$\{ONEPAGE_BUTTONS_D\}`\} \/>/.test(navSource) &&
      !/react\/(linear|bold)\/(global|monitor|card|wallet)"/.test(navSource),
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
      /\[data-nav-submenu\]/.test(untt(readFileSync(join(root, "scripts/check-sidebar.mjs"), "utf8"), "scripts/check-sidebar.mjs")),
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
    /* Changed on purpose (round AK: a softer open, 260ms, and a quicker close, 220ms, the rows fading a touch ahead of the height) */ /grid-template-rows 260ms cubic-bezier\(0\.22, 1, 0\.36, 1\), opacity 220ms ease-out 40ms/.test(navSource) && /grid-template-rows 220ms cubic-bezier\(0\.4, 0, 0\.2, 1\), opacity 140ms ease-in/.test(navSource),
  )
  check(
    "and the chevron turns over the same kind of curve",
    /transform 180ms cubic-bezier\(0\.2, 0, 0, 1\)/.test(navSource),
  )
}

// ===========================================================================
section("The sidebar advertises nothing that does not exist")
// ===========================================================================

/*
  THIS SECTION USED TO CHECK THE COMING-SOON ROW, CAREFULLY.

  There was a "Tools" heading in the sidebar with one row under it,
  Communities, which was not a link and could not be clicked. It had a
  portalled tooltip that faded in over its own frame to explain why. Before
  that the same machinery carried a link shortener.

  All of it is gone, on the owner's instruction. What is worth keeping is
  the rule the removals point at: the sidebar lists pages that exist. A row
  that goes nowhere spends a permanent slot in the one piece of navigation
  every screen has, to say that one day it might do something.

  So the checks now hold the absence, including the machinery — a tooltip
  component with no row to hang off is how the row comes back.
*/
{
  /*
    READ THROUGH stripComments. Every one of these forbids a name, and the
    comment that explains why the name went says the name. The first run of
    this failed on its own note — the file's own record of what was removed
    matched the guard against it coming back. That trap is written down at
    the top of tests/creator-page.test.ts and it caught this file too.
  */
  const nav = stripComments(navSource)
  const shell = stripComments(shellSource)
  check(
    "no row advertises something that is not built yet",
    !/ComingSoonItem|ComingSoonTooltip/.test(nav) && !/coming soon/i.test(nav),
  )
  check(
    "and the Tools heading that held the one of them is gone with it",
    !/toolsLabel|communitiesLabel/.test(nav) &&
      !/toolsLabel|communitiesLabel/.test(shell) &&
      !/linkShortener/i.test(nav) &&
      !/linkShortener/i.test(shell),
  )
  check(
    "and nothing is left in the icon set for a row that no longer exists",
    !/communities/i.test(nav),
  )
}

/* Round AD: Integrations has its own page, always in the sidebar, the installed ones under it with their logos. */
{
  const r = (f: string) => untt(readFileSync(join(root, f), "utf8"))
  const sidebar = r("components/app/sidebar.tsx")
  check("Integrations is always a row, to its own page", /href: "\/app\/integrations",\s*label: "Integrations"/.test(sidebar) && !/if \(installedIntegrations\.length > 0\) \{\s*const at/.test(sidebar))
  check("  each installed one under it, with its own small logo, to its page there", /href: `\/app\/integrations\?integration=\$\{encodeURIComponent\(i\.id\)\}`/.test(sidebar) && /thumb: <MiniMark/.test(sidebar) && /logo: i\.logo \?\? null/.test(r("app/api/store/integrations/installed/route.ts")))
  check("  a row's picture is drawn on desktop and phone alike", /child\.thumb \?/.test(r("components/app/sidebar-desktop-nav.tsx")) && /child\.thumb \?/.test(r("components/app/sidebar-mobile-nav.tsx")))
  /* Changed on purpose (round K4, Andrew: "remove the large Connected heading and horizontal installed section; Installed becomes a pill filter"): yours are the Installed pill, right after All. */
  /* Changed on purpose (round 41): the page hands the directory its first frame read on the server (initial={...}), so the cards never reorder after loading. */
  check("the page: the same directory as Settings, yours under the Installed pill beside All", /<IntegrationsDirectory page(?: initial=\{initial\})? \/>/.test(r("app/app/integrations/integrations-client.tsx")) && !/data-installed-integrations=""/.test(r("components/app/settings/integrations-directory.tsx")) && /\["all", "installed",/.test(r("lib/integrations/directory-order.ts")))
  /* Changed on purpose (round 27): /app/reviews is Storelib Reviews' own page now, not a way to Integrations. */
  check("  links that went to Settings › Integrations open the page", /only="storelib-reviews"/.test(r("app/app/reviews/reviews-client.tsx")) && /door\("\/app\/integrations", "Integrations"\)/.test(r("components/website-builder/website-settings/commerce.tsx")))
}

/*
  Round 31: the collapse toggle is a row above the Upgrade card, always there.
  Changed on purpose (the owner: "I don't like the collapsible one that
  appears on hover. Put the collapse toggle above the 'Upgrade to Pro' card
  in the sidebar, as a line/row. It must not be a hover thing: just an icon
  like Shopify has, always visible, I click it to collapse and click again to
  expand."). Round 30's pins were a 24px handle on the border, hidden until
  the pointer was on the sidebar. scripts/check-sidebar-round31.mjs measures
  it in a browser.
*/
section("The collapse toggle: a row above the Upgrade card, not a hover thing")
{
  const r = (f: string) => untt(readFileSync(join(root, f), "utf8"))
  const nav = stripComments(r("components/app/sidebar-desktop-nav.tsx"))
  const shell = stripComments(r("components/app/sidebar.tsx"))
  const toggle = stripComments(r("components/app/rail-toggle.tsx"))
  const css = r("app/globals.css")
  const at = (re: RegExp) => nav.search(re)
  check("the shell no longer hangs a handle on the sidebar's border", !/RailToggle/.test(shell) && !/-right-\[12px\]/.test(toggle))
  /*
    Changed on purpose (round 32): the owner, on round 31's row with
    "Collapse" beside it: it must not look like a button row, just the icon,
    like Shopify's. These pinned the row's geometry, its hover fill and the
    word; now they pin a bare icon whose colour alone answers the pointer.
  */
  check("  it is in the sidebar's foot, before the Upgrade card and Settings",
    at(/<RailToggle rest=\{REST_TEXT\} hover=\{HOVER_TEXT\} \/>/) > at(/<\/nav>/) &&
      at(/<RailToggle /) < at(/data-upgrade-card=""/) &&
      at(/data-upgrade-card=""/) < at(/href="\/app\/settings"/))
  check("  a bare icon: no word, no background or border, the icon in the icon column, only its colour on hover",
    /className="ml-\[8px\] flex h-8 w-8 items-center justify-center rounded-\[8px\] bg-transparent /.test(toggle) &&
      /style=\{\{ color: hovered \? hover : rest \}\}/.test(toggle) &&
      /data-nav-icon="outline" className="relative flex h-5 w-5 min-w-5 shrink-0/.test(toggle) &&
      !/data-nav-label/.test(toggle) && !/rowClassName|paint\(/.test(toggle) && !/>Collapse</.test(toggle))
  check("  collapsed, nothing in the sidebar can be scrolled sideways: labels clip their own text, the layer clips without a scroll box",
    /\[data-rail-aside\] \[data-nav-label\] \{\s*min-width: 0;\s*overflow: hidden;\s*overflow: clip;\s*\}/.test(css) &&
      /<div className="absolute inset-0 overflow-clip">/.test(shell))
  check("  named, with aria-expanded, aria-controls and the shortcut",
    /aria-label=\{label\}/.test(toggle) && /aria-expanded=\{open\}/.test(toggle) && /aria-controls="app-rail"/.test(toggle) && /aria-keyshortcuts=/.test(toggle) && /toggleAppRail\(\)/.test(toggle))
  check("  nothing in the CSS hides it or brings it out on hover",
    !/\[data-rail-toggle\]/.test(css) && !/\[data-rail-aside\]:hover/.test(css))
  check("  the 240ms curve the sidebar and the page share is unchanged",
    /--rail-ms: 240ms;/.test(css) && /--rail-ease: cubic-bezier\(0\.2, 0, 0, 1\);/.test(css))
  check("  the card's breathing room folds with it, so collapsed the toggle sits over Settings like a row",
    /<div className="space-y-\[2px\] px-\[7px\] pb-\[calc\(0\.75rem\+env\(safe-area-inset-bottom,_0px\)\)\]">/.test(nav) &&
      /<div data-rail-fold="">\s*<div>\s*<div className="py-2">\s*<Link\s+href=\{UPGRADE_HREF\}/.test(nav))
}

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed > 0) {
  console.log("Failing:", failures.join(", "))
  process.exit(1)
}
