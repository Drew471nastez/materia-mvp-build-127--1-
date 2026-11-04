import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { createAdminClient } from "@/lib/supabase/admin"
import { fulfilPaymentIntent } from "@/lib/checkout/fulfil-payment"
import { timed } from "@/lib/perf/server-timing"
import { addressSubject, rateLimit } from "@/lib/api/rate-limit"

export const runtime = "nodejs"

/**
 * POST /api/checkout/confirm-payment   { paymentIntentId, clientSecret }
 *
 * The page's side of finishing a paid checkout: after the card went through,
 * or after a bank's 3-D Secure page sent the buyer back. The order itself is
 * made by lib/checkout/fulfil-payment.ts, which the Stripe webhook also calls,
 * so it exists even when this request never arrives, and never twice.
 *
 * Answers { success, receiptToken, redirectUrl } for the buyer's receipt.
 */
async function handlePOST(request: Request) {
  let body: { paymentIntentId?: unknown; clientSecret?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Missing payment." }, { status: 400 })
  }
  const paymentIntentId = typeof body.paymentIntentId === "string" ? body.paymentIntentId : ""
  const clientSecret = typeof body.clientSecret === "string" ? body.clientSecret : ""
  if (!paymentIntentId || !clientSecret) {
    return NextResponse.json({ error: "Missing payment." }, { status: 400 })
  }
  /*
    Each call asks Stripe about a payment, so a script guessing at ids costs Stripe calls and server time (round 51).
    A buyer confirms once, and again on a retry: thirty in ten minutes from one address is far past any person.
  */
  const limited = await rateLimit({ bucket: "checkout-confirm", subjects: [addressSubject(request)], windows: [{ limit: 30, seconds: 600 }, { limit: 200, seconds: 86400 }], memoryFirst: true, message: "Too many attempts. Wait a minute and try again." })
  if (limited) return limited

  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || request.headers.get("origin") || ""

  try {
    const result = await fulfilPaymentIntent(createAdminClient(), paymentIntentId, { request, baseUrl, clientSecret })
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
    console.error("[confirm-payment]", error instanceof Error ? error.message : error)
    return NextResponse.json({ error: "The order could not be finished. The payment is safe; refresh this page in a moment." }, { status: 500 })
  }
}

/* Timed for /admin/performance, one request in five (lib/perf/server-timing.ts). */
export const POST = timed("checkout", "/api/checkout/confirm-payment", handlePOST)
