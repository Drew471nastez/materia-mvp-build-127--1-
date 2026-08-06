"use client"

/**
 * ===========================================================================
 *  RESIZE ONCE, AT UPLOAD — NOT ON EVERY VIEW
 * ===========================================================================
 * This is the replacement for Supabase Storage Image Transformations, and it
 * is not merely a cheaper substitute — it is the right shape for the problem.
 *
 * A transform on read is paid once per distinct output, forever, for as long
 * as people look at the image. A resize on write is paid once, by the phone
 * that already has the file in memory, and every viewer afterwards gets a
 * plain CDN-cached object. The old code was asking a metered API to redo the
 * same work for every device pixel ratio in the world, on images that were
 * uploaded once and never changed.
 *
 * It also fixes something the transform never addressed: without this, a
 * modern phone camera uploads a 4000×3000, 6 MB HEIC or JPEG and Supabase
 * STORES all of it. The transform hid that from viewers while the storage
 * bill kept it.
 *
 * ---------------------------------------------------------------------------
 * It must never break an upload
 * ---------------------------------------------------------------------------
 * Every failure path returns the ORIGINAL file. A codec the browser cannot
 * decode, a canvas that is tainted, an out-of-memory on a huge panorama, a
 * `toBlob` that hands back null — all of them mean "upload what the user
 * picked", never "the upload failed". A photo that is larger than ideal is a
 * cost; a photo that would not upload is a seller who gives up.
 */

export interface CompressOptions {
  /** Longest side, in pixels. The image is never scaled UP to reach it. */
  maxSide: number
  /** 0–1, for the lossy encoders. */
  quality?: number
}

/** Listing photos. 1600px is generous for a full-bleed product page on a 2x phone. */
export const LISTING_IMAGE: CompressOptions = { maxSide: 1600, quality: 0.8 }
/** Avatars and covers. Never displayed above a few hundred CSS pixels. */
export const PROFILE_IMAGE: CompressOptions = { maxSide: 800, quality: 0.8 }

/** Below this, re-encoding usually makes the file bigger, not smaller. */
const SKIP_BELOW_BYTES = 120 * 1024

/**
 * Does this browser encode WebP from a canvas?
 *
 * Answered once. WebP is preferred because it keeps the alpha channel — a PNG
 * logo re-encoded to JPEG comes back with a black box where the transparency
 * was, which is a worse bug than the one this file is fixing.
 */
let webpSupport: boolean | null = null
function canEncodeWebp(): boolean {
  if (webpSupport !== null) return webpSupport
  try {
    const c = document.createElement("canvas")
    c.width = 1
    c.height = 1
    webpSupport = c.toDataURL("image/webp").startsWith("data:image/webp")
  } catch {
    webpSupport = false
  }
  return webpSupport
}

function targetSize(w: number, h: number, maxSide: number): { w: number; h: number } | null {
  const longest = Math.max(w, h)
  // Already small enough. Returning null means "do not re-encode at all",
  // which also protects an image that is only just under the limit from
  // losing quality for no size saving.
  if (longest <= maxSide) return null
  const scale = maxSide / longest
  return { w: Math.max(1, Math.round(w * scale)), h: Math.max(1, Math.round(h * scale)) }
}

function swapExtension(name: string, mime: string): string {
  const ext = mime === "image/webp" ? "webp" : "jpg"
  const base = name.replace(/\.[^.]+$/, "") || "image"
  return `${base}.${ext}`
}

/**
 * Downscale and re-encode a picked image, in the browser, before upload.
 *
 * Returns the original file untouched when there is nothing worth doing:
 * it is already small, it is a vector or a GIF, or anything at all goes wrong.
 */
export async function compressImage(file: File, opts: CompressOptions): Promise<File> {
  try {
    if (typeof document === "undefined") return file
    if (!file.type.startsWith("image/")) return file

    // SVG is already resolution-independent and rasterising it is a downgrade —
    // this is exactly the mistake the old /welcome logo transform made. An
    // animated GIF would come back as a single still frame.
    if (file.type === "image/svg+xml" || file.type === "image/gif") return file

    if (file.size < SKIP_BELOW_BYTES) return file

    const bitmap = await createImageBitmap(file)
    const target = targetSize(bitmap.width, bitmap.height, opts.maxSide)
    if (!target) {
      bitmap.close?.()
      return file
    }

    const canvas = document.createElement("canvas")
    canvas.width = target.w
    canvas.height = target.h
    const ctx = canvas.getContext("2d")
    if (!ctx) {
      bitmap.close?.()
      return file
    }

    const mime = canEncodeWebp() ? "image/webp" : "image/jpeg"
    // JPEG has no alpha, so anything transparent would come out black. Painting
    // white underneath first is what makes the fallback safe rather than a
    // visible defect on the one browser that needs it.
    if (mime === "image/jpeg") {
      ctx.fillStyle = "#ffffff"
      ctx.fillRect(0, 0, target.w, target.h)
    }
    ctx.imageSmoothingQuality = "high"
    ctx.drawImage(bitmap, 0, 0, target.w, target.h)
    bitmap.close?.()

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, mime, opts.quality ?? 0.8),
    )
    if (!blob) return file

    // A re-encode that made the file BIGGER is a re-encode worth discarding.
    // It happens with already-optimised sources, and shipping the larger one
    // would make this function a pessimisation.
    if (blob.size >= file.size) return file

    return new File([blob], swapExtension(file.name, mime), {
      type: mime,
      lastModified: Date.now(),
    })
  } catch {
    // Undecodable codec, tainted canvas, out of memory — upload the original.
    return file
  }
}
