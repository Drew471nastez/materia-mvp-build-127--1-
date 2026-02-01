import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"
import { nanoid } from "nanoid"
import { cookies } from "next/headers"
import { generateReceiptToken } from "@/lib/security"
import { sendOrderEmails } from "@/lib/email"
import { collectOrderDeviceInfo } from "@/lib/device-info"

export const runtime = "nodejs"

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const admin = createAdminClient()
    const body = await request.json()
    const cookieStore = await cookies()

    const { productId, firstName, lastName, email, tipCents = 0, isGift = false, variantId, customPriceCents = null } = body

    console.log("[checkout/process] Starting free checkout for:", firstName, lastName, email)
    console.log("[checkout/process] Variant ID:", variantId || "none")

    if (!productId || !firstName || !lastName || !email) {
      return NextResponse.json({ error: "All fields are required" }, { status: 400 })
    }

    if (!email.includes("@") || !email.includes(".")) {
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
      console.error("[checkout/process] Product not found:", productError)
      return NextResponse.json({ error: "Product not found" }, { status: 404 })
    }

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

    if (total > 0) {
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
      console.error("[checkout/process] All order creation strategies failed:", orderError)
      // Return detailed error for debugging
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

    const emailResults = await sendOrderEmails(admin, {
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
    console.log("[checkout/process] ✅ Checkout complete, redirecting to receipt")

    return NextResponse.json({
      success: true,
      redirectUrl: `/receipt/${receiptToken}?${emailResults.buyerSuccess ? "emailSent=1" : "emailFailed=1"}`,
      orderId: order.id,
      receiptToken,
      emailSent: emailResults.buyerSuccess,
    })
  } catch (error) {
    console.error("[checkout/process] ❌ Checkout error:", error)
    return NextResponse.json(
      {
        error: "Checkout failed",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    )
  }
}
