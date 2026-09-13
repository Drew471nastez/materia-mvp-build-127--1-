/**
 * ===========================================================================
 *  THE CHART SCRUB, DRIVEN BY A SCRIPT THAT HAS A FINGER
 * ===========================================================================
 * Every previous answer about this gesture came from reading the source, and
 * reading the source was wrong twice: the hold a resting thumb cancelled, and
 * the thirty pixel gap between the axis and the touch maths. Both were only
 * visible under a real thumb.
 *
 * So this mounts the component the analytics page actually renders and
 * performs the gestures that matter, with real touch events:
 *
 *   PRESS AND DRAG IN ONE MOTION — no pause. The case reported as "hold left
 *     swipe in one shot"; it has to engage and then follow.
 *   PRESS, HOLD, THEN DRAG — the deliberate version.
 *   PRESS AND PULL DOWN — must NOT engage, or the page cannot be scrolled
 *     with a thumb that happens to be over the chart.
 *
 * For the two that engage it also checks the scrub actually tracked: that the
 * reading changed with the finger, landed on the right day, and ticked once
 * per day crossed rather than once per frame.
 *
 *   pnpm build && node scripts/check-chart-scrub.mjs
 */
import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const root = process.cwd()
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)
const cssDir = join(root, ".next/static/chunks")
if (!existsSync(cssDir)) fail("No production build found. Run `pnpm build` first.")
const css = readdirSync(cssDir).filter((f) => f.endsWith(".css")).map((f) => readFileSync(join(cssDir, f), "utf8")).join("\n")

const stubs = join(root, ".wb-probe")
mkdirSync(stubs, { recursive: true })
/**
 * The haptics are half the answer to "does it tick every time it crosses a
 * day", so they are recorded rather than swallowed.
 */
writeFileSync(join(stubs, "native-bridge-haptics.js"), `export function hapticTap(strength) { (globalThis.__haptics = globalThis.__haptics || []).push(strength || "light") }
export function isNativeApp() { return false }
export async function triggerHaptic() {}
export function openExternal() {}
export function nativePlatform() { return "web" }
`)

const out = mkdtempSync(join(tmpdir(), "storelib-scrub-"))
const bundle = join(out, "probe.js")
execFileSync("npx", ["--no-install", "esbuild", join(root, "scripts/render-chart-scrub.tsx"),
  "--bundle", "--format=iife", "--platform=browser", "--jsx=automatic", "--log-level=error", `--outfile=${bundle}`,
  '--banner:js=var process=globalThis.process||{env:{NODE_ENV:"production"},browser:true,versions:{},platform:"browser",cwd:function(){return "/"},nextTick:function(f){setTimeout(f,0)}};globalThis.process=process;',
  '--define:process.env.NODE_ENV="production"',
  `--alias:@/lib/native-bridge=${join(stubs, "native-bridge-haptics.js")}`,
  `--alias:@=${root}`, "--loader:.css=empty", "--loader:.svg=dataurl", "--loader:.png=dataurl"],
  { stdio: ["ignore", "ignore", "inherit"] })

