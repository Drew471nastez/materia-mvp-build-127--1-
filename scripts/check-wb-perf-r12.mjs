/**
 * ===========================================================================
 *  THE WEBSITE BUILDER EDITOR ON A LARGE THEME: INPUT TO PAINT, LONG TASKS,
 *  BLANK CANVAS FRAMES AND MEMORY (round 12)
 * ===========================================================================
 * The owner: "every editor interaction feels immediate, even on complex
 * themes", "it never blanks, flashes white or becomes a white canvas", "no
 * lag when I create navigation or add links in the sidebar".
 *
 * The real editor, production React (scripts/editor-probe-harness.mjs: the
 * shipped page bundled with NODE_ENV=production, only the network and the
 * framework's server modules answered in the page), in headless Chromium at
 * 1440x900, driven with real input over the devtools protocol.
 *
 * LARGE THEME. A Storelib theme home page of SECTIONS (default 120) sections,
 * most with pictures, a header with 12 links, and the store's menus: a Main
 * menu of 38 links with 6 sub-links each (266 links) and a Footer of 40.
 * Then an imported Shopify theme (tests/fixtures/shopify-materia) whose home
 * page is cloned out to 60 sections.
 *
 * For each interaction, INPUT TO PAINT the way INP reads it: from the
 * input's own timestamp (so time spent queued behind a busy thread counts)
 * to the end of the next frame painted after its handlers, per input:
 *
 *   slider drag        a section's padding slider, 80 moves at 8ms
 *   colour pick        Theme > Colors, the picker's square dragged, 60 moves
 *   typing             20 keys into a section heading
 *   add section        a library card pressed (and until it is on the canvas)
 *   open a long menu   Navigation > Main menu, 266 links drawn
 *   add menu link      Add link at its foot, then 13 keys of its name
 *
 * plus long tasks (the longest), and BLANK CANVAS FRAMES: every frame the
 * browser painted while the probe ran (a screencast), read where the canvas
 * is; a frame where 99.5% of the canvas is white is blank. Read through page
 * switches, a sections read that fails once, the theme's files answering
 * slowly, and theme setting changes on the imported theme.
 *
 * MEMORY. MINUTES (default 2; the report's run is 20) of a scripted session
 * (type, drag, add and remove a link, add and delete a section, switch pages)
 * with the heap read after a forced collection each minute: the growth from
 * the first minute to the last must stay under HEAP_GROWTH_MB.
 *
 *   npx tsx scripts/check-wb-perf-r12.mjs
 *   CPU=4 npx tsx scripts/check-wb-perf-r12.mjs     the thread slowed 4x
 *   EDITOR_BUNDLE=<file>   a bundle built from another commit (before/after)
 *   MINUTES=20             the long memory run
 *   ONLY=native|imported|memory
 *   JSON=<file>            the numbers as JSON
 *   BUDGET=0               report without failing
 *
 * Round 12, the bundle before (main at 1115ffa0d) and after, alternated, two
 * runs each, on a shared machine (load 4 to 17): input to paint p95 / the
 * longest task, ms. A time is claimed only where both runs agree.
 *
 *                          1x before        1x after         4x before          4x after
 *   add menu link          664/567          152/76           1856/1886          592/605
 *                          1352/1326        152/94           2304/4659          224/158
 *   open a long menu       584/528 424/289  288/207 824/416  2456/2173 3024/2834  1080/913 2272/2067
 *   (follow-up: a row's menu surface mounted on first open, its phone sheet
 *   on first touch, one shared media listener, a screenful of rows first)
 *     the bundle before it  216/131 208/141                   1408/1142 1000/725
 *     after                 208/135 168/96                    912/604 792/477
 *   slider, typing, colour, add section, page switches: within noise, no change claimed
 *   blank canvas frames    0 of 3,137 painted (both)        0 of 4,675 / 0 of 3,684 (4x)
 *   heap, 20 minutes       25.1 -> 32.2MB (464 cycles)      23.8 -> 32.5MB (468 cycles)
 *   listeners, 20 minutes  1276 -> 1228                     1261 -> 1276 (flat)
 *   section draws per key typed in a menu link (120 sections): every section -> 0
 *
 * Budgets (at CPU 1x; at 4x the latency budgets are 4x):
 *   input to paint p95, every interaction      <= 200ms
 *   longest task, every interaction             <= 400ms
 *   blank canvas frames                         = 0
 *   heap growth over the session                <= HEAP_GROWTH_MB (24MB)
 */
import { readFileSync, writeFileSync } from "node:fs"
import { inflateSync } from "node:zlib"

