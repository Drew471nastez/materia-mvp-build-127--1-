/**
 * Bars that are painted into the photograph.
 *
 * ---------------------------------------------------------------------------
 * The bug this exists for
 * ---------------------------------------------------------------------------
 * A listing was reported, repeatedly, as "not cover — it does not fill the whole
 * thing", with a grey band under the picture. Every image surface in the app was
 * already `object-cover`, and the CSS was changed and re-changed several times
 * to no effect, because the CSS was never wrong.
 *
 * Measured from the stored file, the photograph was 1280×720 and looked like
 * this:
 *
 *     rows    0–119   uniform light grey
 *     rows  120–599   the artwork
 *     rows  600–719   uniform light grey
 *
 * Rendered `object-cover` in the app's 3:4 frame that predicts 268px of grey,
 * 1071px of artwork and 268px of grey. The screenshot measured 268 / 1071 / 268.
 * `object-fit` was doing exactly what it is supposed to; it was faithfully
 * filling the frame with an image that already had bars in it.
 *
 * No CSS can fix that, because there is nothing to fix — the grey IS the
 * picture. It has to be cut off before the photograph is ever cropped, and that
 * is what this does.
 *
 * ---------------------------------------------------------------------------
 * Why it is this cautious
 * ---------------------------------------------------------------------------
 * The dangerous mistake is the opposite one: a garment photographed on a white
 * studio sweep has genuinely uniform pixels along its edges, and trimming those
 * eats the photograph. So a uniform border is NOT enough on its own. What is
 * looked for is the signature of letterboxing specifically:
 *
 *   · bars on BOTH ends of the same axis — padding to a target shape is
 *     centred, while a studio background runs off one edge and is interrupted
 *     by the subject at the other;
 *   · of roughly the same thickness — the two are within `SKEW` of each other;
 *   · in the same colour at both ends, taken from the corners;
 *   · thick enough to be deliberate, and not so thick that what is left could
 *     not be the subject.
 *
 * Only one axis is trimmed, the one with the stronger signal. An image that is
 * padded on both axes is a logo on a canvas, not a letterboxed photograph, and
 * cropping it to its ink is a different feature with different rules.
 *
 * Pure, and pixel-data in / rectangle out, so the whole of it is testable
 * without a canvas, a browser or an image.
 */

export type TrimRect = { sx: number; sy: number; sw: number; sh: number }

/** Per-channel distance below which two pixels are "the same colour". Generous
 *  enough for JPEG ringing in a flat area, tight enough that a gradient
 *  background stops matching within a few rows. */
const TOLERANCE = 10

/** A bar thinner than this is a border, a rounded corner, or nothing at all. */
const MIN_FRACTION = 0.02

/** Past this, the remainder is too small to still be the photograph. */
const MAX_FRACTION = 0.42

/** How different the two bars on an axis may be and still read as centred
 *  padding. Encoders and hand-made canvases are rarely exact to the pixel. */
const SKEW = 0.35

type Px = { r: number; g: number; b: number; a: number }

function at(data: ArrayLike<number>, w: number, x: number, y: number): Px {
  const i = (y * w + x) * 4
  return { r: data[i], g: data[i + 1], b: data[i + 2], a: data[i + 3] }
}

function near(a: Px, b: Px): boolean {
  // Fully transparent pixels match each other whatever their colour channels
  // say — an alpha-padded PNG carries junk in the RGB of its transparent area.
  if (a.a < 8 && b.a < 8) return true
  return (
    Math.abs(a.r - b.r) <= TOLERANCE &&
    Math.abs(a.g - b.g) <= TOLERANCE &&
    Math.abs(a.b - b.b) <= TOLERANCE &&
    Math.abs(a.a - b.a) <= TOLERANCE
  )
}

/** Every `step`-th pixel of a row matches `colour`. */
function rowMatches(data: ArrayLike<number>, w: number, y: number, colour: Px, step: number): boolean {
  for (let x = 0; x < w; x += step) if (!near(at(data, w, x, y), colour)) return false
  // The last column explicitly: a step that does not divide the width would
  // otherwise never look at the right-hand edge, which is exactly where a bar
  // ends and content begins on a pillarboxed image.
  return near(at(data, w, w - 1, y), colour)
}

function colMatches(data: ArrayLike<number>, w: number, h: number, x: number, colour: Px, step: number): boolean {
  for (let y = 0; y < h; y += step) if (!near(at(data, w, x, y), colour)) return false
  return near(at(data, w, x, h - 1), colour)
}

/**
 * The rectangle of a decoded image that is actually the photograph.
 *
 * Returns the full frame when there is no letterboxing to remove, which is the
 * overwhelmingly common case and costs one pass over a few hundred sampled
 * pixels.
 */
export function contentBox(
  data: ArrayLike<number>,
  w: number,
  h: number,
): TrimRect {
  const whole: TrimRect = { sx: 0, sy: 0, sw: w, sh: h }
  if (w < 8 || h < 8 || data.length < w * h * 4) return whole

  // Sampling stride. A bar is a large flat area, so looking at every pixel of
  // every row buys nothing on a 4000px photograph; ~200 samples across an edge
  // is more than enough to notice a subject intruding into it.
  const stepX = Math.max(1, Math.floor(w / 200))
  const stepY = Math.max(1, Math.floor(h / 200))

  // ── Horizontal bars (letterboxing): top and bottom ────────────────────────
  const topColour = at(data, w, 0, 0)
  const bottomColour = at(data, w, 0, h - 1)
  let top = 0
  let bottom = 0
  if (near(topColour, bottomColour)) {
    while (top < h && rowMatches(data, w, top, topColour, stepX)) top++
    while (bottom < h - top && rowMatches(data, w, h - 1 - bottom, topColour, stepX)) bottom++
  }

  // ── Vertical bars (pillarboxing): left and right ──────────────────────────
  const leftColour = at(data, w, 0, 0)
  const rightColour = at(data, w, w - 1, 0)
  let left = 0
  let right = 0
  if (near(leftColour, rightColour)) {
    while (left < w && colMatches(data, w, h, left, leftColour, stepY)) left++
    while (right < w - left && colMatches(data, w, h, w - 1 - right, leftColour, stepY)) right++
  }

  const okH = plausible(top, bottom, h)
  const okV = plausible(left, right, w)

  // An image uniform enough to be trimmed on both axes at once is a graphic on
  // a canvas, not a letterboxed photograph. Left alone rather than guessed at.
  if (okH && okV) return whole
  if (okH) return { sx: 0, sy: top, sw: w, sh: h - top - bottom }
  if (okV) return { sx: left, sy: 0, sw: w - left - right, sh: h }
  return whole
}

/** Do these two bars look like deliberate, centred padding? */
function plausible(a: number, b: number, total: number): boolean {
  if (a === 0 || b === 0) return false
  const min = total * MIN_FRACTION
  if (a < min || b < min) return false
  if (a + b > total * MAX_FRACTION * 2) return false
  // Both present and both substantial: now they must also be about equal, or
  // this is a background running off one edge rather than a frame around the
  // middle.
  const bigger = Math.max(a, b)
  const smaller = Math.min(a, b)
  return (bigger - smaller) / bigger <= SKEW
}

/** True when `box` is not simply the whole frame. */
export function isTrimmed(box: TrimRect, w: number, h: number): boolean {
  return box.sx !== 0 || box.sy !== 0 || box.sw !== w || box.sh !== h
}
