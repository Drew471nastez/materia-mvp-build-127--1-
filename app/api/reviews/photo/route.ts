import { type NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { addressSubject, rateLimit } from "@/lib/api/rate-limit"
import { isUuid } from "@/lib/receipts/rules"
import { UPLOAD_HEADERS } from "@/lib/storage/upload-guard"
import { loadReviewsApp } from "@/lib/reviews/app-server"
import { verifyRequest } from "@/lib/reviews/request-token"
import { REVIEW_PHOTO_MAX_BYTES as MAX_BYTES, storeReviewPhoto } from "@/lib/reviews/photos-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * ===========================================================================
 *  A PHOTO FOR A REVIEW (Storelib Reviews)
 * ===========================================================================
 *   POST multipart { file, token }        from a review request link
 *   POST multipart { file, productId }    on a website that lets anyone write
 *
 * Only for a store that takes photos. Every check is lib/reviews/
 * photos-server.ts: a picture by its bytes, its metadata removed, the
 * picture reader, the malware scan after the answer.
 *
 * Stored in the private uploads bucket under the store's folder with a
 * random name, and tied to where it came from (the request link, or the
 * store's website form). The review form sends the path back, and a review
 * takes only uploads tied to the same place, once (photos-server
 * claimUploads). The answer's address is a short signed one, for the
 * form's preview.
 */
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: UPLOAD_HEADERS })

export async function POST(request: NextRequest) {
  const limited = await rateLimit({ bucket: "review-photo", subjects: [addressSubject(request)], windows: [{ limit: 12, seconds: 600 }, { limit: 40, seconds: 86_400 }], message: "That is a lot of photos at once. Try again later." })
  if (limited) return limited

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return json({ error: "Bad request" }, 400)
  }
  const file = form.get("file")
  if (!(file instanceof File)) return json({ error: "Choose a photo." }, 400)
  if (file.size > MAX_BYTES) return json({ error: "That photo is too large. Use one under 8 MB." }, 413)

  const db = createAdminClient()
  let creatorId: string | null = null
  let owner = ""
  const token = form.get("token")
  const productId = form.get("productId")
  if (typeof token === "string" && token) {
    const id = verifyRequest(token)
    if (!id) return json({ error: "This review link does not work." }, 404)
    const { data } = await db.from("review_requests").select("creator_id").eq("id", id).maybeSingle()
    creatorId = (data as { creator_id?: string } | null)?.creator_id ?? null
    owner = `request:${id}`
  } else if (typeof productId === "string" && isUuid(productId)) {
    const { data } = await db.from("products").select("creator_id").eq("id", productId).eq("status", "published").maybeSingle()
    creatorId = (data as { creator_id?: string } | null)?.creator_id ?? null
    owner = `site:${creatorId}`
  }
  if (!creatorId) return json({ error: "This product is not available." }, 404)
  const { settings } = await loadReviewsApp(db, creatorId)
  if (!settings.enabled || !settings.photos || (!token && settings.who !== "anyone")) return json({ error: "This store does not take photos with reviews." }, 403)

  const stored = await storeReviewPhoto(db, creatorId, await file.arrayBuffer(), owner)
  if (!stored.ok) return json({ error: stored.error }, stored.status)
  return json({ path: stored.path, url: stored.url })
}
