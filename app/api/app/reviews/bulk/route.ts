import { NextResponse } from "next/server"
import { physicalJson, readBody, shopCaller } from "@/lib/physical/auth"
import { rateLimit } from "@/lib/api/rate-limit"
import { isBulkAction, readBulkIds, MAX_BULK } from "@/lib/reviews/manage"
import { moderateReview } from "@/lib/reviews/manage-server"
import { refreshReviewStats } from "@/lib/reviews/store"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

/**
 * Storelib Reviews › Reviews, with several selected: publish, hide, feature
 * or stop featuring them at once. The store's owner only, and only the
 * store's own reviews (every id is read back with the creator's id, so an id
 * from another store is simply not found).
 *
 * Each review goes through the same rule as one at a time (lib/reviews/manage
 * planModeration): a verified buyer's review is hidden on the store's website
 * only, one a report hid is left as Storelib put it. The answer lists what
 * changed and what was skipped and why, so the page can roll back exactly
 * the rows that did not take.
 *
 *   POST { action, ids: [...] } → { done: [{ id, review }], skipped: [{ id, error }] }
 */
export async function POST(request: Request) {
  const c = await shopCaller()
  if (c instanceof NextResponse) return c
  const limited = await rateLimit({ bucket: "review-bulk", subjects: [`creator:${c.creatorId}`], windows: [{ limit: 60, seconds: 600 }] })
  if (limited) return limited
  const body = await readBody(request)
  if (!body || !isBulkAction(body.action)) return physicalJson({ error: "Bad request." }, 400)
  const ids = readBulkIds(body.ids)
  if (!ids) return physicalJson({ error: `Choose from 1 to ${MAX_BULK} reviews.` }, 400)
  const { data, error } = await c.db.from("reviews").select("id, product_id, creator_id, status, site_status, hidden_by, verified, featured, photos").eq("creator_id", c.creatorId).in("id", ids)
  if (error) return physicalJson({ error: "Those reviews could not be read. Try again." }, 500)
  const found = new Map(((data ?? []) as { id: string; product_id: string; creator_id: string }[]).map((r) => [r.id, r]))
  const done: { id: string; review: Record<string, unknown> }[] = []
  const skipped: { id: string; error: string }[] = []
  const touched = new Set<string>()
  for (const id of ids) {
    const review = found.get(id)
    if (!review) {
      skipped.push({ id, error: "That review is not there any more." })
      continue
    }
    const out = await moderateReview(c.db, review, body.action)
    if (!out.ok) {
      skipped.push({ id, error: out.error })
      continue
    }
    done.push({ id, review: out.review })
    if (out.changed) touched.add(review.product_id)
  }
  for (const productId of touched) await refreshReviewStats(c.db, { productId })
  if (touched.size) await refreshReviewStats(c.db, { creatorId: c.creatorId })
  return physicalJson({ done, skipped })
}
