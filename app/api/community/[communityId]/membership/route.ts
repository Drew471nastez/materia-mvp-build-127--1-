import { NextResponse } from "next/server"
import { rateLimit, LIMITS } from "@/lib/api/rate-limit"
import { requireCommunitiesOn } from "@/lib/communities/flag"
import { parseCancelReason } from "@/lib/communities/membership-policy"
import { loadCommunity, viewerContext } from "@/lib/communities/server/context"
import { admin } from "@/lib/communities/server/db"
import { changeCommunityMembership, communityMembershipView, type PersonRef } from "@/lib/communities/server/membership-lifecycle"
import { routeUser, signedOutOrRetry } from "@/lib/auth/route-user"
import { provenViewer } from "@/lib/memberships/viewer"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const NO_STORE = { "Cache-Control": "no-store" }

type Params = { params: Promise<{ communityId: string }> }

/**
 * /api/community/<communityId>/membership (round 13, ask 39)
 *
 *   GET   the signed in person's paid membership of this community, as the
 *         Membership page shows it (lib/communities/membership-policy.ts
 *         CommunityMembershipView): status, renewal or end date, price,
 *         what can be done, the refund policy and how to reach the owner.
 *   POST  { action: "cancel", reason?, note? } stops it renewing at the end
 *         of the period paid for; { action: "resume" } undoes that before
 *         then. Answers { membership } as Stripe now has it.
 *
 * WHO. Only the person's own subscription, found by their account or the
 * confirmed address they paid with, and only a subscription to a product
 * this community sells. viewerContext, not requireMember: somebody banned or
 * muted in the community (or whose access just ran out) must still be able
 * to see and stop what they pay for. Rate limited like /account's Manage.
 */
/* Round rel2-auth: Supabase Auth itself, as the getUser() this replaced (`fresh`, with email_confirmed_at). A refusal says 503 Try again when Auth did not answer (signedOutOrRetry). */
async function person(): Promise<PersonRef | null> {
  const asked = await routeUser({ fresh: true })
  const user = asked.kind === "user" ? asked.user : null
  if (!user) return null
  /*
    THE ADDRESS ONLY WHEN THIS ACCOUNT PROVED IT (lib/memberships/viewer provenViewer). Supabase stamps
    email_confirmed_at with nothing proven, and an account can point its sign in email at anybody's: read as
    confirmed, it found a stranger's guest subscription by its address, and could cancel it or move it to a dearer
    plan charged to their card. Unproven, the subscription is reached by its own account only.
  */
  return provenViewer({ id: user.id, email: user.email ? user.email.trim().toLowerCase() : null, emailConfirmed: Boolean(user.email_confirmed_at || (user as { confirmed_at?: string | null }).confirmed_at) })
}

export async function GET(_request: Request, { params }: Params) {
  const off = await requireCommunitiesOn()
  if (off) return off
  const { communityId } = await params
  const who = await person()
  if (!who) return signedOutOrRetry(NextResponse.json({ error: "sign_in" }, { status: 401, headers: NO_STORE }), { fresh: true })
  const db = admin()
  const community = await loadCommunity(db, { id: communityId })
  if (!community) return NextResponse.json({ error: "not_found" }, { status: 404, headers: NO_STORE })
  /* Who they are here, and their row brought in step with what they pay for (cheap, as on every visit). */
  await viewerContext(db, community, who.id)
  const membership = await communityMembershipView(db, community, who)
  return NextResponse.json({ membership }, { headers: NO_STORE })
}

export async function POST(request: Request, { params }: Params) {
  const off = await requireCommunitiesOn()
  if (off) return off
  const { communityId } = await params
  const who = await person()
  if (!who) return signedOutOrRetry(NextResponse.json({ error: "sign_in" }, { status: 401, headers: NO_STORE }), { fresh: true })
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const action = body.action === "cancel" || body.action === "resume" ? body.action : null
  if (!action) return NextResponse.json({ error: "Unknown action." }, { status: 400, headers: NO_STORE })
  const limited = await rateLimit({ bucket: "membership-manage", subjects: [`user:${who.id}`], windows: LIMITS.payment, message: "That is a lot of changes. Try again in a few minutes." })
  if (limited) return limited
  const db = admin()
  const community = await loadCommunity(db, { id: communityId })
  if (!community) return NextResponse.json({ error: "not_found" }, { status: 404, headers: NO_STORE })
  await viewerContext(db, community, who.id)
  const done = await changeCommunityMembership(db, { communityId: community.id, person: who, action, why: action === "cancel" ? parseCancelReason(body) : null })
  if (!done.ok) return NextResponse.json({ error: done.message, code: done.error }, { status: done.status, headers: NO_STORE })
  const membership = await communityMembershipView(db, community, who)
  return NextResponse.json({ membership }, { headers: NO_STORE })
}
