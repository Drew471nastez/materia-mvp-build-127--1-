import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { checkReplyInput } from "@/lib/reviews/rules"
import { sellersReview } from "@/lib/reviews/access"
import { forgetReviewPages, missingColumn } from "@/lib/reviews/store"

/**
 * ===========================================================================
 *  THE SELLER'S ANSWER TO A REVIEW
 * ===========================================================================
 * One public answer a review, shown under it on the product page, as the
 * App Store and Shopify do it:
 *
 *   PUT     { text }   writes the answer, or changes the one already there
 *   DELETE             takes it down
 *
 * Only the seller of the product the review is about. The answer is plain
 * text, up to 1000 characters.
 */
type Params = { params: Promise<{ id: string }> }

async function userId() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user?.id ?? null
}

const NOT_YET = "Replies turn on after the database update (run-now part 52)."

export async function PUT(request: NextRequest, { params }: Params) {
  const { id } = await params
  let body: { text?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 })
  }
  const input = checkReplyInput(body?.text)
  if (!input.ok) return NextResponse.json({ error: input.error }, { status: 400 })

  const admin = createAdminClient()
  const mine = await sellersReview(admin, id, await userId())
  if (!mine.ok) return NextResponse.json({ error: mine.error }, { status: mine.status })

  const { data, error } = await admin
    .from("reviews")
    .update({ seller_reply: input.text, seller_reply_at: new Date().toISOString() })
    .eq("id", mine.review.id)
    .select("id, seller_reply, seller_reply_at")
    .single()
  if (error) {
    if (missingColumn(error)) return NextResponse.json({ error: NOT_YET }, { status: 503 })
    return NextResponse.json({ error: "The reply did not save. Try again." }, { status: 500 })
  }
  forgetReviewPages({ productId: mine.review.product_id, creatorId: mine.review.creator_id, productSlug: mine.product.slug })
  return NextResponse.json({ review: data })
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  const { id } = await params
  const admin = createAdminClient()
  const mine = await sellersReview(admin, id, await userId())
  if (!mine.ok) return NextResponse.json({ error: mine.error }, { status: mine.status })
  const { error } = await admin.from("reviews").update({ seller_reply: null, seller_reply_at: null }).eq("id", mine.review.id)
  if (error) {
    if (missingColumn(error)) return NextResponse.json({ error: NOT_YET }, { status: 503 })
    return NextResponse.json({ error: "The reply was not removed. Try again." }, { status: 500 })
  }
  forgetReviewPages({ productId: mine.review.product_id, creatorId: mine.review.creator_id, productSlug: mine.product.slug })
  return NextResponse.json({ removed: true })
}
