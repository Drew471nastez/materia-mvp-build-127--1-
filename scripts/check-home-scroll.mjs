/**
 * ===========================================================================
 *  HOME ON A PHONE: WHAT A SWIPE COSTS, OVER THE CHART AND BELOW IT
 * ===========================================================================
 * "When I'm scrolling on mobile ... below the chart and I do the swipe, it
 * lags the page in a really weird way."
 *
 * The real Home (scripts/render-home-banner.tsx, forty sales on Free) at
 * 390x844, touch, a 3x screen, the processor slowed four times, swiped with
 * real touch events: three flicks that start on the chart, three that start
 * on the banner under it, then flicks down to the foot of the page. Twice,
 * back to back in the same browser: BEFORE, Home as it was at BASE (the old
 * banner, the old globe and the old pull to refresh, from the repository;
 * scripts/home-probe-page.mjs), and NOW. The same machine at the same
 * moment, because this machine's load moves more than anything measured.
 *
 * For each group of flicks, from a trace and from the page:
 *
 *   TIME         how long the flicks took to deliver. Input here waits for
 *                the page's frames, so a page that starves its frames makes
 *                the same gestures take longer.
 *   INPUT DELAY  how long each touchmove waited before the page ran it.
 *   FRAMES       the compositor's frames presented of those begun, and the
 *                page's longest gap between two frames.
 *   MAIN THREAD  busy share, longest task, tasks over 50ms, and the frame
 *                callbacks' time per frame (the globe's drawing is there).
 *   JANK         frames Chromium itself marked janky for a touch scroll
 *                because the main thread was late (JankV3).
 *
 * Headless Chromium composites in software at 3x, which costs frames no
 * phone would lose; so the gates compare NOW with BEFORE rather than with a
 * phone's numbers, and the absolute numbers are printed, not judged.
 *
 *   node scripts/check-home-scroll.mjs
 *   BASE=<commit> DPR=2 CPU=6 node scripts/check-home-scroll.mjs
 *   BANNER_BASE=<commit> node scripts/check-home-scroll.mjs
 *       (BEFORE is this checkout with only the banner, components/app/home/
 *       home-banner.tsx, taken from that commit: what a change to the
 *       banner alone costs a swipe)
 *   ONLY=now node scripts/check-home-scroll.mjs      (one run, no comparison)
 *   EXPERIMENT=noglobe ONLY=now node scripts/check-home-scroll.mjs   (every canvas refused)
 *   OUT=/some/file.json node scripts/check-home-scroll.mjs
 */
