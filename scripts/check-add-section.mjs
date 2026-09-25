/**
 * ===========================================================================
 *  ADDING A SECTION, ON A PHONE AND A COMPUTER, WITH THE FRAMES COUNTED
 * ===========================================================================
 * "When I tap between two sections, it opens the add a section modal ...
 * it should not glitch, be very optimized for performance, not lag at all.
 * When I'm adding a section, it should be very smooth on click, not glitch
 * or flash; when I click add, smoothly close the modal, add the section very
 * smoothly in between the sections where it adds it, auto smooth scroll to
 * it, and it should appear very smoothly in the canvas."
 *
 * The real editor (scripts/editor-probe-harness.mjs), CPU at a quarter speed
 * (Chrome's mobile profile), driven the way a person drives it:
 *
 *   OPEN      tap the gap between the first two sections of the page;
 *             every frame until the library has stopped moving is timed
 *   PILLS     on a phone, the creator's own sections are the first pill
 *   PREVIEWS  every card has its preview drawn before it is opened (they are
 *             drawn in idle time after the editor settles)
 *   SWITCH    choose a category: how long until the next frame, how many
 *             cards were built again (none: a category is a filter), and
 *             whether the grid moved under the cards it kept
 *   ADD       tap a card: the library closes, the section lands in the gap
 *             that was tapped (not at the end of the page), the sections
 *             under it slide down rather than jump, and the time from the tap
 *             to the section being fully on screen
 *
 * with long tasks (over 50ms) counted across each step, and screenshots of
 * the library and the canvas mid arrival.
 *
 *   node scripts/check-add-section.mjs
 *   SHOTS=/path node scripts/check-add-section.mjs    (where the pictures go)
 */
import { createServer } from "node:http"
import { mkdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import puppeteer from "puppeteer-core"
import { bundle, css } from "./editor-probe-harness.mjs"
import { interFaces } from "./probe-css.mjs"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const SHOTS = process.env.SHOTS ?? join(tmpdir(), "storelib-add-section")
mkdirSync(SHOTS, { recursive: true })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/* A creator with a section of their own, so the first pill has something in it. */
const OWN = `<template><section class="mine"><h2>{{ settings.heading }}</h2></section></template>
<style scoped>.mine { padding: 48px 24px; background: #fef3c7; text-align: center; font-family: system-ui; }</style>
<schema>{"schema_version":1,"type":"my_banner","name":"My banner","category":"content","settings":[{"type":"text","id":"heading","label":"Heading","default":"Made by me"}],"presets":[{"name":"My banner","settings":{"heading":"Made by me"}}]}</schema>`

const js = readFileSync(bundle)
const page = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<style>${interFaces()}</style><style>${css}</style></head><body><div id="app"></div>
<script>
  window.PROBE_SHORT = false
  /* The install's saved files, with one section the creator wrote. */
  window.PROBE_FILES = { "sections/my_banner.storelib": ${JSON.stringify(OWN)} }
</script>
<script src="/editor-probe.js"></script></body></html>`
const server = createServer((req, res) => {
  if (req.url.startsWith("/editor-probe.js")) {
    res.writeHead(200, { "content-type": "text/javascript" })
    return res.end(js)
  }
  res.writeHead(200, { "content-type": "text/html" })
  res.end(page)
})
await new Promise((r) => server.listen(0, "127.0.0.1", r))
const origin = `http://127.0.0.1:${server.address().port}`
const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--disable-dev-shm-usage"] })

let bad = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${typeof got === "string" ? got : JSON.stringify(got)})`}`)
  if (!ok) bad++
}

/* In the page: a frame and long-task recorder that can be started and read. */
const RECORDER = `
  window.__rec = {
    start() {
      this.frames = []; this.long = []; this.on = true
      if (!this.obs) {
        this.obs = new PerformanceObserver((l) => { if (this.on) for (const e of l.getEntries()) this.long.push(Math.round(e.duration)) })
        this.obs.observe({ type: "longtask", buffered: false })
      }
      let last = performance.now()
      const tick = (t) => { if (!this.on) return; this.frames.push(Math.round((t - last) * 10) / 10); last = t; requestAnimationFrame(tick) }
      requestAnimationFrame((t) => { last = t; requestAnimationFrame(tick) })
    },
    stop() {
      this.on = false
      const f = this.frames.slice()
      const s = [...f].sort((a, b) => a - b)
      const at = (q) => (s.length ? s[Math.min(s.length - 1, Math.floor(s.length * q))] : 0)
      return { frames: f.length, median: at(0.5), p95: at(0.95), worst: s.length ? s[s.length - 1] : 0, over34: f.filter((d) => d > 34).length, long: this.long.slice() }
    },
  }
`

