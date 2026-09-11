/**
 * ===========================================================================
 *  THE CORNER AT THE SEAM SHOWS THE WORKSPACE, NOT THE SIDEBAR
 * ===========================================================================
 * There is one arc in the editor. It is where the sidebar ends and the page
 * begins, and the question that took eleven attempts to answer is what is on
 * the other side of it.
 *
 * The answer that kept being wrong was "the sidebar's white". Flowing one
 * panel's surface into another around a reversed curve is a real technique and
 * it works where the two surfaces are close in tone. Here the surface past the
 * arc is whatever site somebody is building, so a white wedge wired between a
 * dark top bar and a dark site header reads as a chip of the sidebar broken
 * off into the page. Five fills were tried in that wedge and each one was
 * wrong for a different page.
 *
 * Nothing fills it. The page is a card with a rounded corner, and a rounded
 * corner reveals what the card is sitting on, which is the workspace. That is
 * the same grey as the bar above it, so the corner reads as the bar's own
 * surface turning down into the seam, and it is right whatever colour the page
 * is. What is drawn there is a line: one pixel on the arc, transparent either
 * side, which is the card's edge for the pages light enough to need one.
 *
 * So this measures five things — the screen's corners are square, the wedge is
 * the workspace and not the sidebar, the wedge traces the arc rather than
 * squaring off, the hairline runs the whole seam and meets the arc where the
 * arc is already vertical, and the line carries on across the top instead of
 * stopping when the corner ends. Two controls: the white fill this replaces,
 * and the two-panels-curving-away shape before that.
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

/** `rounded-2xl`, the seam's radius, the bar's height, the sidebar, the viewport. */
const R = 16, SEAM_R = 22, BAR = 44, SIDE = 160, W = 560, H = 300
/** The workspace, which is also the root and what the corner should reveal. */
const SHELL = [0xee, 0xf1, 0xf5]

