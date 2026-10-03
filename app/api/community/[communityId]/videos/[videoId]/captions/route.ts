import { NextResponse } from "next/server"
import { STORAGE_BUCKET } from "@/lib/storage/plans"
import { CAPTION_MAX_BYTES, toWebVtt } from "@/lib/courses/captions"
import { requireCommunitiesOn } from "@/lib/communities/flag"
import { admin } from "@/lib/communities/server/db"
import { communityOpen, loadCommunity, requireMember, viewerContext } from "@/lib/communities/server/context"
import { readCommunityVideo, videoAccess } from "@/lib/communities/server/videos"
import { isCommunityMediaPath } from "@/lib/video/storage"
import { sessionUserId } from "@/lib/courses/route-auth"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const noStore = { "Cache-Control": "private, no-store" }

/**
 * GET /api/community/<id>/videos/<videoId>/captions
 *
 * The video's captions as WebVTT from this site's own address (a <track> on
 * another origin needs CORS a signed storage address does not promise),
 * after the same access check as the video itself.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ communityId: string; videoId: string }> }) {
  const off = await requireCommunitiesOn()
  if (off) return off
  const { communityId, videoId } = await params
  const userId = await sessionUserId()
  const db = admin()
  const community = await loadCommunity(db, { id: communityId })
  if (!community || !communityOpen(community)) return new NextResponse("", { status: 404, headers: noStore })
  const video = await readCommunityVideo(db, community.id, videoId)
  if (!video || !isCommunityMediaPath(video.captions_path, video.creator_id, video.id)) return new NextResponse("", { status: 404, headers: noStore })
  let viewer = await viewerContext(db, community, null)
  if (community.cover_video_id !== video.id) {
    const gate = await requireMember(db, community.id, userId, "view")
    if (gate instanceof NextResponse) return new NextResponse("", { status: 404, headers: noStore })
    viewer = gate.viewer
  }
  if (!(await videoAccess(db, community, viewer, video)).ok) return new NextResponse("", { status: 404, headers: noStore })
  const { data, error } = await db.storage.from(STORAGE_BUCKET).download(video.captions_path)
  if (error || !data || data.size > CAPTION_MAX_BYTES) return new NextResponse("", { status: 404, headers: noStore })
  return new NextResponse(toWebVtt(await data.text()), { headers: { ...noStore, "Content-Type": "text/vtt; charset=utf-8", "X-Content-Type-Options": "nosniff" } })
}
