import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { MAX_REPLY_CHARS, isReportReason } from "@/lib/reviews/rules"
import { sellersReview } from "@/lib/reviews/access"
import { missingColumn, refreshReviewStats } from "@/lib/reviews/store"

/**
 * ===========================================================================
 *  A SELLER REPORTS A REVIEW
 * ===========================================================================
 *   POST { reason, note? }
 *
 * The review is hidden at once (off the product page, out of the rating)
 * and a report is filed for Storelib (review_reports). Storelib restores it
 * or keeps it hidden from the admin console. A seller cannot delete a
 * review, and cannot bring back one they reported: that is Storelib's call,
 * so reporting cannot be used to hide bad reviews and then argue about it.
 */
type Params = { params: Promise<{ id: string }> }

export async function POST(request: NextRequest, { params }: Params) {
  const { id } = await params
  let body: { reason?: unknown; note?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 })
  }
  if (!isReportReason(body?.reason)) return NextResponse.json({ error: "Choose a reason." }, { status: 400 })
  const note = typeof body.note === "string" ? body.note.trim().slice(0, 500) : ""
  if (note.length > MAX_REPLY_CHARS) return NextResponse.json({ error: "Keep the note short." }, { status: 400 })

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const admin = createAdminClient()
  const mine = await sellersReview(admin, id, user?.id ?? null)
  if (!mine.ok) return NextResponse.json({ error: mine.error }, { status: mine.status })
  if (mine.review.status === "hidden") return NextResponse.json({ error: "This review is already hidden while Storelib looks at it." }, { status: 409 })

  const { error: reportError } = await admin.from("review_reports").insert({
    review_id: mine.review.id,
    creator_id: mine.review.creator_id,
    reported_by: user!.id,
    reason: body.reason,
    note: note || null,
  })
  if (reportError && reportError.code !== "23505") {
    if (missingColumn(reportError) || reportError.code === "42P01" || reportError.code === "PGRST205") {
      return NextResponse.json({ error: "Reporting turns on after the database update (run-now part 52)." }, { status: 503 })
    }
    return NextResponse.json({ error: "The report did not save. Try again." }, { status: 500 })
  }

  const { error } = await admin
    .from("reviews")
    .update({ status: "hidden", hidden_at: new Date().toISOString(), hidden_reason: "reported" })
    .eq("id", mine.review.id)
  if (error) return NextResponse.json({ error: "The review could not be hidden. Try again." }, { status: 500 })

  await refreshReviewStats(admin, { productId: mine.review.product_id, creatorId: mine.review.creator_id, productSlug: mine.product.slug })
  console.log("[reviews] reported", { reviewId: mine.review.id, reason: body.reason })
  return NextResponse.json({ hidden: true })
}
