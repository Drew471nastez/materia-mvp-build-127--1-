/**
 * ===========================================================================
 *  THE TWO TREND CHARTS
 * ===========================================================================
 * The analytics trend chart and the dashboard's KPI chart were the same
 * chart written twice, and they had the same faults. They are one chart in
 * three shared layers now: recharts for the grid and the dates, the lines
 * (components/app/morph-lines) and the marker (components/app/chart-scrub).
 *
 * How they MOVE is measured in a real browser, on both charts, with a mouse
 * and a finger: scripts/check-chart-feel.mjs sweeps each one move a frame
 * through the DevTools protocol and reports main thread time per move, markup
 * rewritten per move, how far the readout trails the pointer and how it
 * leaves, and taps a tab mid move. Measured before and after the layers were
 * shared (medians of three runs, 30 points):
 *
 *     readout behind the pointer   17 to 19px (mouse), 6px (Analytics finger)  →  0
 *     markup rewritten per move    2.8 (home, finger)                           →  0
 *     readout on leaving           gone in one frame                            →  a 120ms fade
 *     jump when a tab is tapped mid move   30 to 38px                            →  under 3px
 *
 * scripts/check-analytics-page.mjs does the same for the whole page. What is
 * checked here is the source-level shape that produced those numbers.
 *
 * Run with:  npm run test:push
 */

import { untt } from "./i18n-source"
import { existsSync, readFileSync } from "node:fs"
import { monotonePath } from "@/components/app/morph-lines"
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

const ANALYTICS = stripComments(untt(readFileSync(join(root, "components/app/analytics-chart.tsx"), "utf8"), "components/app/analytics-chart.tsx"))
const DASHBOARD = stripComments(untt(readFileSync(join(root, "components/app/dashboard-client.tsx"), "utf8"), "components/app/dashboard-client.tsx"))
const PAGE = stripComments(untt(readFileSync(join(root, "app/app/analytics/analytics-client.tsx"), "utf8"), "app/app/analytics/analytics-client.tsx"))
/** The one layer every trend chart is read through: the crosshair, the dots, the readout and the gesture. */
const SCRUB = stripComments(untt(readFileSync(join(root, "components/app/chart-scrub.tsx"), "utf8"), "components/app/chart-scrub.tsx"))
/** The lines of both trend charts, and how one becomes the next. */
const LINES = stripComments(untt(readFileSync(join(root, "components/app/morph-lines.tsx"), "utf8"), "components/app/morph-lines.tsx"))
const MORPH = stripComments(untt(readFileSync(join(root, "components/app/chart-morph.tsx"), "utf8"), "components/app/chart-morph.tsx"))
const CSS = untt(readFileSync(join(root, "app/globals.css"), "utf8"), "app/globals.css")

/** Both charts, so a fix applied to one and not the other cannot pass. */
const CHARTS: [string, string][] = [
  ["the analytics trend chart", ANALYTICS],
  ["the dashboard KPI chart", DASHBOARD],
]

/**
 * ONE LAYER, SO THE RULES ARE HELD ONCE. The gesture used to live in the
 * dashboard's chart and, as a copy, in a hook the analytics chart and the
 * report cards read, and the two drifted: the owner could feel the
 * difference between the home page's chart and Analytics. Every chart draws
 * components/app/chart-scrub now, so every rule below is held on that layer,
 * and "Every chart reads one layer" holds that nothing reads a pointer any
 * other way.
 */
const REPORTS = stripComments(untt(readFileSync(join(root, "app/app/analytics/analytics-reports.tsx"), "utf8"), "app/app/analytics/analytics-reports.tsx"))
const FEEL_PROBE = untt(readFileSync(join(root, "scripts/check-chart-feel.mjs"), "utf8"), "scripts/check-chart-feel.mjs")

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
     * analytics chart that was 120 of its 241 nodes. Neither chart asks
     * recharts for a series at all now: the line and its end dot are
     * components/app/morph-lines, the marker's dots the layer's.
     */
    !/r=\{0\}/.test(src) && !/<Area\b/.test(src) && /<MorphLines\b/.test(src),
  )
}
check("the lines draw one dot, at the end, per line", (LINES.match(/<circle\b/g) ?? []).length === 1 && /data-chart-end-dot/.test(LINES) && !/r=\{0\}/.test(LINES))

