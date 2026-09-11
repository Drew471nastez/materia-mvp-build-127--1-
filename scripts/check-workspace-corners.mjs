/**
 * ===========================================================================
 *  THE PANELS STAND ON A SHELF
 * ===========================================================================
 * Twelve rounds went into the seam between the sidebar and the canvas. A
 * hairline down it. A corner drawn on the arc the canvas turns on, filled five
 * different ways. Then no corner at all and a gap of the panels' own white,
 * which settled what to draw and opened a smaller question: a gap you cannot
 * see is not a gap, and on a white page the sidebar, the space and the canvas
 * were one undifferentiated field.
 *
 * So the space has a tone. The panels are cards, inset a little and rounded on
 * both top corners, standing on the light grey the builder already uses for
 * the surface a device preview sits on.
 *
 * That grey is why this works where every earlier version of it did not, and
 * the difference is worth stating exactly, because it was got wrong five
 * times: a sliver of a third colour between one ROUNDED panel and one FLUSH
 * one is a wedge. The same sliver between two panels that both curve away
 * from it, with the same surface running behind both, is a channel. The tone
 * was never the fault on its own. The tone with only one side curving was.
 *
 * So this measures, with a control for each:
 *   - the gap between the cards, and the shelf showing around them
 *   - that the gap can be SEEN against the panels, which is the claim that
 *     reversed, and that it is even the whole way down
 *   - that both sides of it curve by the same radius, and that the sidebar
 *     rounds on its outer corner too
 *   - and that nothing behind the shelf shows anywhere
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

/** The radius, the gap, the bar, the sidebar, the AI panel, the viewport. */
const R = 20, GAP = 6, PAD = 6, BAR = 44, SIDE = 160, AI = 120, W = 620, H = 300
/** The page in the canvas: the one thing in the window with a colour. */
const PAPER = "#dbe4fb"

/**
 * Three shapes.
 *
 *   after    a 4px gap, both sides rounded, nothing drawn in it
 *   line     the hairline and the corner drawn on the arc, flush panels
 *   grey     the same gap over a surround with a tone of its own: the wedge
 */
const SHAPES = {
  after: { surround: "#eef1f5", gap: GAP, pad: PAD, round: true, line: false },
  line: { surround: "#eef1f5", gap: 0, pad: 0, round: true, line: true },
  /**
   * The shape shipped one round before this: the same gap, over the panels'
   * own white. It closed the argument about what to draw at the seam and
   * opened a smaller one, which is that a gap you cannot see is not a gap.
   * It is the control for the tone.
   */
  white: { surround: "#ffffff", gap: GAP, pad: PAD, round: true, line: false },
  /**
   * The geometry, made visible. The two arcs either side of the gap cannot be
   * photographed in the shipped tone, because the panel's arc is white curving
   * away from white — which is the point of the tone, not a fault in it. So
   * the same layout is rendered once over a colour nothing else uses, purely
   * to measure the shape. `probeSquare` is its control: the same render with
   * the radii off.
   */
  probe: { surround: "#ff8800", gap: GAP, pad: PAD, round: true, line: false },
  probeSquare: { surround: "#ff8800", gap: GAP, pad: PAD, round: false, line: false },
}

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
/* never meant to be seen: the bar covers the top of it and the row the rest */
body{background:rgb(255,0,255)}
/* dark, and it is NOT part of the claim below: it is a surface above the row
   with its own edge, and nothing at the seam opens onto it */
.bar{position:fixed;left:0;right:0;top:0;height:${BAR}px;background:#171717;
     border-bottom:1px solid rgba(255,255,255,.1)}
.row{position:fixed;left:0;right:0;top:${BAR}px;bottom:0;display:flex;
     gap:${sh.gap}px;padding:${sh.pad}px ${sh.pad}px 0;background:${sh.surround};overflow:hidden}
