import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"
import { creatorForRequest, currentUserForRequest } from "@/lib/auth/request-scope"
import { missingColumn } from "@/lib/reviews/store"
import { readPhotos, sellerView, type ReviewPhoto } from "@/lib/reviews/app-settings"
import { loadReviewsApp } from "@/lib/reviews/app-server"

/**
 * The signed in creator's reviews, every product, newest first, hidden ones
 * included (the seller sees what they reported, marked), with the product
 * each is about and the buyer's name and photo.
 *
 * Read with the service role and filtered by the creator the /app layout
 * already resolved for this request: the public policy on reviews shows
 * published reviews only, and a seller needs to see the ones they reported.
 */
export interface SellerReview {
  id: string
  product_id: string
  rating: number
  content: string
  created_at: string
  edited_at: string | null
  /* On the store's website (app-settings sellerView): pending waits for the store (Storelib Reviews, part 134); hidden was hidden by the store or a report (hidden_by). */
  status: "published" | "hidden" | "pending"
  hidden_by: string | null
  /* Shown on Explore and the product page. A verified buyer's review stays there whatever the store does on its website. */
  on_storelib: boolean
  title: string | null
  photos: ReviewPhoto[]
  featured: boolean
  verified: boolean
  source: string
  /** The app an imported review came from (part 212), and whether it said verified purchase. */
  import_platform?: string | null
  import_verified?: boolean
  reviewer_name: string | null
  seller_reply: string | null
  seller_reply_at: string | null
  buyer: { display_name: string | null; avatar_url: string | null } | null
}

export interface SellerProduct {
  id: string
  title: string
  slug: string | null
  thumbnail_url: string | null
}

const LIMIT = 500

export async function loadSellerReviews() {
  const { user } = await currentUserForRequest()
  if (!user) return { state: "signed-out" as const }
  const creator = await creatorForRequest(user.id)
  if (!creator) return { state: "no-creator" as const }
  const admin = createAdminClient()

  const read = (columns: string) =>
    admin.from("reviews").select(columns).eq("creator_id", creator.id).order("created_at", { ascending: false }).limit(LIMIT)
  const buyer = "buyer:profiles!buyer_id(display_name, avatar_url)"
  /* With Storelib Reviews' columns (part 134); without them, as part 52 left the table; before that, the oldest shape. */
  const part134 = `id, product_id, rating, content, created_at, edited_at, status, reviewer_name, seller_reply, seller_reply_at, title, photos, featured, verified, source, hidden_by, site_status, ${buyer}`
  /* With review imports (part 212): which app an imported review came from, and whether that app called it a verified purchase. */
  let res = await read(`${part134.replace(`, ${buyer}`, "")}, import_platform, import_verified, ${buyer}`)
  if (res.error && missingColumn(res.error)) res = await read(part134)
  const appReady = !(res.error && missingColumn(res.error))
  if (!appReady) res = await read(`id, product_id, rating, content, created_at, edited_at, status, reviewer_name, seller_reply, seller_reply_at, ${buyer}`)
  /* Before run-now part 52: no status, reply or name columns. The list still shows, without replies. */
  const ready = !(res.error && missingColumn(res.error))
  if (!ready) res = await read(`id, product_id, rating, content, created_at, ${buyer}`)

  const rows = ((res.data ?? []) as any[]).map(
    (r): SellerReview => ({
      id: r.id,
      product_id: r.product_id,
      rating: Number(r.rating) || 0,
      content: r.content ?? "",
      created_at: r.created_at,
      edited_at: r.edited_at ?? null,
      ...sellerView(r),
      title: r.title ?? null,
      photos: readPhotos(r.photos),
      featured: r.featured === true,
      verified: r.verified !== false,
      source: typeof r.source === "string" ? r.source : "storelib",
      import_platform: typeof r.import_platform === "string" ? r.import_platform : null,
      import_verified: r.import_verified === true,
      reviewer_name: r.reviewer_name ?? null,
      seller_reply: r.seller_reply ?? null,
      seller_reply_at: r.seller_reply_at ?? null,
      buyer: (Array.isArray(r.buyer) ? r.buyer[0] : r.buyer) ?? null,
    }),
  )

  const ids = [...new Set(rows.map((r) => r.product_id))]
  const { data: products } = ids.length
    ? await admin.from("products").select("id, title, slug, thumbnail_url").in("id", ids)
    : { data: [] as SellerProduct[] }

  const app = await loadReviewsApp(admin, creator.id).catch(() => null)
  /*
    REVIEW REQUESTS, AS COUNTS: how many emails asking for a review went out,
    and how many of those led to one (review_requests, part 134). Null when the
    table isn't there, so the overview says nothing rather than zero.
  */
  const countRequests = async (statuses: string[]) => {
    const r = await admin.from("review_requests").select("id", { count: "exact", head: true }).eq("creator_id", creator.id).in("status", statuses)
    return r.error ? null : (r.count ?? 0)
  }
  const [requestsSent, requestsReviewed] = await Promise.all([
    countRequests(["sent", "reminded", "reviewed"]).catch(() => null),
    countRequests(["reviewed"]).catch(() => null),
  ])
  return {
    requests: requestsSent === null ? null : { sent: requestsSent, reviewed: requestsReviewed ?? 0 },
    state: "ready" as const,
    /* Storelib Reviews: on or off, and whether its database part has run (moderation, featured, photos, import). */
    app: { enabled: app?.settings.enabled === true, ready: appReady && app?.ready !== false },
    reviews: rows,
    products: ((products ?? []) as SellerProduct[]).sort((a, b) => (a.title || "").localeCompare(b.title || "")),
    /* Replies and reports need part 52. */
    ready,
    storeHandle: (creator as { slug?: string | null }).slug ?? null,
  }
}