// ===========================================================================
section("Nothing teleports, and nothing trails")
// ===========================================================================

{
  check(
    "the crosshair and the dots are drawn at the origin and moved by a transform",
    /**
     * SVG geometry attributes (x1, cx) cannot be transitioned in CSS, and a
     * transform on an SVG child is drawn by the main thread every frame of
     * its glide. The marks are boxes with a layer of their own, drawn at the
     * origin and moved by transform, which the compositor runs.
     */
    /cross\.style\.transform = `translateX\(\$\{x\.toFixed\(1\)\}px\)`/.test(SCRUB) &&
      /dot\.style\.transform = `translate\(\$\{x\.toFixed\(1\)\}px, \$\{y\.toFixed\(1\)\}px\)`/.test(SCRUB) &&
      (SCRUB.match(/willChange: "transform"/g) ?? []).length >= 2 &&
      !/<circle|<line/.test(SCRUB),
  )
  check(
    "under a mouse they glide from point to point, as the home page's crosshair always did",
    /export const SCRUB_GLIDE = "transform 120ms cubic-bezier\(0\.2, 0, 0, 1\)"/.test(SCRUB)
      && /if \(r\.input === "mouse"\) r\.glide = requestAnimationFrame\(\(\) => setGlide\(true\)\)/.test(SCRUB),
  )
  check(
    "and the first placement is a cut, so nothing swoops in from where it was last",
    /if \(arriving\) setGlide\(false\)/.test(SCRUB),
  )
  check(
    "the readout follows the pointer every frame, clamped to the card by its own width, with left static",
    /**
     * "It needs to be the same smooth moving tooltip at full frame rate."
     * The Analytics readout snapped to each point and glided there, so it
     * trailed a finger by 6px and a mouse by 17px (scripts/check-chart-feel);
     * the home page's followed the finger. It follows the pointer on every
     * chart now, and `left` never moves: every pixel is in a promoted
     * transform whose clamp resolves against the box's own width.
     */
    /tip\.style\.transform = `translateX\(clamp\(8px, calc\(\$\{x\.toFixed\(1\)\}px - 50%\), calc\(\$\{width\.toFixed\(1\)\}px - 100% - 8px\)\)\) translateZ\(0\)`/.test(SCRUB)
      && /left: 0,/.test(SCRUB) && !/tip\.style\.transition/.test(SCRUB),
  )
  check(
    "it fades in and out on one curve, from where it was, instead of vanishing",
    /export const SCRUB_FADE_IN_MS = 1[5-8]\d/.test(SCRUB) && /export const SCRUB_FADE_OUT_MS = 120/.test(SCRUB)
      && /el\.style\.opacity = show \? "1" : "0"/.test(SCRUB) && /`opacity \$\{ms\}ms \$\{SCRUB_FADE_EASE\}`/.test(SCRUB),
  )
  check(
    "nothing is rendered per move: the layer holds no React state, and writes the readout's text only when a new point is crossed",
    !/useState/.test(SCRUB) && /if \(i !== r\.index\) \{/.test(SCRUB) && /if \(span\.textContent !== text\) span\.textContent = text/.test(SCRUB)
      && /if \(!r\.frame\) r\.frame = requestAnimationFrame\(paint\)/.test(SCRUB),
  )
  for (const [name, src] of CHARTS) {
    check(
      `${name} reads nothing through recharts: no Tooltip, no cursor, no reference line`,
      !/<Tooltip\b|<ReferenceLine\b|GlidingCursor|GlidingActiveDot|chart-glide/.test(src),
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
    /* Changed on purpose (the owner: analytics in the store's own currency): formatCurrency keeps one formatter per currency, and the callback changes only with the currency. */
    /const formatPrice = useCallback\(\(cents: number\) => formatCurrency\(cents \/ 100, storeCurrency, appLocale\(\)\), \[storeCurrency\]\)/.test(PAGE) &&
      /const numberFormats = new Map<string, Intl\.NumberFormat>\(\)/.test(readFileSync(join(process.cwd(), "lib/markets/money.ts"), "utf8")) &&
      /const chartDisplayData = useMemo\(/.test(PAGE),
  )
}

// ===========================================================================
section("The draw-in does not outstay its welcome")
// ===========================================================================

check(
  "both charts settle in well under a second",
  /**
   * 1100ms of ease-in-out, staggered out to 180ms across four series, is
   * nearly a second and a half before the chart stops moving, long enough
   * to read as the page being slow rather than as an animation. One move,
   * MORPH_MS long, for both charts, from components/app/morph-lines.
   */
  CHARTS.every(([, src]) => !/animationDuration=\{(?:900|1100)\}/.test(src) && /<MorphLines\b/.test(src))
    && /morphEase\(Math\.min\(1, \(performance\.now\(\) - t0\) \/ MORPH_MS\)\)/.test(LINES)
    && Number(MORPH.match(/export const MORPH_MS = (\d+)/)?.[1] ?? 9999) <= 600,
)

// ===========================================================================
section("A metric tab moves the line, and nothing else moves")
// ===========================================================================
/**
 * "When changing tabs there is no lag, no glitches in the lines, no layout
 * shifts." Measured in Chromium on the Analytics page every frame of a tab
 * switch (scripts/check-analytics-page.mjs): the line on screen in every
 * frame and moving over thirty of them, no remount, no request, no shift.
 * And a tab tapped while the last move is still running: recharts started
 * the new move from where the last one was GOING, so the frame after the tap
 * jumped 23 to 30px against the 9px of an ordinary frame. The line is drawn
 * by components/app/morph-lines now and carries on from where it is: 2px.
 */
for (const [name, src] of CHARTS) {
  check(`${name}: the metric keeps its place in the first line, so a tab moves it rather than replacing it`,
    name === "the analytics trend chart"
      ? /const lines = useMemo\(\s*\(\) => visibleKeys\.map\(\(k\) => chartDisplayData\.map\(/.test(src) && /lines=\{lines\}/.test(src)
      : /const lines = useMemo\(\(\) => \[displayChartData\.map\(\(d\) => d\.value \?\? 0\)\], \[displayChartData\]\)/.test(src) && /lines=\{lines\}/.test(src))
  check(`${name}: the grid is three intervals on every tab, placed by us`,
    /fixedScale\(/.test(src) && /horizontalPoints=\{/.test(src))
  check(`${name}: the axis numbers cross-fade instead of being swapped`, /<AxisLabels labels=\{axisLabels\}/.test(src) && /tick=\{false\}/.test(src))
  check(`${name}: the frame (grid and dates) is memoised on the dates, so a tab never redraws it`,
    /const datesKey = displayChartData\.map\(\(d\) => d\.label\)\.join|const datesKey = chartDisplayData\.map\(\(d\) => d\.date\)\.join/.test(src)
      && /= memo\(function (?:Frame|DashboardFrame)\(/.test(src))
}
check("the lines move from where they are drawn, so a change mid move carries on instead of jumping",
  /const was = s\.drawn/.test(LINES) && /fit\(was\?\.lines\[k\] \?\? \[\], ys\.length, floor\)/.test(LINES)
    && /cancelAnimationFrame\(s\.raf\)/.test(LINES) && /if \(s\.sig === sig\) return/.test(LINES))
check("on the iOS curve, the same one the axis numbers and the report cards use",
  /const \[x1, y1, x2, y2\] = \[0\.32, 0\.72, 0, 1\]/.test(MORPH) && /export const MORPH_EASE = "cubic-bezier\(0\.32, 0\.72, 0, 1\)"/.test(MORPH))
check("a morph renders nothing in React: the paths and the end dot are written to the DOM once a frame",
  /lineRefs\.current\[k\]\?\.setAttribute\("d", line\)/.test(LINES) && /dot\.setAttribute\("transform"/.test(LINES) && !/useState/.test(LINES))
check("the dot at the end travels with the line, in the same frame, instead of vanishing for the animation",
  /data-chart-end-dot/.test(LINES) && /dot\.setAttribute\("transform", `translate\(\$\{xs\[xs\.length - 1\]\.toFixed\(1\)\} \$\{ys\[ys\.length - 1\]\.toFixed\(1\)\}\)`\)/.test(LINES))
{
  /*
    THE CURVE IS MONOTONE, as recharts' `type="monotone"` was: between two
    points it never goes above the higher or below the lower, so a day with
    nothing never dips under the axis. Checked on the numbers, not the text.
  */
  const xs = [0, 10, 20, 30, 40, 50, 60]
  const ys = [100, 100, 20, 100, 100, 0, 100]
  const nums = (monotonePath(xs, ys).match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number)
  let within = nums.length > 0
  for (let i = 2; i + 5 < nums.length; i += 6) {
    const seg = Math.floor(i / 6)
    const lo = Math.min(ys[seg], ys[seg + 1]) - 0.05
    const hi = Math.max(ys[seg], ys[seg + 1]) + 0.05
    if (nums[i + 1] < lo || nums[i + 1] > hi || nums[i + 3] < lo || nums[i + 3] > hi) within = false
  }
  check("the curve never overshoots a point, so it never dips under the axis", within && monotonePath(xs, ys).startsWith("M0,100C"))
}
check("the scale never changes its number of intervals", /export const INTERVALS = 3/.test(MORPH) && /Array\.from\(\{ length: INTERVALS \+ 1 \}/.test(MORPH))
check("the axis numbers fade in and out in the stylesheet, with reduced motion respected",
  /\.chart-axis-in \{ animation: chart-axis-in/.test(CSS) && /prefers-reduced-motion: reduce\) \{\s*\.chart-axis-in, \.chart-axis-out/.test(CSS))
check("a dashboard tab reads nothing: the chart's events are fetched once per period",
  /* Changed on purpose: a new order asks again (ordersChanged), and a store currency change asks again (storeCurrencyCode). A tab still never does. */ /\}, \[periodKey, creatorId, ordersChanged, storeCurrencyCode\]\)/.test(DASHBOARD) && /const chartData = \(openKPIModal && chartSeries\?\.\[openKPIModal\]\) \|\| NO_POINTS/.test(DASHBOARD)
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
{
  const line = SCRUB.match(/touchAction: [^\n]*/)?.[0] ?? "(no touchAction on the layer)"
  check(
    "the layer: touch-action is a constant pan-y",
    /touchAction: "pan-y"/.test(SCRUB) && !/touchAction: \w+ \?/.test(SCRUB),
    `found: ${line}`,
  )
  for (const [name, src] of [...CHARTS, ["the layer", SCRUB] as [string, string]]) {
    check(
      `${name}: nothing scrolls the page by hand`,
      !/scrollByPx|findScroller|chart-scroll|scrollTop\s*=/.test(src),
      "a hand rolled scroll is back; the browser cannot scroll a band that also scrolls itself",
    )
    check(`${name}: no flick loop outliving the finger`, !/\bfling\(/.test(src))
  }
  check(
    "the layer: an active scrub cancels every move",
    /if \(scrubbing\) \{[\s\S]{0,500}?if \(e\.cancelable\) e\.preventDefault\(\)/.test(SCRUB),
    "without this the browser can start panning mid scrub",
  )
  /*
    AND A HOLD THAT TURNS INTO A SCROLL LETS GO. The hold fires 100ms after a
    finger lands whether or not that finger is going anywhere, so a thumb
    that starts down the screen slowly opened the tooltip before it had
    travelled far enough to be called a scroll, and every move after that
    was cancelled, so the page did not move at all. Driven by
    scripts/check-dashboard-scroll, which reported 0 of 893 pixels covered.
  */
  check(
    "the layer: unless the hold has turned into a scroll",
    /if \(!moved && dy > SLOP_Y\) \{[\s\S]{0,120}scrubbing = false[\s\S]{0,40}leave\(\)/.test(SCRUB) && /const SLOP_Y = 12/.test(SCRUB),
    "a slow downward drag that lands on the chart would open the tooltip and freeze the page",
  )
  /*
    AND IT ASKS WHAT THE FINGER DID, NOT WHAT THE HOLD INTENDED. The hold
    timer sets the direction lock to "horizontal" the moment it fires, before
    the finger has moved at all, so a guard reading that lock never ran.
  */
  check(
    "the layer: and it reads movement rather than the hold's own optimistic lock",
    /if \(dx > SLOP_X\) moved = true/.test(SCRUB) && /moved = false/.test(SCRUB),
    "the direction lock says horizontal after any hold, whether or not anything was scrubbed",
  )
  check("the layer: a sideways drag engages sooner than a scroll gives up",
    /const SLOP_X = 8/.test(SCRUB) && /const SLOP_Y = 12/.test(SCRUB) && /\(dx > SLOP_X \|\| dy > SLOP_Y\)/.test(SCRUB))
  check("the layer: vertical has to win clearly to be a scroll",
    /\} else if \(dy > dx \* 1\.4\) \{/.test(SCRUB))
  check("the layer: a hold lands in a tenth of a second, where the finger is now",
    /const HOLD_MS = 100/.test(SCRUB) && /move\(lastX, "touch"\)/.test(SCRUB))
  check("the layer: one tick per point crossed, the first a firmer one, and none for a mouse",
    /if \(i !== r\.index\) \{\s*if \(r\.input === "touch"\) hapticTap\(r\.index < 0 \? "medium" : "light"\)/.test(SCRUB)
      && /r\.index = -1/.test(SCRUB))
}

// ===========================================================================
section("A hold the platform cannot take away")
// ===========================================================================
/**
 * Two things a phone does that a desktop never does, both measured by
 * scripts/check-chart-scrub.mjs after it was fixed to press the node a finger
 * actually presses rather than the container.
 *
 * REACT REGISTERS touchmove PASSIVELY, so a `preventDefault` inside an
 * `onTouchMove` prop does nothing at all. The listeners are native, and the
 * touchmove one is non-passive so a move can be cancelled once the scrub is
 * ours. The touchstart is watched, passively: cancelling it is the one thing
 * that would refuse the browser's scroll for the whole gesture.
 *
 * The platform's own long-press recogniser is refused by
 * `-webkit-touch-callout: none` and `user-select: none` on the layer, which is
 * the tool for that job and does not take the scroll with it.
 *
 * A TOUCH BELONGS TO THE NODE IT STARTED ON, for the whole gesture, and it
 * keeps going there after that node leaves the document, where it reaches
 * nothing. The probe once landed a press on `path.recharts-curve`. Everything
 * lands on the layer now, which is one div over the plot, rendered
 * unconditionally and never re-keyed.
 */
{
  check("the layer: the touchstart is watched, never cancelled, and the touchmove can be",
    /addEventListener\("touchstart", onStart, \{ passive: true \}\)/.test(SCRUB)
      && /addEventListener\("touchmove", onMove, \{ passive: false \}\)/.test(SCRUB)
      && !/onTouchStart=|onTouchMove=/.test(SCRUB))
  check("the layer: the long press is refused in CSS instead",
    /WebkitTouchCallout: "none"/.test(SCRUB) && /WebkitUserSelect: "none"/.test(SCRUB))
  check("the layer: the touches land on one node that never changes, and a placeholder takes none",
    /data-chart-touch-shield/.test(SCRUB) && /pointerEvents: disabled \? "none" : "auto"/.test(SCRUB) && /position: "absolute",\s*inset: 0,\s*zIndex: 5/.test(SCRUB))
  check("the layer: a mouse and a pen read it, a finger's pointer events are left to the touch listeners",
    /if \(e\.pointerType !== "touch"\) move\(e\.clientX, "mouse"\)/.test(SCRUB) && /if \(e\.pointerType !== "touch"\) leave\(\)/.test(SCRUB))
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
 * first line of every touchstart. scripts/check-chart-scrub.mjs found it on
 * its first run, by pressing the chart. This keeps it found, on both charts
 * and on the layer that now holds the gesture.
 */
for (const [name, src] of [...CHARTS, ["the layer", SCRUB] as [string, string]]) {
  /* Strings out too, so a ref named in one is not mistaken for a use. */
  const code = src.replace(/(["'`])(?:\\.|(?!\1)[^\\])*\1/g, '""')
  const used = new Set(code.match(/\b[A-Za-z_$][\w$]*Ref\b/g) ?? [])
  const declared = new Set([
    ...(code.match(/(?:const|let|var)\s+([A-Za-z_$][\w$]*Ref)\b/g) ?? []).map((m) => m.split(/\s+/)[1]),
    /* Types and imports carry the suffix without being variables. */
    ...(code.match(/\b([A-Za-z_$][\w$]*Ref)\s*[,}]/g) ?? []).map((m) => m.replace(/\s*[,}]$/, "")),
  ])
  const missing = [...used].filter((r) => !declared.has(r) && !/^(?:Ref|MutableRefObject|RefObject|useRef|createRef|forwardRef)$/.test(r))
  check(
    `${name} declares every ref it uses`,
    missing.length === 0,
    missing.length ? `used but never declared: ${missing.join(", ")}` : undefined,
  )
}

// ===========================================================================
section("Every chart reads one layer")
// ===========================================================================
/**
 * "The analytics chart, when I hover in the chart left and right with the
 * mouse, or with touch scrub, is not the same feeling as the chart on the
 * homepage." It was not: the home page's chart read a finger with a gesture
 * of its own and a mouse through recharts' Tooltip, and the Analytics chart
 * and the report cards read both through a hook with a marker that snapped
 * and glided. The three draw components/app/chart-scrub now, so the feel is
 * the same by construction, and scripts/check-chart-feel.mjs measures it.
 */
{
  /* Changed on purpose: the report cards are lists and the funnel now; the one chart on Analytics is the figures' chart. */
  check("the home page's chart and the Analytics chart draw <ChartScrub>, and the report cards draw no chart of their own",
    /<ChartScrub\b/.test(DASHBOARD) && /<ChartScrub\b/.test(ANALYTICS) && !/<ChartScrub\b|recharts/.test(REPORTS))
  check("and none of them keeps a gesture of its own",
    [DASHBOARD, ANALYTICS, REPORTS].every((src) => !/addEventListener\("touch|onPointerMove=|useChartScrub|touchStartHandler|tooltipActiveRef/.test(src)))
  check("the old hook and the old glide are gone, so nothing can read a pointer the old way",
    !existsSync(join(root, "components/app/use-chart-scrub.ts")) && !existsSync(join(root, "components/app/chart-glide.tsx")))
  check("the plot is memoised and blind to the finger",
    /const Frame = memo\(function Frame\(/.test(ANALYTICS) && !/interface FrameProps \{[^}]*(activeIndex|scrub|values|lines)/.test(ANALYTICS))
  check("the layer is memoised, and both trend charts hand it memoised series, rows and title",
    /export const ChartScrub = React\.memo\(ChartScrubLayer\)/.test(SCRUB)
      && [ANALYTICS, DASHBOARD].every((src) => /const scrubSeries = useMemo<ScrubSeries\[\]>/.test(src) && /const scrubRows = useMemo<ScrubRow\[\]>/.test(src) && /const scrubTitle = useCallback\(/.test(src)))
  check("the Analytics readout keeps both numbers: this period and what it is compared with",
    /label: "Compared"/.test(ANALYTICS) && /mark: "dashed", tone: "compared"/.test(ANALYTICS) && /hollow: true/.test(ANALYTICS))
  check("a placeholder has nothing to read",
    /disabled=\{isLoading \|\| n === 0\}/.test(ANALYTICS) && /disabled=\{loading \|\| displayChartData\.length === 0\}/.test(DASHBOARD))
  check("the feel is measured in a browser, on both charts, with a mouse and a finger, and held equal",
    /Input\.dispatchMouseEvent/.test(FEEL_PROBE) && /Input\.dispatchTouchEvent/.test(FEEL_PROBE)
      && /\["home", "analytics"\]/.test(FEEL_PROBE) && /the readout stays on the pointer on both charts/.test(FEEL_PROBE)
      && /a move changes no markup on either chart/.test(FEEL_PROBE))
}

// ===========================================================================
section("Switching the place redraws once, not twice")
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
  const page = stripComments(untt(readFileSync(join(root, "app/app/analytics/analytics-client.tsx"), "utf8"), "app/app/analytics/analytics-client.tsx"))
  /*
    Changed on purpose: there is no Store and One page switch any more. Every
    place (All, the creator page, the OnePage, a website) is drawn with the
    same four series, so a switch never swaps the chart's lines, only their
    numbers, and the chart is always given the one set.
  */
  check(
    "the chart is given the one set of series every place is drawn with",
    /analyticsMode="store"/.test(page) && !/analyticsMode=\{analyticsMode\}/.test(page) && !/setAnalyticsMode|setMode\(/.test(page),
  )
  /*
    The mode and the series are now both read off the one answer from the
    server, so they cannot be committed apart: the series is derived from
    `answer`, and so is the mode it is drawn in.
  */
  check(
    "and the series is drawn from the answer on screen, so it moves with its own numbers",
    /const answer = reportsState\.data/.test(page) && /const trendData = useMemo<AnalyticsChartData\[\]>\(\(\) => \{\s*if \(!answer\) return \[\]/.test(page),
  )
  check(
    "the filter answers the tap immediately: the place is set at once, and the address after",
    /setPropertyState\(/.test(page) && /window\.history\.replaceState\(/.test(page),
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
  const sheet = stripComments(untt(readFileSync(join(root, "components/ui/bottom-sheet.tsx"), "utf8"), "components/ui/bottom-sheet.tsx"))
  check(
    "the drag listeners are native and non-passive",
    /addEventListener\("touchmove", onMove, \{ passive: false \}\)/.test(sheet) &&
      /* Touchdown cancels nothing, so it is passive and a scroll in the sheet never waits for script. */
      /addEventListener\("touchstart", onStart, \{ passive: true \}\)/.test(sheet) &&
      /window\.addEventListener\("touchend", onLift\)/.test(sheet),
    "React registers touchmove passively, so preventDefault in an onTouchMove prop is a no-op and the page scrolls behind the sheet.",
  )
  check(
    "the finger writes the transform, React is only told at the ends",
    /sheet\.style\.transform = translate\(offsetRef\.current\)/.test(sheet) && /const translate = \(y: number\) => `translate3d\(/.test(sheet) && !/setDragY/.test(sheet),
  )
  check(
    "the first frame the sheet exists it is below the screen",
    /* A kept sheet (keepMounted) is already in the page, below the screen, when it opens: the open also leaves rest. */
    /transform: "translate3d\(0, 100%, 0\)"/.test(sheet) && /useLayoutEffect\(\(\) => \{\s*if \(!mounted \|\| !present\) return/.test(sheet)
      && /if \(isOpen !== prevOpen\) \{\s*setPrevOpen\(isOpen\)\s*if \(isOpen\) \{\s*setPresent\(true\)\s*setResting\(false\)/.test(sheet),
    "`present` set from an effect committed the sheet at rest and moved it a paint later: it showed, vanished and slid up.",
  )
  check(
    "open and close run on the compositor, from wherever the sheet is",
    /sheet\.animate\(\[\{ transform: translate\(from\) \}, \{ transform: translate\(to\) \}\]/.test(sheet) && /readY\(sheet\)/.test(sheet)
      && !/transition = `transform/.test(sheet),
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
    /* The builder sheet's own arithmetic (components/website-builder/sheet-gestures): where the release would carry it, at the speed of the finger's last 100ms, a finger held still before lifting counting as still. */
    /releaseVelocity\(samplesRef\.current, eventTime\(e\)\)/.test(sheet) && /snapTarget\(\{ offsets: stops, current, velocity: v/.test(sheet),
  )
  const sidebar = untt(readFileSync(join(root, "components/app/sidebar.tsx"), "utf8"), "components/app/sidebar.tsx")
  /* The phone's account trigger and its sheet are their own file, mounted by the sidebar. */
  const accountMenu = untt(readFileSync(join(root, "components/app/mobile-account-menu.tsx"), "utf8"), "components/app/mobile-account-menu.tsx")
  check(
    "and the account menu uses it instead of a dropdown",
    /<BottomSheet\n\s*isOpen=\{mobileProfileDropdownOpen\}/.test(accountMenu) &&
      /<MobileAccountMenu\b/.test(sidebar) &&
      !/Mobile Profile Dropdown Menu/.test(sidebar),
  )
}

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed > 0) {
  console.log("Failing:", failures.join(", "))
  process.exit(1)
}
