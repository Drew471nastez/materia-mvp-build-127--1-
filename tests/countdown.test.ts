/**
 * An imported theme's countdown: one calendar, time and time zone for its
 * end_date / end_hour / end_minute / utc_offset, end_iso or countdown_date
 * settings, each written back in the shape it was stored in
 * (lib/storelib-theme/countdown.ts, components/website-builder/editor/
 * controls/countdown-control.tsx). The canvas and the published page read
 * the same deadline (lib/storelib-theme/compat/filters.ts toDate), and a
 * countdown edit starts that countdown again, not its section
 * (canvas-bridge.ts; scripts/check-countdown-restart.mjs measures it).
 *
 *   npx tsx tests/countdown.test.ts
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"

import {
  countdownGroup,
  daylightHint,
  deadlineOf,
  deadlineSentence,
  deadlineWords,
  formatOffset,
  formatStamp,
  instantOf,
  isLeapYear,
  isRealDate,
  parseOffset,
  parseStamp,
  readCountdown,
  writeCountdown,
  zoneOffsetAt,
  type CountdownFieldLike,
} from "../lib/storelib-theme/countdown"
import { CompatTheme, wrapCompatTemplate } from "../lib/storelib-theme/compat/theme"
import { drawPage, drawSection, pageContextFor, type StoredSection } from "../lib/storelib-theme/compat/page"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n        ${JSON.stringify(detail).slice(0, 500)}`}`)
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const Z = (s: string) => Date.parse(s)

/* The usual Shopify shape: a text date, two ranges and a select of offsets. */
const SPLIT: CountdownFieldLike[] = [
  { id: "heading", type: "text", default: "Sale ends in" },
  { id: "end_date", type: "text", label: "End date", default: "2026-12-31" },
  { id: "end_hour", type: "range", min: 0, max: 23, step: 1, default: 0 },
  { id: "end_minute", type: "range", min: 0, max: 59, step: 1, default: 0 },
  { id: "utc_offset", type: "select", default: "+2", options: ["-5", "0", "+1", "+2", "+3", "+5.5"].map((v) => ({ value: v, label: `UTC${v === "0" ? "" : v}` })) },
]
const BUCHAREST = { timeZone: "Europe/Bucharest", offsetAt: (t: number) => zoneOffsetAt("Europe/Bucharest", t) }

console.log("\nWhich settings are a countdown\n")
{
  const g = countdownGroup(SPLIT)
  check("end_date, end_hour, end_minute and utc_offset are one countdown, drawn at end_date", g?.source === "date" && g.lead === "end_date" && JSON.stringify(g.absorbed) === JSON.stringify(["end_hour", "end_minute", "utc_offset"]), g)
  check("  the heading is left to its own control", !g?.absorbed.includes("heading"))
  const iso = countdownGroup([{ id: "end_iso", type: "text" }])
  check("end_iso alone is one", iso?.source === "iso" && iso.lead === "end_iso" && iso.absorbed.length === 0, iso)
  const combined = countdownGroup([{ id: "utc_offset", type: "text" }, { id: "countdown_date", type: "text" }])
  check("countdown_date with an offset before it: drawn where the offset was", combined?.source === "combined" && combined.lead === "utc_offset" && JSON.stringify(combined.absorbed) === JSON.stringify(["countdown_date"]), combined)
  check("end_date with end_time", countdownGroup([{ id: "end_date", type: "text" }, { id: "end_time", type: "text" }])?.timeId === "end_time")
  check("a checkbox called end_date is not a date", countdownGroup([{ id: "end_date", type: "checkbox" }]) === null)
  check("nothing named so, nothing taken", countdownGroup([{ id: "title", type: "text" }, { id: "end_hour", type: "range" }]) === null)
}