process.env.PROBE_CSS = process.env.PROBE_CSS ?? "source"
const { bundle, css } = await import("./editor-probe-harness.mjs")
const { importedTheme, openEditor, sleep } = await import("./canvas-probe-kit.mjs")

const CPU = Number(process.env.CPU ?? 1)
const SECTIONS = Number(process.env.SECTIONS ?? 120)
const MINUTES = Number(process.env.MINUTES ?? 2)
const HEAP_GROWTH_MB = Number(process.env.HEAP_GROWTH_MB ?? 24)
const ONLY = process.env.ONLY ? new RegExp(process.env.ONLY, "i") : null
const BUDGET = process.env.BUDGET !== "0"
const P95_BUDGET = 200 * CPU
const LONG_BUDGET = 400 * CPU
let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : BUDGET ? "FAIL" : "note"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got).slice(0, 240)})`}`)
  if (!ok && BUDGET) broken++
}
const report = { cpu: CPU, sections: SECTIONS, native: {}, imported: {}, memory: null }

/* ── The large theme ── */
const BODY = ["hero_centered", "features_grid", "text_image", "gallery", "proof_testimonials", "image_banner", "faq_accordion", "split_content", "team_members", "logo_bar",
  "cta_image", "media_gallery", "text_rich", "features_cards", "image_comparison", "collection_banner", "about_image", "process_steps", "promo_newsletter", "multirow",
  "features_image", "timeline", "lookbook", "press_mentions", "icon_box", "cta_banner", "media_collage", "hero_split", "stats", "about_founder",
  "proof_logos", "text_columns", "image_section", "testimonials", "pricing", "cta_simple", "promotion_banner", "banner_packery", "social_proof_bar", "faq_columns"]
const home = ["header", ...Array.from({ length: SECTIONS - 2 }, (_, i) => BODY[i % BODY.length]), "footer"]
const link = (t, u) => ({ title: t, url: u })
const MENUS = {
  "main-menu": {
    title: "Main menu",
    links: Array.from({ length: 38 }, (_, i) => ({ ...link(`Department ${i + 1}`, `/collections/department-${i + 1}`), links: Array.from({ length: 6 }, (_, j) => link(`Aisle ${i + 1}.${j + 1}`, `/collections/aisle-${i + 1}-${j + 1}`)) })),
  },
  footer: { title: "Footer", links: Array.from({ length: 40 }, (_, i) => link(`Footer link ${i + 1}`, `/pages/footer-${i + 1}`)) },
}
const NATIVE_GLOBALS = `window.PROBE_PAGES=${JSON.stringify({ home, about: ["header", "text_rich", "faq_accordion", "cta_simple", "footer"] })};window.PROBE_PAGE_DELAY_MS=0;window.PROBE_HEADER={links:12};window.PROBE_STORE_MENUS=${JSON.stringify({ available: true, stored: true, menus: MENUS })};`

/* ── In the page before anything runs: Event Timing, long tasks, input marks and their next paint ── */
const INIT = String.raw`
(function () {
  var P = window.__wp = { longs: [], events: [], marks: [], on: false }
  try { new PerformanceObserver(function (l) { l.getEntries().forEach(function (e) { P.longs.push([e.startTime, e.duration]) }) }).observe({ type: "longtask", buffered: true }) } catch (e) {}
  try { new PerformanceObserver(function (l) { l.getEntries().forEach(function (e) { P.events.push({ name: e.name, start: e.startTime, duration: e.duration, id: e.interactionId || 0 }) }) }).observe({ type: "event", durationThreshold: 16, buffered: true }) } catch (e) {}
  /* The end of the frame painted after this input's handlers: a frame, then a task after it (the paint is between). */
  var ch = new MessageChannel(), waiting = []
  ch.port1.onmessage = function () { var now = performance.now(), w = waiting.shift(); if (w) for (var i = 0; i < w.length; i++) P.marks.push(now - w[i]) }
  var batch = null
  function mark(t) {
    if (!P.on) return
    if (!batch) { batch = []; requestAnimationFrame(function () { waiting.push(batch); batch = null; ch.port2.postMessage(0) }) }
    batch.push(t)
  }
  /* A drag (a slider's thumb, the colour square) is a move with the button down; typing is an input event. */
  document.addEventListener("pointermove", function (e) { if (e.buttons === 1) mark(e.timeStamp) }, true)
  document.addEventListener("input", function (e) { mark(e.timeStamp) }, true)
  window.__wpStart = function () { P.on = true; P.marks = []; P.t0 = performance.now(); P.l0 = P.longs.length; P.e0 = P.events.length }
  window.__wpStop = function () {
    P.on = false
    var longs = P.longs.slice(P.l0).filter(function (l) { return l[0] >= P.t0 - 5 })
    var events = P.events.slice(P.e0).filter(function (e) { return e.start >= P.t0 - 5 && e.id > 0 })
    return { marks: P.marks.slice(), events: events.map(function (e) { return e.duration }), worstEvent: events.reduce(function (a, e) { return e.duration > a.duration ? e : a }, { duration: 0, name: "" }).name, longs: longs.map(function (l) { return l[1] }) }
  }
})()
`

