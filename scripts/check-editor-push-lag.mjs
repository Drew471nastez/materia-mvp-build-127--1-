/**
 * ===========================================================================
 *  A PUSH UNDER AN OPEN EDITOR: WHAT IT COSTS WHILE IT LANDS AND AFTER
 * ===========================================================================
 * The owner: "when I receive pushes from GitHub, from the Storelib AI coding
 * agent, or from an external AI coding tool, I get a sudden lag and stutter
 * for about 10 seconds. After the push the whole editor lags."
 *
 * The real editor (scripts/editor-probe-harness.mjs, nothing about the editor
 * stubbed) with an imported Shopify style theme made large (SNIPPETS extra
 * theme files), and a Storelib theme with many section files of the
 * creator's own. The activity log is written the way lib/github-sync/sync.ts
 * writes it: one row per saved file, GAP ms apart, so a push of 200 files
 * trickles in over seconds while the editor polls it. During each scenario
 * and QUIET seconds after it, the canvas and then the sidebar are scrolled
 * with a real wheel, and these are counted:
 *
 *   long tasks       count, total and longest (PerformanceObserver longtask)
 *   frames           intervals between frames while scrolling, p95 and max
 *   main thread      script, style and layout time (CDP Performance metrics),
 *                    and that per incoming row
 *   commits          React commits (the devtools hook)
 *   canvas           iframes made, and documents loaded into them
 *   requests         fetches the editor made, by route
 *   left behind      heap after a collection, listeners, intervals, timers
 *                    pending, observers, iframes, after every push
 *
 * Found (CPU 4x, the bundle before and after, back to back on one machine):
 *
 *   A push was applied once per poll while sync.ts was still writing its
 *     rows: a 200 file push was 6 full theme reads, 26 one-file reads, 10
 *     sync report reads, 4 canvas documents and 78 React commits. Held until
 *     the push is in (live-follow.ts holdForPush): 1, 1, 2, 2 and 19.
 *     Main thread for that push with nothing scrolled (NOSCROLL=1): 3,934ms
 *     before, 2,332ms after.
 *   More than eight sources read one request each unless the tab had been
 *     away: 40 requests for a 40 file push. Now one read of the theme.
 *   The library's sheet kept the frame's old document after every push
 *     (React's last ref callback held the old sheet): documents alive after
 *     a collection 5, 7, 9, 11, 13, 15 over five pushes; now 5 throughout.
 *     Heap over the five pushes +7.3MB before, +4.1MB after.
 *   Scroll frames (p95 17ms, max 67 to 150ms) and long tasks (max under
 *     100ms) were alike before and after on this fixture: its pages are
 *     small, so one pass costs little here. What a pass costs grows with
 *     the theme; how many passes a push makes is what changed.
 *   Not changed: an agent saving one file every 1.5s is one apply per file
 *     (about 400ms of main thread each at 4x: the page drawn by Liquid and
 *     compared, the library's sheet redrawn); each is a change somebody is
 *     waiting to see.
 *
 *   npx tsx scripts/check-editor-push-lag.mjs
 *   SCENARIOS=stream200,burst300  some only (names below)
 *   CPU=4                         the CPU slowed
 *   BUDGET=0                      report without failing on the budgets
 *   JSON=<file>                   the numbers as JSON
 *   EDITOR_BUNDLE=<file>          a bundle built from another commit, to compare
 *   NOSCROLL=1                    no wheel: the main thread time is the push's alone
 *   PROFILE=1                     a CPU profile of each push (stream and agent scenarios)
 */
import { writeFileSync } from "node:fs"

process.env.PROBE_CSS = process.env.PROBE_CSS ?? "source"
const { bundle, css } = await import("./editor-probe-harness.mjs")
const { importedTheme, openEditor, sleep } = await import("./canvas-probe-kit.mjs")

const CPU = Number(process.env.CPU ?? 1)
const GAP = Number(process.env.GAP ?? 40)
const QUIET = Number(process.env.QUIET ?? 15) * 1000
const SNIPPETS = Number(process.env.SNIPPETS ?? 260)
const WANT = (process.env.SCENARIOS ?? "stream50,stream200,burst300,repeat,agentminute,echo,native200").split(",")

