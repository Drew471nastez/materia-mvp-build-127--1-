/**
 * ===========================================================================
 *  SCROLLING THE CANVAS WITH THE OWNER'S REAL THEME (round 14)
 * ===========================================================================
 * The owner: "Scroll in the canvas still bugs, still freezes, still laggy."
 *
 * Every earlier canvas probe scrolled a stand-in theme. This one scrolls the
 * owner's REAL Materia theme (scripts/materia-live-kit.mjs: the public pages
 * of andrewrullz.storelib.com, their stylesheets, scripts and pictures, made
 * into a theme for the canvas), and the same page served as a visitor gets
 * it, so what the theme costs and what the editor adds are told apart:
 *
 *   SURFACES   editor   the real editor (scripts/editor-probe-harness.mjs, a
 *                       production bundle), a section selected and, on the
 *                       desktop, the pointer resting over the canvas
 *              live     the same page alone in the browser, Storelib's live
 *                       scripts and all
 *   PAGES      home, product (/products/pants-down), collection (/collections/
 *              all); and NATIVE, a Storelib theme's home page, in the editor
 *   DEVICES    desktop 1440x900, a mouse wheel: notches of 100px every 33ms
 *              to the foot of the page and back up half of it
 *              phone 390x844, a touch screen: swipes (touch events, let go,
 *              the page coasting) to the foot of the page
 *   CPU        1x and 4x
 *
 * Measured in the scrolled document while it scrolls: frames (dropped frames
 * as a share of the frames the time held, the longest frame), long tasks,
 * messages between the canvas and the editor, changes to the editor's own
 * page (React drawing on scroll), and with ATTR=1 a trace and a CPU profile
 * of the main thread: script time by origin (theme files, theme inline,
 * Storelib's bridge, the editor), forced layouts and who forced them, style,
 * layout and paint time, painted area per frame.
 *
 *   npx tsx scripts/check-wb-scroll-r14.mjs
 *   ONLY=<regexp over "surface page device cpu">   ATTR=1   RUNS=1
 *   STATE=plain (editor: nothing selected, the pointer off the canvas)
 *   STALLS=1 (instead: opening, selecting, theme settings, the section
 *   library, duplicate, Undo, Redo and another page, timed for long tasks)
 *   EDITOR_BUNDLE=<file>  (the bundle to measure; the before/after tables are two bundles, same machine)
 *   MATERIA_LIVE_DIR=<dir> (the mirror of the public site; fetched once if missing)
 *   JSON=<file>  SHOTS=<dir>  BUDGET=0 (report without failing)
 *
 * Budgets (editor, CPU 1x, real Materia and native): dropped frames < 5%,
 * longest frame < 50ms. 4x is reported. And always: no message per scroll
 * frame from the canvas to the editor, the editor's page not redrawn by a
 * scroll.
 */
import { createServer } from "node:http"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import puppeteer from "puppeteer-core"

process.env.PROBE_CSS = process.env.PROBE_CSS ?? "source"
const { bundle, css } = await import("./editor-probe-harness.mjs")
const { openEditor, sleep, STORELIB_GLOBALS } = await import("./canvas-probe-kit.mjs")
const { materiaLive } = await import("./materia-live-kit.mjs")

const ONLY = process.env.ONLY ? new RegExp(process.env.ONLY, "i") : null
const ATTR = process.env.ATTR === "1"
const RUNS = Number(process.env.RUNS ?? 1)
const BUDGET = process.env.BUDGET !== "0"
const SHOTS = process.env.SHOTS ?? ""
if (SHOTS) mkdirSync(SHOTS, { recursive: true })
const DEVICES = { desktop: { width: 1440, height: 900, touch: false }, phone: { width: 390, height: 844, touch: true } }
let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : BUDGET ? "FAIL" : "note"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got).slice(0, 300)})`}`)
  if (!ok && BUDGET) broken++
}

