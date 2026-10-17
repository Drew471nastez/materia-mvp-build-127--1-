/**
 * ===========================================================================
 *  A FILE'S PICTURE, AT THE SIZE ITS TILE IS DRAWN
 * ===========================================================================
 * The Files grid (components/files/files-library.tsx) painted every tile from
 * the original upload: a 3000px camera photo decoded on the main thread to
 * fill a 115px square, a dozen at a time, which is what made the grid stutter
 * as it scrolled and pop as each one arrived.
 *
 * Now a tile asks Next's optimizer (`/_next/image`, the endpoint next/image
 * uses, cached for a year by `minimumCacheTTL`) for a copy at the width it is
 * drawn. A file's address is Storelib's own `https://storelib.com/media/...`
 * (lib/storage/media-url), which next.config.mjs lists in
 * `images.remotePatterns` for exactly this; the storage host is never put in
 * the address. Anything else (a data URL, another host) is drawn as it is.
 *
 * `w` must be one of next.config's sizes and `q` one of its qualities, or the
 * optimizer answers 400 instead of a picture: 128, 256, 384 and 640 are in
 * imageSizes/deviceSizes, 88 is in `images.qualities`. 88 rather than the
 * default 75: at 75 a screenshot or a logo with text in it came out soft in a
 * tile ("thumbnails look soft"), and a 384px copy at 88 is still a few KB.
 *
 * WHAT THE OPTIMIZER IS NOT ASKED FOR
 *
 *   SVG. Next refuses it (no `dangerouslyAllowSVG`), so asking only cost a
 *   400 and a second request before the original was drawn. A drawing has no
 *   pixels to save anyway.
 *   HEIC/HEIF. Neither the optimizer nor most browsers can open it; the tile
 *   shows its clean placeholder instead (components/files/files-library.tsx).
 *
 * A SMALL ORIGINAL IS NOT BLOWN UP. The optimizer never enlarges, so a 24px
 * icon came back at 24px and the tile stretched it to 170: the pixelated X
 * and dots in the chooser. `rawSize` reads the real pixels behind a tile's
 * <img> (its natural size is in CSS pixels, divided by the srcset density
 * the browser chose), and the tile draws such a picture at its own size,
 * centred, rather than stretched.
 */
import { isOwnMedia } from "@/lib/storage/media-url"
import { isOptimizableImage } from "@/lib/images/optimized-url"

export const THUMB_WIDTHS = [128, 256, 384, 640] as const
export const THUMB_QUALITY = 88
/**
 * What the tile is on screen: a third of a phone (three columns), about 170px
 * in the window on a computer. The browser picks the file from this.
 */
export const THUMB_SIZES = "(max-width: 639px) 34vw, 180px"
/**
 * The Files page's own grid (round V): two across on a phone, four to 1023px,
 * five in the 1200px page from there. A phone at three pixels to the point
 * asks for the 640 copy, so a 160px tile is sharp rather than a stretched 384.
 */
export const MANAGE_SIZES = "(max-width: 639px) 46vw, (max-width: 1023px) 23vw, 220px"

/** A `sizes` list of "(max-width: Npx) Xvw" parts and a last width, worked out for a viewport. */
export function slotFor(sizes: string, viewportWidth: number): number {
  for (const part of sizes.split(",").map((p) => p.trim())) {
    const m = /^(?:\(max-width:\s*(\d+)px\)\s*)?([\d.]+)(vw|px)$/.exec(part)
    if (!m) continue
    if (m[1] && viewportWidth > Number(m[1])) continue
    return m[3] === "vw" ? (viewportWidth * Number(m[2])) / 100 : Number(m[2])
  }
  return 180
}

/** THUMB_SIZES worked out for a viewport: the CSS width the browser picks a copy for. */
export function thumbSlot(viewportWidth: number): number {
  return slotFor(THUMB_SIZES, viewportWidth)
}

/** A drawing (SVG) or a format the optimizer cannot read (HEIC): drawn as it is. */
const NOT_RESIZED = /\.(svg|heic|heif)(?:$|[?#])/i

/** Whether the optimizer can be pointed at this file at all. */
export function thumbable(url: string | null | undefined): url is string {
  if (!url) return false
  if (url.startsWith("data:") || url.startsWith("blob:") || url.startsWith("/_next/image")) return false
  if (!/^https:\/\//.test(url)) return false
  if (NOT_RESIZED.test(url)) return false
  return isOwnMedia(url) || isOptimizableImage(url)
}

function at(url: string, w: number): string {
  return `/_next/image?url=${encodeURIComponent(url)}&w=${w}&q=${THUMB_QUALITY}`
}

/** `src`, `srcSet` and `sizes` for a tile; the original alone when it cannot be resized. AVIF or WebP, as the browser takes it (next.config images.formats). */
export function fileThumb(url: string, sizes: string = THUMB_SIZES): { src: string; srcSet?: string; sizes?: string } {
  if (!thumbable(url)) return { src: url }
  return {
    src: at(url, 256),
    srcSet: THUMB_WIDTHS.map((w) => `${at(url, w)} ${w}w`).join(", "),
    sizes,
  }
}

/** A larger copy for the preview, still far smaller than a camera original. */
export function filePreview(url: string): string {
  return thumbable(url) ? at(url, 1080) : url
}

/**
 * The real pixels behind a picture on screen. `naturalWidth` is in CSS
 * pixels: a copy picked from a srcset by its `w` is divided by the density
 * the browser chose (that `w` over the slot from THUMB_SIZES), so it is
 * multiplied back. A plain `src` has a density of 1.
 */
export function rawSize(img: { naturalWidth: number; naturalHeight: number; currentSrc: string; sizes?: string }, viewportWidth: number): { w: number; h: number } {
  const asked = /[?&]w=(\d+)/.exec(img.currentSrc)
  const density = asked && img.sizes ? Number(asked[1]) / slotFor(img.sizes, viewportWidth) : 1
  return { w: Math.round(img.naturalWidth * density), h: Math.round(img.naturalHeight * density) }
}

/** Whether a picture of this many pixels would be stretched in a box this wide: under three quarters of it either way. */
export function tooSmallFor(raw: { w: number; h: number }, box: number): boolean {
  return raw.w > 0 && raw.h > 0 && box > 0 && Math.max(raw.w, raw.h) < box * 0.75
}
