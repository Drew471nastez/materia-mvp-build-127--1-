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
  RETIRED_PRESETS,
} from "@/lib/date-range/range"
import { readPeriod, writePeriod } from "@/lib/date-range/params"
import { rangeWindow, readOrdersPeriod, serializePeriod } from "@/lib/orders/range"
import { readMetrics } from "@/lib/orders/metrics"
import { ordersCsv, csvCell } from "@/app/(storelib)/app/orders/export-dialog"
import { untt } from "./i18n-source"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail?: string) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; failures.push(label + (detail ? ` — ${detail}` : "")); console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ""}`) }
}
const read = (p: string) => untt(readFileSync(join(process.cwd(), p), "utf8"), p)
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
  check("last 30 and 90 days", lengthOf(presetRange("last_30_days", today)) === 30 && lengthOf(presetRange("last_90_days", today)) === 90)
  check("last 12 months starts on the first of the month a year back", eq(presetRange("last_12_months", today), { start: "2025-10-01", end: today }))
  check("month to date starts on the first", eq(presetRange("month_to_date", today), { start: "2026-09-01", end: today }))
  check("all time starts at the first day there is", eq(presetRange("all_time", today, "2024-03-01"), { start: "2024-03-01", end: today }))
  const all = (Object.keys(PRESET_LABEL) as (keyof typeof PRESET_LABEL)[]).map((id) => presetRange(id, today))
  check("no preset reaches past today", all.every((r) => r.end <= today && r.start <= r.end))
  check("every preset is in the picker's menu", (Object.keys(PRESET_LABEL) as string[]).every((id) =>
    PRESET_MENU.flat().some((g) => g.kind === "item" && g.id === id)))
  /*
    THE LIST, on the owner's word: "get rid of the Quarters, Black Friday
    Cyber Monday, More periods things, Year to date". Every page draws this
    one menu, so this is every timeframe popover and sheet in /app.
  */
  check("the picker offers these periods and no others, in this order",
    PRESET_MENU.flat().map((g) => (g.kind === "item" ? g.id : g.kind)).join() ===
      "today,yesterday,last_7_days,last_30_days,last_90_days,last_12_months,month_to_date,all_time,custom")
  check("no row opens a list of its own", PRESET_MENU.flat().every((g) => g.kind === "item" || g.kind === "custom"))
  check("the removed periods are not presets any more",
    ["year_to_date", "q1", "q4", "bfcm", "bfcm_last_year", "last_week", "last_month", "last_quarter", "last_year", "week_to_date", "quarter_to_date", "last_365_days"]
      .every((id) => !(id in PRESET_LABEL) && RETIRED_PRESETS.includes(id)))

  console.log("\nA saved or linked period is read against today")
  check("a preset moves with the calendar", eq(resolveValue({ preset: "last_7_days", start: "2020-01-01", end: "2020-01-07" }, today), { preset: "last_7_days", ...presetRange("last_7_days", today) }))
  check("a custom range stays, ends put in order", eq(resolveValue({ preset: "custom", start: "2025-12-31", end: "2025-01-01" }, today), { preset: "custom", start: "2025-01-01", end: "2025-12-31" }))
  check("a custom range cannot end in the future", resolveValue({ preset: "custom", start: "2026-09-01", end: "2027-01-01" }, today).end === today)
  check("rubbish falls back to the page's default", resolveValue({ preset: "nonsense" as never }, today, "today").preset === "today")
  check("and so does a name every object has", resolveValue({ preset: "toString" as never }, today, "today").preset === "today")
  /*
    A LINK, A COOKIE OR A SAVED CHOICE THAT NAMES A REMOVED PERIOD opens on the
    last 30 days, whatever the page's own default is, and never throws.
  */
  check("a removed period in a saved choice opens on the last 30 days",
    ["year_to_date", "q2", "bfcm", "last_month", "last_365_days"].every((id) => {
      const v = resolveValue({ preset: id as never, start: "2026-01-01", end: "2026-03-31" }, today, "last_7_days")
      return v.preset === "last_30_days" && eq({ start: v.start, end: v.end }, presetRange("last_30_days", today))
    }))
  check("a removed period in an address opens on the last 30 days, the page's default aside",
    readPeriod(new URLSearchParams("range=year_to_date"), today, "last_7_days").period.preset === "last_30_days"
      && readPeriod(new URLSearchParams("range=q3&compare=previous_year"), today, "today").period.preset === "last_30_days"
      && readPeriod(new URLSearchParams("range=bfcm_last_year"), today, "last_7_days").period.preset === "last_30_days")
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
    && grainOf(presetRange("last_12_months", today)) === "week" && grainOf({ start: "2020-01-01", end: today }) === "month")

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
      && readOrdersPeriod(q(""), encodeURIComponent("custom:2025-02-10:2025-02-01"), today).period.start === "2025-02-01")
  check("and a cookie or link for a removed period opens on the last 30 days",
    readOrdersPeriod(q(""), "ytd", today).period.preset === "last_30_days"
      && readOrdersPeriod(q(""), "range=year_to_date&compare=previous_year", today).period.preset === "last_30_days"
      && readOrdersPeriod(q(""), "range=year_to_date&compare=previous_year", today).compare.mode === "previous_year"
      && readOrdersPeriod(q("range=last_quarter"), "range=today", today).period.preset === "last_30_days")
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
    ["analytics", "app/(storelib)/app/analytics/analytics-client.tsx"],
    ["the dashboard", "components/app/dashboard-client.tsx"],
    ["orders", "app/(storelib)/app/orders/orders-list.tsx"],
    ["payouts", "app/(storelib)/app/payouts/payouts-client.tsx"],
    ["emails", "app/(storelib)/app/emails/emails-home.tsx"],
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
    /const compare = PREVIOUS_PERIOD/.test(read("app/(storelib)/app/analytics/analytics-client.tsx"))
      && /const compare = PREVIOUS_PERIOD/.test(read("app/(storelib)/app/orders/orders-client.tsx"))
      && /const PREVIOUS_PERIOD: CompareValue = \{ mode: "previous_period" \}/.test(read("app/(storelib)/app/analytics/analytics-client.tsx"))
      && /const PREVIOUS_PERIOD: CompareValue = \{ mode: "previous_period" \}/.test(read("app/(storelib)/app/orders/orders-client.tsx")))
  check("analytics hides percentages with No comparison, and names what they compare with",
    /against === null(?: \|\| [a-z]+ === null)*\) return null/.test(read("app/(storelib)/app/analytics/analytics-client.tsx")) && /compared with \$\{against\}/.test(read("app/(storelib)/app/analytics/analytics-client.tsx")))
  /* The line and its comparison are drawn by components/app/morph-lines, which the chart hands the period before. */
  check("and draws the comparison as a dashed line under the chart's own",
    /strokeDasharray="5 4"/.test(read("components/app/morph-lines.tsx")) && /compared=\{comparedLine\}/.test(read("components/app/analytics-chart.tsx")))
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
  /* On a phone the page hears about the choice once the sheet has left (onClosed), as the website builder's sheets
     tell their page about a release once they have arrived: the page's redraw was in the frames of the slide down. */
  check("a preset applies at once and closes; the page catches up behind the close",
    /* Changed on purpose (round 43): an `overlay` picker (a popover in a block's stats) applies at once like `inline`. */
    /* Changed on purpose (round AT): on a phone an `overlay` picker is a sheet too, so it waits for its sheet to leave like the rest. */
    /const pick = \(v: RangeValue\) => \{\s*setOpen\(false\)\s*if \(phone && !inline\) \{\s*pendingPick\.current = v\s*return\s*\}\s*React\.startTransition\(\(\) => onChange\(v\)\)/.test(picker)
      && /const onSheetClosed = React\.useCallback\(\(\) => \{\s*setRestart\(\(n\) => n \+ 1\)\s*flushPick\(\)/.test(picker)
      && /if \(v\) React\.startTransition\(\(\) => onChangeRef\.current\(v\)\)/.test(picker)
      && /const preset = \(id: PresetId\) => onPick\(/.test(picker))
  check("Custom range is the last row, and a second step with Back and Apply",
    JSON.stringify(PRESET_MENU[PRESET_MENU.length - 1]) === JSON.stringify([{ kind: "custom" }])
      && /onOpen\("custom"\)/.test(picker) && /if \(key === "custom"\) \{\s*return \(\s*<RangePanel/.test(picker)
      && />\s*Back\s*</.test(picker) && />\s*Apply\s*</.test(picker))
  check("the picker draws no list inside the list: no group rows, no GroupList",
    !/GroupList|group:|groupDetail|Quarters|Black Friday|More periods|Year to date/.test(picker.replace(/\/\*[\s\S]*?\*\//g, ""))
      && !/"year_to_date"|"bfcm"|"q1"/.test(read("lib/date-range/range.ts").replace(/export const RETIRED_PRESETS[^=]*=\s*\[[\s\S]*?\]/, "")))
  check("the address hook keeps the period only: nothing on any page sets a comparison",
    !/setCompare|compare,/.test(read("components/app/use-period-params.ts")) && !/setCompare/.test(read("app/(storelib)/app/analytics/analytics-client.tsx")))
  check("a step moves by transform on the iOS curve, and the frame follows the arriving step's measured size",
    /@keyframes drp-in-next \{\s*from \{ opacity: 0; transform: translate3d/.test(css)
      && /\.drp-frame \{\s*transition:\s*width 240ms cubic-bezier\(0\.32, 0\.72, 0, 1\),\s*height 240ms cubic-bezier\(0\.32, 0\.72, 0, 1\);/.test(css)
      && /const ro = new ResizeObserver\(fit\)/.test(picker) && /export const STEP_MS = 240/.test(picker))
  /* Kept steps are out of sight (visibility), which also takes them out of the accessibility tree; no aria-hidden
     that changes, which is named under a :has() in the app's CSS (scripts/check-app-sheets-frames.mjs). */
  check("the step that is leaving is inert while it goes",
    /inert=\{!on\}/.test(picker) && /style=\{!on && !going \? \(compact \? STEP_AWAY_FULL : STEP_AWAY\) : undefined\}/.test(picker)
      && /const STEP_AWAY: React\.CSSProperties = \{ visibility: "hidden", contentVisibility: "hidden"/.test(picker) && /\{kept\.map\(\(k\) => \{/.test(picker))
  /* The phone's sheet is kept (keepMounted) and goes back to the list once it is out of sight (restart), rather than
     a new panel built on the tap that opens it. The popover and the inline picker still get a new one each time. */
  check("the sheet keeps its panel while it closes, and a new one opens each time",
    /* Changed on purpose (round AT): over another sheet (a block's stats) the period's sheet takes a layer above it. */
    /<BottomSheet isOpen=\{open\} onClose=\{\(\) => setOpen\(false\)\} title="Date range" keepMounted=\{onScreen\} onClosed=\{onSheetClosed\} zIndex=\{overlay \? OVERLAY_SHEET_Z : undefined\}>\s*<PickerPanel value=\{value\} today=\{today\} firstDay=\{firstDay\} compact onPick=\{pick\} restart=\{restart\} ahead=\{CUSTOM_AHEAD\} \/>/.test(picker)
      && /if \(restart !== lastRestart\) \{\s*setLastRestart\(restart\)\s*setStep\("list"\)/.test(picker)
      && !/\{open && panel\(/.test(picker) && /<PickerPanel key=\{session\}/.test(picker))
  check("days can be walked with the arrow keys", /ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7/.test(picker))
  check("and the rows of the list with up and down", /const step = \{ ArrowDown: 1, ArrowUp: -1 \}\[e\.key\]/.test(picker))
  check("every month is six rows, so changing month moves nothing below it",
    /while \(cells\.length < 42\) cells\.push\(null\)/.test(picker) && /gridTemplateRows: `repeat\(6, \$\{cell\}px\)`/.test(picker))
  check("a day is a 44px square on a phone",
    /const cell = compact \? 44 : 36/.test(picker) && /compact \? "h-11 w-11 text-\[16px\]"/.test(picker))
  /* The grid is kept and the slide is played on it (Web Animations), rather than a new grid per month with a CSS
     animation: a new grid was 42 days out of the page and 42 in on every tap (scripts/check-app-sheets-frames.mjs). */
  check("the month arrows are raised keys, and the months slide in from the side they were asked for",
    /const monthNav =/.test(picker) && /const from = `translate3d\(\$\{dir === 1 \? 14 : -14\}px, 0, 0\)`/.test(picker)
      && /el\.animate\(\[\{ opacity: 0\.35, transform: from \}, \{ opacity: 1, transform: "none" \}\], \{ duration: 220, easing: MONTH_EASE \}\)/.test(picker)
      && /\(prefers-reduced-motion: reduce\)"\)\.matches\) return/.test(picker) && !/key=\{`\$\{mo\.y\}-\$\{mo\.m\}`\}/.test(picker)
      && /prefers-reduced-motion: reduce\) \{\s*\.drp-frame \{ transition: none; \}\s*\.drp-in-next/.test(css))
  check("a sideways swipe across the days turns the month on a phone", /Math\.abs\(dx\) < 44 \|\| Math\.abs\(dx\) < Math\.abs\(dy\) \* 1\.5/.test(picker))
  {
    /* Over the pill, but the pill stays: it steps under the lowest overlay
       layer (40) rather than to 0, where the page's own positioned boxes
       painted over it and it disappeared. It is never hidden or faded for a
       sheet, and while one is open the scrim, not the pill, takes the tap. */
    check("every sheet on a phone goes over the nav pill, and the pill stays visible under it",
      /* The shared sheet says it is up on <html> (data-app-sheet-up), and the rule for other dialogs leaves its root out:
         a :has() on the root that changes its answer restyled the whole document (scripts/check-app-sheets-frames.mjs). */
      /html\[data-app-sheet-up\] \[data-app-nav-pill\],\s*\n\s*html\[data-modal-open\] \[data-app-nav-pill\],\s*\n\s*body\[data-scroll-locked\] \[data-app-nav-pill\] \{\s*\n\s*z-index: 39;/.test(css)
        /* What can take a tap is named, not `*`: a bare `*` restyled the whole document on every open and close,
           and `a, button` every link and button in it (scripts/check-app-sheets-frames.mjs), so it is the pill's
           `pointer-events-auto` parts alone, which the links and buttons inside them inherit from. */
        && /html\[data-app-sheet-up="open"\] \[data-app-nav-pill\] \.pointer-events-auto,[\s\S]{0,300}pointer-events: none !important;/.test(css)
        && !/\[data-app-nav-pill\] :is\(a, button/.test(css)
        && !/data-app-sheet[^{]*\[data-app-nav-pill\][^{]*\{[^}]*(opacity: 0|visibility: hidden|display: none|z-index: 0;)/.test(css))
    /* The pill used to step down to layer 0 while a sheet was open, which
       hid it behind the page before the sheet arrived and brought it back
       over the sheet as it left. It stays put now; the sheets are above it. */
    check("the overlays that sat at 50 are raised above the pill, the coupon confirm too",
      !/\[data-app-nav-pill\] \{\s*\n\s*z-index: 0;/.test(css)
        && /:is\(\[data-slot="sheet-overlay"\], \[data-slot="sheet-content"\], \[data-slot="alert-dialog-overlay"\], \[data-slot="alert-dialog-content"\]\) \{\s*z-index: 60;/.test(css)
        /* The coupon delete confirm draws its own layer, and it is above the pill (60 or more). */
        && /fixed inset-0 z-\[(6\d|[1-9]\d\d)\] flex/.test(read("app/(storelib)/app/coupons/coupons-client.tsx")))
    /* The phone sheets in these pages are the shared one now, which says it
       is open itself; what is left drawing its own layer is a centred modal
       that still has to say so. */
    const sheets: [string, number][] = [
      ["app/(storelib)/app/payouts/payouts-client.tsx", 1],
      /* The photo's upload and crop modals are gone: the photo changes in place (settings/profile-photo). */
      ["components/app/settings-form-new.tsx", 1],
      ["components/app/billing/billing-page-client.tsx", 0],
    ]
    /* The dashboard's share sheet and the new product's sheet are the
       shared one too, not drawn by hand. */
    const shared = ["app/(storelib)/app/payouts/payouts-client.tsx", "components/app/settings-form-new.tsx", "components/app/billing/billing-page-client.tsx", "components/app/notifications-modal.tsx", "components/app/mobile-account-menu.tsx", "components/app/share/share-storelib.tsx"]
    check("and the sheets pages draw for themselves say when they are open",
      sheets.every(([f, n]) => (read(f).match(/data-app-sheet="open"/g) ?? []).length === n)
        && /data-app-sheet=\{atRest \? undefined : isOpen \? "open" : "closing"\}/.test(read("components/ui/bottom-sheet.tsx"))
        && /role="dialog"\s*aria-modal="true"/.test(read("components/ui/bottom-sheet.tsx"))
        && shared.every((f) => /<BottomSheet\b/.test(read(f)) && !/translateY\(100%\)|translate3d\(0, ?100%, ?0\)/.test(read(f)))
        && /<ShareStorelib\b/.test(read("components/app/dashboard-client.tsx"))
        && /<BottomSheet\s+isOpen=\{sheetOpen\}\s+onClose=\{close\}[\s\S]{0,80}hideFrom="md"/.test(read("components/app/share/share-storelib.tsx"))
        && !/data-dashboard-sheet/.test(read("components/app/dashboard-client.tsx")))
  }
  check("a sheet takes focus when it opens and hands it back when it closes, without scrolling",
    /panel\.focus\(\{ preventScroll: true \}\)/.test(read("components/ui/bottom-sheet.tsx"))
      && /opener\.focus\(\{ preventScroll: true \}\)/.test(read("components/ui/bottom-sheet.tsx"))
      && /tabIndex=\{-1\}/.test(read("components/ui/bottom-sheet.tsx")))
  check("the old one-off modal is gone", !/date-range-picker-modal/.test(read("app/(storelib)/app/analytics/analytics-client.tsx")))
  check("the revenue chart's 30 days is 30 days, not 365", /case "30": \{\s*\/\* This fell through to 365 days\. \*\/\s*const start = new Date\(now\)\s*start\.setUTCDate\(start\.getUTCDate\(\) - 30\)/.test(read("app/api/stripe/revenue-chart/route.ts")))

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) { console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`); process.exit(1) }
}
main()
