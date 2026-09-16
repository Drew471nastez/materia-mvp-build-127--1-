/**
 * ===========================================================================
 *  THE GALLERY'S SWIPE MOVES THE PICTURE
 * ===========================================================================
 * "Make sure the image player also supports touch swipe, and it's smooth."
 *
 * It already changed slide on a swipe, so "does swiping work" was the wrong
 * question and would have answered yes. The gallery stacked its slides and
 * crossfaded between them, which means there is no position to move: a finger
 * could travel a hundred pixels with nothing happening at all, and then the
 * picture would jump at the fiftieth. That is what "not smooth" is.
 *
 * So what is measured is whether the strip is UNDER THE FINGER: how far it
 * has moved when the finger has moved, sampled mid-gesture, on the real
 * component driven by real touch events.
 *
 *   pnpm build && node scripts/check-gallery-swipe.mjs
 */
import { execFileSync } from "node:child_process"
import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const root = process.cwd()
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)
const cssDir = join(root, ".next/static/chunks")
if (!existsSync(cssDir)) fail("No production build found. Run `pnpm build` first.")
const css = readdirSync(cssDir).filter((f) => f.endsWith(".css")).map((f) => readFileSync(join(cssDir, f), "utf8")).join("\n")

const out = mkdtempSync(join(tmpdir(), "storelib-gallery-swipe-"))
execFileSync("npx", ["--no-install", "esbuild", join(root, "scripts/render-gallery-swipe.tsx"),
  "--bundle", "--format=iife", "--platform=browser", "--jsx=automatic", "--log-level=error",
  `--outfile=${join(out, "probe.js")}`,
  '--banner:js=var process=globalThis.process||{env:{NODE_ENV:"production"},browser:true};globalThis.process=process;',
  '--define:process.env.NODE_ENV="production"',
  `--alias:@=${root}`, "--loader:.css=empty", "--loader:.svg=dataurl", "--loader:.png=dataurl"],
  { stdio: ["ignore", "ignore", "inherit"] })

/*
  A real touch, in the steps a finger makes. Dispatched on the element under
  the point so the gesture's own handlers see exactly what a phone sends.
  Touch objects have to be constructed with an identifier and a target or
  Chromium rejects the TouchEvent.
*/
const TOUCH = `
function touchAt(el, x, y) {
  var t = new Touch({ identifier: 1, target: el, clientX: x, clientY: y })
  return t
}
function send(el, type, x, y) {
  var t = touchAt(el, x, y)
  el.dispatchEvent(new TouchEvent(type, {
    bubbles: true, cancelable: true, composed: true,
    touches: type === "touchend" ? [] : [t],
    targetTouches: type === "touchend" ? [] : [t],
    changedTouches: [t],
  }))
}
/*
  WHAT THE COMPONENT DECIDED, read off the strip's own inline transform.

  Two earlier versions of this read the rendered geometry and both reported a
  working gesture as completely dead:

    getComputedStyle().transform into a DOMMatrix — DOMMatrix cannot parse a
    percentage or a calc, so every reading came back as the identity matrix.

    getBoundingClientRect() — the strip carries a 300ms transition, and under
    --virtual-time-budget there is no compositor advancing the animation
    clock, so the PAINTED position stays at the start value however many
    times the inline style changes.

  The inline style is the thing under test: it is where the component puts the
  strip, and it is written as translate3d(calc(P% + Dpx), 0, 0) — P is which
  slide, D is how far the finger has dragged it. Both are read out of it.
*/
function parts(strip) {
  /* No regex: this lives inside a template literal, where a backslash is an
     escape and mangles the pattern before the browser ever sees it. */
  var text = strip.getAttribute("style") || ""
  var open = text.indexOf("calc(")
  if (open < 0) return { pct: 0, px: 0 }
  var body = text.slice(open + 5, text.indexOf(")", open))
  /*
    NOT split("+"). The component writes calc(0% + -60px) and the browser
    normalises that to calc(0% - 60px), so splitting on a plus found no second
    term, read the drag as zero, and reported a gesture that works perfectly
    as one that does not move at all. Take everything after the percent sign
    and let parseFloat read the sign.
  */
  var cut = body.indexOf("%")
  var pct = parseFloat(body) || 0
  var tail = cut < 0 ? "" : body.slice(cut + 1).split(" ").join("")
  return { pct: pct, px: parseFloat(tail) || 0 }
}
/** How far the finger has dragged the strip from its resting slide. */
function trackX(strip) { return Math.round(parts(strip).px) }
/** Which slide the strip is resting on. */
function trackIndex(strip) { return Math.round(-parts(strip).pct / 100) }
`

