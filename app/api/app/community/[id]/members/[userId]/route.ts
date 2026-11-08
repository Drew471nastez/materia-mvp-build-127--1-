import { NextResponse } from "next/server"
import { requireCommunitiesOn } from "@/lib/communities/flag"
import { requireCreatorCommunity } from "@/lib/communities/server/context"
import { noStore, readJson } from "@/lib/email-campaigns/route-auth"
import { manageLimit } from "@/lib/communities/server/creator"
import { MEMBER_ACTIONS, actOnMember, memberActionNeeds } from "@/lib/communities/server/moderation"
import { isOneOf } from "@/lib/communities/types"
import { isUuid } from "@/components/community/creator/logic"
import { can } from "@/lib/communities/permissions"
import { memberPanelFacts } from "@/lib/communities/server/member-panel"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * GET   /api/app/community/<id>/members/<userId> (round 51)
 *   { activity, answers }: the member sheet's posts, comments and events,
 *   and their answers to the questions before joining (approve_member only,
 *   as Members › Requests). Whoever may open Members (remove_member) may ask.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string; userId: string }> }) {
  const off = await requireCommunitiesOn()
  if (off) return off
  const { id, userId } = await params
  if (!isUuid(userId)) return NextResponse.json({ error: "not_found" }, { status: 404, headers: noStore })
  const gate = await requireCreatorCommunity(id, "remove_member")
  if (gate instanceof NextResponse) return gate
  const facts = await memberPanelFacts(gate.ctx.admin, gate.community.id, userId, { answers: can(gate.role, "approve_member", gate.viewer.perms) })
  return NextResponse.json(facts, { headers: noStore })
}

/**
 * PATCH /api/app/community/<id>/members/<userId>
 *   { action: mute|unmute|suspend|unsuspend|ban|unban|remove|approve|reject|role, reason?, until?, role? }
 * Each action needs its own permission, and nobody acts on somebody ranked
 * the same or above them (lib/communities/server/moderation.ts).
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; userId: string }> }) {
  const off = await requireCommunitiesOn()
  if (off) return off
  const { id, userId } = await params
  if (!isUuid(userId)) return NextResponse.json({ error: "not_found" }, { status: 404, headers: noStore })
  const body = await readJson(request)
  if (!isOneOf(MEMBER_ACTIONS, body.action)) return NextResponse.json({ error: "Unknown action." }, { status: 400, headers: noStore })
  const gate = await requireCreatorCommunity(id, memberActionNeeds(body.action))
  if (gate instanceof NextResponse) return gate
  const limited = await manageLimit(gate.ctx.userId)
  if (limited) return limited
  const done = await actOnMember(gate.ctx.admin, {
    community: gate.community,
    actor: { userId: gate.ctx.userId, role: gate.role, perms: gate.viewer.perms ?? null },
    action: body.action,
    userId,
    reason: typeof body.reason === "string" ? body.reason : null,
    until: body.until,
    role: body.role,
  })
  if (!done.ok) return NextResponse.json({ error: done.error }, { status: done.status, headers: noStore })
  return NextResponse.json({ status: done.member?.status ?? null, role: done.member?.role ?? null, mutedUntil: done.member?.muted_until ?? null }, { headers: noStore })
}
