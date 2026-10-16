import "server-only"

import { cache } from "react"
import { createAdminClient } from "@/lib/supabase/admin"
import { creatorForRequest, currentUserForRequest } from "@/lib/auth/request-scope"
import { loadReviewsApp } from "@/lib/reviews/app-server"
import { NO_FILTERS, type ReviewFilters } from "@/lib/reviews/dashboard"
import { listReviews, storeProducts, toSellerReview, type ReviewList, type SellerProduct, type SellerReview } from "@/lib/reviews/dashboard-server"
import { readReviewsApp, type ReviewsAppSettings } from "@/lib/reviews/app-settings"
import { withViewUrls } from "@/lib/reviews/photos-server"

export type { SellerProduct, SellerReview }

/**
 * Who the Reviews pages are for: the signed in person's store, read with the
 * service role and filtered by the creator the /app layout already resolved
 * for this request (the public policy shows published reviews only, and a
 * store needs to see the ones waiting and the ones it hid). Once per
 * request, whichever of the layout and the page asks first.
 */
export const reviewsCaller = cache(async () => {
  const { user } = await currentUserForRequest()
  if (!user) return { state: "signed-out" as const }
  const creator = await creatorForRequest(user.id)
  if (!creator) return { state: "no-creator" as const }
  return { state: "ready" as const, creatorId: creator.id as string, db: createAdminClient(), storeHandle: (creator as { slug?: string | null }).slug ?? null }
})

/** The app's settings, and whether its database part has run (moderation, photos, import: part 134). */
export const reviewsAppFor = cache(async (creatorId: string): Promise<{ settings: ReviewsAppSettings; ready: boolean }> => {
  const db = createAdminClient()
  const out = await loadReviewsApp(db, creatorId).catch(() => null)
  return { settings: out?.settings ?? readReviewsApp(null), ready: out?.ready !== false }
})

/** What the area's tabs show: how many reviews wait for the store. Null with no store. */
export async function reviewsArea(): Promise<{ pending: number } | null> {
  const c = await reviewsCaller()
  if (c.state !== "ready") return null
  const { count, error } = await c.db
    .from("reviews")
    .select("id", { count: "exact", head: true })
    .eq("creator_id", c.creatorId)
    .or("status.eq.pending,and(status.eq.published,site_status.eq.pending)")
  return { pending: error ? 0 : (count ?? 0) }
}

export interface ReviewsListLoad {
  state: "ready"
  list: ReviewList
  products: SellerProduct[]
  filters: ReviewFilters
  app: { enabled: boolean; ready: boolean; requestsOn: boolean }
  /** One review asked for by its id (?review=<id> from the bell or an email): the list shows it alone first. */
  focus: SellerReview | null
  storeHandle: string | null
}

/** The Reviews tab's first page, as the address asks for it. */
export async function loadSellerReviews(filters: ReviewFilters = NO_FILTERS, focusId: string | null = null): Promise<{ state: "signed-out" } | { state: "no-creator" } | ReviewsListLoad> {
  const c = await reviewsCaller()
  if (c.state !== "ready") return c
  const products = await storeProducts(c.db, c.creatorId)
  const [list, app, focus] = await Promise.all([
    listReviews(c.db, c.creatorId, filters, products),
    reviewsAppFor(c.creatorId),
    focusId && /^[0-9a-f-]{36}$/i.test(focusId)
      ? c.db
          .from("reviews")
          .select("id, product_id, rating, content, created_at, edited_at, status, reviewer_name, seller_reply, seller_reply_at, title, photos, featured, verified, source, hidden_by, site_status, order_id, buyer:profiles!buyer_id(display_name, avatar_url)")
          .eq("creator_id", c.creatorId)
          .eq("id", focusId)
          .maybeSingle()
          .then((r: { data: Record<string, unknown> | null }) => (r.data ? toSellerReview(r.data) : null), () => null)
      : Promise.resolve(null),
  ])
  return {
    state: "ready",
    list,
    products,
    filters,
    app: { enabled: app.settings.enabled, ready: app.ready && list.ready.app, requestsOn: app.settings.request.enabled },
    focus: focus ? ((await withViewUrls(c.db, [focus]))[0] ?? null) : null,
    storeHandle: c.storeHandle,
  }
}
