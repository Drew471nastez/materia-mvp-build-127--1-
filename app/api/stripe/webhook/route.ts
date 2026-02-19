import { NextResponse } from "next/server"
import { headers } from "next/headers"
import type Stripe from "stripe"
import { stripe } from "@/lib/stripe"
import { createClient } from "@supabase/supabase-js"
import { generateReceiptToken } from "@/lib/security"
import { sendOrderEmails, triggerEmailFlows, sendPayoutStatusEmail } from "@/lib/email"
import { v4 as uuidv4 } from "uuid"

export const runtime = "nodejs"

const supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

// LIVE Stripe Price IDs
const PRICE_GROWTH = process.env.PRICE_GROWTH_MONTHLY || "price_1SzBWaBYevnBVyznNCTOXDoS"
const PRICE_PRO = process.env.PRICE_PRO_MONTHLY || "price_1SzBXSBYevnBVyznYjXfOOXX"

function safeTimestamp(ts: any): string {
  if (!ts) return new Date().toISOString()
  if (ts instanceof Date) return ts.toISOString()
  if (typeof ts === "string") return ts
  if (typeof ts === "number" && !isNaN(ts)) {
    const d = ts > 1e12 ? new Date(ts) : new Date(ts * 1000)
    return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString()
  }
  return new Date().toISOString()
}

function planIdFromPriceId(priceId?: string): "free" | "growth" | "pro" {
  if (!priceId) return "free"
  if (priceId === PRICE_GROWTH) return "growth"
  if (priceId === PRICE_PRO) return "pro"
  if (priceId.includes("SzBWa")) return "growth"
  if (priceId.includes("SzBXS")) return "pro"
  return "free"
}

