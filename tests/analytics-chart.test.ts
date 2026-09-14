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

/** Both charts, so a fix applied to one and not the other cannot pass. */
const CHARTS: [string, string][] = [
  ["the analytics trend chart", ANALYTICS],
  ["the dashboard KPI chart", DASHBOARD],
]

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

  for (const [name, src] of CHARTS) {
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
    !/animationDuration=\{(?:900|1100)\}/.test(src) && /animationDuration=\{600\}/.test(src),
  )
}

// ===========================================================================
section("The chart owns the touch, and scrolls the page itself")
// ===========================================================================
/**
 * TOUCH-ACTION IS READ ONCE, AT TOUCHSTART.
 *
 * It used to be `tooltipActive ? "none" : "pan-y pinch-zoom"`, and that
 * ternary could not do what it looked like it did: the compositor latches the
 * value when the finger lands and keeps it for the whole gesture, so the
 * "none" branch only ever reached the NEXT touch. Every hold therefore began
 * having already promised the browser it could take the gesture away as a
 * vertical scroll — and it did, the moment the finger started to slide. Lift,
 * tap again, and it worked, because the second touch landed on "none".
 *
 * That was "hold, untap, tap, slide". A value computed from state the gesture
 * itself sets is always this bug, so the rule is that it is a constant.
 *
 * The price of owning the gesture is that the browser will not scroll the
 * page from this 200px band any more, so the vertical branch has to. Both
 * halves are checked, because either one alone is a regression: constant
 * "none" without the scrolling freezes the page under a thumb, and the
 * scrolling without "none" leaves the hold stealable.
 */
for (const [name, src] of CHARTS) {
  const line = src.match(/touchAction: [^\n]*/)?.[0] ?? "(no touchAction on the chart)"
  check(
    `${name}: touch-action is a constant none`,
    /touchAction: "none"/.test(src) && !/touchAction: \w+ \?/.test(src),
    `found: ${line}`,
  )
  check(
    `${name}: a vertical drag scrolls the page by hand`,
    /scrollByPx\(scrollerRef\.current, step\)/.test(src) && /findScroller\(containerRef\.current\)/.test(src),
  )
  check(
    `${name}: a flick keeps going, and a new touch stops it`,
    /stopFlingRef\.current = fling\(scrollerRef\.current, scrollVelocityRef\.current\)/.test(src) &&
      /stopFlingRef\.current\(\)\n\s*stopFlingRef\.current = noFling/.test(src),
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
 * REACT REGISTERS touchstart PASSIVELY. So `preventDefault` inside an
 * `onTouchStart` prop does nothing, and the platform's own long-press
 * recogniser — selection, the callout, drag — takes the press and sends a
 * touchcancel. The gesture is over before the finger has moved, which is a
 * hold you have to lift out of and start again. The listener has to be
 * native and non-passive, like the touchmove one beside it.
 *
 * A TOUCH BELONGS TO THE NODE IT STARTED ON, for the whole gesture, and it
 * keeps going there after that node leaves the document — where it reaches
 * nothing, because there is no path up to the listener any more. The probe
 * landed one press on `path.recharts-curve`. Everything lands on the shield
 * now, which is one div, rendered unconditionally, never re-keyed.
 */
for (const [name, src] of CHARTS) {
  check(
    `${name}: touchstart is native and non-passive`,
    /el\.addEventListener\("touchstart", touchStartHandler, \{ passive: false \}\)/.test(src) &&
      /const touchStartHandler = useCallback\(\(e: TouchEvent\) => \{\n\s*e\.preventDefault\(\)/.test(src) &&
      !/onTouchStart=\{handleTouchStart\}/.test(src.slice(src.indexOf("ref={containerRef}"), src.indexOf("ref={containerRef}") + 2000)),
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
section("The two charts read the same gesture, character for character")
// ===========================================================================
/**
 * The property-by-property audit in tests/settings-flow.test.ts checks that
 * each chart HAS each thing. It cannot see a missing declaration, because a
 * declaration is not a property anyone thought to list — which is exactly how
 * the bug above got through an audit I wrote for this.
 *
 * So this compares the gesture itself, in two pieces that are meant to be
 * word for word identical: the state the scrub keeps, and the handlers that
 * drive it. Everything around them legitimately differs — the two charts
 * format different metrics and take their data under different names — so
 * neither piece reaches past what it is about. Any drift inside them, in
 * either direction, shows up here with the exact character it starts at.
 */
function between(src: string, from: string, to: string): string {
  const a = src.indexOf(from)
  if (a < 0) return ""
  const b = src.indexOf(to, a)
  if (b < 0) return ""
  return src
    .slice(a, b + to.length)
    /* The one name that is meant to differ: the series prop. */
    .replace(/displayChartData/g, "SERIES")
    .replace(/chartDisplayData/g, "SERIES")
    .replace(/\s+/g, " ")
    .trim()
}

function compare(what: string, a: string, d: string, floor: number) {
  check(`${what}: both charts were found`, a.length > floor && d.length > floor,
    `analytics ${a.length} chars, dashboard ${d.length} chars, wanted more than ${floor}`)
  let detail: string | undefined
  if (a !== d) {
    let i = 0
    while (i < a.length && i < d.length && a[i] === d[i]) i++
    detail = `they diverge at character ${i}:\n          analytics: ${JSON.stringify(a.slice(i, i + 90))}\n          dashboard: ${JSON.stringify(d.slice(i, i + 90))}`
  }
  check(`${what}: identical on both charts`, a === d, detail)
}

/* What the scrub remembers between events. The missing line was one of these. */
compare(
  "the scrub's state",
  between(ANALYTICS, "const touchStartPosRef", "const lastTouchXRef = useRef(0)"),
  between(DASHBOARD, "const touchStartPosRef", "const lastTouchXRef = useRef(0)"),
  200,
)

/* And what it does with it: the slop, the hold, the lock, the frame, the lift. */
compare(
  "the scrub's handlers",
  between(ANALYTICS, "const getIndexFromTouch", "setActiveIndex(null)\n  }, [])"),
  between(DASHBOARD, "const getIndexFromTouch", "setActiveIndex(null)\n  }, [])"),
  2000,
)

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
  check(
    "and that mode is set in the same commit as the data",
    /setTrendData\(trendArray\)\s*\n\s*setTrendMode\(analyticsMode\)/.test(page),
  )
  check(
    "the tabs still answer the tap immediately",
    /analyticsMode === "store" \? "bg-white/.test(page),
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
