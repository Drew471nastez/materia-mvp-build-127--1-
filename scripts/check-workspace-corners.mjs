/**
 * ===========================================================================
 *  EVERY PANEL IN THE ROW TURNS AT THE TOP, ONTO THE LIGHT
 * ===========================================================================
 * Four corners, and this took four goes because each go moved the one arc
 * somewhere else instead of adding the ones that were missing, and because
 * the first shape that had them all put the wrong colour behind them.
 *
 * The panels sit in a row under the bar, and each of them ends where the
 * chrome begins: the sidebar at the screen's left edge and at the seam, the
 * canvas at that same seam and at the screen's right edge. All four turn, so
 * the two panels mirror each other and what is between them is a symmetric
 * valley rather than a one-sided notch.
 *
 * And the row is LIGHT behind those arcs. The bar's dark was tried: the arcs
 * are small, and a small dark shape surrounded by white reads as a hole
 * punched between two panels rather than as a frame around them. In the
 * workspace's own grey the same arcs read as the surface the panels are
 * sitting on, which is what they are.
 *
 * So this renders the row and samples all four corners, with the shape it
 * replaces beside it as a control that must fail the ones it did not have.
 *
 *   node scripts/check-workspace-corners.mjs
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

/** `rounded-2xl`, the bar's height, the sidebar's width, the viewport. */
const R = 16, BAR = 44, SIDE = 160, W = 560, H = 300
/** The workspace's own surface, which is what every arc opens onto. */
const GAP = [0xe3, 0xe7, 0xed]

const page = (shape) => `<!doctype html><html><head><meta charset="utf-8"><style>
*{box-sizing:border-box;margin:0}html,body{height:100%;overflow:hidden}
body{background:#888}
.bar{height:${BAR}px;background:#171717}
/* the row paints the workspace's own light surface: the four wedges the
   arcs open onto are all of it that is ever seen */
.row{display:flex;height:${H - BAR}px;background:rgb(${GAP})}
.side{width:${SIDE}px;background:#fff;border-right:1px solid #e5e7eb;overflow:hidden;flex:none}
.canvas{flex:1;background:rgb(${GAP});overflow:hidden}
.card{width:100%;height:100%;background:#fff}
${shape === "after"
    ? `.side{border-top-left-radius:${R}px;border-top-right-radius:${R}px}
       .canvas{border-top-left-radius:${R}px;border-top-right-radius:${R}px}
       .card{border-top-left-radius:${R}px;border-top-right-radius:${R}px}`
    : /* the shape it replaces: the sidebar square on its inner side, so the
         seam was a notch on one side only */
      `.side{border-top-left-radius:${R}px}
       .canvas{border-top-left-radius:${R}px;border-top-right-radius:${R}px}
       .card{border-top-left-radius:${R}px;border-top-right-radius:${R}px}`}
</style></head><body>
<div class="bar"></div>
<div class="row"><div class="side"></div><div class="canvas"><div class="card"></div></div></div>
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

/**
 * Tight on purpose. The sidebar's own right border is #e5e7eb, a couple of
 * points from the row's #e3e7ed: at a loose tolerance the border column
 * counts as the row showing through, and a square corner with a hairline
 * beside it scores out of forty-four for nothing. Two points is inside the
 * arc's own antialiasing and outside the border.
 */
const isGap = (p) => p.every((v, i) => Math.abs(v - GAP[i]) < 2)

/**
 * Of the pixels an arc at this corner should have cut away, how many are the
 * row showing through. The sample is the corner's bounding box minus the
 * quarter disc, so it counts only what falls outside the panel's shape.
 */
function wedge(img, side) {
  const x0 = side === "left" ? 0 : W - R
  const cx = side === "left" ? R : W - R
  const cy = BAR + R
  let bar = 0, total = 0
  for (let x = x0; x < x0 + R; x++) {
    for (let y = BAR; y < BAR + R; y++) {
      if (Math.hypot(x + 0.5 - cx, y + 0.5 - cy) <= R + 0.5) continue
      total++
      if (isGap(img.at(x, y))) bar++
    }
  }
  return { bar, total }
}

/**
 * The seam has two arcs, one from each panel, and they face each other. The
 * sidebar's is the box ending at its right edge; the canvas's is the box
 * starting one pixel past it. Sampled apart, because a one-sided notch is
 * exactly what passes if they are sampled together.
 */
function seamWedge(img, which) {
  const left = which === "sidebar" ? SIDE - R : SIDE + 1
  const cx = which === "sidebar" ? SIDE - R : left + R
  const cy = BAR + R
  let bar = 0, total = 0
  for (let x = left; x < left + R; x++) {
    for (let y = BAR; y < BAR + R; y++) {
      if (Math.hypot(x + 0.5 - cx, y + 0.5 - cy) <= R + 0.5) continue
      total++
      if (isGap(img.at(x, y))) bar++
    }
  }
  return { bar, total }
}

let broken = 0
const expect = (ok, what, got = "") => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${ok ? "" : `   ${got}`}`)
  if (!ok) broken++
}

