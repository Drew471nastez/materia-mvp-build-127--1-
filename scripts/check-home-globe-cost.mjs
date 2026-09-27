/**
 * ===========================================================================
 *  WHAT THE GLOBE COSTS THE REAL HOME PAGE
 * ===========================================================================
 * "Make sure the globe is optimised to not cause lag or performance issues on
 * that page."
 *
 * scripts/check-home-globe.mjs puts the globe alone on a page and compares its
 * two renderers with the 2D one they replaced. This one asks the other half of
 * the question: on Home itself, with the banner, the chart and the cards around
 * it, how much of the page's thread does the globe take, and does the page stay
 * smooth while it turns, while a thumb scrolls past it, and while a finger spins
 * it.
 *
 * Every number is measured twice on the same page: once with the globe turning
 * and once with it asleep (its IntersectionObserver told it is off screen, which
 * is the globe's own resting state), so the difference is the globe's and not
 * the harness's. This machine is shared, so each window is run three times and
 * the best (lowest) run is kept.
 *
 *   TURNING   four seconds of the globe turning by itself: the page's thread
 *             busy, the frame callbacks' p50/p95/max, tasks over 50ms, and how
 *             many frames did style, layout or paint work rather than only
 *             handing pixels to the compositor
 *   SCROLL    three flicks with the banner mid screen: frame gaps and how long
 *             a touchmove waited
 *   SPIN      a finger dragged across the ball for a second: the frames and the
 *             pointer events
 *   MOUNT     the longest task while the globe starts, and when its first frame
 *             is drawn
 *   PROFILE   the sampling profiler's self time, per function, so the cost is
 *             attributed to the globe's own code and not guessed
 *
 *   node scripts/check-home-globe-cost.mjs
 *   RUNS=1 VIEWS=390 node scripts/check-home-globe-cost.mjs
 *   OUT=/tmp/before.json node scripts/check-home-globe-cost.mjs
 */
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { homeProbePage } from "./home-probe-page.mjs"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const CPU = Number(process.env.CPU ?? 4)
const RUNS = Number(process.env.RUNS ?? 3)
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const VIEWS = [
  { name: "390", width: 390, height: 844, dpr: 3, mobile: true },
  { name: "1440", width: 1440, height: 900, dpr: 2, mobile: false },
].filter((v) => !process.env.VIEWS || process.env.VIEWS.split(",").includes(v.name))

/**
 * A POINT THE GLOBE WILL ACTUALLY FEEL. The banner can hold more than one
 * slide, so there can be more than one grip on the page, and at phone width
 * the ball runs off the bottom of the banner, which clips it: the middle of
 * the grip's box is not always a place a finger can land. So the grip is
 * asked, point by point, where the document says it is on top. The drag
 * captures the pointer from there, so only the first point has to land.
 */
const GRAB = () => {
  for (const el of document.querySelectorAll("[data-home-globe-grip]")) {
    const b = el.getBoundingClientRect()
    if (b.width < 20) continue
    const cx = b.x + b.width / 2
    const cy = b.y + b.height / 2
    const r = b.width / 2
    for (const f of [0, 0.25, 0.45, 0.6]) for (const [dx, dy] of [[0, 0], [0, -1], [0, 1], [-1, 0], [1, 0], [-0.7, -0.7], [0.7, -0.7]]) {
      const x = Math.round(cx + dx * r * f)
      const y = Math.round(cy + dy * r * f)
      if (x < 2 || y < 2 || x > innerWidth - 2 || y > innerHeight - 2) continue
      if (document.elementFromPoint(x, y) === el) return { x, y, w: b.width }
    }
  }
  return null
}

const pct = (a, p) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * p))] : 0 }

/** The globe asleep: its observer is told it is off screen, which is what the globe does when it is. */
const ASLEEP = () => {
  const Real = window.IntersectionObserver
  window.IntersectionObserver = class {
    constructor(cb) { this.cb = cb; this.real = null; this.Real = Real }
    observe(el) {
      if (el.hasAttribute("data-home-globe-box")) { this.cb([{ isIntersecting: false, intersectionRatio: 0, target: el }], this); return }
      ;(this.real ??= new this.Real(this.cb)).observe(el)
    }
    unobserve(el) { this.real?.unobserve(el) }
    disconnect() { this.real?.disconnect() }
    takeRecords() { return [] }
  }
}

const served = await homeProbePage()
const base = served.base
const browser = await puppeteer.launch({
  executablePath: CHROMIUM,
  headless: true,
  args: ["--no-sandbox", "--enable-unsafe-swiftshader", "--use-angle=swiftshader", "--no-proxy-server", "--disable-accelerated-2d-canvas"],
})