const pct = (a, p) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return Math.round(s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]) }

/* ── A PNG from the screencast, to RGBA ── */
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
    for (let x = 0; x < w; x++) { out[(y * w + x) * 4] = line[x * bpp]; out[(y * w + x) * 4 + 1] = line[x * bpp + 1]; out[(y * w + x) * 4 + 2] = line[x * bpp + 2] }
    prev = line
  }
  return { w, h, data: out }
}

/**
 * Every frame painted while `run` runs, read where the canvas is. Blank: at
 * least 99.5% of the canvas's pixels white (all three channels 246 or more).
 */
async function watchCanvas(page, run) {
  const cdp = await page.createCDPSession()
  const rect = await page.evaluate(() => { const el = document.getElementById("wb-preview-root"); if (!el) return null; const r = el.getBoundingClientRect(); return { x: Math.max(0, r.left), y: Math.max(0, r.top), w: Math.min(innerWidth, r.right) - Math.max(0, r.left), h: Math.min(innerHeight, r.bottom) - Math.max(0, r.top), vw: innerWidth, vh: innerHeight } })
  const frames = []
  cdp.on("Page.screencastFrame", (f) => {
    frames.push(f.data)
    cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => {})
  })
  await cdp.send("Page.startScreencast", { format: "png", maxWidth: 480, maxHeight: 300, everyNthFrame: 1 })
  let result
  try { result = await run() } finally { await cdp.send("Page.stopScreencast").catch(() => {}); await sleep(200) }
  let blank = 0
  const shots = []
  for (const b64 of frames) {
    const png = decodePng(Buffer.from(b64, "base64"))
    const sx = png.w / rect.vw, sy = png.h / rect.vh
    const x0 = Math.floor(rect.x * sx), y0 = Math.floor(rect.y * sy), x1 = Math.floor((rect.x + rect.w) * sx), y1 = Math.floor((rect.y + rect.h) * sy)
    let white = 0, all = 0
    for (let y = y0 + 2; y < y1 - 2; y++) for (let x = x0 + 2; x < x1 - 2; x++) {
      const i = (y * png.w + x) * 4
      all++
      if (png.data[i] >= 246 && png.data[i + 1] >= 246 && png.data[i + 2] >= 246) white++
    }
    if (all && white / all >= 0.995) { blank++; if (shots.length < 3) shots.push(b64) }
  }
  await cdp.detach().catch(() => {})
  return { result, frames: frames.length, blank, shots }
}

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
  console.log("    SELF\n" + top(self, 25) + "\n    TOTAL\n" + top(total, Number(process.env.PROFILE_N ?? 40)))
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

