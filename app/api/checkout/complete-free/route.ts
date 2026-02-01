import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"
import crypto from "crypto"
import { sendOrderEmails } from "@/lib/email"
import { cookies } from "next/headers"
import { nanoid } from "nanoid"

export const runtime = "nodejs"

function isValidEmail(email: string) {
  return typeof email === "string" && email.includes("@") && email.length <= 254
}

function getBaseUrl() {
  return (
    process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || "https://storelib.com"
  )
}

export async function POST(req: Request) {
  try {
    const { productId, email, firstName, lastName, variantId } = await req.json()

    if (!productId || !isValidEmail(email)) {
      return NextResponse.json({ error: "Missing or invalid productId/email" }, { status: 400 })
    }

    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    const buyerId = user?.id || null

    const admin = createAdminClient()

    const { data: product, error } = await admin
      .from("products")
      .select("id,title,price_cents,creator_id,slug,type")
      .eq("id", productId)
      .single()

    if (error || !product) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 })
    }

    if (!product.creator_id) {
      return NextResponse.json({ error: "Product is missing creator_id" }, { status: 400 })
    }

    if (product.price_cents && product.price_cents > 0) {
      return NextResponse.json({ error: "Product is paid. Use /api/checkout/create-intent" }, { status: 400 })
    }

    // Fetch variant if specified (include description for snapshot)
    let selectedVariant: { id: string; name: string; description?: string; price_cents?: number; position?: number } | null = null
    if (variantId) {
      const { data: variant } = await admin
        .from("product_variants")
        .select("id, name, description, price_cents, position")
        .eq("id", variantId)
        .eq("product_id", productId)
        .single()

      if (variant) {
        selectedVariant = variant
        // For free products, variant should also be free
        if (variant.price_cents && variant.price_cents > 0) {
          return NextResponse.json({ error: "Product variant is paid. Use /api/checkout/create-intent" }, { status: 400 })
        }
      }
    }

    const accessToken = crypto.randomBytes(24).toString("hex")
    const receiptToken = crypto.randomBytes(24).toString("hex")
    const sessionFingerprint = nanoid(32)

    if (buyerId) {
      const { data: existingEnt } = await admin
        .from("entitlements")
        .select("id")
        .eq("buyer_id", buyerId)
        .eq("product_id", product.id)
        .maybeSingle()

      if (existingEnt?.id) {
        return NextResponse.json({ redirectUrl: `/library/products?highlight=${product.id}` })
      }
    }

    // Try full insert first, fallback to minimal if it fails
    let order = null
    let orderError = null

    const fullOrderData = {
      buyer_id: buyerId,
      product_id: product.id,
      amount_cents: 0,
      status: "completed",
      provider: "free",
      buyer_email: email.toLowerCase().trim(),
      buyer_first_name: firstName || null,
      buyer_last_name: lastName || null,
      access_token: buyerId ? null : accessToken,
      receipt_token: receiptToken,
      session_fingerprint: sessionFingerprint,
    }

    const result1 = await admin.from("orders").insert(fullOrderData).select().single()
    order = result1.data
    orderError = result1.error

    // If that fails, try with minimal fields only
    if (orderError) {
      console.log("[complete-free] Full insert failed, trying minimal:", orderError.message)

      const minimalOrderData = {
        buyer_id: buyerId,
        product_id: product.id,
        amount_cents: 0,
        status: "completed",
      }

      const result2 = await admin.from("orders").insert(minimalOrderData).select().single()
      order = result2.data
      orderError = result2.error
    }

    if (orderError || !order) {
      console.error("[complete-free] orderError:", orderError)
      return NextResponse.json({ error: "Failed to create order" }, { status: 500 })
    }

    // Get domain for cross-subdomain cookie support
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
    console.log("[complete-free] ✅ Set materia_session cookie for device recognition")

    const { error: entErr } = await admin.from("entitlements").insert({
      buyer_id: buyerId,
      creator_id: product.creator_id,
      product_id: product.id,
      community_access: product.type === "community",
    })
    if (entErr) console.error("[complete-free] entitlementError:", entErr)

    const { error: salesError } = await admin.rpc("increment_product_sales", { p_product_id: product.id })
    if (salesError) console.error("[complete-free] Error incrementing sales:", salesError)

    const { error: analyticsError } = await admin
      .from("analytics_events")
      .insert({ creator_id: product.creator_id, product_id: product.id, event_type: "purchase" })
    if (analyticsError) console.error("[complete-free] Error recording analytics:", analyticsError)

    const baseUrl = getBaseUrl()

    const emailResults = await sendOrderEmails(admin, {
      orderId: order.id,
      buyerEmail: email.toLowerCase().trim(),
      buyerFirstName: firstName || "",
      buyerLastName: lastName || "",
      productTitle: product.title,
      receiptToken: receiptToken,
      creatorId: product.creator_id,
      amountCents: 0,
      feeCents: 0,
      baseUrl,
      variantName: selectedVariant?.name || null,
    })

    console.log("[complete-free] Email results:", emailResults)

    return NextResponse.json({
      redirectUrl: `/receipt/${receiptToken}?${emailResults.buyerSuccess ? "emailSent=1" : "emailFailed=1"}`,
    })
  } catch (err: any) {
    console.error("[complete-free] error:", err)
    return NextResponse.json({ error: "Failed free checkout" }, { status: 500 })
  }
}
