/**
 * ===========================================================================
 *  SECTIONS, PAGES AND THEME ON THE DESKTOP, MEASURED
 * ===========================================================================
 * The real editor (scripts/editor-probe-harness.mjs) at 1280x900, switching
 * the sidebar's three tabs the way a person does, read every frame:
 *
 *   ANSWER      the tab you press is the selected tab in the same frame as
 *               the press, before its panel has been drawn
 *   INDICATOR   the white indicator slides to the tab (at least one frame in
 *               between) and settles centred under it
 *   NO FLASH    no frame of the switch overflows the sidebar more than it
 *               does once settled: no scrollbar appears and goes
 *   TOP         a tab's panel starts at its top, whatever the last one was
 *               scrolled to
 *   PAGES       Theme, then Pages, then a page lands on that page's Sections,
 *               not back on the Theme settings
 *   THEME       a settings group that was left open is shown open when you
 *               come back, without playing its entrance again
 *   CUT         opening a section is still a cut: nothing animates on the
 *               panel (the owner asked for that and it stays)
 *
 *   PROBE_CSS=source node scripts/check-sidebar-tabs.mjs
 */
import { drivePage } from "./editor-probe-harness.mjs"

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
  function bar() { return document.querySelector("[data-wb-sidebar-tabs] [role=tablist]") }
  function tab(name) {
    var all = document.querySelectorAll("[data-wb-sidebar-tabs] [role=tab]")
    for (var i = 0; i < all.length; i++) if ((all[i].textContent || "").trim() === name) return all[i]
    return null
  }
  function scroller() { return document.querySelector("[data-wb-sidebar-scroll]") }
  function panel() { var s = scroller(); return s ? s.firstElementChild : null }
  function over() { var s = scroller(); return s ? Math.round(s.scrollHeight - s.clientHeight) : 0 }
  function sidebarText() { var s = scroller(); return s ? s.textContent || "" : "" }
  function indicatorDx(name) {
    var ind = document.querySelector("[data-wb-tab-indicator]")
    var t = tab(name)
    if (!ind || !t) return null
    var a = ind.getBoundingClientRect(), b = t.getBoundingClientRect()
    return Math.round(((a.left + a.width / 2) - (b.left + b.width / 2)) * 10) / 10
  }
  function indicatorX() { var ind = document.querySelector("[data-wb-tab-indicator]"); return ind ? ind.getBoundingClientRect().left : null }

  async function switchTo(name, ms) {
    var fromX = indicatorX()
    var settledOver = null
    click(tab(name))
    /* React applies a click's updates in a microtask; the first animation
       frame is before the first paint after the press, which is what a
       person sees. */
    await frame()
    var answered = tab(name) && tab(name).getAttribute("aria-selected") === "true"
    var xs = [], worst = 0
    var until = Date.now() + ms
    while (Date.now() < until) {
      await frame()
      xs.push(indicatorX())
      var o = over()
      if (o > worst) worst = o
    }
    await sleep(200)
    settledOver = over()
    var toX = indicatorX()
    var between = xs.some(function (x) { return x !== null && Math.abs(x - fromX) > 1 && Math.abs(x - toX) > 1 })
    return { answered: answered, slid: between || Math.abs(toX - fromX) < 1, dx: indicatorDx(name), worstOver: worst, settledOver: settledOver, frames: xs.length }
  }

  async function go() {
    for (var t = 0; t < 150; t++) { if (bar()) break; await sleep(200) }
    steps.push({ label: "tabs", found: !!bar() })
    if (!bar()) return

    steps.push({ label: "to Theme", r: await switchTo("Theme", 600) })
    steps.push({ label: "theme panel", general: sidebarText().indexOf("General Settings") >= 0 })

    /* Open a group, so Theme is tall enough to scroll and has something open. */
    var groups = scroller().querySelectorAll("button")
    var group = null
    for (var i = 0; i < groups.length; i++) { var tx = (groups[i].textContent || "").trim(); if (tx === "Typography" || tx === "Buttons") { group = groups[i]; break } }
    click(group)
    await sleep(350)
    var open = scroller().querySelector(".space-y-4")
    steps.push({ label: "group opened", found: !!group, animated: !!open && String(open.className).indexOf("animate-in") >= 0 })
    /* The panels scroll inside their own list, so that is what is scrolled. */
    var list = scroller().querySelector("[data-sheet-scroll]") || scroller()
    list.scrollTop = 400
    var scrolled = list.scrollTop

    steps.push({ label: "to Sections", r: await switchTo("Sections", 600) })
    var nowList = scroller().querySelector("[data-sheet-scroll]") || scroller()
    steps.push({ label: "top", before: scrolled, after: nowList.scrollTop, outer: scroller().scrollTop })

    steps.push({ label: "back to Theme", r: await switchTo("Theme", 600) })
    var reopened = scroller().querySelector(".space-y-4")
    steps.push({ label: "group still open", open: !!reopened, replayed: !!reopened && String(reopened.className).indexOf("animate-in") >= 0 })

    /* Theme, then Pages, then a page. */
    steps.push({ label: "to Pages", r: await switchTo("Pages", 600) })
    var pageBtn = null
    var bs = scroller().querySelectorAll("button")
    for (var k = 0; k < bs.length; k++) { if ((bs[k].textContent || "").trim().indexOf("Home") === 0) { pageBtn = bs[k]; break } }
    click(pageBtn)
    await sleep(700)
    steps.push({
      label: "picked a page",
      found: !!pageBtn,
      sectionsSelected: tab("Sections") && tab("Sections").getAttribute("aria-selected") === "true",
      themeSelected: tab("Theme") && tab("Theme").getAttribute("aria-selected") === "true",
      general: sidebarText().indexOf("General Settings") >= 0,
    })

    /* Opening a section is still a cut. */
    /* A section row is the clickable div of SidebarSectionRow, not a button. */
    var rows = scroller().querySelectorAll("div.group.cursor-pointer")
    var row = null
    for (var j = 0; j < rows.length; j++) {
      var t2 = (rows[j].textContent || "").trim()
      if (!t2 || t2.length > 60) continue
      row = rows[j]; break
    }
    click(row)
    var anims = 0
    for (var f = 0; f < 10; f++) { await frame(); var pnl = panel(); if (pnl && pnl.getAnimations) anims = Math.max(anims, pnl.getAnimations().length) }
    steps.push({ label: "section opened", found: !!row, text: row ? (row.textContent || "").trim().slice(0, 30) : "", panelAnimations: anims })
  }

  try { await go() } catch (e) { steps.push({ label: "threw", message: String(e && e.message) }) }
  return steps
})()`

let failures = 0
const ok = (name, pass, detail) => {
  if (!pass) failures++
  console.log(`  ${pass ? "ok  " : "✗   "} ${name}${detail === undefined ? "" : `  ${typeof detail === "string" ? detail : JSON.stringify(detail)}`}`)
}

console.log("\n══ Sections, Pages and Theme, switched on a desktop ══\n")
const steps = await drivePage({ width: 1280, height: 900, drive: DRIVE })
const at = (label) => steps.find((s) => s.label === label)
const threw = at("threw")
if (threw) {
  console.log(`  ✗   the drive threw: ${threw.message}`)
  process.exit(1)
}
ok("the tabs are there", at("tabs")?.found)

for (const [label, name] of [["to Theme", "Theme"], ["to Sections", "Sections"], ["back to Theme", "Theme"], ["to Pages", "Pages"]]) {
  const r = at(label)?.r
  if (!r) { ok(`${label}: switched`, false); continue }
  ok(`${label}: the tab answers on the press`, r.answered)
  ok(`${label}: the indicator slides there`, r.slid, `${r.frames} frames`)
  ok(`${label}: and settles centred under ${name}`, r.dx !== null && Math.abs(r.dx) <= 1, `${r.dx}px`)
  ok(`${label}: no scrollbar flashes`, r.worstOver <= r.settledOver + 1, `worst ${r.worstOver}px, settled ${r.settledOver}px`)
}
ok("Theme shows the theme settings", at("theme panel")?.general)
ok("a group opens with its entrance", at("group opened")?.found && at("group opened")?.animated, at("group opened"))
const top = at("top")
ok("a tab's panel starts at its top (and the one left was really scrolled)", top && top.before > 0 && top.after === 0 && top.outer === 0, top)
const again = at("group still open")
ok("coming back to Theme, the open group is still open", again?.open, again)
ok("  and does not play its entrance again", again && !again.replayed, again)
const picked = at("picked a page")
ok("Theme, Pages, then a page lands on that page's Sections", picked?.found && picked.sectionsSelected && !picked.themeSelected && !picked.general, picked)
const cut = at("section opened")
ok("opening a section is still a cut: nothing animates on the panel", cut?.found && cut.panelAnimations === 0, cut)

if (failures) {
  console.log(`\n${failures} check(s) failed\n`)
  process.exit(1)
}
console.log("\nThe three tabs switch as measured.\n")