/**
 * Three shapes.
 *
 *   after     nothing in the wedge, a line on the arc, a full-height hairline
 *   white     the reversed corner: the sidebar's white flowed into the wedge
 *   rounded   both panels curving away from each other, which leaves a lens
 */
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
body{background:rgb(${SHELL})}
.bar{position:fixed;left:0;right:0;top:0;height:${BAR}px;background:#171717}
.row{position:fixed;left:0;right:0;top:${BAR}px;bottom:0;
     display:flex;background:rgb(${SHELL});overflow:hidden}
.side{width:${SIDE}px;background:#fff;flex:none}
.divider{position:absolute;left:${SIDE - 1}px;top:0;bottom:0;width:1px;background:#e5e7eb;z-index:10}
/* the canvas is square and the workspace's colour: what the card's radius
   reveals is this, and it is the same grey as the bar's surroundings */
.canvas{flex:1;position:relative;background:rgb(${SHELL});overflow:hidden}
/* the site's own content, dark on purpose: a wedge of the wrong colour beside
   a page like this is exactly what was reported */
.card{width:100%;height:100%;background:#111827;border-top-left-radius:${SEAM_R}px}
.fill{position:absolute;top:0;left:0;width:${SEAM_R}px;height:${SEAM_R}px;z-index:90}
.top{display:none;position:absolute;top:0;left:${SEAM_R}px;right:0;height:1px;background:#e5e7eb;z-index:90}
${shape === "after"
    ? /* the wedge is left alone and only the card's edge is drawn on it */
      `.fill{background:radial-gradient(circle ${SEAM_R}px at 100% 100%,
         rgba(255,255,255,0) 0 95%, #e5e7eb 95.6% 99.6%, rgba(255,255,255,0) 100%)}
       .top{display:block}`
    : shape === "white"
    ? /* the reversed corner: the same ring, but the sidebar's white past it,
         and the hairline held back so as not to cut the fill */
      `.fill{background:radial-gradient(circle ${SEAM_R}px at 100% 100%,
         rgba(255,255,255,0) 0 95%, #e5e7eb 95.6% 99.6%, #ffffff 100%)}
       .divider{top:${SEAM_R}px}`
    : /* both panels curving away, plus the outer radius that chipped the
         screen's own corners */
      `.row{border-radius:${R}px}
       .side{border-top-right-radius:${SEAM_R}px}
       .canvas{border-top-left-radius:${SEAM_R}px}
       .fill{display:none}`}
</style></head><body>
<div class="bar"></div>
<div class="row"><div class="side"></div><div class="canvas"><div class="card"></div><i class="fill"></i><i class="top"></i></div><i class="divider"></i></div>
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
 * Tight on purpose. The divider is #e5e7eb, a few points from the shell's
 * #eef1f5: at a loose tolerance the hairline column counts as shell and a
 * square corner with a line beside it scores for nothing.
 */
const isShell = (p) => p.every((v, i) => Math.abs(v - SHELL[i]) < 2)
const isWhite = (p) => p.every((v) => v > 250)
const isDivider = (p) => Math.abs(p[0] - 0xe5) < 4 && Math.abs(p[1] - 0xe7) < 4 && Math.abs(p[2] - 0xeb) < 4

/**
 * Of the pixels an arc at a screen corner would cut away, how many show the
 * root. The sample is the corner's bounding box minus the quarter disc, so it
 * counts only what falls outside the workspace's shape.
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
      if (isShell(img.at(x, y))) bar++
    }
  }
  return { bar, total }
}

/**
 * WHAT IS IN THE WEDGE.
 *
 * The wedge is the part of the seam's 22px box that the card's radius takes
 * away: everything further from the arc's centre than its radius. Three
 * pixels of slack keeps the ring and its antialiasing out of the count, so
 * this is about the surface past the arc and not about the line on it.
 */
function wedge(img, box) {
  const cx = box.left + SIDE + SEAM_R, cy = box.top + SEAM_R
  let shell = 0, white = 0, total = 0
  for (let x = box.left + SIDE; x < box.left + SIDE + SEAM_R; x++) {
    for (let y = box.top; y < box.top + SEAM_R; y++) {
      if (Math.hypot(x + 0.5 - cx, y + 0.5 - cy) <= SEAM_R + 3) continue
      total++
      if (isShell(img.at(x, y))) shell++
      else if (isWhite(img.at(x, y))) white++
    }
  }
  return { shell, white, total }
}

/**
 * And that it is a curve, not a square corner painted the right colour. This
 * walks down the junction and records how far the workspace reaches into it:
 * against a square corner that number never moves, and against the arc it
 * tapers from the full radius to nothing.
 */
function shellProfile(img, box) {
  const edges = []
  for (let y = box.top; y < box.top + SEAM_R; y++) {
    let x = 0
    while (x < SEAM_R && isShell(img.at(box.left + SIDE + x, y))) x++
    edges.push(x)
  }
  return { edges, travel: Math.max(...edges) - Math.min(...edges) }
}

/**
 * The hairline runs the whole seam. Counted in the divider's own column over
 * the top 22 rows, stopping three short of the arc's vertical tangent at
 * (0, R), where the arc's own line takes over and the two blend.
 */
function dividerAtCorner(img, box) {
  let n = 0
  for (let y = box.top; y < box.top + SEAM_R - 3; y++) {
    if (isDivider(img.at(box.left + SIDE - 1, y))) n++
  }
  return n
}

/**
 * The card's edge is drawn on the arc. Walking from the arc's vertical
 * tangent at (0, R) round to its horizontal one at (R, 0), every step should
 * land on the line: one continuous edge that leaves the straight hairline
 * where the hairline is already going the same way.
 */
function arcLine(img, box) {
  let on = 0, total = 0
  for (let deg = 0; deg <= 90; deg += 3) {
    const t = (deg * Math.PI) / 180
    const cx = box.left + SIDE + SEAM_R
    const cy = box.top + SEAM_R
    const x = Math.round(cx - SEAM_R * Math.cos(t))
    const y = Math.round(cy - SEAM_R * Math.sin(t))
    total++
    for (const d of [0, -1, 1]) {
      if (isDivider(img.at(x + d, y))) { on++; break }
    }
  }
  return { on, total }
}

/**
 * The line does not stop when it runs out of corner. From the arc's
 * horizontal tangent at (R, 0) out to the far side of the canvas, the card's
 * top edge should carry the same hairline: one edge down the seam, round the
 * turn and along the top, rather than a 22px flourish and then nothing.
 */
function topEdge(img, box) {
  let on = 0, total = 0
  for (let x = box.left + SIDE + SEAM_R; x < box.right - 1; x++) {
    total++
    if (isDivider(img.at(x, box.top)) || isDivider(img.at(x, box.top + 1))) on++
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
      wedge: wedge(img, box),
      shellProfile: shellProfile(img, box),
      dividerAtCorner: dividerAtCorner(img, box),
      arcLine: arcLine(img, box),
      topEdge: topEdge(img, box),
    }
  }

  const after = read("after")
  const white = read("white")
  const rounded = read("rounded")

  console.log("\nthe corner at the seam shows the workspace, not the sidebar\n")

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
  expect(OUTER.some(([key]) => rounded[key].bar > 0),
    "the rounded row did cut those chips, so this is a real measurement",
    "the control had square corners too")

  // The whole point. What is past the arc is the workspace, and none of it is
  // the panel beside it.
  expect(after.wedge.white === 0, "no part of the sidebar is left sitting in the page's corner",
    `${after.wedge.white} of ${after.wedge.total} pixels there are the sidebar's white`)
  expect(after.wedge.shell / after.wedge.total > 0.9, "the corner shows the workspace, the same surface as the bar above it",
    `only ${after.wedge.shell} of ${after.wedge.total} pixels are the workspace`)
  expect(white.wedge.white > 0, "the fill did put the sidebar's white there, so this is a real measurement",
    "the control had no white in the corner either")

  // And it is the arc's shape, not a square corner in the right colour.
  expect(after.shellProfile.travel >= SEAM_R - 6, "and it is the card's curve, not a square corner painted grey",
    `the edge moved ${after.shellProfile.travel}px down the junction, so it is not tracing the arc`)

  // The card's own edge, for pages too light to show one by contrast.
  expect(after.arcLine.on / after.arcLine.total > 0.9, "the card's edge is drawn all the way round the arc",
    `${after.arcLine.on} of ${after.arcLine.total} points along the arc carry the line`)
  expect(rounded.arcLine.on / rounded.arcLine.total < 0.2,
    "the straight-only hairline did not follow the arc, so this is a real measurement",
    `the control already had ${rounded.arcLine.on} of ${rounded.arcLine.total}`)

  expect(after.topEdge.on / after.topEdge.total > 0.95, "and it carries on across the top rather than stopping when the corner ends",
    `${after.topEdge.on} of ${after.topEdge.total} pixels of the card's top edge carry it`)
  expect(white.topEdge.on / white.topEdge.total < 0.05, "the line used to stop 22px in, so this is a real measurement",
    `the control already drew ${white.topEdge.on} of ${white.topEdge.total}`)

  // The hairline divides the two panels for the whole of the seam, including
  // the part of it beside the corner, because up there they still meet.
  expect(after.dividerAtCorner >= SEAM_R - 5, "and the hairline runs the whole seam rather than starting below the corner",
    `only ${after.dividerAtCorner} of the top ${SEAM_R - 3} rows carry it`)
  expect(white.dividerAtCorner === 0, "it used to start below the corner, so this is a real measurement",
    `the control already ran ${white.dividerAtCorner} rows up`)

  console.log("")
  const cols = (m) => OUTER.map(([k]) => `${m[k].bar}/${m[k].total}`).join("  ") +
    `   wedge ${m.wedge.shell} shell / ${m.wedge.white} white of ${m.wedge.total}` +
    `, curve ${m.shellProfile.travel}px of ${SEAM_R}, seam ${m.dividerAtCorner}` +
    `, arc ${m.arcLine.on}/${m.arcLine.total}, top ${m.topEdge.on}/${m.topEdge.total}`
  console.log(`  after     ${cols(after)}`)
  console.log(`  white     ${cols(white)}`)
  console.log(`  rounded   ${cols(rounded)}\n`)
} finally {
  rmSync(out, { recursive: true, force: true })
}

process.exit(broken ? 1 : 0)
