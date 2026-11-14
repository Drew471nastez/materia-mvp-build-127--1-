import { NextResponse } from "next/server"
import { rateLimit, LIMITS } from "@/lib/api/rate-limit"
import { requireCommunitiesOn } from "@/lib/communities/flag"
import { requireCreatorCommunity } from "@/lib/communities/server/context"
import { admin } from "@/lib/communities/server/db"
import { refundCommunityPayment } from "@/lib/communities/server/membership-lifecycle"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const NO_STORE = { "Cache-Control": "no-store" }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * POST /api/app/community/<id>/refunds  { orderId, amountCents?, reason?, endMembership? }  (round 13, ask 41)
 *
 * The owner refunds one payment of this community, in full (no amount) or
 * in part, through Stripe exactly as Orders does (a destination charge
 * refund that takes the creator's share back from their connected account,
 * under the same idempotency key), and the member is emailed once. With
 * endMembership a membership's subscription also ends now. Only the owner
 * (manage_pricing), and only as the creator account the payment went to.
 * Answers { refund: { refundId, status, amountCents, full, pending, emailed,
 * endedMembership } }.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const off = await requireCommunitiesOn()
  if (off) return off
  const { id } = await params
  const gate = await requireCreatorCommunity(id, "manage_pricing")
  if (gate instanceof NextResponse) return gate
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const orderId = typeof body.orderId === "string" && UUID.test(body.orderId) ? body.orderId : null
  if (!orderId) return NextResponse.json({ error: "Choose a payment to refund." }, { status: 400, headers: NO_STORE })
  const limited = await rateLimit({ bucket: "community-refund", subjects: [`user:${gate.ctx.userId}`, `order:${orderId}`], windows: LIMITS.payment, message: "That is a lot of refunds at once. Try again in a few minutes." })
  if (limited) return limited
  const done = await refundCommunityPayment(gate.ctx.admin ?? admin(), {
    communityId: gate.community.id,
    communityName: gate.community.name,
    creatorId: gate.ctx.creatorId,
    actorUserId: gate.ctx.userId,
    orderId,
    amountCents: body.amountCents,
    /* What the dialog showed as left: a press sent again after its refund went through is refused, never made twice (lib/orders/refund-state). */
    refundableCents: body.refundableCents,
    reason: body.reason,
    endMembership: body.endMembership === true,
  })
  if (!done.ok) return NextResponse.json({ error: done.message, code: done.error, ...(done.detail ?? {}) }, { status: done.status, headers: NO_STORE })
  return NextResponse.json({ refund: done.value }, { headers: NO_STORE })
}