/* ── What the page counts, installed before the editor runs ── */
const INIT = String.raw`
;(function () {
  var P = window.__lag = { commits: 0, longs: [], frames: [], iframes: 0, docs: 0, lis: 0, intervals: new Set(), timeouts: new Set(), obs: 0 }
  window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
    supportsFiber: true, isDisabled: false, renderers: new Map(),
    inject: function (r) { this.renderers.set(1, r); return 1 },
    onCommitFiberRoot: function () { P.commits++ },
    onCommitFiberUnmount: function () {}, onPostCommitFiberRoot: function () {}, checkDCE: function () {},
    on: function () {}, off: function () {}, emit: function () {}, sub: function () { return function () {} },
  }
  try { new PerformanceObserver(function (l) { l.getEntries().forEach(function (e) { P.longs.push([e.startTime, e.duration]) }) }).observe({ type: "longtask", buffered: true }) } catch (e) {}
  var tick = function (t) { P.frames.push(t); if (P.frames.length > 20000) P.frames.splice(0, 10000); requestAnimationFrame(tick) }
  requestAnimationFrame(tick)
  /* Listeners on this document's own targets, net of removals (a listener added once per push and never removed is a leak). */
  var add = EventTarget.prototype.addEventListener, rem = EventTarget.prototype.removeEventListener
  var held = new WeakMap()
  P.lisBy = {}
  var where = function (t) { return t === window ? "window" : t === document ? "document" : t && t.nodeType === 1 ? t.tagName.toLowerCase() : t && t.constructor ? t.constructor.name : "other" }
  EventTarget.prototype.addEventListener = function (type, fn, o) {
    if (fn) { var m = held.get(this); if (!m) { m = new Set(); held.set(this, m) } if (!m.has(fn)) { m.add(fn); P.lis++; var k = type + "@" + where(this); P.lisBy[k] = (P.lisBy[k] || 0) + 1 } }
    return add.call(this, type, fn, o)
  }
  EventTarget.prototype.removeEventListener = function (type, fn, o) {
    var m = fn && held.get(this)
    if (m && m.has(fn)) { m.delete(fn); P.lis--; var k = type + "@" + where(this); P.lisBy[k] = (P.lisBy[k] || 0) - 1 }
    return rem.call(this, type, fn, o)
  }
  var si = window.setInterval, ci = window.clearInterval, st = window.setTimeout, ct = window.clearTimeout
  window.setInterval = function () { var id = si.apply(window, arguments); P.intervals.add(id); return id }
  window.clearInterval = function (id) { P.intervals.delete(id); return ci.call(window, id) }
  window.setTimeout = function (fn) { var args = Array.prototype.slice.call(arguments); var id; var f = args[0]; if (typeof f === "function") args[0] = function () { P.timeouts.delete(id); return f.apply(this, arguments) }; id = st.apply(window, args); P.timeouts.add(id); return id }
  window.clearTimeout = function (id) { P.timeouts.delete(id); return ct.call(window, id) }
  ;["ResizeObserver", "IntersectionObserver", "MutationObserver"].forEach(function (n) {
    var C = window[n]; if (!C) return
    var W = function (cb, o) { var x = new C(cb, o); var d = x.disconnect.bind(x); var on = false; var ob = x.observe.bind(x); x.observe = function () { if (!on) { on = true; P.obs++ } return ob.apply(null, arguments) }; x.disconnect = function () { if (on) { on = false; P.obs-- } return d() }; return x }
    W.prototype = C.prototype
    window[n] = W
  })
  /* Every iframe the editor makes, and every document loaded into one. */
  new MutationObserver(function (list) {
    for (var r of list) for (var n of r.addedNodes) if (n.nodeType === 1) {
      var fr = n.tagName === "IFRAME" ? [n] : n.querySelectorAll ? n.querySelectorAll("iframe") : []
      for (var f of fr) { P.iframes++; add.call(f, "load", function () { P.docs++ }) }
    }
  }).observe(document, { childList: true, subtree: true })
})()
`

/* In the page once the editor is up: the requests it makes. */
const COUNT_FETCH = () => {
  const P = window.__lag
  P.req = {}
  const f = window.fetch
  window.fetch = function (input, init) {
    const u = typeof input === "string" ? input : input instanceof URL ? input.href : input.url
    const k = u.replace(/^https?:\/\/[^/]+/, "").replace(/probe-install/, "*").replace(/path=[^&]+/, "path=…").replace(/after=\d+/, "after=…").replace(/\?.*?(compat=1|sources=1|path=…|after=…).*/, "?$1")
    P.req[k] = (P.req[k] || 0) + 1
    return f.call(this, input, init)
  }
}

