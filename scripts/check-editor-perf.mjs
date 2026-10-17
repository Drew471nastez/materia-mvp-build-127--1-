/**
 * ===========================================================================
 *  WHAT THE WEBSITE BUILDER COSTS, INTERACTION BY INTERACTION
 * ===========================================================================
 * The owner: "Perform a deep performance audit of Storelib's website builder
 * editor ... Profile the actual editor first."
 *
 * The real editor (scripts/render-editor-probe.tsx through
 * scripts/editor-probe-harness.mjs, production React, nothing about the
 * editor stubbed), a ten section home page and two more pages, driven with
 * real input over the devtools protocol at 1280x900. For each interaction:
 *
 *   COMMITS     React commits from the input until the page is quiet
 *   RENDERS     component renders in those commits, read from the fibers
 *               themselves through the devtools hook (a component counts
 *               when React ran it: mounted, or PerformedWork on its fiber),
 *               and among them how many times the editor component, the
 *               canvas and a section renderer ran
 *   LONG TASKS  how many main thread tasks went past 50ms, the longest, and
 *               the blocking time (the part of each past 50ms)
 *   WALL        from the input to the last commit
 *
 * Then startup (first canvas paint, quiet, blocking time, requests, API
 * calls and repeats of the same call) and memory after 50 page switches
 * (heap after a forced collection, DOM nodes, listeners).
 *
 *   node scripts/check-editor-perf.mjs
 *   CPU=4 node scripts/check-editor-perf.mjs        the CPU slowed 4x
 *   EDITOR_BUNDLE=<file> node scripts/check-editor-perf.mjs   reuse a bundle (one built from another commit, to compare)
 *   JSON=<file>          also write the numbers as JSON
 *   SWITCHES=50          page switches for the memory run
 */
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const root = process.cwd()
const CPU = Number(process.env.CPU ?? 1)
const SWITCHES = Number(process.env.SWITCHES ?? 50)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAF0lEQVR4nGP8z8Dwn4GBgYGJAQ0AAB5vAQVVB2CvAAAAAElFTkSuQmCC", "base64")

/**
 * Installed before the bundle runs: a devtools hook React injects itself
 * into (it does in production builds too), which walks each commit's fibers
 * the way React DevTools does. A subtree whose child list is the same object
 * as before was not visited in this commit, so it is not walked.
 */
const INIT = String.raw`
(function () {
  var P = window.__perf = { commits: 0, lastCommit: 0, counting: false, renders: {}, sectionTypes: {}, longs: [], firstCanvas: null, canvasReady: null }
  var COMP = { 0: 1, 1: 1, 11: 1, 15: 1 }
  function nameOf(f) {
    var t = f.type
    if (!t) return "?"
    if (f.tag === 11) return t.displayName || (t.render && (t.render.displayName || t.render.name)) || "ForwardRef"
    return t.displayName || t.name || "Anonymous"
  }
  function walk(top) {
    var stack = [top, top.alternate]
    while (stack.length) {
      var p = stack.pop(), n = stack.pop()
      if (COMP[n.tag] && (!p || (n.flags & 1) === 1)) {
        var nm = nameOf(n)
        P.renders[nm] = (P.renders[nm] || 0) + 1
        /* Which sections ran, by type: a change to one section should run that one. */
        if (nm === "SectionRendererInner" && n.memoizedProps && n.memoizedProps.section) { var st = n.memoizedProps.section.type; P.sectionTypes[st] = (P.sectionTypes[st] || 0) + 1 }
      }
      if (p && n.child === p.child) continue
      for (var c = n.child; c; c = c.sibling) stack.push(c, c.alternate)
    }
  }
  window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
    supportsFiber: true, isDisabled: false, renderers: new Map(),
    inject: function (r) { this.renderers.set(1, r); return 1 },
    onCommitFiberRoot: function (id, root) {
      P.commits++
      P.lastCommit = performance.now()
      if (P.counting) { try { walk(root.current) } catch (e) { P.walkError = String(e) } }
    },
    onCommitFiberUnmount: function () {}, onPostCommitFiberRoot: function () {}, checkDCE: function () {},
    on: function () {}, off: function () {}, emit: function () {}, sub: function () { return function () {} },
  }
  try {
    new PerformanceObserver(function (l) { l.getEntries().forEach(function (e) { P.longs.push([e.startTime, e.duration]) }) }).observe({ type: "longtask", buffered: true })
  } catch (e) {}
  /* The first frame with the page's sections drawn and the loader gone. */
  function look() {
    var sc = document.getElementById("wb-preview-root")
    var n = sc ? sc.querySelectorAll("[data-section-box]").length : 0
    if (n >= 1 && P.firstCanvas === null) P.firstCanvas = performance.now()
    var loader = document.querySelector(".wb-canvas-loader:not([data-leaving=true])")
    if (n >= 8 && !loader) { P.canvasReady = performance.now(); return }
    requestAnimationFrame(look)
  }
  requestAnimationFrame(look)
})()
`

