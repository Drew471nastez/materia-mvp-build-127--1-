import { createHash } from "node:crypto"
import { type NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { addressSubject, callerAddress, emailSubject, rateLimit } from "@/lib/api/rate-limit"
import { isUuid } from "@/lib/receipts/rules"
import { checkAppReviewInput, cleanEmail } from "@/lib/reviews/app-settings"
import { loadReviewsApp } from "@/lib/reviews/app-server"
import { storeReviewPhoto } from "@/lib/reviews/photos-server"
import { settleSiteReview } from "@/lib/reviews/site-server"
import { later } from "@/lib/reviews/later"

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
 *                    answer is the usual one and nothing is kept. A limit
 *                    per network address and per email address, and one per
 *                    store (30 an hour, 200 a day).
 *   one answer       whatever address was typed, the answer is the same:
 *                    202 { status: "check_email" } (the plain form: back to
 *                    #review-check-email). Nothing in it, or in how long it
 *                    took, says whether the address bought the product,
 *                    already reviewed it or is the store's own. What the
 *                    address is decides what happens after the answer
 *                    (lib/reviews/later, lib/reviews/site-server):
 *     bought it        that buyer is emailed their own review link (the
 *                      request email, askNow), and a review from that link
 *                      is the verified one. The form's words are dropped.
 *     reviewed it, or the store's own address
 *                      nothing
 *     anybody else     the review is held (review_drafts) and a "confirm
 *                      your review" link goes to the address. Opening it
 *                      posts the review, unverified (/review/confirm/<token>,
 *                      /api/reviews/confirm). Unconfirmed after seven days,
 *                      it is dropped.
 *   one each         one review an address and product
 *
 * The email is kept apart from the review (review_drafts, then
 * review_authors, server only) and is never shown; the review shows
 * "Jane D.". Photos go to the private uploads bucket and wait there with
 * the draft (lib/reviews/photos-server).
 */
const HEADERS = { "Cache-Control": "no-store" }
const answer = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: HEADERS })

/**
 * THE WEBSITE'S OWN FORM posts here with no script (sections/
 * reviews_product.storelib, and the Storelib Reviews section of an imported
 * theme): form fields, the photos as files. The answer is then the page it
 * came from, at #review-posted, #review-waiting, #review-check-email or
 * #review-error, which that section shows. Only a path on the same host is
 * gone back to.
 */
function backTo(request: NextRequest, hash: string): NextResponse {
  let path = "/"
  try {
    const ref = new URL(request.headers.get("referer") ?? "")
    if (ref.host === request.headers.get("host") || ref.host === new URL(request.url).host) path = `${ref.pathname}${ref.search}`
  } catch {
    /* No referer: the front page. */
  }
  return NextResponse.redirect(new URL(`${path}#${hash}`, request.url), { status: 303, headers: HEADERS })
}

export async function POST(request: NextRequest) {
  const form = (request.headers.get("content-type") ?? "").match(/multipart\/form-data|application\/x-www-form-urlencoded/i)
  if (!form) {
    let body: Record<string, unknown>
    try {
      const b = await request.json()
      if (!b || typeof b !== "object" || Array.isArray(b)) return answer({ error: "Bad request" }, 400)
      body = b as Record<string, unknown>
    } catch {
      return answer({ error: "Bad request" }, 400)
    }
    return take(request, body, [], answer)
  }
  let data: FormData
  try {
    data = await request.formData()
  } catch {
    return backTo(request, "review-error")
  }
  const body: Record<string, unknown> = {}
  for (const k of ["productId", "rating", "title", "content", "name", "email", "website"]) {
    const v = data.get(k)
    if (typeof v === "string") body[k] = v
  }
  const files = data.getAll("photos").filter((f): f is File => f instanceof File && f.size > 0)
  return take(request, body, files, (out, status = 200) => {
    const st = (out as { status?: string; error?: string } | null)?.status
    if (status === 202 || st === "check_email") return backTo(request, "review-check-email")
    return backTo(request, "review-error")
  })
}

