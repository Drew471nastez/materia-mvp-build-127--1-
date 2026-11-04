/**
 * ===========================================================================
 *  THE EDITOR AFTER TEN PUSHES AND TEN LARGE THEME CHANGES (round 13)
 * ===========================================================================
 * The owner: "After a GitHub push, or changes in the theme settings, or some
 * massive change, something triggers in the website builder editor that
 * causes a lot of bugs, glitches, scroll issues, scatter, and makes it very
 * laggy, so I have to refresh the whole website builder editor."
 *
 * The real editor (scripts/editor-probe-harness.mjs: the shipped page,
 * bundled, only the network answered in the page), open on
 *
 *   IMPORTED   the Materia store (tests/fixtures/shopify-materia through the
 *              real converter, scripts/materia-store-kit.mjs laid over it),
 *              with the scripts store themes ship: a sticky header on a
 *              window scroll listener, an autoplaying slider (setInterval), a
 *              marquee on a requestAnimationFrame loop, a ResizeObserver and
 *              an IntersectionObserver, each started on DOMContentLoaded and
 *              again on shopify:section:load, as Shopify asks of a theme, and
 *              never taken down (most theme packs leave them). Every section
 *              prints a theme colour, as store themes print their scheme.
 *   NATIVE     a Storelib theme home page
 *
 * Then, while it stays open:
 *
 *   PUSH x N       what the editor receives after a push to the linked GitHub
 *                  repository: the theme's files changed on the server (its
 *                  stylesheet, its script, a section's file; the theme settings
 *                  every other push) and the activity log's lines for them
 *                  (app/api/github/webhook -> lib/github-sync -> the activity
 *                  log), read by the editor's own poll (site-connections.tsx
 *                  useSiteActivity)
 *   SETTINGS x N   a large theme settings change: colours, the colour schemes,
 *                  both fonts, sizes, page width, buttons (14 settings) by
 *                  Theme settings' own onChange, a frame apart, back and forth
 *                  (native: every colour scheme and the default scheme)
 *   EDITS x 45     (imported) a long session of small changes, each drawing
 *                  one section again
 *
 * and after each one, in the canvas's front frame and the editor:
 *
 *   SCROLL      a wheel over the canvas, 40 notches, every frame timed inside
 *               the scrolled document: frames dropped, the longest frame
 *   LISTENERS   DOMDebugger.getEventListeners on the frame's window and
 *               document, and on the editor's
 *   ELEMENTS    iframes in the canvas, <style>/<link>/<script> in the frame
 *   OBSERVERS   Mutation/Resize/IntersectionObservers alive, frame callbacks
 *               asked per frame (animation loops)
 *   TIMERS      setInterval alive, setTimeout pending (an init script in
 *               every document counts them)
 *   PUSH        whether the push's stylesheet, script and section are what
 *               the canvas shows (css/js/section)
 *   HEAP        JSHeapUsedSize after collection, and what is still reachable
 *               (a heap snapshot) on the fresh load and at the end
 *   SCATTER     the canvas, scrolled to its top, against the same page on the
 *               fresh load (share of pixels that differ; an entrance still
 *               playing is looked at again 1.5s later)
 *
 *   npx tsx scripts/check-wb-stability-r13.mjs
 *   ONLY=imported|native   N=10   EDITS=45   EDITOR_BUNDLE=<file>   JSON=<file>
 *   SHOTS=<dir>   BUDGET=0 (report without failing)
 *
 * Round 13, the bundle before (origin/main 0f534b831) and after, same machine:
 *
 *                                         before            after
 *   pushes on the canvas (css/js/section)  0/0/10            10/10/10
 *   observers+intervals in the frame       9 -> 130          9 -> 9
 *   listeners on the frame                 52 -> 63          52 -> 52
 *   scatter after even settings changes    71%               0%
 *   (the rest in the round's report)
 *
 * Budgets, the end against the fresh load:
 *   listeners on the frame's window+document      <= fresh + 4
 *   observers + intervals alive in the frame       <= fresh + 2
 *   frame callbacks per frame                      <= fresh + 1
 *   the last push on the canvas                    css, js and section
 *   iframes in the canvas                          <= 2 once settled
 *   longest frame while scrolling                  <= max(3x fresh, 120ms)
 *   scatter                                        <= 2%
 *   retained heap (a heap snapshot)                <= after 4 changes + 6MB (flat once
 *                                                  the editor's 30 undo steps are full)
 */
import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { inflateSync } from "node:zlib"