/* A CPU profile's self and total time by function (the bundle keeps its names). */
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

async function metrics(cdp) {
  const { metrics } = await cdp.send("Performance.getMetrics")
  const m = Object.fromEntries(metrics.map((x) => [x.name, x.value]))
  return { script: m.ScriptDuration * 1000, style: m.RecalcStyleDuration * 1000, layout: m.LayoutDuration * 1000, task: m.TaskDuration * 1000 }
}

async function leftBehind(ed, cdp) {
  await cdp.send("HeapProfiler.collectGarbage")
  await sleep(200)
  await cdp.send("HeapProfiler.collectGarbage")
  const heap = (await cdp.send("Runtime.getHeapUsage")).usedSize
  const page = await ed.js(() => {
    const P = window.__lag
    return { lisBy: { ...P.lisBy }, lis: P.lis, intervals: P.intervals.size, timeouts: P.timeouts.size, obs: P.obs, iframesNow: document.querySelectorAll("iframe").length, nodes: document.getElementsByTagName("*").length }
  })
  /* Documents alive in the renderer after a collection: an iframe let go but still held by a closure keeps its whole page. */
  const dom = await cdp.send("Memory.getDOMCounters").catch(() => null)
  return { heapMB: +(heap / 1048576).toFixed(1), documents: dom?.documents ?? null, domNodes: dom?.nodes ?? null, jsListeners: dom?.jsEventListeners ?? null, ...page }
}

/* A window of measurement: start, then stop for the numbers since. */
async function startWindow(ed, cdp) {
  await ed.js(() => {
    const P = window.__lag
    P.t0 = performance.now()
    P.c0 = P.commits
    P.i0 = P.iframes
    P.d0 = P.docs
    P.r0 = { ...P.req }
    P.scrollFrames = []
  })
  return metrics(cdp)
}
async function stopWindow(ed, cdp, m0, rows) {
  const m1 = await metrics(cdp)
  const w = await ed.js(() => {
    const P = window.__lag
    const longs = P.longs.filter(([s]) => s >= P.t0)
    const req = {}
    for (const [k, n] of Object.entries(P.req)) if (n - (P.r0[k] || 0) > 0) req[k] = n - (P.r0[k] || 0)
    const gaps = []
    for (const seg of P.scrollFrames) for (let i = 1; i < seg.length; i++) gaps.push(seg[i] - seg[i - 1])
    gaps.sort((a, b) => a - b)
    const q = (p) => (gaps.length ? Math.round(gaps[Math.min(gaps.length - 1, Math.floor(p * gaps.length))]) : 0)
    return {
      longTasks: longs.length,
      longTotal: Math.round(longs.reduce((a, [, d]) => a + d, 0)),
      longMax: Math.round(longs.reduce((a, [, d]) => Math.max(a, d), 0)),
      blocking: Math.round(longs.reduce((a, [, d]) => a + Math.max(0, d - 50), 0)),
      frameP95: q(0.95),
      frameMax: gaps.length ? Math.round(gaps[gaps.length - 1]) : 0,
      framesOver50: gaps.filter((g) => g > 50).length,
      commits: P.commits - P.c0,
      iframesMade: P.iframes - P.i0,
      docsLoaded: P.docs - P.d0,
      requests: Object.values(req).reduce((a, b) => a + b, 0),
      req,
    }
  })
  const script = Math.round(m1.script - m0.script)
  return { ...w, mainScript: script, mainStyleLayout: Math.round(m1.style - m0.style + m1.layout - m0.layout), mainTask: Math.round(m1.task - m0.task), perRowMs: rows ? +((m1.task - m0.task) / rows).toFixed(1) : null, rows }
}

/* Scrolls with a wheel for `ms`, over the canvas or the sidebar, keeping the frames it saw. */
async function wheel(ed, cdp, where, ms) {
  /* NOSCROLL=1: the same time left alone, so the main thread measured is the push's own. */
  if (process.env.NOSCROLL) return sleep(ms)
  const box = await ed.js((w) => {
    const el = w === "sidebar" ? document.querySelector("[data-wb-sidebar-scroll]") : document.querySelector("[data-compat-frame='front']") ?? document.getElementById("wb-preview-root")
    if (!el) return null
    const r = el.getBoundingClientRect()
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
  }, where)
  if (!box) return
  await ed.js(() => { const P = window.__lag; P.seg = P.frames.length })
  const t0 = Date.now()
  let dir = 1
  let n = 0
  while (Date.now() - t0 < ms) {
    await cdp.send("Input.dispatchMouseEvent", { type: "mouseWheel", x: box.x, y: box.y, deltaX: 0, deltaY: 90 * dir })
    if (++n % 14 === 0) dir = -dir
    await sleep(16)
  }
  await ed.js(() => { const P = window.__lag; P.scrollFrames.push(P.frames.slice(P.seg)) })
}

