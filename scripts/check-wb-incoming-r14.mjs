/**
 * ===========================================================================
 *  CHANGES ARRIVING IN THE OPEN EDITOR, ON THE OWNER'S REAL THEME (round 14)
 * ===========================================================================
 * The owner: "When it receives changes from the AI Storelib agent or from
 * GitHub, it freezes, it glitches, it bugs, it crashes."
 *
 * The real editor (scripts/editor-probe-harness.mjs, the shipped code
 * bundled for production) open on the owner's Materia theme as its store
 * serves it (scripts/materia-live-fixture.mjs: 26 sections, 900KB of markup,
 * 1.8MB of the theme's own CSS and JS running in the canvas). While the
 * person scrolls the canvas (a wheel, back and forth, net zero) and types in
 * the sidebar (a section's text setting, one key every 70ms), one of these
 * arrives:
 *
 *   ai-burst     Ask Storelib's run, streamed as the route streams it
 *                (NDJSON, ask-client.ts streamPost): 44 operations in 3s,
 *                section settings on 20 sections, the theme settings, two
 *                sections added, two moved
 *   ai-code      a run that rewrites three sections' files (`code` lines),
 *                changes ten sections and the theme, then `sources-changed`
 *   mcp-burst    a connected agent (Claude Code through MCP): 30 page edits
 *                written to the activity log over 3s, read by the editor's
 *                own poll (site-connections.tsx useSiteActivity)
 *   push-small   a GitHub push of the theme's stylesheet
 *   push-medium  stylesheet, script, three sections and the settings
 *   push-large   every section, the stylesheet, the script, the settings
 *
 * Measured from the moment it starts until the canvas is quiet, in the
 * editor's window and inside the canvas's frame:
 *
 *   LONG TASKS   PerformanceObserver longtask, in each document
 *   INPUT DELAY  each key typed: from the key's timestamp to its first
 *                handler (the wait the person feels), p95 and worst
 *   FRAMES       requestAnimationFrame in the editor and in the frame:
 *                frames dropped, the longest
 *   RELOADS      canvas documents loaded (iframe load events), frames made
 *   COMMITS      React commits of the editor (a devtools hook)
 *   BY ORIGIN    main-thread self time from a CPU profile, editor JS vs the
 *                theme's JS (its files and its inline scripts) vs the rest
 *   KEPT         every edit on the canvas once (lost and doubled counted),
 *                the typed text in its field with the focus still there,
 *                the canvas where it was scrolled to
 *   ERRORS       page errors, console errors, unhandled rejections
 *   HEAP         JSHeapUsedSize after collection
 *
 *   npx tsx scripts/check-wb-incoming-r14.mjs
 *   CPU=1|4 (default both)  ONLY=<scenario regex>  EDITOR_BUNDLE=<file>  JSON=<file>
 *   SHOTS=<dir>  BUDGET=0 (report without failing)
 *
 * Budgets (each scenario, CPU 1x; at 4x reported, and held to 4x the time):
 *   longest task in the editor's window      <= 200ms
 *   input delay p95 while it applies         <= 100ms
 *   canvas documents loaded                  <= 1
 *   edits lost / doubled                     0 / 0
 *   typed text kept, focus kept, scroll kept yes
 *   errors                                   0
 *
 * Round 14, the same machine, bundle before (origin/main 315eeab09) and after:
 *   (see the table in the round's report; filled from JSON= runs)
 */
import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"

process.env.PROBE_CSS = process.env.PROBE_CSS ?? "source"
const { bundle, css } = await import("./editor-probe-harness.mjs")
const { openEditor, sleep } = await import("./canvas-probe-kit.mjs")
const { materiaLiveTheme } = await import("./materia-live-fixture.mjs")

