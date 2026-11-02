/**
 * ===========================================================================
 *  GET /api/purchases/guest-owned?productId=: THIS BROWSER'S GUEST PURCHASE (round 49)
 * ===========================================================================
 * The product page offered a guest buyer "save it to an account" under their
 * Download (components/checkout/guest-owned-actions), from the signed,
 * httpOnly sl_owned cookie read on the server. The page is one HTML for
 * everybody now (a CDN holds it), so the same two facts come from here, to
 * the browser that holds the cookie: the order (to claim) and its address
 * masked. Exactly the page's old rule: a grant this cookie holds for this
 * product, still deliverable (lib/receipts/guest-access-server heldGrants),
 * and only when the signed in account does not own the product itself.
 *
 * Kept apart from /api/purchases/verify on purpose: that route answers a
 * receipt token, which can be forwarded, and never says anything about a
 * person (tests/purchase-verify). This one answers only the cookie the
 * buying browser was given. Private and never stored.
 */
import { NextResponse, type NextRequest } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { currentUserForRequest } from "@/lib/auth/request-scope"
import { guestAccessFromCookieHeader } from "@/lib/receipts/guest-access"
import { heldGrants, maskAddress } from "@/lib/receipts/guest-access-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const PRIVATE = { "Cache-Control": "private, no-store", "Vercel-CDN-Cache-Control": "no-store" }
const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(request: NextRequest) {
  const productId = request.nextUrl.searchParams.get("productId") ?? ""
  if (!ID.test(productId)) return NextResponse.json({ guest: null }, { status: 400, headers: PRIVATE })
  const admin = createAdminClient()
  const held = await heldGrants(admin, guestAccessFromCookieHeader(request.headers.get("cookie")), { productId }).catch(() => null)
  const first = held?.open[0] as { id?: unknown; buyer_email?: string | null } | undefined
  if (!first) return NextResponse.json({ guest: null }, { headers: PRIVATE })
  /* The account's own copy is the stronger answer: no offer to save what it already has. */
  const { user } = await currentUserForRequest().catch(() => ({ user: null }))
  if (user) {
    const { data } = await admin.from("entitlements").select("id").eq("buyer_id", user.id).eq("product_id", productId).limit(1)
    if (Array.isArray(data) && data.length > 0) return NextResponse.json({ guest: null }, { headers: PRIVATE })
  }
  return NextResponse.json({ guest: { orderId: String(first.id), maskedEmail: maskAddress(first.buyer_email ?? null) } }, { headers: PRIVATE })
}
