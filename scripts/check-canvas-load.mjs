/**
 * ===========================================================================
 *  WHAT OPENING THE EDITOR COSTS, UNTIL IT IS STILL
 * ===========================================================================
 * The owner, round 1023: "Editor load and smoothness: profile first load of
 * the editor and the canvas (bundle, waterfalls, unnecessary re-renders,
 * repeated fetches)".
 *
 * The real editor (scripts/canvas-probe-kit.mjs) on an imported theme and on
 * a Storelib theme, a devtools hook in the page before the bundle runs
 * (React reports every commit to it, as to React DevTools), from the page's
 * first byte for IDLE_MS:
 *
 *   PAINTED     the canvas's first page on screen (an imported theme: its
 *               placeholder gone; Storelib: the sections in, the loader gone)
 *   COMMITS     React commits, in all and after the canvas painted, and the
 *               components that ran most after it (an editor at rest should
 *               not be rendering)
 *   LONG TASKS  how many, the longest, the blocking time (the part of each
 *               past 50ms)
 *   API         calls, and any asked twice
 *   FRAMES      documents an imported theme's canvas loaded (each is the
 *               page drawn and all of the theme's files asked for again)
 *
 * Round 1023, the bundle before and after, two runs each at 1x on a shared
 * machine (painted ms, blocking ms):
 *
 *                      before                    after
 *   imported theme     1438 / 1438, 426 / 369    1364 / 1360, 324 / 309
 *   Storelib theme     1305 / 1392, 380 / 494    1279 / 1323, 354 / 385
 *
 * The cause, from PROFILE=1: every built-in section schema was parsed and
 * validated as the editor opened (schemaFromStorelib, 88ms at 1x), and again
 * listed for the library before it was known whether the theme was imported
 * (47ms). Now each is read when first asked for (storelib-schemas.ts). What
 * renders after the paint is the section library drawing its previews in
 * idle time, one card a commit (PreviewBox, LibraryCard), on purpose; no API
 * call is made twice; an imported theme's canvas loads one document.
 *
 *   npx tsx scripts/check-canvas-load.mjs
 *   THEME=storelib|imported   CPU=4   IDLE_MS=12000   EDITOR_BUNDLE=<file>
 */
import { importedTheme, openEditor, sleep } from "./canvas-probe-kit.mjs"

const IDLE_MS = Number(process.env.IDLE_MS ?? 12000)
const CPU = Number(process.env.CPU ?? 1)

const INIT = String.raw`
(function () {
  var P = window.__load = { commits: [], renders: {}, after: null, longs: [], painted: null, frames: 0 }
  var COMP = { 0: 1, 1: 1, 11: 1, 15: 1 }
  function nameOf(f) { var t = f.type; if (!t) return "?"; if (f.tag === 11) return t.displayName || (t.render && (t.render.displayName || t.render.name)) || "ForwardRef"; return t.displayName || t.name || "Anonymous" }
  function walk(top) {
    var stack = [top, top.alternate]
    while (stack.length) {
      var p = stack.pop(), n = stack.pop()
      if (COMP[n.tag] && (!p || (n.flags & 1) === 1)) { var nm = nameOf(n); P.renders[nm] = (P.renders[nm] || 0) + 1; if (P.cur) P.cur[nm] = (P.cur[nm] || 0) + 1 }
      if (p && n.child === p.child) continue
      for (var c = n.child; c; c = c.sibling) stack.push(c, c.alternate)
    }
  }
  window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
    supportsFiber: true, isDisabled: false, renderers: new Map(),
    inject: function (r) { this.renderers.set(1, r); return 1 },
    onCommitFiberRoot: function (id, root) { P.commits.push(performance.now()); if (P.painted !== null) { P.cur = {}; try { walk(root.current) } catch (e) {} if (P.cur.SectionRendererInner || P.cur.StoreEditorPage) (P.log = P.log || []).push(Math.round(performance.now()) + " " + Object.keys(P.cur).filter(function (k) { return /^(StoreEditorPage|EditorCanvasPage|ThemePage|SectionRendererInner|StorelibLiveProvider|CompatCanvas)/.test(k) }).map(function (k) { return k + ":" + P.cur[k] }).join(" ")) } },
    onCommitFiberUnmount: function () {}, onPostCommitFiberRoot: function () {}, checkDCE: function () {},
    on: function () {}, off: function () {}, emit: function () {}, sub: function () { return function () {} },
  }
  try { new PerformanceObserver(function (l) { l.getEntries().forEach(function (e) { P.longs.push([e.startTime, e.duration]) }) }).observe({ type: "longtask", buffered: true }) } catch (e) {}
  document.addEventListener("load", function (e) { if (e.target && e.target.tagName === "IFRAME" && e.target.hasAttribute("data-compat-frame")) P.frames++ }, true)
  function look() {
    var ph = document.querySelector("[data-canvas-placeholder]")
    var sc = document.getElementById("wb-preview-root")
    var storelib = sc && sc.querySelectorAll("[data-section-box]").length >= 7 && !document.querySelector(".wb-canvas-loader:not([data-leaving=true])")
    if ((ph && ph.getAttribute("data-canvas-placeholder") === "gone") || storelib) { P.painted = performance.now(); return }
    requestAnimationFrame(look)
  }
  requestAnimationFrame(look)
})()
`

