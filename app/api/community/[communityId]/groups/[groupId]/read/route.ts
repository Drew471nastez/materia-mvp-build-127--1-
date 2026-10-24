import { NextResponse } from "next/server"
import { requireCommunitiesOn } from "@/lib/communities/flag"
import { requireMember } from "@/lib/communities/server/context"
import { admin } from "@/lib/communities/server/db"
import { sessionUserId } from "@/lib/communities/server/feed"
import { chatLimit, notFound, ok } from "@/lib/communities/server/chat-routes"
import { groupOf, markGroupRead } from "@/lib/communities/server/groups"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Params = { params: Promise<{ communityId: string; groupId: string }> }

/** POST: the viewer has seen this group up to now (sent every 20 seconds while it is open, so a phone is not told about what is on the screen). */
export async function POST(_request: Request, { params }: Params) {
  const off = await requireCommunitiesOn()
  if (off) return off
  const { communityId, groupId } = await params
  const db = admin()
  const gate = await requireMember(db, communityId, await sessionUserId(), "view")
  if (gate instanceof NextResponse) return gate
  const limited = await chatLimit(gate, "dmTouch")
  if (limited) return limited
  const opened = await groupOf(db, gate.community, gate.viewer, groupId)
  if (!opened) return notFound()
  await markGroupRead(db, opened, gate.viewer)
  return ok({ ok: true })
}
