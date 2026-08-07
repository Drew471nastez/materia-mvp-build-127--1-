import { NextResponse, type NextRequest } from "next/server"

import { requireVerifiedUser } from "@/lib/auth/current-user"
import { createAwbForOrder } from "@/lib/shipping/create-awb"
import { resolveOrderParty } from "@/lib/shipping/order-access"
import { createClient } from "@/lib/supabase/server"

/**
 * ===========================================================================
 *  THE SELLER BOOKS THE COURIER FOR THEIR OWN SALE
 * ===========================================================================
 *   POST /api/shipping/order/<uuid>/awb
 *
 * This is the only route in the application where a NON-ADMIN can cause money
 * to be spent, so it is worth being explicit about why that is acceptable and
 * what bounds it.
 *
 * It is acceptable because it is the product: on a marketplace the seller ships
 * the item, and the label is the thing they need in order to do that. Making
 * them wait for an operator to press a button in an admin panel is not a
 * marketplace.
 *
 * What bounds it:
 *
 *  - IDENTITY. The caller must be the verified seller of THIS order, proven by
 *    walking products.creator_id → creators.user_id. Not a claim in the body.
 *  - A PAID ORDER. `createAwbForOrder` refuses anything not already paid, so a
 *    seller cannot conjure a shipment out of an unpaid or cancelled order.
 *  - IDEMPOTENCY. The same three guards as every other caller: read-first, a
 *    conditional claim, and a unique index. Ten taps produce one AWB.
 *  - A REAL DESTINATION. Refused until the buyer has chosen a locker, so the
 *    seller cannot spend the platform's balance on a parcel with nowhere to go.
 *
 * The seller chooses nothing about the shipment — not the carrier, not the
 * service, not the weight. Those come from configuration, so the body of this
 * request cannot influence what is bought; it has no parameters at all.
 */

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(_req: NextRequest, ctx: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await ctx.params
  if (!UUID_RE.test(orderId)) {
    return NextResponse.json({ ok: false, code: "bad_order_id" }, { status: 400 })
  }

  const supabase = await createClient()
  const userId = await requireVerifiedUser(supabase)
  if (!userId) return NextResponse.json({ ok: false, code: "auth_required" }, { status: 401 })

  const resolved = await resolveOrderParty(orderId, userId)
  // Not the seller, no such order, and shipping-not-installed are all the same
  // 404 from outside — order ids reveal nothing to someone probing them.
  if (!resolved.ok || resolved.party !== "seller" || resolved.schema === "absent") {
    return NextResponse.json({ ok: false, code: "not_found" }, { status: 404 })
  }

  if (!resolved.order.ship_fixed_location_id) {
    return NextResponse.json(
      {
        ok: false,
        code: "awaiting_buyer_address",
        message: "Cumpărătorul nu a ales încă easybox-ul de livrare.",
      },
      { status: 409 },
    )
  }

  const result = await createAwbForOrder(orderId)

  if (result.ok) {
    // The provider's label URL is deliberately NOT returned. The seller fetches
    // the label through /api/shipping/label/<id>, which re-checks authorisation
    // on every download; handing out the upstream URL would survive them
    // ceasing to be the seller.
    return NextResponse.json({
      ok: true,
      awb: "awb" in result ? result.awb : null,
      idempotent: result.idempotent,
      labelUrl: `/api/shipping/label/${orderId}`,
    })
  }

  return NextResponse.json(
    { ok: false, code: result.code, message: result.message, retryable: result.retryable },
    { status: result.code === "provider_error" ? 200 : 409 },
  )
}
