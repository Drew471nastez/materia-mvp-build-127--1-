/**
 * ===========================================================================
 *  A SIDEBAR CONTROL CHANGED, AND THE CANVAS THAT FOLLOWS IT, ON A LONG PAGE
 * ===========================================================================
 * The owner, round 34: "when adjusting things in the sidebar, when I adjust
 * sliders or change colors, should feel smooth clean ... real time".
 *
 * The real editor (scripts/render-editor-probe.tsx through
 * scripts/editor-probe-harness.mjs, production React, nothing about the
 * editor stubbed) with a home page of 44 sections, most of them with
 * pictures, at 1280x900, driven with real input over the devtools protocol,
 * the CPU at full speed and slowed 4x. For each interaction:
 *
 *   INPUT       the longest Event Timing entry of the interaction: from the
 *               input to the next frame painted after its handlers (what
 *               INP reports), for presses and keys
 *   CANVAS      from each value a control took to the first change on the
 *               canvas after it (a mutation under #wb-preview-root, read in
 *               the next frame): p50 and p95, for drags and typing
 *   RENDERS     component renders, read from the fibers through the devtools
 *               hook, per change: the editor component, the canvas, and the
 *               section renderers (which ones, by type)
 *   FRAMES      frames over 33ms, and the longest, while it ran
 *   LONG TASKS  main thread tasks over 50ms, the longest
 *   REQUESTS    fetches the editor made while it ran (a save is counted
 *               apart: autosave is meant to run once after an edit)
 *
 *   node scripts/check-editor-live-edit.mjs
 *   CPU=4 node scripts/check-editor-live-edit.mjs     only the slowed run
 *   EDITOR_BUNDLE=<file>  reuse a bundle (one from another commit, to compare)
 *   JSON=<file>           the numbers as JSON
 *   ONLY=<regexp>         only the interactions whose name matches
 *   TOP=1                 the components rendered most, per interaction
 *   PROFILE=<regexp>      a CPU profile of the interactions whose name matches
 *   TRACE=<regexp>        their style and layout passes, and what forced them
 *   BUDGET=0              report without failing
 */
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { deflateSync } from "node:zlib"
import puppeteer from "puppeteer-core"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const root = process.cwd()
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const BUDGET = process.env.BUDGET !== "0"
const ONLY = process.env.ONLY ? new RegExp(process.env.ONLY, "i") : null
let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : BUDGET ? "FAIL" : "note"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got).slice(0, 300)})`}`)
  if (!ok && BUDGET) broken++
}

/** A real picture, 640x400, so every image on the page decodes and paints like one. */
function picture() {
  const w = 640, h = 400
  const raw = Buffer.alloc((w * 3 + 1) * h)
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0
    for (let x = 0; x < w; x++) {
      const o = y * (w * 3 + 1) + 1 + x * 3
      raw[o] = (x * 255) / w; raw[o + 1] = (y * 255) / h; raw[o + 2] = ((x ^ y) & 255)
    }
  }
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0 })
  const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcTable[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0 }
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]) }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))])
}
const PNG = picture()

/** 44 sections: the header, 42 body sections (most with pictures), the footer. */
const BODY = ["hero_centered", "features_grid", "text_image", "gallery", "proof_testimonials", "image_banner", "faq_accordion", "split_content", "team_members", "logo_bar",
  "cta_image", "media_gallery", "text_rich", "features_cards", "image_comparison", "collection_banner", "about_image", "process_steps", "promo_newsletter", "multirow",
  "features_image", "timeline", "lookbook", "press_mentions", "icon_box", "cta_banner", "media_collage", "hero_split", "stats", "about_founder",
  "proof_logos", "text_columns", "image_section", "testimonials", "pricing", "cta_simple", "promotion_banner", "banner_packery", "social_proof_bar", "faq_columns",
  "newsletter", "about_timeline"]
const PAGE = ["header", ...BODY, "footer"]