console.log("\nLegacy values kept as they were written\n")
{
  const stamps = [
    "2026-11-03", "2026/11/03", "2026-1-3", "2026.11.03",
    "11/03/2026", "03.11.2026", "13-11-2026",
    "Nov 3, 2026", "November 3, 2026 23:59:00", "3 Nov 2026", "nov 03, 2026 09:05",
    "2026-11-03 23:59", "2026-11-03T23:59", "2026-11-03T23:59:00", "2026/11/03 23:59:00",
    "2026-11-03T23:59:00Z", "2026-11-03T23:59:00.250Z", "2026-11-03T23:59:00+02:00", "2026-11-03T23:59:00-0530",
    "Nov 3, 2026 23:59:00 GMT+0200", "2026-11-03 23:59 UTC", " 2026-11-03 ",
  ]
  for (const s of stamps) {
    const p = parseStamp(s)
    const again = p ? formatStamp(p.shape, p.wall, p.zone) : null
    check(`"${s}" reads and writes back exactly`, again === s, { again, p })
  }
  const offsets: unknown[] = [2, -5, 5.5, 0, 120, "+2", "2", "-5", "+02:00", "-0530", "UTC+2", "GMT-03:30", "UTC", "+5.5", "UTC +2"]
  for (const o of offsets) {
    const p = parseOffset(o)
    check(`offset ${JSON.stringify(o)} reads and writes back exactly`, p !== null && formatOffset(p.minutes, p.shape) === o, p)
  }
  check("  as minutes east of UTC", parseOffset("+5.5")?.minutes === 330 && parseOffset("-0530")?.minutes === -330 && parseOffset(120)?.minutes === 120 && parseOffset(-5)?.minutes === -300)
  check("  nonsense is not an offset", parseOffset("Bucharest") === null && parseOffset("+25") === null)

  const g = countdownGroup(SPLIT)!
  const stored = { end_date: "2026/11/03", end_hour: "09", end_minute: 5, utc_offset: "+2" }
  const day = writeCountdown(g, SPLIT, stored, { date: { year: 2026, month: 12, day: 24 } })
  check("a new day is written with slashes, as it was, and nothing else is written", JSON.stringify(day) === JSON.stringify({ end_date: "2026/12/24" }), day)
  const at = writeCountdown(g, SPLIT, stored, { time: { hour: 8, minute: 30 } })
  check("a new time keeps the hour's two digits and the minute a number", JSON.stringify(at) === JSON.stringify({ end_hour: "08", end_minute: 30 }), at)
  const zone = writeCountdown(g, SPLIT, stored, { offset: 330 })
  check("a zone from a select is its own option's value", JSON.stringify(zone) === JSON.stringify({ utc_offset: "+5.5" }), zone)
  check("the same values again write nothing", Object.keys(writeCountdown(g, SPLIT, stored, { date: { year: 2026, month: 11, day: 3 }, time: { hour: 9, minute: 5 }, offset: 120 })).length === 0)
  check("no id is renamed or added", Object.keys({ ...day, ...at, ...zone }).every((k) => SPLIT.some((f) => f.id === k)))

  const ranged: CountdownFieldLike[] = [{ id: "end_date", type: "text" }, { id: "end_hour", type: "range", min: 0, max: 23 }, { id: "end_minute", type: "range", min: 0, max: 45, step: 15 }]
  const snapped = writeCountdown(countdownGroup(ranged)!, ranged, { end_date: "2026-11-03" }, { time: { hour: 23, minute: 59 } })
  check("a minute range of quarters takes the nearest quarter it has", JSON.stringify(snapped) === JSON.stringify({ end_hour: 23, end_minute: 45 }), snapped)

  const isoFields: CountdownFieldLike[] = [{ id: "end_iso", type: "text" }]
  const ig = countdownGroup(isoFields)!
  const isoZoned = writeCountdown(ig, isoFields, { end_iso: "2026-11-03T23:59:00+02:00" }, { offset: -300 })
  check("an ISO stamp's zone is written into it", JSON.stringify(isoZoned) === JSON.stringify({ end_iso: "2026-11-03T23:59:00-05:00" }), isoZoned)
  const isoUtc = writeCountdown(ig, isoFields, { end_iso: "2026-11-03T21:59:00.000Z" }, { time: { hour: 22, minute: 30 } })
  check("  one written in UTC stays in UTC, with its milliseconds' digits", JSON.stringify(isoUtc) === JSON.stringify({ end_iso: "2026-11-03T22:30:00.000Z" }), isoUtc)
  const isoNew = writeCountdown(ig, isoFields, {}, { date: { year: 2026, month: 11, day: 3 } })
  check("  an empty one is written whole, with its zone, ending the day", JSON.stringify(isoNew) === JSON.stringify({ end_iso: "2026-11-03T23:59:00+00:00" }), isoNew)
  const textFields: CountdownFieldLike[] = [{ id: "countdown_date", type: "text" }]
  const txt = writeCountdown(countdownGroup(textFields)!, textFields, { countdown_date: "Nov 3, 2026 23:59:00" }, { date: { year: 2027, month: 1, day: 9 } })
  check("a typed \"Nov 3, 2026 23:59:00\" stays typed that way", JSON.stringify(txt) === JSON.stringify({ countdown_date: "Jan 9, 2027 23:59:00" }), txt)
}

