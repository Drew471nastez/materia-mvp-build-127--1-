import { NextResponse } from "next/server"
import { stripe } from "@/lib/stripe"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { sendOrderEmails } from "@/lib/email"
import { cookies } from "next/headers"
import { collectOrderDeviceInfo } from "@/lib/device-info"
import { v4 as uuidv4 } from "uuid"

export const runtime = "nodejs"

export async function POST(request: Request) {
  const body = await request.json()
  const { paymentIntentId } = body
  const baseUrl =
    process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || request.headers.get("origin") || ""

  if (!paymentIntentId) {
    return NextResponse.json({ error: "Missing paymentIntentId" }, { status: 400 })
  }

  try {
    console.log("[confirm-payment] Processing PaymentIntent:", paymentIntentId)

    // Retrieve the PaymentIntent from Stripe to verify payment
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId, {
      expand: ["charges", "payment_method"],
    })

    // Collect device info from current request (fallback)
    const { deviceInfo: requestDeviceInfo, geoInfo: requestGeoInfo } = collectOrderDeviceInfo(request)

    if (paymentIntent.status !== "succeeded") {
      console.log("[confirm-payment] Payment not succeeded:", paymentIntent.status)
      return NextResponse.json({ error: "Payment not completed" }, { status: 400 })
    }

    const admin = createAdminClient()
    const metadata = paymentIntent.metadata || {}

    const productId = metadata.product_id
    const buyerId = metadata.buyer_id || null
    const buyerEmail = metadata.buyer_email || paymentIntent.receipt_email
    const creatorId = metadata.creator_id
    const tipCents = Number.parseInt(metadata.tip_cents || "0", 10)
    const accessToken = metadata.access_token || null
    const sessionFingerprint = metadata.session_fingerprint || null
    const receiptToken = metadata.receipt_token || null
    const variantId = metadata.variant_id || null
    const variantName = metadata.variant_name || null
    const variantPriceCents = metadata.variant_price_cents ? Number.parseInt(metadata.variant_price_cents, 10) : null

    if (!productId || !creatorId) {
      return NextResponse.json({ error: "Missing product or creator info" }, { status: 400 })
    }

    // Check for existing order (idempotency)
    const { data: existingOrder } = await admin
      .from("orders")
      .select("id, receipt_token, session_fingerprint")
      .eq("stripe_payment_intent_id", paymentIntentId)
      .maybeSingle()

    if (existingOrder) {
      console.log("[confirm-payment] Order already exists, returning receipt")
      return NextResponse.json({
        success: true,
        redirectUrl: `/receipt/${existingOrder.receipt_token}`,
      })
    }

    const totalAmount = paymentIntent.amount || 0
    // Fallback fee: 6% + $0.25 flat
    const fallbackFee = Math.round(totalAmount * 0.06) + 25
    const platformFeeCents =
      Number.parseInt(metadata.platform_fee_cents || "0", 10) || fallbackFee

    let transferId = null
    let applicationFeeCents = platformFeeCents

    // Payment method details
    let paymentMethod = "card"
    let cardBrand: string | null = null
    let cardLast4: string | null = null
    let paypalEmail: string | null = null

    if (paymentIntent.charges?.data?.[0]) {
      const charge = paymentIntent.charges.data[0]

      if (charge.application_fee_amount) {
        applicationFeeCents = charge.application_fee_amount
      }

      if (charge.transfer) {
        transferId = typeof charge.transfer === "string" ? charge.transfer : (charge.transfer as any).id
      }

      if (charge.payment_method_details) {
        const pmDetails = charge.payment_method_details as any

        if (pmDetails.card) {
          paymentMethod = "card"
          cardBrand = pmDetails.card.brand || null
          cardLast4 = pmDetails.card.last4 || null
        } else if (pmDetails.paypal) {
          paymentMethod = "paypal"
          paypalEmail = pmDetails.paypal?.payer_email || null
        } else if (pmDetails.type) {
          paymentMethod = pmDetails.type
        }
      }
    }

    console.log("[confirm-payment] Payment details:", {
      id: paymentIntentId,
      application_fee: applicationFeeCents,
      transfer: transferId,
      payment_method: paymentMethod,
      card_brand: cardBrand,
      card_last4: cardLast4,
    })

    // Create order
    const { data: order, error: orderError } = await admin
      .from("orders")
      .insert({
        buyer_id: buyerId || null,
        buyer_first_name: metadata.buyer_first_name || null,
        buyer_last_name: metadata.buyer_last_name || null,
        buyer_email: buyerEmail,
        product_id: productId,
        amount_cents: totalAmount,
        tip_cents: tipCents,
        fee_cents: applicationFeeCents,
        transfer_id: transferId,
        application_fee_cents: applicationFeeCents,
        currency: "usd",
        provider: "stripe",
        status: "completed",
        stripe_payment_intent_id: paymentIntentId,
        access_token: buyerId ? null : accessToken,
        session_fingerprint: sessionFingerprint,
        receipt_token: receiptToken,
        allowed_fingerprints: sessionFingerprint ? [sessionFingerprint] : [],
        buyer_email_attempt_count: 0,
        seller_email_attempt_count: 0,
        payment_method: paymentMethod,
        card_brand: cardBrand,
        card_last4: cardLast4,
        paypal_email: paypalEmail,
        buyer_country: metadata.buyer_country || requestGeoInfo.country || null,
        buyer_country_code: metadata.buyer_country_code || requestGeoInfo.countryCode || null,
        buyer_device_type: metadata.buyer_device_type || requestDeviceInfo.deviceType || null,
        buyer_os: metadata.buyer_os || requestDeviceInfo.os || null,
        buyer_browser: metadata.buyer_browser || requestDeviceInfo.browser || null,
        variant_id: variantId || null,
        variant_name: variantName || null,
        variant_price_cents: variantPriceCents || null,
        variant_currency: "USD",
        variant_snapshot: variantId && variantName ? {
          id: variantId,
          name: variantName,
          price_cents: variantPriceCents,
        } : null,
      })
      .select()
      .single()

    if (orderError || !order) {
      console.error("[confirm-payment] Order creation error:", orderError)
      return NextResponse.json({ error: "Failed to create order" }, { status: 500 })
    }

    console.log("[confirm-payment] Order created:", order.id)

    // Set cookie for device recognition
    if (sessionFingerprint) {
      const mainDomain = process.env.NEXT_PUBLIC_MAIN_DOMAIN || "storelib.com"
      const isLocalhost = mainDomain.includes("localhost")

      const cookieStore = await cookies()
      cookieStore.set("materia_session", sessionFingerprint, {
        httpOnly: true,
        secure: !isLocalhost,
        sameSite: "lax",
        maxAge: 60 * 60 * 24 * 365,
        path: "/",
        domain: isLocalhost ? undefined : `.${mainDomain}`,
      })
    }

    // Upsert customer record
    if (buyerEmail && creatorId) {
      await admin.from("customers").upsert(
        {
          email: buyerEmail.toLowerCase().trim(),
          creator_id: creatorId,
          first_name: metadata.buyer_first_name || null,
          last_name: metadata.buyer_last_name || null,
          order_count: 1,
          total_spent_cents: totalAmount,
        },
        {
          onConflict: "email,creator_id",
          ignoreDuplicates: false,
        },
      )

      // Add buyer to subscribers
      const normalizedEmail = buyerEmail.toLowerCase().trim()
      const { data: existingSub } = await admin
        .from("subscribers")
        .select("id, status")
        .eq("creator_id", creatorId)
        .eq("email", normalizedEmail)
        .maybeSingle()

      if (!existingSub) {
        const unsubscribeToken = uuidv4()
        const buyerName = `${metadata.buyer_first_name || ""} ${metadata.buyer_last_name || ""}`.trim() || null
        await admin.from("subscribers").insert({
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
      } else if (existingSub.status === "unsubscribed") {
        await admin
          .from("subscribers")
          .update({
            status: "subscribed",
            is_active: true,
            subscribed_at: new Date().toISOString(),
            unsubscribed_at: null,
          })
          .eq("id", existingSub.id)
      }
    }

    // Create entitlement
    if (buyerId) {
      let entitlementQuery = admin
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
        await admin.from("entitlements").insert({
          buyer_id: buyerId,
          creator_id: creatorId,
          product_id: productId,
          variant_id: variantId || null,
          community_access: false,
        })
      }
    }

    // Update sales count and analytics
    await admin.rpc("increment_product_sales", { p_product_id: productId })
    await admin.from("analytics_events").insert({
      creator_id: creatorId,
      product_id: productId,
      event_type: "purchase",
    })

    // Send emails
    if (buyerEmail && productId) {
      const { data: product } = await admin
        .from("products")
        .select("id, title, slug, creator:creators!inner(id, user_id)")
        .eq("id", productId)
        .single()

      if (product) {
        await sendOrderEmails(admin, {
          orderId: order.id,
          buyerEmail,
          buyerFirstName: metadata.buyer_first_name || "",
          buyerLastName: metadata.buyer_last_name || "",
          productTitle: product.title,
          receiptToken: order.receipt_token,
          creatorId,
          amountCents: totalAmount,
          feeCents: applicationFeeCents,
          baseUrl,
          variantName: variantName || null,
        })
      }
    }

    console.log("[confirm-payment] Complete. Receipt:", order.receipt_token)

    return NextResponse.json({
      success: true,
      redirectUrl: `/receipt/${order.receipt_token}`,
    })
  } catch (error) {
    console.error("[confirm-payment] Error:", error)
    return NextResponse.json({ error: "Failed to process payment" }, { status: 500 })
  }
}