/** Installed before the bundle runs: the fiber walk (as check-editor-perf.mjs), Event Timing, long tasks, frames. */
const INIT = String.raw`
(function () {
  var P = window.__le = { commits: 0, lastCommit: 0, counting: false, renders: {}, sectionTypes: {}, longs: [], events: [] }
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
  try { new PerformanceObserver(function (l) { l.getEntries().forEach(function (e) { P.longs.push([e.startTime, e.duration]) }) }).observe({ type: "longtask", buffered: true }) } catch (e) {}
  try { new PerformanceObserver(function (l) { l.getEntries().forEach(function (e) { P.events.push({ name: e.name, start: e.startTime, duration: e.duration, id: e.interactionId || 0, proc: e.processingEnd - e.processingStart, delay: e.processingStart - e.startTime }) }) }).observe({ type: "event", durationThreshold: 16, buffered: true }) } catch (e) {}
})()
`

const TOOLS = String.raw`
window.__lt = (function () {
  var P = window.__le
  var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms) }) }
  var frame = function () { return new Promise(function (r) { requestAnimationFrame(function () { r() }) }) }
  function text(el) { return (el.textContent || "").replace(/\s+/g, " ").trim() }
  function side() { return document.querySelector("[data-wb-sidebar-scroll]") }
  var w = null
  /* A window of measurement: renders, events, long tasks, frames, canvas changes, fetches. */
  function start() {
    P.counting = true
    P.renders = {}
    P.sectionTypes = {}
    var canvas = document.getElementById("wb-preview-root")
    w = { c0: P.commits, l0: P.longs.length, e0: P.events.length, t0: performance.now(), calls0: (window.probeCalls || []).length, frames: [], changes: [], values: [], on: true }
    var dirty = false
    w.mo = new MutationObserver(function (list) {
      for (var i = 0; i < list.length; i++) {
        var t = list[i].target
        var el = t.nodeType === 1 ? t : t.parentElement
        /* The canvas's own overlays (the hover ring, the toolbar) are not the page. */
        if (el && (el.closest("[data-section-box]") || el.hasAttribute("data-storelib-theme"))) { dirty = true; return }
      }
    })
    if (canvas) w.mo.observe(canvas, { attributes: true, childList: true, subtree: true, characterData: true })
    var prev = null
    function tick(ts) {
      if (!w || !w.on) return
      if (prev !== null) w.frames.push(ts - prev)
      prev = ts
      if (dirty) { w.changes.push(performance.now() - w.t0); dirty = false }
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  }
  /* A control took a value now (a slider's thumb moved, a key went in). */
  function value() { if (w) w.values.push(performance.now() - w.t0) }
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
  function pct(a, p) { if (!a.length) return null; var s = a.slice().sort(function (x, y) { return x - y }); return Math.round(s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]) }
  function stop() {
    w.on = false
    w.mo.disconnect()
    P.counting = false
    var longs = P.longs.slice(w.l0).filter(function (l) { return l[0] >= w.t0 - 5 })
    var events = P.events.slice(w.e0).filter(function (e) { return e.start >= w.t0 - 5 && e.id > 0 })
    var r = P.renders, total = 0
    function sum(re) { var n = 0; for (var k in r) if (re.test(k)) n += r[k]; return n }
    for (var k in r) total += r[k]
    var top = Object.keys(r).sort(function (a, b) { return r[b] - r[a] }).slice(0, 14).map(function (k) { return k + ":" + r[k] })
    /* From each value to the first canvas change at or after it. */
    var wait = []
    for (var i = 0; i < w.values.length; i++) {
      var v = w.values[i]
      for (var j = 0; j < w.changes.length; j++) if (w.changes[j] >= v) { wait.push(w.changes[j] - v); break }
    }
    var calls = (window.probeCalls || []).slice(w.calls0)
    var saves = calls.filter(function (c) { return /^(PUT|POST|PATCH) /.test(c) })
    var worstEvent = events.reduce(function (a, e) { return e.duration > a.duration ? e : a }, { duration: 0, name: "" })
    return {
      commits: P.commits - w.c0,
      renders: total,
      /* esbuild numbers a second function of the same name (EditorCanvasPage2): both are counted. */
      editor: sum(/^StoreEditorPage\d*$/),
      canvas: sum(/^EditorCanvasPage\d*$/),
      sections: r.SectionRendererInner || 0,
      sectionTypes: P.sectionTypes,
      top: top,
      input: Math.round(worstEvent.duration),
      inputName: worstEvent.name,
      inputP75: pct(events.map(function (e) { return e.duration }), 75),
      values: w.values.length,
      canvasDraws: w.changes.length,
      waitP50: pct(wait, 50),
      waitP95: pct(wait, 95),
      frames: w.frames.length,
      framesOver33: w.frames.filter(function (f) { return f > 33.4 }).length,
      worstFrame: w.frames.length ? Math.round(Math.max.apply(null, w.frames)) : 0,
      longTasks: longs.length,
      longest: longs.length ? Math.round(Math.max.apply(null, longs.map(function (l) { return l[1] }))) : 0,
      fetches: calls.length - saves.length,
      saves: saves.length,
      calls: calls.slice(0, 6),
    }
  }
  function tab(name) {
    var all = document.querySelectorAll("[role=tablist][aria-label=Sidebar] [role=tab]")
    for (var i = 0; i < all.length; i++) if (text(all[i]) === name) return all[i]
    return null
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
  function centre(el) {
    el.scrollIntoView({ block: "center" })
    var r = el.getBoundingClientRect()
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), left: r.left, right: r.right, top: r.top, bottom: r.bottom }
  }
  function sectionBox(type) { return document.querySelector("#wb-preview-root [data-section-box][data-section-type='" + type + "']") }
  function byText(re, scope) {
    var all = (scope || document).querySelectorAll("button, [role=button]")
    for (var i = 0; i < all.length; i++) if (re.test(text(all[i])) && all[i].getClientRects().length) return all[i]
    return null
  }
  /* Where the sidebar's panel is, by its scroll and the field that has focus: a switch of panels must not lose either. */
  function sidebarState() {
    var s = side()
    var a = document.activeElement
    return { scroll: s ? s.scrollTop : null, focus: a ? (a.tagName + (a.getAttribute("aria-label") ? "[" + a.getAttribute("aria-label") + "]" : "")) : null }
  }
  return { start: start, stop: stop, quiet: quiet, value: value, sleep: sleep, frame: frame, side: side, tab: tab, sliders: sliders, headingInput: headingInput, sw: sw, centre: centre, sectionBox: sectionBox, byText: byText, text: text, sidebarState: sidebarState }
})()
true
`