/* Canvas, then sidebar, alternately, until `until()` says stop. */
async function scrollWhile(ed, cdp, until) {
  let side = false
  while (!(await until())) {
    await wheel(ed, cdp, side ? "sidebar" : "canvas", 1500)
    side = !side
  }
}

async function appendRows(ed, rows, gap) {
  /* A push from GitHub ends as sync.ts finish() ends it: the link's time moves once every file is in. An agent's writes move nothing. */
  const push = rows.some((r) => /^GitHub/.test(r.agent_name))
  if (gap <= 0) {
    await ed.js((evs, push) => { const a = window.PROBE_ACTIVITY; let n = a.events.length ? a.events[a.events.length - 1].id : 1000; for (const e of evs) a.events.push({ ...e, id: ++n, created_at: new Date().toISOString() }); if (push) a.syncAt = new Date().toISOString() }, rows, push)
    return
  }
  /* One row per saved file, as the sync writes them, from inside the page so the gap is real. */
  await ed.js((evs, g, push) => new Promise((done) => {
    const a = window.PROBE_ACTIVITY
    let k = 0
    const next = () => {
      if (k >= evs.length) {
        if (push) a.syncAt = new Date().toISOString()
        return done()
      }
      const n = a.events.length ? a.events[a.events.length - 1].id : 1000
      a.events.push({ ...evs[k++], id: n + 1, created_at: new Date().toISOString() })
      setTimeout(next, g)
    }
    next()
  }), rows, gap, push)
}

/* ── The imported theme, made as large as a store theme ── */
const compat = await importedTheme({
  store: true,
  edit: async (zip) => {
    /* About the size of a store theme's snippet: a card, a price, a badge, with loops and conditions. */
    const body = (k) => `<div class="probe-snippet-${k} card">
{%- assign img = product.featured_image -%}
{%- if img -%}<img src="{{ img | image_url: width: 600 }}" alt="{{ img.alt | escape }}" loading="lazy" width="600" height="600">{%- endif -%}
<h3 class="card__title">{{ product.title | escape }}</h3>
{%- for v in product.variants limit: 4 -%}
  <span class="card__variant{% if v.available == false %} is-sold{% endif %}">{{ v.title }} {{ v.price | money }}</span>
{%- endfor -%}
{%- case section.settings.badge -%}
  {%- when 'sale' -%}<span class="badge badge--sale">{{ 'products.sale' | t }}</span>
  {%- when 'new' -%}<span class="badge">New</span>
{%- endcase -%}
${Array.from({ length: 12 }, (_, j) => `<p class="probe-line-${j}">{% if section.settings.title %}{{ section.settings.title | upcase }}{% else %}Line ${j}{% endif %}</p>`).join("\n")}
</div>
`
    for (let k = 0; k < SNIPPETS; k++) zip.file(`snippets/probe-${k}.liquid`, body(k))
  },
})
/* An imported theme's Liquid is kept as .storelib files (sections/, snippets/), its assets, config and templates under shopify/. */
const SNIPPET_PATHS = Object.keys(compat.sources).filter((p) => /^snippets\/probe-/.test(p))
const SECTION_PATHS = Object.keys(compat.sources).filter((p) => /^sections\/.*\.storelib$/.test(p))
console.log(`imported theme: ${Object.keys(compat.files).length} files under shopify/, ${Object.keys(compat.sources).length} .storelib (${SNIPPET_PATHS.length} extra snippets)`)

const GLOBALS = `window.PROBE_ACTIVITY={events:[{id:1000,agent_name:"GitHub · ada",path:"pages/home",action:"page",detail:{page:"home",replaced:true},created_at:"2026-10-01T00:00:00.000Z"}],syncAt:"2026-10-01T00:00:00.000Z"};window.PROBE_CONNECTIONS={agents:[{name:"Claude Code",kind:"claude"}],github:{repo:"ada/theme"},latest:null};`

