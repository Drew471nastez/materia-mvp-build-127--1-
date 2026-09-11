/**
 * ===========================================================================
 *  THE SEAM HAS TWO TONES IN IT, NOT THREE
 * ===========================================================================
 * Eleven rounds went into what to paint in the wedge the canvas's corner opens
 * onto: the bar's dark, the workspace's grey, a second arc curving the other
 * way, the sidebar's white. Every one was rejected, and they were all wrong
 * for the same reason, which was never the fill.
 *
 * The surround had a tone of its own. Give the space around the panels a
 * colour and the corner where one of them turns MUST open onto a third thing,
 * and no amount of drawing makes a third thing look like it belongs between
 * two panels that are both white.
 *
 * So the surround is white, the same white as the sidebar beside it and the
 * bar above it. The corner opens onto the sidebar's own colour with nothing
 * painted to make it do so. What is left to draw is the page's edge: a pixel
 * on the arc, and along the top the bar's own border, which already runs the
 * full width.
 *
 * That makes the claim measurable in a way none of the earlier ones were. It
 * is not about the shape of the fill. It is that THE BAR, THE SIDEBAR AND THE
 * WEDGE ARE ONE COLOUR, so the seam holds two tones — that white and the page
 * — and the only thing dividing them is a hairline. This samples all three and
 * compares them, with the grey surround as the control: there they differ, and
 * that difference is the wedge every round was reported for.
 *
 * Then the geometry, which still has to hold: the screen's corners are square,
 * the wedge is the arc's shape and not a square corner, the hairline runs the
 * whole seam, and the page's edge is drawn round the turn.
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

/** The seam's radius, which is also the card's; the bar, sidebar, viewport. */
const SEAM_R = 16, BAR = 44, SIDE = 160, W = 560, H = 300
/**
 * The shapes. `after` is what ships; the rest are controls, each failing one
 * assertion so that assertion is known to be measuring something.
 *
 *   after       white surround, a dark page: the geometry
 *   light       white surround, a page the SAME white: the edge's whole job
 *   lightbare   the same without the edge: no corner at all
 *   grey        a surround with a tone of its own: the wedge
 *   rounded     both panels curving away, and the chipped screen corners
 */
const SHAPES = {
  after: { surround: "#ffffff", paper: "#111827", ring: true, roundRow: false },
  light: { surround: "#ffffff", paper: "#ffffff", ring: true, roundRow: false },
  lightbare: { surround: "#ffffff", paper: "#ffffff", ring: false, roundRow: false },
  grey: { surround: "#eef1f5", paper: "#111827", ring: true, roundRow: false },
  rounded: { surround: "#eef1f5", paper: "#111827", ring: false, roundRow: true },
}
/**
 * Behind everything, and never meant to be seen: the bar covers the top of it
 * and the row the rest. A colour nothing else in the editor uses, so "is any
 * of the root visible?" is a question a screenshot can answer. It could not be
 * asked while the root was the same grey as the surround, and cannot be asked
 * at all now the surround is the same white as the panels.
 */
const SENTINEL = [0xff, 0x00, 0xff]

const page = (name) => { const sh = SHAPES[name]; return `<!doctype html><html><head><meta charset="utf-8"><style>
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
body{background:rgb(${SENTINEL})}
/* the bar, and its border is the card's top edge: one hairline, full width */
.bar{position:fixed;left:0;right:0;top:0;height:${BAR}px;background:#fff;
     border-bottom:1px solid #e5e7eb}
.row{position:fixed;left:0;right:0;top:${BAR}px;bottom:0;
     display:flex;background:${sh.surround};overflow:hidden}
.side{width:${SIDE}px;background:#fff;flex:none}
.divider{position:absolute;left:${SIDE - 1}px;top:0;bottom:0;width:1px;background:#e5e7eb;z-index:10}
/* square, and the surround's colour: what the card's radius reveals is this */
.canvas{flex:1;position:relative;background:${sh.surround};overflow:hidden}
/* the site's own content, dark on purpose: a wedge of the wrong colour beside
   a page like this is exactly what was reported */
.card{width:100%;height:100%;background:${sh.paper};border-top-left-radius:${SEAM_R}px}
.fill{position:absolute;top:0;left:0;width:${SEAM_R}px;height:${SEAM_R}px;z-index:90;
      border-top:1px solid #e5e7eb;border-left:1px solid #e5e7eb;
      border-top-left-radius:${SEAM_R}px}
${sh.ring ? "" : ".fill{display:none}"}
${sh.roundRow
    ? `.row{border-radius:${SEAM_R}px}
       .side{border-top-right-radius:${SEAM_R}px}
       .canvas{border-top-left-radius:${SEAM_R}px}`
    : ""}
</style></head><body>
<div class="bar"></div>
<div class="row"><div class="side"></div><div class="canvas"><div class="card"></div><i class="fill"></i></div><i class="divider"></i></div>
<script>
const r = document.querySelector(".row").getBoundingClientRect()
document.title = JSON.stringify({ left: Math.round(r.left), right: Math.round(r.right), top: Math.round(r.top), bottom: Math.round(r.bottom) })
</script>
</body></html>` }

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

