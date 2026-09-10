/**
 * ===========================================================================
 *  THE PREVIEW CANVAS KEEPS ITS ROUNDED CORNERS
 * ===========================================================================
 * A scrollbar is laid out and painted inside the scroll container's own box,
 * and it is not held inside that box's border-radius. While the editor's
 * preview card was itself the scroller, the bar therefore painted a square
 * column straight through both right-hand arcs, and the card read square on
 * the right and round on the left.
 *
 * Styling the bar is not the way out. `::-webkit-scrollbar` rules convert a
 * platform overlay scrollbar into a classic one, which then reserves a column
 * of layout — that is where "the white strip down the right of the builder"
 * came from, and tests/section-responsive.test.ts still forbids it. The fix
 * is to leave the scrollbar alone and CLIP it: put the radius on a wrapper
 * that does not scroll, with `overflow: hidden`, and let the scroller be a
 * square box inside it.
 *
 * So this renders both shapes side by side and samples, in each right-hand
 * corner, only the pixels the radius should have cut away — those outside the
 * arc. They must still be the page behind the card.
 *
 *   before   the scroller IS the rounded card
 *   after    a rounded `overflow: hidden` wrapper around a square scroller
 *
 * The two differ in that wrapper and nothing else, so the "before" column is
 * a real control: it must FAIL the same assertion the fix passes, and the run
 * reports it if it does not. Headless Chromium draws no unstyled scrollbar at
 * all, so the fixture forces one to paint — identically on both sides, which
 * is why what it isolates is still the clipping and not the styling. The app
 * itself adds no scrollbar styling; the source guards in
 * tests/section-responsive.test.ts are what hold it to that.
 *
 *   node scripts/check-canvas-corner.mjs
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

/** The card, and the page it sits on. `RADIUS` is Tailwind's `rounded-2xl`. */
const RADIUS = 16
const W = 180, H = 200, TOP = 20
const LEFT = { before: 40, after: 320 }
const PAGE = [0x17, 0x17, 0x17]

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
*{box-sizing:border-box;margin:0} html,body{overflow:hidden;height:100%}
body{background:rgb(${PAGE});position:relative}
.tall{height:900px}

/* before — the scroller is the rounded card, as the editor used to be */
#before{position:absolute;left:${LEFT.before}px;top:${TOP}px;width:${W}px;height:${H}px;
        background:#fff;border-radius:${RADIUS}px;overflow-y:auto}

/* after — the radius and the clip live on a wrapper that does not scroll */
#wrap{position:absolute;left:${LEFT.after}px;top:${TOP}px;width:${W}px;height:${H}px;
      border-radius:${RADIUS}px;overflow:hidden}
#after{width:100%;height:100%;background:#fff;overflow-y:auto}

/* Fixture only, and applied to both, since headless paints no default bar. */
#before::-webkit-scrollbar,#after::-webkit-scrollbar{width:12px;background:#00ff00}
#before::-webkit-scrollbar-thumb,#after::-webkit-scrollbar-thumb{background:#0000ff}
</style></head><body>
<div id="before"><div class="tall"></div></div>
<div id="wrap"><div id="after"><div class="tall"></div></div></div>
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
  const at = (x, y) => {
    const o = y * stride + x * ch
    return [px[o], px[o + 1], px[o + 2]]
  }
  return { w, h, at }
}

const isPage = (p) => p.every((v, i) => Math.abs(v - PAGE[i]) < 12)

/**
 * How many pixels the radius should have cut away are painted anyway. The
 * sample is the corner's bounding box minus the quarter disc, so it counts
 * only what falls OUTSIDE the card's shape — the thumb inside the card is
 * not a defect, the thumb where the curve should be is.
 */
function paintedOutsideArc(img, left, corner) {
  const right = left + W
  const cx = right - RADIUS
  const cy = corner === "top" ? TOP + RADIUS : TOP + H - RADIUS
  const y0 = corner === "top" ? TOP : TOP + H - RADIUS
  let bad = 0, total = 0
  for (let x = cx; x < right; x++) {
    for (let y = y0; y < y0 + RADIUS; y++) {
      if (Math.hypot(x + 0.5 - cx, y + 0.5 - cy) <= RADIUS + 0.5) continue
      total++
      if (!isPage(img.at(x, y))) bad++
    }
  }
  return { bad, total }
}

/** The card must have rendered in full, or its corners prove nothing. */
function fullyRendered(img, left) {
  const x = left + W / 2
  let first = -1, last = -1
  for (let y = 0; y < img.h; y++) {
    if (!isPage(img.at(x, y))) {
      if (first < 0) first = y
      last = y
    }
  }
  return first === TOP && last === TOP + H - 1
}

let broken = 0
const expect = (ok, what, got = "") => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${ok ? "" : `   ${got}`}`)
  if (!ok) broken++
}

const out = mkdtempSync(join(tmpdir(), "storelib-corner-"))
try {
  const page = join(out, "corner.html")
  const shot = join(out, "corner.png")
  writeFileSync(page, html)
  execFileSync(
    CHROMIUM,
    ["--headless=new", "--no-sandbox", "--disable-gpu", "--window-size=560,320",
     "--virtual-time-budget=1200", `--screenshot=${shot}`, `file://${page}`],
    { stdio: "ignore" },
  )
  const img = readPng(shot)

  console.log("\nthe preview canvas keeps its rounded corners\n")

  const rendered = fullyRendered(img, LEFT.before) && fullyRendered(img, LEFT.after)
  expect(rendered, "both cards rendered whole, so their corners are a real measurement",
    "a card was clipped by the viewport — the corner samples would read as empty page")

  const at = (which, corner) => paintedOutsideArc(img, LEFT[which], corner)
  const after = { top: at("after", "top"), bottom: at("after", "bottom") }
  const before = { top: at("before", "top"), bottom: at("before", "bottom") }

  /**
   * One pixel of slack per corner: the arc is antialiased, so the boundary
   * ring blends card and page and a sample right on it is not square paint.
   * Anything beyond that is the scrollbar in the curve.
   */
  const SLACK = 2
  for (const corner of ["top", "bottom"]) {
    expect(
      after[corner].bad <= SLACK,
      `nothing paints outside the ${corner} corner's curve`,
      `${after[corner].bad} of ${after[corner].total} pixels the radius should have cut are painted`,
    )
  }

  /**
   * And the control. Without the wrapper the same fixture must fail this, or
   * the check is passing for some reason other than the fix.
   */
  const controlFails = before.top.bad > SLACK && before.bottom.bad > SLACK
  expect(
    controlFails,
    "and a card that is its own scroller still fails it, so the wrapper is what fixed it",
    `unwrapped card painted only ${before.top.bad}/${before.bottom.bad} outside its corners`,
  )

  console.log(
    `\n  outside the arc:  unwrapped ${before.top.bad}+${before.bottom.bad}` +
    `   wrapped ${after.top.bad}+${after.bottom.bad}   of ${after.top.total} per corner`,
  )
  console.log(broken === 0 ? "\nboth corners are the card's own curve\n" : `\n${broken} broken\n`)
  process.exit(broken === 0 ? 0 : 1)
} finally {
  rmSync(out, { recursive: true, force: true })
}
