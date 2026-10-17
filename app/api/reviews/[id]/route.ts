import { type NextRequest, NextResponse } from "next/server"
import { addressSubject, rateLimit } from "@/lib/api/rate-limit"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { REVIEW_LIMITS, checkReviewInput } from "@/lib/reviews/rules"
import { ownReview, orderStillReviewable, writeWithFallback } from "@/lib/reviews/access"
import { refreshReviewStats } from "@/lib/reviews/store"

/**
 * ===========================================================================
 *  YOUR REVIEW: CHANGE IT OR DELETE IT
 * ===========================================================================
 *   PATCH   { rating, content, receiptToken? }   new stars and words; the
 *                                                review says "Edited"
 *   DELETE  ?receiptToken=                       gone, and the ratings with it
 *
 * Only its author: the signed in buyer it belongs to, or whoever holds the
 * receipt link of its order (lib/reviews/access ownReview). A seller never
 * changes a buyer's words. A review the seller reported stays hidden when
 * it is changed; Storelib decides about it.
 */
type Params = { params: Promise<{ id: string }> }

async function who() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user ? { id: user.id, email: user.email ?? null } : null
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const { id } = await params
  let body: { rating?: unknown; content?: unknown; receiptToken?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 })
  }
  const input = checkReviewInput(body)
  if (!input.ok) return NextResponse.json({ error: input.error }, { status: 400 })

  const limited = await rateLimit({ bucket: "review-edit", subjects: [addressSubject(request)], windows: REVIEW_LIMITS.edit, message: "That is a lot of changes at once. Try again in a few minutes." })
  if (limited) return limited

  const admin = createAdminClient()
  const own = await ownReview(admin, id, { user: await who(), receiptToken: body?.receiptToken })
  if (!own.ok) return NextResponse.json({ error: own.error }, { status: own.status })
  /* A buyer refunded since cannot rewrite what they said as a buyer. */
  if (own.order && !orderStillReviewable(own.order)) {
    return NextResponse.json({ error: "Only a completed purchase can be reviewed." }, { status: 403 })
  }

  const now = new Date().toISOString()
  const saved = await writeWithFallback<any>((withNew) =>
    admin
      .from("reviews")
      .update(withNew ? { rating: input.rating, content: input.content, edited_at: now, updated_at: now } : { rating: input.rating, content: input.content, updated_at: now })
      .eq("id", own.review.id)
      .select("*")
      .single(),
  )
  if (saved.error || !saved.data) {
    console.error("[reviews] edit failed:", saved.error?.code)
    return NextResponse.json({ error: "The change did not save. Try again." }, { status: 500 })
  }
  await refreshReviewStats(admin, { productId: own.review.product_id, creatorId: own.review.creator_id })
  return NextResponse.json({ review: saved.data })
}

export async function DELETE(request: NextRequest, { params }: Params) {
  const { id } = await params
  const receiptToken = new URL(request.url).searchParams.get("receiptToken")
  const limited = await rateLimit({ bucket: "review-edit", subjects: [addressSubject(request)], windows: REVIEW_LIMITS.edit, message: "That is a lot of changes at once. Try again in a few minutes." })
  if (limited) return limited
  const admin = createAdminClient()
  const own = await ownReview(admin, id, { user: await who(), receiptToken })
  if (!own.ok) return NextResponse.json({ error: own.error }, { status: own.status })

  const { error } = await admin.from("reviews").delete().eq("id", own.review.id)
  if (error) {
    console.error("[reviews] delete failed:", error.code)
    return NextResponse.json({ error: "The review was not deleted. Try again." }, { status: 500 })
  }
  await refreshReviewStats(admin, { productId: own.review.product_id, creatorId: own.review.creator_id })
  return NextResponse.json({ deleted: true })
}
