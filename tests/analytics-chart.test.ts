/**
 * ===========================================================================
 *  THE TWO TREND CHARTS
 * ===========================================================================
 * The analytics trend chart and the dashboard's KPI chart are the same chart
 * written twice, and they had the same four faults.
 *
 * How smoothly they MOVE is measured in a real browser — scripts/check-chart.mjs
 * bundles the analytics one, mounts it in Chromium, drives real mouse events
 * across the plot and counts nodes and DOM mutations. Two numbers from that
 * run are worth carrying here as context for what the source rules below are
 * protecting:
 *
 *     241 svg nodes  →  125
 *     crosshair, active dot and tooltip box teleporting  →  all three glide
 *
 * What is checked here is the source-level shape that produced those numbers,
 * on BOTH charts — the browser probe only ever sees one of them.
 *
 * Run with:  npm run test:push
 */

import { readFileSync } from "node:fs"
import { join } from "node:path"

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

/**
 * CODE ONLY.
 *
 * Every rule below is "this string must not appear", and the comments
 * explaining each fix quote the defect verbatim — `<circle r={0}>`,
 * `isAnimationActive={false}`. Three of these checks failed on their own
 * documentation the first time they ran.
 */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/.*$/gm, "$1")
}

const ANALYTICS = stripComments(readFileSync(join(root, "components/app/analytics-chart.tsx"), "utf8"))
const DASHBOARD = stripComments(readFileSync(join(root, "components/app/dashboard-client.tsx"), "utf8"))
const PAGE = stripComments(readFileSync(join(root, "app/app/analytics/analytics-client.tsx"), "utf8"))
const GLIDE = stripComments(readFileSync(join(root, "components/app/chart-glide.tsx"), "utf8"))
const MORPH = stripComments(readFileSync(join(root, "components/app/chart-morph.tsx"), "utf8"))
const CSS = readFileSync(join(root, "app/globals.css"), "utf8")

/** Both charts, so a fix applied to one and not the other cannot pass. */
const CHARTS: [string, string][] = [
  ["the analytics trend chart", ANALYTICS],
  ["the dashboard KPI chart", DASHBOARD],
]

/**
 * THE RULES WRITTEN IN THE DASHBOARD'S OWN WORDS. The analytics chart no
 * longer carries a private copy of the gesture: it reads the shared one in
 * components/app/use-chart-scrub (with the report cards under it), and its
 * marker is a layer of its own. The same rules are held for it in
 * "The analytics chart reads the shared gesture" below.
 */
const DASHBOARD_ONLY: [string, string][] = [["the dashboard KPI chart", DASHBOARD]]
const HOOK = stripComments(readFileSync(join(root, "components/app/use-chart-scrub.ts"), "utf8"))
const REPORTS = stripComments(readFileSync(join(root, "app/app/analytics/analytics-reports.tsx"), "utf8"))

// ===========================================================================
section("Nothing is drawn that is not seen")
// ===========================================================================

for (const [name, src] of CHARTS) {
  check(
    `${name} draws no invisible dots`,
    /**
     * Both returned `<circle r={0} cx={0} cy={0} fill="none" stroke="none" />`
     * for every point that is neither active nor last — one element per day,
     * per series, painting nothing and reconciled on every render. On the
     * analytics chart that was 120 of its 241 nodes.
     */
    !/r=\{0\}/.test(src) && /return null/.test(src),
  )
}

// ===========================================================================
section("Nothing teleports")
// ===========================================================================

