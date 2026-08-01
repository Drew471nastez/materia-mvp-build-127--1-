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

const warmed = new Map<string, "low" | "high">()

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

/**
 * Fetch it into the browser's cache. Once per photo, per session.
 *
 * `urgency` is the difference between a guess and an intention, and it matters
 * more than it looks. Warming a card the moment it scrolls near the viewport is
 * speculative — most of those listings are never opened, so those requests must
 * queue behind the photos actually on screen. But the instant a finger lands on
 * a card, that same image stops being a guess: it is the largest thing on the
 * page being opened, and leaving it at low priority means the browser politely
 * serves everything else first while the user waits on a grey rectangle.
 *
 * A photo warmed speculatively and then tapped is re-requested at high urgency;
 * the browser coalesces that against the in-flight low-priority fetch rather
 * than starting a second one.
 */
export function warmListingImage(src?: string | null, urgency: "low" | "high" = "low"): void {
  if (typeof window === "undefined" || !src) return
  let url: string | null = null
  try {
    url = fullBleedSrc(src)
  } catch {
    return
  }
  if (!url) return
  // A low-priority warm may be upgraded by a later tap; a high one is final.
  const seen = warmed.get(url)
  if (seen === "high" || seen === urgency) return
  warmed.set(url, urgency)
  const img = new Image()
  img.decoding = "async"
  ;(img as any).fetchPriority = urgency
  img.src = url
}