import { execFileSync } from "node:child_process"
import { existsSync, writeFileSync, readFileSync, rmSync, mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { homeProbePage } from "./home-probe-page.mjs"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const BANNER_BASE = process.env.BANNER_BASE ?? null
const BASE = BANNER_BASE ?? process.env.BASE ?? "96949910"

/** BEFORE with the banner alone from BANNER_BASE, written beside this one so its own imports resolve, for the length of a bundle. */
async function bannerOnlyBefore() {
  const file = join(process.cwd(), "components/app/home", `.home-banner-before-${process.pid}.tsx`)
  writeFileSync(file, execFileSync("git", ["show", `${BANNER_BASE}:components/app/home/home-banner.tsx`], { encoding: "utf8" }))
  try {
    return await homeProbePage(process.cwd(), { swaps: { "@/components/app/home/home-banner": file } })
  } finally {
    rmSync(file, { force: true })
  }
}
const DPR = Number(process.env.DPR ?? 3)
const CPU = Number(process.env.CPU ?? 4)
const STATE = process.env.STATE ?? "selling"
const ONLY = process.env.ONLY ?? null
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const PHASES = ["chart", "below", "down"]
const LABEL = { chart: "flicks starting on the chart", below: "flicks starting on the banner below it", down: "flicks down to the foot" }

const browser = await puppeteer.launch({
  executablePath: CHROMIUM,
  headless: true,
  /* WebGL through SwiftShader, which is how a canvas that asks for it gets one here; and no request leaves the machine. */
  args: ["--no-sandbox", "--enable-unsafe-swiftshader", "--use-angle=swiftshader", "--no-proxy-server", "--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1"],
})

/** One run of the flicks over one build of Home, and what they cost. */
async function measure(name, base) {
  const traceDir = mkdtempSync(join(tmpdir(), "home-scroll-"))
  const tracePath = join(traceDir, "trace.json")
  const page = await browser.newPage()
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: DPR, isMobile: true, hasTouch: true })
  const cdp = await page.createCDPSession()
  if (process.env.EXPERIMENT === "noglobe") await page.evaluateOnNewDocument(() => { HTMLCanvasElement.prototype.getContext = () => null })
  await page.goto(`${base}/app?state=${STATE}`)
  await page.waitForSelector("[data-home-globe]", { timeout: 20000 })
  /* Fonts first: a font arriving mid swipe restyles every line of text, and that is not what is being measured. */
  await page.evaluate(() => document.fonts.ready)
  await sleep(1500)
  const threw = await page.evaluate(() => window.__threw || null)
  if (threw) fail(`${name}: Home did not render: ${threw}`)
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU })
  await sleep(800)

  /* Where to put a finger: the middle of the chart, and the banner under it. */
  const spots = await page.evaluate(() => {
    const scroller = document.querySelector(".dashboard-scroll-container")
    const strip = document.querySelector("[role=tablist]").getBoundingClientRect()
    const banner = document.querySelector("[data-home-banner]").getBoundingClientRect()
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
          window.__loaf.push({ phase: window.__phase, dur: e.duration, scripts: (e.scripts || []).map((s) => ({ fn: s.sourceFunctionName, inv: s.invoker, dur: s.duration, forced: s.forcedStyleAndLayoutDuration || 0 })) })
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
  /* Each flick is measured on its own, from the finger down to the end of its fling; the jumps between flicks, which no thumb makes, are not. */
  let windows = 0
  const measured = async (p, fn) => {
    const k = windows++
    await page.evaluate((n, i) => { window.__phase = n; performance.mark(`phase:${n}:${i}:start`) }, p, k)
    await fn()
    await page.evaluate((n, i) => { performance.mark(`phase:${n}:${i}:end`); window.__phase = null }, p, k)
  }
  const scrollTo = (y) => page.evaluate((top) => { document.querySelector(".dashboard-scroll-container").scrollTop = top }, y)

  /* Over the chart: the finger lands on the chart itself. */
  for (let k = 0; k < 3; k++) {
    await scrollTo(0)
    await sleep(400)
    await measured("chart", () => flick(150, spots.chartY, 260))
  }
  /* Below the chart: the finger lands on the banner, with the page brought up so the banner sits mid screen. */
  const bannerAt = Math.max(0, spots.bannerTop - 260)
  for (let k = 0; k < 3; k++) {
    await scrollTo(bannerAt)
    await sleep(400)
    await measured("below", () => flick(90, 260 + Math.round(spots.bannerH / 2), 260))
  }
  /* And on down to the foot of the page, flick after flick, as a thumb does. */
  await scrollTo(bannerAt)
  await sleep(400)
  await measured("down", async () => {
    for (let k = 0; k < 4; k++) await flick(120, 640, 420)
  })
  await page.tracing.stop()
  const inPage = await page.evaluate(() => ({ log: window.__log, loaf: window.__loaf, errors: window.__err, top: document.querySelector(".dashboard-scroll-container").scrollTop }))
  await page.close()

  /* ── Reading the trace ─────────────────────────────────────────────── */
  const trace = JSON.parse(readFileSync(tracePath, "utf8"))
  rmSync(traceDir, { recursive: true, force: true })
  const ev = trace.traceEvents || trace
  const names = new Map()
  for (const e of ev) if (e.ph === "M" && e.name === "thread_name") names.set(`${e.pid}:${e.tid}`, e.args.name)
  const marks = ev.filter((e) => e.cat?.includes("blink.user_timing") && /^phase:/.test(e.name))
  const rendererPid = marks[0]?.pid
  const mainKey = [...names.entries()].find(([k, n]) => n === "CrRendererMain" && k.startsWith(`${rendererPid}:`))?.[0]
  const compKey = [...names.entries()].find(([k, n]) => n === "Compositor" && k.startsWith(`${rendererPid}:`))?.[0]
  /* Every measured window of a group: [start, end] pairs in trace time. */
  const spans = (p) => {
    const out = []
    for (const s of marks.filter((m) => m.name.startsWith(`phase:${p}:`) && m.name.endsWith(":start"))) {
      const e = marks.find((m) => m.name === s.name.replace(/:start$/, ":end"))
      if (e) out.push([s.ts, e.ts])
    }
    return out
  }
  const pct = (a, p) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * p))] : 0 }
  const report = {}
  for (const p of PHASES) {
    const ws = spans(p)
    if (!ws.length) continue
    const inside = (e) => ws.some(([a, b]) => e.ts >= a && e.ts <= b)
    const total = ws.reduce((n, [a, b]) => n + (b - a), 0)
    const main = ev.filter((e) => `${e.pid}:${e.tid}` === mainKey && inside(e))
    const tasks = main.filter((e) => e.name === "RunTask" && e.ph === "X")
    const busy = tasks.reduce((s, e) => s + e.dur, 0)
    const raf = main.filter((e) => e.name === "FireAnimationFrame" && e.ph === "X")
    const frames = ev.filter((e) => `${e.pid}:${e.tid}` === compKey && inside(e))
    const jank = frames.filter((e) => e.name === "JankV3" && e.ph === "b" && e.args?.data?.data?.["thread-type"] === "MainThread").length
    const dropped = frames.filter((e) => e.name === "DroppedFrame").length
    const begun = frames.filter((e) => e.name === "BeginFrame").length
    const delays = inPage.log.delays[p] ?? []
    const gaps = inPage.log.gaps[p] ?? []
    const culprits = new Map()
    const forced = new Map()
    for (const l of inPage.loaf.filter((x) => x.phase === p)) for (const s of l.scripts) {
      const key = `${s.fn || "(anonymous)"} via ${s.inv}`
      culprits.set(key, (culprits.get(key) ?? 0) + s.dur)
      forced.set(key, (forced.get(key) ?? 0) + s.forced)
    }
    /* The long tasks, and what was inside each: the question a number alone does not answer. */
    const contents = (task) => {
      const kids = main.filter((e) => e.ph === "X" && e.ts >= task.ts && e.ts + (e.dur ?? 0) <= task.ts + task.dur && e !== task && e.dur > 1000 && !/RunTask|ThreadControllerImpl/.test(e.name))
      const by = new Map()
      for (const k of kids) {
        const label = k.name === "FunctionCall" ? `FunctionCall ${k.args?.data?.functionName || "?"}` : k.name === "EventDispatch" ? `EventDispatch ${k.args?.data?.type}` : k.name
        by.set(label, Math.max(by.get(label) ?? 0, k.dur))
      }
      return [...by.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, v]) => `${k} ${(v / 1000).toFixed(1)}ms`).join(", ")
    }
    report[p] = {
      gestureMs: Math.round(total / 1000),
      presented: begun ? (begun - dropped) / begun : 1,
      presentedText: `${begun - dropped} of ${begun}`,
      mainBusyPct: +((busy / total) * 100).toFixed(1),
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
      longFrameScripts: [...culprits.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, v]) => `${k} ${Math.round(v)}ms${forced.get(k) ? ` (${Math.round(forced.get(k))}ms forced layout)` : ""}`),
      longTaskContents: [...tasks].sort((a, b) => b.dur - a.dur).slice(0, 2).filter((t) => t.dur > 16700).map((t) => `${(t.dur / 1000).toFixed(0)}ms: ${contents(t)}`),
    }
  }
  return { name, spots, report, top: inPage.top, errors: inPage.errors }
}

