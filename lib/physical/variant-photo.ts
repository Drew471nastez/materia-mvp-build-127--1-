/**
 * ===========================================================================
 *  THE CHOSEN VARIANT'S PHOTO, SHOWN IN THE PAGE'S GALLERY
 * ===========================================================================
 * On storelib.com's own product page the gallery (components/product/
 * product-gallery.tsx) and the buy box (components/physical/buy-box.tsx) are
 * two components far apart in the tree, one drawn on the server. When the
 * buyer picks Sand, the buy box says so with a window event, and a gallery
 * showing that product moves to Sand's photo, as a Shopify theme's gallery
 * does. A photo the gallery does not have is added at its end.
 *
 * The buy box also asks, once, whether any gallery is listening: when none
 * is (a page with the buy box alone) it draws the photo small beside the
 * price itself, as it always did.
 *
 * Browser only, and harmless on the server: every call is a no-op there.
 */
export const VARIANT_PHOTO_EVENT = "storelib:variant-photo"

interface Detail {
  productId: string
  /** The photo to show; "" only asks whether a gallery is listening. */
  url: string
  /** Set by a listening gallery for this product. */
  shown: boolean
}

/** Tell the page's gallery to show this photo. True when a gallery for this product took it. */
export function announceVariantPhoto(productId: string, url: string): boolean {
  if (typeof window === "undefined" || !productId) return false
  const detail: Detail = { productId, url, shown: false }
  window.dispatchEvent(new CustomEvent<Detail>(VARIANT_PHOTO_EVENT, { detail }))
  return detail.shown
}

/** Whether a gallery for this product is on the page. */
export function galleryFollowsVariants(productId: string): boolean {
  return announceVariantPhoto(productId, "")
}

/** For a gallery: called with each photo announced for its product. Returns the unsubscribe. */
export function onVariantPhoto(productId: string, show: (url: string) => void): () => void {
  if (typeof window === "undefined") return () => {}
  const listener = (e: Event) => {
    const d = (e as CustomEvent<Detail>).detail
    if (!d || d.productId !== productId) return
    d.shown = true
    if (d.url) show(d.url)
  }
  window.addEventListener(VARIANT_PHOTO_EVENT, listener)
  return () => window.removeEventListener(VARIANT_PHOTO_EVENT, listener)
}
