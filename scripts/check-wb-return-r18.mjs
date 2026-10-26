/**
 * ===========================================================================
 *  COMING BACK TO THE EDITOR'S TAB AFTER MINUTES AWAY (round 18)
 * ===========================================================================
 * The owner: "I leave my website builder editor in the tab, and after 5
 * minutes I come back to the tab, it shows a black screen and then it lags a
 * lot until it loads."
 *
 * The real editor (scripts/editor-probe-harness.mjs) on a Storelib theme and
 * on the imported Materia store, in Chromium. Another tab is brought to the
 * front for AWAY_S seconds (default 330: past the five minutes after which
 * Chrome throttles a hidden tab's timers hard), then the editor's tab comes
 * back, and for the first five seconds:
 *
 *   FIRST FRAME   from the tab shown to its first animation frame
 *   LONG TASKS    how many, the longest, all of them (the editor's and the
 *                 canvas's: one thread)
 *   FRAMES        dropped in those five seconds
 *   REQUESTS      what the editor asked the network for on the way back
 *   BUSIEST       (PROFILE=1) the functions that took the time
 *
 *   npx tsx scripts/check-wb-return-r18.mjs
 *   ONLY=native|imported   AWAY_S=330   CPU=4   EDITOR_BUNDLE=<file>   PROFILE=1   BUDGET=0
 */
process.env.PROBE_CSS = process.env.PROBE_CSS ?? "source"
const { bundle, css } = await import("./editor-probe-harness.mjs")
const { importedTheme, openEditor, sleep, STORELIB_GLOBALS } = await import("./canvas-probe-kit.mjs")

const ONLY = process.env.ONLY ? new RegExp(process.env.ONLY, "i") : null
const AWAY_S = Number(process.env.AWAY_S ?? 330)
const CPU = Number(process.env.CPU ?? 1)
const BUDGET = process.env.BUDGET !== "0"
let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : BUDGET ? "FAIL" : "note"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got).slice(0, 400)})`}`)
  if (!ok && BUDGET) broken++
}

const WATCH = String.raw`
(function () {
  var W = window.__rt = { on: false, t: [], longs: [], at: [], t0: 0, shownAt: 0, firstFrame: 0 }
  try { new PerformanceObserver(function (l) { if (!W.on) return; l.getEntries().forEach(function (e) { W.longs.push(Math.round(e.duration)); W.at.push(Math.round(e.startTime - W.shownAt)) }) }).observe({ type: "longtask" }) } catch (e) {}
  var tick = function (t) { if (W.on) { if (!W.firstFrame) W.firstFrame = t; W.t.push(t) } requestAnimationFrame(tick) }
  requestAnimationFrame(tick)
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible" && W.armed) { W.shownAt = performance.now(); W.on = true; W.t = []; W.longs = []; W.at = []; W.firstFrame = 0 }
  })
  window.__rtStop = function () {
    W.on = false
    var d = [], F = 1000 / 60, dropped = 0
    for (var i = 1; i < W.t.length; i++) { var x = W.t[i] - W.t[i - 1]; d.push(x); dropped += Math.max(0, Math.round(x / F) - 1) }
    return { firstFrameMs: W.firstFrame ? Math.round(W.firstFrame - W.shownAt) : null, frames: d.length, droppedPct: d.length ? Math.round(dropped / (d.length + dropped) * 1000) / 10 : 0, longest: Math.round(Math.max.apply(null, [0].concat(d))),
      longs: W.longs.length, longestTask: Math.max.apply(null, [0].concat(W.longs)), taskMs: W.longs.reduce(function (a, b) { return a + b }, 0), longAt: W.at, longMs: W.longs }
  }
})()
`

async function run(kind) {
  const imported = kind === "imported"
  const ed = await openEditor({ kind: imported ? "imported" : "native", bundle, css, compat: imported ? await importedTheme({ store: true }) : undefined, globals: imported ? "" : STORELIB_GLOBALS, init: WATCH, cpu: CPU, settle: 6000 })
  try {
    console.log(`\n${kind} (away ${AWAY_S}s, CPU ${CPU}x)`)
    const requests = []
    let recording = false
    ed.page.on("request", (r) => { if (recording) requests.push(`${r.method()} ${r.url().replace(/^https?:\/\/[^/]+/, "")}`.slice(0, 120)) })
    await ed.js(() => { window.__rt.armed = true })
    const other = await ed.browser.newPage()
    await other.goto("about:blank")
    await other.bringToFront()
    const hidden = await ed.js(() => document.visibilityState)
    expect(hidden === "hidden", "the editor's tab is hidden while another is in front", hidden)
    await sleep(AWAY_S * 1000)
    const cdp = process.env.PROFILE ? await ed.page.createCDPSession() : null
    if (cdp) { await cdp.send("Profiler.enable"); await cdp.send("Profiler.setSamplingInterval", { interval: 250 }); await cdp.send("Profiler.start") }
    recording = true
    await ed.page.bringToFront()
    await sleep(5000)
    recording = false
    const m = await ed.js(() => window.__rtStop())
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
        let up = !f.url && parent.has(n.id) ? nodes.get(parent.get(n.id)) : null
        while (up && !up.callFrame.url && parent.has(up.id)) up = nodes.get(parent.get(up.id))
        const k = `${f.functionName || "(anon)"}:${f.lineNumber + 1}${f.url ? "" : ` [native] < ${up ? `${up.callFrame.functionName || "(anon)"}:${up.callFrame.lineNumber + 1}` : "?"}`}`
        self.set(k, (self.get(k) ?? 0) + (profile.timeDeltas[i] ?? 0) / 1000)
      }
      console.log("  busiest (self ms):")
      for (const [k, v] of [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20)) console.log(`    ${v.toFixed(0).padStart(6)}  ${k}`)
    }
    console.log(`  requests on the way back: ${requests.length ? requests.join(", ") : "none"}`)
    console.log(`  long tasks (ms after shown: duration): ${m.longAt.map((a, i) => `${a}:${m.longMs[i]}`).join("  ") || "none"}`)
    expect(m.firstFrameMs !== null && m.firstFrameMs < 200, "the first frame comes within 200ms of the tab being shown", m.firstFrameMs)
    expect(m.longestTask < 150, "no long task over 150ms in the first five seconds", { longest: m.longestTask, count: m.longs, total: m.taskMs })
    expect(m.droppedPct < 10, "under 10% of frames dropped in the first five seconds", { droppedPct: m.droppedPct, longestFrame: m.longest })
    expect(ed.errors.length === 0, "nothing thrown", ed.errors)
    await other.close()
  } finally {
    await ed.close()
  }
}

for (const kind of ["native", "imported"]) {
  if (ONLY && !ONLY.test(kind)) continue
  try {
    await run(kind)
  } catch (e) {
    console.log(`  FAIL  ${kind} did not run: ${String(e).slice(0, 300)}`)
    broken++
  }
}
console.log(broken ? `\n${broken} over budget` : "\nall within budget")
process.exit(broken && BUDGET ? 1 : 0)
