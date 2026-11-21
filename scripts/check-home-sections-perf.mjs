/**
 * THE HOME PAGE ON A PHONE, SECTION BY SECTION (landing round 19, the owner:
 * "everything works smooth, clean, optimized, no lags or stutters").
 *
 * scripts/check-marketing-mobile-perf.mjs measures the whole page; this one
 * says where the cost is. Against a running `next start` (BASE): 390x844 at
 * 3x, touch, a phone's user agent, the CPU four times slower; quick touch
 * flicks (CDP touch events, lifted while moving, so the page coasts) from the
 * top to the foot and back up, traced. Every frame (requestAnimationFrame
 * delta) and every trace event is given to the section under the middle of
 * the screen at that moment:
 *   frames    p50, p95, worst, share over 25ms
 *   long      long tasks and their ms
 *   style / layout / paint / layerize / commit   main thread counts and ms
 *   decode    image decodes (and how much on the main thread)
 *   layers    compositor layers drawing content with the section at the top
 *             of the screen, and their bitmap at 3x (an upper estimate)
 *   offRun    running animations more than a screen from the screen there
 * and the top script entries per section, will-change left on at rest, CLS.
 *
 *   BASE=http://127.0.0.1:3000 LABEL=after RUNS=2 node scripts/check-home-sections-perf.mjs
 *
 * Headless Chromium at 4x drops about one frame in ten even on the footer,
 * where nothing runs: compare two builds, section by section, not to zero.
 */
import puppeteer from "puppeteer-core"
import { writeFileSync } from "node:fs"

const BASE = process.env.BASE ?? "http://127.0.0.1:3000"
const LABEL = process.env.LABEL ?? "run"
const RUNS = Number(process.env.RUNS ?? 2)
const OUT = process.env.OUT ?? "/tmp"
const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const pct = (xs, p) => { if (!xs.length) return 0; const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(s.length * p))] }
const r1 = (n) => Math.round(n * 10) / 10
const UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1"

const OBSERVE = () => {
  const w = window
  w.__long = []; w.__shifts = []; w.__frames = null
  new PerformanceObserver((l) => { for (const e of l.getEntries()) w.__long.push({ s: e.startTime, d: e.duration, y: scrollY }) }).observe({ type: "longtask", buffered: true })
  new PerformanceObserver((l) => {
    for (const e of l.getEntries()) {
      if (e.hadRecentInput) continue
      w.__shifts.push({ v: e.value, t: e.startTime, y: scrollY, nodes: (e.sources || []).map((s) => { const n = s.node; const sec = n?.closest?.("[data-lazy-section],[data-home-hero],[data-final-cta]"); return `${n?.nodeName?.toLowerCase?.() ?? "?"}.${String(n?.className?.baseVal ?? n?.className ?? "").slice(0, 30)} in ${sec?.getAttribute("data-lazy-section") ?? (sec ? "hero/cta" : "-")} ${Math.round(s.previousRect.y)}->${Math.round(s.currentRect.y)}` }) })
    }
  }).observe({ type: "layout-shift", buffered: true })
  const raf = w.requestAnimationFrame.bind(w)
  w.__startFrames = () => {
    w.__frames = []
    let last = performance.now()
    const tick = (t) => { if (!w.__frames) return; w.__frames.push([t, t - last, scrollY]); last = t; raf(tick) }
    raf((t) => { last = t; raf(tick) })
  }
  w.__stopFrames = () => { const f = w.__frames; w.__frames = null; return f }
}

// Section boxes in page coordinates, in order.
const SECTIONS = () => {
  const els = [...document.querySelectorAll("[data-home-hero],[data-lazy-section],[data-final-cta],footer")]
  return els.filter((e) => !els.some((o) => o !== e && o.contains(e))).map((e) => {
    const r = e.getBoundingClientRect()
    const name = e.getAttribute("data-lazy-section") || (e.hasAttribute("data-home-hero") ? "hero" : e.hasAttribute("data-final-cta") ? "final-cta" : "footer")
    return { name, top: r.top + scrollY, bottom: r.bottom + scrollY, h: r.height }
  }).filter((s) => s.h > 0)
}

