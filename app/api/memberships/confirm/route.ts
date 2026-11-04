import { NextResponse } from "next/server"
import type Stripe from "stripe"
import { createAdminClient } from "@/lib/supabase/admin"
import { stripe } from "@/lib/stripe"
import { rateLimit, addressSubject, LIMITS } from "@/lib/api/rate-limit"
import { intentIdOf, intentOf } from "@/lib/memberships/billing"
import { retrieveSubscription, syncSubscription } from "@/lib/memberships/sync"
import { grantsAccess, isMembershipSubscription } from "@/lib/memberships/state"
import { isStripeNotFound } from "@/lib/billing/subscription-state"
import { declineMessage, isCardDecline, rereadIntent, settledFrom, UNKNOWN_BODY } from "@/lib/checkout/confirm-outcome"

export const runtime = "nodejs"

/**
 * POST /api/memberships/confirm
 *   { subscriptionId, clientSecret, paymentMethodId?, returnUrl? }
 *
 * After Join. On the web Stripe.js has already confirmed the payment (or
 * saved the card for a trial) and this only brings the membership row up to
 * date now, rather than when the webhook arrives, so the member lands on a
 * page that already knows them. In the app, where Stripe.js cannot run
 * (app/checkout/parts/native-card.tsx), the card arrives as a PaymentMethod
 * and this confirms the subscription's own payment or setup with it, as
 * /api/checkout/confirm-with-pm does for a one time payment.
 *
 * The client secret must be the subscription's own current one, so a
 * subscription id alone confirms nothing. Answers
 * { membershipId, status, access } or { status: "requires_action", actionUrl }.
 * A confirm error that is not a declined card is never "nothing was charged":
 * the intent is read again, and 503 { status: "unknown" } when Stripe still
 * cannot say (the page then keeps this subscription for the next press).
 */
