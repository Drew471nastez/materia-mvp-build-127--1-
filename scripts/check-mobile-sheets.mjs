/**
 * ===========================================================================
 *  THE ACTIONS STAY ON SCREEN, AND THE CHIPS ONLY MOVE WHAT THEY SHOULD
 * ===========================================================================
 * Two claims about the mobile sheets, each measurable and each previously
 * wrong in a way nothing on a desktop could show.
 *
 * STICKY   Hide, Duplicate and Delete sit at the end of a section's settings
 *          panel. On a desktop that panel is a column that fills the sidebar,
 *          so the row has always been at the bottom of it. On a phone the
 *          same panel goes inside the sheet's scroller, and the sheet can be
 *          at any height its detents allow — so at anything short of full the
 *          row was below the fold, and reaching it meant dragging the sheet up
 *          and scrolling a settings panel to its end.
 *
 *          Measured as: with the panel scrolled to the top, is the row inside
 *          the sheet's visible box? The control is the same panel without
 *          `position: sticky`, which must fail.
 *
 * CHIPS    The category row animated with `transition-all`. Tailwind v4
 *          compiles `active:scale-95` to the standalone `scale:` property, so
 *          `transition-all` does cover it — and it covers `width` too, which
 *          means pressing a chip transitions the width of every chip in the
 *          row and re-lays-out the row mid-press. Read from
 *          `getComputedStyle().transitionProperty`, which is what the browser
 *          resolved: the shipped row must name its properties, and none of
 *          them may be a layout property.
 *
 *   node scripts/check-mobile-sheets.mjs
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

/** A small phone, and a sheet at its SHORT detent, which is the hard case. */
const W = 390, H = 780, SHEET = 0.5