/** No regex literals: a backslash inside a template literal is eaten. */
const DRIVE = `
<script>
/*
 * FRAMES, BY HAND.
 *
 * Headless Chromium under --virtual-time-budget does not run
 * requestAnimationFrame, and the scrub does all of its work inside one. Left
 * alone the probe reports a chart frozen on the day the gesture started —
 * which is a true description of this browser and a false one of a phone.
 *
 * So rAF is replaced with a queue flushed on a short timer, before the
 * component loads. What this measures is therefore the LOGIC of the scrub:
 * which day each position resolves to, how often it ticks, where the tooltip
 * lands. It does not measure frame pacing, and nothing here claims to.
 */
(function () {
  var q = [], id = 0, fired = 0
  window.requestAnimationFrame = function (fn) { q.push([++id, fn]); return id }
  window.cancelAnimationFrame = function (i) { for (var k = 0; k < q.length; k++) if (q[k][0] === i) { q.splice(k, 1); return } }
  setInterval(function () {
    var run = q; q = []
    for (var k = 0; k < run.length; k++) { fired++; try { run[k][1](performance.now()) } catch (e) {} }
    window.__frames = fired
  }, 8)
})()
</script>
<script src="probe.js"></script>
<script>
(function () {
  var trace = []
  var mark = function (m) { trace.push(m + "@" + Math.round(performance.now())) }
  var reported = false
  var report = function (o) { if (reported) return; reported = true; o.trace = trace; var pre = document.createElement("pre"); pre.id = "result"; pre.textContent = JSON.stringify(o); document.body.append(pre) }

  /* ---- a finger ------------------------------------------------------- */
  function point(target, x, y) { return new Touch({ identifier: 1, target: target, clientX: x, clientY: y, pageX: x, pageY: y, screenX: x, screenY: y, radiusX: 11, radiusY: 11, force: 1 }) }
  function fire(target, type, x, y) {
    var t = type === "touchend" ? [] : [point(target, x, y)]
    var ev = new TouchEvent(type, { touches: t, targetTouches: t, changedTouches: [point(target, x, y)], bubbles: true, cancelable: true, view: window })
    target.dispatchEvent(ev)
    return ev
  }

  /* ---- what the chart is saying --------------------------------------- */
  function chart() { return document.querySelector("#app div[style*='user-select']") }
  function tooltip() {
    var host = chart(); if (!host) return null
    var kids = host.children
    for (var i = 0; i < kids.length; i++) {
      var s = kids[i].getAttribute && kids[i].getAttribute("style")
      if (s && s.indexOf("position: absolute") >= 0 && s.indexOf("z-index: 10") >= 0) return kids[i]
    }
    return null
  }
  /** The day the tooltip is showing, as a zero based index. */
  function reading() {
    var t = tooltip(); if (!t) return null
    var m = t.textContent.match(/Sep (\\d+)/)
    return m ? Number(m[1]) - 1 : null
  }
  function touchAction() { var h = chart(); return h ? getComputedStyle(h).touchAction : null }
  function scrollY() { return Math.round(window.scrollY || document.documentElement.scrollTop || 0) }
  function tipBox() { var t = tooltip(); if (!t) return null; var r = t.getBoundingClientRect(); return { left: Math.round(r.left), right: Math.round(r.right), w: Math.round(r.width) } }

  /* ---- geometry the touch maths uses ---------------------------------- */
  var POINTS = 14, PLOT_RIGHT = 10
  /**
   * THE PLOT AREA AS DRAWN, not as guessed.
   *
   * The first version of this read the y axis group's ink box, which is the
   * width of the digits and not the width the axis reserved — 14px against a
   * real 22px, so every x this probe pressed was eight pixels out and it
   * blamed the chart. The grid lines ARE the plot area: recharts draws them
   * from the left inset to the right margin.
   */
  function plotFromGrid() {
    var line = document.querySelector("#app .recharts-cartesian-grid-horizontal line")
    var svg = document.querySelector("#app svg.recharts-surface")
    if (!line || !svg) return null
    var sr = svg.getBoundingClientRect()
    return { left: Math.round(Number(line.getAttribute("x1"))), right: Math.round(Number(line.getAttribute("x2"))), svgLeft: sr.left }
  }
  /** A number is cut off if its ink starts left of the drawing. */
  function axisLabels() {
    var svg = document.querySelector("#app svg.recharts-surface")
    var sr = svg.getBoundingClientRect()
    var texts = document.querySelectorAll("#app .recharts-yAxis .recharts-cartesian-axis-tick text")
    var worst = 0, label = null, clipped = 0, over = 0
    for (var i = 0; i < texts.length; i++) {
      var r = texts[i].getBoundingClientRect()
      if (r.width > worst) { worst = r.width; label = texts[i].textContent }
      var out = sr.left - r.left
      if (out > 0.5) { clipped++; if (out > over) over = out }
    }
    return { widest: Math.round(worst), label: label, clipped: clipped, cutBy: Math.round(over), count: texts.length }
  }

  /* ---- the runs ------------------------------------------------------- */
  var host, rect, plotLeft, plotRightPx, span

  function xForIndex(i) { return rect.left + plotLeft + (i / (POINTS - 1)) * span }

  function run(name, steps, done) {
    globalThis.__haptics = []
    mark("run:" + name)
    /* Back to where the geometry was measured, and with room to scroll both
       ways, so one run cannot leave the next one at the top of the page. */
    window.scrollTo(0, 300)
    var startScroll = scrollY()
    rect = host.getBoundingClientRect()
    var el = host
    var log = []
    var first = steps[0]
    var startEv = fire(el, "touchstart", first.x, first.y)
    var i = 1
    function next() {
      if (i >= steps.length) {
        fire(el, "touchend", steps[steps.length - 1].x, steps[steps.length - 1].y)
        setTimeout(function () { done({ name: name, log: log, haptics: globalThis.__haptics.slice(), startScroll: startScroll, touchActionAtRest: touchAction(), afterEnd: { active: !!tooltip(), scrollY: scrollY() } }) }, 120)
        return
      }
      var s = steps[i++]
      if (s.wait) { setTimeout(next, s.wait); return }
      var ev = fire(el, "touchmove", s.x, s.y)
      /* A frame, so the rAF the handler queued gets to run. */
      var done2 = false
      var onFrame = function () { if (done2) return; done2 = true
        log.push({ x: Math.round(s.x - rect.left), want: s.want == null ? null : s.want, got: reading(), active: !!tooltip(), defaultPrevented: ev.defaultPrevented, tip: tipBox(), touchAction: touchAction(), scrollY: scrollY() })
        next()
      }
      /* A frame for the rAF the handler queued, and a timer in case frames
         are not running in here at all. */
      /* Two flushes of the shimmed queue, then measure. */
      setTimeout(onFrame, 30)
    }
    setTimeout(next, 0)
  }

  var tries = 0
  function waitForChart() {
    host = chart()
    if ((!host || !document.querySelector("#app .recharts-yAxis")) && tries++ < 600) { setTimeout(waitForChart, 10); return }
    if (!host) { report({ error: "the chart never mounted" }); return }
    mark("mounted")
    /* Measured where the runs will happen, since the page now scrolls. */
    window.scrollTo(0, 300)
    rect = host.getBoundingClientRect()
    var grid = plotFromGrid()
    if (!grid) { report({ error: "the grid never drew, so there is no plot area to press" }); return }
    plotLeft = grid.left
    span = rect.width - plotLeft - PLOT_RIGHT
    go()
  }

  function go() {
    var y = rect.top + 100
    var results = {}
    /*
     * ONE SHOT: press, and go straight into a leftward swipe. No pause, the
     * way a thumb that already knows where it is going moves. Starts at day
     * 10 and travels to day 3.
     */
    var oneShot = []
    oneShot.push({ x: xForIndex(10), y: y })
    for (var i = 10; i >= 3; i--) oneShot.push({ x: xForIndex(i), y: y + (i % 2), want: i })

    /*
     * HOLD THEN SLIDE, IN ONE MOTION AND WITHOUT LIFTING. The gesture the
     * chart is actually for, and the one that needed a lift and a second tap
     * before touch-action stopped being a ternary.
     *
     * A thumb settling drifts, and a thumb sweeping sideways arcs, so both
     * are in here: three pixels of drift under the hold and up to five of
     * vertical wander across the slide. A hold that only survives a finger
     * held perfectly still is not a hold.
     */
    var holdDrag = [{ x: xForIndex(4), y: y }, { x: xForIndex(4) + 1, y: y + 2 }, { wait: 200 }, { x: xForIndex(4) + 2, y: y + 3, want: 4 }]
    for (var j = 4; j <= 11; j++) holdDrag.push({ x: xForIndex(j), y: y + ((j % 3) * 2) - 2, want: j })

    /* STRAIGHT DOWN: a scroll that happens to start on the chart. */
    var pull = [{ x: xForIndex(7), y: y }]
    for (var k = 1; k <= 6; k++) pull.push({ x: xForIndex(7), y: y + k * 9, want: null })

    run("oneShot", oneShot, function (a) {
      results.oneShot = a
      run("holdThenDrag", holdDrag, function (b) {
        results.holdThenDrag = b
        run("pullDown", pull, function (c) {
          results.pullDown = c
          results.frames = window.__frames || 0
          results.geometry = {
            card: Math.round(rect.width),
            axisWidth: plotLeft,
            widestLabel: axisLabels(),
            span: Math.round(span),
            gapPerPoint: Math.round(span / (POINTS - 1)),
          }
          report(results)
        })
      })
    })
  }
  setTimeout(function () { report({ error: "the run never finished", stalled: true }) }, 14000)
  mark("start")
  waitForChart()
})()
</script>`

