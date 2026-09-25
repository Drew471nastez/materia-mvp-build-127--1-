/**
 * ===========================================================================
 *  HOME ON A PHONE: WHAT A SWIPE COSTS, OVER THE CHART AND BELOW IT
 * ===========================================================================
 * "When I'm scrolling on mobile ... below the chart and I do the swipe, it
 * lags the page in a really weird way."
 *
 * The real Home (scripts/render-home-banner.tsx, forty sales on Free) at
 * 390x844, touch, the processor slowed four times, swiped with real touch
 * events: three flicks that start on the chart, three that start on the
 * banner under it, then flicks down to the foot of the page. A trace runs
 * the whole time, and for each group this reports:
 *
 *   MAIN THREAD  how much of the gesture the page's own thread was busy,
 *                its longest task, and tasks over 50ms. On a phone a
 *                touchmove waits for this thread whenever a listener on
 *                the way may cancel it, so this is the number a swipe
 *                feels.
 *   INPUT DELAY  how long each touchmove waited before the page ran it
 *                (the handler's start less the event's timestamp).
 *   FRAMES       the page's own frame loop while the swipe ran: the
 *                longest gap between two frames and how many ran over
 *                33ms.
 *   PER FRAME    the frame callbacks' time (the globe's drawing lives
 *                there), per frame, as the trace measured it.
 *   JANK         the frames Chromium itself marked janky for a touch
 *                scroll because the main thread was late (JankV3).
 *
 * Headless Chromium has no GPU, so it composites in software and drops
 * frames no phone would; the compositor's own frame count is printed but not
 * judged. What carries over to a phone is the main thread: work there is
 * work there on a device, only faster.
 *
 *   node scripts/check-home-scroll.mjs
 *   DPR=2 CPU=6 node scripts/check-home-scroll.mjs
 *   OUT=/some/file.json node scripts/check-home-scroll.mjs   (the numbers, for comparing runs)
 */
