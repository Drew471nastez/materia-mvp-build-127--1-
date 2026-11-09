/**
 * ===========================================================================
 *  THE LIVE ONEPAGE, PROFILED (round AP)
 * ===========================================================================
 * The owner: "in the live one page, there are no things causing lag or
 * performance issues". The real PublicOnePage with a full page
 * (scripts/render-onepage-perf-ap.tsx), at 390x844 (a phone, CPU slowed 4x)
 * and 1440x900 (a computer, CPU slowed 2x), on an animated gradient and on a
 * plain colour. For each:
 *
 *   load       layout shifts (CLS, the sum of unexpected shifts) and long
 *              tasks (over 50ms) in the first 4 seconds
 *   idle       long tasks, requestAnimationFrame callbacks and main-thread
 *              time in 3 seconds of doing nothing (an animation loop or a
 *              timer that never sleeps shows here)
 *   scroll     the page scrolled by wheel to its end and back: the frame
 *              intervals (median, 95th percentile, longest), long tasks
 *              and layout shifts while scrolling
 *   listeners  how many scroll, resize, wheel, touchmove and pointermove
 *              listeners the page added to window and document, and how
 *              many are not passive
 *
 *   node scripts/check-onepage-perf-ap.mjs        (REPORT=1 prints without failing)
 */
import { existsSync } from "node:fs"
import puppeteer from "puppeteer-core"
import { serveEditorProbe } from "./onepage-probe-server.mjs"

const report = !!process.env.REPORT
const CHROMIUM = process.env.CHROMIUM || ["/opt/pw-browsers/chromium-1194/chrome-linux/chrome", "/opt/pw-browsers/chromium"].find((p) => existsSync(p))
const { base, server } = await serveEditorProbe({ entry: "scripts/render-onepage-perf-ap.tsx", pathname: "/radu/links" })
const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox"] })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${typeof got === "string" ? got : JSON.stringify(got)})`}`)
  if (!ok) broken++
}

/* Before the page: shifts, long tasks, listener counts and an rAF counter. */
const BOOT = () => {
  window.__perf = { shifts: [], long: [], listeners: {}, raf: 0 }
  new PerformanceObserver((l) => {
    for (const e of l.getEntries()) if (!e.hadRecentInput) window.__perf.shifts.push({ t: Math.round(e.startTime), v: e.value })
  }).observe({ type: "layout-shift", buffered: true })
  new PerformanceObserver((l) => {
    for (const e of l.getEntries()) window.__perf.long.push({ t: Math.round(e.startTime), d: Math.round(e.duration) })
  }).observe({ type: "longtask", buffered: true })
  const watched = new Set(["scroll", "resize", "wheel", "touchmove", "touchstart", "pointermove", "mousemove"])
  for (const target of [window, document]) {
    const add = target.addEventListener.bind(target)
    target.addEventListener = (type, fn, opts) => {
      if (watched.has(type)) {
        const passive = typeof opts === "object" && opts && opts.passive === true
        const k = `${target === window ? "window" : "document"}:${type}`
        const c = (window.__perf.listeners[k] ||= { n: 0, active: 0 })
        c.n++
        if (!passive && type !== "scroll" && type !== "resize") c.active++
      }
      return add(type, fn, opts)
    }
  }
  const raf = window.requestAnimationFrame.bind(window)
  window.requestAnimationFrame = (cb) => {
    window.__perf.raf++
    return raf(cb)
  }
}

