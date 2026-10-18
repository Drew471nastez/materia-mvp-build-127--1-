import { notFound, permanentRedirect, redirect } from "next/navigation"
import { productPriceCurrency } from "@/lib/money/product-currency"
import { personName } from "@/lib/profile/display-name"
import { CourseOutline } from "@/components/courses/course-outline"
import { listPrice } from "@/lib/pricing/list-price"
import { shopMoneyIn } from "@/lib/store/shop-money"
import { cachedStoreCurrency } from "@/lib/store/selling-currency-server"
import { productPageQuote } from "@/lib/money/marketplace-server"
import { MARKETPLACE_CURRENCY } from "@/lib/money/marketplace"
import { plainSummary } from "@/lib/html-entities"
import { productIndexable } from "@/lib/seo/indexing"
import { jsonLdScript } from "@/lib/seo/json-ld"
import { isBanned } from "@/lib/seo/bans"
import { soldOut } from "@/lib/website-builder/shop-products"
import { fewLeftText, salesSoldOut } from "@/lib/products/sales-limit"
import { salesStanding } from "@/lib/products/sales-standings"
import { createAdminClient } from "@/lib/supabase/admin"
import { DB_CATEGORY_TO_ID, categoryLabel, categoryPath } from "@/lib/marketplace/categories"
import { hasCategoryPage } from "@/lib/explore/category-pages"
import Link from "next/link"
import { createClient } from "@/lib/supabase/server"
import { startPhaseTimer } from "@/lib/perf/phase-timer"
import {
  cachedVariants,
  cachedMoreFromCreator,
  cachedReviews,
  cachedProductAssets,
  cachedCourseOutline,
} from "@/lib/commerce/product-page-cache"
import {
  loadCreator,
  loadCreatorProfile,
  loadProductBySlug,
  loadProductPageConfig,
  loadStoreConfig,
} from "@/lib/commerce/product-page-data"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { AppAvatar } from "@/components/app/app-avatar"
import { optimizedImageUrl } from "@/lib/images/optimized-url"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Check, ArrowRight, CheckCircle, ChevronRight, Star, Heart } from "lucide-react"
import { BuyButton } from "@/components/checkout/buy-button"
import { PurchaseStatusWrapper } from "@/components/checkout/purchase-status-wrapper"
import { ViewInLibraryButton } from "@/components/checkout/view-in-library-button"
import { membershipForProductPage } from "@/lib/memberships/product-page"
import { ProductGallery } from "@/components/product/product-gallery"
import { DiscoverBackBreadcrumb } from "@/components/product/discover-back-breadcrumb"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { DownloadButton } from "@/components/download-button"
import { TrackView } from "@/components/analytics/track-view"
import { StoreTracking } from "@/components/website-builder/store-tracking"
import { CaptureTouch } from "@/components/attribution/capture-touch"
import { SectionRenderer, type ProductData } from "@/components/store-builder/section-renderer"
import { ProductAboutSection } from "@/components/store-builder/unified-section-renderer"
import { DynamicFavicon } from "@/components/store-builder/dynamic-favicon"
import { LiveProductCreatorBar } from "@/components/store-builder/product-creator-bar"
import { creatorPageHref } from "@/lib/navigation/back-plan"
import { DiscoverStickyWrapper } from "@/components/store-builder/discover-sticky-wrapper"
import { LiveStickyAddToCart } from "@/components/store-builder/sticky-add-to-cart"
import type { Section, ProductHeaderSettings } from "@/lib/store-builder/types"
import {
  defaultMoreFromSellerSettings,
  defaultProductCreatorBarSettings,
  defaultStickyAddToCartSettings,
  defaultReviewsSettings,
} from "@/lib/store-builder/defaults"
import type { ShopHeaderSettings } from "@/lib/store-builder/types"
import { SellerFooter } from "@/components/storefront/seller-footer"
import { ShareButton } from "@/components/product/share-button"
import { CreatorBadges } from "@/components/storefront/creator-badges"
import { creatorBadges } from "@/lib/creators/badges"
import { WishlistButton } from "@/components/wishlist/wishlist-button"
import { RefundPolicyDisplay } from "@/components/product/refund-policy-display"
import { getStoreUrl, getProductShareUrl } from "@/lib/url-helpers"
import { primaryHostFor } from "@/lib/custom-domains/store"
import { SmartLink } from "@/components/smart-link"
import { EmbeddedNavigation } from "@/components/storefront/embedded-navigation"
import { EmbeddedBackBar } from "@/components/storefront/embedded-back-bar"
import { RichDescriptionContent } from "@/components/store-builder/description-rich-editor"
import { shownCustomFields } from "@/lib/products/custom-fields"

import { productHasOwnLook, productPageTone } from "@/lib/store-builder/product-page-tone"
import { paintFor, tint } from "@/lib/appearance/site-paint"
import { SitePaintProvider } from "@/lib/appearance/site-paint-context"
import { resolveStorefrontChrome } from "@/lib/store-builder/storefront-chrome"
import { imagesOnly } from "@/lib/media/video"
import { currentUserForRequest } from "@/lib/auth/request-scope"

/*
  WHAT'S INCLUDED, ONE PLAIN MARK A LINE. It used to pick a picture for each
  line from its words (a download arrow, a stack of files, an infinity sign)
  and a green check for the rest: "the green check and purple icons look AI".
  Now every line has the same thin check, in the theme's icon colour when it
  sets one and a quiet grey when it does not.
*/
function getIncludedItemIcon(_item: string, iconColor?: string) {
  return (
    <Check
      aria-hidden
      strokeWidth={2}
      className={iconColor ? "mt-0.5 h-4 w-4 shrink-0" : "mt-0.5 h-4 w-4 shrink-0 text-[#6b7280]"}
      style={iconColor ? { color: iconColor } : undefined}
    />
  )
}

export const dynamic = "force-dynamic"

interface ProductPageProps {
  params: Promise<{ slug: string }>
  searchParams: Promise<{
    purchase?: string
    already_owned?: string
    src?: string
    layout?: string
    recommended?: string
    /** Set when this page is inside the creator-page workspace's canvas. */
    embedded?: string
  }>
}

export async function generateMetadata({ params }: ProductPageProps) {
  const { slug } = await params

  /* The same row the layout and the page read, fetched once per request.
     See lib/commerce/product-page-data.ts. */
  const { product } = await loadProductBySlug(slug)

  if (!product) {
    return { title: "Product Not Found" }
  }

  // Fetch creator's display name and published config for favicon
  let sellerName: string | undefined
  let faviconUrl: string | undefined
  let sellerHandle: string | undefined
  /* Read from the creator row the page loads whole, so it costs no query. */
  let sellerBanned = false
  if (product.creator_id) {
    /*
      THE NAME AND THE FAVICON, from rows the page needs anyway.

      The creator and the shop's config are fetched here and again in the
      page; the profile was a third query behind the creator. All three go
      through the request-scoped loaders now, and the two that do not depend
      on each other start together rather than in a line.
    */
    const [creator, shopConfig] = await Promise.all([
      loadCreator(product.creator_id),
      loadStoreConfig(product.creator_id, "shop"),
    ])

    if (creator) {
      sellerBanned = isBanned(creator)
      /* `creators.display_name` is a copy of the profile's, written when the
         account was made and edited by nothing since, so the live profile
         below wins over it (lib/account/identity). It is read here only for
         a creator whose profile row cannot be reached. */
      sellerName = undefined
      /**
       * THE HANDLE IS NEEDED WHETHER OR NOT THE NAME WAS, because the
       * canonical address of a product is storelib.com/<handle>/<slug> and
       * this is where that is declared. The profile was previously fetched
       * only as a fallback for a missing display name; the loader is
       * request-scoped and the page asks for the same row anyway, so asking
       * for it here costs nothing.
       */
      if (creator.user_id) {
        const profile = await loadCreatorProfile(creator.user_id)
        sellerHandle = profile?.username || undefined
        sellerName = profile?.display_name || profile?.full_name || creator.display_name || undefined
      }
      if (!sellerName) sellerName = creator.display_name || undefined
    }

    const headerSettings = shopConfig?.published_config?.headerSettings as ShopHeaderSettings | undefined
    faviconUrl = headerSettings?.faviconUrl || undefined
  }

  // Determine the social preview image: first gallery image → thumbnail
  const galleryUrls = product.gallery_urls as string[] | null
  const socialImage = imagesOnly(galleryUrls ?? [])[0] || product.thumbnail_url || undefined

  /*
    THE PRODUCT'S OWN SEARCH RESULT, when its creator wrote one. The editor
    has always saved an SEO title and description (app/app/products/new/
    product-editor.tsx) and nothing read them. A typed title loses a trailing
    "| Storelib", which the root layout adds itself.
  */
  const ownTitle = typeof product.seo_title === "string" ? product.seo_title.trim().replace(/ \| Storelib$/i, "") : ""
  const ownDescription = typeof product.seo_description === "string" ? plainSummary(product.seo_description, 300) : ""

  // Title: "Product Name | Seller Name" (template adds "| Storelib")
  const tabTitle = ownTitle || (sellerName ? `${product.title} | ${sellerName}` : product.title)
  const ogTitle = ownTitle || `${product.title} | ${sellerName || "Storelib"}`
  /**
   * PLAIN TEXT, BECAUSE A META DESCRIPTION IS PLAIN TEXT. The description is
   * rich text stored as HTML, and this handed it over untouched: a product
   * shared to WhatsApp previewed as `<div class="w-full my-[1px]"><div
   * data-slate-node="element"…` and nothing else, because every reader of a
   * meta description prints exactly what it is given.
   */
  const pageDescription = ownDescription || plainSummary(product.description) || "Check out this product on Storelib"

  /**
   * ONE ADDRESS WINS, AND IT IS THE ONE EVERY LINK USES.
   *
   * `/p/<slug>` and `/<handle>/<slug>` both render this page, which is two
   * URLs serving identical content — exactly the duplicate that a canonical
   * exists to collapse. Everything hands out the nested one, so that is the
   * one declared here; the old spelling keeps working and points at it.
   * A product whose creator has no handle has only the old address, and
   * getProductShareUrl returns it.
   */
  /* On the creator page's own domain when it has one: <domain>/<slug>. */
  const pageHost = await primaryHostFor(product.creator_id, "creator_page")
  const productUrl = getProductShareUrl(sellerHandle || "", product.slug, pageHost)

  return {
    title: tabTitle,
    description: pageDescription,
    openGraph: {
      title: ogTitle,
      description: pageDescription,
      type: "website",
      siteName: "Storelib",
      url: productUrl,
      ...(socialImage && {
        images: [{ url: socialImage, width: 1200, height: 630, alt: product.title }],
      }),
    },
    twitter: {
      card: socialImage ? "summary_large_image" : "summary",
      title: ogTitle,
      description: pageDescription,
      ...(socialImage && {
        images: [socialImage],
      }),
    },
    alternates: {
      canonical: productUrl,
    },
    /* Listed and indexed by one rule (lib/seo/indexing productIndexable):
       a published product, unless its seller's handle is a link farm's, or
       its seller was banned and put it back up (the sitemap leaves it out). */
    robots: {
      index: productIndexable(product, sellerHandle ?? null) && !sellerBanned,
      follow: true,
      googleBot: { index: productIndexable(product, sellerHandle ?? null) && !sellerBanned, follow: true, "max-image-preview": "large" as const },
    },
    ...(faviconUrl && {
      icons: {
        icon: faviconUrl,
        apple: faviconUrl,
      },
    }),
  }
}