process.env.PROBE_CSS = process.env.PROBE_CSS ?? "source"
const { bundle, css } = await import("./editor-probe-harness.mjs")
const { importedTheme, openEditor, sleep, STORELIB_GLOBALS, withMarkup } = await import("./canvas-probe-kit.mjs")
const { STORE_CHANGES } = await import("./materia-store-kit.mjs")

const N = Number(process.env.N ?? 10)
const ONLY = process.env.ONLY ? new RegExp(process.env.ONLY, "i") : null
const BUDGET = process.env.BUDGET !== "0"
const SHOTS = process.env.SHOTS ?? ""
if (SHOTS) mkdirSync(SHOTS, { recursive: true })
let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : BUDGET ? "FAIL" : "note"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got).slice(0, 300)})`}`)
  if (!ok && BUDGET) broken++
}
const within = (p, ms = 8000) => Promise.race([p, new Promise((r) => setTimeout(() => r(null), ms))])
const report = {}

/* ── In every document, the editor's and each frame's: timers, observers and frame callbacks alive ── */
const INIT = String.raw`
(function () {
  if (window.__st) return
  var S = window.__st = { intervals: new Set(), timeouts: new Set(), obs: { MutationObserver: 0, ResizeObserver: 0, IntersectionObserver: 0 }, raf: 0 }
  var si = window.setInterval, ci = window.clearInterval, st = window.setTimeout, ct = window.clearTimeout, raf = window.requestAnimationFrame
  window.setInterval = function () { var id = si.apply(this, arguments); S.intervals.add(id); return id }
  window.clearInterval = function (id) { S.intervals.delete(id); return ci.apply(this, arguments) }
  window.setTimeout = function (fn) {
    var args = Array.prototype.slice.call(arguments), id
    if (typeof fn === "function") args[0] = function () { S.timeouts.delete(id); return fn.apply(this, arguments) }
    id = st.apply(this, args); S.timeouts.add(id); return id
  }
  window.clearTimeout = function (id) { S.timeouts.delete(id); return ct.apply(this, arguments) }
  window.requestAnimationFrame = function (fn) { S.raf++; return raf.call(window, fn) }
  ;["MutationObserver", "ResizeObserver", "IntersectionObserver"].forEach(function (name) {
    var O = window[name]
    if (typeof O !== "function") return
    var W = function (cb, o) { var x = new O(cb, o); var on = false; var obs = x.observe, dis = x.disconnect
      x.observe = function () { if (!on) { on = true; S.obs[name]++ } return obs.apply(x, arguments) }
      x.disconnect = function () { if (on) { on = false; S.obs[name]-- } return dis.apply(x, arguments) }
      return x }
    W.prototype = O.prototype
    window[name] = W
  })
  /* Frame callbacks asked for per frame, over 30 frames: a theme's animation loop started twice runs twice. */
  window.__stRaf = function () { return new Promise(function (done) { var a = S.raf, n = 0; var tick = function () { if (++n < 31) raf.call(window, tick); else done(Math.round((S.raf - a - 30) / 30 * 10) / 10) }; raf.call(window, tick) }) }
  window.__stRead = function () {
    var probe = document.querySelector("[data-probe-push]")
    return { intervals: S.intervals.size, timeouts: S.timeouts.size, mo: S.obs.MutationObserver, ro: S.obs.ResizeObserver, io: S.obs.IntersectionObserver,
      styles: document.querySelectorAll("style").length, links: document.querySelectorAll("link[rel=stylesheet]").length, scripts: document.querySelectorAll("script").length,
      push: [getComputedStyle(document.documentElement).getPropertyValue("--probe-push").trim() || "0", String(window.__probePush || 0), probe ? probe.getAttribute("data-probe-push") : "0"].join("/") }
  }
})()
`

/* ── The store theme's own scripts, as theme packs write them ── */
const THEME_JS = `
;(function () {
  /* Started on the page and again on every shopify:section:load, as Shopify asks a theme to; never taken down. */
  var init = function (scope) {
    var header = scope.querySelector && scope.querySelector(".hd, header");
    if (header) window.addEventListener("scroll", function () { header.classList.toggle("is-stuck", window.scrollY > 10); }, { passive: true });
    var hero = scope.querySelector && scope.querySelector("[data-hero]");
    if (hero) {
      setInterval(function () { hero.setAttribute("data-tick", String(Date.now() % 1000)); }, 5000);
      new ResizeObserver(function () { hero.style.setProperty("--w", hero.clientWidth + "px"); }).observe(hero);
      document.addEventListener("visibilitychange", function () {});
    }
    var bar = scope.querySelector && scope.querySelector(".tb");
    if (bar) { var x = 0; var loop = function () { x = (x + 1) % 1000; bar.style.setProperty("--marquee", x + "px"); requestAnimationFrame(loop); }; requestAnimationFrame(loop); }
    var reveal = new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) e.target.classList.add("is-seen"); }); });
    Array.prototype.forEach.call(scope.querySelectorAll ? scope.querySelectorAll(".shopify-section") : [], function (s) { reveal.observe(s); });
    if (scope.classList && scope.classList.contains("shopify-section")) reveal.observe(scope);
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", function () { init(document); }); else init(document);
  document.addEventListener("shopify:section:load", function (e) { init(e.target); });
})();
`