const ONLY = process.env.ONLY ? new RegExp(process.env.ONLY, "i") : null
const CPUS = (process.env.CPU ?? "1,4").split(",").map(Number)
const BUDGET = process.env.BUDGET !== "0"
const SHOTS = process.env.SHOTS ?? ""
if (SHOTS) mkdirSync(SHOTS, { recursive: true })
let broken = 0
const expect = (ok, what, got) => {
  console.log(`    ${ok ? "ok  " : BUDGET ? "FAIL" : "note"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got).slice(0, 240)})`}`)
  if (!ok && BUDGET) broken++
}
const within = (p, ms = 8000) => Promise.race([p, new Promise((r) => setTimeout(() => r(null), ms))])
const report = {}

/* ── In every document (the editor's and each canvas frame's) ── */
const INIT = String.raw`
(function () {
  if (window.__r14) return
  var R = window.__r14 = { on: false, lt: [], keys: [], frames: [], loads: 0, made: 0, commits: 0, picks: 0, errors: [] }
  try { new PerformanceObserver(function (l) { l.getEntries().forEach(function (e) { if (R.on) R.lt.push(Math.round(e.duration)) }) }).observe({ type: "longtask", buffered: false }) } catch (e) {}
  var raf = window.requestAnimationFrame.bind(window)
  var tick = function (t) { if (R.on) R.frames.push(t); raf(tick) }
  raf(tick)
  window.addEventListener("error", function (e) { R.errors.push("error: " + (e.message || "")) })
  window.addEventListener("unhandledrejection", function (e) { R.errors.push("unhandledrejection: " + String(e.reason && (e.reason.stack || e.reason.message) || e.reason).slice(0, 200)) })
  if (window.top === window) {
    /* The wait before a key's first handler: its timestamp is when the key was pressed. */
    window.addEventListener("keydown", function (e) { if (R.on) R.keys.push(performance.now() - e.timeStamp) }, true)
    /* Canvas documents: frames made and loaded. */
    document.addEventListener("load", function (e) { if (R.on && e.target && e.target.tagName === "IFRAME" && e.target.hasAttribute("data-compat-frame")) R.loads++ }, true)
    new MutationObserver(function (ms) { ms.forEach(function (m) { m.addedNodes.forEach(function (n) { if (R.on && n.nodeType === 1 && (n.matches("iframe[data-compat-frame]") || n.querySelector && n.querySelector("iframe[data-compat-frame]"))) R.made++ }) }) }).observe(document, { childList: true, subtree: true })
    /* The canvas saying a section was picked: the person never clicks the canvas here, so any is a selection taken from them. */
    window.addEventListener("message", function (e) { if (R.on && e.data && e.data.storelib === 1 && e.data.type === "pick") R.picks++ })
    /* React commits of the editor. */
    window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = { supportsFiber: true, renderers: new Map(), inject: function () { return 1 }, onScheduleFiberRoot: function () {}, onCommitFiberRoot: function () { if (R.on) R.commits++ }, onCommitFiberUnmount: function () {}, onPostCommitFiberRoot: function () {}, checkDCE: function () {} }
  }
  /* In a canvas frame: the reveals the builder asked for, and when the person last turned the wheel there. */
  R.reveals = []; R.wheelAt = 0; R.scrolls = []
  ;["scrollTo", "scrollBy"].forEach(function (n) { var f = window[n]; window[n] = function () { if (R.on) R.scrolls.push(n + JSON.stringify(Array.prototype.slice.call(arguments)).slice(0, 60) + " @" + Math.round(scrollY) + " " + String(new Error().stack).split("\n").slice(2, 5).map(function (l) { return l.trim().slice(0, 50) }).join(" < ")); return f.apply(window, arguments) } })
  var siv = Element.prototype.scrollIntoView
  Element.prototype.scrollIntoView = function () { if (R.on) R.scrolls.push("intoView " + (this.id || this.className) + " " + String(new Error().stack).split("\n").slice(2, 5).map(function (l) { return l.trim().slice(0, 50) }).join(" < ")); return siv.apply(this, arguments) }
  window.addEventListener("wheel", function () { R.wheelAt = Date.now() }, { passive: true, capture: true })
  window.addEventListener("message", function (e) { if (e.data && e.data.storelib === 1 && e.data.type === "reveal") R.reveals.push({ since: e.data.since, at: Date.now(), wheelAt: R.wheelAt }) })
  R.start = function () { R.on = true; R.lt = []; R.keys = []; R.frames = []; R.loads = 0; R.made = 0; R.commits = 0; R.picks = 0; R.errors = [] }
  R.stop = function () {
    R.on = false
    var iv = []
    for (var i = 1; i < R.frames.length; i++) iv.push(R.frames[i] - R.frames[i - 1])
    var keys = R.keys.slice().sort(function (a, b) { return a - b })
    return { lt: R.lt, ltMax: R.lt.length ? Math.max.apply(null, R.lt) : 0, ltTotal: R.lt.reduce(function (a, b) { return a + b }, 0),
      keys: keys.length, keyP95: keys.length ? Math.round(keys[Math.min(keys.length - 1, Math.floor(keys.length * 0.95))]) : 0, keyMax: keys.length ? Math.round(keys[keys.length - 1]) : 0,
      dropped: iv.reduce(function (n, d) { return n + Math.max(0, Math.round(d / 16.7) - 1) }, 0), longestFrame: Math.round(Math.max.apply(null, [0].concat(iv))),
      reveals: R.reveals.slice(-3), scrolls: R.scrolls.slice(-12), loads: R.loads, made: R.made, commits: R.commits, picks: R.picks, errors: R.errors.slice(0, 5) }
  }
})()
`

/* ── Ask Storelib's route, streamed: [ms after the request, line] ── */
const AGENT_STUB = String.raw`
(function () {
  if (window.__agentStub) return
  window.__agentStub = true
  var inner = window.fetch
  window.fetch = function (input, init) {
    var url = typeof input === "string" ? input : input.url
    if (/\/themes\/probe-install\/agent$/.test(url) && init && init.method === "POST") {
      var script = window.PROBE_AGENT_SCRIPT || []
      window.probeAgentAsked = (window.probeAgentAsked || 0) + 1
      var enc = new TextEncoder()
      var last = script.length ? script[script.length - 1][0] : 0
      var body = new ReadableStream({ start: function (c) {
        script.forEach(function (s) { setTimeout(function () { c.enqueue(enc.encode(JSON.stringify(s[1]) + "\n")) }, s[0]) })
        setTimeout(function () { c.close() }, last + 60)
      } })
      return Promise.resolve(new Response(body, { status: 200, headers: { "content-type": "application/x-ndjson" } }))
    }
    /* A save is kept, as the route keeps it: a page read again after a push is the page as last saved. */
    if (init && init.method === "PUT" && /\/themes\/probe-install\/sections$/.test(url) && window.PROBE_COMPAT) {
      try { var b = JSON.parse(String(init.body)); if (b && b.page_key && Array.isArray(b.sections)) window.PROBE_COMPAT.pages[b.page_key] = b.sections } catch (e) {}
    }
    if (/\/themes\/probe-install\/chat/.test(url)) return Promise.resolve(new Response(JSON.stringify({ messages: [], conversation: null }), { status: 200, headers: { "content-type": "application/json" } }))
    if (/\/agent\/decide$/.test(url)) return Promise.resolve(new Response(JSON.stringify({ agent: "agent" }), { status: 200, headers: { "content-type": "application/json" } }))
    return inner.apply(this, arguments)
  }
})()
`

/* ── Waiting for the canvas to be quiet: the same front frame, the same frames, no request, for `quiet` ms ── */
async function settle(page, quiet = 1500, cap = 30000) {
  const t0 = Date.now()
  let last = null, since = Date.now()
  while (Date.now() - t0 < cap) {
    const now = await page.evaluate(() => {
      const front = document.querySelector("[data-compat-frame='front']")
      if (front && !front.__pid) front.__pid = Math.random().toString(36).slice(2)
      return `${document.querySelectorAll("[data-compat-frame]").length}:${front?.__pid ?? ""}:${window.probeCalls.length}`
    })
    if (now !== last) { last = now; since = Date.now() }
    else if (Date.now() - since >= quiet) return Date.now() - t0
    await sleep(200)
  }
  return Date.now() - t0
}

/* The editor's poll has read the log to its end: its latest ask starts after the last line written. */
async function caughtUp(page, cap = 30000) {
  const t0 = Date.now()
  while (Date.now() - t0 < cap) {
    const done = await page.evaluate(() => {
      const top = window.PROBE_ACTIVITY.events.at(-1)?.id ?? 0
      return window.probeCalls.some((c) => { const m = /agent-activity\?after=(\d+)/.exec(c); return m && Number(m[1]) >= top })
    }).catch(() => false)
    if (done) return Date.now() - t0
    await sleep(200)
  }
  return -1
}

/* ── The person, meanwhile: a wheel over the canvas, back and forth, and keys in the sidebar ── */
async function person(ed, text, ms) {
  const { page } = ed
  /* A point of the canvas nothing of the editor's covers (Ask Storelib's conversation opens over its middle). */
  const box = await page.evaluate(() => {
    const f = document.querySelector("iframe[data-compat-frame='front']")
    const r = f?.getBoundingClientRect()
    if (!r) return null
    for (const fx of [0.5, 0.1, 0.9, 0.3, 0.7]) for (const fy of [0.5, 0.3, 0.7, 0.15]) {
      const x = r.left + r.width * fx, y = Math.max(r.top, 0) + (Math.min(r.bottom, innerHeight) - Math.max(r.top, 0)) * fy
      if (document.elementFromPoint(x, y) === f) return { x, y }
    }
    return null
  })
  const wheel = (async () => {
    if (!box) return
    const t0 = Date.now()
    let k = 0
    while (Date.now() - t0 < ms) {
      await page.mouse.move(box.x, box.y)
      await page.mouse.wheel({ deltaY: k % 20 < 10 ? 100 : -100 })
      k++
      await sleep(30)
    }
    /* Back where it started: an even number of turns each way. */
    while (k % 20 !== 0) { await page.mouse.wheel({ deltaY: k % 20 < 10 ? 100 : -100 }); k++; await sleep(30) }
  })()
  const keys = (async () => {
    for (const ch of text) { await page.keyboard.type(ch); await sleep(70) }
  })()
  await Promise.all([wheel, keys])
}

/* The section the person types in: opened from the sidebar's list, its Probe field focused. */
async function openTypingField(page, sectionName) {
  await page.click(`::-p-text(${sectionName})`).catch(() => null)
  await sleep(600)
  return page.evaluate(() => {
    const el = [...document.querySelectorAll("[data-wb-sidebar-panel] input[type=text], [data-wb-sidebar-panel] input:not([type]), [data-wb-sidebar-panel] textarea")].find((x) => x.getClientRects().length)
    if (!el) return false
    el.focus()
    el.setAttribute("data-probe-typing", "")
    return true
  }).then(async (ok) => {
    /* Empty, so what is typed now is all it holds. */
    if (ok) { await page.keyboard.down("Control"); await page.keyboard.press("a"); await page.keyboard.up("Control"); await page.keyboard.press("Backspace") }
    return ok
  })
}
const backToField = (page) => page.evaluate(() => { const el = document.querySelector("[data-probe-typing]"); if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length) } })

/* The theme's own pop-up (a countdown offer) opens over the page a moment after it loads: closed, as the person would. */
const closePopups = async (ed) => {
  const f = await ed.front()
  await within(f?.evaluate(() => { for (const b of document.querySelectorAll(".cdp-close-countdown_promo_popup, .cookie-consent__close")) if (b.getClientRects().length) b.click() }).catch(() => null), 3000)
}

/* What the canvas shows: each section's probe mark, the theme's text, the push marks. */
const readCanvas = async (ed) => {
  const f = await ed.front()
  if (!f) return null
  return within(f.evaluate(() => {
    const marks = {}
    const count = {}
    for (const s of document.querySelectorAll(".shopify-section")) {
      const id = s.id.replace(/^shopify-section-/, "")
      count[id] = (count[id] ?? 0) + 1
      const m = s.querySelector("i[data-probe-attr]")
      marks[id] = m ? `${m.textContent}|${m.getAttribute("data-probe-attr")}` : null
    }
    return {
      marks, count, scrollY: Math.round(scrollY),
      text: document.querySelector("[data-probe-text]")?.getAttribute("data-probe-text") ?? null,
      color: getComputedStyle(document.documentElement).getPropertyValue("--probe-color").trim(),
      themeJs: [...document.scripts].filter((x) => /theme\.js/.test(x.src)).map((x) => x.src.slice(-60) + (x.type ? " " + x.type : "")),
      push: [getComputedStyle(document.documentElement).getPropertyValue("--probe-push").trim() || "0", String(window.__probePush || 0)].join("/"),
      code: [...document.querySelectorAll("[data-probe-code]")].map((x) => x.getAttribute("data-probe-code")),
      codeBy: Object.fromEntries([...document.querySelectorAll(".shopify-section")].map((s) => [s.id.replace(/^shopify-section-/, ""), [...s.querySelectorAll("[data-probe-code]")].map((x) => x.getAttribute("data-probe-code"))])),
    }
  }).catch(() => null), 5000)
}

/* ── The scenarios ── */
/* The mark each section prints (materia-live-fixture.mjs): its text, then its data- attribute. */
const MARK = /<i hidden class="probe-mark" data-probe-attr="\{\{ section\.settings\.probe_attr \| default: '-' \}\}"( data-probe-code="[^"]*")?>/
const markWith = (source, code) => {
  if (!MARK.test(source)) throw new Error("the section's mark is not in its file: materia-live-fixture.mjs and this probe disagree")
  return source.replace(MARK, `<i hidden class="probe-mark" data-probe-attr="{{ section.settings.probe_attr | default: '-' }}" data-probe-code="${code}">`)
}
/*
  Each change is a section's text (`probe`), and every fourth its data- attribute too (`probe_attr`, which a theme's
  script may read when it starts, so the canvas starts the section again): `touch` lists them in order, and what each
  section must show at the end is worked out from them.
*/
const patchFor = (i, v) => (i % 4 === 0 ? { probe: v, probe_attr: v } : { probe: v })
function scenarios(compat) {
  const home = compat.pages.home
  const main = home.filter((s) => !s.group).map((s) => s.id)
  const editable = main.filter((id) => !/brand_logo/.test(id))
  const shopify = compat.settings.shopify ?? {}
  const divider = home.find((s) => /divider/.test(s.type)).type
  return [
    /* Nothing arrives: the person scrolls and types. What the theme and the editor cost on their own. */
    { name: "idle", kind: "idle", build: () => ({ touch: [] }) },
    {
      name: "ai-burst", kind: "ai",
      build(round) {
        const lines = [], touch = []
        let t = 200, themeText = null
        lines.push([60, { type: "subject", text: "Editing the home page" }])
        for (let i = 0; i < 44; i++) {
          t += 68
          if (i % 7 === 3) { themeText = `ai-${round}-theme-${i}`; lines.push([t, { type: "op", op: { kind: "update_theme", settings: { shopify: { ...shopify, probe_text: themeText } } }, label: "Changed the theme" }]); continue }
          if (i === 10 || i === 30) { const id = `ai-${round}-added-${i}`; lines.push([t, { type: "op", op: { kind: "add_section", id, sectionType: divider, settings: { probe: id } }, label: "Added a divider" }]); touch.push([id, { probe: id }]); continue }
          if (i === 20 || i === 40) { lines.push([t, { type: "op", op: { kind: "move_section", id: editable[i % editable.length], index: 4 + (i % 5) }, label: "Moved" }]); continue }
          const id = editable[i % editable.length]
          const patch = patchFor(i, `ai-${round}-${i}`)
          lines.push([t, { type: "step", id: `s${i}`, label: "Writing", state: "done", sections: [id] }])
          lines.push([t, { type: "op", op: { kind: "update_section", id, settings: patch }, label: "Changed a section" }])
          touch.push([id, patch])
        }
        lines.push([t + 120, { type: "message", text: "Done." }])
        return { lines, touch, themeText }
      },
    },
    {
      name: "ai-code", kind: "ai",
      build(round) {
        const lines = [], touch = [], code = []
        let t = 200
        const rewrite = editable.slice(2, 5)
        for (const [k, id] of rewrite.entries()) {
          const path = `sections/${home.find((s) => s.id === id).type}.storelib`
          const source = markWith(compat.all[path], `${round}-${k}`)
          code.push([path, source])
          t += 400
          lines.push([t, { type: "step", id: `c${k}`, label: "Rewriting a section", state: "running", sections: [id] }])
          lines.push([t + 200, { type: "code", path, source }])
        }
        for (let i = 0; i < 10; i++) {
          t += 90
          const id = editable[(i * 2) % editable.length]
          const patch = patchFor(i, `code-${round}-${i}`)
          lines.push([t, { type: "op", op: { kind: "update_section", id, settings: patch }, label: "Changed a section" }])
          touch.push([id, patch])
        }
        const themeText = `code-${round}-theme`
        lines.push([t + 60, { type: "op", op: { kind: "update_theme", settings: { shopify: { ...shopify, probe_text: themeText } } }, label: "Changed the theme" }])
        lines.push([t + 200, { type: "sources-changed" }])
        lines.push([t + 260, { type: "message", text: "Done." }])
        return { lines, touch, themeText, code, codeMarks: Object.fromEntries(rewrite.map((id, k) => [id, `${round}-${k}`])) }
      },
    },
    {
      name: "mcp-burst", kind: "mcp",
      build(round) {
        const events = [], touch = []
        for (let i = 0; i < 30; i++) {
          const id = editable[(i * 3) % editable.length]
          const patch = patchFor(i, `mcp-${round}-${i}`)
          events.push({ at: i * 100, ev: { agent_name: "Claude Code", path: "pages/home", action: "page", detail: { page: "home", ops: [{ kind: "update_section", id, settings: patch }] } } })
          touch.push([id, patch])
        }
        return { events, touch }
      },
    },
    ...[["push-small", 1], ["push-medium", 3], ["push-large", main.length]].map(([name, n]) => ({
      name, kind: "push",
      build(round) {
        const ids = editable.slice(0, n)
        const files = ["shopify/assets/theme.css", ...(n > 1 ? ["shopify/assets/theme.js"] : []), ...ids.map((id) => `sections/${home.find((s) => s.id === id).type}.storelib`)]
        return { files, settings: n > 1, touch: [], codeMarks: Object.fromEntries(ids.map((id) => [id, `push-${round}`])) }
      },
    })),
  ]
}

/* The theme's files, as a push leaves them on the server: what changed can be read in the canvas. */
async function pushFiles(ed, compat, files, round) {
  const next = (p, text) => p.endsWith(".css") ? `${text.replace(/\n:root\{--probe-push:\d+\}$/, "")}\n:root{--probe-push:${round}}`
    : p.endsWith(".js") ? `${text.replace(/\n;window\.__probePush=\d+;$/, "")}\n;window.__probePush=${round};`
    : markWith(text, `push-${round}`)
  for (const p of files) compat.all[p] = next(p, compat.all[p])
  await ed.page.evaluate((all) => {
    const c = window.PROBE_COMPAT
    for (const [p, text] of Object.entries(all)) (p.startsWith("shopify/") ? c.files : c.sources)[p] = text
  }, Object.fromEntries(files.map((p) => [p, compat.all[p]])))
}

/* Main-thread self time by origin, from a CPU profile. */
function byOrigin(profile) {
  const nodes = new Map(profile.nodes.map((n) => [n.id, n]))
  const dt = profile.timeDeltas
  const out = { editor: 0, theme: 0, inline: 0, gc: 0, other: 0 }
  for (let i = 0; i < profile.samples.length; i++) {
    const n = nodes.get(profile.samples[i])
    const ms = (dt[i + 1] ?? dt[i] ?? 0) / 1000
    const url = n.callFrame.url
    const fn = n.callFrame.functionName
    if (fn === "(idle)") continue
    if (fn === "(garbage collector)") out.gc += ms
    else if (/editor-probe\.js/.test(url)) out.editor += ms
    else if (/\/api\/site-theme\/assets\//.test(url)) out.theme += ms
    /* The page's own inline scripts: the canvas bridge and the theme's inline ones. */
    else if (/^about:srcdoc|^blob:/.test(url)) out.inline += ms
    else out.other += ms
  }
  for (const k of Object.keys(out)) out[k] = Math.round(out[k])
  return out
}

async function run(cpu) {
  console.log(`\nCPU ${cpu}x, the owner's Materia theme (real files), desktop 1440x900`)
  const compat = await materiaLiveTheme()
  const globals = `window.PROBE_ACTIVITY={events:[],syncAt:"2026-10-01T00:00:00.000Z"};window.PROBE_CONNECTIONS={agents:[{id:"a1",name:"Claude Code",kind:"claude",online:true}],github:{repo:"owner/materia"},latest:null};`
  const ed = await openEditor({ kind: "imported", bundle, css, compat, globals, init: INIT, cpu, settle: 3000 })
  const { page } = ed
  page.on("console", (m) => { if (m.type() === "error") ed.errors.push(`console: ${m.text().slice(0, 200)}`) })
  await page.evaluate(AGENT_STUB)
  const cdp = await page.createCDPSession()
  await cdp.send("Performance.enable")
  await cdp.send("Profiler.enable")
  await cdp.send("Profiler.setSamplingInterval", { interval: 500 })
  const rows = []
  report[`cpu${cpu}`] = rows
  /* Every section's probe settings, as the changes so far leave them. */
  const model = {}
  try {
    let round = 0
    for (const sc of scenarios(compat)) {
      if (ONLY && !ONLY.test(sc.name)) continue
      round++
      const plan = sc.build(round)
      /* Where the person is: scrolled into the page, a section's field focused. */
      const f = await ed.front()
      await closePopups(ed)
      await within(f?.evaluate(() => scrollTo(0, 3000)), 3000)
      await sleep(300)
      const typingOk = await openTypingField(page, "brand_logo_CnjyLc")
      const panelAt = () => page.evaluate(() => (document.querySelector("[data-wb-sidebar-panel]")?.innerText ?? "").replace(/\s+/g, " ").slice(0, 90))
      const panelBefore = await panelAt()
      const typed = `typed ${round} while it lands`
      await sleep(400)
      const scrollBefore = (await readCanvas(ed))?.scrollY ?? null
      const errors0 = ed.errors.length
      await page.evaluate(() => window.__r14.start())
      for (const fr of page.frames()) await within(fr.evaluate(() => window.__r14 && window.__r14.start()).catch(() => null), 2000)
      await cdp.send("Profiler.start")
      const t0 = Date.now()
      let trigger
      if (sc.kind === "ai") {
        await page.evaluate((lines) => { window.PROBE_AGENT_SCRIPT = lines }, plan.lines)
        /* What the route keeps when the run ends: reading the files back answers what was written. */
        if (plan.code) await page.evaluate((code) => { for (const [p, s] of code) window.PROBE_COMPAT.sources[p] = s }, plan.code)
        if (plan.code) for (const [p, s] of plan.code) compat.all[p] = s
        /* Asked from the Ask bar, as the person asks. The field keeps its focus afterwards: the person goes back to it. */
        const ask = await page.$("textarea[aria-label='Message Storelib AI']")
        if (ask) {
          await ask.click()
          await page.keyboard.type("Change the home page")
          await page.keyboard.press("Enter")
        } else console.log("    (the Ask bar was not found)")
        await sleep(150)
        await backToField(page)
      } else if (sc.kind === "mcp") {
        /* Written to the log over 3s, as the agent's calls land; the poll reads it at its own pace. */
        const writes = (async () => {
          for (const { at, ev } of plan.events) {
            const wait = at - (Date.now() - t0)
            if (wait > 0) await sleep(wait)
            await page.evaluate((ev) => { const a = window.PROBE_ACTIVITY; const id = (a.events.at(-1)?.id ?? 0) + 1; a.events.push({ id, created_at: new Date().toISOString(), ...ev }) }, ev)
          }
        })()
        trigger = writes
      } else if (sc.kind === "push") {
        await pushFiles(ed, compat, plan.files, round)
        await page.evaluate((files, withSettings) => {
          const a = window.PROBE_ACTIVITY
          let id = a.events.at(-1)?.id ?? 0
          for (const p of files) a.events.push({ id: ++id, agent_name: "GitHub", path: p.replace(/^shopify\//, "shopify/"), action: "updated", created_at: new Date().toISOString() })
          if (withSettings) a.events.push({ id: ++id, agent_name: "GitHub", path: "settings", action: "page", detail: { replaced: true }, created_at: new Date().toISOString() })
          a.syncAt = new Date().toISOString()
        }, plan.files, plan.settings)
        /* The poll, woken as after switching back from GitHub. */
        await page.evaluate(() => window.dispatchEvent(new Event("focus")))
      }
      await person(ed, typed, 3200)
      if (trigger) await trigger
      if (sc.kind === "mcp" || sc.kind === "push") await caughtUp(page)
      const settleMs = Date.now() - t0 + await settle(page, 2000)
      const profile = (await cdp.send("Profiler.stop")).profile
      const editor = await page.evaluate(() => window.__r14.stop())
      const frames = []
      for (const fr of page.frames()) { if (fr === page.mainFrame()) continue; const r = await within(fr.evaluate(() => window.__r14 ? window.__r14.stop() : null).catch(() => null), 3000); if (r) frames.push(r) }
      const frame = frames.reduce((a, r) => ({ ltMax: Math.max(a.ltMax, r.ltMax), ltTotal: a.ltTotal + r.ltTotal, dropped: Math.max(a.dropped, r.dropped), longestFrame: Math.max(a.longestFrame, r.longestFrame), errors: [...a.errors, ...r.errors] }), { ltMax: 0, ltTotal: 0, dropped: 0, longestFrame: 0, errors: [] })
      const origin = byOrigin(profile)
      if (process.env.PROFILES) { mkdirSync(process.env.PROFILES, { recursive: true }); writeFileSync(join(process.env.PROFILES, `cpu${cpu}-${sc.name}.cpuprofile`), JSON.stringify(profile)) }
      /* What is on screen now. */
      const shown = await readCanvas(ed)
      const field = await page.evaluate(() => { const el = document.querySelector("[data-probe-typing]"); return { value: el?.value ?? null, focused: !!el && document.activeElement === el } })
      for (let k = 0; k < 2; k++) await cdp.send("HeapProfiler.collectGarbage")
      const { metrics } = await cdp.send("Performance.getMetrics")
      const heap = Math.round((metrics.find((m) => m.name === "JSHeapUsedSize")?.value ?? 0) / 1e5) / 10
      /* Kept: each edit on the canvas once. */
      let lost = 0, doubled = 0
      const missing = []
      const touched = new Set()
      for (const [id, patch] of plan.touch ?? []) { model[id] = { ...(model[id] ?? {}), ...patch }; touched.add(id) }
      if (shown) for (const id of touched) {
        const want = `${model[id].probe || "-"}|${model[id].probe_attr || "-"}`
        if ((shown.count[id] ?? 0) > 1) doubled++
        if (shown.marks[id] !== want) { lost++; missing.push(`${id}=${shown.marks[id]} want ${want}`) }
      }
      if (shown && plan.themeText && shown.text !== plan.themeText) { lost++; missing.push(`theme text=${shown.text}`) }
      if (shown && plan.codeMarks) for (const [id, m] of Object.entries(plan.codeMarks)) if (!shown.codeBy?.[id]?.includes(m)) { lost++; missing.push(`code ${id} ${shown.codeBy?.[id]} want ${m}`) }
      if (shown && sc.kind === "push") {
        const want = `${round}/${plan.files.some((p) => p.endsWith(".js")) ? round : shown.push.split("/")[1]}`
        if (shown.push !== want) { lost++; missing.push(`push ${shown.push} want ${want}`) }
      }
      if (shown) for (const [id, n] of Object.entries(shown.count)) if (n > 1 && !touched.has(id)) doubled++
      const errors = [...ed.errors.slice(errors0), ...editor.errors, ...frame.errors].filter((e) => !/ResizeObserver loop|Failed to load resource|Blocked script execution in 'about:srcdoc'|blocked by CORS policy/.test(e))
      const row = {
        scenario: sc.name, settleMs, editor: { ltMax: editor.ltMax, ltTotal: editor.ltTotal, longTasks: editor.lt.length, keyP95: editor.keyP95, keyMax: editor.keyMax, keys: editor.keys, dropped: editor.dropped, longestFrame: editor.longestFrame, commits: editor.commits },
        frame: { ltMax: frame.ltMax, ltTotal: frame.ltTotal, dropped: frame.dropped, longestFrame: frame.longestFrame },
        loads: editor.loads, made: editor.made, picks: editor.picks, origin, lost, doubled, missing: missing.slice(0, 6),
        typed: field.value === typed || (field.value ?? "").endsWith(typed), typedValue: field.value, focused: field.focused, typingOk,
        scroll: { before: scrollBefore, after: shown?.scrollY ?? null }, heap, errors,
      }
      rows.push(row)
      console.log(`  ${sc.name.padEnd(12)} editor task max ${String(row.editor.ltMax).padStart(4)}ms (${row.editor.longTasks} long, ${row.editor.ltTotal}ms) | keys p95 ${String(row.editor.keyP95).padStart(4)} max ${String(row.editor.keyMax).padStart(4)}ms (${row.editor.keys}) | drop ${row.editor.dropped}/${row.frame.dropped} longest ${row.editor.longestFrame}ms | frame task max ${row.frame.ltMax}ms | loads ${row.loads} made ${row.made} picks ${row.picks} | commits ${row.editor.commits} | js editor/theme/inline/gc/other ${origin.editor}/${origin.theme}/${origin.inline}/${origin.gc}/${origin.other}ms | lost ${lost} doubled ${doubled} | typed ${row.typed ? "kept" : "LOST"} focus ${row.focused ? "kept" : "LOST"} | scroll ${row.scroll.before}->${row.scroll.after} | heap ${heap}MB | settle ${settleMs}ms`)
      if (missing.length) console.log(`       missing: ${missing.join(", ")}${process.env.DEBUG ? " " + JSON.stringify(shown?.themeJs) : ""}`)
      if (process.env.DEBUG) console.log("       reveals:", JSON.stringify(frames.map((f) => f.reveals)), "\n       scrolls:", frames.map((f) => f.scrolls.join("\n         ")).join("\n       --\n         "))
      if (!row.typed) console.log(`       typed: ${JSON.stringify(field.value)} want ${JSON.stringify(typed)}; panel before "${panelBefore}" after "${await panelAt()}"`)
      if (errors.length) console.log(`       errors: ${errors.slice(0, 3).join(" | ")}`)
      if (SHOTS) await page.screenshot({ path: join(SHOTS, `cpu${cpu}-${sc.name}.png`) })
      /* Saved, so the next one starts from a quiet editor (the conflict line, if any, kept mine). */
      await page.evaluate(() => { const b = [...document.querySelectorAll("button")].find((x) => /^Keep mine$|^Keep my version$/i.test(x.textContent.trim())); b?.click() })
      await sleep(800)
    }
    console.log("")
    const slow = cpu
    for (const r of rows) {
      console.log(`  ${r.scenario} (CPU ${cpu}x)`)
      expect(r.editor.ltMax <= 200 * slow, `longest task in the editor's window <= ${200 * slow}ms`, r.editor.ltMax)
      expect(r.editor.keyP95 <= 100 * slow, `input delay p95 while it applies <= ${100 * slow}ms`, r.editor.keyP95)
      expect(r.loads <= 1, "canvas documents loaded <= 1", r.loads)
      expect(r.lost === 0 && r.doubled === 0, "no edit lost or doubled", { lost: r.lost, doubled: r.doubled, missing: r.missing })
      expect(r.typed && r.focused, "the typed text and the focus kept", { typed: r.typed, focused: r.focused })
      expect(r.picks === 0, "the selection is the person's: no section picked by the theme's own clicks", r.picks)
      expect(r.scroll.before === null || r.scroll.after === null || Math.abs(r.scroll.after - r.scroll.before) <= 60, "the canvas where it was scrolled to", r.scroll)
      expect(r.errors.length === 0, "no errors", r.errors.slice(0, 3))
    }
  } finally {
    await ed.close()
  }
}

for (const cpu of CPUS) await run(cpu)
if (process.env.JSON) writeFileSync(process.env.JSON, JSON.stringify(report, null, 2))
console.log(broken ? `\n${broken} check(s) failed.` : "\nAll checks passed.")
process.exit(broken && BUDGET ? 1 : 0)