/* ── In the scrolled document: every frame, and the messages it sends and gets ── */
const RECORDER = () => {
  if (window.__scr && window.__scr.on) window.__scr.on = false
  const R = (window.__scr = { t: [], on: true, sent: 0, got: 0 })
  const tick = (t) => { if (!R.on) return; R.t.push(t); requestAnimationFrame(tick) }
  requestAnimationFrame(tick)
  if (!window.__scrPost && window.parent !== window) {
    window.__scrPost = true
    addEventListener("message", () => { if (window.__scr) window.__scr.got++ })
  }
}
const STOP = () => {
  const R = window.__scr
  R.on = false
  const t = R.t, d = []
  for (let i = 1; i < t.length; i++) d.push(t[i] - t[i - 1])
  const F = 1000 / 60
  let dropped = 0
  for (const x of d) dropped += Math.max(0, Math.round(x / F) - 1)
  /* The scroller: the page, or a Storelib theme's canvas (#wb-preview-root, in the editor's own page). */
  const sc = document.getElementById("wb-preview-root") && !document.querySelector("[data-compat-frame]") ? document.getElementById("wb-preview-root") : document.documentElement
  return { frames: d.length, dropped, droppedPct: d.length ? Math.round((dropped / (d.length + dropped)) * 1000) / 10 : 0, longest: Math.round(Math.max(0, ...d)), sent: R.sent, got: R.got, y: Math.round(sc.scrollTop), h: sc.scrollHeight }
}
/* In the editor's own page: long tasks, and changes to its page outside the canvas (React drawing). */
const EDITOR_WATCH = () => {
  const W = (window.__edw = { longs: [], muts: 0, msgs: {} })
  /* What the canvas says to the editor while it scrolls, by kind. */
  W.onMsg = (e) => { if (e.source !== window && e.data && e.data.storelib === 1) W.msgs[e.data.type] = (W.msgs[e.data.type] ?? 0) + 1 }
  addEventListener("message", W.onMsg)
  try { W.po = new PerformanceObserver((l) => { for (const e of l.getEntries()) W.longs.push(Math.round(e.duration)) }); W.po.observe({ type: "longtask" }) } catch {}
  W.mo = new MutationObserver((l) => { for (const m of l) if (!(m.target.closest && m.target.closest("iframe"))) W.muts++ })
  W.mo.observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true })
}
const EDITOR_STOP = () => { const W = window.__edw; W.po?.disconnect(); W.mo.disconnect(); removeEventListener("message", W.onMsg); return { longs: W.longs, muts: W.muts, msgs: W.msgs } }

/* ── The live page: the mirror's HTML at /, every file it asks for from the mirror ── */
async function openLive({ kit, key, width, height, touch, cpu }) {
  const html = kit.liveHtml(key)
  const server = createServer((req, res) => { res.writeHead(200, { "Content-Type": "text/html" }); res.end(html) })
  await new Promise((ok) => server.listen(0, "127.0.0.1", ok))
  const base = `http://127.0.0.1:${server.address().port}`
  const browser = await puppeteer.launch({ executablePath: process.env.CHROMIUM ?? "/opt/pw-browsers/chromium", headless: true, args: ["--no-sandbox", "--disable-gpu", "--force-device-scale-factor=1"] })
  const page = await browser.newPage()
  await page.setViewport({ width, height, deviceScaleFactor: 1, ...(touch ? { isMobile: true, hasTouch: true } : {}) })
  if (cpu > 1) await (await page.createCDPSession()).send("Emulation.setCPUThrottlingRate", { rate: cpu })
  await page.setRequestInterception(true)
  page.on("request", (r) => {
    const u = r.url()
    if (u === `${base}/`) return r.continue()
    const hit = kit.serve(u)
    if (hit) return r.respond(hit)
    return r.respond({ status: 200, contentType: "text/plain", body: "" })
  })
  await page.goto(base, { waitUntil: "load", timeout: 120_000 })
  await sleep(2500)
  return { page, browser, doc: page.mainFrame(), close: async () => { await browser.close(); server.close() } }
}

