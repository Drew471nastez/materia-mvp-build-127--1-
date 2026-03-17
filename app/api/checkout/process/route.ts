import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"
import { nanoid } from "nanoid"
import { cookies } from "next/headers"
import { generateReceiptToken } from "@/lib/security"
import { sendOrderEmails, triggerEmailFlows } from "@/lib/email"
import { collectOrderDeviceInfo } from "@/lib/device-info"
import { v4 as uuidv4 } from "uuid"

export const runtime = "nodejs"

console.log("[checkout/process] NEW PUSH BUILD ACTIVE")

export async function POST(request: Request) {
  console.log("[checkout/process] handler entered")
  try {
    const supabase = await createClient()
    const admin = createAdminClient()
    const body = await request.json()
    const cookieStore = await cookies()

    const { productId, firstName, lastName, email, tipCents = 0, isGift = false, variantId, customPriceCents = null, emailOptIn = true } = body

    console.log("[checkout/process] Starting free checkout for:", firstName, lastName, email)
    console.log("[checkout/process] Variant ID:", variantId || "none")

    if (!productId || !firstName || !lastName || !email) {
      console.log("[checkout/process] RETURN: missing required fields")
      return NextResponse.json({ error: "All fields are required" }, { status: 400 })
    }

    if (!email.includes("@") || !email.includes(".")) {
      console.log("[checkout/process] RETURN: invalid email")
      return NextResponse.json({ error: "Valid email address is required" }, { status: 400 })
    }

    const {
      data: { user },
    } = await supabase.auth.getUser()

    console.log("[checkout/process] User authenticated:", user ? user.id : "guest")

    // Get product with creator info
    const { data: product, error: productError } = await admin
      .from("products")
      .select("*, creator:creators!inner(id, user_id)")
      .eq("id", productId)
      .eq("status", "published")
      .single()

    if (productError || !product) {
      console.error("[checkout/process] RETURN: product not found:", productError)
      return NextResponse.json({ error: "Product not found" }, { status: 404 })
    }

    console.log("[checkout/process] creator.id:", product.creator.id, "creator.user_id:", (product.creator as any).user_id ?? "NULL — push will be skipped!")

    // Fetch variant if specified (include description for snapshot)
    let selectedVariant = null
    let variantPriceCents = 0
    if (variantId) {
      const { data: variant } = await admin
        .from("product_variants")
        .select("id, name, description, price_cents, position")
        .eq("id", variantId)
        .eq("product_id", productId)
        .single()

      if (variant) {
        selectedVariant = variant
        variantPriceCents = variant.price_cents || 0
      }
    }

    // Calculate total - use variant price if selected, otherwise product price
    const basePriceCents = selectedVariant ? variantPriceCents : (product.price_cents || 0)
    const total = basePriceCents + (tipCents || 0)

    console.log("[checkout/process] basePriceCents:", basePriceCents, "tipCents:", tipCents, "total:", total, "— isFree:", total === 0)

    if (total > 0) {
      console.log("[checkout/process] RETURN: total > 0 (" + total + "), redirecting to Stripe")
      return NextResponse.json({ error: "Paid products must use Stripe checkout" }, { status: 400 })
    }

    // Check if user already owns this specific variant (for per-variant access)
    // We still allow proceeding to create a new order/receipt for re-downloads
    let alreadyOwnsVariant = false
    if (user) {
      let entitlementQuery = admin
        .from("entitlements")
        .select("id")
        .eq("buyer_id", user.id)
        .eq("product_id", productId)

      // If variant specified, check for that specific variant
      if (variantId) {
        entitlementQuery = entitlementQuery.eq("variant_id", variantId)
      } else {
        entitlementQuery = entitlementQuery.is("variant_id", null)
      }

      const { data: existingEntitlement } = await entitlementQuery.maybeSingle()
      alreadyOwnsVariant = !!existingEntitlement

      if (alreadyOwnsVariant) {
        console.log("[checkout/process] User already owns this product/variant - will still create receipt")
      }
    }

    // Generate tokens
    const accessToken = nanoid(32)
    const sessionFingerprint = nanoid(32)
    const receiptToken = generateReceiptToken()

    // Collect device and geo info
    const { deviceInfo, geoInfo } = collectOrderDeviceInfo(request)

    console.log("[checkout/process] Generated receipt token:", receiptToken.substring(0, 10) + "...")

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

    // Create order - try multiple strategies
    console.log("[checkout/process] Creating order for email:", email.toLowerCase().trim())
    console.log("[checkout/process] User ID:", user?.id || "guest (null)")

    let order = null
    let orderError = null
    let insertStrategy = "unknown"

    // Strategy 1: Full data with all fields
    const fullOrderData: Record<string, any> = {
      buyer_first_name: firstName.trim(),
      buyer_last_name: lastName.trim(),
      buyer_email: email.toLowerCase().trim(),
      product_id: product.id,
      amount_cents: 0,
      tip_cents: tipCents || 0,
      currency: "usd",
      status: "completed",
      provider: "free",
      fee_cents: 0,
      session_fingerprint: sessionFingerprint,
      receipt_token: receiptToken,
    }

    // Only include buyer_id if user is logged in (to avoid NOT NULL constraint issues)
    if (user?.id) {
      fullOrderData.buyer_id = user.id
    }
    // For guests, don't include access_token in full data to reduce failure points
    if (!user) {
      fullOrderData.access_token = accessToken
    }

    console.log("[checkout/process] Attempting Strategy 1: Full insert")
    const result1 = await admin.from("orders").insert(fullOrderData).select().single()
    order = result1.data
    orderError = result1.error
    insertStrategy = "full"

    // Strategy 2: Minimal fields with required columns
    if (orderError) {
      console.log("[checkout/process] Strategy 1 failed:", orderError.message, orderError.code)

      const minimalOrderData: Record<string, any> = {
        product_id: product.id,
        amount_cents: 0,
        status: "completed",
        receipt_token: receiptToken,
        buyer_email: email.toLowerCase().trim(),
      }

      if (user?.id) {
        minimalOrderData.buyer_id = user.id
      }

      console.log("[checkout/process] Attempting Strategy 2: Minimal insert with receipt_token")
      const result2 = await admin.from("orders").insert(minimalOrderData).select().single()
      order = result2.data
      orderError = result2.error
      insertStrategy = "minimal"
    }

    if (orderError || !order) {
      console.error("[checkout/process] RETURN: all order creation strategies failed:", orderError)
      return NextResponse.json(
        {
          error: "Failed to create order",
          details: orderError?.message || "Unknown error",
          code: orderError?.code,
          hint: orderError?.hint,
          strategy: insertStrategy,
          debug: "Please run the database migration to allow guest checkout. See fix_orders_complete.sql"
        },
        { status: 500 },
      )
    }

    console.log("[checkout/process] ✅ Order created successfully:", order.id)

    // Upsert customer
    await admin.rpc("upsert_customer", {
      p_creator_id: product.creator.id,
      p_email: email.toLowerCase().trim(),
      p_first_name: firstName.trim(),
      p_last_name: lastName.trim(),
      p_order_amount_cents: 0,
    })

    // Add buyer to seller's subscribers list only if they opted in
    if (emailOptIn) {
      const normalizedEmail = email.toLowerCase().trim()
      const { data: existingSubscriber } = await admin
        .from("subscribers")
        .select("id, status")
        .eq("creator_id", product.creator.id)
        .eq("email", normalizedEmail)
        .maybeSingle()

      if (!existingSubscriber) {
        const unsubscribeToken = uuidv4()
        await admin.from("subscribers").insert({
          email: normalizedEmail,
          name: `${firstName.trim()} ${lastName.trim()}`.trim() || null,
          source: "checkout",
          source_id: order.id,
          creator_id: product.creator.id,
          status: "subscribed",
          is_active: true,
          subscribed_at: new Date().toISOString(),
          consent_text: "Subscribed via product checkout (opted in)",
          consent_timestamp: new Date().toISOString(),
          unsubscribe_token: unsubscribeToken,
        })
        console.log("[checkout/process] ✅ Added buyer to subscribers (opted in):", normalizedEmail)
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
        console.log("[checkout/process] ✅ Re-subscribed buyer (opted in):", normalizedEmail)
      } else {
        console.log("[checkout/process] ✅ Buyer already subscribed:", normalizedEmail)
      }
    } else {
      console.log("[checkout/process] ℹ️ Buyer opted out of marketing emails:", email)
    }

    // Create entitlement for logged-in users (with variant_id for per-variant access)
    // Skip if user already owns this variant (we checked earlier)
    if (user && !alreadyOwnsVariant) {
      const { error: entitlementError } = await admin.from("entitlements").insert({
        buyer_id: user.id,
        creator_id: product.creator.id,
        product_id: product.id,
        variant_id: selectedVariant?.id || null,
        community_access: product.includes_community || false,
      })

      if (entitlementError) {
        console.error("[checkout/process] Entitlement error:", entitlementError)
      } else {
        console.log("[checkout/process] ✅ Entitlement created for user:", user.id)
      }
    } else if (alreadyOwnsVariant) {
      console.log("[checkout/process] ✅ Skipped entitlement - user already owns this variant")
    }

    // Update sales count and analytics
    await admin.rpc("increment_product_sales", { p_product_id: productId })
    await admin.from("analytics_events").insert({
      creator_id: product.creator.id,
      product_id: product.id,
      event_type: "purchase",
    })

    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || "https://storelib.com"

    let emailResults = { buyerSuccess: false }
    try {
      emailResults = await sendOrderEmails(admin, {
        orderId: order.id,
        buyerEmail: email.toLowerCase().trim(),
        buyerFirstName: firstName.trim(),
        buyerLastName: lastName.trim(),
        productTitle: product.title,
        receiptToken: receiptToken,
        creatorId: product.creator.id,
        amountCents: 0,
        feeCents: 0,
        baseUrl,
        variantName: selectedVariant?.name || null,
      })
      console.log("[checkout/process] Email results:", emailResults)
    } catch (emailErr) {
      console.error("[checkout/process] sendOrderEmails threw (non-fatal):", emailErr)
    }

    // Push notification to seller — non-fatal
    try {
      const { notifySale } = await import("@/lib/push/notifications")
      const creatorUserId = (product.creator as any).user_id as string | null
      console.error("[push-debug] creatorUserId =", creatorUserId)
      if (creatorUserId) {
        console.error("[push-debug] ABOUT TO CALL NOTIFYSALE")
        await notifySale(creatorUserId, {
          productName: product.title,
          amountCents: basePriceCents,
          orderId: order.id,
          productId: product.id,
        })
        console.error("[push-debug] NOTIFYSALE FINISHED OK")
      } else {
        console.log("[push] No user_id on creator — skipping push")
      }
    } catch (error) {
      console.error("[push-debug] NOTIFYSALE ERROR", error)
    }

    // Trigger email flows for purchase
    try {
      await triggerEmailFlows(admin, {
        triggerType: "purchase",
        creatorId: product.creator.id,
        recipientEmail: email.toLowerCase().trim(),
        recipientName: firstName.trim(),
        productTitle: product.title,
        productId: product.id,
        orderId: order.id,
      })
    } catch (flowErr) {
      console.error("[checkout/process] Email flow trigger error (non-fatal):", flowErr)
    }

    console.log("[checkout/process] RETURN: success — checkout complete, order:", order.id)

    return NextResponse.json({
      success: true,
      redirectUrl: `/receipt/${receiptToken}?${emailResults.buyerSuccess ? "emailSent=1" : "emailFailed=1"}`,
      orderId: order.id,
      receiptToken,
      emailSent: emailResults.buyerSuccess,
    })
  } catch (error) {
    console.error("[checkout/process] RETURN: caught top-level error:", error)
    return NextResponse.json(
      {
        error: "Checkout failed",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    )
  }
}
