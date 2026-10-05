import { NextResponse, after } from "next/server"
import { requireCommunitiesOn } from "@/lib/communities/flag"
import { requireCreatorCommunity } from "@/lib/communities/server/context"
import { noStore, readJson } from "@/lib/email-campaigns/route-auth"
import { manageLimit } from "@/lib/communities/server/creator"
import { CONTENT_ACTIONS, CONTENT_TARGETS, actOnContent, contentActionNeeds, listReports, updateReport } from "@/lib/communities/server/moderation"
import { isOneOf } from "@/lib/communities/types"
import { announceModeration } from "@/lib/communities/server/realtime"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Params = { params: Promise<{ id: string }> }

/**
 * GET   /api/app/community/<id>/moderation?status=open|closed|...&cursor= -> { rows, next }: the report queue.
 * PATCH /api/app/community/<id>/moderation { id, status, resolution? }: a report reviewed, resolved or dismissed.
 * POST  /api/app/community/<id>/moderation { action, targetType, targetId, reason?, spaceId? }: act on a post,
 *       comment or message (the same rules as the member side's /api/community/<id>/moderation/act).
 */
export async function GET(request: Request, { params }: Params) {
  const off = await requireCommunitiesOn()
  if (off) return off
  const { id } = await params
  const gate = await requireCreatorCommunity(id, "review_reports")
  if (gate instanceof NextResponse) return gate
  const url = new URL(request.url)
  const status = url.searchParams.get("status") || "open"
  return NextResponse.json(await listReports(gate.ctx.admin, gate.community.id, { status: status as "open", cursor: url.searchParams.get("cursor") }), { headers: noStore })
}

export async function PATCH(request: Request, { params }: Params) {
  const off = await requireCommunitiesOn()
  if (off) return off
  const { id } = await params
  const gate = await requireCreatorCommunity(id, "review_reports")
  if (gate instanceof NextResponse) return gate
  const limited = await manageLimit(gate.ctx.userId)
  if (limited) return limited
  const body = await readJson(request)
  const done = await updateReport(gate.ctx.admin, { community: gate.community, actor: { userId: gate.ctx.userId, role: gate.role, perms: gate.viewer.perms ?? null }, id: String(body.id ?? ""), status: body.status, resolution: body.resolution })
  if (!done.ok) return NextResponse.json({ error: done.error }, { status: done.status, headers: noStore })
  return NextResponse.json({ ok: true }, { headers: noStore })
}

export async function POST(request: Request, { params }: Params) {
  const off = await requireCommunitiesOn()
  if (off) return off
  const { id } = await params
  const body = await readJson(request)
  if (!isOneOf(CONTENT_ACTIONS, body.action) || !isOneOf(CONTENT_TARGETS, body.targetType)) return NextResponse.json({ error: "Unknown action." }, { status: 400, headers: noStore })
  const gate = await requireCreatorCommunity(id, contentActionNeeds(body.action))
  if (gate instanceof NextResponse) return gate
  const limited = await manageLimit(gate.ctx.userId)
  if (limited) return limited
  const done = await actOnContent(gate.ctx.admin, {
    community: gate.community,
    actor: { userId: gate.ctx.userId, role: gate.role, perms: gate.viewer.perms ?? null },
    action: body.action,
    targetType: body.targetType,
    targetId: String(body.targetId ?? ""),
    reason: typeof body.reason === "string" ? body.reason : null,
    spaceId: typeof body.spaceId === "string" ? body.spaceId : null,
  })
  if (!done.ok) return NextResponse.json({ error: done.error }, { status: done.status, headers: noStore })
  after(() => announceModeration(gate.ctx.admin, gate.community.id, { type: body.targetType, id: String(body.targetId ?? ""), action: body.action }).catch(() => false))
  return NextResponse.json({ status: done.status }, { headers: noStore })
}
