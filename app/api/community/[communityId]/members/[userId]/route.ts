import { NextResponse } from "next/server"
import { requireCommunitiesOn } from "@/lib/communities/flag"
import { can } from "@/lib/communities/permissions"
import { requireMember } from "@/lib/communities/server/context"
import { admin } from "@/lib/communities/server/db"
import { memberProfile } from "@/lib/communities/server/directory"
import { NO_STORE, accessOf, sessionUserId } from "@/lib/communities/server/feed"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Params = { params: Promise<{ communityId: string; userId: string }> }

/** GET: { member } with badges, post count and recent posts the viewer may see. No email, no payment data. */
export async function GET(_request: Request, { params }: Params) {
  const off = await requireCommunitiesOn()
  if (off) return off
  const { communityId, userId } = await params
  const db = admin()
  const gate = await requireMember(db, communityId, await sessionUserId(), "view")
  if (gate instanceof NextResponse) return gate
  if (!gate.community.directory_enabled && !can(gate.viewer.role, "manage_members", gate.viewer.perms) && gate.viewer.userId !== userId) {
    return NextResponse.json({ error: "directory_off" }, { status: 403, headers: NO_STORE })
  }
  const member = await memberProfile(db, gate.community, userId, { ...accessOf(gate.viewer), userId: gate.viewer.userId })
  if (!member) return NextResponse.json({ error: "not_found" }, { status: 404, headers: NO_STORE })
  return NextResponse.json({ member }, { headers: NO_STORE })
}
