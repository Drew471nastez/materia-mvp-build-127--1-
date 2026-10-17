import { NextResponse } from "next/server"
import { rateLimit, LIMITS } from "@/lib/api/rate-limit"
import { requireCommunitiesOn } from "@/lib/communities/flag"
import { loadCommunity, viewerContext } from "@/lib/communities/server/context"
import { admin } from "@/lib/communities/server/db"
import { communityMembershipView, type PersonRef } from "@/lib/communities/server/membership-lifecycle"
import { applyPlanChange, planChoices, previewPlanChange } from "@/lib/communities/server/plan-change"
import { createClient } from "@/lib/supabase/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const NO_STORE = { "Cache-Control": "no-store" }

type Params = { params: Promise<{ communityId: string }> }

/**
 * /api/community/<communityId>/membership/plan (round AF)
 *
 *   GET   the plans the member can move to, theirs marked, and whether a
 *         change is possible now (lib/communities/server/plan-change.ts)
 *   POST  { tierId, interval, confirm?: false }  what it would cost: due
 *         now, credit, the next charge, from Stripe's invoice preview
 *   POST  { tierId, interval, confirm: true }    makes the change, then
 *         answers the Membership page's view as it now is
 *
 * WHO. The person's own subscription to this community only, as the
 * membership route next door. viewerContext, not requireMember, for the same
 * reason: somebody whose access just changed can still see what they pay.
 */
async function person(): Promise<PersonRef | null> {
  const {
    data: { user },
  } = await (await createClient()).auth.getUser()
  if (!user) return null
  return { id: user.id, email: user.email ? user.email.trim().toLowerCase() : null, emailConfirmed: Boolean(user.email_confirmed_at || (user as { confirmed_at?: string | null }).confirmed_at) }
}

export async function GET(_request: Request, { params }: Params) {
  const off = await requireCommunitiesOn()
  if (off) return off
  const { communityId } = await params
  const who = await person()
  if (!who) return NextResponse.json({ error: "sign_in" }, { status: 401, headers: NO_STORE })
  const db = admin()
  const community = await loadCommunity(db, { id: communityId })
  if (!community) return NextResponse.json({ error: "not_found" }, { status: 404, headers: NO_STORE })
  await viewerContext(db, community, who.id)
  const choices = await planChoices(db, community, who)
  if (!choices.ok) return NextResponse.json({ error: choices.message, code: choices.error }, { status: choices.status, headers: NO_STORE })
  return NextResponse.json({ choices: choices.value }, { headers: NO_STORE })
}

export async function POST(request: Request, { params }: Params) {
  const off = await requireCommunitiesOn()
  if (off) return off
  const { communityId } = await params
  const who = await person()
  if (!who) return NextResponse.json({ error: "sign_in" }, { status: 401, headers: NO_STORE })
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const confirm = body.confirm === true
  const limited = await rateLimit({
    bucket: confirm ? "membership-manage" : "membership-plan-preview",
    subjects: [`user:${who.id}`],
    /* A preview is asked each time the member taps another plan or interval: more room than for the change itself. */
    windows: confirm ? LIMITS.payment : [{ limit: 60, seconds: 600 }],
    message: "That is a lot of changes. Try again in a few minutes.",
  })
  if (limited) return limited
  const db = admin()
  const community = await loadCommunity(db, { id: communityId })
  if (!community) return NextResponse.json({ error: "not_found" }, { status: 404, headers: NO_STORE })
  await viewerContext(db, community, who.id)
  const input = { tierId: body.tierId, interval: body.interval }
  if (!confirm) {
    const preview = await previewPlanChange(db, community, who, input)
    if (!preview.ok) return NextResponse.json({ error: preview.message, code: preview.error }, { status: preview.status, headers: NO_STORE })
    return NextResponse.json({ preview: preview.value }, { headers: NO_STORE })
  }
  const done = await applyPlanChange(db, community, who, input)
  if (!done.ok) return NextResponse.json({ error: done.message, code: done.error }, { status: done.status, headers: NO_STORE })
  const membership = await communityMembershipView(db, community, who)
  return NextResponse.json({ changed: done.value, membership }, { headers: NO_STORE })
}