export async function POST(request: Request) {
  console.log("[Webhook] Received")

  const body = await request.text()
  const headersList = await headers()
  const signature = headersList.get("stripe-signature")

  if (!signature) {
    console.error("[Webhook] Missing Stripe signature")
    return NextResponse.json({ error: "Missing signature" }, { status: 400 })
  }

  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    console.error("[Webhook] Missing STRIPE_WEBHOOK_SECRET env")
    return NextResponse.json({ error: "Missing webhook secret" }, { status: 500 })
  }

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, signature, process.env.STRIPE_WEBHOOK_SECRET)
    console.log("[Webhook] Event type:", event.type)
  } catch (err) {
    console.error("[Webhook] Signature verification failed:", err)
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 })
  }

  // ============================================================================
  // checkout.session.completed
  // ============================================================================
  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session

    console.log("[Webhook] Checkout session:", session.id, "mode:", session.mode)

    // --- SETUP MODE: Adding payment method without charging ---
    if (session.mode === "setup") {
      const setupCreatorId = session.metadata?.creator_id
      const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id
      const setupIntentId = typeof session.setup_intent === "string" ? session.setup_intent : session.setup_intent?.id

      console.log("[Webhook] Setup session for creator:", setupCreatorId)

      if (setupIntentId && setupCreatorId) {
        try {
          const setupIntent = await stripe.setupIntents.retrieve(setupIntentId)
          const paymentMethodId = typeof setupIntent.payment_method === "string"
            ? setupIntent.payment_method
            : setupIntent.payment_method?.id

          if (paymentMethodId) {
            const pm = await stripe.paymentMethods.retrieve(paymentMethodId)

            if (customerId) {
              await stripe.customers.update(customerId, {
                invoice_settings: { default_payment_method: paymentMethodId },
              })
            }

            await supabaseAdmin.from("payment_methods").upsert({
              creator_id: setupCreatorId,
              stripe_payment_method_id: paymentMethodId,
              card_brand: pm.card?.brand || "unknown",
              card_last4: pm.card?.last4 || "0000",
              card_exp_month: pm.card?.exp_month || 0,
              card_exp_year: pm.card?.exp_year || 0,
              is_default: true,
            }, { onConflict: "creator_id, stripe_payment_method_id" })

            console.log("[Webhook] Payment method saved for creator:", setupCreatorId)
          }
        } catch (err) {
          console.error("[Webhook] Error saving setup payment method:", err)
        }
      }

      return NextResponse.json({ received: true, message: "Setup session processed" })
    }

    // --- SUBSCRIPTION MODE: New subscription checkout ---
    if (session.mode === "subscription") {
      const metadata = session.metadata || {}
      const creatorId = metadata.creator_id
      const planId = metadata.plan_id

      console.log("[Webhook] Subscription checkout for creator:", creatorId, "plan:", planId)

      // Subscription events (created/updated) handle the actual DB sync
      // Here we just save the payment method from the subscription checkout
      if (creatorId && session.customer) {
        try {
          const customerId = typeof session.customer === "string" ? session.customer : session.customer.id

          // Save payment method from the subscription
          const customer = await stripe.customers.retrieve(customerId) as Stripe.Customer
          const defaultPmId = customer.invoice_settings?.default_payment_method
          if (defaultPmId) {
            const pmId = typeof defaultPmId === "string" ? defaultPmId : defaultPmId.id
            const pm = await stripe.paymentMethods.retrieve(pmId)

            await supabaseAdmin.from("payment_methods").upsert({
              creator_id: creatorId,
              stripe_payment_method_id: pmId,
              card_brand: pm.card?.brand || "unknown",
              card_last4: pm.card?.last4 || "0000",
              card_exp_month: pm.card?.exp_month || 0,
              card_exp_year: pm.card?.exp_year || 0,
              is_default: true,
            }, { onConflict: "creator_id, stripe_payment_method_id" })

            console.log("[Webhook] Subscription payment method saved")
          }
        } catch (err) {
          console.error("[Webhook] Error saving subscription payment method:", err)
        }
      }

      // Don't process further as product checkout - just return
      if (!metadata.product_id) {
        return NextResponse.json({ received: true, message: "Subscription checkout processed" })
      }
    }

    // --- PAYMENT MODE: Product purchase checkout ---
    if (session.payment_status !== "paid") {
      console.log("[Webhook] Payment not completed yet:", session.payment_status)
      return NextResponse.json({ received: true, message: "Payment not completed" })
    }

    const metadata = session.metadata || {}
    const productId = metadata.product_id
    const creatorId = metadata.creator_id
    const buyerId = metadata.buyer_id || null

    const buyerEmail = (session.customer_details?.email || metadata.buyer_email || "").toString()
    const buyerFirstName = (metadata.buyer_first_name || "").toString()
    const buyerLastName = (metadata.buyer_last_name || "").toString()

    const tipCents = Number.parseInt(metadata.tip_cents || "0", 10) || 0
    const accessToken = metadata.access_token || null
    const sessionFingerprint = metadata.session_fingerprint || null
    const receiptToken = metadata.receipt_token || generateReceiptToken()

    if (!productId || !creatorId) {
      console.log("[Webhook] Missing product metadata, skipping order creation")
      return NextResponse.json({ received: true, message: "No product metadata" })
    }

    // idempotency: prevent duplicates
    const { data: existingOrder } = await supabaseAdmin
      .from("orders")
      .select("id")
      .eq("stripe_session_id", session.id)
      .maybeSingle()

    if (existingOrder) {
      console.log("[Webhook] Order already exists:", existingOrder.id)
      return NextResponse.json({ received: true, message: "Already processed" })
    }

    const totalAmount = session.amount_total || 0

    // Fallback fee: 6% + $0.25 (only if >= $3.00)
    const fallbackFee = Math.round(totalAmount * 0.06) + (totalAmount >= 300 ? 25 : 0)
    const platformFeeCents =
      Number.parseInt(metadata.platform_fee_cents || "0", 10) || fallbackFee

    let applicationFeeAmount = platformFeeCents
    let transferId: string | null = null
    let destinationPaymentId: string | null = null

    let paymentMethod = "card"
    let cardBrand: string | null = null
    let cardLast4: string | null = null
    let paypalEmail: string | null = null

    try {
      if (session.payment_intent) {
        const paymentIntent = await stripe.paymentIntents.retrieve(session.payment_intent as string, {
          expand: ["charges", "transfer", "payment_method"],
        }) as any

        if (paymentIntent.application_fee_amount) {
          applicationFeeAmount = paymentIntent.application_fee_amount
        }

        if (paymentIntent.transfer) {
          transferId = typeof paymentIntent.transfer === "string" ? paymentIntent.transfer : paymentIntent.transfer.id
        }

        if (paymentIntent.charges?.data?.[0]) {
          destinationPaymentId = (paymentIntent.charges.data[0].destination_payment as string) || null

          const charge = paymentIntent.charges.data[0]
          if (charge.payment_method_details) {
            const pmDetails = charge.payment_method_details
            if (pmDetails.card) {
              paymentMethod = "card"
              cardBrand = pmDetails.card.brand || null
              cardLast4 = pmDetails.card.last4 || null
            } else if (pmDetails.paypal) {
              paymentMethod = "paypal"
              paypalEmail = (pmDetails.paypal as any).payer_email || null
            } else if (pmDetails.type) {
              paymentMethod = pmDetails.type
            }
          }
        }
      }
    } catch (error) {
      console.error("[Webhook] Failed to retrieve payment intent details:", error)
    }

    let productTitle = (metadata.product_title || "").toString().trim()
    if (!productTitle) {
      const { data: productRow } = await supabaseAdmin.from("products").select("title").eq("id", productId).maybeSingle()
      productTitle = productRow?.title || "Product"
    }

    const variantId = metadata.variant_id || null
    const variantName = metadata.variant_name || null

    const orderData: any = {
      buyer_id: buyerId || null,
      buyer_first_name: buyerFirstName || null,
      buyer_last_name: buyerLastName || null,
      buyer_email: buyerEmail || null,
      product_id: productId,
      amount_cents: totalAmount,
      tip_cents: tipCents,
      fee_cents: applicationFeeAmount,
      application_fee_cents: applicationFeeAmount,
      transfer_id: transferId,
      currency: session.currency || "usd",
      provider: "stripe",
      status: "completed",
      stripe_session_id: session.id,
      stripe_payment_intent_id: session.payment_intent as string,
      session_fingerprint: sessionFingerprint,
      receipt_token: receiptToken,
      allowed_fingerprints: sessionFingerprint ? [sessionFingerprint] : [],
      agreed_to_terms: metadata.agreed_to_terms === "true",
      agreed_at: metadata.agreed_at || null,
      payment_method: paymentMethod,
      card_brand: cardBrand,
      card_last4: cardLast4,
      paypal_email: paypalEmail,
      buyer_country: metadata.buyer_country || null,
      buyer_country_code: metadata.buyer_country_code || null,
      buyer_device_type: metadata.buyer_device_type || null,
      buyer_os: metadata.buyer_os || null,
      buyer_browser: metadata.buyer_browser || null,
      variant_id: variantId || null,
      variant_name: variantName || null,
    }

    if (!buyerId) {
      orderData.access_token = accessToken
    }

    // Try full insert first, fallback to minimal if it fails
    let order = null
    let orderInsertError = null

    const result1 = await supabaseAdmin.from("orders").insert(orderData).select().single()
    order = result1.data
    orderInsertError = result1.error

    if (orderInsertError) {
      console.log("[Webhook] Full insert failed, trying minimal:", orderInsertError.message)

      const minimalOrderData: Record<string, any> = {
        product_id: productId,
        amount_cents: totalAmount,
        status: "completed",
        stripe_session_id: session.id,
        stripe_payment_intent_id: session.payment_intent as string,
        receipt_token: receiptToken,
        buyer_email: buyerEmail || null,
      }

      if (buyerId) {
        minimalOrderData.buyer_id = buyerId
      }

      const result2 = await supabaseAdmin.from("orders").insert(minimalOrderData).select().single()
      order = result2.data
      orderInsertError = result2.error
    }

    if (orderInsertError) {
      console.error("[Webhook] Order creation failed:", orderInsertError)
      return NextResponse.json({ error: "Failed to create order" }, { status: 500 })
    }

    console.log("[Webhook] Order created:", order.id)

    // Customer record upsert
    if (buyerEmail && creatorId) {
      await supabaseAdmin.from("customers").upsert(
        {
          email: buyerEmail.toLowerCase().trim(),
          creator_id: creatorId,
          first_name: buyerFirstName || null,
          last_name: buyerLastName || null,
          order_count: 1,
          total_spent_cents: totalAmount,
        },
        { onConflict: "email,creator_id", ignoreDuplicates: false }
      )

      const normalizedEmail = buyerEmail.toLowerCase().trim()
      const { data: existingSubscriber } = await supabaseAdmin
        .from("subscribers")
        .select("id, status")
        .eq("creator_id", creatorId)
        .eq("email", normalizedEmail)
        .maybeSingle()

      if (!existingSubscriber) {
        const unsubscribeToken = uuidv4()
        const buyerName = `${buyerFirstName || ""} ${buyerLastName || ""}`.trim() || null
        await supabaseAdmin.from("subscribers").insert({
          email: normalizedEmail,
          name: buyerName,
          source: "checkout",
          source_id: order.id,
          creator_id: creatorId,
          status: "subscribed",
          is_active: true,
          subscribed_at: new Date().toISOString(),
          consent_text: "Subscribed via product checkout",
          consent_timestamp: new Date().toISOString(),
          unsubscribe_token: unsubscribeToken,
        })
      } else if (existingSubscriber.status === "unsubscribed") {
        await supabaseAdmin
          .from("subscribers")
          .update({
            status: "subscribed",
            is_active: true,
            subscribed_at: new Date().toISOString(),
            unsubscribed_at: null,
          })
          .eq("id", existingSubscriber.id)
      }
    }

    // Entitlement
    if (buyerId) {
      let entitlementQuery = supabaseAdmin
        .from("entitlements")
        .select("id")
        .eq("buyer_id", buyerId)
        .eq("product_id", productId)

      if (variantId) {
        entitlementQuery = entitlementQuery.eq("variant_id", variantId)
      } else {
        entitlementQuery = entitlementQuery.is("variant_id", null)
      }

      const { data: existingEntitlement } = await entitlementQuery.maybeSingle()

      if (!existingEntitlement) {
        const { error: entErr } = await supabaseAdmin.from("entitlements").insert({
          buyer_id: buyerId,
          creator_id: creatorId,
          product_id: productId,
          variant_id: variantId || null,
          community_access: metadata.includes_community === "true" || metadata.product_type === "course",
        })
        if (entErr) console.error("[Webhook] Entitlement error:", entErr)
      }
    }

    // Sales count
    const { error: salesErr } = await supabaseAdmin.rpc("increment_product_sales", { p_product_id: productId })
    if (salesErr) console.error("[Webhook] Failed to increment sales:", salesErr)

    // Analytics
    const { error: analyticsErr } = await supabaseAdmin
      .from("analytics_events")
      .insert({ creator_id: creatorId, product_id: productId, event_type: "purchase" })
    if (analyticsErr) console.error("[Webhook] Analytics error:", analyticsErr)

    // Emails
    try {
      const baseUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "https://storelib.com"

      await sendOrderEmails(supabaseAdmin, {
        orderId: order.id,
        creatorId,
        buyerEmail,
        buyerFirstName,
        buyerLastName,
        productTitle,
        receiptToken,
        amountCents: totalAmount,
        feeCents: applicationFeeAmount,
        baseUrl,
        variantName: variantName || null,
      })

      try {
        await triggerEmailFlows(supabaseAdmin, {
          triggerType: "purchase",
          creatorId,
          recipientEmail: buyerEmail,
          recipientName: buyerFirstName,
          productTitle,
          productId,
          orderId: order.id,
        })
      } catch (flowErr) {
        console.error("[Webhook] Email flow trigger error (non-fatal):", flowErr)
      }
    } catch (emailErr) {
      console.error("[Webhook] Email sending failed (order still ok):", emailErr)
    }

    return NextResponse.json({ received: true })
  }

  // ============================================================================
  // payment_intent.succeeded
  // ============================================================================
  if (event.type === "payment_intent.succeeded") {
    const pi = event.data.object as Stripe.PaymentIntent

    const { data: existingOrder } = await supabaseAdmin
      .from("orders")
      .select("id")
      .eq("stripe_payment_intent_id", pi.id)
      .maybeSingle()

    if (existingOrder) {
      return NextResponse.json({ received: true, message: "Already processed" })
    }
  }

  if (event.type === "payment_intent.payment_failed") {
    const pi = event.data.object as Stripe.PaymentIntent
    console.error("[Webhook] Payment failed:", pi.id, pi.last_payment_error?.message)
  }

  // ============================================================================
  // SUBSCRIPTION EVENTS
  // ============================================================================

  if (event.type === "customer.subscription.created") {
    const subscription = event.data.object as any
    const metadata = subscription.metadata || {}
    const creatorId = metadata.creator_id
    const planId = metadata.plan_id

    console.log("[Subscription] Created:", subscription.id, "creator:", creatorId, "plan:", planId)

    if (!creatorId || !planId) {
      console.error("[Subscription] Missing metadata")
      return NextResponse.json({ received: true, message: "Missing metadata" })
    }

    try {
      const subAny = subscription as any
      let periodStart = subAny.current_period_start || subAny.current_period?.start_date || null
      let periodEnd = subAny.current_period_end || subAny.current_period?.end_date || null
      // Fallback to latest_invoice period
      if (!periodStart || !periodEnd) {
        const inv = typeof subAny.latest_invoice === "object" ? subAny.latest_invoice : null
        if (inv?.period_start) periodStart = periodStart || inv.period_start
        if (inv?.period_end) periodEnd = periodEnd || inv.period_end
      }

      // Upsert subscription record (may already exist from a previous attempt)
      await supabaseAdmin.from("subscriptions").upsert({
        creator_id: creatorId,
        stripe_subscription_id: subscription.id,
        stripe_customer_id: subscription.customer as string,
        plan_id: planId,
        status: subscription.status,
        current_period_start: safeTimestamp(periodStart),
        current_period_end: safeTimestamp(periodEnd),
        cancel_at_period_end: subscription.cancel_at_period_end,
      }, { onConflict: "creator_id" })

      await supabaseAdmin
        .from("creators")
        .update({
          subscription_plan_id: planId,
          subscription_status: subscription.status,
          stripe_customer_id: subscription.customer as string,
        })
        .eq("id", creatorId)

      console.log("[Subscription] Created successfully")
    } catch (error) {
      console.error("[Subscription] Error creating:", error)
    }

    return NextResponse.json({ received: true })
  }

  if (event.type === "customer.subscription.updated") {
    const subscription = event.data.object as any

    console.log("[Subscription] Updated:", subscription.id, "Status:", subscription.status)

    try {
      const { data: existingSubscription } = await supabaseAdmin
        .from("subscriptions")
        .select("id, creator_id, plan_id")
        .eq("stripe_subscription_id", subscription.id)
        .maybeSingle()

      if (!existingSubscription) {
        console.log("[Subscription] No existing record found")
        return NextResponse.json({ received: true, message: "No existing subscription" })
      }

      const currentPriceId = subscription.items?.data?.[0]?.price?.id
      let planId = planIdFromPriceId(currentPriceId)
      const metadata = subscription.metadata || {}
      if (metadata.pending_plan_id && subscription.status === "active") {
        planId = metadata.pending_plan_id
      } else if (metadata.plan_id) {
        planId = metadata.plan_id
      }

      let updPeriodStart = subscription.current_period_start || subscription.current_period?.start_date || null
      let updPeriodEnd = subscription.current_period_end || subscription.current_period?.end_date || null
      if (!updPeriodStart || !updPeriodEnd) {
        const inv = typeof subscription.latest_invoice === "object" ? subscription.latest_invoice : null
        if (inv?.period_start) updPeriodStart = updPeriodStart || inv.period_start
        if (inv?.period_end) updPeriodEnd = updPeriodEnd || inv.period_end
      }

      await supabaseAdmin
        .from("subscriptions")
        .update({
          status: subscription.status,
          plan_id: planId,
          current_period_start: safeTimestamp(updPeriodStart),
          current_period_end: safeTimestamp(updPeriodEnd),
          cancel_at_period_end: subscription.cancel_at_period_end,
          pending_plan_id: metadata.pending_plan_id && subscription.status !== "active" ? metadata.pending_plan_id : null,
          canceled_at: subscription.canceled_at ? safeTimestamp(subscription.canceled_at) : null,
          updated_at: new Date().toISOString(),
        })
        .eq("stripe_subscription_id", subscription.id)

      // If subscription is no longer active/trialing, force plan to "free"
      // so fee calculation always defaults correctly
      const isSubscriptionActive = ["active", "trialing"].includes(subscription.status)
      const creatorPlanId = isSubscriptionActive ? planId : "free"

      await supabaseAdmin
        .from("creators")
        .update({
          subscription_plan_id: creatorPlanId,
          subscription_status: isSubscriptionActive ? subscription.status : "active",
        })
        .eq("id", existingSubscription.creator_id)

      console.log("[Subscription] Creator plan synced:", {
        creatorId: existingSubscription.creator_id,
        stripeStatus: subscription.status,
        resolvedPlanId: creatorPlanId,
        isActive: isSubscriptionActive,
      })

      if (subscription.status === "active" && metadata.pending_plan_id) {
        await stripe.subscriptions.update(subscription.id, {
          metadata: { ...metadata, pending_plan_id: "" },
        })
      }

      console.log("[Subscription] Updated successfully")
    } catch (error) {
      console.error("[Subscription] Error updating:", error)
    }

    return NextResponse.json({ received: true })
  }

  if (event.type === "customer.subscription.deleted") {
    const subscription = event.data.object as Stripe.Subscription & { current_period_start: number; current_period_end: number }

    console.log("[Subscription] Deleted:", subscription.id)

    try {
      const { data: existingSubscription } = await supabaseAdmin
        .from("subscriptions")
        .select("id, creator_id")
        .eq("stripe_subscription_id", subscription.id)
        .maybeSingle()

      if (!existingSubscription) {
        return NextResponse.json({ received: true, message: "No existing subscription" })
      }

      await supabaseAdmin
        .from("subscriptions")
        .update({
          status: "canceled",
          canceled_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("stripe_subscription_id", subscription.id)

      await supabaseAdmin
        .from("creators")
        .update({
          subscription_plan_id: "free",
          subscription_status: "active",
        })
        .eq("id", existingSubscription.creator_id)

      console.log("[Subscription] Reverted to free plan")
    } catch (error) {
      console.error("[Subscription] Error handling deletion:", error)
    }

    return NextResponse.json({ received: true })
  }

  // ============================================================================
  // INVOICE EVENTS
  // ============================================================================

  if (event.type === "invoice.paid" || event.type === "invoice.payment_succeeded") {
    const invoice = event.data.object as Stripe.Invoice & { subscription?: string; period_start?: number; period_end?: number }

    console.log("[Invoice] Paid:", invoice.id)

    if (!invoice.subscription) {
      return NextResponse.json({ received: true, message: "Not a subscription invoice" })
    }

    try {
      const { data: subscription } = await supabaseAdmin
        .from("subscriptions")
        .select("id, creator_id")
        .eq("stripe_subscription_id", invoice.subscription as string)
        .maybeSingle()

      if (!subscription) {
        return NextResponse.json({ received: true, message: "No subscription found" })
      }

      // Upsert invoice to avoid duplicates
      await supabaseAdmin.from("invoices").upsert({
        creator_id: subscription.creator_id,
        subscription_id: subscription.id,
        stripe_invoice_id: invoice.id,
        amount_cents: invoice.amount_paid,
        status: "paid",
        invoice_pdf_url: invoice.invoice_pdf || null,
        hosted_invoice_url: invoice.hosted_invoice_url || null,
        period_start: invoice.period_start ? safeTimestamp(invoice.period_start) : null,
        period_end: invoice.period_end ? safeTimestamp(invoice.period_end) : null,
      }, { onConflict: "stripe_invoice_id" })

      console.log("[Invoice] Record saved")
    } catch (error) {
      console.error("[Invoice] Error:", error)
    }

    return NextResponse.json({ received: true })
  }

  if (event.type === "invoice.payment_failed") {
    const invoice = event.data.object as Stripe.Invoice & { subscription?: string; period_start?: number; period_end?: number }

    console.log("[Invoice] Payment failed:", invoice.id)

    if (!invoice.subscription) {
      return NextResponse.json({ received: true, message: "Not a subscription invoice" })
    }

    try {
      const { data: subscription } = await supabaseAdmin
        .from("subscriptions")
        .select("id, creator_id")
        .eq("stripe_subscription_id", invoice.subscription as string)
        .maybeSingle()

      if (!subscription) {
        return NextResponse.json({ received: true, message: "No subscription found" })
      }

      await supabaseAdmin
        .from("subscriptions")
        .update({
          status: "past_due",
          updated_at: new Date().toISOString(),
        })
        .eq("stripe_subscription_id", invoice.subscription as string)

      await supabaseAdmin
        .from("creators")
        .update({ subscription_status: "past_due" })
        .eq("id", subscription.creator_id)

      console.log("[Invoice] Subscription set to past_due")
    } catch (error) {
      console.error("[Invoice] Error:", error)
    }

    return NextResponse.json({ received: true })
  }

  // ============================================================================
  // CONNECT ACCOUNT EVENTS
  // ============================================================================

  if (event.type === "account.updated") {
    const account = event.data.object as Stripe.Account

    console.log("[Connect] Account updated:", account.id)

    try {
      const { data: creator } = await supabaseAdmin
        .from("creators")
        .select("id")
        .eq("stripe_account_id", account.id)
        .maybeSingle()

      if (creator) {
        const chargesEnabled = account.charges_enabled || false
        const payoutsEnabled = account.payouts_enabled || false
        const detailsSubmitted = account.details_submitted || false
        const onboardingStatus = chargesEnabled && payoutsEnabled && detailsSubmitted ? "connected" : "pending"

        await supabaseAdmin
          .from("creators")
          .update({
            charges_enabled: chargesEnabled,
            payouts_enabled: payoutsEnabled,
            details_submitted: detailsSubmitted,
            stripe_onboarding_status: onboardingStatus,
            stripe_connected_at: onboardingStatus === "connected" ? new Date().toISOString() : null,
          })
          .eq("id", creator.id)

        console.log("[Connect] Updated creator:", creator.id, "status:", onboardingStatus)
      }
    } catch (error) {
      console.error("[Connect] Error updating account:", error)
    }

    return NextResponse.json({ received: true })
  }

  // ============================================================================
  // REFUND EVENTS — sync refunds initiated from Stripe Dashboard
  // ============================================================================

  if (event.type === "charge.refunded") {
    const charge = event.data.object as Stripe.Charge
    const paymentIntentId = typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id

    console.log("[Webhook] Charge refunded:", charge.id, "PI:", paymentIntentId)

    if (paymentIntentId) {
      try {
        // Find the order by stripe_payment_intent_id
        const { data: order } = await supabaseAdmin
          .from("orders")
          .select("id, status, amount_cents")
          .eq("stripe_payment_intent_id", paymentIntentId)
          .maybeSingle()

        if (order && order.status !== "refunded") {
          // Update status first (column always exists)
          await supabaseAdmin
            .from("orders")
            .update({ status: "refunded" })
            .eq("id", order.id)

          // Try extra refund columns (may not exist yet)
          try {
            const refund = charge.refunds?.data?.[0]
            const refundAmountCents = charge.amount_refunded || order.amount_cents
            await supabaseAdmin
              .from("orders")
              .update({
                refunded_at: new Date().toISOString(),
                refund_reason: refund?.reason || "requested_by_customer",
                refund_amount_cents: refundAmountCents,
                stripe_refund_id: refund?.id || null,
              })
              .eq("id", order.id)
          } catch {
            // Extra columns may not exist yet
          }

          console.log("[Webhook] Order", order.id, "marked as refunded via webhook")
        }
      } catch (error) {
        console.error("[Webhook] Error processing charge.refunded:", error)
      }
    }

    return NextResponse.json({ received: true })
  }

  // ============================================================================
  // PAYOUT EVENTS — from connected seller accounts (Connect webhooks)
  // event.account = the connected Stripe account ID
  // ============================================================================

  if (
    event.type === "payout.created" ||
    event.type === "payout.paid" ||
    event.type === "payout.failed" ||
    event.type === "payout.updated" ||
    event.type === "payout.canceled"
  ) {
    const payout = event.data.object as Stripe.Payout
    const connectedAccountId = (event as any).account as string | undefined

    console.log(`[Webhook] ${event.type}:`, payout.id, "account:", connectedAccountId)

    if (!connectedAccountId) {
      // Not a Connect event — ignore
      return NextResponse.json({ received: true })
    }

    // Find the creator by their connected Stripe account
    const { data: creator } = await supabaseAdmin
      .from("creators")
      .select("id, user_id")
      .eq("stripe_account_id", connectedAccountId)
      .maybeSingle()

    if (!creator) {
      console.log("[Webhook] No creator found for account:", connectedAccountId)
      return NextResponse.json({ received: true })
    }

    const arrivalDate = payout.arrival_date
      ? new Date(payout.arrival_date * 1000).toISOString()
      : null

    const destination =
      typeof payout.destination === "string"
        ? payout.destination
        : (payout.destination as any)?.last4
          ? `****${(payout.destination as any).last4}`
          : null

    // Upsert payout record in DB
    try {
      await supabaseAdmin.from("payouts").upsert(
        {
          creator_id: creator.id,
          stripe_payout_id: payout.id,
          amount_cents: payout.amount,
          currency: payout.currency,
          status: payout.status,
          arrival_date: arrivalDate,
          description: payout.description,
          destination,
          method: payout.method,
          failure_code: (payout as any).failure_code || null,
          failure_message: (payout as any).failure_message || null,
          stripe_created: new Date(payout.created * 1000).toISOString(),
          webhook_received_at: new Date().toISOString(),
        },
        { onConflict: "stripe_payout_id" }
      )
    } catch (err) {
      console.error("[Webhook] Failed to upsert payout:", err)
    }

    // Send email notification for status transitions
    try {
      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("email, display_name")
        .eq("user_id", creator.user_id)
        .maybeSingle()

      if (profile?.email && (event.type === "payout.paid" || event.type === "payout.failed" || event.type === "payout.created")) {
        await sendPayoutStatusEmail({
          to: profile.email,
          sellerName: profile.display_name || "Seller",
          amountCents: payout.amount,
          currency: payout.currency,
          payoutId: payout.id,
          status: payout.status,
          arrivalDate,
          failureMessage: (payout as any).failure_message || null,
          eventType: event.type,
        })
      }
    } catch (emailErr) {
      console.error("[Webhook] Payout email failed (non-fatal):", emailErr)
    }

    return NextResponse.json({ received: true })
  }

  return NextResponse.json({ received: true })
}
