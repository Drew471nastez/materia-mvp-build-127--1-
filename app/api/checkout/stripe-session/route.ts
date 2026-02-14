import { NextResponse } from "next/server"
import { stripe } from "@/lib/stripe"
import { getValidatedPlatformStatementDescriptor } from "@/lib/payments/platform-descriptor"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { nanoid } from "nanoid"
import { cookies } from "next/headers"
import { generateReceiptToken } from "@/lib/security"
import { collectOrderDeviceInfo } from "@/lib/device-info"
import { calculatePlatformFee } from "@/lib/billing/fee-calculator"

export async function POST(request: Request) {
  const supabase = await createClient()
  const admin = createAdminClient()
  const body = await request.json()
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || request.headers.get("origin") || ""

  const { productId, firstName, lastName, email, tipCents = 0, isGift = false, variantId, customPriceCents = null } = body

  if (!productId || !firstName || !lastName || !email) {
    return NextResponse.json({ error: "All fields are required" }, { status: 400 })
  }

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data: product, error: productError } = await admin
    .from("products")
    .select(
      "*, pay_what_you_want, pwyw_min_price_cents, pwyw_suggested_price_cents, creator:creators(id, user_id, stripe_account_id, stripe_onboarding_status, charges_enabled, payouts_enabled)",
    )
    .eq("id", productId)
    .eq("status", "published")
    .single()

  if (productError || !product) {
    console.error("[v0] Product fetch error:", productError)
    return NextResponse.json({ error: "Product not found" }, { status: 404 })
  }

  // Fetch variant if specified (include PWYW fields)
  let selectedVariant = null
  let variantPriceCents = 0
  if (variantId) {
    const { data: variant } = await admin
      .from("product_variants")
      .select("id, name, price_cents, pay_what_you_want, pwyw_min_price_cents")
      .eq("id", variantId)
      .eq("product_id", productId)
      .single()

    if (variant) {
      selectedVariant = variant
      variantPriceCents = variant.price_cents || 0
    }
  }

  // Check if PWYW is active for this purchase
  const isVariantPwyw = selectedVariant && (selectedVariant as any).pay_what_you_want
  const isProductPwyw = !selectedVariant && (product as any).pay_what_you_want
  const isPwywActive = isVariantPwyw || isProductPwyw

  // Get PWYW minimum for validation
  const pwywMinCents = isVariantPwyw
    ? ((selectedVariant as any).pwyw_min_price_cents || 0)
    : ((product as any).pwyw_min_price_cents || 0)

  // Calculate final price
  let basePriceCents = selectedVariant ? variantPriceCents : (product.price_cents || 0)

  // Handle PWYW custom price
  if (isPwywActive && customPriceCents !== null && customPriceCents !== undefined) {
    const parsedCustomPrice = parseInt(String(customPriceCents), 10)
    if (!isNaN(parsedCustomPrice)) {
      if (parsedCustomPrice < pwywMinCents) {
        return NextResponse.json(
          { error: `Minimum price is $${(pwywMinCents / 100).toFixed(2)}` },
          { status: 400 }
        )
      }
      basePriceCents = parsedCustomPrice
    }
  }

  // Only require Stripe when the FINAL price is > 0
  if (basePriceCents > 0) {
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

    if (product.creator.stripe_onboarding_status !== "connected") {
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

  const totalAmount = basePriceCents + (tipCents || 0)

  if (totalAmount < 50) {
    return NextResponse.json({ error: "Minimum payment amount is $0.50" }, { status: 400 })
  }

  // Calculate platform fee based on creator's subscription plan
  const feeCalculation = await calculatePlatformFee(totalAmount, product.creator.id, admin)
  const platformFee = feeCalculation.platformFeeCents

  console.log("[v0] Checkout details:", {
    totalAmount,
    platformFee,
    sellerReceives: totalAmount - platformFee,
    stripeAccountId: product.creator.stripe_account_id,
    creatorPlan: feeCalculation.planId,
    feePercent: `${(feeCalculation.feePercent * 100).toFixed(2)}%`,
    variantId: selectedVariant?.id || "none",
    variantName: selectedVariant?.name || "none",
  })

  try {
    // Build PaymentIntent config
    const intentConfig: any = {
      amount: totalAmount,
      currency: "usd",
      automatic_payment_methods: {
        enabled: true,
      },
      metadata: {
        product_id: product.id,
        product_slug: product.slug,
        product_title: product.title,
        buyer_id: user?.id || "",
        buyer_first_name: firstName.trim(),
        buyer_last_name: lastName.trim(),
        buyer_email: email,
        creator_id: product.creator.id,
        product_type: product.type,
        tip_cents: tipCents.toString(),
        base_price_cents: basePriceCents.toString(),
        access_token: user ? "" : accessToken,
        is_gift: isGift ? "true" : "false",
        session_fingerprint: sessionFingerprint,
        receipt_token: receiptToken,
        platform_fee_cents: platformFee.toString(),
        variant_id: selectedVariant?.id || "",
        variant_name: selectedVariant?.name || "",
        variant_price_cents: selectedVariant?.price_cents?.toString() || "",
        buyer_country: geoInfo.country,
        buyer_country_code: geoInfo.countryCode,
        buyer_device_type: deviceInfo.deviceType,
        buyer_os: deviceInfo.os,
        buyer_browser: deviceInfo.browser,
        creator_name: creatorProfile?.display_name || "Creator",
      },
      receipt_email: email,
    }

    // Add Stripe Connect destination charge if seller has Stripe
    if (product.creator.stripe_account_id) {
      intentConfig.application_fee_amount = platformFee
      intentConfig.transfer_data = {
        destination: product.creator.stripe_account_id,
      }
      console.log("[v0] Added destination charge to:", product.creator.stripe_account_id, "fee:", platformFee)
    }

    // Try with statement descriptor, fall back without
    try {
      intentConfig.statement_descriptor_suffix = getValidatedPlatformStatementDescriptor()
    } catch (descriptorError) {
      console.error("[v0] Descriptor error, skipping:", descriptorError)
    }

    const paymentIntent = await stripe.paymentIntents.create(intentConfig)

    console.log("[v0] PaymentIntent created:", paymentIntent.id)
    return NextResponse.json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
    })
  } catch (error: any) {
    console.error("[v0] PaymentIntent creation error:", error)

    // If statement descriptor is the issue, retry without it
    if (String(error?.message || "").toLowerCase().includes("statement_descriptor")) {
      try {
        const fallbackConfig: any = {
          amount: totalAmount,
          currency: "usd",
          automatic_payment_methods: { enabled: true },
          metadata: {
            product_id: product.id,
            product_slug: product.slug,
            product_title: product.title,
            buyer_id: user?.id || "",
            buyer_first_name: firstName.trim(),
            buyer_last_name: lastName.trim(),
            buyer_email: email,
            creator_id: product.creator.id,
            product_type: product.type,
            tip_cents: tipCents.toString(),
            base_price_cents: basePriceCents.toString(),
            access_token: user ? "" : accessToken,
            is_gift: isGift ? "true" : "false",
            session_fingerprint: sessionFingerprint,
            receipt_token: receiptToken,
            platform_fee_cents: platformFee.toString(),
            variant_id: selectedVariant?.id || "",
            variant_name: selectedVariant?.name || "",
            variant_price_cents: selectedVariant?.price_cents?.toString() || "",
            buyer_country: geoInfo.country,
            buyer_country_code: geoInfo.countryCode,
            buyer_device_type: deviceInfo.deviceType,
            buyer_os: deviceInfo.os,
            buyer_browser: deviceInfo.browser,
            creator_name: creatorProfile?.display_name || "Creator",
          },
          receipt_email: email,
        }

        if (product.creator.stripe_account_id) {
          fallbackConfig.application_fee_amount = platformFee
          fallbackConfig.transfer_data = { destination: product.creator.stripe_account_id }
        }

        const paymentIntent = await stripe.paymentIntents.create(fallbackConfig)
        console.log("[v0] PaymentIntent created (fallback):", paymentIntent.id)
        return NextResponse.json({
          clientSecret: paymentIntent.client_secret,
          paymentIntentId: paymentIntent.id,
        })
      } catch (fallbackError: any) {
        console.error("[v0] Fallback PaymentIntent creation error:", fallbackError)
        return NextResponse.json({ error: `Payment configuration error: ${fallbackError.message}` }, { status: 400 })
      }
    }

    if (error.type === "StripeInvalidRequestError") {
      return NextResponse.json({ error: `Payment configuration error: ${error.message}` }, { status: 400 })
    }

    return NextResponse.json({ error: "Failed to create checkout session" }, { status: 500 })
  }
}