writeFileSync(join(out, "index.html"), `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style><style>body{margin:0}
/* Motion off: this is about position under a finger, not about the curve. */
*,*::before,*::after{animation:none!important}
</style></head><body><div id="app"></div><script src="probe.js"></script>
<script>
${TOUCH}
/*
  ASYNCHRONOUSLY, because React batches continuous events. touchmove is not
  a discrete event, so the state it sets is flushed on a later tick — reading
  the transform on the line after the dispatch reads the frame BEFORE the one
  the move produced, and the strip looks like it never moved. The first
  version of this probe did exactly that and reported a working gesture as
  broken.
*/
/* A timer, not requestAnimationFrame. Under --virtual-time-budget there is
   no compositor driving rAF, so a promise waiting on one never resolves and
   the probe reports nothing at all — which is what it did. Timers advance. */
var nextFrame = function () { return new Promise(function (r) { setTimeout(r, 40) }) }

async function run() {
  var report = {}
  var host = document.getElementById("host")
  var frame = host.querySelector(".aspect-video")
  var strip = frame && frame.querySelector(".flex.h-full.w-full")
  report.foundFrame = !!frame
  report.foundStrip = !!strip
  if (!strip) { show(report); return }

  report.stripClass = strip.className
  report.stripInline = strip.getAttribute("style")
  report.frameClass = frame.className
  /* Does a raw listener on the frame see the events at all? */
  report.native = 0
  frame.addEventListener("touchstart", function () { report.native++ }, true)
  frame.addEventListener("touchmove", function () { report.native++ }, true)

  var box = frame.getBoundingClientRect()
  report.frameWidth = Math.round(box.width)
  report.slides = strip.children.length
  report.restingX = trackX(strip)
  show(report)

  var y = Math.round(box.top + box.height / 2)
  var x0 = Math.round(box.left + box.width - 20)
  var indexNow = function () { return trackIndex(strip) }

  /* 1. A drag that stops short: the strip follows, then springs back. */
  send(frame, "touchstart", x0, y)
  send(frame, "touchmove", x0 - 12, y)
  await nextFrame()
  send(frame, "touchmove", x0 - 60, y)
  await nextFrame()
  report.atMinus60 = trackX(strip)
  report.inlineAtMinus60 = strip.getAttribute("style")
  show(report)
  send(frame, "touchmove", x0 - 30, y)
  await nextFrame()
  report.atMinus30 = trackX(strip)
  show(report)
  send(frame, "touchend", x0 - 30, y)
  await new Promise(function (r) { setTimeout(r, 450) })
  report.afterShortDrag = { index: indexNow() }
  show(report)

  /* 2. A drag past the commit point changes slide. */
  send(frame, "touchstart", x0, y)
  send(frame, "touchmove", x0 - 12, y)
  await nextFrame()
  send(frame, "touchmove", x0 - Math.round(box.width * 0.5), y)
  await nextFrame()
  report.atHalf = trackX(strip)
  show(report)
  send(frame, "touchend", x0 - Math.round(box.width * 0.5), y)
  await new Promise(function (r) { setTimeout(r, 600) })
  report.indexAfterCommit = indexNow()
  show(report)

  /* 3. A vertical swipe must not drag the strip sideways at all. */
  var before = trackX(strip)
  send(frame, "touchstart", x0, y)
  send(frame, "touchmove", x0 - 6, y - 40)
  await nextFrame()
  send(frame, "touchmove", x0 - 14, y - 120)
  await nextFrame()
  report.duringVertical = trackX(strip) - before
  show(report)
  send(frame, "touchend", x0 - 14, y - 120)
  await nextFrame()

  report.touchAction = getComputedStyle(frame).touchAction
  report.stripInlineEnd = strip.getAttribute("style")
  show(report)
}

/*
  WRITTEN AS IT GOES, not once at the end. A probe that only reports on
  success tells you nothing at all when it hangs — which is the state this
  spent three rounds in. Whatever step it reached is on the page.
*/
function show(report) {
  var pre = document.getElementById("result")
  if (!pre) {
    pre = document.createElement("pre")
    pre.id = "result"
    document.body.append(pre)
  }
  pre.textContent = JSON.stringify(report)
}

window.addEventListener("error", function (e) { show({ pageError: String(e.message) }) })
setTimeout(function () { run().catch(function (e) { show({ threw: String(e && e.stack || e) }) }) }, 900)
</script></body></html>`)

