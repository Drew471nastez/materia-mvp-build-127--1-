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
 * optimizer answers 400 instead of a picture: 128, 256 and 384 are in
 * imageSizes/deviceSizes, 75 is in `images.qualities`.
 */
import { isOwnMedia } from "@/lib/storage/media-url"
import { isOptimizableImage } from "@/lib/images/optimized-url"

export const THUMB_WIDTHS = [128, 256, 384] as const
export const THUMB_QUALITY = 75
/**
 * What the tile is on screen: a third of a phone (three columns), about 170px
 * in the window on a computer. The browser picks the file from this.
 */
export const THUMB_SIZES = "(max-width: 639px) 34vw, 180px"

/** Whether the optimizer can be pointed at this file at all. */
export function thumbable(url: string | null | undefined): url is string {
  if (!url) return false
  if (url.startsWith("data:") || url.startsWith("blob:") || url.startsWith("/_next/image")) return false
  if (!/^https:\/\//.test(url)) return false
  return isOwnMedia(url) || isOptimizableImage(url)
}

function at(url: string, w: number): string {
  return `/_next/image?url=${encodeURIComponent(url)}&w=${w}&q=${THUMB_QUALITY}`
}

/** `src`, `srcSet` and `sizes` for a tile; the original alone when it cannot be resized. */
export function fileThumb(url: string): { src: string; srcSet?: string; sizes?: string } {
  if (!thumbable(url)) return { src: url }
  return {
    src: at(url, 256),
    srcSet: THUMB_WIDTHS.map((w) => `${at(url, w)} ${w}w`).join(", "),
    sizes: THUMB_SIZES,
  }
}

/** A larger copy for the preview, still far smaller than a camera original. */
export function filePreview(url: string): string {
  return thumbable(url) ? at(url, 1080) : url
}