/* ── The scroll ── */
async function scrollAll(page, doc, device, at) {
  const cdp = await page.createCDPSession()
  /* The scroller: the page, or a Storelib theme's canvas (#wb-preview-root, in the editor's own page). */
  const room = await doc.evaluate(() => { const n = document.getElementById("wb-preview-root"); return n && !document.querySelector("[data-compat-frame]") ? n.scrollHeight - n.clientHeight : document.documentElement.scrollHeight - innerHeight })
  if (device === "desktop") {
    await page.mouse.move(at.x, at.y)
    const notches = Math.ceil(room / 100)
    for (let i = 0; i < notches; i++) { await page.mouse.wheel({ deltaY: 100 }); await sleep(33) }
    for (let i = 0; i < notches / 2; i++) { await page.mouse.wheel({ deltaY: -100 }); await sleep(33) }
  } else {
    /* A swipe as a thumb makes it (touch events 16ms apart, let go at speed, the page coasting): Input.synthesizeScrollGesture's touch moves nothing in headless Chromium. */
    const x = Math.round(at.x), y0 = Math.round(at.y + 250)
    for (let i = 0; i < 80; i++) {
      await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y: y0 }] })
      for (let k = 1; k <= 8; k++) { await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y: y0 - k * 60 }] }); await sleep(16) }
      await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] })
      await sleep(300)
      if ((await doc.evaluate(() => { const n = document.getElementById("wb-preview-root"); const sc = n && !document.querySelector("[data-compat-frame]") ? n : document.documentElement; return sc.scrollTop + sc.clientHeight >= sc.scrollHeight - 4 }))) break
    }
  }
  await sleep(600)
  await cdp.detach()
}

