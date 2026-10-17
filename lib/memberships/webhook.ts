import "server-only"

/**
 * ===========================================================================
 *  THE STRIPE EVENTS THAT ARE ABOUT A MEMBERSHIP
 * ===========================================================================
 * Called first by app/api/stripe/webhook for the subscription and invoice
 * events, before the creator's own Storelib plan is looked at. Answers
 * null for anything that is not a membership's, and the webhook carries on
 * as it always did; a membership's event is answered here and goes no
 * further, so a member's subscription can never be read as a creator
 * changing plan.
 *
 *   customer.subscription.created / updated / deleted / paused / resumed
 *                        the row brought up to date from Stripe (./sync.ts)
 *   invoice.paid, invoice.payment_succeeded
 *                        the payment kept, an order and the creator's sale
 *                        made once, the member's renewal receipt
 *   invoice.payment_failed
 *                        past due from now, a banner in the library, and the
 *                        member told once per attempt
 *   invoice.created      a renewal's fee set to the exact cents the one time
 *                        checkout would take, while the invoice is a draft
 *
 * IDEMPOTENT THREE WAYS. The webhook skips an event it already finished
 * (stripe_webhook_events, part 64). A sync writes Stripe's current state, so
 * a repeat writes the same row. And every effect has its own key (an
 * invoice id, a notify event key, a library row per membership).
 *
 * A failure that Stripe retrying can fix (Stripe or the database not
 * answering) is a 500. Anything else is logged and answered 200, so one bad
 * row does not have Stripe retrying for three days.
 */
import { NextResponse } from "next/server"
import type Stripe from "stripe"
import { isMembershipSubscription } from "./state"
import { isMembershipInvoice, recordFailedInvoice, recordPaidInvoice, subscriptionIdOf, syncSubscription } from "./sync"
import { membershipFee } from "./billing"
import { stripe } from "@/lib/stripe"
import type { Db } from "./server"

const SUBSCRIPTION_EVENTS = new Set([
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "customer.subscription.paused",
  "customer.subscription.resumed",
  "customer.subscription.pending_update_applied",
])
const INVOICE_EVENTS = new Set(["invoice.paid", "invoice.payment_succeeded", "invoice.payment_failed", "invoice.created"])

export function isMembershipEventType(type: string): boolean {
  return SUBSCRIPTION_EVENTS.has(type) || INVOICE_EVENTS.has(type)
}

export async function handleMembershipEvent(admin: Db, event: Stripe.Event): Promise<Response | null> {
  if (SUBSCRIPTION_EVENTS.has(event.type)) {
    const sub = event.data.object as Stripe.Subscription
    if (!isMembershipSubscription(sub)) return null
    try {
      const { row, transitions } = await syncSubscription(admin, sub.id)
      console.log(`[memberships] ${event.type} ${sub.id}: ${row?.status ?? "no row"}${transitions.length ? ` (${transitions.join(", ")})` : ""}`)
      return NextResponse.json({ received: true, membership: row?.id ?? null })
    } catch (e) {
      console.error(`[memberships] ${event.type} ${sub.id} not synced:`, e instanceof Error ? e.message : e)
      return NextResponse.json({ error: "Membership not synced" }, { status: 500 })
    }
  }

  if (INVOICE_EVENTS.has(event.type)) {
    const invoice = event.data.object as Stripe.Invoice
    if (!subscriptionIdOf(invoice)) return null
    let ours = false
    try {
      ours = await isMembershipInvoice(admin, invoice)
    } catch {
      ours = invoice.parent?.subscription_details?.metadata?.kind === "membership"
    }
    if (!ours) return null
    try {
      if (event.type === "invoice.created") {
        await exactRenewalFee(admin, invoice)
      } else if (event.type === "invoice.payment_failed") {
        await recordFailedInvoice(admin, invoice)
      } else {
        const { orderId } = await recordPaidInvoice(admin, invoice)
        /* Past due ends with the payment: the row follows Stripe now, not at the next subscription event. */
        const subId = subscriptionIdOf(invoice)
        if (subId) await syncSubscription(admin, subId)
        console.log(`[memberships] ${event.type} ${invoice.id}: order ${orderId ?? "none"}`)
      }
      return NextResponse.json({ received: true })
    } catch (e) {
      console.error(`[memberships] ${event.type} ${invoice.id} not recorded:`, e instanceof Error ? e.message : e)
      return NextResponse.json({ error: "Membership invoice not recorded" }, { status: 500 })
    }
  }
  return null
}

/**
 * A RENEWAL'S FEE IN EXACT CENTS. The subscription carries the fee as a
 * percent (./billing.ts), which Stripe rounds; a renewal's invoice waits as
 * a draft for about an hour, and in that hour its fee is set to exactly what
 * the one time checkout would take for that amount under the creator's plan
 * today (so a creator who upgraded pays the new rate from their next
 * renewal). Stripe refusing it leaves the percent, which is within a cent
 * or two; it never fails the webhook.
 */
async function exactRenewalFee(admin: Db, invoice: Stripe.Invoice): Promise<void> {
  if (invoice.status !== "draft" || invoice.billing_reason !== "subscription_cycle" || !(invoice.amount_due > 0)) return
  const creatorId = invoice.parent?.subscription_details?.metadata?.creator_id
  if (!creatorId) return
  try {
    /* In the invoice's own currency, which is the price's: the fee rules and the charge never differ. */
    const fee = await membershipFee(admin, creatorId, invoice.amount_due, invoice.currency)
    await stripe.invoices.update(invoice.id, { application_fee_amount: fee.cents })
  } catch (e) {
    console.warn(`[memberships] renewal fee left as a percent on ${invoice.id}:`, e instanceof Error ? e.message : e)
  }
}