/* Self and total time by function, for PROFILE=<interaction>. */
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
  console.log("    SELF\n" + top(self, 25) + "\n    TOTAL\n" + top(total, Number(process.env.PROFILE_N ?? 50)))
}

/* TRACE=<interaction>: the main thread by event, and the biggest style and layout passes with the script that forced each. */
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
    for (const b of big.filter((e) => e.name === "UpdateLayoutTree").slice(0, 2)) {
      const near = ev.filter((e) => /Invalidation/.test(e.name) && e.ts <= b.ts && e.ts > b.ts - 400000)
      const kinds = new Map()
      for (const e of near) { const d = e.args?.data ?? {}; const k = `${e.name.replace("InvalidationTracking", "")} ${d.reason ?? ""} ${(d.nodeName ?? "").slice(0, 70)} ${JSON.stringify(d.invalidatedSelectorId ?? d.selectors ?? d.changedAttribute ?? d.changedClass ?? d.changedPseudo ?? d.changedId ?? "").slice(0, 160)}`; kinds.set(k, (kinds.get(k) ?? 0) + 1) }
      console.log(`      recalc ${(b.dur / 1000).toFixed(1)}ms/${b.args?.elementCount}:\n` + [...kinds].sort((a, c) => c[1] - a[1]).slice(0, 14).map(([k, n]) => `        ${n}x ${k}`).join("\n"))
    }
  }
  for (const e of big) {
    const st = (e.args?.beginData?.stackTrace ?? []).slice(0, 4).map((f) => `${f.functionName || "(anon)"}:${f.lineNumber}`).join(" < ")
    console.log(`      ${e.name === "Layout" ? "layout" : "style "} ${(e.dur / 1000).toFixed(1)}ms/${e.args?.elementCount ?? e.args?.beginData?.dirtyObjects ?? "?"}  ${st || "(in a frame)"}`)
  }
}

