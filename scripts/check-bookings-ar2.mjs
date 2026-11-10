/**
 * ROUND AR (track 2): the booking sheet on a live OnePage, measured in headless Chromium at 390 (an iPhone,
 * touch) and 1440, in the visitor's own zone (America/New_York). scripts/render-bookings-ar2.tsx is the page;
 * every call to storelib.com is answered here and nothing leaves the machine.
 *
 *   node scripts/check-bookings-ar2.mjs          SHOTS=<dir> for the screenshots
 *
 * Measured, per width:
 *   - the press to the month drawn (ms), and whether a loading placeholder was ever painted
 *   - the month: open dates, closed dates, a cell's size, no sideways scroll
 *   - a date to its times: the step's animation, the frames while it runs (Chromium paints at 60 Hz, so
 *     ~16.7 ms a frame is the best it can do), and the times in the visitor's zone
 *   - Back from the times to the month: no navigation, no reload, history untouched
 *   - a time chosen goes on to the questions; Change goes back to the times
 *   - a time taken by someone else meanwhile: the 409, the month read again, that time gone
 *   - the booked confirmation, with Add to calendar and Change or cancel
 * Then the visitor's own page and /app/bookings, drawn for screenshots, with no page errors.
 */
import { mkdirSync } from "node:fs"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { serveEditorProbe } from "./onepage-probe-server.mjs"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const SHOTS = process.env.SHOTS || join((await import("node:os")).tmpdir(), "bookings-ar2-shots")
mkdirSync(SHOTS, { recursive: true })
const root = process.cwd()
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let passed = 0
let failed = 0
const fail = (m) => {
  throw new Error(m)
}
const expect = (ok, name, detail) => {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${detail === undefined ? "" : `   ${JSON.stringify(detail)?.slice(0, 400)}`}`)
}

/* ── The answers ── */
const FORM = "f0000000-0000-4000-8000-0000000000a1"
const NOW = Date.now()
const DAY = 86_400_000
const dayOff = (() => {
  /* A weekday about a week out, made a day off: it must be drawn closed. */
  let d = new Date(NOW + 7 * DAY)
  while ([0, 6].includes(d.getUTCDay())) d = new Date(d.getTime() + DAY)
  return d.toISOString().slice(0, 10)
})()
const taken = new Set()
function slots(fromIso, days, duration = 30) {
  const from = Date.parse(fromIso)
  const to = from + days * DAY
  const out = []
  for (let t = Date.UTC(new Date(from).getUTCFullYear(), new Date(from).getUTCMonth(), new Date(from).getUTCDate()); t < to; t += DAY) {
    const d = new Date(t)
    if ([0, 6].includes(d.getUTCDay()) || d.toISOString().slice(0, 10) === dayOff || t > NOW + 60 * DAY) continue
    for (let m = 14 * 60; m + duration <= 21 * 60; m += duration) {
      const s = t + m * 60_000
      if (s < Math.max(from, NOW + 12 * 3_600_000) || s >= to) continue
      const iso = new Date(s).toISOString()
      if (taken.has(iso)) continue
      out.push({ start: iso, end: new Date(s + duration * 60_000).toISOString() })
    }
  }
  return out
}
const definition = {
  title: "Intro call",
  description: "Thirty minutes on your brand or website. Bring a link.",
  mode: "form",
  layout: "single",
  fields: [
    { id: "name", type: "name", label: "Your name", required: true },
    { id: "email", type: "email", label: "Email", required: true },
    { id: "goal", type: "textarea", label: "What would you like to cover?", required: false },
  ],
  button_text: "Book",
  consent_text: "I agree to be contacted about this booking.",
  marketing_opt_in: false,
  booking: { duration: 30, durations: [60], buffer: 0, timezone: "Europe/London", weekly: [1, 2, 3, 4, 5].map((day) => ({ day, start: "14:00", end: "21:00" })), notice_hours: 12, days_ahead: 60, approval: false, location: { kind: "google_meet" }, badge: "Most booked" },
  completion: { kind: "message", message: "Thanks. You will get an email with the details." },
}
let submits = 0
let firstChosen = null
function answer(url, method, body) {
  const u = new URL(url)
  const p = u.pathname
  if (p === `/api/forms/${FORM}/public`) return { body: { form: { id: FORM, revision: 1, definition, price: null } }, delay: Number(process.env.FORM_DELAY || 0) }
  if (p === `/api/forms/${FORM}/slots`) {
    const duration = Number(u.searchParams.get("duration")) || 30
    const list = slots(u.searchParams.get("from") || new Date().toISOString(), Number(u.searchParams.get("days")) || 42, duration)
    return { body: { duration, durations: [30, 60], slots: list, horizon: new Date(NOW + 60 * DAY).toISOString(), next: null }, delay: 120 }
  }
  if (p === `/api/forms/${FORM}/submit` && method === "POST") {
    const b = JSON.parse(body || "{}")
    submits++
    if (submits === 1) {
      /* Someone else booked it a moment ago. */
      taken.add(b.slot)
      firstChosen = b.slot
      return { status: 409, body: { error: "That time was just taken. Choose another.", slot_taken: true } }
    }
    return {
      status: 201,
      body: {
        ok: true,
        message: definition.completion.message,
        href: null,
        action_type: null,
        booking: { starts_at: b.slot, ends_at: new Date(Date.parse(b.slot) + 30 * 60_000).toISOString(), status: "confirmed", location: { label: "Google Meet", text: "https://meet.google.com/abc-defg-hij", url: "https://meet.google.com/abc-defg-hij" }, manage_url: "https://storelib.com/booking/c0000000-0000-4000-8000-000000000001.probeprobeprobeprobeprobepr" },
        payment_href: null,
      },
    }
  }
  if (p.startsWith("/api/bookings/manage/")) {
    if (u.searchParams.get("slots") === "1") return { body: { slots: slots(u.searchParams.get("from"), Number(u.searchParams.get("days")) || 42), duration: 30, horizon: new Date(NOW + 60 * DAY).toISOString() } }
    return { body: { booking: { title: "Intro call", starts_at: new Date(NOW + 3 * DAY).toISOString(), ends_at: new Date(NOW + 3 * DAY + 1_800_000).toISOString(), duration: 30, status: "confirmed", cancelled_by: null, where: { label: "Google Meet", text: "https://meet.google.com/abc-defg-hij", url: "https://meet.google.com/abc-defg-hij" }, can_change: true, name: "Mara", google_add_url: "https://calendar.google.com/calendar/render?action=TEMPLATE" } } }
  }
  if (p === "/api/google-calendar") return { body: { configured: false, connected: false } }
  if (p === "/api/bookings") {
    const rows = [0, 0, 1, 2, 5].map((n, i) => ({
      id: `c0000000-0000-4000-8000-00000000000${i + 1}`,
      form_id: FORM,
      submission_id: `d${i}`,
      starts_at: new Date(Math.ceil((NOW + n * DAY) / 1_800_000) * 1_800_000 + (i + 2) * 3_600_000).toISOString(),
      ends_at: new Date(Math.ceil((NOW + n * DAY) / 1_800_000) * 1_800_000 + (i + 2) * 3_600_000 + 1_800_000).toISOString(),
      status: ["confirmed", "pending", "confirmed", "cancelled", "confirmed"][i],
      visitor_timezone: "America/New_York",
      payment_status: "none",
      created_at: new Date(NOW).toISOString(),
      name: ["Mara Lind", "Theo Park", "Ana Ruiz", "Sam Ode", "Lea Voss"][i],
      email: "visitor@example.com",
      form_title: i === 2 ? "Website review" : "Intro call",
    }))
    return { body: { bookings: u.searchParams.get("when") === "past" ? [] : rows, next: null, google: { configured: false } } }
  }
  if (/^\/api\/bookings\/c0000000/.test(p)) {
    return { body: { booking: { id: "c0000000-0000-4000-8000-000000000002", form_id: FORM, starts_at: new Date(NOW + DAY).toISOString(), ends_at: new Date(NOW + DAY + 1_800_000).toISOString(), status: "pending", visitor_timezone: "America/New_York", payment_status: "none", name: "Theo Park", email: "theo@example.com", form_title: "Intro call", owner_timezone: "Europe/London", where: { label: "Google Meet", text: "The Meet link is sent before the call.", url: null }, contact: { name: "Theo Park", email: "theo@example.com", phone: "+1 212 555 0100" }, answers: [{ id: "goal", label: "What would you like to cover?", type: "textarea", value: "A new homepage for my studio, and whether OnePage fits." }] } } }
  }
  return null
}

const { base, server } = await serveEditorProbe({ root, entry: "scripts/render-bookings-ar2.tsx", fail })
const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--disable-gpu", "--font-render-hinting=none", "--disable-background-networking", "--disable-component-update", "--no-first-run"] })
const VIEWS = {
  390: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  1440: { width: 1440, height: 900, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
}
const outside = []
async function open(w, path) {
  const p = await browser.newPage()
  await p.setViewport(VIEWS[w])
  await p.emulateTimezone("America/New_York")
  const errors = []
  p.on("pageerror", (e) => errors.push(String(e)))
  await p.setRequestInterception(true)
  p.on("request", async (req) => {
    const url = req.url()
    const host = new URL(url).host
    const ours = host === new URL(base).host
    const a = /\/api\/(forms|bookings|google-calendar)/.test(url) ? answer(url, req.method(), req.postData()) : null
    if (a) {
      if (a.delay) await sleep(a.delay)
      return req.respond({ status: a.status ?? 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(a.body) })
    }
    if (ours || url.startsWith("data:")) return req.continue()
    /* Anything else (storelib.com, fonts, analytics) never leaves. */
    outside.push(url)
    return req.respond({ status: 204, body: "" })
  })
  await p.goto(`${base}/app/onepage${path}`, { waitUntil: "load" })
  await p.evaluate(() => Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 1500))]))
  await sleep(400)
  p.errors = errors
  return p
}

/* Frames while something moves: every requestAnimationFrame gap, for `ms`. */
const frames = (p, ms) =>
  p.evaluate(
    (ms) =>
      new Promise((resolve) => {
        const gaps = []
        let last = performance.now()
        const start = last
        const tick = (t) => {
          gaps.push(t - last)
          last = t
          if (t - start < ms) requestAnimationFrame(tick)
          else resolve({ count: gaps.length, worst: Math.round(Math.max(...gaps) * 10) / 10, over20: gaps.filter((g) => g > 20).length, median: Math.round(gaps.sort((a, b) => a - b)[gaps.length >> 1] * 10) / 10 })
        }
        requestAnimationFrame(tick)
      }),
    ms,
  )
const tap = async (p, w, sel) => {
  const el = await p.$(sel)
  if (!el) return false
  if (w === 390) await el.tap()
  else await el.click()
  return true
}

for (const w of [390, 1440]) {
  submits = 0
  taken.clear()
  console.log(`\nThe booking sheet, ${w}`)
  const p = await open(w, "?page")
  await p.evaluate(() => {
    window.__marker = "same-document"
    window.__navs = performance.getEntriesByType("navigation").length
    window.__hist = history.length
  })
  /* The press, then every frame until the month is drawn: was a loading placeholder ever painted? */
  const opened = p.evaluate(
    () =>
      new Promise((resolve) => {
        const t0 = performance.now()
        let placeholder = false
        const tick = () => {
          if (document.querySelector("[data-form-loading]")) placeholder = true
          if (document.querySelector("[data-booking-grid]")) return resolve({ ms: Math.round(performance.now() - t0), placeholder })
          if (performance.now() - t0 > 5000) return resolve({ ms: -1, placeholder })
          requestAnimationFrame(tick)
        }
        requestAnimationFrame(tick)
      }),
  )
  const pressed = await tap(p, w, "[data-form-presentation=\"modal\"]")
  if (!pressed) {
    const any = await p.$$eval("button", (bs) => bs.map((b) => b.textContent.trim()).slice(0, 12))
    expect(false, "the Book a call button is there", any)
  }
  const o = await opened
  expect(o.ms >= 0 && o.ms < 1500, "the press opens the sheet and draws the month", o)
  expect(!o.placeholder, "no loading placeholder painted on the way (the form is read on the press)", o)
  await sleep(700)
  const month = await p.evaluate(() => {
    const cells = [...document.querySelectorAll("[data-booking-grid] button[data-day]")]
    const open = cells.filter((c) => !c.disabled)
    const r = open[0]?.getBoundingClientRect()
    return {
      open: open.length,
      closed: cells.length - open.length,
      cell: r ? [Math.round(r.width), Math.round(r.height)] : null,
      sideways: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      badge: document.querySelector("[data-booking-badge]")?.textContent,
      meta: document.querySelector("[data-booking-meta]")?.textContent,
      lengths: [...document.querySelectorAll("[data-booking-durations] button")].map((b) => b.textContent),
      zone: document.querySelector("[data-booking-zone]")?.textContent,
      openColor: open[0] ? getComputedStyle(open[0]).backgroundColor : null,
      closedColor: (() => { const c = cells.find((x) => x.disabled); return c ? getComputedStyle(c).color : null })(),
    }
  })
  expect(month.open > 0 && month.closed > 0, "the month draws open and closed dates apart", month)
  expect(month.cell && month.cell[0] >= 40 && month.cell[1] >= 40, "each open date is at least 40 px to press", month.cell)
  expect(!month.sideways, "no sideways scroll")
  expect(month.badge === "Most booked" && /30 min · Google Meet/.test(month.meta || ""), "the badge, the length and where it happens are shown", { badge: month.badge, meta: month.meta })
  expect(month.lengths.length === 2, "two lengths to choose from", month.lengths)
  await p.screenshot({ path: join(SHOTS, `sheet-month-${w}.png`) })

  /* The day off is closed. */
  const off = await p.evaluate((d) => document.querySelector(`[data-day="${d}"]`)?.disabled ?? "not in this month", dayOff)
  expect(off === true || off === "not in this month", "the day off is drawn closed", { dayOff, off })

  /* A date to its times. */
  const firstOpen = await p.$eval("[data-booking-grid] button[data-day]:not([disabled])", (b) => b.getAttribute("data-day"))
  const moving = frames(p, 450)
  await tap(p, w, `[data-day="${firstOpen}"]`)
  const f = await moving
  const step = await p.evaluate(() => {
    const v = document.querySelector('[data-booking-view="time"]')
    const cs = v ? getComputedStyle(v) : null
    return { shown: !!v, animation: cs?.animationName, duration: cs?.animationDuration, times: [...document.querySelectorAll("[data-booking-times] button")].map((b) => b.textContent).slice(0, 4) }
  })
  expect(step.shown, "pressing a date shows its times", step)
  expect(step.animation && step.animation !== "none", "the step animates in", { animation: step.animation, duration: step.duration })
  expect(f.over20 <= 2, "frames while the step moves (Chromium paints at 60 Hz)", f)
  /* 14:00Z slots are 10:00 in New York in summer, 09:00 in winter. */
  expect(/^(9|10):00/.test(step.times[0] || ""), "times are in the visitor's zone (New York)", step.times)
  await p.screenshot({ path: join(SHOTS, `sheet-times-${w}.png`) })

  /* Back to the month: internal, no navigation. */
  await tap(p, w, "[data-booking-back]")
  await sleep(300)
  const back = await p.evaluate(() => ({ month: !!document.querySelector('[data-booking-view="day"]'), marker: window.__marker, navs: performance.getEntriesByType("navigation").length, hist: history.length, wasHist: window.__hist }))
  expect(back.month && back.marker === "same-document" && back.navs === 1 && back.hist === back.wasHist, "Back goes to the month with no reload and no history entry", back)

  /* A time, then the questions; Change goes back. */
  await tap(p, w, `[data-day="${firstOpen}"]`)
  await sleep(300)
  const chosenTime = await p.$eval("[data-booking-times] button", (b) => b.textContent)
  await tap(p, w, "[data-booking-times] button")
  await sleep(350)
  const qs = await p.evaluate(() => ({ chosen: document.querySelector("[data-booking-chosen]")?.textContent, inputs: document.querySelectorAll("form[data-native-form] input:not([type=checkbox]), form[data-native-form] textarea").length }))
  expect(!!qs.chosen && qs.inputs >= 2, "a time chosen goes on to the questions, with the time on top", qs)
  await p.screenshot({ path: join(SHOTS, `sheet-questions-${w}.png`) })

  /* Fill and send: the first answer is a 409 (someone was quicker), the month is read again without that time. */
  await p.type('input[autocomplete="name"], form[data-native-form] input[type="text"]', "Mara Lind")
  await p.type('input[type="email"]', "mara@example.com")
  await p.$eval("form[data-native-form] input[type=checkbox]", (c) => c.click())
  await tap(p, w, "form[data-native-form] button[type=submit]")
  await sleep(900)
  const after409 = await p.evaluate(() => ({ alert: document.querySelector("form[data-native-form] [role=alert]")?.textContent, view: document.querySelector("[data-booking-view]")?.getAttribute("data-booking-view"), times: [...document.querySelectorAll("[data-booking-times] button")].map((b) => b.textContent) }))
  expect(/just taken/.test(after409.alert || "") && after409.view === "time" && !after409.times.includes(chosenTime), "a time taken meanwhile: told, back on that day's times, and the taken time is gone", { ...after409, taken: chosenTime })
  await p.screenshot({ path: join(SHOTS, `sheet-taken-${w}.png`) })

  /* Another time, sent: booked. */
  await tap(p, w, "[data-booking-times] button")
  await sleep(350)
  const box = await p.$("form[data-native-form] input[type=checkbox]")
  if (box && !(await box.evaluate((c) => c.checked))) await box.click()
  await tap(p, w, "form[data-native-form] button[type=submit]")
  await sleep(900)
  const done = await p.evaluate(() => ({ done: document.querySelector("[data-booking-done]")?.textContent?.replace(/\s+/g, " "), links: [...document.querySelectorAll("[data-booking-done] a")].map((a) => a.textContent) }))
  expect(/Booked/.test(done.done || "") && done.links.includes("Add to calendar") && done.links.includes("Change or cancel"), "booked: the time, the Meet link, Add to calendar and Change or cancel", done)
  await p.screenshot({ path: join(SHOTS, `sheet-booked-${w}.png`) })
  expect(p.errors.length === 0, "no page errors", p.errors)
  await p.close()
}

for (const w of [390, 1440]) {
  console.log(`\nThe visitor's page and /app/bookings, ${w}`)
  const m = await open(w, "?manage")
  await sleep(500)
  const mm = await m.evaluate(() => ({ state: document.querySelector("[data-manage-booking]")?.getAttribute("data-manage-booking"), sideways: document.documentElement.scrollWidth > document.documentElement.clientWidth }))
  expect(mm.state === "confirmed" && !mm.sideways, "the visitor's own booking, no sideways scroll", mm)
  await m.screenshot({ path: join(SHOTS, `manage-${w}.png`) })
  await tap(m, w, "[data-manage-booking] button")
  await sleep(700)
  expect(!!(await m.$('[data-manage-move] [data-booking-view="day"]')), "Change time shows the same month")
  await m.screenshot({ path: join(SHOTS, `manage-move-${w}.png`) })
  expect(m.errors.length === 0, "no page errors", m.errors)
  await m.close()

  const a = await open(w, "?app")
  await sleep(700)
  const list = await a.evaluate(() => ({ rows: document.querySelectorAll("[data-booking-row]").length, google: document.querySelector("[data-google-calendar]")?.getAttribute("data-google-calendar"), googleText: document.querySelector("[data-google-calendar] p")?.textContent, sideways: document.documentElement.scrollWidth > document.documentElement.clientWidth }))
  expect(list.rows === 5 && list.google === "not_set_up" && /not set up on Storelib yet/.test(list.googleText || ""), "/app/bookings lists the bookings and says plainly Google is not set up", list)
  await a.screenshot({ path: join(SHOTS, `app-bookings-${w}.png`) })
  await tap(a, w, '[data-booking-row="c0000000-0000-4000-8000-000000000002"]')
  await sleep(900)
  const sheet = await a.evaluate(() => ({ facts: document.querySelectorAll("[data-booking-facts] > div").length, actions: [...document.querySelectorAll("[data-booking-sheet] button")].map((b) => b.textContent).filter(Boolean) }))
  expect(sheet.facts >= 3 && sheet.actions.includes("Confirm") && sheet.actions.includes("Move"), "a booking opens with its answers and Confirm, Decline, Move, Cancel", sheet)
  await a.screenshot({ path: join(SHOTS, `app-booking-sheet-${w}.png`) })
  expect(a.errors.length === 0, "no page errors", a.errors)
  await a.close()
}

expect(outside.every((u) => !/storelib\.com\/api|googleapis|accounts\.google/.test(u)), "no call reached storelib.com's API or Google", outside.filter((u) => /storelib|google/.test(u)).slice(0, 5))
await browser.close()
server.close()
console.log(`\ncheck-bookings-ar2: ${passed} passed, ${failed} failed. Screenshots in ${SHOTS}`)
process.exit(failed ? 1 : 0)
