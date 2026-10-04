import { NextResponse } from "next/server"
import { rateLimit } from "@/lib/api/rate-limit"
import { RATE_LIMITS } from "@/lib/communities/limits"
import { requireCommunitiesOn } from "@/lib/communities/flag"
import { requireMember } from "@/lib/communities/server/context"
import { admin } from "@/lib/communities/server/db"
import { NO_STORE, memberSubject, readJson, sessionUserId } from "@/lib/communities/server/feed"
import { completeCommunityFile, prepareCommunityFile } from "@/lib/communities/server/post-files"
import { isStaff } from "@/lib/communities/server/videos"
import { uploadRateLimit } from "@/lib/storage/upload-guard"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 30

/**
 * POST /api/community/<id>/files   (the composer's paperclip)
 *   { action: "prepare", fileName, fileSize, contentType }
 *     -> { ticket: { fileId, url, token, name, maxBytes } }   PUT the bytes to `url`
 *   { action: "complete", fileId, name }
 *     -> { file: PostMedia (type "file", store "community") }
 *
 * For an active member who may upload (can(role, "upload")). Checked before a
 * byte moves and again where it landed (lib/communities/server/post-files.ts);
 * a refused file is deleted. Rate limited like every upload on Storelib.
 */
export async function POST(request: Request, { params }: { params: Promise<{ communityId: string }> }) {
  const off = await requireCommunitiesOn()
  if (off) return off
  const { communityId } = await params
  const userId = await sessionUserId()
  const db = admin()
  const gate = await requireMember(db, communityId, userId, "upload")
  if (gate instanceof NextResponse) return gate
  const body = await readJson(request)
  const staff = isStaff(gate.viewer)

  if (body.action === "prepare") {
    const limited = await uploadRateLimit(String(userId))
    if (limited) return limited
    const made = await prepareCommunityFile(db, { community: gate.community, viewer: gate.viewer, staff, fileName: body.fileName, fileSize: body.fileSize, contentType: body.contentType })
    if (!made.ok) return NextResponse.json({ error: made.error }, { status: made.status ?? 400, headers: NO_STORE })
    return NextResponse.json({ ticket: made.value }, { headers: NO_STORE })
  }
  if (body.action === "complete") {
    const limited = await rateLimit({ bucket: "community-file", subjects: [memberSubject(String(userId))], windows: RATE_LIMITS.comment })
    if (limited) return limited
    const done = await completeCommunityFile(db, { community: gate.community, viewer: gate.viewer, staff, fileId: body.fileId, name: body.name })
    if (!done.ok) return NextResponse.json({ error: done.error }, { status: done.status ?? 400, headers: NO_STORE })
    return NextResponse.json({ file: done.value }, { headers: NO_STORE })
  }
  return NextResponse.json({ error: "bad_request" }, { status: 400, headers: NO_STORE })
}