/** In the page once it is up: windows of measurement, and the few ways in. */
const TOOLS = String.raw`
window.__pt = (function () {
  var P = window.__perf
  var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms) }) }
  var frame = function () { return new Promise(function (r) { requestAnimationFrame(function () { r() }) }) }
  function text(el) { return (el.textContent || "").replace(/\s+/g, " ").trim() }
  var w = null
  function start() {
    P.counting = true
    P.renders = {}
    P.sectionTypes = {}
    w = { c0: P.commits, l0: P.longs.length, t0: performance.now() }
  }
  /* Until nothing has committed and no long task has run for quietMs. */
  async function quiet(quietMs, capMs) {
    quietMs = quietMs || 500; capMs = capMs || 10000
    var t0 = performance.now()
    while (performance.now() - t0 < capMs) {
      await sleep(100)
      var lastLong = P.longs.length ? P.longs[P.longs.length - 1][0] + P.longs[P.longs.length - 1][1] : 0
      var last = Math.max(P.lastCommit, lastLong, w ? w.t0 : 0)
      if (performance.now() - last >= quietMs) break
    }
  }
  function stop() {
    P.counting = false
    var longs = P.longs.slice(w.l0).filter(function (l) { return l[0] >= w.t0 - 5 })
    var r = P.renders
    var total = 0
    for (var k in r) total += r[k]
    var top = Object.keys(r).sort(function (a, b) { return r[b] - r[a] }).slice(0, 12).map(function (k) { return k + ":" + r[k] })
    return {
      commits: P.commits - w.c0,
      renders: total,
      editor: r.StoreEditorPage || 0,
      canvas: (r.EditorCanvasPage || 0) + (r.EditorCanvasPage2 || 0),
      sections: r.SectionRendererInner || 0,
      longTasks: longs.length,
      longest: longs.length ? Math.round(Math.max.apply(null, longs.map(function (l) { return l[1] }))) : 0,
      tbt: Math.round(longs.reduce(function (a, l) { return a + Math.max(0, l[1] - 50) }, 0)),
      wall: Math.round(Math.max(P.lastCommit - w.t0, 0)),
      top: top,
      sectionTypes: P.sectionTypes,
    }
  }
  function side() { return document.querySelector("[data-wb-sidebar-scroll]") }
  function sectionBox(type, nth) {
    var all = document.querySelectorAll("#wb-preview-root [data-section-box][data-section-type='" + type + "']")
    return all[nth || 0] || null
  }
  function centreOf(el, dy) {
    var sc = document.getElementById("wb-preview-root")
    var r0 = el.getBoundingClientRect(), s = sc.getBoundingClientRect()
    if (r0.top < s.top + 40 || r0.top > s.bottom - 200) sc.scrollTop += r0.top - s.top - 120
    var r = el.getBoundingClientRect()
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + Math.min(dy || 40, r.height / 2)) }
  }
  function sliders() {
    var out = []
    document.querySelectorAll("[data-slot='slider']").forEach(function (s) {
      if (s.closest("#wb-preview-root") || !s.getClientRects().length) return
      var label = ""
      for (var p = s.parentElement; p && p !== document.body && !label; p = p.parentElement) {
        var l = p.querySelector("label, p, span")
        if (l && !s.contains(l) && text(l)) label = text(l)
      }
      out.push({ el: s, label: label })
    })
    return out
  }
  function headingInput() {
    var s = side()
    if (!s) return null
    var all = s.querySelectorAll("input[type=text], input:not([type]), textarea")
    for (var i = 0; i < all.length; i++) if (/^Section \d+:/.test(all[i].value || "")) return all[i]
    return null
  }
  function sw() {
    var s = side()
    if (!s) return null
    var all = s.querySelectorAll("button[role=switch]")
    for (var i = 0; i < all.length; i++) if (all[i].getClientRects().length) return all[i]
    return null
  }
  function toolbarButton(label) {
    var all = document.querySelectorAll("button[aria-label='" + label + "']")
    for (var i = 0; i < all.length; i++) if (!all[i].closest("[data-wb-sidebar-scroll]") && all[i].getClientRects().length && !all[i].disabled) return all[i]
    return null
  }
  function pageOpener() {
    var buttons = document.querySelectorAll("button")
    for (var i = 0; i < buttons.length; i++) {
      var t = text(buttons[i])
      if (/ page$/i.test(t) && t.length < 40 && buttons[i].getClientRects().length) return buttons[i]
      if (/^(Home|About|Contact)$/.test(t) && buttons[i].getClientRects().length) return buttons[i]
    }
    return null
  }
  function sectionTypes() {
    return Array.prototype.map.call(document.querySelectorAll("#wb-preview-root [data-section-box]"), function (b) { return b.getAttribute("data-section-type") }).join(",")
  }
  function clickEl(el) {
    var r = el.getBoundingClientRect()
    var o = { bubbles: true, cancelable: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, pointerId: 1, isPrimary: true, button: 0 }
    el.dispatchEvent(new PointerEvent("pointerdown", o)); el.dispatchEvent(new MouseEvent("mousedown", o))
    el.dispatchEvent(new PointerEvent("pointerup", o)); el.dispatchEvent(new MouseEvent("mouseup", o))
    el.dispatchEvent(new MouseEvent("click", o))
  }
  /* A page switch, through the switcher: true once the canvas shows the page asked for. */
  async function switchTo(key, expect) {
    var opener = pageOpener()
    if (!opener) return "no switcher"
    clickEl(opener)
    for (var i = 0; i < 30 && !document.querySelector("[data-page-row='" + key + "']"); i++) await sleep(50)
    var row = document.querySelector("[data-page-row='" + key + "']")
    if (!row) return "no row " + key
    clickEl(row)
    for (var j = 0; j < 100; j++) {
      await frame()
      if (sectionTypes().indexOf(expect) >= 0) return true
      await sleep(30)
    }
    return "never arrived"
  }
  return { start: start, stop: stop, quiet: quiet, sleep: sleep, frame: frame, side: side, sectionBox: sectionBox, centreOf: centreOf, sliders: sliders, headingInput: headingInput, sw: sw, toolbarButton: toolbarButton, switchTo: switchTo, sectionTypes: sectionTypes, clickEl: clickEl }
})()
true
`

