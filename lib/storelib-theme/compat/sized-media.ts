/**
 * ===========================================================================
 *  A WEBSITE'S OWN UPLOADS, SENT AT THE SIZE THEY ARE DRAWN (round 65)
 * ===========================================================================
 * A theme that prints a picture's address as it is (Materia's hero sections
 * through snippets/offer-image-url, a merchant's own Liquid, an old install)
 * sends the original file. Measured on liam-bailey.storelib.com's front page:
 * the hero was a 1600x1600 PNG of 1.9MB, the largest thing on the page and
 * 68% of everything the page downloaded; on a phone network (1.6Mbps, 150ms)
 * the page's largest paint came at 11.8s. The same picture through the
 * optimizer is 58KB at 1920 wide (AVIF), 25KB at 828.
 *
 * So every `<img>` and `<source>` whose only address is one of Storelib's
 * own uploads (storelib.com/media/…, the storage bucket), and that names no
 * srcset of its own, is sent through /_next/image like every picture
 * `image_url` sizes (filters.ts sized):
 *   - a picture the theme says is small (width under 320) gets one address,
 *     twice that wide for a sharp screen;
 *   - any other gets the widths a phone, a tablet and a desktop ask for, with
 *     the theme's own `sizes`, or DEFAULT_SIZES when it says none (never
 *     larger than the file: the optimizer does not enlarge).
 * SVG and GIF go as they are (the optimizer refuses one and stills the
 * other), and so does anything already sized, a data or blob address,
 * another host's file and a theme's own asset. Script, style and textarea
 * text is never touched. Nothing else on the page changes.
 */
import { NEXT_IMAGE_WIDTHS, SITE_PICTURE_QUALITY, isOptimizableImage } from "@/lib/images/optimized-url"
import { attr } from "./first-load"

/** The widths offered for a picture of any size: a phone, a large phone, a tablet, a desktop. */
export const SIZED_MEDIA_WIDTHS = [640, 828, 1200, 1920] as const
/*
  THE SIZES SAID WHEN THE THEME SAYS NONE. A full width picture on a phone is
  nearly always a hero drawn with object-fit: cover in a box taller than the
  picture is at that width (Materia's hero: 560px tall on a 390px screen), so
  it shows a part of a wider picture. Measured on Liam's front page: at 100vw
  a phone took the 828 file and the hero was visibly softer than the
  original; at 150vw it takes the 1200 file (41KB against 1.9MB) and matches.
*/
export const DEFAULT_SIZES = "(max-width: 767px) 150vw, 100vw"
/** Under this many CSS pixels a picture is an icon or a badge: one address, twice as wide. */
const SMALL_WIDTH = 320
/** At most this many pictures per page are rewritten; past it the page is left as it is. */
const MAX_PICTURES = 400

const decode = (v: string) => v.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
const encodeAttr = (v: string) => v.replace(/&/g, "&amp;").replace(/"/g, "&quot;")

/** One of Storelib's own uploads, by an absolute address, that the optimizer can size. */
export function isSizableUpload(src: string): boolean {
  if (!/^https:\/\//i.test(src)) return false
  if (/\/_next\/image/.test(src)) return false
  /* An SVG or a GIF goes as it is: the optimizer refuses the one and stills the other. */
  if (/\.(svg|gif)(?:[?#]|$)/i.test(src)) return false
  /* Already sized by its host (a storage render URL, a query that names a width). */
  if (/\/render\/image\//.test(src) || /[?&](?:w|width)=\d/.test(src)) return false
  return isOptimizableImage(src) && !/^https:\/\/[^/]*shopify/i.test(src)
}

export function sizedUploadUrl(src: string, width: number): string {
  return `/_next/image?url=${encodeURIComponent(src)}&w=${width}&q=${SITE_PICTURE_QUALITY}`
}

function nextWidth(px: number): number {
  return NEXT_IMAGE_WIDTHS.find((x) => x >= px) ?? NEXT_IMAGE_WIDTHS[NEXT_IMAGE_WIDTHS.length - 1]
}

function setAttr(raw: string, name: string, value: string): string {
  const re = new RegExp(`(\\s${name}\\s*=\\s*)(?:"[^"]*"|'[^']*'|[^\\s"'>]+)`, "i")
  if (re.test(raw)) return raw.replace(re, (_m, lead: string) => `${lead}"${encodeAttr(value)}"`)
  return raw.replace(/^<([a-zA-Z]+)\b/, (m) => `${m} ${name}="${encodeAttr(value)}"`)
}

/** The tag sized, or null when it is left as it is. */
function sizedTag(raw: string, kind: "img" | "source"): string | null {
  if (kind === "img") {
    const src = attr(raw, "src")
    if (!src || attr(raw, "srcset")) return null
    const original = decode(src.trim())
    if (!isSizableUpload(original)) return null
    const width = Number(attr(raw, "width") ?? NaN)
    if (Number.isFinite(width) && width > 0 && width < SMALL_WIDTH) {
      return setAttr(raw, "src", sizedUploadUrl(original, nextWidth(Math.min(3840, width * 2))))
    }
    const srcset = SIZED_MEDIA_WIDTHS.map((w) => `${sizedUploadUrl(original, w)} ${w}w`).join(", ")
    let out = setAttr(raw, "src", sizedUploadUrl(original, 1920))
    out = setAttr(out, "srcset", srcset)
    if (attr(raw, "sizes") === null) out = setAttr(out, "sizes", DEFAULT_SIZES)
    return out
  }
  const set = attr(raw, "srcset")
  if (!set) return null
  const original = decode(set.trim())
  /* One address only: a srcset with descriptors is the theme's own choice. */
  if (/[\s,]/.test(original) || !isSizableUpload(original)) return null
  let out = setAttr(raw, "srcset", SIZED_MEDIA_WIDTHS.map((w) => `${sizedUploadUrl(original, w)} ${w}w`).join(", "))
  if (attr(raw, "sizes") === null) out = setAttr(out, "sizes", DEFAULT_SIZES)
  return out
}

export interface SizedMedia {
  html: string
  /** How many tags were sized. */
  sized: number
}

/** The page with its own unsized uploads sent through the optimizer. */
export function withSizedMedia(html: string): SizedMedia {
  if (!/<(?:img|source)\b/i.test(html)) return { html, sized: 0 }
  const re = /<(script|style|textarea)\b[^>]*>[\s\S]*?<\/\1\s*>|<(img|source)\b(?:"[^"]*"|'[^']*'|[^>"'])*>/gi
  let sized = 0
  let over = false
  const out = html.replace(re, (whole: string, raw: string | undefined, kind: string | undefined) => {
    if (raw || !kind || over) return whole
    const next = sizedTag(whole, kind.toLowerCase() as "img" | "source")
    if (!next) return whole
    if (++sized > MAX_PICTURES) {
      over = true
      return whole
    }
    return next
  })
  if (over) return { html, sized: 0 }
  return { html: out, sized }
}
