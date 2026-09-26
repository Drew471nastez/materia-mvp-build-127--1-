import { Suspense } from "react"
import { MAX_PWYW_CENTS } from "@/lib/checkout/pricing"
import { notFound, redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import CheckoutPageClient from "./checkout-client"
import { getProductUrl } from "@/lib/url-helpers"
import { checkoutReturns } from "@/lib/checkout/site-hosts"

interface CheckoutPageProps {
  searchParams: Promise<{ productId?: string; variantId?: string; customPrice?: string; return?: string; cancel?: string; site?: string }>
}

async function CheckoutContent({ searchParams }: CheckoutPageProps) {
  const { productId, variantId, customPrice, return: returnTo, cancel, site } = await searchParams

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

  /* Back to the creator's own website after paying, and for Back, when the
     link asked and the address is one of THIS creator's sites. Checked here,
     on the server; anything else is dropped and checkout ends on the receipt
     as it always did (lib/checkout/return-url.ts). */
  const returns = await checkoutReturns({ creatorId: product.creator_id, success: returnTo, cancel, site })

  // Fetch variant if specified (with PWYW fields)
  let selectedVariant: {
    id: string
    name: string
    description: string | null
    price_cents: number
    pay_what_you_want?: boolean | null
    pwyw_min_price_cents?: number | null
    pwyw_suggested_price_cents?: number | null
  } | null = null
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

  // Fetch all variants for this product (for variant selector)
  const { data: allVariants } = await supabase
    .from("product_variants")
    .select("id, name, description, price_cents, pay_what_you_want, pwyw_min_price_cents")
    .eq("product_id", productId)
    .order("price_cents", { ascending: true })

  /* A product with options is bought as one of them (the server refuses it
     otherwise): arriving without one, the first is chosen, and the buyer can
     change it in the order summary. */
  if (!selectedVariant && allVariants && allVariants.length > 0) {
    selectedVariant = allVariants[0]
  }

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
  /* Arriving without an amount means the minimum. `price_cents` is 0 on a
     pay-what-you-want product, and showing it made the page offer the
     product for free. */
  if (isPwywActive && (customPrice == null || customPrice === "")) {
    customPriceCents = pwywMinPriceCents
    finalPriceCents = pwywMinPriceCents
  }
  if (isPwywActive && customPrice != null && customPrice !== "") {
    const asked = parseInt(customPrice, 10)
    /* Unreadable or below the minimum: the minimum. */
    const chosen = Number.isFinite(asked) && asked >= pwywMinPriceCents && asked <= MAX_PWYW_CENTS ? asked : pwywMinPriceCents
    customPriceCents = chosen
    finalPriceCents = chosen
  }

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
      returnTo={returns.success}
      backTo={returns.cancel}
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
        /* What the server will charge for it: a pay-what-you-want option's minimum. */
        priceCents: v.pay_what_you_want ? v.pwyw_min_price_cents || 0 : v.price_cents,
      }))}
    />
  )
}

export default async function CheckoutPage(props: CheckoutPageProps) {
  return (
    <Suspense
      fallback={
        /* The page's own shape, shown only when loading is slow (skeleton-deferred): the order on grey, the form on white. */
        <div className="skeleton-deferred relative min-h-screen bg-white lg:bg-[#f6f7f8]" aria-busy>
          <div className="pointer-events-none fixed inset-y-0 right-0 hidden w-1/2 bg-white shadow-[-12px_0_32px_-16px_rgba(17,24,39,0.16)] lg:block" />
          <div className="relative mx-auto grid max-w-[1120px] lg:grid-cols-2">
            <div className="bg-[#f6f7f8] px-5 pb-6 pt-4 sm:px-8 lg:bg-transparent lg:px-16 lg:pt-14">
              <div className="mx-auto max-w-[440px] space-y-4 lg:ml-auto lg:mr-0">
                <div className="h-7 w-40 rounded-md bg-[#e9ebee]" />
                <div className="h-4 w-28 rounded-md bg-[#e9ebee]" />
                <div className="h-9 w-44 rounded-md bg-[#e9ebee]" />
                <div className="h-12 rounded-[8px] bg-[#e9ebee]" />
              </div>
            </div>
            <div className="px-5 pt-7 sm:px-8 lg:px-16 lg:pt-14">
              <div className="mx-auto max-w-[440px] space-y-3 lg:ml-0">
                <div className="h-11 rounded-[8px] bg-[#f1f2f4]" />
                <div className="mt-6 h-5 w-40 rounded-md bg-[#f1f2f4]" />
                <div className="h-11 rounded-[8px] bg-[#f1f2f4]" />
                <div className="mt-6 h-5 w-36 rounded-md bg-[#f1f2f4]" />
                <div className="h-48 rounded-[8px] bg-[#f1f2f4]" />
              </div>
            </div>
          </div>
        </div>
      }
    >
      <CheckoutContent {...props} />
    </Suspense>
  )
}