const dom = execFileSync(CHROMIUM, ["--headless=new", "--no-sandbox", "--disable-gpu", "--hide-scrollbars",
  "--window-size=390,844", "--virtual-time-budget=15000", "--dump-dom", `file://${join(out, "index.html")}`],
  { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 32 * 1024 * 1024 })
const m = dom.match(/<pre id="result">([\s\S]*?)<\/pre>/)
if (!m) fail("The gallery never reported. It probably did not render.")
const r = JSON.parse(m[1].replace(/&quot;/g, '"'))

const problems = []
console.log("")
if (r.pageError) fail(`The probe page threw before it could measure anything:\n  ${r.pageError}`)
if (r.threw) fail(`The probe threw:\n  ${r.threw}`)
if (!r.foundFrame) fail("No gallery frame in the page.")
if (!r.foundStrip) fail("No strip inside the frame. The slides are still stacked, so nothing can follow a finger.")

console.log(`  frame ${r.frameWidth}px, ${r.slides} slides, touch-action: ${r.touchAction}`)
console.log(`  finger at -60px -> strip at ${r.atMinus60}px`)
console.log(`  finger back to -30px -> strip at ${r.atMinus30}px`)
console.log(`  short drag released -> slide ${r.afterShortDrag.index}`)
console.log(`  finger at -${Math.round(r.frameWidth * 0.5)}px -> strip at ${r.atHalf}px, released -> slide ${r.indexAfterCommit}`)
console.log(`  vertical swipe moved the strip ${r.duringVertical}px`)
if (process.env.DEBUG_SWIPE) {
  console.log(`  [debug] native listeners fired: ${r.native}`)
  console.log(`  [debug] strip class: ${r.stripClass}`)
  console.log(`  [debug] strip style at rest: ${r.stripInline}`)
  console.log(`  [debug] strip style mid-drag: ${r.inlineAtMinus60}`)
  console.log(`  [debug] strip style at end:  ${r.stripInlineEnd}`)
  console.log(`  [debug] frame class: ${r.frameClass}`)
}
console.log("")

/* The whole claim: the picture is under the finger. */
if (Math.abs(r.atMinus60 - -60) > 6) {
  problems.push(`The finger was 60px in and the strip had moved ${r.atMinus60}px. It is not following.`)
}
if (Math.abs(r.atMinus30 - -30) > 6) {
  problems.push(`The finger came back to 30px and the strip is at ${r.atMinus30}px, so it does not track backwards either.`)
}
/* Short of the commit point, it springs back rather than changing. */
if (r.afterShortDrag.index !== 0) problems.push(`A 30px drag changed to slide ${r.afterShortDrag.index}. That is short of the commit point and should spring back.`)
/* Past it, it commits. */
if (r.indexAfterCommit !== 1) problems.push(`Half a screen of drag left it on slide ${r.indexAfterCommit}, not 1.`)
/* And a scroll is a scroll. */
if (Math.abs(r.duringVertical) > 2) problems.push(`A vertical swipe dragged the strip ${r.duringVertical}px sideways. That is the page twitching while somebody reads it.`)
if (r.touchAction !== "pan-y") problems.push(`touch-action is ${r.touchAction}. \`pan-y\` is what stops the browser's own horizontal pan competing while leaving the page scrollable.`)

if (problems.length) {
  console.error(`${problems.length} problem${problems.length > 1 ? "s" : ""}:\n`)
  problems.forEach((p, i) => console.error(`  ${i + 1}. ${p}`))
  console.error("")
  process.exit(1)
}
console.log("  The picture moves with the finger, springs back short of the commit point, and a scroll is still a scroll.\n")
