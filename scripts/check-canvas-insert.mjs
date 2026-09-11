/**
 * ===========================================================================
 *  THE INSERT AFFORDANCE COSTS THE PAGE NO HEIGHT
 * ===========================================================================
 * The canvas grew a strip between every pair of sections for adding one where
 * you are pointing. It was `h-6 w-full` in flow, which is 24px of nothing
 * inserted between every section on the page — so the canvas was showing a
 * site with a gutter the published page does not have, and a person designing
 * against that is designing against the wrong page.
 *
 * The element in flow is zero pixels tall now and the hit area hangs off it,
 * straddling the boundary. So this stacks two sections with a strip between
 * them and measures the gap, and the size of the hit area separately, because
 * an affordance that costs no height is only useful if it can still be found.
 *
 *   before   a 24px strip in flow
 *   after    a zero-height element with a 12px band hanging off it
 *
 * The "before" column is a control: it must still open a gap.
 *
 *   node scripts/check-canvas-insert.mjs
 */
import { execFileSync } from "node:child_process"
import { mkdtempSync, writeFileSync, rmSync, existsSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const fail = (m) => {
  console.error(m)
  process.exit(1)
}
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}. Set CHROMIUM=/path/to/chromium.`)

const SECTION_H = 120

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
*{box-sizing:border-box;margin:0}
body{font:14px system-ui;background:#fff}
.page{width:520px}
.sec{height:${SECTION_H}px;background:#111827}
.sec + .sec{background:#1f2937}

/* before: the strip is a 24px row in the page's flow */
.before .strip{position:relative;z-index:20;display:flex;height:24px;width:100%;
  align-items:center;justify-content:center}

/* after: nothing in flow, and the band hangs off it across the boundary */
.after .strip{position:relative;z-index:20;height:0;width:100%}
.after .band{position:absolute;left:0;right:0;top:-6px;height:12px;
  display:flex;align-items:center;justify-content:center}
.before .band{display:flex;align-items:center;justify-content:center;height:100%}

.line{position:absolute;left:0;right:0;height:2px;background:#8B56FA}
.dot{position:relative;z-index:10;display:flex;height:24px;width:24px;
  align-items:center;justify-content:center;border-radius:999px;background:#8B56FA}
</style></head><body>
${["before", "after"]
  .map(
    (shape) => `
<div class="page ${shape}" id="page-${shape}">
  <div class="sec" id="${shape}-a"></div>
  <div class="strip" id="${shape}-strip"><div class="band" id="${shape}-band"><i class="line"></i><i class="dot"></i></div></div>
  <div class="sec" id="${shape}-b"></div>
</div>`,
  )
  .join("")}
<script>
function read(shape) {
  const a = document.getElementById(shape + "-a").getBoundingClientRect()
  const b = document.getElementById(shape + "-b").getBoundingClientRect()
  const band = document.getElementById(shape + "-band").getBoundingClientRect()
  return {
    /* how far apart the two sections are, which is what the canvas shows */
    gap: Math.round(b.top - a.bottom),
    /* how tall the thing you have to hit is */
    hit: Math.round(band.height),
    /* and how far it reaches into each neighbour */
    over: Math.round(a.bottom - band.top),
  }
}
document.title = JSON.stringify({ before: read("before"), after: read("after") })
</script></body></html>`

let broken = 0
const expect = (ok, what, got = "") => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${ok ? "" : `   ${got}`}`)
  if (!ok) broken++
}

const out = mkdtempSync(join(tmpdir(), "storelib-insert-"))
try {
  const page = join(out, "insert.html")
  writeFileSync(page, html)
  const dom = execFileSync(
    CHROMIUM,
    ["--headless=new", "--no-sandbox", "--disable-gpu", "--window-size=600,700",
     "--virtual-time-budget=1200", "--dump-dom", `file://${page}`],
    { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
  )
  const title = dom.match(/<title>(.*?)<\/title>/)
  if (!title) fail("the fixture never reported its measurements")
  const m = JSON.parse(title[1])

  console.log("\nthe insert affordance costs the page no height\n")

  expect(m.after.gap === 0, "the sections sit exactly as they do on the published page",
    `${m.after.gap}px of canvas-only space between them`)
  expect(m.after.hit >= 10, "and the band is still big enough to find with a pointer",
    `only ${m.after.hit}px tall`)
  expect(m.after.over <= 8, "without reaching far enough into a section to steal its clicks",
    `${m.after.over}px into the section above`)

  // The control. If the old strip also measured zero, this fixture is not
  // reproducing what was reported.
  expect(m.before.gap > 0, "the strip in flow did open a gap, so this is a real measurement",
    "the control measured no gap either")

  console.log(`\n  before   gap ${m.before.gap}px   hit ${m.before.hit}px`)
  console.log(`  after    gap ${m.after.gap}px   hit ${m.after.hit}px, reaching ${m.after.over}px into each side\n`)
} finally {
  rmSync(out, { recursive: true, force: true })
}

process.exit(broken ? 1 : 0)
