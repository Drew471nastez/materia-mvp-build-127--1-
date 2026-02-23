import { NextResponse } from "next/server"
import { headers } from "next/headers"
import type Stripe from "stripe"
import { stripe } from "@/lib/stripe"
import { createClient } from "@supabase/supabase-js"
import { generateReceiptToken } from "@/lib/security"
import { sendOrderEmails, triggerEmailFlows, sendPayoutStatusEmail, sendFirstPayoutEmail, sendBankUpdatedEmail, sendPayoutsPausedEmail, sendVerificationRequiredEmail, sendFirstSaleEmail, resolveSellerEmail, sendDisputeCreatedEmail, sendDisputeWonEmail, sendDisputeLostEmail, sendRefundEmails } from "@/lib/email"
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

  // Support both a main webhook secret and a separate Connect webhook secret.
  // Stripe sends payout.* events from connected accounts using whichever endpoint
  // is configured — try both secrets so a single endpoint handles everything.
  const mainSecret = process.env.STRIPE_WEBHOOK_SECRET
  const connectSecret = process.env.STRIPE_CONNECT_WEBHOOK_SECRET

  if (!mainSecret && !connectSecret) {
    console.error("[Webhook] Missing STRIPE_WEBHOOK_SECRET env")
    return NextResponse.json({ error: "Missing webhook secret" }, { status: 500 })
  }

  let event: Stripe.Event | null = null

  // Try main secret first, then Connect secret as fallback
  const secretsToTry = [mainSecret, connectSecret].filter(Boolean) as string[]
  for (const secret of secretsToTry) {
    try {
      event = stripe.webhooks.constructEvent(body, signature, secret)
      break
    } catch {
      // Try next secret
    }
  }

  if (!event) {
    console.error("[Webhook] Signature verification failed with all available secrets")
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 })
  }

  console.log("[Webhook] Event type:", event.type)

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

    // ── Ledger: record sale earnings ──────────────────────────────────────
    if (creatorId && totalAmount > 0) {
      try {
        const netSeller = totalAmount - applicationFeeAmount

        // Determine hold_until from Stripe's actual settlement date (available_on)
        // This respects Stripe's per-country/risk settlement times:
        //  - US creators: ~2 business days
        //  - International: up to ~7 business days
        //  - First payout: may be longer (extra verification)
        let holdUntil: Date | null = null

        if (destinationPaymentId && creatorId) {
          try {
            // Look up the creator's stripe_account_id
            const { data: sellerCreator } = await supabaseAdmin
              .from("creators")
              .select("stripe_account_id")
              .eq("id", creatorId)
              .single()

            if (sellerCreator?.stripe_account_id && destinationPaymentId) {
              const destCharge = await stripe.charges.retrieve(
                destinationPaymentId,
                { expand: ["balance_transaction"], stripeAccount: sellerCreator.stripe_account_id }
              )
              const bt = destCharge.balance_transaction as any
              if (bt?.available_on) {
                holdUntil = new Date(bt.available_on * 1000)
              }
            }
          } catch (btErr) {
            console.error("[Webhook] Balance transaction lookup failed (non-fatal):", btErr)
          }
        }

        // Fallback: if we couldn't get Stripe's available_on, estimate ~3 business days
        if (!holdUntil) {
          holdUntil = new Date()
          holdUntil.setDate(holdUntil.getDate() + 3)
        }

        // Ensure ledger exists
        await supabaseAdmin
          .from("seller_ledger")
          .upsert({ creator_id: creatorId }, { onConflict: "creator_id" })

        // Load current ledger
        const { data: ledger } = await supabaseAdmin
          .from("seller_ledger")
          .select("*")
          .eq("creator_id", creatorId)
          .single()

        if (ledger) {
          let actualPending = netSeller
          let newNegative = ledger.negative_balance

          // Absorb negative balance from prior refunds
          if (newNegative > 0) {
            const absorbed = Math.min(actualPending, newNegative)
            actualPending -= absorbed
            newNegative -= absorbed
          }

          await supabaseAdmin
            .from("seller_ledger")
            .update({
              pending_amount: ledger.pending_amount + actualPending,
              lifetime_earnings: ledger.lifetime_earnings + totalAmount,
              lifetime_fees: ledger.lifetime_fees + applicationFeeAmount,
              negative_balance: newNegative,
            })
            .eq("creator_id", creatorId)

          await supabaseAdmin.from("ledger_events").insert({
            creator_id: creatorId,
            event_type: "sale",
            amount_cents: totalAmount,
            net_seller_cents: netSeller,
            fee_cents: applicationFeeAmount,
            currency: "usd",
            pending_delta: actualPending,
            order_id: order.id,
            hold_until: holdUntil.toISOString(),
            description: `Sale: $${(totalAmount / 100).toFixed(2)} (net $${(netSeller / 100).toFixed(2)})`,
          })
        }
      } catch (ledgerErr) {
        console.error("[Webhook] Ledger sale update failed (non-fatal):", ledgerErr)
      }
    }

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

    // First sale email — fires once per seller lifetime
    try {
      const { count: totalOrders } = await supabaseAdmin
        .from("orders")
        .select("id", { count: "exact", head: true })
        .eq("creator_id", creatorId)
        .in("status", ["completed", "refunded"])

      if (totalOrders === 1) {
        const sellerEmail = await resolveSellerEmail(supabaseAdmin, creatorId)
        const sellerNet = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" })
          .format((totalAmount - applicationFeeAmount) / 100)

        await sendFirstSaleEmail({
          admin: supabaseAdmin,
          sellerEmail,
          creatorId,
          productName: productTitle,
          sellerNet,
          buyerCountry: metadata.buyer_country || null,
          saleTime: new Date().toISOString(),
        })
      }
    } catch (firstSaleErr) {
      console.error("[Webhook] First sale email error (non-fatal):", firstSaleErr)
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
        .select("id, user_id, payouts_enabled")
        .eq("stripe_account_id", account.id)
        .maybeSingle()

      if (creator) {
        const chargesEnabled = account.charges_enabled || false
        const payoutsEnabled = account.payouts_enabled || false
        const detailsSubmitted = account.details_submitted || false
        const onboardingStatus = chargesEnabled && payoutsEnabled && detailsSubmitted ? "connected" : "pending"

        const previousPayoutsEnabled = (creator as any).payouts_enabled ?? false

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

        // Email triggers (non-blocking)
        try {
          const userId = (creator as any).user_id
          if (userId) {
            const { data: profile } = await supabaseAdmin
              .from("profiles")
              .select("email, display_name")
              .eq("user_id", userId)
              .maybeSingle()

            if (profile?.email) {
              // Payouts paused email: was enabled, now disabled
              if (previousPayoutsEnabled && !payoutsEnabled) {
                await sendPayoutsPausedEmail({
                  to: profile.email,
                  sellerName: profile.display_name || "Seller",
                })
                console.log("[Connect] Sent payouts paused email to:", profile.email)
              }

              // Bank account updated email: check if external accounts changed
              if (detailsSubmitted && account.external_accounts?.data?.length) {
                const bankAccount = account.external_accounts.data[0] as any
                if (bankAccount?.last4) {
                  // Only send if the previous_attributes indicate a bank change
                  const prevAttrs = (event.data as any).previous_attributes
                  if (prevAttrs?.external_accounts || prevAttrs?.details_submitted) {
                    await sendBankUpdatedEmail({
                      to: profile.email,
                      sellerName: profile.display_name || "Seller",
                      bankName: bankAccount.bank_name || null,
                      bankLast4: bankAccount.last4,
                    })
                    console.log("[Connect] Sent bank updated email to:", profile.email)
                  }
                }
              }

              // Verification required email: when Stripe adds new requirements
              const requirements = (account as any).requirements || {}
              const currentlyDue: string[] = requirements.currently_due || []
              const pastDue: string[] = requirements.past_due || []
              const allReqs = [...pastDue, ...currentlyDue]
              if (allReqs.length > 0 && detailsSubmitted) {
                await sendVerificationRequiredEmail({
                  to: profile.email,
                  sellerName: profile.display_name || "Seller",
                  creatorId: creator.id,
                  requirements: allReqs,
                  isPastDue: pastDue.length > 0,
                })
                console.log("[Connect] Sent verification required email to:", profile.email)
              }
            }
          }
        } catch (emailErr) {
          console.error("[Connect] Email trigger failed (non-fatal):", emailErr)
        }

        // RE-ENFORCE manual payouts — Storelib controls when sellers cash out
        const schedule = (account as any).settings?.payouts?.schedule
        if (schedule?.interval !== "manual") {
          try {
            await stripe.accounts.update(account.id, {
              settings: {
                payouts: {
                  schedule: { interval: "manual" as const },
                },
              },
            })
            console.log("[Connect] Re-enforced manual payouts for:", account.id)
          } catch (enforceErr) {
            console.error("[Connect] Failed to enforce manual payouts:", enforceErr)
          }
        }
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
            // Use the most recent refund object's amount (not cumulative charge.amount_refunded)
            const refund = charge.refunds?.data?.[0]
            const refundAmountCents = refund?.amount || charge.amount_refunded || order.amount_cents
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

          // ── Ledger: process refund bucket subtraction ───────────────────
          try {
            // Use actual refund amount from the refund object, not cumulative charge.amount_refunded
            const latestRefund = charge.refunds?.data?.[0]
            const refundAmountCents = latestRefund?.amount || charge.amount_refunded || order.amount_cents

            // Find the creator via the order's product
            const { data: product } = await supabaseAdmin
              .from("products")
              .select("creator_id")
              .eq("id", (order as any).product_id || "")
              .maybeSingle()

            // Fallback: find from order if product_id not available
            let refundCreatorId = product?.creator_id
            if (!refundCreatorId) {
              const { data: fullOrder } = await supabaseAdmin
                .from("orders")
                .select("product_id")
                .eq("id", order.id)
                .single()
              if (fullOrder?.product_id) {
                const { data: p } = await supabaseAdmin
                  .from("products")
                  .select("creator_id")
                  .eq("id", fullOrder.product_id)
                  .single()
                refundCreatorId = p?.creator_id
              }
            }

            if (refundCreatorId) {
              // Idempotency: check if we already processed this refund's ledger impact
              const latestRefund = charge.refunds?.data?.[0]
              if (latestRefund?.id) {
                const { data: existingRefundEvent } = await supabaseAdmin
                  .from("ledger_events")
                  .select("id")
                  .eq("stripe_refund_id", latestRefund.id)
                  .eq("event_type", "refund")
                  .maybeSingle()

                if (existingRefundEvent) {
                  console.log("[Webhook] Refund ledger event already processed:", latestRefund.id)
                  return NextResponse.json({ received: true })
                }
              }

              // Find the original sale ledger event for fee calculation
              const { data: saleLedgerEvent } = await supabaseAdmin
                .from("ledger_events")
                .select("fee_cents, net_seller_cents")
                .eq("order_id", order.id)
                .eq("event_type", "sale")
                .maybeSingle()

              // Calculate refund net (Stripe reverses both transfer + fee)
              const originalFee = saleLedgerEvent?.fee_cents || 0
              const refundNet = refundAmountCents - originalFee

              const { data: ledger } = await supabaseAdmin
                .from("seller_ledger")
                .select("*")
                .eq("creator_id", refundCreatorId)
                .single()

              if (ledger && refundNet > 0) {
                // Subtract from buckets in order: pending → available → negative
                let remaining = refundNet
                let fromPending = Math.min(remaining, ledger.pending_amount)
                remaining -= fromPending

                let fromAvailable = Math.min(remaining, ledger.available_amount)
                remaining -= fromAvailable

                let newNegative = ledger.negative_balance + remaining

                await supabaseAdmin
                  .from("seller_ledger")
                  .update({
                    pending_amount: ledger.pending_amount - fromPending,
                    available_amount: ledger.available_amount - fromAvailable,
                    negative_balance: newNegative,
                    lifetime_refunds: ledger.lifetime_refunds + refundAmountCents,
                  })
                  .eq("creator_id", refundCreatorId)

                const refund = charge.refunds?.data?.[0]
                await supabaseAdmin.from("ledger_events").insert({
                  creator_id: refundCreatorId,
                  event_type: "refund",
                  amount_cents: refundAmountCents,
                  net_seller_cents: refundNet,
                  fee_cents: originalFee,
                  currency: "usd",
                  pending_delta: -fromPending,
                  available_delta: -fromAvailable,
                  order_id: order.id,
                  stripe_refund_id: refund?.id || null,
                  description: `Refund: $${(refundAmountCents / 100).toFixed(2)}`,
                })
              }
            }
          } catch (ledgerRefundErr) {
            console.error("[Webhook] Ledger refund update failed (non-fatal):", ledgerRefundErr)
          }

          // Send refund notification emails (non-fatal — never block the webhook response)
          try {
            const { data: fullRefundOrder } = await supabaseAdmin
              .from("orders")
              .select("buyer_email, customer_email, created_at, product:products(title, creator:creators(display_name, avatar_url, username, user_id))")
              .eq("id", order.id)
              .single()

            if (fullRefundOrder) {
              const refundBuyerEmail = (fullRefundOrder as any).buyer_email || (fullRefundOrder as any).customer_email
              const refundProduct = (fullRefundOrder as any).product as any
              const refundProductTitle = refundProduct?.title || "Your purchase"
              const refundCreator = refundProduct?.creator as any
              const refundStoreName = refundCreator?.display_name || refundCreator?.username || "Storelib"
              const latestRefund = charge.refunds?.data?.[0]
              const refundAmountForEmail = (latestRefund?.amount || charge.amount_refunded || order.amount_cents) / 100

              let refundSellerEmail: string | undefined
              if (refundCreator?.user_id) {
                const { data: sp } = await supabaseAdmin
                  .from("profiles")
                  .select("email")
                  .eq("id", refundCreator.user_id)
                  .single()
                refundSellerEmail = sp?.email || undefined
              }

              await sendRefundEmails({
                buyerEmail: refundBuyerEmail,
                sellerEmail: refundSellerEmail,
                productTitle: refundProductTitle,
                refundAmount: refundAmountForEmail,
                currency: charge.currency || "usd",
                orderId: order.id,
                reason: latestRefund?.reason || "requested_by_customer",
                storeName: refundStoreName,
                orderDate: (fullRefundOrder as any).created_at,
              })
              console.log("[Webhook] Refund emails sent for order:", order.id)
            }
          } catch (refundEmailErr) {
            console.error("[Webhook] Refund email send failed (non-fatal):", refundEmailErr)
          }
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

    // ── Ledger: update balance buckets for payout status changes ─────────
    try {
      const { data: ledger } = await supabaseAdmin
        .from("seller_ledger")
        .select("*")
        .eq("creator_id", creator.id)
        .single()

      if (ledger) {
        // Find the original cashout event to get USD amount
        const { data: cashoutEvent } = await supabaseAdmin
          .from("ledger_events")
          .select("amount_cents")
          .eq("creator_id", creator.id)
          .eq("event_type", "cashout_initiated")
          .eq("stripe_payout_id", payout.id)
          .maybeSingle()

        const usdAmount = cashoutEvent?.amount_cents || payout.amount

        if (event.type === "payout.paid") {
          await supabaseAdmin
            .from("seller_ledger")
            .update({
              in_transit_amount: Math.max(0, ledger.in_transit_amount - usdAmount),
              lifetime_paid_out: ledger.lifetime_paid_out + usdAmount,
            })
            .eq("creator_id", creator.id)

          await supabaseAdmin.from("ledger_events").insert({
            creator_id: creator.id,
            event_type: "cashout_completed",
            amount_cents: usdAmount,
            net_seller_cents: usdAmount,
            currency: "usd",
            in_transit_delta: -usdAmount,
            stripe_payout_id: payout.id,
            description: `Cashout completed: $${(usdAmount / 100).toFixed(2)} arrived at bank`,
          })
        } else if (event.type === "payout.failed" || event.type === "payout.canceled") {
          // Return funds to available
          await supabaseAdmin
            .from("seller_ledger")
            .update({
              in_transit_amount: Math.max(0, ledger.in_transit_amount - usdAmount),
              available_amount: ledger.available_amount + usdAmount,
            })
            .eq("creator_id", creator.id)

          await supabaseAdmin.from("ledger_events").insert({
            creator_id: creator.id,
            event_type: "cashout_failed",
            amount_cents: usdAmount,
            net_seller_cents: usdAmount,
            currency: "usd",
            in_transit_delta: -usdAmount,
            available_delta: usdAmount,
            stripe_payout_id: payout.id,
            description: `Cashout ${event.type === "payout.failed" ? "failed" : "canceled"}: $${(usdAmount / 100).toFixed(2)} returned to available`,
          })
        }
      }
    } catch (ledgerPayoutErr) {
      console.error("[Webhook] Ledger payout update failed (non-fatal):", ledgerPayoutErr)
    }

    // Send email notification for status transitions
    try {
      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("email, display_name")
        .eq("user_id", creator.user_id)
        .maybeSingle()

      // Get bank last4 for email context
      let bankLast4: string | null = null
      try {
        const destObj = payout.destination as any
        if (destObj?.last4) bankLast4 = destObj.last4
        else if (typeof destObj === "string" && destObj.includes("••••")) {
          bankLast4 = destObj.split("••••")[1]?.trim() || null
        }
      } catch { /* non-fatal */ }

      if (profile?.email) {
        // Check if this is the first payout (celebration email)
        if (event.type === "payout.paid") {
          const { data: ledgerCheck } = await supabaseAdmin
            .from("seller_ledger")
            .select("lifetime_paid_out")
            .eq("creator_id", creator.id)
            .single()

          // lifetime_paid_out was just updated above — if it equals this payout amount,
          // this is the first ever payout
          const isFirstPayout = ledgerCheck && ledgerCheck.lifetime_paid_out <= payout.amount + 100

          if (isFirstPayout) {
            await sendFirstPayoutEmail({
              to: profile.email,
              sellerName: profile.display_name || "Seller",
              amountCents: payout.amount,
              currency: payout.currency,
            })
          }
        }

        if (event.type === "payout.paid" || event.type === "payout.failed" || event.type === "payout.created") {
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
            bankLast4,
          })
        }
      }
    } catch (emailErr) {
      console.error("[Webhook] Payout email failed (non-fatal):", emailErr)
    }

    return NextResponse.json({ received: true })
  }

  // ============================================================================
  // DISPUTE EVENTS — charge.dispute.created / charge.dispute.closed
  // Handles negative balance scenarios (Stan-style)
  // ============================================================================

  if (
    event.type === "charge.dispute.created" ||
    event.type === "charge.dispute.closed" ||
    event.type === "charge.dispute.updated"
  ) {
    const dispute = event.data.object as Stripe.Dispute
    const connectedAccountId = (event as any).account as string | undefined

    console.log(`[Webhook] ${event.type}:`, dispute.id, "account:", connectedAccountId)

    if (!connectedAccountId) {
      return NextResponse.json({ received: true })
    }

    try {
      const { data: creator } = await supabaseAdmin
        .from("creators")
        .select("id")
        .eq("stripe_account_id", connectedAccountId)
        .single()

      if (!creator) {
        console.warn("[Webhook] Dispute: no creator for account", connectedAccountId)
        return NextResponse.json({ received: true })
      }

      const disputeAmountCents = dispute.amount
      // Stripe charges a $15 dispute fee for US accounts (1500 cents)
      const disputeFeeCents = (dispute as any).balance_transactions?.find(
        (bt: any) => bt.fee > 0
      )?.fee || 1500

      if (event.type === "charge.dispute.created") {
        // Idempotency: check if we already processed this dispute
        const { data: existingEvent } = await supabaseAdmin
          .from("ledger_events")
          .select("id")
          .eq("stripe_dispute_id", dispute.id)
          .eq("event_type", "dispute_created")
          .maybeSingle()

        if (existingEvent) {
          console.log("[Webhook] Dispute already processed:", dispute.id)
          return NextResponse.json({ received: true })
        }

        // Dispute opened — funds are withdrawn by Stripe.
        // Subtract from available → pending → create negative balance
        // Include the dispute fee in the total deduction
        const totalDeduction = disputeAmountCents + disputeFeeCents

        const { data: ledger } = await supabaseAdmin
          .from("seller_ledger")
          .select("*")
          .eq("creator_id", creator.id)
          .single()

        if (ledger) {
          let remaining = totalDeduction
          let availableDelta = 0
          let pendingDelta = 0
          let newNegative = ledger.negative_balance

          // Take from available first
          const fromAvailable = Math.min(remaining, ledger.available_amount)
          availableDelta = -fromAvailable
          remaining -= fromAvailable

          // Then from pending
          const fromPending = Math.min(remaining, ledger.pending_amount)
          pendingDelta = -fromPending
          remaining -= fromPending

          // Remainder becomes negative balance
          if (remaining > 0) {
            newNegative += remaining
          }

          await supabaseAdmin
            .from("seller_ledger")
            .update({
              available_amount: ledger.available_amount + availableDelta,
              pending_amount: ledger.pending_amount + pendingDelta,
              negative_balance: newNegative,
            })
            .eq("creator_id", creator.id)

          await supabaseAdmin.from("ledger_events").insert({
            creator_id: creator.id,
            event_type: "dispute_created",
            amount_cents: totalDeduction,
            net_seller_cents: totalDeduction,
            fee_cents: disputeFeeCents,
            currency: (dispute.currency || "usd").toLowerCase(),
            available_delta: availableDelta,
            pending_delta: pendingDelta,
            stripe_dispute_id: dispute.id,
            description: `Dispute opened: $${(disputeAmountCents / 100).toFixed(2)} held + $${(disputeFeeCents / 100).toFixed(2)} fee`,
          })
        }

        // Update the order status to "disputed" if we can find it.
        // dispute.charge is a charge ID (ch_xxx) — need to resolve to payment_intent (pi_xxx)
        // because orders table stores stripe_payment_intent_id, not charge ID.
        let productName: string | null = null
        if (dispute.charge || dispute.payment_intent) {
          let paymentIntentId: string | null = null

          // Try payment_intent first (available on newer disputes)
          if (dispute.payment_intent) {
            paymentIntentId = typeof dispute.payment_intent === "string"
              ? dispute.payment_intent
              : (dispute.payment_intent as any)?.id || null
          }

          // Fallback: resolve charge → payment_intent via Stripe API
          if (!paymentIntentId && dispute.charge) {
            try {
              const chargeId = typeof dispute.charge === "string" ? dispute.charge : dispute.charge.id
              const charge = await stripe.charges.retrieve(chargeId, {
                stripeAccount: connectedAccountId,
              })
              paymentIntentId = typeof charge.payment_intent === "string"
                ? charge.payment_intent
                : (charge.payment_intent as any)?.id || null
            } catch (chargeErr) {
              console.error("[Webhook] Failed to resolve charge to payment_intent:", chargeErr)
            }
          }

          if (paymentIntentId) {
            const { data: disputeOrder } = await supabaseAdmin
              .from("orders")
              .select("id, product_id")
              .eq("stripe_payment_intent_id", paymentIntentId)
              .maybeSingle()

            if (disputeOrder) {
              await supabaseAdmin
                .from("orders")
                .update({ status: "disputed" })
                .eq("id", disputeOrder.id)

              // Get product name for email
              if (disputeOrder.product_id) {
                const { data: prod } = await supabaseAdmin
                  .from("products")
                  .select("title")
                  .eq("id", disputeOrder.product_id)
                  .single()
                productName = prod?.title || null
              }
            }
          }
        }

        // Send dispute created email to seller
        try {
          const sellerEmail = await resolveSellerEmail(supabaseAdmin, creator.id)
          if (sellerEmail) {
            const { data: profile } = await supabaseAdmin
              .from("profiles")
              .select("display_name")
              .eq("user_id", (await supabaseAdmin.from("creators").select("user_id").eq("id", creator.id).single()).data?.user_id || "")
              .single()

            const evidenceDueBy = (dispute as any).evidence_details?.due_by
              ? new Date((dispute as any).evidence_details.due_by * 1000).toISOString()
              : null

            await sendDisputeCreatedEmail({
              to: sellerEmail,
              sellerName: profile?.display_name || "Seller",
              disputedAmountCents: disputeAmountCents,
              disputeFeeCents,
              currency: (dispute.currency || "usd").toLowerCase(),
              productName,
              disputeReason: dispute.reason || null,
              evidenceDueBy,
              disputeId: dispute.id,
            })
          }
        } catch (emailErr) {
          console.error("[Webhook] Dispute email failed (non-fatal):", emailErr)
        }
      }

      if (event.type === "charge.dispute.closed") {
        // Idempotency: check if we already processed this dispute closure
        const { data: existingClosed } = await supabaseAdmin
          .from("ledger_events")
          .select("id")
          .eq("stripe_dispute_id", dispute.id)
          .eq("event_type", "dispute_closed")
          .maybeSingle()

        if (existingClosed) {
          console.log("[Webhook] Dispute close already processed:", dispute.id)
          return NextResponse.json({ received: true })
        }

        // Dispute resolved. If won (status=won), reverse the hold + fee.
        // If lost (status=lost/warning_closed), the money is gone — no reversal.
        if (dispute.status === "won") {
          // When dispute is won, Stripe returns both the disputed amount AND the fee
          const totalRestored = disputeAmountCents + disputeFeeCents

          const { data: ledger } = await supabaseAdmin
            .from("seller_ledger")
            .select("*")
            .eq("creator_id", creator.id)
            .single()

          if (ledger) {
            // Restore funds — first absorb any negative balance, rest goes to available
            let toAvailable = totalRestored
            let newNegative = ledger.negative_balance

            if (newNegative > 0 && toAvailable > 0) {
              const absorbed = Math.min(toAvailable, newNegative)
              toAvailable -= absorbed
              newNegative -= absorbed
            }

            await supabaseAdmin
              .from("seller_ledger")
              .update({
                available_amount: ledger.available_amount + toAvailable,
                negative_balance: newNegative,
              })
              .eq("creator_id", creator.id)

            await supabaseAdmin.from("ledger_events").insert({
              creator_id: creator.id,
              event_type: "dispute_closed",
              amount_cents: totalRestored,
              net_seller_cents: toAvailable,
              currency: (dispute.currency || "usd").toLowerCase(),
              available_delta: toAvailable,
              stripe_dispute_id: dispute.id,
              description: `Dispute won: $${(totalRestored / 100).toFixed(2)} restored (incl. fee)`,
            })
          }

          // Restore order status — resolve charge → payment_intent
          if (dispute.charge || dispute.payment_intent) {
            let piId: string | null = null
            if (dispute.payment_intent) {
              piId = typeof dispute.payment_intent === "string"
                ? dispute.payment_intent : (dispute.payment_intent as any)?.id || null
            }
            if (!piId && dispute.charge) {
              try {
                const cId = typeof dispute.charge === "string" ? dispute.charge : dispute.charge.id
                const ch = await stripe.charges.retrieve(cId, { stripeAccount: connectedAccountId })
                piId = typeof ch.payment_intent === "string" ? ch.payment_intent : (ch.payment_intent as any)?.id || null
              } catch { /* non-fatal */ }
            }
            if (piId) {
              await supabaseAdmin
                .from("orders")
                .update({ status: "completed" })
                .eq("stripe_payment_intent_id", piId)
                .eq("status", "disputed")
            }
          }

          // Send dispute won email
          try {
            const sellerEmail = await resolveSellerEmail(supabaseAdmin, creator.id)
            if (sellerEmail) {
              const { data: crRow } = await supabaseAdmin.from("creators").select("user_id").eq("id", creator.id).single()
              const { data: profile } = await supabaseAdmin
                .from("profiles")
                .select("display_name")
                .eq("user_id", crRow?.user_id || "")
                .single()

              await sendDisputeWonEmail({
                to: sellerEmail,
                sellerName: profile?.display_name || "Seller",
                amountCents: totalRestored,
                currency: (dispute.currency || "usd").toLowerCase(),
              })
            }
          } catch (emailErr) {
            console.error("[Webhook] Dispute won email failed (non-fatal):", emailErr)
          }
        } else {
          // Lost — log it, funds already deducted
          await supabaseAdmin.from("ledger_events").insert({
            creator_id: creator.id,
            event_type: "dispute_closed",
            amount_cents: disputeAmountCents,
            net_seller_cents: 0,
            currency: (dispute.currency || "usd").toLowerCase(),
            stripe_dispute_id: dispute.id,
            description: `Dispute lost: $${(disputeAmountCents / 100).toFixed(2)} forfeited`,
          })

          // Send dispute lost email
          try {
            const sellerEmail = await resolveSellerEmail(supabaseAdmin, creator.id)
            if (sellerEmail) {
              const { data: crRow } = await supabaseAdmin.from("creators").select("user_id").eq("id", creator.id).single()
              const { data: profile } = await supabaseAdmin
                .from("profiles")
                .select("display_name")
                .eq("user_id", crRow?.user_id || "")
                .single()

              await sendDisputeLostEmail({
                to: sellerEmail,
                sellerName: profile?.display_name || "Seller",
                amountCents: disputeAmountCents,
                currency: (dispute.currency || "usd").toLowerCase(),
              })
            }
          } catch (emailErr) {
            console.error("[Webhook] Dispute lost email failed (non-fatal):", emailErr)
          }
        }
      }
    } catch (error: any) {
      console.error("[Webhook] Error processing dispute event:", error)
    }

    return NextResponse.json({ received: true })
  }

  return NextResponse.json({ received: true })
}
