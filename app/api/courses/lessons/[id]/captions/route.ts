import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { STORAGE_BUCKET } from "@/lib/storage/plans"
import { isLessonMediaPath, isUuid } from "@/lib/courses/access"
import { CAPTION_MAX_BYTES, toWebVtt } from "@/lib/courses/captions"
import { PRIVATE, sessionUserId } from "@/lib/courses/route-auth"
import { lessonContext } from "@/lib/courses/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * GET /api/courses/lessons/<lesson id>/captions
 *
 * The lesson's captions as WebVTT, from this site's own address. A <track>
 * on another origin needs CORS on the video and the track both, which a
 * signed storage address does not promise; a caption file is a few
 * kilobytes, so it comes through here instead, after the same access check
 * as the video.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!isUuid(id)) return new NextResponse("", { status: 404, headers: PRIVATE })
  const userId = await sessionUserId()
  try {
    const admin = createAdminClient()
    const ctx = await lessonContext(admin, userId, id)
    if (!ctx || ctx.access === "none" || !isLessonMediaPath(ctx.lesson.captions_path, ctx.creatorId, ctx.lesson.id)) {
      return new NextResponse("", { status: 404, headers: PRIVATE })
    }
    const { data, error } = await admin.storage.from(STORAGE_BUCKET).download(ctx.lesson.captions_path)
    if (error || !data || data.size > CAPTION_MAX_BYTES) return new NextResponse("", { status: 404, headers: PRIVATE })
    return new NextResponse(toWebVtt(await data.text()), {
      headers: { ...PRIVATE, "Content-Type": "text/vtt; charset=utf-8", "X-Content-Type-Options": "nosniff" },
    })
  } catch {
    return new NextResponse("", { status: 500, headers: PRIVATE })
  }
}
