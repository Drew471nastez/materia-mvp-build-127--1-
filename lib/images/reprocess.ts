import "server-only"

import sharp from "sharp"

import { CENTER, LARGE_MAX, THUMB, clampFocal, coverCrop, fitWithin, thumbSizeFor, type Focal } from "@/lib/images/geometry"
import { contentBox, isTrimmed, toSourceBox } from "@/lib/images/letterbox"

/**
 * The upload pipeline, again, on the server — for photographs that were stored
 * before it existed.
 *
 * ---------------------------------------------------------------------------
 * Why this is a second implementation and not the same code
 * ---------------------------------------------------------------------------
 * lib/images/pipeline.ts runs in a browser and is built out of `canvas`,
 * `createImageBitmap` and `toBlob`. None of those exist in a Node function, and
 * shimming them would mean a headless browser in a serverless route to resize a
 * JPEG. sharp does the same work natively.
 *
 * What is NOT duplicated is the part that decides anything. The house sizes,
 * the 3:4 crop, the focal-point maths and — the reason this file exists at all
 * — the letterbox detection are all imported from the same modules the browser
 * uses. Only the drawing differs, so a photograph processed here and the same
 * photograph processed on a phone come out the same shape, and there is exactly
 * one place to change if the card ratio ever moves again.
 *
 * ---------------------------------------------------------------------------
 * What it is for
 * ---------------------------------------------------------------------------
 * Listings uploaded before the pipeline have no variants, so every card
 * downloads a full-resolution phone photograph. And listings whose ORIGINAL has
 * bars painted into it render those bars forever, because `object-cover` is
 * faithfully filling the frame with an image that is one-third padding — which
 * is the bug that was reported for days as "the images are not cover". Neither
 * can be fixed at render time. Both are fixed by reading the original once and
 * writing a trimmed, correctly-shaped pair beside it.
 *
 * NOTHING IS DELETED OR OVERWRITTEN. New objects are written under a distinct
 * suffix and only `products.image_variants` is updated; `thumbnail_url` and
 * `gallery_urls` keep pointing at the untouched originals, which is what makes
 * this safe to run repeatedly and safe to stop halfway.
 */

/** Matches the browser pipeline. */
const Q_LARGE = 85
const Q_THUMB = 81

/** Big enough that a bar boundary is exact to a pixel or two, small enough that
 *  the raw buffer is a few megabytes rather than fifty. Same reasoning as the
 *  browser probe. */
const PROBE_MAX = 1024

/** A ceiling on what will be pulled into memory. A serverless function has a
 *  hard limit and a 60MP panorama is not worth taking the whole batch down for. */
export const MAX_SOURCE_BYTES = 25 * 1024 * 1024

export interface ReprocessResult {
  large: { body: Buffer; width: number; height: number }
  thumb: { body: Buffer; width: number; height: number }
  focal: Focal
  /** True when padding was found and removed — the whole point of a re-run. */
  trimmed: boolean
  contentType: "image/webp"
}

/**
 * Find the photograph inside the canvas it was pasted onto.
 *
 * Downscaled first, for the same reason the browser downscales: the answer is
 * about large flat areas and survives it, while the full-resolution raw buffer
 * of a phone photograph is tens of megabytes. `ensureAlpha` so the four
 * channels `contentBox` expects are always there — a JPEG decodes to three.
 */
async function findContent(input: Buffer, w: number, h: number) {
  const scale = Math.min(1, PROBE_MAX / Math.max(w, h))
  const pw = Math.max(1, Math.round(w * scale))
  const ph = Math.max(1, Math.round(h * scale))

  const { data } = await sharp(input)
    .rotate() // EXIF, before anything is measured
    .resize(pw, ph, { fit: "fill" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })

  const box = contentBox(data, pw, ph)
  if (!isTrimmed(box, pw, ph)) return { sx: 0, sy: 0, sw: w, sh: h, trimmed: false }

  // Mapped back through the shared helper, so the backfill and the browser
  // upload cut the same photograph in the same place — including the margin
  // that swallows JPEG ringing at the bar's edge.
  const full = toSourceBox(box, pw, ph, w, h)
  if (!isTrimmed(full, w, h)) return { sx: 0, sy: 0, sw: w, sh: h, trimmed: false }
  return { ...full, trimmed: true }
}

/**
 * A crop rectangle sharp will accept, clamped inside the image.
 *
 * `coverCrop` works in real numbers — it is solving a ratio, and a canvas
 * `drawImage` takes floats without complaint, which is why the browser pipeline
 * has never needed this. sharp's `extract` takes integers and THROWS on
 * anything else ("Expected integer for left but received 456.25"), so without
 * this every call into the backfill fails on the first photograph that does not
 * divide evenly. Which is nearly all of them.
 *
 * Rounded and then clamped, in that order: rounding can push the far edge one
 * pixel past the image, and sharp rejects that too.
 */
function snap(r: { sx: number; sy: number; sw: number; sh: number }, maxW: number, maxH: number) {
  const left = Math.max(0, Math.min(maxW - 1, Math.round(r.sx)))
  const top = Math.max(0, Math.min(maxH - 1, Math.round(r.sy)))
  return {
    left,
    top,
    width: Math.max(1, Math.min(maxW - left, Math.round(r.sw))),
    height: Math.max(1, Math.min(maxH - top, Math.round(r.sh))),
  }
}

/**
 * One stored photograph in, the optimised pair out.
 *
 * Throws rather than returning a partial result: a caller that writes half a
 * pair leaves a listing whose card and detail page disagree, and the backfill's
 * whole safety property is that a row is either updated completely or not at
 * all.
 */
export async function reprocessImage(source: Buffer, focal: Focal = CENTER): Promise<ReprocessResult> {
  if (source.byteLength > MAX_SOURCE_BYTES) throw new Error("source too large")

  const meta = await sharp(source).rotate().metadata()
  const w = meta.width ?? 0
  const h = meta.height ?? 0
  if (!w || !h) throw new Error("undecodable")

  const box = await findContent(source, w, h)
  const f = clampFocal(focal)

  // ── Large: the photograph's own shape, bounded. Trimmed, not cropped.
  const largeSize = fitWithin(box.sw, box.sh, LARGE_MAX)
  const large = await sharp(source)
    .rotate()
    .extract(snap(box, w, h))
    .resize(largeSize.w, largeSize.h, { fit: "fill" })
    .webp({ quality: Q_LARGE })
    .toBuffer()

  // ── Thumb: 3:4 around the focal point.
  //
  // The crop is computed against the TRIMMED rectangle and then offset back
  // into the file's coordinates. A focal point is a fraction of the
  // photograph, not of the canvas somebody pasted it onto — on a 1280×720 file
  // with 120 rows of padding at each end, treating it as a fraction of the
  // whole frame puts "the middle" well into the grey.
  const thumbSize = thumbSizeFor(box.sw, box.sh)
  const inner = coverCrop(box.sw, box.sh, THUMB, f)
  const thumb = await sharp(source)
    .rotate()
    .extract(snap({ ...inner, sx: box.sx + inner.sx, sy: box.sy + inner.sy }, w, h))
    .resize(thumbSize.w, thumbSize.h, { fit: "fill" })
    .webp({ quality: Q_THUMB })
    .toBuffer()

  return {
    large: { body: large, width: largeSize.w, height: largeSize.h },
    thumb: { body: thumb, width: thumbSize.w, height: thumbSize.h },
    focal: f,
    trimmed: box.trimmed,
    contentType: "image/webp",
  }
}
