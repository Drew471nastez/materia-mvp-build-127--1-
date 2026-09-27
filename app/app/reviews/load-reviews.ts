import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"
import { creatorForRequest, currentUserForRequest } from "@/lib/auth/request-scope"
import { missingColumn } from "@/lib/reviews/store"

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
  status: "published" | "hidden"
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
  let res = await read(`id, product_id, rating, content, created_at, edited_at, status, reviewer_name, seller_reply, seller_reply_at, ${buyer}`)
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
      status: r.status === "hidden" ? "hidden" : "published",
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

  return {
    state: "ready" as const,
    reviews: rows,
    products: ((products ?? []) as SellerProduct[]).sort((a, b) => (a.title || "").localeCompare(b.title || "")),
    /* Replies and reports need part 52. */
    ready,
    storeHandle: (creator as { slug?: string | null }).slug ?? null,
  }
}