import { existsSync, writeFileSync, readFileSync, rmSync, mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { homeProbePage } from "./home-probe-page.mjs"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const DPR = Number(process.env.DPR ?? 3)
const CPU = Number(process.env.CPU ?? 4)
const STATE = process.env.STATE ?? "selling"
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const { base, close } = await homeProbePage()
const browser = await puppeteer.launch({
  executablePath: CHROMIUM,
  headless: true,
  /* WebGL through SwiftShader, which is how a canvas that asks for it gets one here; and no request leaves the machine. */
  args: ["--no-sandbox", "--enable-unsafe-swiftshader", "--use-angle=swiftshader", "--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1"],
})
const traceDir = mkdtempSync(join(tmpdir(), "home-scroll-"))
const tracePath = join(traceDir, "trace.json")
let result
try {
  const page = await browser.newPage()
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: DPR, isMobile: true, hasTouch: true })
  const cdp = await page.createCDPSession()
  /* EXPERIMENT=noglobe: every canvas refuses a context, so the globe never draws. For telling its cost from everything else's. */
  if (process.env.EXPERIMENT === "noglobe") await page.evaluateOnNewDocument(() => { HTMLCanvasElement.prototype.getContext = () => null })
  await page.goto(`${base}/app?state=${STATE}`)
  await page.waitForSelector("[data-home-globe]", { timeout: 20000 })
  await sleep(1500)
  const threw = await page.evaluate(() => window.__threw || null)
  if (threw) fail(`Home did not render: ${threw}`)
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU })
  await sleep(800)

  /* Where to put a finger: the middle of the chart, and the banner under it. */
  const spots = await page.evaluate(() => {
    const scroller = document.querySelector(".dashboard-scroll-container")
    const strip = document.querySelector("[role=tablist]").getBoundingClientRect()
    const banner = document.querySelector("[data-home-globe]").closest("[data-home-banner], .rounded-2xl").getBoundingClientRect()
    return { chartY: Math.round(strip.bottom + 110), bannerTop: Math.round(banner.top), bannerH: Math.round(banner.height), height: scroller.scrollHeight, view: scroller.clientHeight }
  })

  /* The instruments: a passive touchmove listener on the document (which changes nothing about how the page scrolls), the frame loop, and the browser's long frame reports. */
  await page.evaluate(() => {
    window.__phase = null
    window.__log = { delays: {}, gaps: {} }
    document.addEventListener("touchmove", (e) => {
      if (!window.__phase) return
      ;(window.__log.delays[window.__phase] ??= []).push(performance.now() - e.timeStamp)
    }, { passive: true, capture: true })
    let last = 0
    const tick = (t) => {
      if (window.__phase && last) (window.__log.gaps[window.__phase] ??= []).push(t - last)
      last = t
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
    window.__loaf = []
    try {
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) {
          window.__loaf.push({ phase: window.__phase, dur: e.duration, blocking: e.blockingDuration, scripts: (e.scripts || []).map((s) => ({ fn: s.sourceFunctionName, inv: s.invoker, dur: s.duration })) })
        }
      }).observe({ type: "long-animation-frame", buffered: false })
    } catch { /* an engine without it */ }
  })

  await page.tracing.start({ path: tracePath, categories: ["devtools.timeline", "disabled-by-default-devtools.timeline", "disabled-by-default-devtools.timeline.frame", "cc", "benchmark", "blink.user_timing", "toplevel"] })
  const touch = (type, x, y) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y, radiusX: 11, radiusY: 11, force: 1 }] })
  /** One flick: a finger down, up the screen over ~260ms at a phone's 60Hz, and let go; then the fling runs out. */
  const flick = async (x, y0, dy) => {
    await touch("touchStart", x, y0)
    const t0 = Date.now()
    const moves = 16
    for (let i = 1; i <= moves; i++) {
      await touch("touchMove", x, Math.round(y0 - (dy * i) / moves))
      const wait = t0 + i * 16 - Date.now()
      if (wait > 0) await sleep(wait)
    }
    await touch("touchEnd")
    await sleep(750)
  }
  const phase = async (name, fn) => {
    await page.evaluate((n) => { window.__phase = n; performance.mark(`phase:${n}:start`) }, name)
    await fn()
    await page.evaluate((n) => { performance.mark(`phase:${n}:end`); window.__phase = null }, name)
  }
  const toTop = () => page.evaluate(() => { document.querySelector(".dashboard-scroll-container").scrollTop = 0 })

  /* Over the chart: the finger lands on the chart itself. */
  await phase("chart", async () => {
    for (let k = 0; k < 3; k++) {
      await toTop()
      await sleep(300)
      await flick(150, spots.chartY, 260)
    }
  })
  /* Below the chart: the finger lands on the banner, with the page brought up so the banner sits mid screen. */
  const bannerAt = Math.max(0, spots.bannerTop - 260)
  await phase("below", async () => {
    for (let k = 0; k < 3; k++) {
      await page.evaluate((y) => { document.querySelector(".dashboard-scroll-container").scrollTop = y }, bannerAt)
      await sleep(300)
      await flick(90, 260 + Math.round(spots.bannerH / 2), 260)
    }
  })
  /* And on down to the foot of the page, flick after flick, as a thumb does. */
  await phase("down", async () => {
    await page.evaluate((y) => { document.querySelector(".dashboard-scroll-container").scrollTop = y }, bannerAt)
    await sleep(300)
    for (let k = 0; k < 4; k++) await flick(120, 640, 420)
  })
  await page.tracing.stop()

  const inPage = await page.evaluate(() => ({ log: window.__log, loaf: window.__loaf, errors: window.__err, top: document.querySelector(".dashboard-scroll-container").scrollTop }))
  result = { spots, inPage }
} finally {
  await browser.close()
  close()
}

