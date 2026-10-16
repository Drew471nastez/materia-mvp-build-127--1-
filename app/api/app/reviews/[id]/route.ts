import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { sellersReview } from "@/lib/reviews/access"
import { MODERATION_ACTIONS, type ModerationAction, type ReviewForModeration } from "@/lib/reviews/dashboard"
import { moderateOne } from "@/lib/reviews/moderate-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * ===========================================================================
 *  MODERATING A REVIEW (Reviews › Reviews, Storelib Reviews)
 * ===========================================================================
 *   PATCH  { action, photo? }
 *          approve | reject      a review waiting for the store
 *          publish | unpublish   a rejected one back, a shown one off
 *          hide                  off the website, whatever it was
 *          feature | unfeature   first in "Featured" order and the carousel
 *          remove_photo | restore_photo | delete_photo { photo: path }
 *                                a photo or the video hidden (kept), shown
 *                                again, or removed for good
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
 * store's own, and publish, hide and delete apply to it everywhere. A review
 * Storelib hid after a report stays where Storelib put it.
 *
 * What each action does is lib/reviews/dashboard.ts planModeration, written
 * by lib/reviews/moderate-server.ts: the photos follow the review (public
 * only while the website shows it), the ratings are counted again and the
 * pages that show them are cleared.
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
  if (!(MODERATION_ACTIONS as readonly string[]).includes(String(body.action))) return answer({ error: "Bad request" }, 400)
  const review = found.review as typeof found.review & ReviewForModeration
  const done = await moderateOne(db, review, body.action as ModerationAction, { photo: typeof body.photo === "string" ? body.photo : undefined, productSlug: found.product.slug })
  if (!done.ok) return answer({ error: done.error }, done.status)
  return answer({ ok: true, review: done.review })
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  const { id } = await params
  const { db, found } = await seller(id)
  if (!found.ok) return answer({ error: found.error }, found.status)
  const done = await moderateOne(db, found.review as typeof found.review & ReviewForModeration, "delete", { productSlug: found.product.slug })
  if (!done.ok) return answer({ error: done.error }, done.status)
  return answer({ ok: true })
}
