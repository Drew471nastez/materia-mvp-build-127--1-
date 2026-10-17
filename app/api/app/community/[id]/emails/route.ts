import { NextResponse, after } from "next/server"
import { requireCommunitiesOn } from "@/lib/communities/flag"
import { requireCreatorCommunity } from "@/lib/communities/server/context"
import { audit } from "@/lib/communities/server/audit"
import { manageLimit } from "@/lib/communities/server/creator"
import { broadcastInput, loadMemberEmails, startBroadcast } from "@/lib/communities/server/broadcasts"
import { loadEmailWords } from "@/lib/communities/server/email-templates"
import { noStore, readJson } from "@/lib/email-campaigns/route-auth"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

type Params = { params: Promise<{ id: string }> }

/**
 * EMAIL YOUR MEMBERS (round AG, lib/communities/server/broadcasts.ts).
 *
 * GET  /api/app/community/<id>/emails
 *      -> { emails: { ready, audience, nextAt, recent }, words: { ready, words } }
 * POST /api/app/community/<id>/emails  { subject, message }
 *      -> { broadcast, nextAt }. Settings permission (the owner and admins).
 *      429 with nextAt inside 24 hours of the last one. The job starts right
 *      after the answer; the communities cron carries on with it.
 */
export async function GET(_request: Request, { params }: Params) {
  const off = await requireCommunitiesOn()
  if (off) return off
  const { id } = await params
  const gate = await requireCreatorCommunity(id, "manage_settings")
  if (gate instanceof NextResponse) return gate
  const db = gate.ctx.admin
  const [emails, words] = await Promise.all([loadMemberEmails(db, gate.community.id), loadEmailWords(db, gate.community.id)])
  return NextResponse.json({ emails, words }, { headers: noStore })
}

export async function POST(request: Request, { params }: Params) {
  const off = await requireCommunitiesOn()
  if (off) return off
  const { id } = await params
  const gate = await requireCreatorCommunity(id, "manage_settings")
  if (gate instanceof NextResponse) return gate
  if (gate.community.suspended_at || gate.community.status === "suspended") return NextResponse.json({ error: "This community is suspended, so it cannot email its members." }, { status: 403, headers: noStore })
  const limited = await manageLimit(gate.ctx.userId)
  if (limited) return limited
  const input = broadcastInput(await readJson(request))
  if ("error" in input) return NextResponse.json(input, { status: 400, headers: noStore })
  const db = gate.ctx.admin
  const started = await startBroadcast(db, { communityId: gate.community.id, authorId: gate.ctx.userId, subject: input.subject, message: input.message })
  if ("error" in started) return NextResponse.json({ error: started.error, nextAt: started.nextAt ?? null }, { status: started.status, headers: noStore })
  await audit(db, {
    communityId: gate.community.id,
    actorId: gate.ctx.userId,
    actorKind: "member",
    action: "community.broadcast_sent",
    targetType: "community",
    targetId: gate.community.id,
    targetLabel: gate.community.name,
    reason: `Emailed members: ${input.subject}`.slice(0, 200),
    detail: { broadcastId: started.broadcast.id },
  })
  /* Start sending now rather than at the next cron run. */
  after(async () => {
    try {
      const { runCommunityJobs } = await import("@/lib/communities/server/notify")
      await runCommunityJobs(db, { budgetMs: 45_000, kinds: ["fanout_announcement"] })
    } catch {
      /* the communities cron carries on with it */
    }
  })
  return NextResponse.json({ broadcast: started.broadcast, nextAt: started.nextAt }, { headers: noStore })
}
