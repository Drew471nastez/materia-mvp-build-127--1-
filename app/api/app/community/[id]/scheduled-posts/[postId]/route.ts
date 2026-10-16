import { NextResponse } from "next/server"
import { requireCommunitiesOn } from "@/lib/communities/flag"
import { requireCreatorCommunity } from "@/lib/communities/server/context"
import { noStore, readJson } from "@/lib/email-campaigns/route-auth"
import { manageLimit } from "@/lib/communities/server/creator"
import { deleteScheduled, updateScheduled } from "@/lib/communities/server/scheduled-posts"
import { isUuid } from "@/components/community/creator/logic"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 30

type Params = { params: Promise<{ id: string; postId: string }> }

/**
 * PATCH  /api/app/community/<id>/scheduled-posts/<postId>
 *        { spaceId?, title?, body?, publishAt? } changes it (publishAt null:
 *        a draft); { publishNow: true } puts it up now -> { post }.
 * DELETE /api/app/community/<id>/scheduled-posts/<postId> -> { ok }
 * Its author, or the owner and admins (round 32,
 * lib/communities/server/scheduled-posts.ts).
 */
export async function PATCH(request: Request, { params }: Params) {
  const off = await requireCommunitiesOn()
  if (off) return off
  const { id, postId } = await params
  if (!isUuid(postId)) return NextResponse.json({ error: "not_found" }, { status: 404, headers: noStore })
  const gate = await requireCreatorCommunity(id, "post")
  if (gate instanceof NextResponse) return gate
  const limited = await manageLimit(gate.ctx.userId)
  if (limited) return limited
  const done = await updateScheduled(gate.ctx.admin, { community: gate.community, viewer: gate.viewer, userId: gate.ctx.userId }, postId, await readJson(request))
  if (!done.ok) return NextResponse.json({ error: done.error, field: done.field }, { status: done.status, headers: noStore })
  return NextResponse.json({ post: done.post }, { headers: noStore })
}

export async function DELETE(_request: Request, { params }: Params) {
  const off = await requireCommunitiesOn()
  if (off) return off
  const { id, postId } = await params
  if (!isUuid(postId)) return NextResponse.json({ error: "not_found" }, { status: 404, headers: noStore })
  const gate = await requireCreatorCommunity(id, "post")
  if (gate instanceof NextResponse) return gate
  const limited = await manageLimit(gate.ctx.userId)
  if (limited) return limited
  const done = await deleteScheduled(gate.ctx.admin, { community: gate.community, viewer: gate.viewer, userId: gate.ctx.userId }, postId)
  if (!done.ok) return NextResponse.json({ error: done.error }, { status: done.status, headers: noStore })
  return NextResponse.json({ ok: true }, { headers: noStore })
}
