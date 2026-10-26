/**
 * ===========================================================================
 *  CHANGES ARRIVING WHILE THE CANVAS IS BEING SCROLLED (round 15)
 * ===========================================================================
 * The owner: "when it receives changes from the Storelib AI agent or from
 * GitHub, it freezes, it glitches, it bugs ... scroll in the canvas still
 * bugs, still freezes, still laggy."
 *
 * Every earlier probe changed the page OR scrolled it. Here the changes come
 * in while a mouse wheel is scrolling the canvas, the way a person keeps
 * reading the page while Ask Storelib or an agent works on it. The real
 * editor (scripts/editor-probe-harness.mjs, a production bundle), a Storelib
 * theme's home page, and three ways a change arrives:
 *
 *   ASK       an Ask Storelib run, as the agent route streams it (scripts/
 *             render-editor-probe.tsx PROBE_AGENT_STREAM): a step and an
 *             edit for a section, every gap, over every section, with theme
 *             colour changes among them and a section added
 *   AGENT     a connected agent's page edits (Claude Code through app/api/mcp),
 *             read by the editor's own poll of the activity log
 *   GITHUB    a push that rewrote the page whole, read the same way
 *   IDLE      nothing arrives: the same scroll alone, what the others are held against
 *   IMPORTED  the same on an imported theme (the Materia store, its canvas a
 *             frame): idle, an Ask Storelib run changing the theme's colours
 *             (every section redrawn by each), and pushes rewriting the page
 *
 * While each plays, a wheel notch every 33ms over the canvas, down and back,
 * and measured in the editor's document (a Storelib theme's canvas is in it):
 *
 *   FRAMES     dropped frames as a share of the time, the longest frame
 *   LONG TASKS the editor's main thread, over 50ms: how many, the longest, all
 *   JUMPS      the canvas thrown back against the wheel (more than 400px up
 *              in a frame while the wheel goes down): "it resets the scroll"
 *   REBUILT    section boxes taken out of the canvas and put back (a redraw
 *              of the whole page where one section changed)
 *   ARRIVED    the last change is on the canvas when it is over
 *   ERRORS     anything thrown in the page
 *
 *   npx tsx scripts/check-wb-live-r15.mjs
 *   ONLY=idle|ask|agent|github|imported-(idle|ask|github)   CPU=4   GAP=80 (ms between Ask lines)   JSON=<file>   BUDGET=0
 *   PROFILE=1  (the editor's busiest functions while it played, self time, from a CPU profile; PROFILE=2 adds inclusive time)
 *   EDITOR_BUNDLE=<file> (the bundle to measure; before and after are two bundles)
 *
 * Round 15, the bundle before (main at 8eb0fb0) and after, same machine, CPU
 * 4x, a Storelib theme, median of three alternating runs (dropped frames /
 * longest task, ms). At 1x both were smooth (at most 1.2% dropped, no task
 * over 70ms); the run to run spread at 4x is wide, so this is modest:
 *
 *                 before          after
 *   idle          10.1% / 0       8.6% / 52
 *   ask           13.8% / 148     16.1% / 135   (all long tasks: 383 -> 254ms)
 *   agent         26.9% / 125     18.5% / 97
 *   github        23.4% / 104     21.4% / 89
 *
 * What a CPU profile (PROFILE=1) named and the round took out: the Ask pill
 * looking the toolbar up on every scroll frame, an open notice measuring and
 * rendering on every scroll event, the chat's height read once per streamed
 * line, the AI marks measured inside the commit, the section library laid out
 * again for every colour a run changed (tests/wb-live-r15.test.ts).
 *
 * Budgets (CPU 1x): dropped frames < 10%, longest frame < 120ms, no long task
 * over 150ms, no jump, nothing rebuilt by an edit to one section, every change
 * arrived, no errors.
 */
import { writeFileSync } from "node:fs"

process.env.PROBE_CSS = process.env.PROBE_CSS ?? "source"
const { bundle, css } = await import("./editor-probe-harness.mjs")
const { importedTheme, openEditor, sleep, STORELIB_GLOBALS } = await import("./canvas-probe-kit.mjs")

const ONLY = process.env.ONLY ? new RegExp(process.env.ONLY, "i") : null
const CPU = Number(process.env.CPU ?? 1)
const GAP = Number(process.env.GAP ?? 80)
const BUDGET = process.env.BUDGET !== "0"
let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : BUDGET ? "FAIL" : "note"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got).slice(0, 300)})`}`)
  if (!ok && BUDGET) broken++
}
const report = {}

