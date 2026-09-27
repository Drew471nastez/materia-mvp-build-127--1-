/**
 * ===========================================================================
 *  HOME'S BANNER: HOW A CHANGE OF SLIDE MOVES, FRAME BY FRAME
 * ===========================================================================
 * "Flashy, clunky, direct, non-smooth switching ... it blocks, flashes and
 * lags ... when I touch it's clean and smooth, and when it's autoplaying make
 * sure it's smooth and clean as well."
 *
 * The real Home (scripts/render-home-banner.tsx) twice in the same browser:
 * BEFORE, with the banner as it was at BASE (taken from git and swapped in
 * for components/app/home/home-banner, everything else this checkout's),
 * and NOW. On a phone, 390x844 at 3x, touch, the processor slowed four
 * times; on a computer, 1280x900, a mouse, full speed. For each:
 *
 *   AUTOPLAY   the clock's own change (the segment's fill brought to its
 *              last moments, then left to end): frame gaps from the page's
 *              frame loop, the longest frame, and, sampled every frame in a
 *              second pass, any frame with no slide's title on screen, any
 *              frame with two titles whole and readable at once.
 *   SWIPE      a finger (a mouse at 1280) across the text, a move every
 *              16ms, let go: the same numbers, whether the page scrolled
 *              under a sideways swipe (it must not) and whether the slide
 *              changed. A screenshot held mid swipe and one at rest.
 *   SCROLL     a vertical swipe that starts on the banner: the page must
 *              scroll, and the slides must not move.
 *   GLOBE      a sideways drag across the ball turns the globe and leaves
 *              the slides; a swipe on the text never grabs the globe.
 *   LOOP       from the last slide to the first, by the clock: the first
 *              must arrive, and nothing may jump more than a third of the
 *              banner in one frame.
 *   STILL      layout shift over the whole run (0), the banner's height
 *              (one value), and DOM nodes added or removed inside the
 *              banner (0: every slide mounted once).
 *   REDUCED    with prefers-reduced-motion, the clock's change and a swipe
 *              let go land in one frame: no frames in between.
 *
 *   node scripts/check-home-banner-motion.mjs
 *   BASE=<commit> ONLY=now|before SHOTS=/dir node scripts/check-home-banner-motion.mjs
 */
import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { homeProbePage } from "./home-probe-page.mjs"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const BASE = process.env.BASE ?? "8bb435d9"
const ONLY = process.env.ONLY ?? null
const SHOTS = process.env.SHOTS ?? null
const STATE = process.env.STATE ?? "selling"
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)
if (SHOTS) mkdirSync(SHOTS, { recursive: true })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const root = process.cwd()

