import "server-only"

/**
 * ===========================================================================
 *  HOW CLOSE THE PAGE IS TO THE PICTURE, MEASURED
 * ===========================================================================
 * "Make it exactly like this screenshot" was answered by the model looking at
 * the picture and saying it matched. Nothing measured it, so "1:1" meant
 * whatever the model thought. This puts a number on it.
 *
 * The page is photographed at the reference's own width class (./visual-
 * check.ts) and both pictures are brought to the same small grid: the page's
 * shot is cut to the reference's proportions from the top, then both are
 * scaled to REF_W columns. Three measures, each 0 to 1:
 *
 *   tone       how alike the light and dark are, cell by cell (1 - mean
 *              absolute luminance difference)
 *   structure  whether the edges are in the same places: the correlation of
 *              the two pictures' gradient magnitude. This is the layout: where
 *              the headline, the image, the columns and the bands fall
 *   colour     how alike the colours are, on a coarser grid
 *
 * The score is their weighted sum, 0 to 100. Beside it, the regions of a
 * three by three grid that differ most, in words the model can act on: which
 * part, lighter or darker, and whether the layout there is off.
 *
 * Not a claim of pixel identity, and said so to the model: a screenshot has
 * a browser's chrome, a real photograph and copy the page does not, and
 * interaction is invisible in a still. It is a measure that goes up as the
 * page gets closer, which is what a repair loop needs.
 */
import sharp from "sharp"

/** Columns both pictures are compared at: enough for layout, small enough to be instant. */
const REF_W = 96
/** The tallest a compared picture gets, in cells. A very long page is compared on its first screens. */
const MAX_H = 360
/** Below this the page is said to be not like the picture, and the run is asked to repair. */
export const MATCH_THRESHOLD = 82

export interface ReferenceComparison {
  /** 0 to 100. */
  score: number
  tone: number
  structure: number
  colour: number
  /** The worst regions first, as sentences. */
  regions: string[]
  /** The width the page was photographed at. */
  width: number
}

type Gray = { w: number; h: number; px: Float64Array }
type Rgb = { w: number; h: number; px: Uint8Array }

async function bring(input: Buffer, w: number, h: number, crop?: { width: number; height: number }): Promise<{ gray: Gray; rgb: Rgb }> {
  let img = sharp(input, { failOn: "none" }).rotate().removeAlpha()
  if (crop) img = img.extract({ left: 0, top: 0, width: crop.width, height: crop.height })
  const { data } = await img.resize(w, h, { fit: "fill" }).raw().toBuffer({ resolveWithObject: true })
  const rgb = new Uint8Array(data)
  const px = new Float64Array(w * h)
  for (let i = 0; i < w * h; i++) px[i] = 0.2126 * rgb[i * 3] + 0.7152 * rgb[i * 3 + 1] + 0.0722 * rgb[i * 3 + 2]
  return { gray: { w, h, px }, rgb: { w, h, px: rgb } }
}

function gradient(g: Gray): Float64Array {
  const out = new Float64Array(g.w * g.h)
  for (let y = 1; y < g.h - 1; y++) {
    for (let x = 1; x < g.w - 1; x++) {
      const i = y * g.w + x
      const gx = g.px[i + 1] - g.px[i - 1]
      const gy = g.px[i + g.w] - g.px[i - g.w]
      out[i] = Math.hypot(gx, gy)
    }
  }
  return out
}

/** Pearson correlation of two equal-length series, 0 when either is flat. */
function correlation(a: Float64Array, b: Float64Array, idx?: number[]): number {
  const n = idx ? idx.length : a.length
  if (n < 2) return 0
  let sa = 0
  let sb = 0
  for (let k = 0; k < n; k++) {
    const i = idx ? idx[k] : k
    sa += a[i]
    sb += b[i]
  }
  const ma = sa / n
  const mb = sb / n
  let num = 0
  let da = 0
  let db = 0
  for (let k = 0; k < n; k++) {
    const i = idx ? idx[k] : k
    const x = a[i] - ma
    const y = b[i] - mb
    num += x * y
    da += x * x
    db += y * y
  }
  if (da < 1e-6 && db < 1e-6) return 1
  if (da < 1e-6 || db < 1e-6) return 0
  return num / Math.sqrt(da * db)
}

const ROWS = ["top", "middle", "bottom"]
const COLS = ["left", "centre", "right"]

