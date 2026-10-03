import { NextResponse } from "next/server"
import { rateLimit } from "@/lib/api/rate-limit"
import { requireCommunitiesOn } from "@/lib/communities/flag"
import { requireCreatorCommunity } from "@/lib/communities/server/context"
import { audit } from "@/lib/communities/server/audit"
import { deleteCommunityVideo, readCommunityVideo, videoPlayback, videoStatusView } from "@/lib/communities/server/videos"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const noStore = { "Cache-Control": "private, no-store" }

/**
 * GET    /api/app/community/<id>/videos/<videoId>  -> { video: VideoStatusView, playback: VideoPlayback | null }
 *        (the creator's screens poll this while a video service processes it, and preview it)
 * DELETE /api/app/community/<id>/videos/<videoId>  -> { ok: true }
 *        removes the video and its files; places that used it show it as unavailable.
 *
 * A video of another community is a 404.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string; videoId: string }> }) {
  const off = await requireCommunitiesOn()
  if (off) return off
  const { id, videoId } = await params
  const gate = await requireCreatorCommunity(id, "upload")
  if (gate instanceof NextResponse) return gate
  const video = await readCommunityVideo(gate.ctx.admin, gate.community.id, videoId)
  if (!video) return NextResponse.json({ error: "not_found" }, { status: 404, headers: noStore })
  return NextResponse.json({ video: videoStatusView(video), playback: await videoPlayback(gate.ctx.admin, video) }, { headers: noStore })
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string; videoId: string }> }) {
  const off = await requireCommunitiesOn()
  if (off) return off
  const { id, videoId } = await params
  const gate = await requireCreatorCommunity(id, "moderate_content")
  if (gate instanceof NextResponse) return gate
  const limited = await rateLimit({ bucket: "community-video", subjects: [`user:${gate.ctx.userId}`], windows: [{ limit: 120, seconds: 600 }] })
  if (limited) return limited
  const removed = await deleteCommunityVideo(gate.ctx.admin, gate.community, videoId)
  if (!removed) return NextResponse.json({ error: "not_found" }, { status: 404, headers: noStore })
  await audit(gate.ctx.admin, { communityId: gate.community.id, actorId: gate.ctx.userId, actorKind: "member", action: "video.deleted", targetType: "video", targetId: videoId })
  return NextResponse.json({ ok: true }, { headers: noStore })
}
