import { NextResponse } from "next/server"
import { physicalJson, shopCaller } from "@/lib/physical/auth"
import { isUuid } from "@/lib/receipts/rules"
import { canvasReviews } from "@/lib/reviews/storefront-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * The builder's canvas: what the store's review sections draw, for the
 * signed in owner only. Their published reviews, or sample ones while they
 * have none (marked `sample`, never on a live page). `?productId=` adds that
 * product's own reviews, for a product page; only a product of theirs.
 */
export async function GET(request: Request) {
  const c = await shopCaller("products", { read: true })
  if (c instanceof NextResponse) return c
  const id = new URL(request.url).searchParams.get("productId")
  let product: { id: string; title: string | null } | null = null
  if (isUuid(id)) {
    const { data } = await c.db.from("products").select("id, title, creator_id").eq("id", id).maybeSingle()
    if (data && data.creator_id === c.creatorId) product = { id: data.id, title: data.title ?? null }
  }
  return physicalJson({ reviews: await canvasReviews(c.db, c.creatorId, product) })
}
