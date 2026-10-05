"use client"

/**
 * ===========================================================================
 *  A PICTURE MADE LIGHTER BEFORE IT IS SENT (round 12)
 * ===========================================================================
 * A phone photo is 4032px across and four megabytes; a post never draws it
 * wider than the post (720px, twice that on a sharp screen) and the viewer
 * no wider than the screen. So before a picture goes up for a post or a
 * comment it is drawn again here, in the browser:
 *
 *   SIZE      its longest side at most 2560px (POST_PICTURE_MAX_EDGE), by
 *             halving and then a last step, so fine detail (hair, text) is
 *             averaged rather than skipped and nothing looks rougher
 *   FORMAT    WebP at 0.85; where the browser cannot write WebP (Safari's
 *             canvas hands back a PNG instead) JPEG at the same quality, or
 *             PNG for a picture with see through parts
 *   METADATA  gone: a canvas keeps pixels only, so where the photo was taken,
 *             the camera and the owner's name stay behind; the turn a phone
 *             writes into EXIF is applied first (imageOrientation), so the
 *             picture stands the right way up
 *   GIF       untouched, every frame kept (drawing one would keep the first)
 *
 * A picture that is already small and comes out bigger than it went in goes
 * up as it was, its metadata taken out of the bytes (lib/images/compress.ts
 * withoutMetadata). Nothing here throws: a picture the browser cannot decode
 * goes up as it came, the upload checks on the server still apply.
 *
 * STANDARD DYNAMIC RANGE (round 13). An iPhone photo (JPEG or HEIC, and an
 * AVIF) can carry an HDR gain map that makes it brighter than the page
 * around it. Drawn onto an sRGB canvas it is the standard picture alone, and
 * written again it carries no gain map: so a photo that may carry one is
 * always written again, even when the copy is a little bigger than the
 * file (MAY_BE_HDR); only a PNG or a WebP that came out bigger goes as it was.
 */
import { withoutMetadata } from "@/lib/images/compress"
import { POST_PICTURE_MAX_EDGE, POST_PICTURE_QUALITY } from "@/lib/communities/post-media"

export interface PictureCompression {
  maxEdge: number
  quality: number
}

export const POST_PICTURE: PictureCompression = { maxEdge: POST_PICTURE_MAX_EDGE, quality: POST_PICTURE_QUALITY }

/** Left as they are: a GIF keeps its frames, an SVG is a file, not a picture. */
const UNTOUCHED = /^image\/(gif|svg\+xml)$/i
/** The formats a phone writes an HDR gain map into: always drawn again, so what goes up is standard range. */
export const MAY_BE_HDR = /^image\/(jpeg|jpg|heic|heif|avif)$/i

function renamed(name: string, ext: string): string {
  return `${name.replace(/\.[^./\\]+$/, "") || "picture"}.${ext}`
}

async function decode(file: Blob): Promise<{ source: CanvasImageSource; w: number; h: number; release: () => void } | null> {
  try {
    if (typeof createImageBitmap === "function") {
      const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" })
      return { source: bitmap, w: bitmap.width, h: bitmap.height, release: () => bitmap.close() }
    }
  } catch {
    /* The element below may still read it. */
  }
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = () => reject(new Error("decode"))
      el.src = url
    })
    return { source: img, w: img.naturalWidth, h: img.naturalHeight, release: () => URL.revokeObjectURL(url) }
  } catch {
    URL.revokeObjectURL(url)
    return null
  }
}

/** Halve until the next halving would pass the target, then one last draw onto it. */
function drawAt(source: CanvasImageSource, w: number, h: number, tw: number, th: number): HTMLCanvasElement | null {
  let from: CanvasImageSource = source
  let cw = w
  let ch = h
  while (cw / 2 >= tw && ch / 2 >= th && cw / 2 > tw * 1.05) {
    const step = document.createElement("canvas")
    step.width = Math.round(cw / 2)
    step.height = Math.round(ch / 2)
    const ctx = step.getContext("2d")
    if (!ctx) return null
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = "high"
    ctx.drawImage(from, 0, 0, step.width, step.height)
    from = step
    cw = step.width
    ch = step.height
  }
  const out = document.createElement("canvas")
  out.width = tw
  out.height = th
  const ctx = out.getContext("2d", { colorSpace: "srgb" }) ?? out.getContext("2d")
  if (!ctx) return null
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = "high"
  ctx.drawImage(from, 0, 0, tw, th)
  return out
}

/** Whether any pixel is see through, read from a small copy (cheap at any size). */
function seeThrough(canvas: HTMLCanvasElement): boolean {
  try {
    const probe = document.createElement("canvas")
    probe.width = Math.min(64, canvas.width)
    probe.height = Math.min(64, canvas.height)
    const ctx = probe.getContext("2d", { willReadFrequently: true })
    if (!ctx) return false
    ctx.drawImage(canvas, 0, 0, probe.width, probe.height)
    const px = ctx.getImageData(0, 0, probe.width, probe.height).data
    for (let i = 3; i < px.length; i += 4) if (px[i] < 255) return true
    return false
  } catch {
    return false
  }
}

const toBlob = (canvas: HTMLCanvasElement, type: string, quality?: number) => new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality))

/** The picture to send for a post or a comment (see the top of this file). */
export async function compressPostPicture(file: File, opts: PictureCompression = POST_PICTURE): Promise<File> {
  if (typeof document === "undefined" || !file.type.startsWith("image/") || UNTOUCHED.test(file.type)) return file
  const decoded = await decode(file)
  if (!decoded || !decoded.w || !decoded.h) return (await withoutMetadata(file)) as File
  try {
    const scale = Math.min(1, opts.maxEdge / Math.max(decoded.w, decoded.h))
    const tw = Math.max(1, Math.round(decoded.w * scale))
    const th = Math.max(1, Math.round(decoded.h * scale))
    const canvas = drawAt(decoded.source, decoded.w, decoded.h, tw, th)
    if (!canvas) return (await withoutMetadata(file)) as File
    let blob = await toBlob(canvas, "image/webp", opts.quality)
    /* Safari's canvas writes no WebP and hands back a PNG instead: JPEG then, or PNG where the picture has see through parts. */
    if (!blob || blob.type !== "image/webp") blob = seeThrough(canvas) ? await toBlob(canvas, "image/png") : await toBlob(canvas, "image/jpeg", opts.quality)
    if (!blob || !blob.size) return (await withoutMetadata(file)) as File
    /* Already small and lighter as it was: it goes as it came, without its metadata. */
    if (scale === 1 && blob.size >= file.size && !MAY_BE_HDR.test(file.type)) return (await withoutMetadata(file)) as File
    const ext = blob.type === "image/webp" ? "webp" : blob.type === "image/png" ? "png" : "jpg"
    return new File([blob], renamed(file.name, ext), { type: blob.type, lastModified: Date.now() })
  } catch {
    return (await withoutMetadata(file)) as File
  } finally {
    decoded.release()
  }
}
