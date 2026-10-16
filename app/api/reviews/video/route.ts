import { randomBytes } from "node:crypto"
import { type NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { addressSubject, rateLimit } from "@/lib/api/rate-limit"
import { loadReviewsApp } from "@/lib/reviews/app-server"
import { VIDEO_MAX_BYTES, VIDEO_TYPES } from "@/lib/reviews/app-settings"
import { verifyRequest } from "@/lib/reviews/request-token"
import { REVIEW_UPLOAD_BUCKET } from "@/lib/reviews/photos-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * ===========================================================================
 *  A VIDEO FOR A REVIEW (Storelib Reviews)
 * ===========================================================================
 *   POST { token, type, size }   → { path, uploadUrl }
 *
 * A video is too large to pass through a route, so the browser sends it
 * straight to the private review-uploads bucket on a signed address this
 * route makes, good for one file at one path. Only from a review request
 * link, only for a store that takes videos, only MP4, WebM or QuickTime and
 * at most VIDEO_MAX_BYTES (the bucket's own limit, run-now part 189, says
 * the same). The path is tied to the link (review_uploads, as a photo is),
 * so only a review from the same link can claim it, once; the review checks
 * the file is really there, a video and small enough (photos-server
 * verifyVideos), and the video waits for the store before it is public.
 * Unclaimed uploads are swept after a day.
 */
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } })

const EXT: Record<string, string> = { "video/mp4": "mp4", "video/webm": "webm", "video/quicktime": "mov" }

export async function POST(request: NextRequest) {
  const limited = await rateLimit({ bucket: "review-video", subjects: [addressSubject(request)], windows: [{ limit: 6, seconds: 3600 }, { limit: 20, seconds: 86_400 }], message: "That is a lot of videos at once. Try again later." })
  if (limited) return limited
  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return json({ error: "Bad request" }, 400)
  }
  const type = String(body?.type ?? "").toLowerCase()
  const size = Number(body?.size)
  if (!(VIDEO_TYPES as readonly string[]).includes(type)) return json({ error: "Use an MP4, WebM or MOV video." }, 415)
  if (!Number.isFinite(size) || size <= 0) return json({ error: "Choose a video." }, 400)
  if (size > VIDEO_MAX_BYTES) return json({ error: "That video is too large. Use one under 50 MB." }, 413)
  const id = verifyRequest(body?.token)
  if (!id) return json({ error: "This review link does not work." }, 404)
  const db = createAdminClient()
  const { data } = await db.from("review_requests").select("creator_id").eq("id", id).maybeSingle()
  const creatorId = (data as { creator_id?: string } | null)?.creator_id ?? null
  if (!creatorId) return json({ error: "This review link does not work." }, 404)
  const { settings } = await loadReviewsApp(db, creatorId)
  if (!settings.enabled || !settings.videos) return json({ error: "This store does not take videos with reviews." }, 403)

  const path = `${creatorId}/${randomBytes(16).toString("hex")}.${EXT[type]}`
  const later = "Videos turn on after the store's database update."
  const { error: rowError } = await db.from("review_uploads").insert({ path, creator_id: creatorId, owner: `request:${id}` })
  if (rowError) return json({ error: later }, 503)
  const { data: signed, error } = await db.storage.from(REVIEW_UPLOAD_BUCKET).createSignedUploadUrl(path)
  if (error || !signed?.signedUrl) {
    await db.from("review_uploads").delete().eq("path", path)
    return json({ error: later }, 503)
  }
  return json({ path, uploadUrl: signed.signedUrl })
}