/** Properties whose transition forces layout. None may be named. */
const LAYOUT_PROPS = ["width", "height", "margin", "padding", "top", "left", "right", "bottom", "all"]

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
*{box-sizing:border-box;margin:0}
html,body{height:100%;overflow:hidden;font:14px system-ui}
.screen{position:relative;width:${W}px;height:${H}px;background:#eef1f5;overflow:hidden}
/* the sheet, at a detent well short of full */
.sheet{position:absolute;left:0;right:0;bottom:0;height:${Math.round(H * SHEET)}px;
  display:flex;flex-direction:column;overflow:hidden;background:#fff;border-radius:20px 20px 0 0}
.handle{flex:none;padding:10px 0 6px;display:flex;justify-content:center}
.handle i{height:4px;width:40px;border-radius:2px;background:#ddd}
/* the sheet's scroller, which is where the panel lives on a phone */
.scroll{flex:1;min-height:0;overflow-y:auto}
.panel{display:flex;flex-direction:column;height:100%}
.head{flex:none;padding:12px 16px;border-bottom:1px solid #eee}
.body{flex:1;overflow-y:auto;padding:12px 16px}
.block{height:64px;margin-bottom:12px;border-radius:10px;background:#f4f4f5}
.actions{position:sticky;bottom:0;z-index:10;flex:none;display:flex;gap:8px;
  border-top:1px solid #e5e7eb;background:#fff;padding:12px 12px 14px}
.actions b{flex:1 1 auto;height:40px;border-radius:12px;background:#f3f4f6}
/* the control: the same row with nothing holding it down */
.loose .panel{height:auto}
.loose .body{overflow:visible}
.loose .actions{position:static}

/* the chip row, shipped and before */
.chips{display:flex;gap:8px;padding:0 16px 12px;overflow-x:auto;scroll-snap-type:x proximity}
.chip{flex:none;border-radius:999px;padding:8px 16px;background:#f4f4f5;scroll-snap-align:start;
  transition-property:background-color,color,scale;transition-duration:.2s}
.before .chip{transition-property:all;transition-duration:.2s}
</style></head><body>
${["after", "loose"].map((kind) => `
<div class="screen ${kind === "loose" ? "loose" : ""}" id="s-${kind}">
  <div class="sheet">
    <div class="handle"><i></i></div>
    <div class="scroll">
      <div class="panel">
        <div class="head">Header section</div>
        <div class="body">${Array.from({ length: 12 }, () => `<div class="block"></div>`).join("")}</div>
        <div class="actions" id="act-${kind}"><b></b><b></b><b></b></div>
      </div>
    </div>
  </div>
</div>`).join("")}
<div class="screen" id="s-chips">
  <div class="sheet">
    <div class="chips" id="chips-after">${["All","Hero","Products","Features","Content"].map(c => `<span class="chip">${c}</span>`).join("")}</div>
    <div class="chips before" id="chips-before">${["All","Hero"].map(c => `<span class="chip">${c}</span>`).join("")}</div>
  </div>
</div>
<script>
function actions(kind) {
  const sheet = document.querySelector("#s-" + kind + " .sheet").getBoundingClientRect()
  const row = document.getElementById("act-" + kind).getBoundingClientRect()
  return {
    /* how much of the row is inside the sheet's visible box */
    visible: Math.max(0, Math.min(row.bottom, sheet.bottom) - Math.max(row.top, sheet.top)),
    height: Math.round(row.height),
    /* and how far past the bottom of the sheet it starts, if at all */
    below: Math.round(row.top - sheet.bottom),
  }
}
function chip(id) {
  const el = document.querySelector("#" + id + " .chip")
  const cs = getComputedStyle(el)
  return cs.transitionProperty.split(",").map(p => p.trim())
}
document.title = JSON.stringify({
  after: actions("after"),
  loose: actions("loose"),
  chipsAfter: chip("chips-after"),
  chipsBefore: chip("chips-before"),
})
</script></body></html>`

let broken = 0
const expect = (ok, what, got = "") => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${ok ? "" : `   ${got}`}`)
  if (!ok) broken++
}

const out = mkdtempSync(join(tmpdir(), "storelib-sheets-"))
try {
  const page = join(out, "sheets.html")
  writeFileSync(page, html)
  const dom = execFileSync(
    CHROMIUM,
    ["--headless=new", "--no-sandbox", "--disable-gpu", `--window-size=${W + 20},${H * 3}`,
     "--virtual-time-budget=1500", "--dump-dom", `file://${page}`],
    { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
  )
  const title = dom.match(/<title>(.*?)<\/title>/)
  if (!title) fail("the fixture never reported its measurements")
  const m = JSON.parse(title[1])

  console.log("\nthe actions stay on screen, and the chips only move what they should\n")

  expect(Math.round(m.after.visible) === m.after.height,
    `Hide, Duplicate and Delete are fully on screen with the sheet at ${Math.round(SHEET * 100)}% and the panel scrolled to the top`,
    `only ${Math.round(m.after.visible)} of the row's ${m.after.height}px are inside the sheet`)
  expect(m.loose.visible < m.loose.height,
    "without it the row is off the bottom, so this is a real measurement",
    `the control's row was fully visible too`)
  if (m.loose.below > 0) console.log(`         (the control's row starts ${m.loose.below}px below the sheet)`)

  const named = m.chipsAfter
  expect(!named.some((p) => LAYOUT_PROPS.includes(p)),
    "a chip transitions colour and a transform, and nothing that forces layout",
    `it names ${named.join(", ")}`)
  expect(m.chipsBefore.some((p) => LAYOUT_PROPS.includes(p)),
    "`transition-all` did name one, so this is a real measurement",
    `the control named only ${m.chipsBefore.join(", ")}`)

  console.log(`\n  actions    shipped ${Math.round(m.after.visible)}/${m.after.height}px on screen` +
    `   loose ${Math.round(m.loose.visible)}/${m.loose.height}px`)
  console.log(`  chips      shipped [${m.chipsAfter.join(", ")}]`)
  console.log(`             before  [${m.chipsBefore.join(", ")}]\n`)
} finally {
  rmSync(out, { recursive: true, force: true })
}

process.exit(broken ? 1 : 0)
