import "server-only"

/**
 * ===========================================================================
 *  THE STARS OF EVERY PRODUCT A ONEPAGE DRAWS, IN ONE READ
 * ===========================================================================
 * Called inside the page's held read (lib/onepage/published-page
 * liveBlocksFor), after the products and shelves are filled, so the answer
 * is held for every visitor with the rest and cleared with it. The rules are
 * ./product-rating.ts.
 *
 * ONE QUERY FOR THE WHOLE PAGE: every product id the page's cards name, in
 * one `in` filter on reviews (this store's only, published, shown on its
 * website), aggregated here. PostgREST answers at most 1,000 rows a request,
 * so a page whose products have more reviews than that reads the next
 * thousand, up to MAX_ROWS; under a thousand (nearly every page) it is one
 * request. Before run-now part 134 (no site_status) the counts kept on the
 * products (reviews_count, reviews_average) are read instead, also in one
 * request.
 *
 * Never throws: a read that fails draws the cards without stars.
 */
import { publishedReviewsApp } from "@/lib/reviews/app-server"
import type { ReviewsAppSettings } from "@/lib/reviews/app-settings"
import { aggregateRatings, cleanRating, ratedProductIds, withCardRatings, type CardRating } from "./product-rating"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

const PAGE_ROWS = 1000
const MAX_ROWS = 5000
const MAX_IDS = 200

const missingColumn = (e: { code?: string | null } | null | undefined) => {
  const code = String(e?.code ?? "")
  return code === "42703" || code === "PGRST204"
}

/** Ratings by product for these ids, or an empty map when the cards show none (the app off, cards' stars off, a failed read). */
export async function cardRatings(
  db: Db,
  creatorId: string,
  productIds: readonly string[],
  readApp: (db: Db, creatorId: string) => Promise<ReviewsAppSettings> = publishedReviewsApp,
): Promise<Map<string, CardRating>> {
  const ids = [...new Set(productIds.filter((id) => typeof id === "string" && id))].slice(0, MAX_IDS)
  if (!creatorId || ids.length === 0) return new Map()
  try {
    const app = await readApp(db, creatorId)
    if (!app.enabled || !app.display.showCardRating) return new Map()
    const rows: { product_id: unknown; rating: unknown }[] = []
    for (let from = 0; from < MAX_ROWS; from += PAGE_ROWS) {
      const { data, error } = await db
        .from("reviews")
        .select("product_id, rating")
        .eq("creator_id", creatorId)
        .in("product_id", ids)
        .eq("status", "published")
        .eq("site_status", "shown")
        .order("id", { ascending: true })
        .range(from, from + PAGE_ROWS - 1)
      if (error) {
        if (missingColumn(error) && from === 0) return await keptCounts(db, creatorId, ids)
        return new Map()
      }
      const page = (data ?? []) as { product_id: unknown; rating: unknown }[]
      rows.push(...page)
      if (page.length < PAGE_ROWS) break
    }
    return aggregateRatings(rows)
  } catch {
    return new Map()
  }
}

/** Before part 134: the counts the products keep. */
async function keptCounts(db: Db, creatorId: string, ids: string[]): Promise<Map<string, CardRating>> {
  const { data, error } = await db.from("products").select("id, reviews_count, reviews_average").eq("creator_id", creatorId).in("id", ids)
  const out = new Map<string, CardRating>()
  if (error) return out
  for (const r of (data ?? []) as { id: string; reviews_count?: unknown; reviews_average?: unknown }[]) {
    const rating = cleanRating({ count: r.reviews_count, average: r.reviews_average })
    if (rating) out.set(r.id, rating)
  }
  return out
}

/** The page's blocks with each product card's rating on it. A page with no product cards reads nothing. */
export async function withProductRatings<T>(db: Db, creatorId: string, blocks: T, readApp?: (db: Db, creatorId: string) => Promise<ReviewsAppSettings>): Promise<T> {
  const ids = ratedProductIds(blocks)
  if (ids.length === 0) return blocks
  return withCardRatings(blocks, await cardRatings(db, creatorId, ids, readApp))
}
