/**
 * ===========================================================================
 *  NOTHING IN THE CANVAS PAINTS OVER THE EDITOR'S CHROME
 * ===========================================================================
 * Twice now the same mistake has shipped, so this measures it twice.
 *
 * FIRST: with the Publish panel open, the selected section's toolbar and its
 * tooltip were drawn across it. The numbers looked safe — toolbar 60, header
 * 50 — and that is exactly why the bug survived: `z-index` only ranks things
 * inside ONE stacking context, and `<main>` is `position: relative` with no
 * z-index, which creates none. So the toolbar was never being compared with
 * its neighbours in the canvas. It was competing with `<header>` directly, in
 * the editor's root context, and 60 beats 50.
 *
 * SECOND: with the CODE EDITOR open, the Publish panel went behind it. The
 * code pane is `absolute inset-0 z-[80]` inside the canvas; the panel hung
 * from its button inside the top bar, which IS a stacking context at z-50, so
 * the panel's own z-50 never left the bar. 80 beat 50 and the panel was
 * painted underneath the code: visible at the edges, unusable in the middle.
 * No number written on the panel could have fixed that, so the panel is
 * portalled into `document.body` and positioned against its button.
 *
 * Reasoning about that is how it was got wrong in the first place, so this
 * asks the browser instead. `document.elementFromPoint` returns whatever is
 * actually on top at a coordinate — the same answer a click gets. Each
 * fixture stacks the real class lists in the real nesting and reads back who
 * owns the overlapping pixels, and each has a control built the old way,
 * which must come back broken or the check is measuring nothing.
 *
 *   pnpm build && node scripts/check-editor-layers.mjs
 */
import { execFileSync } from "node:child_process"
import { mkdtempSync, readFileSync, readdirSync, writeFileSync, rmSync, existsSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const root = process.cwd()
const fail = (m) => {
  console.error(m)
  process.exit(1)
}
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}. Set CHROMIUM=/path/to/chromium.`)
const cssDir = join(root, ".next/static/chunks")
if (!existsSync(cssDir)) fail("No production build found. Run `pnpm build` first.")
const css = readdirSync(cssDir)
  .filter((f) => f.endsWith(".css"))
  .map((f) => readFileSync(join(cssDir, f), "utf8"))
  .join("\n")

/**
 * The real numbers, read out of the components rather than copied here,
 * so a change to either side of the comparison is what this measures.
 */
const readFile = (p) => readFileSync(join(root, p), "utf8")
const PANEL_Z = Number(/export const CHROME_POPOVER_Z = (\d+)/.exec(readFile("components/website-builder/anchored-panel.tsx"))?.[1])
const PANE_Z = Number(/"absolute inset-0 z-\[(\d+)\] flex flex-col rounded-t-\[20px\]"/.exec(readFile("components/website-builder/preview-mode-switch.tsx"))?.[1])
if (!PANEL_Z) fail("Could not read CHROME_POPOVER_Z from anchored-panel.tsx.")
if (!PANE_Z) fail("Could not read the code pane's z-index from preview-mode-switch.tsx.")

/** The real class lists, copied from the editor. */
const HEADER = "wb-editor-topbar relative bg-[var(--wb-chrome-bg)] text-[var(--wb-chrome-fg)] border-b border-[var(--wb-chrome-line)] flex items-center px-3 md:px-4 gap-2 shrink-0 z-50"
const MAIN = "relative flex-1 min-w-0 overflow-hidden flex justify-center"
const PANEL_LOOK = "w-[420px] rounded-2xl border border-white/10 bg-[#1f1f1f] p-6"
const TOOLBAR = (z) => `wb-section-toolbar absolute ${z} flex items-center gap-0.5 rounded-xl border border-neutral-200/80 bg-white/95 p-1`

/**
 * @param z          the section toolbar's z-index class
 * @param portalled  true for what ships: the panel in <body>, positioned
 *                   against the button. false for the old markup, inside the
 *                   bar, which is the control.
 * @param code       whether the code editor's pane is open over the canvas
 */
const page = (z, portalled, code) => `<!doctype html><html><head><meta charset="utf-8"><style>` + css + `</style>
<style>
  *{box-sizing:border-box;margin:0}
  html,body{height:100%}
  body{width:900px;height:600px;font-family:Inter,system-ui,sans-serif}
  /* The editor's root: a column, the bar, then the canvas. */
  .wb-editor{position:fixed;inset:0;display:flex;flex-direction:column;overflow:hidden}
</style></head><body>
<div class="wb-editor">
  <header class="${HEADER}" style="height:48px">
    <div id="anchor" style="margin-left:auto;position:relative">
      <button id="publish-btn" style="height:32px;width:92px">Publish</button>
      ${portalled ? "" : `<div id="panel" class="absolute right-0 top-[calc(100%+10px)] z-50 ${PANEL_LOOK}" style="height:260px">Publish panel</div>`}
    </div>
  </header>
  <main class="${MAIN}">
    ${code ? `<div id="pane" class="absolute inset-0 z-[${PANE_Z}] flex flex-col rounded-t-[20px]" style="background:#1b1b1b">code</div>` : ""}
    <div id="toolbar" class="${TOOLBAR(z)}" style="top:0;right:24px;width:220px;height:40px">toolbar</div>
  </main>
