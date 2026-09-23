/**
 * ===========================================================================
 *  THE ANALYTICS CHART BEFORE ITS NUMBERS ARRIVE
 * ===========================================================================
 * Reported with a picture: the analytics card is a tall white box with
 * nothing in it, and then the whole plot appears at once.
 *
 * Two causes, and they are not the same bug.
 *
 * NOTHING TO DRAW. `trendData` starts as `[]` and a Recharts series of `[]`
 * draws no dates and no line. The fetch seeds a bucket for every date in the
 * range, so the frame, the ticks and the curve all arrive together in the
 * frame the fetch resolves. The same date list is built up front now and
 * drawn as a placeholder, so the card is a chart from the start and the line
 * grows into a frame that is already there.
 *
 * NOTHING TO ANIMATE. The draw-in flag was set in an effect, and an effect
 * runs after the render it belongs to. The chart mounts against its
 * placeholder, the mount's animation window closes 690ms later, the fetch
 * lands after that, and the render that receives the data therefore carries
 * `isAnimationActive={false}`. Recharts draws the finished shape in one
 * frame and the effect then enables an animation with nothing left to play.
 * On a page that takes longer than 690ms to load — which is every load —
 * the line never animated at all.
 *
 * scripts/check-chart-skeleton.mjs drives the real component through both
 * states. What it cannot see is the growth itself: virtual time steps over
 * the animation and rAF is starved in that headless mode. The shape of the
 * props that make it animate is source, and source is what this file is for.
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
/** Comments describe the bug, so a negative check must not read its own prose. */
const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")

