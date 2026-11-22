/**
 * ===========================================================================
 *  COMPRESS ONCE, AT UPLOAD, IN THE BROWSER
 * ===========================================================================
 * lib/storage/image-url.ts has promised for a while that "compression happens
 * ONCE at upload, in the browser, before the bytes ever reach Supabase — see
 * lib/images/compress.ts". That file did not exist. Nothing resized anything:
 * a phone camera JPEG went to storage at 4032×3024 and four megabytes, and
 * came back at four megabytes to be painted into a 137px circle.
 *
 * That is the honest reason the cover and the avatar were slow. Serving them
 * through Next's optimizer (which this now does as well) hides it from the
 * viewer, but the origin object is still four megabytes: it costs storage, it
 * costs the optimizer a slow first fetch, and anything that reads the original
 * — an export, an email, the optimizer's cache expiring — pays again.
 *
 * WHY NOT SUPABASE'S TRANSFORMER: it is metered, the project hit 106/100 of
 * its allowance, and the next transformed image would not have been served at
 * all. tests/no-image-transforms.test.ts fails the build if anything reaches
 * for it. Compressing at upload is paid once per image instead of once per
 * viewer, which is the better trade even without the bill.
 *
 * WHAT IT WILL NOT DO
 * - Touch an SVG or a GIF. One is already small and would be rasterised; the
 *   other would lose its animation.
 * - Return anything bigger than what it was given. A small, already-optimised
 *   file goes through untouched rather than being re-encoded into something
 *   larger, which is what a fixed-quality re-encode does to a clean PNG.
 * - Throw. Every failure path returns the original file: a browser without
 *   `createImageBitmap`, a canvas that refuses to allocate, a decode error on
 *   a file the <input> accepted anyway. Refusing an upload because the nice
 *   version of it failed is worse than uploading the big one.
 */

import { stripImageMetadata } from "./metadata"

export interface CompressProfile {
  /** Longest edge, in CSS pixels, that this image is ever displayed at ×2. */
  maxWidth: number
  maxHeight: number
  /** 0–1, passed to canvas.toBlob. */
  quality: number
}

/**
 * Per bucket, because the right size is a fact about where the image is shown.
 *
 * An avatar is a 137px circle, so 512 covers it on a 3× screen with room to
 * spare. A cover is full-bleed, so it gets the width of a large laptop — and
 * its height is capped separately because a portrait photo dropped into a
 * 3:1 banner is mostly crop, and storing the parts nobody will see is the
 * same waste in a different direction.
 */
export const COMPRESS_PROFILES: Record<string, CompressProfile> = {
  avatars: { maxWidth: 512, maxHeight: 512, quality: 0.9 },
  covers: { maxWidth: 2400, maxHeight: 1400, quality: 0.84 },
  "product-images": { maxWidth: 2000, maxHeight: 2000, quality: 0.84 },
  "store-builder-images": { maxWidth: 2000, maxHeight: 2000, quality: 0.84 },
}

/** Rasterising either of these makes it worse, not smaller. */
const LEAVE_ALONE = /^image\/(svg\+xml|gif)$/

function withExtension(name: string, ext: string): string {
  const base = name.replace(/\.[^./\\]+$/, "")
  return `${base || "image"}.${ext}`
}

/**
 * Halve, then halve again, then finish.
 *
 * `drawImage` straight from 4032px to 512px asks the browser to pick one
 * source pixel in eight and throw the rest away, and it looks it — hair and
 * text alias into fizz. Repeatedly halving averages every pixel into the
 * result instead, which is what a real resampler does, and costs a handful of
 * milliseconds on an image this small. The last step is the odd one out and
 * lands exactly on the target.
 *
 * "Without wrecking the quality" is the whole requirement here; this is the
 * part that keeps that true.
 */
