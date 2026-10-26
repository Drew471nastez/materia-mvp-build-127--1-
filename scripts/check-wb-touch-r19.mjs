/**
 * ===========================================================================
 *  THE EDITOR ON A PHONE: A FINGER SCROLLS THE CANVAS, AND NOTHING RUNS AT REST
 *  (round 19)
 * ===========================================================================
 * The owner: "make sure iOS and Android are smooth and clean, and scrolling
 * up and down doesn't block with the touchscreen swipe", "optimized for low
 * end devices". The other probes measure at one device pixel to a CSS pixel
 * and scroll with a mouse wheel; a phone has three, and a finger. Measured
 * that way, a closed sheet's height went 453, 454, 453 every frame, forever
 * (mobile-editor-sheet.tsx, A PIXEL EITHER WAY IS THE SAME HEIGHT).
 *
 * The real editor (scripts/editor-probe-harness.mjs) at 390x844, three device
 * pixels to a CSS pixel, touch, on a Storelib theme and on the imported
 * Materia store:
 *
 *   AT REST   two seconds with nothing touched: the main thread's busy time
 *             and how many frames were drawn (an idle editor draws none)
 *   SWIPES    Chrome's own touch scroll gestures (Input.synthesizeScrollGesture,
 *             a finger as the browser sees one) down and up the canvas: the
 *             canvas follows them, frames dropped while it does, long tasks
 *   BLOCKING  touch and wheel listeners on the way from the canvas to the
 *             window that are not passive (each one makes the browser wait
 *             for script before it may scroll)
 *
 * DESKTOP=1: a computer instead, 1440x900 at one device pixel, a wheel notch
 * every 33ms with the pointer still over the canvas. (Taking the pointer off
 * the canvas's content while it scrolls, to spare the hover a scroll brings,
 * was tried in round 19 and measured worse: Chrome keeps where things can be
 * pointed at with the paint, so each switch painted the whole canvas again.)
 *
 *   npx tsx scripts/check-wb-touch-r19.mjs
 *   ONLY=native|imported   CPU=4   DSF=3   DESKTOP=1   EDITOR_BUNDLE=<file>   BUDGET=0
 */
process.env.PROBE_CSS = process.env.PROBE_CSS ?? "source"
const DESKTOP = !!process.env.DESKTOP
process.env.DSF = process.env.DSF ?? (DESKTOP ? "1" : "3")
const { bundle, css } = await import("./editor-probe-harness.mjs")
const { importedTheme, openEditor, sleep, STORELIB_GLOBALS } = await import("./canvas-probe-kit.mjs")

const ONLY = process.env.ONLY ? new RegExp(process.env.ONLY, "i") : null
const CPU = Number(process.env.CPU ?? 4)
const BUDGET = process.env.BUDGET !== "0"
let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : BUDGET ? "FAIL" : "note"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got).slice(0, 300)})`}`)
  if (!ok && BUDGET) broken++
}

const WATCH = String.raw`
(function () {
  var W = window.__tw = { on: false, t: [], longs: [] }
  try { new PerformanceObserver(function (l) { if (!W.on) return; l.getEntries().forEach(function (e) { W.longs.push(Math.round(e.duration)) }) }).observe({ type: "longtask" }) } catch (e) {}
  var tick = function (t) { if (W.on) W.t.push(t); requestAnimationFrame(tick) }
  requestAnimationFrame(tick)
  window.__twStart = function () { W.t = []; W.longs = []; W.on = true }
  window.__twStop = function () {
    W.on = false
    var d = [], F = 1000 / 60, dropped = 0
    for (var i = 1; i < W.t.length; i++) { var x = W.t[i] - W.t[i - 1]; d.push(x); dropped += Math.max(0, Math.round(x / F) - 1) }
    return { frames: d.length, droppedPct: d.length ? Math.round(dropped / (d.length + dropped) * 1000) / 10 : 0, longest: Math.round(Math.max.apply(null, [0].concat(d))), longs: W.longs.length, longestTask: Math.max.apply(null, [0].concat(W.longs)) }
  }
})()
`

/* The main thread's busy time and the frames it drew over `ms`, from a trace. */
async function busyFor(page, ms, during) {
  await page.tracing.start({ categories: ["devtools.timeline", "disabled-by-default-devtools.timeline"] })
  const done = during ? during() : sleep(ms)
  await done
  const events = JSON.parse(Buffer.from(await page.tracing.stop()).toString("utf8")).traceEvents
  const mains = events.filter((e) => e.name === "thread_name" && e.args?.name === "CrRendererMain")
  const top = (e) => e.ph === "X" && /^(RunTask|ThreadControllerImpl::RunTask)$/.test(e.name)
  const busy = (m) => events.reduce((a, e) => a + (top(e) && e.pid === m.pid && e.tid === m.tid ? e.dur ?? 0 : 0), 0)
  const main = mains.sort((a, b) => busy(b) - busy(a))[0]
  const on = (e) => main && e.pid === main.pid && e.tid === main.tid
  return { busyMs: main ? Math.round(busy(main) / 1000) : 0, frames: events.filter((e) => e.name === "BeginMainFrame" || (e.name === "WebFrameWidgetImpl::BeginMainFrame" && on(e))).filter(on).length, styles: events.filter((e) => e.name === "UpdateLayoutTree" && on(e)).length }
}

