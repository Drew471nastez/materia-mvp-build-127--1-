import { NextResponse, after } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { ACCESS_SENT, accessLinkLimited, sendAccessLinks } from "@/lib/checkout/access-link"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * ===========================================================================
 *  "BOUGHT THIS BEFORE? EMAIL ME MY LINK", ON THE EXPLORE CHECKOUT
 * ===========================================================================
 * The guest's way back to a download on storelib.com's own checkout
 * (app/checkout/checkout-client). The shop is the product's; the receipts
 * of that shop's orders placed with the email go to the email, and the
 * answer is the same whatever the email (lib/checkout/access-link). A
 * website's checkout asks its own route instead (app/api/checkout/site,
 * action "access"), so its links open on the website.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } })

export async function POST(request: Request) {
  let body: { email?: unknown; productId?: unknown }
  try {
    body = await request.json()
  } catch {
    return json({ error: "Bad request" }, 400)
  }
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase().slice(0, 254) : ""
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: "Enter the email you bought it with.", field: "email" }, 400)
  const productId = typeof body.productId === "string" && UUID.test(body.productId) ? body.productId : null
  if (!productId) return json({ error: "Bad request" }, 400)
  const limited = await accessLinkLimited(request, email)
  if (limited) return limited
  const admin = createAdminClient()
  after(async () => {
    const { data } = await admin.from("products").select("creator_id").eq("id", productId).maybeSingle()
    const creatorId = (data as { creator_id?: string } | null)?.creator_id
    if (creatorId) await sendAccessLinks(admin, { creatorId, email, productIds: [productId], receiptBase: null }).catch(() => undefined)
  })
  return json({ ok: true, message: ACCESS_SENT })
}