// Running animations at this moment, on screen or not, per section.
const MOTION = () => {
  const COMP = new Set(["transform", "opacity", "translate", "scale", "rotate"])
  const out = []
  for (const a of document.getAnimations()) {
    if (a.playState !== "running") continue
    const el = a.effect?.target
    let props = []
    try { props = a.transitionProperty ? [a.transitionProperty] : [...new Set(a.effect.getKeyframes().flatMap((k) => Object.keys(k)))].filter((p) => !["offset", "easing", "composite", "computedOffset"].includes(p)) } catch {}
    const r = el?.getBoundingClientRect?.()
    const on = r ? r.bottom > 0 && r.top < innerHeight && r.width > 0 : false
    const far = r ? r.bottom < -innerHeight * 1.1 || r.top > innerHeight * 2.1 : true
    const sec = el?.closest?.("[data-lazy-section],[data-home-hero],[data-final-cta]")
    out.push({ name: a.animationName || a.transitionProperty || "waapi", props, bad: props.filter((p) => !COMP.has(p)), on, far, inf: a.effect?.getComputedTiming?.().iterations === Infinity, sec: sec?.getAttribute("data-lazy-section") ?? (sec?.hasAttribute("data-home-hero") ? "hero" : sec ? "final-cta" : "-"), el: `${el?.tagName?.toLowerCase()}.${String(el?.className?.baseVal ?? el?.className ?? "").slice(0, 40)}` })
  }
  return out
}

const STILL = () => [...document.querySelectorAll("*")].filter((e) => { const s = getComputedStyle(e); return s.willChange && s.willChange !== "auto" }).map((e) => {
  const sec = e.closest("[data-lazy-section],[data-home-hero],[data-final-cta]")
  const r = e.getBoundingClientRect()
  return { sec: sec?.getAttribute("data-lazy-section") ?? (sec ? "hero/cta" : "-"), wc: getComputedStyle(e).willChange, el: `${e.tagName.toLowerCase()}.${String(e.className?.baseVal ?? e.className ?? "").slice(0, 40)}`, area: Math.round(r.width * r.height) }
})

async function fling(cdp, dir, dist = 520, steps = 12) {
  // A quick finger flick: down, fast moves, lifted while moving, so the page coasts.
  const y0 = dir > 0 ? 700 : 150
  const at = (y) => [{ x: 195, y, radiusX: 10, radiusY: 10, force: 1, id: 1 }]
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: at(y0) })
  for (let i = 1; i <= steps; i++) { await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: at(y0 - dir * (i * dist) / steps) }); await wait(16) }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] })
}

async function layers(cdp) {
  // Compositor layers drawing content, and their bitmap bytes at 3x (an estimate: w*h*9*4).
  let got = null
  const h = (e) => { got = e.layers }
  cdp.on("LayerTree.layerTreeDidChange", h)
  await cdp.send("LayerTree.enable")
  for (let i = 0; i < 20 && !got; i++) await wait(100)
  await cdp.send("LayerTree.disable")
  cdp.off("LayerTree.layerTreeDidChange", h)
  const L = (got || []).filter((l) => l.drawsContent && !l.invisible)
  return { n: L.length, mb: r1(L.reduce((s, l) => s + Math.min(l.width * l.height, 390 * 3000) * 9 * 4, 0) / 1e6) }
}

