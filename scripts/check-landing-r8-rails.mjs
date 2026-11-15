/**
 * ===========================================================================
 *  LANDING ROUND 8, RAILS: THE SHOWCASE AND THE CREATORS RAIL, MEASURED
 * ===========================================================================
 * Drives the real home page in headless Chromium, at an iPhone 13 (390, touch)
 * and at 1440 (with a mouse, and again with touch), using CDP
 * Input.dispatchTouchEvent and real mouse moves.
 *
 * The showcase under the hero (components/marketing/use-showcase-motion.ts):
 *   flick     a short 60px flick, touch and mouse, moves one card (one page
 *             of three from 768px), the other way back
 *   follow    while dragged the rail moves 1:1 with the pointer
 *   down      a vertical swipe on the cards scrolls the page, the rail stays
 *   shapes    on a phone a OnePage card is 9:16 and a store card 4:3
 *   frames    long tasks and frame times over the gestures, at 4x CPU
 *
 * The creators rail (components/marketing/home/creators-carousel.tsx):
 *   edges     the rail runs from 0 to the window's width, no mask
 *   drift     it drifts on the compositor: no script per frame (main-thread
 *             transform writes counted over a second)
 *   drag      touch and mouse drags follow 1:1, a throw coasts, frame times
 *             and long tasks at 4x CPU
 *
 * Needs a running server (BASE, default http://127.0.0.1:3252). SHOTS=dir
 * saves screenshots of both sections at both widths.
 *
 *   node scripts/check-landing-r8-rails.mjs
 */
import { createRequire } from "node:module"
import { mkdirSync } from "node:fs"

/* Playwright is preinstalled globally (NODE_PATH), not a dependency: required, since import ignores NODE_PATH. */
const { chromium, devices } = createRequire(import.meta.url)("playwright")

const BASE = process.env.BASE || "http://127.0.0.1:3252"
const SHOTS = process.env.SHOTS || ""
if (SHOTS) mkdirSync(SHOTS, { recursive: true })
let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${typeof got === "string" ? got : JSON.stringify(got)})`}`)
  if (!ok) broken++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const browser = await chromium.launch()

async function open(name, options) {
  const ctx = await browser.newContext(options)
  const page = await ctx.newPage()
  await page.goto(`${BASE}/`, { waitUntil: "load", timeout: 240000 })
  const reject = page.getByRole("button", { name: "Reject all" })
  if (await reject.count()) await reject.first().click().catch(() => {})
  const cdp = await ctx.newCDPSession(page)
  await page.evaluate(() => {
    window.__long = []
    try {
      new PerformanceObserver((l) => l.getEntries().forEach((e) => window.__long.push(Math.round(e.duration)))).observe({ type: "longtask" })
    } catch {}
  })
  return { name, ctx, page, cdp }
}

/* Frame times and long tasks over fn(), at 4x CPU. */
async function measured({ page, cdp }, fn) {
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 })
  await page.evaluate(() => {
    window.__long = []
    window.__frames = []
    window.__framing = true
    let last = performance.now()
    const tick = (t) => {
      window.__frames.push(t - last)
      last = t
      if (window.__framing) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })
  await fn()
  const out = await page.evaluate(() => {
    window.__framing = false
    const f = window.__frames.slice(2).sort((a, b) => a - b)
    return { frames: f.length, median: +f[f.length >> 1].toFixed(1), p95: +f[Math.floor(f.length * 0.95)].toFixed(1), max: +f[f.length - 1].toFixed(1), long: window.__long }
  })
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 })
  return out
}

const touch = (cdp, type, x, y) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y, id: 1 }] })
/* A swipe of dx (and dy) in steps of 16ms. */
async function swipe({ cdp }, x, y, dx, dy, steps) {
  await touch(cdp, "touchStart", x, y)
  for (let i = 1; i <= steps; i++) {
    await touch(cdp, "touchMove", x + (dx * i) / steps, y + (dy * i) / steps)
    await sleep(16)
  }
  await touch(cdp, "touchEnd", x + dx, y + dy)
}
async function mouseSwipe({ page }, x, y, dx, steps) {
  await page.mouse.move(x, y)
  await page.mouse.down()
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(x + (dx * i) / steps, y)
    await sleep(16)
  }
  await page.mouse.up()
}

