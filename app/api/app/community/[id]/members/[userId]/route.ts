import { NextResponse } from "next/server"
import { requireCommunitiesOn } from "@/lib/communities/flag"
import { requireCreatorCommunity } from "@/lib/communities/server/context"
import { noStore, readJson } from "@/lib/email-campaigns/route-auth"
import { manageLimit } from "@/lib/communities/server/creator"
import { MEMBER_ACTIONS, actOnMember, memberActionNeeds } from "@/lib/communities/server/moderation"
import { memberDetail } from "@/lib/communities/server/member-detail"
import { memberOf } from "@/lib/communities/server/membership"
import { isOneOf } from "@/lib/communities/types"
import { isUuid } from "@/components/community/creator/logic"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * GET /api/app/community/<id>/members/<userId> -> { detail }
 *
 * What the Members sheet shows once a row is opened (round 34,
 * lib/communities/member-detail.ts): what they did here, how they got in and
 * when their access ends, and, only for somebody the manage_members
 * permission reaches, the programs of this community they have access to.
 * Never an amount, a card, a Stripe id or anything from another community.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string; userId: string }> }) {
  const off = await requireCommunitiesOn()
  if (off) return off
  const { id, userId } = await params
  if (!isUuid(userId)) return NextResponse.json({ error: "not_found" }, { status: 404, headers: noStore })
  const gate = await requireCreatorCommunity(id, "remove_member")
  if (gate instanceof NextResponse) return gate
  const db = gate.ctx.admin
  const member = await memberOf(db, gate.community.id, userId)
  if (!member) return NextResponse.json({ error: "not_found" }, { status: 404, headers: noStore })
  const detail = await memberDetail(db, gate.community, member, { role: gate.role, perms: gate.viewer.perms })
  return NextResponse.json({ detail }, { headers: noStore })
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