async function run(i) {
  const browser = await puppeteer.launch({ executablePath: CHROMIUM, headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] })
  try {
    const page = await browser.newPage()
    await page.setUserAgent(UA)
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true })
    const cdp = await page.createCDPSession()
    await cdp.send("Performance.enable")
    await page.evaluateOnNewDocument(OBSERVE)
    await page.goto(BASE + "/", { waitUntil: "load", timeout: 120000 })
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 })
    await wait(5000)
    try { const b = await page.$("xpath/.//button[contains(., 'Reject all')]"); if (b) { await b.tap(); await wait(500) } } catch {}
    const loadLong = await page.evaluate(() => window.__long.map((l) => l.d))

    await page.tracing.start({ categories: ["devtools.timeline", "disabled-by-default-devtools.timeline", "blink.user_timing", "toplevel", "cc", "disabled-by-default-devtools.timeline.frame", "benchmark", "rail"] })
    await page.evaluate(() => { performance.mark("r19-sync"); window.__sync = performance.now(); window.__startFrames() })
    const longBefore = await page.evaluate(() => window.__long.length)
    // Down, with snapshots of motion along the way.
    const motion = []
    let last = -1, stuck = 0
    for (let k = 0; k < 90; k++) {
      await fling(cdp, 1)
      await wait(260)
      if (k % 3 === 0) motion.push(...(await page.evaluate(MOTION)).map((m) => ({ ...m, y: k })))
      const y = await page.evaluate(() => scrollY)
      if (y === last) { if (++stuck >= 2) break } else stuck = 0
      last = y
    }
    await wait(800)
    const bottomY = await page.evaluate(() => scrollY)
    // Back up.
    last = -1; stuck = 0
    for (let k = 0; k < 90; k++) {
      await fling(cdp, -1)
      await wait(260)
      const y = await page.evaluate(() => scrollY)
      if (y <= 0 || y === last) { if (++stuck >= 2 || y <= 0) break } else stuck = 0
      last = y
    }
    const frames = await page.evaluate(() => window.__stopFrames())
    const sync = await page.evaluate(() => window.__sync)
    const trace = JSON.parse(Buffer.from(await page.tracing.stop()).toString("utf8"))
    const long = await page.evaluate((n) => window.__long.slice(n), longBefore)
    const shifts = await page.evaluate(() => window.__shifts)
    const sections = await page.evaluate(SECTIONS)

    // Static stops: layers and still will-change per section, at each section's top.
    const stops = {}
    for (const s of sections) {
      await page.evaluate((y) => window.scrollTo(0, y), Math.max(0, s.top - 100))
      await wait(900)
      const m = await page.evaluate(MOTION)
      stops[s.name] = { layers: await layers(cdp), offRunning: m.filter((a) => a.far).length, farList: [...new Set(m.filter((a) => a.far).map((a) => `${a.sec}:${a.name}`))].slice(0, 12), onRunning: m.filter((a) => a.on).length, badRunning: m.filter((a) => a.bad.length).map((a) => `${a.sec}:${a.name}[${a.bad}]`) }
    }
    const still = await page.evaluate(STILL)

    // Attribute by time -> scrollY -> section under the screen's middle.
    const ev = trace.traceEvents
    const threads = {}
    for (const e of ev) if (e.name === "thread_name") threads[`${e.pid}:${e.tid}`] = e.args?.name
    const mark = ev.find((e) => e.name === "r19-sync")
    const t0 = mark.ts
    const toPage = (ts) => sync + (ts - t0) / 1000
    const yAt = (t) => { let lo = 0, hi = frames.length - 1; if (!frames.length) return 0; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (frames[m][0] <= t) lo = m; else hi = m - 1 } return frames[lo][2] }
    const secAt = (y) => { const mid = y + 422; const s = sections.find((s) => mid >= s.top && mid < s.bottom); return s ? s.name : "-" }
    const per = {}
    const P = (n) => (per[n] ??= { frames: [], long: [], style: 0, styleMs: 0, layout: 0, layoutMs: 0, paint: 0, paintMs: 0, decode: 0, decodeMs: 0, mainDecodeMs: 0, raster: 0, rasterMs: 0, commitMs: 0, layerizeMs: 0, shifts: 0, js: {} })
    for (const [t, d, y] of frames.slice(2)) P(secAt(y)).frames.push(d)
    for (const l of long) P(secAt(yAt(l.s))).long.push(l.d)
    for (const s of shifts) if (s.t >= sync) P(secAt(s.y)).shifts += s.v
    const main = (e) => threads[`${e.pid}:${e.tid}`] === "CrRendererMain"
    for (const e of ev) {
      if (e.ts < t0 || e.ph === "E") continue
      const dur = (e.dur || 0) / 1000
      const sec = () => P(secAt(yAt(toPage(e.ts))))
      const th = threads[`${e.pid}:${e.tid}`] || ""
      if (e.name === "UpdateLayoutTree" && main(e)) { const p = sec(); p.style++; p.styleMs += dur }
      else if (e.name === "Layout" && main(e)) { const p = sec(); p.layout++; p.layoutMs += dur }
      else if (e.name === "Paint" && main(e)) { const p = sec(); p.paint++; p.paintMs += dur }
      else if (e.name === "Decode Image" || e.name === "ImageDecodeTask") { const p = sec(); p.decode++; p.decodeMs += dur; if (main(e)) p.mainDecodeMs += dur }
      else if (e.name === "RasterTask" && /Raster|Compositor/i.test(th)) { const p = sec(); p.raster++; p.rasterMs += dur }
      else if (e.name === "Commit" && main(e)) sec().commitMs += dur
      else if ((e.name === "FunctionCall" || e.name === "TimerFire" || e.name === "FireAnimationFrame" || e.name === "EventDispatch" || e.name === "FireIdleCallback" || e.name === "V8.Execute") && main(e) && dur > 0) {
        const d = e.args?.data || {}
        const k = `${e.name}:${d.type || ""}:${d.functionName || ""}@${String(d.url || "").split("/").pop()}:${d.lineNumber ?? ""}:${d.columnNumber ?? ""}`
        const js = sec().js; js[k] = (js[k] || 0) + dur
      }
      else if ((e.name === "Layerize" || e.name === "UpdateLayer" || e.name === "PaintArtifactCompositor::Update") && main(e)) sec().layerizeMs += dur
    }
    const out = {}
    for (const s of sections) {
      const p = per[s.name]
      if (!p) { out[s.name] = { h: Math.round(s.h) }; continue }
      const f = p.frames
      out[s.name] = {
        h: Math.round(s.h), frames: f.length, p50: r1(pct(f, 0.5)), p95: r1(pct(f, 0.95)), worst: r1(Math.max(0, ...f)), dropped: f.filter((d) => d > 25).length, droppedPct: f.length ? r1((100 * f.filter((d) => d > 25).length) / f.length) : 0,
        long: p.long.length, longMs: r1(p.long.reduce((a, b) => a + b, 0)),
        style: p.style, styleMs: r1(p.styleMs), layout: p.layout, layoutMs: r1(p.layoutMs), paint: p.paint, paintMs: r1(p.paintMs),
        decode: p.decode, decodeMs: r1(p.decodeMs), mainDecodeMs: r1(p.mainDecodeMs), raster: p.raster, rasterMs: r1(p.rasterMs), commitMs: r1(p.commitMs), layerizeMs: r1(p.layerizeMs),
        cls: r1(p.shifts * 1000) / 1000, js: Object.entries(p.js).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => `${r1(v)} ${k}`),
        ...stops[s.name],
      }
    }
    const allF = frames.slice(2).map((f) => f[1])
    const total = { frames: allF.length, p95: r1(pct(allF, 0.95)), worst: r1(Math.max(...allF)), dropped: allF.filter((d) => d > 25).length, long: long.length, longMs: r1(long.reduce((a, b) => a + b.d, 0)), cls: r1(shifts.reduce((a, s) => a + s.v, 0) * 1000) / 1000, loadLong: loadLong.length, loadLongMs: r1(loadLong.reduce((a, b) => a + b, 0)), bottomY }
    const offInf = motion.filter((m) => m.far && m.inf)
    return { total, out, shifts, still, offInf: [...new Set(offInf.map((m) => `${m.sec}:${m.name}:${m.el}`))], bad: [...new Set(motion.filter((m) => m.bad.length).map((m) => `${m.sec}:${m.name}[${m.bad}]:${m.el}`))] }
  } finally { await browser.close() }
}

