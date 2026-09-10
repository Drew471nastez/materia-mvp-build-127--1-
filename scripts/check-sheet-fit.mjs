/**
 * ===========================================================================
 *  A CONTENT-SIZED SHEET MEASURES THE SAME THING AT ANY HEIGHT
 * ===========================================================================
 * The publish card is sized to its content. Two attempts at that measurement
 * got stuck, both the same way: the number was read from boxes whose size the
 * number itself decides. The sheet took the height it measured, that squeezed
 * the scroller inside it, the next measurement came back smaller, and the two
 * settled wherever the collapse ran out.
 *
 * "Add back whatever the scroller is currently clipping" was supposed to make
 * that converge upward. It does, but only while the scroller is the thing
 * being clipped. The moment the squeeze lands anywhere else — the wrapper cut
 * by the sheet's own `overflow: hidden`, a scroller handed no height by a flex
 * line with none to give — the correction is zero and EVERY height is
 * self-consistent. Any starting height is then a fixed point, including a bad
 * one, which is what shipped: a card at 29% of the screen with its URL row
 * under the buttons.
 *
 * The property that fixes it is not "converges" but "does not depend on the
 * answer". So this renders the sheet at four very different heights and asks
 * for the measurement at each. The new one must return the SAME number every
 * time. The old one is the control: it must not.
 *
 *   node scripts/check-sheet-fit.mjs
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

/** Heights to take the measurement at, including far too short and far too tall. */
const HEIGHTS = [180, 260, 420, 760]
/** The publish card's shape: a handle, a scrolling body, pinned actions. */
const CONTENT_BLOCKS = 4

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
*{box-sizing:border-box;margin:0}html,body{height:100%;overflow:hidden;font:14px system-ui}
.sheet{position:absolute;left:0;width:420px;display:flex;flex-direction:column;
  overflow:hidden;padding-bottom:20px;background:#1f1f1f;color:#fff}
.handle{flex-shrink:0;display:flex;justify-content:center;padding:10px 0 6px}
.handle i{display:block;height:4px;width:40px;border-radius:2px;background:#666}
/* The wrapper as it is when it fills the sheet, which is the shape both
   earlier attempts were measured in. */
.fit{display:flex;min-height:0;flex-direction:column;flex:1 1 auto}
.scroller{min-height:0;flex:1 1 0%;overflow-y:auto;padding:4px 20px 16px}
.actions{flex-shrink:0;padding:12px 20px;border-top:1px solid #333}
.block{height:76px;margin-bottom:14px;background:#333;border-radius:10px}
</style></head><body>
${HEIGHTS.map(
  (h, i) => `
<div class="sheet" id="sheet-${h}" style="height:${h}px;top:${i * 800}px">
  <div class="handle"><i></i></div>
  <div class="fit" data-fit>
    <div class="scroller" data-sheet-scroll>
      <div data-sheet-content>
        ${Array.from({ length: CONTENT_BLOCKS }, () => `<div class="block"></div>`).join("")}
      </div>
    </div>
    <div class="actions">Preview / Publish changes</div>
  </div>
</div>`,
).join("")}
<script>
/* The shipped measurement, transcribed. */
function naturalScrollHeight(scroller) {
  const inner = scroller.querySelector("[data-sheet-content]")
  if (!inner) return scroller.scrollHeight
  const cs = getComputedStyle(scroller)
  const padding = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0)
  return inner.getBoundingClientRect().height + padding
}
function measureNew(el, handle) {
  let wanted = 0
  for (const child of Array.from(el.children)) {
    let h = child.getBoundingClientRect().height
    const scroller = child.matches("[data-sheet-scroll]") ? child : child.querySelector("[data-sheet-scroll]")
    if (scroller) h += naturalScrollHeight(scroller) - scroller.clientHeight
    wanted += h
  }
  return Math.ceil(wanted + handle.getBoundingClientRect().height)
}
/* The one it replaces: the wrapper's own box, plus what is clipped. Both of
   those are boxes the sheet's height decides, which is the whole problem. */
function measureOld(el, handle) {
  let clipped = 0
  for (const node of el.querySelectorAll("[data-sheet-scroll]")) {
    clipped += Math.max(0, node.scrollHeight - node.clientHeight)
  }
  return Math.ceil(el.getBoundingClientRect().height + clipped + handle.getBoundingClientRect().height)
}
const out = { now: [], before: [] }
for (const h of [${HEIGHTS.join(",")}]) {
  const sheet = document.getElementById("sheet-" + h)
  const el = sheet.querySelector("[data-fit]")
  const handle = sheet.querySelector(".handle")
  out.now.push(measureNew(el, handle))
  out.before.push(measureOld(el, handle))
}
document.title = JSON.stringify(out)
</script></body></html>`

let broken = 0
const expect = (ok, what, got = "") => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${ok ? "" : `   ${got}`}`)
  if (!ok) broken++
}

const out = mkdtempSync(join(tmpdir(), "storelib-sheet-"))
try {
  const page = join(out, "sheet.html")
  writeFileSync(page, html)
  const dom = execFileSync(
    CHROMIUM,
    ["--headless=new", "--no-sandbox", "--disable-gpu", "--window-size=460,3400",
     "--virtual-time-budget=1500", "--dump-dom", `file://${page}`],
    { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
  )
  const title = dom.match(/<title>(.*?)<\/title>/)
  if (!title) fail("the fixture never reported its measurements")
  const m = JSON.parse(title[1])

  console.log("\na content-sized sheet measures the same thing at any height\n")

  const same = new Set(m.now)
  expect(same.size === 1, "the measurement is the same at every sheet height, so there is no loop to settle",
    `got ${m.now.join(", ")} at ${HEIGHTS.join(", ")}px`)

  // And it is the real height: four 76px blocks with 14px under each, plus
  // the scroller's padding, the actions row and the handle.
  const answer = m.now[0]
  expect(answer > 420, "and it is the content's real height, not a collapse", `${answer}px`)

  // The control. If the old formula also came out constant, this fixture is
  // not reproducing the shape that got stuck and the assertion above is empty.
  expect(new Set(m.before).size > 1,
    "the old formula gave a different answer at every height, so this is a real measurement",
    `it returned ${m.before[0]} at all of them`)

  // The specific failure: a height the old formula simply agrees with, and
  // therefore never leaves.
  const stuck = HEIGHTS.filter((h, i) => Math.abs(m.before[i] - h) <= 22)
  expect(stuck.length > 0, "and it had fixed points: heights it measures as already correct",
    "no starting height was self-consistent")

  console.log(`\n  height   ${HEIGHTS.map((h) => String(h).padStart(5)).join("")}`)
  console.log(`  now      ${m.now.map((v) => String(v).padStart(5)).join("")}`)
  console.log(`  before   ${m.before.map((v) => String(v).padStart(5)).join("")}`)
  if (stuck.length) console.log(`\n  the old one settles at ${stuck.join(", ")}px and stays there\n`)
} finally {
  rmSync(out, { recursive: true, force: true })
}

process.exit(broken ? 1 : 0)
