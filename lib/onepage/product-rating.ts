/**
 * ===========================================================================
 *  A PRODUCT'S STARS ON THE ONEPAGE: ITS CARDS AND ITS SHEET
 * ===========================================================================
 * Storelib Reviews (Settings › Integrations › Storelib Reviews) rates each
 * product from its published reviews the store shows on its website
 * (status published, site_status shown): the same reviews the website's
 * product cards and the OnePage's Reviews block count
 * (lib/website-builder/shop-products withRatings, lib/reviews/storefront-server).
 *
 * On a OnePage the rating is read on the server, in the same held read as
 * the products themselves (lib/onepage/published-page liveBlocksFor), and
 * written onto each product block and shelf item as `product_rating`, so a
 * card is drawn with its stars in the first HTML and nothing moves after.
 * The product sheet gets the same figures, with a few recent reviews, from
 * /api/onepage/product.
 *
 * Only with the app on (and "Stars on product cards" on, for cards) and only
 * for a product with at least one such review. Nothing is shown otherwise:
 * never "0 reviews", never an empty row of stars.
 *
 * Pure: the reads are ./product-rating-server.ts.
 */

export interface CardRating {
  /** One decimal, 1 to 5. */
  average: number
  count: number
}

export interface SheetReview {
  id: string
  rating: number
  title: string
  body: string
  author: string
  date: string
  verified: boolean
}

export interface SheetReviews {
  average: number
  count: number
  /** The newest few, newest first. */
  items: SheetReview[]
  /** Where every review is: the product page's reviews. */
  allUrl: string | null
}

/** How many reviews the sheet shows before "See all". */
export const SHEET_REVIEWS_SHOWN = 3

/** A rating a card or sheet may show, or null. */
export function cleanRating(raw: unknown): CardRating | null {
  if (!raw || typeof raw !== "object") return null
  const r = raw as { average?: unknown; count?: unknown }
  const count = Math.floor(Number(r.count))
  const average = Math.round(Number(r.average) * 10) / 10
  if (!Number.isFinite(count) || count < 1) return null
  if (!Number.isFinite(average) || average < 1 || average > 5) return null
  return { average, count }
}

/**
 * Ratings by product from rows of (product_id, rating), as the product
 * page's summary counts them (lib/reviews/rules summarize): whole stars 1 to
 * 5, anything else left out, the average to one decimal.
 */
export function aggregateRatings(rows: readonly { product_id?: unknown; rating?: unknown }[]): Map<string, CardRating> {
  const sums = new Map<string, { n: number; total: number }>()
  for (const r of rows) {
    const id = typeof r.product_id === "string" ? r.product_id : ""
    const rating = Math.round(Number(r.rating))
    if (!id || !(rating >= 1 && rating <= 5)) continue
    const t = sums.get(id) ?? { n: 0, total: 0 }
    sums.set(id, { n: t.n + 1, total: t.total + rating })
  }
  const out = new Map<string, CardRating>()
  for (const [id, t] of sums) out.set(id, { count: t.n, average: Math.round((t.total / t.n) * 10) / 10 })
  return out
}

type Block = { type?: string; data?: Record<string, unknown> | null; [k: string]: unknown }

/** Every product a page's cards draw: product blocks and the shelves' items, groups included. */
export function ratedProductIds(blocks: unknown): string[] {
  const found = new Set<string>()
  const walk = (list: unknown) => {
    if (!Array.isArray(list)) return
    for (const raw of list) {
      const b = raw as Block | null
      if (!b || typeof b !== "object" || (b as { enabled?: unknown }).enabled === false) continue
      const data = (b.data ?? {}) as Record<string, unknown>
      if (b.type === "product" && typeof data.product_id === "string" && data.product_id) found.add(data.product_id)
      else if (b.type === "storelib_shelf" && Array.isArray(data.items))
        for (const item of data.items as { id?: unknown; kind?: unknown }[]) {
          if (item && typeof item.id === "string" && item.kind !== "community") found.add(item.id)
        }
      else if (b.type === "group") walk(data.children)
    }
  }
  walk(blocks)
  return [...found]
}

/**
 * The blocks with each card's rating written on (`product_rating`), and any
 * rating a block carried from before taken off when the product has none now.
 * Pure, and it never mutates what it was given.
 */
export function withCardRatings<T>(blocks: T, ratings: ReadonlyMap<string, CardRating>): T {
  if (!Array.isArray(blocks)) return blocks
  const walk = (list: unknown[]): unknown[] =>
    list.map((raw) => {
      const b = raw as Block | null
      if (!b || typeof b !== "object") return raw
      const data = (b.data ?? {}) as Record<string, unknown>
      if (b.type === "product" && typeof data.product_id === "string") {
        const r = ratings.get(data.product_id) ?? null
        if (!r && data.product_rating === undefined) return raw
        return { ...b, data: { ...data, product_rating: r } }
      }
      if (b.type === "storelib_shelf" && Array.isArray(data.items)) {
        const items = (data.items as Record<string, unknown>[]).map((item) => {
          const r = item && typeof item.id === "string" ? ratings.get(item.id) ?? null : null
          return r ? { ...item, rating: r } : item
        })
        return { ...b, data: { ...data, items } }
      }
      if (b.type === "group" && Array.isArray(data.children)) return { ...b, data: { ...data, children: walk(data.children as unknown[]) } }
      return raw
    })
  return walk(blocks) as unknown as T
}

/** "4.8", cut to one decimal as every rating here is written. */
export function ratingLabel(average: number): string {
  return (Math.round(average * 10) / 10).toFixed(1)
}

/**
 * The words a screen reader hears for a rating, in English; the components
 * pass the same through tt() ("4.8 out of 5, 23 reviews").
 */
export function ratingWords(r: CardRating): string {
  return `${ratingLabel(r.average)} out of 5, ${r.count} ${r.count === 1 ? "review" : "reviews"}`
}

/** The reviews the sheet shows: newest first, at most SHEET_REVIEWS_SHOWN, each with words to read. */
export function sheetReviewsFrom(
  summary: { average: number; count: number } | null | undefined,
  items: readonly { id: string; rating: number; title?: string | null; body?: string | null; author?: string | null; date?: string | null; iso?: string | null; verified?: boolean | null }[],
  allUrl: string | null,
): SheetReviews | null {
  const rating = cleanRating(summary)
  if (!rating) return null
  const newest = [...items].sort((a, b) => String(b.iso ?? "").localeCompare(String(a.iso ?? "")))
  return {
    ...rating,
    items: newest.slice(0, SHEET_REVIEWS_SHOWN).map((r) => ({
      id: r.id,
      rating: Math.max(1, Math.min(5, Math.round(Number(r.rating) || 0))),
      title: (r.title ?? "").trim().slice(0, 120),
      body: (r.body ?? "").trim().slice(0, 600),
      author: (r.author ?? "").trim().slice(0, 60),
      date: (r.date ?? "").trim(),
      verified: r.verified === true,
    })),
    allUrl,
  }
}

/** The product page's reviews, for "See all": its own page, at the reviews. */
export function allReviewsUrl(pageUrl: string | null | undefined): string | null {
  if (!pageUrl || pageUrl === "#") return null
  return `${pageUrl.split("#")[0]}#reviews`
}
