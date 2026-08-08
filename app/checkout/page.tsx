import { Suspense } from "react"
import { notFound, redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import CheckoutPageClient from "./checkout-client"
import { getProductUrl } from "@/lib/url-helpers"

interface CheckoutPageProps {
  searchParams: Promise<{
    productId?: string
    variantId?: string
    customPrice?: string
    offerId?: string
    /** Accepted for links minted by /checkout/livrare; no longer read, because
     *  the marketplace checkout asks for delivery on the page itself. */
    deliverySet?: string
  }>
}

async function CheckoutContent({ searchParams }: CheckoutPageProps) {
  const { productId, variantId, customPrice, offerId } = await searchParams

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

  // Fetch variant if specified (with PWYW fields)
  let selectedVariant = null
  if (variantId) {
    const { data: variant } = await supabase
      .from("product_variants")
      .select("id, name, description, price_cents, pay_what_you_want, pwyw_min_price_cents, pwyw_suggested_price_cents")
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

  // An accepted offer changes what this checkout charges. Verified HERE, against
  // the conversation, and carried forward as a signed token — the endpoints that
  // set the Stripe amount re-verify the token instead of trusting a client
  // field. Requirements: the caller is signed in, is the conversation's buyer,
  // the offer is theirs to use (accepted), and it is about this very product.
  let offerCents: number | null = null
  let offerToken: string | null = null
  if (offerId && user) {
    const { createAdminClient } = await import("@/lib/supabase/admin")
    const admin = createAdminClient()
    const { data: offer } = await admin
      .from("messages")
      .select("id, kind, offer_status, offer_cents, conversation_id")
      .eq("id", offerId)
      .maybeSingle()
    if (offer?.kind === "offer" && offer.offer_status === "accepted" && offer.offer_cents > 0) {
      const { data: convo } = await admin
        .from("conversations")
        .select("buyer_id, listing_id")
        .eq("id", offer.conversation_id)
        .maybeSingle()
      if (convo && convo.buyer_id === user.id && convo.listing_id === productId) {
        offerCents = offer.offer_cents
        const { mintOfferToken } = await import("@/lib/marketplace/offer-token")
        offerToken = mintOfferToken({ productId, buyerId: user.id, cents: offer.offer_cents, offerId: offer.id })
      }
    }
  }

  // Fetch all variants for this product (for variant selector)
  const { data: allVariants } = await supabase
    .from("product_variants")
    .select("id, name, description, price_cents")
    .eq("product_id", productId)
    .order("price_cents", { ascending: true })

  // Determine if PWYW is active
  const isVariantPwyw = selectedVariant && (selectedVariant as any).pay_what_you_want
  const isProductPwyw = !selectedVariant && (product as any).pay_what_you_want
  const isPwywActive = isVariantPwyw || isProductPwyw

  // Get PWYW min price for validation
  const pwywMinPriceCents = isVariantPwyw
    ? ((selectedVariant as any).pwyw_min_price_cents || 0)
    : ((product as any).pwyw_min_price_cents || 0)

  // Calculate final price:
  // - If PWYW and customPrice provided, use customPrice (validated against minimum)
  // - If variant is selected, use variant's price_cents (FINAL price)
  // - Otherwise use product's base price
  let finalPriceCents = selectedVariant ? selectedVariant.price_cents : product.price_cents

  // Handle PWYW custom price
  // NOTE: use != null && !== "" check (NOT truthy) so that customPrice="0" ($0) is treated as valid
  let customPriceCents: number | null = null
  if (isPwywActive && customPrice != null && customPrice !== "") {
    customPriceCents = parseInt(customPrice, 10)
    if (!isNaN(customPriceCents) && customPriceCents >= pwywMinPriceCents) {
      finalPriceCents = customPriceCents
    } else if (!isNaN(customPriceCents) && customPriceCents < pwywMinPriceCents) {
      // If custom price is below minimum, use the minimum
      finalPriceCents = pwywMinPriceCents
      customPriceCents = pwywMinPriceCents
    }
  }

  // ── TWO CHECKOUTS, ONE URL ────────────────────────────────────────────────
  //
  // A second-hand jacket and a downloadable preset need different screens. The
  // jacket needs an address, a locker and postage; the preset needs tips,
  // gifting, pay-what-you-want, VAT and a licence. Trying to serve both from
  // one component is how the existing 2,300-line client got that long.
  //
  // So physical listings render the marketplace checkout and everything else
  // keeps the path it has always taken. Splitting HERE — one conditional in a
  // server component — is what makes that possible without editing a single
  // line of the payment code digital sales already run through.
  if (product.type === "physical") {
    const { MarketplaceCheckout } = await import("@/components/checkout/marketplace-checkout")
    const { senderCarrierId } = await import("@/lib/shipping/create-awb")
    return (
      <MarketplaceCheckout
        product={{
          id: product.id,
          title: product.title,
          slug: product.slug,
          priceCents: offerCents ?? finalPriceCents,
          thumbnailUrl: product.thumbnail_url,
          sellerName: creatorProfile?.display_name || creator?.display_name || null,
          variantId: selectedVariant?.id ?? null,
          variantName: selectedVariant?.name ?? null,
        }}
        userEmail={user?.email || null}
        isLoggedIn={!!user}
        offerToken={offerToken}
        carrierId={senderCarrierId()}
        productUrl={getProductUrl(creatorUsername, product.slug)}
      />
    )
  }

  return (
    <CheckoutPageClient
      product={{
        id: product.id,
        title: product.title,
        slug: product.slug,
        description: product.description,
        price_cents: offerCents ?? finalPriceCents,
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
      offerToken={offerToken}
      selectedVariant={selectedVariant ? {
        id: selectedVariant.id,
        name: selectedVariant.name,
        description: selectedVariant.description,
        priceCents: isPwywActive && customPriceCents !== null ? customPriceCents : selectedVariant.price_cents,
      } : null}
      // Pass PWYW info for display
      isPwyw={isPwywActive}
      customPriceCents={customPriceCents}
      allVariants={(allVariants || []).map(v => ({
        id: v.id,
        name: v.name,
        description: v.description,
        priceCents: v.price_cents,
      }))}
    />
  )
}

export default async function CheckoutPage(props: CheckoutPageProps) {
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
