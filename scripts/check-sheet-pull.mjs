/**
 * ===========================================================================
 *  A SHEET CLOSES FROM ANYWHERE ON IT, NOT ONLY THE HANDLE
 * ===========================================================================
 * A post opened on a phone (components/ui/bottom-sheet.tsx) only closed by
 * a drag on its grey handle. Now a pull down that starts with the content
 * already at its top drags the sheet, as an iOS sheet and the website
 * builder's do. Measured here with touches on a list row:
 *
 *   AT THE TOP, PULLED DOWN   the sheet follows the finger and a release
 *                             far enough down closes it
 *   SCROLLED, PULLED DOWN     the list keeps the finger: the sheet stays
 *   AT THE TOP, PUSHED UP     the list keeps the finger: the sheet stays
 *   IN THE COMMENT BOX        a field keeps its own finger: the sheet stays
 *
 *   node scripts/check-sheet-pull.mjs
 */
import { execFileSync } from "node:child_process"
import { existsSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const root = process.cwd()
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)

const out = mkdtempSync(join(tmpdir(), "storelib-sheet-pull-"))
execFileSync("pnpm", ["exec", "esbuild", join(root, "scripts/render-sheet-pull.tsx"),
  "--bundle", "--format=iife", "--platform=browser", "--jsx=automatic", "--log-level=error", `--outfile=${join(out, "probe.js")}`,
  '--banner:js=var process=globalThis.process||{env:{NODE_ENV:"production"},browser:true,versions:{},platform:"browser",cwd:function(){return "/"},nextTick:function(f){setTimeout(f,0)}};globalThis.process=process;',
  '--define:process.env.NODE_ENV="production"',
  `--alias:@=${root}`, "--loader:.css=empty", "--loader:.svg=dataurl", "--loader:.png=dataurl"],
  { stdio: ["ignore", "ignore", "inherit"] })

/* The few utilities the sheet's layout needs, so this runs without a production build. */
const CSS = `.fixed{position:fixed}.inset-0{inset:0}.flex{display:flex}.flex-col{flex-direction:column}.flex-1{flex:1 1 0%}.min-h-0{min-height:0}.shrink-0{flex-shrink:0}.overflow-y-auto{overflow-y:auto}.overflow-hidden{overflow:hidden}.absolute{position:absolute}.relative{position:relative}`

const DRIVE = `
<script>
(function () {
  function sheet() { return document.querySelector('[role="dialog"] > div:last-child') }
  function y() {
    var el = sheet(); if (!el) return null
    var m = /translate3d\\(0(?:px)?, *(-?[0-9.]+)px/.exec(el.style.transform || "")
    return m ? Math.round(Number(m[1])) : 0
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

  /* Drag from an element: moves (px from the start), 16ms apart, then lift. Calls back with the sheet's y at each step. */
  function drag(el, moves, then) {
    var box = el.getBoundingClientRect()
    var sx = Math.round(box.left + 40), sy = Math.round(box.top + box.height / 2)
    fire(el, "touchstart", sx, sy)
    var ys = [], i = 0
    function step() {
      if (i >= moves.length) {
        fire(el, "touchend", sx, sy + moves[moves.length - 1])
        setTimeout(function () { then(ys) }, 900)
        return
      }
      fire(el, "touchmove", sx, sy + moves[i++])
      setTimeout(function () { ys.push(y()); step() }, 16)
    }
    setTimeout(step, 16)
  }
  function scroller() { return sheet().querySelector("[data-sheet-scroll]") }
  function row(n) { return sheet().querySelector('[data-row="' + n + '"]') }

  window.__open()
  setTimeout(function () {
    if (!sheet()) { report({ error: "the sheet never opened" }); return }
    result.listScrolls = scroller().scrollHeight > scroller().clientHeight
    /* 1. At the top, pulled down on a row. */
    drag(row(3), [10, 30, 60, 100, 150, 220, 300], function (ys) {
      result.atTop = { ys: ys, closed: window.__closed, gone: !sheet() }
      window.__open()
      setTimeout(function () {
        /* 2. Scrolled, pulled down. */
        scroller().scrollTop = 400
        drag(row(14), [10, 30, 60, 100, 150], function (ys2) {
          result.scrolled = { ys: ys2, closed: window.__closed }
          scroller().scrollTop = 0
          /* 3. At the top, pushed up. */
          drag(row(3), [-10, -30, -60, -100], function (ys3) {
            result.pushedUp = { ys: ys3, closed: window.__closed }
            /* 4. In the comment box, at the top, pulled down. */
            drag(sheet().querySelector("#box"), [10, 30, 60, 100, 150], function (ys4) {
              result.inField = { ys: ys4, closed: window.__closed }
              report(result)
            })
          })
        })
      }, 700)
    })
  }, 700)
})()
</script>`

