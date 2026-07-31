"use client"

/**
 * Start fetching a listing's full-bleed photo before the page that needs it
 * exists.
 *
 * The grid tile and the product page show the same photograph at very different
 * sizes — a tile is under half the viewport, the product page is all of it — so
 * they resolve to different sources and the tile's copy is no help. The product
 * page therefore always opened on a grey rectangle for as long as that fetch
 * took, however fast the navigation itself was.
 *
 * Kicking it off when the finger lands buys the whole of the tap, the route
 * change and the render — usually most of what the image needed. From the reels
 * feed none of this is necessary: that photo is already full-bleed at the same
 * quality, so it is the same URL and already in cache.
 */

/**
 * Must match `images.deviceSizes` in next.config.mjs. Duplicated because the
 * config is not readable from the client, and being one rung out would mean
 * fetching a size the page then declines to use — a wasted request that makes
 * things slower rather than faster.
 */
const DEVICE_SIZES = [384, 640, 750, 828, 1080, 1200, 1280, 1440, 1600, 1920]

/** Same quality the product page asks for; a different one is a different file. */
const QUALITY = 68

const warmed = new Set<string>()

/**
 * The exact URL next/image will request for a photo laid out at 100vw.
 *
 * This is the browser's own selection rule for a `w`-descriptor srcset: take the
 * CSS width the image will occupy, multiply by the device pixel ratio, and pick
 * the smallest candidate at least that large.
 */
function fullBleedSrc(src: string): string | null {
  if (!src || src.startsWith("data:") || src.startsWith("blob:")) return null
  const dpr = window.devicePixelRatio || 1
  const need = (window.innerWidth || 390) * dpr
  const w = DEVICE_SIZES.find((d) => d >= need) ?? DEVICE_SIZES[DEVICE_SIZES.length - 1]
  return `/_next/image?url=${encodeURIComponent(src)}&w=${w}&q=${QUALITY}`
}

/** Fetch it into the browser's cache. Once per photo, per session. */
export function warmListingImage(src?: string | null): void {
  if (typeof window === "undefined" || !src) return
  let url: string | null = null
  try {
    url = fullBleedSrc(src)
  } catch {
    return
  }
  if (!url || warmed.has(url)) return
  warmed.add(url)
  const img = new Image()
  img.decoding = "async"
  // Low priority: this is speculative, and it must never compete with the photos
  // actually on screen for bandwidth.
  ;(img as any).fetchPriority = "low"
  img.src = url
}
