import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { downloadRateLimit } from "@/lib/storage/download-limits"
import { isUuid } from "@/lib/courses/access"
import { PRIVATE, sessionUserId } from "@/lib/courses/route-auth"
import { FILE_URL_SECONDS, lessonContext, signLessonFile } from "@/lib/courses/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * GET /api/courses/attachments/<attachment id>
 *
 * A lesson's download: a signed address, five minutes long, that storage
 * answers with `Content-Disposition: attachment` and the file's own name.
 * Only for the course's creator and its buyers; a free preview lesson plays
 * for anybody, but its downloads are for the people who bought it.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!isUuid(id)) return NextResponse.json({ error: "File not found" }, { status: 404, headers: PRIVATE })
  const userId = await sessionUserId()
  if (!userId) return NextResponse.json({ error: "Sign in to download this file." }, { status: 401, headers: PRIVATE })

  const limited = await downloadRateLimit(request, { userId, assetId: id })
  if (limited) return limited

  try {
    const admin = createAdminClient()
    const { data: row } = await admin.from("lesson_attachments").select("*").eq("id", id).maybeSingle()
    if (!row) return NextResponse.json({ error: "File not found" }, { status: 404, headers: PRIVATE })
    const att = row as { lesson_id: string; file_path: string; file_name: string }
    const ctx = await lessonContext(admin, userId, att.lesson_id)
    if (!ctx || (ctx.access !== "creator" && ctx.access !== "owner")) {
      return NextResponse.json({ error: "File not found" }, { status: 404, headers: PRIVATE })
    }
    const signed = await signLessonFile(admin, ctx, att.file_path, FILE_URL_SECONDS, att.file_name || "download")
    if (!signed) return NextResponse.json({ error: "The file could not be opened. Try again." }, { status: 502, headers: PRIVATE })
    return NextResponse.json({ url: signed.url, name: att.file_name }, { headers: PRIVATE })
  } catch (error) {
    console.error("[courses/attachment] failed:", error instanceof Error ? error.message : "unknown")
    return NextResponse.json({ error: "The file could not be opened. Try again." }, { status: 500, headers: PRIVATE })
  }
}