/** The page's own measuring: a frame loop, a sampler of every slide's title, layout shifts, long frames, DOM changes. */
function instrument() {
  const banner = document.querySelector("[data-home-banner]")
  const w = window
  w.__shift = 0
  w.__shifts = []
  new PerformanceObserver((l) => {
    for (const e of l.getEntries()) {
      w.__shift += e.value
      w.__shifts.push(`${e.value.toFixed(3)} ${e.sources.map((x) => (x.node?.className || x.node?.nodeName || "?").toString().split(" ")[0]).join("+")}`)
    }
  }).observe({ type: "layout-shift", buffered: false })
  w.__loaf = []
  try {
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) {
        /* Where a long frame went: script, then style and layout, then the rest (paint, raster waits). */
        const render = e.renderStart ? e.startTime + e.duration - e.renderStart : 0
        const style = e.styleAndLayoutStart ? e.startTime + e.duration - e.styleAndLayoutStart : 0
        const scripts = e.scripts.map((x) => `${x.sourceFunctionName || x.invoker} ${Math.round(x.duration)}`).join(" ")
        w.__loaf.push({ t: e.startTime, d: e.duration, what: `${Math.round(e.duration)}ms: scripts [${scripts}], render ${Math.round(render)}, style+layout ${Math.round(style)}` })
      }
    }).observe({ type: "long-animation-frame" })
  } catch { /* none here */ }
  w.__mutations = 0
  new MutationObserver((list) => { for (const m of list) w.__mutations += m.addedNodes.length + m.removedNodes.length })
    .observe(banner, { childList: true, subtree: true })
  /** Each slide's title: how much of it is inside every box that clips it, how opaque it is, and where it is. */
  w.__slides = () => {
    const b = banner.getBoundingClientRect()
    return [...banner.querySelectorAll(".home-banner-slide")].map((s) => {
      const t = s.querySelector(".home-banner-title")
      const r = t.getBoundingClientRect()
      let l = b.left, top = b.top, rt = b.right, bt = b.bottom
      let op = getComputedStyle(t).visibility === "hidden" ? 0 : 1
      for (let el = t; el && el !== banner; el = el.parentElement) {
        const cs = getComputedStyle(el)
        op *= parseFloat(cs.opacity)
        if (el !== t && cs.overflow !== "visible") {
          const er = el.getBoundingClientRect()
          l = Math.max(l, er.left); top = Math.max(top, er.top); rt = Math.min(rt, er.right); bt = Math.min(bt, er.bottom)
        }
      }
      const area = Math.max(1, r.width * r.height)
      const seen = Math.max(0, Math.min(r.right, rt) - Math.max(r.left, l)) * Math.max(0, Math.min(r.bottom, bt) - Math.max(r.top, top))
      return { id: s.dataset.announcement, frac: seen / area, op, x: r.left - b.left }
    })
  }
  w.__rec = { on: false, frames: [], sample: false }
  w.__record = (sample) => {
    const rec = { on: true, frames: [], sample, heights: new Set() }
    w.__rec = rec
    const loop = (t) => {
      if (!rec.on) return
      const f = { t }
      if (rec.sample) {
        f.s = w.__slides()
        rec.heights.add(Math.round(banner.getBoundingClientRect().height * 10) / 10)
      }
      rec.frames.push(f)
      requestAnimationFrame(loop)
    }
    requestAnimationFrame(loop)
  }
  w.__stop = () => {
    const rec = w.__rec
    rec.on = false
    const t0 = rec.frames[0]?.t ?? 0
    const t1 = rec.frames.at(-1)?.t ?? 0
    const loaf = w.__loaf.filter((x) => x.t >= t0 && x.t <= t1)
    return { frames: rec.frames, heights: [...(rec.heights ?? [])], loaf: loaf.map((x) => x.d), loafWhat: loaf.filter((x) => x.d > 50).map((x) => x.what) }
  }
  /** The clock's change, now: the showing segment's fill brought to `lead` ms before its end. */
  w.__ripen = (lead) => {
    const a = document.getAnimations().find((x) => /^home-banner-fill/.test(x.animationName) && x.effect?.target?.closest("[data-on]"))
    if (!a) return false
    const d = a.effect.getTiming().duration
    a.currentTime = Math.max(0, d - lead)
    return true
  }
}

