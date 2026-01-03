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

    const { productId, firstName, lastName, email, tipCents = 0, isGift = false } = body

    console.log("[checkout/process] Starting free checkout for:", firstName, lastName, email)

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

    const total = (product.price_cents || 0) + (tipCents || 0)

    if (total > 0) {
      return NextResponse.json({ error: "Paid products must use Stripe checkout" }, { status: 400 })
    }

    // Check if user already owns product
    if (user) {
      const { data: existingEntitlement } = await admin
        .from("entitlements")
        .select("id")
        .eq("buyer_id", user.id)
        .eq("product_id", productId)
        .maybeSingle()

      if (existingEntitlement) {
        console.log("[checkout/process] User already owns this product")
        return NextResponse.json({ redirectUrl: `/library/my-downloads` }, { status: 200 })
      }
    }

    // Generate tokens
    const accessToken = nanoid(32)
    const sessionFingerprint = nanoid(32)
    const receiptToken = generateReceiptToken()

    console.log("[checkout/process] Generated receipt token:", receiptToken.substring(0, 10) + "...")

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

    console.log("[checkout/process] Creating order for email:", email.toLowerCase().trim())

    const { data: order, error: orderError } = await admin.from("orders").insert(orderData).select().single()

    if (orderError || !order) {
      console.error("[checkout/process] Order creation failed:", orderError)
      return NextResponse.json(
        {
          error: "Failed to create order",
          details: orderError?.message,
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

    // Create entitlement for logged-in users
    if (user) {
      const { error: entitlementError } = await admin.from("entitlements").insert({
        buyer_id: user.id,
        creator_id: product.creator.id,
        product_id: product.id,
        community_access: product.includes_community || false,
      })

      if (entitlementError) {
        console.error("[checkout/process] Entitlement error:", entitlementError)
      } else {
        console.log("[checkout/process] ✅ Entitlement created for user:", user.id)
      }
    }

    // Update sales count and analytics
    await admin.rpc("increment_product_sales", { p_product_id: productId })
    await admin.from("analytics_events").insert({
      creator_id: product.creator.id,
      product_id: product.id,
      event_type: "purchase",
    })

    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || "https://materia.app"

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