async function storeTheme() {
  return importedTheme({ store: true, edit: async (zip) => {
    const js = await zip.file("assets/materia.js").async("string")
    zip.file("assets/materia.js", `${js}\n${THEME_JS}`)
    /* Every section prints a theme setting, as store themes print their colour scheme on each: a theme colour changed draws every section again. */
    for (const name of Object.keys(zip.files).filter((n) => /^sections\/[^/]+\.liquid$/.test(n))) {
      const text = await zip.file(name).async("string")
      zip.file(name, text.replace(/<([a-z][a-z0-9]*) class="/, '<$1 data-probe-scheme="{{ settings.color_text }}" class="'))
    }
  } })
}

/* ── A PNG from a screenshot, to RGBA (no dependency) ── */
function decodePng(buf) {
  let o = 8, w = 0, h = 0, type = 0
  const idat = []
  while (o < buf.length) {
    const len = buf.readUInt32BE(o), kind = buf.toString("ascii", o + 4, o + 8)
    if (kind === "IHDR") { w = buf.readUInt32BE(o + 8); h = buf.readUInt32BE(o + 12); type = buf[o + 17] }
    else if (kind === "IDAT") idat.push(buf.subarray(o + 8, o + 8 + len))
    o += 12 + len
  }
  const bpp = type === 6 ? 4 : 3
  const raw = inflateSync(Buffer.concat(idat))
  const out = Buffer.alloc(w * h * 4)
  const stride = w * bpp
  let prev = Buffer.alloc(stride)
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)]
    const line = Buffer.from(raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)))
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? line[x - bpp] : 0, b = prev[x], c = x >= bpp ? prev[x - bpp] : 0
      if (f === 1) line[x] = (line[x] + a) & 255
      else if (f === 2) line[x] = (line[x] + b) & 255
      else if (f === 3) line[x] = (line[x] + ((a + b) >> 1)) & 255
      else if (f === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); line[x] = (line[x] + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 255 }
    }
    for (let x = 0; x < w; x++) { out[(y * w + x) * 4] = line[x * bpp]; out[(y * w + x) * 4 + 1] = line[x * bpp + 1]; out[(y * w + x) * 4 + 2] = line[x * bpp + 2]; out[(y * w + x) * 4 + 3] = 255 }
    prev = line
  }
  return { w, h, data: out }
}
const pixelDiff = (a, b) => {
  if (!a || !b || a.w !== b.w || a.h !== b.h) return 1
  let d = 0
  for (let i = 0; i < a.data.length; i += 4) if (Math.abs(a.data[i] - b.data[i]) + Math.abs(a.data[i + 1] - b.data[i + 1]) + Math.abs(a.data[i + 2] - b.data[i + 2]) > 30) d++
  return d / (a.w * a.h)
}

/* ── Measuring ── */
async function listenerCount(frame) {
  if (!frame) return null
  try {
    const client = frame.client
    let total = 0
    for (const expr of [() => window, () => document]) {
      const h = await frame.evaluateHandle(expr)
      const { listeners } = await client.send("DOMDebugger.getEventListeners", { objectId: h.remoteObject().objectId })
      total += listeners.length
      await h.dispose()
    }
    return total
  } catch {
    return -1
  }
}

async function canvasBox(page, kind) {
  return page.evaluate((kind) => {
    const el = kind === "imported" ? document.querySelector("iframe[data-compat-frame='front']") : document.querySelector("#wb-preview-root")
    if (!el) return null
    const r = el.getBoundingClientRect()
    const v = { x: Math.max(0, r.left), y: Math.max(0, r.top), width: Math.min(r.width, innerWidth - r.left), height: Math.min(r.height, innerHeight - r.top) }
    return v.width > 10 && v.height > 10 ? v : null
  }, kind)
}