/* ── One interaction, measured ── */
async function measure(page, name, act, bucket) {
  await page.evaluate(() => new Promise((r) => setTimeout(r, 400)))
  /* PROFILE=<regexp>: a CPU profile of the interactions whose name matches, by function (self and total). */
  const profiling = process.env.PROFILE && new RegExp(process.env.PROFILE, "i").test(name)
  const cdp = profiling ? await page.createCDPSession() : null
  if (cdp) { await cdp.send("Profiler.enable"); await cdp.send("Profiler.setSamplingInterval", { interval: 200 }); await cdp.send("Profiler.start") }
  /* REMOVALS=1: every subtree of more than 50 elements taken out of the page while it ran, and where from. */
  if (process.env.REMOVALS) await page.evaluate(() => { window.__rm = []; window.__rmObs?.disconnect(); window.__rmObs = new MutationObserver((l) => { for (const m of l) for (const n of m.removedNodes) { if (n.nodeType !== 1) continue; const c = n.querySelectorAll("*").length; if (c > 50) window.__rm.push(`${c} from ${m.target.tagName}[${[...m.target.attributes].filter((a) => a.name.startsWith("data-") || a.name === "id" || a.name === "role").map((a) => a.name).join(",")}] ${n.tagName}[${[...n.attributes].filter((a) => a.name.startsWith("data-") || a.name === "id" || a.name === "role").map((a) => `${a.name}=${a.value.slice(0, 16)}`).join(",")}]`) } }); window.__rmObs.observe(document.body, { childList: true, subtree: true }) })
  const tracing = process.env.TRACE && new RegExp(process.env.TRACE, "i").test(name)
  if (tracing) await page.tracing.start({ categories: ["devtools.timeline", "disabled-by-default-devtools.timeline", "disabled-by-default-devtools.timeline.stack", ...(process.env.TRACE_INV ? ["disabled-by-default-devtools.timeline.invalidationTracking"] : [])] })
  await page.evaluate(() => window.__wpStart())
  let note
  try { note = await act() } catch (e) { note = `threw: ${String(e).slice(0, 160)}` }
  await sleep(900)
  const m = await page.evaluate(() => window.__wpStop())
  if (cdp) printProfile((await cdp.send("Profiler.stop")).profile)
  if (tracing) printTrace(JSON.parse(Buffer.from(await page.tracing.stop()).toString("utf8")).traceEvents)
  if (process.env.REMOVALS) console.log((await page.evaluate(() => { window.__rmObs.disconnect(); return window.__rm })).slice(0, 10).map((x) => `      removed ${x}`).join("\n"))
  const samples = [...m.marks, ...m.events]
  const r = {
    inputs: samples.length,
    p50: pct(samples, 50),
    p95: pct(samples, 95),
    worst: samples.length ? Math.round(Math.max(...samples)) : null,
    longTasks: m.longs.length,
    longest: m.longs.length ? Math.round(Math.max(...m.longs)) : 0,
    ...(note && note !== true ? { note } : {}),
  }
  bucket[name] = r
  console.log(`  ${name.padEnd(22)} input to paint p50 ${String(r.p50).padStart(4)}ms p95 ${String(r.p95).padStart(4)}ms worst ${String(r.worst).padStart(4)}ms (${r.inputs} inputs)  long tasks ${r.longTasks}, longest ${r.longest}ms${r.note ? `  [${r.note}]` : ""}`)
  return r
}

const centre = (page, sel, i = 0) => page.evaluate((s, k) => {
  const el = [...document.querySelectorAll(s)].filter((x) => x.getClientRects().length)[k]
  if (!el) return null
  el.scrollIntoView({ block: "center" })
  const r = el.getBoundingClientRect()
  return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + Math.min(r.height / 2, 30)), left: r.left, right: r.right, top: r.top, w: r.width, h: r.height }
}, sel, i)
const byText = (page, re, scope = "body") => page.evaluate((src, sc) => {
  const rx = new RegExp(src)
  const el = [...document.querySelector(sc)?.querySelectorAll("button, [role=button], a") ?? []].find((b) => rx.test((b.textContent || "").replace(/\s+/g, " ").trim()) && b.getClientRects().length)
  if (!el) return null
  el.scrollIntoView({ block: "center" })
  const r = el.getBoundingClientRect()
  return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }
}, re.source, scope)
/* Until `fn` in the page answers something, polled each 100ms, at most `ms`. */
const until = async (page, fn, ms = 15000, ...args) => {
  const t0 = Date.now()
  for (;;) {
    const v = await page.evaluate(fn, ...args).catch(() => null)
    if (v || Date.now() - t0 > ms) return v
    await sleep(100)
  }
}
const click = async (page, p) => { await page.mouse.move(p.x, p.y); await page.mouse.down(); await sleep(30); await page.mouse.up() }

