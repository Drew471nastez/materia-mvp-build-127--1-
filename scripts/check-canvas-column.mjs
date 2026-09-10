/**
 * ===========================================================================
 *  THE CANVAS RESERVES NO COLUMN FOR A SCROLLBAR
 * ===========================================================================
 * A classic scrollbar is laid out inside the scroll container's box: the
 * card gets narrower by the bar's width, and that strip is painted in the
 * card's own colour beside whatever the site is. `.wb-canvas-hidebar` is
 * what removes it, so that CanvasScrollbar can draw a thumb OVER the card
 * instead. This measures that claim in real Chromium with the built CSS:
 *
 *   offsetWidth - clientWidth   is the column, in pixels.
 *
 * Headless Chromium draws no bar of its own, so the fixture forces a 12px
 * classic bar onto both scrollers. The control keeps it and must show a
 * 12px column; the one carrying the class must show none, even with that
 * rule on it — which also proves `scrollbar-width: none` is what applies on
 * this engine and the pseudo-element rule is not what it is relying on.
 *
 * Run after `pnpm build`:   node scripts/check-canvas-column.mjs
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
if (!/\.wb-canvas-hidebar\{/.test(css)) fail("The built CSS has no .wb-canvas-hidebar rule. Run `pnpm build` again.")

const out = mkdtempSync(join(tmpdir(), "storelib-column-"))
try {
  writeFileSync(join(out, "app.css"), css)
  writeFileSync(
    join(out, "column.html"),
    `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="app.css"><style>
.card{width:200px;height:200px;overflow-y:auto}
.tall{height:900px}
/* The fixture's classic bar, on both. */
.card::-webkit-scrollbar{width:12px}
</style></head><body>
<div id="plain" class="card"><div class="tall"></div></div>
<div id="hidden" class="card wb-canvas-hidebar"><div class="tall"></div></div>
<script>
  const col = (id) => { const el = document.getElementById(id); return el.offsetWidth - el.clientWidth }
  document.body.setAttribute("data-plain", col("plain"))
  document.body.setAttribute("data-hidden", col("hidden"))
</script></body></html>`,
  )
  const dom = execFileSync(
    CHROMIUM,
    ["--headless=new", "--no-sandbox", "--disable-gpu", "--virtual-time-budget=1000", "--dump-dom", `file://${join(out, "column.html")}`],
    { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
  )
  const plain = Number(/data-plain="(\d+)"/.exec(dom)?.[1] ?? NaN)
  const hidden = Number(/data-hidden="(\d+)"/.exec(dom)?.[1] ?? NaN)

  let broken = 0
  const expect = (ok, what, got = "") => {
    console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${ok ? "" : `   ${got}`}`)
    if (!ok) broken++
  }
  console.log("\nthe canvas reserves no column for a scrollbar\n")
  expect(plain === 12, "the control card gives up a 12px column to the fixture's bar, so the measurement is real", `control column ${plain}px`)
  expect(hidden === 0, "and the card with .wb-canvas-hidebar gives up none, even with that same bar on it", `column ${hidden}px`)
  console.log(`\n  column:  plain ${plain}px   hidden ${hidden}px\n`)
  process.exit(broken === 0 ? 0 : 1)
} finally {
  rmSync(out, { recursive: true, force: true })
}