const out = mkdtempSync(join(tmpdir(), "storelib-corners-"))
try {
  const read = (shape) => {
    const html = join(out, `${shape}.html`)
    const png = join(out, `${shape}.png`)
    writeFileSync(html, page(shape))
    execFileSync(
      CHROMIUM,
      ["--headless=new", "--no-sandbox", "--disable-gpu", `--window-size=${W},${H}`,
       "--virtual-time-budget=1500", `--screenshot=${png}`, `file://${html}`],
      { stdio: "ignore" },
    )
    const img = readPng(png)
    return {
      left: wedge(img, "left"),
      right: wedge(img, "right"),
      seamSide: seamWedge(img, "sidebar"),
      seamCanvas: seamWedge(img, "canvas"),
    }
  }
  const after = read("after")
  const before = read("before")

  console.log("\nevery panel in the row turns at the top, onto the light\n")

  // Antialiasing blends the boundary ring, so a pixel or two on the arc is
  // not a square corner. Most of the wedge has to be the row showing through.
  const ratio = (m) => m.bar / m.total
  expect(ratio(after.left) > 0.75, "the sidebar turns at the screen's left edge",
    `${after.left.bar} of ${after.left.total} wedge pixels are the row`)
  expect(ratio(after.seamSide) > 0.75, "the sidebar turns at the seam as well, so the valley has two sides",
    `${after.seamSide.bar} of ${after.seamSide.total} wedge pixels are the row`)
  expect(ratio(after.seamCanvas) > 0.75, "the canvas turns at the seam, facing it",
    `${after.seamCanvas.bar} of ${after.seamCanvas.total} wedge pixels are the row`)
  expect(ratio(after.right) > 0.75, "the canvas turns at the screen's right edge",
    `${after.right.bar} of ${after.right.total} wedge pixels are the row`)

  // The control: the shape this replaces curved the canvas at the seam and
  // left the sidebar square there, which is the one-sided notch reported.
  expect(ratio(before.seamSide) < 0.1,
    "the shape it replaces left the sidebar square at the seam, so this is a real measurement",
    `the control's sidebar seam was already ${before.seamSide.bar}/${before.seamSide.total}`)

  /**
   * An arc that is present and cannot be seen is the same complaint as an arc
   * that is missing, and that is what a 16px curve onto a surround nineteen
   * points off white looked like at the screen's edges. So the colours are
   * measured too, not just the geometry.
   */
  const lum = ([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b
  const separation = lum([255, 255, 255]) - lum(GAP)
  expect(separation >= 24, "and the surround is far enough from the panels for a 16px arc to read",
    `only ${separation.toFixed(1)} points of luminance between them`)
  console.log(`\n  panel to surround: ${separation.toFixed(1)} points of luminance (was 18.7 at #eceef1)`)

  const cols = (m) => `left ${m.left.bar}/${m.left.total}   seam ${m.seamSide.bar}/${m.seamSide.total} | ${m.seamCanvas.bar}/${m.seamCanvas.total}   right ${m.right.bar}/${m.right.total}`
  console.log(`\n  after    ${cols(after)}`)
  console.log(`  before   ${cols(before)}\n`)
} finally {
  rmSync(out, { recursive: true, force: true })
}

process.exit(broken ? 1 : 0)
