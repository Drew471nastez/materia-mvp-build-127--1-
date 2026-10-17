import { createAdminClient } from "@/lib/supabase/admin"
import { physicalJson } from "@/lib/physical/auth"
import { orderStamp } from "@/lib/physical/order-stamp-server"
import { physicalApiGate } from "@/lib/physical/gate"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * The buyer's order page asks here now and then whether anything changed
 * (lib/physical/order-stamp-server.ts; app/checkout/physical/order/[token]/live-status.tsx).
 * Found by the receipt token, the buyer's key, and says nothing else about
 * the order. Behind the switch in /admin like every /api/physical route:
 * while it is off the page stays readable and simply stops following.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const off = await physicalApiGate()
  if (off) return off
  const { token } = await params
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return physicalJson({ error: "Order not found." }, 404)
  const v = await orderStamp(createAdminClient(), token)
  return v ? physicalJson({ v }) : physicalJson({ error: "Order not found." }, 404)
}