/* ── The Storelib theme, 120 sections ── */
async function nativeRun() {
  console.log(`\nA Storelib theme, ${SECTIONS} sections, menus of 266 and 40 links, CPU ${CPU}x`)
  const ed = await openEditor({ kind: "storelib", bundle, css, globals: NATIVE_GLOBALS, init: INIT, cpu: CPU, settle: 3000 })
  const { page } = ed
  const out = report.native
  try {
    const count = await page.evaluate(() => document.querySelectorAll("#wb-preview-root [data-section-box]").length)
    console.log(`  ${count} sections on the canvas`)
    const watched = await watchCanvas(page, async () => {
      /* Slider: the hero's padding. */
      const hero = await centre(page, "#wb-preview-root [data-section-box][data-section-type='hero_centered']")
      await click(page, hero)
      const slider = await until(page, () => {
        const s = [...document.querySelectorAll("[data-wb-sidebar-scroll] [data-slot='slider']")].find((x) => x.getClientRects().length && /padding/i.test(x.closest("div")?.parentElement?.textContent || ""))
          ?? [...document.querySelectorAll("[data-wb-sidebar-scroll] [data-slot='slider']")].find((x) => x.getClientRects().length)
        if (!s) return null
        s.scrollIntoView({ block: "center" })
        const t = s.querySelector("[data-slot='slider-thumb']").getBoundingClientRect(), r = s.getBoundingClientRect()
        return { tx: t.left + t.width / 2, ty: t.top + t.height / 2, left: r.left, right: r.right }
      })
      await sleep(600)
      if (!slider) expect(false, "the hero has a slider")
      else await measure(page, "slider drag", async () => {
        await page.mouse.move(slider.tx, slider.ty)
        await page.mouse.down()
        for (let k = 0; k <= 80; k++) {
          const f = k / 80
          const x = f < 0.5 ? slider.tx + (slider.right - 2 - slider.tx) * f * 2 : slider.right - 2 + (slider.left + 2 - slider.right + 2) * (f - 0.5) * 2
          await page.mouse.move(x, slider.ty)
          await sleep(8)
        }
        await page.mouse.up()
      }, out)

      /* Typing in the hero's heading. */
      const heading = await until(page, () => {
        const i = [...document.querySelectorAll("[data-wb-sidebar-scroll] input[type=text], [data-wb-sidebar-scroll] input:not([type]), [data-wb-sidebar-scroll] textarea")].find((x) => /^Section \d+:/.test(x.value || ""))
        if (!i) return null
        i.scrollIntoView({ block: "center" })
        const r = i.getBoundingClientRect()
        return { x: r.right - 8, y: r.top + r.height / 2 }
      })
      if (!heading) expect(false, "the hero's heading field is there")
      else {
        await click(page, heading)
        await page.keyboard.press("End")
        await measure(page, "typing", async () => { await page.keyboard.type(" and twenty more!!ab", { delay: 60 }) }, out)
        await page.evaluate(() => document.activeElement?.blur?.())
      }

      /* Theme > Colors: the picker's square dragged. */
      const tab = await page.evaluate(() => { const t = [...document.querySelectorAll("[role=tablist][aria-label=Sidebar] [role=tab]")].find((x) => x.textContent.trim() === "Theme"); if (!t) return null; const r = t.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } })
      if (tab) {
        await click(page, tab)
        await sleep(700)
        const colors = await byText(page, /^Colou?rs/, "[data-wb-sidebar-scroll]")
        if (colors) { await click(page, colors); await sleep(700) }
        const chip = await centre(page, "[data-wb-sidebar-scroll] button[aria-label='Pick color']")
        if (!chip) expect(false, "Theme > Colors has a colour chip")
        else {
          await click(page, chip)
          await sleep(600)
          const box = await page.evaluate(() => { const b = document.querySelector(".cursor-crosshair[data-sheet-no-drag]"); if (!b) return null; const r = b.getBoundingClientRect(); return { left: r.left, top: r.top, w: r.width, h: r.height } })
          if (!box) expect(false, "the colour picker opened")
          else await measure(page, "colour pick", async () => {
            await page.mouse.move(box.left + box.w * 0.2, box.top + box.h * 0.2)
            await page.mouse.down()
            for (let k = 0; k <= 60; k++) {
              const f = k / 60
              await page.mouse.move(box.left + box.w * (0.2 + 0.6 * f), box.top + box.h * (0.2 + 0.5 * Math.sin(f * Math.PI)))
              await sleep(8)
            }
            await page.mouse.up()
          }, out)
          await page.keyboard.press("Escape")
          await sleep(500)
        }
        const sectionsTab = await page.evaluate(() => { const t = [...document.querySelectorAll("[role=tablist][aria-label=Sidebar] [role=tab]")].find((x) => x.textContent.trim() === "Sections"); if (!t) return null; const r = t.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } })
        if (sectionsTab) { await click(page, sectionsTab); await sleep(900) }
      }

      /* Add section: the insert line between two rows, then a library card. */
      for (let i = 0; i < 3; i++) {
        const has = await page.evaluate(() => document.querySelectorAll("[data-section-row]").length > 0)
        if (has) break
        await page.evaluate(() => [...document.querySelectorAll("[data-wb-sidebar-panel] button[aria-label='Back']")].filter((x) => x.getClientRects().length)[0]?.click())
        await sleep(500)
      }
      const opened = await page.evaluate(async () => {
        const line = document.querySelectorAll("[data-section-group='template'] [data-insert-section]")[9]
        if (!line) return false
        line.scrollIntoView({ block: "center" })
        line.click()
        for (let i = 0; i < 80; i++) {
          if ([...document.querySelectorAll("[data-section-library] [data-library-card]")].some((c) => c.getClientRects().length && !c.hidden)) return true
          await new Promise((r) => setTimeout(r, 100))
        }
        return false
      })
      if (!opened) expect(false, "the library opens from the insert line")
      else {
        await sleep(800)
        const before = await page.evaluate(() => document.querySelectorAll("#wb-preview-root [data-section-box]").length)
        const r = await measure(page, "add section", async () => {
          const card = await centre(page, "[data-section-library] [data-library-card]")
          const t0 = Date.now()
          await click(page, card)
          await page.waitForFunction((n) => document.querySelectorAll("#wb-preview-root [data-section-box]").length > n, { timeout: 20000, polling: "raf" }, before)
          return `on the canvas after ${Date.now() - t0}ms`
        }, out)
        expect(!!r, "a library card adds a section")
      }
      for (let i = 0; i < 3; i++) {
        const has = await page.evaluate(() => document.querySelectorAll("[data-section-row]").length > 0)
        if (has) break
        await page.evaluate(() => [...document.querySelectorAll("[data-wb-sidebar-panel] button[aria-label='Back']")].filter((x) => x.getClientRects().length)[0]?.click())
        await sleep(500)
      }

      /* Navigation > Main menu > Add link, and its name typed. */
      const pages = await page.evaluate(() => { const b = [...document.querySelectorAll("[data-wb-sidebar-panel] button")].find((x) => /^Home/.test(x.textContent.trim()) && x.getClientRects().length); if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } })
      if (pages) await click(page, pages)
      else console.log("  (no page selector: " + (await page.evaluate(() => [...document.querySelectorAll("[data-wb-sidebar-panel] button")].filter((x) => x.getClientRects().length).slice(0, 6).map((x) => x.textContent.trim().slice(0, 20)).join(" | "))) + ")")
      await until(page, () => !!document.querySelector("[data-open-navigation]"), 8000)
      const nav = await centre(page, "[data-open-navigation]")
      if (!nav) expect(false, "Navigation is beside the pages")
      else {
        await click(page, nav)
        await until(page, () => !!document.querySelector("[data-menu-row='main-menu']"), 8000)
        const main = await centre(page, "[data-menu-row='main-menu']")
        if (main) await measure(page, "open a long menu", async () => {
          await click(page, main)
          await until(page, () => !!document.querySelector("[data-link-add='top']"), 8000)
        }, out)
        await sleep(500)
        const add = await centre(page, "[data-link-add='top']")
        if (!add) expect(false, "the Main menu has Add link")
        else {
          await measure(page, "add menu link", async () => {
            await click(page, add)
            await sleep(400)
            await page.keyboard.type("New link here", { delay: 60 })
          }, out)
        }
      }
    })
    out.blankFrames = watched.blank
    out.framesRead = watched.frames
    console.log(`  canvas: ${watched.frames} frames painted, ${watched.blank} blank`)
    if (watched.shots.length && process.env.SHOTS) watched.shots.forEach((s, i) => writeFileSync(`${process.env.SHOTS}/native-blank-${i}.png`, Buffer.from(s, "base64")))
    if (ed.errors.length) console.log(`  page errors: ${ed.errors.slice(0, 3).join(" | ")}`)
  } finally {
    await ed.close()
  }
}

