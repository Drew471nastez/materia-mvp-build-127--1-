/**
 * A PUBLISHED WEBSITE'S PICTURE AT THE SIZE THE SCREEN DRAWS IT.
 *
 * Sections drew a picture from its original file: a product photo was a
 * 1.85 MB PNG on a phone (varshadigi.storelib.com, its largest paint at 3.8
 * to 4.0 s on a phone). These attributes let the browser pick a re-encoded
 * copy (AVIF or WebP from Next's image optimiser, at the quality a site's
 * pictures are kept at, lib/images/optimized-url.ts) at the width it needs.
 * The original stays as `src`, so the picture is the same one, never
 * cropped or restyled, and a file the optimiser will not take (SVG, GIF, a
 * blob or data URL, another host) is left exactly as it was.
 */
import { isOptimizableImage, optimizedSrcSet, SITE_PICTURE_QUALITY } from "@/lib/images/optimized-url"

/** The same widths imported themes' pictures are offered at (lib/website-builder/media-pass.ts). */
export const SITE_IMAGE_WIDTHS = [384, 640, 828, 1080, 1200, 1920, 2048]

export function siteImageProps(src: unknown, sizes = "100vw"): { srcSet?: string; sizes?: string } {
  const s = typeof src === "string" ? src.trim() : ""
  if (!s || s.startsWith("data:") || s.startsWith("blob:") || s.startsWith("/_next/image")) return {}
  if (/\.(svg|gif)(\?|#|$)/i.test(s)) return {}
  if (!isOptimizableImage(s)) return {}
  const srcSet = optimizedSrcSet(s, SITE_IMAGE_WIDTHS, SITE_PICTURE_QUALITY)
  return srcSet ? { srcSet, sizes } : {}
}
