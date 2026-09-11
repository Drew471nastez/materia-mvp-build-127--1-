/**
 * ===========================================================================
 *  ONE ARC IN THE WHOLE EDITOR, AND IT IS THE SEAM
 * ===========================================================================
 * The workspace carried four corners at the screen's edges as well, and every
 * one of them was a chip taken out of the page. An arc at the edge of the
 * screen has nothing behind it but the root: against a dark site header it
 * reads as a bright notch bitten out of the top right, and against a light one
 * it reads as nothing at all. There is nothing there for a corner to turn away
 * FROM.
 *
 * The one place two surfaces actually meet is the seam, where the sidebar ends
 * and the canvas begins. The canvas turns there, and the panel beside it fills
 * what that turn leaves behind with a REVERSED corner: a box of its own colour
 * with the arc's own circle taken out of it, so the flat surface flows into
 * the corner along exactly the curve the canvas turns on. Rounding the second
 * panel instead would not close the gap, it would double it, and two arcs
 * curving away from each other leave a lens.
 *
 * So this measures the seam three ways — the gap is closed, the fill traces a
 * curve rather than filling a square, and no hairline cuts across it — and the
 * screen's corners are square. The control is the shape it replaces.
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
const R = 16, SEAM_R = 22, BAR = 44, SIDE = 160, W = 560, H = 300
/** The workspace, which is also the root: nothing is cut away from it now. */
const ROOT = [0xee, 0xf1, 0xf5]
/** What a gap at the seam would show, if the reversed corner left one. */
const GAP = [0xee, 0xf1, 0xf5]
/** The canvas panel, beside the white sidebar. */
const CANVAS = [0xee, 0xf1, 0xf5]

