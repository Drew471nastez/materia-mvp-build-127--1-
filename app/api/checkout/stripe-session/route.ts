import { PLATFORM_CURRENCY } from "@/lib/checkout/currency"
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
import { priceCheckout } from "@/lib/checkout/pricing"
import { minimumChargeCents } from "@/lib/checkout/currency"
import { isShippable } from "@/lib/marketplace/product-kind"

export async function POST(request: Request) {
  const supabase = await createClient()
  const admin = createAdminClient()
  const body = await request.json()
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || request.headers.get("origin") || ""

  const {
    productId,
    firstName,
    lastName,
    email,
    tipCents = 0,
    isGift = false,
    variantId,
    customPriceCents = null,
    offerToken = null,
    emailOptIn = true,
    // Marketplace checkout only. Absent for every digital purchase, which is
    // why nothing below changes when they are missing.
    deliveryMode = null,
    deliveryLockerId = null,
    deliveryCounty = null,
    deliveryLocality = null,
    expectedShippingCents = null,
  } = body

  if (!productId || !firstName || !lastName || !email) {
    return NextResponse.json({ error: "All fields are required" }, { status: 400 })
  }

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data: product, error: productError } = await admin
    .from("products")
    .select(
      "*, pay_what_you_want, pwyw_min_price_cents, pwyw_suggested_price_cents, creator:creators(id, user_id, display_name, stripe_account_id, stripe_onboarding_status, charges_enabled, payouts_enabled, statement_descriptor)",
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

  // An accepted offer overrides the asking price — but only through the signed
  // token the checkout page minted after checking the conversation. The token is
  // personal: it verifies against the CALLER's user id, so it cannot be lifted
  // from one buyer's session and spent from another's.
  if (offerToken) {
    const { verifyOfferToken } = await import("@/lib/marketplace/offer-token")
    const { createClient: createUserClient } = await import("@/lib/supabase/server")
    const userClient = await createUserClient()
    const {
      data: { user: buyer },
    } = await userClient.auth.getUser()
    const verified = verifyOfferToken(offerToken, { productId, buyerId: buyer?.id ?? null })
    if (!verified) {
      return NextResponse.json({ error: "Offer is no longer valid" }, { status: 400 })
    }
    basePriceCents = verified.cents
  }

  // Require Stripe when the total charge (including tips) is > 0
  const totalCharge = basePriceCents + (tipCents || 0)
  if (totalCharge > 0) {
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

  // ── TWO THINGS THAT MUST BE REFUSED BEFORE A CARD IS TOUCHED ───────────────
  //
  // Both were checked only in the interface, which says of itself that it is
  // "not an authority — worst case the buttons render and checkout refuses".
  // Checkout did not refuse. These are that refusal.

  // 1. NOBODY BUYS THEIR OWN LISTING.
  //    With a Connect destination charge, a seller buying from themselves pays
  //    themselves back minus fees — which is a way to move money through the
  //    platform, and a way to manufacture completed orders and the reviews and
  //    badges that hang off them.
  if (user && product.creator?.user_id && user.id === product.creator.user_id) {
    return NextResponse.json({ error: "You cannot buy your own listing" }, { status: 400 })
  }

  // 2. A SECOND-HAND ITEM EXISTS ONCE.
  //    Every listing on the marketplace is one physical object, so a second
  //    completed order for it is a sale that cannot be fulfilled — two people
  //    paid, one gets a refund and an apology. The listing is marked sold when
  //    the first order completes (see confirm-payment) and every listing
  //    surface filters on status = 'published', so this is the narrow window
  //    between one buyer paying and that write landing.
  if (isShippable(product.type)) {
    const { data: alreadySold } = await admin
      .from("orders")
      .select("id")
      .eq("product_id", productId)
      .in("status", ["completed", "paid", "succeeded"])
      .limit(1)
      .maybeSingle()
    if (alreadySold) {
      return NextResponse.json(
        { error: "This item has already been sold", code: "already_sold" },
        { status: 409 },
      )
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

  // The seller's commission is charged on THEIR money — the item and any tip.
  // Not on the buyer's protection fee and not on the postage, neither of which
  // was ever theirs to be taxed on.
  const sellerSideCents = basePriceCents + (tipCents || 0)
  const feeCalculation = await calculatePlatformFee(sellerSideCents, product.creator.id, admin)

  // ── POSTAGE ────────────────────────────────────────────────────────────────
  //
  // Priced HERE, server-side, from the courier — never taken from the request.
  // The browser sends the figure it displayed, and its only use is to be
  // compared: if the tariff has moved since the page loaded, the buyer is sent
  // back to look at the new number rather than quietly charged it.
  //
  // Only for physical goods with a delivery method. A digital purchase never
  // reaches this block, and a failure to price never blocks a sale — the
  // platform absorbing postage on a bad day is a far better outcome than a
  // checkout that will not complete.
  let shippingCents = 0
  if (deliveryMode === "locker" || deliveryMode === "home") {
    const { quoteDelivery, quoteMatches } = await import("@/lib/shipping/quote")
    const quote = await quoteDelivery({
      mode: deliveryMode,
      lockerId: deliveryLockerId === null ? null : Number(deliveryLockerId),
      county: typeof deliveryCounty === "string" ? deliveryCounty : null,
      locality: typeof deliveryLocality === "string" ? deliveryLocality : null,
    })

    const shown = Number(expectedShippingCents) || 0
    if (quote.ok) {
      if (!quoteMatches(shown, quote.cents)) {
        return NextResponse.json(
          { error: "Shipping price changed", code: "shipping_price_changed", shippingCents: quote.cents },
          { status: 409 },
        )
      }
      shippingCents = quote.cents
    } else if (shown > 0) {
      // The page showed a price this request cannot confirm. Charging the shown
      // amount would be charging an unverified number; charging zero would be
      // taking a different total than the one on screen. Neither — ask again.
      return NextResponse.json(
        { error: "Shipping price changed", code: "shipping_price_changed", shippingCents: 0 },
        { status: 409 },
      )
    }
  }

  // ONE arithmetic, shared with the summary the buyer just read. A checkout
  // that displays one total and charges another is the worst bug this file
  // could have, and the only defence is that both come from here.
  const pricing = priceCheckout({
    itemCents: basePriceCents,
    shippingCents,
    tipCents: tipCents || 0,
    platformCommissionCents: feeCalculation.platformFeeCents,
  })

  const totalAmount = pricing.totalCents

  // Stripe's floor, in the currency actually being charged. Hard-coded as 50 it
  // meant 50 BANI once the platform moved to lei — half a leu, roughly a tenth
  // of the real minimum, so a charge under it would have been built here and
  // rejected by Stripe with a message nobody could act on.
  const minimum = minimumChargeCents()
  if (totalAmount < minimum) {
    return NextResponse.json(
      { error: `Minimum payment amount is ${(minimum / 100).toFixed(2)} ${PLATFORM_CURRENCY.toUpperCase()}` },
      { status: 400 },
    )
  }

  // The platform keeps its commission PLUS the protection fee. Passing the
  // bare commission here would hand the seller a share of the buyer's
  // protection fee on every single order.
  const platformFee = pricing.platformTakesCents

  console.log("[v0] Checkout fee breakdown:", {
    totalAmount,
    basePriceCents,
    buyerProtectionCents: pricing.buyerProtectionCents,
    tipCents: tipCents || 0,
    platformFee,
    sellerReceives: pricing.sellerReceivesCents,
    stripeAccountId: product.creator.stripe_account_id,
    creatorPlan: feeCalculation.planId,
    planName: feeCalculation.planName,
    feePercent: `${(feeCalculation.feePercent * 100).toFixed(2)}%`,
    feeFixedCents: feeCalculation.feeFixedCents,
    variantId: selectedVariant?.id || "none",
    variantName: selectedVariant?.name || "none",
  })

  try {
    // Build PaymentIntent config
    const intentConfig: any = {
      amount: totalAmount,
      currency: PLATFORM_CURRENCY,
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
        // What the buyer paid for postage, so a refund or a reconciliation can
        // tell it apart from the item and the protection fee.
        shipping_cents: shippingCents.toString(),
        buyer_protection_cents: pricing.buyerProtectionCents.toString(),
        access_token: user ? "" : accessToken,
        is_gift: isGift ? "true" : "false",
        session_fingerprint: sessionFingerprint,
        receipt_token: receiptToken,
        platform_fee_cents: platformFee.toString(),
        fee_percent: String(feeCalculation.feePercent),
        fee_fixed_cents: String(feeCalculation.feeFixedCents),
        plan_used: feeCalculation.planId,
        variant_id: selectedVariant?.id || "",
        variant_name: selectedVariant?.name || "",
        variant_price_cents: selectedVariant?.price_cents?.toString() || "",
        buyer_country: geoInfo.country,
        buyer_country_code: geoInfo.countryCode,
        buyer_device_type: deviceInfo.deviceType,
        buyer_os: deviceInfo.os,
        buyer_browser: deviceInfo.browser,
        creator_name: creatorProfile?.display_name || "Creator",
        email_opt_in: emailOptIn ? "true" : "false",
      },
    }

    // Add Stripe Connect destination charge if seller has Stripe
    if (product.creator.stripe_account_id) {
      intentConfig.application_fee_amount = platformFee
      intentConfig.transfer_data = {
        destination: product.creator.stripe_account_id,
      }
      console.log("[v0] Added destination charge to:", product.creator.stripe_account_id, "fee:", platformFee)
    }

    // Configure statement descriptor for bank statements
    // Format: "{seller_name} - STORELIB" (e.g., "JANES SHOP - STORELIB")
    // Uses seller's custom descriptor, falls back to display_name, then "STORE"
    try {
      const platformName = getValidatedPlatformStatementDescriptor()
      const sellerDescriptor = (product.creator.statement_descriptor || product.creator.display_name || "STORE")
        .trim().toUpperCase().replace(/[^A-Z0-9\s]/g, "")
      const suffix = ` - ${platformName}`
      const maxSellerLen = 22 - suffix.length
      const truncatedSeller = sellerDescriptor.slice(0, maxSellerLen)
      intentConfig.statement_descriptor = `${truncatedSeller}${suffix}`
      // Also set suffix for Connect (shows as "STORELIB* SELLER_NAME")
      const suffixDescriptor = sellerDescriptor.slice(0, 22).replace(/\s+/g, " ").trim()
      if (suffixDescriptor) {
        intentConfig.statement_descriptor_suffix = suffixDescriptor
      }
      console.log("[v0] Statement descriptor configured:", intentConfig.statement_descriptor, "suffix:", suffixDescriptor)
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
          currency: PLATFORM_CURRENCY,
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
            fee_percent: String(feeCalculation.feePercent),
            fee_fixed_cents: String(feeCalculation.feeFixedCents),
            plan_used: feeCalculation.planId,
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