/** One page, loaded, throttled, with the instruments in it. */
async function open(view, { asleep }) {
  const tab = await browser.newPage()
  await tab.setViewport({ width: view.width, height: view.height, deviceScaleFactor: view.dpr, isMobile: view.mobile, hasTouch: view.mobile })
  /* WebGL here is SwiftShader, which the globe would refuse; the real device's answer is a real card, so let it through. */
  await tab.evaluateOnNewDocument(() => {
    const get = HTMLCanvasElement.prototype.getContext
    HTMLCanvasElement.prototype.getContext = function (type, attrs) {
      return get.call(this, type, type === "webgl" && attrs ? { ...attrs, failIfMajorPerformanceCaveat: false } : attrs)
    }
  })
  if (asleep) await tab.evaluateOnNewDocument(ASLEEP)
  if (process.env.GL_CALLS) await tab.evaluateOnNewDocument(() => { window.__countCalls = true })
  /*
    THE GLOBE'S OWN FRAME, TIMED WHERE IT RUNS. Its frame loop is the one
    callback named `tick` (components/app/home/globe.tsx), so wrapping
    requestAnimationFrame measures the globe's frame and nothing else, the
    first one included, without a trace to line up.
  */
  await tab.evaluateOnNewDocument(() => {
    window.__firstTick = 0
    window.__ticks = []
    const raf = window.requestAnimationFrame.bind(window)
    window.requestAnimationFrame = (cb) => raf((t) => {
      if (cb.name !== "tick") return cb(t)
      if (!window.__firstTick) window.__firstTick = performance.now()
      const a = performance.now()
      cb(t)
      const b = performance.now()
      if (window.__ticks.length < 4000) window.__ticks.push([a, b - a, window.__phase ?? ""])
    })
    /*
      ONE WEBGL CLEAR IS ONE FRAME THE GLOBE DREW: counted from before the page
      loads, so the first draw of all is seen, wherever it is paid for.
    */
    window.__draws = {}
    window.__firstDrawAt = 0
    window.__glCalls = {}
    addEventListener("DOMContentLoaded", () => {
      const ctx = window.WebGLRenderingContext?.prototype
      if (!ctx) return
      const clear = ctx.clear
      ctx.clear = function (...a) {
        if (!window.__firstDrawAt) window.__firstDrawAt = performance.now()
        if (window.__phase) window.__draws[window.__phase] = (window.__draws[window.__phase] ?? 0) + 1
        return clear.apply(this, a)
      }
      if (window.__countCalls) for (const k of Object.getOwnPropertyNames(ctx)) {
        const d = Object.getOwnPropertyDescriptor(ctx, k)
        if (k === "clear" || !d || typeof d.value !== "function") continue
        const f = d.value
        ctx[k] = function (...a) { if (window.__phase) window.__glCalls[window.__phase] = (window.__glCalls[window.__phase] ?? 0) + 1; return f.apply(this, a) }
      }
    })
  })
  const cdp = await tab.createCDPSession()
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU })
  const mountPath = join(mkdtempSync(join(tmpdir(), "globe-cost-mount-")), "t.json")
  await tab.tracing.start({ path: mountPath, categories: ["devtools.timeline", "disabled-by-default-devtools.timeline", "toplevel"] })
  await tab.goto(`${base}/app`)
  await tab.waitForSelector("[data-home-globe-box]", { timeout: 20000 })
  await tab.waitForSelector("[data-home-globe]", { timeout: 20000 })
  await sleep(2600)
  await tab.tracing.stop()
  const firstFrame = await tab.evaluate(() => window.__firstTick)
  const renderer = await tab.evaluate(() => document.querySelector("[data-home-globe-box]")?.dataset.renderer ?? "none")
  /* The pixels it draws, against the pixels it covers: a globe should never be drawn bigger than it is shown. */
  const canvas = await tab.evaluate(() => {
    const el = document.querySelector("[data-home-globe]")
    const box = el?.closest("[data-home-globe-box]")?.getBoundingClientRect()
    return el && box ? { w: el.width, h: el.height, css: Math.round(Math.min(box.width, box.height)), dpr: devicePixelRatio } : null
  })
  /* The instruments: frame gaps, touchmove delay and the browser's long frame reports. */
  await tab.evaluate(() => {
    window.__phase = null
    window.__log = { gaps: {}, delays: {}, loaf: [] }
    document.addEventListener("touchmove", (e) => { if (window.__phase) (window.__log.delays[window.__phase] ??= []).push(performance.now() - e.timeStamp) }, { passive: true, capture: true })
    let last = 0
    const spin = (t) => { if (window.__phase && last) (window.__log.gaps[window.__phase] ??= []).push(t - last); last = t; requestAnimationFrame(spin) }
    requestAnimationFrame(spin)
    try {
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) window.__log.loaf.push({ phase: window.__phase, dur: e.duration, blocking: e.blockingDuration, styleAndLayout: (e.scripts || []).reduce((n, s) => n + (s.forcedStyleAndLayoutDuration || 0), 0) })
      }).observe({ type: "long-animation-frame", buffered: false })
    } catch { /* an engine without it */ }

  })
  return { tab, cdp, mountPath, firstFrame, renderer, canvas }
}