console.log("\nThe calendar\n")
{
  check("29 February 2028 is a day", isRealDate(2028, 2, 29) && isLeapYear(2028))
  check("29 February 2027 is not", !isRealDate(2027, 2, 29) && !isLeapYear(2027))
  check("  nor 2100's, and 2000's is", !isRealDate(2100, 2, 29) && isRealDate(2000, 2, 29))
  check("no 30 February, no 31 April, no month 13", !isRealDate(2028, 2, 30) && !isRealDate(2026, 4, 31) && !isRealDate(2026, 13, 1) && isRealDate(2026, 12, 31))
  check("a stored 2027-02-29 is not read as 1 March", parseStamp("2027-02-29") === null && parseStamp("2028-02-29")?.wall.day === 29)
  const g = countdownGroup(SPLIT)!
  const bad = readCountdown(g, SPLIT, { end_date: "2027-02-29" })
  check("  it is named, and kept", bad.invalid === "2027-02-29" && bad.date === null, bad)
  check("  and a day that does not exist is never written", Object.keys(writeCountdown(g, SPLIT, { end_date: "2026-11-03" }, { date: { year: 2027, month: 2, day: 29 } })).length === 0)
  check("  while 29 February 2028 is", writeCountdown(g, SPLIT, { end_date: "2026-11-03" }, { date: { year: 2028, month: 2, day: 29 } }).end_date === "2028-02-29")
}

console.log("\nMidnight and the offset\n")
{
  const g = countdownGroup(SPLIT)!
  const at = (s: Record<string, unknown>) => deadlineOf(readCountdown(g, SPLIT, s))
  check("23:59 on 3 Nov at UTC+2 is 21:59 UTC", at({ end_date: "2026-11-03", end_hour: 23, end_minute: 59, utc_offset: "+2" }) === Z("2026-11-03T21:59:00Z"))
  check("00:00 on 4 Nov at UTC-5 is 05:00 UTC the same day", at({ end_date: "2026-11-04", end_hour: 0, end_minute: 0, utc_offset: "-5" }) === Z("2026-11-04T05:00:00Z"))
  check("00:00 on 1 Jan at UTC+2 is the year before in UTC", at({ end_date: "2027-01-01", end_hour: 0, end_minute: 0, utc_offset: "+2" }) === Z("2026-12-31T22:00:00Z"))
  const t24: CountdownFieldLike[] = [{ id: "end_date", type: "text" }, { id: "end_hour", type: "range", min: 0, max: 24 }]
  check("hour 24 on a range up to 24 is the next midnight", deadlineOf(readCountdown(countdownGroup(t24)!, t24, { end_date: "2028-02-28", end_hour: 24 })) === Z("2028-02-29T00:00:00Z"))
  check("  across 29 February in a leap year, and to 1 March in another", deadlineOf(readCountdown(countdownGroup(t24)!, t24, { end_date: "2027-02-28", end_hour: 24 })) === Z("2027-03-01T00:00:00Z"))
  check("a date with no time ends as that day starts", instantOf({ year: 2026, month: 11, day: 3, hour: null, minute: null }, 0) === Z("2026-11-03T00:00:00Z"))
  const end = Z("2026-11-03T21:59:00Z")
  const st = readCountdown(g, SPLIT, { end_date: "2026-11-03", end_hour: 23, end_minute: 59, utc_offset: "+2" })
  check("a minute before: it ends", deadlineWords(st, end - 60_000)?.ended === false)
  check("at the minute itself: it has ended", deadlineWords(st, end)?.ended === true)
}

