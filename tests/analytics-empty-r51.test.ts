/**
 * ===========================================================================
 *  ROUND 51: EMPTY ANALYTICS CARDS, AND THE SEND ANALYTICS DIALOG CLOSING
 * ===========================================================================
 * Measured in Chromium by scripts/check-analytics-empty-r51.mjs (every card
 * empty and filled, the wait for an answer, switching types frame by frame)
 * and scripts/check-send-analytics.mjs (every frame of the dialog's close).
 * This pins the code that gives those numbers.
 *
 *   npx tsx --conditions=react-server tests/analytics-empty-r51.test.ts
 */
import { readFileSync } from "node:fs"
import { nothingToDraw } from "@/components/analytics/empty-state"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n        ${JSON.stringify(detail).slice(0, 400)}`}`)
}
const read = (p: string) => readFileSync(p, "utf8")

console.log("\nA chart with nothing to draw")
check("every point of every line at nothing is nothing to draw", nothingToDraw([0, 0, 0], [0, null, 0]) && nothingToDraw([], null))
check("one point anywhere is something", !nothingToDraw([0, 0, 1]) && !nothingToDraw([0, 0], [0, 3]))
const empty = read("components/analytics/empty-state.tsx")
/* Changed on purpose (round AL): the owner asked for the old flat purple line back, with no grey curve and no grid. GhostLine is gone; the list cards keep their ghost rows. */
check("no grey ghost curve is left to draw", !/export function GhostLine/.test(empty) && !/GHOST_PATH/.test(empty) && /export function GhostRows/.test(empty))
const mini = read("components/analytics/trend-mini-chart.tsx")
check("the small trend charts draw their own purple line flat on the floor, with no readout of zero", /const blank = !loading && nothingToDraw\(current, previous\)/.test(mini) && /loading=\{loading\} color=\{ACCENT\}/.test(mini) && !/GhostLine/.test(mini) && /disabled=\{loading \|\| blank \|\| n === 0\}/.test(mini))
const big = read("components/app/analytics-chart.tsx")
check("the figures' chart and the community's: purple line, no grid, axis numbers faded out", /nothingToDraw\(\.\.\.lines, comparedLine\)/.test(big) && /loading=\{isLoading\}\n\s*color=\{color\}/.test(big) && !/GhostLine/.test(big) && /grid=\{!blank\}/.test(big) && /\{grid \? \(\s*<CartesianGrid/.test(big) && /opacity: blank \? 0 : 1/.test(big))
const home = read("components/app/dashboard-client.tsx")
check("the home chart: the same rule, no grid and no axis numbers under a flat purple line", /const blank = !loading && displayChartData\.length > 0 && nothingToDraw\(lines\[0\]\)/.test(home) && /grid=\{!blank\}/.test(home) && /\{grid \? \(\s*<CartesianGrid/.test(home) && /color="#8b5cf6"/.test(home))

console.log("\nThe sales cards")
const commerce = read("app/(storelib)/app/analytics/commerce-reports.tsx")
/* Changed on purpose (round AL): no grey curve at the right of an empty figure card any more. */
check("Average order value and Returning customer rate say their zero, the line where the change goes, no grey curve", /value: b \? money\(b\.orders \? b\.aov : 0\) : null/.test(commerce) && /value: b \? percentText\(b\.customers \? b\.returningRate : 0\) : null/.test(commerce) && !/GhostLine/.test(commerce))
check("  no sentence where the figure goes", !/data-figure-empty/.test(commerce))
check("Total sales over time says what is missing over its ghost", /emptyText=\{metric === "total" \? tt\("No sales in this period\."\) : tt\("No orders in this period\."\)\}/.test(commerce))
check("the breakdown waits with its three lines and its columns, not all eight", /\(!!b && \(b\[r\.key\] as number\) !== 0\)/.test(commerce) && /kinds \|\| \(showKinds && !data\)/.test(commerce))
check("channels: as tall waiting as empty", /<div className="min-h-\[164px\]">/.test(commerce))

console.log("\nSend analytics, closing")
const send = read("components/app/analytics/send-analytics.tsx")
check("the dialog's list is in its content, not `open ? list : null`, so it stays while the dialog fades", /<div className="max-h-\[min\(72vh,640px\)\] overflow-y-auto px-2 py-2">\s*<AnalyticsDestinationsPanel \/>/.test(send))
check("the probes that measure it are there (run by hand: node scripts/check-*.mjs)", /closing/.test(read("scripts/check-send-analytics.mjs")) && /SWITCHING TYPES/.test(read("scripts/check-analytics-empty-r51.mjs")))

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
