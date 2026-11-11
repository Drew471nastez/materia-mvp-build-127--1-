import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { createAdminClient } from "@/lib/supabase/admin"
import { getMainDomain } from "@/lib/url-helpers"
import { fulfilCartSession } from "@/lib/checkout/fulfil-cart-session"
import { checkoutReturnTarget, paidReturnUrl } from "@/lib/checkout/return-url"
import { siteHostsFor } from "@/lib/checkout/site-hosts"
import { rememberOnSiteUrl } from "@/lib/receipts/guest-access"
import { routeUser } from "@/lib/auth/route-user"

export const runtime = "nodejs"

/**
 * ===========================================================================
 *  A PAID BASKET BECOMES PURCHASES
 * ===========================================================================
 * Stripe sends the buyer back here. The session says what was paid, its
 * metadata says what for, and each line becomes an order and an entitlement
 * the same way a single purchase does.
 *
 * The work itself is lib/checkout/fulfil-cart-session.ts, which Stripe's
 * checkout.session.completed webhook also calls, so a basket paid in a tab
 * that closed before this redirect still becomes orders. IDEMPOTENT ON THE
 * SESSION: a refresh, a return from history or the webhook arriving at the
 * same moment never writes a second set.
 *
 * THE FEE IS SPLIT, NOT REPEATED. The platform's cut was calculated once on
 * the whole basket and taken once by Stripe. Recording it against every line
 * would say the platform took it several times over, which would be wrong in
 * the seller's earnings and in the accounts. It is apportioned by each
 * line's share of the basket, and the rounding goes on the last line so the
 * parts add up to the whole.
 *
 * PARTIAL FULFILMENT IS REPORTED, NOT SWALLOWED. The money has already been
 * taken by the time this runs, so a line that fails to write is logged and
 * the rest still go through. The buyer sees what they got.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const sessionId = searchParams.get("session_id") || ""
  const platform = `https://${getMainDomain()}`
  if (!sessionId) return NextResponse.redirect(`${platform}/explore`)

  try {
    const who = await routeUser()
    const user = who.kind === "user" ? who.user : null

    const result = await fulfilCartSession(createAdminClient(), sessionId, { baseUrl: platform, request, viewerId: user?.id ?? null })
    if (result.ok === false) {
      const why = result.reason === "unpaid" ? "unpaid" : result.reason === "unreadable" ? "unreadable" : "failed"
      return NextResponse.redirect(`${platform}/explore?checkout=${why}`)
    }
    if (!result.complete) console.error("[checkout/cart/complete] some lines could not be written for session", sessionId)

    /* Device recognition, the same cookie a single purchase sets, so a guest
       can reach their downloads again from this browser. The fingerprint is
       derived from the session, so it matches the orders whoever wrote them. */
    const mainDomain = getMainDomain()
    const isLocalhost = mainDomain.includes("localhost")
    const cookieStore = await cookies()
    cookieStore.set("materia_session", result.sessionFingerprint, {
      httpOnly: true,
      secure: !isLocalhost,
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 365,
      path: "/",
      domain: isLocalhost ? undefined : `.${mainDomain}`,
    })

    /* Back to the creator's website when the basket came from one, checked
       again here against THIS creator's own sites (the address is in a URL
       anybody can edit). The receipt is emailed either way. */
    const back = checkoutReturnTarget(searchParams.get("return"), {
      hosts: searchParams.get("return") ? await siteHostsFor(result.creatorId) : [],
      mainDomain,
    })
    /* Through /api/receipt/remember on that website's own host first, so the browser that paid keeps the purchase there (lib/receipts/guest-access.ts). Not for a signed in buyer, whose library holds it. */
    if (back) return NextResponse.redirect(user ? paidReturnUrl(back) : rememberOnSiteUrl(paidReturnUrl(back), result.receiptToken))

    return NextResponse.redirect(`${platform}/receipt/${encodeURIComponent(result.receiptToken)}`)
  } catch (error) {
    console.error("[checkout/cart/complete] error:", error instanceof Error ? error.message : error)
    return NextResponse.redirect(`${platform}/explore?checkout=error`)
  }
}
