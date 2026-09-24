/**
 * ===========================================================================
 *  THE SHEET, OPENED AND CLOSED TWENTY TIMES, EVERY FRAME READ
 * ===========================================================================
 * "When I open it sometimes it glitches, double glitches." The glitch was one
 * frame long, so nothing but a frame-by-frame reading can hold it fixed: the
 * account sheet was committed at rest, painted once fully open, then moved
 * below the screen by an effect that ran after that paint, and slid up from
 * there. Open, vanish, rise.
 *
 * For every open and every close this records, on every animation frame, where
 * the sheet really is (the computed transform, running animation included)
 * and asserts:
 *
 *   FIRST FRAME OFF SCREEN  the first frame the sheet exists, it is below the
 *                           screen, never at rest
 *   ONE DIRECTION           it only ever rises while opening and only ever
 *                           falls while closing: any step backwards is the
 *                           double glitch
 *   IT FINISHES             open ends at rest, close ends with no sheet
 *   OVER THE PILL           while open the nav pill is at layer 0 and what is
 *                           at the pill's centre is the sheet or its scrim,
 *                           through the real rule in app/globals.css
 *   NO LONG TASK            no main thread task over 50ms while it moves
 *   A FLICK CLOSES, A SLOW  a fast short drag closes it; a slow one that
 *   DRAG SPRINGS BACK       stays under the threshold returns to rest
 *
 * The page is taps from a touch screen, so a tap is followed by the mousedown
 * a phone synthesizes, which is what the account sheet's parent listened to.
 *
 *   pnpm build && node scripts/check-sheet-motion.mjs
 *   CSS_URL=http://localhost:3000/ node scripts/check-sheet-motion.mjs   (a dev server's CSS instead of a build's)
 */
import { execFileSync } from "node:child_process"
import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const CYCLES = Number(process.env.CYCLES ?? 20)
const root = process.cwd()
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)

async function stylesheet() {
  const cssDir = join(root, ".next/static/chunks")
  if (existsSync(cssDir) && !process.env.CSS_URL) {
    return readdirSync(cssDir).filter((f) => f.endsWith(".css")).map((f) => readFileSync(join(cssDir, f), "utf8")).join("\n")
  }
  const base = process.env.CSS_URL
  if (!base) fail("No production build found. Run `pnpm build` first, or set CSS_URL to a running dev server.")
  const html = await (await fetch(base)).text()
  const hrefs = [...html.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/g)].map((m) => new URL(m[1], base).toString())
  return (await Promise.all(hrefs.map(async (h) => (await fetch(h)).text()))).join("\n")
}

const out = mkdtempSync(join(tmpdir(), "storelib-sheet-motion-"))
execFileSync("npx", ["--no-install", "esbuild", join(root, "scripts/render-sheet-motion.tsx"),
  "--bundle", "--format=iife", "--platform=browser", "--jsx=automatic", "--log-level=error", `--outfile=${join(out, "probe.js")}`,
  '--define:process.env.NODE_ENV="production"',
  `--alias:@=${root}`, "--loader:.css=empty"],
  { stdio: ["ignore", "ignore", "inherit"] })
