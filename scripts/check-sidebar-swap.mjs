/**
 * ===========================================================================
 *  THE SCROLLBAR THAT FLASHES WHEN A SIDEBAR PANEL CHANGES
 * ===========================================================================
 * "Click a section in the sidebar, it loads the settings, and a second
 * scrollbar blinks for a second even though one is already there."
 *
 * A scrollbar appears when scrollHeight exceeds clientHeight, and it lasts as
 * long as that is true. Reading it once, after the animation, reports a
 * healthy sidebar; the whole of this bug lives in the 180ms in between. So
 * this samples EVERY FRAME across the swap and reports the worst moment, on
 * the scroller and on every descendant that could grow one of its own.
 *
 * It needs a browser that paints, or the animation never runs: see
 * drivePage in editor-probe-harness.mjs.
 *
 *   node scripts/check-sidebar-swap.mjs
 */
import { drivePage } from "./editor-probe-harness.mjs"

/** No regex literals in here: a backslash in a template literal is eaten. */
const DRIVE = `
(async function () {
  var steps = []
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms) }) }
  function frame() { return new Promise(function (r) { requestAnimationFrame(function () { r() }) }) }
  function click(el) {
    if (!el) return false
    el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }))
    el.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }))
    el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }))
    return true
  }

  function scroller() { return document.querySelector("[data-wb-sidebar-scroll]") }

  /**
   * Everything inside the sidebar that could show a bar of its own, so a
   * second one is told apart from the one that is meant to be there.
   */
  function overflowing(root) {
    if (!root) return []
    var out = []
    var all = root.querySelectorAll("*")
    for (var i = 0; i < all.length; i++) {
      var el = all[i]
      var over = el.scrollHeight - el.clientHeight
      if (over <= 1) continue
      var cs = getComputedStyle(el)
      if (cs.overflowY !== "auto" && cs.overflowY !== "scroll") continue
      out.push({ tag: el.tagName.toLowerCase(), cls: String(el.className || "").slice(0, 60), over: Math.round(over) })
    }
    return out
  }

  function sample() {
    var s = scroller()
    if (!s) return null
    return {
      over: Math.round(s.scrollHeight - s.clientHeight),
      clientHeight: Math.round(s.clientHeight),
      inner: overflowing(s).length,
      innerWorst: overflowing(s)[0] || null,
    }
  }

  /** Sample every frame for a while, and keep the worst reading. */
  async function watch(ms) {
    var readings = []
    var until = Date.now() + ms
    while (Date.now() < until) {
      var r = sample()
      if (r) readings.push(r)
      await frame()
    }
    return readings
  }

  async function go() {
    for (var t = 0; t < 150; t++) {
      if (document.querySelector("[data-wb-sidebar-scroll]")) break
      await sleep(200)
    }
    var s = scroller()
    steps.push({ label: "the sidebar scroller", found: !!s })
    if (!s) return

    /**
     * A SIDEBAR THAT DOES NOT ALREADY SCROLL CANNOT SHOW THIS BUG, and would
     * report it fixed whatever the code did. The reported case has a bar
     * already, so the list of sections is made the starting point and the
     * measurement is only trusted when the baseline actually overflows.
     */
    var atRest = sample()
    steps.push({ label: "at rest", sample: atRest })

    /** The rows that select a section, in the sidebar and nowhere else. */
    var rows = s.querySelectorAll("[data-section-row], [data-wb-section-row], button")
    var target = null
    for (var i = 0; i < rows.length; i++) {
      var txt = (rows[i].textContent || "").trim()
      if (!txt || txt.length > 40) continue
      if (/^(Add section|Sections|Theme settings|Pages)$/.test(txt)) continue
      target = rows[i]
      break
    }
    steps.push({ label: "a section row to open", found: !!target, text: target ? (target.textContent || "").trim().slice(0, 30) : "" })
    if (!target) return

    /** Click, then watch the swap frame by frame. */
    click(target)
    var readings = await watch(700)
    var worstOver = 0
    var worstInner = 0
    var innerExample = null
    for (var j = 0; j < readings.length; j++) {
      if (readings[j].over > worstOver) worstOver = readings[j].over
      if (readings[j].inner > worstInner) { worstInner = readings[j].inner; innerExample = readings[j].innerWorst }
    }
    await sleep(500)
    steps.push({
      label: "through the swap",
      frames: readings.length,
      worstOver: worstOver,
      worstInner: worstInner,
      innerExample: innerExample,
      settled: sample(),
    })
  }

  try { await go() } catch (e) { steps.push({ label: "threw", message: String(e && e.message) }) }
  return steps
})()`

let failures = 0
console.log(`\n══ The sidebar, through a panel swap ══`)
const steps = await drivePage({ width: 1280, height: 900, drive: DRIVE })
let swap = null
let rest = null
for (const s of steps) {
  if (s.label === "at rest") rest = s.sample
  else if (s.label === "through the swap") swap = s
  else console.log(`  ${JSON.stringify(s)}`)
}

if (!swap || !rest) {
  console.log("  ✗   the sidebar never opened a section, so nothing was measured")
  process.exit(1)
}

console.log(`\n  at rest: the scroller is ${rest.clientHeight}px tall and overflows by ${rest.over}px`)
console.log(`  through the swap: ${swap.frames} frames sampled`)
console.log(`  the worst overflow at any frame: ${swap.worstOver}px`)
console.log(`  scrollable descendants at the worst frame: ${swap.worstInner}${swap.innerExample ? ` (${swap.innerExample.cls} by ${swap.innerExample.over}px)` : ""}`)
console.log(`  after it settles: overflow ${swap.settled ? swap.settled.over : "?"}px, descendants ${swap.settled ? swap.settled.inner : "?"}`)

const ok = (name, pass, detail) => {
  if (!pass) failures++
  console.log(`  ${pass ? "ok  " : "✗   "} ${name}${detail ? `  ${detail}` : ""}`)
}
console.log("")

/**
 * THE BUG, AS A NUMBER. The animation translates the incoming panel down,
 * and the panel is as tall as the scroller, so for the length of the
 * animation the scroller has something below its bottom edge and grows a bar
 * for it. What it settles to is what it should have been the whole time.
 */
ok(
  "no overflow appears during the swap that is not there when it settles",
  swap.worstOver <= (swap.settled ? swap.settled.over : 0) + 1,
  `worst ${swap.worstOver}px, settled ${swap.settled ? swap.settled.over : "?"}px`,
)
ok(
  "and no second scrollable box appears inside the sidebar",
  swap.worstInner <= (swap.settled ? swap.settled.inner : 0),
  `worst ${swap.worstInner}, settled ${swap.settled ? swap.settled.inner : "?"}`,
)
ok("the swap was actually watched", swap.frames > 10, `${swap.frames} frames`)

console.log(failures ? `\n  ${failures} to fix\n` : `\n  The sidebar keeps one scrollbar through the swap.\n`)
process.exit(failures ? 1 : 0)