/* ── ATTR: what the main thread did, from a trace and a CPU profile ── */
function attribution(events, profile, frameScripts) {
  const mains = events.filter((e) => e.name === "thread_name" && e.args?.name === "CrRendererMain")
  const busy = (m) => events.reduce((a, e) => a + (e.ph === "X" && e.pid === m.pid && e.tid === m.tid ? e.dur ?? 0 : 0), 0)
  const main = mains.sort((a, b) => busy(b) - busy(a))[0]
  const on = (e) => e.ph === "X" && e.dur && main && e.pid === main.pid && e.tid === main.tid
  const sum = {}
  for (const e of events) if (on(e) && /^(UpdateLayoutTree|Layout|Paint|PrePaint|Layerize|CompositeLayers|HitTest|IntersectionObserverController::computeIntersections|ScrollLayer|UpdateLayer|ParseHTML|ParseAuthorStyleSheet)$/.test(e.name)) sum[e.name] = (sum[e.name] ?? 0) + e.dur / 1000
  /* Forced: a layout or a style recalculation with a script's stack (asked for by a script, not by the frame). */
  const forced = new Map()
  let forcedMs = 0, forcedN = 0
  for (const e of events) {
    if (!on(e) || (e.name !== "Layout" && e.name !== "UpdateLayoutTree")) continue
    const st = e.args?.beginData?.stackTrace ?? e.args?.data?.stackTrace
    if (!st?.length) continue
    forcedMs += e.dur / 1000; forcedN++
    const f = st[0]
    const k = `${originOf(f.url, f.lineNumber, frameScripts)} ${st.slice(0, 4).map((x) => `${x.functionName || "(anon)"}:${tsLine(x.lineNumber, frameScripts)}`).join(" < ")}`
    forced.set(k, (forced.get(k) ?? 0) + e.dur / 1000)
  }
  /* Painted area: each Paint's rectangle (a quad), within the screen, per frame drawn. */
  let area = 0
  for (const e of events) if (on(e) && e.name === "Paint" && e.args?.data?.clip) { const c = e.args.data.clip; const xs = [c[0], c[2], c[4], c[6]], ys = [c[1], c[3], c[5], c[7]]; area += Math.max(0, Math.min(1440, Math.max(...xs)) - Math.max(0, Math.min(...xs))) * Math.max(0, Math.min(900, Math.max(...ys)) - Math.max(0, Math.min(...ys))) }
  const frames = events.filter((e) => on(e) && e.name === "PrePaint").length || 1
  /* Script self time by origin, from the profile. */
  const byOrigin = {}, byFn = new Map()
  if (profile) {
    const nodes = new Map(profile.nodes.map((n) => [n.id, n]))
    const dt = profile.timeDeltas
    const parent = new Map()
    for (const n of profile.nodes) for (const c of n.children ?? []) parent.set(c, n.id)
    for (let i = 0; i < profile.samples.length; i++) {
      let n = nodes.get(profile.samples[i])
      /* A built-in (getBoundingClientRect, elementsFromPoint: the layout it forces) is the script's that called it. */
      const leaf = n.callFrame.url ? "" : n.callFrame.functionName
      while (n && !n.callFrame.url && parent.has(n.id) && !/^\((idle|program|root|garbage collector)\)$/.test(n.callFrame.functionName)) n = nodes.get(parent.get(n.id))
      if (!n) continue
      const cf = leaf && n.callFrame.url ? { ...n.callFrame, functionName: `${n.callFrame.functionName || "(anon)"}>${leaf}` } : n.callFrame
      if (/^\((idle|program|root)\)$/.test(cf.functionName)) continue
      const o = cf.functionName === "(garbage collector)" ? "gc" : originOf(cf.url, cf.lineNumber + 1, frameScripts)
      byOrigin[o] = (byOrigin[o] ?? 0) + (dt[i] ?? 0) / 1000
      const up = parent.has(n.id) ? nodes.get(parent.get(n.id)) : null
      const k = `${o} ${cf.functionName || "(anon)"}:${tsLine(cf.lineNumber + 1, frameScripts)}${up && up.callFrame.url ? ` < ${up.callFrame.functionName || "(anon)"}:${tsLine(up.callFrame.lineNumber + 1, frameScripts)}` : ""}`
      byFn.set(k, (byFn.get(k) ?? 0) + (dt[i] ?? 0) / 1000)
    }
  }
  /* The main thread's tasks while it scrolled, and how long the scroll took: busy is the share of that time the thread could not take a frame. */
  let work = 0, t0 = Infinity, t1 = 0
  for (const e of events) if (on(e) && (e.name === "RunTask" || e.name === "ThreadControllerImpl::RunTask")) { work += e.dur / 1000; t0 = Math.min(t0, e.ts); t1 = Math.max(t1, e.ts + e.dur) }
  const r = (x) => Math.round(x)
  return {
    busyMs: r(work), spanMs: r((t1 - t0) / 1000), busyPct: Math.round((work / Math.max(1, (t1 - t0) / 1000)) * 1000) / 10,
    rendering: Object.fromEntries(Object.entries(sum).map(([k, v]) => [k, r(v)])),
    forced: { ms: r(forcedMs), count: forcedN, top: [...forced].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) => `${v.toFixed(1)}ms ${k}`) },
    paintPxPerFrame: Math.round(area / frames),
    script: Object.fromEntries(Object.entries(byOrigin).sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, r(v)])),
    topFunctions: [...byFn].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k, v]) => `${v.toFixed(0)}ms ${k}`),
  }
}
/* The bridge's lines as lib/storelib-theme/compat/canvas-bridge.ts numbers them: its first line is the line after `export const CANVAS_BRIDGE`. */
const BRIDGE_AT = readFileSync("lib/storelib-theme/compat/canvas-bridge.ts", "utf8").split("\n").findIndex((l) => l.startsWith("export const CANVAS_BRIDGE")) + 2
const tsLine = (line, frameScripts) => { const s = frameScripts?.find((x) => x.kind === "bridge" && line >= x.from && line <= x.to); return s ? line - s.from + BRIDGE_AT : line }
/* Where a script line is from: the editor's bundle, a theme file, or an inline script of the canvas page (the bridge's, Storelib's own, or the theme's). */
function originOf(url, line, frameScripts) {
  if (!url) return "native"
  if (/editor-probe\.js/.test(url)) return "editor"
  if (/\/api\/site-theme\/assets\//.test(url)) return `theme:${url.split("/").pop().split("?")[0]}`
  if (/srcdoc|^http:\/\/127\.0\.0\.1:\d+\/$/.test(url)) {
    const s = frameScripts?.find((x) => line >= x.from && line <= x.to)
    return s ? s.kind : "inline:?"
  }
  return url.slice(0, 50)
}
/* The canvas page's inline scripts by line: the bridge and Storelib's own (data-sl-own, data-storelib-*), or the theme's. */
const SCRIPT_LINES = () => {
  const html = (document.querySelector("[data-compat-frame='front']")?.getAttribute("srcdoc")) ?? document.documentElement.outerHTML
  const out = []
  const re = /<script\b([^>]*)>/gi
  let m
  while ((m = re.exec(html))) {
    const from = html.slice(0, m.index).split("\n").length
    const end = html.indexOf("</script>", m.index)
    const to = from + html.slice(m.index, end).split("\n").length - 1
    const a = m[1], body = html.slice(m.index + m[0].length, end)
    out.push({ from, to, kind: /^window\.__slSite=/.test(body) ? "bridge" : /data-sl|data-storelib/.test(a) || /__sl[A-Z]/.test(body) ? "storelib-inline" : "theme-inline" })
  }
  return out
}

const canvasWidth = {}
/* ── THE SAME PAGE: the canvas and the live page at the same size, the boxes of the sections on screen (in the page's own coordinates) at five places down it ── */
const LAYOUT_AT = async (doc) => {
  const room = await doc.evaluate(() => document.documentElement.scrollHeight - innerHeight)
  const out = { height: await doc.evaluate(() => document.documentElement.scrollHeight), at: [] }
  for (const f of [0, 0.25, 0.5, 0.75, 1]) {
    await doc.evaluate((y) => scrollTo({ top: y, behavior: "instant" }), Math.round(room * f))
    /* The theme's reveal plays for about a second (a transform): read once it has ended. */
    await sleep(1400)
    out.at.push(await doc.evaluate(() => [...document.querySelectorAll(".shopify-section")].filter((s) => !s.parentElement.closest(".shopify-section")).map((s) => { const r = s.getBoundingClientRect(); return [s.id, Math.round(r.top), Math.round(r.height), Math.round(r.top + scrollY)] }).filter((x) => x[1] < innerHeight && x[1] + x[2] > 0).map((x) => [x[0], x[3], x[2]])))
  }
  await doc.evaluate(() => scrollTo({ top: 0, behavior: "instant" }))
  await sleep(300)
  return out
}
const layouts = {}, sameAs = {}
/* ── One run ── */
async function run({ surface, key, device, cpu, kit, compat }) {
  const D = DEVICES[device]
  let h
  /* The live page at the canvas's own width (the editor's sidebars take the rest), so both lay out the same page. */
  if (surface === "live") h = await openLive({ kit, key, width: canvasWidth[device]?.w ?? (device === "desktop" ? 1120 : D.width), height: canvasWidth[device]?.h ?? D.height, touch: D.touch, cpu })
  else {
    const native = key === "native"
    const ed = await openEditor(native
      ? { kind: "native", bundle, css, globals: STORELIB_GLOBALS, width: D.width, height: D.height, cpu, touch: D.touch }
      : { kind: "imported", bundle, css, compat, serve: kit.serve, width: D.width, height: D.height, cpu, touch: D.touch })
    h = { page: ed.page, close: ed.close, ed, native }
    h.doc = native ? ed.page.mainFrame() : await ed.front()
  }
  const { page } = h
  try {
    /* Where the canvas is, and (editor) a section selected in it, as the owner works. */
    let at
    if (surface === "live") at = { x: D.width / 2, y: D.height / 2 }
    else if (h.native) {
      at = await page.evaluate(() => { const r = document.getElementById("wb-preview-root").getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + Math.min(r.height, innerHeight - r.top) / 2 } })
    } else {
      at = await page.evaluate(() => { const r = document.querySelector("[data-compat-frame='front']").getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: Math.round(r.width), h: Math.round(r.height) } })
      canvasWidth[device] = { w: at.w, h: at.h }
    }
    if (surface === "editor") {
      /* STATE=plain: nothing selected, the pointer off the canvas (the canvas alone, for the cost of the selection's overlays). */
      if (process.env.STATE === "plain") { if (!D.touch) await page.mouse.move(5, D.height - 5) }
      else if (D.touch) await page.touchscreen.tap(at.x, at.y); else { await page.mouse.move(at.x, at.y); await page.mouse.down(); await page.mouse.up() }
      await sleep(1200)
      if (!h.native) h.doc = await h.ed.front()
      await page.evaluate(EDITOR_WATCH)
    }
    /* Desktop at 1x, once a page: where everything is, for the canvas against the live page. */
    if (device === "desktop" && cpu === 1 && !h.native && !ATTR) {
      const l = await LAYOUT_AT(h.doc)
      if (surface === "editor") layouts[key] = l
      else if (layouts[key]) {
        const c = layouts[key]
        let worst = 0
        let where = ""
        c.at.forEach((list, i) => { const live = new Map(l.at[i].map((x) => [x[0], x])); for (const x of list) { const y = live.get(x[0]); const off = y ? Math.max(Math.abs(x[1] - y[1]), Math.abs(x[2] - y[2])) : 9999; if (off > worst) { worst = off; where = `${["top", "25%", "50%", "75%", "foot"][i]}: ${x[0].replace("shopify-section-", "")} canvas ${x[1]}+${x[2]}, live ${y ? `${y[1]}+${y[2]}` : "not on screen"}` } } })
        sameAs[key] = { canvasHeight: c.height, liveHeight: l.height, worstSectionOffPx: worst, ...(worst > 2 ? { where } : {}) }
      }
    }
    const frameScripts = ATTR ? await (surface === "live" ? page.evaluate(SCRIPT_LINES) : page.evaluate(SCRIPT_LINES)) : null
    const cdp = ATTR ? await page.createCDPSession() : null
    if (ATTR) {
      await cdp.send("Profiler.enable"); await cdp.send("Profiler.setSamplingInterval", { interval: 250 }); await cdp.send("Profiler.start")
      await page.tracing.start({ categories: ["devtools.timeline", "disabled-by-default-devtools.timeline", "disabled-by-default-devtools.timeline.stack", "disabled-by-default-devtools.timeline.frame"] })
    }
    await h.doc.evaluate(RECORDER)
    await scrollAll(page, h.doc, device, at)
    const f = await h.doc.evaluate(STOP)
    const e = surface === "editor" ? await page.evaluate(EDITOR_STOP) : { longs: [], muts: 0, msgs: {} }
    f.sent = Object.values(e.msgs).reduce((a, b) => a + b, 0)
    let attr = null
    if (ATTR) {
      const profile = (await cdp.send("Profiler.stop")).profile
      const trace = JSON.parse(Buffer.from(await page.tracing.stop()).toString("utf8")).traceEvents
      attr = attribution(trace, profile, frameScripts)
    }
    if (SHOTS) await page.screenshot({ path: join(SHOTS, `${surface}-${key}-${device}-${cpu}x.png`) })
    return { ...f, msgs: e.msgs, longTasks: e.longs.length, longestTask: Math.max(0, ...e.longs), editorMutations: e.muts, attr }
  } finally {
    await h.close()
  }
}