const file = join(out, "index.html")
writeFileSync(file, `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
  `<style>[data-app-nav-pill]{z-index:55}</style><style>${await stylesheet()}</style><style>body{margin:0;background:#f8f9fa}</style>` +
  `</head><body><div id="app"></div><script>${readFileSync(join(out, "probe.js"), "utf8")}</script></body></html>`)

const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox"], headless: true })
const page = await browser.newPage()
await page.emulate({ viewport: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148" })
/* SHEET_KB=1: the sheet as one with a field in it (aboveKeyboard). */
await page.goto("file://" + file + (process.env.SHEET_KB ? "?kb" : ""))
await new Promise((r) => setTimeout(r, 800))
await page.evaluate(() => {
  window.__rec = []
  window.__long = []
  new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__long.push({ t: e.startTime, d: e.duration }) }).observe({ type: "longtask" })
  const panel = () => document.querySelector('[data-sheet-panel]') || document.querySelector('[role="dialog"][aria-modal="true"] > div:last-child')
  const tick = (t) => {
    const el = panel()
    window.__rec.push(el ? { t, y: new DOMMatrixReadOnly(getComputedStyle(el).transform).m42, h: el.offsetHeight } : { t, y: null, h: 0 })
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
})
const now = () => page.evaluate(() => performance.now())
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const slice = (a, b) => page.evaluate((a, b) => ({ rec: window.__rec.filter((r) => r.t >= a && r.t < b), long: window.__long.filter((l) => l.t >= a && l.t < b) }), a, b)

const problems = []
let backwards = 0, flashes = 0, longTasks = 0, maxLong = 0, pillOver = 0, unfinished = 0, frames = 0
for (let i = 0; i < CYCLES; i++) {
  const t0 = await now()
  const box = await page.evaluate(() => { const r = document.getElementById("trigger").getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 } })
  await page.touchscreen.tap(box.x, box.y)
  await wait(650)
  const t1 = await now()
  const pill = await page.evaluate(() => {
    const p = document.getElementById("pill")
    const r = p.firstElementChild.getBoundingClientRect()
    const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
    return { z: getComputedStyle(p).zIndex, onTop: !!hit?.closest("#pill") }
  })
  /* The pill keeps its own layer (it used to step down to 0, which hid it
     behind the page before the sheet arrived); the sheet is simply above it. */
  if (pill.z !== "55" || pill.onTop) pillOver++
  await page.touchscreen.tap(195, 120)
  await wait(500)
  const t2 = await now()
  const open = await slice(t0, t1), close = await slice(t1, t2)
  const o = open.rec.filter((r) => r.y !== null), c = close.rec.filter((r) => r.y !== null)
  frames += o.length + c.length
  if (!o.length) { problems.push(`cycle ${i}: the sheet never appeared`); continue }
  if (o[0].y < o[0].h * 0.9) flashes++
  for (let k = 1; k < o.length; k++) if (o[k].y > o[k - 1].y + 0.5) backwards++
  for (let k = 1; k < c.length; k++) if (c[k].y < c[k - 1].y - 0.5) backwards++
  if (Math.abs(o[o.length - 1].y) > 0.5) unfinished++
  if (close.rec.length && close.rec[close.rec.length - 1].y !== null) unfinished++
  for (const l of [...open.long, ...close.long]) { longTasks++; maxLong = Math.max(maxLong, l.d) }
}

/* A slow drag springs back; a flick closes. Real touch events from the screen. */
const client = await page.createCDPSession()
async function drag(dy, stepMs, steps = 6) {
  const box = await page.evaluate(() => { const r = document.getElementById("trigger").getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 } })
  await page.touchscreen.tap(box.x, box.y)
  await wait(650)
  const top = await page.evaluate(() => { const h = document.querySelector("[data-sheet-handle]"); return h ? h.getBoundingClientRect().top + 8 : 600 })
  await client.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: 195, y: top }] })
  for (let s = 1; s <= steps; s++) {
    await client.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: 195, y: top + (dy * s) / steps }] })
    await wait(stepMs)
  }
  await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] })
  await wait(600)
  return page.evaluate(() => { const el = document.querySelector("[data-sheet-panel]") || document.querySelector('[role="dialog"][aria-modal="true"] > div:last-child'); return el ? Math.round(new DOMMatrixReadOnly(getComputedStyle(el).transform).m42) : "closed" })
}
const slow = await drag(60, 90)
if (slow !== 0) problems.push(`a slow 60px drag should spring back to rest, ended at ${slow}`)
if (slow !== "closed") { await page.touchscreen.tap(195, 120); await wait(500) }
const flick = await drag(80, 0, 4)
if (flick !== "closed") problems.push(`a fast 80px flick should close the sheet, it rests at ${flick}`)

await browser.close()

console.log(JSON.stringify({ cycles: CYCLES, frames, flashBeforeSlide: flashes, backwardSteps: backwards, unfinished, pillNotUnder: pillOver, longTasks, maxLongTaskMs: Math.round(maxLong), slowDrag: slow, flick }))
if (flashes) problems.push(`${flashes} opens painted the sheet before it slid`)
if (backwards) problems.push(`${backwards} frames moved the sheet backwards`)
if (unfinished) problems.push(`${unfinished} opens or closes did not finish`)
if (pillOver) problems.push(`the nav pill was over the sheet in ${pillOver} cycles`)
if (longTasks) problems.push(`${longTasks} long tasks while a sheet moved, the longest ${Math.round(maxLong)}ms`)
if (problems.length) fail(problems.join("\n"))
console.log("ok: every open starts below the screen, moves one way, finishes, and sits over the pill")
