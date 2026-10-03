import { NextResponse } from "next/server"
import { rateLimit } from "@/lib/api/rate-limit"
import { requireCommunitiesOn } from "@/lib/communities/flag"
import { requireCreatorCommunity } from "@/lib/communities/server/context"
import {
  completeCaptions,
  completeVideoUpload,
  listCommunityVideos,
  prepareCaptions,
  prepareVideoUpload,
  videoStatusView,
} from "@/lib/communities/server/videos"
import { uploadRateLimit } from "@/lib/storage/upload-guard"
import { providerStates } from "@/lib/video/provider"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const noStore = { "Cache-Control": "private, no-store" }

/**
 * THE CREATOR'S VIDEOS FOR ONE COMMUNITY (cover video, event replays,
 * resources). The owner, admins and moderators of the community.
 *
 * GET  /api/app/community/<id>/videos?cursor=
 *   -> { videos: VideoStatusView[], nextCursor, providers: [{ name, connected, active, missing }] }
 *      `providers` is what the settings screen shows: Storelib storage is
 *      always connected; a video service is "not connected" until its env
 *      keys are set (`missing` names them, never a value).
 *
 * POST /api/app/community/<id>/videos
 *   { action: "prepare", fileName, contentType, fileSize }          -> { ticket: UploadTicket }
 *   { action: "complete", videoId, durationSeconds?, width?, height? } -> { video: VideoStatusView }
 *   { action: "captions-prepare", videoId, fileName, fileSize }      -> { ticket } (storage videos)
 *   { action: "captions-complete", videoId, path }                   -> { video }
 *
 * The browser side is lib/video/upload-client.ts uploadCommunityVideo.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const off = await requireCommunitiesOn()
  if (off) return off
  const { id } = await params
  const gate = await requireCreatorCommunity(id, "upload")
  if (gate instanceof NextResponse) return gate
  const cursor = new URL(request.url).searchParams.get("cursor")
  const page = await listCommunityVideos(gate.ctx.admin, gate.community.id, { cursor })
  return NextResponse.json({ ...page, providers: providerStates() }, { headers: noStore })
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const off = await requireCommunitiesOn()
  if (off) return off
  const { id } = await params
  const gate = await requireCreatorCommunity(id, "upload")
  if (gate instanceof NextResponse) return gate
  const db = gate.ctx.admin
  const limited = await rateLimit({ bucket: "community-video", subjects: [`user:${gate.ctx.userId}`], windows: [{ limit: 120, seconds: 600 }], message: "That is a lot of uploads in a short time. Wait a minute and try again." })
  if (limited) return limited

  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400, headers: noStore })
  }

  switch (body.action) {
    case "prepare": {
      const slow = await uploadRateLimit(gate.ctx.userId)
      if (slow) return slow
      const made = await prepareVideoUpload(db, { community: gate.community, staff: true, fileName: body.fileName, contentType: body.contentType, fileSize: body.fileSize, origin: new URL(request.url).origin })
      if (!made.ok) return NextResponse.json({ error: made.error, message: made.message }, { status: made.status, headers: noStore })
      return NextResponse.json({ ticket: made.ticket }, { headers: noStore })
    }
    case "complete": {
      const done = await completeVideoUpload(db, { community: gate.community, staff: true, videoId: body.videoId, durationSeconds: body.durationSeconds, width: body.width, height: body.height })
      if (!done.ok) return NextResponse.json({ error: done.error, message: done.message }, { status: done.status, headers: noStore })
      return NextResponse.json({ video: videoStatusView(done.video) }, { headers: noStore })
    }
    case "captions-prepare": {
      const slow = await uploadRateLimit(gate.ctx.userId)
      if (slow) return slow
      const made = await prepareCaptions(db, gate.community, { videoId: body.videoId, fileName: body.fileName, fileSize: body.fileSize })
      if (!made.ok) return NextResponse.json({ error: made.error, message: made.message }, { status: made.status, headers: noStore })
      return NextResponse.json({ ticket: made.ticket }, { headers: noStore })
    }
    case "captions-complete": {
      const done = await completeCaptions(db, gate.community, { videoId: body.videoId, path: body.path })
      if (!done.ok) return NextResponse.json({ error: done.error, message: done.message }, { status: done.status, headers: noStore })
      return NextResponse.json({ video: videoStatusView(done.video) }, { headers: noStore })
    }
    default:
      return NextResponse.json({ error: "bad_request" }, { status: 400, headers: noStore })
  }
}
