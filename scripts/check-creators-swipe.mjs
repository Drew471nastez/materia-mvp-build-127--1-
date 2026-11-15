/**
 * ===========================================================================
 *  "STORELIB IS FOR CREATORS": THE RAIL UNDER A FINGER, MEASURED
 * ===========================================================================
 * Landing round 7. Drives the real home page in headless Chromium at iPhone 13
 * emulation with CDP Input.dispatchTouchEvent:
 *
 *   drift     the rail moves on its own at its cruising speed
 *   sideways  a slow horizontal drag moves the rail and not the page, and
 *             after the axis is decided every step of the finger moves the
 *             rail by the same step (1:1)
 *   throw     a quick flick keeps the rail coasting after the finger lifts,
 *             each slice of time a little less than the one before
 *   resume    a few seconds later the rail drifts at its cruising speed again
 *   down      a vertical swipe that starts on a card scrolls the page and
 *             leaves the rail where it was
 *   diagonal  a swipe more across than down is the rail's, not the page's
 *   frames    rAF frame times over all of it, and long tasks
 *
 * Needs a running server (BASE, default http://127.0.0.1:3246).
 *
 *   node scripts/check-creators-swipe.mjs
 */
import { createRequire } from "node:module"

/* Playwright is preinstalled globally (NODE_PATH), not a dependency: required, since import ignores NODE_PATH. */
const { chromium, devices } = createRequire(import.meta.url)("playwright")

const BASE = process.env.BASE || "http://127.0.0.1:3246"
let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${typeof got === "string" ? got : JSON.stringify(got)})`}`)
  if (!ok) broken++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const browser = await chromium.launch()
const ctx = await browser.newContext({ ...devices["iPhone 13"] })
const page = await ctx.newPage()
await page.goto(`${BASE}/`, { waitUntil: "load", timeout: 180000 })
const reject = page.getByRole("button", { name: "Reject all" })
if (await reject.count()) await reject.first().click().catch(() => {})
/* Walk down so every lazy section mounts, then bring the rail to the upper part of the screen. */
const height = await page.evaluate(() => document.documentElement.scrollHeight)
for (let y = 0; y < height; y += 500) {
  await page.evaluate((y) => scrollTo(0, y), y)
  await sleep(50)
}
await page.evaluate(() => {
  const v = document.querySelector(".cc-viewport")
  scrollTo(0, v.getBoundingClientRect().top + scrollY - 200)
})
await sleep(3500)
const cdp = await ctx.newCDPSession(page)
const state = () =>
  page.evaluate(
    () =>
      new Promise((res) =>
        requestAnimationFrame(() => {
          const m = new DOMMatrixReadOnly(getComputedStyle(document.querySelector(".cc-track")).transform)
          const v = document.querySelector(".cc-viewport").getBoundingClientRect()
          res({ tx: m.m41, scrollY, mid: v.top + v.height / 2 })
        }),
      ),
  )
