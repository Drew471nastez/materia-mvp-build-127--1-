import { rateLimit } from "@/lib/api/rate-limit"
import { NextResponse } from "next/server"
import { requireCommunitiesOn } from "@/lib/communities/flag"
import { admin } from "@/lib/communities/server/db"
import { requireMember } from "@/lib/communities/server/context"
import { completeVideoUpload, isStaff, prepareVideoUpload, videoStatusView } from "@/lib/communities/server/videos"
import { uploadRateLimit } from "@/lib/storage/upload-guard"
import { sessionUserId } from "@/lib/courses/route-auth"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const noStore = { "Cache-Control": "private, no-store" }

/**
 * POST /api/community/<id>/videos   (a member's composer)
 *   { action: "prepare", fileName, contentType, fileSize }
 *     -> { ticket: UploadTicket }   (lib/video/types.ts; send it with lib/video/upload-client.ts)
 *   { action: "complete", videoId, durationSeconds?, width?, height? }
 *     -> { video: VideoStatusView }
 *
 * For an active member who may upload (can(role, "upload"): not muted, the
 * community not archived). Members send up to 1 GB, staff up to 2 GB; the
 * file is checked before a byte moves and again where it landed, and it is
 * counted against the community creator's storage. Rate limited like every
 * upload on Storelib. A video plays only where it is used (a post, an
 * event's replay) for members who can see that place.
 */
export async function POST(request: Request, { params }: { params: Promise<{ communityId: string }> }) {
  const off = await requireCommunitiesOn()
  if (off) return off
  const { communityId } = await params
  const userId = await sessionUserId()
  const db = admin()
  const gate = await requireMember(db, communityId, userId, "upload")
  if (gate instanceof NextResponse) return gate

  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400, headers: noStore })
  }
  const staff = isStaff(gate.viewer)

  if (body.action === "prepare") {
    const limited = await uploadRateLimit(userId as string)
    if (limited) return limited
    const made = await prepareVideoUpload(db, { community: gate.community, staff, fileName: body.fileName, contentType: body.contentType, fileSize: body.fileSize, origin: new URL(request.url).origin })
    if (!made.ok) return NextResponse.json({ error: made.error, message: made.message }, { status: made.status, headers: noStore })
    return NextResponse.json({ ticket: made.ticket }, { headers: noStore })
  }
  if (body.action === "complete") {
    /* Counted (round 27 review): finishing an upload reads the stored file, so it is not free to ask for in a loop. Its own bucket, so an upload is not counted twice against the start's. */
    const limited = await rateLimit({ bucket: "video-complete", subjects: [`user:${userId}`], windows: [{ limit: 120, seconds: 600 }], message: "That is a lot of uploads in a short time. Wait a minute and try again." })
    if (limited) return limited
    const done = await completeVideoUpload(db, { community: gate.community, staff, videoId: body.videoId, durationSeconds: body.durationSeconds, width: body.width, height: body.height })
    if (!done.ok) return NextResponse.json({ error: done.error, message: done.message }, { status: done.status, headers: noStore })
    return NextResponse.json({ video: videoStatusView(done.video) }, { headers: noStore })
  }
  return NextResponse.json({ error: "bad_request" }, { status: 400, headers: noStore })
}
