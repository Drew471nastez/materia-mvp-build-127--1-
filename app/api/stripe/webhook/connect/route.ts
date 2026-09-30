import { NextResponse } from "next/server"
import { headers } from "next/headers"
import type Stripe from "stripe"
import { stripe } from "@/lib/stripe"
import { handleConnectAccountEvent } from "@/lib/stripe/connect-webhook"
import { noteStripeEvent, stripeEventHandled } from "@/lib/payments/ledger"
import { createClient } from "@supabase/supabase-js"
import { reportError } from "@/lib/observability/report"

export const runtime = "nodejs"

const supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

export async function POST(request: Request) {
  const secret = process.env.STRIPE_CONNECT_WEBHOOK_SECRET || process.env.STRIPE_WEBHOOK_SECRET
  if (!secret) return NextResponse.json({ error: "Webhook not configured" }, { status: 503 })

  const body = await request.text()
  const sig = (await headers()).get("stripe-signature")
  if (!sig) return NextResponse.json({ error: "No signature" }, { status: 400 })

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, sig, secret)
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 })
  }

  if (!event.account) {
    return NextResponse.json({ received: true, ignored: true })
  }

  if (await stripeEventHandled(supabaseAdmin, event.id)) {
    return NextResponse.json({ received: true, duplicate: true })
  }

  try {
    await handleConnectAccountEvent(event)
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
    await reportError({ source: "webhook", where: `stripe connect ${event.type}`, error, context: { eventId: event.id } })
    return NextResponse.json({ error: "Handler failed" }, { status: 500 })
  }
}
