import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { visitorOfRequest } from "@/lib/site-accounts/session"
import { customerById } from "@/lib/site-accounts/customers"
import { privateResponse } from "@/lib/site-accounts/respond"
import { customerOwns } from "@/lib/site-accounts/owned-products"
import { siteOfRequest } from "@/lib/checkout/site-checkout-server"
import { guestAccessFromCookieHeader } from "@/lib/receipts/guest-access"
import { guestOpenHref, guestOwns } from "@/lib/receipts/guest-access-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * ===========================================================================
 *  GET /api/site-account/owned?ids=<product>,<product>
 * ===========================================================================
 * Which of these products the visitor already owns, for the product page's
 * "You already own this" (lib/site-accounts/owned-products). Two ways to
 * know, both from cookies of THIS website, nothing in the request:
 *
 *   signed in   the website's own session: their orders, by the email their
 *               sign in code proved. The way to the files is /account.
 *   a guest     the signed httpOnly `sl_owned` grant the browser that paid
 *               was given (lib/receipts/guest-access.ts), each checked
 *               against its order (paid, not refunded), this website's
 *               products only. The way to the files is that order's receipt
 *               through /api/receipt/open, so no token is in the answer.
 *
 * Nobody else is told anything, and nothing names an email.
 */
export async function GET(request: Request) {
  const ids = (new URL(request.url).searchParams.get("ids") ?? "").split(",").map((s) => s.trim()).filter(Boolean)
  const db = createAdminClient()
  const visitor = visitorOfRequest(request)
  const customer = visitor ? await customerById(db, visitor) : null
  if (visitor && customer?.email) {
    const owned = await customerOwns(db, { creatorId: visitor.creatorId, email: customer.email }, ids)
    return privateResponse(NextResponse.json({ signedIn: true, owned, account: "/account" }))
  }
  const raw = guestAccessFromCookieHeader(request.headers.get("cookie"))
  if (raw) {
    const site = await siteOfRequest(db, request).catch(() => null)
    if (site?.creatorId) {
      const held = await guestOwns(db, raw, { creatorId: site.creatorId }, ids)
      const owned: Record<string, { whole: boolean; options: string[]; href: string }> = {}
      for (const [id, o] of Object.entries(held)) owned[id] = { whole: o.whole, options: o.options, href: guestOpenHref(o.orderId) }
      return privateResponse(NextResponse.json({ signedIn: false, owned }))
    }
  }
  return privateResponse(NextResponse.json({ signedIn: false, owned: {} }))
}
