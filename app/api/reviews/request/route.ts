import { type NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { addressSubject, rateLimit } from "@/lib/api/rate-limit"
import { canDeliver } from "@/lib/receipts/rules"
import { checkGuestReviewEligibility, checkReviewEligibility } from "@/lib/reviews/eligibility"
import { canEditUntil, checkAppReviewInput, initialStatus, readSiteStatus, websiteStatus } from "@/lib/reviews/app-settings"
import { requestLinkOpen, verifyRequest } from "@/lib/reviews/request-token"
import { requestContext } from "@/lib/reviews/requests-server"
import { insertAppReview, photoEntries } from "@/lib/reviews/write-server"
import { refreshReviewStats } from "@/lib/reviews/store"
import { claimUploads, removeReviewPhotos, syncReviewPhotos } from "@/lib/reviews/photos-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * ===========================================================================
 *  A REVIEW FROM A REVIEW REQUEST LINK (Storelib Reviews)
 * ===========================================================================
 *   POST   { token, rating, title?, content, name?, photos? }   write it
 *   PATCH  { token, rating, title?, content, name?, photos? }   change it,
 *          within the store's edit window
 *
 * The token (lib/reviews/request-token.ts) is the whole proof: it names one
 * order line, signed by Storelib. No account, no sign in. It reviews that
 * product from that order, verified, and nothing else. The purchase is
 * checked again here (still paid, not refunded), as is the seller rule
 * (lib/reviews/eligibility): the store's own order cannot review itself.
 * A new review is taken only while the store has Storelib Reviews on and
 * within REQUEST_LINK_DAYS of the email (a link is not a key forever). Photos are
 * only uploads made from this same link, each taken once (photos-server
 * claimUploads); a change keeps the photos the review already has.
 */
const NO_LINK = "This review link does not work. Open the newest email about it, or ask the store."

const HEADERS = { "Cache-Control": "no-store" }
const answer = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: HEADERS })

async function read(request: NextRequest): Promise<Record<string, unknown> | null> {
  try {
    const b = await request.json()
    return b && typeof b === "object" && !Array.isArray(b) ? (b as Record<string, unknown>) : null
  } catch {
    return null
  }
}

async function context(request: NextRequest) {
  const body = await read(request)
  if (!body) return { error: answer({ error: "Bad request" }, 400) }
  const limited = await rateLimit({ bucket: "review-write", subjects: [addressSubject(request)], windows: [{ limit: 10, seconds: 600 }, { limit: 40, seconds: 86_400 }], message: "That is a lot of reviews at once. Try again later." })
  if (limited) return { error: limited }
  const requestId = verifyRequest(body.token)
  if (!requestId) return { error: answer({ error: NO_LINK }, 404) }
  const db = createAdminClient()
  const ctx = await requestContext(db, requestId)
  if (!ctx || !ctx.product || !ctx.order || !ctx.creator) return { error: answer({ error: NO_LINK }, 404) }
  return { body, db, ctx }
}

export async function POST(request: NextRequest) {
  const c = await context(request)
  if ("error" in c) return c.error
  const { body, db, ctx } = c
  const { order, product, creator, settings } = ctx
  if (!order || !product || !creator) return answer({ error: NO_LINK }, 404)
  if (ctx.review) return answer({ error: "You already reviewed this. You can change it from this page.", alreadyReviewed: true }, 409)
  if (!canDeliver(order)) return answer({ error: "Only a completed purchase can be reviewed." }, 403)
  if (product.status === "deleted") return answer({ error: "This product is not sold any more." }, 410)
  if (!settings.enabled) return answer({ error: "This store isn't taking reviews from this link right now." }, 403)
  if (!requestLinkOpen(ctx.request as { sent_at?: string | null; created_at?: string | null })) return answer({ error: "This review link has expired." }, 410)
  const input = checkAppReviewInput(body, { creatorId: creator.id, photos: settings.photos })
  if (!input.ok) return answer({ error: input.error }, 400)
  input.photoPaths = await claimUploads(db, { creatorId: creator.id, owner: `request:${ctx.request.id}`, paths: input.photoPaths })

  const buyerId = typeof order.buyer_id === "string" ? order.buyer_id : null
  const eligibility = buyerId
    ? await checkReviewEligibility(db, { productId: product.id, userId: buyerId, email: order.buyer_email })
    : await checkGuestReviewEligibility(db, { productId: product.id, email: order.buyer_email })
  if (!eligibility.ok) return answer({ error: eligibility.message }, 403)
  /* One review a buyer and product: their account may have reviewed it from another order. */
  if (buyerId) {
    const { data: theirs } = await db.from("reviews").select("id").eq("buyer_id", buyerId).eq("product_id", product.id).limit(1)
    if ((theirs ?? []).length) return answer({ error: "You already reviewed this product.", alreadyReviewed: true }, 409)
  }

  const saved = await insertAppReview(db, {
    creatorId: creator.id,
    product: { id: product.id, title: product.title, slug: product.slug, creator_id: creator.id },
    creatorUserId: creator.user_id,
    settings,
    rating: input.rating,
    title: input.title,
    content: input.content,
    name: input.name,
    photoPaths: input.photoPaths,
    buyerId,
    orderId: order.id,
    verified: true,
    source: "request",
    author: { email: typeof order.buyer_email === "string" ? order.buyer_email.toLowerCase() : null, ipHash: null },
  })
  if (!saved.ok) return answer({ error: saved.error, alreadyReviewed: saved.alreadyReviewed }, saved.status)
  await db.from("review_requests").update({ status: "reviewed", review_id: saved.review.id, updated_at: new Date().toISOString() }).eq("id", ctx.request.id)
  return answer({ ok: true, status: saved.status, review: publicShape(saved.review) })
}