type Reply = (body: unknown, status?: number) => NextResponse

/** What every accepted form gets, whatever the address turns out to be. */
const CHECK_EMAIL = { ok: true, status: "check_email" }

async function take(request: NextRequest, body: Record<string, unknown>, files: File[], answer: Reply): Promise<NextResponse> {
  /* A field nobody sees, filled in: a script. The usual answer, and nothing is written or sent. */
  if (typeof body.website === "string" && body.website.trim() !== "") return answer(CHECK_EMAIL, 202)

  const email = cleanEmail(body.email)
  if (!email) return answer({ error: "Enter your email address. It is not shown with your review." }, 400)
  const limited = await rateLimit({
    bucket: "review-site",
    subjects: [addressSubject(request), emailSubject(email)],
    windows: [{ limit: 4, seconds: 600 }, { limit: 12, seconds: 86_400 }],
    message: "That is a lot of reviews at once. Try again later.",
  })
  if (limited) return files.length || !request.headers.get("content-type")?.includes("json") ? answer({ error: "limit" }, 429) : limited

  const productId = typeof body.productId === "string" && isUuid(body.productId) ? body.productId : null
  if (!productId) return answer({ error: "Bad request" }, 400)
  const db = createAdminClient()
  const { data: product } = await db.from("products").select("id, title, slug, status, creator_id").eq("id", productId).eq("status", "published").maybeSingle()
  if (!product || !product.creator_id) return answer({ error: "This product is not available." }, 404)
  const { data: creator } = await db.from("creators").select("id, user_id, banned_at, display_name, slug").eq("id", product.creator_id).maybeSingle()
  if (!creator || (creator as { banned_at?: string | null }).banned_at) return answer({ error: "This product is not available." }, 404)

  const { settings, ready } = await loadReviewsApp(db, product.creator_id)
  if (!ready || !settings.enabled || settings.who !== "anyone") return answer({ error: "Reviews on this store come from buyers, by email." }, 403)

  const input = checkAppReviewInput(body, { creatorId: product.creator_id, photos: settings.photos })
  if (!input.ok) return answer({ error: input.error }, 400)
  if (!input.name) return answer({ error: "Add your name. Only your first name and an initial are shown." }, 400)
  if (files.length > 4) return answer({ error: "Add up to 4 photos." }, 400)

  /* One store's form cannot be used to flood it (or the inboxes it would write to). */
  const storeLimited = await rateLimit({
    bucket: "review-site-store",
    subjects: [`store:${product.creator_id}`],
    windows: [{ limit: 30, seconds: 3600 }, { limit: 200, seconds: 86_400 }],
    message: "This store has had a lot of reviews today. Try again later.",
  })
  if (storeLimited) return files.length || !request.headers.get("content-type")?.includes("json") ? answer({ error: "limit" }, 429) : storeLimited

  const owner = `site:${product.creator_id}`
  if (files.length && settings.photos) {
    for (const f of files) {
      const stored = await storeReviewPhoto(db, product.creator_id, await f.arrayBuffer(), owner)
      if (!stored.ok) return answer({ error: stored.error }, stored.status)
      input.photoPaths.push(stored.path)
    }
  }

  const ip = callerAddress(request)
  const typed = {
    creatorId: product.creator_id,
    creatorUserId: (creator as { user_id?: string | null }).user_id ?? null,
    storeName: ((creator as { display_name?: string | null }).display_name || (creator as { slug?: string | null }).slug || "the store").trim(),
    product: { id: product.id, title: product.title as string | null },
    email,
    ipHash: ip ? createHash("sha256").update(`review:${ip}`).digest("hex").slice(0, 32) : null,
    rating: input.rating,
    title: input.title,
    content: input.content,
    name: input.name,
    photoPaths: input.photoPaths,
    owner,
  }
  later(() => settleSiteReview(db, typed, settings))
  return answer(CHECK_EMAIL, 202)
}