async function run(kind) {
  const imported = kind === "imported"
  const ed = await openEditor({ kind: imported ? "imported" : "native", bundle, css, compat: imported ? await importedTheme({ store: true }) : undefined, globals: imported ? "" : STORELIB_GLOBALS, init: WATCH, cpu: CPU, width: DESKTOP ? 1440 : 390, height: DESKTOP ? 900 : 844, touch: !DESKTOP, settle: 6000 })
  const page = ed.page
  try {
    console.log(`\n${kind}, ${DESKTOP ? "computer 1440x900" : "phone 390x844"} at ${process.env.DSF}x (CPU ${CPU}x)`)
    await sleep(1500)
    /* AT REST */
    const rest = await busyFor(page, 2000)
    expect(rest.busyMs < 2000 * 0.1, "at rest, the main thread is busy under 10% of the time", rest)

    /* BLOCKING: listeners from the canvas up to the window that are not passive. */
    const cdp = await page.createCDPSession()
    await cdp.send("DOM.enable")
    await cdp.send("DOMDebugger.enable").catch(() => {})
    const { root } = await cdp.send("DOM.getDocument", { depth: 0 })
    const blocking = []
    const look = async (objectId, where) => {
      const { listeners } = await cdp.send("DOMDebugger.getEventListeners", { objectId, depth: 0 })
      for (const l of listeners) if (/^(touchstart|touchmove|wheel|mousewheel)$/.test(l.type) && !l.passive) blocking.push(`${l.type} on ${where} (${(l.handler?.description ?? "").slice(0, 60).replace(/\s+/g, " ")})`)
    }
    /* Each element from the canvas up, the document and the window, as objects of this session. */
    for (let i = 0; ; i++) {
      const { result } = await cdp.send("Runtime.evaluate", { expression: `(() => { const out = []; for (let n = document.getElementById("wb-preview-root"); n; n = n.parentElement) out.push(n); out.push(document, window); return out[${i}] ?? null })()` })
      if (!result.objectId) break
      await look(result.objectId, result.description?.slice(0, 50) ?? "?")
    }
    void root
    expect(blocking.length === 0, "nothing on the way from the canvas to the window makes a finger wait for script (no non passive touch or wheel listener)", blocking)

    /* SWIPES: Chrome's own touch scroll, down then up. */
    const box = await page.evaluate(() => { const r = (document.querySelector("[data-compat-frame='front']") ?? document.getElementById("wb-preview-root")).getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) } })
    const scrollY = () => imported
      ? ed.front().then((f) => (f ? f.evaluate(() => scrollY) : 0)).catch(() => 0)
      : page.evaluate(() => document.getElementById("wb-preview-root")?.scrollTop ?? 0)
    const y0 = await scrollY()
    await page.evaluate(() => window.__twStart())
    /* A finger: down on the canvas, moved a step a frame, lifted (Chrome's synthesized scroll gesture does not scroll in headless). */
    const swipe = DESKTOP ? async (dy) => {
      await page.mouse.move(box.x, box.y)
      for (let i = 0; i < 12; i++) { await page.mouse.wheel({ deltaY: -dy / 12 }); await sleep(33) }
      await sleep(200)
    } : async (dy) => {
      const from = box.y + (dy < 0 ? 180 : -180)
      await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: box.x, y: from }] })
      const steps = 22
      for (let i = 1; i <= steps; i++) {
        await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: box.x, y: from + (dy * i) / steps }] })
        await sleep(16)
      }
      await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] })
      await sleep(250)
    }
    const moving = await busyFor(page, 0, async () => {
      for (let i = 0; i < 3; i++) await swipe(-340)
    })
    const yDown = await scrollY()
    for (let i = 0; i < 3; i++) await swipe(340)
    const yUp = await scrollY()
    const m = await page.evaluate(() => window.__twStop())
    expect(yDown - y0 > 500, "the canvas follows a finger down", { from: y0, to: yDown })
    expect(yDown - yUp > 500, "and back up", { from: yDown, to: yUp })
    expect(m.droppedPct < 15, "under 15% of frames dropped while swiped", m)
    expect(m.longestTask < 100, "no long task over 100ms while swiped", m.longestTask)
    console.log(`        main thread while swiped: ${moving.busyMs}ms busy, ${moving.styles} style recalcs`)
    expect(ed.errors.length === 0, "nothing thrown", ed.errors)
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