export async function PATCH(request: NextRequest) {
  const c = await context(request)
  if ("error" in c) return c.error
  const { body, db, ctx } = c
  const { product, creator, settings, review } = ctx
  if (!product || !creator) return answer({ error: NO_LINK }, 404)
  if (!review) return answer({ error: "There is no review to change yet." }, 404)
  if (!canEditUntil(review.created_at, settings.editDays)) return answer({ error: "This review can no longer be changed from the link." }, 403)
  const input = checkAppReviewInput(body, { creatorId: creator.id, photos: settings.photos })
  if (!input.ok) return answer({ error: input.error }, 400)
  /* A change is read again by the store's rule, on the store's website only: a review lowered under the auto publish line waits again there, and one the store hid there stays hidden there. For Storelib it is a verified buyer's and stays as Storelib has it (published, or hidden after a report). */
  const status = review.status === "hidden" ? "hidden" : "published"
  const site_status = readSiteStatus(review.site_status) === "hidden" ? "hidden" : initialStatus(settings, input.rating) === "pending" ? "pending" : "shown"
  const now = new Date().toISOString()
  const kept = Array.isArray(review.photos) ? (review.photos as { path?: string; status?: string }[]) : []
  const removedByStore = new Set(kept.filter((p) => p?.status === "removed").map((p) => p.path))
  const already = new Set(kept.map((p) => p?.path).filter((p): p is string => typeof p === "string"))
  const fresh = await claimUploads(db, { creatorId: creator.id, owner: `request:${ctx.request.id}`, paths: input.photoPaths.filter((p) => !already.has(p)) })
  const allowed = new Set([...already, ...fresh])
  const photos = photoEntries(db, input.photoPaths.filter((p) => allowed.has(p))).map((p) => (removedByStore.has(p.path) ? { ...p, status: "removed" as const } : p))
  const { data: updated, error } = await db
    .from("reviews")
    .update({ rating: input.rating, title: input.title || null, content: input.content, ...(input.name ? { reviewer_name: input.name } : {}), photos, status, site_status, edited_at: now, updated_at: now, ...(status === "published" && review.status !== "published" ? { published_at: now } : {}) })
    .eq("id", review.id)
    .select("*")
    .single()
  if (error || !updated) return answer({ error: "The change did not save. Try again." }, 500)
  await syncReviewPhotos(db, updated)
  /* A photo the reviewer took off in the change: its file goes too. */
  await removeReviewPhotos(db, [...already].filter((p) => !input.photoPaths.includes(p)))
  await refreshReviewStats(db, { productId: product.id, creatorId: creator.id, productSlug: product.slug })
  return answer({ ok: true, status: websiteStatus(updated), review: publicShape(updated) })
}

/** What the page shows back: the review's own words and state, nothing about the order. */
function publicShape(r: Record<string, unknown>) {
  return { id: r.id, rating: r.rating, title: r.title ?? "", content: r.content, reviewer_name: r.reviewer_name ?? null, photos: r.photos ?? [], status: websiteStatus(r), created_at: r.created_at, edited_at: r.edited_at ?? null }
}
