/**
 * ===========================================================================
 *  THE SHEET, DRAGGED
 * ===========================================================================
 * Four things, all of which the sheets this replaces got wrong or did not do:
 *
 *   THE PAGE BEHIND IT DOES NOT MOVE. React registers touchmove passively, so
 *     `preventDefault` inside an onTouchMove prop is a no-op and the page
 *     scrolls under the sheet while it is dragged. Measured as whether the
 *     move is actually cancellable.
 *   IT FOLLOWS THE FINGER. The transform at each step should equal how far
 *     the finger has travelled, not a step behind it.
 *   A FLICK CLOSES IT, even a short one.
 *   A SMALL DRAG SPRINGS BACK rather than closing.
 *
 * Frames are shimmed: headless Chromium under virtual time runs no rAF, and
 * the drag does its work in one. What is measured is the sheet's arithmetic,
 * not its frame pacing.
 *
 *   pnpm build && node scripts/check-sheet.mjs
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

const out = mkdtempSync(join(tmpdir(), "storelib-sheet-"))
execFileSync("npx", ["--no-install", "esbuild", join(root, "scripts/render-sheet.tsx"),
  "--bundle", "--format=iife", "--platform=browser", "--jsx=automatic", "--log-level=error", `--outfile=${join(out, "probe.js")}`,
  '--banner:js=var process=globalThis.process||{env:{NODE_ENV:"production"},browser:true,versions:{},platform:"browser",cwd:function(){return "/"},nextTick:function(f){setTimeout(f,0)}};globalThis.process=process;',
  '--define:process.env.NODE_ENV="production"',
  `--alias:@=${root}`, "--loader:.css=empty", "--loader:.svg=dataurl", "--loader:.png=dataurl"],
  { stdio: ["ignore", "ignore", "inherit"] })

const DRIVE = `
<script>
(function () {
  function sheet() { return document.querySelector('[role="dialog"] > div:last-child') }
  function y() {
    var el = sheet(); if (!el) return null
    var m = /translate3d\\(0(?:px)?, *(-?[0-9.]+)px/.exec(el.style.transform || "")
    return m ? Math.round(Number(m[1])) : null
  }
  function touch(el, x, yy) { return new Touch({ identifier: 1, target: el, clientX: x, clientY: yy, pageX: x, pageY: yy, radiusX: 11, radiusY: 11, force: 1 }) }
  function fire(el, type, x, yy) {
    var t = type === "touchend" ? [] : [touch(el, x, yy)]
    var ev = new TouchEvent(type, { touches: t, targetTouches: t, changedTouches: [touch(el, x, yy)], bubbles: true, cancelable: true, view: window })
    el.dispatchEvent(ev)
    return ev
  }
  function report(o) { var p = document.createElement("pre"); p.id = "result"; p.textContent = JSON.stringify(o); document.body.append(p) }

  var result = {}
  window.__open()

  setTimeout(function () {
    var el = sheet()
    if (!el) { report({ error: "the sheet never opened" }); return }
    result.opened = { restingY: y(), height: Math.round(el.getBoundingClientRect().height) }

    /* How many times does React touch the DOM during a drag? A sheet that
       renders per frame shows up here as a pile of mutations. */
    var mutations = 0
    var mo = new MutationObserver(function (recs) { mutations += recs.length })
    mo.observe(el, { attributes: true, childList: true, subtree: true, characterData: true })

    /*
     * A FINGER MOVES IN TIME. The first version of this fired every
     * touchmove in one synchronous burst and read the transform straight
     * after, which measured two things that are not true of a phone: no
     * frame had run, so the sheet had not been painted yet, and no time had
     * passed, so every velocity was zero and a flick could not exist. Both
     * came back as the sheet being broken. Sixteen milliseconds apart, one
     * frame between, which is what a screen does.
     */
    var handle = el.querySelector("[data-sheet-handle]") || el
    var box = handle.getBoundingClientRect()
    var startY = Math.round(box.top + 6)
    var startEv = fire(handle, "touchstart", 180, startY)
    result.startCancellable = startEv.cancelable
    var steps = []
    var offsets = [20, 40, 60]
    var i = 0

    function dragStep() {
      if (i >= offsets.length) { release(); return }
      var d = offsets[i++]
      var ev = fire(handle, "touchmove", 180, startY + d)
      /* One frame for the rAF the handler queued, then read. The gaps are
         wide on purpose: this is the DELIBERATE drag, about 170px a second,
         which must spring back. The flick below is the fast one. */
      setTimeout(function () {
        steps.push({ finger: d, sheet: y(), cancelled: ev.defaultPrevented, scrollY: Math.round(window.scrollY) })
        setTimeout(dragStep, 104)
      }, 16)
    }

    function release() {
      result.drag = steps
      /* 60px is under the 96px threshold and the finger was ambling, so back it goes. */
      fire(handle, "touchend", 180, startY + 60)
      setTimeout(pullUp, 400)
    }

    /*
     * PULLING UP. The sheet is anchored to the bottom of the screen, so any
     * upward movement uncovers whatever is behind it down there — which is
     * the scrim, and reads as a black band under the sheet. Dragged well
     * past the cap, and then asked what is actually painted at the very
     * bottom of the screen.
     */
    function pullUp() {
      var el3 = sheet()
      if (!el3) { afterSmall(); return }
      var h3 = el3.querySelector("[data-sheet-handle]") || el3
      var b3 = h3.getBoundingClientRect()
      var sy3 = Math.round(b3.top + 6)
      fire(h3, "touchstart", 180, sy3)
      var up = [-40, -90, -140]
      var j = 0
      function step() {
        if (j >= up.length) {
          var box3 = sheet().getBoundingClientRect()
          var atFloor = document.elementFromPoint(Math.round(window.innerWidth / 2), window.innerHeight - 2)
          result.pullUp = {
            lift: Math.round(window.innerHeight - box3.bottom),
            sheetTop: Math.round(box3.top),
            atTheFloor: atFloor ? (sheet().contains(atFloor) || atFloor === sheet() ? "the sheet" : (atFloor.className || atFloor.tagName)) : "nothing",
            floorColour: atFloor ? getComputedStyle(atFloor).backgroundColor : null,
          }
          fire(h3, "touchend", 180, sy3 - 140)
          setTimeout(afterSmall, 400)
          return
        }
        fire(h3, "touchmove", 180, sy3 + up[j++])
        setTimeout(step, 40)
      }
      setTimeout(step, 16)
    }

    function afterSmall() {
      mo.disconnect()
      result.mutationsDuringDrag = mutations
      result.afterSmallDrag = { y: y(), stillOpen: !!sheet(), closed: window.__closed }

      var el2 = sheet()
      if (!el2) { report(result); return }
      var h2 = el2.querySelector("[data-sheet-handle]") || el2
      var b2 = h2.getBoundingClientRect()
      var sy = Math.round(b2.top + 6)
      fire(h2, "touchstart", 180, sy)
      /* A flick: 30px per frame is about 1.9px/ms, far past the threshold,
         and it stops at 60px — under the distance that would close it on
         its own, so only the speed can. */
      setTimeout(function () {
        fire(h2, "touchmove", 180, sy + 30)
        setTimeout(function () {
          fire(h2, "touchmove", 180, sy + 60)
          result.flickTrace = { sheetY: y(), at: Math.round(performance.now()) }
          setTimeout(function () {
            result.flickTrace.beforeEnd = Math.round(performance.now())
            fire(h2, "touchend", 180, sy + 60)
            var elx = sheet()
            result.flickTrace.afterEnd = elx ? { transform: elx.style.transform, transition: elx.style.transition } : "gone"
            setTimeout(function () {
              result.afterFlick = { stillOpen: !!sheet(), closed: window.__closed }
              tapAway()
            }, 700)
          }, 16)
        }, 16)
      }, 16)
    }

    /*
     * TAPPING OFF THE SHEET. Re-opened, then the scrim is clicked — twice in
     * quick succession, because a second tap on a sheet already leaving used
     * to start a second dismissal from a sheet that had already gone.
     */
    function tapAway() {
      window.__closed = false
      window.__open()
      setTimeout(function () {
        var el4 = sheet()
        if (!el4) { result.tapAway = { error: "did not reopen" }; report(result); return }
        var scrim = document.querySelector('[role="dialog"] > div:first-child')
        scrim.click()
        scrim.click()
        setTimeout(function () {
          result.tapAway = { closed: window.__closed, stillOpen: !!sheet() }
          report(result)
        }, 800)
      }, 700)
    }

    dragStep()
  }, 600)
})()
</script>`

writeFileSync(join(out, "index.html"), `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style><style>
  body{margin:0;font-family:Inter,system-ui,sans-serif}
  /* Transitions never advance under virtual time; the end state is what is read. */
  *,*::before,*::after{transition-duration:0s!important;animation-duration:0s!important}
