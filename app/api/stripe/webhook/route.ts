import { NextResponse } from "next/server"
import { headers } from "next/headers"
import type Stripe from "stripe"
import { stripe } from "@/lib/stripe"
import { createClient } from "@supabase/supabase-js"
import { generateReceiptToken } from "@/lib/security"
import { sendOrderEmails, triggerEmailFlows } from "@/lib/email"
import { v4 as uuidv4 } from "uuid"

export const runtime = "nodejs"

const supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

export async function POST(request: Request) {
  console.log("[v0] Webhook received")

  const body = await request.text()
  const headersList = await headers()
  const signature = headersList.get("stripe-signature")

  if (!signature) {
    console.error("[v0] Missing Stripe signature")
    return NextResponse.json({ error: "Missing signature" }, { status: 400 })
  }

  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    console.error("[v0] Missing STRIPE_WEBHOOK_SECRET env")
    return NextResponse.json({ error: "Missing webhook secret" }, { status: 500 })
  }

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, signature, process.env.STRIPE_WEBHOOK_SECRET)
    console.log("[v0] Webhook event type:", event.type)
  } catch (err) {
    console.error("[v0] Signature verification failed:", err)
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 })
  }

  // --------------------------------------------
  // ✅ MAIN PAID FLOW
  // --------------------------------------------
  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session

    console.log("[v0] Processing checkout session:", session.id, "mode:", session.mode)

    // Handle setup mode sessions (adding payment method without charging)
    if (session.mode === "setup") {
      const setupCreatorId = session.metadata?.creator_id
      const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id
      const setupIntentId = typeof session.setup_intent === "string" ? session.setup_intent : session.setup_intent?.id

      console.log("[v0] Setup session completed for creator:", setupCreatorId)

      if (setupIntentId && setupCreatorId) {
        try {
          const setupIntent = await stripe.setupIntents.retrieve(setupIntentId)
          const paymentMethodId = typeof setupIntent.payment_method === "string"
            ? setupIntent.payment_method
            : setupIntent.payment_method?.id

          if (paymentMethodId) {
            const pm = await stripe.paymentMethods.retrieve(paymentMethodId)

            // Set as default payment method for the customer
            if (customerId) {
              await stripe.customers.update(customerId, {
                invoice_settings: { default_payment_method: paymentMethodId },
              })
            }

            // Save to database
            await supabaseAdmin.from("payment_methods").upsert({
              creator_id: setupCreatorId,
              stripe_payment_method_id: paymentMethodId,
              card_brand: pm.card?.brand || "unknown",
              card_last4: pm.card?.last4 || "0000",
              card_exp_month: pm.card?.exp_month || 0,
              card_exp_year: pm.card?.exp_year || 0,
              is_default: true,
            }, { onConflict: "creator_id, stripe_payment_method_id" })

            console.log("[v0] Payment method saved for creator:", setupCreatorId)
          }
        } catch (err) {
          console.error("[v0] Error saving setup payment method:", err)
        }
      }

      return NextResponse.json({ received: true, message: "Setup session processed" })
    }

    // NOTE: For card payments, this should already be "paid".
    // If you support async methods, you might want to also handle checkout.session.async_payment_succeeded.
    if (session.payment_status !== "paid") {
      console.log("[v0] Payment not completed yet:", session.payment_status)
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

    console.log("[v0] Session metadata:", { productId, creatorId, buyerId, buyerEmail })

    if (!productId || !creatorId) {
      console.error("[v0] Missing required metadata:", { productId, creatorId })
      return NextResponse.json({ error: "Missing metadata" }, { status: 400 })
    }

    // idempotency: prevent duplicates
    const { data: existingOrder } = await supabaseAdmin
      .from("orders")
      .select("id")
      .eq("stripe_session_id", session.id)
      .maybeSingle()

    if (existingOrder) {
      console.log("[v0] Order already exists:", existingOrder.id)
      return NextResponse.json({ received: true, message: "Already processed" })
    }

    const totalAmount = session.amount_total || 0

    // your platform fee logic (kept)
    const platformFeeCents =
      Number.parseInt(metadata.platform_fee_cents || "0", 10) || Math.round(totalAmount * 0.06) + 30

    let applicationFeeAmount = platformFeeCents
    let transferId: string | null = null
    let destinationPaymentId: string | null = null

    // Payment method details
    let paymentMethod = "card"
    let cardBrand: string | null = null
    let cardLast4: string | null = null
    let paypalEmail: string | null = null

    try {
      if (session.payment_intent) {
        const paymentIntent = await stripe.paymentIntents.retrieve(session.payment_intent as string, {
          expand: ["charges", "transfer", "payment_method"],
        })

        if (paymentIntent.application_fee_amount) {
          applicationFeeAmount = paymentIntent.application_fee_amount
        }

        if (paymentIntent.transfer) {
          transferId = typeof paymentIntent.transfer === "string" ? paymentIntent.transfer : paymentIntent.transfer.id
        }

        if (paymentIntent.charges?.data?.[0]) {
          destinationPaymentId = (paymentIntent.charges.data[0].destination_payment as string) || null

          // Get payment method details from the charge
          const charge = paymentIntent.charges.data[0]
          if (charge.payment_method_details) {
            const pmDetails = charge.payment_method_details

            if (pmDetails.card) {
              paymentMethod = "card"
              cardBrand = pmDetails.card.brand || null // visa, mastercard, amex, etc.
              cardLast4 = pmDetails.card.last4 || null
            } else if (pmDetails.paypal) {
              paymentMethod = "paypal"
              paypalEmail = (pmDetails.paypal as any).payer_email || null
            } else if (pmDetails.type) {
              paymentMethod = pmDetails.type
            }
          }
        }

        console.log("[v0] Payment Intent details:", {
          id: paymentIntent.id,
          application_fee_amount: applicationFeeAmount,
          transfer: transferId,
          destination_payment: destinationPaymentId,
          payment_method: paymentMethod,
          card_brand: cardBrand,
          card_last4: cardLast4,
        })
      }
    } catch (error) {
      console.error("[v0] Failed to retrieve payment intent details:", error)
    }

    // Get product title for email subject + seller email
    let productTitle = (metadata.product_title || "").toString().trim()
    if (!productTitle) {
      const { data: productRow } = await supabaseAdmin.from("products").select("title").eq("id", productId).maybeSingle()
      productTitle = productRow?.title || "Product"
    }

    // Get variant info from metadata
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

      // kept your fee fields as-is
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

      // Payment method details
      payment_method: paymentMethod,
      card_brand: cardBrand,
      card_last4: cardLast4,
      paypal_email: paypalEmail,

      // Device and geo info from checkout metadata
      buyer_country: metadata.buyer_country || null,
      buyer_country_code: metadata.buyer_country_code || null,
      buyer_device_type: metadata.buyer_device_type || null,
      buyer_os: metadata.buyer_os || null,
      buyer_browser: metadata.buyer_browser || null,

      // Variant info
      variant_id: variantId || null,
      variant_name: variantName || null,
    }

    if (!buyerId) {
      orderData.access_token = accessToken
    }

    console.log("[v0] Creating order with transfer details:", {
      fee: applicationFeeAmount,
      transfer: transferId,
      destination_payment: destinationPaymentId,
    })

    // Try full insert first, fallback to minimal if it fails
    let order = null
    let orderInsertError = null

    const result1 = await supabaseAdmin.from("orders").insert(orderData).select().single()
    order = result1.data
    orderInsertError = result1.error

    // If full insert fails, try with minimal fields only (including required receipt_token)
    if (orderInsertError) {
      console.log("[v0] Full insert failed, trying minimal fields:", orderInsertError.message)

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
      console.error("[v0] Order creation failed:", orderInsertError)
      return NextResponse.json({ error: "Failed to create order" }, { status: 500 })
    }

    console.log("[v0] ✅ Order created:", order.id)

    // Customer record upsert (kept)
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
        {
          onConflict: "email,creator_id",
          ignoreDuplicates: false,
        },
      )
      console.log("[v0] ✅ Customer record upserted")

      // Add buyer to seller's subscribers list for future email marketing
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
        console.log("[v0] ✅ Added buyer to subscribers:", normalizedEmail)
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
        console.log("[v0] ✅ Re-subscribed buyer:", normalizedEmail)
      } else {
        console.log("[v0] ✅ Buyer already subscribed:", normalizedEmail)
      }
    }

    // Entitlement - with per-variant access control
    if (buyerId) {
      // Check for existing entitlement for this SPECIFIC variant (or product if no variant)
      let entitlementQuery = supabaseAdmin
        .from("entitlements")
        .select("id")
        .eq("buyer_id", buyerId)
        .eq("product_id", productId)

      // If variant specified, check for that specific variant entitlement
      if (variantId) {
        entitlementQuery = entitlementQuery.eq("variant_id", variantId)
      } else {
        entitlementQuery = entitlementQuery.is("variant_id", null)
      }

      const { data: existingEntitlement } = await entitlementQuery.maybeSingle()

      if (!existingEntitlement) {
        console.log("[v0] Creating entitlement for user:", buyerId, "variant:", variantId || "none")

        const { error: entitlementError } = await supabaseAdmin.from("entitlements").insert({
          buyer_id: buyerId,
          creator_id: creatorId,
          product_id: productId,
          variant_id: variantId || null,
          community_access: metadata.includes_community === "true" || metadata.product_type === "course",
        })

        if (entitlementError) {
          console.error("[v0] Entitlement creation failed:", entitlementError)
        } else {
          console.log("[v0] ✅ Entitlement created for variant:", variantId || "none")
        }
      } else {
        console.log("[v0] ✅ Entitlement already exists for this variant")
      }
    }

    // Sales count (kept)
    console.log("[v0] Incrementing sales count...")
    await supabaseAdmin.rpc("increment_product_sales", { p_product_id: productId }).catch((err) => {
      console.error("[v0] Failed to increment sales:", err)
    })

    // Analytics (kept)
    console.log("[v0] Recording analytics...")
    await supabaseAdmin
      .from("analytics_events")
      .insert({
        creator_id: creatorId,
        product_id: productId,
        event_type: "purchase",
      })
      .catch((err) => {
        console.error("[v0] Failed to record analytics:", err)
      })

    // --------------------------------------------
    // ✅ EMAILS: Use the ONE working pipeline
    // This fixes paid emails not sending + keeps sender display_name logic
    // --------------------------------------------
    try {
      const baseUrl =
        process.env.SITE_URL ||
        process.env.NEXT_PUBLIC_SITE_URL ||
        process.env.NEXT_PUBLIC_APP_URL ||
        process.env.APP_URL ||
        "https://storelib.com"

      const emailResult = await sendOrderEmails(supabaseAdmin, {
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

      console.log("[v0] ✅ Email result:", emailResult)

      // Trigger email flows for purchase
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
        console.error("[v0] Email flow trigger error (non-fatal):", flowErr)
      }
    } catch (emailErr) {
      console.error("[v0] ❌ Email sending failed (order still ok):", emailErr)
      // IMPORTANT: do not fail webhook response — order is already created
    }

    console.log("[v0] Webhook processing complete")
    return NextResponse.json({ received: true })
  }

  // Optional logs (kept)
  if (event.type === "payment_intent.succeeded") {
    const pi = event.data.object as Stripe.PaymentIntent
    console.log("[v0] Processing payment intent:", pi.id)

    const { data: existingOrder } = await supabaseAdmin
      .from("orders")
      .select("id")
      .eq("stripe_payment_intent_id", pi.id)
      .maybeSingle()

    if (existingOrder) {
      console.log("[v0] Payment intent already processed via checkout session")
      return NextResponse.json({ received: true, message: "Already processed" })
    }

    const metadata = pi.metadata || {}
    const productId = metadata.product_id
    const creatorId = metadata.creator_id

    if (!productId || !creatorId) {
      console.log("[v0] Payment intent missing metadata, skipping")
      return NextResponse.json({ received: true, message: "Missing metadata" })
    }

    console.log("[v0] Processing payment intent as direct payment (no-op here)")
  }

  if (event.type === "payment_intent.payment_failed") {
    const pi = event.data.object as Stripe.PaymentIntent
    console.error("[v0] Payment failed:", pi.id, pi.last_payment_error?.message)
  }

  // ============================================================================
  // SUBSCRIPTION EVENT HANDLERS
  // ============================================================================

  // Handle subscription creation
  if (event.type === "customer.subscription.created") {
    const subscription = event.data.object as Stripe.Subscription
    const metadata = subscription.metadata || {}
    const creatorId = metadata.creator_id
    const planId = metadata.plan_id

    console.log("[Subscription] Created:", subscription.id, "for creator:", creatorId)

    if (!creatorId || !planId) {
      console.error("[Subscription] Missing creator_id or plan_id in metadata")
      return NextResponse.json({ received: true, message: "Missing metadata" })
    }

    try {
      // Create subscription record
      await supabaseAdmin.from("subscriptions").insert({
        creator_id: creatorId,
        stripe_subscription_id: subscription.id,
        stripe_customer_id: subscription.customer as string,
        plan_id: planId,
        status: subscription.status,
        current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
        current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
        cancel_at_period_end: subscription.cancel_at_period_end,
      })

      // Update creator's plan
      await supabaseAdmin
        .from("creators")
        .update({
          subscription_plan_id: planId,
          subscription_status: subscription.status,
          stripe_customer_id: subscription.customer as string,
        })
        .eq("id", creatorId)

      console.log("[Subscription] Successfully created subscription record")
    } catch (error) {
      console.error("[Subscription] Error creating subscription:", error)
    }

    return NextResponse.json({ received: true })
  }

  // Handle subscription updates
  if (event.type === "customer.subscription.updated") {
    const subscription = event.data.object as Stripe.Subscription

    console.log("[Subscription] Updated:", subscription.id, "Status:", subscription.status)

    try {
      // Get subscription record
      const { data: existingSubscription } = await supabaseAdmin
        .from("subscriptions")
        .select("id, creator_id, plan_id")
        .eq("stripe_subscription_id", subscription.id)
        .maybeSingle()

      if (!existingSubscription) {
        console.log("[Subscription] No existing record found, skipping update")
        return NextResponse.json({ received: true, message: "No existing subscription" })
      }

      // Update subscription record
      await supabaseAdmin
        .from("subscriptions")
        .update({
          status: subscription.status,
          current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
          current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
          cancel_at_period_end: subscription.cancel_at_period_end,
          canceled_at: subscription.canceled_at ? new Date(subscription.canceled_at * 1000).toISOString() : null,
          updated_at: new Date().toISOString(),
        })
        .eq("stripe_subscription_id", subscription.id)

      // Update creator's status
      await supabaseAdmin
        .from("creators")
        .update({
          subscription_status: subscription.status,
        })
        .eq("id", existingSubscription.creator_id)

      console.log("[Subscription] Successfully updated subscription")
    } catch (error) {
      console.error("[Subscription] Error updating subscription:", error)
    }

    return NextResponse.json({ received: true })
  }

  // Handle subscription deletion/cancellation
  if (event.type === "customer.subscription.deleted") {
    const subscription = event.data.object as Stripe.Subscription

    console.log("[Subscription] Deleted:", subscription.id)

    try {
      // Get subscription record
      const { data: existingSubscription } = await supabaseAdmin
        .from("subscriptions")
        .select("id, creator_id")
        .eq("stripe_subscription_id", subscription.id)
        .maybeSingle()

      if (!existingSubscription) {
        console.log("[Subscription] No existing record found")
        return NextResponse.json({ received: true, message: "No existing subscription" })
      }

      // Update subscription status
      await supabaseAdmin
        .from("subscriptions")
        .update({
          status: "canceled",
          canceled_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("stripe_subscription_id", subscription.id)

      // Revert creator to free plan
      await supabaseAdmin
        .from("creators")
        .update({
          subscription_plan_id: "free",
          subscription_status: "active",
        })
        .eq("id", existingSubscription.creator_id)

      console.log("[Subscription] Reverted creator to free plan")
    } catch (error) {
      console.error("[Subscription] Error handling deletion:", error)
    }

    return NextResponse.json({ received: true })
  }

  // Handle invoice payment succeeded
  if (event.type === "invoice.payment_succeeded") {
    const invoice = event.data.object as Stripe.Invoice

    console.log("[Invoice] Payment succeeded:", invoice.id)

    // Only process subscription invoices, not one-time payments
    if (!invoice.subscription) {
      return NextResponse.json({ received: true, message: "Not a subscription invoice" })
    }

    try {
      // Get subscription record
      const { data: subscription } = await supabaseAdmin
        .from("subscriptions")
        .select("id, creator_id")
        .eq("stripe_subscription_id", invoice.subscription as string)
        .maybeSingle()

      if (!subscription) {
        console.log("[Invoice] No subscription found for invoice")
        return NextResponse.json({ received: true, message: "No subscription found" })
      }

      // Create invoice record
      await supabaseAdmin.from("invoices").insert({
        creator_id: subscription.creator_id,
        subscription_id: subscription.id,
        stripe_invoice_id: invoice.id,
        amount_cents: invoice.amount_paid,
        status: "paid",
        invoice_pdf_url: invoice.invoice_pdf || null,
        hosted_invoice_url: invoice.hosted_invoice_url || null,
        period_start: invoice.period_start ? new Date(invoice.period_start * 1000).toISOString() : null,
        period_end: invoice.period_end ? new Date(invoice.period_end * 1000).toISOString() : null,
      })

      console.log("[Invoice] Successfully created invoice record")
    } catch (error) {
      console.error("[Invoice] Error creating invoice:", error)
    }

    return NextResponse.json({ received: true })
  }

  // Handle invoice payment failed
  if (event.type === "invoice.payment_failed") {
    const invoice = event.data.object as Stripe.Invoice

    console.log("[Invoice] Payment failed:", invoice.id)

    if (!invoice.subscription) {
      return NextResponse.json({ received: true, message: "Not a subscription invoice" })
    }

    try {
      // Get subscription record
      const { data: subscription } = await supabaseAdmin
        .from("subscriptions")
        .select("id, creator_id")
        .eq("stripe_subscription_id", invoice.subscription as string)
        .maybeSingle()

      if (!subscription) {
        console.log("[Invoice] No subscription found")
        return NextResponse.json({ received: true, message: "No subscription found" })
      }

      // Update subscription status to past_due
      await supabaseAdmin
        .from("subscriptions")
        .update({
          status: "past_due",
          updated_at: new Date().toISOString(),
        })
        .eq("stripe_subscription_id", invoice.subscription as string)

      // Update creator status
      await supabaseAdmin
        .from("creators")
        .update({
          subscription_status: "past_due",
        })
        .eq("id", subscription.creator_id)

      console.log("[Invoice] Updated subscription to past_due status")
    } catch (error) {
      console.error("[Invoice] Error updating subscription status:", error)
    }

    return NextResponse.json({ received: true })
  }

  return NextResponse.json({ received: true })
}
