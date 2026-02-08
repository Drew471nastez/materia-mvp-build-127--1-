import { NextResponse } from "next/server"
import Stripe from "stripe"
import { createClient } from "@/lib/supabase/server"
import crypto from "crypto"
import { getValidatedPlatformStatementDescriptor } from "@/lib/payments/platform-descriptor"

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2024-04-10",
})

function isValidEmail(email: string) {
  return typeof email === "string" && email.includes("@") && email.length <= 254
}

export async function POST(req: Request) {
  try {
    const { productId, email } = await req.json()

    if (!productId || !isValidEmail(email)) {
      return NextResponse.json({ error: "Missing or invalid productId/email" }, { status: 400 })
    }

    // Optional logged-in buyer
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    // Fetch product with creator_id (required for webhook)
    const { data: product, error } = await supabase
      .from("products")
      .select("id,title,price_cents,currency,creator_id")
      .eq("id", productId)
      .single()

    if (error || !product) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 })
    }

    if (!product.creator_id) {
      return NextResponse.json({ error: "Product is missing creator_id" }, { status: 400 })
    }

    // Paid only
    if (!product.price_cents || product.price_cents <= 0) {
      return NextResponse.json(
        { error: "Product is free. Use /api/checkout/complete-free" },
        { status: 400 }
      )
    }

    const currency = "usd"

    // Used for guest access email link (stored by webhook into orders.access_token)
    const accessToken = crypto.randomBytes(24).toString("hex")

    let intent
    try {
      intent = await stripe.paymentIntents.create({
      amount: product.price_cents,
      currency,
      receipt_email: email,
      statement_descriptor_suffix: getValidatedPlatformStatementDescriptor(),
      automatic_payment_methods: { enabled: true },

      // IMPORTANT: metadata keys must match your webhook
      metadata: {
        product_id: product.id,
        creator_id: product.creator_id,
        buyer_id: user?.id || "",
        email,
        access_token: accessToken,
      },
    })
    } catch (descriptorError: any) {
      if (String(descriptorError?.message || "").toLowerCase().includes("statement_descriptor")) {
        console.error("[create-intent] descriptor rejected, retrying without descriptor")
        intent = await stripe.paymentIntents.create({
          amount: product.price_cents,
          currency,
          receipt_email: email,
          automatic_payment_methods: { enabled: true },
          metadata: {
            product_id: product.id,
            creator_id: product.creator_id,
            buyer_id: user?.id || "",
            email,
            access_token: accessToken,
          },
        })
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
