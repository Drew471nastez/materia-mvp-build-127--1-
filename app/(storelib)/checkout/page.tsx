import type { Metadata } from "next"
import { trialDaysOf } from "@/lib/memberships/plan"
import { headers } from "next/headers"
import { personName } from "@/lib/profile/display-name"
import {
  checkoutCanonical,
  checkoutCoverUrl,
  checkoutOrigin,
  checkoutShareDescription,
  checkoutShareImage,
  checkoutShareTitle,
  checkoutSiteName,
} from "@/lib/checkout/share-meta"
import { Suspense, cache } from "react"
import { MAX_PWYW_CENTS } from "@/lib/checkout/pricing"
import { notFound, redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import CheckoutPageClient from "./checkout-client"
import { CheckoutSkeleton } from "./checkout-skeleton"
import { getProductUrl } from "@/lib/url-helpers"
import { checkoutReturns } from "@/lib/checkout/site-hosts"
import { physicalCheckoutHref } from "@/lib/physical/cart-link"
import MembershipCheckout from "./membership-checkout"
import { RouteLoadingBar } from "@/components/navigation/route-loading-bar"
import { detectedCountry, loadCheckoutConfig, loadStoreName } from "@/lib/store/settings-server"
import { loadTaxForCheckout } from "@/lib/tax/server"
import { checkoutTaxFor } from "@/lib/tax/rules"
import { createAdminClient as checkoutAdmin } from "@/lib/supabase/admin"
import type { CommunityCheckoutTerms } from "@/components/community/membership/checkout-policy"
import { rowsOwn } from "@/lib/checkout/owned"
import { StoreTracking } from "@/components/website-builder/store-tracking"
import { gaCheckoutOf } from "@/lib/store/ga"
import { currentUserForRequest } from "@/lib/auth/request-scope"
import { readStoreCurrency } from "@/lib/store/selling-currency-server"
import { PLAN_CURRENCY, productPriceCurrency } from "@/lib/money/product-currency"
import { MARKETPLACE_CURRENCY, marketplaceAmounts, marketplaceReferrer } from "@/lib/money/marketplace"
import { curatedWords } from "@/lib/checkout-text/words"
import { checkoutMsg } from "@/lib/markets/checkout-words"
import { marketplaceRates, marketplaceUsdFor } from "@/lib/money/marketplace-server"
import { CheckoutCurrency } from "./parts/ui"
import { stripeEarly } from "./parts/stripe-early"

/*
  ONE READ EACH, FOR THE TAB AND THE PAGE. generateMetadata and the page
  both need the product, its creator and the creator's profile; React's
  cache hands the second ask the first one's answer within the request,
  so the share card costs no reads of its own.
*/
const readPublishedProduct = cache(async (productId: string) => {
  const supabase = await createClient()
  return supabase.from("products").select("*").eq("id", productId).eq("status", "published").single()
})
const readCreatorRow = cache(async (creatorId: string) => {
  const supabase = await createClient()
  return supabase.from("creators").select("id, user_id, slug").eq("id", creatorId).single()
})
const readCreatorProfile = cache(async (userId: string) => {
  const supabase = await createClient()
  return supabase.from("profiles").select("display_name, avatar_url, username").eq("id", userId).single()
})

/** A read started before it is needed: awaited later as it is, and never an unheard rejection when the page ends first (a redirect). */
function early<T>(read: Promise<T>): Promise<T> {
  read.catch(() => {})
  return read
}

interface CheckoutPageProps {
  searchParams: Promise<{ productId?: string; variantId?: string; customPrice?: string; return?: string; cancel?: string; site?: string; interval?: string; ctx?: string; fx?: string; src?: string; ref?: string; utm_source?: string; utm_campaign?: string; sl_at?: string }>
}

async function CheckoutContent({ searchParams }: CheckoutPageProps) {
  const asked = await searchParams
  const { productId, variantId, customPrice, return: returnTo, cancel, site, interval, ctx, fx: fxParam } = asked

  if (!productId) {
    redirect("/explore")
  }

  const supabase = await createClient()

  /*
    WHO IS SIGNED IN, WHAT THEY OWN OF THIS PRODUCT AND ITS OPTIONS, BESIDE
    THE PRODUCT. None of them needs the product's row (the address names
    it), so they are asked with it rather than after it. Nothing they say is
    used until the product is known to be published.
  */
  const userRead = early(currentUserForRequest().then((c) => c.user))
  const ownedEarly = early(
    userRead.then(async (u): Promise<{ data: { id: string; variant_id: string | null }[] | null }> => {
      if (!u) return { data: null }
      const { data } = await supabase.from("entitlements").select("id, variant_id").eq("buyer_id", u.id).eq("product_id", productId)
      return { data: (data as { id: string; variant_id: string | null }[] | null) ?? null }
    }),
  )
  const variantEarly = early(
    (async (): Promise<{ data: unknown }> => {
      if (!variantId) return { data: null }
      const { data } = await supabase
        .from("product_variants")
        .select("id, name, description, price_cents, pay_what_you_want, pwyw_min_price_cents, pwyw_suggested_price_cents")
        .eq("id", variantId)
        .eq("product_id", productId)
        .single()
      return { data }
    })(),
  )
  const variantsEarly = early(
    Promise.resolve(
      supabase
        .from("product_variants")
        .select("id, name, description, price_cents, pay_what_you_want, pwyw_min_price_cents")
        .eq("product_id", productId)
        .order("price_cents", { ascending: true }),
    ),
  )

  const { data: product, error } = await readPublishedProduct(productId)

  if (error || !product) {
    notFound()
  }

  /*
    A PRODUCT THAT SHIPS IS PAID FOR IN THE CART CHECKOUT, never this one: it
    needs an address, a delivery choice and stock held. Round 49: that is the
    store's website's own checkout (lib/checkout/shipped-checkout-server), as
    for every product that ships, with the option asked for (none named: the
    buyer chooses it there), the page to come back to and where it began
    (?src=onepage). A OnePage's Buy on a product that ships lands here first.
    Only a shop with no published website keeps /checkout/physical.
  */
  if ((product as { type?: string }).type === "physical") {
    const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    const items = [{ productId: product.id, variantId: variantId && ID.test(variantId) ? variantId : null, quantity: 1 }]
    const back = typeof cancel === "string" && cancel ? cancel : typeof returnTo === "string" ? returnTo : null
    const { websiteCheckoutFor } = await import("@/lib/checkout/shipped-checkout-server")
    const website = await websiteCheckoutFor(checkoutAdmin(), {
      shopId: product.creator_id,
      items,
      back,
      src: asked.src ?? null,
      visit: { from: asked.ref, utm_source: asked.utm_source, utm_campaign: asked.utm_campaign, touches: asked.sl_at },
    })
    redirect(website ?? physicalCheckoutHref(product.creator_id, items, back))
  }

  /*
    A PRODUCT THAT SELLS A COMMUNITY TIER is bought by a signed in person who
    may join: approved first when the community asks for approval, and never
    by somebody who is already in (lib/communities/server/join.ts checkoutGate,
    which the payment routes ask again). Anyone else is sent where they
    belong: sign in, or the community's own page. After paying, they land in
    the community, not on a receipt: the address is the product's own
    community, worked out here, so `return` cannot point anywhere else.
  */
  let communityReturn: { success: string; cancel: string } | null = null
  /* Round 13 (41, 43): the community's refund policy, the EU withdrawal waiver where it applies, and the buyer's way of writing money. */
  let communityTerms: CommunityCheckoutTerms | null = null
  if ((product as { community_id?: string | null }).community_id) {
    const { checkoutGate } = await import("@/lib/communities/server/join")
    const {
      data: { user: buyer },
    } = await currentUserForRequest().then((c) => ({ data: { user: c.user } }))
    const gate = await checkoutGate(product as { id: string; community_id?: string | null }, buyer?.id ?? null)
    if (gate.refusal) redirect(gate.refusal.url)
    if (gate.community) {
      const { communityPath, welcomePath } = await import("@/components/community/public/paths")
      communityReturn = { success: welcomePath(gate.community.slug), cancel: communityPath(gate.community.slug) }
      const [{ checkoutTermsFor }, { admin }, { buyerLocale, withdrawalWaiverApplies }, { headers }] = await Promise.all([
        import("@/lib/communities/server/membership-lifecycle"),
        import("@/lib/communities/server/db"),
        import("@/lib/communities/membership-policy"),
        import("next/headers"),
      ])
      const [terms, h] = await Promise.all([checkoutTermsFor(admin(), product as { id: string; community_id?: string | null }), headers()])
      communityTerms = {
        communityName: terms?.communityName ?? gate.community.name ?? "",
        refundPolicy: terms?.refundPolicy ?? null,
        waiver: withdrawalWaiverApplies(h.get("x-vercel-ip-country")),
        locale: buyerLocale(h.get("accept-language")),
      }
    }
  }

  /* A membership is joined, not bought once: its own checkout (./membership-checkout.tsx). */
  if (product.type === "membership") return membershipCheckoutContent({ product, interval, returnTo: communityReturn?.success ?? null, communityTerms })

  /*
    WHAT ONLY NEEDS THE STORE, ASKED NOW. Who takes the payment, Settings ›
    Checkout and Taxes, the store's name and currency, and where Back goes
    depend on the product's store alone, so they start beside the reads
    below instead of after them: the skeleton used to stand for three
    rounds of reads, it stands for two.
  */
  const storeId: string | null = product.creator_id ?? null
  const storeReads = early(
    Promise.all([
      /* The store's Settings › Checkout: the news box, the name rule, an account first (lib/store/checkout-config). */
      loadCheckoutConfig(checkoutAdmin(), storeId ?? undefined),
      /* Settings › Taxes, when the store taxes digital products (lib/tax). */
      loadTaxForCheckout(checkoutAdmin(), storeId ?? undefined),
      headers(),
      /* Settings › Store details' store name, which receipts already sign with ("On receipts, order emails and checkout"). */
      storeId ? loadStoreName(checkoutAdmin(), storeId) : Promise.resolve(null),
      /* The currency the store sells in: its prices are in it and Pay charges it (lib/store/selling-currency). */
      readStoreCurrency(checkoutAdmin(), storeId ?? undefined),
    ]),
  )
  /* Back to the creator's own website after paying, and for Back, when the
     link asked and the address is one of THIS creator's sites. Checked here,
     on the server; anything else is dropped and checkout ends on the receipt
     as it always did (lib/checkout/return-url.ts). */
  const returnsRead = early(checkoutReturns({ creatorId: product.creator_id, success: returnTo, cancel, site }))

  /*
    EVERYTHING ELSE AT ONCE. The creator, the option asked for, who is
    signed in and every option of the product only need the product, so
    they are asked for together: this page's wait used to be seven reads
    one after another, and the skeleton stood on screen for all of them.
  */
  const [creatorRead, variantRead, user, variantsRead] = await Promise.all([
    readCreatorRow(product.creator_id),
    /* The option asked for, and every option: started with the product read, above. */
    variantEarly,
    userRead,
    variantsEarly,
  ])
  const creator = creatorRead.data
  const allVariants = variantsRead.data

  const [profileRead, ownedRead, returns] = await Promise.all([
    creator ? readCreatorProfile(creator.user_id) : Promise.resolve({ data: null }),
    /* Started with the product read, above. */
    ownedEarly,
    /* Started above, with the store's other reads. */
    returnsRead,
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
  /*
    ALREADY YOURS: OPEN IT. A buyer who owns the product was sent to the creator's product page on storelib.com, so a Buy
    button on the creator's own website landed somewhere that is neither the checkout nor the site. It opens the product in
    their library now, where it is used.
  */
  const OWNED = `/account/library/products/${encodeURIComponent(product.id)}`
  /* Owned per option, the one rule every checkout uses (lib/checkout/owned): THIS option, or the whole product (a purchase without an option, which the downloads read as every option). Owning another option still lets this one be bought. */
  if (user && existingEntitlements && existingEntitlements.length > 0) {
    if (rowsOwn(existingEntitlements.map((e) => ({ product_id: product.id, variant_id: e.variant_id })), product.id, variantId || null)) redirect(OWNED)
  }

  /* A product with options is bought as one of them (the server refuses it
     otherwise): arriving without one, the first is chosen, and the buyer can
     change it in the order summary. */
  if (!selectedVariant && allVariants && allVariants.length > 0) {
    selectedVariant = allVariants[0]
  }

  /* Asked above, beside the creator and the options (storeReads). */
  const [checkoutConfig, taxSetup, requestHeaders, storeName, store] = await storeReads
  /* The currency this product's price is in and Pay charges: the store's, or dollars for a community plan (lib/money/product-currency), as the route that charges reads it. */
  let priceCurrency = productPriceCurrency(product, store.currency)

  /*
    BOUGHT ON THE MARKETPLACE (?ctx=mp, which only Storelib's own pages add):
    in US dollars while the switch is on for this store (lib/money/marketplace),
    the product and its options converted once at the rate day the page
    showed (?fx=), and that day sent back with Pay so the charge is this
    price. No fresh rate: the purchase waits. It is never shown, or charged,
    in the store's currency instead. Anything else (the store's website, its
    OnePage, a shared link) is the store's own prices, as always.
  */
  type PriceRow = { price_cents: number; pay_what_you_want?: boolean | null; pwyw_min_price_cents?: number | null }
  let priceRow: PriceRow = product as PriceRow
  let shownVariants = allVariants
  let pricing: { context: "marketplace"; fxAsOf: string | null } | null = null
  /* No tag, no website: the page before decides (lib/money/marketplace marketplaceReferrer), so a storelib.com Buy button is never charged in the store's currency. */
  const onMarketplace = ctx === "mp" || (!ctx && !site && marketplaceReferrer(requestHeaders.get("referer"), process.env.NEXT_PUBLIC_MAIN_DOMAIN || "storelib.com"))
  if (onMarketplace && priceCurrency !== MARKETPLACE_CURRENCY && (await marketplaceUsdFor(product.creator_id))) {
    const fx = await marketplaceRates(checkoutAdmin(), fxParam)
    const listed = priceCurrency
    const usd = <T extends { price_cents: number; pwyw_min_price_cents?: number | null }>(row: T): T | null => {
      const m = marketplaceAmounts({ ...row, type: product.type }, listed, fx)
      return m.ok ? { ...row, price_cents: m.price_cents, pwyw_min_price_cents: m.pwyw_min_price_cents } : null
    }
    const p = usd(priceRow)
    const v = selectedVariant ? usd(selectedVariant) : null
    const all = (allVariants ?? []).map(usd)
    if (!fx || !p || (selectedVariant && !v) || all.some((x) => x === null)) {
      const { headers } = await import("next/headers")
      return <RatesPaused backTo={`/p/${encodeURIComponent(product.slug)}`} language={(await headers()).get("accept-language")} />
    }
    priceRow = p
    if (v) selectedVariant = v
    shownVariants = all as typeof allVariants
    priceCurrency = MARKETPLACE_CURRENCY
    pricing = { context: "marketplace", fxAsOf: fx.asOf }
  }

  // Determine if PWYW is active
  const isVariantPwyw = selectedVariant && (selectedVariant as any).pay_what_you_want
  const isProductPwyw = !selectedVariant && (priceRow as any).pay_what_you_want
  const isPwywActive = isVariantPwyw || isProductPwyw

  // Get PWYW min price for validation
  const pwywMinPriceCents = isVariantPwyw
    ? ((selectedVariant as any).pwyw_min_price_cents || 0)
    : ((priceRow as any).pwyw_min_price_cents || 0)

  // Calculate final price:
  // - If PWYW and customPrice provided, use customPrice (validated against minimum)
  // - If variant is selected, use variant's price_cents (FINAL price)
  // - Otherwise use product's base price
  let finalPriceCents = selectedVariant ? selectedVariant.price_cents : priceRow.price_cents

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

  const checkoutTax = checkoutTaxFor(taxSetup, product.id, detectedCountry(requestHeaders))

  return (
    <>
    {/* The store's own Google Analytics and pixels: begin_checkout now, purchase when it is paid (components/analytics/ga-route). */}
    {creator?.id ? (
      <StoreTracking
        creatorId={creator.id}
        checkout={gaCheckoutOf([{ productId: product.id, title: product.title, variantName: selectedVariant?.name ?? null, unitCents: isPwywActive && customPriceCents !== null ? customPriceCents : finalPriceCents, quantity: 1, type: product.type }], priceCurrency)}
      />
    ) : null}
    <CheckoutCurrency currency={priceCurrency}>
    <CheckoutPageClient
      checkoutConfig={checkoutConfig}
      emailConfirmed={!!user?.email_confirmed_at}
      checkoutTax={checkoutTax}
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
        name: storeName || personName({ name: creatorProfile?.display_name, username: creatorProfile?.username, slug: creator?.slug }),
        avatar_url: creatorProfile?.avatar_url || null,
        username: creatorUsername,
      }}
      userEmail={user?.email || null}
      isLoggedIn={!!user}
      returnTo={communityReturn?.success ?? returns.success}
      backTo={communityReturn?.cancel ?? returns.cancel}
      communityTerms={communityTerms}
      pricing={pricing}
      selectedVariant={selectedVariant ? {
        id: selectedVariant.id,
        name: selectedVariant.name,
        description: selectedVariant.description,
        priceCents: isPwywActive && customPriceCents !== null ? customPriceCents : selectedVariant.price_cents,
      } : null}
      // Pass PWYW info for display
      isPwyw={isPwywActive}
      customPriceCents={customPriceCents}
      allVariants={(shownVariants || []).map(v => ({
        id: v.id,
        name: v.name,
        description: v.description,
        /* What the server will charge for it: a pay-what-you-want option's minimum. */
        priceCents: v.pay_what_you_want ? v.pwyw_min_price_cents || 0 : v.price_cents,
      }))}
    />
    </CheckoutCurrency>
    </>
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
async function membershipCheckoutContent({ product, interval, returnTo = null, communityTerms = null }: { product: Record<string, any>; interval?: string; returnTo?: string | null; communityTerms?: CommunityCheckoutTerms | null }) {
  const supabase = await createClient()
  const [creatorRead, userRead, planRead] = await Promise.all([
    supabase.from("creators").select("id, user_id, slug").eq("id", product.creator_id).single(),
    currentUserForRequest().then((c) => ({ data: { user: c.user } })),
    supabase.from("membership_plans").select("monthly_price_cents, yearly_price_cents, trial_days, benefits, currency").eq("product_id", product.id).maybeSingle(),
  ])
  const creator = creatorRead.data
  const user = userRead.data.user
  /* Already a member: Manage, not a second subscription (the route refuses one anyway, app/api/memberships/checkout). */
  if (user) {
    const [{ grantsAccess }, { MEMBERSHIP_COLUMNS }] = await Promise.all([import("@/lib/memberships/state"), import("@/lib/memberships/server")])
    const { data: mine } = await checkoutAdmin().from("memberships").select(MEMBERSHIP_COLUMNS).eq("product_id", product.id).eq("buyer_id", user.id).order("created_at", { ascending: false }).limit(5)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const current = ((mine ?? []) as any[]).find((m) => grantsAccess(m))
    if (current?.id) redirect(`/account/library/memberships/${encodeURIComponent(current.id)}`)
  }
  const { data: profile } = creator ? await supabase.from("profiles").select("display_name, avatar_url, username").eq("id", creator.user_id).single() : { data: null }
  const plan = planRead.data as { monthly_price_cents: number | null; yearly_price_cents: number | null; trial_days: number | null; benefits: unknown; currency?: string | null } | null
  return (
    <MembershipCheckout
      product={{ id: product.id, title: product.title, slug: product.slug, thumbnail_url: product.thumbnail_url ?? null }}
      creator={{ id: creator?.id || "", name: personName({ name: profile?.display_name, username: profile?.username, slug: creator?.slug }), avatar_url: profile?.avatar_url || null, username: profile?.username || creator?.slug || "" }}
      plan={{
        monthlyPriceCents: plan?.monthly_price_cents ?? null,
        yearlyPriceCents: plan?.yearly_price_cents ?? null,
        trialDays: trialDaysOf(plan?.trial_days),
        benefits: Array.isArray(plan?.benefits) ? (plan!.benefits as unknown[]).filter((b): b is string => typeof b === "string") : [],
        currency: (plan?.currency || PLAN_CURRENCY).toLowerCase(),
      }}
      userEmail={user?.email || null}
      isLoggedIn={!!user}
      initialInterval={interval === "year" ? "year" : interval === "month" ? "month" : undefined}
      unavailable={!!planRead.error || !plan}
      returnTo={returnTo}
      communityTerms={communityTerms}
    />
  )
}

export async function generateMetadata({ searchParams }: CheckoutPageProps): Promise<Metadata> {
  const params = await searchParams
  const h = await headers()
  const origin = checkoutOrigin({ host: h.get("host"), forwardedHost: h.get("x-forwarded-host"), proto: h.get("x-forwarded-proto") })
  const host = new URL(origin).host
  /*
    THE SHARED LINK'S CARD, NOT A PAGE TO INDEX (round 45). The address is
    og:url, so a pasted checkout link previews as the product; the page
    names no canonical and says noindex (./layout.tsx, lib/seo/private-metadata).
    It used to say index with itself as canonical.
  */
  const canonical = checkoutCanonical(origin, { productId: params.productId, variantId: params.variantId })
  const fallback: Metadata = {
    metadataBase: new URL(origin),
    title: { absolute: "Storelib" },
    description: "Checkout",
    openGraph: { type: "website", url: canonical, siteName: checkoutSiteName(host, null), title: "Storelib", description: "Checkout", images: [{ url: checkoutShareImage(null), alt: "Storelib" }] },
    twitter: { card: "summary_large_image", title: "Storelib", description: "Checkout", images: [checkoutShareImage(null)] },
  }
  if (!params.productId) return fallback
  try {
    /* The page's own reads, shared (readPublishedProduct and the rest, above). */
    const { data: product } = await readPublishedProduct(params.productId)
    if (!product) return fallback
    const { data: creator } = await readCreatorRow(product.creator_id)
    const { data: profile } = creator ? await readCreatorProfile(creator.user_id) : { data: null }
    const creatorName = personName({ name: profile?.display_name, username: profile?.username, slug: creator?.slug })
    const title = checkoutShareTitle(product.title)
    const description = checkoutShareDescription(product.description, creatorName)
    const image = checkoutShareImage(checkoutCoverUrl({ thumbnailUrl: product.thumbnail_url, galleryUrls: product.gallery_urls }))
    const icon = (typeof profile?.avatar_url === "string" && profile.avatar_url) || image
    const siteName = checkoutSiteName(host, creatorName)
    return {
      metadataBase: new URL(origin),
      title: { absolute: title },
      description,
      icons: icon ? { icon: [{ url: icon }], shortcut: [icon], apple: [{ url: icon }] } : undefined,
      openGraph: { type: "website", url: canonical, siteName, title, description, images: [{ url: image, alt: title }] },
      twitter: { card: "summary_large_image", title, description, images: [image] },
    }
  } catch {
    return fallback
  }
}

export default async function CheckoutPage(props: CheckoutPageProps) {
  /* Before the Suspense below: the hints go out with the skeleton, not after the reads (./parts/stripe-early). */
  stripeEarly({ script: true })
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

/**
 * A marketplace purchase while no fresh exchange rate exists: said plainly, with the way back. Never a price in another currency.
 * In the buyer's browser language where Storelib has checked checkout words for it (lib/checkout-text/dict), else English.
 */
function RatesPaused({ backTo, language }: { backTo: string; language: string | null }) {
  const lang = (language ?? "").split(",")[0]?.split(";")[0]?.trim() ?? ""
  const words = curatedWords(lang)
  const say = (sentence: string) => words[sentence] ?? sentence
  return (
    <main data-checkout-paused="" lang={Object.keys(words).length ? lang : "en"} className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="max-w-sm text-center">
        <p className="text-[15px] font-medium text-[#1a1a2e]">{say(checkoutMsg("Prices on Storelib are being updated. Try again in a few minutes."))}</p>
        <a href={backTo} className="mt-4 inline-block text-[13px] text-[#6b7280] underline underline-offset-4">{say(checkoutMsg("Back to the product"))}</a>
      </div>
    </main>
  )
}
