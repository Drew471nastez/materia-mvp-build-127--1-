/**
 * ===========================================================================
 *  ROUND 49: ANALYTICS, SMALLER, CALMER, QUICKER
 * ===========================================================================
 * The owner, with screenshots of /app Analytics:
 *
 *   1. MODAL   the opened chart "too big ... the scrollbar is clunky": at most
 *              720px by 640px, a quiet header with no rule, the body scrolling
 *              under a fade with no bar, in and out by a 200ms/180ms scale and
 *              fade (transform and opacity only), rows with no rule between
 *              them; a sheet on a phone. Opening a sales card renders the
 *              panel only (CommerceDetail), not every sales card.
 *   2. AXIS    "the left column of vertical axis numbers takes too much
 *              space": the numbers sit inside the plot on their grid lines,
 *              abbreviated, the floor's 0 left out, and no gutter.
 *   3. SEND    "options and icons appear slowly": the six tools are a static
 *              list drawn at once, their marks inline SVG, only where each
 *              stands waits, as a faint bar of its line's height; the read is
 *              started as a pointer or a finger reaches the button.
 *   4. HEAD    Export and Send to: icons in circles on the heading's line,
 *              aria-label and a tooltip, out of the filter row.
 *   5. EMPTY   no "–" on an empty card: one short line and ghost rows
 *              (components/analytics/empty-state), every new line translated.
 *
 * The geometry, the timing and the long tasks are measured in Chromium by
 * scripts/check-analytics-r49.mjs; this pins the code that gives them.
 *
 *   npx tsx tests/analytics-r49.test.ts
 */