export default async function ProductPage({ params, searchParams }: ProductPageProps) {
  const { slug } = await params
  const { purchase, already_owned, src, layout, recommended, embedded } = await searchParams
  const showDiscoverBreadcrumb = recommended === "1"
  const inEditorCanvas = embedded === "1"
  const timer = startPhaseTimer("product-timing", slug)
  const supabase = await createClient()
  timer.mark("client")

  /*
    ONE LOOKUP FOR THE WHOLE REQUEST. The layout and generateMetadata ask the
    same question and used to each pay for it — three products queries to
    render one product page. lib/commerce/product-page-data.ts.
  */
  const { product: loaded, viaHistory } = await loadProductBySlug(slug)

  // The slug in the URL is an old one: send them to the current address.
  // Permanent (308): the old slug is not coming back, and a search engine
  // moves what it knows only for a permanent move. /p/<slug> rather than
  // /<handle>/<slug> because it answers on every host, a connected domain's
  // included, and names the nested address as its canonical.
  if (loaded && viaHistory) {
    permanentRedirect(`/p/${loaded.slug}`)
  }

  if (!loaded) {
    notFound()
  }

  /*
    THE MARKETPLACE'S PRICE. A product page on Storelib is the marketplace:
    in US dollars once its store is switched over (lib/money/marketplace),
    every amount on the page (the product, each option) converted at one
    rate day, the one its Buy link carries. Off, or a dollar product: the
    product's own currency, exactly as before. Waiting for a rate: its own
    currency, and the checkout waits too (never a lei charge for a dollar
    page).
  */
  const storeSells = await cachedStoreCurrency(loaded.creator_id)
  const pageQuote = await productPageQuote(loaded, productPriceCurrency(loaded, storeSells))
  const product = pageQuote.convert(loaded)

  /*
    A PRODUCT THAT SELLS A COMMUNITY TIER IS THE COMMUNITY. Its page would
    sell the tier without the community around it (who it is for, its rules,
    approval), so the community's own page is where it lives; with
    communities switched off it is not offered at all.
  */
  const communityId = (product as { community_id?: string | null }).community_id
  if (communityId) {
    const { communityAddressForProduct } = await import("@/lib/communities/server/public")
    const target = await communityAddressForProduct(communityId)
    if (target) redirect(target)
    notFound()
  }

  /*
    A PRODUCT THAT SHIPS IS SOLD ON ITS STORE'S WEBSITE ONLY, in the store's
    own currency with its shipping (never on Storelib's marketplace pages:
    Explore, creator pages, communities and recommendations leave it out
    too). Its address here sends the visitor to the website's own product
    page; a store with no published website has nowhere to sell it, so the
    page is not found rather than offering what cannot be bought here.
  */
  if (product.type === "physical") {
    const [{ storeOriginFor }, { createAdminClient: physicalAdmin }, { getMainDomain }] = await Promise.all([
      import("@/lib/physical/order-link-server"),
      import("@/lib/supabase/admin"),
      import("@/lib/url-helpers"),
    ])
    const origin = await storeOriginFor(physicalAdmin(), product.creator_id)
    if (origin && origin !== `https://${getMainDomain()}`) redirect(`${origin}/products/${encodeURIComponent(product.slug)}`)
    notFound()
  }

  // Extract categories from joined data
  const productCategories = product.product_categories?.map((pc: any) => pc.category).filter(Boolean) || []

  /**
   * ===========================================================================
   *  FOUR LOOKUPS THAT ONLY NEED THE PRODUCT, ISSUED TOGETHER
   * ===========================================================================
   *
   * The creator, the shop config, the default product template and the
   * product-specific config were fetched one after another, each waiting on the
   * one before it, even though every one of them keys off `product.creator_id`
   * or `product.id` -- both already in hand by this point. Nothing here reads
   * anything produced by the others.
   *
   * On a server component that cost is paid before the first byte of HTML goes
   * out, so it is four sequential database round trips of pure dead time on the
   * page a buyer is waiting to look at. They now cost one.
   *
   * `creatorProfile` is NOT in this batch, and cannot be: it is looked up by
   * `creator.user_id`, which does not exist until the creator row comes back.
   */
  /**
   * ===========================================================================
   *  EVERYTHING THAT ONLY NEEDS THE PRODUCT STARTS NOW, AND MOST OF IT IS
   *  ALREADY ANSWERED
   * ===========================================================================
   * The four configs above were batched already, and then the page went back
   * to asking one question at a time: the variants, the digital files, the
   * course, the other products by this seller, the reviews. SIX MORE ROUND
   * TRIPS, one after another, none of them needing anything the others
   * produce.
   *
   * Overlapping them helped and was not the fix. Instrumented on production,
   * the variants query alone was between 139ms and 3302ms of a render that
   * has under a second to spend, because the row-level security policy on
   * that table runs a subquery per row across three joined tables. Making a
   * slow query concurrent with the others still leaves the page waiting for
   * the slow query.
   *
   * So they are cached instead. Every one of these is the same answer for
   * every visitor -- a variant's name and price, a file's name, the seller's
   * other products, the reviews, a course's chapter list -- and each is
   * fetched once and shared until the creator changes it.
   * lib/commerce/product-page-cache.ts holds the numbers, the reason, and the
   * argument for why a sessionless client is allowed to read them.
   *
   * WHAT DID NOT MOVE, and must not: who is logged in, what they own, what
   * they have ordered. Those are read below on the per-request client with
   * the session attached, uncached, exactly as before.
   */

  /**
   * Who is looking. The block that reads this catches everything and leaves
   * the page logged-out, so the catch here keeps that exact behaviour rather
   * than turning an auth blip into an unhandled rejection.
   */
  const userPromise = currentUserForRequest().then((c) => ({ data: { user: c.user } })).catch(() => ({ data: { user: null } }))

  const variantsPromise = cachedVariants(product.id)

  const moreProductsPromise = cachedMoreFromCreator(product.creator_id, product.id)

  const reviewsPromise = cachedReviews(product.id)

  /** Only for the kind of product that has them, exactly as before. */
  const assetsPromise = product.type === "digital" ? cachedProductAssets(product.id) : null

  /**
   * The course, its modules, then the lessons in those modules: three round
   * trips in a row, each one waiting on the answer to the last, so they could
   * never be started together. As one cached call the whole chain runs once
   * for everybody rather than once per visitor.
   */
  const coursePromise = product.type === "course" ? cachedCourseOutline(product.id) : null

  /*
    THE PROFILE JOINS THE BATCH INSTEAD OF WAITING BEHIND IT.

    It needs `creator.user_id`, so it cannot start until the creator row is
    back — but it was awaited after the WHOLE batch, which means it waited on
    three config queries it has nothing to do with. Chained onto the creator's
    own promise it starts the moment that one lands and overlaps with the
    rest, which takes a round trip off the critical path rather than moving
    one around.

    Every query here goes through the request-scoped loaders, so the ones
    generateMetadata already asked for are free.
  */
  const creatorWithProfile = loadCreator(product.creator_id).then(async (row) => ({
    creator: row,
    profile: row?.user_id ? await loadCreatorProfile(row.user_id) : null,
  }))

  const [
    { creator, profile: creatorProfileRow },
    shopConfig,
    defaultTemplate,
    specificConfig,
  ] = await Promise.all([
    creatorWithProfile,
    loadStoreConfig(product.creator_id, "shop"),
    loadStoreConfig(product.creator_id, "product"),
    loadProductPageConfig(product.creator_id, product.id),
  ])
  timer.mark("creatorAndConfig")

  const creatorProfile: any = creatorProfileRow

  // ---------------------------------------------------------------------------
  // Fetch shop page config for avatar fallback
  // Avatar hierarchy: Shop Header Avatar → Profile Avatar → Google Avatar → Initials
  // ---------------------------------------------------------------------------
  const shopHeaderSettings = shopConfig?.published_config?.headerSettings as ShopHeaderSettings | undefined

  // Create proper avatar fallback: Header avatar → Profile avatar
  const headerAvatarUrl = shopHeaderSettings?.avatarUrl
  const creatorAvatarUrl = headerAvatarUrl && headerAvatarUrl !== ""
    ? headerAvatarUrl
    : creatorProfile?.avatar_url || null

  /**
   * The exact URL the bar at the top will ask for. Radix's Avatar loads its
   * picture with a detached Image inside an effect, so without this the
   * request cannot begin until the page has hydrated — which is what the
   * creator's face appearing late in that bar is. 48, because the bar draws a
   * 36px circle and a 2x screen wants twice that; it has to match the
   * component's own call character for character or the preload is a second
   * download rather than a head start. See product-creator-bar.
   */
  const creatorAvatarPreload = creatorAvatarUrl ? optimizedImageUrl(creatorAvatarUrl, 48) : null

  /*
    The same bio the creator page shows, resolved the same way: a creator who
    rewrote it in the shop header meant that one. The product page's bar puts
    six words of it under their name on a phone.
  */
  /* The creator's bio was resolved here for the product page's top bar. The
     bar does not show it any more: six words with an ellipsis is the start
     of a sentence, and their page has the whole of it. */

  // ---------------------------------------------------------------------------
  // Product page config (specific > creator default)
  // Global settings (creator bar, sticky, buy button, spacing) always come from default template
  // ---------------------------------------------------------------------------
  let productPageConfig: any = null

  const globalHeaderSettings = defaultTemplate?.published_config?.headerSettings || {}

  if (specificConfig?.published_config) {
    // Merge global settings into product-specific config
    // IMPORTANT: globalSettings (themePreset) and globalColors ALWAYS come from default template
    // This ensures that when theme is changed from homepage, ALL product pages update correctly
    productPageConfig = {
      ...specificConfig.published_config,
      // Always use globalSettings from default template (includes themePreset)
      globalSettings: defaultTemplate?.published_config?.globalSettings || specificConfig.published_config.globalSettings,
      // Always use globalColors from default template (includes page background)
      globalColors: defaultTemplate?.published_config?.globalColors || specificConfig.published_config.globalColors,
      headerSettings: {
        ...specificConfig.published_config.headerSettings,
        // Use global settings for these fields (from default template)
        creatorBar: globalHeaderSettings.creatorBar || specificConfig.published_config.headerSettings?.creatorBar,
        stickyAddToCart: globalHeaderSettings.stickyAddToCart || specificConfig.published_config.headerSettings?.stickyAddToCart,
        buyButtonColor: globalHeaderSettings.buyButtonColor || specificConfig.published_config.headerSettings?.buyButtonColor,
        buyButtonTextColor: globalHeaderSettings.buyButtonTextColor || specificConfig.published_config.headerSettings?.buyButtonTextColor,
        buttonsBorderRadius: globalHeaderSettings.buttonsBorderRadius || specificConfig.published_config.headerSettings?.buttonsBorderRadius,
        spacing: globalHeaderSettings.spacing || specificConfig.published_config.headerSettings?.spacing,
        // Theme-related color settings from global template (always override product-specific)
        colors: globalHeaderSettings.colors || specificConfig.published_config.headerSettings?.colors,
        faqColors: globalHeaderSettings.faqColors || specificConfig.published_config.headerSettings?.faqColors,
        reviewsColors: globalHeaderSettings.reviewsColors || specificConfig.published_config.headerSettings?.reviewsColors,
        productCardColors: globalHeaderSettings.productCardColors || specificConfig.published_config.headerSettings?.productCardColors,
        priceContainerColors: globalHeaderSettings.priceContainerColors || specificConfig.published_config.headerSettings?.priceContainerColors,
        wishlistButtonColors: globalHeaderSettings.wishlistButtonColors || specificConfig.published_config.headerSettings?.wishlistButtonColors,
        viewInLibraryButtonColors: globalHeaderSettings.viewInLibraryButtonColors || specificConfig.published_config.headerSettings?.viewInLibraryButtonColors,
      },
    }
  } else if (defaultTemplate?.published_config) {
    productPageConfig = defaultTemplate.published_config
  }

  // Extract buy button colors from config
  const buyButtonColor = (productPageConfig?.headerSettings as ProductHeaderSettings | undefined)?.buyButtonColor
  const buyButtonTextColor = (productPageConfig?.headerSettings as ProductHeaderSettings | undefined)
    ?.buyButtonTextColor
  // Extract gallery dots settings
  const mobileGalleryDots =
    (productPageConfig?.headerSettings as ProductHeaderSettings | undefined)?.mobileGalleryDots ?? false
  const desktopGalleryDots =
    (productPageConfig?.headerSettings as ProductHeaderSettings | undefined)?.desktopGalleryDots ?? false
  /* The "N people have purchased this" line is gone, and with it the store
     switch and the per-product override that decided whether to print it. */
  const showRatingNextToSeller =
    (productPageConfig?.headerSettings as ProductHeaderSettings | undefined)?.showRatingNextToSeller ?? true

  // Extract theme colors from config
  const headerSettings = productPageConfig?.headerSettings as any

  /* The scheme's colours, dark or not, and the page's own colour: decided in
     lib/store-builder/product-page-tone, which scripts/check-creator-chrome.mjs
     measures per scheme on the real components. */
  /* Round 30: a look of the creator's own keeps it in the person's dark look; the platform's default page follows that look (productHasOwnLook). */
  /* Round 31: Storelib's own template and the default scheme's colours it writes are not a look of the creator's (productHasOwnLook). */
  const ownLook = productHasOwnLook(productPageConfig)
  /*
    STORELIB'S PAGE PAINTS ITS INLINE COLOURS TO FOLLOW THE LOOK (round 31, lib/appearance/site-paint). Every colour
    this page writes inline goes through paint(): exactly the colour it was in the light look, its charcoal step in the
    dark. The client parts (the buy card, the option selector, the wishlist button, the bars, the sections) do the same
    under SitePaintProvider. A creator's own look is never painted.
  */
  const paint = paintFor(!ownLook)
  const { themePreset, themeConfig, isDarkTheme, themeColors, categoryBadgeStyle, ratingStarColor, pageBackgroundColor: tonePageBackground } =
    productPageTone(productPageConfig, { site: !ownLook })
  const isColorfulTheme = false // No more colorful themes

  // Download button colors - use buyButtonColor if set (custom), otherwise use theme preset colors
  const downloadButtonBgColor = buyButtonColor || themeConfig?.productHeader?.buyButtonColor || "#2563eb"
  const downloadButtonTextColor = buyButtonTextColor || themeConfig?.productHeader?.buyButtonTextColor || "#ffffff"

  /*
    LIMIT SALES (lib/products/sales-limit.ts): a download with a limit says
    Sold out, and its buttons stop, once every copy is sold or held by a
    payment in progress; under ten left it says how many. Counted on the
    server from the orders, beside the purchase reads below. The checkout
    holds the last copy whatever this page said (lib/checkout/sales-limit).
  */
  const salesRead = product.type !== "physical" ? readSalesStanding(product.id) : Promise.resolve(null)

  // ---------------------------------------------------------------------------
  // Purchase state - includes variant-level access control
  // ---------------------------------------------------------------------------
  let hasPurchased = false
  let firstAssetId: string | null = null
  let purchasedVariantIds: string[] = [] // Array of all purchased variant IDs
  let productDownloadFiles: Array<{ id: string; file_name: string }> = []
  let user: any = null

  try {
    const {
      data: { user: authUser },
    } = await userPromise
  timer.mark("user")

    user = authUser

    if (user) {
      // Fetch ALL entitlements for this product (including variant-specific ones)
      const { data: entitlements } = await supabase
        .from("entitlements")
        .select("id, variant_id")
        .eq("buyer_id", user.id)
        .eq("product_id", product.id)

      if (entitlements && entitlements.length > 0) {
        hasPurchased = true
        // Collect all variant IDs the user has purchased
        purchasedVariantIds = entitlements
          .map(e => e.variant_id)
          .filter((id): id is string => id !== null && id !== undefined)

        // Also check orders for any variants not yet in entitlements (guest purchases, etc.)
        const { data: orders } = await supabase
          .from("orders")
          .select("variant_id")
          .eq("buyer_id", user.id)
          .eq("product_id", product.id)
          .eq("status", "completed")

        if (orders) {
          const orderVariantIds = orders
            .map(o => o.variant_id)
            .filter((id): id is string => id !== null && id !== undefined)
          // Merge and deduplicate
          purchasedVariantIds = [...new Set([...purchasedVariantIds, ...orderVariantIds])]
        }
      }
    }
  } catch {
    // ignore auth errors
  }

  /* A membership (lib/memberships): its price is per month or year, and a member is shown theirs instead of Join. */
  const membershipInfo = product.type === "membership" ? await membershipForProductPage(product.id, user) : null

  // ---------------------------------------------------------------------------
  // Course modules (only if course)
  // ---------------------------------------------------------------------------
  let courseModules: Array<{
    id: string
    title: string
    lessons?: Array<{ id: string; title: string; duration_seconds?: number | null; is_preview?: boolean }>
  }> | null = null

  if (coursePromise) {
    /* The three-query chain moved into the cache; this is the answer to it. */
    const outline = await coursePromise
    if (outline && outline.length > 0) courseModules = outline
  }

  // Always query product-level files — no hasPurchased gate.
  // The download API enforces entitlement; exposing file IDs is safe.
  if (assetsPromise) {
    const assets = await assetsPromise
  timer.mark("assets")

    if (assets && assets.length > 0) {
      firstAssetId = assets[0].id
      productDownloadFiles = assets.map((asset) => ({ id: asset.id, file_name: asset.file_name || "File" }))
    }
  }

  // ---------------------------------------------------------------------------
  // Product Variants (for variant selection)
  // ---------------------------------------------------------------------------
  const productVariants = await variantsPromise
  timer.mark("variants")
  const salesState = await salesRead
  const salesView = salesState ? { soldOut: salesSoldOut(salesState), fewLeft: fewLeftText(salesState) } : null

  // Transform variants data - price_cents is the FINAL price for the variant
  /* In the page's currency: dollars on the marketplace once switched over (pageQuote above). */
  const variants = productVariants.map((v) => pageQuote.convert({
    id: v.id,
    name: v.name ?? "",
    description: v.description,
    price_cents: v.price_cents || 0, // FINAL price, not additional
    max_purchases: v.max_purchases,
    position: v.position ?? 0,
    // Pay What You Want fields per variant
    pay_what_you_want: v.pay_what_you_want || false,
    pwyw_min_price_cents: v.pwyw_min_price_cents ?? null,
    pwyw_suggested_price_cents: v.pwyw_suggested_price_cents ?? null,
    /*
      The cached rows carry real types now (lib/commerce/product-page-cache),
      so the `any` that used to sit on this map is gone and the nulls the
      database actually allows have to be answered here instead of being
      waved through. A variant with no name rendered the word "null".
    */
    files: (v.product_variant_files ?? [])
      .map((pvf) => ({ id: pvf.digital_assets?.id, file_name: pvf.digital_assets?.file_name }))
      .filter((f): f is { id: string; file_name: string | null | undefined } => !!f.id)
      .map((f) => ({ id: f.id, file_name: f.file_name || "File" })),
  }))

  // Merge variant files into productDownloadFiles so the sticky bar and purchase
  // wrapper both see ALL files. Prefer the purchased variant's files; fall back to
  // every variant's files (needed when the buyer is identified client-side only).
  if (product.type === "digital" && variants.length > 0) {
    const targetVariants =
      purchasedVariantIds.length > 0
        ? variants.filter((v) => purchasedVariantIds.includes(v.id))
        : variants
    const variantFiles = targetVariants.flatMap((v) => v.files)

    // Merge, deduplicating by id
    const existingIds = new Set(productDownloadFiles.map((f) => f.id))
    const newFiles = variantFiles.filter((f) => !existingIds.has(f.id))
    productDownloadFiles = [...productDownloadFiles, ...newFiles]

    if (!firstAssetId && productDownloadFiles.length > 0) {
      firstAssetId = productDownloadFiles[0].id
    }
  }

  // ---------------------------------------------------------------------------
  // More products from seller (for "More from seller" section)
  // ---------------------------------------------------------------------------
  const moreProducts = await moreProductsPromise
  timer.mark("moreProducts")
  timer.done()

  /* A card that is not a product page carries its own address (a free community's, product-page-cache); not a column. */
  const cardLink = (row: object): string | undefined => ("href" in row && typeof row.href === "string" ? row.href : undefined)
  const moreProductsData: ProductData[] =
    moreProducts.map((p) => pageQuote.convert({
      id: p.id,
      slug: p.slug ?? undefined,
      title: p.title ?? "",
      thumbnail_url: p.thumbnail_url,
      price_cents: p.price_cents ?? 0,
      compare_at_cents: p.compare_at_cents ?? undefined,
      sales_count: p.sales_count ?? undefined,
      description: p.description,
      /* A membership's card says "/month" (lib/pricing/list-price). */
      type: (p as { type?: string | null }).type ?? undefined,
      /* A free community has no product to link through: its card goes to the community (product-page-cache). */
      href: cardLink(p),
      /*
        Each card in its own price's currency: the page's on the marketplace
        in dollars (converted above, a dollar plan as it is), else the
        product's own, so a lei product beside a dollar plan never reads "$".
      */
      currency: pageQuote.marketplace ? MARKETPLACE_CURRENCY : productPriceCurrency({ type: (p as { type?: string | null }).type ?? null }, storeSells),
    }) as ProductData)

  // Apply theme colors to all sections from the product page config
  // This ensures sections always reflect the current theme preset
  // IMPORTANT: Theme colors ALWAYS override section settings to ensure global theme consistency
  const applySectionThemeColors = (sections: Section[]): Section[] => {
    if (!themeConfig) return sections

    return sections.map((section) => {
      const newSection = { ...section, settings: { ...section.settings } }

      // Apply more-from-seller section colors from theme
      // Theme colors ALWAYS override - this ensures global theme preset applies correctly
      if (section.type === "more-from-seller") {
        newSection.settings = {
          ...newSection.settings,
          colors: {
            backgroundColor: themeConfig.sections?.featuredProductsBackgroundColor,
            textColor: themeConfig.sections?.featuredProductsTextColor || themeConfig.colors?.foreground,
          },
          productCardColors: {
            backgroundColor: themeConfig.productCard?.backgroundColor,
            textColor: themeConfig.productCard?.textColor,
            priceColor: themeConfig.productCard?.priceColor,
            borderColor: themeConfig.productCard?.borderColor,
          },
        }
      }

      // Apply reviews section colors from theme
      // Theme colors ALWAYS override - this ensures global theme preset applies correctly
      if (section.type === "reviews") {
        newSection.settings = {
          ...newSection.settings,
          colors: {
            backgroundColor: themeConfig.reviewsSection?.backgroundColor,
            textColor: themeConfig.reviewsSection?.textColor,
          },
          reviewsColors: {
            starColor: themeConfig.reviewsSection?.starColor,
            cardBackgroundColor: themeConfig.reviewsSection?.cardBackgroundColor,
            cardBorderColor: themeConfig.reviewsSection?.cardBorderColor,
          },
        }
      }

      // Apply text block colors from theme
      if (section.type === "text-block") {
        newSection.settings = {
          ...newSection.settings,
          colors: {
            backgroundColor: themeConfig.textBlock?.backgroundColor,
            textColor: themeConfig.textBlock?.headlineColor,
          },
          headlineColor: themeConfig.textBlock?.headlineColor,
          contentColor: themeConfig.textBlock?.contentColor,
        }
      }

      // Apply image-text section colors from theme
      if (section.type === "image-text") {
        newSection.settings = {
          ...newSection.settings,
          colors: {
            backgroundColor: themeConfig.imageText?.backgroundColor,
            textColor: themeConfig.imageText?.textColor,
          },
          buttonColor: themeConfig.imageText?.buttonColor,
          buttonTextColor: themeConfig.imageText?.buttonTextColor,
          buttonBorderRadius: themeConfig.buttonBorderRadius,
        }
      }

      // Apply benefits section colors from theme
      if (section.type === "benefits") {
        newSection.settings = {
          ...newSection.settings,
          colors: {
            backgroundColor: themeConfig.benefits?.backgroundColor,
            textColor: themeConfig.benefits?.textColor,
          },
          iconColor: themeConfig.benefits?.iconColor,
        }
      }

      // Apply announcement bar colors from theme
      if (section.type === "announcement-bar") {
        newSection.settings = {
          ...newSection.settings,
          colors: {
            backgroundColor: themeConfig.announcementBar?.backgroundColor,
            textColor: themeConfig.announcementBar?.textColor,
          },
        }
      }

      // Apply featured-products section colors from theme (in case used on product pages)
      if (section.type === "featured-products") {
        newSection.settings = {
          ...newSection.settings,
          colors: {
            backgroundColor: themeConfig.sections?.featuredProductsBackgroundColor,
            textColor: themeConfig.sections?.featuredProductsTextColor || themeConfig.colors?.foreground,
          },
          productCardColors: {
            backgroundColor: themeConfig.productCard?.backgroundColor,
            textColor: themeConfig.productCard?.textColor,
            priceColor: themeConfig.productCard?.priceColor,
            borderColor: themeConfig.productCard?.borderColor,
          },
          categoryFilterColors: {
            textColor: themeConfig.categoryFilter?.textColor,
            activeTextColor: themeConfig.categoryFilter?.activeTextColor,
            borderColor: themeConfig.categoryFilter?.borderColor,
          },
        }
      }

      // Apply about section colors from theme
      if (section.type === "about") {
        newSection.settings = {
          ...newSection.settings,
          colors: {
            backgroundColor: themeConfig.about?.backgroundColor,
            textColor: themeConfig.about?.textColor,
          },
          mutedTextColor: themeConfig.about?.mutedTextColor,
        }
      }

      return newSection
    })
  }

  // Get more-from-seller section settings from published config, or use defaults
  const publishedMoreFromSellerSection = productPageConfig?.sections?.find(
    (s: Section) => s.type === "more-from-seller",
  )

  // Create default more-from-seller section with theme colors applied
  const moreFromSellerSectionRaw: Section = publishedMoreFromSellerSection || {
    id: "more-from-seller-default",
    type: "more-from-seller",
    settings: { ...defaultMoreFromSellerSettings },
    order: 999,
  }

  // Apply theme colors to the section
  const moreFromSellerSection = applySectionThemeColors([moreFromSellerSectionRaw])[0]

  // Apply theme colors to all sections in the product page config
  const themedSections = productPageConfig?.sections ? applySectionThemeColors(productPageConfig.sections) : []

  // Get FAQs - prioritize product-specific FAQs, then config FAQs, then defaults
  const faqSection = productPageConfig?.sections?.find((s: Section) => s.type === "faq")
  const configFaqs = ((faqSection?.settings as any)?.customFaqs || [])
    .filter((faq: any) => faq.question && faq.answer)
    .map((faq: any) => ({ question: faq.question, answer: faq.answer }))

  // Product-specific FAQs from the product form (highest priority)
  const productFaqs = (product.faqs || [])
    .filter((faq: any) => faq.question && faq.answer)
    .map((faq: any) => ({ question: faq.question, answer: faq.answer }))

  // Default FAQs (fallback if no custom FAQs)
  const defaultFaqs = [
    {
      question: "How do I access my purchase?",
      answer: "After you complete checkout, you can download the product immediately on the download page. You'll also receive an email with the download link, so you can access it anytime from your inbox.",
    },
    {
      question: "Is there a refund policy?",
      answer: "Refund policies are set by individual creators. Please check product info or contact the seller directly if you have questions about refunds.",
    },
    {
      question: "How long do I have access?",
      answer: "You have lifetime access to all purchased content. Once you buy, it's yours forever.",
    },
  ]

  // Priority: product FAQs > config FAQs > default FAQs
  // If product has FAQs, use those. Otherwise use config FAQs (if any) + defaults
  /* A thing that ships gets no download answers: its own questions, or the page's, or no FAQ at all. */
  const displayFaqs = productFaqs.length > 0
    ? productFaqs
    : product.type === "physical"
      ? configFaqs
      : (configFaqs.length > 0 ? [...configFaqs, ...defaultFaqs] : defaultFaqs)

  const reviews = await reviewsPromise

  const reviewsCount = product.reviews_count || 0
  const reviewsAverage = product.reviews_average || 0

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------
  /* In the store's own currency, the one checkout charges (lib/store/selling-currency). */
  /* The currency this product's own price is in (lib/money/product-currency): the store's, or dollars for a membership or community plan. */
  const storeCurrency = pageQuote.currency
  const formatPrice = (cents: number) => shopMoneyIn(cents, storeCurrency, { grouping: true })
  /* The price under the title: free, pay what you want, or a price and its saving, by the rule every card uses. */
  const listed = listPrice({
    price_cents: product.price_cents,
    compare_at_cents: product.compare_at_cents,
    pay_what_you_want: (product as { pay_what_you_want?: boolean | null }).pay_what_you_want ?? null,
    pwyw_min_price_cents: (product as { pwyw_min_price_cents?: number | null }).pwyw_min_price_cents ?? null,
    /* A membership's price is "$9/month" (or "/year" when it has only a yearly one), by the same rule as every card. */
    type: product.type,
    price_interval: membershipInfo?.interval ?? null,
  }, formatPrice)
  const headerPrice = listed

  // Check if the logged-in user is the creator of this product

  const getWhatsIncluded = () => {
    if (product.whats_included && product.whats_included.length > 0) {
      return product.whats_included.map((item: string) => item.replace(/\*\*/g, ""))
    }
    /* A thing that ships has no download and no "lifetime access": its photos, options and description say what it is. */
    if (product.type === "physical") return []

    const items: string[] = []

    if (product.type === "digital") {
      items.push("Instant download access")
      items.push("All included files")
    }

    if (product.type === "course") {
      items.push("Full course access")
      items.push(`${courseModules?.length || 0} modules`)
      const lessonCount = courseModules?.reduce((acc, m) => acc + (m.lessons?.length || 0), 0) || 0
      items.push(`${lessonCount} lessons`)
      items.push("Progress tracking")
    }

    items.push("Lifetime access")
    return items
  }
  const includedItems: string[] = getWhatsIncluded()
  /* Details the creator chose to show (Custom fields in the editor, lib/products/custom-fields.ts): Material, Care, Size. */
  const detailFields = shownCustomFields((product as { custom_fields?: unknown }).custom_fields)

  // Use the profile username (the field that /u/[username] routes look up by).
  // Do NOT fall back to creator.slug — it may differ from the profile username
  // or be a UUID, which would build a broken /u/<uuid> URL and get "lost".
  const creatorUsername = creatorProfile?.username || ""
  /* The creator page's own domain, when it has one: where the canonical, the
     structured data and the share sheet send people (lib/custom-domains). */
  const pageHost = await primaryHostFor(product.creator_id, "creator_page")
  /* The marks Storelib has granted the seller, beside their name in both rows. */
  const creatorBadgeIds = creatorBadges(creatorProfile)
  // Use a relative internal path directly — avoids the server-side getStoreUrl()
  // which returns https://username.storelib.com (isNativeApp()=false on the server).
  // That subdomain URL, present in the pre-hydration SSR HTML, was being
  // intercepted by Android's isHomepageUrl() and swallowed silently ("gets lost").
  // Using /u/<username> directly works before AND after React hydrates SmartLink.
  // Also avoids the aggressive sanitisation in getStoreUrl() (which strips
  // underscores etc.) — the raw DB username is the safest key for the ilike lookup
  // in the creator profile route.
  const creatorStoreUrl = creatorUsername ? `/${creatorUsername}` : "#"

  // Check if a URL is a YouTube thumbnail (used for product listings only, not gallery display)
  const isYouTubeThumbnailUrl = (url: string | null) => {
    return url?.includes('img.youtube.com') || url?.includes('i.ytimg.com')
  }

  // Extract YouTube URLs from video_url if it's a YouTube embed
  const youtubeUrls: string[] = []
  let videoFileUrl: string | null = null

  if (product.video_url) {
    if (product.video_url.includes('youtube.com') || product.video_url.includes('youtu.be')) {
      youtubeUrls.push(product.video_url)
    } else {
      videoFileUrl = product.video_url
    }
  }

  // Use gallery_urls directly if available, filtering out YouTube thumbnail URLs
  // YouTube thumbnails are only for product listings, not for gallery display
  // If only YouTube embed exists (no real images), galleryImages should be empty
  // The ProductGallery component will show the YouTube embed from youtubeUrls
  const galleryImages = product.gallery_urls?.length
    ? (product.gallery_urls.filter((url: string) => url && !isYouTubeThumbnailUrl(url)) as string[])
    : (product.thumbnail_url && !isYouTubeThumbnailUrl(product.thumbnail_url))
      ? [product.thumbnail_url]
      : []

  const srcParam = src === "platform" ? "?src=platform" : ""

  const stickyBarSettings = {
    visible: true,
    showThumbnail: true,
    addToCartText: "Add to cart",
    buyNowText: "Buy now",
    hideOnScroll: false,
    revealOnScroll: false,
  }

  const currentProductData: ProductData[] = [
    {
      id: product.id,
      slug: product.slug,
      title: product.title,
      thumbnail_url: product.thumbnail_url,
      price_cents: product.price_cents,
      compare_at_cents: product.compare_at_cents,
      /* The custom layout (SectionRenderer) writes a membership's price per month or year too, not a bare "$9". */
      type: product.type,
      price_interval: membershipInfo?.interval ?? null,
      sales_count: product.sales_count,
      description: product.description,
      whats_included: product.whats_included,
      gallery_urls: product.gallery_urls,
      faqs: product.faqs,
      refund_policy_enabled: product.refund_policy_enabled,
      refund_policy_type: product.refund_policy_type,
      refund_policy_fine_print: product.refund_policy_fine_print,
      refund_policy_updated_at: product.refund_policy_updated_at,
    },
  ]

  // ---------------------------------------------------------------------------
  // UI blocks (shared)
  // ---------------------------------------------------------------------------
  const AlertsBlock = (
    <>
      {purchase === "success" && (
        <Alert className="mb-6 border-green-500/50 bg-green-50 text-green-800">
          <CheckCircle className="h-4 w-4" />
          <AlertTitle>Purchase successful!</AlertTitle>
          <AlertDescription>
            You now have access to this product. Download it below or view it in your library.
          </AlertDescription>
        </Alert>
      )}

    </>
  )

  const MainProductContent = (
    <div className="w-full">
      {/* Above both columns on a wide screen, so the gallery and the buy card start on the same line. */}
      <DiscoverBackBreadcrumb
        showOnWeb={showDiscoverBreadcrumb}
        creatorHref={creatorPageHref(creatorUsername)}
        creatorName={creatorProfile?.display_name || creator?.name || undefined}
      />
      <div className="grid gap-8 lg:grid-cols-5 lg:gap-12 lg:items-start w-full">
      <div className="lg:col-span-3 min-w-0 w-full">
        {galleryImages.length > 0 || videoFileUrl || youtubeUrls.length > 0 ? (
          <ProductGallery
            images={galleryImages}
            title={product.title}
            videoUrl={videoFileUrl}
            youtubeUrls={youtubeUrls}
            mobileDotsMode={mobileGalleryDots}
            desktopDotsMode={desktopGalleryDots}
            shape={product.type === "physical" ? "square" : "wide"}
            followVariantsOf={product.type === "physical" ? product.id : undefined}
          />
        ) : (
          <div className="relative aspect-video overflow-hidden rounded-xl bg-muted">
            <div className="flex h-full items-center justify-center text-muted-foreground">
              <span className="text-6xl">{product.type === "digital" ? "📦" : "📚"}</span>
            </div>
          </div>
        )}

        <div className="mt-6 sm:mt-8">
          <div className="flex items-start justify-between gap-3 sm:gap-4">
            {/*
              THE TITLE IS SAID ONCE. On a phone and a tablet it is said here,
              because there is no card at that width. From `lg` up the buy
              card carries it and this one goes, so the page does not open
              with the same words twice a column apart.

              `lg:hidden` rather than deleting it: exactly one of the two is
              in the accessibility tree at any width, so the page keeps its
              single <h1> and screen readers do not meet a duplicate.
            */}
            <h1
              className="text-2xl sm:text-3xl font-semibold break-words flex-1 min-w-0 lg:hidden"
              style={{ color: paint(themeColors.textColor, "ink") || "var(--foreground)" }}
            >
              {product.title}
            </h1>
            <div className="flex items-center gap-2 flex-shrink-0">
              <Badge
                variant="secondary"
                className="shrink-0 capitalize"
                style={categoryBadgeStyle}
              >
                {product.category || productCategories[0]?.name || (product.type === "digital" ? "Digital" : product.type)}
              </Badge>
            </div>
          </div>

          {/* Desktop: Creator info above description with share button */}
          {creator && (
            <div className="hidden lg:flex mt-4 items-center justify-between" data-creator-header>
              <div className="flex items-center gap-3 p-2 -ml-2">
                <SmartLink
                  href={creatorStoreUrl}
                  className="creator-link inline-flex items-center gap-3 rounded-lg min-h-[44px]" target="_blank" rel="noopener noreferrer"
                >
                  {/*
                    THE PAGE'S OWN COLOURS IN THE CIRCLE. A product page can
                    be any colour the creator picks, and the shared light grey
                    with a "?" in it was a bright disc with a question mark on
                    a dark one. The photo, else the initials, else a plain
                    person, on a tenth of the page's text colour.
                  */}
                  <AppAvatar
                    src={creatorAvatarUrl}
                    name={(creatorProfile?.display_name || "").trim()}
                    alt=""
                    size={40}
                    markWhileLoading
                    style={themeColors.textColor ? { backgroundColor: tint(paint(themeColors.textColor, "ink"), "1f"), color: paint(themeColors.textColor, "ink") } : undefined}
                  />
                  <p
                    className="font-medium truncate"
                    style={{ color: paint(themeColors.textColor, "ink") || "var(--foreground)" }}
                  >
                    {personName({ name: creatorProfile?.display_name, username: creatorProfile?.username, slug: creator?.slug })}
                  </p>
                  <CreatorBadges badges={creatorBadgeIds} ink={themeColors.textColor} size={17} className="-ml-1.5" />
                  {/* Not gap-3 away from the name: the chevron belongs to the
                      name, and at the row's gap it read as a third item. */}
                  <ChevronRight
                    aria-hidden
                    className="creator-link-arrow -ml-1 h-4 w-4 shrink-0"
                    style={{ color: paint(themeColors.textColor, "ink") || "var(--foreground)" }}
                  />
                </SmartLink>
                {showRatingNextToSeller && reviewsCount > 0 && (
                  <>
                    <span className="h-4 w-px bg-gray-300 shrink-0" />
                    <div className="flex items-center gap-1 shrink-0">
                      <Star
                        className="h-4 w-4 fill-current"
                        style={{ color: paint(ratingStarColor, "ink") }}
                      />
                      <span
                        className="text-sm"
                        style={{ color: paint(themeColors.cardPriceColor, "ink") || "rgb(156, 163, 175)" }}
                      >
                        {reviewsAverage.toFixed(1)}
                      </span>
                    </div>
                  </>
                )}
              </div>
              <ShareButton productTitle={product.title} productSlug={product.slug} creatorUsername={creatorUsername} pageHost={pageHost} className="shrink-0" />
            </div>
          )}

          {/* Mobile: Price card and Creator info ABOVE description */}
          <div className="mt-6 lg:hidden">
            <div
              className="rounded-xl border p-4 sm:p-6 shadow-sm relative z-20"
              style={{
                backgroundColor: paint(themeColors.cardBackground, "bg") || "var(--card)",
                borderColor: paint(themeColors.cardBorderColor, "line") || "var(--border)",
              }}
            >
              {/* Price display - only show static if no variants */}
              {/* Same one row as the desktop card above. */}
              {variants.length === 0 && (
                <div className="mb-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <div
                    className="text-2xl font-bold"
                    style={{ color: paint(themeColors.cardTextColor, "ink") || "var(--foreground)" }}
                  >
                    {headerPrice.main}
                  </div>
                  {headerPrice.was && (
                    <div className="flex items-center gap-2">
                      <span
                        className="text-base line-through"
                        style={{ color: paint(themeColors.cardPriceColor, "ink") || "var(--muted-foreground)" }}
                      >
                        {headerPrice.was}
                      </span>
                      {headerPrice.off != null && <Badge variant="destructive">{headerPrice.off}% OFF</Badge>}
                    </div>
                  )}
                </div>
              )}

              <PurchaseStatusWrapper
                productId={product.id}
                productType={product.type}
                priceCents={product.price_cents}
                compareAtCents={product.compare_at_cents}
                creatorId={product.creator_id}
                serverHasPurchased={hasPurchased}
                sales={salesView}
                serverAssetId={firstAssetId}
                serverPurchasedVariantIds={purchasedVariantIds}
            serverProductFiles={productDownloadFiles}
                variants={variants}
                callToAction={product.call_to_action}
                buyButtonBgColor={buyButtonColor}
                buyButtonTextColor={buyButtonTextColor}
                downloadButtonBgColor={downloadButtonBgColor}
                downloadButtonTextColor={downloadButtonTextColor}
                themeColors={{
                  cardBackground: themeColors.cardBackground,
                  cardTextColor: themeColors.cardTextColor,
                  cardBorderColor: themeColors.cardBorderColor,
                  cardPriceColor: themeColors.cardPriceColor,
                  accentColor: buyButtonColor || "#000000",
                }}
                showPriceDisplay={variants.length > 0}
                // Pay What You Want settings (product-level)
                payWhatYouWant={(product as any).pay_what_you_want || false}
                pwywMinPriceCents={(product as any).pwyw_min_price_cents || null}
                pwywSuggestedPriceCents={(product as any).pwyw_suggested_price_cents || null}
                membership={membershipInfo}
                purchasedExtraContent={
                  <>
                    <ViewInLibraryButton
                      backgroundColor={themeColors.viewInLibraryBg}
                      textColor={themeColors.viewInLibraryText}
                      borderColor={themeColors.viewInLibraryBorder}
                    />
                    <RefundPolicyDisplay
                      enabled={product.refund_policy_enabled}
                      policyType={product.refund_policy_type}
                      finePrint={product.refund_policy_fine_print}
                      updatedAt={product.refund_policy_updated_at}
                      className="mt-3"
                      textColor={themeColors.cardTextColor}
                      themePreset={themePreset}
                      isDarkTheme={isDarkTheme}
                    />
                  </>
                }
                notPurchasedExtraContent={
                  <>
                    <WishlistButton
                      productId={product.id}
                      isLoggedIn={!!user}
                      backgroundColor={themeColors.cardBackground}
                      textColor={themeColors.cardTextColor}
                      borderColor={themeColors.cardBorderColor}
                      iconColor={themeColors.cardIconColor}
                    />
                    <RefundPolicyDisplay
                      enabled={product.refund_policy_enabled}
                      policyType={product.refund_policy_type}
                      finePrint={product.refund_policy_fine_print}
                      updatedAt={product.refund_policy_updated_at}
                      className="mt-3"
                      textColor={themeColors.cardTextColor}
                      themePreset={themePreset}
                      isDarkTheme={isDarkTheme}
                    />
                  </>
                }
              />

              {includedItems.length > 0 ? (
              <div
                className="mt-4 border-t pt-4"
                style={{ borderColor: paint(themeColors.cardBorderColor, "line") || "var(--border)" }}
              >
                <h3
                  className="font-semibold"
                  style={{ color: paint(themeColors.cardTextColor, "ink") || "var(--foreground)" }}
                >
                  What&apos;s included
                </h3>
                <ul className="mt-3 space-y-2">
                  {includedItems.map((item: string, idx: number) => (
                    <li
                      key={idx}
                      className="flex items-start gap-2 text-sm"
                      style={{ color: paint(themeColors.cardPriceColor, "ink") || "var(--muted-foreground)" }}
                    >
                      {getIncludedItemIcon(item, paint(themeColors.cardIconColor, "ink"))}
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
              ) : null}

              {/*
                =====================================================================
                 NO "8 PEOPLE HAVE PURCHASED THIS"
                =====================================================================
                It sat under What's included on every product page, and on a shop that
                is getting started it is a small number printed in the place a buyer
                looks to decide. Nobody is persuaded by eight, and the ones who are
                reading it are the ones deciding. The sales count is still on the
                product in the app, where it is a fact for the person selling rather
                than a line of copy for the person buying.
              */}
            </div>

            {/* Mobile: Creator info OUTSIDE the card with share button */}
            {creator && (
              <div
                className="mt-4 flex items-center justify-between p-3 rounded-lg border"
                style={{
                  backgroundColor: paint(themeColors.cardBackground, "bg") || "var(--card)",
                  borderColor: paint(themeColors.cardBorderColor, "line") || "var(--border)",
                }}
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  {/* 36px to press (a phone's floor), drawn at the same place: the extra 2px each side are taken back by the margin. */}
                  <SmartLink href={creatorStoreUrl} className="creator-link -my-0.5 flex min-w-0 items-center gap-3 py-0.5" target="_blank" rel="noopener noreferrer">
                    <AppAvatar
                      src={creatorAvatarUrl}
                      name={(creatorProfile?.display_name || "").trim()}
                      alt=""
                      size={32}
                      markWhileLoading
                      style={themeColors.cardTextColor ? { backgroundColor: tint(paint(themeColors.cardTextColor, "ink"), "1f"), color: paint(themeColors.cardTextColor, "ink") } : undefined}
                    />
                    <p
                      className="font-medium truncate text-sm"
                      style={{ color: paint(themeColors.cardTextColor, "ink") || "var(--foreground)" }}
                    >
                      {personName({ name: creatorProfile?.display_name, username: creatorProfile?.username, slug: creator?.slug })}
                    </p>
                    <CreatorBadges badges={creatorBadgeIds} ink={themeColors.cardTextColor} size={15} className="-ml-1.5" />
                    <ChevronRight
                      aria-hidden
                      className="creator-link-arrow -ml-1 h-3.5 w-3.5 shrink-0"
                      style={{ color: paint(themeColors.cardTextColor, "ink") || "var(--foreground)" }}
                    />
                  </SmartLink>
                  {showRatingNextToSeller && reviewsCount > 0 && (
                    <>
                      <span className="h-3.5 w-px bg-gray-300 shrink-0" />
                      <div className="flex items-center gap-1 shrink-0">
                        <Star
                          className="h-3.5 w-3.5 fill-current"
                          style={{ color: paint(ratingStarColor, "ink") }}
                        />
                        <span
                          className="text-xs"
                          style={{ color: paint(themeColors.cardPriceColor, "ink") || "rgb(156, 163, 175)" }}
                        >
                          {reviewsAverage.toFixed(1)}
                        </span>
                      </div>
                    </>
                  )}
                </div>
                <ShareButton
                  productTitle={product.title}
                  productSlug={product.slug}
                  creatorUsername={creatorUsername}
                  pageHost={pageHost}
                  className="-m-0.5 shrink-0 h-9 w-9"
                  iconSize="h-4 w-4"
                />
              </div>
            )}
          </div>

          {product.description && (
            <div className="mt-6" data-description-section>
              <h2
                className="mb-3 text-lg font-semibold"
                style={{ color: paint(themeColors.textColor, "ink") || "var(--foreground)" }}
              >
                Description
              </h2>
              <RichDescriptionContent
                html={product.description}
                textColor={themeColors.textColor ? tint(paint(themeColors.textColor, "ink"), "cc") : "var(--muted-foreground)"}
              />
            </div>
          )}
        </div>

        {/* A course's lessons, counted and timed, its free previews playable here (components/courses/course-outline). */}
        {product.type === "course" && courseModules && courseModules.length > 0 && (
          <div className="mt-8 sm:mt-10">
            <CourseOutline
              modules={courseModules}
              colors={{
                heading: paint(themeColors.textColor, "ink"),
                card: paint(themeColors.cardBackground, "bg"),
                cardBorder: paint(themeColors.cardBorderColor, "line"),
                cardText: paint(themeColors.cardTextColor, "ink"),
                muted: paint(themeColors.cardPriceColor, "ink"),
              }}
            />
          </div>
        )}

        {detailFields.length > 0 ? (
          <div className="mt-8 sm:mt-10" data-details-section>
            <h2
              className="mb-3 text-lg font-semibold"
              style={{ color: paint(themeColors.textColor, "ink") || "var(--foreground)" }}
            >
              Details
            </h2>
            <dl className="divide-y" style={{ borderColor: paint(themeColors.faqBorderColor, "line") || "var(--border)" }}>
              {detailFields.map((f) => (
                <div key={f.key} className="grid gap-1 py-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] sm:gap-4" style={{ borderColor: paint(themeColors.faqBorderColor, "line") || "var(--border)" }}>
                  <dt className="text-sm font-medium" style={{ color: paint(themeColors.textColor, "ink") || "var(--foreground)" }}>{f.label}</dt>
                  <dd className="whitespace-pre-line text-sm" style={{ color: themeColors.textColor ? tint(paint(themeColors.textColor, "ink"), "cc") : "var(--muted-foreground)" }}>
                    {f.type === "url" ? (
                      <a href={f.value} target="_blank" rel="nofollow noopener noreferrer" className="break-all underline underline-offset-2">{f.value.replace(/^https?:\/\//, "")}</a>
                    ) : (
                      f.value
                    )}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        ) : null}

        {displayFaqs.length > 0 ? (
        <div className="mt-8 sm:mt-10" data-faq-section>
          <h2
            className="mb-4 text-lg font-semibold"
            style={{ color: paint(themeColors.faqTextColor, "ink") || "var(--foreground)" }}
          >
            Frequently Asked Questions
          </h2>

          {/* Mobile: add a tiny inner gutter so FAQ isn't edge-to-edge */}
          <div className="px-2 sm:px-0">
            <Accordion type="single" collapsible className="w-full">
              {displayFaqs.map((faq: { question: string; answer: string }, idx: number) => (
                <AccordionItem
                  key={`faq-${idx}`}
                  value={`item-${idx}`}
                  style={{ borderColor: paint(themeColors.faqBorderColor, "line") || "var(--border)" }}
                >
                  <AccordionTrigger
                    className="min-h-[44px] text-left"
                    style={{ color: paint(themeColors.faqTextColor, "ink") || "var(--foreground)" }}
                  >
                    {faq.question}
                  </AccordionTrigger>
                  <AccordionContent style={{ color: themeColors.faqTextColor ? tint(paint(themeColors.faqTextColor, "ink"), "cc") : "var(--muted-foreground)" }}>
                    {faq.answer}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </div>
        ) : null}
      </div>

      {/*
        =====================================================================
         IT STAYS WHERE IT IS
        =====================================================================
        This card followed the page down for three rounds and has been taken
        off that for good. Sticking needed the column stretched, the
        questions moved into a grid row of their own to bound the travel, and
        the creator bar publishing its own measured height so the card could
        pin clear of it. All of that existed to serve the sticking, and all
        of it has gone with it.

        The card sits at the top of its column and the page scrolls past it.
      */}
      <div className="hidden lg:block lg:col-span-2">
        <div
          className="rounded-xl border p-6 shadow-sm relative z-20"
          style={{
            backgroundColor: paint(themeColors.cardBackground, "bg") || "var(--card)",
            borderColor: paint(themeColors.cardBorderColor, "line") || "var(--border)",
          }}
        >
          {/*
            WHAT YOU ARE BUYING, ABOVE WHAT IT COSTS. The card opened on a
            price with nothing attached to it.

            AND IT IS THE <h1> AT THIS WIDTH. It was a <p> while the big
            title under the gallery was still there, because two headings of
            the same words a column apart is a duplicate to anything reading
            the page out loud. That one is `lg:hidden` now, so this is the
            only title on a desktop and it carries the tag.

            35px at 600, written as a number rather than as a size step: the
            class below text-4xl is text-3xl at 30px, and the ask was one
            pixel, not six.

            It has been 14, 20, 24, 30 and 36, and for most of those
            it sat under a bigger price — where a title reads as a caption on
            a number rather than as the name of the thing being bought. It is
            the biggest line on the card now, clear of the 24px price under
            it, which is the order somebody reads this in: what it is, then
            what it costs.
          */}
          <h1
            className="mb-2 text-[35px] font-semibold leading-snug break-words"
            style={{ color: paint(themeColors.cardTextColor, "ink") || "var(--foreground)" }}
          >
            {product.title}
          </h1>

          {/* Price display - only show static if no variants */}
          {variants.length === 0 && (
            <div className="mb-4">
              {/* 24px. It has been 30 and then 36, and at both it was the
                  biggest thing on the card — which made the product's own
                  name a label on a price rather than the other way round.
                  Still bold, still the only number here, and no longer the
                  first thing the eye lands on. */}
              {/*
                ONE ROW: WHAT IT COSTS, WHAT IT COST, AND HOW MUCH OFF.

                The old price and the badge were a second line under the
                price, which made a discount read as a footnote to it. Side by
                side they are one fact — this costs less than it did, by this
                much — and the card is a line shorter for it.

                `items-baseline` so the two prices sit on the same baseline
                whatever their sizes; the badge is centred against the old
                price inside its own box, because a badge on a text baseline
                hangs. `flex-wrap` with a row gap so a long pair drops
                cleanly at narrow widths instead of overflowing.
              */}
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <div
                  className="text-2xl font-bold tracking-tight"
                  style={{ color: paint(themeColors.cardTextColor, "ink") || "var(--foreground)" }}
                >
                  {headerPrice.main}
                </div>
                {headerPrice.was && (
                  <div className="flex items-center gap-2">
                    <span
                      className="text-base line-through"
                      style={{ color: paint(themeColors.cardPriceColor, "ink") || "var(--muted-foreground)" }}
                    >
                      {headerPrice.was}
                    </span>
                    {headerPrice.off != null && <Badge variant="destructive">{headerPrice.off}% OFF</Badge>}
                  </div>
                )}
              </div>
            </div>
          )}

          <PurchaseStatusWrapper
            productId={product.id}
            productType={product.type}
            priceCents={product.price_cents}
            compareAtCents={product.compare_at_cents}
            creatorId={product.creator_id}
            serverHasPurchased={hasPurchased}
            sales={salesView}
            serverAssetId={firstAssetId}
            serverPurchasedVariantIds={purchasedVariantIds}
            serverProductFiles={productDownloadFiles}
            variants={variants}
            callToAction={product.call_to_action}
            buyButtonBgColor={buyButtonColor}
            buyButtonTextColor={buyButtonTextColor}
            downloadButtonBgColor={downloadButtonBgColor}
            downloadButtonTextColor={downloadButtonTextColor}
            themeColors={{
              cardBackground: themeColors.cardBackground,
              cardTextColor: themeColors.cardTextColor,
              cardBorderColor: themeColors.cardBorderColor,
              cardPriceColor: themeColors.cardPriceColor,
              accentColor: buyButtonColor || "#000000",
            }}
            showPriceDisplay={variants.length > 0}
            // Pay What You Want settings (product-level)
            payWhatYouWant={(product as any).pay_what_you_want || false}
            pwywMinPriceCents={(product as any).pwyw_min_price_cents || null}
            pwywSuggestedPriceCents={(product as any).pwyw_suggested_price_cents || null}
            membership={membershipInfo}
            purchasedExtraContent={
              <>
                <ViewInLibraryButton
                  backgroundColor={themeColors.viewInLibraryBg}
                  textColor={themeColors.viewInLibraryText}
                  borderColor={themeColors.viewInLibraryBorder}
                />
                <RefundPolicyDisplay
                  enabled={product.refund_policy_enabled}
                  policyType={product.refund_policy_type}
                  finePrint={product.refund_policy_fine_print}
                  updatedAt={product.refund_policy_updated_at}
                  className="mt-3"
                  textColor={themeColors.cardTextColor}
                  themePreset={themePreset}
                  isDarkTheme={isDarkTheme}
                />
              </>
            }
            notPurchasedExtraContent={
              <>
                <WishlistButton
                  productId={product.id}
                  isLoggedIn={!!user}
                  backgroundColor={themeColors.cardBackground}
                  textColor={themeColors.cardTextColor}
                  borderColor={themeColors.cardBorderColor}
                  iconColor={themeColors.cardIconColor}
                />
                <RefundPolicyDisplay
                  enabled={product.refund_policy_enabled}
                  policyType={product.refund_policy_type}
                  finePrint={product.refund_policy_fine_print}
                  updatedAt={product.refund_policy_updated_at}
                  className="mt-3"
                  textColor={themeColors.cardTextColor}
                  themePreset={themePreset}
                  isDarkTheme={isDarkTheme}
                />
              </>
            }
          />

          {includedItems.length > 0 ? (
          <div
            className="mt-4 border-t pt-4"
            style={{ borderColor: paint(themeColors.cardBorderColor, "line") || "var(--border)" }}
          >
            <h3
              className="font-semibold"
              style={{ color: paint(themeColors.cardTextColor, "ink") || "var(--foreground)" }}
            >
              What&apos;s included
            </h3>
            <ul className="mt-3 space-y-2">
              {includedItems.map((item: string, idx: number) => (
                <li
                  key={idx}
                  className="flex items-start gap-2 text-sm"
                  style={{ color: paint(themeColors.cardPriceColor, "ink") || "var(--muted-foreground)" }}
                >
                  {getIncludedItemIcon(item, paint(themeColors.cardIconColor, "ink"))}
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
          ) : null}

        </div>
      </div>
    </div>
    </div>
  )

  // ---------------------------------------------------------------------------
  // JSON-LD Structured Data
  // ---------------------------------------------------------------------------
  /* Built before either layout is chosen: a product whose creator arranged its
     page was drawn with no structured data at all, so it could never show a
     price or a rating in a search result. Both layouts print it now. */
  /* The same address the canonical tag declares, so the structured data and
     the <link> cannot disagree about which URL this product lives at. */
  const canonicalUrl = getProductShareUrl(creatorUsername, product.slug, pageHost)
  const sellerDisplayName = personName({ name: creatorProfile?.display_name || creator?.name, username: creatorProfile?.username, slug: creator?.slug })

  /*
    THE CATEGORY PAGE THE PRODUCT IS LISTED ON. The breadcrumb pointed at
    /explore?category=<a slug of the old categories table>, an address no page
    answers; /explore/<id> is the page, the one the sitemap lists. The id is
    the product's category as Explore reads it (lib/marketplace/categories),
    and a category with no page of its own is left out of the trail.
  */
  const primaryCategory = productCategories[0] || null
  const exploreIdOf = (value: unknown): string | null => {
    const key = typeof value === "string" ? value.toLowerCase().trim() : ""
    const id = DB_CATEGORY_TO_ID[key] ?? key
    return hasCategoryPage(id) ? id : null
  }
  const exploreCategory = exploreIdOf(product.category) ?? exploreIdOf(primaryCategory?.slug)

  const productJsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.title,
    /* Schema.org's description is plain text too, and this one is read by
       the thing that draws a search result. */
    description: plainSummary(product.description, 5000) || undefined,
    sku: product.id,
    image: imagesOnly(product.gallery_urls ?? []).length
      ? imagesOnly(product.gallery_urls ?? [])
      : product.thumbnail_url
        ? [product.thumbnail_url]
        : undefined,
    url: canonicalUrl,
    inLanguage: "en",
    brand: {
      "@type": "Brand",
      name: sellerDisplayName,
    },
    ...(reviewsCount > 0 && {
      aggregateRating: {
        "@type": "AggregateRating",
        ratingValue: reviewsAverage.toFixed(1),
        reviewCount: reviewsCount,
      },
    }),
    offers: {
      "@type": "Offer",
      price: product.price_cents === 0 ? "0" : (product.price_cents / 100).toFixed(2),
      priceCurrency: storeCurrency,
      /* Sold out when its stock is counted and none is left: the shop's own rule. */
      availability: soldOut(product) || salesView?.soldOut ? "https://schema.org/OutOfStock" : "https://schema.org/InStock",
      url: canonicalUrl,
      seller: {
        "@type": "Person",
        name: sellerDisplayName,
      },
    },
  }

  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "Explore",
        item: "https://storelib.com/explore",
      },
      ...(exploreCategory
        ? [
            {
              "@type": "ListItem",
              position: 2,
              name: categoryLabel(exploreCategory),
              item: `https://storelib.com${categoryPath(exploreCategory)}`,
            },
            {
              "@type": "ListItem",
              position: 3,
              name: product.title,
            },
          ]
        : [
            {
              "@type": "ListItem",
              position: 2,
              name: product.title,
            },
          ]),
    ],
  }

  // ---------------------------------------------------------------------------
  // Render with custom config if it exists
  // ---------------------------------------------------------------------------
  if (themedSections && themedSections.length > 0 && productPageConfig) {
    // Get creator bar and sticky add to cart settings from published config
    // Use optional chaining to prevent server-side exceptions
    const headerSettings = productPageConfig?.headerSettings as ProductHeaderSettings | undefined
    /**
     * ONE BAR, TWO PAGES.
     *
     * The strip across the top of a product page and the strip across the top
     * of the creator page are the same object in a visitor's head, and they
     * were two unrelated settings blocks: editing the bar on the creator page
     * changed nothing here, and the scheme painted one and not the other.
     *
     * `resolveStorefrontChrome` is what the creator page uses, given the SHOP
     * config's stored bar — so the four colours are decided in one place, by
     * one rule, and the creator's own choices win in both.
     */
    const shopChrome = resolveStorefrontChrome(
      (shopConfig?.published_config?.globalSettings as { themePreset?: string } | undefined)?.themePreset,
      {
        bar: {
          backgroundColor:
            shopHeaderSettings?.subscribeBar?.colors?.backgroundColor ||
            (shopHeaderSettings?.subscribeBar as Record<string, string> | undefined)?.backgroundColor,
          textColor:
            shopHeaderSettings?.subscribeBar?.colors?.textColor ||
            (shopHeaderSettings?.subscribeBar as Record<string, string> | undefined)?.textColor,
          buttonColor: shopHeaderSettings?.subscribeBar?.buttonColor,
          buttonTextColor: shopHeaderSettings?.subscribeBar?.buttonTextColor,
          /** The same record the creator page reads; see the note there. */
          chosen: shopHeaderSettings?.subscribeBar?.colorChoices,
        },
      },
    )
    const storedCreatorBar = headerSettings?.creatorBar || defaultProductCreatorBarSettings
    const creatorBarSettings: typeof storedCreatorBar = {
      ...storedCreatorBar,
      backgroundColor: shopChrome.bar.backgroundColor,
      textColor: shopChrome.bar.textColor,
      buttonColor: shopChrome.bar.buttonColor,
      buttonTextColor: shopChrome.bar.buttonTextColor,
    }
    /** The label the creator typed on their own page, when they typed one. */
    const creatorBarLabel =
      shopHeaderSettings?.subscribeBar?.buttonTextPreset === "custom"
        ? shopHeaderSettings?.subscribeBar?.buttonText
        : undefined
    const stickyAddToCartSettings = headerSettings?.stickyAddToCart || defaultStickyAddToCartSettings
    // Get theme colors from published config
    /* On a dark scheme the scheme's own page colour unless one was chosen (product-page-tone). */
    const pageBackgroundColor = tonePageBackground
    const pageTextColor = themeColors.textColor

    return (
      <div
        /*
          NO ARRIVAL FADE, AND THIS IS WHY.
        
          `.app-page-enter` animates this element from opacity 0 over 380ms. On a
          page that fills the window that means the first painted frame of a
          product page is the BODY behind it, which is white, and the page then
          fades up out of it. Filmed on production over a real navigation: the
          first frame measured 97% white pixels and stayed above 82% for the next
          120ms before anything was legible.
        
          That is the flash. Not the navigation — which keeps the previous page on
          screen until this one is ready — but the fade this page runs once it
          gets there. It arrives complete now: text, prices and the grey boxes the
          pictures decode into, all at full opacity on the first frame.
        
          The rule stays for the /app pages it was written for, where the content
          is a panel on a background of its own colour with nothing to fade up
          out of.
        */
        className="min-h-screen w-full"
        style={{
          background: paint(pageBackgroundColor, "page") || "var(--background)",
          color: paint(pageTextColor, "ink") || "var(--foreground)",
        }}
        /*
          An arranged page is the creator's design: it keeps its colours in the person's dark look (lib/appearance, round
          30). Round 31: a template that holds only Storelib's own sections (Reviews, More from) is not arranged
          (productHasOwnLook), and is drawn in the person's look like the page with no template at all.
        */
        data-own-look={ownLook ? "" : undefined}
        data-product-look={ownLook ? undefined : "site"}
      >
        <SitePaintProvider on={!ownLook}>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLdScript(productJsonLd) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLdScript(breadcrumbJsonLd) }}
        />
        <TrackView type="product" creatorId={product.creator_id} productId={product.id} />
      <StoreTracking creatorId={product.creator_id} productId={product.id} />
        <DynamicFavicon
          avatarUrl={creatorAvatarUrl}
          faviconUrl={productPageConfig?.headerSettings?.faviconUrl}
        />
        {/* Where this visit came from, for an order or a sign-up that starts here (lib/attribution). */}
        <CaptureTouch creatorId={product.creator_id} property="creator_page" />

        {/* Creator Bar - sticky on scroll, offset below header in Capacitor apps */}
        <DiscoverStickyWrapper>
          <LiveProductCreatorBar
            settings={creatorBarSettings}
            creatorName={personName({ name: creatorProfile?.display_name || creator?.name, username: creatorProfile?.username, slug: creator?.slug })}
            creatorId={product.creator_id}
            creatorUsername={creatorUsername}
            avatarUrl={creatorAvatarUrl}
            buttonLabel={creatorBarLabel}
            /* The phone's bar is the product's; the desktop bar keeps the
               creator and now carries their line too. See the bar. */
            productTitle={product.title}
            productSlug={product.slug}
          />
        </DiscoverStickyWrapper>

        {/* Sticky Add to Cart - appears on scroll - ALWAYS SHOW */}
        {stickyAddToCartSettings.visible && (
          <LiveStickyAddToCart
            settings={stickyAddToCartSettings}
            product={{
              id: product.id,
              slug: product.slug,
              title: product.title,
              /* The picture the page leads with, not the raw thumbnail
                 column: gallery_urls wins when there is one, and YouTube
                 poster URLs are already filtered out of it. */
              thumbnail_url: imagesOnly(galleryImages)[0] || product.thumbnail_url || null,
              price_cents: product.price_cents,
              compare_at_cents: product.compare_at_cents,
              type: product.type,
              price_interval: membershipInfo?.interval ?? null,
              reviews_count: reviewsCount,
              reviews_average: reviewsAverage,
            }}
            creatorId={product.creator_id}
            isPurchased={hasPurchased}
            soldOut={salesView?.soldOut ?? false}
            downloadFiles={productDownloadFiles}
          />
        )}

        {/* The buy bar's reserve is at the END of the page, not here — see the
            note on the other branch's wrapper. */}
        <div className="mx-auto w-full max-w-[1200px] px-3 sm:px-4 lg:px-6 py-6 sm:py-12 lg:pt-6">
          {AlertsBlock}
          {MainProductContent}
        </div>

        {/* Render sections that are NOT reviews or more-from-seller */}
        {themedSections
          .filter((section: any) => section.type !== "reviews" && section.type !== "more-from-seller")
          .map((section: any) => (
            <SectionRenderer
              key={section.id}
              section={section}
              products={currentProductData}
              moreFromSellerProducts={moreProductsData}
              creatorName={creatorProfile?.display_name || creator?.name || "this creator"}
              productId={product.id}
              reviews={reviews || []}
              reviewsCount={reviewsCount}
              reviewsAverage={reviewsAverage}
              globalSettings={productPageConfig?.globalSettings}
            />
          ))}

        {/* ALWAYS render More from Seller with fresh theme colors - ensures theme preset is always applied */}
        {moreProductsData.length > 0 && (
          <SectionRenderer
            section={moreFromSellerSection}
            products={currentProductData}
            moreFromSellerProducts={moreProductsData}
            creatorName={creatorProfile?.display_name || creator?.name || "this creator"}
          />
        )}

        {/* ALWAYS render Reviews with fresh theme colors - ensures theme preset is always applied */}
        {reviewsCount > 0 && (() => {
          const reviewsSectionRaw: Section = {
            id: "reviews-themed",
            type: "reviews",
            settings: {
              ...defaultReviewsSettings,
              visible: true,
            },
            order: 998,
          }
          const themedReviewsSection = applySectionThemeColors([reviewsSectionRaw])[0]
          return (
            <SectionRenderer
              section={themedReviewsSection}
              productId={product.id}
              reviews={reviews || []}
              reviewsCount={reviewsCount}
              reviewsAverage={reviewsAverage}
            />
          )
        })()}

        {/* About section with payment methods for product pages */}
        <ProductAboutSection
          textColor={pageTextColor}
          backgroundColor={pageBackgroundColor}
        />

        {/* The room the fixed buy bar needs, at the bottom of the page where
          the bar is. `sticky-buy-reserve` is zero on a desktop, where the bar
          is part of the flow rather than over it. */}
      {/*
        ═══════════════════════════════════════════════════════════════════
         NO RESERVE AT THE END, BECAUSE THE BAR IS NOT THERE
        ═══════════════════════════════════════════════════════════════════
        There was an 80px spacer here holding room for the fixed buy bar.
        The bar hides itself before the footer:

            const nearFooter = currentBottom > footerTop - 100
            const shouldShow = pastDescriptionStart && !nearFooter

        so by the time anybody reaches the bottom of the page the bar has
        gone, and the spacer was 80px of empty page colour under the footer
        with nothing over it. Reported with a screenshot of exactly that.

        The bar still cannot cover anything: it disappears a hundred pixels
        before the footer arrives, which is the reserve, done by the thing
        that knows whether it is on screen.
      */}
      <SellerFooter />
        </SitePaintProvider>
      </div>
    )
  }

  // ---------------------------------------------------------------------------
  // Default rendering when no custom config
  // Apply theme colors to page background
  // ---------------------------------------------------------------------------
  const defaultPageBackgroundColor = themeConfig?.colors?.background || productPageConfig?.globalColors?.backgroundColor
  const defaultPageTextColor = themeColors.textColor

  return (
    <div
      /* No arrival fade; see the note on the other root above. */
      className="min-h-screen w-full"
      style={{
        background: paint(defaultPageBackgroundColor, "page") || "var(--background)",
        color: paint(defaultPageTextColor, "ink") || "var(--foreground)",
      }}
      /*
        ROUND 30: whose look this is. A scheme or colours of the creator's own keep them in the person's dark look
        (data-own-look: app/theme-dark.css leaves it out, round 31, while the Storelib header above it and the sheets it
        opens follow the person); the platform's default page is Storelib's, drawn in the person's look
        (data-product-look="site", app/theme-dark.css, and its inline colours painted: lib/appearance/site-paint).
      */
      data-own-look={ownLook ? "" : undefined}
      data-product-look={ownLook ? undefined : "site"}
    >
      <SitePaintProvider on={!ownLook}>
      {/*
        INSIDE THE WORKSPACE'S CANVAS, this page is reached by clicking a card
        on the creator page above it. Two things it needs there and nowhere
        else: its own links keep the flag that makes them framable, and there
        is a way back, because the frame has no browser chrome around it and
        the workspace's own bar belongs to the creator page rather than to
        this one.
      */}
      {inEditorCanvas && (
        <>
          <EmbeddedNavigation />
          <EmbeddedBackBar />
        </>
      )}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(productJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(breadcrumbJsonLd) }}
      />
      <TrackView type="product" creatorId={product.creator_id} productId={product.id} />
      <StoreTracking creatorId={product.creator_id} productId={product.id} />
      {creatorAvatarPreload && (
        <link rel="preload" as="image" href={creatorAvatarPreload} fetchPriority="high" />
      )}
      <DynamicFavicon avatarUrl={creatorAvatarUrl} />
      <CaptureTouch creatorId={product.creator_id} property="creator_page" />

      {/* Creator Bar - sticky on scroll, offset below header in Capacitor apps */}
      <DiscoverStickyWrapper>
        <LiveProductCreatorBar
          settings={defaultProductCreatorBarSettings}
          creatorName={personName({ name: creatorProfile?.display_name || creator?.name, username: creatorProfile?.username, slug: creator?.slug })}
          creatorId={product.creator_id}
          creatorUsername={creatorUsername}
          avatarUrl={creatorAvatarUrl}
          /* The phone's bar is the product's; the desktop bar keeps the
             creator and now carries their line too. See the bar. */
          productTitle={product.title}
          productSlug={product.slug}
        />
      </DiscoverStickyWrapper>

      {/* Sticky Add to Cart - appears on scroll - ALWAYS SHOW */}
      <LiveStickyAddToCart
          settings={defaultStickyAddToCartSettings}
          product={{
            id: product.id,
            slug: product.slug,
            title: product.title,
            thumbnail_url: imagesOnly(galleryImages)[0] || product.thumbnail_url || null,
            price_cents: product.price_cents,
            compare_at_cents: product.compare_at_cents,
            type: product.type,
            price_interval: membershipInfo?.interval ?? null,
            reviews_count: reviewsCount,
            reviews_average: reviewsAverage,
          }}
          creatorId={product.creator_id}
          isPurchased={hasPurchased}
          soldOut={salesView?.soldOut ?? false}
          downloadFiles={productDownloadFiles}
        />

      {/*
        =====================================================================
         THE ADD-TO-CART BAR IS RESERVED FOR AT THE END, NOT IN THE MIDDLE
        =====================================================================
        This carried `pb-24` so the buy bar would not cover the bottom of the
        page. The bar is `position: fixed`, so it floats over everything at
        the bottom of the SCREEN — but this wrapper is not the bottom of the
        page. More from the seller, the reviews and the footer all come after
        it, so the reserve was a 96px hole between the FAQ and the next
        section and the actual end of the page was still under the bar.

        The reserve moved to the end of the page, where the thing it is
        reserving for actually sits. Ordinary section spacing here now.
      */}
      {/* 1200, like the block above it and like every section below it. It
          was 1100 here, so the page changed width halfway down. */}
      <div className="mx-auto w-full max-w-[1200px] px-3 sm:px-4 lg:px-6 py-6 sm:py-12 lg:pt-6">
        {AlertsBlock}
        {MainProductContent}
      </div>

      {/* More from seller section renders full-width */}
      {moreProductsData.length > 0 && (
        <SectionRenderer
          section={moreFromSellerSection}
          products={currentProductData}
          moreFromSellerProducts={moreProductsData}
          creatorName={creatorProfile?.display_name || creator?.name || "this creator"}
        />
      )}

      {/* Default reviews section if there are reviews - apply theme colors */}
      {reviewsCount > 0 && (() => {
        // Create the reviews section with proper defaults
        const reviewsSectionRaw: Section = {
          id: "default-reviews",
          type: "reviews",
          settings: {
            ...defaultReviewsSettings,
            visible: true,
          },
          order: 0,
        }
        // Apply theme colors to the reviews section
        const themedReviewsSection = applySectionThemeColors([reviewsSectionRaw])[0]

        return (
          <SectionRenderer
            section={themedReviewsSection}
            productId={product.id}
            reviews={reviews || []}
            reviewsCount={reviewsCount}
            reviewsAverage={reviewsAverage}
          />
        )
      })()}

      {/* About section with payment methods for product pages */}
      <ProductAboutSection
        textColor={defaultPageTextColor}
        backgroundColor={defaultPageBackgroundColor}
      />

      {/* The room the fixed buy bar needs, at the bottom of the page where
          the bar is. `sticky-buy-reserve` is zero on a desktop, where the bar
          is part of the flow rather than over it. */}
      {/*
        ═══════════════════════════════════════════════════════════════════
         NO RESERVE AT THE END, BECAUSE THE BAR IS NOT THERE
        ═══════════════════════════════════════════════════════════════════
        There was an 80px spacer here holding room for the fixed buy bar.
        The bar hides itself before the footer:

            const nearFooter = currentBottom > footerTop - 100
            const shouldShow = pastDescriptionStart && !nearFooter

        so by the time anybody reaches the bottom of the page the bar has
        gone, and the spacer was 80px of empty page colour under the footer
        with nothing over it. Reported with a screenshot of exactly that.

        The bar still cannot cover anything: it disappears a hundred pixels
        before the footer arrives, which is the reserve, done by the thing
        that knows whether it is on screen.
      */}
      <SellerFooter />
      </SitePaintProvider>
    </div>
  )
}

/** A download's standing under its sales limit, read with the server's own client (product_sales_status is server only). Null for no limit, and whenever it cannot be read. */
async function readSalesStanding(productId: string) {
  try {
    return await salesStanding(createAdminClient(), productId)
  } catch {
    return null
  }
}