async function run(cpu, bundle, css, fonts) {
  const out = mkdtempSync(join(tmpdir(), "live-edit-"))
  writeFileSync(join(out, "editor-probe.js"), readFileSync(bundle))
  const globals = `<script>window.PROBE_PAGES = { home: ${JSON.stringify(PAGE)} }; window.PROBE_PAGE_DELAY_MS = 0</script>`
  writeFileSync(join(out, "index.html"),
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${fonts}</style><style>${css}</style></head><body><div id="app"></div>${globals}<script>window.PROBE_SHORT=false</script><script src="editor-probe.js"></script></body></html>`)
  const browser = await puppeteer.launch({
    executablePath: CHROMIUM, headless: true,
    args: ["--no-sandbox", "--disable-gpu", "--hide-scrollbars", "--allow-file-access-from-files", "--force-device-scale-factor=1",
      "--blink-settings=primaryHoverType=2,availableHoverTypes=2,primaryPointerType=4,availablePointerTypes=4"],
  })
  const report = {}
  const errors = []
  try {
    const page = await browser.newPage()
    page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)))
    await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 })
    await page.evaluateOnNewDocument(INIT)
    await page.setRequestInterception(true)
    page.on("request", (r) => {
      const u = r.url()
      if (u.startsWith("file:") || u.startsWith("data:") || u.startsWith("blob:")) return r.continue()
      if (/\.(png|jpe?g|webp|gif|avif)(\?|$)/i.test(u) || /example\.invalid/.test(u)) return r.respond({ status: 200, contentType: "image/png", body: PNG })
      return r.respond({ status: 200, contentType: "text/plain", body: "" })
    })
    await page.goto(`file://${join(out, "index.html")}`)
    await page.waitForFunction((n) => document.querySelectorAll("#wb-preview-root [data-section-box]").length >= n, { timeout: 120_000, polling: 200 }, PAGE.length - 2)
    /* Quiet: the editor warms the library's pictures in idle time after it opens. */
    await page.evaluate(async () => {
      const P = window.__le
      const t0 = performance.now()
      while (performance.now() - t0 < 30000) {
        await new Promise((r) => setTimeout(r, 200))
        const ll = P.longs.length ? P.longs[P.longs.length - 1][0] + P.longs[P.longs.length - 1][1] : 0
        if (performance.now() - Math.max(ll, P.lastCommit) > 1500) break
      }
    })
    await page.evaluate(TOOLS)
    const sections = await page.evaluate(() => document.querySelectorAll("#wb-preview-root [data-section-box]").length)
    const images = await page.evaluate(() => document.querySelectorAll("#wb-preview-root img").length)
    console.log(`\nCPU ${cpu}x   ${sections} sections on the canvas, ${images} pictures`)
    const cdp = await page.createCDPSession()
    const js = (fn, ...a) => page.evaluate(fn, ...a)
    const clickAt = async (p) => { await page.mouse.move(p.x, p.y); await page.mouse.down(); await sleep(30); await page.mouse.up() }

    const measure = async (name, act, opts = {}) => {
      if (ONLY && !ONLY.test(name)) return null
      await js(() => window.__lt.quiet(400, 8000))
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: cpu })
      const profiling = process.env.PROFILE && new RegExp(process.env.PROFILE, "i").test(name)
      const tracing = process.env.TRACE && new RegExp(process.env.TRACE, "i").test(name)
      if (tracing) await page.tracing.start({ categories: ["devtools.timeline", "disabled-by-default-devtools.timeline", "disabled-by-default-devtools.timeline.stack", ...(process.env.TRACE_INV ? ["disabled-by-default-devtools.timeline.invalidationTracking"] : [])] })
      if (profiling) { await cdp.send("Profiler.enable"); await cdp.send("Profiler.setSamplingInterval", { interval: 200 }); await cdp.send("Profiler.start") }
      await js(() => window.__lt.start())
      let note
      try { note = await act() } catch (e) { note = `threw: ${String(e).slice(0, 120)}` }
      await js((q) => window.__lt.quiet(q, 12000), opts.quiet ?? 600)
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 })
      const m = await js(() => window.__lt.stop())
      if (profiling) printProfile((await cdp.send("Profiler.stop")).profile)
      if (tracing) printTrace(JSON.parse(Buffer.from(await page.tracing.stop()).toString("utf8")).traceEvents)
      if (note !== undefined && note !== true) m.note = note
      m.perChange = opts.changes ? { editor: +(m.editor / opts.changes).toFixed(1), sections: +(m.sections / opts.changes).toFixed(1) } : null
      report[name] = m
      const wait = m.values ? `  canvas p50 ${m.waitP50}ms p95 ${m.waitP95}ms (${m.canvasDraws} draws for ${m.values} values)` : ""
      console.log(`  ${name.padEnd(26)} input ${String(m.input).padStart(4)}ms (${m.inputName || "-"})${wait}  renders ${m.renders} (editor ${m.editor}, canvas ${m.canvas}, sections ${m.sections})  frames>33 ${m.framesOver33}/${m.frames} worst ${m.worstFrame}ms  long ${m.longTasks} max ${m.longest}ms  fetches ${m.fetches} saves ${m.saves}${m.note ? `  [${m.note}]` : ""}`)
      if (process.env.TOP) console.log(`      ${m.top.join("  ")}\n      sections by type: ${JSON.stringify(m.sectionTypes)}`)
      return m
    }

    /* A slider dragged across and back, a move every 8ms (a 120Hz pointer), each thumb move marked as a value. */
    const dragSlider = async (s) => {
      await js(() => {
        const thumbs = [...document.querySelectorAll("[data-slot='slider-thumb']")]
        window.__thumbObs = new MutationObserver(() => window.__lt.value())
        for (const t of thumbs) window.__thumbObs.observe(t, { attributes: true, attributeFilter: ["aria-valuenow"] })
      })
      await page.mouse.move(s.tx, s.ty)
      await page.mouse.down()
      const N = 80
      const a = s.left + 2, b = s.right - 2
      for (let k = 0; k <= N; k++) {
        const f = k / N
        const x = f < 0.5 ? s.tx + (b - s.tx) * (f * 2) : b + (a - b) * ((f - 0.5) * 2)
        await page.mouse.move(x, s.ty)
        await sleep(8)
      }
      await page.mouse.up()
      await js(() => window.__thumbObs.disconnect())
    }
    const sliderBox = (re) => js(async (src) => {
      const all = window.__lt.sliders()
      const i = all.findIndex((x) => new RegExp(src, "i").test(x.label))
      if (i < 0) return { none: all.map((x) => x.label) }
      const el = all[i].el
      el.scrollIntoView({ block: "center" })
      await window.__lt.frame(); await window.__lt.frame()
      const t = el.querySelector("[data-slot='slider-thumb']").getBoundingClientRect()
      const r = el.getBoundingClientRect()
      return { label: all[i].label, tx: t.left + t.width / 2, ty: t.top + t.height / 2, left: r.left, right: r.right }
    }, re)

    /* ── Opening a section's settings: a click on it in the canvas ── */
    const hero = await js(() => { const b = window.__lt.sectionBox("hero_centered"); if (!b) return null; const r = b.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + Math.min(40, r.height / 2)) } })
    await measure("open section settings", async () => { await clickAt(hero); await sleep(300) })
    await sleep(400)
    /* Another section, then the hero again: the press once the page has been pressed before. */
    const boxAt = (type) => js((t) => { const b = window.__lt.sectionBox(t); if (!b) return null; b.scrollIntoView({ block: "center" }); const r = b.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + Math.min(40, r.height / 2)) } }, type)
    const feat = await boxAt("features_grid")
    if (feat) await measure("open another section", async () => { await clickAt(feat); await sleep(300) })
    await sleep(400)
    const heroAgain = await boxAt("hero_centered")
    await clickAt(heroAgain)
    await sleep(800)

    /* ── A spacing slider on that section ── */
    const pad = await sliderBox("padding")
    if (pad.none) expect(false, "the hero has a padding slider", pad.none)
    else await measure("drag section padding", async () => { await dragSlider(pad); return pad.label }, { quiet: 900, changes: 81 })

    /* ── Typing in the heading ── */
    const input = await js(() => { const i = window.__lt.headingInput(); if (!i) return null; i.scrollIntoView({ block: "center" }); const r = i.getBoundingClientRect(); return { x: r.left + r.width - 8, y: r.top + r.height / 2 } })
    if (!input) expect(false, "the hero's heading field is there")
    else {
      await clickAt(input)
      await page.keyboard.press("End")
      await sleep(300)
      await measure("type 20 keys", async () => {
        await js(() => { window.__keyObs = (e) => window.__lt.value(); document.addEventListener("input", window.__keyObs, true) })
        await page.keyboard.type(" and twenty more!!ab", { delay: 60 })
        await js(() => document.removeEventListener("input", window.__keyObs, true))
        return await js(() => document.activeElement && document.activeElement.tagName)
      }, { quiet: 900, changes: 20 })
      await js(() => { const a = document.activeElement; if (a && a.blur) a.blur() })
    }

    /* ── A switch on the section ── */
    const sw = await js(() => { const s = window.__lt.sw(); if (!s) return null; s.scrollIntoView({ block: "center" }); const r = s.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } })
    if (sw) {
      await measure("toggle switch", async () => { await js(() => window.__lt.value()); await clickAt(sw) }, { changes: 1 })
      await clickAt(sw)
      await sleep(500)
    }

    /* ── Switching the sidebar's tabs ── */
    const tabAt = (name) => js((n) => { const t = window.__lt.tab(n); if (!t) return null; const r = t.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } }, name)
    const themeTab = await tabAt("Theme")
    await measure("tab to Theme", async () => { await clickAt(themeTab); await sleep(300) })
    const sectionsTab = await tabAt("Sections")
    await measure("tab to Sections", async () => { await clickAt(sectionsTab); await sleep(300) })
    await clickAt(await tabAt("Theme"))
    await sleep(600)

    /* ── Theme › Layout: a slider every section reads ── */
    const layout = await js(() => { const b = window.__lt.byText(/^Layout/, window.__lt.side()); return b ? window.__lt.centre(b) : null })
    if (!layout) expect(false, "Theme has a Layout group")
    else {
      await measure("open theme group", async () => { await clickAt(layout); await sleep(300) })
      await sleep(300)
      const side = await sliderBox("side padding|padding|width")
      if (side.none) expect(false, "Layout has a slider", side.none)
      else await measure("drag theme slider", async () => { await dragSlider(side); return side.label }, { quiet: 900, changes: 81 })
      /* Back to the groups. */
      const back = await js(() => { const b = document.querySelector("[data-theme-group-open] button"); return b ? window.__lt.centre(b) : null })
      if (back) { await clickAt(back); await sleep(500) }
    }

    /* ── Theme › Colors: a scheme colour dragged in the picker ── */
    const colors = await js(() => { const b = window.__lt.byText(/^Colou?rs/, window.__lt.side()); return b ? window.__lt.centre(b) : null })
    if (!colors) expect(false, "Theme has a Colors group")
    else {
      await clickAt(colors)
      await sleep(700)
      const chip = await js(() => { const b = window.__lt.side().querySelector("button[aria-label='Pick color']"); return b ? window.__lt.centre(b) : null })
      if (!chip) expect(false, "Colors has a colour chip")
      else {
        await measure("open colour picker", async () => { await clickAt(chip); await sleep(300) })
        const box = await js(() => { const b = document.querySelector(".cursor-crosshair[data-sheet-no-drag]"); if (!b) return null; const r = b.getBoundingClientRect(); return { left: r.left, top: r.top, w: r.width, h: r.height } })
        if (!box) expect(false, "the picker opened")
        else {
          await measure("drag scheme colour", async () => {
            await js(() => { window.__mv = (e) => { if (e.buttons === 1) window.__lt.value() }; document.addEventListener("pointermove", window.__mv, true) })
            await page.mouse.move(box.left + box.w * 0.2, box.top + box.h * 0.2)
            await page.mouse.down()
            for (let k = 0; k <= 60; k++) {
              const f = k / 60
              await page.mouse.move(box.left + box.w * (0.2 + 0.6 * f), box.top + box.h * (0.2 + 0.5 * Math.sin(f * Math.PI)))
              await sleep(8)
            }
            await page.mouse.up()
            await js(() => document.removeEventListener("pointermove", window.__mv, true))
          }, { quiet: 900, changes: 61 })
        }
        await page.keyboard.press("Escape")
        await sleep(400)
      }
    }
    if (errors.length) console.log(`  page errors: ${errors.slice(0, 3).join(" | ")}`)
    report.errors = errors
    report.sectionsOnPage = sections
    report.pictures = images
  } finally {
    await browser.close()
  }
  return report
}

