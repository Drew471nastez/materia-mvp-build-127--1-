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
import { creatorPagesChanged } from "@/lib/storefront/creator-page-purge"
import { creatorTag, productTag } from "@/lib/commerce/product-page-cache"
import { countStars, summarizeStars, type StarCounts } from "./rules"
import { readLadder } from "@/lib/supabase/missing-memory"

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
  /* Remembered per server, so a database before part 134 is not refused first on every read (lib/supabase/missing-memory.ts). */
  const res = await readLadder("reviews:published", [() => run(PUBLIC_REVIEW_COLUMNS, true), () => run(PART_52_REVIEW_COLUMNS, true), () => run(OLD_REVIEW_COLUMNS, false)], missingColumn)
  if (res.error) throw new Error(`reviews could not be read (${res.error.code ?? "unknown"})`)
  return { reviews: (res.data ?? []) as PublicReview[], total: res.count ?? (res.data ?? []).length }
}

/**
 * How many of the published reviews of one product or one creator gave each
 * number of stars: verified buyers' only, as the ratings trigger counts them
 * (run-now part 134), so a website visitor's or an imported review never
 * moves a Storelib rating or Explore. Before part 134 there is no `verified`,
 * and every review was a buyer's.
 *
 * COUNTED BY THE DATABASE, NOT READ ROW BY ROW (round AW). This read every
 * rating and summed them here, but PostgREST answers at most its max_rows,
 * 1,000 on Supabase: past a thousand reviews the count stuck at 1,000 and the
 * average was some thousand of them, and refreshReviewStats then wrote that
 * over the right figures the part 134 trigger had just counted, on the
 * product and on the creator, after every review. Five counts give the exact
 * figures at any size. Each is a GET of one id with its count, not a HEAD:
 * PostgREST answers a HEAD that names a missing column with no body, so a
 * database before part 134 would not be seen to lack `verified` and would
 * never be asked the older way.
 */
export async function publishedStars(db: Db, where: { productId?: string | null; creatorId?: string | null }): Promise<StarCounts | null> {
  const key = where.productId ? "product_id" : "creator_id"
  const value = where.productId ?? where.creatorId
  if (!value) return { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
  const counted = (n: number) => db.from("reviews").select("id", { count: "exact" }).eq(key, value).eq("rating", n)
  const res = await readLadder(
    "reviews:ratings",
    [
      () => countStars((n) => counted(n).eq("status", "published").neq("verified", false).limit(1)),
      () => countStars((n) => counted(n).eq("status", "published").limit(1)),
      () => countStars((n) => counted(n).limit(1)),
    ],
    missingColumn,
  )
  if (res.error) return null
  return res.data
}

/** The star breakdown of a product's published reviews. */
export async function starBreakdown(db: Db, productId: string): Promise<{ count: number; average: number; stars: StarCounts } | null> {
  const stars = await publishedStars(db, { productId })
  return stars ? summarizeStars(stars) : null
}

/**
 * Count again and write the numbers every page reads, for the product and
 * its creator, then drop the product page's shared cache. Never throws: a
 * review that saved is saved whatever this does.
 */
export async function refreshReviewStats(db: Db, ids: { productId?: string | null; creatorId?: string | null; productSlug?: string | null }): Promise<void> {
  try {
    if (ids.productId) {
      const stars = await publishedStars(db, { productId: ids.productId })
      if (stars) {
        const s = summarizeStars(stars)
        await db.from("products").update({ reviews_count: s.count, reviews_average: s.average }).eq("id", ids.productId)
      }
    }
    if (ids.creatorId) {
      const stars = await publishedStars(db, { creatorId: ids.creatorId })
      if (stars) {
        const s = summarizeStars(stars)
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
    /* Storelib Reviews' overview (lib/reviews/manage-server reviewsManageTag): a new, changed or reported review shows on its next read. */
    if (ids.creatorId) revalidateTag(`reviews-manage:${ids.creatorId}`, { expire: 0 })
    /* The creator page's reviews and the product page's, which the CDN holds for everybody (round 49). */
    if (ids.creatorId) void creatorPagesChanged({ creatorId: ids.creatorId, tags: [ids.productId, ids.productSlug].filter((x): x is string => !!x).map(productTag) })
  } catch {
    /* Outside a request (a test, a script): nothing is cached there. */
  }
}
