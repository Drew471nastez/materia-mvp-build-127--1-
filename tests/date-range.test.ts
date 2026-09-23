/**
 * ===========================================================================
 *  ONE WAY TO PICK A PERIOD, ON EVERY /app PAGE
 * ===========================================================================
 * lib/date-range/range.ts is the one definition; components/app/
 * date-range-picker.tsx draws it; analytics, the dashboard, orders, payouts,
 * emails and the OnePage stats use it. What this pins:
 *
 *   the days      presets are whole days on the creator's clock, the last one
 *                 included; nothing reaches past today
 *   comparison    previous period, previous year, custom, none
 *   instants      a day in Bucharest starts at Bucharest's midnight, across DST
 *   the words     "Jan 1–Dec 31, 2025", typed dates read back
 *   the pages     every page draws the shared picker and no private copy
 *   the export    the orders CSV, for a spreadsheet and plain
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"

import {
  addDays,
  boundsOf,
  compareBounds,
  compareRange,
  daysBetween,
  grainOf,
  isYmd,
  lengthOf,
  midnightOf,
  minusYear,
  parseTyped,
  presetRange,
  rangeLabel,
  resolveValue,
  todayIn,
  valueLabel,
  PRESET_LABEL,
  PRESET_MENU,
} from "@/lib/date-range/range"
import { readPeriod, writePeriod } from "@/lib/date-range/params"
import { rangeWindow, readOrdersPeriod, serializePeriod } from "@/lib/orders/range"
import { readMetrics } from "@/lib/orders/metrics"
import { ordersCsv, csvCell } from "@/app/app/orders/export-dialog"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail?: string) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; failures.push(label + (detail ? ` — ${detail}` : "")); console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ""}`) }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

function main() {
  const today = "2026-09-23" // a Wednesday

  console.log("\nCalendar days")
  check("a real day is a day, and 31 February is not", isYmd("2024-02-29") && !isYmd("2025-02-29") && !isYmd("2025-02-31") && !isYmd("2025-1-1"))
  check("adding days crosses months and years", addDays("2025-12-31", 1) === "2026-01-01" && addDays("2026-03-01", -1) === "2026-02-28")
  check("days between, both ways", daysBetween("2025-01-01", "2025-12-31") === 364 && daysBetween("2025-12-31", "2025-01-01") === -364)
  check("a range's length counts both ends", lengthOf({ start: today, end: today }) === 1 && lengthOf({ start: "2026-09-17", end: today }) === 7)
  check("a year back from 29 February is the 28th", minusYear("2024-02-29") === "2023-02-28" && minusYear("2025-06-15") === "2024-06-15")

  console.log("\nPresets are whole days, and the last day counts")
  check("today and yesterday", eq(presetRange("today", today), { start: today, end: today }) && eq(presetRange("yesterday", today), { start: "2026-09-22", end: "2026-09-22" }))
  check("last 7 days is seven days, today included", lengthOf(presetRange("last_7_days", today)) === 7 && presetRange("last_7_days", today).end === today)
  check("last 30, 90 and 365 days", lengthOf(presetRange("last_30_days", today)) === 30 && lengthOf(presetRange("last_90_days", today)) === 90 && lengthOf(presetRange("last_365_days", today)) === 365)
  check("last week is the whole Sunday to Saturday before this one", eq(presetRange("last_week", today), { start: "2026-09-13", end: "2026-09-19" }))
  check("last month is all of August", eq(presetRange("last_month", today), { start: "2026-08-01", end: "2026-08-31" }))
  check("last quarter is April to June", eq(presetRange("last_quarter", today), { start: "2026-04-01", end: "2026-06-30" }))
  check("last quarter from January is last year's fourth", eq(presetRange("last_quarter", "2026-01-10"), { start: "2025-10-01", end: "2025-12-31" }))
  check("last year is 2025", eq(presetRange("last_year", today), { start: "2025-01-01", end: "2025-12-31" }))
  check("week, month, quarter and year to date", presetRange("week_to_date", today).start === "2026-09-20" && presetRange("month_to_date", today).start === "2026-09-01"
    && presetRange("quarter_to_date", today).start === "2026-07-01" && presetRange("year_to_date", today).start === "2026-01-01")
  check("Black Friday to Cyber Monday: last year's, before this year's has begun", eq(presetRange("bfcm", today), { start: "2025-11-28", end: "2025-12-01" }))
  check("and this year's once it has", eq(presetRange("bfcm", "2026-12-15"), { start: "2026-11-27", end: "2026-11-30" }))
  check("a quarter still to come is last year's", eq(presetRange("q4", today), { start: "2025-10-01", end: "2025-12-31" }))
  check("the quarter under way stops at today", eq(presetRange("q3", today), { start: "2026-07-01", end: today }))
  const all = (Object.keys(PRESET_LABEL) as (keyof typeof PRESET_LABEL)[]).map((id) => presetRange(id, today))
  check("no preset reaches past today", all.every((r) => r.end <= today && r.start <= r.end))
  check("every preset is in the picker's menu", (Object.keys(PRESET_LABEL) as string[]).every((id) =>
    PRESET_MENU.flat().some((g) => (g.kind === "item" && g.id === id) || (g.kind === "group" && (g.children as string[]).includes(id)))))

  console.log("\nA saved or linked period is read against today")
  check("a preset moves with the calendar", eq(resolveValue({ preset: "last_7_days", start: "2020-01-01", end: "2020-01-07" }, today), { preset: "last_7_days", ...presetRange("last_7_days", today) }))
  check("a custom range stays, ends put in order", eq(resolveValue({ preset: "custom", start: "2025-12-31", end: "2025-01-01" }, today), { preset: "custom", start: "2025-01-01", end: "2025-12-31" }))
  check("a custom range cannot end in the future", resolveValue({ preset: "custom", start: "2026-09-01", end: "2027-01-01" }, today).end === today)
  check("rubbish falls back to the page's default", resolveValue({ preset: "nonsense" as never }, today, "today").preset === "today")
  const params = new URLSearchParams("range=custom&from=2025-01-01&to=2025-12-31&compare=previous_year")
  const readBack = readPeriod(params, today, "last_30_days")
  check("the address holds the period and the comparison", readBack.period.start === "2025-01-01" && readBack.period.end === "2025-12-31" && readBack.compare.mode === "previous_year")
  const out = new URLSearchParams("mode=store")
  writePeriod(out, { preset: "last_30_days", ...presetRange("last_30_days", today) }, { mode: "previous_period" }, "last_30_days")
  check("and the defaults leave it clean", out.toString() === "mode=store")

  console.log("\nComparison")
  const year2025 = { start: "2025-01-01", end: "2025-12-31" }
  check("previous period is the same number of days, ending the day before (2024 had 366, so it starts on the 2nd)",
    eq(compareRange(year2025, { mode: "previous_period" }), { start: "2024-01-02", end: "2024-12-31" }))
  check("previous year is a year earlier", eq(compareRange({ start: "2026-03-01", end: "2026-03-31" }, { mode: "previous_year" }), { start: "2025-03-01", end: "2025-03-31" }))
  check("custom is what was chosen", eq(compareRange(year2025, { mode: "custom", range: { start: "2023-02-01", end: "2023-02-10" } }), { start: "2023-02-01", end: "2023-02-10" }))
  check("and none is none", compareRange(year2025, { mode: "none" }) === null)
  const tz = "Europe/Bucharest"
  const noon = midnightOf(today, tz) + 12 * 3_600_000
  const cb = compareBounds({ start: today, end: today }, { mode: "previous_period" }, tz, noon)
  check("today until noon is compared with yesterday until noon, not all of yesterday",
    cb !== null && cb.start === midnightOf("2026-09-22", tz) && cb.end - cb.start === 12 * 3_600_000)

  console.log("\nDays on the creator's clock")
  check("a Bucharest day starts at Bucharest's midnight", new Date(midnightOf("2026-01-15", tz)).toISOString() === "2026-01-14T22:00:00.000Z"
    && new Date(midnightOf("2026-07-15", tz)).toISOString() === "2026-07-14T21:00:00.000Z")
  const dstDay = boundsOf({ start: "2026-03-29", end: "2026-03-29" }, tz)
  check("the day the clocks go forward is 23 hours long", dstDay.end - dstDay.start === 23 * 3_600_000)
  const b = boundsOf({ start: "2025-01-01", end: "2025-12-31" }, "UTC")
  check("a range ends at the first moment after its last day", new Date(b.end).toISOString() === "2026-01-01T00:00:00.000Z")
  check("and today ends now", boundsOf({ start: today, end: today }, "UTC", Date.parse("2026-09-23T10:00:00Z")).end === Date.parse("2026-09-23T10:00:00Z"))
  check("today is today in that zone", todayIn("Pacific/Kiritimati", Date.parse("2026-09-23T12:00:00Z")) === "2026-09-24" && todayIn("UTC", Date.parse("2026-09-23T12:00:00Z")) === today)

  console.log("\nWords")
  check("one year written once", rangeLabel(year2025) === "Jan 1–Dec 31, 2025")
  check("across years, each end its own", rangeLabel({ start: "2024-12-28", end: "2025-01-03" }) === "Dec 28, 2024–Jan 3, 2025")
  check("one month, one day", rangeLabel({ start: "2025-03-04", end: "2025-03-09" }) === "Mar 4–9, 2025" && rangeLabel({ start: "2025-03-04", end: "2025-03-04" }) === "Mar 4, 2025")
  check("a preset is called by its name", valueLabel({ preset: "last_30_days", ...presetRange("last_30_days", today) }) === "Last 30 days")
  check("a typed date is read in the ways people write it", parseTyped("January 1, 2025") === "2025-01-01" && parseTyped("Jan 1 2025") === "2025-01-01"
    && parseTyped("2025-01-01") === "2025-01-01" && parseTyped("1/31/2025") === "2025-01-31" && parseTyped("2025/1/5") === "2025-01-05")
  check("and a date that is not one is not", parseTyped("February 30, 2025") === null && parseTyped("soon") === null && parseTyped("") === null)
  check("a chart's buckets suit the length", grainOf({ start: today, end: today }) === "hour" && grainOf(presetRange("last_30_days", today)) === "day"
    && grainOf(presetRange("last_365_days", today)) === "week" && grainOf({ start: "2020-01-01", end: today }) === "month")

  console.log("\nOrders: any range, any comparison")
  const now = Date.parse("2026-09-23T15:00:00Z")
  const last7 = { preset: "last_7_days" as const, ...presetRange("last_7_days", today) }
  const w = rangeWindow(last7, { mode: "previous_period" }, now, "UTC")
  check("seven days up to now, compared with the same stretch just before",
    w.start === Date.parse("2026-09-17T00:00:00Z") && w.end === now && w.previous !== null && w.previous.start === w.start - 7 * 86_400_000 && w.previous.end - w.previous.start === w.end - w.start)
  const lastYear = rangeWindow(last7, { mode: "previous_year" }, now, "UTC")
  check("previous year is the same days a year back", lastYear.previous?.start === Date.parse("2025-09-17T00:00:00Z"))
  check("with no comparison there is no previous window", rangeWindow(last7, { mode: "none" }, now, "UTC").previous === null)
  const allTime = { preset: "all_time" as const, ...presetRange("all_time", today, "2024-03-01") }
  check("all time starts at the first order and is compared with nothing",
    rangeWindow(allTime, { mode: "previous_period" }, now, "UTC").start === Date.parse("2024-03-01T00:00:00Z") && rangeWindow(allTime, { mode: "previous_period" }, now, "UTC").previous === null)
  const none = rangeWindow(last7, { mode: "none" }, now, "UTC")
  check("and no percentage change", readMetrics([], none, none.previous, "UTC").every((r) => r.change === null))
  const q = (s: string) => new URLSearchParams(s)
  check("the dates last looked at come back from the cookie", readOrdersPeriod(q(""), serializePeriod(last7, { mode: "previous_year" }), today).period.preset === "last_7_days"
    && readOrdersPeriod(q(""), serializePeriod(last7, { mode: "previous_year" }), today).compare.mode === "previous_year")
  check("a link wins over the cookie, part by part",
    readOrdersPeriod(q("range=today"), "range=last_7_days&compare=none", today).period.preset === "today"
      && readOrdersPeriod(q("range=today"), "range=last_7_days&compare=none", today).compare.mode === "none"
      && readOrdersPeriod(q("compare=previous_year"), "range=last_7_days", today).period.preset === "last_7_days")
  check("older links and cookies still open what they meant",
    readOrdersPeriod(q("range=30d"), null, today).period.preset === "last_30_days"
      && readOrdersPeriod(q("period=7d"), null, today).period.preset === "last_7_days"
      && readOrdersPeriod(q(""), "ytd", today).period.preset === "year_to_date"
      && readOrdersPeriod(q(""), encodeURIComponent("custom:2025-02-10:2025-02-01"), today).period.start === "2025-02-01")
  check("the last 30 days when nothing says otherwise, and junk is nothing",
    readOrdersPeriod(q(""), null, today).period.preset === "last_30_days" && readOrdersPeriod(q("range=forever"), "%E0%A4%A", today).period.preset === "last_30_days")
  check("the default is stored as nothing", serializePeriod({ preset: "last_30_days", ...presetRange("last_30_days", today) }, { mode: "previous_period" }) === "")

  console.log("\nThe orders export")
  const order = {
    id: "o1", number: 1001, createdAt: "2026-09-23T10:05:00Z",
    lines: [{ product: { title: "Zoë's =Pack" } }], customerName: "=HYPERLINK(\"x\")", customerEmail: "a@b.co", source: "website",
    subtotalCents: 1000, tipCents: 0, totalCents: 1000, feeCents: 0, refundedCents: 0, itemCount: 1,
    payment: "paid", fulfillment: "fulfilled", delivery: "delivered", deliveredAt: null,
  } as never
  const excel = ordersCsv([order], "UTC", "spreadsheet")
  const plain = ordersCsv([order], "UTC", "plain")
  check("for a spreadsheet: a byte order mark and CRLF", excel.startsWith("﻿") && excel.includes("\r\n"))
  check("plain: neither", !plain.startsWith("﻿") && !plain.includes("\r"))
  check("a cell that would run as a formula is written as text", plain.includes(`"'=HYPERLINK(""x"")"`) && csvCell("=1+1") === `"'=1+1"`)
  check("accented names survive", plain.includes("Zoë"))
  check("dates in the creator's zone, money in units", plain.includes("2026-09-23 10:05") && plain.includes('"10.00"'))

  console.log("\nEvery page uses the one picker")
  const pages: [string, string][] = [
    ["analytics", "app/app/analytics/analytics-client.tsx"],
    ["the dashboard", "components/app/dashboard-client.tsx"],
    ["orders", "app/app/orders/orders-list.tsx"],
    ["payouts", "app/app/payouts/payouts-client.tsx"],
    ["emails", "app/app/emails/page.tsx"],
    ["OnePage stats", "components/onepage/tabs/links-tab.tsx"],
  ]
  for (const [name, file] of pages) {
    const src = read(file)
    check(`${name} draws <DateRangePicker>`, /<DateRangePicker\b/.test(src))
  }
  check("and no page keeps a private list of presets or its own sheet",
    pages.every(([, f]) => !/timeframeOptions|CHART_TIMEFRAMES|statsTimeframeOptions|TimeframeBottomSheet|ChartTimeframeSheet|AnalyticsTimeframeSheet/.test(read(f))))
  /*
    THE COMPARISON CONTROL IS GONE, on the owner's word: "get rid of the
    comparison selector". Both pages still compare, always with the period
    just before, and neither lets an old ?compare= link hide the changes.
  */
  check("no page draws a comparison control, and the shared picker no longer has one",
    pages.every(([, f]) => !/<ComparePicker\b/.test(read(f))) && !/export function ComparePicker/.test(read("components/app/date-range-picker.tsx")))
  check("analytics and orders measure every change against the period just before",
    /const compare = PREVIOUS_PERIOD/.test(read("app/app/analytics/analytics-client.tsx"))
      && /const compare = PREVIOUS_PERIOD/.test(read("app/app/orders/orders-client.tsx"))
      && /const PREVIOUS_PERIOD: CompareValue = \{ mode: "previous_period" \}/.test(read("app/app/analytics/analytics-client.tsx"))
      && /const PREVIOUS_PERIOD: CompareValue = \{ mode: "previous_period" \}/.test(read("app/app/orders/orders-client.tsx")))
  check("analytics hides percentages with No comparison, and names what they compare with",
    /against === null\) return null/.test(read("app/app/analytics/analytics-client.tsx")) && /compared with \$\{against\}/.test(read("app/app/analytics/analytics-client.tsx")))
  check("and draws the comparison as a dashed line under the chart's own", /strokeDasharray="5 4"/.test(read("components/app/analytics-chart.tsx")))
  const picker = read("components/app/date-range-picker.tsx")
  check("the picker is a popover on a computer, a sheet on a phone, and in place inside a dialog",
    /<PopoverContent/.test(picker) && /<BottomSheet/.test(picker) && /if \(inline\)/.test(picker))
  /*
    THE PICKER IS TWO STEPS, on the owner's word: "not with the custom range
    inside the bottom sheet". It opens on a list; a row applies and closes;
    Custom range is a second step and only that step waits for Apply.
    Geometry and motion are measured in Chromium (no node appears and then
    vanishes other than the step that is leaving, no month changes the
    height); what is held here is the shape that produced those numbers.
  */
  const css = read("app/globals.css")
  check("the button says the period and nothing else: no calendar icon",
    !/CalendarDays|CalendarRange/.test(picker) && /<span className="tabular-nums">\{valueLabel\(value\)\}<\/span>/.test(picker))
  check("a preset applies at once and closes; the page catches up behind the close",
    /const pick = \(v: RangeValue\) => \{\s*setOpen\(false\)\s*React\.startTransition\(\(\) => onChange\(v\)\)/.test(picker)
      && /const preset = \(id: PresetId\) => onPick\(/.test(picker))
  check("Custom range is the last row, and a second step with Back and Apply",
    JSON.stringify(PRESET_MENU[PRESET_MENU.length - 1]) === JSON.stringify([{ kind: "custom" }])
      && /onOpen\("custom"\)/.test(picker) && /if \(key === "custom"\) \{\s*return \(\s*<RangePanel/.test(picker)
      && />\s*Back\s*</.test(picker) && />\s*Apply\s*</.test(picker))
  check("the rarer periods sit behind a row of their own",
    PRESET_MENU.flat().filter((g) => g.kind === "group").map((g) => (g as { label: string }).label).join() === "Quarters,Black Friday Cyber Monday,More periods")
  check("a step moves by transform on the iOS curve, and the frame follows the arriving step's measured size",
    /@keyframes drp-in-next \{\s*from \{ opacity: 0; transform: translate3d/.test(css)
      && /\.drp-frame \{\s*transition:\s*width 240ms cubic-bezier\(0\.32, 0\.72, 0, 1\),\s*height 240ms cubic-bezier\(0\.32, 0\.72, 0, 1\);/.test(css)
      && /const ro = new ResizeObserver\(fit\)/.test(picker) && /export const STEP_MS = 240/.test(picker))
  check("the step that is leaving is inert while it goes",
    /inert=\{!on\}/.test(picker) && /aria-hidden=\{on \? undefined : true\}/.test(picker))
  check("the sheet keeps its panel while it closes, and a new one opens each time",
    /<BottomSheet isOpen=\{open\} onClose=\{\(\) => setOpen\(false\)\} title="Date range">\s*\{panel\}/.test(picker)
      && !/\{open && panel\(/.test(picker) && /<PickerPanel key=\{session\}/.test(picker))
  check("days can be walked with the arrow keys", /ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7/.test(picker))
  check("and the rows of the list with up and down", /const step = \{ ArrowDown: 1, ArrowUp: -1 \}\[e\.key\]/.test(picker))
  check("every month is six rows, so changing month moves nothing below it",
    /while \(cells\.length < 42\) cells\.push\(null\)/.test(picker) && /gridTemplateRows: `repeat\(6, \$\{cell\}px\)`/.test(picker))
  check("a day is a 44px square on a phone",
    /const cell = compact \? 44 : 36/.test(picker) && /compact \? "h-11 w-11 text-\[16px\]"/.test(picker))
  check("the month arrows are raised keys, and the months slide in from the side they were asked for",
    /const monthNav =/.test(picker) && /drp-month-next/.test(picker) && /drp-month-back/.test(picker)
      && /@keyframes drp-month-next/.test(css) && /prefers-reduced-motion: reduce\) \{\s*\.drp-frame \{ transition: none; \}\s*\.drp-in-next/.test(css))
  check("a sideways swipe across the days turns the month on a phone", /Math\.abs\(dx\) < 44 \|\| Math\.abs\(dx\) < Math\.abs\(dy\) \* 1\.5/.test(picker))
  {
    check("every sheet on a phone goes over the nav pill",
      /html:has\(\[data-app-sheet="open"\]\) \[data-app-nav-pill\],\s*\n\s*html:has\(\[role="dialog"\]\[aria-modal="true"\]:not\(\[data-mobile-menu\]\)\) \[data-app-nav-pill\],\s*\n\s*html:has\(body\[data-scroll-locked\]\) \[data-app-nav-pill\] \{\s*\n\s*z-index: 0;/.test(css))
    const sheets: [string, number][] = [
      ["app/app/payouts/payouts-client.tsx", 4],
      ["components/app/settings-form-new.tsx", 3],
      ["components/app/billing/billing-page-client.tsx", 1],
    ]
    check("and the sheets pages draw for themselves say when they are open",
      sheets.every(([f, n]) => (read(f).match(/data-app-sheet="open"/g) ?? []).length === n)
        && /data-app-sheet=\{isVisible \? "open" : undefined\}/.test(read("components/app/dashboard-client.tsx"))
        && /data-app-sheet=\{isVisible \? "open" : undefined\}/.test(read("components/app/notifications-modal.tsx")))
  }
  check("the old one-off modal is gone", !/date-range-picker-modal/.test(read("app/app/analytics/analytics-client.tsx")))
  check("the revenue chart's 30 days is 30 days, not 365", /case "30": \{\s*\/\* This fell through to 365 days\. \*\/\s*const start = new Date\(now\)\s*start\.setUTCDate\(start\.getUTCDate\(\) - 30\)/.test(read("app/api/stripe/revenue-chart/route.ts")))

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) { console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`); process.exit(1) }
}
main()