/* ---------------- the showcase ---------------- */
const showcase = (page) =>
  page.evaluate(() => {
    const t = document.querySelector(".build-showcase-track")
    const v = document.querySelector(".build-showcase-viewport").getBoundingClientRect()
    const m = new DOMMatrixReadOnly(getComputedStyle(t).transform)
    return { index: Number(t.dataset.showcaseIndex), tx: m.m41, ready: !!t.dataset.railReady, y: scrollY, mid: v.top + v.height * 0.45, cx: v.left + v.width / 2, vw: innerWidth }
  })

async function showcaseRun(s, input) {
  const { page } = s
  console.log(`\nShowcase, ${s.name}, ${input}`)
  await page.evaluate(() => {
    const v = document.querySelector(".build-showcase-viewport")
    scrollTo(0, v.getBoundingClientRect().top + scrollY - 120)
  })
  await sleep(1200)
  const a = await showcase(page)
  expect(a.ready, "the rail is the script's (one transform)")
  const x = a.vw > 700 ? a.cx + 200 : a.vw * 0.7
  /* One flick there and back first, unmeasured: the first press of a session also wakes the development overlay. */
  if (input === "touch") await swipe(s, x, a.mid, -60, 0, 5)
  else await mouseSwipe(s, x, a.mid, -60, 5)
  await sleep(1100)
  if (input === "touch") await swipe(s, x - 60, a.mid, 60, 0, 5)
  else await mouseSwipe(s, x - 60, a.mid, 60, 5)
  await sleep(1100)
  const frames = await measured(s, async () => {
    if (input === "touch") await swipe(s, x, a.mid, -60, 0, 5)
    else await mouseSwipe(s, x, a.mid, -60, 5)
    await sleep(1100)
  })
  const b = await showcase(page)
  expect(b.index === a.index + 1, "a 60px flick moves one card on", { from: a.index, to: b.index })
  expect(b.y === a.y, "the page did not scroll", b.y - a.y)
  if (input === "touch") await swipe(s, x - 60, a.mid, 60, 0, 5)
  else await mouseSwipe(s, x - 60, a.mid, 60, 5)
  await sleep(1100)
  const c = await showcase(page)
  expect(c.index === a.index, "and 60px the other way brings it back", { to: c.index })
  /* 1:1: hold and pull slowly, the rail moves by what the pointer moves. */
  const pts = []
  if (input === "touch") await touch(s.cdp, "touchStart", x, a.mid)
  else {
    await page.mouse.move(x, a.mid)
    await page.mouse.down()
  }
  for (let i = 1; i <= 8; i++) {
    const px = x - i * 12
    if (input === "touch") await touch(s.cdp, "touchMove", px, a.mid)
    else await page.mouse.move(px, a.mid)
    await sleep(32)
    if (i >= 3) pts.push({ px, tx: (await showcase(page)).tx })
  }
  if (input === "touch") await touch(s.cdp, "touchEnd", x - 96, a.mid)
  else await page.mouse.up()
  const err = pts.slice(1).map((p, i) => Math.abs(p.tx - pts[i].tx - (p.px - pts[i].px)))
  expect(Math.max(...err) < 0.6, "while dragged it follows the pointer 1:1", +Math.max(...err).toFixed(2))
  await sleep(1100)
  if (input === "touch") {
    const d0 = await showcase(page)
    await swipe(s, x - 40, d0.mid, 4, -260, 14)
    await sleep(500)
    const d1 = await showcase(page)
    expect(d0.y - d1.y < -150 || d1.y - d0.y > 150, "a vertical swipe on the cards scrolls the page", d1.y - d0.y)
    expect(d1.index === d0.index && Math.abs(d1.tx - d0.tx) < 2, "and the rail stays where it was", { index: [d0.index, d1.index], tx: +(d1.tx - d0.tx).toFixed(1) })
  }
  expect(frames.long.length === 0, "no long task over the flick at 4x CPU", frames)
}