/* Pages the switcher offers: home is the probe's ten sections, these are short and different. */
const GLOBALS = `<script>
window.PROBE_PAGES = { about: ["about_image", "about_timeline", "text_rich", "footer"], contact: ["contact_form", "faq_accordion", "footer"] }
window.PROBE_PAGE_DELAY_MS = 40
</script>`

/* Self and total time by function, for PROFILE=<interaction>: where the time in a slow one goes. */
function printProfile(profile) {
  const byId = new Map(profile.nodes.map((n) => [n.id, n]))
  const parent = new Map()
  for (const n of profile.nodes) for (const c of n.children ?? []) parent.set(c, n.id)
  const dt = new Map()
  profile.samples.forEach((id, k) => dt.set(id, (dt.get(id) ?? 0) + (profile.timeDeltas[k] ?? 0)))
  const self = new Map(), total = new Map()
  const name = (n) => `${n.callFrame.functionName || "(anon)"}:${n.callFrame.lineNumber}`
  for (const [id, us] of dt) {
    const n = byId.get(id)
    if (/^\((idle|program|garbage collector)\)/.test(n.callFrame.functionName)) continue
    self.set(name(n), (self.get(name(n)) ?? 0) + us)
    const seen = new Set()
    for (let cur = id; cur !== undefined; cur = parent.get(cur)) {
      const nm = name(byId.get(cur))
      if (seen.has(nm)) continue
      seen.add(nm)
      total.set(nm, (total.get(nm) ?? 0) + us)
    }
  }
  const top = (m, n) => [...m].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => `      ${(v / 1000).toFixed(1).padStart(7)}ms  ${k}`).join("\n")
  console.log("    SELF\n" + top(self, 20) + "\n    TOTAL\n" + top(total, Number(process.env.PROFILE_N ?? 45)))
}

