import { NextResponse } from "next/server"
import { requireCommunitiesOn } from "@/lib/communities/flag"
import { requireCreatorCommunity } from "@/lib/communities/server/context"
import { noStore, readJson } from "@/lib/email-campaigns/route-auth"
import { can } from "@/lib/communities/permissions"
import { audit } from "@/lib/communities/server/audit"
import { manageLimit } from "@/lib/communities/server/creator"
import { answersCsv, listJoinRequests, readJoinForm } from "@/lib/communities/server/join-questions"
import { actOnMember } from "@/lib/communities/server/moderation"
import { APPROVE_MANY, isUuid } from "@/components/community/creator/logic"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

type Params = { params: Promise<{ id: string }> }

/**
 * GET /api/app/community/<id>/join-requests -> { rows, total, questions, ready }
 *      The people waiting for approval, newest first, with what they
 *      answered (round 32). Whoever may approve requests (approve_member);
 *      emails only for the owner and admins (manage_members), as Members.
 *      Approving and declining are PATCH members/<userId> { action:
 *      approve | reject }, the same as Members.
 * POST { action: "approve", userIds: [...] } -> { approved: [...], failed: [{ userId, error }] }
 *      Approve all, in one request of at most APPROVE_MANY ids (the screen sends the rest in more). Each one goes
 *      through actOnMember, exactly as PATCH members/<userId> { action: "approve" }: the approve_member permission,
 *      the rank check and the audit line, per person.
 * GET  ?format=csv
 *      Every answer kept, as CSV (the owner and admins, manage_members),
 *      written to the audit log.
 */
export async function GET(request: Request, { params }: Params) {
  const off = await requireCommunitiesOn()
  if (off) return off
  const { id } = await params
  const csv = new URL(request.url).searchParams.get("format") === "csv"
  const gate = await requireCreatorCommunity(id, csv ? "manage_members" : "approve_member")
  if (gate instanceof NextResponse) return gate
  const db = gate.ctx.admin
  if (csv) {
    const limited = await manageLimit(gate.ctx.userId)
    if (limited) return limited
    await audit(db, { communityId: gate.community.id, actorId: gate.ctx.userId, actorKind: "member", action: "join_answers.exported", targetType: "community", targetId: gate.community.id })
    const day = new Date().toISOString().slice(0, 10)
    return new Response(await answersCsv(db, gate.community.id, { withEmail: true }), {
      headers: { ...noStore, "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${gate.community.slug}-answers-${day}.csv"` },
    })
  }
  const withEmail = can(gate.role, "manage_members", gate.viewer.perms)
  const [list, form] = await Promise.all([listJoinRequests(db, gate.community.id, { withEmail }), readJoinForm(db, gate.community.id)])
  return NextResponse.json({ ...list, questions: form.questions, ready: form.ready, approvalRequired: gate.community.approval_required, canExport: withEmail }, { headers: noStore })
}

export async function POST(request: Request, { params }: Params) {
  const off = await requireCommunitiesOn()
  if (off) return off
  const { id } = await params
  const body = await readJson(request)
  if (body.action !== "approve") return NextResponse.json({ error: "Unknown action." }, { status: 400, headers: noStore })
  const ids = Array.isArray(body.userIds) ? [...new Set(body.userIds.filter((x: unknown): x is string => typeof x === "string" && isUuid(x)))] : []
  if (!ids.length || ids.length > APPROVE_MANY) return NextResponse.json({ error: `Between 1 and ${APPROVE_MANY} requests at a time.` }, { status: 400, headers: noStore })
  const gate = await requireCreatorCommunity(id, "approve_member")
  if (gate instanceof NextResponse) return gate
  const limited = await manageLimit(gate.ctx.userId)
  if (limited) return limited
  const actor = { userId: gate.ctx.userId, role: gate.role, perms: gate.viewer.perms ?? null }
  const approved: string[] = []
  const failed: { userId: string; error: string }[] = []
  /* One at a time, as the screen used to send them: each approval writes the member, the audit line and a notification. */
  for (const userId of ids) {
    const done = await actOnMember(gate.ctx.admin, { community: gate.community, actor, action: "approve", userId, reason: null })
    if (done.ok) approved.push(userId)
    else failed.push({ userId, error: done.error })
  }
  return NextResponse.json({ approved, failed }, { headers: noStore })
}