const TRIALS = Number(process.env.TRIALS ?? 3)
/** The median trial by its longest frame, with every trial's longest frame kept beside it. */
function median(list) {
  const sorted = [...list].sort((x, y) => x.gapMax - y.gapMax)
  return { ...sorted[Math.floor(sorted.length / 2)], each: list.map((x) => x.gapMax) }
}
const q = (a, p) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * p))] : 0 }
/** What a recording says: frame gaps, and with samples, empty frames, frames with two readable titles, the biggest jump in one frame. */
function read(rec, bannerW) {
  const gaps = rec.frames.slice(1).map((f, i) => f.t - rec.frames[i].t)
  const out = {
    frames: rec.frames.length,
    gapP50: +q(gaps, 0.5).toFixed(1),
    gapP95: +q(gaps, 0.95).toFixed(1),
    gapMax: +Math.max(0, ...gaps).toFixed(1),
    over25: gaps.filter((g) => g > 25).length,
    longFrames: rec.loaf.filter((d) => d > 50).length,
    longWhat: rec.loafWhat,
  }
  if (rec.frames[0]?.s) {
    let empty = 0, two = 0, jump = 0, moving = 0
    for (let i = 0; i < rec.frames.length; i++) {
      const s = rec.frames[i].s
      const shown = s.map((x) => x.frac * x.op)
      if (Math.max(...shown) < 0.2) empty++
      if (s.filter((x) => x.frac > 0.98 && x.op > 0.9).length >= 2) two++
      if (i > 0) {
        const prev = rec.frames[i - 1].s
        /* A title on screen in both frames: how far it went in one. (One off screen may be moved round the loop; that is not seen.) */
        const d = Math.max(...s.map((x, k) => (x.frac > 0 && prev[k].frac > 0 ? Math.abs(x.x - prev[k].x) : 0)))
        jump = Math.max(jump, d)
        if (d > 0.5 || s.some((x, k) => Math.abs(x.op - prev[k].op) > 0.01)) moving++
      }
    }
    Object.assign(out, { empty, two, jumpPx: Math.round(jump), jumpOfWidth: +(jump / bannerW).toFixed(2), changingFrames: moving, heights: rec.heights })
    /* TRACE=1: every frame's titles (left edge against the banner, share on screen) when one of them jumped. */
    if (process.env.TRACE && jump / bannerW > 0.34) console.log(rec.frames.map((f) => f.s.map((x) => `${Math.round(x.x)}:${x.frac.toFixed(2)}`).join(" ")).join("\n"))
  }
  return out
}

/* The banner as it was at BASE, beside this one so its own imports ("./globe") resolve, for the length of a bundle. */
async function serve(which) {
  if (which === "now") return homeProbePage(root)
  const file = join(root, "components/app/home", `.home-banner-before-${process.pid}.tsx`)
  writeFileSync(file, execFileSync("git", ["show", `${BASE}:components/app/home/home-banner.tsx`], { cwd: root, encoding: "utf8" }))
  try {
    return await homeProbePage(root, { swaps: { "@/components/app/home/home-banner": file } })
  } finally {
    rmSync(file, { force: true })
  }
}

const browser = await puppeteer.launch({
  executablePath: CHROMIUM,
  headless: true,
  args: ["--no-sandbox", "--enable-unsafe-swiftshader", "--use-angle=swiftshader", "--no-proxy-server", "--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1"],
})

async function open(base, width, { reduce = false } = {}) {
  const phone = width < 768
  const page = await browser.newPage()
  await page.setViewport({ width, height: phone ? 844 : 900, deviceScaleFactor: phone ? 3 : 2, isMobile: phone, hasTouch: phone })
  if (reduce) await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }])
  const errors = []
  page.on("pageerror", (e) => errors.push(String(e)))
  await page.goto(`${base}/app?state=${STATE}`, { waitUntil: "domcontentloaded", timeout: 120000 })
  await page.waitForSelector("[data-home-banner] [data-home-globe]", { timeout: 60000 })
  await page.evaluate(() => document.fonts.ready)
  await sleep(900)
  /* The banner a third of the way down the screen, and a mouse well away from it. */
  await page.evaluate(() => {
    const s = document.querySelector(".dashboard-scroll-container")
    s.scrollTop += document.querySelector("[data-home-banner]").getBoundingClientRect().top - 200
  })
  if (!phone) await page.mouse.move(5, 895)
  await sleep(400)
  await page.evaluate(instrument)
  const cdp = await page.createCDPSession()
  if (phone) await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 })
  await sleep(300)
  return { page, cdp, phone, errors }
}