</style></head><body><div id="app"></div>
<script>
(function () {
  var q = [], id = 0, fired = 0
  window.requestAnimationFrame = function (fn) { q.push([++id, fn]); return id }
  window.cancelAnimationFrame = function (i) { for (var k = 0; k < q.length; k++) if (q[k][0] === i) { q.splice(k, 1); return } }
  setInterval(function () { var run = q; q = []; for (var k = 0; k < run.length; k++) { fired++; try { run[k][1](performance.now()) } catch (e) {} } window.__frames = fired }, 8)
  /* Web Animations do not advance under virtual time either: the document
     timeline never ticks, so an animation sits on its first keyframe and
     never finishes. The sheet sets its resting transform before it animates,
     so a stand-in that just reports "finished" after the duration leaves the
     end state in place, the same as the transition rule above. */
  Element.prototype.animate = function (_frames, timing) {
    var ms = typeof timing === "number" ? timing : (timing && timing.duration) || 0
    var anim = { cancelled: false, onfinish: null, cancel: function () { anim.cancelled = true } }
    setTimeout(function () { if (!anim.cancelled && anim.onfinish) anim.onfinish() }, ms)
    return anim
  }
})()
</script>
<script src="probe.js"></script>${DRIVE}</body></html>`)

const dom = execFileSync(CHROMIUM, ["--headless=new", "--no-sandbox", "--disable-gpu", "--hide-scrollbars",
  "--window-size=400,780", "--virtual-time-budget=20000", "--run-all-compositor-stages-before-draw",
  "--dump-dom", `file://${join(out, "index.html")}`], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 64 * 1024 * 1024 })
