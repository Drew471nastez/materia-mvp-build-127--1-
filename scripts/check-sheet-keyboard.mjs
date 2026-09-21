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
</style></head><body>
<div id="sheet" class="sheet"><div class="filler"></div><div id="field" class="field"></div></div>
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
for (const r of rows) {
  console.log(`  ${r.label.padEnd(30)} ${`${r.sheetTop}..${r.sheetBottom} (${r.sheetHeight}px)`.padEnd(18)} ${String(r.fieldBottom).padEnd(11)} ${r.visibleBottom}${r.fieldIsVisible ? "" : "   <-- BEHIND THE KEYBOARD"}`)
}
console.log("")

const problems = []
const [rest, open, important] = rows
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
console.log(`The sheet sits on the keyboard, and a !bottom-0 class is still proven to break it (field to ${important.fieldBottom} of ${important.visibleBottom}).\n`)
