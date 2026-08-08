import { PLATFORM_CURRENCY } from "@/lib/checkout/currency"
import { NextResponse } from "next/server"
import { stripe } from "@/lib/stripe"
import { getValidatedPlatformStatementDescriptor } from "@/lib/payments/platform-descriptor"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { nanoid } from "nanoid"

export async function POST(request: Request) {
  const supabase = await createClient()
  const admin = createAdminClient()
  const { searchParams } = new URL(request.url)
  const productId = searchParams.get("product_id")

  if (!productId) {
    return NextResponse.json({ error: "Product ID required" }, { status: 400 })
  }

  // Get current user (optional for guest checkout)
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Fetch product details
  const { data: product, error: productError } = await supabase
    .from("products")
    .select(`
      id,
      title,
      slug,
      price_cents,
      thumbnail_url,
      type,
      status,
      includes_community,
      creator_id
    `)
    .eq("id", productId)
    .eq("status", "published")
    .single()

  if (productError || !product) {
    return NextResponse.json({ error: "Product not found" }, { status: 404 })
  }

  // Fetch creator info separately
  const { data: creator } = await supabase.from("creators").select("id, user_id").eq("id", product.creator_id).single()

  if (!creator) {
    return NextResponse.json({ error: "Creator not found" }, { status: 404 })
  }

  // Fetch creator's profile for display name
  const { data: creatorProfile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", creator.user_id)
    .single()

  if (user) {
    const { data: existingEntitlement } = await supabase
      .from("entitlements")
      .select("id")
      .eq("buyer_id", user.id)
      .eq("product_id", productId)
      .single()

    if (existingEntitlement) {
      // Already owns - redirect to product page with access
      return NextResponse.redirect(new URL(`/p/${product.slug}?already_owned=true`, request.url), { status: 303 })
    }
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || request.headers.get("origin") || ""

  // Generate access token for guest purchases
  const accessToken = nanoid(32)

  const isFree = product.price_cents === 0

  if (isFree) {
    // For guests getting free products, redirect to email collection page
    if (!user) {
      const freeCheckoutUrl = new URL(`/checkout/free`, request.url)
      freeCheckoutUrl.searchParams.set("product_id", productId)
      freeCheckoutUrl.searchParams.set("token", accessToken)
      return NextResponse.redirect(freeCheckoutUrl.toString(), { status: 303 })
    }

    // Logged-in user getting free product - create order and entitlement directly
    try {
      // Create order using admin client to bypass RLS
      // Try full insert first, fallback to minimal if it fails
      let orderError = null

      const fullOrderData = {
        buyer_id: user.id,
        product_id: product.id,
        amount_cents: 0,
        status: "completed",
        provider: "free",
        buyer_email: user.email || null,
      }

      const result1 = await admin.from("orders").insert(fullOrderData).select().single()
      orderError = result1.error

      // If full insert fails, try minimal fields
      if (orderError) {
        console.log("[v0] Full insert failed, trying minimal:", orderError.message)

        const minimalOrderData = {
          buyer_id: user.id,
          product_id: product.id,
          amount_cents: 0,
          status: "completed",
        }

        const result2 = await admin.from("orders").insert(minimalOrderData).select().single()
        orderError = result2.error
      }

      if (orderError) {
        console.error("[v0] Error creating free order:", orderError)
        return NextResponse.json({ error: "Failed to create order" }, { status: 500 })
      }

      // Create entitlement using admin client
      const { error: entitlementError } = await admin.from("entitlements").insert({
        buyer_id: user.id,
        creator_id: creator.id,
        product_id: product.id,
        community_access: false,
      })

      if (entitlementError) {
        console.error("[v0] Error creating entitlement:", entitlementError)
      } else {
        console.log("[v0] Entitlement created for user:", user.id, "product:", product.id)
      }

      // Increment sales count
      await admin.rpc("increment_product_sales", { p_product_id: productId })

      // Record analytics
      await admin.from("analytics_events").insert({
        creator_id: creator.id,
        product_id: product.id,
        event_type: "purchase",
      })

      return NextResponse.redirect(new URL(`/library?purchase=success&highlight=${product.id}`, request.url), {
        status: 303,
      })
    } catch (error) {
      console.error("[v0] Free checkout error:", error)
      return NextResponse.json({ error: "Checkout failed" }, { status: 500 })
    }
  }

  // Paid product - use Stripe
  const sessionConfig: Parameters<typeof stripe.checkout.sessions.create>[0] = {
    mode: "payment",
    payment_method_types: ["card"],
    payment_intent_data: {
      statement_descriptor_suffix: getValidatedPlatformStatementDescriptor(),
    },
    line_items: [
      {
        price_data: {
          currency: PLATFORM_CURRENCY,
          product_data: {
            name: product.title,
            description: `By ${creatorProfile?.display_name || "Creator"}`,
            images: product.thumbnail_url ? [product.thumbnail_url] : [],
          },
          unit_amount: product.price_cents,
        },
        quantity: 1,
      },
    ],
    metadata: {
      product_id: product.id,
      product_slug: product.slug,
      buyer_id: user?.id || "",
      creator_id: creator.id,
      product_type: product.type,
      includes_community: "false",
      access_token: user ? "" : accessToken,
    },
    success_url: `${baseUrl}/purchase/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${baseUrl}/p/${product.slug}`,
    customer_email: user?.email || undefined,
  }

  if (!user?.email) {
    sessionConfig.customer_creation = "always"
  }

  try {
    const session = await stripe.checkout.sessions.create(sessionConfig)
    return NextResponse.redirect(session.url!, { status: 303 })
  } catch (error) {
    console.error("[v0] Stripe session creation error:", error)

    // Fail safe if provider rejects descriptor
    const message = error instanceof Error ? error.message : String(error)
    if (message.toLowerCase().includes("statement_descriptor")) {
      console.error("[v0] Descriptor rejected by provider, retrying without descriptor")
      try {
        const fallbackConfig = { ...sessionConfig }
        delete (fallbackConfig as any).payment_intent_data
        const fallbackSession = await stripe.checkout.sessions.create(fallbackConfig)
        return NextResponse.redirect(fallbackSession.url!, { status: 303 })
      } catch (fallbackError) {
        console.error("[v0] Fallback session creation failed:", fallbackError)
      }
    }

    return NextResponse.json({ error: "Failed to create checkout session" }, { status: 500 })
  }
}