/* ── The imported theme: page switches, a read that fails once, slow files, theme values ── */
async function importedRun() {
  console.log(`\nAn imported theme (Materia), its home page cloned to 60 sections, CPU ${CPU}x`)
  const compat = await importedTheme()
  const base = compat.pages.home
  const body = base.filter((s) => !/header|footer|top-bar|tab-bar/.test(s.type))
  const chrome = (want) => base.filter((s) => want.test(s.type))
  compat.pages.home = [...chrome(/top-bar|header/), ...Array.from({ length: 60 }, (_, i) => ({ ...structuredClone(body[i % body.length]), id: `${body[i % body.length].id}-c${i}` })), ...chrome(/footer|tab-bar/)]
  const out = report.imported
  const ed = await openEditor({ kind: "imported", bundle, css, compat, init: INIT, cpu: CPU, settle: 2500 })
  const { page } = ed
  try {
    const switchTo = async (key) => {
      const pages = await page.evaluate(() => { const b = [...document.querySelectorAll("[data-wb-sidebar-panel] button")].find((x) => /^(Home|Page|About)/.test(x.textContent.trim()) && x.getClientRects().length); if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } })
      if (!pages) return "no page selector"
      await click(page, pages)
      await sleep(600)
      const row = await centre(page, `[data-page-row='${key}']`)
      if (!row) { await page.keyboard.press("Escape"); return `no ${key} row` }
      await click(page, row)
      await sleep(2500)
      return true
    }
    const watched = await watchCanvas(page, async () => {
      await measure(page, "page switch", async () => switchTo("page"), out)
      await measure(page, "page switch back", async () => switchTo("home"), out)
      /* A read of the sections that fails once (a 503), then a slow read of the theme's files. */
      await page.evaluate(() => { window.PROBE_SECTIONS_FAIL = 1 })
      await measure(page, "switch, read fails once", async () => switchTo("page"), out)
      await page.evaluate(() => { window.PROBE_ROUTE_DELAY_MS = { "/sections": 4000 } })
      await measure(page, "switch, slow read", async () => { const r = await switchTo("home"); await sleep(4000); return r }, out)
      await page.evaluate(() => { window.PROBE_ROUTE_DELAY_MS = {} })
      /* A section's heading typed in the frame's page. */
      const row = await centre(page, "[data-section-group='template'] [data-section-row]", 1)
      if (row) {
        await click(page, row)
        await sleep(1200)
        const field = await centre(page, "[data-wb-sidebar-scroll] input[type=text], [data-wb-sidebar-scroll] textarea")
        if (field) {
          await click(page, field)
          await page.keyboard.press("End")
          await measure(page, "typing (imported)", async () => { await page.keyboard.type(" more words", { delay: 60 }) }, out)
          await page.evaluate(() => document.activeElement?.blur?.())
        }
      }
      /* Theme settings: the first select or slider in the theme's own groups. */
      const tab = await page.evaluate(() => { const t = [...document.querySelectorAll("[role=tablist][aria-label=Sidebar] [role=tab]")].find((x) => x.textContent.trim() === "Theme"); if (!t) return null; const r = t.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } })
      if (tab) {
        await click(page, tab)
        await sleep(900)
        const group = await centre(page, "[data-wb-sidebar-scroll] button")
        if (group) { await click(page, group); await sleep(900) }
        const slider = await page.evaluate(() => {
          const s = [...document.querySelectorAll("[data-wb-sidebar-scroll] [data-slot='slider']")].find((x) => x.getClientRects().length)
          if (!s) return null
          s.scrollIntoView({ block: "center" })
          const t = s.querySelector("[data-slot='slider-thumb']").getBoundingClientRect(), r = s.getBoundingClientRect()
          return { tx: t.left + t.width / 2, ty: t.top + t.height / 2, left: r.left, right: r.right }
        })
        if (slider) await measure(page, "theme slider (imported)", async () => {
          await page.mouse.move(slider.tx, slider.ty)
          await page.mouse.down()
          for (let k = 0; k <= 40; k++) { await page.mouse.move(slider.left + 2 + (slider.right - slider.left - 4) * (k / 40), slider.ty); await sleep(10) }
          await page.mouse.up()
          await sleep(2500)
        }, out)
      }
    })
    out.blankFrames = watched.blank
    out.framesRead = watched.frames
    console.log(`  canvas: ${watched.frames} frames painted, ${watched.blank} blank`)
    if (watched.shots.length && process.env.SHOTS) watched.shots.forEach((s, i) => writeFileSync(`${process.env.SHOTS}/imported-blank-${i}.png`, Buffer.from(s, "base64")))
    if (ed.errors.length) console.log(`  page errors: ${ed.errors.slice(0, 3).join(" | ")}`)
  } finally {
    await ed.close()
  }
}

