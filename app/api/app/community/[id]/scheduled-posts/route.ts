import { NextResponse } from "next/server"
import { requireCommunitiesOn } from "@/lib/communities/flag"
import { requireCreatorCommunity } from "@/lib/communities/server/context"
import { noStore, readJson } from "@/lib/email-campaigns/route-auth"
import { manageLimit } from "@/lib/communities/server/creator"
import { canPostIn, listSpaces } from "@/lib/communities/server/feed"
import { createScheduled, listScheduled } from "@/lib/communities/server/scheduled-posts"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Params = { params: Promise<{ id: string }> }

/**
 * GET  /api/app/community/<id>/scheduled-posts -> { ready, rows, spaces }
 *      Drafts and scheduled posts, then what went up or failed lately, and
 *      the spaces the signed in person may post in (round 32).
 * POST /api/app/community/<id>/scheduled-posts { spaceId, title, body, publishAt | null }
 *      -> { post }. publishAt null keeps it as a draft.
 * Anybody on the team who may post (requireCreatorCommunity "post").
 */
export async function GET(_request: Request, { params }: Params) {
  const off = await requireCommunitiesOn()
  if (off) return off
  const { id } = await params
  const gate = await requireCreatorCommunity(id, "post")
  if (gate instanceof NextResponse) return gate
  const db = gate.ctx.admin
  const [list, spaces] = await Promise.all([listScheduled(db, gate.community.id, { userId: gate.ctx.userId, role: gate.viewer.role, perms: gate.viewer.perms }), listSpaces(db, gate.community.id)])
  const writable = spaces.filter((s) => s.kind !== "chat" && canPostIn(s, gate.viewer, gate.community.chat_enabled)).map((s) => ({ id: s.id, name: s.name, kind: s.kind, icon: s.icon }))
  return NextResponse.json({ ...list, spaces: writable }, { headers: noStore })
}

export async function POST(request: Request, { params }: Params) {
  const off = await requireCommunitiesOn()
  if (off) return off
  const { id } = await params
  const gate = await requireCreatorCommunity(id, "post")
  if (gate instanceof NextResponse) return gate
  const limited = await manageLimit(gate.ctx.userId)
  if (limited) return limited
  const made = await createScheduled(gate.ctx.admin, { community: gate.community, viewer: gate.viewer, userId: gate.ctx.userId }, await readJson(request))
  if (!made.ok) return NextResponse.json({ error: made.error, field: made.field }, { status: made.status, headers: noStore })
  return NextResponse.json({ post: made.post }, { status: 201, headers: noStore })
}