function main() {
  const client = read("app/app/analytics/analytics-client.tsx")
  const chart = read("components/app/analytics-chart.tsx")
  const css = read("app/globals.css")
  const probe = read("scripts/check-chart-skeleton.mjs")

  console.log("\nThe dates the chart plots are worked out in one place")

  /*
    The placeholder and the series that replaces it must have EXACTLY the
    same x categories. Different labels and recharts has a different
    category axis, the curve is a new one, and the line is replaced rather
    than grown — which is the thing being fixed. One function, both callers.
  */
  /*
    The series now comes from the server, labelled there by
    lib/analytics/buckets. So the placeholder is labelled by the same two
    functions, bucketStarts and bucketLabel, rather than by a list of its own:
    the rule is unchanged, one builder of dates for both.
  */
  check("there is one builder for the date buckets",
    /function trendLabelsFor\(span: Span, timeZone: string\): string\[\]/.test(client)
      && /bucketStarts\(span, grain, timeZone\)\.map\(\(s\) => bucketLabel\(s, grain, timeZone\)\)/.test(client))
  check("the series is labelled by the same functions, on the server",
    /const labels = starts\.map\(\(s\) => bucketLabel\(s, grain, timeZone\)\)/.test(read("lib/analytics/reports.ts"))
      && /date,\s*\n\s*views: r\.views\.series\.current\[i\]/.test(client),
    "a series labelled one way and a placeholder labelled another is a swap, not a draw-in")
  check("and the placeholder is built from it",
    /trendLabelsFor\(safeSpan, timeZone\)\s*\n\s*\.slice\(-TREND_SKELETON_MAX\)/.test(client))
  check("with neither branch keeping a loop of its own",
    !/while \(currentDate <= endDate\)/.test(strip(client))
      && !/Initialize all hours with 0 values/.test(client),
    "the two seeding loops this replaced are what drifted from each other")
  /*
    All time starts in 2020. The real series is whatever it is, but a
    placeholder nobody looks at for more than a moment has no business laying
    out two thousand ticks before the page has painted.
  */
  check("the placeholder is capped, because all time starts in 2020",
    /const TREND_SKELETON_MAX = 90/.test(client))

  console.log("\nSo the card is a chart before the fetch returns")

  check("the placeholder is a flat series across the range",
    /const skeletonTrend = useMemo<TrendData\[\]>/.test(client)
      && /\.map\(\(date\) => \(\{ date, views: 0, sales: 0, revenue: 0, clicks: 0, subscribers: 0 \}\)\)/.test(client))
  check("used while nothing has arrived",
    /const chartIsLoading = trendData\.length === 0/.test(client)
      && /\(chartIsLoading \? skeletonTrend : trendData\)\.map/.test(client))
  check("and the chart is told which it is holding",
    /isLoading=\{chartIsLoading\}/.test(client))
  /*
    The wrapper blurs the chart to 30% while refreshing, which is right when
    real numbers are being replaced and says so. Applied to the placeholder
    it put us straight back at a white box.
  */
  check("the placeholder is not blurred away, because the frame IS the loading state",
    /chartIsLoading\s*\n\s*\? "opacity-100 blur-0"\s*\n\s*: isRefreshing/.test(client),
    "a placeholder at 30% opacity behind a 2px blur is the blank card again")
  check("and the sample-data toggle waits until there is something to say",
    /\{!hasRealData && !chartIsLoading && \(/.test(client),
    "'No activity yet' over a chart that has not loaded is an answer to a question nobody asked")

  console.log("\nAnd it reads as waiting rather than as a chart of nothing")

  check("a placeholder line is grey, with no fill and no points",
    /const SKELETON_STROKE = "#e5e7eb"/.test(chart)
      && /const lineStroke = \(colour: string\) => \(isLoading \? SKELETON_STROKE : colour\)/.test(chart)
      && /const lineFill = \(gradient: string\) => \(isLoading \? "none" : gradient\)/.test(chart)
      && /const lineDot = \(colour: string\) => \(isLoading \? false : makeDot\(colour\)\)/.test(chart))
  check("every series goes through them, not just the one that was looked at",
    (chart.match(/stroke=\{lineStroke\(/g) ?? []).length === 8
      && (chart.match(/dot=\{lineDot\(/g) ?? []).length === 8,
    `${(chart.match(/stroke=\{lineStroke\(/g) ?? []).length} of 8 series (the refunds line is gone: a count drawn on a dollar axis)`)
  check("nothing in a placeholder can be pressed",
    /pointerEvents: isLoading \? "none" : undefined/.test(chart),
    "a finger on it would raise a tooltip reading zero for a number nobody has")
  check("and the breath is in the stylesheet, with reduced motion respected",
    /@keyframes chart-skeleton-breath/.test(css)
      && /\[data-chart-loading="true"\] \.recharts-area-curve/.test(css)
      && /prefers-reduced-motion: reduce[\s\S]{0,400}chart-skeleton-breath 1\.7s|chart-skeleton-breath[\s\S]{0,600}prefers-reduced-motion/.test(css))
  check("the stroke fades to the metric's colour rather than switching",
    /\[data-chart-loading\] \.recharts-area-curve \{\s*\n\s*transition: stroke 420ms/.test(css))

  console.log("\nThe draw-in is decided by the render that receives the data")

  /*
    THE PART THAT WAS ACTUALLY BROKEN. `setShouldAnimate(true)` in an effect
    runs after the render it belongs to, so the render recharts uses to draw
    the new series still carries the old flag — false, once the mount's own
    window has expired. Setting state during a render of the same component
    is React's escape hatch for exactly this: it re-runs the component before
    anything is committed.
  */
  check("the flag is raised during the render, against the series it just received",
    /const seenSeriesRef = useRef\(chartDisplayData\)/.test(chart)
      && /if \(seenSeriesRef\.current !== chartDisplayData\) \{\s*\n\s*seenSeriesRef\.current = chartDisplayData\s*\n\s*if \(!shouldAnimate\) setShouldAnimate\(true\)/.test(chart),
    "an effect raises it one render too late, which is why a slow load never animated")
  check("and not by an effect that only reacts to the data",
    !/useEffect\(\(\) => \{\s*\n\s*setShouldAnimate\(true\)/.test(strip(chart)))
  check("the timer that ends it outlasts the longest series",
    /const timer = setTimeout\(\(\) => setShouldAnimate\(false\), CHART_ANIM_MS\)/.test(chart)
      && /\}, \[shouldAnimate, chartDisplayData\]\)/.test(chart))
  check("a flat placeholder does not animate, because there is nothing to draw in",
    /const lineAnimates = isLoading \? false : shouldAnimate/.test(chart)
      /* Eight series and the dashed comparison line. */
      && (chart.match(/isAnimationActive=\{lineAnimates\}/g) ?? []).length === 9)

  console.log("\nAnd the whole of it is driven in a browser")

  check("the probe mounts the real component in both states",
    /import \{ AnalyticsChartWithTooltip/.test(read("scripts/render-chart-skeleton.tsx"))
      && /isLoading=\{loading\}/.test(read("scripts/render-chart-skeleton.tsx")))
  check("with an empty series beside it, which is what was reported",
    /an empty series draws no dates and no line/.test(probe))
  check("and it says plainly what it cannot see",
    /WHAT THIS CAN AND CANNOT SEE/.test(probe) && /requestAnimationFrame,\s*\n\s*which would catch every frame[\s\S]{0,60}starved/.test(probe),
    "a probe that quietly asserts less than it claims is worse than one that says so")

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) { console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`); process.exit(1) }
}
main()