/* The home page STORELIB_GLOBALS draws, by id (render-editor-probe.tsx instance ids). */
const HOME = ["header", "hero_centered", "features_grid", "product_grid", "text_rich", "faq_accordion", "promo_newsletter", "cta_simple", "footer"].map((t, i) => `${t}-${i}`)
const EDITABLE = HOME.filter((id) => !/^(header|footer)/.test(id))
const COLOURS = ["#0f766e", "#b45309", "#1d4ed8", "#be123c", "#4d7c0f", "#7c3aed"]

/* ── In the editor's document, from before it opens: frames, long tasks, the canvas's scroll each frame, section boxes rebuilt ── */
const WATCH = String.raw`
(function () {
  var W = window.__lv = { on: false, t: [], y: [], longs: [], at: [], t0: 0, removed: 0 }
  try { new PerformanceObserver(function (l) { if (!W.on) return; l.getEntries().forEach(function (e) { W.longs.push(Math.round(e.duration)); W.at.push(Math.round(e.startTime - W.t0)) }) }).observe({ type: "longtask" }) } catch (e) {}
  /* The scrolled canvas: an imported theme's front frame (same origin, same thread), or a Storelib theme's root in this page. */
  window.__lvSc = function () {
    var f = document.querySelector("[data-compat-frame='front']")
    if (f && f.contentDocument && f.contentDocument.scrollingElement) return f.contentDocument.scrollingElement
    return document.getElementById("wb-preview-root")
  }
  /*
    The scroller found once and kept while it is in the page, and its position
    taken from its own scroll events (round 19): read in every frame, the
    probe looked it up and laid the page out each time, much of the cost it
    measured (a CPU profile named the probe's tick first).
  */
  var sc = null, lastY = 0
  var onScroll = function () { lastY = sc ? sc.scrollTop : 0 }
  var keep = function () {
    var now = window.__lvSc()
    if (now === sc) return
    if (sc) (sc === document.scrollingElement ? document : sc.ownerDocument === document ? sc : sc.ownerDocument).removeEventListener("scroll", onScroll, true)
    sc = now
    if (sc) { (sc.ownerDocument === document ? sc : sc.ownerDocument).addEventListener("scroll", onScroll, { capture: true, passive: true }); lastY = sc.scrollTop }
  }
  var tick = function (t) {
    if (W.on) { if (!sc || !sc.isConnected) keep(); W.t.push(t); W.y.push(lastY) }
    requestAnimationFrame(tick)
  }
  setInterval(function () { if (W.on) keep() }, 500)
  requestAnimationFrame(tick)
  var watchBoxes = function () {
    var root = document.getElementById("wb-preview-root")
    if (!root) return setTimeout(watchBoxes, 200)
    new MutationObserver(function (list) {
      if (!W.on) return
      list.forEach(function (m) { m.removedNodes.forEach(function (n) { if (n.nodeType === 1 && (n.matches("[data-section-box]") || n.querySelector("[data-section-box]"))) W.removed++ }) })
    }).observe(root, { childList: true, subtree: true })
  }
  watchBoxes()
  window.__lvStart = function () { W.t = []; W.y = []; W.longs = []; W.at = []; W.t0 = performance.now(); W.removed = 0; W.on = true }
  window.__lvStop = function () {
    W.on = false
    var d = [], F = 1000 / 60, dropped = 0, jumps = 0
    for (var i = 1; i < W.t.length; i++) { var x = W.t[i] - W.t[i - 1]; d.push(x); dropped += Math.max(0, Math.round(x / F) - 1) }
    for (var j = 1; j < W.y.length; j++) if (W.y[j - 1] - W.y[j] > 400 && window.__lvDown) jumps++
    return { frames: d.length, droppedPct: d.length ? Math.round(dropped / (d.length + dropped) * 1000) / 10 : 0, longest: Math.round(Math.max.apply(null, [0].concat(d))),
      longs: W.longs.length, longAt: W.at, longMs: W.longs, longestTask: Math.max.apply(null, [0].concat(W.longs)), taskMs: W.longs.reduce(function (a, b) { return a + b }, 0), jumps: jumps, removed: W.removed }
  }
})()
`

/* A wheel notch every 33ms over the canvas until `done()` says so: down to near the foot, then back up, and again. */
async function wheelWhile(page, done) {
  const at = await page.evaluate(() => { const r = (document.querySelector("[data-compat-frame='front']") ?? document.getElementById("wb-preview-root")).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } })
  await page.mouse.move(at.x, at.y)
  let dir = 1
  while (!(await done())) {
    const pos = await page.evaluate(() => { const n = window.__lvSc(); return n ? { y: n.scrollTop, room: n.scrollHeight - n.clientHeight } : { y: 0, room: 0 } })
    if (dir > 0 && pos.y > pos.room - 150) dir = -1
    if (dir < 0 && pos.y < 150) dir = 1
    await page.evaluate((d) => { window.__lvDown = d > 0 }, dir)
    await page.mouse.wheel({ deltaY: 100 * dir })
    await sleep(33)
  }
}

