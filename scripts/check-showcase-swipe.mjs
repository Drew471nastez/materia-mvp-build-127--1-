/**
 * ===========================================================================
 *  THE SHOWCASE UNDER THE HERO: SWIPE, AUTOPLAY AND CAPTIONS, MEASURED
 * ===========================================================================
 * Landing round 6. Drives the real home page in headless Chromium:
 *
 *   PHONE (iPhone 13 emulation, CDP Input.dispatchTouchEvent)
 *     shape     cards are 4:3, about 78% of the screen wide, the first on the
 *               gutter, the next one peeking in on the right
 *     captions  each caption sits under its picture, never on it, and the
 *               section ends below the last caption with room to spare
 *     sideways  a horizontal swipe moves the rail and not the page, and the
 *               rail comes to rest on a card
 *     down      a vertical swipe that starts on a card scrolls the page and
 *               leaves the rail where it was
 *     autoplay  nothing moves the rail for 5s after a touch; it moves again
 *               on its own later
 *     frames    rAF frame times while the finger moves and the rail settles
 *   DESKTOP (1440 x 900, a mouse)
 *     hover     the hovered card's caption shows, under its picture, inside
 *               the section
 *
 * Needs a running server (BASE, default http://127.0.0.1:3231). Screenshots
 * go to SHOTS (default ./showcase-shots).
 *
 *   node scripts/check-showcase-swipe.mjs
 */
import { mkdirSync } from "node:fs"
import { createRequire } from "node:module"

/* Playwright is preinstalled globally (NODE_PATH), not a dependency: required, since import ignores NODE_PATH. */
const { chromium, devices } = createRequire(import.meta.url)("playwright")

const BASE = process.env.BASE || "http://127.0.0.1:3231"
const SHOTS = process.env.SHOTS || "showcase-shots"
mkdirSync(SHOTS, { recursive: true })
let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${typeof got === "string" ? got : JSON.stringify(got)})`}`)
  if (!ok) broken++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const geometry = () => {
  const section = document.querySelector("[data-build-showcase]")
  const track = section.querySelector(".build-showcase-track")
  const box = (el) => {
    const r = el.getBoundingClientRect()
    return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height }
  }
  const slides = [...section.querySelectorAll(".build-showcase-slide")].map((s) => ({
    pic: box(s.querySelector(".build-showcase-pic")),
    cap: box(s.querySelector("figcaption")),
    capOpacity: getComputedStyle(s.querySelector("figcaption")).opacity,
  }))
  return { vw: innerWidth, section: box(section), slides, scrollLeft: track.scrollLeft, native: !!track.dataset.showcaseNative }
}

async function bringIntoView(page) {
  await page.evaluate(() => {
    const s = document.querySelector("[data-build-showcase] .build-showcase-viewport")
    scrollTo(0, s.getBoundingClientRect().top + scrollY - 160)
  })
  await page.waitForSelector(".build-showcase-viewport[data-showcase-entered]")
  await page.evaluate(() => Promise.all([...document.querySelectorAll(".build-showcase-pic img")].map((i) => i.decode?.().catch(() => {}))))
  await sleep(900)
  /* The cookie notice is not part of the section: out of the screenshots. */
  await page.evaluate(() => {
    const text = [...document.querySelectorAll("p, div")].find((e) => /^Necessary cookies keep/.test(e.textContent ?? ""))
    let el = text
    while (el && getComputedStyle(el).position !== "fixed") el = el.parentElement
    if (el) el.style.display = "none"
  })
}