/* ─── Reading the trace ───────────────────────────────────────────────── */
const trace = JSON.parse(readFileSync(tracePath, "utf8"))
rmSync(traceDir, { recursive: true, force: true })
const ev = trace.traceEvents || trace
const names = new Map()
for (const e of ev) if (e.ph === "M" && e.name === "thread_name") names.set(`${e.pid}:${e.tid}`, e.args.name)
const marks = ev.filter((e) => e.cat?.includes("blink.user_timing") && /^phase:/.test(e.name))
const rendererPid = marks[0]?.pid
const mainKey = [...names.entries()].find(([k, n]) => n === "CrRendererMain" && k.startsWith(`${rendererPid}:`))?.[0]
const compKey = [...names.entries()].find(([k, n]) => n === "Compositor" && k.startsWith(`${rendererPid}:`))?.[0]
const span = (name) => {
  const s = marks.find((m) => m.name === `phase:${name}:start`)
  const e = marks.find((m) => m.name === `phase:${name}:end`)
  return s && e ? [s.ts, e.ts] : null
}
const pct = (a, p) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * p))] : 0 }
const report = {}
for (const name of ["chart", "below", "down"]) {
  const w = span(name)
  if (!w) continue
  const inside = (e) => e.ts >= w[0] && e.ts <= w[1]
  const main = ev.filter((e) => `${e.pid}:${e.tid}` === mainKey && inside(e))
  const tasks = main.filter((e) => e.name === "RunTask" && e.ph === "X")
  const busy = tasks.reduce((s, e) => s + e.dur, 0)
  const raf = main.filter((e) => e.name === "FireAnimationFrame" && e.ph === "X")
  const frames = ev.filter((e) => `${e.pid}:${e.tid}` === compKey && inside(e))
  const jank = frames.filter((e) => e.name === "JankV3" && e.ph === "b" && e.args?.data?.data?.["thread-type"] === "MainThread").length
  const dropped = frames.filter((e) => e.name === "DroppedFrame").length
  const begun = frames.filter((e) => e.name === "BeginFrame").length
  const delays = result.inPage.log.delays[name] ?? []
  const gaps = result.inPage.log.gaps[name] ?? []
  const loaf = result.inPage.loaf.filter((l) => l.phase === name)
  const culprits = new Map()
  for (const l of loaf) for (const s of l.scripts) culprits.set(`${s.fn || "(anonymous)"} via ${s.inv}`, (culprits.get(`${s.fn || "(anonymous)"} via ${s.inv}`) ?? 0) + s.dur)
  report[name] = {
    gestureMs: Math.round((w[1] - w[0]) / 1000),
    mainBusyPct: +((busy / (w[1] - w[0])) * 100).toFixed(1),
    longestTaskMs: +(Math.max(0, ...tasks.map((e) => e.dur)) / 1000).toFixed(1),
    longTasks: tasks.filter((e) => e.dur > 50000).length,
    rafFrames: raf.length,
    rafMsPerFrame: raf.length ? +((raf.reduce((s, e) => s + e.dur, 0) / raf.length) / 1000).toFixed(2) : 0,
    rafMaxMs: +(Math.max(0, ...raf.map((e) => e.dur)) / 1000).toFixed(1),
    inputDelayP50: +pct(delays, 0.5).toFixed(1),
    inputDelayP95: +pct(delays, 0.95).toFixed(1),
    inputDelayMax: +Math.max(0, ...delays).toFixed(1),
    frameGapMax: +Math.max(0, ...gaps).toFixed(1),
    framesOver33: gaps.filter((g) => g > 33.4).length,
    jankMainThread: jank,
    compositorFrames: `${begun - dropped} of ${begun} presented (software compositing)`,
    longFrameScripts: [...culprits.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, v]) => `${k} ${Math.round(v)}ms`),
  }
}

console.log(`\nHome at 390x844, DPR ${DPR}, CPU slowed ${CPU}x, state "${STATE}", ${result.spots.height}px of page`)
for (const [name, r] of Object.entries(report)) {
  const label = { chart: "flicks starting on the chart", below: "flicks starting on the banner below it", down: "flicks down to the foot" }[name]
  console.log(`\n  ${label} (${r.gestureMs}ms)`)
  console.log(`    main thread busy ${r.mainBusyPct}%, longest task ${r.longestTaskMs}ms, tasks over 50ms: ${r.longTasks}`)
  console.log(`    frame callbacks ${r.rafFrames}, ${r.rafMsPerFrame}ms each on average, longest ${r.rafMaxMs}ms`)
  console.log(`    touchmove waited p50 ${r.inputDelayP50}ms, p95 ${r.inputDelayP95}ms, max ${r.inputDelayMax}ms`)
  console.log(`    longest gap between frames ${r.frameGapMax}ms, gaps over 33ms: ${r.framesOver33}, janky touch scroll frames (main thread): ${r.jankMainThread}`)
  console.log(`    compositor: ${r.compositorFrames}`)
  if (r.longFrameScripts.length) console.log(`    long frames spent their script time in: ${r.longFrameScripts.join("; ")}`)
}
if (result.inPage.errors?.length) console.log(`\n  the page reported: ${JSON.stringify(result.inPage.errors.slice(0, 3))}`)
if (process.env.OUT) writeFileSync(process.env.OUT, JSON.stringify({ dpr: DPR, cpu: CPU, state: STATE, report }, null, 2))

/* The claim this holds the page to: a swipe below the chart costs no more than one on the chart, and neither leaves the thread busy for a whole frame. */
let bad = 0
const expect = (ok, what, got) => { console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${ok ? "" : `   ${got}`}`); if (!ok) bad++ }
console.log("")
for (const [name, r] of Object.entries(report)) {
  expect(r.longTasks === 0, `${name}: no task over 50ms`, r.longTasks)
  expect(r.inputDelayP95 < 16.7, `${name}: a touchmove waits less than a frame (p95)`, `${r.inputDelayP95}ms`)
  expect(r.rafMsPerFrame < 4, `${name}: frame callbacks under 4ms a frame`, `${r.rafMsPerFrame}ms`)
}
expect(result.inPage.top > result.spots.height - result.spots.view - 400, "the flicks reached the foot of the page", `${result.inPage.top} of ${result.spots.height - result.spots.view}`)
console.log(bad ? `\n${bad} failed\n` : "\nall good\n")
process.exit(bad ? 1 : 0)
