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
 * Round V3, the same machine and load for each pair (scratchpad run-after.sh:
 * the bundle before the change, then after, back to back, two runs at 1x and
 * two at 4x). Render counts are exact and repeat; times on this shared
 * machine moved by up to 2x between runs, so a time is claimed only where both
 * runs agree.
 *
 *                               before            after
 *   API calls on open           17 (ai-models 2x) 16, none repeated
 *   type 20 keys, renders (1x)  14,942 / 15,721   14,561 / 14,581
 *     library cards rendered    969 / 1,020       0
 *     sections rendered         77 / 80           60 (the footer no longer, per key)
 *   switch a page, library cards 51               0
 *   toggle / duplicate / delete  4 / 2 / 2        3 / 1 / 1 sections rendered
 *   idle 12s after open (1x)    blocking 1,227 / 1,768ms, 48 / 55 long tasks
 *                                                 758 / 1,092ms, 32 / 41 long tasks
 *   memory, 50 page switches    +0.7 to +0.9MB heap, DOM nodes and listeners flat, before and after
 *
 * Not improved, measured: selecting a section (about 200 to 300ms blocking
 * at 1x, 1.5s at 4x), startup (first canvas 1.2s at 1x, 5 to 6s at 4x) and
 * the slider (already drawn by the live layer). Worse at 1x in both runs: a
 * page switch, blocking 151 / 198ms before and 302 / 434ms after (the first
 * after bundle is this round alone, the second also carries main's merge,
 * nine more library cards); at 4x it was 3,030 / 1,869ms before and 2,259 /
 * 1,997ms after, so it is not settled either way. Every DOM insertion in the
 * editor restyles about 1,180 elements (35 to 45ms at 1x): each of the
 * stylesheet's :has() rules alone is enough, and on a blank page with the
 * same stylesheet the same insertion is 0.3ms, so it is the editor's DOM
 * with those rules. Found, not fixed: the rules are app wide.
 *
 * Round V12, the cause and the fix. Every :has() rule of the stylesheet was
 * tried alone (the rest taken out of the compiled sheet, the same bundle):
 * all of them but two left an insertion at 275 elements, the same as none at
 * all. The two were `html:has([data-account-settings])` and
 * `html:has([data-page="account"])`, a :has() whose SUBJECT is <html>; a
 * :has() on <html> before the element it styles (the pill's rules) costs
 * nothing here. They are classes now (app/globals.css, the account pages
 * keep their width). Same bundle, the stylesheet before and after, two runs
 * each at 1x, "insert one node" below:
 *
 *                               before            after
 *   insert a node, body         54 / 43ms         0.4 / 0.5ms
 *     sidebar                   45 / 46ms         15 / 7.7ms
 *     canvas                    47 / 48ms         2.5 / 1.8ms
 *     elements restyled         1,234 of 2,255    2 (median), 276 at most
 *   select hero, blocking       763 / 316ms       108 / 102ms
 *   select another              155 / 97ms        23 / 4ms
 *   switch page                 303 / 373ms       156 / 19ms
 *   switch back                 255 / 212ms       111 / 3ms
 *   duplicate / delete          6, 44 / 16, 63ms  0 / 0ms
 *   startup, first canvas       2,745 / 1,709ms   2,029 / 1,395ms (noisy: not claimed)
 *   type 20 keys                0ms blocking both, renders unchanged
 *
 * And again after merging V1, V5 and the rest (a fresh bundle, two more
 * pairs): body insert 42 / 46ms -> 0.4 / 0.4ms, 1,234 -> 2 elements; select
 * hero 212 / 283ms -> 135 / 66ms; select another 106 / 132ms -> 0 / 0ms;
 * switch page 268 / 254ms -> 9 / 6ms; switch back 148 / 160ms -> 18 / 0ms;
 * type 20 keys 306 / 205ms -> 0 / 0ms (the warm-up's passes no longer land
 * in it); idle 12s after open 0 / 1,388ms -> 0 / 0ms.
 *
 * The page switch that V3 measured slower is back under its old numbers:
 * the batched preview measurements were each paying the 1,234 element pass.
 * What is left of "select hero" is the first gesture on the page making the
 * ask sounds' AudioContext and its room (lib/website-builder/ask-sounds.ts,
 * about 60ms in the profile, on purpose inside a gesture for iOS), once.
 *
 *   node scripts/check-editor-perf.mjs
 *   CPU=4 node scripts/check-editor-perf.mjs        the CPU slowed 4x
 *   EDITOR_BUNDLE=<file> node scripts/check-editor-perf.mjs   reuse a bundle (one built from another commit, to compare)
 *   STYLESHEET=<file>    a compiled stylesheet instead of this checkout's (scripts/probe-css.mjs output)
 *   PROFILE=<name>       a CPU profile of the interactions whose name matches
 *   TRACE=<name>         the style and layout passes of those; TRACE_INV=1 adds what invalidated them
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
const INIT_RAW = String.raw`
(function () {
  var P = window.__perf = { owners: __OWNERS__ ? {} : null, commits: 0, lastCommit: 0, counting: false, renders: {}, sectionTypes: {}, longs: [], firstCanvas: null, canvasReady: null }
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
        /* OWNERS=1: whose render drew each tooltip and field, by the nearest component of the editor's own above it. */
        if (P.owners && (nm === "Tooltip" || nm === "FieldControl" || nm === "Popper")) {
          var o = n.return, on = "?"
          while (o) { var onm = COMP[o.tag] ? nameOf(o) : ""; if (onm && !/^(Tooltip|Popper|Primitive|Slot|Presence|ForwardRef|Anonymous|Portal|DismissableLayer|Provider|FieldEditor|Collection|DynamicSource|SharedIn|Translation|Sibling)/.test(onm)) { on = onm; break } o = o.return }
          var key = nm + "<" + on
          P.owners[key] = (P.owners[key] || 0) + 1
        }
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
  /* Event Timing: from an input to the frame painted after it (what INP is made of), its wait, and its handlers. */
  P.ev = []
  try {
    new PerformanceObserver(function (l) { l.getEntries().forEach(function (e) { P.ev.push([e.startTime, e.duration, e.name, Math.round(e.processingStart - e.startTime), Math.round(e.processingEnd - e.processingStart)]) }) }).observe({ type: "event", durationThreshold: 16, buffered: true })
  } catch (e) {}
  /* The first frame with the page's sections drawn and the loader gone. */
  function look() {
    var sc = document.getElementById("wb-preview-root")
    var n = sc ? sc.querySelectorAll("[data-section-box]").length : 0
    if (n >= 1 && P.firstCanvas === null) P.firstCanvas = performance.now()
    var loader = document.querySelector(".wb-canvas-loader:not([data-leaving=true])")
    if (n >= 8 && !loader) { P.canvasReady = performance.now(); return }
    /* An imported theme draws in a frame and never reaches eight boxes here: stop looking rather than run a frame loop for ever. */
    if (performance.now() > 60000) return
    requestAnimationFrame(look)
  }
  requestAnimationFrame(look)
})()
`

