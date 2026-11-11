import { NextResponse } from "next/server"
import { requireCommunitiesOn } from "@/lib/communities/flag"
import { requireMember } from "@/lib/communities/server/context"
import { admin } from "@/lib/communities/server/db"
import { createClient } from "@/lib/supabase/server"
import { readJson } from "@/lib/email-campaigns/route-auth"
import { manageLimit } from "@/lib/communities/server/creator"
import { MEMBER_ACTIONS, actOnMember, memberActionNeeds } from "@/lib/communities/server/moderation"
import { isOneOf } from "@/lib/communities/types"
import { authUnavailableResponse, routeUser } from "@/lib/auth/route-user"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const noStore = { "Cache-Control": "no-store" }

/**
 * POST /api/community/<communityId>/moderation/members
 *   { action: mute|unmute|suspend|unsuspend|ban|unban|remove|approve|reject|role,
 *     userId, reason?, until? (ISO time or hours), role? } -> { status, role, mutedUntil }
 * For the member side's menus. The action's own permission, and only on
 * somebody ranked below (canActOn).
 */
export async function POST(request: Request, { params }: { params: Promise<{ communityId: string }> }) {
  const off = await requireCommunitiesOn()
  if (off) return off
  const { communityId } = await params
  const body = await readJson(request)
  if (!isOneOf(MEMBER_ACTIONS, body.action)) return NextResponse.json({ error: "Unknown action." }, { status: 400, headers: noStore })
  const who = await routeUser()
  if (who.kind === "unavailable") return authUnavailableResponse()
  const user = who.kind === "user" ? who.user : null
  const db = admin()
  const gate = await requireMember(db, communityId, user?.id ?? null, memberActionNeeds(body.action))
  if (gate instanceof NextResponse) return gate
  const limited = await manageLimit(gate.viewer.userId as string)
  if (limited) return limited
  const done = await actOnMember(db, {
    community: gate.community,
    actor: { userId: gate.viewer.userId as string, role: gate.viewer.role! },
    action: body.action,
    userId: String(body.userId ?? ""),
    reason: typeof body.reason === "string" ? body.reason : null,
    until: body.until,
    role: body.role,
  })
  if (!done.ok) return NextResponse.json({ error: done.error }, { status: done.status, headers: noStore })
  return NextResponse.json({ status: done.member?.status ?? null, role: done.member?.role ?? null, mutedUntil: done.member?.muted_until ?? null }, { headers: noStore })
}
