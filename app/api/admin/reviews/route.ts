import { type NextRequest, NextResponse } from "next/server"

import { adminFailure, requireAdmin } from "@/lib/admin/gate"
import { recordAdminAction } from "@/lib/admin/audit"
import { REPORT_REASONS, reviewerOf } from "@/lib/reviews/rules"
import { refreshReviewStats } from "@/lib/reviews/store"
import { isUuid } from "@/lib/receipts/rules"
import { createAdminClient } from "@/lib/supabase/admin"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * ===========================================================================
 *  REPORTED REVIEWS, FOR STORELIB TO DECIDE
 * ===========================================================================
 * A seller who reports a review hides it at once (app/api/reviews/<id>/report);
 * here Storelib reads it and decides. The admin cookie first, then the
 * service role.
 *
 *   GET  ?state=open|resolved          the reports, newest first, each with
 *                                      its review, product and seller
 *   POST { reportId, decision }        "restore": the review is published
 *                                      again and counts in the rating;
 *                                      "keep_hidden": it stays off the page.
 *                                      Either way the report is closed and
 *                                      the decision is in the audit log.
 *
 * Nothing here deletes a review: a hidden one stays in the table with its
 * report, so a decision can be looked at again.
 */

const NO_STORE = { "Cache-Control": "no-store" }
const REASON = new Map(REPORT_REASONS.map((r) => [r.id as string, r.label]))
const missing = (e: { code?: string } | null) => !!e && ["42P01", "PGRST205", "42703", "PGRST204"].includes(String(e.code))

export async function GET(request: NextRequest) {
  const denied = await requireAdmin()
  if (denied) return denied
  const db = createAdminClient()
  const resolved = request.nextUrl.searchParams.get("state") === "resolved"

  let q = db.from("review_reports").select("id, review_id, creator_id, reason, note, created_at, resolved_at, resolution").order("created_at", { ascending: false }).limit(100)
  q = resolved ? q.not("resolved_at", "is", null) : q.is("resolved_at", null)
  const { data: reports, error } = await q
  if (error && missing(error)) return NextResponse.json({ unavailable: "Reported reviews need run-now part 52." }, { headers: NO_STORE })
  if (error) return adminFailure("review reports", error, "The reports could not be read.")

  const reviewIds = [...new Set((reports ?? []).map((r: any) => r.review_id))]
  const { data: reviews } = reviewIds.length
    ? await db.from("reviews").select("id, product_id, rating, content, created_at, status, reviewer_name, buyer:profiles!buyer_id(display_name, avatar_url)").in("id", reviewIds)
    : { data: [] as any[] }
  const productIds = [...new Set((reviews ?? []).map((r: any) => r.product_id))]
  const creatorIds = [...new Set((reports ?? []).map((r: any) => r.creator_id).filter(Boolean))]
  const [{ data: products }, { data: creators }] = await Promise.all([
    productIds.length ? db.from("products").select("id, title, slug").in("id", productIds) : Promise.resolve({ data: [] as any[] }),
    creatorIds.length ? db.from("creators").select("id, slug, display_name").in("id", creatorIds) : Promise.resolve({ data: [] as any[] }),
  ])
  const byId = <T extends { id: string }>(rows: T[] | null | undefined) => new Map((rows ?? []).map((r) => [r.id, r]))
  const reviewMap = byId(reviews as any[])
  const productMap = byId(products as any[])
  const creatorMap = byId(creators as any[])

  const rows = (reports ?? []).map((r: any) => {
    const review: any = reviewMap.get(r.review_id) ?? null
    const product: any = review ? productMap.get(review.product_id) ?? null : null
    const creator: any = creatorMap.get(r.creator_id) ?? null
    return {
      id: r.id,
      reason: REASON.get(r.reason) ?? r.reason,
      note: r.note ?? null,
      reportedAt: r.created_at,
      resolvedAt: r.resolved_at ?? null,
      resolution: r.resolution ?? null,
      review: review
        ? { id: review.id, rating: review.rating, content: review.content, createdAt: review.created_at, status: review.status, author: reviewerOf(review).name }
        : null,
      product: product ? { title: product.title, slug: product.slug } : null,
      seller: creator ? creator.display_name || creator.slug || null : null,
    }
  })
  return NextResponse.json({ reports: rows }, { headers: NO_STORE })
}

export async function POST(request: NextRequest) {
  const denied = await requireAdmin()
  if (denied) return denied
  const body = (await request.json().catch(() => null)) as { reportId?: unknown; decision?: unknown } | null
  const decision = body?.decision === "restore" ? "restored" : body?.decision === "keep_hidden" ? "kept_hidden" : null
  if (!isUuid(body?.reportId) || !decision) return NextResponse.json({ error: "Choose restore or keep hidden." }, { status: 400, headers: NO_STORE })

  const db = createAdminClient()
  const { data: report, error } = await db.from("review_reports").select("id, review_id, resolved_at").eq("id", body!.reportId as string).maybeSingle()
  if (error) return adminFailure("review report", error, "The report could not be read.")
  if (!report) return NextResponse.json({ error: "That report is not there any more." }, { status: 404, headers: NO_STORE })
  if (report.resolved_at) return NextResponse.json({ error: "That report was already decided." }, { status: 409, headers: NO_STORE })

  const { data: review } = await db.from("reviews").select("id, product_id, creator_id").eq("id", report.review_id).maybeSingle()
  if (review && decision === "restored") {
    const { error: e } = await db.from("reviews").update({ status: "published", hidden_at: null, hidden_reason: null }).eq("id", review.id)
    if (e) return adminFailure("restore review", e, "The review could not be restored. Nothing was changed.")
  }
  const { error: closeError } = await db
    .from("review_reports")
    .update({ resolved_at: new Date().toISOString(), resolution: decision, resolved_by: "admin session" })
    .eq("id", report.id)
  if (closeError) return adminFailure("close review report", closeError, "The decision did not save.")
  if (review) await refreshReviewStats(db, { productId: review.product_id, creatorId: review.creator_id })
  const recorded = await recordAdminAction(db, {
    action: decision === "restored" ? "review_restored" : "review_kept_hidden",
    targetType: "review",
    targetId: String(report.review_id),
  })
  return NextResponse.json({ ok: true, decision, recorded }, { headers: NO_STORE })
}
