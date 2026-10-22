import { NextResponse } from "next/server"
import { chatRoute, notFound, ok } from "@/lib/communities/server/chat-routes"
import { groupOf, markGroupRead } from "@/lib/communities/server/groups"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Params = { params: Promise<{ communityId: string; groupId: string }> }

/** POST: the viewer has seen this group up to now (sent every 20 seconds while it is open, so a phone is not told about what is on the screen). */
export async function POST(_request: Request, { params }: Params) {
  const { communityId, groupId } = await params
  const r = await chatRoute(communityId, "view", "dmTouch")
  if (r instanceof NextResponse) return r
  const opened = await groupOf(r.db, r.gate.community, r.gate.viewer, groupId)
  if (!opened) return notFound()
  await markGroupRead(r.db, opened, r.gate.viewer)
  return ok({ ok: true })
}
