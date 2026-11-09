/**
 * THE BLOCK SHEET, ROUND AP: THE OPEN, THE KEYBOARD AND THE MOUSE.
 *
 * The real BlockSheetProvider and what opens it (scripts/render-onepage-sheets-ap.tsx)
 * at 390x844 and 1440x900:
 *
 *   open       every frame from the press until it rests: the sheet's top edge
 *              as drawn and its laid-out height. No frame may move the top edge
 *              backwards (down) while it rises, and a form opens with its
 *              questions in it (one laid-out height), whether they arrive at
 *              once or late (then the sheet eases to the new height instead of
 *              jumping: the biggest step between two frames is reported). The
 *              page's layout shifts while it opens are summed (CLS).
 *   keyboard   on a touch phone, focusing a field in the sheet hides the foot
 *              bar (the round Close); blurring brings it back. With a mouse it
 *              never hides.
 *   mouse      the sheet is pressed on its title and drawn down: it is under the
 *              pointer on every move (its translate equals the pointer's travel),
 *              a short slow drag springs back, a long drag closes it, and a quick
 *              flick closes it.
 *
 *   CHROMIUM=/opt/pw-browsers/chromium-1194/chrome-linux/chrome node scripts/check-onepage-sheets-ap.mjs
 *   REPORT=1 prints the numbers without failing. SHOTS=<dir> saves screenshots.
 */
import puppeteer from "puppeteer-core"
import { existsSync, mkdirSync } from "node:fs"
import { join } from "node:path"
import { serveEditorProbe } from "./onepage-probe-server.mjs"

const report = !!process.env.REPORT
const shots = process.env.SHOTS || null
if (shots) mkdirSync(shots, { recursive: true })
const chromium = process.env.CHROMIUM || ["/opt/pw-browsers/chromium-1194/chrome-linux/chrome", "/tmp/chromium"].find((p) => existsSync(p))
const { base, server } = await serveEditorProbe({ entry: "scripts/render-onepage-sheets-ap.tsx" })
const browser = await puppeteer.launch({ executablePath: chromium, args: ["--no-sandbox"] })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const failures = []
const check = (ok, message) => {
  if (!ok) failures.push(message)
  console.log(`${ok ? "ok  " : "FAIL"} ${message}`)
}

const FORM = {
  id: "6f1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d",
  revision: 1,
  definition: {
    title: "Get in touch",
    description: "",
    mode: "form",
    layout: "single",
    fields: [
      { id: "name", type: "text", label: "Your name", required: true, placeholder: "First and last name" },
      { id: "email", type: "email", label: "Email address", required: true, placeholder: "you@example.com" },
      { id: "help", type: "textarea", label: "How can I help?", required: true },
    ],
    button_text: "Send",
    consent_text: "I agree that my answers and contact details may be used to respond to this request.",
    marketing_opt_in: false,
    completion: { kind: "message", message: "Thanks" },
  },
}

async function open(page, { width, height, touch = false, formDelay = 60 }) {
  await page.setViewport({ width, height, deviceScaleFactor: 1, isMobile: touch, hasTouch: touch })
  await page.setRequestInterception(true)
  page.on("request", (r) => {
    const u = new URL(r.url())
    if (u.pathname.startsWith("/api/forms/")) {
      setTimeout(() => r.respond({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify({ form: FORM }) }).catch(() => {}), formDelay)
      return
    }
    if (u.hostname !== "127.0.0.1") return void r.respond({ status: 200, contentType: "text/html", body: "<!doctype html><body style='margin:0;background:#fff'></body>" })
    void r.continue()
  })
  await page.goto(base + "/app/onepage", { waitUntil: "domcontentloaded" })
  await page.waitForSelector("[data-probe-calendly]")
  await page.evaluate(() => {
    window.__shifts = 0
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) if (!e.hadRecentInput) window.__shifts += e.value
    }).observe({ type: "layout-shift", buffered: false })
  })
  await sleep(400)
}

/*
  Read once each frame has been drawn: a task queued from requestAnimationFrame runs after that frame's
  rendering, ResizeObserver callbacks included, so this is what was painted rather than the state before
  the frame's own layout.
*/
const SAMPLE = (ms) => `new Promise((done) => {
  const out = []
  const t0 = performance.now()
  const tick = () => setTimeout(read, 0)
  const read = () => {
    const el = document.querySelector("[data-block-sheet-panel]")
    const t = performance.now() - t0
    if (el) { const r = el.getBoundingClientRect(); out.push({ t: Math.round(t), top: Math.round(r.top * 10) / 10, lh: el.offsetHeight, op: Math.round(parseFloat(getComputedStyle(el).opacity) * 100) / 100 }) }
    if (t < ${ms}) requestAnimationFrame(tick)
    else done(out)
  }
  requestAnimationFrame(tick)
})`