{
  check(
    "the crosshair and the active dot are positioned by a transform",
    /**
     * SVG geometry attributes — x1, cx — cannot be transitioned in CSS. The
     * only way to animate between two positions is to draw at the origin and
     * move the element with `transform`, which is also the only way to get
     * the work onto the compositor.
     */
    /transform: `translateX\(\$\{x\}px\)`/.test(GLIDE) &&
      /transform: `translate\(\$\{props\.cx\}px, \$\{props\.cy\}px\)`/.test(GLIDE) &&
      /transition: GLIDE/.test(GLIDE) &&
      /transform \d+ms/.test(GLIDE),
  )
  check(
    "the cursor keeps the class recharts clones onto it",
    /**
     * Recharts clones the cursor element with its own props, the class
     * `recharts-tooltip-cursor` among them. Dropping it leaves the crosshair
     * unfindable — measured: the browser probe could not locate it at all.
     */
    /className=\{props\.className\}/.test(GLIDE),
  )

  for (const [name, src] of DASHBOARD_ONLY) {
    check(
      `${name} uses them rather than recharts' defaults`,
      /cursor=\{<GlidingCursor \/>\}/.test(src) && /<GlidingActiveDot fill=/.test(src),
    )
    check(
      `and lets ${name}'s tooltip box animate`,
      /**
       * `isAnimationActive={false}` on a Tooltip is exactly what strips the
       * `transition: transform` recharts would otherwise put on the wrapper,
       * so the box jumped between points. It has to be ON, and short.
       */
      !/isAnimationActive=\{false\}/.test(src) && /animationDuration=\{120\}/.test(src),
    )
    check(
      `and ${name}'s touch tooltip moves on the compositor`,
      /**
       * THE RULE, not the expression that used to satisfy it.
       *
       * It animated `left: <n>%`. Left is a layout property: every value a
       * dragging finger produced laid the element out again and repainted it
       * on the main thread — the same thread that was handing recharts a new
       * active index at the time.
       *
       * The position is now a clamp against the card's width, because the
       * old `getClampedLeftPx` divided by the tooltip's own width and read it
       * from a ref that is null on the render which first shows the box — so
       * it clamped by zero and half the tooltip hung outside the card. The
       * rule this check exists for is unchanged: `left` is static and every
       * pixel of movement lives in a promoted transform.
       */
      /left: 0,/.test(src) &&
        !/left: `\$\{[^`]*\}%`/.test(src) &&
        /transform: tooltipShift\(\)/.test(src) &&
        /translateX\(clamp\(/.test(src) &&
        /translateZ\(0\)`$/m.test(src),
    )
  }
}

// ===========================================================================
section("The page cannot re-render the chart for free")
// ===========================================================================