/* A push of `n` files: snippets, then sections, then the stylesheet with a marker the canvas must show. */
function pushFiles(stamp, n, who = "GitHub · ada") {
  const paths = [...SNIPPET_PATHS.slice(0, Math.max(0, n - SECTION_PATHS.length - 1)), ...SECTION_PATHS.slice(0, Math.min(SECTION_PATHS.length, n - 1))]
  const sources = {}
  for (const p of paths) sources[p] = compat.sources[p].replace("</template>", `<i data-push="${stamp}"></i></template>`)
  const files = { "shopify/assets/materia.css": `${compat.files["shopify/assets/materia.css"]}\n:root{--push-${stamp}:1}` }
  const rows = [...paths, "shopify/assets/materia.css"].map((path) => ({ agent_name: who, path, action: "updated" }))
  return { patch: { sources, files }, rows }
}
/* The page's routes answer from PROBE_COMPAT; the theme's stylesheet is served by this process from compat.all (canvas-probe-kit.mjs). */
const putPatch = (ed, patch) => (Object.assign(compat.all, patch.files, patch.sources), ed.page.evaluate((p) => { Object.assign(window.PROBE_COMPAT.files, p.files); Object.assign(window.PROBE_COMPAT.sources, p.sources) }, patch))
/* The canvas has the section text of this push too: a section the push changed is drawn with its marker. */
const sectionArrived = (stamp) => async (ed) => {
  const f = await ed.front()
  return !!f && (await f.evaluate((s) => !!document.querySelector(`[data-push="${s}"]`), stamp).catch(() => false))
}
const cssArrived = (stamp) => async (ed) => {
  const f = await ed.front()
  return !!f && (await f.evaluate((s) => getComputedStyle(document.documentElement).getPropertyValue(`--push-${s}`).trim() === "1", stamp).catch(() => false))
}

async function untilOr(test, cap) {
  const t0 = Date.now()
  while (Date.now() - t0 < cap) {
    if (await test()) return Date.now() - t0
    await sleep(150)
  }
  return null
}

const out = { cpu: CPU, gap: GAP, quiet: QUIET, scenarios: {} }

async function importedScenario(name, play) {
  const ed = await openEditor({ kind: "imported", bundle, css, compat, globals: GLOBALS, init: INIT, cpu: CPU, width: 1280, height: 900, settle: 4000 })
  try {
    const cdp = await ed.page.createCDPSession()
    await cdp.send("Performance.enable")
    if (CPU > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU })
    await ed.js(COUNT_FETCH)
    await sleep(2500)
    /* The observer sees a long task: one made here on purpose. */
    await ed.js(() => setTimeout(() => { const t = performance.now(); while (performance.now() - t < 90) {} }, 0))
    await sleep(300)
    if (!(await ed.js(() => window.__lag.longs.some(([, d]) => d >= 85)))) console.log("  (the long task observer saw nothing: long task numbers below are not real)")
    const base = await leftBehind(ed, cdp)
    const r = await play(ed, cdp, base)
    for (const w of r.pushes ?? [r]) w.iframesBase = base.iframesNow
    r.errors = ed.errors.filter((e) => !/ResizeObserver loop/.test(e)).slice(0, 3)
    out.scenarios[name] = r
    return r
  } finally {
    await ed.close()
  }
}

/* One push: rows written while the canvas and the sidebar are scrolled, then QUIET more seconds of scrolling. */
async function onePush(ed, cdp, stamp, n, gap) {
  const { patch, rows } = pushFiles(stamp, n)
  await putPatch(ed, patch)
  const m0 = await startWindow(ed, cdp)
  /* PROFILE=1: where the main thread's time went across the push. */
  if (process.env.PROFILE) { await cdp.send("Profiler.enable"); await cdp.send("Profiler.setSamplingInterval", { interval: 500 }); await cdp.send("Profiler.start") }
  const t0 = Date.now()
  let written = false
  const writing = appendRows(ed, rows, gap).then(() => { written = true })
  let landed = null
  const arrived = async (e) => (await cssArrived(stamp)(e)) && (await sectionArrived(stamp)(e))
  await scrollWhile(ed, cdp, async () => {
    if (landed === null && written && (await arrived(ed))) landed = Date.now() - t0
    return written && (landed !== null || Date.now() - t0 > 60_000) && Date.now() - t0 > (rows.length * gap) + 1000
  })
  await writing
  const tail = Date.now()
  await scrollWhile(ed, cdp, async () => Date.now() - tail > QUIET)
  if (landed === null && (await arrived(ed))) landed = Date.now() - t0
  if (process.env.PROFILE) printProfile((await cdp.send("Profiler.stop")).profile)
  const w = await stopWindow(ed, cdp, m0, rows.length)
  w.landedMs = landed
  w.iframesNow = await ed.js(() => document.querySelectorAll("iframe").length)
  return w
}

