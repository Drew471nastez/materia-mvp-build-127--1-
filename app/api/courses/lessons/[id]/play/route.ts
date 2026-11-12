import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { addressSubject, rateLimit } from "@/lib/api/rate-limit"
import { isUuid } from "@/lib/courses/access"
import { externalVideo } from "@/lib/courses/external"
import { PRIVATE, sessionUserId } from "@/lib/courses/route-auth"
import { VIDEO_URL_SECONDS, kindOf, lessonContext, signLessonFile } from "@/lib/courses/server"
import { authUnavailableForRequest, authUnavailableResponse } from "@/lib/auth/route-user"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * GET /api/courses/lessons/<lesson id>/play
 *
 * What the player needs to play one lesson, decided afresh on every call
 * (lib/courses/access.ts): the course's creator, a buyer, or anybody for a
 * lesson marked as a free preview of a published course. Anyone else gets
 * the same 404 as a lesson that does not exist.
 *
 * An uploaded video comes back as a signed address on storage, good for an
 * hour (VIDEO_URL_SECONDS), which answers Range requests, so the browser
 * seeks and buffers straight from storage and nothing streams through a
 * function. The player asks here again before the hour is up. The storage
 * path is never in the answer.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!isUuid(id)) return NextResponse.json({ error: "Lesson not found" }, { status: 404, headers: PRIVATE })

  const userId = await sessionUserId()
  /* A visitor sees the preview; a signed in person Auth could not check is asked to try again, not shown the locked view (round rel2-auth). */
  if (!userId && (await authUnavailableForRequest())) return authUnavailableResponse()
  const limited = await rateLimit({
    bucket: "course-play",
    subjects: [addressSubject(request), userId ? `user:${userId}` : null],
    windows: [{ limit: 240, seconds: 3600 }],
    message: "Too many lessons opened at once. Wait a minute, then try again.",
  })
  if (limited) return limited

  try {
    const admin = createAdminClient()
    const ctx = await lessonContext(admin, userId, id)
    if (!ctx || ctx.access === "none") return NextResponse.json({ error: "Lesson not found" }, { status: 404, headers: PRIVATE })

    const kind = kindOf(ctx.lesson)
    if (kind === "video") {
      const signed = await signLessonFile(admin, ctx, ctx.lesson.video_path, VIDEO_URL_SECONDS)
      if (!signed) return NextResponse.json({ error: "This video could not be opened. Try again." }, { status: 502, headers: PRIVATE })
      return NextResponse.json(
        {
          kind,
          url: signed.url,
          expiresAt: signed.expiresAt,
          mime: ctx.lesson.video_mime || null,
          captions: ctx.lesson.captions_path ? `/api/courses/lessons/${id}/captions` : null,
          access: ctx.access,
        },
        { headers: PRIVATE },
      )
    }
    if (kind === "external") {
      const ext = externalVideo(ctx.lesson.video_url)!
      return NextResponse.json({ kind, provider: ext.provider, embedUrl: ext.embedUrl, access: ctx.access }, { headers: PRIVATE })
    }
    return NextResponse.json({ kind, access: ctx.access }, { headers: PRIVATE })
  } catch (error) {
    console.error("[courses/play] failed:", error instanceof Error ? error.message : "unknown")
    return NextResponse.json({ error: "This lesson could not be opened. Try again." }, { status: 500, headers: PRIVATE })
  }
}