/* Frames timed inside the scrolled document while a wheel turns over it. */
async function scrollTest(page, kind, front) {
  const box = await canvasBox(page, kind)
  if (!box) return null
  const target = kind === "imported" ? await front() : page.mainFrame()
  if (!target) return null
  await within(target.evaluate(() => {
    window.__sc = { t: [], stop: false }
    const tick = (t) => { window.__sc.t.push(t); if (!window.__sc.stop) requestAnimationFrame(tick) }
    requestAnimationFrame(tick)
  }), 4000)
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  for (let i = 0; i < 40; i++) {
    await page.mouse.wheel({ deltaY: i < 20 ? 120 : -120 })
    await sleep(16)
  }
  await sleep(400)
  return within(target.evaluate(() => {
    const s = window.__sc
    s.stop = true
    const iv = []
    for (let i = 1; i < s.t.length; i++) iv.push(s.t[i] - s.t[i - 1])
    return { frames: s.t.length, dropped: iv.reduce((n, d) => n + Math.max(0, Math.round(d / 16.7) - 1), 0), longest: Math.round(Math.max(0, ...iv)) }
  }), 4000)
}

/*
  WHAT THE TAB HOLDS: everything still reachable, read from a heap snapshot. JSHeapUsedSize after a forced
  collection still counts what a frame let go of and V8 has not compacted yet: it climbs with every page loaded
  behind while the snapshot of the same tab stays flat.
*/
async function retainedMB(cdp) {
  const chunks = []
  const on = (e) => chunks.push(e.chunk)
  cdp.on("HeapProfiler.addHeapSnapshotChunk", on)
  await cdp.send("HeapProfiler.takeHeapSnapshot", { reportProgress: false })
  cdp.off("HeapProfiler.addHeapSnapshotChunk", on)
  const j = JSON.parse(chunks.join(""))
  const nf = j.snapshot.meta.node_fields.length, si = j.snapshot.meta.node_fields.indexOf("self_size")
  let total = 0
  for (let i = si; i < j.nodes.length; i += nf) total += j.nodes[i]
  return Math.round(total / 1e5) / 10
}

/* The canvas alone: whatever of the editor floats over it (a notice, the Ask bar) is hidden for the picture. */
async function shoot(page, box, kind) {
  await page.evaluate((b, kind) => {
    const hidden = window.__probeHidden = []
    const canvas = kind === "imported" ? document.querySelector("iframe[data-compat-frame='front']") : document.querySelector("#wb-preview-root")
    for (let x = b.x + 4; x < b.x + b.width; x += 24) for (let y = b.y + 4; y < b.y + b.height; y += 24) {
      const top = document.elementFromPoint(x, y)
      if (!top || top === canvas || top.contains(canvas) || (kind !== "imported" && canvas.contains(top))) continue
      let el = top
      while (el.parentElement && !el.parentElement.contains(canvas) && getComputedStyle(el).position === "static") el = el.parentElement
      if (el.style.visibility !== "hidden") { hidden.push([el, el.style.visibility]); el.style.visibility = "hidden" }
    }
    for (const el of document.body.querySelectorAll("*")) {
      if (el.contains(canvas) || canvas.contains(el) || getComputedStyle(el).position !== "fixed") continue
      const r = el.getBoundingClientRect()
      if (r.right <= b.x || r.left >= b.x + b.width || r.bottom <= b.y || r.top >= b.y + b.height || el.style.visibility === "hidden") continue
      hidden.push([el, el.style.visibility]); el.style.visibility = "hidden"
    }
  }, box, kind)
  const buf = await page.screenshot({ clip: box, type: "png" })
  await page.evaluate(() => { for (const [el, v] of window.__probeHidden ?? []) el.style.visibility = v })
  return buf
}

