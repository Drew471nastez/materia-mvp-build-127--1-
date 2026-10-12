import { rateLimit, addressSubject } from "@/lib/api/rate-limit"
import { sellerOrderNumber } from "@/lib/orders/order-number-server"
import { createAdminClient } from "@/lib/supabase/admin"
import { physicalApiGate } from "@/lib/physical/gate"
import { physicalJson, readBody } from "@/lib/physical/auth"
import { loadSettings } from "@/lib/physical/config-server"
import { loadOrder, openReturn } from "@/lib/physical/orders-server"
import { returnWindow } from "@/lib/physical/status"
import { recordActivity } from "@/lib/activity/log-server"
import { orderNumberOf } from "@/lib/receipts/rules"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * A buyer asks to return items from their order page. The order is found
 * by its receipt token (a random secret only the buyer's emails and page
 * carry), the shop must accept returns and the window must still be open
 * (counted from delivery, lib/physical/status returnWindow).
 * The request waits for the merchant to approve it; nothing is refunded here.
 */
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const off = await physicalApiGate()
  if (off) return off
  const limited = await rateLimit({ bucket: "email", subjects: [addressSubject(request)], windows: [{ limit: 5, seconds: 600 }], message: "Too many requests. Try again later." })
  if (limited) return limited
  const { token } = await params
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return physicalJson({ error: "Order not found." }, 404)
  const body = await readBody(request)
  if (!body) return physicalJson({ error: "Bad request." }, 400)
  const db = createAdminClient()
  const order = await loadOrder(db, { receiptToken: token })
  if (!order || !order.creatorId) return physicalJson({ error: "Order not found." }, 404)
  const co = { id: order.id, creator_id: order.creatorId }
  const settings = await loadSettings(db, co.creator_id)
  if (!settings.returnsEnabled) return physicalJson({ error: "This shop doesn't take returns online. Reply to your order email to ask." }, 400)
  /* Counted from delivery, or from shipping when there is no tracking (lib/physical/status returnWindow), as the order page shows it. */
  const window = returnWindow({ ...order, pickup: order.deliveryMethod === "pickup" }, settings.returnWindowDays)
  if (!window.open) return physicalJson({ error: `Returns are accepted within ${settings.returnWindowDays} ${settings.returnWindowDays === 1 ? "day" : "days"} of delivery, and this order's window has closed.` }, 400)
  const items = Array.isArray(body.items) ? (body.items as { orderId: string; quantity: number }[]).filter((i) => typeof i?.orderId === "string") : []
  const result = await openReturn(db, co.id, { creatorId: co.creator_id, by: "buyer", items, reason: body.reason, note: body.note })
  if (result.ok === false) return physicalJson({ error: result.error }, result.status ?? 400)
  await recordActivity(db, { creatorId: co.creator_id }, { action: "order.return_opened", actor: "buyer", subjectType: "order", subjectId: co.id, subjectLabel: (await sellerOrderNumber(db, co.creator_id, { checkoutId: co.id })) ?? `#${orderNumberOf(co.id)}` })
  return physicalJson({ ok: true })
}
