import { rateLimit, addressSubject } from "@/lib/api/rate-limit"
import { createAdminClient } from "@/lib/supabase/admin"
import { physicalApiGate } from "@/lib/physical/gate"
import { physicalJson, readBody } from "@/lib/physical/auth"
import { loadSettings } from "@/lib/physical/config-server"
import { openReturn } from "@/lib/physical/orders-server"
import { recordActivity } from "@/lib/activity/log-server"
import { orderNumberOf } from "@/lib/receipts/rules"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * A buyer asks to return items from their order page. The order is found
 * by its receipt token (a random secret only the buyer's emails and page
 * carry), the shop must accept returns and the window must still be open.
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
  const { data: co } = await db.from("commerce_checkouts").select("id, creator_id, paid_at, status, fulfilled_at").eq("receipt_token", token).maybeSingle()
  if (!co || !co.creator_id) return physicalJson({ error: "Order not found." }, 404)
  const settings = await loadSettings(db, co.creator_id)
  if (!settings.returnsEnabled) return physicalJson({ error: "This shop doesn't take returns online. Reply to your order email to ask." }, 400)
  const since = Date.parse(co.fulfilled_at ?? co.paid_at ?? "")
  if (Number.isFinite(since) && Date.now() - since > settings.returnWindowDays * 86_400_000) return physicalJson({ error: `Returns are accepted within ${settings.returnWindowDays} days.` }, 400)
  const items = Array.isArray(body.items) ? (body.items as { orderId: string; quantity: number }[]).filter((i) => typeof i?.orderId === "string") : []
  const result = await openReturn(db, co.id, { creatorId: co.creator_id, by: "buyer", items, reason: body.reason, note: body.note })
  if (result.ok === false) return physicalJson({ error: result.error }, result.status ?? 400)
  await recordActivity(db, { creatorId: co.creator_id }, { action: "order.return_opened", actor: "buyer", subjectType: "order", subjectId: co.id, subjectLabel: `#${orderNumberOf(co.id)}` })
  return physicalJson({ ok: true })
}
