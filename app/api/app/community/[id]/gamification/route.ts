import { NextResponse } from "next/server"
import { requireCommunitiesOn } from "@/lib/communities/flag"
import { requireCreatorCommunity } from "@/lib/communities/server/context"
import { noStore, readJson } from "@/lib/email-campaigns/route-auth"
import { loadBadges, loadLevels, manageLimit, saveLevels, updateSettings } from "@/lib/communities/server/creator"
import { checkLevels } from "@/components/community/creator/logic"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Params = { params: Promise<{ id: string }> }

/**
 * GET   /api/app/community/<id>/gamification -> { enabled, levels, badges }
 * PATCH /api/app/community/<id>/gamification { enabled?: boolean, levels?: [{ name, minPoints, reward? }] }
 *       Saving levels moves every member to the level their points now reach.
 */
export async function GET(_request: Request, { params }: Params) {
  const off = await requireCommunitiesOn()
  if (off) return off
  const { id } = await params
  const gate = await requireCreatorCommunity(id, "manage_gamification")
  if (gate instanceof NextResponse) return gate
  const [levels, badges] = await Promise.all([loadLevels(gate.ctx.admin, gate.community.id), loadBadges(gate.ctx.admin, gate.community.id)])
  return NextResponse.json({ enabled: gate.community.gamification_enabled, levels, badges }, { headers: noStore })
}

export async function PATCH(request: Request, { params }: Params) {
  const off = await requireCommunitiesOn()
  if (off) return off
  const { id } = await params
  const gate = await requireCreatorCommunity(id, "manage_gamification")
  if (gate instanceof NextResponse) return gate
  const limited = await manageLimit(gate.ctx.userId)
  if (limited) return limited
  const body = await readJson(request)
  const db = gate.ctx.admin
  if (body.levels !== undefined) {
    const levels = checkLevels(body.levels)
    if (!levels.ok) return NextResponse.json({ error: levels.error, field: levels.field }, { status: 400, headers: noStore })
    const saved = await saveLevels(db, { communityId: gate.community.id, actorId: gate.ctx.userId, levels: levels.value })
    if (!saved.ok) return NextResponse.json({ error: saved.error }, { status: saved.status, headers: noStore })
  }
  if (typeof body.enabled === "boolean") {
    const done = await updateSettings(db, { community: gate.community, role: gate.role, perms: gate.viewer.perms, actorId: gate.ctx.userId, creatorId: gate.ctx.creatorId, body: { gamificationEnabled: body.enabled } })
    if (!done.ok) return NextResponse.json({ error: done.error }, { status: done.status, headers: noStore })
  }
  return NextResponse.json({ ok: true }, { headers: noStore })
}
