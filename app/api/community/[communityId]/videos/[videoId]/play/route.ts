import { NextResponse } from "next/server"
import { addressSubject, rateLimit } from "@/lib/api/rate-limit"
import { requireCommunitiesOn } from "@/lib/communities/flag"
import { admin } from "@/lib/communities/server/db"
import { communityOpen, loadCommunity, requireMember, viewerContext } from "@/lib/communities/server/context"
import { inPublicGallery } from "@/lib/communities/server/public"
import { readCommunityVideo, videoAccess, videoPlayback } from "@/lib/communities/server/videos"
import { sessionUserId } from "@/lib/courses/route-auth"
import { playbackQuality } from "@/lib/video/provider"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const noStore = { "Cache-Control": "private, no-store" }
const notFound = () => NextResponse.json({ error: "not_found" }, { status: 404, headers: noStore })

/**
 * GET /api/community/<id>/videos/<videoId>/play
 *   -> { url, expiresAt, mime, captions, poster, durationSeconds }   (lib/video/types.ts VideoPlayback)
 *   ?q=low   the lighter rendition where the service keeps one
 *
 * A signed address that works for an hour, decided afresh on every call
 * (lib/communities/server/videos.ts videoAccess): the community's cover
 * video on its public page for anyone, and so is a video the creator put in
 * the about page's gallery while the community is published
 * (lib/communities/server/public.ts inPublicGallery); otherwise an active member who may
 * see where the video is used (an event's replay once the event is over, a
 * post in a space they can see), and staff. A video of another community,
 * or one this person may not watch, is the same 404 as one that is not
 * there. 409 not_ready while a video service is still processing it.
 */
export async function GET(request: Request, { params }: { params: Promise<{ communityId: string; videoId: string }> }) {
  const off = await requireCommunitiesOn()
  if (off) return off
  const { communityId, videoId } = await params
  /* ?q=low: the lighter file, where the video's service keeps one (Save Data, a slow network, a preview). */
  const quality = playbackQuality(new URL(request.url).searchParams.get("q"))
  const userId = await sessionUserId()
  const limited = await rateLimit({
    bucket: "community-video-play",
    subjects: [addressSubject(request), userId ? `user:${userId}` : null],
    windows: [{ limit: 240, seconds: 3600 }],
    message: "Too many videos opened at once. Wait a minute, then try again.",
  })
  if (limited) return limited

  const db = admin()
  const community = await loadCommunity(db, { id: communityId })
  if (!community || !communityOpen(community)) return notFound()
  const video = await readCommunityVideo(db, community.id, videoId)
  if (!video) return notFound()

  /* A gallery video on the about page plays for whoever can see that page. */
  if (community.cover_video_id !== video.id && (await inPublicGallery(db, community, video.id))) {
    if (video.status !== "ready") return NextResponse.json({ error: video.status === "failed" ? "failed" : "not_ready", status: video.status }, { status: 409, headers: noStore })
    const playback = await videoPlayback(db, video, undefined, quality)
    if (!playback) return NextResponse.json({ error: "unavailable" }, { status: 502, headers: noStore })
    return NextResponse.json(playback, { headers: noStore })
  }

  let viewer = await viewerContext(db, community, null)
  /* Anything but the public cover video needs an active member first. */
  if (community.cover_video_id !== video.id) {
    const gate = await requireMember(db, community.id, userId, "view")
    if (gate instanceof NextResponse) return gate.status === 401 ? gate : notFound()
    viewer = gate.viewer
  } else if (userId) viewer = await viewerContext(db, community, userId)

  const access = await videoAccess(db, community, viewer, video)
  if (!access.ok) return access.reason === "not_yet" ? NextResponse.json({ error: "not_yet" }, { status: 403, headers: noStore }) : notFound()
  if (video.status !== "ready") return NextResponse.json({ error: video.status === "failed" ? "failed" : "not_ready", status: video.status }, { status: 409, headers: noStore })
  const playback = await videoPlayback(db, video, undefined, quality)
  if (!playback) return NextResponse.json({ error: "unavailable" }, { status: 502, headers: noStore })
  return NextResponse.json(playback, { headers: noStore })
}
