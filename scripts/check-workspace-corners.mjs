/**
 * ===========================================================================
 *  TWO RINGS OF CORNERS, AND A TONE BEHIND EACH
 * ===========================================================================
 * This builder has corners in two places, and every attempt so far has served
 * one ring at the expense of the other: the four on the OUTSIDE, where the
 * workspace meets the screen, and the ones at the SEAM, where the panels meet
 * each other.
 *
 * An arc is only visible if what it opens onto differs from what is beside
 * it, which is why so many of those attempts were "clipped correctly and
 * still square to the eye". Two rings need two backdrops, so there are three
 * tones: the panels, the row they sit in, and the root behind the row.
 *
 *   #ffffff / #eef1f5   the panels
 *   #d9dee6             the row: what the seam's arcs open onto
 *   #eef1f5             the root: what the outer arcs open onto
 *
 * So this samples six places: four outer corners, and both sides of the seam.
 * The control is the shape it replaces, which had a flat seam.
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
/** The editor root: what the four OUTER arcs open onto. */
const ROOT = [0xee, 0xf1, 0xf5]
/** The row between the panels: what the SEAM's arcs open onto. */
const GAP = [0xd9, 0xde, 0xe6]
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
     display:flex;background:rgb(${GAP});overflow:hidden}
.side{width:${SIDE}px;background:#fff;flex:none}
.divider{position:absolute;left:${SIDE - 1}px;top:${SEAM_R}px;bottom:0;width:1px;background:#e5e7eb;z-index:10}
.canvas{flex:1;position:relative;background:rgb(${CANVAS});overflow:hidden}
/* the site's own content: dark on purpose, so the boundary between the
   reversed corner's white and the page it meets is unambiguous */
.card{width:100%;height:100%;background:#111827}
${shape === "after"
    ? /* the row owns the outside, the panels own the seam */
      `.row{border-radius:${R}px}
       .card{border-top-left-radius:${SEAM_R}px}
       .fill{position:absolute;top:0;left:0;width:${SEAM_R}px;height:${SEAM_R}px;z-index:90;
             background:radial-gradient(circle ${SEAM_R}px at 100% 100%, rgba(255,255,255,0) 0 98%, #ffffff 100%)}`
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
  for (let x = box.left + SIDE - 2; x <= box.left + SIDE + 1; x++) {
    for (let y = box.top; y < box.top + SEAM_R; y++) if (isDivider(img.at(x, y))) n++
  }
  return n
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
    }
  }

  const after = read("after")
  const before = read("before")

  console.log("\ntwo rings of corners, and a tone behind each\n")

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
    expect(ratio(after[key]) > 0.75, `the workspace turns at ${name}, onto the root`,
      `${after[key].bar} of ${after[key].total} wedge pixels are the root`)
  }
  expect(after.seamGap === 0, "the reversed corner fills the wedge the canvas's arc leaves",
    `${after.seamGap} pixels of the row still showing at the junction`)
  expect(after.seamProfile.travel >= SEAM_R - 6, "and it fills it along a curve, not as a square corner",
    `the white edge moved ${after.seamProfile.travel}px down the junction, so it is not tracing the arc`)

  expect(after.cornerDivider === 0, "and no hairline runs through the corner it has just drawn",
    `${after.cornerDivider} divider pixels inside the arc`)
  expect(before.cornerDivider > 0, "the full-height hairline did cut across it, so this is a real measurement",
    "the control had no divider in the corner either")

  // The control: two panels curving away from each other leave the lens that
  // was reported as a notch.
  expect(before.seamGap > 0, "two panels curving away from each other left a gap, so this is a real measurement",
    "the control had no gap either")

  const lum = ([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b
  const outerSep = Math.abs(lum(ROOT) - lum(GAP))
  const seamSep = Math.abs(lum([255, 255, 255]) - lum(GAP))
  expect(outerSep >= 12, "the root is far enough from the row for the outer arcs to read",
    `only ${outerSep.toFixed(1)} points of luminance`)
  expect(seamSep >= 24, "and the row far enough from the panels to be seen where it does show",
    `only ${seamSep.toFixed(1)} points of luminance`)

  console.log(`\n  root to row:   ${outerSep.toFixed(1)} points of luminance`)
  console.log(`  row to panel:  ${seamSep.toFixed(1)} points`)
  const cols = (m) => OUTER.map(([k]) => `${m[k].bar}/${m[k].total}`).join("  ") +
    `   seam gap ${m.seamGap}, curve ${m.seamProfile.travel}px of ${SEAM_R}, divider ${m.cornerDivider}`
  console.log(`  after    ${cols(after)}`)
  console.log(`  before   ${cols(before)}\n`)
} finally {
  rmSync(out, { recursive: true, force: true })
}

process.exit(broken ? 1 : 0)
