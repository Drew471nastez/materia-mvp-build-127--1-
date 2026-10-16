import { NextResponse } from "next/server"
import { rateLimit } from "@/lib/api/rate-limit"
import { requireCommunitiesOn } from "@/lib/communities/flag"
import { admin } from "@/lib/communities/server/db"
import { requireMember } from "@/lib/communities/server/context"
import { readCommunityVideo } from "@/lib/communities/server/videos"
import { VIDEO_POSTER, saveVideoBlurs, saveVideoFrame } from "@/lib/communities/server/video-posters"
import { sessionUserId } from "@/lib/courses/route-auth"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const noStore = { "Cache-Control": "private, no-store" }

/**
 * POST /api/community/<id>/videos/<videoId>/poster   (round 33, media.tsx VideoFrame)
 *   body: the video's first frame, image/jpeg (or webp, png), ?w=&h= the video's own size
 *     -> { poster, w, h, blur, posts }   kept as the still of the viewer's posts carrying the video that have none
 *   body: empty (Content-Type application/json, {})
 *     -> { posts }                       the 16px copy for those posts' stills that have none
 *
 * For an active member of the community, about a video of THIS community: their own posts, or every post for a moderator
 * (lib/communities/server/video-posters.ts). Anybody else, a video used in none of their posts, or one of another
 * community, is the same 404. A still already there is never replaced. Counted per person.
 */
export async function POST(request: Request, { params }: { params: Promise<{ communityId: string; videoId: string }> }) {
  const off = await requireCommunitiesOn()
  if (off) return off
  const { communityId, videoId } = await params
  const userId = await sessionUserId()
  const db = admin()
  const gate = await requireMember(db, communityId, userId, "view")
  if (gate instanceof NextResponse) return gate
  const limited = await rateLimit({
    bucket: "community-video-poster",
    subjects: [`user:${userId}`],
    windows: [{ limit: 60, seconds: 3600 }],
    message: "That is a lot of videos at once. Wait a minute and try again.",
  })
  if (limited) return limited
  const video = await readCommunityVideo(db, gate.community.id, videoId)
  if (!video) return NextResponse.json({ error: "not_found" }, { status: 404, headers: noStore })

  const type = (request.headers.get("content-type") || "").toLowerCase()
  if (!type.startsWith("image/")) {
    const done = await saveVideoBlurs(db, { community: gate.community, viewer: gate.viewer, video })
    if (!done.ok) return NextResponse.json({ error: done.error }, { status: done.status, headers: noStore })
    return NextResponse.json({ posts: done.posts }, { headers: noStore })
  }

  const declared = Number(request.headers.get("content-length") || 0)
  if (declared > VIDEO_POSTER.maxBytes) return NextResponse.json({ error: "too_large" }, { status: 413, headers: noStore })
  let bytes: Uint8Array
  try {
    bytes = new Uint8Array(await request.arrayBuffer())
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400, headers: noStore })
  }
  if (!bytes.length) return NextResponse.json({ error: "empty" }, { status: 400, headers: noStore })
  if (bytes.length > VIDEO_POSTER.maxBytes) return NextResponse.json({ error: "too_large" }, { status: 413, headers: noStore })
  const url = new URL(request.url)
  const saved = await saveVideoFrame(db, { community: gate.community, viewer: gate.viewer, video, bytes, w: Number(url.searchParams.get("w")) || null, h: Number(url.searchParams.get("h")) || null })
  if (!saved.ok) return NextResponse.json({ error: saved.error }, { status: saved.status, headers: noStore })
  return NextResponse.json({ poster: saved.poster, w: saved.w, h: saved.h, blur: saved.blur, posts: saved.posts }, { headers: noStore })
}
