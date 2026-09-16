/**
 * ===========================================================================
 *  THE OPEN PICTURE: THE CLOSE CONTROL, AND PRESSING THE GROUND
 * ===========================================================================
 * Two complaints about the lightbox in the creator page editor: the X in the
 * corner is cut off, and pressing away from the picture does not close it.
 * Both are about the real Radix dialog rather than about any CSS anybody can
 * read off the file, so both are opened and pressed here for real.
 *
 * WHY IT RUNS WITH SCROLLBARS SHOWING. `w-screen` is `100vw`, which includes
 * the scrollbar. The overlay's `inset-0` is measured against the viewport,
 * which does not. On a page with no scrollbar the two agree and a panel
 * hanging off the right edge measures as fitting, so --hide-scrollbars would
 * have hidden the actual defect.
 *
 * WHAT IT ASSERTS
 *   1. the panel is no wider than the overlay, so nothing sits in the gutter
 *   2. the close control is fully inside the visible viewport, on both axes
 *   3. it does not sit on the photograph
 *   4. a real press on empty ground closes the dialog
 *   5. a press on the picture itself does not
 *
 *   pnpm build && node scripts/check-avatar-lightbox-behaviour.mjs
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

const out = mkdtempSync(join(tmpdir(), "storelib-lightbox-behaviour-"))
execFileSync("npx", ["--no-install", "esbuild", join(root, "scripts/render-avatar-lightbox.tsx"),
  "--bundle", "--format=iife", "--platform=browser", "--jsx=automatic", "--log-level=error",
  `--outfile=${join(out, "probe.js")}`,
  '--banner:js=var process=globalThis.process||{env:{NODE_ENV:"production"},browser:true};globalThis.process=process;',
  '--define:process.env.NODE_ENV="production"',
  `--alias:@=${root}`, "--loader:.css=empty", "--loader:.svg=dataurl", "--loader:.png=dataurl"],
  { stdio: ["ignore", "ignore", "inherit"] })

/*
  A press, as the browser makes one. Radix dismisses on `pointerdown`, so a
  bare .click() would prove nothing about the thing being tested. The whole
  sequence goes to whatever is actually on top at that point, which is also
  how this finds out that the panel is swallowing the press.
*/
const PRESS = `function press(x, y) {
  var el = document.elementFromPoint(x, y)
  if (!el) return null
  var opts = { bubbles: true, cancelable: true, composed: true, clientX: x, clientY: y, button: 0, pointerId: 1, isPrimary: true }
  el.dispatchEvent(new PointerEvent("pointerdown", opts))
  el.dispatchEvent(new MouseEvent("mousedown", opts))
  el.dispatchEvent(new PointerEvent("pointerup", opts))
  el.dispatchEvent(new MouseEvent("mouseup", opts))
  el.dispatchEvent(new MouseEvent("click", opts))
  return el.getAttribute("data-slot") || el.tagName.toLowerCase()
}`

writeFileSync(join(out, "index.html"), `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style><style>body{margin:0}
/*
  NO MOTION IN HERE. The panel opens on zoom-in-95, which is a keyframe
  animation with fill-mode both: if the animation does not actually run, the
  element is pinned at its FROM state forever. In this page it does not run,
  so the panel sat at scale(0.95) permanently and measured 1140px wide inset
  30px from the left. A press at the left edge then missed it and this probe
  happily reported that pressing the ground works.
  This is a probe about layout and hit testing. Motion is checked elsewhere.
*/
*,*::before,*::after{animation:none!important;transition:none!important}</style></head><body><div id="app"></div><script src="probe.js"></script>
<script>
${PRESS}
var report = {}
var rect = function (el) { if (!el) return null; var r = el.getBoundingClientRect(); return { l: Math.round(r.left), t: Math.round(r.top), r: Math.round(r.right), b: Math.round(r.bottom), w: Math.round(r.width), h: Math.round(r.height) } }
var q = function (s) { return document.querySelector(s) }

setTimeout(function () {
  /* Open it the way a visitor does. */
  q("#trigger").closest("button").click()

  /*
    LONG ENOUGH FOR THE ZOOM TO FINISH. The panel opens on zoom-in-95, and
    a transformed element is hit-tested and measured at its TRANSFORMED box.
    Measured at 500ms the panel read as 1140px wide sitting 30px in from the
    left, so a press at the left edge missed it and this probe reported that
    pressing the ground works. It does not; the panel had not arrived yet.
  */
  setTimeout(function () {
    var panel = q('[data-slot="dialog-content"]')
    var overlay = q('[data-slot="dialog-overlay"]')
    var img = panel && panel.querySelector("img")
    var closeBtn = panel && panel.querySelector('button[aria-label="Close"]')

    report.opened = !!panel
    report.viewport = { w: document.documentElement.clientWidth, h: document.documentElement.clientHeight }
    report.innerWidth = window.innerWidth
    report.panel = rect(panel)
    report.overlay = rect(overlay)
    report.img = rect(img)
    report.close = rect(closeBtn)
    report.panelPointerEvents = panel ? getComputedStyle(panel).pointerEvents : null
    report.panelClass = panel ? panel.className : null
    var cs = panel ? getComputedStyle(panel) : null
    report.panelBox = cs ? { position: cs.position, left: cs.left, top: cs.top, width: cs.width, height: cs.height, transform: cs.transform, maxWidth: cs.maxWidth, display: cs.display } : null
    report.inlinePointerEvents = panel ? panel.style.pointerEvents : null
    report.cssRules = document.styleSheets.length

    /* 1. A press on the picture must NOT close it. */
    if (img) {
      var ir = img.getBoundingClientRect()
      report.pressedOnPicture = press(Math.round(ir.left + ir.width / 2), Math.round(ir.top + ir.height / 2))
    }
    setTimeout(function () {
      var afterPic = q('[data-slot="dialog-content"]')
      report.stillOpenAfterPressingPicture = !!afterPic && afterPic.getAttribute("data-state") !== "closed"

      /* 2. A press on empty ground must close it: far left, vertically centred. */
      report.pressedOnGround = press(8, Math.round(document.documentElement.clientHeight / 2))
      setTimeout(function () {
        /* Presence keeps a closing node mounted until its exit animation ends,
           so "gone from the DOM" is not the question. data-state is. */
        var afterGround = q('[data-slot="dialog-content"]')
        report.groundState = afterGround ? afterGround.getAttribute("data-state") : "unmounted"
        report.closedAfterPressingGround = !afterGround || afterGround.getAttribute("data-state") === "closed"
        var pre = document.createElement("pre"); pre.id = "result"; pre.textContent = JSON.stringify(report); document.body.append(pre)
      }, 400)
    }, 400)
  }, 1400)
}, 600)
</script></body></html>`)