const info = (page) => page.evaluate(() => {
  const b = document.querySelector("[data-home-banner]").getBoundingClientRect()
  const active = document.querySelector('[data-home-banner] .home-banner-slide[data-slide="active"]')?.dataset.announcement
  const ids = [...document.querySelectorAll("[data-home-banner] .home-banner-slide")].map((s) => s.dataset.announcement)
  return { left: b.left, top: b.top, width: b.width, height: b.height, active, ids, scrollTop: document.querySelector(".dashboard-scroll-container").scrollTop }
})

/** One recorded stretch: `act` does the thing, then frames run on for `after` ms. */
async function recorded(page, sample, act, after) {
  await page.evaluate((s) => window.__record(s), sample)
  await act()
  await sleep(after)
  return page.evaluate(() => window.__stop())
}

/*
  A finger's moves go out every 16ms whether or not the page has answered the
  last one, as a phone's touch screen sends them; waiting for each answer
  made a flick twice as slow as it was drawn, and Embla rightly read a slow
  drag under half the width as one to put back.
*/
async function swipeGesture(ctx, from, dx, dy, { hold = null } = {}) {
  const { page, cdp, phone } = ctx
  const steps = 16
  const t0 = Date.now()
  const sent = []
  if (phone) await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: from.x, y: from.y, radiusX: 8, radiusY: 8, force: 1 }] })
  else { await page.mouse.move(from.x, from.y); await page.mouse.down() }
  for (let i = 1; i <= steps; i++) {
    const x = from.x + (dx * i) / steps
    const y = from.y + (dy * i) / steps + (dy ? 0 : i * 0.4)
    if (phone) sent.push(cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y, radiusX: 8, radiusY: 8, force: 1 }] }))
    else sent.push(page.mouse.move(x, y))
    if (hold && i === Math.round(steps / 2)) { await Promise.all(sent); await hold() }
    const wait = t0 + i * 16 - Date.now()
    if (wait > 0) await sleep(wait)
  }
  await Promise.all(sent)
  if (phone) await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] })
  else await page.mouse.up()
}

/** A real tap on a segment (a finger, or a mouse click): a synthetic click() is not a press, and a carousel treats the two apart. */
async function tapTab(ctx, n) {
  const { page, cdp, phone } = ctx
  const p = await page.evaluate((k) => { const r = document.querySelectorAll("[data-home-banner] [role=tab]")[k].getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } }, n)
  if (phone) {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: p.x, y: p.y, radiusX: 4, radiusY: 4, force: 1 }] })
    await sleep(40)
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] })
  } else {
    await page.mouse.click(p.x, p.y)
    await page.mouse.move(5, 895)
  }
}

