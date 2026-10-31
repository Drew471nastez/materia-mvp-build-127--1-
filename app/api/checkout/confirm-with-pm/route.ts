import { NextResponse } from "next/server"
import type Stripe from "stripe"
import { stripe } from "@/lib/stripe"
import { rateLimit, addressSubject, LIMITS } from "@/lib/api/rate-limit"
import { isCheckoutIntent } from "@/lib/checkout/fulfil-payment"
import { declineMessage, isCardDecline, rereadIntent, settledFrom, UNKNOWN_BODY } from "@/lib/checkout/confirm-outcome"

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
 * { status } or { error } (4xx). A Stripe error that is not a declined card
 * (a timeout, a 5xx, a dropped connection, an idempotency conflict) is never
 * answered "nothing was charged": the PaymentIntent is read again and the
 * answer is its real status, or 503 { status: "unknown" } when Stripe still
 * cannot say, which the page answers by keeping this same PaymentIntent for
 * the next press (lib/checkout/confirm-outcome.ts).
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

  let current: Stripe.PaymentIntent
  try {
    current = await stripe.paymentIntents.retrieve(paymentIntentId)
  } catch {
    /* Nothing was confirmed yet, so nothing was charged by this request; the page may press again with the same intent. */
    return NextResponse.json({ error: "We couldn't reach our payment partner just now. Nothing was charged. Try again in a moment." }, { status: 503 })
  }
  if (current.client_secret !== clientSecret || !isCheckoutIntent(current)) {
    return NextResponse.json({ error: "That payment could not be found." }, { status: 404 })
  }

  try {
    const pi = await stripe.paymentIntents.confirm(paymentIntentId, { payment_method: paymentMethodId, return_url: returnUrl })
    if (pi.status === "succeeded") return NextResponse.json({ status: "succeeded" })
    if (pi.status === "requires_action") {
      const next = pi.next_action as Stripe.PaymentIntent.NextAction | null
      return NextResponse.json({ status: "requires_action", actionUrl: next?.redirect_to_url?.url ?? null })
    }
    return NextResponse.json({ status: pi.status })
  } catch (err) {
    /* The bank's words for a declined card are the useful ones, and only a declined card is a sure "no". */
    if (isCardDecline(err)) return NextResponse.json({ error: declineMessage(err) }, { status: 400 })
    /* Anything else may sit over a payment that went through: Stripe is asked again what this one did. */
    const again = await rereadIntent(() => stripe.paymentIntents.retrieve(paymentIntentId, {}, { timeout: 5_000, maxNetworkRetries: 0 }))
    const settled = settledFrom(again)
    console.warn("[confirm-with-pm] confirm error, read again:", (err as { type?: string })?.type ?? "unknown", settled.kind)
    if (settled.kind === "paid") return NextResponse.json({ status: settled.status })
    if (settled.kind === "action") return NextResponse.json({ status: "requires_action", actionUrl: settled.actionUrl })
    if (settled.kind === "canceled") return NextResponse.json({ error: "This payment was cancelled. Nothing was charged. Reload the page to pay again." }, { status: 409 })
    return NextResponse.json(UNKNOWN_BODY, { status: 503 })
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
