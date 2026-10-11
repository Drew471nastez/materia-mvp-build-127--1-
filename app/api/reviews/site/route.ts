import { createHash } from "node:crypto"
import { type NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { addressSubject, callerAddress, emailSubject, rateLimit } from "@/lib/api/rate-limit"
import { isUuid } from "@/lib/receipts/rules"
import { checkAppReviewInput, cleanEmail } from "@/lib/reviews/app-settings"
import { loadReviewsApp } from "@/lib/reviews/app-server"
import { checkGuestReviewEligibility } from "@/lib/reviews/eligibility"
import { addressReviewed, insertAppReview, purchaseByAddress } from "@/lib/reviews/write-server"
import { askNow } from "@/lib/reviews/requests-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * ===========================================================================
 *  A REVIEW WRITTEN ON THE WEBSITE (Storelib Reviews, "anyone can write")
 * ===========================================================================
 *   POST { productId, rating, title?, content, name, email, photos?, website? }
 *
 * Only when the store has the app on and lets anyone write. Otherwise 403,
 * whatever the form says: the website only draws the form when it is
 * allowed, and this is where that is enforced.
 *
 *   the product      published, and the store's own
 *   spam             `website` is a field a person never sees: filled in, the
 *                    answer is a quiet 200 and nothing is kept. And a limit
 *                    per network address and per email address.
 *   verified         never from this form: anybody can type an address.
 *                    When the address bought this product, the review is
 *                    not taken here; that buyer is emailed their own review
 *                    link instead (the request email), and a review from
 *                    that link is the verified one. Holding the inbox is
 *                    the proof.
 *   one each         one review an address and product
 *   the store's own  its support address cannot review its products
 *
 * The email is kept apart from the review (review_authors, server only) and
 * is never shown; the review shows "Jane D.".
 */
const HEADERS = { "Cache-Control": "no-store" }
const answer = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: HEADERS })

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>
  try {
    const b = await request.json()
    if (!b || typeof b !== "object" || Array.isArray(b)) return answer({ error: "Bad request" }, 400)
    body = b as Record<string, unknown>
  } catch {
    return answer({ error: "Bad request" }, 400)
  }
  /* A field nobody sees, filled in: a script. Told it worked, and nothing is written. */
  if (typeof body.website === "string" && body.website.trim() !== "") return answer({ ok: true, status: "pending" })

  const email = cleanEmail(body.email)
  if (!email) return answer({ error: "Enter your email address. It is not shown with your review." }, 400)
  const limited = await rateLimit({
    bucket: "review-site",
    subjects: [addressSubject(request), emailSubject(email)],
    windows: [{ limit: 4, seconds: 600 }, { limit: 12, seconds: 86_400 }],
    message: "That is a lot of reviews at once. Try again later.",
  })
  if (limited) return limited

  const productId = typeof body.productId === "string" && isUuid(body.productId) ? body.productId : null
  if (!productId) return answer({ error: "Bad request" }, 400)
  const db = createAdminClient()
  const { data: product } = await db.from("products").select("id, title, slug, status, creator_id").eq("id", productId).maybeSingle()
  if (!product || product.status !== "published" || !product.creator_id) return answer({ error: "This product is not available." }, 404)
  const { data: creator } = await db.from("creators").select("id, user_id, banned_at").eq("id", product.creator_id).maybeSingle()
  if (!creator || (creator as { banned_at?: string | null }).banned_at) return answer({ error: "This product is not available." }, 404)

  const { settings, ready } = await loadReviewsApp(db, product.creator_id)
  if (!ready || !settings.enabled || settings.who !== "anyone") return answer({ error: "Reviews on this store come from buyers, by email." }, 403)

  const input = checkAppReviewInput(body, { creatorId: product.creator_id, photos: settings.photos })
  if (!input.ok) return answer({ error: input.error }, 400)
  if (!input.name) return answer({ error: "Add your name. Only your first name and an initial are shown." }, 400)

  const eligibility = await checkGuestReviewEligibility(db, { productId, email })
  if (!eligibility.ok) return answer({ error: eligibility.message }, 403)

  const bought = await purchaseByAddress(db, productId, email)
  if (bought?.buyer_id && bought.buyer_id === creator.user_id) return answer({ error: "You cannot review your own product." }, 403)
  if (await addressReviewed(db, product.creator_id, productId, email, bought?.id ?? null, bought?.buyer_id ?? null)) {
    return answer({ error: "You already reviewed this product.", alreadyReviewed: true }, 409)
  }
  /* A buyer's address: their verified review comes from their own link, sent to that inbox now. Nothing is kept from this form. */
  if (bought) {
    const sent = await askNow(db, product.creator_id, bought.id, settings).catch(() => false)
    return answer({ ok: true, status: "check_email", sent }, 202)
  }

  const ip = callerAddress(request)
  const saved = await insertAppReview(db, {
    creatorId: product.creator_id,
    product: { id: product.id, title: product.title, slug: product.slug, creator_id: product.creator_id },
    creatorUserId: creator.user_id ?? null,
    settings,
    rating: input.rating,
    title: input.title,
    content: input.content,
    name: input.name,
    photoPaths: input.photoPaths,
    buyerId: null,
    orderId: null,
    verified: false,
    source: "site",
    author: { email, ipHash: ip ? createHash("sha256").update(`review:${ip}`).digest("hex").slice(0, 32) : null },
  })
  if (!saved.ok) return answer({ error: saved.error, alreadyReviewed: saved.alreadyReviewed }, saved.status)
  return answer({ ok: true, status: saved.status, verified: false })
}
