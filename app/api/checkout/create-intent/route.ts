import { NextResponse } from "next/server"
import Stripe from "stripe"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import crypto from "crypto"
import { getValidatedPlatformStatementDescriptor } from "@/lib/payments/platform-descriptor"
import { calculatePlatformFee } from "@/lib/billing/fee-calculator"

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)

function isValidEmail(email: string) {
  return typeof email === "string" && email.includes("@") && email.length <= 254
}

export async function POST(req: Request) {
  try {
    const { productId, email } = await req.json()

    if (!productId || !isValidEmail(email)) {
      return NextResponse.json({ error: "Missing or invalid productId/email" }, { status: 400 })
    }

    const supabase = await createClient()
    const admin = createAdminClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    // Fetch product with creator_id using admin client (bypasses RLS)
    const { data: product, error } = await admin
      .from("products")
      .select("id,title,price_cents,currency,creator_id")
      .eq("id", productId)
      .eq("status", "published")
      .single()

    if (error || !product) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 })
    }

    if (!product.creator_id) {
      return NextResponse.json({ error: "Product is missing creator_id" }, { status: 400 })
    }

    if (!product.price_cents || product.price_cents <= 0) {
      return NextResponse.json(
        { error: "Product is free. Use /api/checkout/complete-free" },
        { status: 400 }
      )
    }

    const currency = "usd"
    const accessToken = crypto.randomBytes(24).toString("hex")

    // Calculate platform fee using the shared fee calculator (hardcoded percentages)
    const feeCalc = await calculatePlatformFee(product.price_cents, product.creator_id, admin)

    console.log("[create-intent] Fee breakdown:", {
      productId: product.id,
      priceCents: product.price_cents,
      plan: feeCalc.planId,
      planName: feeCalc.planName,
      feePercent: `${(feeCalc.feePercent * 100).toFixed(2)}%`,
      percentFee: Math.round(product.price_cents * feeCalc.feePercent),
      fixedFee: feeCalc.feeFixedCents,
      totalFee: feeCalc.platformFeeCents,
      sellerNet: feeCalc.sellerReceivesCents,
    })

    // Get the seller's connected Stripe account for destination charges
    const { data: creator } = await admin
      .from("creators")
      .select("stripe_account_id, charges_enabled")
      .eq("id", product.creator_id)
      .single()

    const hasConnectedAccount = creator?.stripe_account_id && creator?.charges_enabled

    // Build the payment intent params
    const intentParams: Stripe.PaymentIntentCreateParams = {
      amount: product.price_cents,
      currency,
      automatic_payment_methods: { enabled: true },
      metadata: {
        product_id: product.id,
        creator_id: product.creator_id,
        buyer_id: user?.id || "",
        email,
        access_token: accessToken,
        fee_percent: String(feeCalc.feePercent),
        fee_fixed_cents: String(feeCalc.feeFixedCents),
        fee_total_cents: String(feeCalc.platformFeeCents),
        seller_net_cents: String(feeCalc.sellerReceivesCents),
        plan_used: feeCalc.planId,
        platform_fee_cents: String(feeCalc.platformFeeCents),
      },
    }

    // Add statement descriptor - format: "{sellername} - STORELIB"
    try {
      const platformName = getValidatedPlatformStatementDescriptor()
      const { data: creatorProfile } = await admin
        .from("creators")
        .select("statement_descriptor, display_name")
        .eq("id", product.creator_id)
        .single()
      const sellerDescriptor = (creatorProfile?.statement_descriptor || creatorProfile?.display_name || "STORE")
        .trim().toUpperCase().replace(/[^A-Z0-9\s]/g, "")
      const suffix = ` - ${platformName}`
      const maxSellerLen = 22 - suffix.length
      intentParams.statement_descriptor = `${sellerDescriptor.slice(0, maxSellerLen)}${suffix}`
    } catch {
      // Skip descriptor if it fails validation
    }

    // If seller has a connected Stripe account, use destination charges
    // This sends money to the seller's account, while Storelib keeps the application fee
    if (hasConnectedAccount) {
      intentParams.application_fee_amount = feeCalc.platformFeeCents
      intentParams.transfer_data = {
        destination: creator.stripe_account_id,
      }
    }

    let intent
    try {
      intent = await stripe.paymentIntents.create(intentParams)
    } catch (descriptorError: any) {
      if (String(descriptorError?.message || "").toLowerCase().includes("statement_descriptor")) {
        console.error("[create-intent] descriptor rejected, retrying without descriptor")
        delete intentParams.statement_descriptor
        intent = await stripe.paymentIntents.create(intentParams)
      } else {
        throw descriptorError
      }
    }

    return NextResponse.json({ clientSecret: intent.client_secret })
  } catch (err: any) {
    console.error("[create-intent] error:", err)
    return NextResponse.json({ error: "Failed to create intent" }, { status: 500 })
  }
}