const page = (shape) => `<!doctype html><html><head><meta charset="utf-8"><style>
*{box-sizing:border-box;margin:0}
/**
 * Pinned to the VIEWPORT, and the viewport is then measured rather than
 * assumed. Headless counts window chrome in --window-size: ask for 300 and
 * the layout viewport is 213 while the screenshot is still 300 tall, so
 * anything sized to the viewport ends 87px above the bottom of the image and
 * a bottom corner sampled from the image is 87px of empty page. The fixture
 * reports its own rectangle and the assertions sample that.
 */
html,body{height:100%;overflow:hidden}
/* the editor root: only ever seen inside the four outer arcs */
body{background:rgb(${ROOT})}
.bar{position:fixed;left:0;right:0;top:0;height:${BAR}px;background:#171717}
.row{position:fixed;left:0;right:0;top:${BAR}px;bottom:0;
     display:flex;background:rgb(${ROOT});overflow:hidden}
.side{width:${SIDE}px;background:#fff;flex:none}
.divider{position:absolute;left:${SIDE - 1}px;top:${SEAM_R}px;bottom:0;width:1px;background:#e5e7eb;z-index:10}
.canvas{flex:1;position:relative;background:rgb(${CANVAS});overflow:hidden}
/* the site's own content: dark on purpose, so the boundary between the
   reversed corner's white and the page it meets is unambiguous */
.card{width:100%;height:100%;background:#111827}
${shape === "after"
    ? /* square at the screen's edges; the only arc is the seam's */
      `.card{border-top-left-radius:${SEAM_R}px}
       .fill{position:absolute;top:0;left:0;width:${SEAM_R}px;height:${SEAM_R}px;z-index:90;
             background:radial-gradient(circle ${SEAM_R}px at 100% 100%, rgba(255,255,255,0) 0 95%, #e5e7eb 95.6% 99.6%, #ffffff 100%)}`
    : /* the shape it replaces: the two panels curving AWAY from each other,
         which leaves the lens-shaped wedge that was reported as a notch */
      `.row{border-radius:${R}px}
       .side{border-top-right-radius:${SEAM_R}px}
       .canvas{border-top-left-radius:${SEAM_R}px}
       .card{border-top-left-radius:${SEAM_R}px}
       .fill{display:none}
       .divider{top:0}`}
</style></head><body>
<div class="bar"></div>
<div class="row"><div class="side"></div><div class="canvas"><div class="card"></div><i class="fill"></i></div><i class="divider"></i></div>
<script>
const r = document.querySelector(".row").getBoundingClientRect()
document.title = JSON.stringify({ left: Math.round(r.left), right: Math.round(r.right), top: Math.round(r.top), bottom: Math.round(r.bottom) })
</script>
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
const isRoot = (p) => p.every((v, i) => Math.abs(v - ROOT[i]) < 2)

/**
 * Of the pixels an arc at this corner should have cut away, how many show the
 * backdrop. The sample is the corner's bounding box minus the quarter disc,
 * so it counts only what falls outside the workspace's shape.
 */
function corner(img, box, side, edge) {
  const x0 = side === "left" ? box.left : box.right - R
  const cx = side === "left" ? box.left + R : box.right - R
  const y0 = edge === "top" ? box.top : box.bottom - R
  const cy = edge === "top" ? box.top + R : box.bottom - R
  let bar = 0, total = 0
  for (let x = x0; x < x0 + R; x++) {
    for (let y = y0; y < y0 + R; y++) {
      if (Math.hypot(x + 0.5 - cx, y + 0.5 - cy) <= R + 0.5) continue
      total++
      if (isRoot(img.at(x, y))) bar++
    }
  }
  return { bar, total }
}

/**
 * THE SEAM, MEASURED TWO WAYS.
 *
 * `wedge` is how much of the row shows through the junction: a rounded panel
 * curving away leaves a gap, and the reversed corner beside it fills that gap
 * with the flat panel's own colour, so the answer has to be zero.
 *
 * `isArc` is the other half, and it is the one that matters. Zero gap is also
 * what a plain square corner gives, so filling it proves nothing on its own.
 * This walks down the junction row by row and records where the white ends:
 * against a square corner that x never moves, and against a reversed one it
 * traces the same curve the canvas arcs away on.
 */
function seamFill(img, box) {
  let n = 0
  for (let x = box.left + SIDE; x < box.left + SIDE + SEAM_R; x++) {
    for (let y = box.top; y < box.top + SEAM_R; y++) if (isGap(img.at(x, y))) n++
  }
  return n
}

const isWhite = (p) => p.every((v) => v > 250)
function seamProfile(img, box) {
  const edges = []
  for (let y = box.top; y < box.top + SEAM_R; y++) {
    // From the seam RIGHTWARDS, which is the direction the fill runs: the
    // white reaches furthest at the top and tapers to nothing at the bottom.
    // Scanning the other way stops on the arc's own antialiasing in the first
    // pixel it tests and reports a straight edge for every row.
    let x = 0
    while (x < SEAM_R && isWhite(img.at(box.left + SIDE + x, y))) x++
    edges.push(x)
  }
  return { edges, travel: Math.max(...edges) - Math.min(...edges) }
}

/**
 * The hairline must not run through the corner. Counted as divider-coloured
 * pixels in the top SEAM_R rows of the junction, where one surface is curving
 * into the other and there is nothing to divide.
 */
const isDivider = (p) => Math.abs(p[0] - 0xe5) < 4 && Math.abs(p[1] - 0xe7) < 4 && Math.abs(p[2] - 0xeb) < 4
function dividerInCorner(img, box) {
  let n = 0
  // The two columns at the seam itself, and stopping three pixels short of
  // the arc's vertical tangent at (0, R) — which is the one place the line is
  // SUPPOSED to be in this column, where it turns into the straight hairline.
  for (let x = box.left + SIDE - 1; x <= box.left + SIDE; x++) {
    for (let y = box.top; y < box.top + SEAM_R - 3; y++) if (isDivider(img.at(x, y))) n++
  }
  return n
}

/**
 * The divider has to turn the corner, not stop before it. Walking the arc
 * from its vertical tangent at (0, R) round to its horizontal one at (R, 0),
 * every step should land on divider grey: that is one continuous line down
 * the seam and out along the top, with nothing between it and the straight
 * hairline below.
 */
function arcLine(img, box) {
  let on = 0, total = 0
  for (let deg = 0; deg <= 90; deg += 3) {
    const t = (deg * Math.PI) / 180
    // centre of the arc, in image coordinates
    const cx = box.left + SIDE + SEAM_R
    const cy = box.top + SEAM_R
    const x = Math.round(cx - SEAM_R * Math.cos(t))
    const y = Math.round(cy - SEAM_R * Math.sin(t))
    total++
    // a pixel on the line, or either of its two neighbours across the arc
    for (const d of [0, -1, 1]) {
      if (isDivider(img.at(x + d, y))) { on++; break }
    }
  }
  return { on, total }
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
    // One pass to ask the page where it actually is, one to photograph it.
    const dom = execFileSync(
      CHROMIUM,
      ["--headless=new", "--no-sandbox", "--disable-gpu", `--window-size=${W},${H}`,
       "--virtual-time-budget=1200", "--dump-dom", `file://${html}`],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    )
    const title = dom.match(/<title>(.*?)<\/title>/)
    if (!title) fail("the fixture never reported its own rectangle")
    const box = JSON.parse(title[1])
    execFileSync(
      CHROMIUM,
      ["--headless=new", "--no-sandbox", "--disable-gpu", `--window-size=${W},${H}`,
       "--virtual-time-budget=1200", `--screenshot=${png}`, `file://${html}`],
      { stdio: "ignore" },
    )
    const img = readPng(png)
    return {
      box,
      topLeft: corner(img, box, "left", "top"),
      topRight: corner(img, box, "right", "top"),
      bottomLeft: corner(img, box, "left", "bottom"),
      bottomRight: corner(img, box, "right", "bottom"),
      seamGap: seamFill(img, box),
      seamProfile: seamProfile(img, box),
      cornerDivider: dividerInCorner(img, box),
      arcLine: arcLine(img, box),
    }
  }

  const after = read("after")
  const before = read("before")

  console.log("\none arc in the whole editor, and it is the seam\n")

  // Antialiasing blends the boundary ring, so a pixel or two on the arc is
  // not a square corner. Most of the wedge has to be what it opens onto.
  const ratio = (m) => m.bar / m.total
  const OUTER = [
    ["topLeft", "the top left"],
    ["topRight", "the top right"],
    ["bottomLeft", "the bottom left"],
    ["bottomRight", "the bottom right"],
  ]
  for (const [key, name] of OUTER) {
    expect(after[key].bar === 0, `nothing is cut out of the page at ${name}`,
      `${after[key].bar} of ${after[key].total} pixels there are the root showing through a chip`)
  }
  expect(OUTER.some(([key]) => before[key].bar > 0),
    "the rounded row did cut those chips, so this is a real measurement",
    "the control had square corners too")
  expect(after.seamGap === 0, "the reversed corner fills the wedge the canvas's arc leaves",
    `${after.seamGap} pixels of the row still showing at the junction`)
  expect(after.seamProfile.travel >= SEAM_R - 6, "and it fills it along a curve, not as a square corner",
    `the white edge moved ${after.seamProfile.travel}px down the junction, so it is not tracing the arc`)

  expect(after.arcLine.on / after.arcLine.total > 0.9, "and the divider turns the corner with it rather than stopping before it",
    `${after.arcLine.on} of ${after.arcLine.total} points along the arc carry the line`)
  expect(before.arcLine.on / before.arcLine.total < 0.2,
    "the straight-only hairline did not follow the arc, so this is a real measurement",
    `the control already had ${before.arcLine.on} of ${before.arcLine.total}`)
  // Two pixels of slack: the arc's own antialiasing reaches the seam column
  // as it turns into the vertical, and a blended pixel is not a straight line.
  expect(after.cornerDivider <= 2, "and no straight hairline cuts across the corner",
    `${after.cornerDivider} straight divider pixels inside the arc`)
  expect(before.cornerDivider > 0, "the full-height hairline did cut across it, so this is a real measurement",
    "the control had no divider in the corner either")

  // The control: two panels curving away from each other leave the lens that
  // was reported as a notch.
  expect(before.seamGap > 0, "two panels curving away from each other left a gap, so this is a real measurement",
    "the control had no gap either")

  console.log("")
  const cols = (m) => OUTER.map(([k]) => `${m[k].bar}/${m[k].total}`).join("  ") +
    `   seam gap ${m.seamGap}, curve ${m.seamProfile.travel}px of ${SEAM_R}, across ${m.cornerDivider}, arc ${m.arcLine.on}/${m.arcLine.total}`
  console.log(`  after    ${cols(after)}`)
  console.log(`  before   ${cols(before)}\n`)
} finally {
  rmSync(out, { recursive: true, force: true })
}

process.exit(broken ? 1 : 0)