const fmt = (name, w) => console.log(`  ${name.padEnd(30)} rows ${String(w.rows ?? 0).padStart(3)}  landed ${w.landedMs === null ? "NEVER" : `${w.landedMs}ms`}  long ${w.longTasks} (total ${w.longTotal}ms, max ${w.longMax}ms)  frames p95 ${w.frameP95}ms max ${w.frameMax}ms >50ms ${w.framesOver50}  commits ${w.commits}  iframes made ${w.iframesMade} docs ${w.docsLoaded} now ${w.iframesNow}  requests ${w.requests} ${JSON.stringify(w.req)}  main ${w.mainTask}ms (script ${w.mainScript}, style+layout ${w.mainStyleLayout}) ${w.perRowMs !== null ? `${w.perRowMs}ms/row` : ""}`)

if (WANT.includes("stream50")) await importedScenario("stream50", async (ed, cdp) => { const w = await onePush(ed, cdp, "a50", 50, GAP); fmt("github push, 50 files streamed", w); return w })
if (WANT.includes("stream200")) await importedScenario("stream200", async (ed, cdp) => { const w = await onePush(ed, cdp, "a200", 200, GAP); fmt("github push, 200 files streamed", w); return w })
if (WANT.includes("burst300")) await importedScenario("burst300", async (ed, cdp) => { const w = await onePush(ed, cdp, "b300", Math.min(300, SNIPPET_PATHS.length + SECTION_PATHS.length + 1), 0); fmt("github push, 270+ files at once", w); return w })

if (WANT.includes("repeat")) await importedScenario("repeat", async (ed, cdp, base) => {
  const pushes = []
  const heap = [base]
  for (let k = 0; k < 5; k++) {
    const { patch, rows } = pushFiles(`r${k}`, 40)
    await putPatch(ed, patch)
    const m0 = await startWindow(ed, cdp)
    await appendRows(ed, rows, GAP)
    await wheel(ed, cdp, "canvas", 2500)
    await wheel(ed, cdp, "sidebar", 1000)
    const landed = await untilOr(async () => (await cssArrived(`r${k}`)(ed)) && (await sectionArrived(`r${k}`)(ed)), 15_000)
    const w = await stopWindow(ed, cdp, m0, rows.length)
    w.landedMs = landed
    w.iframesNow = await ed.js(() => document.querySelectorAll("iframe").length)
    fmt(`repeat push ${k + 1} (40 files)`, w)
    pushes.push(w)
    heap.push(await leftBehind(ed, cdp))
  }
  await sleep(QUIET)
  const after = await leftBehind(ed, cdp)
  heap.push(after)
  /* Which listeners were added by the pushes and not taken off. */
  const grew = Object.entries(after.lisBy).map(([k, v]) => [k, v - (heap[1].lisBy[k] ?? 0)]).filter(([, d]) => d !== 0)
  if (grew.length) console.log(`  listeners left by the pushes: ${grew.map(([k, d]) => `${k} ${d > 0 ? "+" : ""}${d}`).join(", ")}`)
  for (const h of heap) delete h.lisBy
  console.log(`  left behind, before / after each push / ${QUIET / 1000}s later: ${heap.map((h) => `${h.heapMB}MB docs ${h.documents} lis ${h.lis}/${h.jsListeners} int ${h.intervals} to ${h.timeouts} obs ${h.obs} ifr ${h.iframesNow} nodes ${h.nodes}/${h.domNodes}`).join("  |  ")}`)
  return { pushes, heap }
})

