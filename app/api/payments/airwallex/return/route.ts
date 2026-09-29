import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { createAdminClient } from "@/lib/supabase/admin"
import { fulfilAirwallexIntent } from "@/lib/checkout/fulfil-payment"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * POST /api/payments/airwallex/return   { paymentIntentId, clientSecret }
 *
 * The buyer's side of finishing a checkout paid on Airwallex's own payment
 * page, when it sends them back to the checkout. The same as
 * /api/checkout/confirm-payment is for Stripe: the order is made by
 * lib/checkout/fulfil-payment (which the Airwallex webhook also calls, so it
 * exists even if this never arrives, and never twice), and the receipt is
 * handed only to the page that holds the payment's client secret.
 *
 * Answers { success, receiptToken, amountCents, redirectUrl }.
 */
export async function POST(request: Request) {
  let body: { paymentIntentId?: unknown; clientSecret?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Missing payment." }, { status: 400 })
  }
  const paymentIntentId = typeof body.paymentIntentId === "string" ? body.paymentIntentId : ""
  const clientSecret = typeof body.clientSecret === "string" ? body.clientSecret : ""
  if (!paymentIntentId || !clientSecret) return NextResponse.json({ error: "Missing payment." }, { status: 400 })

  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || request.headers.get("origin") || ""

  try {
    const result = await fulfilAirwallexIntent(createAdminClient(), paymentIntentId, { request, baseUrl, clientSecret })
    if (result.ok === false) return NextResponse.json({ error: result.error }, { status: result.status })

    /* This browser paid: it is the one the download recognises. */
    if (result.sessionFingerprint) {
      const mainDomain = process.env.NEXT_PUBLIC_MAIN_DOMAIN || "storelib.com"
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
    }

    return NextResponse.json({
      success: true,
      receiptToken: result.receiptToken,
      amountCents: result.amountCents,
      redirectUrl: `/receipt/${result.receiptToken}`,
    })
  } catch (error) {
    console.error("[airwallex return]", error instanceof Error ? error.message : error)
    return NextResponse.json({ error: "The order could not be finished. The payment is safe; refresh this page in a moment." }, { status: 500 })
  }
}
