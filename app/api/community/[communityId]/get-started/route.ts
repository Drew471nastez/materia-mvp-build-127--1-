import { NextResponse } from "next/server"
import { requireCommunitiesOn } from "@/lib/communities/flag"
import { requireMember } from "@/lib/communities/server/context"
import { admin } from "@/lib/communities/server/db"
import { NO_STORE, readJson, sessionUserId } from "@/lib/communities/server/feed"
import { rateLimit } from "@/lib/api/rate-limit"
import { markStep, memberChecklist } from "@/lib/communities/server/onboarding-checklist"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Params = { params: Promise<{ communityId: string }> }

/**
 * GET  /api/community/<id>/get-started -> { checklist: { items, done, total } | null }
 *      The signed in member's first steps (round 32), or null when there is
 *      nothing to show them (lib/communities/server/onboarding-checklist.ts).
 * POST /api/community/<id>/get-started { step } -> { ok }
 *      A step they opened or ticked; { step: "dismissed" } hides the list.
 * Active members only, for themselves: the session decides whose list it is.
 */
export async function GET(_request: Request, { params }: Params) {
  const off = await requireCommunitiesOn()
  if (off) return off
  const { communityId } = await params
  const db = admin()
  const gate = await requireMember(db, communityId, await sessionUserId(), "view")
  if (gate instanceof NextResponse) return gate
  return NextResponse.json({ checklist: await memberChecklist(db, gate.community, gate.viewer) }, { headers: NO_STORE })
}

export async function POST(request: Request, { params }: Params) {
  const off = await requireCommunitiesOn()
  if (off) return off
  const { communityId } = await params
  const db = admin()
  const gate = await requireMember(db, communityId, await sessionUserId(), "view")
  if (gate instanceof NextResponse) return gate
  const limited = await rateLimit({ bucket: "community-first-steps", subjects: [`user:${gate.viewer.userId}`], windows: [{ limit: 60, seconds: 600 }], message: "That is a lot of steps at once. Try again in a few minutes." })
  if (limited) return limited
  const body = await readJson(request)
  const done = await markStep(db, gate.community, gate.viewer, body.step)
  if (!done.ok) return NextResponse.json({ error: done.error }, { status: done.status, headers: NO_STORE })
  return NextResponse.json({ ok: true }, { headers: NO_STORE })
}
