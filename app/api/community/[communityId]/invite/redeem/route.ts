import { NextResponse } from "next/server"
import { requireCommunitiesOn } from "@/lib/communities/flag"
import { admin } from "@/lib/communities/server/db"
import { joinRateLimit, redeemInvite } from "@/lib/communities/server/join"
import { guardInvite, joinAddressLimit } from "@/lib/communities/server/safety"
import { loadCommunity } from "@/lib/communities/server/context"
import { grantTicketOnJoin } from "@/lib/communities/server/jobs/event_ticket_invite"
import { createClient } from "@/lib/supabase/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const noStore = { "Cache-Control": "no-store" }

/**
 * POST /api/community/<communityId>/invite/redeem  { token }
 *
 * The raw token from an invite link (/community/<slug>/join?invite=<token>).
 * Only its sha256 is looked up, and only an invite of THIS community is
 * redeemed (public.community_redeem_invite counts the use atomically, once
 * per person).
 *
 * A LINK THAT CARRIES A PAID EVENT ({ event, et }, made by the event's own
 * invite route): once they are a member the free ticket is granted and the
 * url is the event's page, so they land where the invite was about. The
 * signature `et` is checked first, so an event cannot be added to somebody
 * else's invite link.
 *
 * Answers
 *   { state: "member", url, already }   in (already: they were a member)
 *   { state: "checkout", url }          an invite to a paid tier that is not
 *                                       complimentary: approved, now pay
 * An invite that cannot be used is a 200 { ok: false, reason, message },
 * the database function's own shape, with reason not_found | revoked |
 * expired | email_mismatch | used_up: the invite landing
 * (components/community/member/invite-landing.tsx) says each in its own
 * words. Anything else is { error, message } with its status: 401 sign_in,
 * 403 banned | suspended | archived, 404 not_found (no such community).
 */
const INVITE_REASONS = new Set(["not_found", "revoked", "expired", "email_mismatch", "used_up"])
export async function POST(request: Request, { params }: { params: Promise<{ communityId: string }> }) {
  const off = await requireCommunitiesOn()
  if (off) return off
  const { communityId } = await params
  const {
    data: { user },
  } = await (await createClient()).auth.getUser()
  if (!user) return NextResponse.json({ error: "sign_in", message: "Sign in to use this invite." }, { status: 401, headers: noStore })
  const limited = (await joinRateLimit(user.id)) ?? (await joinAddressLimit(request))
  if (limited) return limited
  let body: Record<string, unknown> = {}
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    body = {}
  }
  const answer = await guardInvite(request, user.id, () => redeemInvite(admin(), communityId, user.id, body.token))
  if (!answer.ok) {
    /* The invite itself said no (and the community is real): the reason, for the landing to put in words. */
    if (INVITE_REASONS.has(answer.error) && answer.status !== 404) return NextResponse.json({ ok: false, reason: answer.error, message: answer.message }, { headers: noStore })
    return NextResponse.json({ error: answer.error, message: answer.message }, { status: answer.status, headers: noStore })
  }
  if (answer.state !== "member") return NextResponse.json({ ok: true, state: "checkout", url: answer.url }, { headers: noStore })
  /* The invite was for one paid event: the seat is theirs, and the event's page is where they land. */
  let url = answer.url
  const community = body.event ? await loadCommunity(admin(), { id: communityId }) : null
  if (community) {
    const ticket = await grantTicketOnJoin(admin(), { community, userId: user.id, token: body.token, eventId: body.event, tag: body.et, enabled: true })
    if (ticket) url = ticket.url
  }
  return NextResponse.json({ ok: true, state: "member", url, already: answer.already }, { headers: noStore })
}