const INIT = INIT_RAW.replace("__OWNERS__", process.env.OWNERS ? "true" : "false")

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
    if (P.owners) P.owners = {}
    w = { c0: P.commits, l0: P.longs.length, t0: performance.now(), e0: P.ev.length }
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
    /* The slowest input to next paint in the window (one interaction's INP), and the slowest handler. */
    var evs = P.ev.slice(w.e0).filter(function (e) { return e[0] >= w.t0 - 5 && /^(keydown|keyup|keypress|input|beforeinput|pointerdown|pointerup|pointermove|click|mousedown|mouseup|mousemove)$/.test(e[2]) })
    var inp = evs.reduce(function (a, e) { return Math.max(a, e[1]) }, 0)
    var handler = evs.reduce(function (a, e) { return Math.max(a, e[4]) }, 0)
    return {
      inp: Math.round(inp),
      handler: Math.round(handler),
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
      owners: P.owners ? Object.keys(P.owners).sort(function (a, b) { return P.owners[b] - P.owners[a] }).slice(0, 14).map(function (k) { return k + ":" + P.owners[k] }) : null,
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

async function interactions() {
  const harness = await import("./editor-probe-harness.mjs")
  const bundle = harness.bundle
  /* STYLESHEET=<file>: a compiled stylesheet to measure instead of this checkout's (an older one, to compare). */
  const css = process.env.STYLESHEET ? readFileSync(process.env.STYLESHEET, "utf8") : harness.css
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
      console.log(`  ${name.padEnd(18)} ${String(m.commits).padStart(4)} commits  ${String(m.renders).padStart(6)} renders (editor ${m.editor}, canvas ${m.canvas}, sections ${m.sections})  long ${m.longTasks} (max ${m.longest}ms) blocking ${m.tbt}ms  input to paint ${m.inp}ms  wall ${m.wall}ms${m.note ? `  [${m.note}]` : ""}`)
      if (process.env.TOP) console.log(`      ${m.top.join("  ")}\n      sections by type: ${JSON.stringify(m.sectionTypes)}`)
      if (m.owners) console.log(`      drawn by: ${m.owners.join("  ")}`)
      return m
    }
    const clickAt = async (p) => { await page.mouse.move(p.x, p.y); await page.mouse.down(); await page.mouse.up() }

    /* ── Nobody touching anything: what the editor does by itself once it is open ── */
    await measure("idle 12s after open", async () => { await sleep(12000) }, { quiet: 300 })

    /* ── One element added and taken away, and what the style pass after it costs ──
       Every React commit that adds or removes a node pays this, so it is the
       floor under every interaction. Twelve times in each place, a frame
       apart, the style forced at once so the time is that pass alone; the
       trace gives the number of elements the browser restyled for it. */
    await js(() => window.__pt.quiet(400, 8000))
    await page.tracing.start({ categories: ["devtools.timeline", "disabled-by-default-devtools.timeline"] })
    const inserted = await js(async () => {
      const where = {
        sidebar: document.querySelector("[data-wb-sidebar-scroll]"),
        canvas: document.querySelector("#wb-preview-root [data-section-box]"),
        body: document.body,
      }
      const out = {}
      for (const [k, host] of Object.entries(where)) {
        if (!host) { out[k] = null; continue }
        const add = [], remove = []
        for (let i = 0; i < 12; i++) {
          await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)))
          const d = document.createElement("div")
          d.textContent = "x"
          performance.mark(`ins-${k}-${i}`)
          let t0 = performance.now()
          host.appendChild(d)
          void getComputedStyle(d).color
          add.push(performance.now() - t0)
          t0 = performance.now()
          d.remove()
          void getComputedStyle(host).color
          remove.push(performance.now() - t0)
        }
        const med = (a) => +a.slice().sort((x, y) => x - y)[a.length >> 1].toFixed(2)
        out[k] = { add: med(add), remove: med(remove) }
      }
      return out
    })
    {
      const ev = JSON.parse(Buffer.from(await page.tracing.stop()).toString("utf8")).traceEvents
      const counts = ev.filter((e) => e.name === "UpdateLayoutTree" && e.ph === "X" && e.args?.elementCount).map((e) => e.args.elementCount).sort((a, b) => a - b)
      const nodes = await js(() => document.getElementsByTagName("*").length)
      report.insertion = { ...inserted, elementsMedian: counts[counts.length >> 1] ?? 0, elementsMax: counts[counts.length - 1] ?? 0, passes: counts.length, documentElements: nodes }
      const f = (o) => (o ? `${o.add}ms add, ${o.remove}ms remove` : "none")
      console.log(`  insert one node   sidebar ${f(inserted.sidebar)}; canvas ${f(inserted.canvas)}; body ${f(inserted.body)}; restyled per pass median ${report.insertion.elementsMedian}, max ${report.insertion.elementsMax} of ${nodes} elements (${counts.length} passes)`)
    }

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
  all.interactions = report
  return broken
}