if (WANT.includes("agentminute")) await importedScenario("agentminute", async (ed, cdp) => {
  /* An agent saving one section file every 1.5s for a minute: the same few sections over and over, as an agent iterates. */
  const m0 = await startWindow(ed, cdp)
  if (process.env.PROFILE) { await cdp.send("Profiler.enable"); await cdp.send("Profiler.setSamplingInterval", { interval: 500 }); await cdp.send("Profiler.start") }
  const t0 = Date.now()
  let k = 0
  const writing = (async () => {
    while (Date.now() - t0 < 60_000) {
      const p = SECTION_PATHS[k % SECTION_PATHS.length]
      const text = compat.sources[p].replace("</template>", `<i data-push="g${k}"></i></template>`)
      const css = `${compat.files["shopify/assets/materia.css"]}\n:root{--push-g${k}:1}`
      await putPatch(ed, { sources: { [p]: text }, files: { "shopify/assets/materia.css": css } })
      await appendRows(ed, [{ agent_name: "Claude Code", path: p, action: "updated" }, ...(k % 8 === 7 ? [{ agent_name: "Claude Code", path: "shopify/assets/materia.css", action: "updated" }] : [])], 0)
      k++
      await sleep(1500)
    }
  })()
  let done = false
  void writing.then(() => { done = true })
  await scrollWhile(ed, cdp, async () => done)
  const tail = Date.now()
  await scrollWhile(ed, cdp, async () => Date.now() - tail > QUIET)
  if (process.env.PROFILE) printProfile((await cdp.send("Profiler.stop")).profile)
  const w = await stopWindow(ed, cdp, m0, k)
  const last = [...Array(k).keys()].reverse().find((j) => j % 8 === 7)
  w.landedMs = last === undefined ? 0 : (await cssArrived(`g${last}`)(ed)) ? 0 : null
  w.iframesNow = await ed.js(() => document.querySelectorAll("iframe").length)
  fmt(`agent, a file each 1.5s, 60s`, w)
  return w
})

if (WANT.includes("echo")) await importedScenario("echo", async (ed, cdp) => {
  /* The editor's own Push coming back: nothing changed on the server, only the link's time. */
  const m0 = await startWindow(ed, cdp)
  await ed.js(() => { window.PROBE_ACTIVITY.syncAt = new Date().toISOString() })
  const tail = Date.now()
  await scrollWhile(ed, cdp, async () => Date.now() - tail > 6000)
  const w = await stopWindow(ed, cdp, m0, 0)
  w.landedMs = 0
  w.iframesNow = await ed.js(() => document.querySelectorAll("iframe").length)
  fmt("whole theme push echo", w)
  return w
})

/* ── A Storelib theme with many section files of the creator's own ── */
if (WANT.includes("native200")) {
  const N = 200
  const own = (k, v) => `<template><section class="own-${k}"><h2>{{ settings.heading }} ${v}</h2></section></template>
<style scoped>.own-${k} { padding: 32px 24px; text-align: center; }</style>
<schema>{"schema_version":1,"type":"own_${k}","name":"Own ${k}","category":"content","settings":[{"type":"text","id":"heading","label":"Heading","default":"Own ${k}"}],"presets":[{"name":"Own ${k}","settings":{"heading":"Own ${k}"}}]}</schema>`
  const files = Object.fromEntries([...Array(N).keys()].map((k) => [`sections/own_${k}.storelib`, own(k, "v0")]))
  const home = ["header", "hero_centered", ...[...Array(8).keys()].map((k) => ({ id: `own_${k}-x`, type: `own_${k}`, settings: { heading: `Own ${k}` }, blocks: [] })), "faq_accordion", "footer"]
  const globals = `window.PROBE_FILES=${JSON.stringify(files)};window.PROBE_PAGES={home:${JSON.stringify(home)},about:["header","text_rich","footer"]};window.PROBE_PAGE_DELAY_MS=0;` + GLOBALS
  const ed = await openEditor({ kind: "native", bundle, css, globals, init: INIT, cpu: CPU, width: 1280, height: 900, settle: 5000 })
  try {
    const cdp = await ed.page.createCDPSession()
    await cdp.send("Performance.enable")
    if (CPU > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU })
    await ed.js(COUNT_FETCH)
    await sleep(2500)
    const before = await leftBehind(ed, cdp)
    await ed.js((n, src) => { for (let k = 0; k < n; k++) window.PROBE_FILES[`sections/own_${k}.storelib`] = src.replaceAll("__K__", String(k)) }, N, own("__K__", "v1"))
    const rows = [...Array(N).keys()].map((k) => ({ agent_name: "GitHub · ada", path: `sections/own_${k}.storelib`, action: "updated" }))
    const m0 = await startWindow(ed, cdp)
    if (process.env.PROFILE) { await cdp.send("Profiler.enable"); await cdp.send("Profiler.setSamplingInterval", { interval: 500 }); await cdp.send("Profiler.start") }
    const t0 = Date.now()
    let written = false
    const writing = appendRows(ed, rows, GAP).then(() => { written = true })
    const seen = async () => ed.js(() => (document.getElementById("wb-preview-root")?.textContent ?? "").includes("Own 7 v1"))
    let landed = null
    await scrollWhile(ed, cdp, async () => {
      if (landed === null && (await seen())) landed = Date.now() - t0
      return written && (landed !== null || Date.now() - t0 > 60_000) && Date.now() - t0 > N * GAP + 1000
    })
    await writing
    const tail = Date.now()
    await scrollWhile(ed, cdp, async () => Date.now() - tail > QUIET)
    if (landed === null && (await seen())) landed = Date.now() - t0
    if (process.env.PROFILE) printProfile((await cdp.send("Profiler.stop")).profile)
    const w = await stopWindow(ed, cdp, m0, N)
    w.landedMs = landed
    w.iframesNow = await ed.js(() => document.querySelectorAll("iframe").length)
    w.heap = [before, await leftBehind(ed, cdp)]
    w.errors = ed.errors.filter((e) => !/ResizeObserver loop/.test(e)).slice(0, 3)
    fmt("storelib theme, 200 files", w)
    console.log(`  left behind: ${w.heap.map((h) => `${h.heapMB}MB docs ${h.documents} lis ${h.lis} int ${h.intervals} obs ${h.obs}`).join(" -> ")}`)
    out.scenarios.native200 = w
  } finally {
    await ed.close()
  }
}