const runs = []
for (let i = 0; i < RUNS; i++) runs.push(await run(i))
writeFileSync(`${OUT}/sections-${LABEL}.json`, JSON.stringify(runs, null, 1))
for (const [i, r] of runs.entries()) {
  console.log(`\n== ${LABEL} run ${i + 1}: ${JSON.stringify(r.total)}`)
  console.log("section".padEnd(16), "h     frm  p50  p95  worst drop%  long(ms)    style/ms     layout/ms    paint/ms     decode/ms(main)  raster/ms   commit layerz  cls    layers/MB  offRun")
  for (const [n, s] of Object.entries(r.out)) {
    if (!s.frames) { console.log(n.padEnd(16), s.h); continue }
    console.log(n.padEnd(16), String(s.h).padEnd(5), String(s.frames).padEnd(4), String(s.p50).padEnd(4), String(s.p95).padEnd(5), String(s.worst).padEnd(6), String(s.droppedPct).padEnd(5), `${s.long}(${s.longMs})`.padEnd(11), `${s.style}/${s.styleMs}`.padEnd(12), `${s.layout}/${s.layoutMs}`.padEnd(12), `${s.paint}/${s.paintMs}`.padEnd(12), `${s.decode}/${s.decodeMs}(${s.mainDecodeMs})`.padEnd(16), `${s.raster}/${s.rasterMs}`.padEnd(11), String(s.commitMs).padEnd(6), String(s.layerizeMs).padEnd(6), String(s.cls).padEnd(6), `${s.layers?.n}/${s.layers?.mb}`.padEnd(10), s.offRunning)
  }
  for (const s of r.shifts.filter((s) => s.v > 0.001).slice(0, 8)) console.log(`  shift ${s.v.toFixed(4)} y=${Math.round(s.y)} ${s.nodes.join(" | ")}`)
  console.log(`  infinite off screen: ${r.offInf.length}`); for (const m of r.offInf.slice(0, 20)) console.log("   ", m)
  console.log(`  non-composited running: ${r.bad.length}`); for (const m of r.bad.slice(0, 20)) console.log("   ", m)
  console.log(`  will-change at rest: ${r.still.length}`); for (const m of r.still.slice(0, 40)) console.log("   ", JSON.stringify(m))
}
