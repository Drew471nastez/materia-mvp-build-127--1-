import "server-only"

/**
 * ===========================================================================
 *  A STORE'S ACTION ON A REVIEW, WRITTEN
 * ===========================================================================
 * The plan is lib/reviews/dashboard.ts planModeration; this writes it, for
 * one review (app/api/app/reviews/[id]) and for a selection
 * (app/api/app/reviews/bulk), the same way:
 *
 *   the row changes, then its photos and video move to where they belong
 *   (public only while the website shows the review and the store has not
 *   taken them off: photos-server syncReviewPhotos), a removed file goes
 *   from both buckets, and the ratings and the pages that show them are
 *   counted again.
 *
 * A bulk action recounts each product once at the end, not once a review.
 */
import { refreshReviewStats } from "./store"
import { removeReviewPhotos, syncReviewPhotos } from "./photos-server"
import { planModeration, type BulkAction, type BulkOutcome, type ModerationAction, type ReviewForModeration } from "./dashboard"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

export const MODERATION_COLUMNS = "id, status, site_status, verified, featured, photos, hidden_by"

export type ModerationResult = { ok: true; review: Record<string, unknown>; changed: boolean } | { ok: false; status: number; error: string }

const missing = (code: string) => code === "42703" || code === "PGRST204" || code === "23514"

/** One action on one review the caller sells. Ratings are recounted unless `recount` is false (a bulk action does it once). */
export async function moderateOne(
  db: Db,
  review: ReviewForModeration & { product_id: string; creator_id: string },
  action: ModerationAction | "delete",
  opts: { photo?: string; productSlug?: string | null; recount?: boolean } = {},
): Promise<ModerationResult> {
  const now = new Date().toISOString()
  const plan = planModeration(review, action, { now, photo: opts.photo })
  if (plan.kind === "refuse") return { ok: false, status: plan.status, error: plan.error }
  if (plan.kind === "noop") {
    const current = Object.fromEntries(MODERATION_COLUMNS.split(", ").map((k) => [k, (review as unknown as Record<string, unknown>)[k] ?? null]))
    return { ok: true, review: current, changed: false }
  }
  if (action === "delete") {
    const { error } = await db.from("reviews").delete().eq("id", review.id)
    if (error) return { ok: false, status: 500, error: "That did not delete. Try again." }
    await removeReviewPhotos(db, plan.removeFiles ?? [])
  } else {
    const { data, error } = await db.from("reviews").update({ ...plan.change, updated_at: now }).eq("id", review.id).select(MODERATION_COLUMNS).single()
    if (error || !data) {
      const code = String((error as { code?: string } | null)?.code ?? "")
      return { ok: false, status: missing(code) ? 409 : 500, error: missing(code) ? "Moderation turns on after the database update (SQL part 134)." : "That did not save. Try again." }
    }
    await syncReviewPhotos(db, data)
    if (plan.removeFiles?.length) await removeReviewPhotos(db, plan.removeFiles)
    if (opts.recount !== false) await refreshReviewStats(db, { productId: review.product_id, creatorId: review.creator_id, productSlug: opts.productSlug ?? null })
    return { ok: true, review: data, changed: true }
  }
  if (opts.recount !== false) await refreshReviewStats(db, { productId: review.product_id, creatorId: review.creator_id, productSlug: opts.productSlug ?? null })
  return { ok: true, review: { id: review.id }, changed: true }
}

/** One action on many of the store's reviews: what changed, what was deleted, what was left and why. Other stores' ids are left as not found. */
export async function moderateMany(db: Db, creatorId: string, ids: string[], action: BulkAction): Promise<BulkOutcome & { reviews: Record<string, unknown>[] }> {
  const out: BulkOutcome & { reviews: Record<string, unknown>[] } = { changed: [], deleted: [], skipped: [], reviews: [] }
  const { data } = await db.from("reviews").select("*").eq("creator_id", creatorId).in("id", ids)
  const rows = (data ?? []) as (ReviewForModeration & { product_id: string; creator_id: string })[]
  const found = new Set(rows.map((r) => r.id))
  for (const id of ids) if (!found.has(id)) out.skipped.push({ id, reason: "not_found" })
  const products = new Set<string>()
  for (const row of rows) {
    const plan = planModeration(row, action)
    if (plan.kind !== "change") {
      out.skipped.push({ id: row.id, reason: plan.kind === "noop" ? plan.reason : plan.status === 403 ? "verified" : "reported" })
      continue
    }
    const done = await moderateOne(db, row, action, { recount: false })
    if (!done.ok) {
      out.skipped.push({ id: row.id, reason: "failed" })
      continue
    }
    products.add(row.product_id)
    if (action === "delete") out.deleted.push(row.id)
    else {
      out.changed.push(row.id)
      out.reviews.push(done.review)
    }
  }
  for (const productId of products) await refreshReviewStats(db, { productId })
  if (products.size) await refreshReviewStats(db, { creatorId })
  return out
}