const pageFor = (metric) => `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style><style>
  body{margin:0;background:#f8f9fa;font-family:Inter,system-ui,sans-serif}
  #app{padding:16px}
  /* Headless Chromium never advances a transition under virtual time. */
  *,*::before,*::after{transition-duration:0s!important;animation-duration:0s!important}
</style></head><body><div id="app"></div><script>window.__metric=${JSON.stringify(metric)}</script>${DRIVE}</body></html>`

const decode = (s) => s.replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&")
function measure(metric) {
  const file = join(out, `${metric}.html`)
  writeFileSync(file, pageFor(metric))
  const dom = execFileSync(CHROMIUM, ["--headless=new", "--no-sandbox", "--disable-gpu", "--hide-scrollbars",
    "--window-size=420,760", "--virtual-time-budget=20000", "--run-all-compositor-stages-before-draw",
    "--dump-dom", `file://${file}`], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 64 * 1024 * 1024 })
  const m = dom.match(/<pre id="result">([\s\S]*?)<\/pre>/)
  if (!m) fail(`On ${metric}: the chart never reported. Nothing was measured.`)
  const r = JSON.parse(decode(m[1]))
  if (r.error) fail(`On ${metric}: ${r.error}\n  trace: ${(r.trace || []).join(" ")}`)
  return r
}