async function measure(which, base, width) {
  const ctx = await open(base, width)
  const { page, phone } = ctx
  const r = { which, width }
  let b = await info(page)
  const W = b.width
  const at = { x: b.left + Math.min(70, W * 0.18), y: b.top + 70 }
  const clock = async () => {
    if (!(await page.evaluate(() => window.__ripen(250)))) throw new Error("no running clock on the banner")
  }

  /*
    A STRETCH AT REST FIRST, then each change three times for timing alone:
    this machine is shared, and a stall that shows up at rest too is the
    machine, not the banner. The median of the three is what is reported,
    with each one's longest frame beside it.
  */
  r.rest = read(await recorded(page, false, async () => {}, 1700), W)
  const trials = []
  for (let k = 0; k < TRIALS; k++) {
    await sleep(700)
    trials.push(read(await recorded(page, false, clock, 1700), W))
  }
  r.autoTiming = median(trials)
  await sleep(600)
  const a0 = (await info(page)).active
  r.autoSampled = read(await recorded(page, true, clock, 1700), W)
  r.autoMoved = (await info(page)).active !== a0

  /* SWIPE: timing, then sampled, then held mid way for a picture. */
  await sleep(600)
  b = await info(page)
  const swipes = []
  for (let k = 0; k < TRIALS; k++) {
    if (k) await sleep(700)
    swipes.push(read(await recorded(page, false, () => swipeGesture(ctx, { x: b.left + W * 0.52, y: at.y }, -W * 0.44, 0), 1300), W))
    if (k === 0) b.afterFirst = await info(page)
  }
  r.swipeTiming = median(swipes)
  const afterTiming = b.afterFirst
  r.swipeChanged = afterTiming.active !== b.active
  r.swipeScrolledPage = Math.round(afterTiming.scrollTop - b.scrollTop)
  await sleep(600)
  b = await info(page)
  r.swipeSampled = read(await recorded(page, true, () => swipeGesture(ctx, { x: b.left + W * 0.52, y: at.y }, -W * 0.44, 0), 1300), W)
  r.swipeScrolledPage = Math.max(Math.abs(r.swipeScrolledPage), Math.abs(Math.round((await info(page)).scrollTop - b.scrollTop)))
  await sleep(600)
  if (SHOTS) {
    /* A clip of the page as it is: an element screenshot resizes the page to fit it, which is a layout shift of its own. */
    const shot = async (name) => {
      const c = await info(page)
      await page.screenshot({ path: join(SHOTS, `banner-${which}-${width}-${name}.png`), clip: { x: c.left, y: c.top, width: c.width, height: c.height }, captureBeyondViewport: false })
    }
    await swipeGesture(ctx, { x: b.left + W * 0.52, y: at.y }, -W * 0.44, 0, { hold: () => shot("mid-swipe") })
    await sleep(1400)
    await shot("rest")
  }

  /* SCROLL: a vertical swipe starting on the text. */
  if (phone) {
    await sleep(400)
    b = await info(page)
    const before = await page.evaluate(() => window.__slides().map((s) => Math.round(s.x)))
    await swipeGesture(ctx, { x: at.x, y: at.y + 40 }, 3, -160)
    await sleep(900)
    const after = await info(page)
    r.verticalScrolled = Math.round(after.scrollTop - b.scrollTop)
    r.verticalSlidesMoved = after.active !== b.active || JSON.stringify(before) !== JSON.stringify(await page.evaluate(() => window.__slides().map((s) => Math.round(s.x))))
    await page.evaluate(() => {
      const s = document.querySelector(".dashboard-scroll-container")
      s.scrollTop += document.querySelector("[data-home-banner]").getBoundingClientRect().top - 200
    })
    await sleep(400)

    /* GLOBE: a sideways drag across the ball is the globe's and leaves the slides; a swipe on the text never grabs the globe. */
    await page.evaluate(() => {
      window.__gripped = false
      new MutationObserver(() => { if (document.querySelector("[data-home-globe-box]").hasAttribute("data-dragging")) window.__gripped = true })
        .observe(document.querySelector("[data-home-globe-box]"), { attributes: true })
    })
    const ball = await page.evaluate(() => { const g = document.querySelector("[data-home-globe-grip]").getBoundingClientRect(); return { x: g.left + g.width / 2, y: g.top + g.height / 2, w: g.width } })
    const slidesBefore = await page.evaluate(() => window.__slides().map((s) => Math.round(s.x)))
    const activeBefore = (await info(page)).active
    await swipeGesture(ctx, { x: ball.x + ball.w * 0.3, y: ball.y }, -ball.w * 0.6, 0)
    await sleep(900)
    r.globeTookBall = await page.evaluate(() => window.__gripped)
    r.ballMovedSlides = (await info(page)).active !== activeBefore || JSON.stringify(slidesBefore) !== JSON.stringify(await page.evaluate(() => window.__slides().map((s) => Math.round(s.x))))
    await page.evaluate(() => { window.__gripped = false })
    b = await info(page)
    await swipeGesture(ctx, { x: b.left + W * 0.52, y: at.y }, -W * 0.44, 0)
    await sleep(900)
    r.textSwipeGrippedGlobe = await page.evaluate(() => window.__gripped)
  }

  /* LOOP: the last slide, then the clock. */
  b = await info(page)
  const last = b.ids.length - 1
  await tapTab(ctx, last)
  await sleep(1400)
  await page.evaluate(() => document.activeElement?.blur())
  if (!phone) await page.mouse.move(5, 895)
  await sleep(300)
  const onLast = (await info(page)).active === b.ids[last]
  r.loopStart = await page.evaluate(() => ({ active: document.querySelector('[data-home-banner] [data-slide="active"]')?.dataset.announcement, held: document.querySelector("[data-home-banner] [role=tablist]")?.hasAttribute("data-held"), focus: document.activeElement?.className }))
  r.loop = read(await recorded(page, true, clock, 1700), W)
  r.loopReachedFirst = onLast && (await info(page)).active === b.ids[0]

  r.shift = +(await page.evaluate(() => window.__shift)).toFixed(4)
  r.shifts = await page.evaluate(() => window.__shifts)
  r.mutations = await page.evaluate(() => window.__mutations)
  r.errors = ctx.errors
  await page.close()

  /* REDUCED MOTION */
  const calm = await open(base, width, { reduce: true })
  const cb = await info(calm.page)
  r.reducedAuto = read(await recorded(calm.page, true, async () => {
    if (!(await calm.page.evaluate(() => window.__ripen(250)))) throw new Error("no clock with reduced motion")
  }, 1500), cb.width)
  r.reducedAutoMoved = (await info(calm.page)).active !== cb.active
  await sleep(400)
  /* A swipe let go: from the moment the finger lifts, how many frames still move. */
  const before = await info(calm.page)
  await swipeGesture(calm, { x: cb.left + cb.width * 0.52, y: cb.top + 70 }, -cb.width * 0.44, 0)
  r.reducedRelease = read(await recorded(calm.page, true, async () => {}, 900), cb.width)
  r.reducedSwipeChanged = (await info(calm.page)).active !== before.active
  await calm.page.close()
  return r
}