/** The mount trace: the page's own main thread, its longest task once the bundle has been evaluated, and how much ran before it went quiet. */
function readMount(path) {
  const trace = JSON.parse(readFileSync(path, "utf8")).traceEvents
  rmSync(path, { force: true })
  const names = new Map()
  for (const e of trace) if (e.ph === "M" && e.name === "thread_name") names.set(`${e.pid}:${e.tid}`, e.args.name)
  const mains = new Set([...names.entries()].filter(([, n]) => n === "CrRendererMain").map(([k]) => k))
  const tasks = trace.filter((e) => mains.has(`${e.pid}:${e.tid}`) && e.name === "RunTask" && e.ph === "X")
  const by = new Map()
  for (const t of tasks) by.set(`${t.pid}:${t.tid}`, (by.get(`${t.pid}:${t.tid}`) ?? 0) + t.dur)
  const key = [...by.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
  const mine = tasks.filter((t) => `${t.pid}:${t.tid}` === key)
  const loading = trace.filter((e) => `${e.pid}:${e.tid}` === key && (e.name === "ParseHTML" || e.name === "EvaluateScript"))
  const after = mine.filter((t) => !loading.some((e) => e.ts >= t.ts && e.ts <= t.ts + t.dur))
  const t0 = Math.min(...mine.map((t) => t.ts))
  return {
    longestTaskMs: +(Math.max(0, ...after.map((t) => t.dur)) / 1000).toFixed(0),
    /* Everything the page's thread ran in its first two seconds: the work before it is ready for a finger. */
    busyToInteractiveMs: +(mine.filter((t) => t.ts - t0 < 2e6).reduce((n, t) => n + t.dur, 0) / 1000).toFixed(0),
    tasksOver50: after.filter((t) => t.dur > 50000).length,
  }
}

/** One window of time on the page's thread, from a trace plus what the page itself saw. */
function readWindow(ev, phase, log) {
  const names = new Map()
  for (const e of ev) if (e.ph === "M" && e.name === "thread_name") names.set(`${e.pid}:${e.tid}`, e.args.name)
  const marks = ev.filter((e) => e.cat?.includes("blink.user_timing") && (e.name === `${phase}:start` || e.name === `${phase}:end`))
  const s = marks.find((m) => m.name.endsWith(":start"))?.ts
  const e2 = marks.find((m) => m.name.endsWith(":end"))?.ts
  if (!s || !e2) return null
  const main = [...names.entries()].find(([k, n]) => n === "CrRendererMain" && k.startsWith(`${marks[0].pid}:`))?.[0]
  const inside = ev.filter((x) => `${x.pid}:${x.tid}` === main && x.ph === "X" && x.ts >= s && x.ts <= e2)
  const span = (e2 - s) / 1000
  const tasks = inside.filter((x) => x.name === "RunTask")
  const raf = inside.filter((x) => x.name === "FireAnimationFrame").map((x) => x.dur / 1000)
  const input = inside.filter((x) => x.name === "EventDispatch" && /pointermove|touchmove|mousemove/.test(x.args?.data?.type ?? "")).map((x) => x.dur / 1000)
  const count = (n) => inside.filter((x) => x.name === n).length
  const draws = log?.draws?.[phase] ?? 0
  const glCalls = log?.calls?.[phase] ?? 0
  const gaps = log?.gaps?.[phase] ?? []
  const delays = log?.delays?.[phase] ?? []
  const loaf = (log?.loaf ?? []).filter((x) => x.phase === phase)
  return {
    spanMs: +span.toFixed(0),
    frames: raf.length,
    draws,
    glCallsPerDraw: draws ? +((glCalls + draws) / draws).toFixed(1) : 0,
    msPerSecond: +((tasks.reduce((n, x) => n + x.dur, 0) / 1000 / span) * 1000).toFixed(1),
    rafMsPerSecond: +((raf.reduce((n, x) => n + x, 0) / span) * 1000).toFixed(1),
    frameP50: +pct(raf, 0.5).toFixed(2),
    frameP95: +pct(raf, 0.95).toFixed(2),
    frameMax: +(Math.max(0, ...raf)).toFixed(2),
    tasksOver50: tasks.filter((x) => x.dur > 50000).length,
    longestTaskMs: +(Math.max(0, ...tasks.map((x) => x.dur)) / 1000).toFixed(1),
    /* Style, layout and paint on the page's thread: a frame that only turns the globe should do none. */
    styleOrLayout: count("UpdateLayoutTree") + count("Layout") + count("InvalidateLayout"),
    paints: count("Paint") + count("PaintImage"),
    commits: count("Commit"),
    inputMsPerEvent: input.length ? +(input.reduce((n, x) => n + x, 0) / input.length).toFixed(2) : 0,
    inputEvents: input.length,
    gapP95: +pct(gaps, 0.95).toFixed(1),
    gapMax: +Math.max(0, ...gaps).toFixed(1),
    gapsOver33: gaps.filter((g) => g > 33.4).length,
    touchDelayP95: +pct(delays, 0.95).toFixed(1),
    loafOver50: loaf.filter((l) => l.dur > 50).length,
    forcedStyleAndLayoutMs: +loaf.reduce((n, l) => n + l.styleAndLayout, 0).toFixed(1),
  }
}

/**
 * THE SAMPLING PROFILER, ATTRIBUTED TO THE GLOBE. A sample counts as the
 * globe's when any frame in its stack is one of the globe's own functions, so
 * the WebGL calls the draw makes (clear, bufferSubData, drawArrays) are counted
 * where they are paid for and not left in a list of anonymous callees.
 */
const GLOBE_FN = /^(tick|paint|draw|buildOverlay|rotation|settle|sprite|smooth|easeOut|busy|launch|dotPx|landed|warm|resize|sized|create2dRenderer|createGlRenderer|landDots)$/
function readProfile(profile) {
  const byId = new Map()
  for (const n of profile.nodes) byId.set(n.id, n)
  const parent = new Map()
  for (const n of profile.nodes) for (const c of n.children ?? []) parent.set(c, n.id)
  const mine = new Map()
  const isGlobe = (id) => {
    if (mine.has(id)) return mine.get(id)
    const n = byId.get(id)
    const own = !!n && (GLOBE_FN.test(n.callFrame.functionName || "") || (parent.has(id) && isGlobe(parent.get(id))))
    mine.set(id, own)
    return own
  }
  const hits = new Map()
  for (const id of profile.samples) hits.set(id, (hits.get(id) ?? 0) + 1)
  const total = profile.samples.length || 1
  const span = (profile.endTime - profile.startTime) / 1000
  const ms = (n) => (n / total) * span
  let own = 0
  const self = new Map()
  for (const [id, n] of hits) {
    const node = byId.get(id)
    if (!node) continue
    if (isGlobe(id)) own += n
    const key = node.callFrame.functionName || "(anonymous)"
    self.set(key, (self.get(key) ?? 0) + n)
  }
  const rows = [...self.entries()].map(([k, n]) => [k, +ms(n).toFixed(1)]).sort((a, b) => b[1] - a[1])
  return {
    spanMs: +span.toFixed(0),
    globeMsPerSecond: +((ms(own) / span) * 1000).toFixed(1),
    top: rows.filter(([k, v]) => v > 1 && !/^\((idle|program|root|garbage collector)\)$/.test(k)).slice(0, 8),
  }
}

async function once(view, { asleep }) {
  const { tab, cdp, mountPath, firstFrame, renderer, canvas } = await open(view, { asleep })
  const mount = readMount(mountPath)
  const tracePath = join(mkdtempSync(join(tmpdir(), "globe-cost-")), "t.json")
  const phase = async (name, fn) => {
    await tab.evaluate((n) => { window.__phase = n; performance.mark(`${n}:start`) }, name)
    await fn()
    await tab.evaluate((n) => { performance.mark(`${n}:end`); window.__phase = null }, name)
  }
  const spots = await tab.evaluate(() => {
    const scroller = document.querySelector(".dashboard-scroll-container") ?? document.querySelector(".app-content-scroll")
    const banner = document.querySelector("[data-home-banner]")?.getBoundingClientRect() ?? { top: 0, height: 200 }
    const g = document.querySelector("[data-home-globe-grip]")?.getBoundingClientRect() ?? { x: 0, y: 0, width: 100 }
    return { bannerTop: Math.round(banner.top + scroller.scrollTop), bannerH: Math.round(banner.height), gx: g.x + g.width / 2, gy: g.y + g.height / 2, gw: g.width }
  })
  await tab.tracing.start({ path: tracePath, categories: ["devtools.timeline", "disabled-by-default-devtools.timeline", "disabled-by-default-devtools.timeline.frame", "blink.user_timing", "toplevel"] })

  /* TURNING, with the profiler on it. */
  await cdp.send("Profiler.enable")
  await cdp.send("Profiler.setSamplingInterval", { interval: 200 })
  await cdp.send("Profiler.start")
  await phase("turn", () => sleep(4000))
  const { profile } = await cdp.send("Profiler.stop")

  /* SCROLL: three flicks with the banner mid screen. */
  const touch = (type, x, y) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y, radiusX: 11, radiusY: 11, force: 1 }] })
  const scrollTo = (y) => tab.evaluate((top) => { (document.querySelector(".dashboard-scroll-container") ?? document.querySelector(".app-content-scroll")).scrollTop = top }, y)
  const at = Math.max(0, spots.bannerTop - Math.round(view.height * 0.35))
  await phase("scroll", async () => {
    for (let k = 0; k < 3; k++) {
      await scrollTo(at)
      await sleep(350)
      /* Beside the globe, not on it: a thumb on the ball belongs to the globe by design. */
      const x = view.mobile ? 40 : 320
      const y0 = Math.round(view.height * 0.7)
      await touch("touchStart", x, y0)
      const t0 = Date.now()
      for (let i = 1; i <= 16; i++) {
        await touch("touchMove", x, Math.round(y0 - (260 * i) / 16))
        const w = t0 + i * 16 - Date.now()
        if (w > 0) await sleep(w)
      }
      await touch("touchEnd")
      await sleep(700)
    }
  })
  await scrollTo(0)
  await sleep(400)

  /* SPIN: a finger across the ball for a second, then let go and settle. */
  const g = await tab.evaluate(GRAB)
  if (!g && !asleep) throw new Error("no grip of the globe is reachable at this width: the spin cannot be measured")
  await phase("spin", async () => {
    if (!g) return
    const path = (i) => [g.x + Math.sin((i / 60) * Math.PI) * g.w * 0.3, g.y + Math.sin((i / 30) * Math.PI) * g.w * 0.08]
    if (view.mobile) {
      await touch("touchStart", g.x, g.y)
      const t0 = Date.now()
      for (let i = 1; i <= 60; i++) {
        await touch("touchMove", ...path(i))
        const w = t0 + i * 16 - Date.now()
        if (w > 0) await sleep(w)
      }
      await touch("touchEnd")
    } else {
      await tab.mouse.move(g.x, g.y)
      await tab.mouse.down()
      const t0 = Date.now()
      for (let i = 1; i <= 60; i++) {
        await tab.mouse.move(...path(i))
        const w = t0 + i * 16 - Date.now()
        if (w > 0) await sleep(w)
      }
      await tab.mouse.up()
    }
    await sleep(1400)
  })
  await tab.tracing.stop()
  const log = await tab.evaluate(() => ({ ...window.__log, draws: window.__draws, calls: window.__glCalls }))
  const ticks = await tab.evaluate(() => window.__ticks)
  const firstDraw = await tab.evaluate(() => window.__firstDrawAt)
  const heap = await tab.evaluate(() => performance.memory?.usedJSHeapSize ?? 0)
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 })
  await tab.close()
  const ev = JSON.parse(readFileSync(tracePath, "utf8")).traceEvents
  rmSync(tracePath, { force: true })
  /* The globe's frames, as the page timed them: the first one, and each window's spread. */
  const tickOf = (phase) => {
    const ms = ticks.filter((t) => t[2] === phase).map((t) => t[1])
    return { n: ms.length, p50: +pct(ms, 0.5).toFixed(2), p95: +pct(ms, 0.95).toFixed(2), max: +Math.max(0, ...ms).toFixed(2), msPerSecond: +ms.reduce((a, b) => a + b, 0).toFixed(1) }
  }
  const first = ticks.slice(0, 3).map((t) => +t[1].toFixed(2))
  return {
    renderer, canvas, firstFrame: +firstFrame.toFixed(0), firstDraw: +firstDraw.toFixed(0), firstTicksMs: first, mount, heap,
    turn: readWindow(ev, "turn", log), scroll: readWindow(ev, "scroll", log), spin: readWindow(ev, "spin", log),
    tick: { turn: tickOf("turn"), scroll: tickOf("scroll"), spin: tickOf("spin") },
    profile: readProfile(profile),
  }
}

