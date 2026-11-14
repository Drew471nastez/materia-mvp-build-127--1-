/**
 * Next's image optimizer, for the two or three places that cannot use <Image>.
 *
 * `next/image` is the right answer almost everywhere and is what the product
 * cards use. But some components render a plain <img> for a reason — the
 * avatar is a Radix primitive whose whole job is to decide when the <img>
 * appears — and those were fetching the ORIGINAL upload: a 4032px camera JPEG
 * painted into a 137px circle, four megabytes down the wire for something that
 * needs about twenty kilobytes.
 *
 * `/_next/image` is the same endpoint <Image> points its srcset at: resize and
 * re-encode to AVIF/WebP at the edge, cached for a year (`minimumCacheTTL` in
 * next.config). It has nothing to do with Supabase's `/render/image/`
 * transformer, which is metered, which this project has already exhausted, and
 * which tests/no-image-transforms.test.ts fails the build over.
 *
 * TWO THINGS THE ENDPOINT IS STRICT ABOUT, and returns 400 rather than an
 * image when you get them wrong:
 *
 *  - `w` must be one of the configured sizes. Not "any number up to the
 *    largest" — a literal member of deviceSizes ∪ imageSizes.
 *  - `q` must be listed in `images.qualities`. Next 16 defaults that to `[75]`
 *    alone, so the pleasant-looking `q=90` you might reach for silently breaks
 *    every image on the page. The value below is in next.config's list; if you
 *    change one, change both.
 */

/**
 * The hosts `next.config.mjs` lists in `images.remotePatterns`, which is the
 * only set the optimizer will fetch from. KEEP THIS IN STEP WITH THAT LIST.
 *
 * It exists because of what happens when a URL is not on it. `<Image>` does
 * not degrade — it THROWS "hostname is not configured", during render, which
 * in a server component takes the whole page down. `cover_url` and
 * `avatar_url` are user data going back years: one row pointing at some other
 * CDN, from an import or an old paste, and the creator's storefront is an
 * error page instead of a slightly-too-large photo. So anything unrecognised
 * is served as it always was, unoptimised and intact.
 */
const OPTIMIZABLE_HOSTS = [
  /^images\.unsplash\.com$/,
  /^img\.youtube\.com$/,
  /^i\.ytimg\.com$/,
  /^images\.pexels\.com$/,
  /^i\.pinimg\.com$/,
]

/*
  STORELIB'S OWN STORAGE ONLY (round AW), as next.config.mjs OWN_STORAGE_HOSTS
  lists it: the production project and the one this deployment reads, for
  their storage files. It was any *.supabase.co, which the optimizer no longer
  fetches from: a picture on another project is drawn as it is.
*/
const PRODUCTION_STORAGE_HOST = "skgtqglupjcnfhfscink.supabase.co"

/** Whether a host and path are one of Storelib's own storage files. */
export function ownStorageFile(hostname: string, pathname: string): boolean {
  if (!pathname.startsWith("/storage/v1/")) return false
  const host = hostname.toLowerCase()
  if (host === PRODUCTION_STORAGE_HOST) return true
  try {
    return host === new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || "").hostname.toLowerCase()
  } catch {
    return false
  }
}

/** Whether the optimizer can be pointed at this URL at all. */
export function isOptimizableImage(src?: string | null): boolean {
  if (!src) return false
  // Root-relative: our own /public, always fine. `//host/path` is not.
  if (src.startsWith("/") && !src.startsWith("//")) return true
  try {
    const url = new URL(src)
    if (url.protocol !== "https:") return false
    /* Storelib's own address for a public file (https://storelib.com/media/..., lib/storage/media-url.ts): next.config lists it, path and all. */
    if (url.hostname === (process.env.NEXT_PUBLIC_MAIN_DOMAIN || "storelib.com") && url.pathname.startsWith("/media/")) return true
    if (ownStorageFile(url.hostname, url.pathname)) return true
    return OPTIMIZABLE_HOSTS.some((host) => host.test(url.hostname))
  } catch {
    return false
  }
}

/** deviceSizes ∪ imageSizes, sorted. Next rejects anything else. */
export const NEXT_IMAGE_WIDTHS = [32, 48, 64, 96, 128, 256, 384, 640, 750, 828, 1080, 1200, 1920, 2048, 3840]

/**
 * Higher than Next's default 75, and deliberately so.
 *
 * These are the images a creator chose to represent themselves. At AVIF q88 a
 * cover is still a fraction of the original JPEG and there is no visible
 * difference at any zoom a visitor will use — which is the "don't wreck the
 * quality" half of the requirement. It MUST appear in `images.qualities` in
 * next.config.mjs or the optimizer 400s.
 */
export const PORTRAIT_QUALITY = 88

/**
 * A published website's pictures: its sections' and an imported theme's. The
 * creator's own photographs, re-encoded at the width the screen needs, at a
 * quality where AVIF and WebP are not visibly softer than the upload. Listed
 * in `images.qualities` in next.config.mjs like the one above.
 */
export const SITE_PICTURE_QUALITY = 90

/**
 * @param displayWidth CSS pixels the image occupies on screen — not the size
 *   of the source file. The ×2 for retina is applied here so callers do not
 *   have to remember it.
 */
/**
 * A srcSet whose descriptors are the widths of the FILES.
 *
 * That is the only thing a `w` descriptor may be, and it is easy to get
 * wrong because the number you have in hand is usually the DISPLAY width.
 * The laptop carousel on the home page had:
 *
 *     `${getOptimized(url, 240)} 360w, ${getOptimized(url, 380)} 600w`
 *
 * where `getOptimized(url, 380)` produces a file 828px wide. So the browser
 * was choosing between two candidates by numbers neither of them was, and on
 * a 2x screen it settled on an 828px file for a slot painting 1600 device
 * pixels — half the resolution the screen could show, from a 2718px original.
 *
 * Give it honest descriptors and an honest `sizes` and it picks correctly at
 * every width and pixel ratio without anyone having to work it out.
 *
 * @param widths File widths to offer. Members of NEXT_IMAGE_WIDTHS only;
 *   anything else is a 400 from the optimizer rather than a picture, so
 *   strays are dropped instead of shipped.
 */
export function optimizedSrcSet(src: string, widths: number[], quality: number = PORTRAIT_QUALITY): string {
  if (!src || !isOptimizableImage(src)) return ""
  return widths
    .filter((w) => NEXT_IMAGE_WIDTHS.includes(w))
    .sort((a, b) => a - b)
    .map((w) => `/_next/image?url=${encodeURIComponent(src)}&w=${w}&q=${quality} ${w}w`)
    .join(", ")
}

export function optimizedImageUrl(src: string, displayWidth: number, quality: number = PORTRAIT_QUALITY): string {
  if (!src) return src
  // Already inline, already a local preview, or already optimised.
  if (src.startsWith("data:") || src.startsWith("blob:") || src.startsWith("/_next/image")) return src
  // A host the optimizer will not fetch returns 400, not a picture. Hand back
  // the original so it simply loads unoptimised.
  if (!isOptimizableImage(src)) return src

  const target = Math.round(displayWidth * 2)
  const width = NEXT_IMAGE_WIDTHS.find((w) => w >= target) ?? NEXT_IMAGE_WIDTHS[NEXT_IMAGE_WIDTHS.length - 1]
  return `/_next/image?url=${encodeURIComponent(src)}&w=${width}&q=${quality}`
}
