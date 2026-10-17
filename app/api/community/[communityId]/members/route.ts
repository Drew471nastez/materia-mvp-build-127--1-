import { NextResponse } from "next/server"
import { requireCommunitiesOn } from "@/lib/communities/flag"
import { can } from "@/lib/communities/permissions"
import { ROLES, isOneOf } from "@/lib/communities/types"
import { requireMember } from "@/lib/communities/server/context"
import { admin } from "@/lib/communities/server/db"
import { listMembers } from "@/lib/communities/server/directory"
import { NO_STORE, sessionUserId } from "@/lib/communities/server/feed"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Params = { params: Promise<{ communityId: string }> }

/**
 * GET ?q=&role=&level=&country=&cursor=&limit=: { members, nextCursor }, active
 * members newest first. Names, pictures, roles and levels only; never an
 * email or how anyone pays. With the directory switched off only staff
 * (manage_members) list members, except a short name search (limit <= 8) so
 * @ mentions still find people.
 */
export async function GET(request: Request, { params }: Params) {
  const off = await requireCommunitiesOn()
  if (off) return off
  const { communityId } = await params
  const db = admin()
  const gate = await requireMember(db, communityId, await sessionUserId(), "view")
  if (gate instanceof NextResponse) return gate
  const sp = new URL(request.url).searchParams
  const limit = Math.max(1, Math.min(50, Number(sp.get("limit")) || 30))
  const q = sp.get("q") ?? ""
  const mentionLookup = limit <= 8 && q.trim().length > 0
  if (!gate.community.directory_enabled && !can(gate.viewer.role, "manage_members", gate.viewer.perms) && !mentionLookup) {
    return NextResponse.json({ error: "directory_off" }, { status: 403, headers: NO_STORE })
  }
  const role = sp.get("role")
  const page = await listMembers(db, gate.community.id, {
    q,
    role: isOneOf(ROLES, role) ? role : null,
    level: Number(sp.get("level")) || null,
    cursor: sp.get("cursor"),
    limit,
    /* Round 12: members from one country (a two letter code; anything else is no filter). */
    country: sp.get("country"),
  })
  return NextResponse.json(page, { headers: NO_STORE })
}