/* PROFILE=1: where the main thread went from the first byte until PROFILE_UNTIL ms, self and total by function. */
function printProfile(profile, untilMs) {
  const byId = new Map(profile.nodes.map((n) => [n.id, n]))
  const parent = new Map()
  for (const n of profile.nodes) for (const c of n.children ?? []) parent.set(c, n.id)
  const self = new Map(), total = new Map()
  const name = (n) => `${n.callFrame.functionName || "(anon)"}:${n.callFrame.lineNumber}`
  let t = profile.startTime
  profile.samples.forEach((id, k) => {
    t += profile.timeDeltas[k] ?? 0
    if ((t - profile.startTime) / 1000 > untilMs) return
    const us = profile.timeDeltas[k] ?? 0
    const n = byId.get(id)
    if (/^\((idle|program|garbage collector)\)/.test(n.callFrame.functionName)) return
    self.set(name(n), (self.get(name(n)) ?? 0) + us)
    const seen = new Set()
    for (let cur = id; cur !== undefined; cur = parent.get(cur)) { const nm = name(byId.get(cur)); if (seen.has(nm)) continue; seen.add(nm); total.set(nm, (total.get(nm) ?? 0) + us) }
  })
  const top = (m, n) => [...m].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => `      ${(v / 1000).toFixed(1).padStart(7)}ms  ${k}`).join("\n")
  console.log("    SELF\n" + top(self, 25) + "\n    TOTAL\n" + top(total, 50))
  /* PROFILE_FN=<name>: who called it, by the time spent under each caller chain. */
  if (process.env.PROFILE_FN) {
    const chains = new Map()
    let t2 = profile.startTime
    profile.samples.forEach((id, k) => {
      t2 += profile.timeDeltas[k] ?? 0
      const path = []
      for (let cur = id; cur !== undefined; cur = parent.get(cur)) path.push(name(byId.get(cur)))
      const at = path.findIndex((x) => x.startsWith(process.env.PROFILE_FN + ":"))
      if (at < 0) return
      const key = path.slice(at, at + Number(process.env.PROFILE_DEPTH ?? 9)).join(" < ")
      chains.set(key, (chains.get(key) ?? 0) + (profile.timeDeltas[k] ?? 0))
    })
    console.log("    CALLERS\n" + top(chains, 8))
  }
}

async function run({ kind, bundle, css, compat }) {
  let cdp = null
  const beforeOpen = process.env.PROFILE ? async (page) => { cdp = await page.createCDPSession(); await cdp.send("Profiler.enable"); await cdp.send("Profiler.setSamplingInterval", { interval: 250 }); await cdp.send("Profiler.start") } : null
  const { page, js, close, errors } = await openEditor({ kind, bundle, css, compat, init: INIT, cpu: CPU, beforeOpen })
  if (cdp) printProfile((await cdp.send("Profiler.stop")).profile, Number(process.env.PROFILE_UNTIL ?? 4000))
  try {
    const elapsed = await js(() => performance.now())
    if (elapsed < IDLE_MS) await sleep(IDLE_MS - elapsed)
    const r = await js(() => {
      const P = window.__load
      const calls = window.probeCalls || []
      const seen = {}
      for (const c of calls) seen[c] = (seen[c] || 0) + 1
      const after = P.commits.filter((t) => t > P.painted)
      const top = Object.entries(P.renders).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k, v]) => `${k}:${v}`)
      return {
        painted: Math.round(P.painted ?? -1),
        commits: P.commits.length,
        commitsAfterPaint: after.length,
        lastCommit: Math.round(P.commits[P.commits.length - 1] ?? 0),
        rendersAfterPaint: Object.values(P.renders).reduce((a, b) => a + b, 0),
        top,
        longTasks: P.longs.length,
        longest: P.longs.length ? Math.round(Math.max(...P.longs.map((l) => l[1]))) : 0,
        tbt: Math.round(P.longs.reduce((a, l) => a + Math.max(0, l[1] - 50), 0)),
        api: calls.length,
        repeated: Object.entries(seen).filter(([, n]) => n > 1).map(([k, n]) => `${n}x ${k.slice(0, 80)}`),
        frames: P.frames,
        log: P.log || [],
        heapMB: performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) : null,
      }
    })
    console.log(`\n${kind === "imported" ? "IMPORTED THEME (Materia fixture)" : "STORELIB THEME"}   CPU ${CPU}x   first ${IDLE_MS / 1000}s`)
    console.log(`  painted ${r.painted}ms   commits ${r.commits} (after paint ${r.commitsAfterPaint}, last at ${r.lastCommit}ms)   renders after paint ${r.rendersAfterPaint}`)
    console.log(`  long tasks ${r.longTasks} (longest ${r.longest}ms), blocking ${r.tbt}ms   API ${r.api}, repeated: ${r.repeated.length ? r.repeated.join("; ") : "none"}${kind === "imported" ? `   canvas documents ${r.frames}` : ""}   heap ${r.heapMB}MB`)
    console.log(`  ran most after paint: ${r.top.join("  ")}`)
    if (process.env.LOG) console.log("  " + r.log.join("\n  "))
    if (errors.length) console.log(`  page errors ${JSON.stringify(errors.slice(0, 3))}`)
    return r
  } finally {
    await close()
  }
}

async function main() {
  const { bundle, css } = await import("./editor-probe-harness.mjs")
  const kinds = process.env.THEME ? [process.env.THEME] : ["imported", "storelib"]
  const compat = kinds.includes("imported") ? await importedTheme() : null
  for (const kind of kinds) await run({ kind, bundle, css, compat })
}
main().catch((e) => { console.error(e); process.exit(1) })