const touch = (type, x, y) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y, id: 1 }] })
await page.evaluate(() => {
  window.__frames = []
  let last = performance.now()
  const tick = (t) => {
    window.__frames.push(t - last)
    last = t
    if (window.__frames.length < 5000) requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
  window.__long = []
  try {
    new PerformanceObserver((l) => l.getEntries().forEach((e) => window.__long.push(Math.round(e.duration)))).observe({ type: "longtask" })
  } catch {}
})

console.log("\nDrift")
{
  const a = await state()
  await sleep(1000)
  const b = await state()
  expect(a.tx - b.tx > 20 && a.tx - b.tx < 45, "the rail drifts left on its own, about 30px a second", +(a.tx - b.tx).toFixed(1))
}

console.log("\nSideways, slowly")
{
  const s0 = await state()
  const y = s0.mid
  await touch("touchStart", 320, y)
  const follow = []
  let x = 320
  for (let i = 1; i <= 16; i++) {
    x = 320 - i * 15
    await touch("touchMove", x, y + (i % 3) - 1)
    await sleep(16)
    if (i >= 4) follow.push({ finger: x, tx: (await state()).tx })
  }
  await touch("touchEnd", x, y)
  const s1 = await state()
  expect(s1.scrollY === s0.scrollY, "the page did not scroll", s1.scrollY - s0.scrollY)
  expect(s0.tx - s1.tx > 200, "the rail went with the finger", { rail: +(s1.tx - s0.tx).toFixed(1), finger: x - 320 })
  const err = follow.slice(1).map((f, i) => Math.abs(f.tx - follow[i].tx - (f.finger - follow[i].finger)))
  expect(Math.max(...err) < 0.6, "every step of the finger moved the rail by the same step", Math.max(...err))
}
await sleep(6000)

console.log("\nA throw")
{
  const f0 = await state()
  await touch("touchStart", 330, f0.mid)
  let x = 330
  for (let i = 1; i <= 10; i++) {
    x = 330 - i * 24
    await touch("touchMove", x, f0.mid)
    await sleep(16)
  }
  await touch("touchEnd", x, f0.mid)
  const marks = [(await state()).tx]
  for (let i = 0; i < 8; i++) {
    await sleep(150)
    marks.push((await state()).tx)
  }
  const steps = marks.slice(1).map((t, i) => t - marks[i])
  expect(steps[0] < -20, "it keeps going left after the finger lifts", +steps[0].toFixed(1))
  expect(steps.every((s, i) => i === 0 || Math.abs(s) <= Math.abs(steps[i - 1]) + 0.5), "and slows a little more in every slice of time", steps.map((s) => +s.toFixed(1)))
}
await sleep(6000)
{
  const a = await state()
  await sleep(1000)
  const b = await state()
  expect(a.tx - b.tx > 20 && a.tx - b.tx < 45, "a few seconds later it drifts at its own speed again", +(a.tx - b.tx).toFixed(1))
}

console.log("\nDown")
{
  const v0 = await state()
  await touch("touchStart", 200, v0.mid)
  for (let i = 1; i <= 14; i++) {
    await touch("touchMove", 200 + (i % 2) * 2, v0.mid - i * 20)
    await sleep(16)
  }
  await touch("touchEnd", 202, v0.mid - 280)
  await sleep(50)
  const v1 = await state()
  expect(v1.scrollY - v0.scrollY > 200, "a vertical swipe on a card scrolls the page", Math.round(v1.scrollY - v0.scrollY))
  expect(Math.abs(v1.tx - v0.tx) < 8, "and the rail does not follow the finger", +(v1.tx - v0.tx).toFixed(1))
}
await sleep(1500)

console.log("\nDiagonal, more across than down")
{
  const g0 = await state()
  await touch("touchStart", 100, g0.mid)
  for (let i = 1; i <= 12; i++) {
    await touch("touchMove", 100 + i * 14, g0.mid + i * 6)
    await sleep(16)
  }
  await touch("touchEnd", 268, g0.mid + 72)
  const g1 = await state()
  expect(g1.tx - g0.tx > 100 && g1.scrollY === g0.scrollY, "the rail takes it, the page stays", { rail: +(g1.tx - g0.tx).toFixed(1), page: g1.scrollY - g0.scrollY })
}
await sleep(1500)

console.log("\nFrames")
{
  const frames = (await page.evaluate(() => window.__frames)).slice(2)
  const sorted = [...frames].sort((a, b) => a - b)
  const p95 = sorted[Math.floor(sorted.length * 0.95)]
  expect(p95 < 18, "95% of frames on time", { frames: frames.length, median: +sorted[sorted.length >> 1].toFixed(2), p95: +p95.toFixed(2), max: +sorted[sorted.length - 1].toFixed(2) })
  const long = await page.evaluate(() => window.__long)
  expect(long.length <= 2, "no more than a couple of long tasks", long)
}

await browser.close()
console.log(broken ? `\n${broken} FAILED` : "\nall ok")
process.exit(broken ? 1 : 0)
