/**
 * ===========================================================================
 *  THE COVER AS UPLOADED (round AK, SQL part 377)
 * ===========================================================================
 * A download's or course's cover is stored twice by the product editor:
 *
 *   thumbnail_url        a 1280x720 copy with light grey padding around a portrait cover, for the shop's 16:9 cards
 *                        (Explore, the marketplace, a store's grid), where every card is the same shape
 *   cover_original_url   the picture as it was chosen, for the places that frame it in its own shape: the OnePage
 *                        (block, sheet, full screen, instant checkout), the product page and the checkout
 *
 * Before part 377 has run, or for a product saved before it, there is no original: those places then cut the
 * padding off the copy in the browser (lib/images/letterbox).
 */

type CoverFields = { thumbnail_url?: string | null; cover_original_url?: string | null }

const text = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null)

/** The product's own picture: the original upload when there is one, else the card copy. */
export function productCover(row: CoverFields | null | undefined): string | null {
  return text(row?.cover_original_url) ?? text(row?.thumbnail_url)
}

/**
 * A gallery list with the card copy swapped for the original wherever it stands, each picture once. A list without
 * the card copy gets the original nowhere: it is the cover's own place in the list that it takes.
 */
export function withOriginalCover(urls: readonly (string | null | undefined)[], row: CoverFields | null | undefined): string[] {
  const thumb = text(row?.thumbnail_url)
  const original = text(row?.cover_original_url)
  const out: string[] = []
  for (const u of urls) {
    const url = text(u)
    if (!url) continue
    const shown = original && thumb && url === thumb ? original : url
    if (!out.includes(shown)) out.push(shown)
  }
  return out
}
