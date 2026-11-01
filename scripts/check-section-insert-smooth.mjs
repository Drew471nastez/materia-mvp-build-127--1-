/**
 * ===========================================================================
 *  A SECTION PICKED IN ADD A SECTION, LANDING IN THE CANVAS, FRAME BY FRAME
 * ===========================================================================
 * The owner: "When I add a section in the website builder editor, make sure
 * it's smooth and clean. After I click it, it goes into the canvas with no
 * delay, no bump, no glitch, no flash."
 *
 * The real editor (scripts/editor-probe-harness.mjs, the code that ships,
 * bundled) on a Storelib theme and on an imported theme (the Materia fixture,
 * with six sections added that each carry their own stylesheet, as Dawn's
 * sections do, none of them on the page yet). Each run opens Add a section
 * from a gap picked at random, scrolls to a card picked at random, clicks it
 * with the mouse, and records every frame from the click until the canvas is
 * still, in the editor's document and in the canvas's frame:
 *
 *   FIRST PIXEL   click to the first frame the new section is on screen,
 *                 with a height and an opacity over 0.05 (and click to its
 *                 final look: its own stylesheet in, the size it ends at)
 *   UNSTYLED      frames it is on screen without its own stylesheet, or
 *                 drawn differently from how it ends (colour, padding, font)
 *   RESIZED       frames it is on screen at a height other than its last
 *   ABOVE         how far any section above the gap moved on the page (px)
 *   SNAP          the largest one-frame step of a section below the gap, on
 *                 the page (a section pushed down at once rather than sliding)
 *   CLS           layout-shift entries in the canvas's document, summed
 *   SCROLLS       separate scroll movements, a movement turned back, a
 *                 one-frame jump of more than 120px
 *   INSERTS       the new section put in the DOM more than once, or two
 *                 sections where one was picked
 *   CANVAS        the canvas's frame replaced, or an existing section gone
 *                 for a frame
 *   LONG TASKS    over 50ms, from the click until it is still (editor and
 *                 canvas), and the worst frame while the dialog closes
 *   RING          the selection outline on the new section: shown, gone,
 *                 shown again counts as a flash
 *
 * Runs are randomised: CPU 1x or 4x, the section's stylesheet arriving in
 * 0ms or 300 to 1500ms (imported theme; a Storelib theme's sections need no
 * request), a page edit arriving from a connected agent at the click, two
 * picks in a row as fast as the dialog allows, and reduced motion.
 *
 *   node scripts/check-section-insert-smooth.mjs
 *   RUNS=30  THEMES=native,imported  SEED=1  JSON=<file>  BUDGET=0 (report only)
 *   EDITOR_BUNDLE=<file>  (a bundle built before, for a before/after table)
 */
import { writeFileSync } from "node:fs"

process.env.PROBE_CSS = process.env.PROBE_CSS ?? "source"
const { bundle, css } = await import("./editor-probe-harness.mjs")
const { openEditor, importedTheme, sleep, STORELIB_GLOBALS } = await import("./canvas-probe-kit.mjs")

const RUNS = Number(process.env.RUNS ?? 30)
const PER_SESSION = Number(process.env.PER_SESSION ?? 6)
const THEMES = (process.env.THEMES ?? "native,imported").split(",")
const BUDGET = process.env.BUDGET !== "0"
let seed = Number(process.env.SEED ?? 1)
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648)
const pick = (a) => a[Math.floor(rand() * a.length)]

/* ── Six sections an imported theme can add, each with its own stylesheet, as Dawn's sections carry one ── */
const OWN = ["a", "b", "c", "d", "e", "f"]
const ownCss = (k, i) => `.ins-${k}{padding:${72 + i * 8}px 40px;background:hsl(${i * 50},45%,30%);color:#fff;font-family:Georgia,serif}
.ins-${k} h2{font-size:44px;line-height:1.1;margin:0 0 16px}.ins-${k} p{font-size:18px;max-width:640px;margin:0 0 24px}
.ins-${k} img{display:block;width:100%;height:auto;border-radius:8px;background:#0003}`
const ownLiquid = (k, i) => `{{ 'section-ins-${k}.css' | asset_url | stylesheet_tag }}
<div class="ins-${k}"><h2>{{ section.settings.heading }}</h2><p>Small batch, roasted on Tuesdays and sent the same week.</p><img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1200 ${300 + i * 20}'%3E%3Crect width='1200' height='${300 + i * 20}' fill='%23ccc'/%3E%3C/svg%3E" width="1200" height="${300 + i * 20}" alt=""></div>
{% schema %}
{ "name": "Insert ${k.toUpperCase()}", "settings": [ { "type": "text", "id": "heading", "label": "Heading", "default": "Heading ${k.toUpperCase()}" } ], "presets": [ { "name": "Insert ${k.toUpperCase()}" } ] }
{% endschema %}`
async function withOwnSections(zip) {
  OWN.forEach((k, i) => {
    zip.file(`sections/ins-${k}.liquid`, ownLiquid(k, i))
    zip.file(`assets/section-ins-${k}.css`, ownCss(k, i))
  })
}

