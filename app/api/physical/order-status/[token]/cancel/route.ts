import { rateLimit, addressSubject } from "@/lib/api/rate-limit"
import { createAdminClient } from "@/lib/supabase/admin"
import { physicalApiGate } from "@/lib/physical/gate"
import { physicalJson, readBody } from "@/lib/physical/auth"
import { requestBuyerCancel } from "@/lib/physical/orders-server"
import { loadCheckoutConfig } from "@/lib/store/settings-server"
import { recordActivity } from "@/lib/activity/log-server"
import { orderNumberOf } from "@/lib/receipts/rules"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * A buyer asks to cancel their order from its page (lib/physical/buyer-cancel.ts).
 * Found by its receipt token, the random key only the buyer's emails and page
 * carry, so nobody else's order can be named. The shop must take requests
 * (Settings › Checkout › Let buyers ask to cancel) and the order must still be
 * Unfulfilled. Limited per address and per order; a second press is the same
 * request, never a second email. Nothing is cancelled or refunded here: the
 * seller answers from the order.
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
  const result = await requestBuyerCancel(db, token, { reason: body.reason, enabled: config.buyerCancel })
  if (result.ok === false) return physicalJson({ error: result.error }, result.status ?? 400)
  await recordActivity(db, { creatorId: result.order.creatorId }, { action: "order.cancel_requested", actor: "buyer", subjectType: "order", subjectId: result.order.id, subjectLabel: `#${orderNumberOf(result.order.id)}` })
  return physicalJson({ ok: true })
}