/**
 * WHAT IT MUST GO ON DOING. With reduced motion it does not turn on its own,
 * so once it has drawn its land it stops asking for frames altogether; a
 * finger still turns it. Off a hidden tab it stops too. These are measured
 * rather than read, because a change to when the first frame is drawn is
 * exactly the kind that could leave the globe blank or leave it spinning.
 */
async function behaviours(view) {
  const tab = await browser.newPage()
  await tab.setViewport({ width: view.width, height: view.height, deviceScaleFactor: view.dpr, isMobile: view.mobile, hasTouch: view.mobile })
  await tab.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }])
  await tab.evaluateOnNewDocument(() => {
    const get = HTMLCanvasElement.prototype.getContext
    HTMLCanvasElement.prototype.getContext = function (t, a) { return get.call(this, t, t === "webgl" && a ? { ...a, failIfMajorPerformanceCaveat: false } : a) }
    window.__draws = 0
    addEventListener("DOMContentLoaded", () => {
      const ctx = window.WebGLRenderingContext?.prototype
      if (!ctx) return
      const clear = ctx.clear
      ctx.clear = function (...a) { window.__draws++; return clear.apply(this, a) }
    })
  })
  await tab.goto(`${base}/app`)
  await tab.waitForSelector("[data-home-globe]", { timeout: 20000 })
  await sleep(3000)
  const drewAtAll = await tab.evaluate(() => window.__draws)
  await sleep(1500)
  const settled = await tab.evaluate(() => window.__draws)
  /* A finger on it still turns it, reduced motion or not. */
  const g = await tab.evaluate(GRAB)
  const cdp = await tab.createCDPSession()
  const touch = (type, x, y) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y, radiusX: 11, radiusY: 11, force: 1 }] })
  if (g) {
    await touch("touchStart", g.x, g.y)
    for (let i = 1; i <= 12; i++) { await touch("touchMove", g.x + i * 4, g.y); await sleep(16) }
  }
  await touch("touchEnd")
  await sleep(600)
  const afterDrag = await tab.evaluate(() => window.__draws)
  /* A hidden tab: nothing at all. */
  await tab.evaluate(() => { Object.defineProperty(document, "visibilityState", { get: () => "hidden", configurable: true }); document.dispatchEvent(new Event("visibilitychange")) })
  await sleep(1200)
  const hiddenFrom = await tab.evaluate(() => window.__draws)
  await sleep(1200)
  const hiddenTo = await tab.evaluate(() => window.__draws)
  await tab.close()
  return { view: view.name, reachable: !!g, drewAtAll, settled, afterDrag, hiddenDraws: hiddenTo - hiddenFrom }
}