{
  check(
    "the analytics chart is its own module, memoised",
    /**
     * It was declared beside a three-thousand-line component and rendered as
     * a plain child, so every state change on that page — a dropdown, a range
     * button, a poll landing — re-rendered it, and recharts answers a
     * re-render by recomputing every scale, path and dot.
     */
    /export const AnalyticsChartWithTooltip = memo\(AnalyticsChartWithTooltipInner\)/.test(ANALYTICS),
  )
  check(
    "and the props it is given are stable",
    /**
     * A memo is only as good as its inputs. `formatPrice` was a fresh arrow
     * function on every render of the page, which would have defeated the
     * wrapper completely — and it built a new Intl.NumberFormat on every
     * call, for every stat card and every tooltip line.
     */
    /const formatPrice = useCallback\(\(cents: number\) => USD_FORMAT\.format/.test(PAGE) &&
      /^const USD_FORMAT = new Intl\.NumberFormat/m.test(PAGE) &&
      /const chartDisplayData = useMemo\(/.test(PAGE),
  )
}

// ===========================================================================
section("The draw-in does not outstay its welcome")
// ===========================================================================

for (const [name, src] of CHARTS) {
  check(
    `${name} settles in well under a second`,
    /**
     * 1100ms of ease-in-out, staggered out to 180ms across four series, is
     * nearly a second and a half before the chart stops moving — long enough
     * to read as the page being slow rather than as an animation.
     */
    !/animationDuration=\{(?:900|1100)\}/.test(src) && /animationDuration=\{MORPH_MS\}/.test(src)
      && Number(MORPH.match(/export const MORPH_MS = (\d+)/)?.[1] ?? 9999) <= 600,
  )
}

// ===========================================================================
section("A metric tab moves the line, and nothing else moves")
// ===========================================================================
/**
 * "When changing tabs there is no lag, no glitches in the lines, no layout
 * shifts." Measured in Chromium on both charts, every frame of a tab switch:
 * a line on screen in every frame, 35 or more distinct positions of its
 * first point on the way (a morph, not a cut), the plot's left edge and the
 * four grid rows identical before, during and after, and no layout shift.
 * What is held here is the shape that produced those numbers.
 */
for (const [name, src] of CHARTS) {
  check(`${name}: the series keeps its place, so recharts moves it rather than replacing it`,
    name === "the analytics trend chart"
      ? /SLOTS\.slice\(0, slots\)\.map\(\(slot\) => \(\s*<Area\s*key=\{slot\}/.test(src) && !/chartMetricFilter === "orders"\) && \(\s*<Area/.test(src)
      : /dataKey="value"/.test(src))
  check(`${name}: on the iOS curve`, /animationEasing=\{MORPH_EASE as /.test(src))
  check(`${name}: the grid is three intervals on every tab, placed by us`,
    /fixedScale\(/.test(src) && /horizontalPoints=\{/.test(src))
  check(`${name}: the axis numbers cross-fade instead of being swapped`, /<AxisLabels labels=\{axisLabels\}/.test(src) && /tick=\{false\}/.test(src))
  check(`${name}: the dot at the end travels with the line instead of vanishing for the animation`,
    /data-chart-end-dot/.test(src) && /useEndDotMotion\(/.test(src))
}
check("the scale never changes its number of intervals", /export const INTERVALS = 3/.test(MORPH) && /Array\.from\(\{ length: INTERVALS \+ 1 \}/.test(MORPH))
check("the axis numbers fade in and out in the stylesheet, with reduced motion respected",
  /\.chart-axis-in \{ animation: chart-axis-in/.test(CSS) && /prefers-reduced-motion: reduce\) \{\s*\.chart-axis-in, \.chart-axis-out/.test(CSS))
check("a dashboard tab reads nothing: the chart's events are fetched once per period",
  /\}, \[periodKey, creatorId\]\)/.test(DASHBOARD) && /const chartData = \(openKPIModal && chartSeries\?\.\[openKPIModal\]\) \|\| NO_POINTS/.test(DASHBOARD)
    && !/fetchChartData\(openKPIModal\)/.test(DASHBOARD))
check("an analytics tab reads nothing: the metric is not part of the question",
  !/chartMetricFilter/.test(PAGE.slice(PAGE.indexOf("useAnalyticsReports({"), PAGE.indexOf("useAnalyticsReports({") + 300)))

// ===========================================================================
section("The chart keeps the horizontal axis and gives back the vertical one")
// ===========================================================================
/**
 * TOUCH-ACTION IS READ ONCE, AT TOUCHSTART.
 *
 * It began as `tooltipActive ? "none" : "pan-y pinch-zoom"`, and that ternary
 * could not do what it looked like it did: the compositor latches the value
 * when the finger lands and keeps it for the whole gesture, so the "none"
 * branch only ever reached the NEXT touch. That was "hold, untap, tap,
 * slide". A value computed from state the gesture itself sets is always this
 * bug, so the rule is that it is a constant.
 *
 * It was then made a constant "none", which fixed the hold and cost the
 * scroll: the browser will not move a page from a band that has refused
 * every gesture, so the chart moved it by hand, one scrollTop write per
 * touchmove and a requestAnimationFrame loop for the flick. That is a main
 * thread scroll with no momentum the system recognises and no rubber band,
 * inside 200px of a page that scrolls normally everywhere else, and it is
 * what "at some touch scroll it becomes very rigid and hard" describes.
 *
 * The constant is "pan-y" now. The browser scrolls the page and the chart
 * keeps the axis a scrub is actually made of. What holds the hold together
 * is that cancelling a touchmove BEFORE a pan has begun takes the whole
 * gesture, and a hold has by definition not moved — so the checks below are
 * that the value is a constant pan-y, that nothing scrolls the page by hand
 * any more, and that a move is still cancelled the moment the scrub is ours.
 */
for (const [name, src] of DASHBOARD_ONLY) {
  const line = src.match(/touchAction: [^\n]*/)?.[0] ?? "(no touchAction on the chart)"
  check(
    `${name}: touch-action is a constant pan-y`,
    /touchAction: "pan-y"/.test(src) && !/touchAction: \w+ \?/.test(src),
    `found: ${line}`,
  )
  check(
    `${name}: nothing scrolls the page by hand`,
    !/scrollByPx|findScroller|chart-scroll/.test(src.replace(/\/\*[\s\S]*?\*\//g, "")),
    "a hand rolled scroll is back; the browser cannot scroll a band that also scrolls itself",
  )
  check(
    `${name}: no flick loop outliving the finger`,
    !/\bfling\(/.test(src.replace(/\/\*[\s\S]*?\*\//g, "")),
  )
  check(
    `${name}: an active scrub still cancels every move`,
    /if \(tooltipActiveRef\.current\) \{[\s\S]{0,2400}?\n\s*e\.preventDefault\(\)\n\s*e\.stopPropagation\(\)/.test(src),
    "without this the browser can start panning mid scrub",
  )
  /*
    AND A HOLD THAT TURNS INTO A SCROLL LETS GO. The hold fires 100ms after a
    finger lands whether or not that finger is going anywhere, so a thumb
    that starts down the screen slowly opened the tooltip before it had
    travelled far enough to be called a scroll — and every move after that
    was cancelled, so the page did not move at all. Driven by
    scripts/check-dashboard-scroll, which reported 0 of 893 pixels covered.
  */
  check(
    `${name}: unless the hold has turned into a scroll`,
    /if \(!scrubbedRef\.current && outY > SLOP_Y\) \{[\s\S]{0,260}?tooltipActiveRef\.current = false/.test(src)
      && /const SLOP_Y = 12/.test(src),
    "a slow downward drag that lands on the chart would open the tooltip and freeze the page",
  )
  /*
    AND IT ASKS WHAT THE FINGER DID, NOT WHAT THE HOLD INTENDED. The hold
    timer sets the direction lock to "horizontal" the moment it fires, before
    the finger has moved at all, so a guard reading that lock never ran.
  */
  check(
    `${name}: and it reads movement rather than the hold's own optimistic lock`,
    /if \(outX > SLOP_X\) scrubbedRef\.current = true/.test(src)
      && /scrubbedRef\.current = false/.test(src),
    "the direction lock says horizontal after any hold, whether or not anything was scrubbed",
  )
}

// ===========================================================================
section("A hold the platform cannot take away")
// ===========================================================================
/**
 * Two things a phone does that a desktop never does, both measured by
 * scripts/check-chart-scrub.mjs after it was fixed to press the node a finger
 * actually presses rather than the container.
 *
 * REACT REGISTERS touchstart PASSIVELY, so a `preventDefault` inside an
 * `onTouchStart` prop does nothing at all. The listener has to be native and
 * non-passive, and it still does — not to cancel the touchstart, which is
 * the one thing that would refuse the browser's scroll for the whole
 * gesture, but because the touchmove listener registered beside it has to be
 * able to cancel a move once the scrub is ours.
 *
 * The platform's own long-press recogniser is refused by
 * `-webkit-touch-callout: none` and `user-select: none` on the container,
 * which is the tool for that job and does not take the scroll with it.
 *
 * A TOUCH BELONGS TO THE NODE IT STARTED ON, for the whole gesture, and it
 * keeps going there after that node leaves the document — where it reaches
 * nothing, because there is no path up to the listener any more. The probe
 * landed one press on `path.recharts-curve`. Everything lands on the shield
 * now, which is one div, rendered unconditionally, never re-keyed.
 */
for (const [name, src] of DASHBOARD_ONLY) {
  check(
    `${name}: touchstart is native and non-passive`,
    /el\.addEventListener\("touchstart", touchStartHandler, \{ passive: false \}\)/.test(src) &&
      !/onTouchStart=\{handleTouchStart\}/.test(src.slice(src.indexOf("ref={containerRef}"), src.indexOf("ref={containerRef}") + 2000)),
  )
  check(
    `${name}: and the touchstart itself is not cancelled`,
    !/const touchStartHandler = useCallback\(\(e: TouchEvent\) => \{\n\s*e\.preventDefault\(\)/.test(src),
    "cancelling touchstart refuses the browser's scroll for the whole gesture, whatever touch-action says",
  )
  check(
    `${name}: the long press is refused in CSS instead`,
    /WebkitTouchCallout: "none"/.test(src) && /WebkitUserSelect: "none"/.test(src),
  )
  check(
    `${name}: the touches land on one node that never changes`,
    /data-chart-touch-shield/.test(src) && /pointerEvents: isTouchDevice \? "auto" : "none"/.test(src),
  )
}

// ===========================================================================
section("A ref that is used is a ref that is declared")
// ===========================================================================
/**
 * THE ONE THE BUILD CANNOT CATCH.
 *
 * A patch that touched both charts dropped `const lastTouchXRef = useRef(0)`
 * from the analytics one and left the three lines that use it. That is a
 * compile error, and it compiled anyway: next.config.mjs sets
 * `typescript.ignoreBuildErrors`, so a green `pnpm build` proved nothing.
 *
 * What shipped was a chart that threw `lastTouchXRef is not defined` on the
 * first line of every touchstart. The hold timer was never scheduled, and a
 * scrub that did start by dragging froze on the day it began, because every
 * touchmove threw before it could queue a frame. Reading this file against
 * dashboard-client did not find it three times over.
 * scripts/check-chart-scrub.mjs found it on its first run, by pressing the
 * chart. This keeps it found.
 */
for (const [name, src] of CHARTS) {
  /* Strings out too, so a ref named in one is not mistaken for a use. */
  const code = src.replace(/(["'`])(?:\\.|(?!\1)[^\\])*\1/g, '""')
  const used = new Set(code.match(/\b[A-Za-z_$][\w$]*Ref\b/g) ?? [])
  const declared = new Set([
    ...(code.match(/(?:const|let|var)\s+([A-Za-z_$][\w$]*Ref)\b/g) ?? []).map((m) => m.split(/\s+/)[1]),
    /* Types and imports carry the suffix without being variables. */
    ...(code.match(/\b([A-Za-z_$][\w$]*Ref)\s*[,}]/g) ?? []).map((m) => m.replace(/\s*[,}]$/, "")),
  ])
  const missing = [...used].filter((r) => !declared.has(r) && !/^(?:Ref|MutableRefObject|RefObject)$/.test(r))
  check(
    `${name} declares every ref it uses`,
    missing.length === 0,
    missing.length ? `used but never declared: ${missing.join(", ")}` : undefined,
  )
}

// ===========================================================================
section("The analytics chart reads the shared gesture")
// ===========================================================================
/**
 * This section used to compare the analytics chart's private copy of the
 * gesture with the dashboard's, character for character, because two copies
 * drift. The analytics chart has no copy now: it and the report cards under
 * it read components/app/use-chart-scrub, so there is nothing to drift. What
 * is held here is that it stays that way, and that the hook keeps every rule
 * the two copies were compared on.
 *
 * And the reason it moved: "the analytics still don't have the smoothness".
 * The dots were drawn by a function of the active index, so every point a
 * finger crossed re-ran recharts. The plot is its own memoised layer now,
 * blind to the finger, and the marker over it moves by transform.
 */
{
  check("the analytics chart and the report cards read one gesture",
    /useChartScrub<HTMLDivElement>\(indexAt\)/.test(ANALYTICS) && /useChartScrub<HTMLDivElement>\(/.test(REPORTS))
  check("and neither keeps a private copy of it",
    !/addEventListener\("touch/.test(ANALYTICS) && !/addEventListener\("touch/.test(REPORTS))
  check("the analytics chart: touch-action is a constant pan-y",
    /touchAction: "pan-y"/.test(ANALYTICS) && !/touchAction: \w+ \?/.test(ANALYTICS))
  check("the hook: a sideways drag engages sooner than a scroll gives up",
    /const SLOP_X = 8/.test(HOOK) && /const SLOP_Y = 12/.test(HOOK) && /\(dx > SLOP_X \|\| dy > SLOP_Y\)/.test(HOOK))
  check("the hook: vertical has to win clearly to be a scroll",
    /\} else if \(dy > dx \* 1\.4\) \{/.test(HOOK))
  check("the hook: a hold lands in a tenth of a second, where the finger is now",
    /const HOLD_MS = 100/.test(HOOK) && /show\(lastX, true\)/.test(HOOK))
  check("the hook: an active scrub cancels every move",
    /if \(scrubbing\) \{[\s\S]{0,500}?if \(e\.cancelable\) e\.preventDefault\(\)/.test(HOOK))
  check("the hook: unless the hold has turned into a scroll, read from movement",
    /if \(dx > SLOP_X\) moved = true/.test(HOOK) && /if \(!moved && dy > SLOP_Y\) \{[\s\S]{0,120}scrubbing = false/.test(HOOK))
  check("the hook: the touchstart is watched, never cancelled",
    /addEventListener\("touchstart", onStart, \{ passive: true \}\)/.test(HOOK)
      && /addEventListener\("touchmove", onMove, \{ passive: false \}\)/.test(HOOK))
  check("the hook: one tick per point crossed",
    /if \(i !== lastIndex\) \{[\s\S]{0,80}hapticTap/.test(HOOK))
  check("the plot is memoised and blind to the finger",
    /const Plot = memo\(function Plot\(/.test(ANALYTICS) && !/interface PlotProps \{[^}]*(activeIndex|scrub)/.test(ANALYTICS))
  check("the marker moves by transform, and glides once it has been placed",
    /const transition = shown && settled \? GLIDE : "none"/.test(ANALYTICS)
      && /const GLIDE = "transform \d+ms/.test(ANALYTICS)
      && /transform: `translate\(\$\{x\.toFixed\(1\)\}px, \$\{yOf\(/.test(ANALYTICS))
  check("the touches land on one layer that never changes",
    /data-chart-touch-shield/.test(ANALYTICS) && /pointerEvents: "auto"/.test(ANALYTICS))
  check("the long press is refused in CSS",
    /WebkitTouchCallout: "none"/.test(ANALYTICS) && /WebkitUserSelect: "none"/.test(ANALYTICS))
  check("the readout is clamped to the card by its own width, with left static",
    /left: 0,/.test(ANALYTICS) && /transform: shiftFor\(x, track\)/.test(ANALYTICS) && /translateX\(clamp\(/.test(ANALYTICS) && /translateZ\(0\)`$/m.test(ANALYTICS))
}

// ===========================================================================
section("Switching Store and One page redraws once, not twice")
// ===========================================================================
/**
 * The two modes plot different series — Views/Orders/Revenue against
 * Views/Clicks/Subscribers — and `analyticsMode` went straight to the chart.
 * So tapping the other tab swapped the series IMMEDIATELY, while the numbers
 * underneath were still the previous mode's, because the mode is in the
 * fetch's dependencies and the fetch had not returned.
 *
 * One tap therefore drew the chart twice: once with the new lines over the
 * old figures, a shape that never existed, and again when the real ones
 * landed. Recharts re-mounts a series whose key it has not seen, so each of
 * those is a full animation. That is the flashing and the reloading.
 *
 * `trendMode` is the mode the numbers actually are, set in the same commit as
 * the numbers. The tabs still highlight off `analyticsMode`, so the tap feels
 * answered; it is the chart that waits.
 */
{
  const page = stripComments(readFileSync(join(root, "app/app/analytics/analytics-client.tsx"), "utf8"))
  check(
    "the chart is given the mode its data belongs to",
    /analyticsMode=\{trendMode\}/.test(page) && !/analyticsMode=\{analyticsMode\}/.test(page),
  )
  /*
    The mode and the series are now both read off the one answer from the
    server, so they cannot be committed apart: the series is derived from
    `answer`, and so is the mode it is drawn in.
  */
  check(
    "and that mode is the mode of the answer the series is drawn from",
    /const trendMode: AnalyticsMode = answer\?\.mode \?\? analyticsMode/.test(page) &&
      /const trendData = useMemo<TrendData\[\]>\(\(\) => \{\s*if \(!answer\) return \[\]/.test(page),
  )
  check(
    "the tabs still answer the tap immediately",
    /analyticsMode === mode \? "bg-white/.test(page),
  )
}

// ===========================================================================
section("One bottom sheet, and the finger moves it")
// ===========================================================================
/**
 * Geometry and motion are measured in a browser by scripts/check-sheet.mjs,
 * which opens the sheet, drags it, flicks it and counts the DOM changes. What
 * is held here is the pair of rules that made the three sheets before it feel
 * cheap, because either one can be undone without anything failing.
 */
{
  /* Comments stripped: the file explains what `setDragY` did and why it is
     gone, and a guard reading raw source matches the explanation. */
  const sheet = stripComments(readFileSync(join(root, "components/ui/bottom-sheet.tsx"), "utf8"))
  check(
    "the drag listeners are native and non-passive",
    /addEventListener\("touchmove", onMove, \{ passive: false \}\)/.test(sheet) &&
      /addEventListener\("touchstart", onStart, \{ passive: false \}\)/.test(sheet),
    "React registers touchmove passively, so preventDefault in an onTouchMove prop is a no-op and the page scrolls behind the sheet.",
  )
  check(
    "the finger writes the transform, React is only told at the ends",
    /sheet\.style\.transform = `translate3d/.test(sheet) && !/setDragY/.test(sheet),
  )
  check(
    "a pull upward is capped, and the sheet paints on past its own bottom",
    /const PULL_CAP = \d+/.test(sheet) && /top: "100%", height: 160/.test(sheet) && !/next = next \/ 3/.test(sheet),
    "Uncapped, a long upward drag walks the sheet off the bottom of the screen and the scrim shows under it as a black band.",
  )
  check(
    "one dismissal, not two",
    /if \(closingRef\.current\) return/.test(sheet) && /closingRef\.current = true/.test(sheet),
    "A drag that dismisses calls onClose, which flips isOpen, which started a second slide from a sheet that had already left.",
  )
  check(
    "a flick closes it, and a flick that has gone stale does not",
    /DISMISS_VELOCITY/.test(sheet) && /performance\.now\(\) - lastAtRef\.current > 80 \? 0 : velocityRef\.current/.test(sheet),
  )
  const sidebar = readFileSync(join(root, "components/app/sidebar.tsx"), "utf8")
  check(
    "and the account menu uses it instead of a dropdown",
    /<BottomSheet\n\s*isOpen=\{mobileProfileDropdownOpen\}/.test(sidebar) &&
      !/Mobile Profile Dropdown Menu/.test(sidebar),
  )
}

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed > 0) {
  console.log("Failing:", failures.join(", "))
  process.exit(1)
}
