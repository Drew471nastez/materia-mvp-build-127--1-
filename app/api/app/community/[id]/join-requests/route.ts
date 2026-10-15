import { NextResponse } from "next/server"
import { requireCommunitiesOn } from "@/lib/communities/flag"
import { requireCreatorCommunity } from "@/lib/communities/server/context"
import { noStore } from "@/lib/email-campaigns/route-auth"
import { can } from "@/lib/communities/permissions"
import { audit } from "@/lib/communities/server/audit"
import { manageLimit } from "@/lib/communities/server/creator"
import { answersCsv, listJoinRequests, readJoinForm } from "@/lib/communities/server/join-questions"

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
