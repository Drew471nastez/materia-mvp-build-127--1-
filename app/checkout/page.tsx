import { Suspense } from "react"
import { notFound, redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import CheckoutPageClient from "./checkout-client"
import { getProductUrl } from "@/lib/url-helpers"

interface CheckoutPageProps {
  searchParams: Promise<{ productId?: string; variantId?: string }>
}

async function CheckoutContent({ searchParams }: CheckoutPageProps) {
  const { productId, variantId } = await searchParams

  if (!productId) {
    redirect("/explore")
  }

  const supabase = await createClient()

  const { data: product, error } = await supabase
    .from("products")
    .select("*")
    .eq("id", productId)
    .eq("status", "published")
    .single()

  if (error || !product) {
    notFound()
  }

  const { data: creator } = await supabase.from("creators").select("*").eq("id", product.creator_id).single()

  let creatorProfile = null
  if (creator) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("display_name, avatar_url, username")
      .eq("id", creator.user_id)
      .single()

    creatorProfile = profile
  }

  const creatorUsername = creatorProfile?.username || creator?.slug || ""

  // Fetch variant if specified
  let selectedVariant = null
  if (variantId) {
    const { data: variant } = await supabase
      .from("product_variants")
      .select("id, name, description, price_cents")
      .eq("id", variantId)
      .eq("product_id", productId)
      .single()

    if (variant) {
      selectedVariant = variant
    }
  }

  // Check if user is logged in and already owns this specific product/variant
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (user) {
    // If a variant is specified, check if user owns that specific variant
    // If no variant, check if user owns the product at all (for non-variant products)
    let entitlementQuery = supabase
      .from("entitlements")
      .select("id, variant_id")
      .eq("buyer_id", user.id)
      .eq("product_id", productId)

    const { data: existingEntitlements } = await entitlementQuery

    if (existingEntitlements && existingEntitlements.length > 0) {
      if (variantId) {
        // Check if user specifically owns THIS variant
        const ownsThisVariant = existingEntitlements.some(e => e.variant_id === variantId)
        if (ownsThisVariant) {
          redirect(getProductUrl(creatorUsername, product.slug))
        }
        // User owns other variants but not this one - allow purchase
      } else {
        // No variant specified - check if user owns any entitlement for this product
        // For non-variant products, any entitlement means they own it
        const ownsProductWithoutVariant = existingEntitlements.some(e => !e.variant_id)
        if (ownsProductWithoutVariant) {
          redirect(getProductUrl(creatorUsername, product.slug))
        }
        // User owns specific variants but not the base product - allow purchase
      }
    }
  }

  // Calculate final price:
  // - If variant is selected, use variant's price_cents (FINAL price)
  // - Otherwise use product's base price
  const finalPriceCents = selectedVariant ? selectedVariant.price_cents : product.price_cents

  return (
    <CheckoutPageClient
      product={{
        id: product.id,
        title: product.title,
        slug: product.slug,
        description: product.description,
        price_cents: finalPriceCents,
        thumbnail_url: product.thumbnail_url,
        type: product.type,
      }}
      creator={{
        id: creator?.id || "",
        name: creatorProfile?.display_name || "Creator",
        avatar_url: creatorProfile?.avatar_url || null,
        username: creatorUsername,
      }}
      userEmail={user?.email || null}
      isLoggedIn={!!user}
      selectedVariant={selectedVariant ? {
        id: selectedVariant.id,
        name: selectedVariant.name,
        description: selectedVariant.description,
        priceCents: selectedVariant.price_cents, // FINAL price, not additional
      } : null}
    />
  )
}

export default function CheckoutPage(props: CheckoutPageProps) {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-background">
          <div className="animate-pulse text-muted-foreground">Loading checkout...</div>
        </div>
      }
    >
      <CheckoutContent {...props} />
    </Suspense>
  )
}
