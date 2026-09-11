/**
 * ===========================================================================
 *  NOTHING IN THE CANVAS PAINTS OVER THE EDITOR'S CHROME
 * ===========================================================================
 * With the Publish panel open, the selected section's toolbar and its tooltip
 * were drawn across it. The numbers looked safe — toolbar 60, header 50 — and
 * that is exactly why the bug survived: `z-index` only ranks things inside
 * ONE stacking context, and `<main>` is `position: relative` with no z-index,
 * which creates none. So the toolbar was never being compared with its
 * neighbours in the canvas. It was competing with `<header>` directly, in the
 * editor's root context, and 60 beats 50.
 *
 * Reasoning about that is how it was got wrong in the first place, so this
 * asks the browser instead. `document.elementFromPoint` returns whatever is
 * actually on top at a coordinate — the same answer a click gets. The
 * fixture stacks the real class lists in the real nesting and reads back who
 * owns the overlapping pixels.
 *
 * The control is the same fixture with the old `z-[60]`, which must come back
 * with the toolbar on top, or the check is not measuring the thing that broke.
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

/** The real class lists, copied from the editor. */
const HEADER = "wb-editor-topbar relative bg-[var(--wb-chrome-bg)] text-[var(--wb-chrome-fg)] border-b border-[var(--wb-chrome-line)] flex items-center px-3 md:px-4 gap-2 shrink-0 z-50"
const MAIN = "relative flex-1 min-w-0 overflow-hidden flex justify-center"
const PANEL = "absolute right-0 top-[calc(100%+10px)] z-50 w-[420px] rounded-2xl border border-white/10 bg-[#1f1f1f] p-6"
const TOOLBAR = (z) => `wb-section-toolbar absolute ${z} flex items-center gap-0.5 rounded-xl border border-neutral-200/80 bg-white/95 p-1`

const page = (z) => `<!doctype html><html><head><meta charset="utf-8"><style>` + css + `</style>
<style>
  *{box-sizing:border-box;margin:0}
  html,body{height:100%}
  body{width:900px;height:600px;font-family:Inter,system-ui,sans-serif}
  /* The editor's root: a column, the bar, then the canvas. */
  .wb-editor{position:fixed;inset:0;display:flex;flex-direction:column;overflow:hidden}
</style></head><body>
<div class="wb-editor">
  <header class="${HEADER}" style="height:48px">
    <div style="margin-left:auto;position:relative">
      <button id="publish-btn" style="height:32px;width:92px">Publish</button>
      <div id="panel" class="${PANEL}" style="height:260px">Publish panel</div>
    </div>
  </header>
  <main class="${MAIN}">
    <div id="toolbar" class="${TOOLBAR(z)}" style="top:0;right:24px;width:220px;height:40px">toolbar</div>
  </main>
</div>
<script>
  const panel = document.getElementById("panel")
  const toolbar = document.getElementById("toolbar")
  const p = panel.getBoundingClientRect()
  const t = toolbar.getBoundingClientRect()
  // The middle of where the two actually overlap.
  const x0 = Math.max(p.left, t.left), x1 = Math.min(p.right, t.right)
  const y0 = Math.max(p.top, t.top), y1 = Math.min(p.bottom, t.bottom)
  const out = { overlaps: x1 > x0 && y1 > y0 }
  if (out.overlaps) {
    const el = document.elementFromPoint((x0 + x1) / 2, (y0 + y1) / 2)
    out.onTop = el ? (el.closest("#panel") ? "panel" : el.closest("#toolbar") ? "toolbar" : el.id || el.tagName.toLowerCase()) : "nothing"
    out.at = [Math.round((x0 + x1) / 2), Math.round((y0 + y1) / 2)]
  }
  document.title = JSON.stringify(out)
</script></body></html>`

const out = mkdtempSync(join(tmpdir(), "storelib-layers-"))
try {
  const read = (z, name) => {
    const html = join(out, `${name}.html`)
    writeFileSync(html, page(z))
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

  const shipped = read("z-30", "shipped")
  const control = read("z-[60]", "control")

  let broken = 0
  const expect = (ok, what, got = "") => {
    console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${ok ? "" : `   ${got}`}`)
    if (!ok) broken++
  }

  console.log("\nnothing in the canvas paints over the editor's chrome\n")
  expect(
    shipped.overlaps && control.overlaps,
    "the toolbar and the publish panel do overlap, so there is something to rank",
    "they do not overlap in the fixture — the rest of this proves nothing",
  )
  expect(
    shipped.onTop === "panel",
    "the publish panel owns the pixels they share",
    `"${shipped.onTop}" is on top at ${shipped.at}`,
  )
  expect(
    control.onTop === "toolbar",
    "and with the old z-[60] the toolbar takes them, so this measures the bug that was there",
    `control says "${control.onTop}" — if this is not the toolbar the check above proves nothing`,
  )

  console.log(`\n  on top:  shipped "${shipped.onTop}"   old z-[60] "${control.onTop}"\n`)
  process.exit(broken === 0 ? 0 : 1)
} finally {
  rmSync(out, { recursive: true, force: true })
}