const results = []
try {
  for (const which of ONLY ? [ONLY] : ["before", "now"]) {
    const served = await serve(which)
    try {
      for (const width of [390, 1280]) results.push(await measure(which, served.base, width))
    } finally {
      served.close()
    }
  }
} finally {
  await browser.close()
}

const line = (x) => `${x.frames} frames, gaps p50 ${x.gapP50}ms p95 ${x.gapP95}ms, longest ${x.gapMax}ms${x.each ? ` (each run: ${x.each.join(", ")})` : ""}, ${x.over25} over 25ms, ${x.longFrames} long frames${x.longWhat.length && process.env.WHY ? ` (${x.longWhat.join("; ")})` : ""}`
const seen = (x) => `${x.empty} empty frames, ${x.two} with two titles readable, largest step ${x.jumpPx}px (${x.jumpOfWidth} of the banner), ${x.changingFrames} frames in motion, banner heights ${JSON.stringify(x.heights)}`
for (const r of results) {
  console.log(`\n${r.which === "before" ? `BEFORE (${BASE})` : "NOW"} at ${r.width}${r.width < 768 ? ", touch, CPU 4x" : ", mouse"}`)
  console.log(`  at rest   ${line(r.rest)}`)
  console.log(`  autoplay  ${line(r.autoTiming)}`)
  console.log(`            ${seen(r.autoSampled)}; moved on: ${r.autoMoved}`)
  console.log(`  swipe     ${line(r.swipeTiming)}`)
  console.log(`            ${seen(r.swipeSampled)}; changed slide: ${r.swipeChanged}; page scrolled ${r.swipeScrolledPage}px`)
  if (r.verticalScrolled !== undefined) console.log(`  vertical  swipe starting on the banner scrolled the page ${r.verticalScrolled}px; slides moved: ${r.verticalSlidesMoved}`)
  if (r.globeTookBall !== undefined) console.log(`  globe     a sideways drag on the ball: the globe took it ${r.globeTookBall}, the slides moved ${r.ballMovedSlides}; a swipe on the text grabbed the globe ${r.textSwipeGrippedGlobe}`)
  console.log(`  loop      last to first: ${r.loopReachedFirst} (from ${JSON.stringify(r.loopStart)}); ${seen(r.loop)}`)
  console.log(`  still     layout shift ${r.shift}${r.shifts.length ? ` (${r.shifts.slice(0, 4).join(", ")})` : ""}, DOM nodes added or removed in the banner ${r.mutations}`)
  console.log(`  reduced   clock: moved on ${r.reducedAutoMoved}, ${r.reducedAuto.changingFrames} frames in motion, ${r.reducedAuto.empty} empty; swipe let go: changed ${r.reducedSwipeChanged}, ${r.reducedRelease.changingFrames} frames still moving after the finger lifted`)
  if (r.errors.length) console.log(`  errors    ${JSON.stringify(r.errors.slice(0, 3))}`)
}

