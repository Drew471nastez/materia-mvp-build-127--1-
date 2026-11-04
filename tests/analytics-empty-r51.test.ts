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
check("GhostLine: a faint shape, hidden from a screen reader, fading by opacity", /export function GhostLine/.test(empty) && /aria-hidden data-ghost-chart/.test(empty) && /transition-opacity duration-200/.test(empty))
const mini = read("components/analytics/trend-mini-chart.tsx")
check("the small trend charts draw it, with the line on the floor in grey (morph-lines' placeholder) and no readout", /const blank = !loading && nothingToDraw\(current, previous\)/.test(mini) && /loading=\{loading \|\| blank\}/.test(mini) && /disabled=\{loading \|\| blank \|\| n === 0\}/.test(mini))
const big = read("components/app/analytics-chart.tsx")
check("the figures' chart and the community's draw it too, its axis numbers faded out", /nothingToDraw\(\.\.\.lines, comparedLine\)/.test(big) && /loading=\{isLoading \|\| blank\}/.test(big) && /opacity: blank \? 0 : 1/.test(big))

console.log("\nThe sales cards")
const commerce = read("app/app/analytics/commerce-reports.tsx")
check("Average order value and Returning customer rate say their zero, the line where the change goes, a ghost at the right", /value: b \? money\(b\.orders \? b\.aov : 0\) : null/.test(commerce) && /value: b \? percentText\(b\.customers \? b\.returningRate : 0\) : null/.test(commerce) && /f\.blank \? <GhostLine shown className="absolute bottom-4 right-5 h-8 w-20" \/>/.test(commerce))
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
