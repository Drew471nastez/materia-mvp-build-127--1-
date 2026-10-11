import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { sellersReview } from "@/lib/reviews/access"
import { refreshReviewStats } from "@/lib/reviews/store"
import { readPhotos } from "@/lib/reviews/app-settings"
import { REVIEW_PHOTO_BUCKET } from "@/lib/reviews/write-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * ===========================================================================
 *  MODERATING A REVIEW (Reviews in the app, Storelib Reviews)
 * ===========================================================================
 *   PATCH  { action: "publish" | "hide" | "feature" | "unfeature" | "remove_photo" | "restore_photo", photo?: path }
 *   DELETE
 *
 * Only the store that sells the product (lib/reviews/access sellersReview:
 * the signed in person owns the creator the review's product belongs to).
 *
 *   publish    a pending review goes live, or one the store hid comes back.
 *              A review Storelib hid after a report stays where Storelib
 *              put it: only Storelib brings that back.
 *   hide       off the website, the product page and the rating, kept
 *   feature    first in "Featured" order and in the reviews carousel
 *   photo      one photo taken off (or put back); the review stays
 *   DELETE     gone for good, with its photos
 *
 * The ratings are counted again after anything that changes what is
 * published, and the pages that show them are cleared.
 */
const HEADERS = { "Cache-Control": "no-store" }
const answer = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: HEADERS })

type Params = { params: Promise<{ id: string }> }

async function seller(id: string) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const db = createAdminClient()
  return { db, found: await sellersReview(db, id, user?.id ?? null) }
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const { id } = await params
  const { db, found } = await seller(id)
  if (!found.ok) return answer({ error: found.error }, found.status)
  let body: Record<string, unknown> = {}
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return answer({ error: "Bad request" }, 400)
  }
  const review = found.review as typeof found.review & { status?: string | null; hidden_by?: string | null; photos?: unknown }
  const now = new Date().toISOString()
  let change: Record<string, unknown>
  switch (body.action) {
    case "publish": {
      if (review.status === "hidden" && review.hidden_by !== "seller") {
        return answer({ error: "Storelib is looking at the report on this review. It comes back if Storelib restores it." }, 409)
      }
      change = { status: "published", hidden_by: null, hidden_at: null, hidden_reason: null, published_at: now }
      break
    }
    case "hide":
      if (review.status === "hidden") return answer({ ok: true, review: { id: review.id, status: "hidden" } })
      change = { status: "hidden", hidden_by: "seller", hidden_at: now, hidden_reason: "seller" }
      break
    case "feature":
      change = { featured: true }
      break
    case "unfeature":
      change = { featured: false }
      break
    case "remove_photo":
    case "restore_photo": {
      const photos = readPhotos(review.photos)
      const path = typeof body.photo === "string" ? body.photo : ""
      if (!photos.some((p) => p.path === path)) return answer({ error: "That photo is not on this review." }, 404)
      change = { photos: photos.map((p) => (p.path === path ? { ...p, status: body.action === "remove_photo" ? "removed" : "approved" } : p)) }
      break
    }
    default:
      return answer({ error: "Bad request" }, 400)
  }
  const { data, error } = await db.from("reviews").update({ ...change, updated_at: now }).eq("id", review.id).select("id, status, featured, photos, hidden_by").single()
  if (error || !data) {
    const code = String((error as { code?: string } | null)?.code ?? "")
    const missing = code === "42703" || code === "PGRST204" || code === "23514"
    return answer({ error: missing ? "Moderation turns on after the database update (SQL part 133)." : "That did not save. Try again." }, missing ? 409 : 500)
  }
  await refreshReviewStats(db, { productId: review.product_id, creatorId: review.creator_id, productSlug: found.product.slug })
  return answer({ ok: true, review: data })
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  const { id } = await params
  const { db, found } = await seller(id)
  if (!found.ok) return answer({ error: found.error }, found.status)
  const review = found.review as typeof found.review & { photos?: unknown }
  const paths = readPhotos(review.photos).map((p) => p.path).filter((p) => p.startsWith(`${review.creator_id}/`))
  const { error } = await db.from("reviews").delete().eq("id", review.id)
  if (error) return answer({ error: "That did not delete. Try again." }, 500)
  if (paths.length) {
    try {
      await db.storage.from(REVIEW_PHOTO_BUCKET).remove(paths)
    } catch {
      /* The review is gone; a photo left behind is swept with the bucket's other strays. */
    }
  }
  await refreshReviewStats(db, { productId: review.product_id, creatorId: review.creator_id, productSlug: found.product.slug })
  return answer({ ok: true })
}
