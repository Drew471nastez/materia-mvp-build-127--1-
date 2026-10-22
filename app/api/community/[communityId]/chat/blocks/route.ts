import { NextResponse } from "next/server"
import { iBlocked, setBlock } from "@/lib/communities/server/chat-settings"
import { chatRoute, ok, refusal } from "@/lib/communities/server/chat-routes"
import { readJson } from "@/lib/communities/server/feed"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Params = { params: Promise<{ communityId: string }> }

/** GET ?userId=: { blocked } (whether the viewer blocked them). */
export async function GET(request: Request, { params }: Params) {
  const { communityId } = await params
  const r = await chatRoute(communityId, "view")
  if (r instanceof NextResponse) return r
  const other = new URL(request.url).searchParams.get("userId") ?? ""
  return ok({ blocked: await iBlocked(r.db, String(r.gate.viewer.userId), other) })
}

/** POST { userId, on }: the viewer blocks (or unblocks) a person. Blocked, neither can message the other or add the other to a group. */
export async function POST(request: Request, { params }: Params) {
  const { communityId } = await params
  const r = await chatRoute(communityId, "view", "chatPrefs")
  if (r instanceof NextResponse) return r
  const body = await readJson(request)
  const done = await setBlock(r.db, String(r.gate.viewer.userId), body.userId, body.on !== false)
  return done.ok ? ok({ blocked: done.value }) : refusal(done)
}
