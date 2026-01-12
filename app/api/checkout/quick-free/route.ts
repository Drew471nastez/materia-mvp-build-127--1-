import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"
import { nanoid } from "nanoid"
import { cookies } from "next/headers"
import { generateReceiptToken } from "@/lib/security"
import { sendOrderEmails } from "@/lib/email"

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const admin = createAdminClient()
    const body = await request.json()
    const cookieStore = await cookies()

    const { product_id, first_name, last_name, email } = body

    console.log("[quick-free] Starting quick checkout for:", first_name, last_name, email)

    if (!product_id || !first_name || !last_name || !email) {
      return NextResponse.json({ error: "All fields are required" }, { status: 400 })
    }

    if (!email.includes("@") || !email.includes(".")) {
      return NextResponse.json({ error: "Valid email address is required" }, { status: 400 })
    }

    const {
      data: { user },
    } = await supabase.auth.getUser()

    console.log("[quick-free] User authenticated:", user ? user.id : "guest")

    // Get product with creator info
    const { data: product, error: productError } = await admin
      .from("products")
      .select("*, creator:creators!inner(id, user_id)")
      .eq("id", product_id)
      .eq("status", "published")
      .single()

    if (productError || !product) {
      console.error("[quick-free] Product not found:", productError)
      return NextResponse.json({ error: "Product not found" }, { status: 404 })
    }

    // Verify product is free
    if (product.price_cents && product.price_cents > 0) {
      return NextResponse.json({ error: "Quick checkout is only available for free products" }, { status: 400 })
    }

    // Check if user already owns product
    if (user) {
      const { data: existingEntitlement } = await admin
        .from("entitlements")
        .select("id")
        .eq("buyer_id", user.id)
        .eq("product_id", product_id)
        .maybeSingle()

      if (existingEntitlement) {
        console.log("[quick-free] User already owns this product, fetching assets")
        // Fetch digital assets for user who already owns the product
        const { data: assets } = await admin
          .from("digital_assets")
          .select("id, file_name, file_path")
          .eq("product_id", product_id)
          .order("created_at", { ascending: true })

        // Get the most recent order with receipt token for this user/product
        const { data: existingOrder } = await admin
          .from("orders")
          .select("receipt_token")
          .eq("buyer_id", user.id)
          .eq("product_id", product_id)
          .eq("status", "completed")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle()

        return NextResponse.json({
          success: true,
          already_owned: true,
          assets: assets || [],
          receipt_token: existingOrder?.receipt_token || null,
        })
      }
    }

    // Generate tokens
    const accessToken = nanoid(32)
    const sessionFingerprint = nanoid(32)
    const receiptToken = generateReceiptToken()

    console.log("[quick-free] Generated receipt token:", receiptToken.substring(0, 10) + "...")

    // Set session cookie
    cookieStore.set("materia_session", sessionFingerprint, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 365,
      path: "/",
    })

    // Create order
    const orderData = {
      buyer_id: user?.id || null,
      buyer_first_name: first_name.trim(),
      buyer_last_name: last_name.trim(),
      buyer_email: email.toLowerCase().trim(),
      product_id: product.id,
      amount_cents: 0,
      tip_cents: 0,
      currency: "usd",
      status: "completed",
      provider: "free",
      fee_cents: 0,
      access_token: user ? null : accessToken,
      stripe_session_id: null,
      stripe_payment_intent_id: null,
      session_fingerprint: sessionFingerprint,
      receipt_token: receiptToken,
      allowed_fingerprints: [sessionFingerprint],
      agreed_to_terms: true,
      agreed_at: new Date().toISOString(),
      buyer_email_attempt_count: 0,
      seller_email_attempt_count: 0,
    }

    console.log("[quick-free] Creating order for email:", email.toLowerCase().trim())

    const { data: order, error: orderError } = await admin.from("orders").insert(orderData).select().single()

    if (orderError || !order) {
      console.error("[quick-free] Order creation failed:", orderError)
      return NextResponse.json(
        {
          error: "Failed to create order",
          details: orderError?.message,
        },
        { status: 500 },
      )
    }

    console.log("[quick-free] ✅ Order created successfully:", order.id)

    // Upsert customer
    await admin.rpc("upsert_customer", {
      p_creator_id: product.creator.id,
      p_email: email.toLowerCase().trim(),
      p_first_name: first_name.trim(),
      p_last_name: last_name.trim(),
      p_order_amount_cents: 0,
    })

    // Create entitlement for logged-in users
    if (user) {
      const { error: entitlementError } = await admin.from("entitlements").insert({
        buyer_id: user.id,
        creator_id: product.creator.id,
        product_id: product.id,
        community_access: product.includes_community || false,
      })

      if (entitlementError) {
        console.error("[quick-free] Entitlement error:", entitlementError)
      } else {
        console.log("[quick-free] ✅ Entitlement created for user:", user.id)
      }
    }

    // Update sales count and analytics
    await admin.rpc("increment_product_sales", { p_product_id: product_id })
    await admin.from("analytics_events").insert({
      creator_id: product.creator.id,
      product_id: product.id,
      event_type: "purchase",
    })

    // Fetch digital assets
    const { data: assets } = await admin
      .from("digital_assets")
      .select("id, file_name, file_path")
      .eq("product_id", product_id)
      .order("created_at", { ascending: true })

    console.log("[quick-free] Found", assets?.length || 0, "digital assets")

    // Send emails asynchronously (don't block the response)
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || "https://materia.app"

    sendOrderEmails(admin, {
      orderId: order.id,
      buyerEmail: email.toLowerCase().trim(),
      buyerFirstName: first_name.trim(),
      buyerLastName: last_name.trim(),
      productTitle: product.title,
      receiptToken: receiptToken,
      creatorId: product.creator.id,
      amountCents: 0,
      feeCents: 0,
      baseUrl,
    }).then((emailResults) => {
      console.log("[quick-free] Email results:", emailResults)
    }).catch((err) => {
      console.error("[quick-free] Email error:", err)
    })

    console.log("[quick-free] ✅ Quick checkout complete")

    return NextResponse.json({
      success: true,
      order_id: order.id,
      receipt_token: receiptToken,
      assets: assets || [],
    })
  } catch (error) {
    console.error("[quick-free] ❌ Checkout error:", error)
    return NextResponse.json(
      {
        error: "Checkout failed",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    )
  }
}
