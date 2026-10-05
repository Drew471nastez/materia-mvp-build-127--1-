import { NextResponse } from "next/server"
import { rateLimit } from "@/lib/api/rate-limit"
import { requireCommunitiesOn } from "@/lib/communities/flag"
import { admin } from "@/lib/communities/server/db"
import { requireMember } from "@/lib/communities/server/context"
import { refreshVideoStatus } from "@/lib/communities/server/videos"
import { sessionUserId } from "@/lib/courses/route-auth"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const noStore = { "Cache-Control": "private, no-store" }

/**
 * GET /api/community/<id>/videos/<videoId>   (the composer, while it waits)
 *   -> { video: VideoStatusView }   (lib/video/types.ts)
 *
 * Where a video sent from the composer is now: uploading, processing,
 * ready or failed (with the service's reason). For an active member who
 * may upload in this community, about a video of THIS community only
 * (another community's is the same 404 as one that is not there). On a
 * video service it also asks the service, at most every few seconds
 * (lib/communities/server/videos.ts refreshVideoStatus). It never answers
 * an address to play: that is the play route's, which checks who may watch.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ communityId: string; videoId: string }> }) {
  const off = await requireCommunitiesOn()
  if (off) return off
  const { communityId, videoId } = await params
  const userId = await sessionUserId()
  const db = admin()
  const gate = await requireMember(db, communityId, userId, "upload")
  if (gate instanceof NextResponse) return gate
  const limited = await rateLimit({
    bucket: "community-video-status",
    subjects: [`user:${userId}`],
    windows: [{ limit: 240, seconds: 600 }],
    message: "Still checking the video. Wait a minute, then try again.",
  })
  if (limited) return limited
  const video = await refreshVideoStatus(db, gate.community, videoId)
  if (!video) return NextResponse.json({ error: "not_found" }, { status: 404, headers: noStore })
  return NextResponse.json({ video }, { headers: noStore })
}