.side{width:${SIDE}px;background:#fff;flex:none;overflow:hidden}
.ai{width:${AI}px;background:#fff;flex:none;overflow:hidden}
.canvas{flex:1;position:relative;background:${sh.surround};overflow:hidden}
.card{width:100%;height:100%;background:${PAPER}}
${sh.round
    ? /* cards on a shelf: both top corners, every one of them */
      `.side,.ai,.canvas{border-top-left-radius:${R}px;border-top-right-radius:${R}px}`
    : ""}
${sh.line
    ? `.hair{position:absolute;top:0;bottom:0;width:1px;background:#e5e7eb;z-index:10}
       .hair-l{left:${SIDE - 1}px}
       .hair-r{right:${AI}px}`
    : `.hair{display:none}`}
</style></head><body>
<div class="bar"></div>
<div class="row">
  <div class="side"></div>
  <div class="canvas"><div class="card"></div></div>
  <div class="ai"></div>
  <i class="hair hair-l"></i><i class="hair hair-r"></i>
</div>
<script>
const r = document.querySelector(".row").getBoundingClientRect()
const c = document.querySelector(".canvas").getBoundingClientRect()
const sd = document.querySelector(".side").getBoundingClientRect()
const ai = document.querySelector(".ai").getBoundingClientRect()
document.title = JSON.stringify({
  left: Math.round(r.left), right: Math.round(r.right),
  top: Math.round(r.top), bottom: Math.round(r.bottom),
  cl: Math.round(c.left), cr: Math.round(c.right),
  /* the gap is a layout fact, and in the shipped tone it is white between
     two whites: there is nothing in a screenshot to measure it with, which
     is what "nothing is drawn there" means. The screenshot's job is the
     tone; the rects' job is the distance. */
  gapL: Math.round(c.left - sd.right), gapR: Math.round(ai.left - c.right),
  /* and the shelf showing around the outside of the cards */
  padL: Math.round(sd.left - r.left), padR: Math.round(r.right - ai.right),
  padT: Math.round(sd.top - r.top),
})
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

const isPaper = (p) => p[2] > p[0] + 10
const isSentinel = (p) => p[0] > 200 && p[1] < 60 && p[2] > 200
const mean = (v) => [0, 1, 2].map((c) => Math.round(v.reduce((a, q) => a + q[c], 0) / v.length))
const apart = (a, b) => Math.max(...[0, 1, 2].map((c) => Math.abs(a[c] - b[c])))

/**
 * THE GAP CAN BE SEEN, AND IT IS EVEN.
 *
 * Two claims from one sample, and the first one is the reverse of what this
 * script asserted a round ago. A gap of the panels' own white settled the
 * question of what to draw at the seam, and left a gap nobody can see: on a
 * white page the sidebar, the space and the canvas were one field. So the
 * shelf has a tone, and `separation` is how far the gap sits from the panels
 * either side of it — the thing that has to be non-zero now.
 *
 * `worst` is the second claim and is unchanged: every pixel down the gap must
 * be the same as every other, so nothing crosses it and it reads as a channel
 * rather than a stripe with a line in it.
 *
 * The reference is taken inside the two panels, never from the bar. The bar
 * is dark and sits above the row with its own edge; it is a different surface
 * and the gap is not claiming to match it.
 */
function gapTone(img, box) {
  const ref = mean([img.at(box.left + PAD + 20, box.top + PAD + 60), img.at(box.right - PAD - 20, box.top + PAD + 60)])
  const px = []
  let worst = 0, worstAt = null
  for (let y = box.top + PAD + R + 4; y < box.bottom - 4; y++) {
    for (const x0 of [box.cl - GAP + 2, box.right - PAD - AI - GAP + 2]) {
      for (let x = x0; x < x0 + GAP - 4; x++) px.push(img.at(x, y))
    }
  }
  const seen = mean(px)
  for (const p of px) {
    const d = apart(p, seen)
    if (d > worst) { worst = d; worstAt = p }
  }
  return { ref, seen, worst, worstAt, separation: apart(seen, ref) }
}

/**
 * BOTH SIDES CURVE, BY THE SAME AMOUNT.
 *
 * Measured on the probe, where the surround is a colour nothing else uses and
 * both edges of the gap are therefore visible. Down each edge, how far it
 * travels sideways between the top of the row and the bottom of the corner: a
 * square panel gives 0, a panel rounded by R gives R. The panel's side and the
 * page's side are read separately, so "both" is a measurement.
 */
const isProbe = (p) => p[0] > 200 && p[1] > 100 && p[1] < 190 && p[2] < 90
/**
 * What a corner of radius r ACTUALLY travels when it is read once per row at
 * the pixel's centre. Not r: the first row's centre is half a pixel below the
 * top, where the edge has not yet reached its full inset, and the last row's
 * edge has not quite come back to zero. For r = 20 it is 15.6, and asserting
 * 20 would have been asserting against a number the geometry never produces.
 */
const expectedTravel = (r) => {
  const at = (dy) => r - Math.sqrt(r * r - (r - dy - 0.5) ** 2)
  return at(0) - at(r - 1)
}
function arcs(img, box) {
  const panel = [], paper = []
  // From the CARD's very first line, where a corner of radius R has pulled
  // the edge back by the whole R, down to the last line of the corner, where
  // it has pulled back by none of it.
  //
  // The card's line, not the row's: the shelf pads the row, so the rows above
  // the card are shelf all the way across and a scan started there runs to its
  // own limit and reports the limit as travel. Starting one line too LOW is
  // the other trap, and loses a quarter of the travel to the curve's own
  // steepness: it reported 12 of a true 15.5 that way.
  for (let y = box.top + PAD; y < box.top + PAD + R; y++) {
    // how far the sidebar has pulled back from the gap at this row
    let a = 0
    while (a < R + 6 && isProbe(img.at(box.cl - GAP - 1 - a, y))) a++
    panel.push(a)
    // and how far the page has
    let b = 0
    while (b < R + 6 && isProbe(img.at(box.cl + b, y))) b++
    paper.push(b)
  }
  const travel = (v) => Math.max(...v) - Math.min(...v)
  return { panel: travel(panel), paper: travel(paper) }
}

/**
 * THE SIDEBAR ROUNDS ON ITS OTHER TOP CORNER TOO.
 *
 * It is a card standing on the shelf, not a panel butted against the window,
 * so the grey runs behind it on the left as well as in the gap. Measured on
 * the probe, where the shelf is a colour nothing else uses: how far the card's
 * left edge travels between the row's first line and the bottom of its corner.
 */
function outerArc(img, box) {
  const edges = []
  for (let y = box.top + PAD; y < box.top + PAD + R; y++) {
    let a = 0
    while (a < R + 6 && isProbe(img.at(box.left + PAD + a, y))) a++
    edges.push(a)
  }
  return Math.max(...edges) - Math.min(...edges)
}

/** Any of the root at a screen corner is a chip taken out of the page. */
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
      if (isSentinel(img.at(x, y))) bar++
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
      gap: { left: box.gapL, right: box.gapR },
      pad: { left: box.padL, right: box.padR, top: box.padT },
      outerArc: outerArc(img, box),
      tone: gapTone(img, box),
      arcs: arcs(img, box),
      topLeft: corner(img, box, "left", "top"),
      topRight: corner(img, box, "right", "top"),
      bottomLeft: corner(img, box, "left", "bottom"),
      bottomRight: corner(img, box, "right", "bottom"),
    }
  }

  const after = read("after")
  const line = read("line")
  const white = read("white")
  const probe = read("probe")
  const probeSquare = read("probeSquare")

  console.log("\nthe panels stand on a shelf\n")

  // The shelf, seen between the cards and around them.
  expect(after.gap.left === GAP && after.gap.right === GAP,
    `there are ${GAP} pixels between the page and each panel beside it`,
    `${after.gap.left} on the left and ${after.gap.right} on the right`)
  expect(after.pad.left === PAD && after.pad.right === PAD && after.pad.top === PAD,
    `and ${PAD} more around the outside of them, so they are cards rather than panels butted against the window`,
    `left ${after.pad.left}, right ${after.pad.right}, top ${after.pad.top}`)
  expect(line.gap.left === 0 && line.gap.right === 0 && line.pad.left === 0,
    "the panels used to be flush, so this is a real measurement",
    `the control already had a gap of ${line.gap.left} and a margin of ${line.pad.left}`)

  // THE CLAIM THAT REVERSED. It has to be visible.
  expect(after.tone.separation >= 4,
    "the gap is a tone of its own, so it can be seen against the panels either side",
    `it is only ${after.tone.separation} from the panels: gap ${after.tone.seen}, panels ${after.tone.ref}`)
  expect(white.tone.separation <= 2,
    "a gap of the panels' own white could not be, so this is a real measurement",
    `the control's gap was already ${white.tone.separation} from its panels`)

  // And it is an even channel, with nothing crossing it.
  expect(after.tone.worst <= 2,
    "and it is even the whole way down, with nothing drawn across it",
    `a pixel in it is ${after.tone.worst} from the rest: ${after.tone.worstAt}`)
  expect(line.tone.worst > 4, "the hairline did cross it, so this is a real measurement",
    `the control's worst pixel was only ${line.tone.worst} away`)

  // Both sides of the gap curve, by the same radius, and so does the far side
  // of the sidebar: these are cards, and a card with one square top corner and
  // one round one reads as a mistake.
  const want = expectedTravel(R)
  expect(Math.abs(probe.arcs.panel - want) <= 1.5 && Math.abs(probe.arcs.paper - want) <= 1.5,
    `both sides of the gap curve away, each by ${R}px`,
    `the panel travels ${probe.arcs.panel}px and the page ${probe.arcs.paper}px, where ${R}px travels ${want.toFixed(1)}`)
  expect(probe.arcs.panel === probe.arcs.paper,
    "and by the same radius as each other, so the gap is an even channel",
    `panel ${probe.arcs.panel}px against page ${probe.arcs.paper}px`)
  expect(Math.abs(probe.outerArc - want) <= 1.5,
    `and the sidebar rounds by ${R}px on its outer corner too, not just the one facing the gap`,
    `its left edge travels ${probe.outerArc}px, where ${R}px travels ${want.toFixed(1)}`)
  expect(probeSquare.arcs.panel <= 1 && probeSquare.arcs.paper <= 1 && probeSquare.outerArc <= 1,
    "with the radii off none of the three moved, so these are real measurements",
    `the control travelled ${probeSquare.arcs.panel}, ${probeSquare.arcs.paper} and ${probeSquare.outerArc}`)

  // And nothing of the root shows anywhere: the shelf is meant to be seen,
  // what is behind it is not.
  const OUTER = [
    ["topLeft", "the top left"],
    ["topRight", "the top right"],
    ["bottomLeft", "the bottom left"],
    ["bottomRight", "the bottom right"],
  ]
  for (const [key, name] of OUTER) {
    expect(after[key].bar === 0, `nothing behind the shelf shows at ${name}`,
      `${after[key].bar} of ${after[key].total} pixels there are the root`)
  }

  console.log("")
  const cols = (m) => `gap ${m.gap.left}/${m.gap.right}  pad ${m.pad.left}/${m.pad.right}/${m.pad.top}` +
    `   seen ${String(m.tone.separation).padStart(3)} from the panels, uneven by ${String(m.tone.worst).padStart(3)}` +
    `   arcs ${m.arcs.panel}/${m.arcs.paper}/${m.outerArc} (${R}px travels ${expectedTravel(R).toFixed(1)})` +
    `   root ` + OUTER.map(([k]) => m[k].bar).join("")
  for (const [n, m] of [["after", after], ["line", line], ["white", white],
                        ["probe", probe], ["square", probeSquare]]) console.log(`  ${n.padEnd(8)}${cols(m)}`)
  console.log("")
} finally {
  rmSync(out, { recursive: true, force: true })
}

process.exit(broken ? 1 : 0)