</div>
<script>
  ${portalled ? `
  // What AnchoredPanel does: fixed, hung off the button's rect, in <body>.
  const a = document.getElementById("anchor").getBoundingClientRect()
  const p = document.createElement("div")
  p.id = "panel"
  p.className = ${JSON.stringify(PANEL_LOOK)}
  p.textContent = "Publish panel"
  p.style.cssText = "position:fixed;height:260px;top:" + (a.bottom + 10) + "px;right:" + (innerWidth - a.right) + "px;z-index:${PANEL_Z}"
  document.body.appendChild(p)
  ` : ""}
  const panel = document.getElementById("panel")
  const who = (el) => el ? (el.closest("#panel") ? "panel" : el.closest("#toolbar") ? "toolbar" : el.closest("#pane") ? "pane" : (el.id || el.tagName.toLowerCase())) : "nothing"
  const against = (id) => {
    const other = document.getElementById(id)
    if (!other) return null
    const p = panel.getBoundingClientRect(), t = other.getBoundingClientRect()
    const x0 = Math.max(p.left, t.left), x1 = Math.min(p.right, t.right)
    const y0 = Math.max(p.top, t.top), y1 = Math.min(p.bottom, t.bottom)
    if (!(x1 > x0 && y1 > y0)) return { overlaps: false }
    const at = [(x0 + x1) / 2, (y0 + y1) / 2]
    return { overlaps: true, onTop: who(document.elementFromPoint(at[0], at[1])), at: at.map(Math.round) }
  }
  document.title = JSON.stringify({ toolbar: against("toolbar"), pane: against("pane") })
</script></body></html>`

const out = mkdtempSync(join(tmpdir(), "storelib-layers-"))
try {
  const read = (name, ...args) => {
    const html = join(out, `${name}.html`)
    writeFileSync(html, page(...args))
    const dom = execFileSync(
      CHROMIUM,
      ["--headless=new", "--no-sandbox", "--disable-gpu", "--window-size=900,600",
       "--virtual-time-budget=1500", "--dump-dom", `file://${html}`],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    )
    const raw = /<title>([\s\S]*?)<\/title>/.exec(dom)?.[1]
    if (!raw) fail(`The ${name} fixture did not render.`)
    return JSON.parse(raw.replace(/&quot;/g, '"').replace(/&amp;/g, "&"))
  }

  // The canvas, with a section selected.
  const shipped = read("shipped", "z-30", true, false)
  const control = read("control", "z-[60]", false, false)
  // The code editor, open over the canvas.
  const shippedCode = read("shipped-code", "z-30", true, true)
  const controlCode = read("control-code", "z-30", false, true)

  let broken = 0
  const expect = (ok, what, got = "") => {
    console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${ok ? "" : `   ${got}`}`)
    if (!ok) broken++
  }

  console.log("\nnothing in the canvas paints over the editor's chrome\n")
  expect(
    shipped.toolbar?.overlaps && control.toolbar?.overlaps,
    "the toolbar and the publish panel do overlap, so there is something to rank",
    "they do not overlap in the fixture — the rest of this proves nothing",
  )
  expect(
    shipped.toolbar?.onTop === "panel",
    "the publish panel owns the pixels it shares with the section toolbar",
    `"${shipped.toolbar?.onTop}" is on top at ${shipped.toolbar?.at}`,
  )
  expect(
    control.toolbar?.onTop === "toolbar",
    "and with the old z-[60] the toolbar takes them, so this measures the bug that was there",
    `control says "${control.toolbar?.onTop}" — if this is not the toolbar the check above proves nothing`,
  )

  console.log("\nand the code editor does not paint over the publish panel\n")
  expect(
    shippedCode.pane?.overlaps && controlCode.pane?.overlaps,
    "the panel hangs over the code pane, so there is something to rank",
    "they do not overlap in the fixture — the rest of this proves nothing",
  )
  expect(
    shippedCode.pane?.onTop === "panel",
    `the portalled panel (z ${PANEL_Z}) owns the pixels it shares with the code pane (z ${PANE_Z})`,
    `"${shippedCode.pane?.onTop}" is on top at ${shippedCode.pane?.at}`,
  )
  expect(
    controlCode.pane?.onTop === "pane",
    "and inside the top bar it loses to the code, which is the bug that was reported",
    `control says "${controlCode.pane?.onTop}" — if this is not the pane the check above proves nothing`,
  )

  console.log(`\n  toolbar: shipped "${shipped.toolbar?.onTop}" / old "${control.toolbar?.onTop}"`)
  console.log(`  code:    shipped "${shippedCode.pane?.onTop}" / old "${controlCode.pane?.onTop}"\n`)
  process.exit(broken === 0 ? 0 : 1)
} finally {
  rmSync(out, { recursive: true, force: true })
}