/* ───────────────────────────────────────────────────────────────────────────
   SCROLLING THE CANVAS, AND CHANGES ARRIVING FROM OUTSIDE (round perf2-1028)
   ───────────────────────────────────────────────────────────────────────────
   The same editor through scripts/canvas-probe-kit.mjs (served over http, so
   an imported theme's frame loads its own files), on a computer (1280x900, a
   mouse wheel) and on a phone (390x844, a touch screen, a finger's fling
   through Input.synthesizeScrollGesture), with the CPU slowed as CPU says.

   SCROLL   frame intervals while the canvas moves (p50, p95, longest, the
            share of frames dropped), long tasks, React commits, the time the
            page's own scroll, wheel and touch handlers and its Resize,
            Intersection and Mutation observers took during the gesture, the
            wheel and touch listeners that are not passive, and from a trace
            of a second pass the main thread's style, layout (and how many of
            those layouts a script forced) and paint.
   LIVE     a connected agent's edits and a GitHub push, read by the editor's
            own poll of the activity log (render-editor-probe.tsx
            PROBE_ACTIVITY), while a section is open and its heading is being
            typed in: the commits and renders each costs, how many section
            boxes were thrown away, the longest frame, whether the canvas kept
            its scroll, and whether the field being typed in kept its focus
            and its text. And an Ask Storelib run whose edits stream in faster
            than the screen draws.
*/

const SCROLL_INIT = String.raw`
;(function () {
  var P = window.__perf
  if (!P) return
  P.timing = false
  P.frames = []
  P.hTime = {}
  P.obs = { ro: 0, io: 0, mo: 0 }
  P.obsN = { ro: 0, io: 0, mo: 0 }
  P.lis = []
  var WATCHED = { scroll: 1, wheel: 1, mousewheel: 1, touchstart: 1, touchmove: 1 }
  var add = EventTarget.prototype.addEventListener, rem = EventTarget.prototype.removeEventListener
  var wrapped = new WeakMap()
  function where(t) {
    if (t === window) return "window"
    if (t === document) return "document"
    if (t && t.nodeType === 1) return t.tagName.toLowerCase() + (t.id ? "#" + t.id : "") + (t.getAttribute && t.getAttribute("data-section-box") !== null ? "[section]" : "")
    return "other"
  }
  function rootish(t) { return t === window || t === document || t === document.documentElement || t === document.body }
  function keyOf(type, opts) { return type + ((typeof opts === "boolean" ? opts : !!(opts && opts.capture)) ? "1" : "0") }
  EventTarget.prototype.addEventListener = function (type, fn, opts) {
    if (!WATCHED[type] || !fn) return add.call(this, type, fn, opts)
    var key = keyOf(type, opts)
    var m = wrapped.get(fn)
    if (!m) { m = {}; wrapped.set(fn, m) }
    if (!m[key]) {
      var orig = fn
      m[key] = function (e) {
        var call = function (self) { return typeof orig === "function" ? orig.call(self, e) : orig.handleEvent(e) }
        if (!P.timing) return call(this)
        var t0 = performance.now()
        try { return call(this) } finally { P.hTime[type] = (P.hTime[type] || 0) + performance.now() - t0 }
      }
    }
    /* Chrome makes a wheel or touch listener on the window, the document or its root passive unless asked otherwise. */
    var explicit = opts && typeof opts === "object" && "passive" in opts
    var passive = type === "scroll" ? true : explicit ? !!opts.passive : rootish(this)
    P.lis.push([type, passive, where(this)])
    return add.call(this, type, m[key], opts)
  }
  EventTarget.prototype.removeEventListener = function (type, fn, opts) {
    if (WATCHED[type] && fn) {
      var m = wrapped.get(fn)
      var w = m && m[keyOf(type, opts)]
      if (w) return rem.call(this, type, w, opts)
    }
    return rem.call(this, type, fn, opts)
  }
  ;[["ResizeObserver", "ro"], ["IntersectionObserver", "io"], ["MutationObserver", "mo"]].forEach(function (pair) {
    var C = window[pair[0]]
    if (!C) return
    var W = function (cb, o) {
      var timed = function (a, b) {
        if (!P.timing) return cb.call(this, a, b)
        var t0 = performance.now()
        try { return cb.call(this, a, b) } finally { P.obs[pair[1]] += performance.now() - t0; P.obsN[pair[1]]++ }
      }
      return new C(timed, o)
    }
    W.prototype = C.prototype
    window[pair[0]] = W
  })
  var tick = function (t) { if (P.timing) P.frames.push(t); requestAnimationFrame(tick) }
  requestAnimationFrame(tick)
  /* Section boxes thrown away from the canvas (a redraw of the page where one section changed). */
  P.removed = 0
  var watchBoxes = function () {
    var root = document.getElementById("wb-preview-root")
    if (!root) return setTimeout(watchBoxes, 300)
    new (window.MutationObserver)(function (list) {
      if (!P.timing) return
      list.forEach(function (m) { m.removedNodes.forEach(function (n) { if (n.nodeType === 1 && (n.matches("[data-section-box]") || n.querySelector("[data-section-box]"))) P.removed++ }) })
    }).observe(root, { childList: true, subtree: true })
  }
  if (window === window.top) watchBoxes()
  window.__sw = {
    start: function () {
      P.timing = true; P.frames = []; P.hTime = {}; P.obs = { ro: 0, io: 0, mo: 0 }; P.obsN = { ro: 0, io: 0, mo: 0 }; P.removed = 0
      P.counting = true; P.renders = {}; P.sectionTypes = {}
      P.w = { c0: P.commits, l0: P.longs.length, t0: performance.now(), e0: P.ev.length }
    },
    stop: function () {
      P.timing = false; P.counting = false
      var f = [], F = 1000 / 60, dropped = 0
      for (var i = 1; i < P.frames.length; i++) { var d = P.frames[i] - P.frames[i - 1]; f.push(d); dropped += Math.max(0, Math.round(d / F) - 1) }
      var sorted = f.slice().sort(function (a, b) { return a - b })
      var q = function (p) { return sorted.length ? +sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))].toFixed(1) : 0 }
      var longs = P.longs.slice(P.w.l0).filter(function (l) { return l[0] >= P.w.t0 - 5 })
      var r = P.renders, total = 0
      for (var k in r) total += r[k]
      var hTime = {}
      for (var h in P.hTime) hTime[h] = +P.hTime[h].toFixed(1)
      return {
        frames: f.length, p50: q(0.5), p95: q(0.95), max: sorted.length ? Math.round(sorted[sorted.length - 1]) : 0,
        droppedPct: f.length ? Math.round(dropped / (f.length + dropped) * 1000) / 10 : 0,
        longTasks: longs.length, longest: longs.length ? Math.round(Math.max.apply(null, longs.map(function (l) { return l[1] }))) : 0,
        tbt: Math.round(longs.reduce(function (a, l) { return a + Math.max(0, l[1] - 50) }, 0)),
        commits: P.commits - P.w.c0, renders: total, editor: r.StoreEditorPage || 0, sections: r.SectionRendererInner || 0, sectionTypes: P.sectionTypes,
        handlers: hTime, observers: { ro: +P.obs.ro.toFixed(1), io: +P.obs.io.toFixed(1), mo: +P.obs.mo.toFixed(1) }, observerCalls: P.obsN,
        removed: P.removed,
        top: Object.keys(r).sort(function (a, b) { return r[b] - r[a] }).slice(0, 10).map(function (k) { return k + ":" + r[k] }),
      }
    },
    blocking: function () {
      var seen = {}
      return P.lis.filter(function (l) { return !l[1] && l[0] !== "scroll" }).map(function (l) { return l[0] + "@" + l[2] }).filter(function (k) { if (seen[k]) return false; seen[k] = 1; return true })
    },
  }
})()
`

