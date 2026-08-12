import "server-only"

import type { createAdminClient } from "@/lib/supabase/admin"

/**
 * ===========================================================================
 *  THE TWO NUMBERS THAT SAY WHETHER A SELLER IS REAL
 * ===========================================================================
 *
 * A stranger deciding whether to send sixty euros to a name is answering one
 * question, and none of the counts already on a profile answers it. Followers
 * measure popularity. Listings measure how much somebody has put up, which is
 * free. The two that cost something to acquire are:
 *
 *   HOW MANY THINGS THEY HAVE ACTUALLY SOLD — the only number here that
 *   requires a stranger to have already trusted them once and not regretted it.
 *
 *   WHAT THOSE BUYERS SAID AFTERWARDS — the average, and how many of them.
 *
 * Together they are the line every marketplace in this category puts under a
 * seller's name, and they are the reason a new account looks like a new account
 * instead of looking like an established one with the numbers left off.
 *
 * ---------------------------------------------------------------------------
 * NOTHING IS INVENTED, AND NOTHING IS SHOWN AT ZERO
 * ---------------------------------------------------------------------------
 * A rating of 0.0 out of five is a worse claim about somebody than no rating at
 * all — it reads as "rated, badly" rather than "nobody has rated them" — and
 * "0 sold" is an accusation. So this returns `null` for a rating nobody has
 * given and `0` for a count, and the component that draws it (see
 * components/marketplace/seller-score.tsx) omits each independently and renders
 * nothing at all when both are absent. A new seller's header is one line
 * shorter, which is the honest difference between them and somebody with a
 * hundred sales.
 *
 * ---------------------------------------------------------------------------
 * NO NEW COLUMNS, NO MIGRATION
 * ---------------------------------------------------------------------------
 * Both numbers are already in the database and neither needs a cache:
 *
 *   sold     `products.status = 'sold'`. The status already exists — see
 *            lib/marketplace/listing-status.ts, where 'sold' is terminal and
 *            deliberately keeps its page, because one physical object cannot be
 *            sold twice and the page is in somebody's receipt.
 *
 *   reviews  the `reviews` table, keyed by `creator_id`.
 *
 * Counting from `products` rather than from `orders` is also the more honest
 * answer to "how many have they sold": orders span digital goods, refunds and
 * cancellations, and a refunded order is not a sale anybody should be credited
 * with. A listing marked sold is a physical thing that changed hands.
 *
 * A denormalised counter would be faster and would be the wrong trade at this
 * size — two indexed counts against ids we already hold, on a page that is
 * already making five queries, versus a column that can drift from the truth
 * and a trigger to keep it from drifting.
 *
 * ---------------------------------------------------------------------------
 * EVERY CREATOR ROW, NOT "THE" ONE
 * ---------------------------------------------------------------------------
 * The same trap lib/profile/listings.ts documents at length: an account can
 * hold more than one `creators` row — the seller onboarding makes one and
 * /api/listings makes one on your first listing — and a `.maybeSingle()` on
 * that lookup returns an error rather than a row for anybody who has been
 * through both. Read that note before touching this query; a profile silently
 * reporting zero sales for its most active seller is exactly the failure it
 * describes.
 */

type Admin = ReturnType<typeof createAdminClient>

export type SellerStats = {
  /** 0–5, or null when nobody has left a review. Never 0 for "unrated". */
  rating: number | null
  /** How many reviews the average is made of. 0 when there are none. */
  reviews: number
  /** Listings this account has marked sold. 0 for somebody who never has. */
  sold: number
}

export const EMPTY_SELLER_STATS: SellerStats = { rating: null, reviews: 0, sold: 0 }

export async function readSellerStats({
  admin,
  userId,
}: {
  admin: Admin
  /** The auth user, NOT a creators id. */
  userId: string
}): Promise<SellerStats> {
  try {
    const { data: creators } = await admin.from("creators").select("id").eq("user_id", userId)
    const creatorIds = (creators ?? []).map((c) => (c as { id: string }).id).filter(Boolean)
    // A buyer who has never listed anything. Not an error — the normal state of
    // most accounts, and the correct answer is the empty one.
    if (creatorIds.length === 0) return EMPTY_SELLER_STATS

    // Both against the same ids and neither waits on the other. In series this
    // was two round trips on a page that is already making several.
    const [soldRes, reviewsRes] = await Promise.all([
      admin
        .from("products")
        .select("id", { count: "exact", head: true })
        .in("creator_id", creatorIds)
        .eq("status", "sold"),
      // The ratings themselves rather than a database average: the count is
      // needed anyway, `avg()` through PostgREST needs an RPC, and a seller with
      // two thousand reviews is not a scale this marketplace is at. Capped, so a
      // pathological row count cannot become a slow profile.
      admin.from("reviews").select("rating").in("creator_id", creatorIds).limit(2000),
    ])

    const sold = soldRes.count ?? 0

    const ratings = (reviewsRes.data ?? [])
      .map((r) => Number((r as { rating: unknown }).rating))
      // A null, a zero or a string that will not parse is not a review anybody
      // left; averaging it in drags the score down for a row that says nothing.
      .filter((n) => Number.isFinite(n) && n > 0)

    if (ratings.length === 0) return { rating: null, reviews: 0, sold }

    const average = ratings.reduce((a, b) => a + b, 0) / ratings.length
    return {
      // Clamped, because a rating outside 0–5 renders as a broken star row and
      // the clamp costs nothing.
      rating: Math.min(5, Math.max(0, average)),
      reviews: ratings.length,
      sold,
    }
  } catch {
    // These are decoration on a page whose job is to show somebody's listings.
    // A profile must never fail to render because a ratings table did.
    return EMPTY_SELLER_STATS
  }
}
