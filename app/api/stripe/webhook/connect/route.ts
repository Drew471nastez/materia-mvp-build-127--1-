import { NextResponse } from "next/server"
import { headers } from "next/headers"
import type Stripe from "stripe"
import { stripe } from "@/lib/stripe"
import { handleConnectAccountEvent, isConnectStatusEvent, resyncConnectedAccount } from "@/lib/stripe/connect-webhook"
import { handleConnectPayoutEvent, isConnectPayoutEvent } from "@/lib/stripe/connect-payout-webhook"
import { claimStripeEvent, noteStripeEvent, stripeEventHandled } from "@/lib/payments/ledger"
import { createAdminClient } from "@/lib/supabase/admin"
import { reportError } from "@/lib/observability/report"
import { requestIdFrom } from "@/lib/net/request-id"
import { verifyStripeEvent } from "@/lib/stripe/webhook-secrets"
import { timed } from "@/lib/perf/server-timing"

export const runtime = "nodejs"
/* A ceiling on one delivery; Stripe sends it again (as /api/stripe/webhook). */
export const maxDuration = 60

/* The shared admin client: every database call with the request deadline of lib/net/deadline.ts, never undici's 300s. */
const supabaseAdmin = createAdminClient()

async function handlePOST(request: Request) {
  const secret = process.env.STRIPE_CONNECT_WEBHOOK_SECRET
  if (!secret) return NextResponse.json({ error: "Connect webhook not configured" }, { status: 503 })

  const body = await request.text()
  const sig = (await headers()).get("stripe-signature")
  if (!sig) return NextResponse.json({ error: "No signature" }, { status: 400 })

  /* Only the Connect secret, and only for an event that names a connected account (lib/stripe/webhook-secrets). */
  const verified = verifyStripeEvent(body, sig, { connect: secret }, (b, s, k) => stripe.webhooks.constructEvent(b, s, k))
  if (!verified.ok) {
    console.error(`[Connect webhook] refused: ${verified.reason}`)
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 })
  }
  const event: Stripe.Event = verified.event
  if (!event.account) return NextResponse.json({ received: true, ignored: true })

  if (await stripeEventHandled(supabaseAdmin, event.id)) {
    return NextResponse.json({ received: true, duplicate: true })
  }

  /* One delivery of an event at a time, shared with /api/stripe/webhook (lib/payments/ledger claimStripeEvent). */
  const claim = await claimStripeEvent(supabaseAdmin, { id: event.id, type: event.type, account: event.account })
  if (claim === "done") return NextResponse.json({ received: true, duplicate: true })
  if (claim === "busy") return NextResponse.json({ error: "This event is being handled. Stripe will send it again." }, { status: 409 })

  try {
    if (event.type.startsWith("account.")) {
      await handleConnectAccountEvent(event)
    } else if (isConnectPayoutEvent(event.type)) {
      await handleConnectPayoutEvent(supabaseAdmin, event)
    }
    if (isConnectStatusEvent(event.type)) await resyncConnectedAccount(event.account, event)
    await noteStripeEvent(supabaseAdmin, { id: event.id, type: event.type, account: event.account, ok: true })
    return NextResponse.json({ received: true })
  } catch (error) {
    await noteStripeEvent(supabaseAdmin, {
      id: event.id,
      type: event.type,
      account: event.account,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    })
    await reportError({ source: "webhook", where: `stripe connect ${event.type}`, error, context: { eventId: event.id }, requestId: requestIdFrom(request.headers) })
    return NextResponse.json({ error: "Handler failed" }, { status: 500 })
  }
}

/* Timed on the server for /admin/performance (lib/perf/server-timing.ts). */
export const POST = timed("infra", "/api/stripe/webhook/connect", handlePOST)
