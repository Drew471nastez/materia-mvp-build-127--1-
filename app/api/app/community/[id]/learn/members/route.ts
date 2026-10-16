import { NextResponse } from "next/server"
import { requireCommunitiesOn } from "@/lib/communities/flag"
import { requireCreatorCommunity } from "@/lib/communities/server/context"
import { noStore } from "@/lib/email-campaigns/route-auth"
import { listMembers } from "@/lib/communities/server/creator"
import { parseMemberQuery } from "@/components/community/creator/logic"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Params = { params: Promise<{ id: string }> }

/**
 * GET /api/app/community/<id>/learn/members?q= -> { rows: [{ userId, name, avatarUrl, username }] }
 * The picker of a private program (components/community/learn/program-editor.tsx): this
 * community's active members by name or handle, for whoever may manage Learn. Names and
 * pictures only, never an email. What is saved is checked again by updateProgram.
 */
export async function GET(request: Request, { params }: Params) {
  const off = await requireCommunitiesOn()
  if (off) return off
  const { id } = await params
  const gate = await requireCreatorCommunity(id, "manage_classroom")
  if (gate instanceof NextResponse) return gate
  const q = (new URL(request.url).searchParams.get("q") ?? "").slice(0, 80)
  const page = await listMembers(gate.ctx.admin, gate.community.id, parseMemberQuery({ status: "active", q }), { withEmail: false })
  const rows = page.rows.slice(0, 20).map((r) => ({ userId: r.userId, name: r.name, avatarUrl: r.avatarUrl, username: r.username }))
  return NextResponse.json({ rows }, { headers: noStore })
}
