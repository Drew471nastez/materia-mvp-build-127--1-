/**
 * ===========================================================================
 *  THE WORKSPACE IS ONE ROUNDED SLAB, AND THE SEAM INSIDE IT IS FLAT
 * ===========================================================================
 * The rounding was in the wrong place every time, and each attempt moved it
 * somewhere equally wrong: one corner of the canvas, then two, then all four
 * of the top corners across both panels. Every one of those puts an arc in
 * the MIDDLE of the workspace, where the sidebar meets the canvas. Two panels
 * curving away from each other leave a wedge between them that narrows
 * downward, and a wedge is a notch — a bite out of the row, not a corner.
 *
 * A divider is a divider. The corners belong on the OUTSIDE, where the
 * workspace meets the screen, and there are four of them: left and right, top
 * and bottom. The row carries the radius and the clip, the panels inside it
 * are square, and the seam between them is a hairline.
 *
 * So this samples the four outer corners, which must show the backdrop, and
 * the seam, which must show none of it. The shape it replaces is the control:
 * it had nothing at the outer corners and a wedge at the seam.
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
/** What the workspace's four corners open onto: the editor root. */
const GAP = [0xd9, 0xde, 0xe6]
/** The workspace itself, which is the thing with the radius. */
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
/* the editor root: only ever seen inside the four arcs */
body{background:rgb(${GAP})}
.bar{position:fixed;left:0;right:0;top:0;height:${BAR}px;background:#171717}
.row{position:fixed;left:0;right:0;top:${BAR}px;bottom:0;
     display:flex;background:rgb(${CANVAS});overflow:hidden}
.side{width:${SIDE}px;background:#fff;border-right:1px solid #e5e7eb;flex:none}
.canvas{flex:1;background:rgb(${CANVAS})}
.card{width:100%;height:100%;background:#fff}
${shape === "after"
    ? /* the row is the rounded thing, and everything in it is square */
      `.row{border-radius:${R}px}`
    : /* the shape it replaces: every panel rounded at the top, the row not */
      `.side{border-top-left-radius:${R}px;border-top-right-radius:${R}px}
       .canvas{border-top-left-radius:${R}px;border-top-right-radius:${R}px}
       .card{border-top-left-radius:${R}px;border-top-right-radius:${R}px}`}
</style></head><body>
<div class="bar"></div>
<div class="row"><div class="side"></div><div class="canvas"><div class="card"></div></div></div>
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
      if (isGap(img.at(x, y))) bar++
    }
  }
  return { bar, total }
}

/**
 * The seam is a divider and must carry no arc at all. What a wedge there is
 * made of is the ROW showing between two panels that have curved away from
 * each other, so that is what to count: workspace-coloured pixels in the
 * junction, under the bar, where there should be panel, hairline and nothing
 * else.
 */
const isWorkspace = (p) => p.every((v, i) => Math.abs(v - CANVAS[i]) < 5)
function seamWedge(img, box) {
  let n = 0
  for (let x = box.left + SIDE - R; x < box.left + SIDE + R; x++) {
    for (let y = box.top; y < box.top + R; y++) if (isWorkspace(img.at(x, y))) n++
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
      seam: seamWedge(img, box),
    }
  }

  const after = read("after")
  const before = read("before")

  console.log("\nthe workspace is one rounded slab, and the seam inside it is flat\n")

  // Antialiasing blends the boundary ring, so a pixel or two on the arc is
  // not a square corner. Most of the wedge has to be the backdrop.
  const ratio = (m) => m.bar / m.total
  const CORNERS = [
    ["topLeft", "the top left"],
    ["topRight", "the top right"],
    ["bottomLeft", "the bottom left"],
    ["bottomRight", "the bottom right"],
  ]
  for (const [key, name] of CORNERS) {
    expect(ratio(after[key]) > 0.75, `the workspace turns at ${name}`,
      `${after[key].bar} of ${after[key].total} wedge pixels are the backdrop`)
  }
  expect(after.seam === 0, "and carries no arc at the seam, because a divider is a divider",
    `${after.seam} pixels of the row showing through the junction`)

  // The control: panels rounded individually have nothing at the outside and
  // a wedge in the middle, which is the notch that was reported.
  expect(CORNERS.every(([key]) => ratio(before[key]) < 0.1) && before.seam > 0,
    "rounding the panels instead left the outside square and put a wedge at the seam",
    `seam ${before.seam}, corners ${CORNERS.map(([k]) => `${before[k].bar}/${before[k].total}`).join(" ")}`)

  const lum = ([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b
  const separation = lum(CANVAS) - lum(GAP)
  expect(separation >= 12, "and the backdrop is far enough from the workspace for a 16px arc to read",
    `only ${separation.toFixed(1)} points of luminance between them`)

  console.log(`\n  backdrop to workspace: ${separation.toFixed(1)} points of luminance`)
  const cols = (m) => CORNERS.map(([k]) => `${m[k].bar}/${m[k].total}`).join("  ") + `   seam ${m.seam}`
  console.log(`  after    ${cols(after)}`)
  console.log(`  before   ${cols(before)}\n`)
} finally {
  rmSync(out, { recursive: true, force: true })
}

process.exit(broken ? 1 : 0)
