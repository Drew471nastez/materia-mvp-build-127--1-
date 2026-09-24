/**
 * ===========================================================================
 *  HOW A TREND CHART ANSWERS A POINTER AND A FINGER, MEASURED
 * ===========================================================================
 * "When I hover in the chart left and right with the mouse, or with touch
 * scrub, it is not the same feeling as the chart on the homepage. It needs to
 * be the same smooth moving tooltip at full frame rate."
 *
 * Mounts the home page's chart and the Analytics chart (the real components,
 * scripts/render-chart-feel.tsx), then sweeps a mouse across each at a
 * desktop width and a finger across each at a phone width, one move a frame,
 * through the DevTools protocol (Input.dispatchMouseEvent and
 * Input.dispatchTouchEvent), and reports for each:
 *
 *   main thread   the renderer main thread's busy time during the sweep,
 *                 per move, from a performance trace
 *   frames        frames drawn during the sweep, per move, and how many of
 *                 them took longer than 25ms
 *   renders       React commits of the chart during the sweep, per move
 *                 (0 when a move writes a transform and nothing else)
 *   trail         how far the readout's centre was from the pointer, on
 *                 average, in the middle of the sweep, where it is not
 *                 pinned to an edge
 *   marker        how far the crosshair was from the point under the
 *                 pointer, on average
 *   fade          whether the readout fades out when the pointer leaves
 *                 (its opacity in the frame after), or vanishes
 *
 *   node scripts/check-chart-feel.mjs            both charts, both inputs
 *   CHART=home node scripts/check-chart-feel.mjs
 *
 * Runs without a build: the stylesheet comes from scripts/probe-css.mjs.
 */
import { execFileSync } from "node:child_process"
import { createServer } from "node:http"
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
if (!existsSync(CHROMIUM)) { console.error(`No browser at ${CHROMIUM}.`); process.exit(1) }
const dir = join(root, ".feel-probe")
mkdirSync(dir, { recursive: true })

/* Haptics are recorded, not sent: one tick per point crossed is part of the feel. */
writeFileSync(join(dir, "native-bridge.js"), `export function hapticTap(s) { (globalThis.__haptics = globalThis.__haptics || []).push(s || "light") }
export function isNativeApp() { return false }
export async function triggerHaptic() {}
export function openExternal() {}
export function nativePlatform() { return "web" }
export function shareNative() { return Promise.resolve(false) }
`)

