/**
 * ===========================================================================
 *  HIDE, DUPLICATE AND DELETE FIT THE SIDEBAR THEY LIVE IN
 * ===========================================================================
 * The section panel's action row sat in three equal columns, each holding a
 * 16px icon, an 8px gap and a label. "Duplicate" is the long one, and at
 * 13px/600 it is about 70px wide, so that button wanted roughly 94px of
 * content. The sidebar defaults to 288px and can be dragged down to 240, and
 * a third of the row inside its 12px padding is 82.6px and 66.7px. The
 * content was therefore wider than the button at every width the sidebar can
 * be, and the icon was drawn on top of the word.
 *
 * The row now drops the icons and uses `flex: 1 1 auto`, so each button
 * starts at its own label's width and only the leftover space is shared.
 * This renders both versions at both widths and measures, for every button,
 * whether its content overflows its box.
 *
 *   before   three equal columns, icon + label
 *   after    flex-auto, label only
 *
 * The "before" column is a control: it must still overflow, or the fixture
 * is not reproducing what was reported.
 *
 *   node scripts/check-section-actions.mjs
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

/** The sidebar's default and its minimum, from the editor page. */
const WIDTHS = [288, 240]

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
*{box-sizing:border-box;margin:0}
body{font-family:Inter,system-ui,-apple-system,"Segoe UI",sans-serif;background:#fff}
.bar{display:flex;gap:8px;padding:12px;border-top:1px solid #e5e7eb}
button{height:40px;border:0;border-radius:12px;background:#f3f4f6;color:#1a1a2e;
  font-size:13px;font-weight:600;font-family:inherit;
  display:flex;align-items:center;justify-content:center}
span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
/* before: equal thirds, icon beside the label */
.before button{flex:1 1 0;min-width:0;gap:8px}
.before .icon{width:16px;height:16px;flex:none;background:#1a1a2e;border-radius:3px}
/* after: each button starts at its label, the spare space is shared */
.after button{flex:1 1 auto;min-width:0;padding:0 6px}
</style></head><body>
${WIDTHS.map(
  (w) => `
<div style="width:${w}px" class="before" id="before-${w}"><div class="bar">
  <button><i class="icon"></i><span>Hide</span></button>
  <button><i class="icon"></i><span>Duplicate</span></button>
  <button><i class="icon"></i><span>Delete</span></button>
</div></div>
<div style="width:${w}px" class="after" id="after-${w}"><div class="bar">
  <button><span>Hide</span></button>
  <button><span>Duplicate</span></button>
  <button><span>Delete</span></button>
</div></div>`,
).join("")}
<script>
/**
 * How much wider the button's content WANTS to be than the button is.
 *
 * A squeezed flex child reports the width it was squeezed to, not the width
 * it needed, so the laid-out rectangles cannot answer this. A Range over the
 * label's text measures the text itself: the labels do not wrap, so that is
 * the natural width whether or not the parent has clipped it.
 */
function overflow(id) {
  return [...document.querySelectorAll("#" + id + " button")].map((b) => {
    const cs = getComputedStyle(b)
    const gap = parseFloat(cs.columnGap)
    const gaps = (Number.isFinite(gap) ? gap : 0) * Math.max(0, b.children.length - 1)
    const pad = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight)
    const wanted = [...b.children].reduce((n, c) => {
      if (c.tagName === "SPAN") {
        const r = document.createRange()
        r.selectNodeContents(c)
        return n + r.getBoundingClientRect().width
      }
      return n + c.getBoundingClientRect().width
    }, 0)
    return +(wanted + gaps + pad - b.getBoundingClientRect().width).toFixed(2)
  })
}
const out = {}
for (const w of [${WIDTHS.join(",")}]) {
  out["before" + w] = overflow("before-" + w)
  out["after" + w] = overflow("after-" + w)
}
document.title = JSON.stringify(out)
</script></body></html>`

let broken = 0
const expect = (ok, what, got = "") => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${ok ? "" : `   ${got}`}`)
  if (!ok) broken++
}

const out = mkdtempSync(join(tmpdir(), "storelib-actions-"))
try {
  const page = join(out, "actions.html")
  writeFileSync(page, html)
  const dom = execFileSync(
    CHROMIUM,
    ["--headless=new", "--no-sandbox", "--disable-gpu", "--virtual-time-budget=1500", "--dump-dom", `file://${page}`],
    { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
  )
  const title = dom.match(/<title>(.*?)<\/title>/)
  if (!title) fail("the fixture never reported its measurements")
  const m = JSON.parse(title[1])

  console.log("\nthe section's actions fit the sidebar they live in\n")

  const LABELS = ["Hide", "Duplicate", "Delete"]
  for (const w of WIDTHS) {
    const after = m["after" + w]
    after.forEach((over, i) => {
      expect(over <= 0.5, `${LABELS[i]} fits its button with the sidebar at ${w}px`, `${over}px of content past the edge`)
    })
  }

  // The control. If the old row fits here, this fixture is not measuring the
  // thing that was reported and the assertions above prove nothing.
  const controlOverflows = WIDTHS.some((w) => m["before" + w].some((v) => v > 1))
  expect(controlOverflows, "the old equal-thirds row with icons still overflows, so this is a real measurement",
    "nothing overflowed in the control")

  console.log("")
  for (const w of WIDTHS) console.log(`  ${w}px sidebar   before ${m["before" + w].join(", ")}   after ${m["after" + w].join(", ")}`)
  console.log("")
} finally {
  rmSync(out, { recursive: true, force: true })
}

process.exit(broken ? 1 : 0)