export async function POST(request: Request) {
  let body: { subscriptionId?: unknown; clientSecret?: unknown; paymentMethodId?: unknown; returnUrl?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Missing payment." }, { status: 400 })
  }
  const subscriptionId = typeof body.subscriptionId === "string" && /^sub_[A-Za-z0-9]+$/.test(body.subscriptionId) ? body.subscriptionId : ""
  const clientSecret = typeof body.clientSecret === "string" ? body.clientSecret : ""
  const paymentMethodId = typeof body.paymentMethodId === "string" && /^pm_[A-Za-z0-9]+$/.test(body.paymentMethodId) ? body.paymentMethodId : null
  if (!subscriptionId || !clientSecret || !intentIdOf(clientSecret)) return NextResponse.json({ error: "Missing payment." }, { status: 400 })

  const limited = await rateLimit({
    bucket: "payment",
    subjects: [addressSubject(request)],
    windows: LIMITS.payment,
    message: "Too many payment attempts just now. Wait a few minutes and try again.",
  })
  if (limited) return limited

  let sub: Stripe.Subscription
  try {
    sub = await stripe.subscriptions.retrieve(subscriptionId, { expand: ["latest_invoice.confirmation_secret", "pending_setup_intent"] })
  } catch (error) {
    /* Only Stripe saying it is not there is "not found". A timeout or an outage is not: the payment may well have gone through, and the buyer is told to try again, never that their membership does not exist. */
    if (!isStripeNotFound(error)) return NextResponse.json({ error: "We couldn't reach our payment partner just now. If you paid, your membership is safe. Try again in a moment." }, { status: 503 })
    return NextResponse.json({ error: "That membership could not be found." }, { status: 404 })
  }
  if (!isMembershipSubscription(sub)) return NextResponse.json({ error: "That membership could not be found." }, { status: 404 })

  /* The secret proves this is the page that started it. A paid invoice keeps its secret, a saved trial card does not, so both are checked. */
  const current = intentOf(sub)
  const invoice = sub.latest_invoice && typeof sub.latest_invoice === "object" ? sub.latest_invoice : null
  const setup = sub.pending_setup_intent && typeof sub.pending_setup_intent === "object" ? sub.pending_setup_intent : null
  const known = [current?.clientSecret, invoice?.confirmation_secret?.client_secret, setup?.client_secret].filter(Boolean)
  let matches = known.includes(clientSecret)
  if (!matches && clientSecret.startsWith("seti_")) {
    /* A trial's card, saved a moment ago: the setup intent is no longer pending on the subscription. */
    try {
      const si = await stripe.setupIntents.retrieve(intentIdOf(clientSecret)!)
      matches = si.client_secret === clientSecret && si.customer === (typeof sub.customer === "string" ? sub.customer : sub.customer.id)
    } catch {
      matches = false
    }
  }
  if (!matches) return NextResponse.json({ error: "That membership could not be found." }, { status: 404 })

  if (paymentMethodId && current) {
    const site = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin
    const returnUrl = sameSite(body.returnUrl, site, request) ?? `${site.replace(/\/$/, "")}/account/library/memberships`
    try {
      const id = intentIdOf(current.clientSecret)!
      const done =
        current.type === "setup"
          ? await stripe.setupIntents.confirm(id, { payment_method: paymentMethodId, return_url: returnUrl })
          : await stripe.paymentIntents.confirm(id, { payment_method: paymentMethodId, return_url: returnUrl })
      if (done.status === "requires_action") {
        const next = done.next_action as { redirect_to_url?: { url?: string | null } | null } | null
        return NextResponse.json({ status: "requires_action", actionUrl: next?.redirect_to_url?.url ?? null })
      }
      if (done.status !== "succeeded" && done.status !== "processing") {
        return NextResponse.json({ error: "The card was declined. Nothing was charged. Try another card." }, { status: 402 })
      }
    } catch (err) {
      /* Only a declined card is a sure "no" (lib/checkout/confirm-outcome.ts). */
      if (isCardDecline(err)) return NextResponse.json({ error: declineMessage(err) }, { status: 402 })
      /* A timeout, a 5xx, a dropped connection: the payment may have gone through. Stripe is asked again, bounded. */
      const id = intentIdOf(current.clientSecret)!
      const opts = { timeout: 5_000, maxNetworkRetries: 0 }
      const again = await rereadIntent<{ status: string; next_action?: { redirect_to_url?: { url?: string | null } | null } | null }>(() =>
        current.type === "setup" ? stripe.setupIntents.retrieve(id, {}, opts) : stripe.paymentIntents.retrieve(id, {}, opts),
      )
      const settled = settledFrom(again)
      console.warn("[memberships/confirm] confirm error, read again:", (err as { type?: string })?.type ?? "unknown", settled.kind)
      if (settled.kind === "action") return NextResponse.json({ status: "requires_action", actionUrl: settled.actionUrl })
      if (settled.kind === "canceled") return NextResponse.json({ error: "This payment was cancelled. Nothing was charged. Reload the page to join again." }, { status: 402 })
      /* Paid: brought up to date below, as after any payment. Unknown: the page keeps this subscription and its intent for the next press. */
      if (settled.kind === "unknown") return NextResponse.json(UNKNOWN_BODY, { status: 503 })
    }
  }

  try {
    const admin = createAdminClient()
    const { row, duplicateOf } = await syncSubscription(admin, subscriptionId, { subscription: await retrieveSubscription(subscriptionId) })
    if (!row) return NextResponse.json({ error: "That membership could not be found." }, { status: 404 })
    /*
      A second membership of something this buyer already had (lib/memberships/duplicates):
      cancelled, refunded and explained by email to the membership's address. The page is
      answered as for any member, pointing at the membership they already have, so it says
      nothing a person typing somebody else's email could learn from.
    */
    if (duplicateOf) return NextResponse.json({ membershipId: duplicateOf, status: "active", access: true })
    return NextResponse.json({ membershipId: row.id, status: row.status, access: grantsAccess(row) })
  } catch (e) {
    console.error("[memberships/confirm] not synced:", e instanceof Error ? e.message : e)
    /* Paid and safe: the webhook brings the row up to date in a moment. */
    return NextResponse.json({ status: "pending", access: false }, { status: 202 })
  }
}

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
