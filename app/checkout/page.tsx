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
    /** Set by /checkout/livrare on the way back, so the gate does not loop. */
    deliverySet?: string
  }>
}

async function CheckoutContent({ searchParams }: CheckoutPageProps) {
  const { productId, variantId, customPrice, offerId, deliverySet } = await searchParams

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

  // ── WHERE DOES IT GO? ──────────────────────────────────────────────────────
  //
  // Vinted asks before it takes the money, and so do we. A physical item with
  // no delivery point chosen sends the buyer to /checkout/livrare first, which
  // records the locker and redirects straight back with `deliverySet=1`.
  //
  // A REDIRECT, not a step inside the checkout client — that file is 2,300
  // lines of payment handling, and the safest change to a payment path is one
  // that does not touch it. Everything below this block is unchanged.
  //
  // Deliberately generous about skipping: digital goods have no parcel, a buyer
  // who already has a saved address should not be asked twice, `deliverySet`
  // lets someone opt out on the delivery page itself, and any failure to read
  // the preference falls through to checkout. A missing address is recoverable
  // on the order page afterwards; a purchase blocked at the last step is not.
  if (product.type === "physical" && deliverySet !== "1") {
    let hasPreference = false
    if (user) {
      const { readPreference } = await import("@/lib/shipping/preference")
      const { createAdminClient } = await import("@/lib/supabase/admin")
      try {
        hasPreference = Boolean(await readPreference(createAdminClient(), { userId: user.id }))
      } catch {
        // Reading it must never be what stops a sale.
        hasPreference = true
      }
    }
    if (!hasPreference) {
      const q = new URLSearchParams({ productId })
      if (variantId) q.set("variantId", variantId)
      if (customPrice) q.set("customPrice", customPrice)
      if (offerId) q.set("offerId", offerId)
      redirect(`/checkout/livrare?${q}`)
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
