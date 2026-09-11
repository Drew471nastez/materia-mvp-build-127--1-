/**
 * ===========================================================================
 *  THE CODE EDITOR'S BAR IS THE CODE EDITOR'S COLOUR, AND ITS ROW WRAPS
 * ===========================================================================
 * Two things about the code editor on a phone, both of which only exist at
 * phone width and so were never seen.
 *
 * THE BAR. On a phone the code editor is a full-screen page with a bar of its
 * own, and that bar belongs to the BUILDER — it is outside the frame the
 * editor runs in. So it was `bg-neutral-50` whatever the editor was set to: a
 * white bar with a back button sitting on a #0e0e0e editor, one seam straight
 * across the top of the screen. Measured as the distance between the bar's
 * colour and the editor's, which has to be small in both themes.
 *
 * THE PATH ROW. "Duplicate as", a field, and two buttons on one line. The
 * label does not shrink, the buttons do not shrink, and with the gaps and the
 * padding that is about 250px committed before the field has a pixel — so on
 * a 390px phone the field was down to a hundred and something and on anything
 * narrower the buttons ran into each other. Measured as: does any child's box
 * overlap the next one's, and is the field still usable.
 *
 * The control for each is the shape it replaces.
 *
 * MEASURED INSIDE IFRAMES, and that is not incidental. Headless Chromium
 * refuses a window narrower than 500px: asking for 320 gets 500, and the two
 * phone widths that matter were both quietly measured at 500 — where the row
 * fits, so the control passed and proved nothing. An iframe has a viewport of
 * its own and the media queries inside it resolve against that, so a 320px
 * frame is a 320px viewport however wide the window is.
 *
 *   node scripts/check-code-bar.mjs
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

/** The narrowest phone still sold, a common one, and a desktop. */
const WIDTHS = [320, 390, 900]
/** A field narrower than this is not a path field. */
const USABLE = 90

