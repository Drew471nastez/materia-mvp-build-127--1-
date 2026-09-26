/**
 * ===========================================================================
 *  THE BUMP WHEN A PAGE CHANGES
 * ===========================================================================
 * "When I click a link to reach another page there's a bump, a flash."
 *
 * A flash is a FRAME, so a probe that reads the canvas once before and once
 * after sees nothing wrong: both ends are correct and the fault is between
 * them. This samples every frame across a switch and reports the frames that
 * disagree with both ends.
 *
 * WHAT IT IS LOOKING FOR, named, because "a flash" is not measurable and
 * these are:
 *
 *   MIXED    the page's NAME has changed but its CONTENT has not, which is
 *            one page's template drawn over another page's sections. This is
 *            the bug that was found: `setCurrentPage` ran before the fetch,
 *            so every switch rendered a page that never existed for as long
 *            as the network took.
 *   EMPTY    a frame where the canvas has no sections at all, between one
 *            page's and the next's.
 *   JUMP     the scroll position moving after the content has arrived, which
 *            is the content sliding under the eye rather than a navigation.
 *
 * It needs a browser that paints, or there are no frames to sample:
 * see drivePage in editor-probe-harness.mjs.
 *
 *   node scripts/check-page-switch.mjs
 */
import { drivePage } from "./editor-probe-harness.mjs"

/**
 * A NETWORK THAT TAKES TIME, because the bug only exists while one is in
 * flight. The probe has no server, so a real switch would fail instantly and
 * the window this is measuring would never open. The sections endpoint is
 * answered here, slowly, with a DIFFERENT page for a different key, which is
 * the whole of what the editor needs to complete a switch.
 */
const FETCH_STUB = `
<script>
/* The editor probe (scripts/render-editor-probe.tsx) answers every /api/ call
   itself, so a fetch stub here was never reached once it did: each page came
   back as the same page and the switch changed nothing. It is told instead:
   each page's own sections, answered 450ms late. */
window.PROBE_PAGES = {
  home: ["hero_centered", "features_grid", "footer"],
  about: ["about_image", "about_timeline", "footer"],
  contact: ["about_image", "about_timeline", "footer"],
  products: ["about_image", "about_timeline", "footer"],
}
window.PROBE_PAGE_DELAY_MS = 450
</script>`


/** No regex literals in here: a backslash in a template literal is eaten. */
const DRIVE = `
(async function () {
  var steps = []
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms) }) }
  function frame() { return new Promise(function (r) { requestAnimationFrame(function () { r() }) }) }

  function canvas() { return document.getElementById("wb-preview-root") }

  /**
   * One frame of the canvas, as the few numbers that can disagree.
   * "data-section-type" is on every section wrapper, so the list of them IS
   * the page's content without needing to know what any of it means.
   */
  /** What the switcher says the page is, which is the editor's own belief. */
  function pageLabel() {
    var buttons = document.querySelectorAll("button")
    for (var i = 0; i < buttons.length; i++) {
      var t = (buttons[i].textContent || "").trim()
      if (/ page$/.test(t) && t.length < 40) return t
    }
    return ""
  }

  /**
   * THE ONE THING A REMOUNT CANNOT HIDE.
   *
   * React replacing a keyed subtree removes the old element and inserts a
   * new one. The node is not the same object, and no amount of matching
   * section lists would show that: the content can be identical and the
   * page still visibly falls into place, because the DOM was rebuilt and
   * the entrance animation ran again.
   *
   * So the element is stamped on the first sample and checked on every one
   * after. A stamp that is missing is a node that was not there before.
   */
  var STAMP = "__probe_seen"
  function stampedFresh(el) {
    if (!el) return false
    if (el[STAMP]) return false
    el[STAMP] = true
    return true
  }

  function sample() {
    var root = canvas()
    if (!root) return null
    var boxes = root.querySelectorAll("[data-section-box]")
    var types = []
    for (var i = 0; i < boxes.length; i++) types.push(boxes[i].getAttribute("data-section-type") || "?")
    var shell = document.querySelector(".wb-canvas-in")
    return {
      label: pageLabel(),
      /** True on the frame a new canvas element appeared. */
      remounted: stampedFresh(shell),
      types: types.join(","),
      count: types.length,
      scrollTop: Math.round(root.scrollTop),
      height: Math.round(root.scrollHeight),
    }
  }

  async function watch(ms) {
    var out = []
    var until = Date.now() + ms
    while (Date.now() < until) {
      var s = sample()
      if (s) out.push(s)
      await frame()
    }
    return out
  }

  async function go() {
    for (var t = 0; t < 150; t++) {
      if (canvas()) break
      await sleep(200)
    }
    steps.push({ label: "the canvas", found: !!canvas() })
    if (!canvas()) return

    await sleep(1500)
    var before = sample()
    steps.push({ label: "before", sample: before })

    /**
     * Switch the page the way a person does: through the switcher, which is
     * the same handlePageChange every link ends up calling.
     */
    var opener = null
    var buttons = document.querySelectorAll("button")
    for (var i = 0; i < buttons.length; i++) {
      var txt = (buttons[i].textContent || "").trim()
      if (/^(Home page|Home)$/.test(txt)) { opener = buttons[i]; break }
    }
    steps.push({ label: "the page switcher", found: !!opener, text: opener ? (opener.textContent || "").trim() : "" })
    if (!opener) return
    opener.click()
    await sleep(500)

    /* A page's row says which page it is (components/website-builder/page-switcher.tsx),
       so the Add section library's own "About" and "Products" category
       buttons, mounted behind its closed dialog, cannot be taken for one. */
    var target = document.querySelector("[data-page-row='about']") || document.querySelector("[data-page-row='contact']")
    var rows = document.querySelectorAll("button, [role=button]")
    for (var j = 0; !target && j < rows.length; j++) {
      var t2 = (rows[j].textContent || "").trim()
      /* A page's row is its path. The slash is required since the Add section
         library stays mounted behind its closed dialog (acc43f33), whose
         "Products" and "About" category buttons came first without it. */
      if (/^\\/(about|contact|product)/i.test(t2) && t2.length < 30) { target = rows[j]; break }
    }
    steps.push({ label: "another page to open", found: !!target, text: target ? (target.textContent || "").trim() : "" })
    if (!target) return

    target.click()
    var frames = await watch(2500)
    await sleep(800)
    var after = sample()

    steps.push({ label: "through the switch", frames: frames, before: before, after: after })
  }

  try { await go() } catch (e) { steps.push({ label: "threw", message: String(e && e.message) }) }
  return steps
})()`

