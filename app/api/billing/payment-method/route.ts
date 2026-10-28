import { moneyCaller } from "@/lib/team/money"
import { recordTeamAction } from "@/lib/team/areas"
import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { stripe, getOrCreateStripeCustomer } from "@/lib/stripe"

const SUBSCRIBED_STATUSES = new Set(["active", "trialing", "past_due"])

export async function DELETE(request: Request) {
  try {
    /* The owner, or a team member who may change the store's billing (round 42, lib/team/money): the store's own plan and Stripe customer, never the member's. */
    const who = await moneyCaller("billing", "manage")
    if (!who.ok) return who.response

    const { data: creator } = await createAdminClient()
      .from("creators")
      .select("id, stripe_customer_id, slug, username")
      .eq("id", who.creatorId)
      .single()

    if (!creator) {
      return NextResponse.json({ error: "Creator not found" }, { status: 404 })
    }

    const body = await request.json().catch(() => ({}))
    const paymentMethodId = typeof body?.paymentMethodId === "string" ? body.paymentMethodId : null

    const customerId = await getOrCreateStripeCustomer({
      creatorId: creator.id,
      existingCustomerId: creator.stripe_customer_id,
      email: who.ownerEmail,
      userId: who.ownerUserId,
      username: creator.username || creator.slug || "creator",
    })

    const customer = await stripe.customers.retrieve(customerId)
    if ((customer as any).deleted) {
      return NextResponse.json({ error: "Stripe customer not found" }, { status: 404 })
    }

    const paymentMethods = await stripe.paymentMethods.list({
      customer: customerId,
      type: "card",
      limit: 10,
    })

    const targetPm = paymentMethodId
      ? paymentMethods.data.find((pm) => pm.id === paymentMethodId)
      : paymentMethods.data[0]

    if (!targetPm) {
      return NextResponse.json({ error: "No payment method found" }, { status: 404 })
    }

    const defaultPm = typeof customer.invoice_settings.default_payment_method === "string"
      ? customer.invoice_settings.default_payment_method
      : customer.invoice_settings.default_payment_method?.id || null

    const isDefault = defaultPm === targetPm.id

    const subscriptions = await stripe.subscriptions.list({
      customer: customerId,
      limit: 20,
    })

    const activeOrTrialingSubscription = subscriptions.data.find((sub) => SUBSCRIBED_STATUSES.has(sub.status))

    if (isDefault && activeOrTrialingSubscription) {
      const replacement = paymentMethods.data.find((pm) => pm.id !== targetPm.id)
      if (!replacement) {
        return NextResponse.json(
          { error: "Add a new payment method first to keep your subscription active." },
          { status: 400 },
        )
      }

      await stripe.customers.update(customerId, {
        invoice_settings: { default_payment_method: replacement.id },
      })
    }

    if (isDefault && !activeOrTrialingSubscription) {
      const replacement = paymentMethods.data.find((pm) => pm.id !== targetPm.id)
      await stripe.customers.update(customerId, {
        invoice_settings: { default_payment_method: replacement?.id ?? null },
      })
    }

    await stripe.paymentMethods.detach(targetPm.id)

    const refreshedCustomer = await stripe.customers.retrieve(customerId)
    const refreshedMethods = await stripe.paymentMethods.list({
      customer: customerId,
      type: "card",
      limit: 10,
    })
    const refreshedDefaultPm = typeof refreshedCustomer.invoice_settings.default_payment_method === "string"
      ? refreshedCustomer.invoice_settings.default_payment_method
      : refreshedCustomer.invoice_settings.default_payment_method?.id || null

    /* A team member's change to the owner's plan is on the record with their name (lib/team/areas). */
    await recordTeamAction(who, who.userId, "billing_manage", "billing_payment_method_changed", {})
    return NextResponse.json({
      success: true,
      defaultPaymentMethodId: refreshedDefaultPm,
      paymentMethods: refreshedMethods.data.map((pm) => ({
        id: pm.id,
        brand: pm.card?.brand || "unknown",
        last4: pm.card?.last4 || "0000",
        expMonth: pm.card?.exp_month || 0,
        expYear: pm.card?.exp_year || 0,
      })),
    })
  } catch (error: any) {
    console.error("Error in DELETE /api/billing/payment-method:", error)
    return NextResponse.json({ error: error.message || "Failed to remove payment method" }, { status: 500 })
  }
}