async function measure(ed, kind, label, fresh) {
  const { page, front, cdp } = ed
  await sleep(300)
  const scroll = await scrollTest(page, kind, front)
  const f = kind === "imported" ? await front() : null
  if (f) await within(f.evaluate(() => { scrollTo(0, 0) }), 3000)
  else await page.evaluate(() => { const el = document.querySelector("#wb-preview-root [data-wb-scroll]") ?? document.querySelector("#wb-preview-root"); if (el) el.scrollTop = 0 })
  await sleep(700)
  const frame = f ? await within(f.evaluate(async () => (window.__stRead ? { ...window.__stRead(), raf: await window.__stRaf() } : null)), 4000) : null
  const frameListeners = f ? await listenerCount(f) : null
  const editor = await page.evaluate(() => window.__stRead())
  const editorListeners = await listenerCount(page.mainFrame())
  const iframes = await page.evaluate(() => document.querySelectorAll("[data-compat-frame]").length)
  for (let k = 0; k < 3; k++) { await cdp.send("HeapProfiler.collectGarbage"); await sleep(150) }
  const dom = await cdp.send("Memory.getDOMCounters").catch(() => null)
  const { metrics } = await cdp.send("Performance.getMetrics")
  const heap = Math.round((metrics.find((m) => m.name === "JSHeapUsedSize")?.value ?? 0) / 1e5) / 10
  const box = await canvasBox(page, kind)
  let shot = null, scatter = null
  if (box) {
    const buf = await shoot(page, box, kind)
    shot = decodePng(buf)
    if (SHOTS) writeFileSync(join(SHOTS, `${kind}-${label.replace(/[^a-z0-9]+/gi, "-")}.png`), buf)
    if (fresh?.shot) scatter = Math.round(pixelDiff(shot, fresh.shot) * 1000) / 10
    /* An entrance still playing is not a page out of place: what differs is looked at again once it has had time to end. */
    if (scatter > 2) {
      const first = scatter
      await sleep(1500)
      scatter = Math.round(pixelDiff(decodePng(await shoot(page, box, kind)), fresh.shot) * 1000) / 10
      console.log(`     (${first}% differed at first, ${scatter}% 1.5s later)`)
    }
  }
  const row = { label, scroll, frame, frameListeners, editorListeners, editor: { intervals: editor.intervals, timeouts: editor.timeouts }, iframes, documents: dom?.documents ?? null, heap, scatter, shot }
  const fs = frame ? `obs ${frame.mo}/${frame.ro}/${frame.io} raf/f ${frame.raf} int ${frame.intervals} st/ln/sc ${frame.styles}/${frame.links}/${frame.scripts} push ${frame.push}` : "-"
  console.log(`  ${label.padEnd(12)} scroll drop ${String(scroll?.dropped ?? "-").padStart(3)} longest ${String(scroll?.longest ?? "-").padStart(4)}ms | frame lis ${String(frameListeners ?? "-").padStart(3)} ${fs} | editor lis ${editorListeners} int ${editor.intervals} | iframes ${iframes} docs ${dom?.documents} heap ${heap}MB scatter ${scatter ?? "-"}%`)
  return row
}

/* Waits until the canvas has stopped changing: the same front frame, the same frames, no request, for `quiet` ms. */
async function settle(page, quiet = 2000, cap = 25000) {
  const t0 = Date.now()
  let last = null, since = Date.now()
  while (Date.now() - t0 < cap) {
    const now = await page.evaluate(() => {
      const front = document.querySelector("[data-compat-frame='front']")
      if (front && !front.__pid) front.__pid = Math.random().toString(36).slice(2)
      return `${document.querySelectorAll("[data-compat-frame]").length}:${front?.__pid ?? ""}:${window.probeCalls.length}`
    })
    if (now !== last) { last = now; since = Date.now() }
    else if (Date.now() - since >= quiet) return
    await sleep(250)
  }
}