const isDivider = (p) => Math.abs(p[0] - 0xe5) < 4 && Math.abs(p[1] - 0xe7) < 4 && Math.abs(p[2] - 0xeb) < 4
const mean = (vals) => [0, 1, 2].map((c) => Math.round(vals.reduce((a, v) => a + v[c], 0) / vals.length))
const apart = (a, b) => Math.max(...[0, 1, 2].map((c) => Math.abs(a[c] - b[c])))

/**
 * THE THREE SURFACES THAT MEET AT THE CORNER.
 *
 * The wedge is the part of the seam's box the card's radius takes away:
 * further from the arc's centre than its radius, with three pixels of slack so
 * the ring and its antialiasing stay out of it. Beside it, the sidebar. Above
 * it, the bar. Each is sampled well inside itself, and the claim is that the
 * three come back the same.
 */
function tones(img, box) {
  const cx = box.left + SIDE + SEAM_R, cy = box.top + SEAM_R
  const wedgePx = []
  for (let x = box.left + SIDE; x < box.left + SIDE + SEAM_R; x++) {
    for (let y = box.top; y < box.top + SEAM_R; y++) {
      if (Math.hypot(x + 0.5 - cx, y + 0.5 - cy) <= SEAM_R + 3) continue
      wedgePx.push(img.at(x, y))
    }
  }
  const sidePx = [], barPx = []
  for (let y = box.top + 4; y < box.top + SEAM_R + 4; y++) {
    for (let x = box.left + SIDE - 40; x < box.left + SIDE - 8; x++) sidePx.push(img.at(x, y))
  }
  for (let y = 8; y < BAR - 8; y++) {
    for (let x = box.left + SIDE + 40; x < box.left + SIDE + 72; x++) barPx.push(img.at(x, y))
  }
  const wedge = mean(wedgePx), side = mean(sidePx), bar = mean(barPx)
  return { wedge, side, bar, count: wedgePx.length, spread: Math.max(apart(wedge, side), apart(wedge, bar), apart(side, bar)) }
}

/**
 * Any of the root showing at a screen corner is a chip taken out of the page.
 * The sample is the corner's box minus the quarter disc, so it counts only
 * what falls outside the workspace's shape, and the root is the sentinel:
 * nothing else in the fixture is that colour, so a single pixel of it is the
 * workspace having been cut away from the screen's edge.
 */
const isSentinel = (p) => p.every((v, i) => Math.abs(v - SENTINEL[i]) < 40)
function corner(img, box, side, edge) {
  const x0 = side === "left" ? box.left : box.right - SEAM_R
  const cx = side === "left" ? box.left + SEAM_R : box.right - SEAM_R
  const y0 = edge === "top" ? box.top : box.bottom - SEAM_R
  const cy = edge === "top" ? box.top + SEAM_R : box.bottom - SEAM_R
  let bar = 0, total = 0
  for (let x = x0; x < x0 + SEAM_R; x++) {
    for (let y = y0; y < y0 + SEAM_R; y++) {
      if (Math.hypot(x + 0.5 - cx, y + 0.5 - cy) <= SEAM_R + 0.5) continue
      total++
      if (isSentinel(img.at(x, y))) bar++
    }
  }
  return { bar, total }
}

/**
 * And that the wedge is a curve, not a square corner in the right colour.
 * This walks down the junction and records how far the surround reaches into
 * it: against a square corner the number never moves, against the arc it
 * tapers from the full radius to nothing. Read as "not the page", since the
 * surround and the sidebar are now the same colour and the page is not.
 */
function shellProfile(img, box) {
  // "not the page", which is the only dark thing at this junction. Testing
  // for white instead stops on the ring and reports the edge a pixel early.
  const light = (p) => p.every((v) => v > 120)
  const edges = []
  for (let y = box.top; y < box.top + SEAM_R; y++) {
    let x = 0
    while (x < SEAM_R && light(img.at(box.left + SIDE + x, y))) x++
    edges.push(x)
  }
  return { edges, travel: Math.max(...edges) - Math.min(...edges) }
}

/**
 * The hairline runs the whole seam. Counted in the divider's own column over
 * the top rows, stopping three short of the arc's vertical tangent at (0, R),
 * where the arc's own line takes over and the two blend.
 */
function dividerAtCorner(img, box) {
  let n = 0
  for (let y = box.top; y < box.top + SEAM_R - 3; y++) {
    if (isDivider(img.at(box.left + SIDE - 1, y))) n++
  }
  return n
}

/**
 * THE PAGE'S EDGE, MEASURED WHERE IT MATTERS.
 *
 * This used to ask whether the pixel on the arc was exactly the line's colour.
 * A one pixel light line following a curve is antialiased along both sides of
 * its whole length, so most of it is a blend and never matches exactly: the
 * question was unanswerable, and against a dark page it is also the wrong one,
 * since a dark page shows its own edge by contrast whatever is drawn on it.
 *
 * The edge exists for the page that is the SAME WHITE as the surround, where
 * nothing marks the corner unless something is drawn. So this asks whether
 * anything at all is drawn: the darkest pixel across the arc, at each step
 * round it. On a white page with no edge that is white everywhere and there is
 * no corner to see; with the edge it is the line, blended or not.
 */
