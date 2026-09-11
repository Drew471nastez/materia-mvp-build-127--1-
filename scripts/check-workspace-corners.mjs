/**
 * ===========================================================================
 *  THE WORKSPACE TURNS AT EVERY PLACE IT MEETS THE CHROME
 * ===========================================================================
 * Three corners, and this took three goes to get right because each go moved
 * the one arc somewhere else instead of adding the ones that were missing.
 *
 * The canvas ends in two places, and the chrome begins in both: at the right,
 * where it meets the edge of the screen under the bar, and at the left, where
 * it meets the sidebar under the bar. The sidebar ends in one place, at the
 * left edge of the screen. All three turn, and the bar's own colour shows
 * through all three arcs, so the workspace reads as tucked under the chrome
 * from either side rather than butted against it on one.
 *
 * First it was the left of the canvas alone — an arc in the middle of the row
 * with both ends of the row square. Then the outer two alone, which left the
 * sidebar and the canvas meeting in a right angle. Both halves were reported.
 *
 * So this renders the row and samples all three corners, plus a control at
 * each: the shape being replaced must fail the corners it did not have.
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
/** `--wb-chrome-bg`, and the canvas surround. */
const CHROME = [0x17, 0x17, 0x17]

const page = (shape) => `<!doctype html><html><head><meta charset="utf-8"><style>
*{box-sizing:border-box;margin:0}html,body{height:100%;overflow:hidden}
body{background:#888}
.bar{height:${BAR}px;background:rgb(${CHROME})}
/* the row paints the bar's colour: the two wedges are all that is ever seen */
.row{display:flex;height:${H - BAR}px;background:rgb(${CHROME})}
.side{width:${SIDE}px;background:#fff;border-right:1px solid #e5e7eb;overflow:hidden;flex:none}
.canvas{flex:1;background:#eceef1;overflow:hidden}
.card{width:100%;height:100%;background:#fff}
${shape === "after"
    ? `.side{border-top-left-radius:${R}px}
       .canvas{border-top-left-radius:${R}px;border-top-right-radius:${R}px}
       .card{border-top-left-radius:${R}px;border-top-right-radius:${R}px}`
    : /* the shape it replaces: the outer two, with the seam left square */
      `.side{border-top-left-radius:${R}px}
       .canvas{border-top-right-radius:${R}px}
       .card{border-top-right-radius:${R}px}`}
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

const isChrome = (p) => p.every((v, i) => Math.abs(v - CHROME[i]) < 14)

/**
 * Of the pixels an arc at this corner should have cut away, how many are the
 * bar showing through. The sample is the corner's bounding box minus the
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
      if (isChrome(img.at(x, y))) bar++
    }
  }
  return { bar, total }
}

/**
 * The seam turns too. The canvas's own top-left arc starts one pixel right of
 * the sidebar's border, so the wedge to sample is the corner box that begins
 * there — everything outside the quarter disc must be the bar.
 */
function seamWedge(img) {
  const left = SIDE + 1
  const cx = left + R
  const cy = BAR + R
  let bar = 0, total = 0
  for (let x = left; x < left + R; x++) {
    for (let y = BAR; y < BAR + R; y++) {
      if (Math.hypot(x + 0.5 - cx, y + 0.5 - cy) <= R + 0.5) continue
      total++
      if (isChrome(img.at(x, y))) bar++
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
    return { left: wedge(img, "left"), right: wedge(img, "right"), seam: seamWedge(img) }
  }
  const after = read("after")
  const before = read("before")

  console.log("\nthe workspace turns at every place it meets the chrome\n")

  // Antialiasing blends the boundary ring, so a pixel or two on the arc is
  // not a square corner. Most of the wedge has to be the bar.
  const ratio = (m) => m.bar / m.total
  expect(ratio(after.left) > 0.75, "the sidebar turns at the screen's left edge, onto the bar",
    `${after.left.bar} of ${after.left.total} wedge pixels are the bar`)
  expect(ratio(after.seam) > 0.75, "the canvas turns where it meets the sidebar, onto the bar",
    `${after.seam.bar} of ${after.seam.total} wedge pixels are the bar`)
  expect(ratio(after.right) > 0.75, "the canvas turns at the screen's right edge, onto the bar",
    `${after.right.bar} of ${after.right.total} wedge pixels are the bar`)

  // The control: the shape this replaces had the outer two and a square seam,
  // which is the half of the junction that kept being reported.
  expect(ratio(before.seam) < 0.1,
    "the shape it replaces left the seam square, so this is a real measurement",
    `the control's seam was already ${before.seam.bar}/${before.seam.total}`)

  console.log(`\n  after    left ${after.left.bar}/${after.left.total}   seam ${after.seam.bar}/${after.seam.total}   right ${after.right.bar}/${after.right.total}`)
  console.log(`  before   left ${before.left.bar}/${before.left.total}   seam ${before.seam.bar}/${before.seam.total}   right ${before.right.bar}/${before.right.total}\n`)
} finally {
  rmSync(out, { recursive: true, force: true })
}

process.exit(broken ? 1 : 0)
