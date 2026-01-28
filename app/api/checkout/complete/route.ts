import { NextResponse } from "next/server"
import { stripe } from "@/lib/stripe"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { sendOrderEmails } from "@/lib/email"
import { cookies } from "next/headers"
import { collectOrderDeviceInfo } from "@/lib/device-info"

export const runtime = "nodejs"

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const sessionId = searchParams.get("session_id")
  const baseUrl =
    process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || request.headers.get("origin") || ""

  if (!sessionId) {
    return NextResponse.redirect(`${baseUrl}/explore`)
  }

  try {
    console.log("[checkout/complete] Processing Stripe checkout for session:", sessionId)

    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["payment_intent", "payment_intent.charges", "payment_intent.payment_method"],
    })

    // Collect device info from current request (fallback if not in metadata)
    const { deviceInfo: requestDeviceInfo, geoInfo: requestGeoInfo } = collectOrderDeviceInfo(request)

    if (session.payment_status !== "paid") {
      console.log("[checkout/complete] Payment not completed:", session.payment_status)
      return NextResponse.redirect(`${baseUrl}/checkout?error=payment_failed`)
    }

    const supabase = await createClient()
    const admin = createAdminClient()
    const metadata = session.metadata || {}

    const productId = metadata.product_id
    const buyerId = metadata.buyer_id || null
    const buyerEmail = metadata.buyer_email || session.customer_details?.email
    const creatorId = metadata.creator_id
    const tipCents = Number.parseInt(metadata.tip_cents || "0", 10)
    const accessToken = metadata.access_token || null
    const sessionFingerprint = metadata.session_fingerprint || null
    const receiptToken = metadata.receipt_token || null
    const variantId = metadata.variant_id || null
    const variantName = metadata.variant_name || null
    const variantPriceCents = metadata.variant_price_cents ? Number.parseInt(metadata.variant_price_cents, 10) : null

    // Check for existing order (idempotency)
    const { data: existingOrder } = await admin
      .from("orders")
      .select("id, receipt_token, session_fingerprint")
      .eq("stripe_session_id", sessionId)
      .maybeSingle()

    if (existingOrder) {
      console.log("[checkout/complete] Order already exists, redirecting to receipt")
      if (existingOrder.session_fingerprint) {
        const cookieStore = await cookies()
        cookieStore.set("materia_session", existingOrder.session_fingerprint, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "lax",
          maxAge: 60 * 60 * 24 * 365,
          path: "/",
        })
      }
      return NextResponse.redirect(`${baseUrl}/receipt/${existingOrder.receipt_token}?emailSent=1`)
    }

    const totalAmount = session.amount_total || 0
    const platformFeeCents =
      Number.parseInt(metadata.platform_fee_cents || "0", 10) || Math.round(totalAmount * 0.06) + 30

    let transferId = null
    let applicationFeeCents = platformFeeCents

    // Payment method details
    let paymentMethod = "card"
    let cardBrand: string | null = null
    let cardLast4: string | null = null
    let paypalEmail: string | null = null

    if (typeof session.payment_intent === "object" && session.payment_intent) {
      const paymentIntent = session.payment_intent as any

      if (paymentIntent.application_fee_amount) {
        applicationFeeCents = paymentIntent.application_fee_amount
      }

      if (paymentIntent.transfer) {
        transferId = typeof paymentIntent.transfer === "string" ? paymentIntent.transfer : paymentIntent.transfer.id
      }

      // Extract payment method details from charges
      if (paymentIntent.charges?.data?.[0]) {
        const charge = paymentIntent.charges.data[0]
        if (charge.payment_method_details) {
          const pmDetails = charge.payment_method_details

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

      console.log("[checkout/complete] Payment Intent details:", {
        id: paymentIntent.id,
        application_fee_amount: applicationFeeCents,
        transfer: transferId,
        payment_method: paymentMethod,
        card_brand: cardBrand,
        card_last4: cardLast4,
      })
    }

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
        stripe_session_id: sessionId,
        stripe_payment_intent_id: session.payment_intent as string,
        access_token: buyerId ? null : accessToken,
        session_fingerprint: sessionFingerprint,
        receipt_token: receiptToken,
        allowed_fingerprints: sessionFingerprint ? [sessionFingerprint] : [],
        agreed_to_terms: metadata.agreed_to_terms === "true",
        agreed_at: metadata.agreed_at || null,
        buyer_email_attempt_count: 0,
        seller_email_attempt_count: 0,
        // Payment method details
        payment_method: paymentMethod,
        card_brand: cardBrand,
        card_last4: cardLast4,
        paypal_email: paypalEmail,
        // Device and geo info (from metadata, with fallback to current request)
        buyer_country: metadata.buyer_country || requestGeoInfo.country || null,
        buyer_country_code: metadata.buyer_country_code || requestGeoInfo.countryCode || null,
        buyer_device_type: metadata.buyer_device_type || requestDeviceInfo.deviceType || null,
        buyer_os: metadata.buyer_os || requestDeviceInfo.os || null,
        buyer_browser: metadata.buyer_browser || requestDeviceInfo.browser || null,
        // Variant info (full snapshot for historical reference)
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
      console.error("[checkout/complete] Order creation error:", orderError)
      return NextResponse.redirect(`${baseUrl}/checkout?error=order_failed`)
    }

    console.log("[checkout/complete] ✅ Order created:", order.id)

    if (sessionFingerprint) {
      const cookieStore = await cookies()
      cookieStore.set("materia_session", sessionFingerprint, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 60 * 60 * 24 * 365,
        path: "/",
      })
      console.log("[checkout/complete] ✅ Set materia_session cookie for device recognition")
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
      console.log("[checkout/complete] ✅ Customer record upserted")
    }

    // Create entitlement for logged-in users
    if (buyerId) {
      const { data: existingEntitlement } = await admin
        .from("entitlements")
        .select("id")
        .eq("buyer_id", buyerId)
        .eq("product_id", productId)
        .maybeSingle()

      if (!existingEntitlement) {
        await admin.from("entitlements").insert({
          buyer_id: buyerId,
          creator_id: creatorId,
          product_id: productId,
          community_access: false,
        })
        console.log("[checkout/complete] ✅ Entitlement created")
      }
    }

    // Update sales count and analytics
    await admin.rpc("increment_product_sales", { p_product_id: productId })
    await admin.from("analytics_events").insert({
      creator_id: creatorId,
      product_id: productId,
      event_type: "purchase",
    })

    if (buyerEmail && productId) {
      const { data: product } = await admin
        .from("products")
        .select("id, title, slug, creator:creators!inner(id, user_id)")
        .eq("id", productId)
        .single()

      if (!product) {
        console.error("[checkout/complete] Product not found:", productId)
        return NextResponse.redirect(`${baseUrl}/checkout?error=product_not_found`)
      }

      const emailResults = await sendOrderEmails(admin, {
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

      console.log("[checkout/complete] Email results:", emailResults)
    }

    return NextResponse.redirect(`${baseUrl}/receipt/${order.receipt_token}?emailSent=1`)
  } catch (error) {
    console.error("[checkout/complete] ❌ Error:", error)
    return NextResponse.redirect(`${baseUrl}/checkout?error=unknown`)
  }
}