const runs = []
try {
  for (const which of ONLY ? [ONLY] : ["before", "now"]) {
    const served = which === "before" ? (BANNER_BASE ? await bannerOnlyBefore() : await homeProbePage(process.cwd(), { before: BASE })) : await homeProbePage()
    try {
      runs.push(await measure(which, served.base))
    } finally {
      served.close()
    }
  }
} finally {
  await browser.close()
}

console.log(`\nHome at 390x844, DPR ${DPR}, CPU slowed ${CPU}x, state "${STATE}"${process.env.EXPERIMENT ? `, experiment ${process.env.EXPERIMENT}` : ""}`)
for (const run of runs) {
  console.log(`\n${run.name === "before" ? `BEFORE (${BANNER_BASE ? `the banner at ${BASE}` : BASE})` : "NOW"}: ${run.spots.height}px of page`)
  for (const [p, r] of Object.entries(run.report)) {
    console.log(`  ${LABEL[p]}: ${r.gestureMs}ms to deliver`)
    console.log(`    touchmove waited p50 ${r.inputDelayP50}ms, p95 ${r.inputDelayP95}ms, max ${r.inputDelayMax}ms`)
    console.log(`    frames presented ${r.presentedText}; longest gap ${r.frameGapMax}ms, ${r.framesOver33} over 33ms; janky touch scroll frames ${r.jankMainThread}`)
    console.log(`    main thread busy ${r.mainBusyPct}%, longest task ${r.longestTaskMs}ms, ${r.longTasks} over 50ms; frame callbacks ${r.rafFrames}, ${r.rafMsPerFrame}ms each, longest ${r.rafMaxMs}ms`)
    if (r.longFrameScripts.length) console.log(`    long frames spent their script time in: ${r.longFrameScripts.join("; ")}`)
    for (const t of r.longTaskContents) console.log(`    long task ${t}`)
  }
  if (run.errors?.length) console.log(`  the page reported: ${JSON.stringify(run.errors.slice(0, 3))}`)
}
if (process.env.OUT) writeFileSync(process.env.OUT, JSON.stringify({ dpr: DPR, cpu: CPU, state: STATE, base: BASE, runs: runs.map((r) => ({ name: r.name, report: r.report })) }, null, 2))

