import { NextResponse } from "next/server"
import { requireCommunitiesOn } from "@/lib/communities/flag"
import { requireCreatorCommunity } from "@/lib/communities/server/context"
import { admin } from "@/lib/communities/server/db"
import { communityPayments } from "@/lib/communities/server/membership-lifecycle"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const NO_STORE = { "Cache-Control": "no-store" }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * GET /api/app/community/<id>/payments?userId=&before=  (round 13, ask 41)
 *
 * The community's payments (membership invoices and one time purchases are
 * orders), newest first, twenty at a time, optionally one member's. Money
 * stays with the owner: manage_pricing, which only the owner has. Answers
 * { payments: CommunityPayment[] } with the buyer's email (the owner's own
 * customers, as on Orders).
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const off = await requireCommunitiesOn()
  if (off) return off
  const { id } = await params
  const gate = await requireCreatorCommunity(id, "manage_pricing")
  if (gate instanceof NextResponse) return gate
  const url = new URL(request.url)
  const userId = url.searchParams.get("userId")
  const before = url.searchParams.get("before")
  const payments = await communityPayments(gate.ctx.admin ?? admin(), gate.community.id, {
    userId: userId && UUID.test(userId) ? userId : null,
    before: before && Number.isFinite(Date.parse(before)) ? new Date(before).toISOString() : null,
  })
  if (payments === null) return NextResponse.json({ error: "Payments could not be read. Try again." }, { status: 500, headers: NO_STORE })
  return NextResponse.json({ payments }, { headers: NO_STORE })
}