/* ── Memory over a scripted session ── */
async function memoryRun() {
  console.log(`\nMemory: ${MINUTES} minutes of editing the ${SECTIONS}-section theme, CPU ${CPU}x`)
  const ed = await openEditor({ kind: "storelib", bundle, css, globals: NATIVE_GLOBALS, init: process.env.MEM_INIT === "0" ? "" : INIT, cpu: CPU, settle: 3000 })
  const { page } = ed
  /* A dialog the page opens holds every input after it: said, and dismissed. */
  const dialogs = []
  page.on("dialog", (d) => { dialogs.push(`${d.type()}: ${d.message().slice(0, 120)}`); console.log(`  dialog ${d.type()}: ${d.message().slice(0, 120)}`); d.dismiss().catch(() => {}) })
  try {
    const cdp = await page.createCDPSession()
    await cdp.send("Performance.enable")
    const sample = async () => {
      await cdp.send("HeapProfiler.collectGarbage")
      await sleep(300)
      await cdp.send("HeapProfiler.collectGarbage")
      const { metrics } = await cdp.send("Performance.getMetrics")
      const get = (n) => metrics.find((m) => m.name === n)?.value ?? 0
      return { heapMB: +(get("JSHeapUsedSize") / 1048576).toFixed(1), nodes: get("Nodes"), listeners: get("JSEventListeners") }
    }
    const samples = []
    const t0 = Date.now()
    let cycles = 0
    let nextSample = 0
    while (Date.now() - t0 < MINUTES * 60_000) {
      if (Date.now() - t0 >= nextSample) { samples.push(await sample()); nextSample += 60_000; console.log(`  minute ${samples.length - 1}: ${JSON.stringify(samples.at(-1))}`) }
      cycles++
      /* A section opened from the canvas, its heading typed, a slider dragged. */
      const box = await centre(page, `#wb-preview-root [data-section-box][data-section-type='${["hero_centered", "text_image", "features_grid"][cycles % 3]}']`, cycles % 2)
      if (box) { await click(page, box); await sleep(500) }
      const heading = await page.evaluate(() => { const i = [...document.querySelectorAll("[data-wb-sidebar-scroll] input[type=text], [data-wb-sidebar-scroll] textarea")].find((x) => x.getClientRects().length); if (!i) return null; i.scrollIntoView({ block: "center" }); const r = i.getBoundingClientRect(); return { x: r.right - 8, y: r.top + r.height / 2 } })
      if (heading) { await click(page, heading); await page.keyboard.press("End"); await page.keyboard.type(" ab", { delay: 40 }); for (let k = 0; k < 3; k++) await page.keyboard.press("Backspace") }
      const slider = await page.evaluate(() => { const s = [...document.querySelectorAll("[data-wb-sidebar-scroll] [data-slot='slider']")].find((x) => x.getClientRects().length); if (!s) return null; s.scrollIntoView({ block: "center" }); const r = s.getBoundingClientRect(); return { y: r.top + r.height / 2, left: r.left, right: r.right } })
      if (slider) { await page.mouse.move(slider.left + 4, slider.y); await page.mouse.down(); for (let k = 0; k <= 20; k++) { await page.mouse.move(slider.left + 4 + (slider.right - slider.left - 8) * (k / 20), slider.y); await sleep(10) } await page.mouse.up() }
      /* Undo what was done, so the page does not grow by itself. */
      await page.keyboard.down("Control"); await page.keyboard.press("z"); await page.keyboard.press("z"); await page.keyboard.up("Control")
      await sleep(300)
    }
    samples.push(await sample())
    const first = samples[1] ?? samples[0], last = samples.at(-1)
    report.memory = { minutes: MINUTES, cycles, samples, growthMB: +(last.heapMB - first.heapMB).toFixed(1), nodesGrowth: last.nodes - first.nodes, listenersGrowth: last.listeners - first.listeners }
    console.log(`  ${cycles} cycles; heap ${first.heapMB} -> ${last.heapMB}MB, nodes ${first.nodes} -> ${last.nodes}, listeners ${first.listeners} -> ${last.listeners}`)
  } finally {
    await ed.close()
  }
}

