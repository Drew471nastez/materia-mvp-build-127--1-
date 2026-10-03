import { NextResponse } from "next/server"
import { rateLimit } from "@/lib/api/rate-limit"
import { requireCommunitiesOn } from "@/lib/communities/flag"
import { RATE_LIMITS, rateBucket } from "@/lib/communities/limits"
import { requireMember } from "@/lib/communities/server/context"
import { admin } from "@/lib/communities/server/db"
import { NO_STORE, memberSubject, readJson, sessionUserId } from "@/lib/communities/server/feed"
import { checkReport, createReport } from "@/lib/communities/server/reports"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Params = { params: Promise<{ communityId: string }> }

/**
 * POST { targetType: "post"|"comment"|"message"|"member", targetId, reason, note? }
 * Answers { ok, already }. 10 reports an hour per member.
 */
export async function POST(request: Request, { params }: Params) {
  const off = await requireCommunitiesOn()
  if (off) return off
  const { communityId } = await params
  const db = admin()
  const gate = await requireMember(db, communityId, await sessionUserId(), "report")
  if (gate instanceof NextResponse) return gate
  const limited = await rateLimit({
    bucket: rateBucket("report"),
    subjects: [memberSubject(String(gate.viewer.userId))],
    windows: RATE_LIMITS.report,
    message: "You have sent a lot of reports. The moderators will get to them; try again later.",
  })
  if (limited) return limited
  const input = checkReport(await readJson(request))
  if (!input.ok) return NextResponse.json({ error: input.error }, { status: input.status ?? 400, headers: NO_STORE })
  const result = await createReport({ db, community: gate.community, viewer: gate.viewer }, input.value)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status ?? 400, headers: NO_STORE })
  return NextResponse.json({ ok: true, already: result.value.already }, { headers: NO_STORE })
}
