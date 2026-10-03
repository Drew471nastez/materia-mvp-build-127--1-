import { NextResponse } from "next/server"
import { rateLimit } from "@/lib/api/rate-limit"
import { requireCommunitiesOn } from "@/lib/communities/flag"
import { RATE_LIMITS, rateBucket } from "@/lib/communities/limits"
import { requireMember } from "@/lib/communities/server/context"
import { admin } from "@/lib/communities/server/db"
import { checkMe, updateMe } from "@/lib/communities/server/directory"
import { NO_STORE, memberSubject, readJson, sessionUserId } from "@/lib/communities/server/feed"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Params = { params: Promise<{ communityId: string }> }

/**
 * PATCH { notifyLevel?, emailAnnouncements?, emailEvents?, bio?, onboarded?: true }
 * The member's own settings in this community. Answers { ok }.
 */
export async function PATCH(request: Request, { params }: Params) {
  const off = await requireCommunitiesOn()
  if (off) return off
  const { communityId } = await params
  const db = admin()
  const gate = await requireMember(db, communityId, await sessionUserId(), "view")
  if (gate instanceof NextResponse) return gate
  const limited = await rateLimit({ bucket: rateBucket("comment"), subjects: [memberSubject(String(gate.viewer.userId))], windows: RATE_LIMITS.comment })
  if (limited) return limited
  const patch = checkMe(await readJson(request))
  if (!patch.ok) return NextResponse.json({ error: patch.error }, { status: 400, headers: NO_STORE })
  const saved = await updateMe(db, gate.community.id, String(gate.viewer.userId), patch.value)
  if (!saved) return NextResponse.json({ error: "That did not save. Try again." }, { status: 500, headers: NO_STORE })
  return NextResponse.json({ ok: true }, { headers: NO_STORE })
}