const dom = execFileSync(CHROMIUM, ["--headless=new", "--no-sandbox", "--disable-gpu",
  "--window-size=1200,800", "--virtual-time-budget=20000", "--dump-dom", `file://${join(out, "index.html")}`],
  { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 32 * 1024 * 1024 })
const m = dom.match(/<pre id="result">([\s\S]*?)<\/pre>/)
if (!m) fail("The lightbox never reported. It probably did not open.")
const r = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&"))

const problems = []
console.log("")
if (!r.opened) fail("The dialog did not open, so nothing below was measured.")

const gutter = r.innerWidth - r.viewport.w
console.log(`  viewport ${r.viewport.w}x${r.viewport.h}, innerWidth ${r.innerWidth} (a ${gutter}px scrollbar)`)
console.log(`  overlay  ${JSON.stringify(r.overlay)}`)
console.log(`  panel    ${JSON.stringify(r.panel)}  pointer-events: ${r.panelPointerEvents}`)
console.log(`  picture  ${r.img.w}x${r.img.h} at ${r.img.l},${r.img.t}`)
console.log(`  close    ${JSON.stringify(r.close)}`)
console.log(`  press on the picture -> ${r.pressedOnPicture}, still open: ${r.stillOpenAfterPressingPicture}`)
console.log(`  press on the ground  -> ${r.pressedOnGround}, state after: ${r.groundState}`)
console.log(`  panel class   ${r.panelClass}`)
console.log(`  panel computed ${JSON.stringify(r.panelBox)}`)
console.log(`  inline pointer-events on the panel: ${JSON.stringify(r.inlinePointerEvents)}`)
console.log("")

/* 1. The panel is anchored where the overlay is. */
if (r.panel.r > r.overlay.r) {
  problems.push(`The panel's right edge is ${r.panel.r}, the overlay's is ${r.overlay.r}. The panel hangs ${r.panel.r - r.overlay.r}px into the scrollbar gutter, and anything pinned to its right edge goes with it.`)
}
/* 2. The close control is on screen, whole. */
if (r.close.r > r.viewport.w) problems.push(`The close control reaches ${r.close.r} on a ${r.viewport.w}px viewport, so ${r.close.r - r.viewport.w}px of it is cut off.`)
if (r.close.b > r.viewport.h) problems.push(`The close control reaches ${r.close.b} on a ${r.viewport.h}px viewport, so it is cut off at the bottom.`)
if (r.close.l < 0 || r.close.t < 0) problems.push(`The close control starts at ${r.close.l},${r.close.t}, which is off screen.`)
/* 3. And not on the photograph. */
const overlaps = !(r.close.r <= r.img.l || r.close.l >= r.img.r || r.close.b <= r.img.t || r.close.t >= r.img.b)
if (overlaps) problems.push(`The close control sits on the picture (${JSON.stringify(r.close)} over ${JSON.stringify(r.img)}).`)
/* 4 and 5. What a press does. */
if (!r.stillOpenAfterPressingPicture) problems.push("Pressing the picture itself closed the dialog. The picture is the thing being looked at.")
if (!r.closedAfterPressingGround) problems.push(`Pressing empty ground did not close the dialog. The press landed on <${r.pressedOnGround}>, which is the panel swallowing it.`)

if (problems.length) {
  console.error(`${problems.length} problem${problems.length > 1 ? "s" : ""}:\n`)
  problems.forEach((p, i) => console.error(`  ${i + 1}. ${p}`))
  console.error("")
  process.exit(1)
}
console.log("  The close control is in the corner and on screen, and the ground closes it.\n")
