import { Suspense } from "react"
import { MAX_PWYW_CENTS } from "@/lib/checkout/pricing"
import { notFound, redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import CheckoutPageClient from "./checkout-client"
import { CheckoutSkeleton } from "./checkout-skeleton"
import { getProductUrl } from "@/lib/url-helpers"
import { checkoutReturns } from "@/lib/checkout/site-hosts"
import MembershipCheckout from "./membership-checkout"
import { RouteLoadingBar } from "@/components/navigation/route-loading-bar"

interface CheckoutPageProps {
  searchParams: Promise<{ productId?: string; variantId?: string; customPrice?: string; return?: string; cancel?: string; site?: string; interval?: string }>
}

async function CheckoutContent({ searchParams }: CheckoutPageProps) {
  const { productId, variantId, customPrice, return: returnTo, cancel, site, interval } = await searchParams

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

  /* A membership is joined, not bought once: its own checkout (./membership-checkout.tsx). */
  if (product.type === "membership") return membershipCheckoutContent({ product, interval })

  /*
    EVERYTHING ELSE AT ONCE. The creator, the option asked for, who is
    signed in and every option of the product only need the product, so
    they are asked for together: this page's wait used to be seven reads
    one after another, and the skeleton stood on screen for all of them.
  */
  const [creatorRead, variantRead, userRead, variantsRead] = await Promise.all([
    supabase.from("creators").select("id, user_id, slug").eq("id", product.creator_id).single(),
    variantId
      ? supabase
          .from("product_variants")
          .select("id, name, description, price_cents, pay_what_you_want, pwyw_min_price_cents, pwyw_suggested_price_cents")
          .eq("id", variantId)
          .eq("product_id", productId)
          .single()
      : Promise.resolve({ data: null }),
    supabase.auth.getUser(),
    supabase
      .from("product_variants")
      .select("id, name, description, price_cents, pay_what_you_want, pwyw_min_price_cents")
      .eq("product_id", productId)
      .order("price_cents", { ascending: true }),
  ])
  const creator = creatorRead.data
  const user = userRead.data.user
  const allVariants = variantsRead.data

  const [profileRead, ownedRead, returns] = await Promise.all([
    creator
      ? supabase.from("profiles").select("display_name, avatar_url, username").eq("id", creator.user_id).single()
      : Promise.resolve({ data: null }),
    user
      ? supabase.from("entitlements").select("id, variant_id").eq("buyer_id", user.id).eq("product_id", productId)
      : Promise.resolve({ data: null }),
    /* Back to the creator's own website after paying, and for Back, when the
       link asked and the address is one of THIS creator's sites. Checked here,
       on the server; anything else is dropped and checkout ends on the receipt
       as it always did (lib/checkout/return-url.ts). */
    checkoutReturns({ creatorId: product.creator_id, success: returnTo, cancel, site }),
  ])
  const creatorProfile = profileRead.data as { display_name: string | null; avatar_url: string | null; username: string | null } | null

  const creatorUsername = creatorProfile?.username || creator?.slug || ""

  // The variant asked for, when there was one (with PWYW fields)
  type SelectedVariant = {
    id: string
    name: string
    description: string | null
    price_cents: number
    pay_what_you_want?: boolean | null
    pwyw_min_price_cents?: number | null
    pwyw_suggested_price_cents?: number | null
  }
  let selectedVariant: SelectedVariant | null = (variantRead.data as SelectedVariant | null) ?? null

  // Check if user is logged in and already owns this specific product/variant
  const existingEntitlements = ownedRead.data as { id: string; variant_id: string | null }[] | null
  if (user && existingEntitlements && existingEntitlements.length > 0) {
    if (variantId) {
      // Check if user specifically owns THIS variant
      if (existingEntitlements.some((e) => e.variant_id === variantId)) redirect(getProductUrl(creatorUsername, product.slug))
      // User owns other variants but not this one - allow purchase
    } else {
      // No variant specified: for non-variant products, any entitlement without a variant means they own it
      if (existingEntitlements.some((e) => !e.variant_id)) redirect(getProductUrl(creatorUsername, product.slug))
      // User owns specific variants but not the base product - allow purchase
    }
  }

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

/**
 * THE MEMBERSHIP CHECKOUT'S DATA: the creator, who is signed in, and the
 * plan (its prices, trial and what members get). The plan is read with the
 * visitor's own client: row level security lets anybody read the plan of a
 * published membership, and nothing else of it (run-now part 75). A plan
 * that cannot be read (part 75 not run yet) draws the page with Join
 * switched off and a sentence saying so.
 */
async function membershipCheckoutContent({ product, interval }: { product: Record<string, any>; interval?: string }) {
  const supabase = await createClient()
  const [creatorRead, userRead, planRead] = await Promise.all([
    supabase.from("creators").select("id, user_id, slug").eq("id", product.creator_id).single(),
    supabase.auth.getUser(),
    supabase.from("membership_plans").select("monthly_price_cents, yearly_price_cents, trial_days, benefits").eq("product_id", product.id).maybeSingle(),
  ])
  const creator = creatorRead.data
  const user = userRead.data.user
  const { data: profile } = creator ? await supabase.from("profiles").select("display_name, avatar_url, username").eq("id", creator.user_id).single() : { data: null }
  const plan = planRead.data as { monthly_price_cents: number | null; yearly_price_cents: number | null; trial_days: number | null; benefits: unknown } | null
  return (
    <MembershipCheckout
      product={{ id: product.id, title: product.title, slug: product.slug, thumbnail_url: product.thumbnail_url ?? null }}
      creator={{ id: creator?.id || "", name: profile?.display_name || "Creator", avatar_url: profile?.avatar_url || null, username: profile?.username || creator?.slug || "" }}
      plan={{
        monthlyPriceCents: plan?.monthly_price_cents ?? null,
        yearlyPriceCents: plan?.yearly_price_cents ?? null,
        trialDays: plan?.trial_days ?? 0,
        benefits: Array.isArray(plan?.benefits) ? (plan!.benefits as unknown[]).filter((b): b is string => typeof b === "string") : [],
      }}
      userEmail={user?.email || null}
      isLoggedIn={!!user}
      initialInterval={interval === "year" ? "year" : interval === "month" ? "month" : undefined}
      unavailable={!!planRead.error || !plan}
    />
  )
}

export default async function CheckoutPage(props: CheckoutPageProps) {
  return (
    <>
      {/* A back off the checkout that the router has to fetch says so after 220ms, wherever the press
          came from: the control, the browser's arrow, or an edge swipe. */}
      <RouteLoadingBar />
      <Suspense
        fallback={<CheckoutSkeleton />}
      >
        <CheckoutContent {...props} />
      </Suspense>
    </>
  )
}
