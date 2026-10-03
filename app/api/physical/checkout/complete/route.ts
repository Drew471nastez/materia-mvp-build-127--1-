import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { createAdminClient } from "@/lib/supabase/admin"
import { getMainDomain } from "@/lib/url-helpers"
import { completeStripeSession } from "@/lib/physical/checkout-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * Stripe sends the buyer back here after paying. The order is written (or
 * found written, when the webhook was first) and the buyer lands on their
 * order page. Not behind the switch: money already taken is always
 * fulfilled, even if physical commerce was turned off a moment ago.
 */
export async function GET(request: Request) {
  const sessionId = new URL(request.url).searchParams.get("session_id") || ""
  const platform = `https://${getMainDomain()}`
  if (!sessionId) return NextResponse.redirect(`${platform}/`)
  try {
    const result = await completeStripeSession(createAdminClient(), sessionId, platform)
    if (result.ok === false) {
      return NextResponse.redirect(`${platform}/checkout/physical/order/pending?reason=${result.reason}`)
    }
    const main = getMainDomain()
    const local = main.includes("localhost")
    ;(await cookies()).set("materia_session", result.sessionFingerprint, { httpOnly: true, secure: !local, sameSite: "lax", maxAge: 60 * 60 * 24 * 365, path: "/", domain: local ? undefined : `.${main}` })
    return NextResponse.redirect(`${platform}/checkout/physical/order/${encodeURIComponent(result.receiptToken)}?paid=1`)
  } catch (e) {
    console.error("[physical/complete] failed:", e instanceof Error ? e.message : e)
    return NextResponse.redirect(`${platform}/checkout/physical/order/pending?reason=failed`)
  }
}
