/**
 * The maths behind every resize and crop — pure, and therefore testable.
 *
 * Separated from lib/images/pipeline.ts because everything there needs a canvas,
 * a browser and a real photograph, while everything that can actually be WRONG
 * is arithmetic: an off-by-one in a crop rectangle is a sliver of someone
 * else's photo down one edge of every card in the feed, and no amount of
 * looking at one image in a browser reliably catches it.
 *
 * See tests/image-pipeline.test.ts.
 */

/** Where the interesting part of the photo is, 0–1 in each axis. */
export interface Focal {
  x: number
  y: number
}

export const CENTER: Focal = { x: 0.5, y: 0.5 }

/** A source rectangle to draw from — the six numbers drawImage wants. */
export interface CropRect {
  sx: number
  sy: number
  sw: number
  sh: number
}

export interface Size {
  w: number
  h: number
}

// ── The house sizes ─────────────────────────────────────────────────────────

/**
 * Feed cards are 3:4 portrait — about 5% taller than 4:5.
 *
 * Everything in a marketplace grid is clothing photographed vertically, and a
 * consistent tall card is what makes a grid read as one surface rather than a
 * ragged collage. The extra height is not decoration: a wider frame either
 * crops the garment or leaves dead space either side of it, and on a full-body
 * shot it is the difference between seeing the shoes and not.
 *
 * 810×1080 is exactly 3:4 — not 800×1066, which is 0.7505 and would leave a
 * sub-pixel mismatch against the CSS box for the browser to resolve by
 * cropping. The card and this constant MUST describe the same rectangle: a
 * thumbnail generated at one ratio and displayed in a box of another gets
 * cropped a second time by object-fit, silently discarding part of a crop the
 * seller chose.
 */
export const THUMB: Size = { w: 810, h: 1080 }
export const THUMB_RATIO = THUMB.w / THUMB.h

/**
 * The detail page keeps the photograph's own shape — it is only bounded.
 *
 * A seller who shot a wide flat-lay gets a wide flat-lay here. Cropping on the
 * detail page is what cuts the toe off a shoe or the strap off a bag, and it is
 * the single most common complaint about marketplace photo handling.
 */
export const LARGE_MAX: Size = { w: 1280, h: 1600 }

/** Square, because every avatar frame in the app is a circle or a square. */
export const PROFILE: Size = { w: 600, h: 600 }

// ── Fitting ─────────────────────────────────────────────────────────────────

/**
 * The largest size that fits inside the box AND keeps the aspect ratio.
 *
 * Never upscales. Enlarging a 400px photo to 1280 produces a bigger file that
 * is visibly softer than the original — strictly worse on both axes anybody
 * cares about.
 */
export function fitWithin(w: number, h: number, max: Size): Size {
  if (w <= 0 || h <= 0) return { w: 1, h: 1 }
  const scale = Math.min(max.w / w, max.h / h, 1)
  return {
    w: Math.max(1, Math.round(w * scale)),
    h: Math.max(1, Math.round(h * scale)),
  }
}

/** 0–1, and never NaN — a focal point arriving from JSON is untrusted input. */
export function clampFocal(f: Partial<Focal> | null | undefined): Focal {
  const n = (v: unknown, d: number) =>
    typeof v === "number" && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : d
  return { x: n(f?.x, 0.5), y: n(f?.y, 0.5) }
}

/**
 * The source rectangle for a CSS `object-fit: cover` crop, honouring a focal
 * point.
 *
 * This is the one piece of geometry the whole feed depends on. Given a photo
 * and a target shape, it picks the biggest rectangle of the SOURCE that has the
 * target's aspect ratio, then slides it so the focal point sits as close to the
 * middle of that rectangle as the edges allow.
 *
 * The clamp is what makes it behave like a person expects rather than like a
 * formula. Drag the focus to the very top of a tall photo and the crop stops at
 * the top edge — it does not run off and start including blank space, which is
 * what an unclamped `focal - half` does and which shows up as a white band
 * across the top of a card.
 */
export function coverCrop(srcW: number, srcH: number, target: Size, focal: Focal = CENTER): CropRect {
  if (srcW <= 0 || srcH <= 0) return { sx: 0, sy: 0, sw: 1, sh: 1 }
  const f = clampFocal(focal)
  const targetRatio = target.w / target.h
  const srcRatio = srcW / srcH

  let sw: number
  let sh: number
  if (srcRatio > targetRatio) {
    // Source is wider than the target shape: full height, crop the sides.
    sh = srcH
    sw = srcH * targetRatio
  } else {
    // Source is taller: full width, crop top and bottom.
    sw = srcW
    sh = srcW / targetRatio
  }

  // Centre the window on the focal point, then push it back inside the image.
  const sx = Math.min(Math.max(f.x * srcW - sw / 2, 0), Math.max(0, srcW - sw))
  const sy = Math.min(Math.max(f.y * srcH - sh / 2, 0), Math.max(0, srcH - sh))

  return { sx, sy, sw, sh }
}

/**
 * The size to render the 3:4 thumbnail at, given the source.
 *
 * Capped at THUMB, and never larger than the crop it is drawn from — a 300px
 * photo must not be blown up to 810×1080 just because that is the house size.
 * The card is a fixed 3:4 box in CSS either way, so a smaller file simply
 * displays slightly softer instead of being upscaled into a bigger one.
 */
export function thumbSizeFor(srcW: number, srcH: number): Size {
  const crop = coverCrop(srcW, srcH, THUMB)
  // How much of the target size the crop can actually fill, capped at 1.
  //
  // The ratio is crop-over-target, NOT target-over-crop. Inverted — which is
  // how this was first written — a 4000×3000 photo produces a 267×333
  // thumbnail: it scales DOWN by the factor it should have been ignoring,
  // because the crop is three times bigger than the target rather than three
  // times smaller. Every card in the feed would have been a third of the
  // resolution it needed, and the only symptom is "the photos look soft",
  // which is exactly the kind of thing nobody files a bug about.
  const scale = Math.min(crop.sw / THUMB.w, crop.sh / THUMB.h, 1)
  return {
    w: Math.max(1, Math.round(THUMB.w * scale)),
    h: Math.max(1, Math.round(THUMB.h * scale)),
  }
}
