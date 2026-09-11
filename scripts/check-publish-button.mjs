/**
 * ===========================================================================
 *  THE PUBLISH BUTTON IS ONE BOX, WHATEVER IT SAYS
 * ===========================================================================
 * The action in the publish card has four labels — Publish, Publish changes,
 * Published, Publishing — and it was sized by whichever one it happened to be
 * showing, with `transition-all` animating the change. Pressing it therefore
 * started a width animation in the same moment its contents were replaced,
 * inside a sheet that is itself a `contain: paint` layer being transformed.
 * On a phone that came out as a slab of purple painted for one width with the
 * spinner and the word stranded beside it.
 *
 * The fix is a floor wide enough for the longest state, so the geometry never
 * changes and there is no resize to tear. This renders all four states and
 * measures them.
 *
 *   before   the button sized to its own label
 *   after    a 180px floor, centred content
 *
 * The "before" column is a control: its widths must differ, or the fixture is
 * not reproducing what was reported.
 *
 *   node scripts/check-publish-button.mjs
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

/** Every state the button has, and whether it shows the spinner. */
const STATES = [
  { label: "Publish", spinner: false },
  { label: "Publish changes", spinner: false },
  { label: "Published", spinner: false },
  { label: "Publishing", spinner: true },
]
/** The narrowest phone the card has to hold, and a roomy one. */
const CARDS = [320 - 40, 402 - 40]

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
*{box-sizing:border-box;margin:0}
body{font-family:Inter,system-ui,-apple-system,"Segoe UI",sans-serif;background:#1f1f1f;color:#fff}
.row{display:flex;flex-wrap:wrap;align-items:center;gap:12px;margin-bottom:18px}
.preview{display:flex;height:40px;flex:none;align-items:center;gap:8px;white-space:nowrap;
  border:1px solid rgba(255,255,255,.15);border-radius:12px;padding:0 16px;font-size:15px;font-weight:500}
.act{display:flex;height:40px;flex:none;align-items:center;justify-content:center;gap:8px;
  border:0;border-radius:12px;padding:0 20px;font-size:15px;font-weight:600;color:#fff;
  background:#8B56FA;font-family:inherit;white-space:nowrap}
.after .act{margin-left:auto;min-width:180px}
.spin{width:16px;height:16px;flex:none;border-radius:50%;background:#fff}
.i{width:16px;height:16px;flex:none;background:#fff;border-radius:3px}
</style></head><body>
${CARDS.map(
  (w) => `<div style="width:${w}px">
${STATES.map(
  (st, i) => `
  <div class="row after" id="after-${w}-${i}">
    <span class="preview"><i class="i"></i>Preview</span>
    <button class="act">${st.spinner ? `<i class="spin"></i>` : ""}${st.label}</button>
  </div>
  <div class="row before" id="before-${w}-${i}">
    <span class="preview"><i class="i"></i>Preview</span>
    <button class="act">${st.spinner ? `<i class="spin"></i>` : ""}${st.label}</button>
  </div>`,
).join("")}
</div>`,
).join("")}
<script>
function read(id) {
  const row = document.getElementById(id)
  const btn = row.querySelector(".act")
  const r = btn.getBoundingClientRect()
  const rowR = row.getBoundingClientRect()
  return {
    w: Math.round(r.width),
    /* how far the button runs past the card, if at all */
    over: Math.round(r.right - rowR.right),
    /* whether the row had to wrap onto a second line */
    wrapped: Math.round(rowR.height) > 48,
  }
}
const out = { after: {}, before: {} }
for (const w of [${CARDS.join(",")}]) {
  out.after[w] = []
  out.before[w] = []
  for (let i = 0; i < ${STATES.length}; i++) {
    out.after[w].push(read("after-" + w + "-" + i))
    out.before[w].push(read("before-" + w + "-" + i))
  }
}
document.title = JSON.stringify(out)
</script></body></html>`

let broken = 0
const expect = (ok, what, got = "") => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${ok ? "" : `   ${got}`}`)
  if (!ok) broken++
}

const out = mkdtempSync(join(tmpdir(), "storelib-publish-"))
try {
  const page = join(out, "publish.html")
  writeFileSync(page, html)
  const dom = execFileSync(
    CHROMIUM,
    ["--headless=new", "--no-sandbox", "--disable-gpu", "--window-size=520,2600",
     "--virtual-time-budget=1500", "--dump-dom", `file://${page}`],
    { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
  )
  const title = dom.match(/<title>(.*?)<\/title>/)
  if (!title) fail("the fixture never reported its measurements")
  const m = JSON.parse(title[1])

  console.log("\nthe publish button is one box, whatever it says\n")

  for (const w of CARDS) {
    const widths = m.after[w].map((r) => r.w)
    expect(new Set(widths).size === 1,
      `the box is the same in all four states in a ${w + 40}px card`,
      `${STATES.map((s, i) => `${s.label} ${widths[i]}`).join(", ")}`)

    const spills = m.after[w].filter((r) => r.over > 1)
    expect(spills.length === 0, `and it never runs past the card at ${w + 40}px`,
      `${spills.length} of 4 states overflowed`)
  }

  // The narrow card cannot hold both on one line: it has to wrap rather than
  // squeeze, which is the only other way the button loses its shape.
  expect(m.after[CARDS[0]].every((r) => r.wrapped), "on the narrowest phone it wraps instead of squeezing",
    "the row stayed on one line and something had to give")
  expect(m.after[CARDS[1]].every((r) => !r.wrapped), "and on a normal phone both sit on one line",
    "it wrapped where there was room")

  // The control: sized to its own label, the box changes under you.
  const before = m.before[CARDS[1]].map((r) => r.w)
  expect(new Set(before).size > 1,
    "sized to its label the box changed between states, so this is a real measurement",
    `every state measured ${before[0]}`)

  console.log("")
  for (const w of CARDS) {
    console.log(`  ${String(w + 40).padStart(3)}px card   after ${m.after[w].map((r) => String(r.w).padStart(4)).join("")}` +
      `   before ${m.before[w].map((r) => String(r.w).padStart(4)).join("")}`)
  }
  console.log(`\n  states: ${STATES.map((s) => s.label).join(", ")}\n`)
} finally {
  rmSync(out, { recursive: true, force: true })
}

process.exit(broken ? 1 : 0)
