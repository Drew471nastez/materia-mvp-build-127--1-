import { NextResponse } from "next/server"
import { requireCommunitiesOn } from "@/lib/communities/flag"
import { requireCreatorCommunity } from "@/lib/communities/server/context"
import { noStore } from "@/lib/email-campaigns/route-auth"
import { manageLimit } from "@/lib/communities/server/creator"
import { revokeInvite } from "@/lib/communities/server/invites"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** DELETE /api/app/community/<id>/invites/<inviteId>: revoked at once; a link already shared stops working. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string; inviteId: string }> }) {
  const off = await requireCommunitiesOn()
  if (off) return off
  const { id, inviteId } = await params
  const gate = await requireCreatorCommunity(id, "invite")
  if (gate instanceof NextResponse) return gate
  const limited = await manageLimit(gate.ctx.userId)
  if (limited) return limited
  const done = await revokeInvite(gate.ctx.admin, { communityId: gate.community.id, inviteId, actorId: gate.ctx.userId })
  if (!done.ok) return NextResponse.json({ error: done.error }, { status: done.status, headers: noStore })
  return NextResponse.json({ ok: true }, { headers: noStore })
}
