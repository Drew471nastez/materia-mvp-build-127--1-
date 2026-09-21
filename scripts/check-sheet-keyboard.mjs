/**
 * ===========================================================================
 *  A SHEET WITH A FIELD IN IT, WITH THE KEYBOARD UP
 * ===========================================================================
 * Reported from the one-page editor: open a sheet to type a social link and
 * the keyboard covers the field. You cannot see what you are writing.
 *
 * WHAT THIS CAN AND CANNOT MEASURE. A headless browser has no software
 * keyboard, and visualViewport cannot be faked from inside the page — so the
 * keyboard is represented the only honest way, by setting the two custom
 * properties ViewportVars publishes when a real one opens. That is exactly
 * the seam that was broken: the numbers were being published and no sheet was
 * reading them. Whether the numbers themselves are right is arithmetic, and
 * `keyboardInset` is unit-tested in tests/keyboard-safe-sheet.test.ts.
 *
 * It builds the sheet from the same helper every sheet in the editor now uses
 * — including the `!bottom-0` class they all carried, because an !important
 * class beats an inline style and that is the trap this is guarding.
 *
 *   node scripts/check-sheet-keyboard.mjs
 */
import { execFileSync } from "node:child_process"
import { existsSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)

const SCREEN = 844
const KEYBOARD = 336

/* The geometry under test, copied from lib/ui/keyboard-safe-sheet.ts. The
   test file asserts these two strings are the ones the helper returns, so
   this cannot drift away from the product. */
const BOTTOM = "var(--kb-inset, 0px)"
const MAX_H = "calc(var(--vv-h, 100dvh) * 0.75)"
/* And the one-page editor's PANEL, pinned at both ends, from
   bottomAboveKeyboard(). The fields typed straight into the panel live in a
   scroller that fills it, and KeyboardGuard centres a focused field in its
   scroller: a scroller that still reaches under the keyboard centres the
   field behind the keys. The test file pins this string too. */
const PANEL_BOTTOM = "var(--kb-inset, 0px)"
const HEADER = 68
/* The floor used when the platform reports no keyboard at all, and the real
   keyboard it has to clear: 44.5% of the screen, measured off the reported
   screenshot (an iPhone 16 Pro, 389pt of keyboard and accessory bar on 874).
   The test file asserts this fraction is the one the helper exports. */
const FLOOR_FRACTION = 0.5
const REAL_KEYBOARD_FRACTION = 0.445

