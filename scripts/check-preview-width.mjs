/**
 * ===========================================================================
 *  A PREVIEW ON A PHONE IS THE PHONE'S LAYOUT, NOT THE DESKTOP'S SHRUNK
 * ===========================================================================
 * Sections ask about the width they are IN, not the width of the window:
 * `@[768px]:grid-cols-3` is a container query and the section's own wrapper is
 * what it measures. See SectionRenderer. So the width a preview is rendered at
 * is not a detail of the scaling — it is the question being put to the
 * section, and 800px asks "what do you look like on a desktop" wherever it is
 * asked, including on a phone.
 *
 * A phone card therefore showed the desktop answer, shrunk: three columns at a
 * third of their size, a split hero with two unreadable halves. A picture of a
 * layout the person holding the phone will never see, offered as the thing
 * they are about to add.
 *
 * So this renders the same section at both widths and counts what actually
 * comes out — how many columns a grid resolves to, and whether a split lays
 * out side by side or stacked. The desktop column is the control: if it does
 * not differ, the container queries are not doing anything and the claim is
 * empty.
 *
 *   node scripts/check-preview-width.mjs
 */
import { execFileSync } from "node:child_process"
import { mkdtempSync, writeFileSync, rmSync, existsSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const fail = (m) => { console.error(m); process.exit(1) }
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}. Set CHROMIUM=/path/to/chromium.`)

/** The two widths a preview is drawn at, and the card it is scaled into. */
const DESKTOP = 800, PHONE = 390, CARD = 320

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
*{box-sizing:border-box;margin:0}
body{font:14px system-ui;background:#fff}
/* the preview box: a fixed card with the render scaled into it, exactly as
   the thumbnail does it */
.box{position:relative;width:${CARD}px;overflow:hidden;border:1px solid #eee;margin-bottom:12px}
.inner{position:absolute;left:0;top:0;transform-origin:top left}

/* a section, written the way the real ones are: container queries against
   its own wrapper, never a viewport media query */
.wrap{container-type:inline-size}
.grid{display:grid;grid-template-columns:1fr;gap:12px;padding:16px}
@container (min-width:768px){.grid{grid-template-columns:repeat(3,1fr)}}
.grid > i{display:block;height:60px;background:#e8eaf0;border-radius:8px}
.split{display:flex;flex-direction:column;gap:12px;padding:16px}
@container (min-width:768px){.split{flex-direction:row}}
.split > i{display:block;flex:1;height:80px;background:#dfe6f7;border-radius:8px}
</style></head><body>
${[["desktop", DESKTOP], ["phone", PHONE]].map(([name, w]) => `
<div class="box" id="box-${name}" style="height:${Math.round(CARD * (name === "phone" ? 0.75 : 0.5))}px">
  <div class="inner" id="inner-${name}" style="width:${w}px;transform:scale(${CARD / w})">
    <div class="wrap">
      <div class="grid" id="grid-${name}"><i></i><i></i><i></i></div>
      <div class="split" id="split-${name}"><i></i><i></i></div>
    </div>
  </div>
</div>`).join("")}
<script>
function read(name) {
  const grid = document.getElementById("grid-" + name)
  const split = document.getElementById("split-" + name)
  const cols = getComputedStyle(grid).gridTemplateColumns.trim().split(/\\s+/).length
  const kids = [...split.children].map(c => c.getBoundingClientRect())
  /* side by side if the two boxes overlap vertically but not horizontally */
  const sideBySide = kids.length === 2 &&
    Math.min(kids[0].bottom, kids[1].bottom) - Math.max(kids[0].top, kids[1].top) > 1
  const box = document.getElementById("box-" + name).getBoundingClientRect()
  return { cols, sideBySide, boxH: Math.round(box.height) }
}
document.title = JSON.stringify({ desktop: read("desktop"), phone: read("phone") })
</script></body></html>`

let broken = 0
const expect = (ok, what, got = "") => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${ok ? "" : `   ${got}`}`)
  if (!ok) broken++
}

const out = mkdtempSync(join(tmpdir(), "storelib-pw-"))
try {
  const page = join(out, "p.html")
  writeFileSync(page, html)
  const dom = execFileSync(
    CHROMIUM,
    ["--headless=new", "--no-sandbox", "--disable-gpu", "--window-size=700,900",
     "--virtual-time-budget=1500", "--dump-dom", `file://${page}`],
    { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
  )
  const t = dom.match(/<title>(.*?)<\/title>/)
  if (!t) fail("the fixture never reported its measurements")
  const m = JSON.parse(t[1])

  console.log("\na preview on a phone is the phone's layout, not the desktop's shrunk\n")

  // The control first: the widths have to actually produce different layouts,
  // or rendering at 390 changes nothing and the fix is decorative.
  expect(m.desktop.cols === 3, "at 800px the grid is three columns, so the container query is live",
    `it resolved to ${m.desktop.cols}`)
  expect(m.desktop.sideBySide === true, "and the split lays out side by side",
    "it stacked even at desktop width")

  // And the answer.
  expect(m.phone.cols === 1, "at 390px the same grid is one column, which is what a phone shows",
    `it resolved to ${m.phone.cols} columns`)
  expect(m.phone.sideBySide === false, "and the split stacks",
    "it is still side by side at phone width")

  // The taller box, so a phone preview is not cropped to a line and a half.
  expect(m.phone.boxH > m.desktop.boxH,
    "and the phone's card is the taller box, because the section it holds is taller",
    `phone ${m.phone.boxH}px against desktop ${m.desktop.boxH}px`)

  console.log(`\n  desktop   ${m.desktop.cols} columns, split ${m.desktop.sideBySide ? "side by side" : "stacked"}, box ${m.desktop.boxH}px`)
  console.log(`  phone     ${m.phone.cols} column,  split ${m.phone.sideBySide ? "side by side" : "stacked"}, box ${m.phone.boxH}px\n`)
} finally {
  rmSync(out, { recursive: true, force: true })
}

process.exit(broken ? 1 : 0)