/*
  ── STALLS=1: what the owner calls a freeze, with the real theme ──
  The editor open on the theme with its three pages (home, a product, the
  catalog), and in turn: opening it, selecting a section from the sidebar and
  in the canvas, the theme's settings, the section library, a section
  duplicated then Undo and Redo, and going to another page. For each, the
  long tasks on the main thread (the canvas's and the editor's: they share
  it), the longest, and how long the thread was blocked (each task's time
  over 50ms). Budget at 1x: no task of a second or more.
*/
const LONGS = String.raw`(function(){window.__lt=[];try{new PerformanceObserver(function(l){l.getEntries().forEach(function(e){window.__lt.push([Math.round(e.startTime),Math.round(e.duration)])})}).observe({type:"longtask",buffered:true})}catch(e){}})()`
async function stalls(kit, cpu) {
  const compat = await kit.theme("all")
  const t0 = Date.now()
  const ed = await openEditor({ kind: "imported", bundle, css, compat, serve: kit.serve, cpu, init: LONGS, settle: 0 })
  const opened = Date.now() - t0
  const page = ed.page
  const out = {}
  /* The canvas page's own resizes (the editor resizing its frame wakes every resize listener of the theme). */
  const resizes = async () => { const f = await ed.front(); return f ? f.evaluate(() => { if (!window.__rs) { window.__rs = { n: 0 }; addEventListener("resize", () => window.__rs.n++) } return window.__rs.n }).catch(() => 0) : 0 }
  const window_ = async (name, act, ms = 2500) => {
    const from = await page.evaluate(() => performance.now())
    const r0 = await resizes()
    let note = ""
    try { note = (await act()) ?? "" } catch (e) { note = `threw: ${String(e).slice(0, 120)}` }
    await sleep(ms)
    const lt = await page.evaluate((f) => window.__lt.filter((x) => x[0] + x[1] >= f).map((x) => x[1]), from)
    out[name] = { longTasks: lt.length, longest: Math.max(0, ...lt), blocked: lt.reduce((a, d) => a + Math.max(0, d - 50), 0), frameResizes: Math.max(0, (await resizes()) - r0), ...(note ? { note } : {}) }
    if (SHOTS) await page.screenshot({ path: join(SHOTS, `stall-${cpu}x-${name.replace(/\W+/g, "-")}.png`) })
    console.log(`  ${`${cpu}x ${name}`.padEnd(28)} long tasks ${String(out[name].longTasks).padStart(3)}  longest ${String(out[name].longest).padStart(5)}ms  blocked ${String(out[name].blocked).padStart(6)}ms  frame resizes ${out[name].frameResizes}${note ? `  [${note}]` : ""}`)
  }
  /* `last`: the last match (a page menu has its group and its page under one name). */
  const clickText = (re, scope = "body", last = false) => page.evaluate((src, sc, lastOne) => {
    const all = [...document.querySelector(sc).querySelectorAll("button, [role=button], a, [role=option], [role=menuitem], li, span")].filter((x) => new RegExp(src, "i").test((x.getAttribute("aria-label") || x.textContent || "").trim()) && x.getClientRects().length)
    const el = lastOne ? all[all.length - 1] : all[0]
    if (!el) return `no ${src}`
    el.scrollIntoView({ block: "center" }); el.click(); return ""
  }, re.source, scope, last)
  /* Opening: from the address to the canvas drawn, and the moments after it. */
  await window_("open", async () => `canvas drawn after ${opened}ms`, 4000)
  out.open.blocked += await page.evaluate(() => window.__lt.reduce((a, x) => a + Math.max(0, x[1] - 50), 0)) - out.open.blocked
  out.open.longest = await page.evaluate(() => Math.max(0, ...window.__lt.map((x) => x[1])))
  console.log(`  ${`${cpu}x open (all of it)`.padEnd(28)} longest ${out.open.longest}ms  blocked ${out.open.blocked}ms`)
  await window_("select in sidebar", () => clickText(/^featured_product_8PyfA3$/))
  await window_("select in canvas", async () => { const r = await page.evaluate(() => { const b = document.querySelector("[data-compat-frame='front']").getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 3 } }); await page.mouse.click(r.x, r.y) })
  await window_("theme settings", () => clickText(/^Theme$/))
  await window_("sections again", () => clickText(/^Sections$/))
  await window_("section library", () => clickText(/^Add section$/), 4000)
  await page.keyboard.press("Escape"); await sleep(800)
  await window_("duplicate", async () => { await clickText(/^featured_product_8PyfA3$/); await sleep(800); return clickText(/^Duplicate$/) })
  await window_("undo", async () => { await page.keyboard.down("Control"); await page.keyboard.press("z"); await page.keyboard.up("Control") })
  await window_("redo", async () => { await page.keyboard.down("Control"); await page.keyboard.down("Shift"); await page.keyboard.press("z"); await page.keyboard.up("Shift"); await page.keyboard.up("Control") })
  /* The page menu (its current page's name), the Products group opened if it is shut, the page. */
  const toPage = async (from, group, to) => { const n = await clickText(from); if (n) return n; await sleep(500); if (await clickText(to, "body", true)) { await clickText(group, "body", true); await sleep(400); return clickText(to, "body", true) } return "" }
  await window_("another page", () => toPage(/^Home$/, /^Products$/, /^Product$/), 5000)
  await window_("back home", () => toPage(/^Product$/, /^Home$/, /^Home$/), 5000)
  await ed.close()
  return out
}
if (process.env.STALLS === "1") {
  const kit = await materiaLive()
  const all = {}
  for (const cpu of [1, 4]) { if (ONLY && !ONLY.test(`${cpu}x`)) continue; all[cpu] = await stalls(kit, cpu) }
  console.log("\nBudgets")
  for (const [name, r] of Object.entries(all[1] ?? {})) expect(r.longest < 1000, `1x ${name}: no task of a second or more`, r)
  if (process.env.JSON) writeFileSync(process.env.JSON, JSON.stringify(all, null, 1))
  console.log(broken ? `\n${broken} over budget` : "\nall within budget")
  process.exit(broken ? 1 : 0)
}