const out = mkdtempSync(join(tmpdir(), "storelib-kbsheet-"))
writeFileSync(join(out, "index.html"), `<!doctype html><html><head><meta charset="utf-8">
<style>
  html, body { margin: 0; height: 100%; }
  body { background: #eee; }
  /* The class every one of these sheets carried. !important beats an inline
     style, so with this present the fix cannot work — which is the point. */
  .pinned-important { bottom: 0 !important; }
  .sheet {
    position: fixed; left: 0; right: 0; top: auto;
    background: #fff; display: flex; flex-direction: column;
    border-radius: 24px 24px 0 0; overflow: hidden;
  }
  .field { margin: 16px; height: 44px; background: #f1f1f4; border-radius: 12px; }
  .filler { height: 500px; }
  /* The editor's panel: fixed from the header down, a scroller filling it. */
  .panel { position: fixed; left: 0; right: 0; top: ${HEADER}px; display: flex; flex-direction: column; background: #fff; }
  .scroller { flex: 1; min-height: 0; overflow-y: auto; }
  .long { height: 1400px; }
</style></head><body>
<div id="sheet" class="sheet"><div class="filler"></div><div id="field" class="field"></div></div>
<div id="panel" class="panel"><div id="scroller" class="scroller"><div class="long"></div><div id="pfield" class="field"></div></div></div>
<script>
  var sheet = document.getElementById("sheet")
  sheet.style.bottom = ${JSON.stringify(BOTTOM)}
  sheet.style.maxHeight = ${JSON.stringify(MAX_H)}

  function withKeyboard(px) {
    var r = document.documentElement
    r.style.setProperty("--kb-inset", px + "px")
    r.style.setProperty("--vv-h", (window.innerHeight - px) + "px")
  }
  function read(label) {
    var s = sheet.getBoundingClientRect()
    var f = document.getElementById("field").getBoundingClientRect()
    /* The viewport the browser actually gave us, not the one the window flag
       asked for: headless clamps and trims, and hardcoding 844 here made the
       first run report an 87px error that was entirely the fixture's. */
    var screen = window.innerHeight
    var visibleBottom = screen - Number((document.documentElement.style.getPropertyValue("--kb-inset") || "0px").replace("px",""))
    return { label: label, screen: screen,
      sheetBottom: Math.round(s.bottom), sheetTop: Math.round(s.top), sheetHeight: Math.round(s.height),
      fieldBottom: Math.round(f.bottom), visibleBottom: visibleBottom,
      fieldIsVisible: Math.round(f.bottom) <= visibleBottom + 1 }
  }

  var results = []
  withKeyboard(0)
  results.push(read("no keyboard"))
  withKeyboard(${KEYBOARD})
  results.push(read("keyboard up"))

  /* And the same sheet with the !important class it used to carry. */
  sheet.classList.add("pinned-important")
  results.push(read("keyboard up, with !bottom-0"))

  /* ── the panel ─────────────────────────────────────────────────────────
     KeyboardGuard's own arithmetic, applied to the panel's scroller: centre
     the focused field in the scroller's clientHeight. With the panel ending
     at the keyboard that centre is above the keys; with the panel ending at
     the bottom of the screen it is behind them. Both are read, so the check
     is known to tell the two apart. */
  var panel = document.getElementById("panel"), scroller = document.getElementById("scroller"), pfield = document.getElementById("pfield")
  function centreInScroller() {
    var a = pfield.getBoundingClientRect(), c = scroller.getBoundingClientRect()
    scroller.scrollTop = Math.max(0, scroller.scrollTop + (a.top - c.top + a.height / 2) - scroller.clientHeight / 2)
  }
  function readPanel(label) {
    centreInScroller()
    var p = panel.getBoundingClientRect(), f = pfield.getBoundingClientRect()
    var screen = window.innerHeight
    var visibleBottom = screen - Number((document.documentElement.style.getPropertyValue("--kb-inset") || "0px").replace("px",""))
    return { label: label, panel: true, screen: screen, panelBottom: Math.round(p.bottom), scrollerH: scroller.clientHeight,
      fieldTop: Math.round(f.top), fieldBottom: Math.round(f.bottom), visibleBottom: visibleBottom,
      fieldIsVisible: Math.round(f.bottom) <= visibleBottom + 1 && Math.round(f.top) >= ${HEADER} }
  }
  /* ── the platform reports nothing ──────────────────────────────────────
     A WKWebView without the keyboard plugin draws the keys over the page and
     never touches visualViewport, so --kb-inset stays 0 with the keyboard up.
     Both rows are read against the REAL keyboard rather than the published
     one, because the published one is the thing that is wrong. */
  function readAgainst(label, realKeyboardPx) {
    var s = sheet.getBoundingClientRect(), f = document.getElementById("field").getBoundingClientRect()
    var screen = window.innerHeight
    var visibleBottom = screen - realKeyboardPx
    return { label: label, screen: screen,
      sheetBottom: Math.round(s.bottom), sheetTop: Math.round(s.top), sheetHeight: Math.round(s.height),
      fieldBottom: Math.round(f.bottom), visibleBottom: visibleBottom,
      fieldIsVisible: Math.round(f.bottom) <= visibleBottom + 1 }
  }
  sheet.classList.remove("pinned-important")
  var realKb = Math.round(window.innerHeight * ${REAL_KEYBOARD_FRACTION})
  withKeyboard(0)
  results.push(readAgainst("keyboard up, nothing reported", realKb))
  var floor = Math.round(window.innerHeight * ${FLOOR_FRACTION})
  withKeyboard(floor)
  results.push(readAgainst("keyboard up, the floor stands in", realKb))
  /* Back to a reported keyboard for the panel rows below. */
  withKeyboard(${KEYBOARD})

  sheet.style.display = "none"
  panel.style.bottom = "0px"
  results.push(readPanel("panel at bottom: 0, field centred"))
  panel.style.bottom = ${JSON.stringify(PANEL_BOTTOM)}
  results.push(readPanel("panel on the keyboard, field centred"))
  withKeyboard(0)
  results.push(readPanel("panel, no keyboard"))

  var pre = document.createElement("pre"); pre.id = "result"
  pre.textContent = JSON.stringify(results); document.body.appendChild(pre)
</script></body></html>`)

const dom = execFileSync(CHROMIUM, ["--headless=new", "--no-sandbox", "--disable-gpu", "--hide-scrollbars",
  `--window-size=390,${SCREEN}`, "--virtual-time-budget=4000", "--dump-dom", `file://${join(out, "index.html")}`],
  { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 16 * 1024 * 1024 })
const found = [...dom.matchAll(/<pre id="result">([\s\S]*?)<\/pre>/g)]
if (!found.length) fail("Nothing reported.")
const rows = JSON.parse(found[found.length - 1][1].replace(/&quot;/g, '"').replace(/&amp;/g, "&"))

