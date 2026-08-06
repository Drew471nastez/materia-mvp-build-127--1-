/**
 * ===========================================================================
 *  TRIMMING BARS THAT ARE PAINTED INTO THE PHOTOGRAPH
 * ===========================================================================
 * The case this was written from, measured off the real file and the real
 * screenshot:
 *
 *   stored image   1280×720
 *   rows   0–119   uniform light grey
 *   rows 120–599   the artwork
 *   rows 600–719   uniform light grey
 *
 * Rendered `object-cover` in the app's 3:4 frame, that predicts 268px of grey,
 * 1071px of artwork and 268px of grey. The screenshot measured 268 / 1071 / 268
 * — so `object-fit` was correct and the bars were in the file. Reported for
 * days as "the images are not cover".
 *
 * The dangerous mistake is the opposite one, and it is the reason most of these
 * cases are about NOT trimming: a garment photographed on a white studio sweep
 * has genuinely uniform pixels along its edges, and cutting those off eats the
 * photograph. So a uniform border is not enough — what is required is the
 * signature of padding: bars at BOTH ends of one axis, of similar thickness, in
 * one colour, thick enough to be deliberate and thin enough to leave a subject.
 *
 * Run with:  npm run test:push
 */

import { contentBox, isTrimmed } from "@/lib/images/letterbox"

let passed = 0
let failed = 0
const failures: string[] = []

function check(name: string, ok: boolean, detail?: string) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    failures.push(name)
    console.log(`  FAIL  ${name}${detail ? `\n${detail}` : ""}`)
  }
}

type RGBA = [number, number, number, number]

/**
 * A synthetic image. `paint(x, y)` returns the pixel, so a test reads as a
 * description of the picture rather than as buffer arithmetic.
 */
function image(w: number, h: number, paint: (x: number, y: number) => RGBA) {
  const data = new Uint8ClampedArray(w * h * 4)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const [r, g, b, a] = paint(x, y)
      const i = (y * w + x) * 4
      data[i] = r
      data[i + 1] = g
      data[i + 2] = b
      data[i + 3] = a
    }
  }
  return { data, w, h }
}

const GREY: RGBA = [241, 241, 241, 255]
const WHITE: RGBA = [255, 255, 255, 255]
const CLEAR: RGBA = [0, 0, 0, 0]
/** Never uniform: a subject has texture, and a flat one would be untestable. */
const art = (x: number, y: number): RGBA => [(x * 7 + y * 13) % 200, (y * 5) % 200, (x * 3) % 200, 255]

console.log("\nLetterbox trimming: cut the padding, keep the photograph\n")

// ── The case this exists for ────────────────────────────────────────────────
{
  const { data, w, h } = image(1280, 720, (x, y) => (y < 120 || y >= 600 ? GREY : art(x, y)))
  const box = contentBox(data, w, h)
  check(
    "the reported listing: 1280×720 with 120 grey rows top and bottom",
    box.sy === 120 && box.sh === 480 && box.sx === 0 && box.sw === 1280,
    `        got sx=${box.sx} sy=${box.sy} sw=${box.sw} sh=${box.sh}\n` +
      `        want sx=0 sy=120 sw=1280 sh=480`,
  )
  check("…and that counts as trimmed", isTrimmed(box, w, h))
}

// ── Pillarboxing, the same thing on the other axis ──────────────────────────
{
  const { data, w, h } = image(1000, 1000, (x, y) => (x < 150 || x >= 850 ? GREY : art(x, y)))
  const box = contentBox(data, w, h)
  check(
    "vertical bars are trimmed too",
    box.sx === 150 && box.sw === 700 && box.sy === 0 && box.sh === 1000,
    `        got sx=${box.sx} sy=${box.sy} sw=${box.sw} sh=${box.sh}`,
  )
}

// ── Transparent padding ─────────────────────────────────────────────────────
{
  const { data, w, h } = image(800, 800, (x, y) => (y < 100 || y >= 700 ? CLEAR : art(x, y)))
  const box = contentBox(data, w, h)
  check(
    "alpha padding is padding",
    box.sy === 100 && box.sh === 600,
    `        got sy=${box.sy} sh=${box.sh}\n` +
      `        Transparent pixels carry junk in their colour channels, so they\n` +
      `        have to match on alpha alone.`,
  )
}