/* ---------------- the creators rail ---------------- */
const creators = (page) =>
  page.evaluate(
    () =>
      new Promise((res) =>
        requestAnimationFrame(() => {
          const t = document.querySelector(".cc-track")
          const v = document.querySelector(".cc-viewport")
          const r = v.getBoundingClientRect()
          const cs = getComputedStyle(v)
          res({ tx: new DOMMatrixReadOnly(getComputedStyle(t).transform).m41, y: scrollY, mid: r.top + r.height / 2, left: r.left, right: r.right, vw: innerWidth, mask: cs.maskImage || cs.webkitMaskImage, anims: t.getAnimations().length, first: t.querySelector(".cc-card").getBoundingClientRect().left })
        }),
      ),
  )

async function creatorsRun(s, input) {
  const { page } = s
  console.log(`\nCreators, ${s.name}, ${input}`)
  await page.evaluate(() => {
    const v = document.querySelector(".cc-viewport")
    scrollTo(0, v.getBoundingClientRect().top + scrollY - 160)
  })
  await sleep(3200)
  const a = await creators(page)
  expect(a.left === 0 && a.right === a.vw && (a.mask === "none" || !a.mask), "the rail runs edge to edge with no mask", { left: a.left, right: a.right, vw: a.vw, mask: a.mask })
  /* Script writes to the track's style per frame while it drifts. */
  const writes = await page.evaluate(
    () =>
      new Promise((res) => {
        const t = document.querySelector(".cc-track")
        let n = 0
        const mo = new MutationObserver((l) => (n += l.length))
        mo.observe(t, { attributes: true, attributeFilter: ["style"] })
        setTimeout(() => {
          mo.disconnect()
          res(n)
        }, 1000)
      }),
  )
  const b = await creators(page)
  expect(writes === 0 && b.anims === 1 && a.tx - b.tx > 15, "it drifts on the compositor: no script writes in a second, one animation", { writes, moved: +(a.tx - b.tx).toFixed(1), anims: b.anims })
  const x = Math.min(a.vw - 60, 330)
  const frames = await measured(s, async () => {
    const pts = []
    if (input === "touch") await touch(s.cdp, "touchStart", x, a.mid)
    else {
      await page.mouse.move(x, a.mid)
      await page.mouse.down()
    }
    for (let i = 1; i <= 14; i++) {
      const px = x - i * 16
      if (input === "touch") await touch(s.cdp, "touchMove", px, a.mid + (i % 3) - 1)
      else await page.mouse.move(px, a.mid)
      await sleep(16)
      if (i >= 4) pts.push({ px, tx: (await creators(page)).tx })
    }
    const last = x - 14 * 16
    /* Held still before lifting: no throw. */
    await sleep(120)
    if (input === "touch") await touch(s.cdp, "touchEnd", last, a.mid)
    else await page.mouse.up()
    const err = pts.slice(1).map((p, i) => Math.abs(p.tx - pts[i].tx - (p.px - pts[i].px)))
    expect(Math.max(...err) < 0.6, "dragged, it follows 1:1", +Math.max(...err).toFixed(2))
    await sleep(300)
    /* A throw: quick moves and a lift, nothing read in between. */
    if (input === "touch") await swipe(s, x, a.mid, -220, 0, 8)
    else await mouseSwipe(s, x, a.mid, -220, 8)
    const marks = [(await creators(page)).tx]
    for (let i = 0; i < 6; i++) {
      await sleep(150)
      marks.push((await creators(page)).tx)
    }
    const steps = marks.slice(1).map((t, i) => t - marks[i])
    expect(steps[0] < -10 && steps.every((st, i) => i === 0 || Math.abs(st) <= Math.abs(steps[i - 1]) + 0.5), "the throw coasts on and slows in every slice", steps.map((st) => +st.toFixed(1)))
    await sleep(600)
  })
  expect(frames.long.length === 0 && frames.p95 < 20, "frames on time and no long tasks over the drag at 4x CPU", frames)
  if (input === "touch") {
    await sleep(2500)
    const v0 = await creators(page)
    await swipe(s, 200, v0.mid, 3, -260, 14)
    await sleep(400)
    const v1 = await creators(page)
    expect(v1.y - v0.y > 150, "a vertical swipe on a card scrolls the page", v1.y - v0.y)
  }
  /* The mouse leaves the rail (it holds still under a resting mouse). */
  if (input === "mouse") await page.mouse.move(4, 4)
  await sleep(6000)
  const r0 = await creators(page)
  await sleep(1000)
  const r1 = await creators(page)
  expect(r0.tx - r1.tx > 15 && r1.anims === 1, "a few seconds later it drifts again on the compositor", { moved: +(r0.tx - r1.tx).toFixed(1), anims: r1.anims })
}