const PHONE = { width: 390, height: 844 }
const DESKTOP = { width: 1280, height: 900 }
const LIVE_GLOBALS = `window.PROBE_ACTIVITY={events:[{id:1000,agent_name:"Claude Code",path:"pages/home",action:"page",detail:{page:"home",ops:[]},created_at:"2026-10-01T00:00:00.000Z"}],syncAt:"2026-10-01T00:00:00.000Z"};window.PROBE_CONNECTIONS={agents:[{name:"Claude Code",kind:"claude"}],github:{repo:"owner/site"},latest:null};`
/* A longer Storelib home page than the kit's, so a fling has somewhere to go: the probe's own ten, the product grid and five more. */
const LONG_HOME = ["header", "hero_centered", "features_grid", "product_grid", "text_rich", "faq_accordion", "proof_testimonials", "text_image", "promo_newsletter", "cta_simple", "gallery", "about_image", "image_banner", "logo_bar", "process_steps", "footer"]
const STORELIB_PAGE = `window.PROBE_PAGES={home:${JSON.stringify(LONG_HOME)},about:["header","text_rich","faq_accordion","cta_simple","footer"]};window.PROBE_PAGE_DELAY_MS=0;window.PROBE_HEADER={links:3};`
const id = (type) => `${type}-${LONG_HOME.indexOf(type)}`

/* Main thread time by kind, from a trace: style, layout (and the layouts a script forced), paint, script. */
function traceSummary(ev) {
  const mains = ev.filter((e) => e.name === "thread_name" && e.args?.name === "CrRendererMain")
  const busy = (m) => ev.reduce((a, e) => a + (e.ph === "X" && e.pid === m.pid && e.tid === m.tid ? e.dur ?? 0 : 0), 0)
  const main = mains.sort((a, b) => busy(b) - busy(a))[0]
  const on = (e) => e.ph === "X" && e.dur && (!main || (e.pid === main.pid && e.tid === main.tid))
  const sum = (names) => +(ev.filter((e) => on(e) && names.includes(e.name)).reduce((a, e) => a + e.dur, 0) / 1000).toFixed(1)
  const layouts = ev.filter((e) => on(e) && e.name === "Layout")
  const forced = layouts.filter((e) => (e.args?.beginData?.stackTrace ?? []).length > 0)
  return {
    style: sum(["UpdateLayoutTree"]),
    layout: sum(["Layout"]),
    layouts: layouts.length,
    forcedLayouts: forced.length,
    forcedBy: [...new Set(forced.map((e) => (e.args.beginData.stackTrace[0] ?? {}).functionName || "(anon)"))].slice(0, 6),
    paint: sum(["Paint", "PaintImage", "PrePaint"]),
    layerize: sum(["Layerize", "UpdateLayer", "CompositeLayers"]),
    script: sum(["FunctionCall", "EventDispatch", "TimerFire", "FireAnimationFrame", "EvaluateScript", "v8.callFunction", "RunMicrotasks"]),
  }
}

async function scrollGesture(ed, cdp, device) {
  const at = await ed.js(() => {
    const el = document.querySelector("[data-compat-frame='front']") ?? document.getElementById("wb-preview-root")
    const r = el.getBoundingClientRect()
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + Math.min(r.height / 2, 300)), h: r.height }
  })
  if (device === "phone") {
    /* A finger's fling down and back, as a phone sends it. */
    for (const dy of [-2600, 2600, -2600]) {
      await cdp.send("Input.synthesizeScrollGesture", { x: at.x, y: at.y, yDistance: dy, speed: 1800, gestureSourceType: "touch", repeatCount: 1 })
      await sleep(250)
    }
  } else {
    await ed.page.mouse.move(at.x, at.y)
    for (const dir of [1, -1, 1]) {
      for (let k = 0; k < 40; k++) { await ed.page.mouse.wheel({ deltaY: 100 * dir }); await sleep(16) }
      await sleep(150)
    }
  }
}

