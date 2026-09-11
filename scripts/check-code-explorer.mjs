/**
 * ===========================================================================
 *  THE FILE DRAWER, AND THE FORM THAT RAN OFF BOTH EDGES
 * ===========================================================================
 * Two claims about the code editor on a phone, measured rather than argued:
 *
 *   1. The new-file form fits. It used to be one row — a label that does not
 *      shrink, a field, Create and Cancel — which needs about 250px before
 *      the field has a pixel. On a 390px screen the field ran off the left
 *      edge and Cancel off the right, which is what the screenshot showed.
 *      Stacked, every part of it is inside the screen.
 *
 *   2. The drawer covers the code and comes back off it. Closed, it is
 *      entirely off the left edge and nothing of it is over the editor;
 *      open, it is against the left edge at its full width. One transformed
 *      property either way, so the movement is the compositor's.
 *
 * Chromium will not open a window narrower than 500px, so the phone is an
 * iframe and the window around it is only the harness. Without that this
 * measures 500 and calls a row that needs 480 a pass.
 *
 *   node scripts/check-code-explorer.mjs
 */
import { execFileSync } from "node:child_process"
import { mkdtempSync, writeFileSync, rmSync, existsSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const fail = (m) => { console.error(m); process.exit(1) }
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}. Set CHROMIUM=/path/to/chromium.`)

const PHONE = 390

/** The classes that decide the geometry, written out: the fixture has no Tailwind. */
const phone = `<!doctype html><html><head><meta charset="utf-8"><style>
*{box-sizing:border-box;margin:0}
body{font:14px system-ui;background:#0e0e0e;color:#fafafa}
.stage{position:relative;height:420px;overflow:hidden}

/* w-[86%] max-w-[320px], off the left edge and back */
.drawer{position:absolute;top:0;bottom:0;left:0;z-index:40;width:86%;max-width:320px;
  background:#141414;border-right:1px solid #333;
  transition:transform 280ms cubic-bezier(0.32,0.72,0,1)}
.drawer.closed{transform:translateX(-100%)}
.drawer.open{transform:translateX(0)}

.head{padding:10px 12px;border-bottom:1px solid #333}
.headrow{display:flex;align-items:center;justify-content:space-between;gap:8px}
.chip{height:36px;width:36px;border-radius:8px;background:#1f1f1f}

/* the form, stacked: space-y-2 */
.form > * + *{margin-top:8px}
.field{height:40px;width:100%;min-width:0;border:1px solid #333;border-radius:6px;padding:0 8px;font:16px ui-monospace,monospace;background:#0e0e0e;color:#fafafa}
.row{display:flex;align-items:center;gap:8px}
.row > button{height:36px;flex:1 1 0%;border-radius:6px;border:1px solid #333;background:#111114;color:#fff;font-size:13px}

/* the row it replaced: label, field, Create, Cancel, all on one line */
.oldform{display:flex;align-items:center;gap:8px;padding:8px 12px}
.oldlabel{flex:none;font-size:11px}
.oldfield{height:36px;width:288px;max-width:100%;flex:none;border:1px solid #333;border-radius:6px;font:16px ui-monospace,monospace}
.oldbtn{flex:none;height:36px;padding:0 12px;border-radius:6px;font-size:12px}
</style></head><body>
<div class="stage" id="stage">
  <div class="drawer closed" id="drawer-closed"></div>
</div>
<div class="stage">
  <div class="drawer open" id="drawer-open">
    <div class="head">
      <div class="headrow"><span>EXPLORER</span><span class="chip" id="newfile"></span></div>
      <div class="form">
        <input class="field" id="field" value="my-section">
        <div class="row"><button id="create">Create</button><button id="cancel">Cancel</button></div>
      </div>
    </div>
  </div>
</div>

<!-- The control: the row this replaced. -->
<div class="oldform">
  <span class="oldlabel" id="old-label">New file at</span>
  <input class="oldfield" id="old-field" value="sections/my-section.storelib">
  <button class="oldbtn" id="old-create">Create</button>
  <button class="oldbtn" id="old-cancel">Cancel</button>
</div>
</body></html>`

const harness = `<!doctype html><html><head><meta charset="utf-8"><style>
*{box-sizing:border-box;margin:0} body{background:#eee}
iframe{display:block;border:0;width:${PHONE}px;height:1000px;background:#0e0e0e}
</style></head><body>
<iframe id="phone" src="phone.html"></iframe>
<script>
  const f = document.getElementById("phone")
  const run = () => {
    try {
      const d = f.contentDocument
      const box = (id) => {
        const r = d.getElementById(id).getBoundingClientRect()
        return { left: Math.round(r.left), right: Math.round(r.right), width: Math.round(r.width) }
      }
      document.title = JSON.stringify({
        width: d.documentElement.clientWidth,
        closed: box("drawer-closed"),
        open: box("drawer-open"),
        field: box("field"),
        create: box("create"),
        cancel: box("cancel"),
        newFile: box("newfile"),
        oldLabel: box("old-label"),
        oldField: box("old-field"),
        oldCancel: box("old-cancel"),
      })
      return true
    } catch (e) { document.title = "ERR " + e.message; return false }
  }
  f.addEventListener("load", () => setTimeout(run, 400))
  setTimeout(run, 700)
</script></body></html>`

const dir = mkdtempSync(join(tmpdir(), "code-explorer-"))
let m
try {
  writeFileSync(join(dir, "phone.html"), phone)
  const page = join(dir, "harness.html")
  writeFileSync(page, harness)
  const dom = execFileSync(CHROMIUM, [
    "--headless=new", "--no-sandbox", "--disable-gpu", "--hide-scrollbars",
    "--allow-file-access-from-files", "--window-size=900,1100",
    "--virtual-time-budget=2500", "--dump-dom", `file://${page}`,
  ], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })
  const t = dom.match(/<title>(.*?)<\/title>/)
  if (!t) fail("the fixture never reported its measurements")
  if (t[1].startsWith("ERR")) fail(t[1])
  m = JSON.parse(t[1].replace(/&quot;/g, '"'))
} finally {
  rmSync(dir, { recursive: true, force: true })
}

let broken = 0
const expect = (ok, what, got = "") => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${ok ? "" : `   ${got}`}`)
  if (!ok) broken++
}

console.log(`\nthe file drawer and the new-file form at ${m.width}px\n`)

// The control first: if the old row fit, this fixture is not the reported bug.
expect(
  m.oldField.left < 0 || m.oldCancel.right > m.width,
  "the old one-row form really did run off the screen",
  `field started at ${m.oldField.left}px and Cancel ended at ${m.oldCancel.right}px`,
)

for (const [name, b] of [["the field", m.field], ["Create", m.create], ["Cancel", m.cancel], ["New file", m.newFile]]) {
  expect(b.left >= 0 && b.right <= m.width, `${name} is inside the screen`, `${b.left} to ${b.right}px`)
}
expect(m.create.width === m.cancel.width, "Create and Cancel are the same size, both reachable by a thumb", `${m.create.width} and ${m.cancel.width}`)

expect(m.closed.right <= 0, "closed, the drawer is entirely off the left edge", `its right edge is at ${m.closed.right}px`)
expect(m.open.left === 0 && m.open.width <= 320 && m.open.width >= m.width * 0.8,
  "open, it is against the left edge and covers most of the screen",
  `${m.open.left} to ${m.open.right}px`)
expect(m.open.right < m.width, "and never the whole of it, so the code is still there behind it",
  `it ends at ${m.open.right}px of ${m.width}`)

console.log(`\n  drawer closed  ${m.closed.left} to ${m.closed.right}px`)
console.log(`  drawer open    ${m.open.left} to ${m.open.right}px   (screen ${m.width})`)
console.log(`  old form       field ${m.oldField.left} to ${m.oldField.right}px, Cancel ends ${m.oldCancel.right}px\n`)

process.exit(broken ? 1 : 0)