async function shots(s) {
  if (!SHOTS) return
  const { page } = s
  for (const [sel, tag] of [
    ["[data-build-showcase]", "showcase"],
    ["[data-story-section='creators']", "creators"],
  ]) {
    await page.evaluate((sel) => document.querySelector(sel).scrollIntoView({ block: "start" }), sel)
    await sleep(1500)
    const el = await page.$(sel)
    await el.screenshot({ path: `${SHOTS}/rails-${tag}-${s.name}.png` })
  }
}

async function walk(page) {
  const height = await page.evaluate(() => document.documentElement.scrollHeight)
  for (let y = 0; y < height; y += 600) {
    await page.evaluate((y) => scrollTo(0, y), y)
    await sleep(60)
  }
}

const phone = await open("390", { ...devices["iPhone 13"] })
await walk(phone.page)
{
  /* The phone's card shapes. */
  await phone.page.evaluate(() => document.querySelector(".build-showcase-viewport").scrollIntoView({ block: "center" }))
  await sleep(800)
  const shapes = await phone.page.evaluate(() =>
    [...document.querySelectorAll(".build-showcase-slide")].map((f) => {
      const r = f.querySelector(".build-showcase-pic").getBoundingClientRect()
      return { format: f.dataset.format, ratio: +(r.width / r.height).toFixed(3), w: Math.round(r.width), h: Math.round(r.height) }
    }),
  )
  const portrait = shapes.filter((s) => s.format === "portrait")
  const wide = shapes.filter((s) => s.format === "wide")
  console.log("\nShowcase on a phone")
  expect(portrait.every((s) => Math.abs(s.ratio - 9 / 16) < 0.01) && wide.every((s) => Math.abs(s.ratio - 4 / 3) < 0.01), "OnePages are 9:16, stores and websites 4:3", { portrait: portrait[0], wide: wide[0] })
  expect(portrait[0].h >= wide[0].h, "the 9:16 card is at least as tall as the 4:3 card", { portrait: portrait[0].h, wide: wide[0].h })
  const sec = await phone.page.evaluate(() => Math.round(document.querySelector("[data-build-showcase]").getBoundingClientRect().height))
  console.log(`  showcase height at 390: ${sec}px`)
}
await showcaseRun(phone, "touch")
await creatorsRun(phone, "touch")
await shots(phone)

const desk = await open("1440", { viewport: { width: 1440, height: 900 } })
await walk(desk.page)
{
  const sec = await desk.page.evaluate(() => ({ showcase: Math.round(document.querySelector("[data-build-showcase]").getBoundingClientRect().height), creators: Math.round(document.querySelector("[data-story-section='creators']").getBoundingClientRect().height) }))
  console.log(`\n  section heights at 1440: ${JSON.stringify(sec)}`)
}
await showcaseRun(desk, "mouse")
await creatorsRun(desk, "mouse")
await shots(desk)

const deskTouch = await open("1440-touch", { viewport: { width: 1440, height: 900 }, hasTouch: true })
await walk(deskTouch.page)
await showcaseRun(deskTouch, "touch")

await browser.close()
console.log(broken ? `\n${broken} FAILED` : "\nall ok")
process.exit(broken ? 1 : 0)