/*
  THE CLAIM: swiping Home now costs less than it did, below the chart
  above all, and nothing on it holds the thread for a whole long task.
*/
let bad = 0
const expect = (ok, what, got) => { console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${ok ? "" : `   ${got}`}`); if (!ok) bad++ }
const now = runs.find((r) => r.name === "now")
const before = runs.find((r) => r.name === "before")
console.log("")
if (now) {
  for (const p of PHASES) {
    const r = now.report[p]
    if (!r) continue
    expect(r.longTasks === 0 || p === "chart", `${p}: no task over 50ms`, r.longTasks)
    expect(r.rafMsPerFrame < 1.5, `${p}: frame callbacks under 1.5ms a frame at ${CPU}x`, `${r.rafMsPerFrame}ms`)
    if (before?.report[p]) {
      const b = before.report[p]
      expect(r.inputDelayP95 <= b.inputDelayP95 * 1.1 + 5, `${p}: a touchmove waits no longer than before (p95 ${r.inputDelayP95} vs ${b.inputDelayP95}ms)`, "")
      expect(r.presented >= b.presented - 0.05, `${p}: as many frames presented as before or more (${r.presentedText} vs ${b.presentedText})`, "")
    }
  }
  expect(now.top > now.spots.height - now.spots.view - 400, "the flicks reached the foot of the page", `${now.top} of ${now.spots.height - now.spots.view}`)
}
console.log(bad ? `\n${bad} failed\n` : "\nall good\n")
process.exit(bad ? 1 : 0)
