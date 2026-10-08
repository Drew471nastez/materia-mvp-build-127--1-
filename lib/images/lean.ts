/**
 * ===========================================================================
 *  PICTURES FOR A SLOW CONNECTION OR A SMALL PHONE
 * ===========================================================================
 * Explore is a wall of covers. On a fast laptop each is fetched at the
 * screen's full density; on 3G, with data saver on, or on a phone with 2 GB
 * of memory, that is the page arriving one picture at a time while the
 * phone decodes files three times bigger than it can show well.
 *
 * `leanImages()` says whether this device should get the light version, and
 * `leanSizes()` turns a `sizes` attribute into one that asks for 1x files:
 * every length divided by the pixel ratio, so a 3x phone fetches a third of
 * the width. The picture stays sharp enough to read, and the wall arrives.
 *
 * `previewUrl()` is a 32px wide copy from the same optimizer, a few hundred
 * bytes, painted blurred under the cover while the cover loads.
 *
 * Browser only for leanImages (it reads navigator); the rest is pure.
 */

type Connection = { saveData?: boolean; effectiveType?: string }

export function leanImages(): boolean {
  if (typeof navigator === "undefined") return false
  const nav = navigator as Navigator & { connection?: Connection; deviceMemory?: number }
  const c = nav.connection
  if (c?.saveData) return true
  if (c?.effectiveType && /^(slow-2g|2g|3g)$/.test(c.effectiveType)) return true
  return typeof nav.deviceMemory === "number" && nav.deviceMemory <= 2
}

/** Every length in a `sizes` value, divided by the pixel ratio. Media conditions are left alone. */
export function leanSizes(sizes: string, ratio: number): string {
  if (!(ratio > 1)) return sizes
  return sizes
    .split(",")
    .map((part) => {
      const trimmed = part.trim()
      const m = trimmed.match(/^(.*?)(\d+(?:\.\d+)?)(vw|px)$/)
      if (!m) return trimmed
      const scaled = Math.max(1, Math.round((Number(m[2]) / ratio) * 10) / 10)
      return `${m[1]}${scaled}${m[3]}`
    })
    .join(", ")
}

/** A 32px wide copy through Next's optimizer, for the blurred preview. */
export function previewUrl(src: string): string | null {
  if (!src || !/^https:\/\//.test(src)) return null
  return `/_next/image?url=${encodeURIComponent(src)}&w=32&q=75`
}
