/**
 * ===========================================================================
 *  THE STORELIB.COM PHONE MENU, EVERY FRAME READ
 * ===========================================================================
 * The marketing header's phone menu was a sheet of its own (a CSS
 * transition, React state per drag frame, a 400ms timer before it told
 * anybody it had closed). It is the app's shared sheet now. This opens and
 * closes it on the real page, from a running dev server or a deployment,
 * and reads the sheet's position on every animation frame:
 *
 *   the first frame it exists it is below the screen, never at rest
 *   it only rises while opening and only falls while closing
 *   it moves by transform only: its height and top never change
 *   it ends at rest, and after the close it is gone
 *   the page under it does not render twice (one sheet, one scrim)
 *
 *   BASE_URL=http://localhost:3104 node scripts/check-header-sheet.mjs
 */
import puppeteer from "puppeteer-core"
import { existsSync } from "node:fs"

const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
const BASE = process.env.BASE_URL || "http://localhost:3104"
const PATH = process.env.PAGE_PATH || "/pricing"
const CYCLES = Number(process.env.CYCLES ?? 6)
if (!existsSync(CHROMIUM)) {
  console.error(`No browser at ${CHROMIUM}.`)
  process.exit(1)
}

let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${typeof got === "string" ? got : JSON.stringify(got)})`}`)
  if (!ok) broken++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--disable-gpu", "--hide-scrollbars"] })
const page = await browser.newPage()
await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true })
await page.goto(`${BASE}${PATH}`, { waitUntil: "networkidle2", timeout: 180_000 })
await sleep(800)

/* Every frame: where the panel is, how tall, how many sheets exist. */
await page.evaluate(() => {
  window.__frames = []
  const tick = () => {
    const panels = document.querySelectorAll("[data-app-sheet] [data-sheet-panel]")
    const p = panels[0]
    if (p) {
      const r = p.getBoundingClientRect()
      window.__frames.push({ t: performance.now(), y: new DOMMatrixReadOnly(getComputedStyle(p).transform === "none" ? undefined : getComputedStyle(p).transform).m42, top: Math.round(r.top - new DOMMatrixReadOnly(getComputedStyle(p).transform === "none" ? undefined : getComputedStyle(p).transform).m42), h: Math.round(r.height), n: panels.length, scrims: document.querySelectorAll("[data-app-sheet]").length })
    } else window.__frames.push({ t: performance.now(), gone: true })
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
})

const button = await page.$('button[aria-label="Open menu"], button[aria-label="Open categories"]')
expect(!!button, "the header has its menu button at 390px")
if (!button) {
  await browser.close()
  process.exit(1)
}

let firstOffscreen = 0
let monotonicOpen = 0
let monotonicClose = 0
let steadyBox = 0
let endedAtRest = 0
let gone = 0
let single = 0
for (let i = 0; i < CYCLES; i++) {
  await page.evaluate(() => (window.__frames = []))
  await button.tap()
  await sleep(600)
  const open = (await page.evaluate(() => window.__frames)).filter((f) => !f.gone)
  if (open.length && open[0].y > open[0].h * 0.5) firstOffscreen++
  if (open.every((f, k) => k === 0 || f.y <= open[k - 1].y + 0.5)) monotonicOpen++
  if (new Set(open.map((f) => `${f.top}:${f.h}`)).size === 1) steadyBox++
  if (open.length && Math.abs(open.at(-1).y) < 0.5) endedAtRest++
  if (open.every((f) => f.n === 1 && f.scrims === 1)) single++
  if (i === 0 && process.env.SHOT) await page.screenshot({ path: process.env.SHOT })

  await page.evaluate(() => (window.__frames = []))
  await page.evaluate(() => document.querySelector("[data-app-sheet] > div")?.dispatchEvent(new MouseEvent("click", { bubbles: true })))
  await sleep(500)
  const close = await page.evaluate(() => window.__frames)
  const moving = close.filter((f) => !f.gone)
  if (moving.every((f, k) => k === 0 || f.y >= moving[k - 1].y - 0.5)) monotonicClose++
  if (close.at(-1)?.gone) gone++
}

expect(firstOffscreen === CYCLES, "the first frame of every open is below the screen, never at rest", `${firstOffscreen} of ${CYCLES}`)
expect(monotonicOpen === CYCLES, "it only rises while opening", `${monotonicOpen} of ${CYCLES}`)
expect(steadyBox === CYCLES, "its box never changes while it moves: transform only", `${steadyBox} of ${CYCLES}`)
expect(endedAtRest === CYCLES, "every open ends at rest", `${endedAtRest} of ${CYCLES}`)
expect(single === CYCLES, "one sheet and one scrim, never two", `${single} of ${CYCLES}`)
expect(monotonicClose === CYCLES, "it only falls while closing", `${monotonicClose} of ${CYCLES}`)
expect(gone === CYCLES, "and is gone after every close", `${gone} of ${CYCLES}`)

await browser.close()
console.log(broken ? `\n${broken} failed\n` : "\nall passed\n")
process.exit(broken ? 1 : 0)