/*
  ── In every document (puppeteer's evaluateOnNewDocument reaches the canvas's sandboxed frame too) ──
  One recorder, armed in the editor's document and, on an imported theme, in the canvas's frame as
  well, since the editor cannot read into that frame. Every time is an epoch (timeOrigin + now), so
  the two documents line up on one clock.
*/
const RECORDER = String.raw`
(function () {
  if (window.__ins) return
  var R = window.__ins = { lt: [], on: false }
  var epoch = function (t) { return performance.timeOrigin + t }
  var inFrame = window !== window.top
  /* Who scrolls the canvas, and from where: every call, while armed. */
  R.calls = []
  var callSite = function () { return String(new Error().stack).split("\n").slice(2, 5).map(function (l) { return l.trim().slice(0, 60) }).join(" < ") }
  ;["scrollTo", "scrollBy"].forEach(function (n) { var f = window[n]; window[n] = function () { if (R.on) R.calls.push({ e: epoch(performance.now()), what: n + JSON.stringify(Array.prototype.slice.call(arguments)).slice(0, 80), at: Math.round(scrollY), from: callSite() }); return f.apply(window, arguments) } })
  ;["scrollIntoView", "scrollTo", "scrollBy"].forEach(function (n) { var f = Element.prototype[n]; if (!f) return; Element.prototype[n] = function () { if (R.on) R.calls.push({ e: epoch(performance.now()), what: "el." + n + " " + (this.id || String(this.className).slice(0, 30)) + JSON.stringify(Array.prototype.slice.call(arguments)).slice(0, 60), from: callSite() }); return f.apply(this, arguments) } })
  try { new PerformanceObserver(function (l) { l.getEntries().forEach(function (e) { if (R.on) R.lt.push({ e: epoch(e.startTime), ms: Math.round(e.duration), frame: inFrame }) }) }).observe({ type: "longtask", buffered: false }) } catch (e) {}
  try { new PerformanceObserver(function (l) { l.getEntries().forEach(function (e) { if (R.on) R.cls += e.value }) }).observe({ type: "layout-shift", buffered: false }) } catch (e) {}
  document.addEventListener("click", function (e) {
    var c = e.target && e.target.closest && e.target.closest("[data-library-card]")
    if (c && R.on) R.clicks.push(epoch(e.timeStamp))
  }, true)
  /* The canvas this document holds: the editor's own (#wb-preview-root), or an imported theme's page (this frame). */
  var scroller = function () { return document.getElementById("wb-preview-root") }
  R.native = function () { return !inFrame && !!scroller() }
  R.boxes = function () {
    if (R.native()) return Array.prototype.slice.call(document.querySelectorAll("#wb-preview-root [id^='wb-section-']")).map(function (el) { return { id: el.id.slice(11), el: el } })
    if (!inFrame) return []
    return Array.prototype.slice.call(document.querySelectorAll(".shopify-section[id^='shopify-section-']")).map(function (el) { return { id: el.id.slice(16), el: el } })
  }
  R.scroll = function () { return R.native() ? scroller().scrollTop : inFrame ? scrollY : 0 }
  R.view = function () {
    if (R.native()) { var b = scroller().getBoundingClientRect(); return { top: b.top, bottom: b.bottom } }
    return { top: 0, bottom: innerHeight }
  }
  var opacityOf = function (el) { var o = 1; for (var n = el; n && n.nodeType === 1; n = n.parentElement) o *= parseFloat(getComputedStyle(n).opacity); return o }
  var lookOf = function (el) {
    var k = el.firstElementChild || el, cs = getComputedStyle(k)
    return [cs.backgroundColor, cs.color, cs.paddingTop, cs.fontFamily.split(",")[0]].join("|")
  }
  /* For the imported theme's own-stylesheet sections: is that stylesheet applied yet. */
  var ownSheetIn = function (el) {
    var k = el.querySelector("[class*='ins-']")
    var m = k && /\bins-([a-f])\b/.exec(k.className || "")
    if (!m) return null
    /* A link that has loaded, or the stylesheet's text written in a <style> (canvas-bridge.ts keep). */
    var l = Array.prototype.find.call(document.querySelectorAll("link[rel=stylesheet], style"), function (x) { return x.tagName === "LINK" ? x.href.indexOf("section-ins-" + m[1] + ".css") >= 0 && x.sheet : (x.textContent || "").indexOf(".ins-" + m[1] + "{") >= 0 })
    return !!l
  }
  var ringOn = function (el) {
    if (R.native()) {
      return Array.prototype.some.call(el.querySelectorAll("span.wb-ring"), function (s) { return /59, 130, 246\)|#3b82f6/.test(s.style.boxShadow) && !/0\.5\)/.test(s.style.boxShadow) && parseFloat(getComputedStyle(s).opacity) > 0.05 })
    }
    var host = document.querySelector("[data-sl-box=layer]"), root = host && host.shadowRoot ? host.shadowRoot : document
    var b = root.querySelector("[data-sl-box=section]")
    if (!b || b.style.display === "none" || parseFloat(getComputedStyle(b).opacity) < 0.05) return false
    var r = b.getBoundingClientRect(), e = el.getBoundingClientRect()
    /* The box is cut to what is on screen of the section (canvas-bridge.ts, ONLY WHAT CAN BE SEEN IS OUTLINED), and follows a scroll a frame late. */
    return r.height > 4 && r.top >= e.top - 40 && r.bottom <= e.bottom + 40
  }
  R.arm = function (before) {
    R.frames = []; R.lt = []; R.clicks = []; R.calls = []; R.on = true; R.cls = 0; R.adds = {}; R.fronts = 0
    R.mo && R.mo.disconnect()
    R.mo = new MutationObserver(function (ms) { ms.forEach(function (m) { m.addedNodes.forEach(function (n) {
      if (n.nodeType !== 1) return
      var id = (n.id || "").replace(/^(wb|shopify)-section-/, "")
      if (id && n.id !== id && before.indexOf(id) < 0) R.adds[id] = (R.adds[id] || 0) + 1
    }) }) })
    R.mo.observe(document.body || document, { childList: true, subtree: true })
    var frontOf = function () { return document.querySelector("iframe[data-compat-frame='front']") }
    var lastFront = frontOf()
    var tick = function (t) {
      if (!R.on) return
      var f = frontOf()
      if (f !== lastFront) { R.fronts++; lastFront = f }
      var scroll = R.scroll(), view = R.view(), base = view.top - scroll
      var rows = []
      R.boxes().forEach(function (b) {
        var r = b.el.getBoundingClientRect()
        var row = { id: b.id, top: Math.round((r.top - base) * 10) / 10, h: Math.round(r.height * 10) / 10 }
        if (before.indexOf(b.id) < 0) {
          row.isNew = true
          row.op = Math.round(opacityOf(b.el) * 100) / 100
          row.on = r.bottom > view.top + 1 && r.top < view.bottom - 1 && r.height > 1
          row.look = lookOf(b.el)
          row.sheet = ownSheetIn(b.el)
          row.ring = ringOn(b.el)
          row.arrival = b.el.getAttribute("data-arrival")
        }
        rows.push(row)
      })
      var lib = inFrame ? null : document.querySelector("[data-section-library-layer]"), panel = lib && lib.querySelector(".wb-library-panel")
      R.frames.push({ e: epoch(t), scroll: Math.round(scroll * 10) / 10, vh: Math.round(view.bottom - view.top), rows: rows, lib: lib ? lib.getAttribute("data-state") : null, libOp: panel ? Math.round(parseFloat(getComputedStyle(panel).opacity) * 100) / 100 : null })
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  }
  R.stop = function () { R.on = false; R.mo && R.mo.disconnect(); return { frames: R.frames, lt: R.lt, clicks: R.clicks, calls: R.calls, cls: Math.round(R.cls * 10000) / 10000, adds: R.adds, fronts: R.fronts } }
})()
`