/* TRACE=<interaction>: the main thread's time by event, and the biggest style and layout passes. */
function printTrace(ev) {
  const mains = ev.filter((e) => e.name === "thread_name" && e.args?.name === "CrRendererMain")
  const busy = (m) => ev.reduce((a, e) => a + (e.ph === "X" && e.pid === m.pid && e.tid === m.tid ? e.dur ?? 0 : 0), 0)
  const main = mains.sort((a, b) => busy(b) - busy(a))[0]
  const on = (e) => e.ph === "X" && e.dur && (!main || (e.pid === main.pid && e.tid === main.tid))
  const sum = new Map(), count = new Map()
  for (const e of ev) if (on(e)) { sum.set(e.name, (sum.get(e.name) ?? 0) + e.dur); count.set(e.name, (count.get(e.name) ?? 0) + 1) }
  console.log([...sum].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, v]) => `      ${(v / 1000).toFixed(0).padStart(6)}ms  x${count.get(k)}  ${k}`).join("\n"))
  const big = ev.filter((e) => on(e) && (e.name === "UpdateLayoutTree" || e.name === "Layout")).sort((a, b) => b.dur - a.dur).slice(0, 8)
  if (process.env.TRACE_INV) {
    for (const b of big.filter((e) => e.name === "UpdateLayoutTree").slice(0, 3)) {
      const near = ev.filter((e) => /Invalidation/.test(e.name) && e.ts <= b.ts && e.ts > b.ts - 100000)
      const kinds = new Map()
      for (const e of near) { const d = e.args?.data ?? {}; const st = (d.stackTrace ?? []).slice(0, 3).map((f) => `${f.functionName}:${f.lineNumber}`).join("<"); const k = `${e.name.replace("TrackingInvalidation", "").replace("InvalidationTracking", "")} ${d.reason ?? ""} ${(d.nodeName ?? "").slice(0, 60)} ${JSON.stringify(d.invalidatedSelectorId ?? d.selectors ?? d.changedAttribute ?? d.changedClass ?? d.changedPseudo ?? d.changedId ?? "").slice(0, 120)} ${st}`; kinds.set(k, (kinds.get(k) ?? 0) + 1) }
      console.log(`      recalc ${(b.dur / 1000).toFixed(1)}ms/${b.args?.elementCount}:\n` + [...kinds].sort((a, c) => c[1] - a[1]).slice(0, 10).map(([k, n]) => `        ${n}x ${k}`).join("\n"))
    }
  }
  console.log("      biggest: " + big.map((e) => `${e.name === "Layout" ? "layout" : "style"} ${(e.dur / 1000).toFixed(1)}ms/${e.args?.elementCount ?? e.args?.beginData?.dirtyObjects ?? "?"}`).join("  "))
}

