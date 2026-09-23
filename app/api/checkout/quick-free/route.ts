import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"
import { nanoid } from "nanoid"
import { cookies } from "next/headers"
import { generateReceiptToken } from "@/lib/security"
import { sendOrderEmails } from "@/lib/email"
import { v4 as uuidv4 } from "uuid"
import { orderSourceFromRequest, tagOrderSource } from "@/lib/orders/order-source"
import { rateLimit, addressSubject, emailSubject, LIMITS } from "@/lib/api/rate-limit"
import { baseFor } from "@/lib/checkout/pricing"

export const runtime = "nodejs"

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

    if (typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      return NextResponse.json({ error: "Valid email address is required" }, { status: 400 })
    }

    /* Each claim emails the address it is given. */
    const limited = await rateLimit({
      bucket: "claim",
      subjects: [addressSubject(request), emailSubject(email)],
      windows: LIMITS.claim,
      message: "That is a lot of requests from one place. Try again in a few minutes.",
    })
    if (limited) return limited

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

    /* Free means free: not a pay-what-you-want product (its price is in
       `pwyw_min_price_cents`, with `price_cents` left at 0), and not a
       product with a paid option, whose files an order without a variant
       would have handed over whole. */
    const base = baseFor(product, undefined)
    if (base.ok === false || base.cents > 0) {
      return NextResponse.json({ error: "Quick checkout is only available for free products" }, { status: 400 })
    }
    const { data: paidOption } = await admin
      .from("product_variants")
      .select("id")
      .eq("product_id", product_id)
      .or("price_cents.gt.0,pay_what_you_want.eq.true")
      .limit(1)
    if (paidOption && paidOption.length > 0) {
      return NextResponse.json({ error: "Choose an option on the product page to get this." }, { status: 400 })
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
          .select("id, file_name")
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

    // Create order - try full insert first, fallback to minimal if it fails
    console.log("[quick-free] Creating order for email:", email.toLowerCase().trim())

    let order = null
    let orderError = null

    const fullOrderData = {
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
      session_fingerprint: sessionFingerprint,
      receipt_token: receiptToken,
    }

    const result1 = await admin.from("orders").insert(fullOrderData).select().single()
    order = result1.data
    orderError = result1.error

    // If full insert fails, try with minimal fields only (including required receipt_token)
    if (orderError) {
      console.log("[quick-free] Full insert failed, trying minimal fields:", orderError.message)

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

      const result2 = await admin.from("orders").insert(minimalOrderData).select().single()
      order = result2.data
      orderError = result2.error
    }

    if (orderError || !order) {
      console.error("[quick-free] Order creation failed:", orderError)
      return NextResponse.json(
        {
          error: "Failed to create order",
        },
        { status: 500 },
      )
    }

    console.log("[quick-free] ✅ Order created successfully:", order.id)
    await tagOrderSource(admin, order.id, orderSourceFromRequest(request))

    // Upsert customer
    await admin.rpc("upsert_customer", {
      p_creator_id: product.creator.id,
      p_email: email.toLowerCase().trim(),
      p_first_name: first_name.trim(),
      p_last_name: last_name.trim(),
      p_order_amount_cents: 0,
    })

    // Add buyer to seller's subscribers list for future email marketing
    const normalizedEmail = email.toLowerCase().trim()
    const { data: existingSubscriber } = await admin
      .from("subscribers")
      .select("id, status")
      .eq("creator_id", product.creator.id)
      .eq("email", normalizedEmail)
      .maybeSingle()

    if (!existingSubscriber) {
      const unsubscribeToken = uuidv4()
      const buyerName = `${first_name.trim()} ${last_name.trim()}`.trim() || null
      await admin.from("subscribers").insert({
        email: normalizedEmail,
        name: buyerName,
        source: "checkout",
        source_id: order.id,
        creator_id: product.creator.id,
        status: "subscribed",
        is_active: true,
        subscribed_at: new Date().toISOString(),
        consent_text: "Subscribed via product checkout",
        consent_timestamp: new Date().toISOString(),
        unsubscribe_token: unsubscribeToken,
      })
      console.log("[quick-free] ✅ Added buyer to subscribers:", normalizedEmail)
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
      console.log("[quick-free] ✅ Re-subscribed buyer:", normalizedEmail)
    } else {
      console.log("[quick-free] ✅ Buyer already subscribed:", normalizedEmail)
    }

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
      .select("id, file_name")
      .eq("product_id", product_id)
      .order("created_at", { ascending: true })

    console.log("[quick-free] Found", assets?.length || 0, "digital assets")

    // Send emails immediately and await to ensure they're sent
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || "https://storelib.com"

    console.log("[quick-free] Sending order emails...")

    const emailResults = await sendOrderEmails(admin, {
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
    })

    console.log("[quick-free] Email results:", emailResults)

    console.log("[quick-free] ✅ Quick checkout complete")

    return NextResponse.json({
      success: true,
      order_id: order.id,
      receipt_token: receiptToken,
      assets: assets || [],
      email_sent: emailResults.buyerSuccess,
    })
  } catch (error) {
    console.error("[quick-free] ❌ Checkout error:", error)
    return NextResponse.json(
      {
        error: "Checkout failed",
      },
      { status: 500 },
    )
  }
}
