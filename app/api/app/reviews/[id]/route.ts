import { type NextRequest, NextResponse } from "next/server"
import { teamStoreIdFor } from "@/lib/team/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { sellersReview } from "@/lib/reviews/access"
import { refreshReviewStats } from "@/lib/reviews/store"
import { isVerifiedReview, readPhotos } from "@/lib/reviews/app-settings"
import { removeReviewPhotos } from "@/lib/reviews/photos-server"
import { isModeration, type ModeratedRow } from "@/lib/reviews/manage"
import { forgetReviewsManage, moderateReview } from "@/lib/reviews/manage-server"

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
 * A VERIFIED BUYER'S REVIEW IS STORELIB'S (lib/reviews/app-settings, who
 * decides where a review shows). The store's publish and hide are about its
 * own website and move `site_status` only: Explore, the product page, the
 * creator page and the ratings keep it as Storelib has it. It cannot be
 * deleted here; the store can report it, and only Storelib removes a review
 * for policy. An unverified review (a visitor's, an imported one) is the
 * store's own, and publish, hide and delete apply to it everywhere.
 *
 *   publish    a pending review goes live, or one the store hid comes back.
 *              A review Storelib hid after a report stays where Storelib
 *              put it: only Storelib brings that back.
 *   hide       verified: off the store's website only, still on Storelib.
 *              Unverified: off the website, the product page and the
 *              rating, kept.
 *   feature    first in "Featured" order and in the reviews carousel
 *   photo      one photo taken off (or put back); the review stays. Its
 *              file moves to the private bucket (or back), as every
 *              photo's does when its review stops or starts showing on
 *              the website (photos-server syncReviewPhotos).
 *   DELETE     unverified only: gone for good, with its photos
 *
 * The ratings are counted again after anything that changes what is
 * published, and the pages that show them (the website's too) are cleared.
 * What each action changes is decided once (lib/reviews/manage
 * planModeration), so this route and the bulk one cannot drift apart.
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
  return { db, found: await sellersReview(db, id, user?.id ?? null, await teamStoreIdFor(user?.id ?? null, "products")) }
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
  if (!isModeration(body.action)) return answer({ error: "Bad request" }, 400)
  const out = await moderateReview(db, found.review as ModeratedRow & { product_id: string; creator_id: string }, body.action, body.photo)
  if (!out.ok) return answer({ error: out.error }, out.status)
  if (out.changed) await refreshReviewStats(db, { productId: found.review.product_id, creatorId: found.review.creator_id, productSlug: found.product.slug })
  return answer({ ok: true, review: out.review })
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  const { id } = await params
  const { db, found } = await seller(id)
  if (!found.ok) return answer({ error: found.error }, found.status)
  const review = found.review as typeof found.review & { photos?: unknown; verified?: unknown }
  if (isVerifiedReview(review)) {
    return answer({ error: "A verified buyer's review can't be deleted. Hide it on your website, or report it to Storelib." }, 403)
  }
  const paths = readPhotos(review.photos).map((p) => p.path).filter((p) => p.startsWith(`${review.creator_id}/`))
  const { error } = await db.from("reviews").delete().eq("id", review.id)
  if (error) return answer({ error: "That did not delete. Try again." }, 500)
  await removeReviewPhotos(db, paths)
  forgetReviewsManage(review.creator_id)
  await refreshReviewStats(db, { productId: review.product_id, creatorId: review.creator_id, productSlug: found.product.slug })
  return answer({ ok: true })
}