/* THE CLAIM, for NOW. */
let bad = 0
const expect = (ok, what, got = "") => { console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${ok ? "" : `   ${typeof got === "string" ? got : JSON.stringify(got)}`}`); if (!ok) bad++ }
for (const r of results.filter((x) => x.which === "now")) {
  console.log(`\nNOW at ${r.width}`)
  expect(r.autoMoved && r.autoSampled.empty === 0, "the clock moves on with no frame empty of text", r.autoSampled)
  expect(r.autoSampled.two === 0, "and never two titles whole on screen at once", r.autoSampled.two)
  expect(r.autoSampled.changingFrames >= 8, "and it is a glide over several frames, not a cut", r.autoSampled.changingFrames)
  expect(r.autoSampled.jumpOfWidth < 0.34, "no frame steps more than a third of the banner", r.autoSampled.jumpOfWidth)
  expect(r.swipeChanged && r.swipeSampled.empty === 0, "a swipe changes the slide, never an empty frame", { changed: r.swipeChanged, empty: r.swipeSampled.empty })
  expect(r.swipeScrolledPage === 0, "a sideways swipe does not scroll the page", r.swipeScrolledPage)
  if (r.verticalScrolled !== undefined) expect(r.verticalScrolled > 60 && !r.verticalSlidesMoved, "a vertical swipe that starts on the banner scrolls the page and leaves the slides", { scrolled: r.verticalScrolled, moved: r.verticalSlidesMoved })
  if (r.globeTookBall !== undefined) expect(r.globeTookBall && !r.ballMovedSlides && !r.textSwipeGrippedGlobe, "the ball is the globe's and the text the carousel's: neither takes the other's finger", { globe: r.globeTookBall, slidesMoved: r.ballMovedSlides, textGrabbedGlobe: r.textSwipeGrippedGlobe })
  expect(r.loopReachedFirst && r.loop.empty === 0 && r.loop.jumpOfWidth < 0.34, "from the last slide the clock goes on to the first, forwards, with no jump", r.loop)
  expect(r.shift === 0, "no layout shift", r.shift)
  expect([r.autoSampled, r.swipeSampled, r.loop].every((x) => x.heights.length === 1), "the banner keeps one height", [r.autoSampled.heights, r.swipeSampled.heights, r.loop.heights])
  expect(r.mutations === 0, "no DOM node added or removed in the banner: every slide mounted once", r.mutations)
  expect(r.reducedAutoMoved && r.reducedAuto.changingFrames <= 1, "reduced motion: the clock's change is one frame", r.reducedAuto.changingFrames)
  expect(r.reducedSwipeChanged && r.reducedRelease.changingFrames <= 1, "reduced motion: a swipe let go lands at once, no momentum", r.reducedRelease.changingFrames)
  expect(r.errors.length === 0, "no errors", r.errors)
}
console.log(bad ? `\n${bad} failed\n` : "\nall good\n")
process.exit(bad ? 1 : 0)