const lum = (p) => 0.2126 * p[0] + 0.7152 * p[1] + 0.0722 * p[2]
function arcLine(img, box) {
  let marked = 0, total = 0, darkest = 255
  for (let deg = 0; deg <= 90; deg += 3) {
    const t = (deg * Math.PI) / 180
    const cx = box.left + SIDE + SEAM_R
    const cy = box.top + SEAM_R
    total++
    // Across the arc, not along x: at the top of the curve a neighbour in x is
    // another point on the same line and would pass for free.
    let min = 255
    for (const d of [-1.5, -0.5, 0.5]) {
      const r = SEAM_R + d
      min = Math.min(min, lum(img.at(Math.round(cx - r * Math.cos(t)), Math.round(cy - r * Math.sin(t)))))
    }
    if (min < 250) marked++
    darkest = Math.min(darkest, min)
  }
  return { marked, total, darkest: Math.round(darkest) }
}

/** The bar's border, which is the card's top edge, runs the full width. */
function topEdge(img, box) {
  let on = 0, total = 0
  for (let x = box.left + 4; x < box.right - 4; x++) {
    total++
    if (isDivider(img.at(x, box.top - 1)) || isDivider(img.at(x, box.top))) on++
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
      tones: tones(img, box),
      topLeft: corner(img, box, "left", "top"),
      topRight: corner(img, box, "right", "top"),
      bottomLeft: corner(img, box, "left", "bottom"),
      bottomRight: corner(img, box, "right", "bottom"),
      shellProfile: shellProfile(img, box),
      dividerAtCorner: dividerAtCorner(img, box),
      arcLine: arcLine(img, box),
      topEdge: topEdge(img, box),
    }
  }

  const after = read("after")
  const light = read("light")
  const lightbare = read("lightbare")
  const grey = read("grey")
  const rounded = read("rounded")

  console.log("\nthe seam has two tones in it, not three\n")

  // THE CLAIM. Two points of slack is inside the screenshot's own rounding
  // and nowhere near the eight #eef1f5 sits from white.
  expect(after.tones.spread <= 2,
    "the bar, the sidebar and the corner they meet at are one colour",
    `they are ${after.tones.spread} apart: wedge ${after.tones.wedge}, sidebar ${after.tones.side}, bar ${after.tones.bar}`)
  expect(grey.tones.spread > 4,
    "a surround with a tone of its own put a third colour in that corner, so this is a real measurement",
    `the control's three surfaces were only ${grey.tones.spread} apart`)

  // Nothing of the root shows at the screen's own corners.
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

  // And the corner is the card's curve, not a square corner.
  expect(after.shellProfile.travel >= SEAM_R - 5, "and the corner is the card's curve, not a square corner",
    `the edge moved ${after.shellProfile.travel}px down the junction, so it is not tracing the arc`)

  // The edge's whole job: a page the same white as everything around it still
  // has a corner.
  expect(light.arcLine.marked / light.arcLine.total > 0.9,
    "a page the same white as the surround still has an edge all the way round the arc",
    `${light.arcLine.marked} of ${light.arcLine.total} steps round it carry anything at all`)
  expect(lightbare.arcLine.marked / lightbare.arcLine.total < 0.1,
    "without it that page has no corner at all, so this is a real measurement",
    `the control already marked ${lightbare.arcLine.marked} of ${lightbare.arcLine.total}`)

  // Down the seam, and along the top.
  expect(after.dividerAtCorner >= SEAM_R - 5, "the hairline runs the whole seam rather than starting below the corner",
    `only ${after.dividerAtCorner} of the top ${SEAM_R - 3} rows carry it`)
  expect(after.topEdge.on / after.topEdge.total > 0.95, "and the bar's own border is the top edge, full width",
    `${after.topEdge.on} of ${after.topEdge.total} pixels of it carry the line`)

  console.log("")
  const cols = (m) => `spread ${String(m.tones.spread).padStart(2)}   ` +
    OUTER.map(([k]) => `${m[k].bar}/${m[k].total}`).join("  ") +
    `   curve ${m.shellProfile.travel}px of ${SEAM_R}, seam ${m.dividerAtCorner}` +
    `, arc ${m.arcLine.marked}/${m.arcLine.total} (darkest ${m.arcLine.darkest})` +
    `, top ${m.topEdge.on}/${m.topEdge.total}`
  for (const [name, m] of [["after", after], ["light", light], ["lightbare", lightbare], ["grey", grey], ["rounded", rounded]]) {
    console.log(`  ${name.padEnd(10)}${cols(m)}`)
  }
  console.log(`\n  after     wedge ${after.tones.wedge}  sidebar ${after.tones.side}  bar ${after.tones.bar}`)
  console.log(`  grey      wedge ${grey.tones.wedge}  sidebar ${grey.tones.side}  bar ${grey.tones.bar}\n`)
} finally {
  rmSync(out, { recursive: true, force: true })
}

process.exit(broken ? 1 : 0)