/* ── A push: the files on the server change, then the activity log says so, and the editor's poll reads it ── */
async function push(ed, kind, i, compat) {
  const { page } = ed
  const changed = kind === "imported" ? ["shopify/assets/materia.css", "shopify/assets/materia.js", "sections/rich-text.storelib"] : ["sections/probe_banner.storelib"]
  if (kind === "imported") {
    /* What each push changes can be read in the canvas: a CSS variable, a value the script sets, a mark in the section. */
    const next = (p, text) => p.endsWith(".css") ? `${text.replace(/\n:root\{--probe-push:\d+\}$/, "")}\n:root{--probe-push:${i + 1}}`
      : p.endsWith(".js") ? `${text.replace(/\n;window\.__probePush=\d+;$/, "")}\n;window.__probePush=${i + 1};`
      : withMarkup(text.replace(/\n<i data-probe-push="\d+" hidden><\/i>/, ""), `<i data-probe-push="${i + 1}" hidden></i>`)
    /* The server's copy (the node side serves the theme's assets) and the routes' (the page answers the files routes). */
    for (const p of changed) compat.all[p] = next(p, compat.all[p])
    await page.evaluate((all) => {
      const c = window.PROBE_COMPAT
      for (const [p, text] of Object.entries(all)) (p.startsWith("shopify/") ? c.files : c.sources)[p] = text
    }, Object.fromEntries(changed.map((p) => [p, compat.all[p]])))
  }
  await page.evaluate((changed, withSettings, i) => {
    const a = window.PROBE_ACTIVITY
    let id = a.events.length ? a.events[a.events.length - 1].id : 0
    for (const p of changed) a.events.push({ id: ++id, agent_name: "GitHub", path: p, action: "updated", created_at: new Date().toISOString() })
    if (withSettings) a.events.push({ id: ++id, agent_name: "GitHub", path: "settings", action: "page", detail: { replaced: true }, created_at: new Date().toISOString() })
    a.syncAt = new Date(Date.now() + i).toISOString()
  }, changed, i % 2 === 1, i)
  /* THE MOMENT IT LANDS (round 23, "when a push from GitHub or any AI coding lands, a little freeze and stutter"): the
     editor's main thread from the poll to the canvas settled, as long tasks, and the frames it drew. */
  await page.evaluate(() => {
    window.__landing = { longs: [], frames: [], on: true }
    try { new PerformanceObserver((l) => { if (window.__landing?.on) for (const e of l.getEntries()) window.__landing.longs.push(Math.round(e.duration)) }).observe({ type: "longtask" }) } catch {}
    const tick = (t) => { if (!window.__landing?.on) return; window.__landing.frames.push(t); requestAnimationFrame(tick) }
    requestAnimationFrame(tick)
  })
  if (process.env.PROFILE) { await ed.cdp.send("Profiler.enable"); await ed.cdp.send("Profiler.setSamplingInterval", { interval: 200 }); await ed.cdp.send("Profiler.start") }
  /* The editor's own poll reads it: woken by the window coming back, as after switching from GitHub. */
  const calls0 = await page.evaluate(() => window.probeCalls.length)
  for (let k = 0; k < 40; k++) {
    await page.evaluate(() => window.dispatchEvent(new Event("focus")))
    await sleep(500)
    if (await page.evaluate((c0) => window.probeCalls.slice(c0).some((c) => /agent-activity\?after=/.test(c)), calls0)) break
  }
  await settle(page)
  const landing = await page.evaluate(() => {
    const L = window.__landing
    L.on = false
    let worst = 0
    for (let k = 1; k < L.frames.length; k++) worst = Math.max(worst, L.frames[k] - L.frames[k - 1])
    return { longs: L.longs, worstFrame: Math.round(worst) }
  })
  if (process.env.PROFILE) {
    const { profile } = await ed.cdp.send("Profiler.stop")
    const self = new Map()
    const byId = new Map(profile.nodes.map((n) => [n.id, n]))
    const dt = profile.timeDeltas
    profile.samples.forEach((id, k) => {
      const n = byId.get(id)
      const key = `${n.callFrame.functionName || "(anon)"} ${n.callFrame.url.split("/").pop()}:${n.callFrame.lineNumber}`
      self.set(key, (self.get(key) ?? 0) + (dt[k] ?? 0))
    })
    const parent = new Map()
    for (const n of profile.nodes) for (const c of n.children ?? []) parent.set(c, n)
    const callers = new Map()
    profile.samples.forEach((id, k) => {
      const n = byId.get(id)
      if (n.callFrame.functionName !== "elementsFromPoint") return
      const chain = []
      for (let q = parent.get(n.id); q && chain.length < 4; q = parent.get(q.id)) chain.push(`${q.callFrame.functionName || "(anon)"}:${q.callFrame.lineNumber}`)
      const key = chain.join(" < ")
      callers.set(key, (callers.get(key) ?? 0) + (dt[k] ?? 0))
    })
    console.log("     elementsFromPoint from: " + [...callers].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, v]) => `${k} ${(v / 1000).toFixed(1)}ms`).join(" | "))
    console.log("     self time: " + [...self].filter(([k]) => !/^\((idle|program|garbage collector)\)/.test(k)).sort((a, b) => b[1] - a[1]).slice(0, 14).map(([k, v]) => `${k} ${(v / 1000).toFixed(1)}ms`).join(" | "))
  }
  console.log(`     landing: long tasks ${JSON.stringify(landing.longs)}, longest frame ${landing.worstFrame}ms`)
  landings.push(landing)
}
const landings = []

