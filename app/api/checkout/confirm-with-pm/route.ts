import { NextResponse } from "next/server"
import type Stripe from "stripe"
import { stripe } from "@/lib/stripe"
import { rateLimit, addressSubject, LIMITS } from "@/lib/api/rate-limit"
import { isCheckoutIntent } from "@/lib/checkout/fulfil-payment"

export const runtime = "nodejs"

/**
 * POST /api/checkout/confirm-with-pm
 *   { paymentIntentId, clientSecret, paymentMethodId, returnUrl? }
 *
 * The native app's card path: the app sends the card to Stripe itself and
 * gets a PaymentMethod id back (Stripe.js cannot run in the app's WebView,
 * see app/checkout/parts/native-card.tsx), and this confirms the checkout's
 * PaymentIntent with it.
 *
 * Only a checkout's own PaymentIntent, and only with its client secret: this
 * confirmed any PaymentIntent id with any card, which is exactly the shape a
 * card-testing script wants. Rate limited with the other payment routes. The
 * 3-D Secure return address has to be on this site.
 *
 * Answers { status: "succeeded" }, { status: "requires_action", actionUrl },
 * { status } or { error } (4xx).
 */
export async function POST(request: Request) {
  let body: { paymentIntentId?: unknown; clientSecret?: unknown; paymentMethodId?: unknown; returnUrl?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Missing payment." }, { status: 400 })
  }

  const paymentIntentId = typeof body.paymentIntentId === "string" ? body.paymentIntentId : ""
  const clientSecret = typeof body.clientSecret === "string" ? body.clientSecret : ""
  const paymentMethodId = typeof body.paymentMethodId === "string" ? body.paymentMethodId : ""
  if (!/^pi_[A-Za-z0-9]+$/.test(paymentIntentId) || !clientSecret || !/^pm_[A-Za-z0-9]+$/.test(paymentMethodId)) {
    return NextResponse.json({ error: "Missing payment." }, { status: 400 })
  }

  const limited = await rateLimit({
    bucket: "payment",
    subjects: [addressSubject(request)],
    windows: LIMITS.payment,
    message: "Too many payment attempts just now. Wait a few minutes and try again.",
  })
  if (limited) return limited

  const site = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin
  const returnUrl = sameSite(body.returnUrl, site, request) ?? `${site.replace(/\/$/, "")}/checkout`

  try {
    const current = await stripe.paymentIntents.retrieve(paymentIntentId)
    if (current.client_secret !== clientSecret || !isCheckoutIntent(current)) {
      return NextResponse.json({ error: "That payment could not be found." }, { status: 404 })
    }

    const pi = await stripe.paymentIntents.confirm(paymentIntentId, { payment_method: paymentMethodId, return_url: returnUrl })
    if (pi.status === "succeeded") return NextResponse.json({ status: "succeeded" })
    if (pi.status === "requires_action") {
      const next = pi.next_action as Stripe.PaymentIntent.NextAction | null
      return NextResponse.json({ status: "requires_action", actionUrl: next?.redirect_to_url?.url ?? null })
    }
    return NextResponse.json({ status: pi.status })
  } catch (err) {
    const e = err as { type?: string; raw?: { message?: string }; message?: string }
    /* The bank's words for a declined card are the useful ones; anything else is plumbing. */
    const message = e?.type === "StripeCardError" ? e.raw?.message || e.message : null
    return NextResponse.json({ error: message || "The payment did not go through. Nothing was charged." }, { status: 400 })
  }
}

/** The address, when it is on this site; otherwise nothing. */
function sameSite(value: unknown, site: string, request: Request): string | null {
  if (typeof value !== "string" || !value) return null
  try {
    const url = new URL(value)
    const allowed = new Set([new URL(site).host, new URL(request.url).host])
    return url.protocol === "https:" || url.hostname === "localhost" ? (allowed.has(url.host) ? url.toString() : null) : null
  } catch {
    return null
  }
}