const fmtScroll = (m) => `frames p50 ${m.p50}ms p95 ${m.p95}ms max ${m.max}ms, dropped ${m.droppedPct}%; long ${m.longTasks} (max ${m.longest}ms); ${m.commits} commits; handlers ${JSON.stringify(m.handlers)}; observers ${JSON.stringify(m.observers)}`

async function scrollScenario({ theme, device, bundle, css, cpu }) {
  const { openEditor, importedTheme } = await import("./canvas-probe-kit.mjs")
  const view = device === "phone" ? PHONE : DESKTOP
  const ed = await openEditor({
    kind: theme === "imported" ? "imported" : "native", bundle, css,
    compat: theme === "imported" ? await importedTheme({ store: true }) : undefined,
    globals: theme === "imported" ? LIVE_GLOBALS : STORELIB_PAGE + LIVE_GLOBALS,
    init: INIT + SCROLL_INIT, cpu, width: view.width, height: view.height, touch: device === "phone", settle: 6000,
  })
  try {
    const cdp = await ed.page.createCDPSession()
    if (cpu > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate: cpu })
    await settleQuiet(ed)
    const front = theme === "imported" ? await ed.front() : null
    const docs = front ? [ed.page, front] : [ed.page]
    for (const d of docs) await d.evaluate(() => window.__sw && window.__sw.start())
    /* PROFILE=scroll: where the main thread's time went during the gesture. */
    const profiling = process.env.PROFILE && /scroll/i.test(process.env.PROFILE)
    if (profiling) { await cdp.send("Profiler.enable"); await cdp.send("Profiler.setSamplingInterval", { interval: 200 }); await cdp.send("Profiler.start") }
    await scrollGesture(ed, cdp, device)
    const m = await ed.js(() => window.__sw.stop())
    if (profiling) { console.log(`  profile, scroll ${theme} ${device}`); printProfile((await cdp.send("Profiler.stop")).profile) }
    /* The frame's own handlers and observers (an imported theme's scripts), added to the editor's. */
    if (front) {
      const f = await front.evaluate(() => window.__sw ? window.__sw.stop() : null).catch(() => null)
      if (f) {
        m.frameHandlers = f.handlers
        m.frameObservers = f.observers
        m.frameLongTasks = f.longTasks
      }
    }
    m.blocking = (await Promise.all(docs.map((d) => d.evaluate(() => window.__sw ? window.__sw.blocking() : []).catch(() => [])))).flat()
    /* Again, under a trace, for where the main thread's time went. */
    const inv = process.env.TRACE_INV ? ["disabled-by-default-devtools.timeline.invalidationTracking"] : []
    await ed.page.tracing.start({ categories: ["devtools.timeline", "disabled-by-default-devtools.timeline", "disabled-by-default-devtools.timeline.stack", ...inv] })
    await scrollGesture(ed, cdp, device)
    const events = JSON.parse(Buffer.from(await ed.page.tracing.stop()).toString("utf8")).traceEvents
    m.trace = traceSummary(events)
    /* TRACE=scroll: the main thread by event and the biggest style and layout passes (TRACE_INV=1: what invalidated them). */
    if (process.env.TRACE && /scroll/i.test(process.env.TRACE)) printTrace(events)
    m.errors = ed.errors.slice(0, 5)
    console.log(`  scroll  ${theme.padEnd(8)} ${device.padEnd(7)} ${fmtScroll(m)}`)
    console.log(`          trace: style ${m.trace.style}ms, layout ${m.trace.layout}ms in ${m.trace.layouts} (${m.trace.forcedLayouts} forced${m.trace.forcedBy.length ? ` by ${m.trace.forcedBy.join(", ")}` : ""}), paint ${m.trace.paint}ms, script ${m.trace.script}ms; not passive: ${m.blocking.length ? m.blocking.join(" ") : "none"}${m.frameHandlers ? `; frame handlers ${JSON.stringify(m.frameHandlers)} observers ${JSON.stringify(m.frameObservers)}` : ""}`)
    return m
  } finally {
    await ed.close()
  }
}

/*
  Until React has not committed and no long task has run for two seconds
  (cap 45s): the library's drawing ahead and the first reads are over, so
  what is measured next is the gesture or the change alone. Without this a
  slow CPU measured the warm-up's card batches inside an agent's edit.
*/
async function settleQuiet(ed) {
  return ed.js(async () => {
    const P = window.__perf
    const t0 = performance.now()
    while (performance.now() - t0 < 45000) {
      await new Promise((r) => setTimeout(r, 200))
      const ll = P.longs.length ? P.longs[P.longs.length - 1][0] + P.longs[P.longs.length - 1][1] : 0
      if (performance.now() - Math.max(P.lastCommit, ll) > 2000) break
    }
    return Math.round(performance.now() - t0)
  })
}

/* ── Changes from outside, under an open editor ── */
async function pushActivity(ed, events) {
  await ed.js((evs) => {
    const a = window.PROBE_ACTIVITY
    let n = a.events.length ? a.events[a.events.length - 1].id : 1000
    for (const e of evs) a.events.push({ ...e, id: ++n, created_at: new Date().toISOString() })
  }, events)
}