/* Theme settings' own onChange (compat-theme-settings.tsx), found on the open panel. */
const themeOnChange = (page, id, value) => page.evaluate((id, value) => {
  const root = document.querySelector("[data-wb-sidebar-panel]")
  const fiberOf = (el) => el && el[Object.keys(el).find((k) => k.startsWith("__reactFiber$"))]
  let panel = null
  const walk = (f, depth) => { for (let c = f; c && !panel; c = c.sibling) { const p = c.memoizedProps; if (p && typeof p.renderField === "function" && typeof p.onChange === "function" && p.values) { panel = p; return } if (c.child && depth < 200) walk(c.child, depth + 1) } }
  walk(fiberOf(root), 0)
  if (!panel) return 0
  panel.onChange(id, value)
  return new Promise((r) => requestAnimationFrame(() => r(1)))
}, id, value)
const openTheme = async (page) => {
  await page.evaluate(() => { if (document.querySelector("[data-compat-theme-group]")) return; const b = [...document.querySelectorAll("button")].find((x) => x.textContent.trim() === "Theme" && x.getClientRects().length); b?.click() })
  await sleep(300)
}

/* ── A large theme settings change: 14 settings, a frame apart ── */
const FLIP = ["color_background", "color_text", "gradient_accent", "color_schemes", "header_scheme", "type_header_font", "type_body_font", "heading_scale", "text_transform", "page_width", "buttons_radius", "buttons_shadow", "card_style", "heading_alignment"]
async function bigChange(ed, i, originals) {
  await openTheme(ed.page)
  let did = 0
  for (const id of FLIP) did += await themeOnChange(ed.page, id, i % 2 === 0 ? STORE_CHANGES[id] : originals[id])
  if (did !== FLIP.length) console.log(`     (only ${did} of ${FLIP.length} settings could be changed)`)
  await settle(ed.page)
}

async function nativeBigChange(ed, i) {
  /* The Storelib theme's colour schemes, every one of them, and the default scheme: every section is coloured again. By the panels' own updateSetting. */
  const { page } = ed
  const v = i % 2 === 0
    ? { color_schemes: Object.fromEntries(["white", "light", "dark", "black", "highlight"].map((k) => [k, { bg: "#fff7e8", heading: "#202a44", paragraph: "#202a44", primary_btn_bg: "#aa3355" }])), default_color_scheme: "light" }
    : { color_schemes: {}, default_color_scheme: "white" }
  for (const label of ["Theme", "Colors"]) {
    await page.evaluate((label) => { const b = [...document.querySelectorAll("button")].find((x) => x.textContent.trim() === label && x.getClientRects().length); b?.click() }, label)
    await sleep(300)
  }
  let did = 0
  for (const [key, value] of Object.entries(v)) did += await page.evaluate((key, value) => {
    const fiberOf = (el) => el && el[Object.keys(el).find((k) => k.startsWith("__reactFiber$"))]
    let set = null
    const walk = (f, depth) => { for (let c = f; c && !set; c = c.sibling) { const p = c.memoizedProps; if (p && typeof p.updateSetting === "function") { set = p.updateSetting; return } if (c.child && depth < 400) walk(c.child, depth + 1) } }
    walk(fiberOf(document.getElementById("app").firstElementChild ?? document.getElementById("app")), 0)
    if (!set) return 0
    set(key, value)
    return new Promise((r) => requestAnimationFrame(() => r(1)))
  }, key, value)
  if (did !== 2) console.log(`     (only ${did} of 2 settings could be changed)`)
  await settle(page)
}