const results = []
try {
  for (const [label, w, h, cpu] of [["390", 390, 844, 4], ["1440", 1440, 900, 2]]) {
    for (const bg of ["gradient", "solid"]) {
      const page = await browser.newPage()
      await page.setViewport({ width: w, height: h, deviceScaleFactor: 1, isMobile: w < 500, hasTouch: w < 500 })
      await page.setRequestInterception(true)
      page.on("request", (r) => {
        const u = new URL(r.url())
        if (u.protocol === "data:") return void r.continue()
        if (u.hostname !== "127.0.0.1") return void r.respond({ status: 200, contentType: "text/html", body: "<!doctype html><body></body>" })
        void r.continue()
      })
      await page.evaluateOnNewDocument(BOOT)
      const cdp = await page.createCDPSession()
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: cpu })
      await page.goto(`${base}/app/onepage${bg === "solid" ? "?bg=solid" : ""}`, { waitUntil: "domcontentloaded" })
      await page.waitForSelector(".op-btn", { timeout: 60000 })
      await sleep(4000)
      const load = await page.evaluate(() => ({ cls: window.__perf.shifts.reduce((a, s) => a + s.v, 0), shifts: window.__perf.shifts, long: window.__perf.long.slice(), listeners: window.__perf.listeners }))

      /* Idle: nothing happens for 3 seconds. */
      await page.evaluate(() => { window.__perf.raf = 0; window.__perf.long = []; window.__idleT0 = performance.now() })
      const m0 = await cdp.send("Performance.enable").then(() => cdp.send("Performance.getMetrics"))
      await sleep(3000)
      const m1 = await cdp.send("Performance.getMetrics")
      const metric = (m, k) => m.metrics.find((x) => x.name === k)?.value ?? 0
      const idle = await page.evaluate(() => ({ raf: window.__perf.raf, long: window.__perf.long.slice(), secs: (performance.now() - window.__idleT0) / 1000 }))
      const idleScript = Math.round((metric(m1, "ScriptDuration") - metric(m0, "ScriptDuration")) * 1000)
      const idleLayout = Math.round((metric(m1, "LayoutDuration") + metric(m1, "RecalcStyleDuration") - metric(m0, "LayoutDuration") - metric(m0, "RecalcStyleDuration")) * 1000)

      /* Scroll by wheel to the end and back, recording frame intervals. */
      await page.evaluate(() => {
        window.__perf.long = []
        window.__perf.shifts = []
        window.__frames = []
        let last = performance.now()
        const tick = (t) => {
          window.__frames.push(t - last)
          last = t
          if (!window.__stopFrames) requestAnimationFrame(tick)
        }
        requestAnimationFrame(tick)
      })
      await page.mouse.move(w / 2, h / 2)
      const height = await page.evaluate(() => document.documentElement.scrollHeight)
      for (let y = 0; y < height; y += 120) {
        await page.mouse.wheel({ deltaY: 120 })
        await sleep(16)
      }
      for (let y = height; y > 0; y -= 240) {
        await page.mouse.wheel({ deltaY: -240 })
        await sleep(16)
      }
      await sleep(400)
      const scroll = await page.evaluate(() => {
        window.__stopFrames = true
        const f = window.__frames.slice(2).sort((a, b) => a - b)
        const q = (p) => Math.round(f[Math.min(f.length - 1, Math.floor(f.length * p))] * 10) / 10
        return { frames: f.length, median: q(0.5), p95: q(0.95), max: Math.round((f[f.length - 1] || 0) * 10) / 10, long: window.__perf.long.slice(), cls: window.__perf.shifts.reduce((a, s) => a + s.v, 0) }
      })
      const listeners = Object.entries(load.listeners).map(([k, v]) => `${k} ${v.n}${v.active ? ` (${v.active} not passive)` : ""}`).join(", ")
      const row = {
        viewport: label,
        bg,
        cpu,
        loadCLS: Math.round(load.cls * 1000) / 1000,
        loadLongTasks: load.long.length,
        loadLongestMs: Math.max(0, ...load.long.map((l) => l.d)),
        idleRafPerSec: Math.round(idle.raf / idle.secs),
        idleLongTasks: idle.long.length,
        idleScriptMs: idleScript,
        idleStyleLayoutMs: idleLayout,
        scrollFrames: scroll.frames,
        scrollMedianMs: scroll.median,
        scrollP95Ms: scroll.p95,
        scrollMaxMs: scroll.max,
        scrollLongTasks: scroll.long.length,
        scrollCLS: Math.round(scroll.cls * 1000) / 1000,
        listeners,
      }
      results.push(row)
      console.log(`\n${label} ${bg} (CPU ${cpu}x)`)
      console.log("  " + JSON.stringify(row))
      expect(row.loadCLS < 0.01, `${label} ${bg}: layout shift on load ${row.loadCLS}`)
      expect(row.scrollCLS < 0.001, `${label} ${bg}: no layout shift while scrolling (${row.scrollCLS})`)
      expect(row.idleLongTasks === 0, `${label} ${bg}: no long task while idle (${row.idleLongTasks})`)
      expect(row.scrollLongTasks === 0, `${label} ${bg}: no long task while scrolling (${row.scrollLongTasks})`)
      expect(row.idleScriptMs < 150, `${label} ${bg}: script while idle ${row.idleScriptMs}ms in 3s`)
      await page.close()
    }
  }
} finally {
  await browser.close()
  server.close()
}
console.log("\nRESULTS " + JSON.stringify(results))
if (broken && !report) {
  console.error(`\n${broken} failed`)
  process.exit(1)
}
console.log(broken ? `\n${broken} would fail (REPORT)` : "\nall passed")