console.log("\nSaid in plain words\n")
{
  const g = countdownGroup(SPLIT)!
  const st = readCountdown(g, SPLIT, { end_date: "2026-11-03", end_hour: 23, end_minute: 59, utc_offset: "+2" })
  const before = deadlineWords(st, Z("2026-10-28T12:00:00Z"), BUCHAREST)!
  check("\"Ends Tue 3 Nov, 23:59 in Bucharest (UTC+2)\"", deadlineSentence(before) === "Ends Tue 3 Nov, 23:59 in Bucharest (UTC+2)", deadlineSentence(before))
  const after = deadlineWords(st, Z("2026-11-04T00:00:00Z"), BUCHAREST)!
  check("\"Ended\" once it has passed", deadlineSentence(after) === "Ended Tue 3 Nov, 23:59 in Bucharest (UTC+2)", deadlineSentence(after))
  const elsewhere = deadlineWords(st, Z("2026-10-28T12:00:00Z"), { timeZone: "America/New_York", offsetAt: (t) => zoneOffsetAt("America/New_York", t) })!
  check("  read in New York, the offset alone", deadlineSentence(elsewhere) === "Ends Tue 3 Nov, 23:59 UTC+2", deadlineSentence(elsewhere))
  const next = readCountdown(g, SPLIT, { end_date: "2028-02-29", end_hour: 12, end_minute: 0, utc_offset: "0" })
  check("  another year says its year", deadlineSentence(deadlineWords(next, Z("2026-10-28T12:00:00Z"))!) === "Ends Tue 29 Feb 2028, 12:00 UTC")
  const plain: CountdownFieldLike[] = [{ id: "countdown_date", type: "text" }]
  const vis = readCountdown(countdownGroup(plain)!, plain, { countdown_date: "2026-11-03 23:59" })
  check("a stamp with no zone and no offset beside it is each visitor's own time", vis.zone === "visitor" && deadlineSentence(deadlineWords(vis, Z("2026-01-01T00:00:00Z"))!) === "Ends Tue 3 Nov, 23:59 in each visitor's own time", deadlineSentence(deadlineWords(vis, Z("2026-01-01T00:00:00Z"))!))

  const summer = readCountdown(g, SPLIT, { end_date: "2026-07-15", end_hour: 20, end_minute: 0, utc_offset: "+2" })
  const hint = daylightHint(summer, BUCHAREST)
  check("UTC+2 in July: Bucharest is on UTC+3 that day, said in one line", hint?.city === "Bucharest" && hint.zone === "UTC+3", hint)
  check("  none in November, when it is UTC+2", daylightHint(readCountdown(g, SPLIT, { end_date: "2026-11-03", utc_offset: "+2" }), BUCHAREST) === null)
  check("  none for a zone that is not the reader's either season", daylightHint(readCountdown(g, SPLIT, { end_date: "2026-07-15", utc_offset: "-5" }), BUCHAREST) === null)
}

