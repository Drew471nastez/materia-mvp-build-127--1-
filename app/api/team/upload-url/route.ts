import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { NO_ACCESS, actingStore } from "@/lib/team/server"
import { teamUploadPathOk } from "@/lib/team/uploads"
import { uploadRateLimit, UPLOAD_HEADERS } from "@/lib/storage/upload-guard"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * POST /api/team/upload-url   { bucket, path }
 *
 * A team member's picture or video for the store they work in, put straight
 * into a public bucket (round 41, lib/team/uploads TEAM_BUCKET_AREAS). The
 * browser asks here only when storage refused the write under the member's
 * own session. Answered with a signed upload address for that one path, which
 * cannot replace a file already there; the upload is then checked like every
 * other (confirmUpload, /api/storage/uploaded).
 *
 *   signed out                    401
 *   in their own account          403 (their own folder is theirs to write)
 *   without an area for the bucket, or a path outside the store's folder   403
 */
export async function POST(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Sign in again to upload." }, { status: 401, headers: UPLOAD_HEADERS })
  const admin = createAdminClient()
  const acting = await actingStore(admin, user.id).catch(() => null)
  const body = (await request.json().catch(() => null)) as { bucket?: unknown; path?: unknown } | null
  if (!acting || !teamUploadPathOk(acting, body?.bucket, body?.path)) {
    return NextResponse.json({ error: NO_ACCESS }, { status: 403, headers: UPLOAD_HEADERS })
  }
  const limited = await uploadRateLimit(user.id)
  if (limited) return limited
  const bucket = body!.bucket as string
  const path = body!.path as string
  const { data, error } = await admin.storage.from(bucket).createSignedUploadUrl(path)
  if (error || !data) return NextResponse.json({ error: "Could not start the upload. Try again." }, { status: 500, headers: UPLOAD_HEADERS })
  return NextResponse.json({ signedUrl: data.signedUrl }, { headers: UPLOAD_HEADERS })
}
