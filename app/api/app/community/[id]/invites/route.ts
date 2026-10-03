import { NextResponse } from "next/server"
import { requireCommunitiesOn } from "@/lib/communities/flag"
import { requireCreatorCommunity } from "@/lib/communities/server/context"
import { noStore, readJson } from "@/lib/email-campaigns/route-auth"
import { emailSubject, rateLimit } from "@/lib/api/rate-limit"
import { RATE_LIMITS, rateBucket } from "@/lib/communities/limits"
import { createInvite, listInvites } from "@/lib/communities/server/invites"
import { checkInvite } from "@/components/community/creator/logic"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Params = { params: Promise<{ id: string }> }

/**
 * GET  /api/app/community/<id>/invites?cursor= -> { rows, next }
 * POST /api/app/community/<id>/invites { email?, maxUses?, expiresInDays?, tierId? }
 *      -> { invite (with its url, shown this once), sent }. With an email it
 *      is for that address and is emailed; without, it is a link to share.
 */
export async function GET(request: Request, { params }: Params) {
  const off = await requireCommunitiesOn()
  if (off) return off
  const { id } = await params
  const gate = await requireCreatorCommunity(id, "invite")
  if (gate instanceof NextResponse) return gate
  return NextResponse.json(await listInvites(gate.ctx.admin, gate.community.id, new URL(request.url).searchParams.get("cursor")), { headers: noStore })
}

export async function POST(request: Request, { params }: Params) {
  const off = await requireCommunitiesOn()
  if (off) return off
  const { id } = await params
  const gate = await requireCreatorCommunity(id, "invite")
  if (gate instanceof NextResponse) return gate
  if (gate.community.status === "archived" || gate.community.archived_at) return NextResponse.json({ error: "archived" }, { status: 403, headers: noStore })
  const checked = checkInvite(await readJson(request))
  if (!checked.ok) return NextResponse.json({ error: checked.error, field: checked.field }, { status: 400, headers: noStore })
  const limited = await rateLimit({
    bucket: rateBucket("invite"),
    subjects: [`user:${gate.ctx.userId}`, checked.value.email ? emailSubject(checked.value.email) : null],
    windows: RATE_LIMITS.invite,
    message: "That is a lot of invites for one day. Try again tomorrow.",
  })
  if (limited) return limited
  const { data: me } = await gate.ctx.admin.from("profiles").select("display_name, username").eq("id", gate.ctx.userId).maybeSingle()
  const inviterName = me?.display_name || (me?.username ? `@${me.username}` : "A creator")
  const made = await createInvite(gate.ctx.admin, { community: gate.community, createdBy: gate.ctx.userId, inviterName, input: checked.value })
  if (!made.ok) return NextResponse.json({ error: made.error }, { status: made.status, headers: noStore })
  return NextResponse.json(made.made, { status: 201, headers: noStore })
}
