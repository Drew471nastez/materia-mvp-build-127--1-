import { rateLimit, addressSubject } from "@/lib/api/rate-limit"
import { sellerOrderNumber } from "@/lib/orders/order-number-server"
import { createAdminClient } from "@/lib/supabase/admin"
import { physicalApiGate } from "@/lib/physical/gate"
import { physicalJson, readBody } from "@/lib/physical/auth"
import { buyerCancelOrder } from "@/lib/physical/buyer-cancel-server"
import { loadCheckoutConfig } from "@/lib/store/settings-server"
import { recordActivity } from "@/lib/activity/log-server"
import { orderNumberOf } from "@/lib/receipts/rules"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * A buyer cancels their order from its page (lib/physical/buyer-cancel.ts).
 * Found by its receipt token, the random key only the buyer's emails and page
 * carry, so nobody else's order can be named. The shop must let buyers cancel
 * (Settings › Checkout › Let buyers cancel) and the order must still be
 * Unfulfilled. Then it is cancelled and refunded on the spot, or, for an order
 * already sent to a partner or holding a download, the shop is asked
 * (lib/physical/buyer-cancel-server.ts). Limited per address and per order; a
 * second press finds it done, never a second refund or email.
 */
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const off = await physicalApiGate()
  if (off) return off
  const { token } = await params
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return physicalJson({ error: "Order not found." }, 404)
  const limited = await rateLimit({ bucket: "physical-buyer-cancel", subjects: [addressSubject(request), `order:${token}`], windows: [{ limit: 5, seconds: 600 }, { limit: 20, seconds: 86400 }], message: "Too many requests. Try again later." })
  if (limited) return limited
  const body = (await readBody(request)) ?? {}
  const db = createAdminClient()
  const { data: co } = await db.from("commerce_checkouts").select("creator_id").eq("receipt_token", token).maybeSingle()
  if (!co?.creator_id) return physicalJson({ error: "Order not found." }, 404)
  const config = await loadCheckoutConfig(db, co.creator_id)
  const result = await buyerCancelOrder(db, token, { reason: body.reason, enabled: config.buyerCancel })
  if (result.ok === false) return physicalJson({ error: result.error }, result.status ?? 400)
  await recordActivity(db, { creatorId: result.order.creatorId }, { action: result.done === "cancelled" ? "order.cancelled" : "order.cancel_requested", actor: "buyer", subjectType: "order", subjectId: result.order.id, subjectLabel: (await sellerOrderNumber(db, result.order.creatorId, { checkoutId: result.order.id })) ?? `#${orderNumberOf(result.order.id)}` })
  return physicalJson({ ok: true, done: result.done, refundedCents: result.refundedCents, pending: result.pending })
}