/* ── The matrix ── */
const kit = await materiaLive()
const themes = {}
const rows = []
const plan = []
for (const key of ["home", "product", "collection", "native"]) for (const device of ["desktop", "phone"]) for (const cpu of [1, 4]) for (const surface of key === "native" ? ["editor"] : ["editor", "live"]) plan.push({ surface, key, device, cpu })
for (const p of plan) {
  const name = `${p.surface} ${p.key} ${p.device} ${p.cpu}x`
  if (ONLY && !ONLY.test(name)) continue
  if (p.surface === "editor" && p.key !== "native" && !themes[p.key]) themes[p.key] = await kit.theme(p.key)
  for (let i = 0; i < RUNS; i++) {
    let r
    try { r = await run({ ...p, kit, compat: themes[p.key] }) } catch (e) { console.log(`  ${name}: threw ${String(e).slice(0, 200)}`); broken++; continue }
    rows.push({ name, ...p, ...r })
    console.log(`  ${name.padEnd(30)} dropped ${String(r.droppedPct).padStart(5)}% (${r.dropped}/${r.frames + r.dropped})  longest ${String(r.longest).padStart(4)}ms  long tasks ${r.longTasks} (max ${r.longestTask}ms)  msgs to editor ${r.sent} ${JSON.stringify(r.msgs ?? {})}, from ${r.got}  editor DOM changes ${r.editorMutations}  at ${r.y}/${r.h}`)
    if (r.attr) console.log(`      ${JSON.stringify(r.attr, null, 1).split("\n").join("\n      ")}`)
  }
}