if (!ONLY || ONLY.test("native")) await nativeRun()
if (!ONLY || ONLY.test("imported")) await importedRun()
if (!ONLY || ONLY.test("memory")) await memoryRun()

console.log("\nBudgets")
for (const [where, bucket] of [["native", report.native], ["imported", report.imported]]) {
  for (const [name, r] of Object.entries(bucket)) {
    if (!r || typeof r !== "object") continue
    if (r.p95 !== null && r.p95 !== undefined) expect(r.p95 <= P95_BUDGET, `${where} ${name}: input to paint p95 <= ${P95_BUDGET}ms`, r.p95)
    expect(r.longest <= LONG_BUDGET, `${where} ${name}: longest task <= ${LONG_BUDGET}ms`, r.longest)
  }
  if (typeof bucket.blankFrames === "number") expect(bucket.blankFrames === 0, `${where}: no blank canvas frame`, `${bucket.blankFrames} of ${bucket.framesRead}`)
}
if (report.memory) expect(report.memory.growthMB <= HEAP_GROWTH_MB, `heap growth over ${MINUTES} minutes <= ${HEAP_GROWTH_MB}MB`, report.memory.growthMB)
if (process.env.JSON) writeFileSync(process.env.JSON, JSON.stringify(report, null, 2))
console.log(broken ? `\n${broken} over budget\n` : "\nall within budget\n")
process.exit(broken ? 1 : 0)