/* ── The three ways a change arrives ── */
function askLines(stamp) {
  const lines = [{ type: "subject", text: "Editing the page" }]
  let c = 0
  for (let round = 0; round < 3; round++) {
    for (const id of EDITABLE) {
      lines.push({ type: "step", sections: [id] })
      lines.push({ type: "op", op: { kind: "update_section", id, settings: { heading: `${stamp} ${round} ${id}` } } })
    }
    lines.push({ type: "op", op: { kind: "update_theme", settings: { primary_color: COLOURS[c++ % COLOURS.length], accent_color: COLOURS[c++ % COLOURS.length] } } })
  }
  lines.push({ type: "op", op: { kind: "add_section", id: `cta_simple-${stamp}`, sectionType: "cta_simple", position: 3 } })
  lines.push({ type: "op", op: { kind: "update_section", id: EDITABLE[0], settings: { heading: `${stamp} last` } } })
  lines.push({ type: "message", text: "Done." })
  return lines
}

async function playAsk(ed, stamp) {
  const lines = askLines(stamp)
  await ed.js((l, g) => { window.PROBE_AGENT_STREAM = { lines: l, gapMs: g } }, lines, GAP)
  const box = await ed.page.$("[data-ask-pill] textarea")
  if (!box) throw new Error("no Ask box")
  await box.click()
  await ed.page.keyboard.type("Rewrite the headings")
  await ed.page.keyboard.press("Enter")
  /* The pointer goes back over the canvas for the wheel (the box keeps the focus it had). */
  return { until: Date.now() + lines.length * GAP + 1500, last: `${stamp} last` }
}

/* An imported theme (the Materia store): Ask Storelib changing the theme's colours, each a change every section prints. */
async function playImportedAsk(ed) {
  const lines = [{ type: "subject", text: "Changing the colours" }]
  for (let k = 0; k < 14; k++) lines.push({ type: "op", op: { kind: "update_theme", settings: { color_text: COLOURS[k % COLOURS.length], color_background: k % 2 ? "#f4efe6" : "#ffffff" } } })
  lines.push({ type: "message", text: "Done." })
  const gap = Math.max(GAP, 250)
  await ed.js((l, g) => { window.PROBE_AGENT_STREAM = { lines: l, gapMs: g } }, lines, gap)
  const box = await ed.page.$("[data-ask-pill] textarea")
  if (!box) throw new Error("no Ask box")
  await box.click()
  await ed.page.keyboard.type("Warmer colours")
  await ed.page.keyboard.press("Enter")
  return { until: Date.now() + lines.length * gap + 2500, last: null }
}

async function playAgent(ed, stamp, kind) {
  /* Ten writes, 500ms apart, each read by the editor's own poll. */
  let id = 1000
  const at = Date.now()
  for (let k = 0; k < 10; k++) {
    const target = EDITABLE[k % EDITABLE.length]
    const last = k === 9
    const ev = kind === "github"
      ? { id: ++id, agent_name: "GitHub", path: "pages/home", action: "page", detail: { page: "home", replaced: true }, created_at: new Date().toISOString() }
      : { id: ++id, agent_name: "Claude Code", path: "pages/home", action: "page", detail: { page: "home", ops: [{ kind: "update_section", id: target, settings: { heading: last ? `${stamp} last` : `${stamp} ${k}` } }] }, created_at: new Date().toISOString() }
    setTimeout(() => void ed.js((e) => { window.PROBE_ACTIVITY.events.push(e) }, ev).catch(() => {}), k * 500)
  }
  return { until: at + 10 * 500 + 6000, last: kind === "github" ? null : `${stamp} last` }
}