writeFileSync(join(out, "index.html"), `<!doctype html><html><head><meta charset="utf-8"><style>${CSS}</style><style>
  body{margin:0;font-family:system-ui,sans-serif}
  *,*::before,*::after{transition-duration:0s!important;animation-duration:0s!important}
</style></head><body><div id="app"></div>
<script>
(function () {
  var q = [], id = 0
  window.requestAnimationFrame = function (fn) { q.push([++id, fn]); return id }
  window.cancelAnimationFrame = function (i) { for (var k = 0; k < q.length; k++) if (q[k][0] === i) { q.splice(k, 1); return } }
  setInterval(function () { var run = q; q = []; for (var k = 0; k < run.length; k++) { try { run[k][1](performance.now()) } catch (e) {} } }, 8)
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
  "--window-size=390,844", "--virtual-time-budget=30000", "--run-all-compositor-stages-before-draw",
  "--dump-dom", `file://${join(out, "index.html")}`], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 64 * 1024 * 1024 })
const m = dom.match(/<pre id="result">([\s\S]*?)<\/pre>/)
if (!m) fail("The sheet never reported.")
const decode = (s) => s.replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&")
const r = JSON.parse(decode(m[1]))
if (r.error) fail(r.error)

console.log(`\nThe list scrolls inside the sheet: ${r.listScrolls}`)
console.log(`At the top, pulled down on a row: sheet at ${r.atTop.ys.join(", ")}; ${r.atTop.closed ? "closed" : "STILL OPEN"}`)
console.log(`Scrolled 400px, pulled down: sheet at ${r.scrolled.ys.join(", ")}; ${r.scrolled.closed ? "CLOSED" : "open"}`)
console.log(`At the top, pushed up: sheet at ${r.pushedUp.ys.join(", ")}; ${r.pushedUp.closed ? "CLOSED" : "open"}`)
console.log(`In the comment box, pulled down: sheet at ${r.inField.ys.join(", ")}; ${r.inField.closed ? "CLOSED" : "open"}\n`)

const problems = []
if (!r.listScrolls) problems.push("The fixture's list does not scroll, so nothing here is about a list.")
const last = r.atTop.ys[r.atTop.ys.length - 1]
if (!(last > 200)) problems.push(`A pull down from a row at the top did not move the sheet (last y ${last}).`)
if (!r.atTop.closed) problems.push("A 300px pull down from a row at the top did not close the sheet.")
if (r.scrolled.ys.some((v) => v !== 0) || r.scrolled.closed) problems.push("A pull down on a scrolled list moved the sheet: the list should keep the finger.")
if (r.pushedUp.ys.some((v) => v > 0) || r.pushedUp.closed) problems.push("A push up at the top moved the sheet down or closed it.")
if (r.inField.ys.some((v) => v !== 0) || r.inField.closed) problems.push("A pull inside the comment box moved the sheet.")
if (problems.length) {
  problems.forEach((p, i) => console.error(`  ${i + 1}. ${p}`))
  process.exit(1)
}
console.log("A pull down from the top closes it from anywhere; a scrolled list, a push up and a field keep the finger.\n")