const results = []
const kept = []
try {
  for (const view of VIEWS) {
    for (const asleep of [true, false]) {
      const runs = []
      for (let i = 0; i < RUNS; i++) runs.push(await once(view, { asleep }))
      /*
        THE BEST RUN IS THE CHEAPEST FRAME, NOT THE QUIETEST PAGE. This machine
        is shared, and a run starved of processor looks cheap by every total
        (it draws a third of the frames and the page does a third of the work)
        while being the worst run there was. So: of the runs that got enough of
        the processor to draw at something like 60Hz, the one whose own frame
        was cheapest; and if none did, the one that drew most.
      */
      const enough = runs.filter((r) => asleep || r.turn.draws >= 150)
      const best = (enough.length ? enough.sort((a, b) => a.tick.turn.p50 - b.tick.turn.p50) : runs.sort((a, b) => b.turn.draws - a.turn.draws))[0]
      results.push({ view: view.name, state: asleep ? "asleep" : "turning", ...best, runs: runs.map((r) => `${r.turn.draws} draws, ${r.tick.turn.p50}ms a frame`) })
    }
    kept.push(await behaviours(view))
  }
} finally {
  await browser.close()
  served.close()
}

const p = (n, w = 7, d = 1) => (Number.isFinite(n) ? n.toFixed(d) : "-").padStart(w)
const pick = (v, st) => results.find((r) => r.view === v && r.state === st)
console.log(`\nThe globe on Home, CPU slowed ${CPU}x, best of ${RUNS} runs. "asleep" is the same page with the globe told it is off screen, which is its own resting state.\n`)
for (const r of results) if (r.canvas) console.log(`  ${r.view} ${r.state}: the canvas is ${r.canvas.w}x${r.canvas.h} device pixels over ${r.canvas.css} css pixels, on a ${r.canvas.dpr}x screen`)
console.log("")
console.log("  view  globe     renderer  draws  page ms/s  globe ms/s  its frame p50  p95    max   >50ms  style+layout  paints  gl calls/draw  first frames")
for (const r of results) {
  const t = r.turn
  const k = r.tick.turn
  console.log(`  ${r.view.padEnd(5)} ${r.state.padEnd(9)} ${r.renderer.padEnd(8)} ${String(t.draws).padStart(5)}  ${p(t.msPerSecond, 9)}  ${p(k.msPerSecond / (t.spanMs / 1000), 10)}  ${p(k.p50, 13, 2)}  ${p(k.p95, 5, 2)}  ${p(k.max, 5, 2)}  ${String(t.tasksOver50).padStart(5)}  ${String(t.styleOrLayout).padStart(12)}  ${String(t.paints).padStart(6)}  ${p(t.glCallsPerDraw, 13)}  ${r.firstTicksMs.join(" ")}`)
}
console.log("\n  mount, scrolling past it, and a finger spinning it")
console.log("  view  globe     first draw   mount: longest  busy to 2s   scroll: gap p95  gap max  >33ms  touch p95  spin: draws  p95    max   input/event")
for (const r of results) {
  const s2 = r.scroll
  const d = r.spin
  console.log(`  ${r.view.padEnd(5)} ${r.state.padEnd(9)} ${p(r.firstDraw, 9, 0)}ms  ${p(r.mount.longestTaskMs, 12, 0)}ms  ${p(r.mount.busyToInteractiveMs, 8, 0)}ms  ${p(s2.gapP95, 15)}  ${p(s2.gapMax, 7)}  ${String(s2.gapsOver33).padStart(5)}  ${p(s2.touchDelayP95, 9)}  ${String(d.draws).padStart(11)}  ${p(r.tick.spin.p95, 5, 2)}  ${p(r.tick.spin.max, 5, 2)}  ${p(d.inputMsPerEvent, 11, 2)}`)
}
console.log("\n  where the page's thread goes while the globe turns (sampling profiler, self time, the globe's stacks summed)")
for (const r of results) console.log(`  ${r.view} ${r.state}: the globe ${r.profile.globeMsPerSecond}ms/s; the busiest functions on the page: ${r.profile.top.map(([k, v]) => `${k} ${v}ms`).join(", ")}`)
for (const r of results.filter((x) => x.state === "turning")) console.log(`  ${r.view}: the ${RUNS} runs were ${r.runs.join("; ")}`)
console.log("\n  the globe's own cost, as the difference between the same page turning and asleep")
for (const view of VIEWS) {
  const on = pick(view.name, "turning")
  const off = pick(view.name, "asleep")
  if (!on || !off) continue
  const secs = on.turn.spanMs / 1000
  console.log(`  ${view.name}: ${on.turn.draws} draws in ${secs.toFixed(1)}s; its own frame ${(on.tick.turn.msPerSecond / secs).toFixed(1)}ms of every second (${on.tick.turn.p50.toFixed(2)}ms p50, ${on.tick.turn.p95.toFixed(2)}ms p95, ${on.tick.turn.max.toFixed(2)}ms max), first frames ${on.firstTicksMs.join("/")}ms; the whole thread ${(on.turn.msPerSecond - off.turn.msPerSecond).toFixed(1)}ms more than asleep; profiler ${on.profile.globeMsPerSecond}ms/s`)
  console.log(`        while a finger spins it: ${on.spin.draws} draws, its frame ${on.tick.spin.p50.toFixed(2)}ms p50, ${on.tick.spin.p95.toFixed(2)}ms p95, ${on.tick.spin.max.toFixed(2)}ms max, ${on.spin.inputEvents} pointer events at ${on.spin.inputMsPerEvent}ms each`)
  console.log(`        while the page scrolls past it: ${on.scroll.draws} draws, its frame ${on.tick.scroll.p50.toFixed(2)}ms p50, ${on.tick.scroll.p95.toFixed(2)}ms p95, ${on.tick.scroll.max.toFixed(2)}ms max`)
  console.log(`        style and layout ${off.turn.styleOrLayout} asleep, ${on.turn.styleOrLayout} turning; paints ${off.turn.paints} asleep, ${on.turn.paints} turning; forced layout ${on.turn.forcedStyleAndLayoutMs}ms`)
  console.log(`        scrolling past: ${off.scroll.gapsOver33} frame gaps over 33ms asleep, ${on.scroll.gapsOver33} turning; touch delay p95 ${off.scroll.touchDelayP95}ms asleep, ${on.scroll.touchDelayP95}ms turning`)
}

