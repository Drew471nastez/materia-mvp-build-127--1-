/**
 * ===========================================================================
 *  A PICTURE WITH SEE-THROUGH PARTS STAYS SEE-THROUGH
 * ===========================================================================
 * A product cut out as a PNG or WebP, glowing on a theme's dark animated
 * background, is only that while its transparent pixels survive every step:
 *
 *   upload       lib/images/compress.ts encodes WebP (it has alpha) or keeps
 *                the original; the product editor's widescreen copy pads a
 *                picture with transparency with nothing, as WebP
 *                (app/(storelib)/app/products/new/product-editor.tsx), where
 *                an opaque one is padded with grey in a JPEG
 *   storage      the bytes as uploaded
 *   optimizer    Next's /_next/image answers AVIF or WebP (next.config.mjs
 *                images.formats), both with alpha, else the original format
 *   theme        image_url keeps the file's own format; a `format: 'jpg'`
 *                the theme asks for is not applied to a picture that may be
 *                see-through (compat/filters.ts)
 *
 * tests/theme-overlay-badge-footer.test.ts holds each of these.
 */

/** Whether any pixel of the data (RGBA, as getImageData answers) is less than opaque. */
export function rgbaHasTransparency(data: ArrayLike<number>, threshold = 250): boolean {
  for (let i = 3; i < data.length; i += 4) if (data[i] < threshold) return true
  return false
}

/** A file type that can carry transparency. JPEG cannot, so it is never looked at. */
export function mayBeTransparent(type: string): boolean {
  return /^image\/(png|webp|avif|gif|apng)$/i.test(type)
}

/**
 * Whether a decoded picture has see-through pixels, read from a copy at most
 * 256 px across. In a browser only; false where there is no canvas or the
 * pixels cannot be read.
 */
export function hasTransparency(img: CanvasImageSource & { width: number; height: number }): boolean {
  if (typeof document === "undefined") return false
  try {
    const scale = Math.min(1, 256 / Math.max(1, img.width, img.height))
    const w = Math.max(1, Math.round(img.width * scale))
    const h = Math.max(1, Math.round(img.height * scale))
    const canvas = document.createElement("canvas")
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext("2d", { willReadFrequently: true })
    if (!ctx) return false
    ctx.drawImage(img, 0, 0, w, h)
    return rgbaHasTransparency(ctx.getImageData(0, 0, w, h).data)
  } catch {
    return false
  }
}
