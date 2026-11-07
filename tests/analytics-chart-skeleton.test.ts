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
 * states, on a real clock, and counts the shapes the line grows through. The
 * shape of the code that makes it grow is source, and source is what this
 * file is for. The line is components/app/morph-lines now, for both charts.
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
  const client = read("app/(storelib)/app/analytics/analytics-client.tsx")
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
      && /date,\s*\n\s*views: r\.visitors\.series\.current\[i\]/.test(client),
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
    /const skeletonTrend = useMemo<AnalyticsChartData\[\]>/.test(client)
      && /\.map\(\(date\) => \(\{ date, views: 0, sales: 0, revenue: 0 \}\)\)/.test(client))
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
  /* Changed on purpose: no blur at all now, the placeholder or a refetch: the chart goes soft by opacity alone, a compositor change (round ana-1021). */
  check("the placeholder is not blurred away, because the frame IS the loading state",
    /* Changed on purpose (round 41): a refetch dims the chart only once it has waited SOFT_AFTER_MS (softLate), so an answer from memory never flashes; the placeholder still never dims. */
    /chartIsLoading\s*\?\s*"opacity-100"\s*:\s*(isRefreshing|softLate)/.test(client) && !/blur-\[1\.5px\]/.test(client),
    "a placeholder at 30% opacity behind a 2px blur is the blank card again")
  /* Changed on purpose: the sample data toggle is gone. An empty period is the cards' empty states, never invented numbers. */
  check("and no sample data is drawn in place of an answer, before or after it lands",
    !/hasRealData|sampleData|SAMPLE_/.test(client),
    "'No activity yet' over a chart that has not loaded is an answer to a question nobody asked")

  console.log("\nAnd it reads as waiting rather than as a chart of nothing")

  /*
    The line is components/app/morph-lines now, for both trend charts: it
    moves from where it is drawn, which recharts could not do when a tab was
    tapped mid move. The placeholder rules are held there.
  */
  const lines = read("components/app/morph-lines.tsx")
  check("a placeholder line is grey, with no fill and no points",
    /export const PLACEHOLDER_STROKE = "#e5e7eb"/.test(lines)
      && /stroke=\{loading \? PLACEHOLDER_STROKE : color\}/.test(lines)
      && /area\.setAttribute\("d", ys\.length > 1 && !geo\.loading \?/.test(lines)
      && /const shown = ys\.length > 1 && !geo\.loading/.test(lines)
      /* Changed on purpose (round AL): a chart with nothing to draw is its own purple line flat on the floor again, so only a real wait is grey. */
      && /loading=\{isLoading\}\n\s*color=\{color\}/.test(chart))
  check("the series goes through them, in the one slot every metric shares",
    /lines=\{lines\}/.test(chart) && /\{lines\.map\(\(_, k\) => \(\s*<g key=\{k\}>/.test(lines) && /data-trend-line/.test(lines),
    "each metric its own series is what made a tab a replacement instead of a move")
  /*
    The layer a finger lands on is components/app/chart-scrub now: the chart
    hands it `disabled` while it is a placeholder, and the layer then takes
    no pointer and raises no readout.
  */
  check("nothing in a placeholder can be pressed",
    /* Changed on purpose (r51): nor a chart with nothing to draw. */ /disabled=\{isLoading \|\| blank \|\| n === 0\}/.test(chart)
      && /pointerEvents: disabled \? "none" : "auto"/.test(read("components/app/chart-scrub.tsx"))
      && /if \(live\.current\.disabled\) return/.test(read("components/app/chart-scrub.tsx")),
    "a finger on it would raise a tooltip reading zero for a number nobody has")
  check("and the breath is in the stylesheet, with reduced motion respected",
    /@keyframes chart-skeleton-breath/.test(css)
      && /\[data-chart-loading="true"\] \.trend-line/.test(css)
      && /prefers-reduced-motion: reduce[\s\S]{0,400}chart-skeleton-breath 1\.7s|chart-skeleton-breath[\s\S]{0,600}prefers-reduced-motion/.test(css)
      && /className="trend-line"/.test(lines))
  check("the stroke fades to the metric's colour rather than switching",
    /\[data-chart-loading\] \.trend-line \{\s*\n\s*transition: stroke 420ms/.test(css))

  console.log("\nThe draw-in is decided before the frame that shows the data")

  /*
    THE PART THAT WAS ACTUALLY BROKEN, twice. Recharts was told to animate by
    a flag an effect raised, which ran after the render that drew the new
    series: the first frame was the new line cut in. The flag was then raised
    during the render, and a timer lowered it again after the move, which a
    second tab inside that time restarted from where the last move was going.
    There is no flag now: a change of numbers starts the move in a layout
    effect, which runs before the browser paints, and draws its first frame
    there, from where the line is.
  */
  check("the move starts before paint, against the numbers just received",
    /React\.useLayoutEffect\(\(\) => \{\s*\n\s*const s = st\.current\s*\n\s*if \(s\.sig === sig\) return/.test(lines)
      && /\n\s*step\(\)\n/.test(lines),
    "an effect starts it one frame too late, which is what a cut to the new line looks like")
  check("and nothing but new numbers starts one: not a tab that changes nothing, not a refresh that brings the same",
    /const sig = JSON\.stringify\(\[target\.lines, target\.compared, left, right\]\)/.test(lines))
  check("it ends when the line arrives, not on a timer",
    /if \(k < 1\) s\.raf = requestAnimationFrame\(step\)/.test(lines) && !/setTimeout/.test(strip(lines)))
  check("a flat placeholder does not animate, because there is nothing to draw in: it lies on the floor at once, and the answer grows out of it",
    /if \(still \|\| \(loading && !was\)\) \{/.test(lines) && /lines: to\.lines\.map\(\(ys, k\) => fit\(was\?\.lines\[k\] \?\? \[\], ys\.length, floor\)\)/.test(lines))

  console.log("\nAnd the whole of it is driven in a browser")

  check("the probe mounts the real component in both states",
    /import \{ AnalyticsChartWithTooltip/.test(read("scripts/render-chart-skeleton.tsx"))
      && /isLoading=\{loading\}/.test(read("scripts/render-chart-skeleton.tsx")))
  check("with an empty series beside it, which is what was reported",
    /an empty series draws no dates and no line/.test(probe))
  check("and it says plainly what it cannot see",
    /WHAT THIS CAN AND CANNOT SEE/.test(probe) && /What it still cannot see is how smooth each frame\s*\n\s*is;/.test(probe),
    "a probe that quietly asserts less than it claims is worse than one that says so")
  /*
    It sees the growth now: it runs on a real clock (Puppeteer, not
    --virtual-time-budget, which starved requestAnimationFrame) and counts
    the shapes the line passes through, so a cut to the numbers fails.
  */
  check("on a real clock, counting the shapes the line grows through",
    /puppeteer\.launch\(/.test(probe) && !/--virtual-time-budget=\d/.test(probe) && /expect\(m\.steps >= 8,/.test(probe))

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) { console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`); process.exit(1) }
}
main()