const OPENERS = {
  "form, questions at once": { sel: "[data-probe=form] a", formDelay: 60 },
  "form, questions late (900ms)": { sel: "[data-probe=form] a", formDelay: 900 },
  "contact block": { sel: "[data-probe=contact] [data-block-sheet-trigger]" },
  "Instagram post": { sel: "[data-probe=post] [data-block-sheet-trigger]" },
  "Calendly (full)": { sel: "[data-probe-calendly]" },
  "content grows after 120ms": { sel: "[data-probe-grows-open]" },
}

const results = []
try {
  for (const [label, viewport] of [["390", { width: 390, height: 844 }], ["1440", { width: 1440, height: 900 }]]) {
    console.log(`\n── ${label}`)
    for (const [name, o] of Object.entries(OPENERS)) {
      const page = await browser.newPage()
      await open(page, { ...viewport, formDelay: o.formDelay ?? 60 })
      await page.evaluate(() => window.scrollTo(0, 300))
      await sleep(80)
      await page.evaluate(() => (window.__shifts = 0))
      const sampling = page.evaluate(SAMPLE(name.includes("late") ? 1500 : 700))
      /* A press: pointerdown (the form's questions are asked for then) and the click 90ms later. */
      await page.$eval(o.sel, (el) => el.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true })))
      await sleep(90)
      await page.$eval(o.sel, (el) => el.click())
      const f = await sampling
      const shifts = await page.evaluate(() => window.__shifts)
      /* Backwards: the top edge goes down between two frames while the sheet is rising (before it first rests). */
      let back = 0
      let maxStep = 0
      for (let i = 1; i < f.length; i++) {
        const d = f[i].top - f[i - 1].top
        if (d > 0.5) back++
        maxStep = Math.max(maxStep, Math.abs(d))
      }
      const heights = [...new Set(f.map((x) => x.lh))]
      results.push({ viewport: label, name, frames: f.length, backwards: back, maxStepPx: Math.round(maxStep * 10) / 10, heights: heights.length > 4 ? `${heights[0]}..${heights.at(-1)} (${heights.length})` : heights.join(","), cls: Math.round(shifts * 1000) / 1000 })
      console.log(`   ${name}: ${f.length} frames, top backwards on ${back}, biggest step ${Math.round(maxStep)}px, heights ${heights.slice(0, 6).join(",")}${heights.length > 6 ? "…" : ""}, CLS ${shifts.toFixed(3)}`)
      check(back === 0, `${label} ${name}: the top edge never moves backwards while it opens (${back})`)
      /* The rise's own steps are 20 to 40px a frame; a jump is content arriving and moving the edge in one frame. */
      check(maxStep <= 60, `${label} ${name}: no jump, the biggest step between two frames is ${Math.round(maxStep)}px`)
      /* Content that arrives late moves inside the sheet by its nature (reported above); everything else shifts nothing. */
      if (!/late|grows/.test(name)) check(shifts < 0.001, `${label} ${name}: no layout shift on the page (${shifts.toFixed(4)})`)
      if (name === "form, questions at once") check(heights.length === 1, `${label} form: opens with its questions in it, one height (${heights.join(",")})`)
      if (name === "form, questions at once" && shots) await page.screenshot({ path: join(shots, `sheet-form-${label}.png`) })
      await page.close()
    }

    /* ── The keyboard, on a touch phone (390 only), and a mouse never hides the bar. ── */
    for (const touch of label === "390" ? [true, false] : [false]) {
      const page = await browser.newPage()
      await open(page, { ...viewport, touch })
      await page.$eval("[data-probe=form] a", (el) => el.click())
      await page.waitForSelector("[data-block-sheet-panel] input", { timeout: 3000 })
      await sleep(450)
      const visible = () => page.evaluate(() => { const f = document.querySelector("[data-block-sheet-foot]"); return !!f && f.getClientRects().length > 0 })
      const before = await visible()
      await page.$eval("[data-block-sheet-panel] input", (el) => el.focus())
      await sleep(80)
      const typing = await visible()
      if (touch && shots) await page.screenshot({ path: join(shots, `sheet-keyboard-${label}.png`) })
      await page.$eval("[data-block-sheet-panel] input", (el) => el.blur())
      await sleep(80)
      const after = await visible()
      console.log(`   keyboard (${touch ? "touch" : "mouse"}): bar before ${before}, field focused ${typing}, after blur ${after}`)
      results.push({ viewport: label, name: `keyboard ${touch ? "touch" : "mouse"}`, before, focused: typing, after })
      check(before && after, `${label} ${touch ? "touch" : "mouse"}: the foot bar is there without a keyboard`)
      check(touch ? !typing : typing, `${label} ${touch ? "touch: a focused field hides the foot bar" : "mouse: focus never hides the foot bar"}`)
      await page.close()
    }

    /* ── Drawn down with a mouse by its title. ── */
    for (const [kind, steps, stepPx, gapMs, expect] of [["short slow", 10, 4, 24, "back"], ["long", 40, 6, 16, "close"], ["flick", 3, 14, 8, "close"]]) {
      const page = await browser.newPage()
      await open(page, viewport)
      await page.$eval("[data-probe=contact] [data-block-sheet-trigger]", (el) => el.click())
      await sleep(450)
      const h = await page.$eval("[data-block-sheet-title]", (el) => { const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 } })
      await page.mouse.move(h.x, h.y)
      await page.mouse.down()
      const lag = []
      for (let i = 1; i <= steps; i++) {
        await page.mouse.move(h.x, h.y + i * stepPx)
        const tr = await page.$eval("[data-block-sheet-panel]", (el) => { const t = getComputedStyle(el).translate; return t === "none" ? 0 : parseFloat(t.split(" ")[1] || "0") })
        if (i * stepPx >= 3) lag.push(Math.abs(i * stepPx - tr))
        await sleep(gapMs)
      }
      await page.mouse.up()
      await sleep(420)
      const state = await page.evaluate(() => {
        const el = document.querySelector("[data-block-sheet-panel]")
        if (!el) return { open: false }
        const t = getComputedStyle(el).translate
        return { open: !!document.querySelector("[data-block-sheet-open]"), y: t === "none" ? 0 : parseFloat(t.split(" ")[1] || "0") }
      })
      const worst = Math.max(...lag)
      console.log(`   mouse ${kind}: pointer-to-sheet worst ${worst.toFixed(1)}px over ${lag.length} moves, then ${JSON.stringify(state)}`)
      results.push({ viewport: label, name: `mouse ${kind}`, worstLagPx: Math.round(worst * 10) / 10, state })
      check(worst <= 0.5, `${label} mouse ${kind}: the sheet stays under the pointer (${worst.toFixed(1)}px)`)
      if (expect === "back") check(state.open && Math.abs(state.y) < 0.5, `${label} mouse ${kind}: springs back (${JSON.stringify(state)})`)
      else check(!state.open, `${label} mouse ${kind}: closes (${JSON.stringify(state)})`)
      await page.close()
    }
  }

  /* ── Share: a bottom sheet on a phone (like Subscribe), the centred card from 640px. ── */
  for (const [label, vp] of [["390", { width: 390, height: 844, isMobile: true, hasTouch: true }], ["1440", { width: 1440, height: 900 }]]) {
    const page = await browser.newPage()
    await page.setViewport({ deviceScaleFactor: 1, ...vp })
    await page.goto(base + "/app/onepage?view=share", { waitUntil: "domcontentloaded" })
    await page.waitForSelector("[data-onepage-share-sheet]", { timeout: 15000 })
    await sleep(700)
    const s = await page.evaluate(() => {
      const band = document.querySelector("[data-onepage-share-sheet]")
      const sheet = band.closest("[data-sheet-panel]")
      const card = band.closest("[data-onepage-dialog-panel]")
      const box = (sheet || card).getBoundingClientRect()
      const handle = sheet?.querySelector("[data-sheet-handle]")
      return {
        kind: sheet ? "bottom sheet" : card ? "centred card" : "none",
        bottomGap: Math.round(innerHeight - box.bottom),
        width: Math.round(box.width),
        top: Math.round(box.top),
        /* On a phone, the grip's strip is the band's colour: no white over the band. */
        gripStrip: handle ? getComputedStyle(handle).backgroundColor : null,
        band: getComputedStyle(band).backgroundColor,
      }
    })
    console.log(`   share ${label}: ${JSON.stringify(s)}`)
    results.push({ viewport: label, name: "share", ...s })
    if (label === "390") {
      check(s.kind === "bottom sheet" && s.bottomGap <= 1 && s.width === 390, `390 share: a bottom sheet from the foot of the screen, full width (${s.kind}, gap ${s.bottomGap}, ${s.width}px)`)
      check(s.gripStrip === s.band, `390 share: the band runs under the grip (${s.gripStrip} / ${s.band})`)
    } else check(s.kind === "centred card" && s.width === 380, `1440 share: the centred card, 380 wide (${s.kind}, ${s.width}px)`)
    if (shots) await page.screenshot({ path: join(shots, `share-${label}.png`) })
    await page.close()
  }
} finally {
  await browser.close()
  server.close()
}
console.log("\nRESULTS " + JSON.stringify(results))
if (failures.length && !report) {
  console.error(`\n${failures.length} failed`)
  process.exit(1)
}
console.log(failures.length ? `\n${failures.length} would fail (REPORT)` : "\nall passed")
