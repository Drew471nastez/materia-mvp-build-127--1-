import { NextResponse } from "next/server"
import { requireCommunitiesOn } from "@/lib/communities/flag"
import { requireCreatorCommunity } from "@/lib/communities/server/context"
import { noStore, readJson } from "@/lib/email-campaigns/route-auth"
import { manageLimit } from "@/lib/communities/server/creator"
import { directReady } from "@/lib/communities/server/direct"
import { readOnboardingConfig, saveOnboardingConfig } from "@/lib/communities/server/onboarding-checklist"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Params = { params: Promise<{ id: string }> }

/**
 * GET /api/app/community/<id>/onboarding -> { ready, config, messages }
 * PUT /api/app/community/<id>/onboarding { steps, dmEnabled, dmBody } -> { config }
 *
 * Settings › Features › First steps (round 32): the list a new member sees
 * and the welcome message sent to them. manage_settings. `ready` is false
 * until run-now part 190; `messages` says whether a welcome message can be
 * sent at all (Chat on and part 83).
 */
export async function GET(_request: Request, { params }: Params) {
  const off = await requireCommunitiesOn()
  if (off) return off
  const { id } = await params
  const gate = await requireCreatorCommunity(id, "manage_settings")
  if (gate instanceof NextResponse) return gate
  const db = gate.ctx.admin
  const [state, messages] = await Promise.all([readOnboardingConfig(db, gate.community.id), directReady(db, gate.community)])
  return NextResponse.json({ ...state, messages }, { headers: noStore })
}

export async function PUT(request: Request, { params }: Params) {
  const off = await requireCommunitiesOn()
  if (off) return off
  const { id } = await params
  const gate = await requireCreatorCommunity(id, "manage_settings")
  if (gate instanceof NextResponse) return gate
  const limited = await manageLimit(gate.ctx.userId)
  if (limited) return limited
  const saved = await saveOnboardingConfig(gate.ctx.admin, { communityId: gate.community.id, actorId: gate.ctx.userId, raw: await readJson(request) })
  if (!saved.ok) return NextResponse.json({ error: saved.error, index: saved.index }, { status: saved.status, headers: noStore })
  return NextResponse.json({ config: saved.config }, { headers: noStore })
}