/** Compare a page's photograph with the reference. Null when either picture cannot be read. */
export async function compareWithReference(reference: Buffer, page: Buffer, width: number): Promise<ReferenceComparison | null> {
  try {
    const [rm, pm] = await Promise.all([sharp(reference, { failOn: "none" }).metadata(), sharp(page, { failOn: "none" }).metadata()])
    const rw = rm.width ?? 0
    const rh = rm.height ?? 0
    const pw = pm.width ?? 0
    const ph = pm.height ?? 0
    if (rw < 16 || rh < 16 || pw < 16 || ph < 16) return null
    const h = Math.max(8, Math.min(MAX_H, Math.round((REF_W * rh) / rw)))
    /* The page cut to the reference's proportions, from its top: the picture is a screen, the page is a scroll. */
    const cropH = Math.max(1, Math.min(ph, Math.round((pw * rh) / rw)))
    const [ref, pg] = await Promise.all([bring(reference, REF_W, h), bring(page, REF_W, h, { width: pw, height: cropH })])

    const n = REF_W * h
    let lumDiff = 0
    for (let i = 0; i < n; i++) lumDiff += Math.abs(ref.gray.px[i] - pg.gray.px[i])
    const tone = Math.max(0, 1 - lumDiff / n / 255)

    const gr = gradient(ref.gray)
    const gp = gradient(pg.gray)
    const structure = Math.max(0, correlation(gr, gp))

    let colDiff = 0
    for (let i = 0; i < n * 3; i++) colDiff += Math.abs(ref.rgb.px[i] - pg.rgb.px[i])
    const colour = Math.max(0, 1 - colDiff / (n * 3) / 255)

    const score = Math.round(100 * (0.35 * tone + 0.4 * structure + 0.25 * colour))

    /* Region by region: what to fix, and where. */
    const regions: { at: string; bad: number; text: string }[] = []
    for (let ry = 0; ry < 3; ry++) {
      for (let rx = 0; rx < 3; rx++) {
        const idx: number[] = []
        const y0 = Math.floor((ry * h) / 3)
        const y1 = Math.floor(((ry + 1) * h) / 3)
        const x0 = Math.floor((rx * REF_W) / 3)
        const x1 = Math.floor(((rx + 1) * REF_W) / 3)
        for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) idx.push(y * REF_W + x)
        let a = 0
        let b = 0
        for (const i of idx) {
          a += ref.gray.px[i]
          b += pg.gray.px[i]
        }
        a /= idx.length
        b /= idx.length
        const edges = correlation(gr, gp, idx)
        const lumGap = Math.abs(a - b) / 255
        const bad = lumGap * 0.6 + (1 - Math.max(0, edges)) * 0.4
        const at = `${ROWS[ry]} ${COLS[rx]}`
        const parts: string[] = []
        if (lumGap > 0.12) parts.push(`yours is ${b > a ? "lighter" : "darker"} than the picture (${Math.round(b)} against ${Math.round(a)} of 255)`)
        if (edges < 0.35) parts.push("the layout there does not line up with the picture (edges, text and images fall in different places)")
        if (parts.length) regions.push({ at, bad, text: `${at}: ${parts.join("; ")}` })
      }
    }
    regions.sort((p, q) => q.bad - p.bad)
    return {
      score,
      tone: Math.round(tone * 100) / 100,
      structure: Math.round(structure * 100) / 100,
      colour: Math.round(colour * 100) / 100,
      regions: regions.slice(0, 5).map((r) => r.text),
      width,
    }
  } catch {
    return null
  }
}

/** Which width a reference is a screenshot of: a phone, a tablet or a computer. */
export function widthForReference(refWidth: number, refHeight: number): 1440 | 834 | 390 {
  const ratio = refWidth / Math.max(1, refHeight)
  if (refWidth <= 500 || ratio < 0.62) return 390
  if (refWidth <= 1000 && ratio < 0.95) return 834
  return 1440
}

/** The comparison as the model reads it. */
export function describeComparison(c: ReferenceComparison): string {
  const verdict = c.score >= MATCH_THRESHOLD ? "close to the picture" : "NOT yet like the picture"
  return [
    `MEASURED AGAINST THE PICTURE THEY SENT, at ${c.width}px wide: ${c.score}/100, ${verdict} (tone ${Math.round(c.tone * 100)}, layout ${Math.round(c.structure * 100)}, colour ${Math.round(c.colour * 100)}). ${MATCH_THRESHOLD} or more is close.`,
    c.regions.length ? `Where it differs most:\n${c.regions.map((r) => `- ${r}`).join("\n")}` : "No region stands out.",
    c.score >= MATCH_THRESHOLD
      ? "Check the details by eye against the two pictures attached, then finish."
      : "The first picture attached is theirs, the second is your page. Change the layout, sizes, colours and spacing until the regions above match: proportions and positions first, then colour. Their copy and photographs are theirs to supply; match the structure and the look.",
  ].join("\n")
}