function drawDownscaled(
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number,
): HTMLCanvasElement | null {
  let current: CanvasImageSource = source
  let width = sourceWidth
  let height = sourceHeight
  let canvas: HTMLCanvasElement | null = null

  // Never halve past the target: the final draw handles the remainder.
  while (width > targetWidth * 2 && height > targetHeight * 2) {
    const nextWidth = Math.max(targetWidth, Math.round(width / 2))
    const nextHeight = Math.max(targetHeight, Math.round(height / 2))
    const step = document.createElement("canvas")
    step.width = nextWidth
    step.height = nextHeight
    const stepCtx = step.getContext("2d")
    if (!stepCtx) return null
    stepCtx.imageSmoothingEnabled = true
    stepCtx.imageSmoothingQuality = "high"
    stepCtx.drawImage(current, 0, 0, nextWidth, nextHeight)
    current = step
    width = nextWidth
    height = nextHeight
    canvas = step
  }

  if (width === targetWidth && height === targetHeight && canvas) return canvas

  const out = document.createElement("canvas")
  out.width = targetWidth
  out.height = targetHeight
  const ctx = out.getContext("2d")
  if (!ctx) return null
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = "high"
  ctx.drawImage(current, 0, 0, targetWidth, targetHeight)
  return out
}

async function decode(file: File): Promise<{ source: CanvasImageSource; width: number; height: number; release: () => void }> {
  if (typeof createImageBitmap === "function") {
    // `from-image` applies the EXIF orientation. Without it, a photo taken in
    // portrait on a phone uploads sideways — the <img> tag would have rotated
    // it for display, a canvas does not.
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" })
    return { source: bitmap, width: bitmap.width, height: bitmap.height, release: () => bitmap.close() }
  }

  const url = URL.createObjectURL(file)
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new window.Image()
      el.onload = () => resolve(el)
      el.onerror = () => reject(new Error("decode failed"))
      el.src = url
    })
    return {
      source: image,
      width: image.naturalWidth,
      height: image.naturalHeight,
      release: () => URL.revokeObjectURL(url),
    }
  } catch (error) {
    URL.revokeObjectURL(url)
    throw error
  }
}

/**
 * The same picture without its location, camera and owner metadata
 * (lib/images/metadata.ts), for every path above that uploads the original.
 * A re-encode through canvas drops the metadata anyway; an original that goes
 * up as it came used to keep it, GPS included. Never throws: a file it cannot
 * read is returned as it was.
 */
export async function withoutMetadata<T extends Blob>(file: T): Promise<T | File> {
  try {
    const bytes = new Uint8Array(await file.arrayBuffer())
    const clean = stripImageMetadata(bytes)
    if (clean === bytes) return file
    const name = file instanceof File ? file.name : "image"
    return new File([clean], name, { type: file.type, lastModified: Date.now() })
  } catch {
    return file
  }
}

export async function compressImage(file: File, profile: CompressProfile): Promise<File> {
  if (typeof document === "undefined") return file
  if (!file.type.startsWith("image/") || LEAVE_ALONE.test(file.type)) return file

  let release = () => {}
  try {
    const decoded = await decode(file)
    release = decoded.release

    const scale = Math.min(1, profile.maxWidth / decoded.width, profile.maxHeight / decoded.height)

    // Already small enough AND already a modern format: re-encoding it can
    // only lose detail, and often gains bytes.
    if (scale === 1 && (file.type === "image/webp" || file.type === "image/avif")) return (await withoutMetadata(file)) as File

    const targetWidth = Math.max(1, Math.round(decoded.width * scale))
    const targetHeight = Math.max(1, Math.round(decoded.height * scale))
    const canvas = drawDownscaled(decoded.source, decoded.width, decoded.height, targetWidth, targetHeight)
    if (!canvas) return (await withoutMetadata(file)) as File

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/webp", profile.quality),
    )
    if (!blob || blob.size === 0) return (await withoutMetadata(file)) as File

    // A clean PNG logo, or a photo already compressed harder than this, comes
    // out larger. Uploading that would be a downgrade wearing an optimisation's
    // name. The original goes instead, without its metadata.
    if (blob.size >= file.size) return (await withoutMetadata(file)) as File

    /* A browser with no WebP encoder answers PNG: named and typed as what it is (both keep transparency). */
    const type = blob.type === "image/png" ? "image/png" : "image/webp"
    return new File([blob], withExtension(file.name, type === "image/png" ? "png" : "webp"), {
      type,
      lastModified: Date.now(),
    })
  } catch {
    return (await withoutMetadata(file)) as File
  } finally {
    release()
  }
}
