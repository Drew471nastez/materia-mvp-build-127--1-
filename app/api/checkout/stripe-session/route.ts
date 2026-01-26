import { NextResponse } from "next/server"
import { stripe } from "@/lib/stripe"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { nanoid } from "nanoid"
import { cookies } from "next/headers"
import { generateReceiptToken } from "@/lib/security"
import { collectOrderDeviceInfo } from "@/lib/device-info"

function calculatePlatformFee(amountCents: number): number {
  const feePercent = 0.06 // 6%
  const feeFixed = 30 // $0.30 in cents
  const fee = Math.round(amountCents * feePercent) + feeFixed
  return Math.min(fee, amountCents - 50) // Leave at least $0.50 for seller
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const admin = createAdminClient()
  const body = await request.json()
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || request.headers.get("origin") || ""

  const { productId, firstName, lastName, email, tipCents = 0, isGift = false } = body

  if (!productId || !firstName || !lastName || !email) {
    return NextResponse.json({ error: "All fields are required" }, { status: 400 })
  }

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data: product, error: productError } = await admin
    .from("products")
    .select(
      "*, creator:creators(id, user_id, stripe_account_id, stripe_onboarding_status, charges_enabled, payouts_enabled)",
    )
    .eq("id", productId)
    .eq("status", "published")
    .single()

  if (productError || !product) {
    console.error("[v0] Product fetch error:", productError)
    return NextResponse.json({ error: "Product not found" }, { status: 404 })
  }

  if (product.price_cents > 0) {
    if (!product.creator.stripe_account_id) {
      console.error("[v0] Seller has not connected Stripe account")
      return NextResponse.json(
        { error: "Seller has not connected payment processing yet. Please contact the seller." },
        { status: 400 },
      )
    }

    if (!product.creator.stripe_account_id.startsWith("acct_")) {
      console.error("[v0] Invalid Stripe account ID format:", product.creator.stripe_account_id)
      return NextResponse.json(
        { error: "Invalid seller payment configuration. Please contact the seller." },
        { status: 400 },
      )
    }

    if (product.creator.charges_enabled === false) {
      console.error("[v0] Seller charges not enabled:", product.creator.stripe_account_id)
      return NextResponse.json(
        { error: "Seller cannot accept payments yet. Payment verification is pending. Please try again later." },
        { status: 400 },
      )
    }

    if (product.creator.payouts_enabled === false) {
      console.error("[v0] Seller payouts not enabled:", product.creator.stripe_account_id)
      return NextResponse.json(
        { error: "Seller cannot receive payouts yet. Payment verification is pending. Please try again later." },
        { status: 400 },
      )
    }

    if (product.creator.stripe_onboarding_status !== "enabled") {
      console.error("[v0] Seller Stripe onboarding not enabled:", product.creator.stripe_onboarding_status)
      return NextResponse.json(
        { error: "Seller payment setup is incomplete. Please contact the seller." },
        { status: 400 },
      )
    }

    console.log("[v0] Seller payment validation passed:", {
      accountId: product.creator.stripe_account_id,
      chargesEnabled: product.creator.charges_enabled,
      payoutsEnabled: product.creator.payouts_enabled,
      status: product.creator.stripe_onboarding_status,
    })
  }

  const { data: creatorProfile } = await admin
    .from("profiles")
    .select("display_name")
    .eq("id", product.creator.user_id)
    .single()

  if (user) {
    const { data: existingEntitlement } = await admin
      .from("entitlements")
      .select("id")
      .eq("buyer_id", user.id)
      .eq("product_id", productId)
      .maybeSingle()

    if (existingEntitlement) {
      return NextResponse.json({ error: "You already own this product" }, { status: 400 })
    }
  }

  const accessToken = nanoid(32)
  const sessionFingerprint = nanoid(32)
  const receiptToken = generateReceiptToken()

  // Collect device and geo info
  const { deviceInfo, geoInfo } = collectOrderDeviceInfo(request)

  const cookieStore = await cookies()
  cookieStore.set("materia_session", sessionFingerprint, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365,
    path: "/",
  })

  const totalAmount = (product.price_cents || 0) + (tipCents || 0)

  if (totalAmount < 50) {
    return NextResponse.json({ error: "Minimum payment amount is $0.50" }, { status: 400 })
  }

  const platformFee = calculatePlatformFee(totalAmount)

  console.log("[v0] Checkout details:", {
    totalAmount,
    platformFee,
    sellerReceives: totalAmount - platformFee,
    stripeAccountId: product.creator.stripe_account_id,
  })

  const lineItems: Parameters<typeof stripe.checkout.sessions.create>[0]["line_items"] = [
    {
      price_data: {
        currency: "usd",
        product_data: {
          name: product.title,
          description: `By ${creatorProfile?.display_name || "Creator"}`,
        },
        unit_amount: product.price_cents,
      },
      quantity: 1,
    },
  ]

  if (tipCents > 0) {
    lineItems.push({
      price_data: {
        currency: "usd",
        product_data: {
          name: "Tip for creator",
          description: "Thank you for supporting the creator!",
        },
        unit_amount: tipCents,
      },
      quantity: 1,
    })
  }

  try {
    const sessionConfig: any = {
      ui_mode: "embedded",
      mode: "payment",
      line_items: lineItems,
      customer_email: email,
      metadata: {
        product_id: product.id,
        product_slug: product.slug,
        buyer_id: user?.id || "",
        buyer_first_name: firstName.trim(),
        buyer_last_name: lastName.trim(),
        buyer_email: email,
        creator_id: product.creator.id,
        product_type: product.type,
        tip_cents: tipCents.toString(),
        access_token: user ? "" : accessToken,
        is_gift: isGift ? "true" : "false",
        session_fingerprint: sessionFingerprint,
        receipt_token: receiptToken,
        platform_fee_cents: platformFee.toString(),
        // Device and geo info
        buyer_country: geoInfo.country,
        buyer_country_code: geoInfo.countryCode,
        buyer_device_type: deviceInfo.deviceType,
        buyer_os: deviceInfo.os,
        buyer_browser: deviceInfo.browser,
      },
      return_url: `${baseUrl}/api/checkout/complete?session_id={CHECKOUT_SESSION_ID}`,
    }

    if (product.creator.stripe_account_id) {
      sessionConfig.payment_intent_data = {
        application_fee_amount: platformFee,
        transfer_data: {
          destination: product.creator.stripe_account_id,
        },
      }
      console.log("[v0] Added destination charge to:", product.creator.stripe_account_id, "fee:", platformFee)
    }

    const session = await stripe.checkout.sessions.create(sessionConfig)

    console.log("[v0] Stripe session created:", session.id)
    return NextResponse.json({ clientSecret: session.client_secret })
  } catch (error: any) {
    console.error("[v0] Stripe session creation error:", error)

    if (error.type === "StripeInvalidRequestError") {
      return NextResponse.json({ error: `Payment configuration error: ${error.message}` }, { status: 400 })
    }

    return NextResponse.json({ error: "Failed to create checkout session" }, { status: 500 })
  }
}