async function run(kind) {
  console.log(`\n${kind.toUpperCase()}: a fresh load, then ${N} pushes and ${N} large theme changes`)
  const compat = kind === "imported" ? await storeTheme() : null
  const globals = `window.PROBE_ACTIVITY={events:[],syncAt:"2026-10-01T00:00:00.000Z"};window.PROBE_CONNECTIONS={agents:[],github:{repo:"owner/materia"},latest:null};${kind === "imported" ? "" : STORELIB_GLOBALS}`
  const ed = await openEditor({ kind, bundle, css, compat, globals, init: INIT, settle: 3000 })
  ed.cdp = await ed.page.createCDPSession()
  await ed.cdp.send("Performance.enable")
  const out = { fresh: null, pushes: [], changes: [] }
  report[kind] = out
  const originals = compat ? Object.fromEntries(FLIP.map((k) => [k, compat.settings.shopify?.[k] ?? null])) : {}
  try {
    out.fresh = await measure(ed, kind, "fresh", null)
    out.freshRetained = await retainedMB(ed.cdp)
    for (let i = 0; i < N; i++) {
      await push(ed, kind, i, compat)
      out.pushes.push(await measure(ed, kind, `push ${i + 1}`, out.fresh))
    }
    for (let i = 0; i < N; i++) {
      if (kind === "imported") await bigChange(ed, i, originals)
      else await nativeBigChange(ed, i)
      /* An even count of changes is back where it started: the fresh load is the page to look like. */
      out.changes.push(await measure(ed, kind, `settings ${i + 1}`, (i + 1) % 2 === 0 ? out.fresh : null))
      /* Where the editor's own keeping (thirty undo steps, each with the theme it drew) has filled: from here it must stay flat. */
      if (i === 3) out.midRetained = await retainedMB(ed.cdp)
    }
    /* EDITS: a long session of small changes, each drawing one section again (the announcement bar prints the Facebook link). */
    if (kind === "imported") {
      const EDITS = Number(process.env.EDITS ?? 45)
      await openTheme(ed.page)
      for (let k = 0; k < EDITS; k++) { await themeOnChange(ed.page, "social_facebook_link", `https://facebook.com/materia-${k}`); await sleep(250) }
      await settle(ed.page, 2500)
      out.edits = await measure(ed, kind, `${EDITS} edits`, null)
    }
    out.retained = { fresh: out.freshRetained, mid: out.midRetained, last: await retainedMB(ed.cdp) }
    console.log(`  retained heap (snapshot): fresh ${out.retained.fresh}MB, after 10 pushes and 4 changes ${out.retained.mid}MB, after everything ${out.retained.last}MB`)

    const fresh = out.fresh
    const last = out.changes[out.changes.length - 1]
    const lastPush = out.pushes[out.pushes.length - 1]
    const all = [...out.pushes, ...out.changes, ...(out.edits ? [out.edits] : [])]
    const maxOf = (rows, f) => Math.max(...rows.map(f).filter((x) => typeof x === "number"))
    const obs = (r) => (r.frame ? r.frame.mo + r.frame.ro + r.frame.io + r.frame.intervals : 0)
    console.log("")
    if (kind === "imported") {
      expect(lastPush.frame?.push === `${N}/${N}/${N}`, "the last push is on the canvas: its stylesheet, its script and its section (css/js/section)", lastPush.frame?.push)
      expect(maxOf(all, (r) => r.frameListeners) <= fresh.frameListeners + 4, `listeners on the canvas's window+document, the most after any step: fresh ${fresh.frameListeners}`, maxOf(all, (r) => r.frameListeners))
      expect(maxOf(all, obs) <= obs(fresh) + 2, `observers + intervals alive in the canvas, the most after any step: fresh ${obs(fresh)}`, maxOf(all, obs))
      expect(maxOf(all, (r) => r.frame?.raf) <= (fresh.frame?.raf ?? 0) + 1, `frame callbacks per frame, the most after any step: fresh ${fresh.frame?.raf}`, maxOf(all, (r) => r.frame?.raf))
      expect(maxOf(all, (r) => r.iframes) <= 2, "frames in the canvas once settled, at most 2", maxOf(all, (r) => r.iframes))
    }
    expect(last.editorListeners <= fresh.editorListeners + 6, `listeners on the editor's window+document: fresh ${fresh.editorListeners}`, last.editorListeners)
    expect(last.editor.intervals <= fresh.editor.intervals + 1, `intervals alive in the editor: fresh ${fresh.editor.intervals}`, last.editor.intervals)
    const freshLongest = fresh.scroll?.longest ?? 50
    const worstScroll = maxOf([...out.pushes.slice(-3), ...out.changes.slice(-3)], (r) => r.scroll?.longest)
    expect(worstScroll <= Math.max(3 * freshLongest, 120), `longest frame while scrolling, last three of each: fresh ${freshLongest}ms`, worstScroll)
    const scatters = all.map((r) => r.scatter).filter((x) => typeof x === "number")
    expect(Math.max(0, ...scatters) <= 2, "canvas against the fresh load, % of pixels that differ (pushes, and every even theme change)", scatters)
    expect(out.retained.last <= out.retained.mid + 6, `retained heap (snapshot) stays flat once the undo steps are full: after 4 changes ${out.retained.mid}MB`, out.retained.last)
    const errs = ed.errors.filter((e) => !/ResizeObserver loop/.test(e))
    expect(errs.length === 0, "no page errors", errs.slice(0, 3))
  } finally {
    for (const r of [out.fresh, ...out.pushes, ...out.changes, out.edits]) if (r) delete r.shot
    await ed.close()
  }
}

for (const kind of ["imported", "native"]) if (!ONLY || ONLY.test(kind)) await run(kind)
if (process.env.JSON) writeFileSync(process.env.JSON, JSON.stringify(report, null, 2))
console.log(broken ? `\n${broken} check(s) failed.` : "\nAll checks passed.")
process.exit(broken && BUDGET ? 1 : 0)