/*
  The editor's recording and, on an imported theme, the canvas frame's, made one: the canvas's
  frames and layout shifts from the frame, the clicks, the dialog and the frame swaps from the
  editor, the long tasks from both; times in ms after the first click.
*/
function merge(editor, frame) {
  const t0 = editor.clicks[0] ?? editor.frames[0]?.e ?? 0
  const at = (e) => Math.round((e - t0) * 10) / 10
  const lib = editor.frames.map((f) => ({ t: at(f.e), lib: f.lib, libOp: f.libOp }))
  const canvas = frame ?? editor
  const frames = canvas.frames.map((f) => ({ ...f, t: at(f.e) }))
  for (const f of frames) {
    let l = null
    for (const x of lib) { if (x.t <= f.t + 1) l = x; else break }
    f.lib = l?.lib ?? null
    f.libOp = l?.libOp ?? null
  }
  const seen = new Set()
  const lt = [...editor.lt, ...(frame?.lt ?? [])].map((x) => ({ at: at(x.e), ms: x.ms, frame: x.frame })).filter((x) => {
    const k = `${Math.round(x.at / 5)}:${x.ms}`
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
  const calls = (canvas.calls ?? []).map((c) => ({ ...c, t: at(c.e) }))
  return { frames, lt, calls, clicks: editor.clicks.map(at), cls: canvas.cls, adds: canvas.adds, fronts: editor.fronts, editorFrames: lib }
}

/* ── What one recording says ── */
function judge(rec, beforeIds, picks) {
  const frames = rec.frames.filter((f) => f.t !== null && f.t >= 0)
  const out = { frames: frames.length }
  const newIds = [...new Set(frames.flatMap((f) => f.rows.filter((r) => r.isNew).map((r) => r.id)))]
  out.inserted = newIds.length
  out.expected = picks
  out.doubleInsert = newIds.length > picks || Object.values(rec.adds).some((n) => n > 1)
  out.addsPerId = rec.adds
  const last = frames.at(-1)
  /* The first new section (in a rapid pair, the first pick). */
  const id = newIds[0]
  const end = last?.rows.find((r) => r.id === id)
  const seen = frames.map((f) => ({ t: f.t, r: f.rows.find((x) => x.id === id), f }))
  const visible = seen.filter((s) => s.r && s.r.on && s.r.op > 0.05)
  out.firstPixelMs = visible.length ? visible[0].t : null
  const finalLook = end?.look
  const atFinal = visible.find((s, i) => visible.slice(i).every((x) => x.r.look === finalLook && Math.abs(x.r.h - end.h) <= 1 && x.r.sheet !== false))
  out.finalMs = atFinal ? atFinal.t : null
  out.unstyledFrames = visible.filter((s) => s.r.sheet === false || s.r.look !== finalLook).length
  out.resizedFrames = visible.filter((s) => Math.abs(s.r.h - end.h) > 1).length
  /* Above the gap: never moved on the page. Below it: the largest single-frame step. */
  const first = rec.frames[0]
  /* Above: the sections before where it landed, in the page's order at the end. */
  const order = last ? last.rows.map((r) => r.id) : []
  const at = id ? order.indexOf(id) : order.length
  const above = order.slice(0, Math.max(0, at)).filter((x) => beforeIds.includes(x))
  out.landedAt = at
  const startTop = new Map(first.rows.map((r) => [r.id, r.top]))
  let aboveMax = 0, snap = 0
  /* In a rapid pair, the page moving for the second pick is the second's: these are measured up to it. */
  const secondAt = newIds[1] ? frames.findIndex((f) => f.rows.some((r) => r.id === newIds[1])) : -1
  for (let i = 0; i < (secondAt >= 0 ? secondAt : frames.length); i++) {
    const f = frames[i], prev = i ? frames[i - 1] : first
    for (const r of f.rows) {
      if (r.isNew) continue
      if (above.includes(r.id) && startTop.has(r.id)) aboveMax = Math.max(aboveMax, Math.abs(r.top - startTop.get(r.id)))
      const p = prev.rows.find((x) => x.id === r.id)
      /* Not a box with no height (an overlay group's wrapper: what it holds is fixed to the window, and does not move). */
      /* And only where it can be seen: on screen in this frame or the one before. */
      const seenIn = (fr, y) => fr.vh === undefined || (y < fr.scroll + fr.vh && y + r.h > fr.scroll)
      if (p && !above.includes(r.id) && r.h >= 2 && (seenIn(f, r.top) || seenIn(prev, p.top))) snap = Math.max(snap, Math.abs(r.top - p.top))
    }
  }
  out.aboveShiftPx = Math.round(aboveMax * 10) / 10
  out.belowSnapPx = Math.round(snap)
  out.cls = rec.cls
  /* Scrolls: movements separated by three still frames; a movement turned back; a single jump. */
  const ys = [first.scroll, ...frames.map((f) => f.scroll)]
  let moves = 0, reversals = 0, jumps = 0, still = 3, dir = 0
  for (let i = 1; i < ys.length; i++) {
    const d = ys[i] - ys[i - 1]
    if (Math.abs(d) < 0.5) { still++; continue }
    if (still >= 3) moves++
    still = 0
    const s = Math.sign(d)
    if (dir && s !== dir) reversals++
    dir = s
    /* A jump: more than 120px in one frame with no movement either side of it (a smooth scroll's middle frames are fast, not jumps). */
    const before = i > 1 ? Math.abs(ys[i - 1] - ys[i - 2]) : 0, after = i + 1 < ys.length ? Math.abs(ys[i + 1] - ys[i]) : 0
    if (Math.abs(d) > 120 && before < 0.5 && after < 0.5) jumps++
  }
  out.scrollMoves = moves
  out.scrollReversals = reversals
  out.scrollJumps = jumps
  /* The canvas: its frame replaced, or a section that was there missing for a frame. */
  out.canvasReplaced = rec.fronts
  out.sectionsGoneFrames = frames.filter((f) => beforeIds.some((b) => !f.rows.some((r) => r.id === b))).length
  /* Long tasks between the click and the end; the worst frame while the dialog closes. */
  const lts = rec.lt.filter((x) => x.at >= -5)
  out.longTasks = lts.length
  out.longTaskMax = lts.reduce((m, x) => Math.max(m, x.ms), 0)
  const closing = (rec.editorFrames ?? frames).filter((f) => f.t >= 0 && f.t <= 400)
  let worst = 0
  for (let i = 1; i < closing.length; i++) worst = Math.max(worst, closing[i].t - closing[i - 1].t)
  out.closeWorstFrameMs = Math.round(worst)
  /* The first answer to the click a person sees: the dialog drawn fading (or gone, with reduced motion). */
  const fading = (rec.editorFrames ?? frames).find((f) => f.t >= 0 && f.libOp !== null && f.libOp < 0.995)
  out.closeStartMs = fading ? fading.t : null
  /* The ring on the section picked last (in a rapid pair, the second takes the selection): on, off, on again is a flash. */
  const ringId = newIds.at(-1)
  const ring = frames.map((f) => f.rows.find((x) => x.id === ringId)).filter(Boolean).map((r) => r.ring)
  let flips = 0
  for (let i = 1; i < ring.length; i++) if (ring[i] !== ring[i - 1]) flips++
  out.ringEnd = !!last?.rows.find((r) => r.id === ringId)?.ring
  out.ringFlash = flips > 1
  out.settledMs = last?.t ?? null
  return out
}

async function settledCanvas(cv, ms = 900, cap = 6000) {
  const t0 = Date.now()
  let last = "", since = Date.now()
  while (Date.now() - t0 < cap) {
    const now = await cv(() => { const f = window.__ins.frames.at(-1); return f ? `${f.scroll}|${f.rows.map((r) => `${r.id}:${r.top}:${r.h}:${r.op ?? ""}:${r.ring ?? ""}:${r.look ?? ""}`).join(",")}|${f.lib}` : "" })
    if (now !== last) { last = now; since = Date.now() }
    else if (Date.now() - since >= ms) return
    await sleep(100)
  }
}

/* ── One theme, RUNS inserts over sessions of PER_SESSION ── */
async function theme(kind) {
  const results = []
  let compat = null
  if (kind === "imported") compat = await importedTheme({ edit: withOwnSections })
  let delayMs = 0
  const delayed = new Set()
  const sessions = Math.ceil(RUNS / PER_SESSION)
  for (let s = 0; s < sessions; s++) {
    const activity = `window.PROBE_ACTIVITY={events:[],syncAt:"2026-10-01T00:00:00.000Z"};window.PROBE_CONNECTIONS={agents:[{id:"a1",name:"Claude Code",kind:"claude",online:true}],github:null,latest:null};`
    const globals = kind === "imported" ? activity : STORELIB_GLOBALS + activity
    const ed = await openEditor({
      kind: kind === "imported" ? "imported" : "storelib", bundle, css, compat, globals, init: RECORDER, settle: 2500,
      assetDelay: (name) => (delayed.has(name) ? delayMs : 0),
    })
    const { page, js } = ed
    /* The canvas's document: the editor's own, or the imported theme's frame (the front one, found again each time). */
    const cv = kind === "imported" ? async (fn, ...a) => (await ed.front()).evaluate(fn, ...a) : js
    const cdp = await page.createCDPSession()
    /* The library's previews are drawn in idle time: given that time, as a person who opens the editor and looks first. */
    await sleep(2500)
    let used = new Set()
    for (let i = 0; i < PER_SESSION && results.length < RUNS; i++) {
      /* FORCE=cpu4,rapid,edit,still,slow: every run takes those (to look at one case); the rest stay random. */
      const force = (process.env.FORCE ?? "").split(",")
      const cpu = force.includes("cpu4") || rand() < 0.5 ? 4 : 1
      const slow = kind === "imported" && (force.includes("slow") || rand() < 0.5) ? Math.round(300 + rand() * 1200) : 0
      const edit = force.includes("edit") || rand() < 0.25
      const rapid = force.includes("rapid") || rand() < 0.2
      const reduced = force.includes("still") || rand() < 0.1
      await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: reduced ? "reduce" : "no-preference" }])
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: cpu })
      const ids = await cv(() => window.__ins.boxes().map((b) => b.id))
      const bodyIds = await cv(() => window.__ins.native()
        ? [...document.querySelectorAll("#wb-preview-root [id^='wb-section-']")].filter((e) => !e.querySelector("[data-chrome]") && !e.matches("[data-chrome]")).map((e) => e.id.slice(11))
        : [...document.querySelectorAll("main .shopify-section")].map((e) => e.id.slice(16)))
      const gap = 1 + Math.floor(rand() * Math.max(1, bodyIds.length - 1))
      /* Open Add a section at that gap, the gap first brought on screen, as a person scrolls to it. */
      if (kind === "imported") {
        const f = await ed.front()
        await f.evaluate((gap) => {
          const main = [...document.querySelectorAll("main .shopify-section")]
          const b = main[gap] ?? null, a = main[gap - 1] ?? null
          ;(b ?? a).scrollIntoView({ block: "center" })
          parent.postMessage({ storelib: 1, type: "add-section", before: b ? b.id.slice(16) : null, after: a ? a.id.slice(16) : null }, "*")
        }, gap)
      } else {
        await js((gap) => {
          const strips = [...document.querySelectorAll("#wb-preview-root [aria-label='Add a section here']")]
          const s = strips[Math.min(gap, strips.length - 1)]
          s.scrollIntoView({ block: "center" })
          s.click()
        }, gap)
      }
      await page.waitForFunction(() => document.querySelector("[data-section-library-layer]")?.getAttribute("data-state") === "open", { timeout: 8000 }).catch(() => {})
      await sleep(cpu > 1 ? 900 : 500)
      /* A card: on an imported theme one of its own-stylesheet sections not added yet in this session when the network is slow. */
      const card = await js(({ kind, slow, used }) => {
        const all = [...document.querySelectorAll("[data-section-library] [data-library-card]")].filter((c) => !c.hidden && c.getClientRects().length)
        const bad = /header|footer|announcement|popup|tab-bar|top-bar|overlay|review/i
        let ok = all.filter((c) => !bad.test(c.getAttribute("data-library-card")))
        if (kind === "imported") {
          const own = ok.filter((c) => /^ins-/.test(c.getAttribute("data-library-card")) && !used.includes(c.getAttribute("data-library-card")))
          if (slow || own.length) ok = own.length ? own : ok
        }
        if (!ok.length) return null
        const c = ok[Math.floor(Math.random() * ok.length)]
        c.scrollIntoView({ block: "center" })
        const r = c.getBoundingClientRect()
        return { type: c.getAttribute("data-library-card"), x: Math.round(r.left + r.width / 2), y: Math.round(r.top + Math.min(r.height / 2, 60)) }
      }, { kind, slow, used: [...used] })
      if (!card) { console.log("    no card to pick"); break }
      used.add(card.type)
      delayed.clear()
      if (slow) { delayMs = slow; delayed.add(`section-${card.type}.css`) }
      await sleep(250)
      await js((ids) => window.__ins.arm(ids), ids)
      if (kind === "imported") await cv((ids) => window.__ins.arm(ids), ids)
      await page.mouse.click(card.x, card.y)
      let picks = 1, opened2 = null, second2 = null
      if (edit) {
        /* A page edit from a connected agent, landing as the section does. */
        const other = bodyIds[Math.floor(rand() * bodyIds.length)]
        await js((other) => {
          const a = window.PROBE_ACTIVITY
          if (!a) return
          const id = (a.events.at(-1)?.id ?? 0) + 1
          a.events.push({ id, agent_name: "Claude Code", path: "pages/home", action: "page", created_at: new Date().toISOString(), detail: { page: "home", ops: [{ kind: "update_section", id: other, settings: { heading: `Edited ${id}` } }] } })
          window.dispatchEvent(new Event("focus"))
        }, other)
      }
      if (rapid) {
        /* Again at once: the next gap, the first card that is there. */
        await page.waitForFunction(() => document.querySelector("[data-section-library-layer]")?.getAttribute("data-state") !== "open", { timeout: 4000 }).catch(() => {})
        await sleep(60)
        if (kind === "imported") {
          const f = await ed.front()
          await f.evaluate(() => { const main = [...document.querySelectorAll("main .shopify-section")]; parent.postMessage({ storelib: 1, type: "add-section", before: main[1]?.id.slice(16) ?? null, after: main[0]?.id.slice(16) ?? null }, "*") }).catch(() => {})
        } else await js(() => document.querySelectorAll("#wb-preview-root [aria-label='Add a section here']")[1]?.click())
        opened2 = await page.waitForFunction(() => document.querySelector("[data-section-library-layer]")?.getAttribute("data-state") === "open", { timeout: 4000 }).then(() => true, () => false)
        await sleep(cpu > 1 ? 500 : 280)
        const second = await js(() => { const c = [...document.querySelectorAll("[data-section-library] [data-library-card]")].find((c) => !c.hidden && c.getClientRects().length && !/header|footer|announcement|popup|tab-bar|top-bar|overlay|review/.test(c.getAttribute("data-library-card"))); if (!c) return null; c.scrollIntoView({ block: "center" }); const r = c.getBoundingClientRect(); return { type: c.getAttribute("data-library-card"), x: Math.round(r.left + r.width / 2), y: Math.round(r.top + Math.min(r.height / 2, 60)) } })
        if (second) { await sleep(120); await page.mouse.click(second.x, second.y); picks = 2; second2 = second.type }
      }
      await sleep(slow ? slow + 900 : 1200)
      await settledCanvas(cv)
      const editorRec = await js(() => window.__ins.stop())
      const frameRec = kind === "imported" ? await cv(() => window.__ins.stop()).catch(() => null) : null
      const rec = merge(editorRec, frameRec)
      const r = { kind, run: results.length + 1, cpu, slow, edit, rapid, reduced, type: card.type, gap, ...(rapid ? { opened2, second2 } : {}), ...judge(rec, ids, picks) }
      results.push(r)
      if (process.env.DUMP) writeFileSync(`${process.env.DUMP}-${kind}-${r.run}.json`, JSON.stringify({ r, lt: rec.lt, clicks: rec.clicks, calls: rec.calls, frames: rec.frames.map((f) => ({ t: f.t, scroll: f.scroll, lib: f.lib, libOp: f.libOp, n: f.rows.length, fresh: f.rows.filter((x) => x.isNew), rows: f.rows.map((x) => [x.id.slice(0, 12), x.top]) })) }, null, 1))
      console.log(`  ${kind.padEnd(8)} #${String(r.run).padStart(2)} cpu${cpu} net${String(slow).padStart(4)} ${edit ? "edit " : "     "}${rapid ? "rapid " : "      "}${reduced ? "still " : "      "}${card.type.slice(0, 18).padEnd(18)} first ${String(r.firstPixelMs).padStart(6)}ms final ${String(r.finalMs).padStart(6)}ms unstyled ${r.unstyledFrames} resized ${r.resizedFrames} above ${r.aboveShiftPx}px snap ${r.belowSnapPx}px cls ${r.cls} scroll ${r.scrollMoves}/${r.scrollReversals}/${r.scrollJumps} ins ${r.inserted}/${r.expected}${r.doubleInsert ? " DOUBLE" : ""} lt ${r.longTasks}x max ${r.longTaskMax} close@${r.closeStartMs}ms worst ${r.closeWorstFrameMs}ms ring ${r.ringEnd ? "on" : "off"}${r.ringFlash ? " FLASH" : ""}${r.canvasReplaced ? ` replaced ${r.canvasReplaced}` : ""}${r.sectionsGoneFrames ? ` gone ${r.sectionsGoneFrames}` : ""}${r.rapid ? ` 2nd ${r.opened2 ? "opened" : "NOT OPENED"} ${r.second2 ?? "no card"}` : ""}`)
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 })
      await sleep(400)
    }
    await ed.close()
  }
  return results
}

