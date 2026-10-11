import "server-only"

/**
 * ===========================================================================
 *  REVIEW ROWS: READING THE PUBLISHED ONES, AND KEEPING THE RATINGS RIGHT
 * ===========================================================================
 * Every public read of reviews (the product page, the reviews API, the
 * creator page) asks for published reviews only, with the columns a card
 * draws and nothing else: no order id, no hidden reason, no report.
 *
 * BEFORE RUN-NOW PART 52 the table has no status, reply or name columns, and
 * PostgREST refuses a select or a filter naming a column it does not have
 * (42703). Each read then asks again the old way, so reviews keep showing
 * whether or not the part has run.
 *
 * THE RATINGS. products.reviews_count and reviews_average (and the same on
 * creators) are what Explore, the product page header, the creator page's
 * "4.5 · 2 reviews" and the sticky bar read. The trigger from run-now part 52 keeps
 * them for published reviews; the older trigger counted every review. So
 * after any change (a new review, an edit, a delete, a report, a restore)
 * the app counts again itself, from published rows, and writes both. The
 * two agree when the part has run, and the app is right when it has not.
 */
import { revalidateTag } from "next/cache"
import { creatorTag, productTag } from "@/lib/commerce/product-page-cache"
import { summarize, type StarCounts } from "./rules"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = { from: (table: string) => any }

type PgError = { code?: string | null; message?: string | null } | null | undefined

/** Part 49 has not run: a column it adds is not there. */
export function missingColumn(error: PgError): boolean {
  const code = String(error?.code ?? "")
  return code === "42703" || code === "PGRST204"
}

const BUYER = "buyer:profiles!buyer_id(id, display_name, avatar_url)"
/** What a public card draws: with run-now part 134, whether it is a verified buyer's and where it came from, so the card says "Verified purchase" only when it is. */
export const PUBLIC_REVIEW_COLUMNS = `id, product_id, rating, content, created_at, edited_at, reviewer_name, seller_reply, seller_reply_at, verified, source, ${BUYER}`
/** The same before run-now part 134 (every review then was a buyer's). */
const PART_52_REVIEW_COLUMNS = `id, product_id, rating, content, created_at, edited_at, reviewer_name, seller_reply, seller_reply_at, ${BUYER}`
/** The same before run-now part 52. */
const OLD_REVIEW_COLUMNS = `id, product_id, rating, content, created_at, ${BUYER}`

export interface PublicReview {
  id: string
  product_id?: string
  rating: number
  content: string
  created_at: string
  edited_at?: string | null
  reviewer_name?: string | null
  seller_reply?: string | null
  seller_reply_at?: string | null
  /** False for a website visitor's or an imported review (run-now part 134). Absent before it: a buyer's. */
  verified?: boolean | null
  source?: string | null
  buyer?: { id: string; display_name?: string | null; avatar_url?: string | null } | null
}

export interface ReviewPage {
  reviews: PublicReview[]
  total: number
}

/**
 * Published reviews of a product or of everything a creator sells, newest
 * first, and how many there are.
 */
export async function readPublishedReviews(
  db: Db,
  where: { productId?: string | null; creatorId?: string | null },
  range: { limit: number; offset: number },
): Promise<ReviewPage> {
  const key = where.productId ? "product_id" : "creator_id"
  const value = where.productId ?? where.creatorId
  if (!value) return { reviews: [], total: 0 }
  const limit = Math.max(1, Math.min(50, Math.floor(range.limit) || 10))
  const offset = Math.max(0, Math.floor(range.offset) || 0)

  const run = (columns: string, published: boolean) => {
    let q = db.from("reviews").select(columns, { count: "exact" }).eq(key, value)
    if (published) q = q.eq("status", "published")
    return q.order("created_at", { ascending: false }).range(offset, offset + limit - 1)
  }
  let res = await run(PUBLIC_REVIEW_COLUMNS, true)
  if (res.error && missingColumn(res.error)) res = await run(PART_52_REVIEW_COLUMNS, true)
  if (res.error && missingColumn(res.error)) res = await run(OLD_REVIEW_COLUMNS, false)
  if (res.error) throw new Error(`reviews could not be read (${res.error.code ?? "unknown"})`)
  return { reviews: (res.data ?? []) as PublicReview[], total: res.count ?? (res.data ?? []).length }
}

/**
 * Ratings of the published reviews of one product or one creator: verified
 * buyers' only, as the ratings trigger counts them (run-now part 134), so a
 * website visitor's or an imported review never moves a Storelib rating or
 * Explore. Before part 134 there is no `verified`, and every review was a
 * buyer's.
 */
export async function publishedRatings(db: Db, where: { productId?: string | null; creatorId?: string | null }): Promise<number[] | null> {
  const key = where.productId ? "product_id" : "creator_id"
  const value = where.productId ?? where.creatorId
  if (!value) return []
  let res = await db.from("reviews").select("rating").eq(key, value).eq("status", "published").neq("verified", false)
  if (res.error && missingColumn(res.error)) res = await db.from("reviews").select("rating").eq(key, value).eq("status", "published")
  if (res.error && missingColumn(res.error)) res = await db.from("reviews").select("rating").eq(key, value)
  if (res.error) return null
  return ((res.data ?? []) as { rating: number }[]).map((r) => Number(r.rating))
}

/** The star breakdown of a product's published reviews. */
export async function starBreakdown(db: Db, productId: string): Promise<{ count: number; average: number; stars: StarCounts } | null> {
  const ratings = await publishedRatings(db, { productId })
  return ratings ? summarize(ratings) : null
}

/**
 * Count again and write the numbers every page reads, for the product and
 * its creator, then drop the product page's shared cache. Never throws: a
 * review that saved is saved whatever this does.
 */
export async function refreshReviewStats(db: Db, ids: { productId?: string | null; creatorId?: string | null; productSlug?: string | null }): Promise<void> {
  try {
    if (ids.productId) {
      const ratings = await publishedRatings(db, { productId: ids.productId })
      if (ratings) {
        const s = summarize(ratings)
        await db.from("products").update({ reviews_count: s.count, reviews_average: s.average }).eq("id", ids.productId)
      }
    }
    if (ids.creatorId) {
      const ratings = await publishedRatings(db, { creatorId: ids.creatorId })
      if (ratings) {
        const s = summarize(ratings)
        await db.from("creators").update({ reviews_count: s.count, reviews_average: s.average }).eq("id", ids.creatorId)
      }
    }
  } catch (e) {
    console.warn("[reviews] ratings not recounted:", e instanceof Error ? e.message.slice(0, 120) : "unknown")
  }
  forgetReviewPages(ids)
}

/** The product page keeps reviews shared between visitors (lib/commerce/product-page-cache): a change clears it. */
export function forgetReviewPages(ids: { productId?: string | null; creatorId?: string | null; productSlug?: string | null }): void {
  try {
    if (ids.productId) revalidateTag(productTag(ids.productId), "max")
    if (ids.productSlug) revalidateTag(productTag(ids.productSlug), "max")
    if (ids.creatorId) revalidateTag(creatorTag(ids.creatorId), "max")
  } catch {
    /* Outside a request (a test, a script): nothing is cached there. */
  }
}