let server
let browser
try {
  const css = await appCss(root, process.env.FEEL_ROOT && existsSync(join(process.env.FEEL_ROOT, "app/globals.css")) ? join(process.env.FEEL_ROOT, "app/globals.css") : null)
  const bundle = join(dir, "probe.js")
  execFileSync("npx", ["--no-install", "esbuild", join(root, "scripts/render-chart-feel.tsx"),
    "--bundle", "--format=iife", "--platform=browser", "--jsx=automatic", "--log-level=error", `--outfile=${bundle}`,
    '--banner:js=var process=globalThis.process||{env:{NODE_ENV:"production"},browser:true,versions:{},platform:"browser",cwd:function(){return "/"},nextTick:function(f){setTimeout(f,0)}};globalThis.process=process;',
    '--define:process.env.NODE_ENV="production"',
    `--alias:@/lib/native-bridge=${join(dir, "native-bridge.js")}`,
    /* FEEL_ROOT: another checkout of the components, to measure a version against this one. */
    `--alias:@=${process.env.FEEL_ROOT || root}`, "--loader:.css=empty", "--loader:.svg=dataurl", "--loader:.png=dataurl"],
    { cwd: root, stdio: ["ignore", "ignore", "inherit"] })
  const js = readFileSync(bundle)
  const html = `<!doctype html><html class="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><style>body{margin:0;background:#fafafa}</style></head><body><div id="app"></div><script src="/probe.js"></script></body></html>`
  server = createServer((req, res) => {
    if (req.url.startsWith("/probe.js")) { res.writeHead(200, { "content-type": "text/javascript" }); return res.end(js) }
    res.writeHead(200, { "content-type": "text/html" }); res.end(html)
  })
  await new Promise((r) => server.listen(0, "127.0.0.1", r))
  const origin = `http://127.0.0.1:${server.address().port}`
  browser = await puppeteer.launch({ executablePath: CHROMIUM, headless: true, args: ["--no-sandbox", "--disable-gpu", "--hide-scrollbars"] })

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const results = []

  /**
   * Everything the page is asked, in the page. The readout and the crosshair
   * are found by what they are rather than by one component's markup, so
   * the same questions work on either chart, before and after.
   */
  const INSTRUMENT = () => {
    const w = window
    const chart = () => document.querySelector("#card")
    w.__tip = () => {
      const c = chart()
      if (!c) return null
      const tagged = c.querySelector("[data-chart-tooltip]")
      if (tagged) return tagged
      const wrap = c.querySelector(".recharts-tooltip-wrapper")
      if (wrap && wrap.firstElementChild) return wrap
      for (const d of c.querySelectorAll("div")) {
        const s = getComputedStyle(d)
        if (s.backgroundColor === "rgb(26, 26, 46)" && s.position === "absolute") return d
      }
      return null
    }
    w.__cross = () => {
      const c = chart()
      if (!c) return null
      return c.querySelector("[data-chart-crosshair]") || c.querySelector("[data-chart-marker] line") || c.querySelector(".recharts-tooltip-cursor") || c.querySelector(".recharts-reference-line line")
    }
    w.__pointer = null
    addEventListener("pointermove", (e) => { w.__pointer = e.clientX }, true)
    addEventListener("touchmove", (e) => { if (e.touches[0]) w.__pointer = e.touches[0].clientX }, { capture: true, passive: true })
    w.__samples = []
    w.__sampling = false
    /*
      READ WHAT THE FRAME WILL PAINT, NOT WHAT THE LAST ONE DID. A chart that
      moves its readout in a requestAnimationFrame callback does so after any
      callback this probe registered a frame earlier, so a reading taken in
      rAF would always be one frame behind it and blame the chart for that.
      A ResizeObserver callback runs later in the same frame, after every rAF
      callback and after layout, just before paint: the probe flips the size
      of a 1px box in rAF and reads everything from the observer.
    */
    const flip = document.createElement("div")
    flip.style.cssText = "position:fixed;left:0;top:0;height:1px;width:1px;pointer-events:none;opacity:0"
    document.body.append(flip)
    let wide = false
    const read = () => {
      if (!w.__sampling) return
      const tip = w.__tip()
      const cross = w.__cross()
      let tipX = null, tipOpacity = null, crossX = null
      if (tip) {
        const r = tip.getBoundingClientRect()
        const s = getComputedStyle(tip)
        const visible = s.visibility !== "hidden" && s.display !== "none" && r.width > 0
        tipOpacity = visible ? Number(s.opacity) : 0
        if (visible) tipX = r.left + r.width / 2
      }
      if (cross) {
        const r = cross.getBoundingClientRect()
        if (r.height > 0) crossX = r.left + r.width / 2
      }
      w.__samples.push({ t: performance.now(), px: w.__pointer, tipX, tipOpacity, crossX })
    }
    new ResizeObserver(read).observe(flip)
    const tick = () => {
      if (!w.__sampling) return
      wide = !wide
      flip.style.width = wide ? "2px" : "1px"
      requestAnimationFrame(tick)
    }
    w.__startSampling = () => { w.__samples = []; w.__sampling = true; requestAnimationFrame(tick) }
    w.__stopSampling = () => { w.__sampling = false; return w.__samples }
    /*
      WHAT A MOVE CHANGES IN THE DOCUMENT. Style writes (a transform, an
      opacity) are counted apart; so is the readout's own text, which has to
      change when a new point is crossed; everything else is markup a render
      added, removed or rewrote.
    */
    w.__markup = 0
    w.__text = 0
    w.__styleWrites = 0
    new MutationObserver((list) => {
      for (const m of list) {
        if (m.type === "attributes" && m.attributeName === "style") { w.__styleWrites++; continue }
        const node = m.target.nodeType === 1 ? m.target : m.target.parentElement
        const inReadout = !!(node && node.closest && (node.closest("[data-chart-tooltip]") || node.closest(".recharts-tooltip-wrapper")))
        if (inReadout && (m.type === "characterData" || m.type === "childList")) w.__text++
        else w.__markup++
      }
    }).observe(document.getElementById("app"), { subtree: true, childList: true, attributes: true, characterData: true })
  }

  /** Where the plot is, and the x of every point on it, read from the chart's own drawing. */
  const geometry = (p) => p.evaluate(() => {
    const card = document.querySelector("#card")
    const svg = card.querySelector(".recharts-surface")
    const r = svg.getBoundingClientRect()
    const grid = card.querySelector(".recharts-cartesian-grid-horizontal line")
    const g = grid ? grid.getBoundingClientRect() : r
    return { left: g.left, right: g.right, top: r.top, bottom: r.bottom, y: r.top + r.height * 0.55 }
  })

  const TRACE = ["devtools.timeline", "disabled-by-default-devtools.timeline", "disabled-by-default-devtools.timeline.frame", "toplevel", "blink.user_timing"]

  /** Main thread busy time and frames drawn between two timestamps, from a trace. */
  function readTrace(buf) {
    const { traceEvents } = JSON.parse(Buffer.from(buf).toString("utf8"))
    const main = traceEvents.find((e) => e.name === "thread_name" && e.args?.name === "CrRendererMain")
    const marks = traceEvents.filter((e) => e.name === "sweep-start" || e.name === "sweep-end")
    const t0 = marks.find((e) => e.name === "sweep-start")?.ts
    const t1 = marks.find((e) => e.name === "sweep-end")?.ts
    if (!main || !t0 || !t1) return null
    let busy = 0
    let longTasks = 0
    for (const e of traceEvents) {
      if (e.pid !== main.pid || e.tid !== main.tid || e.ph !== "X" || e.name !== "RunTask") continue
      if (e.ts < t0 || e.ts > t1) continue
      busy += e.dur / 1000
      if (e.dur > 16_000) longTasks++
    }
    const frames = traceEvents.filter((e) => e.name === "DrawFrame" && e.ts >= t0 && e.ts <= t1).length
    return { busy, longTasks, frames, ms: (t1 - t0) / 1000 }
  }

  /**
   * One sweep, left to right, one move a frame. `y` is where it happens: on
   * the plot, or, for the control, on the empty band above the card, where
   * the same input costs what input costs and nothing more.
   */
  async function sweep(p, cdp, input, geo, steps, y = Math.round(geo.y)) {
    const from = geo.left + 4
    const to = geo.right - 4
    const at = (i) => Math.round(from + ((to - from) * i) / (steps - 1))
    const frame = 1000 / 60
    const pace = async (fn) => { const t = performance.now(); await fn(); const left = frame - (performance.now() - t); if (left > 0) await sleep(left) }
    if (input === "mouse") {
      await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: at(0), y })
      await sleep(250)
    } else {
      await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: at(0), y }] })
      await sleep(30)
      await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: at(0) + 12, y }] })
      await sleep(250)
    }
    await p.evaluate(() => { performance.mark("sweep-start"); window.__markup = 0; window.__text = 0; window.__styleWrites = 0; window.__haptics = [] })
    for (let i = 0; i < steps; i++) {
      await pace(() => input === "mouse"
        ? cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: at(i), y })
        : cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: at(i), y }] }))
    }
    await p.evaluate(() => performance.mark("sweep-end"))
    const counts = await p.evaluate(() => ({ markup: window.__markup, text: window.__text, styleWrites: window.__styleWrites, haptics: (window.__haptics || []).length }))
    /* Let go. */
    if (input === "mouse") await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: at(steps - 1), y: Math.round(geo.bottom + 160) })
    else await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] })
    return counts
  }

  const charts = process.env.CHART ? [process.env.CHART] : ["home", "analytics"]
  const inputs = [
    ["mouse", { width: 1280, height: 900 }, 120],
    ["touch", { width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true }, 70],
  ]

  const traced = async (p, fn) => {
    await p.tracing.start({ categories: TRACE })
    const out = await fn()
    await sleep(300)
    return { out, trace: readTrace(await p.tracing.stop()) }
  }

  for (const which of charts) {
    for (const [input, vp, steps] of inputs) {
      const p = await browser.newPage()
      await p.setViewport(vp)
      await p.goto(`${origin}/?chart=${which}`, { waitUntil: "load" })
      await p.waitForSelector("#card .recharts-surface", { timeout: 15000 })
      await p.evaluate(INSTRUMENT)
      await sleep(900)
      const cdp = await p.createCDPSession()
      const geo = await geometry(p)
      const blank = Math.round(geo.top - 90)

      /* The control: the same moves over nothing. */
      const control = await traced(p, () => sweep(p, cdp, input, geo, steps, blank))
      await sleep(300)
      /* Pass one: the cost, traced, with nothing else in the page reading layout. */
      const { out: counts, trace } = await traced(p, () => sweep(p, cdp, input, geo, steps))

      /* Pass two: where things were, frame by frame. */
      await sleep(400)
      await p.evaluate(() => window.__startSampling())
      await sweep(p, cdp, input, geo, steps)
      const afterLeave = []
      for (let k = 0; k < 4; k++) {
        afterLeave.push(await p.evaluate(() => new Promise((r) => requestAnimationFrame(() => {
          const t = window.__tip()
          if (!t) return r(0)
          const s = getComputedStyle(t)
          r(s.display === "none" || s.visibility === "hidden" ? 0 : Number(s.opacity))
        }))))
      }
      const samples = await p.evaluate(() => window.__stopSampling())

      /* SHOTS=<dir>: the chart with the readout up, a third of the way in, for a person to look at. */
      if (process.env.SHOTS) {
        mkdirSync(process.env.SHOTS, { recursive: true })
        const x = Math.round(geo.left + (geo.right - geo.left) * 0.36)
        if (input === "mouse") {
          await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y: Math.round(geo.y) })
        } else {
          await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: x - 30, y: Math.round(geo.y) }] })
          await sleep(30)
          await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y: Math.round(geo.y) }] })
        }
        await sleep(400)
        const card = await p.$("#card")
        await card.screenshot({ path: join(process.env.SHOTS, `${which}-${input}.png`) })
        if (input === "touch") await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] })
      }

      const n = geo.right - geo.left
      const mid = samples.filter((s) => s.px !== null && s.tipX !== null && s.px > geo.left + n * 0.2 && s.px < geo.right - n * 0.2)
      const trail = mid.length ? mid.reduce((a, s) => a + Math.abs(s.tipX - s.px), 0) / mid.length : null
      const points = 30
      const snap = (x) => {
        const k = Math.round(((x - geo.left) / n) * (points - 1))
        return geo.left + (Math.max(0, Math.min(points - 1, k)) / (points - 1)) * n
      }
      const crossed = mid.filter((s) => s.crossX !== null)
      const marker = crossed.length ? crossed.reduce((a, s) => a + Math.abs(s.crossX - snap(s.px)), 0) / crossed.length : null
      if (process.env.FEEL_DEBUG) console.log(JSON.stringify({ geo, samples: crossed.slice(0, 24).map((s) => [Math.round(s.t), s.px, +s.crossX.toFixed(1), +snap(s.px).toFixed(1), s.tipX && +s.tipX.toFixed(1)]) }))
      const per = (v) => +(v / steps).toFixed(3)
      const row = {
        chart: which,
        input,
        moves: steps,
        mainMsPerMove: trace ? per(trace.busy) : null,
        overControlMs: trace && control.trace ? per(trace.busy - control.trace.busy) : null,
        framesPerMove: trace ? +(trace.frames / steps).toFixed(2) : null,
        longTasks: trace ? trace.longTasks : null,
        markupPerMove: +(counts.markup / steps).toFixed(2),
        textWritesPerMove: +(counts.text / steps).toFixed(2),
        styleWritesPerMove: +(counts.styleWrites / steps).toFixed(2),
        haptics: counts.haptics,
        trailPx: trail === null ? null : +trail.toFixed(1),
        markerPx: marker === null ? null : +marker.toFixed(1),
        leaveOpacity: afterLeave.map((o) => +o.toFixed(2)),
      }
      results.push(row)
      console.log(JSON.stringify(row))
      await p.close()
    }
  }
  /*
    A METRIC TAB, AND A SECOND ONE TAPPED MID MOVE, on both charts. The line
    is read every frame; a tab should move it over many frames, and a tap
    while it is still moving should carry on from where it is: the frame
    after the second tap may not jump further than an ordinary frame of the
    move does.
  */
  const switches = []
  for (const which of charts) {
    const p = await browser.newPage()
    await p.setViewport({ width: 1280, height: 900 })
    await p.goto(`${origin}/?chart=${which}`, { waitUntil: "load" })
    await p.waitForSelector("#card .recharts-surface", { timeout: 15000 })
    await sleep(1000)
    await p.evaluate(() => {
      const w = window
      w.__line = () => {
        const path = document.querySelector("#card [data-trend-line]") || document.querySelector("#card path.recharts-area-curve:not([stroke-dasharray])")
        if (!path) return null
        const d = path.getAttribute("d") || ""
        const pts = []
        const re = /([MLC])([^MLCZ]*)/g
        let m
        while ((m = re.exec(d))) {
          const n = (m[2].match(/-?\d*\.?\d+(?:e-?\d+)?/g) || []).map(Number)
          if (m[1] === "C") for (let i = 0; i + 5 < n.length; i += 6) pts.push([n[i + 4], n[i + 5]])
          else for (let i = 0; i + 1 < n.length; i += 2) pts.push([n[i], n[i + 1]])
        }
        return pts
      }
      let run = 0
      w.__sample = (on) => {
        run++
        const mine = run
        if (!on) return w.__frames
        w.__frames = []
        const tick = () => { if (mine !== run) return; w.__frames.push({ t: performance.now(), pts: w.__line() }); requestAnimationFrame(tick) }
        requestAnimationFrame(tick)
      }
    })
    const stepOf = (a, b) => {
      if (!a || !b || a.length !== b.length) return null
      let s = 0
      for (let k = 0; k < a.length; k++) s = Math.max(s, Math.abs(a[k][1] - b[k][1]))
      return s
    }
    /* One tab. */
    await p.evaluate(() => window.__sample(true))
    await p.evaluate(() => window.__metric("revenue"))
    await sleep(900)
    let frames = await p.evaluate(() => window.__sample(false))
    const moving = frames.slice(1).filter((f, i) => (stepOf(frames[i].pts, f.pts) ?? 1) > 0.05).length
    /* And one tapped mid move. */
    await p.evaluate(() => window.__metric("views"))
    await sleep(900)
    await p.evaluate(() => window.__sample(true))
    await p.evaluate(() => window.__metric("revenue"))
    await sleep(200)
    const at = await p.evaluate(() => performance.now())
    await p.evaluate(() => window.__metric("orders"))
    await sleep(900)
    frames = await p.evaluate(() => window.__sample(false))
    const steps = frames.slice(1).map((f, i) => ({ t: f.t, step: stepOf(frames[i].pts, f.pts) }))
    const after = steps.find((s) => s.t > at)
    const ordinary = Math.max(...steps.filter((s) => s.t <= at && s.step !== null).map((s) => s.step))
    const row = { chart: which, tabFramesMoving: moving, jumpAtRetap: after?.step == null ? null : +after.step.toFixed(1), largestOrdinaryStep: +ordinary.toFixed(1) }
    switches.push(row)
    console.log(JSON.stringify(row))
    await p.close()
  }
  results.push({ switches })
  writeFileSync(join(dir, "result.json"), JSON.stringify(results, null, 2))

  if (process.env.EXPECT === "same") {
    let bad = 0
    const expect = (ok, what, got) => { console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`); if (!ok) bad++ }
    for (const input of ["mouse", "touch"]) {
      const h = results.find((r) => r.chart === "home" && r.input === input)
      const a = results.find((r) => r.chart === "analytics" && r.input === input)
      if (!h || !a) continue
      expect(h.markupPerMove === 0 && a.markupPerMove === 0, `${input}: a move changes no markup on either chart, only transforms and the readout's text`, [h.markupPerMove, a.markupPerMove])
      expect(h.trailPx !== null && a.trailPx !== null && h.trailPx < 1 && a.trailPx < 1, `${input}: the readout stays on the pointer on both charts, in the frame it moves`, [h.trailPx, a.trailPx])
      expect(Math.abs(h.markerPx - a.markerPx) < 1.5, `${input}: the crosshair keeps the same distance from its point on both`, [h.markerPx, a.markerPx])
      expect(h.leaveOpacity[0] > 0 && a.leaveOpacity[0] > 0 && h.leaveOpacity[3] < h.leaveOpacity[0] && a.leaveOpacity[3] < a.leaveOpacity[0], `${input}: the readout fades on leaving, on both`, [h.leaveOpacity, a.leaveOpacity])
      expect(h.longTasks === 0 && a.longTasks === 0, `${input}: no task over a frame during the sweep`, [h.longTasks, a.longTasks])
    }
    for (const s of switches) {
      expect(s.tabFramesMoving >= 20, `${s.chart}: a tab moves the line over many frames, not one`, s.tabFramesMoving)
      expect(s.jumpAtRetap !== null && s.jumpAtRetap <= s.largestOrdinaryStep * 1.25 + 1, `${s.chart}: a tab tapped mid move carries on from where the line is`, { jump: s.jumpAtRetap, ordinary: s.largestOrdinaryStep })
    }
    if (bad) process.exitCode = 1
  }
} finally {
  await browser?.close()
  server?.close()
  if (!process.env.KEEP) rmSync(dir, { recursive: true, force: true })
}