// ── Everything below here must NOT trim ─────────────────────────────────────
{
  // The garment on a white sweep: the background runs off the top and the
  // subject reaches the bottom edge. One bar, not two.
  const { data, w, h } = image(900, 1200, (x, y) => (y < 300 ? WHITE : art(x, y)))
  const box = contentBox(data, w, h)
  check(
    "a studio background at one end is left alone",
    !isTrimmed(box, w, h),
    `        got sy=${box.sy} sh=${box.sh}\n` +
      `        This is the expensive mistake: trimming here cuts into a real\n` +
      `        photograph on the most ordinary kind of listing there is.`,
  )
}
{
  // Bars at both ends but wildly different — a background, not a frame.
  const { data, w, h } = image(900, 1200, (x, y) => (y < 300 || y >= 1180 ? WHITE : art(x, y)))
  const box = contentBox(data, w, h)
  check("lopsided bars are not padding", !isTrimmed(box, w, h), `        got sy=${box.sy} sh=${box.sh}`)
}
{
  // A hairline of uniform pixels — an encoder edge, a rounded corner.
  const { data, w, h } = image(1000, 1000, (x, y) => (y < 4 || y >= 996 ? GREY : art(x, y)))
  const box = contentBox(data, w, h)
  check("a few uniform rows are not a bar", !isTrimmed(box, w, h), `        got sy=${box.sy} sh=${box.sh}`)
}
{
  // Bars so thick there is barely a picture between them. More likely a
  // graphic on a canvas than a letterboxed photograph.
  const { data, w, h } = image(1000, 1000, (x, y) => (y < 460 || y >= 540 ? GREY : art(x, y)))
  const box = contentBox(data, w, h)
  check("bars that leave almost nothing are not trusted", !isTrimmed(box, w, h), `        got sy=${box.sy} sh=${box.sh}`)
}
{
  // Padded on both axes: a logo centred on a canvas. Cropping to the ink is a
  // different feature with different rules.
  const { data, w, h } = image(1000, 1000, (x, y) =>
    y < 150 || y >= 850 || x < 150 || x >= 850 ? GREY : art(x, y),
  )
  const box = contentBox(data, w, h)
  check("padding on both axes is left alone", !isTrimmed(box, w, h))
}
{
  // Different colours at the two ends — not one frame.
  const { data, w, h } = image(1000, 1000, (x, y) => (y < 150 ? WHITE : y >= 850 ? [20, 20, 20, 255] : art(x, y)))
  const box = contentBox(data, w, h)
  check("two different colours are not one frame", !isTrimmed(box, w, h))
}
{
  const { data, w, h } = image(600, 600, () => GREY)
  const box = contentBox(data, w, h)
  check("an image that is entirely one colour is untouched", !isTrimmed(box, w, h))
}
{
  const { data, w, h } = image(1000, 1000, art)
  const box = contentBox(data, w, h)
  check("an ordinary photograph is untouched", !isTrimmed(box, w, h))
}

// ── A bar interrupted by the subject is not a bar ───────────────────────────
{
  // The top rows are grey EXCEPT where the subject pokes into them. The scan
  // must notice, or it would cut through the product.
  const { data, w, h } = image(1000, 1000, (x, y) => {
    if (y < 150 || y >= 850) return x > 400 && x < 430 && y > 100 ? art(x, y) : GREY
    return art(x, y)
  })
  const box = contentBox(data, w, h)
  check(
    "a bar the subject intrudes into stops at the intrusion",
    box.sy <= 100,
    `        got sy=${box.sy}; the subject reaches row 100, so nothing below\n` +
      `        that may be trimmed.`,
  )
}

// ── Degenerate input ────────────────────────────────────────────────────────
{
  const { data, w, h } = image(4, 4, () => GREY)
  const box = contentBox(data, w, h)
  check("a tiny image is returned whole", !isTrimmed(box, w, h))
}
{
  const box = contentBox(new Uint8ClampedArray(10), 1000, 1000)
  check("a short buffer is returned whole rather than read past", !isTrimmed(box, 1000, 1000))
}

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed > 0) {
  console.log("Failed:")
  for (const f of failures) console.log(`  · ${f}`)
  process.exit(1)
}
