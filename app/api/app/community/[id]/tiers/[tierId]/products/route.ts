import { NextResponse } from "next/server"
import { requireCommunitiesOn } from "@/lib/communities/flag"
import { requireCreatorCommunity } from "@/lib/communities/server/context"
import { noStore, readJson } from "@/lib/email-campaigns/route-auth"
import { manageLimit } from "@/lib/communities/server/creator"
import { setAccessProduct } from "@/lib/communities/server/tiers"
import { isUuid } from "@/components/community/creator/logic"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * POST /api/app/community/<id>/tiers/<tierId>/products  { productId, on: boolean }
 * Another of the creator's products that also gives this tier: whoever owns
 * it is let in (community_access_products). The owner only.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string; tierId: string }> }) {
  const off = await requireCommunitiesOn()
  if (off) return off
  const { id, tierId } = await params
  if (!isUuid(tierId)) return NextResponse.json({ error: "not_found" }, { status: 404, headers: noStore })
  const gate = await requireCreatorCommunity(id, "manage_pricing")
  if (gate instanceof NextResponse) return gate
  const limited = await manageLimit(gate.ctx.userId)
  if (limited) return limited
  const body = await readJson(request)
  if (!isUuid(body.productId) || typeof body.on !== "boolean") return NextResponse.json({ error: "Pick a product." }, { status: 400, headers: noStore })
  const done = await setAccessProduct(gate.ctx.admin, { creatorId: gate.ctx.creatorId, community: gate.community, tierId, productId: body.productId, on: body.on, actorId: gate.ctx.userId })
  if (!done.ok) return NextResponse.json({ error: done.error }, { status: done.status, headers: noStore })
  return NextResponse.json({ ok: true }, { headers: noStore })
}