/**
 * Two series, because the axis width is part of the touch maths: "15" and
 * "$1.8k" do not reserve the same room, and the finger has to land on the
 * same day in both.
 */
const problems = []
for (const metric of ["views", "revenue"]) {
const r = measure(metric)
console.log(`\n=== ${metric} ===`)

const g = r.geometry
console.log(`\nThe chart, as drawn: ${g.card}px wide, ${g.axisWidth}px of axis, ${g.span}px of plot, ${g.gapPerPoint}px between days.`)
console.log(`Widest y axis number: "${g.widestLabel.label}" at ${g.widestLabel.widest}px, in an axis ${g.axisWidth}px wide.`)
console.log(`Frames driven during the run: ${r.frames} (rAF is shimmed; this measures the scrub's logic, not its pacing).`)

if (r.frames < 20) problems.push(`[${metric}] Only ${r.frames} frames ran, so nothing below measured the scrub. The probe is broken, not the chart.`)
if (g.widestLabel.clipped) {
  problems.push(`[${metric}] ${g.widestLabel.clipped} of ${g.widestLabel.count} y axis numbers are cut off by up to ${g.widestLabel.cutBy}px: the axis reserved ${g.axisWidth}px and the widest number ("${g.widestLabel.label}") needs ${g.widestLabel.widest}px.`)
}

const show = (a) => {
  console.log(`\n${a.name}:`)
  a.log.forEach((s) => console.log(`  x=${String(s.x).padStart(4)}  want ${s.want === null ? "nothing" : "day " + s.want}  got ${s.got === null ? "nothing" : "day " + s.got}  ${s.active ? "showing" : "idle"}${s.defaultPrevented ? " (scroll held)" : ""}`))
  console.log(`  haptics: ${a.haptics.length} (${a.haptics.join(", ") || "none"})`)
  console.log(`  touch-action throughout: ${[...new Set(a.log.map((s) => s.touchAction))].join(" then ") || "(none seen)"}`)
  console.log(`  page scrolled: ${a.startScroll} -> ${a.afterEnd.scrollY} (${a.afterEnd.scrollY - a.startScroll >= 0 ? "+" : ""}${a.afterEnd.scrollY - a.startScroll}px)`)
  console.log(`  after the finger lifts: ${a.afterEnd.active ? "STILL SHOWING" : "gone"}`)
}
;["oneShot", "holdThenDrag", "pullDown"].forEach((k) => show(r[k]))

for (const key of ["oneShot", "holdThenDrag"]) {
  const a = r[key]
  const engagedAt = a.log.findIndex((s) => s.active)
  if (engagedAt < 0) { problems.push(`[${metric}] ${a.name}: the tooltip never appeared. The gesture does not engage at all.`); continue }
  if (key === "oneShot" && engagedAt > 1) problems.push(`[${metric}] ${a.name}: took ${engagedAt + 1} moves to engage. In one shot it has to engage on the first move that clears the slop.`)
  const tracked = a.log.filter((s) => s.active && s.want !== null)
  const wrong = tracked.filter((s) => s.got !== s.want)
  if (wrong.length) problems.push(`[${metric}] ${a.name}: ${wrong.length} of ${tracked.length} positions read the wrong day (e.g. at x=${wrong[0].x} it wanted day ${wrong[0].want} and showed ${wrong[0].got === null ? "nothing" : "day " + wrong[0].got}).`)
  const days = new Set(tracked.map((s) => s.got)).size
  if (days < 4) problems.push(`[${metric}] ${a.name}: the reading only ever showed ${days} different days across the whole drag. It is not following the finger.`)
  if (a.haptics.length < 4) problems.push(`[${metric}] ${a.name}: ${a.haptics.length} haptic ticks for ${days} days crossed. It should tick on every one.`)
  if (a.haptics.length > tracked.length + 2) problems.push(`[${metric}] ${a.name}: ${a.haptics.length} haptic ticks for ${days} days crossed. It is buzzing per frame, not per day.`)
  const clipped = a.log.filter((s) => s.tip && (s.tip.left < 0 || s.tip.right > 420))
  if (clipped.length) problems.push(`[${metric}] ${a.name}: the tooltip hung outside the screen at ${clipped.length} positions.`)
  if (a.afterEnd.active) problems.push(`[${metric}] ${a.name}: the tooltip stayed up after the finger lifted.`)
  const held = a.log.filter((s) => s.active && !s.defaultPrevented)
  if (held.length) problems.push(`[${metric}] ${a.name}: ${held.length} moves did not prevent the default, so the page can scroll mid scrub.`)
}

/*
 * TOUCH-ACTION IS LATCHED AT TOUCHSTART. A value that changes when the
 * tooltip opens cannot affect the gesture that opened it — it only reaches
 * the NEXT touch, which is why the old chart needed a lift and a second tap.
 * Nothing here may vary across a gesture, and it may not permit a pan.
 */
for (const key of ["oneShot", "holdThenDrag", "pullDown"]) {
  const seen = [...new Set(r[key].log.map((s) => s.touchAction))]
  if (seen.length > 1) problems.push(`[${metric}] ${key}: touch-action changed mid gesture (${seen.join(" then ")}). The browser latched the first one and ignored the rest.`)
  if (seen.some((t) => t !== "none")) problems.push(`[${metric}] ${key}: touch-action is "${seen.join(", ")}". Anything that permits a pan lets the browser take the gesture away mid hold.`)
}

/* Scrolling by hand, because touch-action:none means nothing else will. */
{
  /* A finger pulled DOWN sends the page UP, so the number goes down. */
  const moved = r.pullDown.afterEnd.scrollY - r.pullDown.startScroll
  if (moved > -20) problems.push(`[${metric}] a downward drag on the chart moved the page ${moved}px, and it should have gone up by at least 20. With touch-action:none nothing else will scroll it, so a thumb on the chart would freeze the page.`)
  for (const key of ["oneShot", "holdThenDrag"]) {
    const drift = Math.abs(r[key].afterEnd.scrollY - r[key].startScroll)
    if (drift > 4) problems.push(`[${metric}] ${key}: the page moved ${drift}px during a scrub. A sideways gesture must not scroll.`)
  }
}

const pull = r.pullDown
if (pull.log.some((s) => s.active)) problems.push(`[${metric}] pullDown: a straight downward drag opened the tooltip. A thumb over the chart cannot scroll the page.`)


}

if (problems.length) {
  console.error(`\n${problems.length} problem${problems.length > 1 ? "s" : ""}:\n`)
  problems.forEach((p, i) => console.error(`  ${i + 1}. ${p}`))
  console.error("")
  process.exit(1)
}
console.log("\nPress and drag in one motion, press and hold then drag, and a straight pull down: all three behaved.\n")