let bad = 0
const expect = (ok, what, got) => { console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${ok ? "" : `   ${got}`}`); if (!ok) bad++ }
console.log("")
for (const view of VIEWS) {
  const on = pick(view.name, "turning")
  const off = pick(view.name, "asleep")
  if (!on || !off) continue
  expect(on.renderer === "webgl", `${view.name}: drawn by the WebGL renderer`, on.renderer)
  expect(!!on.canvas && on.canvas.w <= on.canvas.css * Math.min(2, on.canvas.dpr) + 1, `${view.name}: it draws no more pixels than it shows`, on.canvas ? `${on.canvas.w} for ${on.canvas.css} css at ${on.canvas.dpr}x` : "no canvas")
  expect(on.turn.draws > 120, `${view.name}: it turns by itself`, `${on.turn.draws} draws in 4s`)
  expect(off.turn.draws === 0, `${view.name}: off screen it draws nothing at all`, `${off.turn.draws} draws`)
  /* Its frames, measured against the same page asleep: a tenth of a slowed second is a fortieth of a real one. */
  expect(on.turn.rafMsPerSecond - off.turn.rafMsPerSecond < 100, `${view.name}: its frames cost under 100ms of every slowed second`, `${(on.turn.rafMsPerSecond - off.turn.rafMsPerSecond).toFixed(1)}ms/s`)
  expect(on.tick.turn.p95 < 4, `${view.name}: the globe's own frame, p95 under 4ms`, `${on.tick.turn.p95}ms`)
  expect(on.spin.draws > 40, `${view.name}: a finger spinning it draws every frame`, `${on.spin.draws} draws`)
  /* The page around it has its own long tasks on a shared machine; none of them may be the globe's frame. */
  expect(on.tick.turn.max < 30, `${view.name}: no frame of its own comes near a long task`, `${on.tick.turn.max}ms, the page had ${on.turn.tasksOver50} tasks over 50ms`)
  /* Style and layout on this page are the banner's own; the globe should add none of it and force none. */
  expect(on.turn.styleOrLayout <= off.turn.styleOrLayout + 4, `${view.name}: turning adds no style or layout work`, `${on.turn.styleOrLayout} turning vs ${off.turn.styleOrLayout} asleep`)
  expect(on.turn.forcedStyleAndLayoutMs === 0, `${view.name}: turning forces no layout`, `${on.turn.forcedStyleAndLayoutMs}ms`)
  /* The banner beside it paints on its own; what the globe may not do is make the page's thread paint for its frames. */
  expect(on.turn.paints < on.turn.draws / 8, `${view.name}: its frames are handed to the compositor, not painted on the page's thread`, `${on.turn.paints} paints for ${on.turn.draws} draws`)
  /* Dropped frames on a shared machine are mostly the harness's; what the globe answers for is its own frame while the page scrolls. */
  expect(on.tick.scroll.p95 < 4, `${view.name}: its frame while the page scrolls past it, p95 under 4ms`, `${on.tick.scroll.p95}ms`)
  expect(on.spin.inputMsPerEvent < 2, `${view.name}: a pointer event while spinning stays under 2ms`, `${on.spin.inputMsPerEvent}ms`)
  /* The first frame is drawn off the frame loop; it still has to be drawn, and soon after the loop starts. */
  expect(on.firstDraw > 0 && on.firstDraw - on.firstFrame < 800, `${view.name}: its land is drawn soon after the loop starts`, `first tick ${on.firstFrame}ms, first draw ${on.firstDraw}ms`)
  expect(Math.max(...on.firstTicksMs) < 20, `${view.name}: no frame of the loop waits for the shaders`, `first frames ${on.firstTicksMs.join("/")}ms`)
  const k = kept.find((x) => x.view === view.name)
  if (k) {
    expect(k.drewAtAll > 0, `${view.name}: with reduced motion its land is drawn all the same`, `${k.drewAtAll} draws`)
    expect(k.settled === k.drewAtAll, `${view.name}: with reduced motion it then stops asking for frames`, `${k.settled - k.drewAtAll} more draws in the next 1.5s`)
    expect(k.reachable, `${view.name}: the ball itself is what a finger lands on`, "no grip is reachable")
    expect(!k.reachable || k.afterDrag > k.settled, `${view.name}: with reduced motion a finger still turns it`, `${k.afterDrag - k.settled} draws while dragged`)
    expect(k.hiddenDraws === 0, `${view.name}: a hidden tab draws nothing`, `${k.hiddenDraws} draws`)
  }
}
if (process.env.OUT) writeFileSync(process.env.OUT, JSON.stringify(results, null, 2))
console.log(bad ? `\n${bad} failed\n` : "\nall good\n")
process.exit(bad ? 1 : 0)