async function main() {
  const { bundle, css } = await import("./editor-probe-harness.mjs")
  const { interFaces } = await import("./probe-css.mjs")
  const fonts = interFaces(root)
  const all = {}
  for (const cpu of process.env.CPU ? [Number(process.env.CPU)] : [1, 4]) all[cpu] = await run(cpu, bundle, css, fonts)
  if (process.env.JSON) writeFileSync(process.env.JSON, JSON.stringify(all, null, 2))

  console.log("\nBUDGETS")
  for (const [cpu, r] of Object.entries(all)) {
    const slow = cpu !== "1"
    const has = (k) => r[k] && !r[k].note?.startsWith("threw")
    if (has("drag section padding")) {
      const d = r["drag section padding"]
      expect(d.waitP95 !== null && d.waitP95 <= (slow ? 120 : 50), `${cpu}x section padding: the canvas follows the thumb (p95)`, { p50: d.waitP50, p95: d.waitP95 })
      expect(d.editor <= 3, `${cpu}x section padding: the editor renders once for the drag, not once per move`, { editor: d.editor })
      expect(d.sections <= d.values + 6, `${cpu}x section padding: only the section being changed renders`, d.sectionTypes)
      expect(d.fetches === 0, `${cpu}x section padding: nothing fetched while dragging`, d.calls)
    }
    if (has("drag theme slider")) {
      const d = r["drag theme slider"]
      expect(d.waitP95 !== null && d.waitP95 <= (slow ? 120 : 50), `${cpu}x theme slider: the canvas follows the thumb (p95)`, { p50: d.waitP50, p95: d.waitP95 })
      expect(d.editor <= 3, `${cpu}x theme slider: the editor renders once for the drag`, { editor: d.editor })
    }
    if (has("drag scheme colour")) {
      const d = r["drag scheme colour"]
      expect(d.waitP95 !== null && d.waitP95 <= (slow ? 120 : 50), `${cpu}x scheme colour: the canvas follows the picker (p95)`, { p50: d.waitP50, p95: d.waitP95 })
      expect(d.editor <= 3, `${cpu}x scheme colour: the editor renders once for the drag`, { editor: d.editor })
      expect(d.framesOver33 <= Math.ceil(d.frames * (slow ? 0.25 : 0.1)), `${cpu}x scheme colour: frames over 33ms while dragging`, { over: d.framesOver33, frames: d.frames, worst: d.worstFrame })
    }
    if (has("type 20 keys")) {
      const d = r["type 20 keys"]
      expect(d.waitP95 !== null && d.waitP95 <= (slow ? 120 : 50), `${cpu}x typing: each key is on the canvas soon after (p95)`, { p50: d.waitP50, p95: d.waitP95 })
      expect(d.input <= (slow ? 200 : 100), `${cpu}x typing: the longest key to the next frame`, { input: d.input })
    }
    for (const k of ["toggle switch", "tab to Theme", "tab to Sections", "open theme group", "open section settings", "open another section", "open colour picker"]) {
      if (!has(k)) continue
      expect(r[k].input <= (slow ? 200 : 100), `${cpu}x ${k}: the press to the next frame`, { input: r[k].input, name: r[k].inputName })
    }
  }
  console.log(`\n${broken ? `${broken} over budget` : "all within budget"}`)
  process.exit(broken ? 1 : 0)
}
main().catch((e) => { console.error(e); process.exit(1) })