/** The row's own document, rendered at whatever width its frame is. */
const rowDoc = (before) => `<!doctype html><html><head><meta charset="utf-8"><style>
*{box-sizing:border-box;margin:0}
body{font:14px system-ui;background:#fff}
.row{display:flex;flex-direction:column;gap:8px;padding:8px 12px;border-top:1px solid #e5e5e5;background:#f6f6f6}
@media (min-width:768px){.row{flex-direction:row;align-items:center;padding:8px 16px}}
.row .lead{display:flex;min-width:0;flex:1;align-items:center;gap:8px}
.row .lead span{flex:none;font-size:11px;white-space:nowrap}
.row input{height:40px;min-width:0;flex:1;border:1px solid #ddd;border-radius:6px;padding:0 8px;font:12px monospace}
@media (min-width:768px){.row input{height:28px}}
.row .acts{display:flex;flex:none;align-items:center;gap:8px}
.row .acts button{height:40px;flex:1;border:0;border-radius:6px;padding:0 12px;font-size:13px;white-space:nowrap}
@media (min-width:768px){.row .acts button{height:28px;flex:none;padding:0 10px;font-size:12px}}
/* the control: one line, and nothing in it allowed to give */
.before{display:flex;align-items:center;gap:8px;padding:8px 16px;border-top:1px solid #e5e5e5;background:#f6f6f6}
.before span{flex:none;font-size:11px;white-space:nowrap}
.before input{height:28px;min-width:0;flex:1;border:1px solid #ddd;border-radius:6px;padding:0 8px;font:12px monospace}
.before button{flex:none;height:28px;border:0;border-radius:6px;padding:0 10px;font-size:12px;white-space:nowrap}
</style></head><body>
${before
  ? `<div class="before"><span id="a">Duplicate as</span><input id="b" value="sections/hero.storelib"><button id="c">Duplicate</button><button id="d">Cancel</button></div>`
  : `<div class="row"><div class="lead"><span id="a">Duplicate as</span><input id="b" value="sections/hero.storelib"></div><div class="acts"><button id="c">Duplicate</button><button id="d">Cancel</button></div></div>`}
</body></html>`

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
*{box-sizing:border-box;margin:0}
body{font:14px system-ui}
.screen{position:relative;overflow:hidden;margin-bottom:10px}
.dark .pane{background:#0e0e0e}
.light .pane{background:#ffffff}
.pane{height:70px}
.bar{display:flex;align-items:center;gap:8px;padding:6px 8px;border-bottom:1px solid}
.light .bar{background:#fafafa;border-color:#e5e5e5;color:#171717}
.dark .bar{background:#151515;border-color:rgba(255,255,255,.1);color:#fff}
.before .bar{background:#fafafa;border-color:#e5e5e5;color:#171717}
.bar .spacer{margin-left:auto}
.bar b{display:block;width:36px;height:36px;border-radius:8px;background:currentColor;opacity:.15}
iframe{display:block;border:0;height:130px;margin-bottom:6px}
</style></head><body>
${["light", "dark", "before"].map((kind) => `
<div class="screen ${kind}" id="sc-${kind}">
  <div class="bar" id="bar-${kind}"><span>Editor</span><span>Code</span><span class="spacer"></span><b></b></div>
  <div class="pane" id="pane-${kind}"></div>
</div>`).join("")}
${WIDTHS.map((w) => `
<iframe id="f-after-${w}" width="${w}" srcdoc="${rowDoc(false).replace(/"/g, "&quot;")}"></iframe>
<iframe id="f-before-${w}" width="${w}" srcdoc="${rowDoc(true).replace(/"/g, "&quot;")}"></iframe>`).join("")}
<script>
const rgb = (s) => (s.match(/\\d+/g) || [0,0,0]).slice(0,3).map(Number)
const apart = (a,b) => Math.max(Math.abs(a[0]-b[0]), Math.abs(a[1]-b[1]), Math.abs(a[2]-b[2]))
function seam(kind) {
  const bar = rgb(getComputedStyle(document.getElementById("bar-" + kind)).backgroundColor)
  const pane = rgb(getComputedStyle(document.getElementById("pane-" + kind)).backgroundColor)
  return { bar, pane, apart: apart(bar, pane) }
}
function row(id) {
  const frame = document.getElementById(id)
  const doc = frame.contentDocument
  const boxes = ["a","b","c","d"].map(k => doc.getElementById(k).getBoundingClientRect())
  let worst = 0
  for (let i = 0; i < boxes.length - 1; i++) {
    const a = boxes[i], b = boxes[i + 1]
    if (Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) <= 1) continue
    worst = Math.max(worst, Math.round(a.right - b.left))
  }
  /**
   * Lines by BAND, not by the top edge. A 11px label and a 40px field on one
   * line have different tops by construction, so counting distinct tops
   * reported two lines for a row that has one. Two boxes share a line when
   * their vertical extents overlap at all.
   */
  const bands = []
  for (const b of boxes.slice().sort((x, y) => x.top - y.top)) {
    const last = bands[bands.length - 1]
    if (last && Math.min(last.bottom, b.bottom) - Math.max(last.top, b.top) > 1) {
      last.top = Math.min(last.top, b.top)
      last.bottom = Math.max(last.bottom, b.bottom)
    } else bands.push({ top: b.top, bottom: b.bottom })
  }
  return {
    overlap: worst,
    field: Math.round(boxes[1].width),
    lines: bands.length,
    /* what the frame's own viewport actually is, so nothing is assumed */
    width: doc.documentElement.clientWidth,
  }
}
const WS = ${JSON.stringify(WIDTHS)}
/* A srcdoc frame is not laid out the moment the parent's script runs, and a
   measurement taken then is a measurement of nothing. Wait for every frame to
   have the elements in it before reading any of them. */
function ready() {
  return WS.every((w) => ["f-after-", "f-before-"].every((p) => {
    const d = document.getElementById(p + w) && document.getElementById(p + w).contentDocument
    return d && d.getElementById("a") && d.getElementById("d")
  }))
}
function measure(attempt) {
  if (!ready() && attempt < 60) { setTimeout(() => measure(attempt + 1), 25); return }
  const out = { light: seam("light"), dark: seam("dark"), before: seam("before"), rows: {} }
  for (const w of WS) out.rows[w] = { after: row("f-after-" + w), before: row("f-before-" + w) }
  document.title = JSON.stringify(out)
}
measure(0)
</script></body></html>`

let broken = 0
const expect = (ok, what, got = "") => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${ok ? "" : `   ${got}`}`)
  if (!ok) broken++
}

const out = mkdtempSync(join(tmpdir(), "storelib-codebar-"))
try {
  const page = join(out, "bar.html")
  writeFileSync(page, html)
  const dom = execFileSync(
    CHROMIUM,
    ["--headless=new", "--no-sandbox", "--disable-gpu", "--window-size=1100,1200",
     "--virtual-time-budget=2000", "--dump-dom", `file://${page}`],
    { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
  )
  const t = dom.match(/<title>(.*?)<\/title>/)
  if (!t) fail("the fixture never reported its measurements")
  const m = JSON.parse(t[1])

  console.log("\nthe code editor's bar is the code editor's colour, and its row wraps\n")

  // The bar, in both themes. 12 points is inside "the same surface, one a
  // shade off the other" and nowhere near 250 of white against near-black.
  expect(m.light.apart <= 12, "the bar sits on the light editor without a seam",
    `bar ${m.light.bar} against editor ${m.light.pane}, ${m.light.apart} apart`)
  expect(m.dark.apart <= 12, "and on the dark one",
    `bar ${m.dark.bar} against editor ${m.dark.pane}, ${m.dark.apart} apart`)
  expect(m.before.apart > 100,
    "a bar that ignored the theme was a seam across the top, so this is a real measurement",
    `the control was only ${m.before.apart} from the dark editor`)

  // Every frame reports its own viewport, so the widths are the real ones.
  for (const w of WIDTHS) {
    const r = m.rows[w].after
    expect(r.width === w, `the ${w}px frame really is ${w}px wide`, `it reported ${r.width}`)
    expect(r.overlap <= 0, `nothing in the path row overlaps at ${w}px`, `${r.overlap}px of overlap`)
    expect(r.field >= USABLE, `and the path field is still a field at ${w}px`, `only ${r.field}px wide`)
  }

  // The control: on a phone the one-line row has to give somewhere.
  const broke = WIDTHS.filter((w) => m.rows[w].before.overlap > 0 || m.rows[w].before.field < USABLE)
  expect(broke.length > 0, "the single-line row did run out of room, so this is a real measurement",
    "the control fitted at every width")

  // Two lines where it has to be, one where it does not.
  expect(m.rows[320].after.lines === 2, "on the narrowest phone it is two lines",
    `it is on ${m.rows[320].after.lines}`)
  expect(m.rows[900].after.lines === 1, "and one again on a desktop",
    `it is on ${m.rows[900].after.lines}`)

  console.log("")
  for (const w of WIDTHS) {
    const a = m.rows[w].after, b = m.rows[w].before
    console.log(`  ${String(w).padStart(4)}px   after  overlap ${String(a.overlap).padStart(4)}  field ${String(a.field).padStart(4)}  lines ${a.lines}` +
      `      before  overlap ${String(b.overlap).padStart(4)}  field ${String(b.field).padStart(4)}`)
  }
  console.log(`\n  bar      light ${m.light.apart} from its editor   dark ${m.dark.apart}   unthemed-on-dark ${m.before.apart}\n`)
} finally {
  rmSync(out, { recursive: true, force: true })
}

process.exit(broken ? 1 : 0)