/* Until `seen()` is true in the page (checked every frame), then until React has been quiet for `quiet` ms. */
async function arrival(ed, seen, arg, cap = 20000) {
  return ed.js(async (src, a, cap) => {
    const test = new Function("a", `return (${src})(a)`)
    const t0 = performance.now()
    let at = null
    while (performance.now() - t0 < cap) {
      await new Promise((r) => requestAnimationFrame(r))
      if (test(a)) { at = performance.now() - t0; break }
    }
    const P = window.__perf
    const q0 = performance.now()
    while (performance.now() - q0 < 6000) {
      await new Promise((r) => setTimeout(r, 100))
      const ll = P.longs.length ? P.longs[P.longs.length - 1][0] + P.longs[P.longs.length - 1][1] : 0
      if (performance.now() - Math.max(P.lastCommit, ll) > 600) break
    }
    return at === null ? null : Math.round(at)
  }, seen.toString(), arg, cap)
}

const textIn = (a) => { const el = document.getElementById(`wb-section-${a.id}`); return !!el && (el.textContent || "").includes(a.text) }

async function liveScenario({ device, bundle, css, cpu }) {
  const { openEditor } = await import("./canvas-probe-kit.mjs")
  const view = device === "phone" ? PHONE : DESKTOP
  const ed = await openEditor({ kind: "native", bundle, css, globals: STORELIB_PAGE + LIVE_GLOBALS, init: INIT + SCROLL_INIT, cpu, width: view.width, height: view.height, touch: device === "phone", settle: 6000 })
  const out = {}
  try {
    const cdp = await ed.page.createCDPSession()
    if (cpu > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate: cpu })
    await settleQuiet(ed)
    const stamp = `L${Date.now() % 100000}`
    /* A section open and its heading being typed in, on the computer; on the phone the canvas alone. */
    let typing = false
    if (device === "desktop") {
      const hero = await ed.js((hid) => { const b = document.getElementById(`wb-section-${hid}`); if (!b) return null; b.scrollIntoView({ block: "center" }); const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + Math.min(60, r.height / 2) } }, id("hero_centered"))
      if (hero) {
        await ed.page.mouse.click(hero.x, hero.y)
        /* The section's settings, given the time a slow CPU takes to draw them. */
        await ed.page.waitForFunction(() => [...(document.querySelector("[data-wb-sidebar-scroll]")?.querySelectorAll("input, textarea") ?? [])].some((i) => /^Section \d+:/.test(i.value || "")), { timeout: 20000, polling: 200 }).catch(() => {})
        await settleQuiet(ed)
        const input = await ed.js(() => {
          const s = document.querySelector("[data-wb-sidebar-scroll]")
          const all = s ? s.querySelectorAll("input[type=text], input:not([type]), textarea") : []
          for (const i of all) if (/^Section \d+:/.test(i.value || "")) { i.setAttribute("data-probe-typing", ""); i.scrollIntoView({ block: "center" }); const r = i.getBoundingClientRect(); return { x: r.left + r.width - 8, y: r.top + r.height / 2 } }
          return null
        })
        if (input) {
          await ed.page.mouse.click(input.x, input.y)
          await ed.page.keyboard.press("End")
          await ed.page.keyboard.type(" typing", { delay: 40 })
          typing = true
        }
      }
    }
    /* The canvas a way down the page, so a jump would show. */
    await ed.js(() => { const sc = document.getElementById("wb-preview-root"); sc.scrollTop = Math.min(1400, sc.scrollHeight - sc.clientHeight - 10) })
    await sleep(600)
    const before = async () => ed.js(() => {
      const f = document.querySelector("[data-probe-typing]")
      return { scroll: document.getElementById("wb-preview-root").scrollTop, focused: !!f && document.activeElement === f, value: f ? f.value : null }
    })
    const after = async (b, name, m, at) => {
      const a = await before()
      m.latency = at
      m.scrollMoved = Math.round(a.scroll - b.scroll)
      if (typing) { m.focusKept = a.focused; m.textKept = a.value === b.value }
      out[name] = m
      if (process.env.TOP) console.log(`      ${m.top.join("  ")}`)
      console.log(`  live    ${device.padEnd(7)} ${name.padEnd(26)} ${at === null ? "NEVER ARRIVED" : `on the canvas after ${at}ms`}; ${m.commits} commits, ${m.renders} renders (editor ${m.editor}, sections ${m.sections} ${JSON.stringify(m.sectionTypes)}); boxes thrown away ${m.removed}; long ${m.longTasks} (max ${m.longest}ms); frame max ${m.max}ms; scroll moved ${m.scrollMoved}px${typing ? `; focus ${m.focusKept ? "kept" : "LOST"}, text ${m.textKept ? "kept" : "LOST"}` : ""}`)
    }
    const agent = (ops) => ({ agent_name: "Claude Code", path: "pages/home", action: "page", detail: { page: "home", ops } })

    /* 1. One agent edit to one section. */
    {
      const b = await before()
      await ed.js(() => window.__sw.start())
      await pushActivity(ed, [agent([{ kind: "update_section", id: id("features_grid"), settings: { heading: `${stamp} one` } }])])
      const at = await arrival(ed, textIn, { id: id("features_grid"), text: `${stamp} one` })
      await after(b, "agent edits one section", await ed.js(() => window.__sw.stop()), at)
    }
    /* 2. An agent edit to the section whose heading is being typed in (another field of it). */
    if (typing) {
      const b = await before()
      await ed.js(() => window.__sw.start())
      await pushActivity(ed, [agent([{ kind: "update_section", id: id("hero_centered"), settings: { subheading: `${stamp} beside` } }])])
      const at = await arrival(ed, textIn, { id: id("hero_centered"), text: `${stamp} beside` })
      await after(b, "agent edits the open one", await ed.js(() => window.__sw.stop()), at)
    }
    /* 3. A GitHub push that rewrote the page: read back in place. The typed edit is saved first, so it is not a conflict. Before the
       theme changes below: this probe's routes do not keep a save, so a push read after them would rightly redraw every section. */
    {
      if (typing) { await ed.js(() => { const a = document.activeElement; if (a && a.blur) a.blur() }); await sleep(2500) }
      typing = false
      const b = await before()
      await ed.js((s) => { const h = window.PROBE_PAGES.home; h[h.indexOf("cta_simple")] = "stats"; window.__pushStamp = s }, stamp)
      await ed.js(() => window.__sw.start())
      await pushActivity(ed, [{ agent_name: "GitHub", path: "pages/home", action: "page", detail: { page: "home", replaced: true } }])
      const at = await arrival(ed, (a) => !!document.getElementById(`wb-section-${a.id}`), { id: id("cta_simple").replace("cta_simple", "stats") })
      await after(b, "github push rewrote the page", await ed.js(() => window.__sw.stop()), at)
    }
    /* 4. A burst: twelve writes in one read of the log, over six sections and the theme. */
    {
      const b = await before()
      const targets = ["features_grid", "text_rich", "faq_accordion", "promo_newsletter", "cta_simple", "text_image"].map(id)
      const evs = []
      for (let k = 0; k < 12; k++) evs.push(k === 5 ? agent([{ kind: "update_theme", settings: { primary_color: k % 2 ? "#0f766e" : "#1d4ed8" } }]) : agent([{ kind: "update_section", id: targets[k % targets.length], settings: { heading: `${stamp} burst ${k}` } }]))
      await ed.js(() => window.__sw.start())
      await pushActivity(ed, evs)
      const at = await arrival(ed, textIn, { id: targets[11 % targets.length], text: `${stamp} burst 11` })
      await after(b, "agent burst of 12", await ed.js(() => window.__sw.stop()), at)
    }
    /* 5. Changes arriving while the canvas is being scrolled: they wait for the gesture to rest, then land. */
    {
      const b0 = await before()
      await ed.js(() => window.__sw.start())
      const scrolling = scrollGesture(ed, cdp, device)
      await sleep(300)
      await pushActivity(ed, [agent([{ kind: "update_section", id: id("text_rich"), settings: { heading: `${stamp} mid` } }])])
      await scrolling
      const restAt = Date.now()
      const at = await arrival(ed, textIn, { id: id("text_rich"), text: `${stamp} mid` })
      const m = await ed.js(() => window.__sw.stop())
      m.afterRest = at === null ? null : Math.max(0, at - 0)
      m.restAt = restAt
      await after({ ...b0, scroll: (await before()).scroll }, "agent edit during a scroll", m, at)
    }
    /* 6. Ask Storelib's edits streaming in faster than frames (a run's lines can arrive a few ms apart). */
    if (device === "desktop") {
      const lines = [{ type: "subject", text: "Editing the page" }]
      const targets = ["features_grid", "text_rich", "faq_accordion", "promo_newsletter", "text_image", "gallery"].map(id)
      for (let k = 0; k < 24; k++) lines.push({ type: "op", op: { kind: "update_section", id: targets[k % targets.length], settings: { heading: `${stamp} ask ${k}` } } })
      lines.push({ type: "message", text: "Done." })
      await ed.js((l) => { window.PROBE_AGENT_STREAM = { lines: l, gapMs: 4 } }, lines)
      const box = await ed.page.$("[data-ask-pill] textarea")
      if (box) {
        await box.click()
        await ed.page.keyboard.type("Headings")
        const b = await before()
        await ed.js(() => window.__sw.start())
        await ed.page.keyboard.press("Enter")
        const at = await arrival(ed, textIn, { id: targets[23 % targets.length], text: `${stamp} ask 23` })
        await after(b, "ask run, 24 edits 4ms apart", await ed.js(() => window.__sw.stop()), at)
      } else console.log("  (no Ask box)")
    }
    out.errors = ed.errors.slice(0, 5)
    if (ed.errors.length) console.log(`  page errors: ${ed.errors.slice(0, 3).join(" | ")}`)
    return out
  } finally {
    await ed.close()
  }
}