console.log("\nEditor redraws: the same value again and again\n")
{
  const g = countdownGroup(SPLIT)!
  let settings: Record<string, unknown> = { end_date: "2026/11/03", end_hour: "09", end_minute: 5, utc_offset: "+2" }
  const seen = new Set<string>()
  const days = [{ year: 2026, month: 11, day: 3 }, { year: 2028, month: 2, day: 29 }, { year: 2026, month: 12, day: 31 }]
  for (let i = 0; i < 60; i++) {
    const patch = writeCountdown(g, SPLIT, settings, { date: days[i % 3], time: { hour: (i * 7) % 24, minute: (i * 13) % 60 }, offset: [120, -300, 330][i % 3] })
    settings = { ...settings, ...patch }
    const state = readCountdown(g, SPLIT, settings)
    /* Read back, the same edit writes nothing: a redraw never moves it. */
    const again = writeCountdown(g, SPLIT, settings, { date: state.date!, time: state.time!, offset: state.offset! })
    if (Object.keys(again).length) seen.add(`rewrite ${JSON.stringify(again)}`)
    if (state.date?.day !== days[i % 3].day || state.time?.hour !== (i * 7) % 24 || state.offset !== [120, -300, 330][i % 3]) seen.add(`drift at ${i}`)
  }
  check("60 changes, each read back as written, none rewritten by a redraw", ![...seen].some((s) => s.startsWith("rewrite") || s.startsWith("drift")), [...seen].filter((s) => s.startsWith("rewrite") || s.startsWith("drift")).slice(0, 3))
  check("  the hour stays text with two digits, the minute a number", typeof settings.end_hour === "string" && /^\d{2}$/.test(settings.end_hour as string) && typeof settings.end_minute === "number")
  check("  and the date keeps its slashes", /^\d{4}\/\d{2}\/\d{2}$/.test(String(settings.end_date)))
  const one = JSON.stringify(writeCountdown(g, SPLIT, settings, { date: { year: 2027, month: 6, day: 1 } }))
  check("  the same change from the same values writes the same, every time", Array.from({ length: 20 }, () => JSON.stringify(writeCountdown(g, SPLIT, settings, { date: { year: 2027, month: 6, day: 1 } }))).every((x) => x === one))
}

