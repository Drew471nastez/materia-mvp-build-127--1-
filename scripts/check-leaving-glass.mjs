/**
 * ===========================================================================
 *  LEAVING THE BUILDER PUTS GLASS OVER IT, IT DOES NOT FADE IT AWAY
 * ===========================================================================
 * The leaving screen carried a real `backdrop-filter` and still did not look
 * like glass. The reason was underneath it, not on it: `.wb-editor-leaving`
 * set `opacity: 0.35` on the whole builder at the same moment. A backdrop
 * filter samples what is painted beneath it, so what it had to work with was
 * the builder washed out to a third of itself, and blurring that gives a flat
 * pale sheet. The two effects were cancelling: one removed exactly the
 * contrast the other needed.
 *
 * Glass is legible because you can still make out what is behind it. So this
 * renders a builder-shaped page — dark bar, white sidebar with rows, a
 * coloured canvas — puts the real overlay over it, and measures how much of
 * that structure survives, as the standard deviation of luminance across a
 * row that crosses the sidebar, the seam and the canvas.
 *
 *   faded    the builder at opacity 0.35 under the glass   (the control)
 *   solid    the builder fully painted under the glass     (what ships)
 *
 * The control must come out visibly flatter, or the fixture is not measuring
 * the thing that was reported.
 *
 *   node scripts/check-leaving-glass.mjs
 */
import { execFileSync } from "node:child_process"
import { mkdtempSync, readFileSync, writeFileSync, rmSync, existsSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import zlib from "node:zlib"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const fail = (m) => {
  console.error(m)
  process.exit(1)
}
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}. Set CHROMIUM=/path/to/chromium.`)

const W = 720, H = 360
/** The row the samples are taken on: below the bar, across sidebar and canvas. */
const ROW = 220

/** A builder, roughly: the dark bar, the white sidebar, the page beside it. */
const builder = `
<div class="bar"></div>
<div class="body">
  <div class="side">
    ${Array.from({ length: 7 }, (_, i) => `<div class="row"${i === 2 ? ' style="background:#ececef"' : ""}></div>`).join("")}
  </div>
  <div class="canvas">
    <div class="hero"></div>
    <div class="cards"><i></i><i></i><i></i></div>
  </div>
