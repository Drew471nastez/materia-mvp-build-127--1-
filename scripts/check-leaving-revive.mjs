/**
 * ===========================================================================
 *  A BLOCKER THAT OUTLIVES ITS REASON IS A FROZEN EDITOR
 * ===========================================================================
 * Pressing Back puts two things over the builder: `.wb-editor-leaving`, which
 * is `pointer-events: none` on the whole editor, and `.wb-leaving`, a fixed
 * scrim at z-index 300 with no pointer-events rule at all. Both are right for
 * the second between the press and the next page arriving.
 *
 * `leaving` was set and never cleared. The only thing that ever un-set it was
 * the component being destroyed — fine exactly as long as the navigation
 * happens AND this editor is thrown away, and neither is guaranteed. Back out
 * of the pushed page and the browser can restore this one from its
 * back/forward cache with every piece of state as it was; a push that is
 * cancelled or refused leaves the editor under its own blocker with nothing
 * to lift it. Either way the editor is alive, looks nearly normal, and takes
 * no input: the canvas will not scroll and nothing in it can be pressed.
 *
 * So this builds a canvas that scrolls, puts the real scrim over it, and asks
 * the two questions a finger asks:
 *
 *   REACH    what does `elementFromPoint` find in the middle of the canvas?
 *            The canvas, or something on top of it?
 *   SCROLL   does a wheel over that point move the canvas?
 *
 * With the scrim up both must fail — that is the freeze, and it is the
 * control. With it lifted both must pass. And `.wb-editor-leaving` is checked
 * the same way, since it blocks on its own even with no scrim.
 *
 *   node scripts/check-leaving-revive.mjs
 */
import { execFileSync } from "node:child_process"
import { mkdtempSync, writeFileSync, rmSync, existsSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const fail = (m) => {
  console.error(m)
  process.exit(1)
}
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}. Set CHROMIUM=/path/to/chromium.`)

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
*{box-sizing:border-box;margin:0}
html,body{height:100%;overflow:hidden;font:14px system-ui}
.editor{position:fixed;inset:0;display:flex;flex-direction:column;background:#eef1f5}
.bar{height:44px;flex:none;background:#171717}
.canvas{flex:1;min-height:0;overflow-y:auto;background:#fff}
.page{height:3000px;background:linear-gradient(#fff,#dbe4fb)}

/* the two blockers, exactly as they ship */
.editor.leaving{transform:scale(.985);transform-origin:50% 42%;pointer-events:none}
.scrim{position:fixed;inset:0;z-index:300;display:flex;align-items:center;justify-content:center;
  background:rgba(10,10,12,.28)}
</style></head><body>
<div class="editor" id="editor">
  <div class="bar"></div>
  <div class="canvas" id="canvas"><div class="page"></div></div>
</div>
<div class="scrim" id="scrim"></div>
<script>
const editor = document.getElementById("editor")
const scrim = document.getElementById("scrim")
const canvas = document.getElementById("canvas")
const midX = Math.round(window.innerWidth / 2)
const midY = Math.round(window.innerHeight / 2)

function probe() {
  canvas.scrollTop = 0
  const hit = document.elementFromPoint(midX, midY)
  const inCanvas = !!hit && (hit === canvas || canvas.contains(hit))
  // A wheel is delivered to whatever is under the pointer, the same as a
  // finger: if something is over the canvas, the canvas does not get it.
  const target = hit || document.body
  target.dispatchEvent(new WheelEvent("wheel", {
    deltaY: 400, bubbles: true, cancelable: true, clientX: midX, clientY: midY,
  }))
  // The wheel is synthetic, so it does not scroll on its own; what is being
  // measured is WHO it reached. Scroll the element it reached, if that is the
  // canvas, and see whether the canvas moved.
  if (inCanvas) canvas.scrollTop += 400
  return { reached: hit ? hit.id || hit.className || hit.tagName : "nothing", inCanvas, moved: canvas.scrollTop > 0 }
}

const out = {}
/* leaving, with the scrim: what a stuck editor is */
editor.classList.add("leaving")
out.stuck = probe()
/* the scrim gone but the class still on: the second blocker, alone */
scrim.remove()
out.classOnly = probe()
/* revived */
editor.classList.remove("leaving")
out.revived = probe()
document.title = JSON.stringify(out)
</script></body></html>`

let broken = 0
const expect = (ok, what, got = "") => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${ok ? "" : `   ${got}`}`)
  if (!ok) broken++
}

const out = mkdtempSync(join(tmpdir(), "storelib-revive-"))
try {
  const page = join(out, "revive.html")
  writeFileSync(page, html)
  const dom = execFileSync(
    CHROMIUM,
    ["--headless=new", "--no-sandbox", "--disable-gpu", "--window-size=900,700",
     "--virtual-time-budget=1500", "--dump-dom", `file://${page}`],
    { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
  )
  const t = dom.match(/<title>(.*?)<\/title>/)
  if (!t) fail("the fixture never reported its measurements")
  const m = JSON.parse(t[1])

  console.log("\na blocker that outlives its reason is a frozen editor\n")

  // The controls first: this is only worth fixing if it really does freeze.
  expect(!m.stuck.inCanvas && !m.stuck.moved,
    "with the scrim up a touch in the middle of the canvas never reaches it",
    `it reached ${m.stuck.reached} and the canvas ${m.stuck.moved ? "still scrolled" : "did not move"}`)
  expect(!m.classOnly.inCanvas && !m.classOnly.moved,
    "and `pointer-events: none` on the editor blocks it on its own, with no scrim at all",
    `it reached ${m.classOnly.reached}`)

  // And the answer.
  expect(m.revived.inCanvas, "with both lifted the canvas is what a touch lands on",
    `it reached ${m.revived.reached}`)
  expect(m.revived.moved, "and it scrolls", "the canvas did not move")

  console.log(`\n  stuck      touch reaches ${m.stuck.reached}, canvas ${m.stuck.moved ? "scrolled" : "frozen"}`)
  console.log(`  class only touch reaches ${m.classOnly.reached}, canvas ${m.classOnly.moved ? "scrolled" : "frozen"}`)
  console.log(`  revived    touch reaches ${m.revived.reached}, canvas ${m.revived.moved ? "scrolled" : "frozen"}\n`)
} finally {
  rmSync(out, { recursive: true, force: true })
}

process.exit(broken ? 1 : 0)
