import { NextResponse } from "next/server"
import { requireCommunitiesOn } from "@/lib/communities/flag"
import { requireCreatorCommunity } from "@/lib/communities/server/context"
import { noStore, readJson } from "@/lib/email-campaigns/route-auth"
import { rateLimit } from "@/lib/api/rate-limit"
import { inviteList } from "@/lib/communities/server/bulk-invites"
import { isUuid } from "@/components/community/creator/logic"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

type Params = { params: Promise<{ id: string }> }

/**
 * POST /api/app/community/<id>/invites/bulk { text, tierId? }
 *   -> { found, result: { sent, members, recent, failed, limited } }
 *
 * Members › Invite a list (round 32): the addresses in `text` (pasted, or a
 * CSV file read in the browser), each sent an email invite
 * (lib/communities/server/bulk-invites.ts). The invite permission; ten lists
 * an hour per person, and the community's own 500 a day.
 */
export async function POST(request: Request, { params }: Params) {
  const off = await requireCommunitiesOn()
  if (off) return off
  const { id } = await params
  const gate = await requireCreatorCommunity(id, "invite")
  if (gate instanceof NextResponse) return gate
  if (gate.community.status === "archived" || gate.community.archived_at) return NextResponse.json({ error: "archived" }, { status: 403, headers: noStore })
  const limited = await rateLimit({ bucket: "community-invite-list", subjects: [`user:${gate.ctx.userId}`], windows: [{ limit: 10, seconds: 3600 }], message: "That is a lot of lists in an hour. Try again later." })
  if (limited) return limited
  const body = await readJson(request)
  const { data: me } = await gate.ctx.admin.from("profiles").select("display_name, username").eq("id", gate.ctx.userId).maybeSingle()
  const inviterName = me?.display_name || (me?.username ? `@${me.username}` : "A creator")
  const done = await inviteList(gate.ctx.admin, { community: gate.community, actorId: gate.ctx.userId, inviterName, text: body.text, tierId: isUuid(body.tierId) ? body.tierId : null })
  if (!done.ok) return NextResponse.json({ error: done.error }, { status: done.status, headers: noStore })
  return NextResponse.json({ found: done.found, result: done.result }, { headers: noStore })
}