</div>`

const page = (faded) => `<!doctype html><html><head><meta charset="utf-8"><style>
*{box-sizing:border-box;margin:0}html,body{height:100%;overflow:hidden}
body{background:#171717;font-family:system-ui,sans-serif}
.shell{position:fixed;inset:0;display:flex;flex-direction:column;
  ${faded ? "opacity:.35" : "transform:scale(.985);transform-origin:50% 42%"}}
.bar{height:48px;background:#171717;flex:none}
.body{flex:1;display:flex;min-height:0}
.side{width:230px;background:#fff;border-right:1px solid #e5e7eb;padding:10px;flex:none}
.row{height:26px;border-radius:8px;background:#f6f6f7;margin-bottom:6px}
.canvas{flex:1;background:#fff;overflow:hidden}
.hero{height:120px;background:#f0eefb}
.cards{display:flex;gap:14px;padding:16px}
.cards i{flex:1;height:110px;border-radius:12px;background:#4f46e5}
.cards i:first-child{background:#f4f4f5}
.cards i:last-child{background:#f4f4f5}
.glass{position:fixed;inset:0;z-index:300;
  background:radial-gradient(58% 46% at 50% 44%, rgba(255,255,255,.12), rgba(255,255,255,0) 72%), rgba(10,10,12,.28);
  -webkit-backdrop-filter:blur(14px) saturate(1.5) brightness(.55);
  backdrop-filter:blur(14px) saturate(1.5) brightness(.55)}
</style></head><body>
<div class="shell">${builder}</div>
<div class="glass"></div>
</body></html>`

// ── A very small PNG reader, so the assertions are about real pixels ──
function readPng(path) {
  const d = readFileSync(path)
  let pos = 8, w, h, colourType
  let idat = Buffer.alloc(0)
  while (pos < d.length) {
    const len = d.readUInt32BE(pos)
    const type = d.subarray(pos + 4, pos + 8).toString("latin1")
    if (type === "IHDR") {
      w = d.readUInt32BE(pos + 8)
      h = d.readUInt32BE(pos + 12)
      colourType = d[pos + 17]
    } else if (type === "IDAT") idat = Buffer.concat([idat, d.subarray(pos + 8, pos + 8 + len)])
    pos += 12 + len
  }
  const raw = zlib.inflateSync(idat)
  const ch = colourType === 6 ? 4 : 3
  const stride = w * ch
  const px = Buffer.alloc(h * stride)
  let prev = Buffer.alloc(stride)
  let i = 0
  for (let y = 0; y < h; y++) {
    const filter = raw[i++]
    const line = Buffer.from(raw.subarray(i, i + stride))
    i += stride
    for (let x = 0; x < stride; x++) {
      const a = x >= ch ? line[x - ch] : 0
      const b = prev[x]
      const c = x >= ch ? prev[x - ch] : 0
      if (filter === 1) line[x] = (line[x] + a) & 255
      else if (filter === 2) line[x] = (line[x] + b) & 255
      else if (filter === 3) line[x] = (line[x] + ((a + b) >> 1)) & 255
      else if (filter === 4) {
        const p = a + b - c
        const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c)
        line[x] = (line[x] + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 255
      }
    }
    line.copy(px, y * stride)
    prev = line
  }
  return { w, h, at: (x, y) => { const o = y * stride + x * ch; return [px[o], px[o + 1], px[o + 2]] } }
}

const lum = ([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b

/** Mean luminance and its spread along one row, behind the glass. */
function readRow(img) {
  const vals = []
  for (let x = 4; x < img.w - 4; x++) vals.push(lum(img.at(x, ROW)))
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length
  const sd = Math.sqrt(vals.reduce((a, v) => a + (v - mean) ** 2, 0) / vals.length)
  return { mean: +mean.toFixed(1), sd: +sd.toFixed(1) }
}

let broken = 0
const expect = (ok, what, got = "") => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${ok ? "" : `   ${got}`}`)
  if (!ok) broken++
}

const out = mkdtempSync(join(tmpdir(), "storelib-glass-"))
try {
  const shots = {}
  for (const [name, faded] of [["solid", false], ["faded", true]]) {
    const html = join(out, `${name}.html`)
    const png = join(out, `${name}.png`)
    writeFileSync(html, page(faded))
    execFileSync(
      CHROMIUM,
      ["--headless=new", "--no-sandbox", "--disable-gpu", `--window-size=${W},${H}`,
       "--virtual-time-budget=2000", `--screenshot=${png}`, `file://${html}`],
      { stdio: "ignore" },
    )
    shots[name] = readRow(readPng(png))
  }

  console.log("\nleaving the builder puts glass over it, it does not fade it away\n")

  // Glass, not a window: the screen has to be visibly darker than the page.
  expect(shots.solid.mean < 130, "the builder is darkened behind the glass", `mean luminance ${shots.solid.mean}`)

  // And glass, not a grey sheet: the sidebar, the seam and the canvas are
  // still separable through it.
  expect(shots.solid.sd >= 12, "the layout is still readable through it", `spread ${shots.solid.sd}, too flat to read as glass`)

  // The control. Fading the builder first is what made it a flat sheet.
  expect(
    shots.faded.sd < shots.solid.sd * 0.7,
    "fading the builder first flattens it, so this is a real measurement",
    `faded spread ${shots.faded.sd} vs solid ${shots.solid.sd}`,
  )

  console.log(`\n  solid   mean ${shots.solid.mean}  spread ${shots.solid.sd}`)
  console.log(`  faded   mean ${shots.faded.mean}  spread ${shots.faded.sd}\n`)
} finally {
  rmSync(out, { recursive: true, force: true })
}

process.exit(broken ? 1 : 0)
