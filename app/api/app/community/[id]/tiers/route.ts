import { NextResponse } from "next/server"
import { requireCommunitiesOn } from "@/lib/communities/flag"
import { requireCreatorCommunity } from "@/lib/communities/server/context"
import { noStore, readJson } from "@/lib/email-campaigns/route-auth"
import { manageLimit } from "@/lib/communities/server/creator"
import { createFreeTier, createPaidTier, loadTiers } from "@/lib/communities/server/tiers"
import { checkPrice } from "@/components/community/creator/logic"
import { LENGTHS } from "@/lib/communities/limits"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Params = { params: Promise<{ id: string }> }

/**
 * GET  /api/app/community/<id>/tiers -> { tiers }
 * POST /api/app/community/<id>/tiers { kind: "paid" | "free", name, description?, price?, interval? }
 *      A paid tier is sold by a membership product (monthly or yearly) or a
 *      one time community product (lib/communities/server/tiers.ts). The owner only.
 */
export async function GET(_request: Request, { params }: Params) {
  const off = await requireCommunitiesOn()
  if (off) return off
  const { id } = await params
  const gate = await requireCreatorCommunity(id, "manage_settings")
  if (gate instanceof NextResponse) return gate
  return NextResponse.json({ tiers: await loadTiers(gate.ctx.admin, gate.community.id) }, { headers: noStore })
}

export async function POST(request: Request, { params }: Params) {
  const off = await requireCommunitiesOn()
  if (off) return off
  const { id } = await params
  const gate = await requireCreatorCommunity(id, "manage_pricing")
  if (gate instanceof NextResponse) return gate
  const limited = await manageLimit(gate.ctx.userId)
  if (limited) return limited
  const body = await readJson(request)
  const name = typeof body.name === "string" ? body.name.replace(/\s+/g, " ").trim() : ""
  if (!name || name.length > LENGTHS.tierName.max) return NextResponse.json({ error: `A tier name is 1 to ${LENGTHS.tierName.max} characters.`, field: "name" }, { status: 400, headers: noStore })
  const description = typeof body.description === "string" ? body.description.trim().slice(0, LENGTHS.tierDescription.max) || null : null
  const db = gate.ctx.admin
  if (body.kind === "free") {
    const made = await createFreeTier(db, { community: gate.community, name, description, actorId: gate.ctx.userId })
    if (!made.ok) return NextResponse.json({ error: made.error }, { status: made.status, headers: noStore })
    return NextResponse.json({ tierId: made.tierId }, { status: 201, headers: noStore })
  }
  const price = checkPrice(body.price, body.interval)
  if (!price.ok) return NextResponse.json({ error: price.error, field: price.field }, { status: 400, headers: noStore })
  const made = await createPaidTier(db, { creatorId: gate.ctx.creatorId, community: gate.community, name, description, interval: price.value.interval, cents: price.value.cents, actorId: gate.ctx.userId })
  if (!made.ok) return NextResponse.json({ error: made.error, field: made.field }, { status: made.status, headers: noStore })
  return NextResponse.json({ tierId: made.tierId, productId: made.productId }, { status: 201, headers: noStore })
}