import { readFileSync } from "node:fs"
import * as React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { EmptyState, GhostRows } from "../components/analytics/empty-state"
import { AxisLabels } from "../components/app/chart-morph"
import { compactCount } from "../lib/analytics/chart-scale"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${label}`)
  } else {
    failed++
    failures.push(label)
    console.log(`  FAIL  ${label}${detail !== undefined ? ` (${JSON.stringify(detail)})` : ""}`)
  }
}
const read = (p: string) => readFileSync(p, "utf8")

const detail = read("app/(storelib)/app/analytics/report-detail.tsx")
const css = read("app/globals.css")
const chart = read("components/app/analytics-chart.tsx")
const morph = read("components/app/chart-morph.tsx")
const send = read("components/app/analytics/send-analytics.tsx")
const head = read("components/app/analytics/head-button.tsx")
const exp = read("app/(storelib)/app/analytics/export-button.tsx")
const client = read("app/(storelib)/app/analytics/analytics-client.tsx")
const reports = read("app/(storelib)/app/analytics/analytics-reports.tsx")
const commerce = read("app/(storelib)/app/analytics/commerce-reports.tsx")

console.log("\n1. MODAL")
check("at most 720px wide and 640px (78% of a short window) tall", /max-h-\[min\(78dvh,640px\)\] w-\[min\(720px,calc\(100vw-48px\)\)\]/.test(detail))
check("the header has no rule under it, a 16px title and a quiet date line", /data-detail-head=""/.test(detail) && !/border-b border-\[#eef0f2\] px-6 pb-4 pt-5/.test(detail) && /DialogTitle className="truncate text-\[16px\]/.test(detail))
check("the body scrolls under a fade with no bar", /className="detail-scroll /.test(detail) && /\.detail-scroll \{\s*scrollbar-width: none;/.test(css) && /\.detail-scroll::-webkit-scrollbar \{ width: 0; height: 0; \}/.test(css) && /mask-image: linear-gradient\(to bottom, transparent 0, #000 var\(--fade-t\)/.test(css))
check("the fade follows the scroll from a passive listener, no React state per scroll", /function useScrollFade\(el: HTMLDivElement \| null\)/.test(detail) && /addEventListener\("scroll", queue, \{ passive: true \}\)/.test(detail) && /toggleAttribute\("data-fade-top", top\)/.test(detail))
{
  const inK = /@keyframes analytics-detail-in \{([^}]*\}[^}]*)\}/.exec(css)?.[1] ?? ""
  const outK = /@keyframes analytics-detail-out \{([^}]*\}[^}]*)\}/.exec(css)?.[1] ?? ""
  const props = (k: string) => [...new Set([...k.matchAll(/([a-z-]+):/g)].map((m) => m[1]))].sort().join(",")
  check("in and out animate transform and opacity only", props(inK) === "opacity,transform" && props(outK) === "opacity,transform", [props(inK), props(outK)])
  check("a scale and fade, no slide", /scale\(0\.96\)/.test(inK) && !/translate/.test(inK) && !/translate/.test(outK))
  const ms = (state: string) => Number(new RegExp(`\\.analytics-detail\\[data-state="${state}"\\] \\{ animation: analytics-detail-(?:in|out) (\\d+)ms`).exec(css)?.[1])
  check("opens in 200ms and closes in 180ms (180 to 220)", ms("open") === 200 && ms("closed") === 180, [ms("open"), ms("closed")])
}
check("rows with no rule between them, a hairline under the heads", /<tbody>/.test(detail) && !/divide-y divide-\[#f1f2f4\] border-t/.test(detail) && /h-8 border-b border-\[#f1f2f4\] text-left/.test(detail))
check("nothing then and nothing now is an empty change cell, not a dash", /if \(before === 0\) return now > 0 \? \{ text: tt\("New"\), tone: "flat" \} : null/.test(detail))
check("on a phone, the shared bottom sheet", /if \(phone\) \{\s*return \(\s*<BottomSheet/.test(detail))
check("opening a sales card renders the panel alone: its state is CommerceDetail's", /function CommerceDetail\(/.test(commerce) && /<CommerceDetail opener=\{opener\}/.test(commerce) && /const openDetail = React\.useCallback\(\(id: string\) => opener\.current\?\.\(/.test(commerce) && !/const \[detailOpen, setDetailOpen\]/.test(commerce))

console.log("\n2. AXIS")
check("the trend chart keeps no gutter for its numbers", /const PLOT_LEFT = 0/.test(chart) && /const plotLeft = PLOT_LEFT/.test(chart) && !/axisWidth\(/.test(chart))
check("its numbers are drawn inside the plot, over the line", /<AxisLabels labels=\{axisLabels\} top=\{PLOT_TOP\} height=\{plotHeight\} width=\{plotLeft\} inside \/>/.test(chart) && chart.indexOf("<AxisLabels") > chart.indexOf("<MorphLines"))
check("with room above the top line for its number", /const PLOT_TOP = 18/.test(chart))
{
  const html = renderToStaticMarkup(React.createElement(AxisLabels, { labels: ["0", "1.2k", "2.4k", "3.6k"], top: 18, height: 158, width: 0, inside: true }))
  const spans = [...html.matchAll(/<span[^>]*style="([^"]*)"[^>]*>([^<]*)<\/span>/g)]
  check("inside: the floor's 0 is left out, three numbers stay", spans.length === 3 && !spans.some((m) => m[2] === "0"), spans.map((m) => m[2]))
  check("each at the plot's left, above its own line, with a white halo", spans.every((m) => /left:0/.test(m[1]) && /text-shadow/.test(m[1])) && /data-chart-axis="inside"/.test(html))
  const top = (i: number) => Number(/top:(-?[\d.]+)px/.exec(spans[i][1])?.[1])
  check("the top number sits just above the top line (within 16px)", top(2) >= 0 && 18 - top(2) <= 16, top(2))
}
check("numbers are abbreviated (1.2k)", compactCount(1200) === "1.2k" && compactCount(12000) === "12k")
check("the axis outside the plot is still there for the home chart", /data-chart-axis className="pointer-events-none absolute left-0 top-0"/.test(morph) && /inside = false/.test(morph))

console.log("\n3. SEND")
check("the six tools are a static list", /export const ROWS: RowId\[\] = \["ga4", "meta", "google_ads", "posthog", "webhook", "api"\]/.test(send))
check("their marks are inline SVG, not fetched images", /const MARK_PATH: Partial<Record<RowId, \{ fill: string; d: string \}>>/.test(send) && !/<img /.test(send) && !/\/integrations\/google-analytics\.svg/.test(send))
check("the list is drawn before the answer: no empty box while it waits", !/data-destinations-loading/.test(send) && !/if \(!answer\) return/.test(send) && /data-destinations-state=\{answer \? "ready" : failed \? "failed" : "loading"\}/.test(send))
check("only where each stands waits, as a bar of its line's height", /function StatusPending\(\)[\s\S]*?h-\[18px\]/.test(send) && /block h-\[18px\] truncate text-\[12\.5px\] leading-\[18px\]/.test(send))
check("the read starts as a pointer, a finger or the keyboard reaches the button, and is taken once", /onPointerEnter=\{warmDestinations\}/.test(send) && /onPointerDown=\{warmDestinations\}/.test(send) && /onFocus=\{warmDestinations\}/.test(send) && /function takeDestinations\(\)[\s\S]*?warm = null/.test(send))
/* Changed on purpose (round 49, merge with auth): the failure line is calm grey with Try again, still above the list that stays. */
check("a failed read keeps the list and says so above it, calmly, with Try again", /\{failed \? \(\s*<div className="mx-3 mb-2 flex[^"]*bg-\[#f8f9fa\]/.test(send) && /setAttempt\(\(n\) => n \+ 1\)/.test(send) && /<ul className="divide-y/.test(send))

console.log("\n4. HEAD")
{
  const headRow = client.slice(client.indexOf('data-analytics-head=""'), client.indexOf("data-analytics-controls"))
  const controls = client.slice(client.indexOf('data-analytics-controls=""'), client.indexOf('data-analytics-controls=""') + 2500)
  check("Send to and Export are on the heading's line, at its right", /justify-between gap-3" data-analytics-head=""/.test(client) && /<SendAnalyticsButton \/>\s*<ExportButton/.test(headRow))
  check("and no longer in the filter row", !/<ExportButton|<SendAnalyticsButton/.test(controls))
}
check("each an icon in a 36px circle, named by aria-label and a tooltip", /aria-label=\{label\}/.test(head) && /<TooltipContent side="bottom"/.test(head) && /grid h-9 w-9 /.test(head) && /rounded-full/.test(head))
check("Export says no word on screen", /<HeadIconButton label=\{tt\("Export"\)\}/.test(exp) && !/<span className="hidden sm:inline">\{tt\("Export"\)\}<\/span>/.test(exp))
check("Send to says no word on screen", /<HeadIconButton\s+label=\{tt\("Send analytics"\)\}/.test(send) && !/<span className="hidden sm:inline">\{tt\("Send to"\)\}<\/span>/.test(send))

console.log("\n5. EMPTY")
{
  const html = renderToStaticMarkup(React.createElement(EmptyState, { children: "No referrers in this period." }))
  check("an empty card is one line and ghost rows", /<p[^>]*>No referrers in this period\.<\/p>/.test(html) && /data-empty-ghost=""/.test(html) && !/text-center/.test(html))
  const ghost = renderToStaticMarkup(React.createElement(GhostRows))
  check("the ghosts are blank, hidden from a screen reader, no numbers", /aria-hidden="true"/.test(ghost) && !/\d<\/span>/.test(ghost) && (ghost.match(/<span/g) ?? []).length === 4)
  const bare = renderToStaticMarkup(React.createElement(EmptyState, { ghost: "none", children: "Downloads could not be read." }))
  check("an error is the line alone", !/data-empty-ghost/.test(bare))
}
check("the report cards' empty lists use it", /function Empty\(\{ children, ghost = "rows" \}[\s\S]*?<EmptyState ghost=\{ghost\}>/.test(reports))
check("Average order value and Returning customer rate say so in words, not a dash", /<FigureEmpty>\{tt\("No orders in this period\."\)\}<\/FigureEmpty>/.test(commerce) && /<FigureEmpty>\{tt\("No customers in this period\."\)\}<\/FigureEmpty>/.test(commerce) && !/b\.orders \? money\(b\.aov\) : "–"\) : null/.test(commerce))
check("Total sales by channel: the line and ghost rows", /<EmptyState>\{tt\("No sales in this period\."\)\}<\/EmptyState>/.test(commerce))
check("no dash beside a figure that was nothing before and is nothing now", /if \(before === 0\) return now > 0 \? <span className="text-\[12px\] text-\[#9ca3af\]">\{tt\("New"\)\}<\/span> : null/.test(commerce))
check("short plain lines", /empty=\{tt\("No referrers in this period\."\)\}/.test(reports) && /empty=\{tt\("No page views in this period\."\)\}/.test(reports) && !/Share your link to bring some in/.test(reports))
{
  const lines = ["No referrers in this period.", "No page views in this period.", "No link taps in this period.", "No sign-ups in this period.", "No visits from social apps in this period.", "No visits from tagged links in this period.", "No orders in this period.", "No customers in this period."]
  const missing: string[] = []
  for (const lang of ["de", "es", "fr", "it", "pl", "pt-BR"]) {
    const cat = read(`lib/i18n/catalog/${lang}.ts`)
    for (const l of lines) if (!cat.includes(`${JSON.stringify(l)}:`)) missing.push(`${lang}: ${l}`)
  }
  check("every new line is in all six languages", missing.length === 0, missing)
}
{
  const copy = [send, head, exp, reports, commerce, detail, read("components/analytics/empty-state.tsx")].join("\n")
  const ui = [...copy.matchAll(/tt\("([^"]*)"/g)].map((m) => m[1])
  check("no em dash and none of the banned words in the copy", !ui.some((t) => /—|\b(unlock|elevate|seamless|powerful|effortless(ly)?|supercharge|transform)\b/i.test(t)))
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) {
  console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
  process.exit(1)
}
process.exit(0)