/* ── First load on a slow network: every API route answering after a Slow 4G round trip ── */
async function slowLoad({ bundle, css, cpu, device }) {
  const { openEditor } = await import("./canvas-probe-kit.mjs")
  const view = device === "phone" ? PHONE : DESKTOP
  const t0 = Date.now()
  const ed = await openEditor({
    kind: "native", bundle, css, globals: STORELIB_PAGE + LIVE_GLOBALS + "window.PROBE_API_DELAY_MS=600;",
    init: INIT + SCROLL_INIT, cpu, width: view.width, height: view.height, touch: device === "phone", settle: 4000,
    beforeOpen: async (page) => {
      const c = await page.createCDPSession()
      /* Slow 4G's round trip as Lighthouse throttles it (150ms x 3.75). Not its 1.6Mbit: this bundle is the unminified editor, eight
         times what ships, and its download would be the whole measurement. scripts/perf-budget.mjs holds the shipped weight. */
      await c.send("Network.enable")
      await c.send("Network.emulateNetworkConditions", { offline: false, latency: 562, downloadThroughput: -1, uploadThroughput: -1 })
    },
  })
  try {
    const r = await ed.js(() => {
      const P = window.__perf
      const calls = window.probeCalls || []
      const seen = {}
      for (const c of calls) seen[c] = (seen[c] || 0) + 1
      const longs = P.longs
      return {
        firstCanvas: Math.round(P.firstCanvas ?? -1), canvasReady: Math.round(P.canvasReady ?? -1), commits: P.commits,
        apiCalls: calls.length, repeated: Object.entries(seen).filter(([, n]) => n > 1).map(([k, n]) => `${n}x ${k.slice(0, 80)}`),
        longTasks: longs.length, longest: longs.length ? Math.round(Math.max(...longs.map((l) => l[1]))) : 0,
        skeleton: !!document.querySelector(".wb-canvas-loader, [data-builder-loader]"),
      }
    })
    r.wallMs = Date.now() - t0
    console.log(`  load    ${device.padEnd(7)} slow 4G: first canvas ${r.firstCanvas}ms, ready ${r.canvasReady}ms; API calls ${r.apiCalls}, repeated ${r.repeated.length ? r.repeated.join("; ") : "none"}; long tasks ${r.longTasks} (max ${r.longest}ms)`)
    return r
  } finally {
    await ed.close()
  }
}