/* Records rAF frame deltas in the page until stopped. */
const startFrames = (page) =>
  page.evaluate(() => {
    window.__frames = []
    window.__framesOn = true
    let last = performance.now()
    const tick = (t) => {
      window.__frames.push(t - last)
      last = t
      if (window.__framesOn) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })
const stopFrames = (page) =>
  page.evaluate(() => {
    window.__framesOn = false
    const f = window.__frames.slice(1).sort((a, b) => a - b)
    return { frames: f.length, p50: +f[Math.floor(f.length * 0.5)].toFixed(1), p95: +f[Math.floor(f.length * 0.95)].toFixed(1), max: +f[f.length - 1].toFixed(1) }
  })

async function swipe(cdp, from, to, steps = 14, stepMs = 16) {
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: from.x, y: from.y }] })
  for (let i = 1; i <= steps; i++) {
    const x = from.x + ((to.x - from.x) * i) / steps
    const y = from.y + ((to.y - from.y) * i) / steps
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y }] })
    await sleep(stepMs)
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] })
}

const browser = await chromium.launch()
try {
  /* ---------------------------------------------------------------- PHONE */
  console.log("\n── phone (iPhone 13) ──")
  const phone = await browser.newContext({ ...devices["iPhone 13"] })
  const page = await phone.newPage()
  await page.addInitScript(() => {
    window.__longTasks = 0
    try {
      new PerformanceObserver((l) => (window.__longTasks += l.getEntries().length)).observe({ type: "longtask", buffered: true })
    } catch {}
  })
  await page.goto(BASE + "/", { waitUntil: "load", timeout: 180_000 })
  await bringIntoView(page)
  let g = await page.evaluate(geometry)
  expect(g.native, "the phone rail is the browser's own scroller")
  const [a, b] = g.slides
  expect(Math.abs(a.pic.width / a.pic.height - 4 / 3) < 0.02, "cards are 4:3", (a.pic.width / a.pic.height).toFixed(3))
  expect(a.pic.width / g.vw > 0.74 && a.pic.width / g.vw < 0.82, "a card is about 78% of the screen wide", (a.pic.width / g.vw).toFixed(3))
  expect(Math.abs(a.pic.left - 20) < 1.5, "the first card sits on the 20px gutter", a.pic.left)
  expect(b.pic.left < g.vw - 30 && b.pic.left - a.pic.right >= 8 && b.pic.left - a.pic.right <= 12, "the next card peeks in, 10px after", { peek: g.vw - b.pic.left, gap: b.pic.left - a.pic.right })
  expect(g.slides.every((s) => s.cap.top >= s.pic.bottom - 0.5), "every caption is under its picture, never on it")
  expect(g.slides.every((s) => s.capOpacity === "1"), "on a touch screen the captions show")
  const room = g.section.bottom - Math.max(...g.slides.map((s) => s.cap.bottom))
  expect(room >= 30, "the section ends well below the captions", Math.round(room))
  console.log(`  info  section height ${Math.round(g.section.height)}px at 390`)
  await page.screenshot({ path: `${SHOTS}/showcase-390.png`, clip: { x: 0, y: Math.max(0, g.section.top), width: g.vw, height: Math.min(844, g.section.height) } })

  const cdp = await phone.newCDPSession(page)
  const rail = () => page.evaluate(() => ({ x: document.querySelector(".build-showcase-track").scrollLeft, y: scrollY }))
  const stopsOf = () =>
    page.evaluate(() => {
      const t = document.querySelector(".build-showcase-track")
      const pad = parseFloat(getComputedStyle(t).scrollPaddingLeft) || 0
      const max = t.scrollWidth - t.clientWidth
      return [...t.querySelectorAll(".build-showcase-slide")].map((s) => Math.min(max, Math.max(0, s.offsetLeft - pad)))
    })
  const stops = await stopsOf()
  const cardY = Math.round(a.pic.top + a.pic.height / 2)

  /* Sideways: a 240px swipe from right to left over about 230ms. */
  let before = await rail()
  await startFrames(page)
  await swipe(cdp, { x: 320, y: cardY }, { x: 80, y: cardY + 6 })
  const mid = await rail()
  await sleep(1400)
  const frames = await stopFrames(page)
  let after = await rail()
  expect(mid.x > before.x + 100, "a horizontal swipe moves the rail with the finger", { before: before.x, during: mid.x })
  expect(Math.abs(after.y - before.y) < 2, "and the page does not scroll", { before: before.y, after: after.y })
  const near = (x) => stops.reduce((m, s) => Math.min(m, Math.abs(s - x)), Infinity)
  expect(after.x > 0 && near(after.x) < 2, "after the release the rail rests on a card", { at: after.x, off: near(after.x) })
  expect(frames.p95 < 20, "frames during the swipe and settle (p95 under 20ms)", frames)
  g = await page.evaluate(geometry)
  await page.screenshot({ path: `${SHOTS}/showcase-390-swiped.png`, clip: { x: 0, y: Math.max(0, g.section.top), width: g.vw, height: Math.min(844, g.section.height) } })

  /* Autoplay holds off for 5s after that touch. */
  const held = []
  for (let i = 0; i < 20; i++) {
    held.push((await rail()).x)
    await sleep(250)
  }
  expect(held.every((x) => Math.abs(x - after.x) < 1), "autoplay does not move the rail within 5s of a touch", [held[0], held[held.length - 1]])
  /* Then it comes back on its own, one card, and lands on it. */
  let moved = null
  for (let i = 0; i < 40 && moved === null; i++) {
    await sleep(250)
    const x = (await rail()).x
    if (Math.abs(x - after.x) > 1) moved = x
  }
  await sleep(1200)
  const resumed = (await rail()).x
  expect(moved !== null && near(resumed) < 2 && resumed !== after.x, "autoplay comes back later and lands on the next card", { from: after.x, to: resumed })

  /* Down: a vertical swipe that starts on a card scrolls the page. */
  await sleep(300)
  before = await rail()
  await swipe(cdp, { x: 200, y: cardY + 120 }, { x: 206, y: cardY - 160 }, 12, 16)
  await sleep(800)
  after = await rail()
  expect(after.y > before.y + 100, "a vertical swipe on a card scrolls the page", { before: before.y, after: after.y })
  expect(Math.abs(after.x - before.x) < 1, "and the rail does not move", { before: before.x, after: after.x })
  console.log(`  info  long tasks over the run: ${await page.evaluate(() => window.__longTasks)}`)
  await phone.close()

  /* -------------------------------------------------------------- DESKTOP */
  console.log("\n── desktop (1440 x 900, a mouse) ──")
  const desk = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const dp = await desk.newPage()
  await dp.goto(BASE + "/", { waitUntil: "load", timeout: 180_000 })
  await bringIntoView(dp)
  g = await dp.evaluate(geometry)
  expect(!g.native, "with a mouse from 768px the rail is RailMotion's")
  expect(g.slides.slice(0, 3).every((s) => s.capOpacity === "0"), "captions wait for the hover")
  const first = g.slides[0]
  await dp.mouse.move(first.pic.left + first.pic.width / 2, first.pic.top + first.pic.height / 2)
  await sleep(700)
  g = await dp.evaluate(geometry)
  const h = g.slides[0]
  expect(h.capOpacity === "1", "the hovered card's caption shows")
  expect(h.cap.top >= h.pic.bottom - 0.5, "under its picture, never on it", { pic: Math.round(h.pic.bottom), cap: Math.round(h.cap.top) })
  const deskRoom = g.section.bottom - h.cap.bottom
  expect(deskRoom >= 30, "and the section ends below it with room", Math.round(deskRoom))
  expect(g.slides.slice(1, 3).every((s) => s.capOpacity === "0"), "the others stay away")
  console.log(`  info  section height ${Math.round(g.section.height)}px at 1440`)
  await dp.screenshot({ path: `${SHOTS}/showcase-1440-hover.png`, clip: { x: 0, y: Math.max(0, g.section.top), width: 1440, height: Math.min(900 - Math.max(0, g.section.top), g.section.height) } })
  await desk.close()
} finally {
  await browser.close()
}
console.log(broken ? `\n${broken} check(s) failed` : "\nall checks passed")
process.exit(broken ? 1 : 0)
