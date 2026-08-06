import { clampFocal, type Focal } from "@/lib/images/geometry"

/**
 * The two-file record for one listing photo, and the rules for reading it.
 *
 * ---------------------------------------------------------------------------
 * Why this is ADDITIVE and not a schema change
 * ---------------------------------------------------------------------------
 * Listings already store `products.thumbnail_url` (the cover) and
 * `products.gallery_urls` (the rest) as full URLs, and roughly a dozen places
 * read them — cards, the detail page, search, the inbox, chat previews, the
 * sitemap, OG tags. Replacing those with `large_path` / `thumbnail_path`
 * columns would mean every one of those reads has to change on the same deploy
 * as the write, and any that got missed would render a broken image on a live
 * marketplace.
 *
 * So the existing columns keep their exact meaning and keep pointing at a
 * working image. `products.image_variants` is a new jsonb array carrying the
 * optimised pair alongside them. Nothing reads it until it is there, everything
 * falls back when it is not, and old listings keep working untouched until the
 * backfill reaches them — which is what "never delete an original until the
 * optimised version is verified" actually requires in practice.
 *
 * The consequence is one rule, applied everywhere images are shown:
 *
 *     feed / grid / preview  →  thumbUrl(variant) ?? thumbnail_url
 *     detail / gallery       →  largeUrl(variant) ?? thumbnail_url
 */

export interface ImageVariant {
  /** Public URL of the full-quality file, the photo's own aspect ratio. */
  large: string
  /** Public URL of the 4:5 card crop. May be absent on a passthrough upload. */
  thumb?: string | null
  width?: number | null
  height?: number | null
  thumbWidth?: number | null
  thumbHeight?: number | null
  /** Where the seller put the crop. Only meaningful for the thumb. */
  focal?: Focal | null
}

/**
 * The card shape, as a CSS aspect-ratio and as numbers for `<img>`.
 *
 * 3:4, and it must stay in step with THUMB in lib/images/geometry.ts — they
 * describe the same rectangle from two sides. Changing one without the other
 * makes object-fit crop the thumbnail a second time.
 */
export const CARD_RATIO = "3 / 4"
export const CARD_W = 810
export const CARD_H = 1080

/**
 * Parse whatever came out of the jsonb column.
 *
 * Untrusted by construction — it is a jsonb blob, it may predate this format,
 * and a malformed row must render a listing rather than crash a feed. Anything
 * without a usable `large` is dropped.
 */
export function readVariants(raw: unknown): ImageVariant[] {
  if (!Array.isArray(raw)) return []
  const out: ImageVariant[] = []
  for (const v of raw) {
    if (!v || typeof v !== "object") continue
    const large = (v as any).large
    if (typeof large !== "string" || !large) continue
    out.push({
      large,
      thumb: typeof (v as any).thumb === "string" ? (v as any).thumb : null,
      width: numOrNull((v as any).width),
      height: numOrNull((v as any).height),
      thumbWidth: numOrNull((v as any).thumbWidth),
      thumbHeight: numOrNull((v as any).thumbHeight),
      focal: (v as any).focal ? clampFocal((v as any).focal) : null,
    })
  }
  return out
}

function numOrNull(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.round(v) : null
}

/**
 * The image a CARD should request. Thumbnail first, original as the fallback.
 *
 * The fallback is not a nicety — it is what lets this ship before the backfill
 * has run, and what keeps every listing created before today rendering exactly
 * as it does now.
 */
export function cardImage(
  variants: ImageVariant[] | null | undefined,
  fallbackUrl: string | null | undefined,
  index = 0,
): string | null {
  const v = variants?.[index]
  return v?.thumb || v?.large || fallbackUrl || null
}

/** The image a DETAIL PAGE or gallery should request. Always the large one. */
export function detailImage(
  variants: ImageVariant[] | null | undefined,
  fallbackUrl: string | null | undefined,
  index = 0,
): string | null {
  const v = variants?.[index]
  return v?.large || fallbackUrl || null
}

/**
 * Intrinsic dimensions for the `<img>`, so the browser reserves the right box
 * before a byte arrives.
 *
 * This is the layout-shift fix. Without width/height (or a CSS aspect-ratio
 * container) the image occupies zero height until it loads and then shoves
 * everything below it down the page — the single worst thing a feed can do
 * while somebody is reading it. The card also has `aspect-ratio: 4/5` in CSS,
 * so the two agree and neither depends on the other.
 */
export function cardDimensions(v: ImageVariant | null | undefined): { width: number; height: number } {
  if (v?.thumbWidth && v?.thumbHeight) return { width: v.thumbWidth, height: v.thumbHeight }
  return { width: CARD_W, height: CARD_H }
}