if (process.env.JSON) writeFileSync(process.env.JSON, JSON.stringify(out, null, 2))

/* ── Budgets: what a push may cost, so it cannot creep back ── */
const fails = []
const want = (ok, what, got) => { console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}   (${JSON.stringify(got)})`); if (!ok) fails.push(what) }
if (process.env.BUDGET !== "0") {
  console.log("\nbudgets")
  const k = Math.max(1, CPU)
  for (const [name, s] of Object.entries(out.scenarios)) {
    const list = name === "repeat" ? s.pushes.map((w, i) => [`${name} ${i + 1}`, w]) : [[name, s]]
    for (const [n, w] of list) {
      want(w.landedMs !== null, `${n}: the push reaches the canvas`, w.landedMs)
      want((w.errors ?? []).length === 0, `${n}: nothing thrown`, w.errors)
      want(w.iframesNow <= (w.iframesBase ?? 2), `${n}: every iframe a push made is let go (no more than before it)`, { now: w.iframesNow, before: w.iframesBase })
      want(w.longMax <= 250 * k, `${n}: no long task over ${250 * k}ms`, w.longMax)
      if (/^stream|^burst|^repeat|^native/.test(n)) {
        const by = (re) => Object.entries(w.req ?? {}).filter(([k]) => re.test(k)).reduce((a, [, c]) => a + c, 0)
        /* One push is one apply: the canvas drawn once behind (and the library's sheet once), never once per poll while its rows come in. */
        want(w.docsLoaded <= 2, `${n}: one push loads the canvas once (and the library's sheet once), not once per poll`, w.docsLoaded)
        want(by(/sources=1|compat=1/) <= 1, `${n}: the theme is read once for the whole push`, w.req)
        want(by(/path=/) <= 6, `${n}: not one request per pushed file`, w.req)
        want(by(/sync-status/) <= 2, `${n}: the sync report is read once or twice, not per poll`, w.req)
        want(w.commits <= 30, `${n}: React commits stay a few per push, not per row or per poll`, w.commits)
      }
      if (n === "echo") want(w.docsLoaded === 0 && w.requests <= 12, `echo: a push that changed nothing reloads nothing`, { docs: w.docsLoaded, req: w.req })
    }
  }
  if (out.scenarios.repeat) {
    const h = out.scenarios.repeat.heap
    const first = h[1]
    const last = h[h.length - 1]
    /* A frame's document kept after its iframe went (the library's old sheet held it) was two more documents alive after every push. */
    want(last.documents === null || last.documents - first.documents <= 1, "repeat: documents alive do not grow push after push", h.map((x) => x.documents))
    want(last.heapMB - first.heapMB <= 8, "repeat: heap does not grow push after push", h.map((x) => x.heapMB))
    want(last.lis - first.lis <= 20, "repeat: listeners do not pile up", h.map((x) => x.lis))
    want(last.intervals - first.intervals <= 1, "repeat: intervals do not pile up", h.map((x) => x.intervals))
    want(last.obs - first.obs <= 6, "repeat: observers do not pile up", h.map((x) => x.obs))
  }
}
if (fails.length) console.log(`\n${fails.length} over budget`)
process.exit(fails.length ? 1 : 0)