console.log("\nPublished output and the canvas read one deadline\n")
{
  const section = (type: string, markup: string, settings: unknown[] = []) => `${wrapCompatTemplate(markup)}\n\n<schema>\n${JSON.stringify({ type, name: type, settings })}\n</schema>\n`
  const markup =
    `<countdown-timer class="cd" data-date="{{ section.settings.end_date }}" data-hour="{{ section.settings.end_hour }}" data-minute="{{ section.settings.end_minute }}" data-offset="{{ section.settings.utc_offset }}"` +
    ` data-iso="{{ section.settings.end_iso }}" data-epoch="{{ section.settings.end_iso | date: '%s' }}" data-wall="{{ section.settings.countdown_date | date: '%s' }}"></countdown-timer>`
  const files = {
    "layout/theme.storelib": wrapCompatTemplate(`<html><head></head><body>{{ content_for_layout }}</body></html>`),
    "sections/countdown.storelib": section("countdown", markup, [...SPLIT, { id: "end_iso", type: "text" }, { id: "countdown_date", type: "text" }]),
  }
  const theme = new CompatTheme(files, {}, { assetUrl: (n) => `/a/${n}` })
  const g = countdownGroup(SPLIT)!
  let settings: Record<string, unknown> = { end_date: "2026-11-03", end_hour: 23, end_minute: 59, utc_offset: "+2" }
  settings = { ...settings, ...writeCountdown(g, SPLIT, settings, { date: { year: 2028, month: 2, day: 29 } }) }
  const isoFields: CountdownFieldLike[] = [{ id: "end_iso", type: "text" }]
  const iso = writeCountdown(countdownGroup(isoFields)!, isoFields, { end_iso: "2026-11-03T23:59:00+02:00" }, { date: { year: 2028, month: 2, day: 29 } }).end_iso
  settings = { ...settings, end_iso: iso, countdown_date: "2028-02-29 23:59" }
  const sections = [{ id: "c", type: "countdown", settings, blocks: [] } as unknown as StoredSection]
  const page = { template: "index", path: "/", designMode: false, products: [], collections: [], menus: {}, shop: { name: "S" } } as never
  const attrs = (html: string) => Object.fromEntries([...(/<countdown-timer[^>]*>/.exec(html)?.[0] ?? "").matchAll(/data-(\w+)="([^"]*)"/g)].map((m) => [m[1], m[2]]))
  const drawIn = (tz: string) => {
    process.env.TZ = tz
    return { published: attrs(drawPage(theme, page, sections, { scripts: false }).html), canvas: attrs(drawSection(theme, pageContextFor(theme, page, sections), sections[0], 0).html) }
  }
  const before = process.env.TZ
  const server = drawIn("UTC")
  const browser = drawIn("Europe/Bucharest")
  process.env.TZ = before
  check("the published page carries the values the editor wrote", server.published.date === "2028-02-29" && server.published.hour === "23" && server.published.minute === "59" && server.published.offset === "+2", server.published)
  check("  and the canvas the same", JSON.stringify(server.canvas) === JSON.stringify(server.published), server.canvas)
  const editor = deadlineOf(readCountdown(g, SPLIT, settings))
  const fromPublished = instantOf({ year: 2028, month: 2, day: 29, hour: Number(server.published.hour), minute: Number(server.published.minute) }, parseOffset(server.published.offset)!.minutes)
  check("  which resolve to the deadline the editor says", editor === fromPublished && editor === Z("2028-02-29T21:59:00Z"), { editor, fromPublished })
  check("an ISO deadline's | date: '%s' is the editor's instant", Number(server.published.epoch) * 1000 === deadlineOf(readCountdown(countdownGroup(isoFields)!, isoFields, { end_iso: iso })), server.published)
  check("a server in UTC and a browser in Bucharest draw the same page", JSON.stringify(server.published) === JSON.stringify(browser.published) && JSON.stringify(browser.canvas) === JSON.stringify(server.published), { server: server.published, browser: browser.canvas })
  check("  a stamp with no zone included (it was two hours apart)", browser.canvas.wall === server.published.wall && server.published.wall === String(Z("2028-02-29T23:59:00Z") / 1000), { server: server.published.wall, browser: browser.canvas.wall })
}

console.log("\nWired into the editor and the canvas\n")
{
  const page = read("app/website-builder/editor/[installId]/page.tsx")
  check("section and block settings both draw it, in place of the settings it covers", (page.match(/const countdown = countdownGroup\(/g) ?? []).length === 2 && (page.match(/countdown\?\.absorbed\.includes\(field\.id\) \? null/g) ?? []).length === 2 && (page.match(/<CountdownControl/g) ?? []).length === 2)
  check("  writing through the same setting writers as every control", /updateSectionSetting\(section\.id, k, v\)/.test(page) && /onUpdate\(blockKey, k, v, virtual\)/.test(page))
  const control = read("components/website-builder/editor/controls/countdown-control.tsx")
  check("the device's own calendar, time and a zone list", /type="date"/.test(control) && /type="time"/.test(control) && /<select/.test(control) && !/datetime-local/.test(control))
  check("  the daylight saving line", /A fixed UTC offset does not move with daylight saving\./.test(control))
  check("  no em dash in what it prints", !/>[^<]*—[^<]*</.test(control))
  const bridge = read("lib/storelib-theme/compat/canvas-bridge.ts")
  check("a read-once value starts its own custom element again, not the section with its pictures", /var restartInPlace = function/.test(bridge) && /RESTART_MEDIA = "img,picture,video,iframe,model-viewer,canvas"/.test(bridge) && (bridge.match(/restartLater\(id, html, /g) ?? []).length === 2 && /written\(id, html, ops, restart, restartAt\)/.test(bridge))
  check("the date filter never reads a stamp in the zone of whoever draws it", /const stamp = parseStamp\(s\)/.test(read("lib/storelib-theme/compat/filters.ts")))
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