const SCREEN_REAL = rows[0].screen
console.log(`\nA ${SCREEN_REAL}px viewport, a ${KEYBOARD}px keyboard\n`)
console.log(`  ${"".padEnd(30)} ${"sheet".padEnd(18)} ${"field ends".padEnd(11)} screen ends`)
for (const r of rows.filter((r) => !r.panel)) {
  console.log(`  ${r.label.padEnd(30)} ${`${r.sheetTop}..${r.sheetBottom} (${r.sheetHeight}px)`.padEnd(18)} ${String(r.fieldBottom).padEnd(11)} ${r.visibleBottom}${r.fieldIsVisible ? "" : "   <-- BEHIND THE KEYBOARD"}`)
}
console.log("")
console.log(`  ${"".padEnd(38)} ${"panel ends".padEnd(11)} ${"scroller".padEnd(9)} ${"field".padEnd(11)} screen ends`)
for (const r of rows.filter((r) => r.panel)) {
  console.log(`  ${r.label.padEnd(38)} ${String(r.panelBottom).padEnd(11)} ${String(r.scrollerH).padEnd(9)} ${`${r.fieldTop}..${r.fieldBottom}`.padEnd(11)} ${r.visibleBottom}${r.fieldIsVisible ? "" : "   <-- BEHIND THE KEYBOARD"}`)
}
console.log("")

const problems = []
const [rest, open, important, blind, floored] = rows
if (blind.fieldIsVisible)
  problems.push("with nothing reported the field was NOT behind the keyboard — this check can no longer tell the floor apart from doing nothing")
if (!floored.fieldIsVisible)
  problems.push(`the floor put the field at ${floored.fieldBottom}, still below the real keyboard at ${floored.visibleBottom}`)
else {
  const gap = floored.visibleBottom - floored.sheetBottom
  if (gap < 0) problems.push(`the floored sheet still overlaps the keys by ${-gap}px`)
  if (gap > SCREEN * 0.12) problems.push(`the floor leaves ${gap}px of empty screen under the sheet, which is more gap than it is worth`)
}
const panelRows = rows.filter((r) => r.panel)
const [panelPinned, panelLifted, panelRest] = panelRows
if (panelRows.length !== 3) problems.push("the panel rows did not come back")
else {
  if (panelPinned.fieldIsVisible)
    problems.push("a panel pinned to the bottom of the screen did NOT put the centred field behind the keyboard — this check can no longer tell the two apart")
  if (panelLifted.panelBottom !== SCREEN_REAL - KEYBOARD)
    problems.push(`with the keyboard up the panel ends at ${panelLifted.panelBottom}, not on top of the keyboard at ${SCREEN_REAL - KEYBOARD}`)
  if (panelLifted.scrollerH !== SCREEN_REAL - KEYBOARD - HEADER)
    problems.push(`the panel's scroller is ${panelLifted.scrollerH}px tall in ${SCREEN_REAL - KEYBOARD - HEADER}px of room between the header and the keyboard`)
  if (!panelLifted.fieldIsVisible)
    problems.push(`with the panel on the keyboard the centred field is at ${panelLifted.fieldTop}..${panelLifted.fieldBottom}, outside ${HEADER}..${panelLifted.visibleBottom}`)
  if (panelRest.panelBottom !== SCREEN_REAL)
    problems.push(`with no keyboard the panel does not reach the bottom of the screen (${panelRest.panelBottom} of ${SCREEN_REAL})`)
}
if (rest.sheetBottom !== SCREEN_REAL) problems.push(`with no keyboard the sheet does not sit on the bottom of the screen (${rest.sheetBottom} of ${SCREEN_REAL})`)
if (!rest.fieldIsVisible) problems.push("the field is not visible even with no keyboard, so the fixture is wrong")
if (open.sheetBottom !== SCREEN_REAL - KEYBOARD)
  problems.push(`with the keyboard up the sheet ends at ${open.sheetBottom}, not on top of the keyboard at ${SCREEN_REAL - KEYBOARD}`)
if (!open.fieldIsVisible)
  problems.push(`with the keyboard up the field ends at ${open.fieldBottom}, below the visible ${open.visibleBottom} — it is behind the keys`)
if (open.sheetHeight > SCREEN_REAL - KEYBOARD)
  problems.push(`the sheet is ${open.sheetHeight}px tall in ${SCREEN_REAL - KEYBOARD}px of room`)
/* And the thing that made this invisible: prove the old class defeats it. */
if (important.fieldIsVisible)
  problems.push("a `bottom: 0 !important` class did NOT push the field behind the keyboard — this check can no longer tell the two apart")

if (problems.length) fail(problems.map((p) => `  - ${p}`).join("\n"))
console.log(`The sheet sits on the keyboard, and a !bottom-0 class is still proven to break it (field to ${important.fieldBottom} of ${important.visibleBottom}).`)
console.log(`With nothing reported the floor lifts the sheet clear of a real ${Math.round(SCREEN_REAL * REAL_KEYBOARD_FRACTION)}px keyboard, ${floored.visibleBottom - floored.sheetBottom}px above it, where reporting nothing leaves the field ${blind.fieldBottom - blind.visibleBottom}px under the keys.`)
console.log(`The panel ends at the keyboard too, and a panel that does not is still proven to centre its field behind the keys (${panelPinned.fieldTop}..${panelPinned.fieldBottom} of ${panelPinned.visibleBottom}).\n`)
