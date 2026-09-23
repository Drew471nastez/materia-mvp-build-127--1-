import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { sendOrderEmails } from "@/lib/email"
import { generateReceiptToken } from "@/lib/security"
import { nanoid } from "nanoid"
import { cookies } from "next/headers"
import { collectOrderDeviceInfo } from "@/lib/device-info"
import { v4 as uuidv4 } from "uuid"
import { orderSourceFrom, tagOrderSource } from "@/lib/orders/order-source"

export const runtime = "nodejs"

export async function POST(request: Request) {
  const supabase = await createClient()
  const admin = createAdminClient()

  try {
    const { email, productId, token, firstName, lastName } = await request.json()

    if (!email || !productId) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      return NextResponse.json({ error: "Invalid email address" }, { status: 400 })
    }

    const { data: product, error: productError } = await admin
      .from("products")
      .select("id, title, slug, creator_id, type, price_cents")
      .eq("id", productId)
      .eq("status", "published")
      .single()

    if (productError || !product) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 })
    }

    // Verify product is free
    if (product.price_cents && product.price_cents > 0) {
      return NextResponse.json({ error: "This product is not free" }, { status: 400 })
    }

    const { data: creator } = await admin.from("creators").select("id, user_id").eq("id", product.creator_id).single()

    if (!creator) {
      return NextResponse.json({ error: "Creator not found" }, { status: 404 })
    }

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (user) {
      const { data: existingEntitlement } = await admin
        .from("entitlements")
        .select("id")
        .eq("buyer_id", user.id)
        .eq("product_id", product.id)
        .maybeSingle()

      if (existingEntitlement) {
        // Already owns - redirect to library
        return NextResponse.json({
          success: true,
          redirectUrl: `/library?already_owned=true&highlight=${product.id}`,
        })
      }
    }

    // Generate tokens
    const accessToken = token || nanoid(32)
    const receiptToken = generateReceiptToken()
    const sessionFingerprint = nanoid(32)
    const cookieStore = await cookies()

    // Collect device and geo info
    const { deviceInfo, geoInfo } = collectOrderDeviceInfo(request)

    // Get domain for cross-subdomain cookie support
    const mainDomain = process.env.NEXT_PUBLIC_MAIN_DOMAIN || "storelib.com"
    const isLocalhost = mainDomain.includes("localhost")

    // Set session cookie with cross-subdomain support
    cookieStore.set("materia_session", sessionFingerprint, {
      httpOnly: true,
      secure: !isLocalhost,
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 365,
      path: "/",
      domain: isLocalhost ? undefined : `.${mainDomain}`,
    })

    const { data: order, error: orderError } = await admin
      .from("orders")
      .insert({
        buyer_id: user?.id || null,
        product_id: product.id,
        amount_cents: 0,
        fee_cents: 0,
        status: "completed",
        provider: "free",
        buyer_email: email.toLowerCase().trim(),
        buyer_first_name: firstName || null,
        buyer_last_name: lastName || null,
        access_token: user ? null : accessToken,
        receipt_token: receiptToken,
        session_fingerprint: sessionFingerprint,
        allowed_fingerprints: [sessionFingerprint],
        buyer_email_attempt_count: 0,
        seller_email_attempt_count: 0,
        // Payment method for free orders
        payment_method: "free",
        // Device and geo info
        buyer_country: geoInfo.country,
        buyer_country_code: geoInfo.countryCode,
        buyer_device_type: deviceInfo.deviceType,
        buyer_os: deviceInfo.os,
        buyer_browser: deviceInfo.browser,
      })
      .select()
      .single()

    if (orderError) {
      console.error("[free] Error creating free order:", orderError)
      return NextResponse.json({ error: "Failed to create order" }, { status: 500 })
    }

    console.log("[free] ✅ Order created:", order.id)
    await tagOrderSource(admin, order.id, orderSourceFrom(null, request))

    if (user) {
      const { error: entitlementError } = await admin.from("entitlements").insert({
        buyer_id: user.id,
        creator_id: creator.id,
        product_id: product.id,
        community_access: false,
      })

      if (entitlementError) {
        console.error("[free] Error creating entitlement:", entitlementError)
      } else {
        console.log("[free] ✅ Entitlement created for user:", user.id, "product:", product.id)
      }
    }

    // Upsert customer
    const { error: upsertError } = await admin.rpc("upsert_customer", {
      p_creator_id: creator.id,
      p_email: email.toLowerCase().trim(),
      p_first_name: firstName || "",
      p_last_name: lastName || "",
      p_order_amount_cents: 0,
    })
    if (upsertError) console.error("[free] Error upserting customer:", upsertError)

    // Add buyer to seller's subscribers list for future email marketing
    const normalizedEmail = email.toLowerCase().trim()
    const { data: existingSubscriber } = await admin
      .from("subscribers")
      .select("id, status")
      .eq("creator_id", creator.id)
      .eq("email", normalizedEmail)
      .maybeSingle()

    if (!existingSubscriber) {
      const unsubscribeToken = uuidv4()
      const buyerName = `${firstName || ""} ${lastName || ""}`.trim() || null
      await admin.from("subscribers").insert({
        email: normalizedEmail,
        name: buyerName,
        source: "checkout",
        source_id: order.id,
        creator_id: creator.id,
        status: "subscribed",
        is_active: true,
        subscribed_at: new Date().toISOString(),
        consent_text: "Subscribed via product checkout",
        consent_timestamp: new Date().toISOString(),
        unsubscribe_token: unsubscribeToken,
      })
      console.log("[free] ✅ Added buyer to subscribers:", normalizedEmail)
    } else if (existingSubscriber.status === "unsubscribed") {
      await admin
        .from("subscribers")
        .update({
          status: "subscribed",
          is_active: true,
          subscribed_at: new Date().toISOString(),
          unsubscribed_at: null,
        })
        .eq("id", existingSubscriber.id)
      console.log("[free] ✅ Re-subscribed buyer:", normalizedEmail)
    } else {
      console.log("[free] ✅ Buyer already subscribed:", normalizedEmail)
    }

    // Increment sales count
    const { error: salesError } = await admin.rpc("increment_product_sales", { p_product_id: productId })
    if (salesError) console.error("[free] Error incrementing sales:", salesError)

    // Record analytics
    const { error: analyticsError } = await admin.from("analytics_events").insert({
      creator_id: creator.id,
      product_id: product.id,
      event_type: "purchase",
    })
    if (analyticsError) console.error("[free] Error recording analytics:", analyticsError)

    // Send emails - "Your download is ready" email
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || "https://storelib.com"

    console.log("[free] Sending order emails...")

    const emailResults = await sendOrderEmails(admin, {
      orderId: order.id,
      buyerEmail: email.toLowerCase().trim(),
      buyerFirstName: firstName || "",
      buyerLastName: lastName || "",
      productTitle: product.title,
      receiptToken: receiptToken,
      creatorId: creator.id,
      amountCents: 0,
      feeCents: 0,
      baseUrl,
    })

    console.log("[free] Email results:", emailResults)

    // Push notification to seller — non-fatal
    try {
      const { notifySale } = await import("@/lib/push/notifications")
      const creatorUserId = (creator as any).user_id as string | null
      if (creatorUserId) {
        console.log("[push] Sending sale notification to creator user:", creatorUserId)
        await notifySale(creatorUserId, {
          productName: product.title,
          amountCents: 0,
          orderId: order.id,
          productId: product.id,
        })
        console.log("[push] Push send result: OK")
      } else {
        console.log("[push] No user_id on creator — skipping push")
      }
    } catch (pushErr) {
      console.error("[push] Sale notification error (non-fatal):", pushErr)
    }

    // Redirect to receipt page
    return NextResponse.json({
      success: true,
      redirectUrl: `/receipt/${receiptToken}?${emailResults.buyerSuccess ? "emailSent=1" : "emailFailed=1"}`,
      receiptToken,
      emailSent: emailResults.buyerSuccess,
    })
  } catch (error) {
    console.error("[free] Free checkout error:", error)
    return NextResponse.json({ error: "Checkout failed" }, { status: 500 })
  }
}