async function main() {
  const { bundle, css } = await import("./editor-probe-harness.mjs")
  const { interFaces } = await import("./probe-css.mjs")
  const out = mkdtempSync(join(tmpdir(), "editor-perf-"))
  writeFileSync(join(out, "editor-probe.js"), readFileSync(bundle))
  writeFileSync(join(out, "index.html"),
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${interFaces(root)}</style><style>${css}</style></head><body><div id="app"></div>${GLOBALS}<script>window.PROBE_SHORT=false</script><script src="editor-probe.js"></script></body></html>`)
  console.log(`bundle: ${bundle} (${(readFileSync(bundle).length / 1024 / 1024).toFixed(2)}MB unminified)`)

  const browser = await puppeteer.launch({
    executablePath: CHROMIUM, headless: true,
    args: ["--no-sandbox", "--disable-gpu", "--hide-scrollbars", "--allow-file-access-from-files", "--force-device-scale-factor=1",
      "--enable-precise-memory-info", "--js-flags=--expose-gc",
      "--blink-settings=primaryHoverType=2,availableHoverTypes=2,primaryPointerType=4,availablePointerTypes=4"],
  })
  const report = { cpu: CPU }
  let broken = 0
  try {
    const page = await browser.newPage()
    const errors = []
    page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)))
    await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 })
    const cdp = await page.createCDPSession()
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU })
    await page.evaluateOnNewDocument(INIT)
    await page.setRequestInterception(true)
    const requests = []
    page.on("request", (r) => {
      const u = r.url()
      requests.push({ t: Date.now(), type: r.resourceType(), url: u.slice(0, 120) })
      if (u.startsWith("file:") || u.startsWith("data:") || u.startsWith("blob:")) return r.continue()
      if (/\.(png|jpe?g|webp|gif|avif)(\?|$)/i.test(u) || /example\.invalid/.test(u)) return r.respond({ status: 200, contentType: "image/png", body: PNG })
      return r.respond({ status: 200, contentType: "text/plain", body: "" })
    })
    const t0 = Date.now()
    await page.goto(`file://${join(out, "index.html")}`)
    await page.waitForFunction(() => window.__perf && window.__perf.canvasReady !== null, { timeout: 120_000, polling: 100 })
    /* Startup is over when the main thread has been quiet for a second (cap 20s). */
    const startup = await page.evaluate(async () => {
      const P = window.__perf
      const t0 = performance.now()
      while (performance.now() - t0 < 20000) {
        await new Promise((r) => setTimeout(r, 100))
        const ll = P.longs.length ? P.longs[P.longs.length - 1][0] + P.longs[P.longs.length - 1][1] : 0
        if (performance.now() - Math.max(ll, P.lastCommit) > 1000) break
      }
      const ll = P.longs.length ? P.longs[P.longs.length - 1][0] + P.longs[P.longs.length - 1][1] : P.canvasReady
      const quietAt = Math.max(ll, P.canvasReady)
      const longs = P.longs.filter((l) => l[0] <= quietAt)
      const calls = window.probeCalls || []
      const seen = {}
      for (const c of calls) seen[c] = (seen[c] || 0) + 1
      return {
        firstCanvas: Math.round(P.firstCanvas),
        canvasReady: Math.round(P.canvasReady),
        interactive: Math.round(quietAt),
        commits: P.commits,
        longTasks: longs.length,
        longest: longs.length ? Math.round(Math.max(...longs.map((l) => l[1]))) : 0,
        tbt: Math.round(longs.reduce((a, l) => a + Math.max(0, l[1] - 50), 0)),
        apiCalls: calls.length,
        repeated: Object.entries(seen).filter(([, n]) => n > 1).map(([k, n]) => `${n}x ${k.slice(0, 90)}`),
        calls: calls.map((c) => c.slice(0, 100)),
        heapMB: performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) : null,
      }
    })
    const startReq = requests.filter((r) => r.t - t0 < startup.interactive + 500)
    const byType = {}
    for (const r of startReq) byType[r.type] = (byType[r.type] || 0) + 1
    startup.requests = startReq.length
    startup.requestTypes = byType
    report.startup = startup
    console.log(`\nCPU ${CPU}x`)
    console.log(`  startup: first canvas ${startup.firstCanvas}ms, canvas ready ${startup.canvasReady}ms, quiet ${startup.interactive}ms; ${startup.commits} commits; ${startup.longTasks} long tasks (longest ${startup.longest}ms), blocking ${startup.tbt}ms`)
    console.log(`  requests ${startup.requests} ${JSON.stringify(byType)}; API calls ${startup.apiCalls}; repeated: ${startup.repeated.length ? startup.repeated.join("; ") : "none"}`)
    if (process.env.CALLS) console.log(startup.calls.join("\n"))
    await page.evaluate(TOOLS)

    const js = (fn, ...a) => page.evaluate(fn, ...a)
    const measure = async (name, act, opts = {}) => {
      await js(() => window.__pt.quiet(400, 8000))
      const profiling = process.env.PROFILE && new RegExp(process.env.PROFILE, "i").test(name)
      const tracing = process.env.TRACE && new RegExp(process.env.TRACE, "i").test(name)
      if (tracing) await page.tracing.start({ categories: ["devtools.timeline", "disabled-by-default-devtools.timeline", ...(process.env.TRACE_INV ? ["disabled-by-default-devtools.timeline.invalidationTracking", "disabled-by-default-devtools.timeline.stack"] : [])] })
      if (profiling) { await cdp.send("Profiler.enable"); await cdp.send("Profiler.setSamplingInterval", { interval: 200 }); await cdp.send("Profiler.start") }
      await js(() => window.__pt.start())
      const note = await act()
      await js((q) => window.__pt.quiet(q, 10000), opts.quiet ?? 500)
      const m = await js(() => window.__pt.stop())
      if (profiling) printProfile((await cdp.send("Profiler.stop")).profile)
      if (tracing) printTrace(JSON.parse(Buffer.from(await page.tracing.stop()).toString("utf8")).traceEvents)
      if (note !== undefined && note !== true) m.note = note
      report[name] = m
      console.log(`  ${name.padEnd(18)} ${String(m.commits).padStart(4)} commits  ${String(m.renders).padStart(6)} renders (editor ${m.editor}, canvas ${m.canvas}, sections ${m.sections})  long ${m.longTasks} (max ${m.longest}ms) blocking ${m.tbt}ms  wall ${m.wall}ms${m.note ? `  [${m.note}]` : ""}`)
      if (process.env.TOP) console.log(`      ${m.top.join("  ")}\n      sections by type: ${JSON.stringify(m.sectionTypes)}`)
      return m
    }
    const clickAt = async (p) => { await page.mouse.move(p.x, p.y); await page.mouse.down(); await page.mouse.up() }

    /* ── Nobody touching anything: what the editor does by itself once it is open ── */
    await measure("idle 12s after open", async () => { await sleep(12000) }, { quiet: 300 })

    /* ── Selecting sections in the canvas ── */
    const hero = await js(() => { const b = window.__pt.sectionBox("hero_centered"); return b && window.__pt.centreOf(b) })
    if (!hero) { console.log("  no hero on the canvas"); broken++ }
    await measure("select hero", async () => { await clickAt(hero) })
    await sleep(600)
    const feat = await js(() => { const b = window.__pt.sectionBox("features_grid"); return b && window.__pt.centreOf(b, 30) })
    await measure("select another", async () => { await clickAt(feat) })
    await sleep(400)
    const hero2 = await js(() => { const b = window.__pt.sectionBox("hero_centered"); return b && window.__pt.centreOf(b) })
    await clickAt(hero2)
    await sleep(900)

    /* ── A slider dragged 60 steps ── */
    const slider = await js(async () => {
      const all = window.__pt.sliders()
      const i = Math.max(0, all.findIndex((s) => /padding/i.test(s.label)))
      const s = all[i]
      if (!s) return null
      s.el.scrollIntoView({ block: "center" })
      await window.__pt.frame(); await window.__pt.frame()
      const t = s.el.querySelector("[data-slot='slider-thumb']").getBoundingClientRect()
      const r = s.el.getBoundingClientRect()
      return { label: s.label, tx: t.left + t.width / 2, ty: t.top + t.height / 2, left: r.left, right: r.right }
    })
    if (!slider) { console.log("  no slider in the hero's settings"); broken++ }
    else {
      await measure(`slider 60 steps`, async () => {
        await page.mouse.move(slider.tx, slider.ty)
        await page.mouse.down()
        const span = slider.right - 4 - slider.tx
        for (let k = 1; k <= 60; k++) {
          await page.mouse.move(slider.tx + (span * (k <= 30 ? k : 60 - k)) / 30, slider.ty)
          await sleep(16)
        }
        await page.mouse.up()
        return slider.label
      }, { quiet: 800 })
    }

    /* ── Typing into the heading ── */
    const input = await js(() => { const i = window.__pt.headingInput(); if (!i) return null; i.scrollIntoView({ block: "center" }); const r = i.getBoundingClientRect(); return { x: r.left + r.width - 8, y: r.top + r.height / 2 } })
    if (!input) { console.log("  no heading field"); broken++ }
    else {
      await clickAt(input)
      await page.keyboard.press("End")
      await sleep(300)
      await measure("type 20 keys", async () => { await page.keyboard.type(" and twenty more!!", { delay: 45 }); await page.keyboard.type("ab", { delay: 45 }) }, { quiet: 800 })
      await js(() => { const a = document.activeElement; if (a && a.blur) a.blur() })
    }

    /* ── A switch ── */
    const sw = await js(() => { const s = window.__pt.sw(); if (!s) return null; s.scrollIntoView({ block: "center" }); const r = s.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } })
    if (!sw) console.log("  (no switch in the hero's settings)")
    else {
      await measure("toggle switch", async () => { await clickAt(sw) })
      await clickAt(sw)
      await sleep(400)
    }

    /* ── Add (duplicate) and remove a section, from the canvas's toolbar ── */
    const featB = await js(() => { const b = window.__pt.sectionBox("features_grid"); return b && window.__pt.centreOf(b, 30) })
    await clickAt(featB)
    await sleep(700)
    const countBefore = await js(() => document.querySelectorAll("#wb-preview-root [data-section-box]").length)
    await measure("duplicate section", async () => {
      const ok = await js(() => { const b = window.__pt.toolbarButton("Duplicate"); if (!b) return false; b.click(); return true })
      return ok ? undefined : "no Duplicate"
    }, { quiet: 700 })
    const countAfterAdd = await js(() => document.querySelectorAll("#wb-preview-root [data-section-box]").length)
    await sleep(500)
    await measure("delete section", async () => {
      const ok = await js(() => { const b = window.__pt.toolbarButton("Delete"); if (!b) return false; b.click(); return true })
      return ok ? undefined : "no Delete"
    }, { quiet: 700 })
    const countAfterDelete = await js(() => document.querySelectorAll("#wb-preview-root [data-section-box]").length)
    console.log(`      sections ${countBefore} -> ${countAfterAdd} -> ${countAfterDelete}`)
    if (!(countAfterAdd === countBefore + 1 && countAfterDelete === countBefore)) { console.log("  FAIL  duplicate then delete did not add one and take it away"); broken++ }
    await sleep(600)

    /* ── Switching pages ── */
    await measure("switch page", async () => js(() => window.__pt.switchTo("about", "about_image")), { quiet: 700 })
    await sleep(400)
    await measure("switch back", async () => js(() => window.__pt.switchTo("home", "hero_centered")), { quiet: 700 })
    await sleep(600)

    /* ── Memory across page switches ── */
    const heap = async () => {
      await cdp.send("HeapProfiler.enable")
      await cdp.send("HeapProfiler.collectGarbage")
      await sleep(200)
      await cdp.send("HeapProfiler.collectGarbage")
      const h = await cdp.send("Runtime.getHeapUsage")
      const d = await cdp.send("Memory.getDOMCounters")
      return { heapMB: +(h.usedSize / 1048576).toFixed(1), nodes: d.nodes, listeners: d.jsEventListeners, documents: d.documents }
    }
    const m0 = await heap()
    let fails = 0
    const t1 = Date.now()
    for (let i = 0; i < SWITCHES; i++) {
      const to = i % 2 === 0 ? ["contact", "contact_form"] : ["home", "hero_centered"]
      const ok = await js((k, e) => window.__pt.switchTo(k, e), to[0], to[1])
      if (ok !== true) fails++
      await sleep(120)
    }
    if (SWITCHES % 2 === 1) await js(() => window.__pt.switchTo("home", "hero_centered"))
    await js(() => window.__pt.quiet(800, 10000))
    const m1 = await heap()
    report.memory = { switches: SWITCHES, failed: fails, seconds: +((Date.now() - t1) / 1000).toFixed(1), before: m0, after: m1, growthMB: +(m1.heapMB - m0.heapMB).toFixed(1) }
    console.log(`  memory: ${SWITCHES} switches (${fails} failed) in ${report.memory.seconds}s; heap ${m0.heapMB}MB -> ${m1.heapMB}MB (${report.memory.growthMB >= 0 ? "+" : ""}${report.memory.growthMB}MB), DOM nodes ${m0.nodes} -> ${m1.nodes}, listeners ${m0.listeners} -> ${m1.listeners}`)
    if (errors.length) console.log(`  page errors: ${errors.slice(0, 5).join(" | ")}`)
    report.errors = errors
  } finally {
    await browser.close()
  }
  if (process.env.JSON) writeFileSync(process.env.JSON, JSON.stringify(report, null, 2))
  if (broken) { console.log(`\n${broken} part(s) could not be measured`); process.exit(1) }
}

await main()