const m = dom.match(/<pre id="result">([\s\S]*?)<\/pre>/)
if (!m) fail("The sheet never reported.")
const decode = (s) => s.replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&")
const r = JSON.parse(decode(m[1]))
if (r.error) fail(r.error)

console.log(`\nOpen: the sheet is ${r.opened.height}px tall and rests at y=${r.opened.restingY}.`)
console.log(`\nDragging the handle down:`)
r.drag.forEach((s) => console.log(`  finger +${s.finger}px  sheet +${s.sheet}px  ${s.cancelled ? "page held" : "PAGE NOT HELD"}  page at ${s.scrollY}`))
console.log(`\n  DOM changes during the whole drag: ${r.mutationsDuringDrag}`)
console.log(`  after a 60px drag and release: ${r.afterSmallDrag.stillOpen ? `still open, back at y=${r.afterSmallDrag.y}` : "closed"}`)
console.log(`  pulled 140px upward: the sheet lifted ${r.pullUp.lift}px off the floor, and the floor is ${r.pullUp.atTheFloor} (${r.pullUp.floorColour})`)
console.log(`  after a flick: ${r.afterFlick.closed ? "closed" : "STILL OPEN"}`)
console.log(`  reopened, then tapped off it twice: ${r.tapAway.closed && !r.tapAway.stillOpen ? "closed and gone" : JSON.stringify(r.tapAway)}`)
console.log("")

const problems = []
if (r.opened.restingY !== 0) problems.push(`The sheet rests at y=${r.opened.restingY} instead of 0, so it never finished opening.`)
const lag = r.drag.filter((s) => Math.abs(s.sheet - s.finger) > 2)
if (lag.length) problems.push(`The sheet did not follow the finger at ${lag.length} of ${r.drag.length} steps (e.g. finger +${lag[0].finger}px, sheet +${lag[0].sheet}px).`)
const loose = r.drag.filter((s) => !s.cancelled)
if (loose.length) problems.push(`${loose.length} of ${r.drag.length} moves were not cancelled, so the page scrolls behind the sheet while it is dragged. That is what a React onTouchMove cannot prevent.`)
if (r.drag.some((s) => s.scrollY > 0)) problems.push(`The page behind the sheet actually scrolled.`)
if (r.mutationsDuringDrag > 12) problems.push(`${r.mutationsDuringDrag} DOM changes during one drag. The sheet is being re-rendered per frame rather than moved.`)
if (!r.afterSmallDrag.stillOpen || r.afterSmallDrag.y !== 0) problems.push(`A 60px drag should spring back to 0; the sheet ended ${r.afterSmallDrag.stillOpen ? `at y=${r.afterSmallDrag.y}` : "closed"}.`)
if (r.pullUp.atTheFloor !== "the sheet") problems.push(`Pulling up uncovered ${r.pullUp.atTheFloor} at the bottom of the screen. Whatever is behind the sheet is not meant to be seen under it.`)
/* The lift is deliberate — a pull should give a little. What matters is
   that it stops giving, and that the skirt covers whatever it opens up. */
/* A scroll view's rubber band, the builder sheet's (sheet-gestures rubberBand): 140px of finger is about 39px of sheet, and it never reaches 80. */
if (r.pullUp.lift > 45) problems.push(`Pulling 140px up lifted the sheet ${r.pullUp.lift}px. The give is a rubber band capped at 80px; past that a long drag walks the sheet off the bottom of the screen.`)
if (!r.tapAway.closed || r.tapAway.stillOpen) problems.push(`Tapping off the sheet left it ${r.tapAway.stillOpen ? "on screen" : "half closed"} (${JSON.stringify(r.tapAway)}).`)
if (!r.afterFlick.closed) problems.push(`A flick did not close the sheet. Distance alone means a fast short flick springs back, which reads as the sheet fighting you.`)

if (problems.length) {
  console.error(`${problems.length} problem${problems.length > 1 ? "s" : ""}:\n`)
  problems.forEach((p, i) => console.error(`  ${i + 1}. ${p}`))
  console.error("")
  process.exit(1)
}
console.log("It opens, follows the finger, holds the page, springs back from a small drag and closes on a flick.\n")
