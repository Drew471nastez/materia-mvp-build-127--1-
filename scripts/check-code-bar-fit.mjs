/**
 * ===========================================================================
 *  SAVE WAS PAST THE RIGHT EDGE OF THE PHONE
 * ===========================================================================
 * The code editor's file bar is one flex row: back to the files, the file's
 * name, the actions, and Save. On a desktop that is nine icons and a button
 * in a bar with room to spare. On a phone it is the same nine icons in 390
 * pixels, and flexbox does not wrap or scroll by default — it puts what does
 * not fit PAST THE EDGE. Save is the last thing in the row, so Save is what
 * goes, on the one screen whose whole purpose is saving.
 *
 * This builds both rows at phone width from the sizes the real classes
 * resolve to — h-8 w-8 is 32px, h-9 is 36, gap-2 is 8, the bar's px-2 is 8 —
 * and reads back where each row's Save button actually lands. The old row is
 * the control: if it does not overflow here, this fixture is not measuring
 * the thing that was reported.
 *
 *   node scripts/check-code-bar-fit.mjs
 */
import { execFileSync } from "node:child_process"
import { mkdtempSync, writeFileSync, rmSync, existsSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const fail = (m) => { console.error(m); process.exit(1) }
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}. Set CHROMIUM=/path/to/chromium.`)

const PHONE = 390

/** The bar, as the classes resolve: one row, 8px gaps, 8px of side padding. */
const CSS = `
*{box-sizing:border-box;margin:0}
body{font:14px system-ui;background:#fff}
.bar{display:flex;align-items:center;gap:8px;padding:6px 8px;border-bottom:1px solid #e5e5e5;overflow:hidden}
.files{flex:none;height:36px;display:flex;align-items:center;gap:4px;padding:0 8px;font-size:13px}
.name{flex:1 1 0%;min-width:0;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;font-size:12px}
.icon{flex:none;height:32px;width:32px;border-radius:8px;background:#f5f5f5}
.icon.wide{width:auto;padding:0 10px;font-size:12px;display:flex;align-items:center;gap:6px}
.more{flex:none;height:36px;width:36px;border-radius:8px;background:#f5f5f5}
.save{flex:none;height:36px;padding:0 12px;border-radius:6px;background:#8B56FA;color:#fff;font-size:12px;display:flex;align-items:center;gap:6px}
`

// Nine icons is what a modified file the creator owns actually shows:
// theme, copy, download, new, duplicate, rename, delete, revert, history.
const ICONS = 9

/**
 * IN AN IFRAME, BECAUSE HEADLESS CHROMIUM WILL NOT GO BELOW 500px. Ask for a
 * 390px window and it gives you 500, silently, and the row then fits — which
 * is how a check like this reports success on a screen size it never drew.
 * The frame is the phone; the page around it is only the harness.
 */
const bars = `<!doctype html><html><head><meta charset="utf-8"><style>${CSS}</style></head><body>
<div class="bar" id="old">
  <div class="files">Files</div>
  <div class="name">sections/hero.storelib</div>
  ${Array.from({ length: ICONS - 2 }, () => '<div class="icon"></div>').join("")}
  <div class="icon wide">Revert</div>
  <div class="icon wide">History</div>
  <div class="save" id="save-old">Save</div>
</div>

<div class="bar" id="new">
  <div class="files">Files</div>
  <div class="name">hero.storelib</div>
  <div class="more"></div>
  <div class="save" id="save-new">Save</div>
</div>

<!-- Save on its own, with all the room it wants: what "full width" means. -->
<div style="display:inline-block"><div class="save" id="save-free">Save</div></div>
</body></html>`

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  *{box-sizing:border-box;margin:0} body{background:#eee}
  iframe{display:block;border:0;width:${PHONE}px;height:220px;background:#fff}
</style></head><body>
<iframe id="phone" src="bars.html"></iframe>
<script>
  const f = document.getElementById("phone")
  const report = () => {
    const d = f.contentDocument
    const box = (id) => {
      const r = d.getElementById(id).getBoundingClientRect()
      return { left: Math.round(r.left), right: Math.round(r.right), width: Math.round(r.width) }
    }
    document.title = JSON.stringify({
      width: d.documentElement.clientWidth,
      oldSave: box("save-old"),
      newSave: box("save-new"),
      freeSave: box("save-free"),
    })
  }
  const tryReport = () => {
    try { report(); return true } catch (e) { document.title = "ERR " + e.message; return false }
  }
  f.addEventListener("load", () => setTimeout(tryReport, 50))
  setTimeout(tryReport, 400)
</script></body></html>`

const dir = mkdtempSync(join(tmpdir(), "code-bar-"))
let m
try {
  const file = join(dir, "bar.html")
  writeFileSync(join(dir, "bars.html"), bars)
  writeFileSync(file, html)
  const dom = execFileSync(CHROMIUM, [
    "--headless=new", "--no-sandbox", "--disable-gpu", "--hide-scrollbars",
    // Same origin for the frame, or its document cannot be measured from here.
    "--allow-file-access-from-files",
    "--window-size=900,700", "--virtual-time-budget=2000", "--dump-dom", `file://${file}`,
  ], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })
  const t = dom.match(/<title>(.*?)<\/title>/)
  if (!t) fail("the fixture never reported its measurements")
  m = JSON.parse(t[1].replace(/&quot;/g, '"'))
} finally {
  rmSync(dir, { recursive: true, force: true })
}

let broken = 0
const expect = (ok, what, got = "") => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${ok ? "" : `   ${got}`}`)
  if (!ok) broken++
}

console.log(`\nthe file bar at ${m.width}px\n`)

expect(
  m.oldSave.right > m.width,
  "the row of icons really did push Save off the screen",
  `it ended at ${m.oldSave.right}px on a ${m.width}px screen, which would have made this fixture a lie`,
)
expect(
  m.newSave.right <= m.width - 4,
  "and with the actions behind one button, Save is on the screen",
  `Save ends at ${m.newSave.right}px`,
)
expect(
  m.newSave.width === m.freeSave.width,
  "at the width it wants, not squeezed to fit",
  `${m.newSave.width}px in the bar against ${m.freeSave.width}px with room to spare`,
)

console.log(`\n  old row  Save ${m.oldSave.left} to ${m.oldSave.right}px   (screen ends at ${m.width})`)
console.log(`  new row  Save ${m.newSave.left} to ${m.newSave.right}px\n`)

process.exit(broken ? 1 : 0)