async function scenario(name) {
  const imported = name.startsWith("imported")
  const globals = `window.PROBE_ACTIVITY={events:[{id:1000,agent_name:"Claude Code",path:"pages/home",action:"page",detail:{page:"home",ops:[]},created_at:"2026-10-01T00:00:00.000Z"}],syncAt:"2026-10-01T00:00:00.000Z"};window.PROBE_CONNECTIONS={agents:[{name:"Claude Code",kind:"claude"}],github:{repo:"owner/site"},latest:null};${imported ? "" : STORELIB_GLOBALS}`
  /* Long enough for the section library's first warm-up to be over: it is gated on input, and a probe that starts typing at once would measure it. */
  const ed = await openEditor({ kind: imported ? "imported" : "native", bundle, css, compat: imported ? await importedTheme({ store: true }) : undefined, globals, init: WATCH, cpu: CPU, settle: 9000 })
  try {
    console.log(`\n${name} (CPU ${CPU}x)`)
    const stamp = `P${Date.now() % 100000}`
    await ed.js(() => window.__lvStart())
    const cdp = process.env.PROFILE ? await ed.page.createCDPSession() : null
    if (cdp) { await cdp.send("Profiler.enable"); await cdp.send("Profiler.setSamplingInterval", { interval: 200 }); await cdp.send("Profiler.start") }
    const play = name === "ask" ? await playAsk(ed, stamp)
      : name === "imported-ask" ? await playImportedAsk(ed)
      : name === "idle" || name === "imported-idle" ? { until: Date.now() + 6000, last: null }
      : await playAgent(ed, stamp, name === "imported-github" ? "github" : name)
    await wheelWhile(ed.page, async () => Date.now() > play.until)
    const m = await ed.js(() => window.__lvStop())
    if (cdp) {
      const { profile } = await cdp.send("Profiler.stop")
      const nodes = new Map(profile.nodes.map((n) => [n.id, n]))
      const parent = new Map()
      for (const n of profile.nodes) for (const c of n.children ?? []) parent.set(c, n.id)
      const self = new Map()
      for (let i = 0; i < profile.samples.length; i++) {
        const n = nodes.get(profile.samples[i])
        const f = n.callFrame
        if (/^\((idle|program|root)\)$/.test(f.functionName)) continue
        /* A built-in (a layout read) is named with the script that called it. */
        let up = !f.url && parent.has(n.id) ? nodes.get(parent.get(n.id)) : null
        while (up && !up.callFrame.url && parent.has(up.id)) up = nodes.get(parent.get(up.id))
        const k = `${f.functionName || "(anon)"}:${f.lineNumber + 1}${f.url ? "" : ` [native] < ${up ? `${up.callFrame.functionName || "(anon)"}:${up.callFrame.lineNumber + 1}` : "?"}`}`
        self.set(k, (self.get(k) ?? 0) + (profile.timeDeltas[i] ?? 0) / 1000)
      }
      /* PROFILE=2: with what each function called (inclusive), to find what started the work. */
      if (process.env.PROFILE === "2") {
        const total = new Map()
        for (let i = 0; i < profile.samples.length; i++) {
          const ms = (profile.timeDeltas[i] ?? 0) / 1000
          const seen = new Set()
          for (let n = nodes.get(profile.samples[i]); n; n = parent.has(n.id) ? nodes.get(parent.get(n.id)) : null) {
            if (/^\((idle|program|root|garbage collector)\)$/.test(n.callFrame.functionName)) break
            const k = `${n.callFrame.functionName || "(anon)"}:${n.callFrame.lineNumber + 1}`
            if (seen.has(k)) continue
            seen.add(k)
            total.set(k, (total.get(k) ?? 0) + ms)
          }
        }
        console.log("  busiest (inclusive ms):")
        for (const [k, v] of [...total.entries()].sort((a, b) => b[1] - a[1]).slice(0, 50)) console.log(`    ${v.toFixed(0).padStart(6)}  ${k}`)
      }
      const top = [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25)
      console.log("  busiest (self ms):")
      for (const [k, v] of top) console.log(`    ${v.toFixed(0).padStart(6)}  ${k}`)
    }
    await sleep(800)
    const arrived = play.last ? await ed.js((t) => !!document.getElementById("wb-preview-root")?.textContent?.includes(t), play.last) : true
    report[name] = { ...m, arrived, errors: ed.errors }
    expect(m.droppedPct < 10, "dropped frames under 10% while it changes and scrolls", m.droppedPct)
    expect(m.longest < 120, "longest frame under 120ms", m.longest)
    expect(m.longestTask < 150, "no long task over 150ms in the editor", { longest: m.longestTask, count: m.longs, total: m.taskMs })
    expect(m.jumps === 0, "the canvas is never thrown back against the wheel", m.jumps)
    if (!imported && name !== "github" && name !== "idle") expect(m.removed === 0, "an edit to one section never rebuilds the page's sections", m.removed)
    expect(arrived, "the last change is on the canvas", play.last)
    expect(ed.errors.length === 0, "nothing thrown", ed.errors)
  } finally {
    await ed.close()
  }
}

for (const name of ["idle", "ask", "agent", "github", "imported-idle", "imported-ask", "imported-github"]) {
  if (ONLY && !ONLY.test(name)) continue
  try {
    await scenario(name)
  } catch (e) {
    console.log(`  FAIL  ${name} did not run: ${String(e).slice(0, 300)}`)
    broken++
  }
}
if (process.env.JSON) writeFileSync(process.env.JSON, JSON.stringify(report, null, 2))
console.log(broken ? `\n${broken} over budget` : "\nall within budget")
process.exit(broken && BUDGET ? 1 : 0)