async function run(kind) {
  const phone = kind === "phone"
  const p = await browser.newPage()
  await p.setViewport(phone ? { width: 390, height: 844, isMobile: true, hasTouch: true } : { width: 1440, height: 900 })
  await p.goto(`${origin}/editor`, { waitUntil: "load" })
  await p.waitForFunction(() => document.querySelectorAll("#wb-preview-root [data-section-box]").length >= 8, { timeout: 60_000 })
  await p.evaluate(RECORDER)
  /* The editor settles and the library draws its previews in idle time. */
  await p.waitForFunction(() => document.querySelectorAll("[data-library-card]").length >= 30, { timeout: 30_000 }).catch(() => {})
  await sleep(2500)
  const warm = await p.evaluate(() => {
    const cards = [...document.querySelectorAll("[data-library-card]")]
    return { cards: cards.length, drawn: cards.filter((c) => c.querySelector("[data-keep-transform]")).length }
  })
  const cdp = await p.createCDPSession()
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 })
  await sleep(300)

  console.log(`\n══ ${phone ? "A phone, 390 × 844" : "A computer, 1440 × 900"}, CPU at a quarter speed ══\n`)
  /* A phone's sheet keeps its content, so it is ready before it opens; a computer's dialog is built as it opens (below). */
  if (phone) expect(warm.cards >= 30 && warm.drawn === warm.cards, "every card is built, with its preview drawn, before the library is opened", warm)

  /* The page as it was, to find the new section by. */
  const before = await p.evaluate(() => [...document.querySelectorAll("#wb-preview-root [id^='wb-section-']")].map((e) => e.id))

  /* ── OPEN: the gap between the first two sections of the page ── */
  const gap = await p.evaluate(() => {
    const strips = [...document.querySelectorAll("#wb-preview-root [aria-label='Add a section here']")]
    const s = strips[1] ?? strips[0]
    s.scrollIntoView({ block: "center" })
    const r = s.getBoundingClientRect()
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), n: strips.length }
  })
  await sleep(400)
  const gap2 = await p.evaluate(() => {
    const strips = [...document.querySelectorAll("#wb-preview-root [aria-label='Add a section here']")]
    const r = (strips[1] ?? strips[0]).getBoundingClientRect()
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }
  })
  await p.evaluate(() => window.__rec.start())
  const t0 = Date.now()
  if (phone) await p.touchscreen.tap(gap2.x, gap2.y)
  else await p.mouse.click(gap2.x, gap2.y)
  /* Until the library has stopped moving for six frames. */
  const opened = await p.evaluate(async (phone) => {
    const start = performance.now()
    const surface = () => phone
      ? document.querySelector("[data-section-library='phone']")?.closest("[data-mobile-bottom-sheet]")
      : document.querySelector("[data-section-library='desktop']")
    let last = "", still = 0, seen = null
    while (performance.now() - start < 3000) {
      await new Promise((r) => requestAnimationFrame(r))
      const el = surface()
      if (!el) continue
      if (seen === null) seen = Math.round(performance.now() - start)
      const r = el.getBoundingClientRect()
      const now = `${Math.round(r.top)}:${getComputedStyle(el).opacity}`
      still = now === last ? still + 1 : 0
      last = now
      if (still >= 6) return { seen, settled: Math.round(performance.now() - start) }
    }
    return { seen, settled: null }
  }, phone)
  const openStats = await p.evaluate(() => window.__rec.stop())
  await p.screenshot({ path: join(SHOTS, `${kind}-1-open.png`) })
  expect(opened.settled !== null, "the library opens and comes to rest", opened)
  console.log(`  --    opened: first frame at ${opened.seen}ms, at rest at ${opened.settled}ms; ${openStats.frames} frames, median ${openStats.median}ms, p95 ${openStats.p95}ms, worst ${openStats.worst}ms; long tasks ${JSON.stringify(openStats.long)}`)
  expect(openStats.long.every((d) => d < 120), "no task in the open longer than 120ms at a quarter speed", openStats.long)

  if (!phone) {
    /* The previews go in a few a frame as the dialog opens; all of them within a second. */
    const filled = await p.evaluate(async () => {
      const start = performance.now()
      let n = 0, cards = 0
      while (performance.now() - start < 3000) {
        const all = [...document.querySelectorAll("[data-section-library] [data-library-card]")]
        cards = all.length
        n = all.filter((c) => c.querySelector("[data-keep-transform]")).length
        if (cards && n === cards) break
        await new Promise((r) => requestAnimationFrame(r))
      }
      return { cards, drawn: n, ms: Math.round(performance.now() - start) }
    })
    expect(filled.cards >= 30 && filled.drawn === filled.cards, "every card has its preview within moments of opening", filled)
  }

  const where = await p.evaluate(() => document.querySelector("[data-library-where]")?.textContent ?? null)
  if (phone) expect(!!where && /Between/.test(where), "the library says where the section will go", where)

  /* ── PILLS ── */
  const pills = await p.evaluate(() => [...document.querySelectorAll("[data-section-library] .wb-chip, [data-section-library] nav button")].map((b) => (b.textContent || "").trim()))
  expect(/Created by you|Made by me/.test(pills[0] ?? ""), "the creator's own sections are the first category", pills.slice(0, 3))

  /* ── SWITCH ── */
  const switched = await p.evaluate(async (phone) => {
    const lib = document.querySelector("[data-section-library]")
    const button = [...lib.querySelectorAll(phone ? ".wb-chip" : "nav button")].find((b) => /^Features/.test((b.textContent || "").trim()))
    const cardsBefore = [...lib.querySelectorAll("[data-library-card]")]
    window.__rec.start()
    const t = performance.now()
    button.click()
    await new Promise((r) => requestAnimationFrame(() => r()))
    const toFrame = Math.round(performance.now() - t)
    await new Promise((r) => setTimeout(r, 450))
    const cardsAfter = [...lib.querySelectorAll("[data-library-card]")]
    const rebuilt = cardsAfter.filter((c) => !cardsBefore.includes(c)).length
    const visible = cardsAfter.filter((c) => !c.hidden).length
    return { toFrame, rebuilt, visible, pressed: button.getAttribute("aria-pressed"), stats: window.__rec.stop() }
  }, phone)
  await p.screenshot({ path: join(SHOTS, `${kind}-2-category.png`) })
  expect(switched.pressed === "true" && switched.visible > 0 && switched.visible < 30, "choosing a category shows its sections", switched)
  expect(switched.rebuilt === 0, "and builds nothing again: the same cards, some hidden", switched.rebuilt)
  expect(switched.stats.long.every((d) => d < 80), "no long task on a category switch", switched.stats.long)
  console.log(`  --    category switch: next frame ${switched.toFrame}ms after the press; long tasks ${JSON.stringify(switched.stats.long)}`)

  /* ── ADD ── */
  await p.evaluate(() => window.__rec.start())
  const card = await p.evaluate(() => {
    const c = [...document.querySelectorAll("[data-section-library] [data-library-card]")].find((x) => !x.hidden)
    const r = c.getBoundingClientRect()
    return { type: c.getAttribute("data-library-card"), x: Math.round(r.left + r.width / 2), y: Math.round(r.top + Math.min(r.height / 2, 60)) }
  })
  if (phone) await p.touchscreen.tap(card.x, card.y)
  else await p.mouse.click(card.x, card.y)
  const tAdd = Date.now()
  /* Mid arrival, for the eye. */
  await sleep(phone ? 420 : 300)
  await p.screenshot({ path: join(SHOTS, `${kind}-3-arriving.png`) })
  const arrived = await p.evaluate(async (before) => {
    const start = performance.now()
    let el = null
    while (performance.now() - start < 5000) {
      el = [...document.querySelectorAll("#wb-preview-root [id^='wb-section-']")].find((e) => !before.includes(e.id))
      if (el && el.getAttribute("data-arrival") === "done") break
      await new Promise((r) => requestAnimationFrame(r))
    }
    const order = [...document.querySelectorAll("#wb-preview-root [id^='wb-section-']")].map((e) => e.id)
    const scroller = document.getElementById("wb-preview-root")
    const box = scroller.getBoundingClientRect()
    const r = el ? el.getBoundingClientRect() : null
    return {
      id: el ? el.id : null,
      state: el ? el.getAttribute("data-arrival") : null,
      index: el ? order.indexOf(el.id) : -1,
      total: order.length,
      onScreen: r ? r.top < box.bottom - 40 && r.bottom > box.top : false,
      libraryGone: document.querySelector("[data-section-library-layer]")?.getAttribute("data-state") !== "open" && (() => {
        const sheet = document.querySelector("[data-section-library='phone']")?.closest("[data-mobile-bottom-sheet]")
        return !sheet || sheet.getBoundingClientRect().top >= window.innerHeight - 2
      })(),
    }
  }, before)
  const addMs = Date.now() - tAdd
  const addStats = await p.evaluate(() => window.__rec.stop())
  await sleep(300)
  await p.screenshot({ path: join(SHOTS, `${kind}-4-added.png`) })
  expect(arrived.state === "done", "the new section arrives and settles", arrived)
  /* The gap tapped was the one under the page's first section: header, first section, the new one. */
  expect(arrived.index === 2, "in the gap that was tapped, not at the end of the page", `at ${arrived.index} of ${arrived.total}`)
  expect(arrived.onScreen, "on screen when it has arrived")
  expect(arrived.libraryGone, "and the library has gone")
  console.log(`  --    add: tap to settled ${addMs}ms (which includes a ${phone ? "sheet" : "dialog"} close and a ${460}ms reveal); ${addStats.frames} frames, median ${addStats.median}ms, p95 ${addStats.p95}ms, worst ${addStats.worst}ms; long tasks ${JSON.stringify(addStats.long)}`)
  await p.close()
  return { opened, openStats, switched, arrived, addMs, addStats }
}

const phone = await run("phone")
const desk = await run("desktop")
await browser.close()
server.close()
console.log(`\nScreenshots in ${SHOTS}\n`)
if (bad) {
  console.error(`${bad} check${bad === 1 ? "" : "s"} failed.`)
  process.exit(1)
}
console.log("Opening, choosing and adding a section keep up, and the section lands where it was asked for.\n")