let failures = 0
console.log(`\n══ The canvas, through a page change ══`)
const steps = await drivePage({ width: 1440, height: 900, body: FETCH_STUB, drive: DRIVE })

let run = null
for (const s of steps) {
  if (s.label === "through the switch") run = s
  else console.log(`  ${JSON.stringify(s).slice(0, 200)}`)
}

if (!run) {
  console.log("\n  ✗   the switch never happened, so nothing was measured\n")
  process.exit(1)
}

const { frames, before, after } = run
console.log(`\n  before: ${before.count} sections (${before.types.slice(0, 60)})`)
console.log(`  after:  ${after.count} sections (${after.types.slice(0, 60)})`)
console.log(`  the switcher said "${before.label}" then "${after.label}"`)
console.log(`  ${frames.length} frames sampled across the switch`)

/**
 * A frame that matches neither end is a frame of a page that does not exist.
 * The content settling from one list to the other is the switch itself; what
 * is wrong is a list that is NEITHER, or none at all.
 */
const empty = frames.filter((f) => f.count === 0).length
const neither = frames.filter((f) => f.types !== before.types && f.types !== after.types)
/**
 * THE MIXED FRAME. The editor's own name for the page has moved on while the
 * canvas still holds the last one's sections: one page's template over
 * another page's content, which is a page that never existed. This is what
 * `setCurrentPage` running before the fetch produced, for as long as the
 * network took.
 */
const mixed = frames.filter((f) => f.label === after.label && f.types === before.types && before.types !== after.types)
const settled = frames.slice(Math.max(0, frames.length - 12))
const drifted = settled.some((f) => f.scrollTop !== settled[settled.length - 1].scrollTop)

const ok = (name, pass, detail) => {
  if (!pass) failures++
  console.log(`  ${pass ? "ok  " : "✗   "} ${name}${detail ? `  ${detail}` : ""}`)
}
console.log("")
ok("the switch actually changed the page", before.types !== after.types || before.count !== after.count, `${before.count} → ${after.count}`)
ok("no frame shows an empty canvas", empty === 0, `${empty} empty frames`)
ok(
  "no frame shows a page that is neither the one you left nor the one you opened",
  neither.length === 0,
  neither.length ? `${neither.length} frames, e.g. ${neither[0].types.slice(0, 60)}` : "",
)
ok(
  "the page's name never moves ahead of its content",
  mixed.length === 0,
  mixed.length ? `${mixed.length} frames showing "${after.label}" with the previous page's sections` : "",
)
/**
 * The canvas being REBUILT is the flash, whatever the section lists say: a
 * frame with nothing in it, then a 360ms rise-in of the whole page. This is
 * measurable without a server, which is what makes it the check that counts
 * here.
 */
const remounts = frames.filter((f) => f.remounted).length
ok(
  "the canvas is not rebuilt when the page changes",
  remounts === 0,
  remounts ? `${remounts} remounts during the switch` : "",
)
ok("and the scroll is still once it has arrived", !drifted, drifted ? "it moved after the content landed" : "")

console.log(failures ? `\n  ${failures} to fix\n` : `\n  One page goes straight to the next.\n`)
process.exit(failures ? 1 : 0)