/* ── Budgets: what each scenario must stay under at this CPU (they scale with it) ── */
function budgets(all, cpu) {
  const k = Math.max(1, cpu / 2)
  const fails = []
  const want = (ok, what, got) => { console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}   (${JSON.stringify(got)})`); if (!ok) fails.push(what) }
  for (const [key, m] of Object.entries(all.scroll ?? {})) {
    if (!m) continue
    want(m.p95 <= 34 * k, `${key}: scroll frames p95 under ${Math.round(34 * k)}ms`, m.p95)
    want(m.longest <= 120 * k, `${key}: no long task over ${Math.round(120 * k)}ms while scrolling`, m.longest)
    want(m.commits <= 4, `${key}: at most 4 React commits during a scroll`, m.commits)
    const handlers = Object.values(m.handlers ?? {}).reduce((a, b) => a + b, 0)
    want(handlers <= 60 * k, `${key}: scroll, wheel and touch handlers under ${Math.round(60 * k)}ms in all`, handlers)
    want((m.blocking ?? []).filter((b) => /^(wheel|touchmove|mousewheel)@/.test(b)).length === 0, `${key}: no wheel or touchmove listener that blocks the scroll`, m.blocking)
  }
  for (const [dev, live] of Object.entries(all.live ?? {})) {
    if (!live) continue
    for (const [name, m] of Object.entries(live)) {
      if (name === "errors") { want(m.length === 0, `live ${dev}: nothing thrown`, m); continue }
      want(m.latency !== null, `live ${dev} ${name}: arrives without a refresh`, m.latency)
      /* An Ask run brings its first changed section into view when it is over (aiRunFinished), on purpose. */
      if (!/ask run/.test(name)) want(Math.abs(m.scrollMoved) <= 2 || /during a scroll/.test(name), `live ${dev} ${name}: the canvas keeps its scroll`, m.scrollMoved)
      if (!/github/.test(name)) want(m.removed === 0, `live ${dev} ${name}: no section box thrown away`, m.removed)
      else want(m.removed <= 1, `live ${dev} ${name}: only the replaced section's box goes`, m.removed)
      if (m.focusKept !== undefined) want(m.focusKept && m.textKept, `live ${dev} ${name}: the field being typed in keeps its focus and text`, { focus: m.focusKept, text: m.textKept })
      if (/agent edits one|agent edits the open/.test(name)) want(m.sections <= 3, `live ${dev} ${name}: only the changed section redraws`, m.sectionTypes)
      if (/burst|ask run/.test(name)) want(m.commits <= (/ask/.test(name) ? 30 : 12), `live ${dev} ${name}: a burst is a handful of commits, not one per line`, m.commits)
      want(m.longest <= 150 * k, `live ${dev} ${name}: no long task over ${Math.round(150 * k)}ms`, m.longest)
    }
  }
  for (const [name, m] of Object.entries(all.interactions ?? {})) {
    if (!m || typeof m !== "object" || !("inp" in m)) continue
    if (/^(type 20 keys|toggle switch|slider 60 steps)$/.test(name)) want(m.inp <= 100 * k, `${name}: input to next paint under ${Math.round(100 * k)}ms`, m.inp)
  }
  return fails
}

const all = { cpu: CPU }
const PART = (process.env.PART ?? "interactions,scroll,live,load").split(",")
const DEVICES = (process.env.DEVICE ?? "desktop,phone").split(",")
const THEMES = (process.env.THEME ?? "storelib,imported").split(",")
let unmeasured = 0
if (PART.includes("interactions")) unmeasured += await interactions()
if (PART.some((p) => p !== "interactions")) {
  process.env.PROBE_CSS = process.env.PROBE_CSS ?? "source"
  const harness = await import("./editor-probe-harness.mjs")
  const css = process.env.STYLESHEET ? readFileSync(process.env.STYLESHEET, "utf8") : harness.css
  console.log(`\nCPU ${CPU}x, scrolling and changes from outside`)
  if (PART.includes("scroll")) {
    all.scroll = {}
    for (const theme of THEMES) for (const device of DEVICES) {
      try { all.scroll[`${theme} ${device}`] = await scrollScenario({ theme, device, bundle: harness.bundle, css, cpu: CPU }) } catch (e) { console.log(`  scroll ${theme} ${device} did not run: ${String(e).slice(0, 200)}`); unmeasured++ }
    }
  }
  if (PART.includes("live")) {
    all.live = {}
    for (const device of DEVICES) {
      try { all.live[device] = await liveScenario({ device, bundle: harness.bundle, css, cpu: CPU }) } catch (e) { console.log(`  live ${device} did not run: ${String(e).slice(0, 300)}`); unmeasured++ }
    }
  }
  if (PART.includes("load")) {
    all.load = {}
    for (const device of DEVICES) {
      try { all.load[device] = await slowLoad({ device, bundle: harness.bundle, css, cpu: CPU }) } catch (e) { console.log(`  load ${device} did not run: ${String(e).slice(0, 200)}`); unmeasured++ }
    }
  }
}
if (process.env.JSON) writeFileSync(process.env.JSON, JSON.stringify(all, null, 2))
const over = process.env.BUDGET === "0" ? [] : (console.log("\nbudgets"), budgets(all, CPU))
if (unmeasured) console.log(`\n${unmeasured} part(s) could not be measured`)
if (over.length) console.log(`\n${over.length} over budget`)
process.exit(unmeasured || over.length ? 1 : 0)