const median = (a) => { const s = a.filter((x) => x !== null).sort((x, y) => x - y); return s.length ? s[Math.floor((s.length - 1) / 2)] : null }
const worst = (a) => { const s = a.filter((x) => x !== null); return s.length ? Math.max(...s) : null }
const sum = (a) => a.reduce((n, x) => n + (x ? 1 : 0), 0)

const all = {}
let broken = 0
for (const k of THEMES) {
  console.log(`\n══ ${k === "imported" ? "Imported theme (Materia fixture, six own-stylesheet sections)" : "Storelib theme"}, ${RUNS} runs ══`)
  const rs = await theme(k)
  all[k] = rs
  const row = (name, f, agg = "mw") => {
    const v = rs.map(f)
    console.log(`    ${name.padEnd(34)} ${agg === "count" ? `${sum(v)} of ${rs.length}` : `median ${median(v)}  worst ${worst(v)}`}`)
  }
  console.log(`\n  ${k}: median and worst over ${rs.length} runs`)
  row("click to first pixel (ms)", (r) => r.firstPixelMs)
  row("click to final look (ms)", (r) => r.finalMs)
  row("unstyled frames on screen", (r) => r.unstyledFrames)
  row("resized frames on screen", (r) => r.resizedFrames)
  row("sections above moved (px)", (r) => r.aboveShiftPx)
  row("below: largest 1-frame step (px)", (r) => r.belowSnapPx)
  row("layout shift (CLS, canvas)", (r) => r.cls)
  row("scroll movements", (r) => r.scrollMoves)
  row("scroll turned back", (r) => r.scrollReversals)
  row("scroll jumps > 120px", (r) => r.scrollJumps)
  row("long tasks over 50ms", (r) => r.longTasks)
  row("longest task (ms)", (r) => r.longTaskMax)
  row("click to the dialog closing (ms)", (r) => r.closeStartMs)
  row("worst frame while closing (ms)", (r) => r.closeWorstFrameMs)
  row("double inserts", (r) => r.doubleInsert, "count")
  row("missing inserts", (r) => r.inserted < r.expected, "count")
  row("canvas frame replaced", (r) => r.canvasReplaced > 0, "count")
  row("existing section gone a frame", (r) => r.sectionsGoneFrames > 0, "count")
  row("ring flash", (r) => r.ringFlash, "count")
  row("ring missing at the end", (r) => !r.ringEnd, "count")
  if (BUDGET) {
    const bad = (what, n) => { if (n) { broken++; console.log(`    FAIL  ${what}: ${n}`) } }
    bad("first pixel over 100ms (cpu 1x)", rs.filter((r) => r.cpu === 1 && !(r.firstPixelMs !== null && r.firstPixelMs < 100)).length)
    bad("unstyled frames", rs.filter((r) => r.unstyledFrames > 0).length)
    bad("sections above moved", rs.filter((r) => r.aboveShiftPx > 0.5).length)
    bad("double or missing inserts", rs.filter((r) => r.doubleInsert || r.inserted < r.expected).length)
    bad("scroll turned back or jumped", rs.filter((r) => r.scrollReversals > 0 || r.scrollJumps > 0 && !r.reduced).length)
    bad("more than one scroll movement", rs.filter((r) => r.scrollMoves > 1 && !r.rapid).length)
    bad("ring flash", rs.filter((r) => r.ringFlash).length)
  }
}
if (process.env.JSON) writeFileSync(process.env.JSON, JSON.stringify(all, null, 1))
console.log(broken ? `\n${broken} budget(s) broken` : "\nall budgets held")
process.exit(broken && BUDGET ? 1 : 0)