/* ── Budgets ── */
console.log("\nBudgets")
const med = (xs) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)] }
const groups = new Map()
for (const r of rows) groups.set(r.name, [...(groups.get(r.name) ?? []), r])
for (const [name, list] of groups) {
  const r = { droppedPct: med(list.map((x) => x.droppedPct)), longest: med(list.map((x) => x.longest)), sent: med(list.map((x) => x.sent)), frames: med(list.map((x) => x.frames)), muts: med(list.map((x) => x.editorMutations)) }
  if (list[0].surface !== "editor") continue
  if (list[0].cpu === 1) {
    /*
      THE THEME'S OWN COST IS NOT THE EDITOR'S. Where the same page live misses
      the budget itself (the owner's Materia theme does: its own scripts and
      :has() rules, docs/theme-contracts/materia-scroll-performance.md), the
      canvas is held to the live page: at most 3 points more frames dropped,
      a longest frame at most a frame longer. Said as such in the line.
    */
    const live = groups.get(name.replace(/^editor/, "live"))
    const L = live ? { droppedPct: med(live.map((x) => x.droppedPct)), longest: med(live.map((x) => x.longest)) } : null
    const themeBound = !!L && (L.droppedPct >= 5 || L.longest >= 50)
    expect(r.droppedPct < 5 || (themeBound && r.droppedPct <= L.droppedPct + 3), `${name}: dropped frames < 5%${themeBound ? ` (theme-bound: live drops ${L.droppedPct}%, the canvas may drop up to 3 points more)` : ""}`, r.droppedPct)
    expect(r.longest < 50 || (themeBound && r.longest <= Math.max(50, L.longest + 17)), `${name}: longest frame < 50ms${themeBound ? ` (theme-bound: live's longest ${L.longest}ms, the canvas's at most a frame more)` : ""}`, r.longest)
  }
  /* Messages to the editor while scrolling: a handful (the toolbar's box when it changes, where the page stands once it stops), never one a frame. */
  expect(r.sent <= Math.max(12, r.frames * 0.1), `${name}: messages to the editor while scrolling, not one a frame`, { sent: r.sent, frames: r.frames })
}
/* The canvas draws the page as the website does: the same height, every section where it is live (within 2px), at five places down the page. */
/*
  KNOWN, NOT THE CANVAS: the product page's pickup availability block is filled
  by a request of the theme's own script, which the editor answers (as the
  website does) and the mirror of the live page answers with nothing, so the
  live copy here has the block empty (115px less in the product's main section).
*/
const KNOWN = { product: /shopify-section-main /.source }
for (const [key, x] of Object.entries(sameAs)) {
  const known = KNOWN[key] && x.where && new RegExp(KNOWN[key]).test(x.where.replace(/^[^:]+: /, "shopify-section-"))
  expect(known || (Math.abs(x.canvasHeight - x.liveHeight) <= 4 && x.worstSectionOffPx <= 2), `${key}: the canvas lays the page out as the live page does${known ? " (known: the pickup availability block, see KNOWN)" : ""}`, x)
}
if (process.env.JSON) writeFileSync(process.env.JSON, JSON.stringify(rows, null, 1))
console.log(broken ? `\n${broken} over budget` : "\nall within budget")
process.exit(broken ? 1 : 0)
