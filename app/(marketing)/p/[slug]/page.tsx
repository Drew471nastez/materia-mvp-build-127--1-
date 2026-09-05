import { notFound, redirect } from "next/navigation"
import Link from "next/link"
import { createClient } from "@/lib/supabase/server"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Check, ArrowRight, CheckCircle, Download, Files, Infinity, Star, Heart } from "lucide-react"
import { BuyButton } from "@/components/checkout/buy-button"
import { PurchaseStatusWrapper } from "@/components/checkout/purchase-status-wrapper"
import { ViewInLibraryButton } from "@/components/checkout/view-in-library-button"
import { ProductGallery } from "@/components/product/product-gallery"
import { DiscoverBackBreadcrumb } from "@/components/product/discover-back-breadcrumb"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { DownloadButton } from "@/components/download-button"
import { TrackView } from "@/components/analytics/track-view"
import { SectionRenderer, type ProductData } from "@/components/store-builder/section-renderer"
import { ProductAboutSection } from "@/components/store-builder/unified-section-renderer"
import { DynamicFavicon } from "@/components/store-builder/dynamic-favicon"
import { LiveProductCreatorBar } from "@/components/store-builder/product-creator-bar"
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
import { CreatorQuickNav } from "@/components/creator-quick-nav"
import { WishlistButton } from "@/components/wishlist/wishlist-button"
import { RefundPolicyDisplay } from "@/components/product/refund-policy-display"
import { getStoreUrl } from "@/lib/url-helpers"
import { SmartLink } from "@/components/smart-link"
import { RichDescriptionContent } from "@/components/store-builder/description-rich-editor"

import { themePresets } from "@/lib/store-builder/defaults"

// Icon mapping for what's included items
function getIncludedItemIcon(item: string, iconColor?: string) {
  const lowerItem = item.toLowerCase()
  const colorStyle = iconColor ? { color: iconColor } : undefined
  const defaultClass = iconColor ? "h-4 w-4 mt-0.5 shrink-0" : "h-4 w-4 mt-0.5 shrink-0 text-black"

  if (lowerItem.includes("instant") || lowerItem.includes("download")) {
    return <Download className={defaultClass} style={colorStyle} />
  }
  if (lowerItem.includes("files") || lowerItem.includes("included")) {
    return <Files className={defaultClass} style={colorStyle} />
  }
  if (lowerItem.includes("lifetime") || lowerItem.includes("access")) {
    return <Infinity className={defaultClass} style={colorStyle} />
  }
  // For check icon, use iconColor if provided, otherwise default green
  const checkClass = iconColor ? "h-4 w-4 mt-0.5 shrink-0" : "h-4 w-4 mt-0.5 shrink-0 text-green-600"
  return <Check className={checkClass} style={colorStyle} />
}

export const dynamic = "force-dynamic"

interface ProductPageProps {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ purchase?: string; already_owned?: string; src?: string; layout?: string; recommended?: string }>
}

export async function generateMetadata({ params }: ProductPageProps) {
  const { slug } = await params
  const supabase = await createClient()

  // First, try to find product by current slug
  let { data: product } = await supabase
    .from("products")
    .select("title, description, creator_id, slug, thumbnail_url, gallery_urls")
    .eq("slug", slug)
    .eq("status", "published")
    .maybeSingle()

  // If not found, check slug history
  if (!product) {
    const { data: slugHistory } = await supabase
      .from("product_slug_history")
      .select(`
        product_id,
        products!inner (
          title,
          description,
          creator_id,
          slug,
          status,
          thumbnail_url,
          gallery_urls
        )
      `)
      .eq("old_slug", slug)
      .maybeSingle()

    if (slugHistory?.products && (slugHistory.products as any).status === "published") {
      product = slugHistory.products as any
    }
  }

  if (!product) {
    return { title: "Product Not Found" }
  }

  // Fetch creator's display name and published config for favicon
  let sellerName: string | undefined
  let faviconUrl: string | undefined
  if (product.creator_id) {
    // Fetch seller name: creators → profiles.display_name / full_name
    const { data: creator } = await supabase
      .from("creators")
      .select("user_id, display_name")
      .eq("id", product.creator_id)
      .maybeSingle()

    if (creator) {
      sellerName = creator.display_name || undefined
      if (!sellerName && creator.user_id) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("display_name, full_name")
          .eq("id", creator.user_id)
          .maybeSingle()
        sellerName = profile?.display_name || profile?.full_name || undefined
      }
    }

    const { getPublishedConfig } = await import("@/lib/store-builder/get-published-config")
    const publishedConfig = await getPublishedConfig(product.creator_id, "shop")
    const headerSettings = publishedConfig?.headerSettings as ShopHeaderSettings | undefined
    faviconUrl = headerSettings?.faviconUrl || undefined
  }

  // Determine the social preview image: first gallery image → thumbnail
  const galleryUrls = product.gallery_urls as string[] | null
  const socialImage = galleryUrls?.[0] || product.thumbnail_url || undefined

  // Title: "Product Name | Seller Name" (template adds "| Storelib")
  const tabTitle = sellerName ? `${product.title} | ${sellerName}` : product.title
  const ogTitle = `${product.title} | ${sellerName || "Storelib"}`
  const pageDescription = product.description || "Check out this product on Storelib"

  return {
    title: tabTitle,
    description: pageDescription,
    openGraph: {
      title: ogTitle,
      description: pageDescription,
      type: "website",
      siteName: "Storelib",
      url: `https://storelib.com/p/${product.slug}`,
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
      canonical: `https://storelib.com/p/${product.slug}`,
    },
    robots: { index: true, follow: true, googleBot: { index: true, follow: true, "max-image-preview": "large" as const } },
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
  const { purchase, already_owned, src, layout, recommended } = await searchParams
  const showDiscoverBreadcrumb = recommended === "1"
  const supabase = await createClient()

  // First, try to find product by current slug
  let { data: product, error: productError } = await supabase
    .from("products")
    .select(`
      *,
      product_categories (
        category_id,
        category:categories (
          id,
          name,
          slug,
          type
        )
      )
    `)
    .eq("slug", slug)
    .eq("status", "published")
    .maybeSingle()

  // If not found by current slug, check slug history for redirects
  if (!product) {
    const { data: slugHistory } = await supabase
      .from("product_slug_history")
      .select(`
        product_id,
        products!inner (
          id,
          slug,
          status
        )
      `)
      .eq("old_slug", slug)
      .maybeSingle()

    if (slugHistory?.products && (slugHistory.products as any).status === "published") {
      // Found in history - 301 redirect to current slug
      const currentSlug = (slugHistory.products as any).slug
      redirect(`/p/${currentSlug}`)
    }
  }

  if (productError || !product) {
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
  const [
    { data: creator },
    { data: shopConfig },
    { data: defaultTemplate },
    { data: specificConfig },
  ] = await Promise.all([
    supabase.from("creators").select("*").eq("id", product.creator_id).maybeSingle(),
    supabase
      .from("store_builder_configs")
      .select("published_config")
      .eq("creator_id", product.creator_id)
      .eq("page_type", "shop")
      .maybeSingle(),
    supabase
      .from("store_builder_configs")
      .select("published_config")
      .eq("creator_id", product.creator_id)
      .eq("page_type", "product")
      .maybeSingle(),
    supabase
      .from("product_page_configs")
      .select("published_config")
      .eq("creator_id", product.creator_id)
      .eq("product_id", product.id)
      .maybeSingle(),
  ])

  let creatorProfile: any = null
  if (creator?.user_id) {
    const { data: profile } = await supabase.from("profiles").select("*").eq("id", creator.user_id).maybeSingle()
    creatorProfile = profile
  }

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
  // Extract new toggle settings
  // Show Sales Announcement from Store Builder setting (global store preference)
  const storeBuilderShowSalesAnnouncement =
    (productPageConfig?.headerSettings as ProductHeaderSettings | undefined)?.showSalesAnnouncement ?? false
  // Product-level show_sales_badge setting (from product Settings tab)
  // This is the per-product control
  const productExplicitlyOn = product.show_sales_badge === true
  const productExplicitlyOff = product.show_sales_badge === false
  // Combined logic for showing sales count:
  // 1. If product setting is explicitly ON → always show
  // 2. If product setting is explicitly OFF → never show
  // 3. If product setting is not set → follow Store Builder setting
  const showSalesAnnouncement = productExplicitlyOn || (storeBuilderShowSalesAnnouncement && !productExplicitlyOff)
  const showRatingNextToSeller =
    (productPageConfig?.headerSettings as ProductHeaderSettings | undefined)?.showRatingNextToSeller ?? true

  // Extract theme colors from config
  const headerSettings = productPageConfig?.headerSettings as any

  // Get theme preset from global settings
  const themePreset = productPageConfig?.globalSettings?.themePreset || "default"
  const themeConfig = themePresets[themePreset as keyof typeof themePresets]

  // Determine if this is a dark/colorful theme
  const isColorfulTheme = false // No more colorful themes
  const isDarkTheme = ["astrid"].includes(themePreset)

  // CRITICAL: Theme colors ALWAYS come from the theme preset to ensure global consistency
  // This ensures that when a theme preset is applied on any product page, ALL products get the same colors
  const themeColors = {
    // Page and text colors - prioritize theme preset, then globalColors, then fallback
    pageBackground: themeConfig?.sections?.pageBackgroundColor || productPageConfig?.globalColors?.backgroundColor || "var(--background)",
    textColor: themeConfig?.colors?.foreground || headerSettings?.colors?.textColor || "inherit",
    // FAQ section colors - ALWAYS from theme preset for global consistency
    faqTextColor: themeConfig?.faqSection?.textColor || headerSettings?.faqColors?.textColor,
    faqBorderColor: themeConfig?.faqSection?.borderColor || headerSettings?.faqColors?.borderColor,
    faqIconColor: themeConfig?.faqSection?.iconColor || headerSettings?.faqColors?.iconColor,
    // Reviews section colors - ALWAYS from theme preset for global consistency
    reviewsTextColor: themeConfig?.reviewsSection?.textColor || headerSettings?.reviewsColors?.textColor,
    reviewsStarColor: themeConfig?.reviewsSection?.starColor || headerSettings?.reviewsColors?.starColor,
    reviewsCardBackground: themeConfig?.reviewsSection?.cardBackgroundColor || headerSettings?.reviewsColors?.cardBackgroundColor,
    reviewsCardBorder: themeConfig?.reviewsSection?.cardBorderColor || headerSettings?.reviewsColors?.cardBorderColor,
    // Product card colors (for price cards, containers) - ALWAYS from theme preset
    cardBackground: themeConfig?.priceContainer?.backgroundColor || headerSettings?.productCardColors?.backgroundColor,
    cardTextColor: themeConfig?.priceContainer?.textColor || headerSettings?.productCardColors?.textColor,
    cardPriceColor: themeConfig?.priceContainer?.mutedTextColor || headerSettings?.productCardColors?.priceColor,
    cardBorderColor: themeConfig?.priceContainer?.borderColor || headerSettings?.productCardColors?.borderColor,
    cardIconColor: themeConfig?.priceContainer?.iconColor || headerSettings?.productCardColors?.textColor,
    // View in Library button colors - ALWAYS from theme preset
    viewInLibraryBg: themeConfig?.viewInLibraryButton?.backgroundColor,
    viewInLibraryText: themeConfig?.viewInLibraryButton?.textColor,
    viewInLibraryBorder: themeConfig?.viewInLibraryButton?.borderColor,
  }

  // Download button colors - use buyButtonColor if set (custom), otherwise use theme preset colors
  const downloadButtonBgColor = buyButtonColor || themeConfig?.productHeader?.buyButtonColor || "#2563eb"
  const downloadButtonTextColor = buyButtonTextColor || themeConfig?.productHeader?.buyButtonTextColor || "#ffffff"

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
    } = await supabase.auth.getUser()

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

  // ---------------------------------------------------------------------------
  // Course modules (only if course)
  // ---------------------------------------------------------------------------
  let courseModules: Array<{
    id: string
    title: string
    lessons?: Array<{ id: string; title: string }>
  }> | null = null

  if (product.type === "course") {
    const { data: course } = await supabase.from("courses").select("id").eq("product_id", product.id).maybeSingle()

    if (course) {
      const { data: modules } = await supabase
        .from("course_modules")
        .select("id, title")
        .eq("course_id", course.id)
        .order("position")

      if (modules) {
        const moduleIds = modules.map((m) => m.id)
        const { data: lessons } = await supabase
          .from("course_lessons")
          .select("id, title, module_id")
          .in("module_id", moduleIds)
          .order("position")

        courseModules = modules.map((m) => ({
          ...m,
          lessons: lessons?.filter((l) => l.module_id === m.id) || [],
        }))
      }
    }
  }

  // Always query product-level files — no hasPurchased gate.
  // The download API enforces entitlement; exposing file IDs is safe.
  if (product.type === "digital") {
    const { data: assets } = await supabase
      .from("digital_assets")
      .select("id, file_name")
      .eq("product_id", product.id)
      .order("created_at", { ascending: true })

    if (assets && assets.length > 0) {
      firstAssetId = assets[0].id
      productDownloadFiles = assets.map((asset) => ({ id: asset.id, file_name: asset.file_name || "File" }))
    }
  }

  // ---------------------------------------------------------------------------
  // Product Variants (for variant selection)
  // ---------------------------------------------------------------------------
  const { data: productVariants } = await supabase
    .from("product_variants")
    .select(`
      id,
      name,
      description,
      price_cents,
      max_purchases,
      position,
      pay_what_you_want,
      pwyw_min_price_cents,
      pwyw_suggested_price_cents,
      product_variant_files (
        digital_asset_id,
        digital_assets (
          id,
          file_name
        )
      )
    `)
    .eq("product_id", product.id)
    .order("position")

  // Transform variants data - price_cents is the FINAL price for the variant
  const variants = productVariants?.map(v => ({
    id: v.id,
    name: v.name,
    description: v.description,
    price_cents: v.price_cents || 0, // FINAL price, not additional
    max_purchases: v.max_purchases,
    position: v.position,
    // Pay What You Want fields per variant
    pay_what_you_want: (v as any).pay_what_you_want || false,
    pwyw_min_price_cents: (v as any).pwyw_min_price_cents || null,
    pwyw_suggested_price_cents: (v as any).pwyw_suggested_price_cents || null,
    files: v.product_variant_files?.map((pvf: any) => ({
      id: pvf.digital_assets?.id,
      file_name: pvf.digital_assets?.file_name,
    })).filter((f: any) => f.id) || [],
  })) || []

  // Merge variant files into productDownloadFiles so the sticky bar and purchase
  // wrapper both see ALL files. Prefer the purchased variant's files; fall back to
  // every variant's files (needed when the buyer is identified client-side only).
  if (product.type === "digital" && variants.length > 0) {
    const targetVariants =
      purchasedVariantIds.length > 0
        ? variants.filter((v) => purchasedVariantIds.includes(v.id))
        : variants
    const variantFiles = targetVariants
      .flatMap((v) => v.files)
      .filter((f): f is { id: string; file_name?: string } => !!f.id)
      .map((f) => ({ id: f.id as string, file_name: f.file_name || "File" }))

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
  const { data: moreProducts } = await supabase
    .from("products")
    .select("*")
    .eq("creator_id", product.creator_id)
    .eq("status", "published")
    .neq("id", product.id)
    .limit(4)

  const moreProductsData: ProductData[] =
    moreProducts?.map((p) => ({
      id: p.id,
      slug: p.slug,
      title: p.title,
      thumbnail_url: p.thumbnail_url,
      price_cents: p.price_cents,
      compare_at_cents: p.compare_at_cents,
      sales_count: p.sales_count,
      description: p.description,
    })) || []

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
  const displayFaqs = productFaqs.length > 0
    ? productFaqs
    : (configFaqs.length > 0 ? [...configFaqs, ...defaultFaqs] : defaultFaqs)

  const { data: reviews } = await supabase
    .from("reviews")
    .select(`
      *,
      buyer:profiles!buyer_id(id, display_name, avatar_url)
    `)
    .eq("product_id", product.id)
    .order("created_at", { ascending: false })
    .limit(10)

  const reviewsCount = product.reviews_count || 0
  const reviewsAverage = product.reviews_average || 0

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------
  const formatPrice = (cents: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(cents / 100)
  }

  const creatorInitials = creatorProfile?.display_name
    ?.split(" ")
    .map((n: string) => n[0])
    .join("")
    .toUpperCase()

  // Check if the logged-in user is the creator of this product
  const isCreatorViewing = !!user && !!creator && user.id === creator.user_id

  const getWhatsIncluded = () => {
    if (product.whats_included && product.whats_included.length > 0) {
      return product.whats_included.map((item: string) => item.replace(/\*\*/g, ""))
    }

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

  // Use the profile username (the field that /u/[username] routes look up by).
  // Do NOT fall back to creator.slug — it may differ from the profile username
  // or be a UUID, which would build a broken /u/<uuid> URL and get "lost".
  const creatorUsername = creatorProfile?.username || ""
  // Use a relative internal path directly — avoids the server-side getStoreUrl()
  // which returns https://username.storelib.com (isNativeApp()=false on the server).
  // That subdomain URL, present in the pre-hydration SSR HTML, was being
  // intercepted by Android's isHomepageUrl() and swallowed silently ("gets lost").
  // Using /u/<username> directly works before AND after React hydrates SmartLink.
  // Also avoids the aggressive sanitisation in getStoreUrl() (which strips
  // underscores etc.) — the raw DB username is the safest key for the ilike lookup
  // in the creator profile route.
  const creatorStoreUrl = creatorUsername ? `/u/${creatorUsername}` : "#"

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
    <div className="grid gap-8 lg:grid-cols-5 lg:gap-12 lg:items-start w-full">
      <div className="lg:col-span-3 min-w-0 w-full">
        {/* Back button above product cover image — always visible on Capacitor native,
            on web only when ?recommended=1 (e.g. clicked from More From Seller section) */}
        <DiscoverBackBreadcrumb showOnWeb={showDiscoverBreadcrumb} />
        {galleryImages.length > 0 || videoFileUrl || youtubeUrls.length > 0 ? (
          <ProductGallery
            images={galleryImages}
            title={product.title}
            videoUrl={videoFileUrl}
            youtubeUrls={youtubeUrls}
            mobileDotsMode={mobileGalleryDots}
            desktopDotsMode={desktopGalleryDots}
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
            <h1
              className="text-2xl sm:text-3xl font-semibold break-words flex-1 min-w-0"
              style={{ color: themeColors.textColor || "var(--foreground)" }}
            >
              {product.title}
            </h1>
            <div className="flex items-center gap-2 flex-shrink-0">
              <Badge
                variant="secondary"
                className="shrink-0 capitalize"
                style={isDarkTheme ? {
                  backgroundColor: "#2a2a2a",
                  color: "#fafafa",
                  borderColor: "#3a3a3a"
                } : themePreset === "cream" ? {
                  backgroundColor: "#ffffff",
                  color: "#000000",
                  borderColor: "#e8dfc9"
                } : undefined}
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
                  className="inline-flex items-center gap-3 rounded-lg transition-colors hover:bg-muted/50 min-h-[44px]" target="_blank" rel="noopener noreferrer"
                >
                  <Avatar className="h-10 w-10 shrink-0">
                    <AvatarImage src={creatorAvatarUrl || undefined} />
                    <AvatarFallback>{creatorInitials || "?"}</AvatarFallback>
                  </Avatar>
                  <p
                    className="font-medium truncate"
                    style={{ color: themeColors.textColor || "var(--foreground)" }}
                  >
                    {creatorProfile?.display_name || "Creator"}
                  </p>
                </SmartLink>
                {showRatingNextToSeller && reviewsCount > 0 && (
                  <>
                    <span className="h-4 w-px bg-gray-300 shrink-0" />
                    <div className="flex items-center gap-1 shrink-0">
                      <Star
                        className="h-4 w-4 fill-current"
                        style={{ color: isDarkTheme ? "#fafafa" : "#000000" }}
                      />
                      <span
                        className="text-sm"
                        style={{ color: themeColors.cardPriceColor || "rgb(156, 163, 175)" }}
                      >
                        {reviewsAverage.toFixed(1)}
                      </span>
                    </div>
                  </>
                )}
              </div>
              <ShareButton productTitle={product.title} productSlug={product.slug} className="shrink-0" />
            </div>
          )}

          {/* Mobile: Price card and Creator info ABOVE description */}
          <div className="mt-6 lg:hidden">
            <div
              className="rounded-xl border p-4 sm:p-6 shadow-sm relative z-20"
              style={{
                backgroundColor: themeColors.cardBackground || "var(--card)",
                borderColor: themeColors.cardBorderColor || "var(--border)",
              }}
            >
              {/* Price display - only show static if no variants */}
              {variants.length === 0 && (
                <div className="mb-4">
                  <div
                    className="text-2xl font-bold"
                    style={{ color: themeColors.cardTextColor || "var(--foreground)" }}
                  >
                    {product.price_cents === 0 ? "Free" : formatPrice(product.price_cents)}
                  </div>
                  {!!product.compare_at_cents && product.compare_at_cents > product.price_cents && (
                    <div className="mt-1 flex items-center gap-2">
                      <span
                        className="text-base line-through"
                        style={{ color: themeColors.cardPriceColor || "var(--muted-foreground)" }}
                      >
                        {formatPrice(product.compare_at_cents)}
                      </span>
                      <Badge variant="destructive">
                        {Math.round((1 - product.price_cents / product.compare_at_cents) * 100)}% OFF
                      </Badge>
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

              <div
                className="mt-4 border-t pt-4"
                style={{ borderColor: themeColors.cardBorderColor || "var(--border)" }}
              >
                <h3
                  className="font-semibold"
                  style={{ color: themeColors.cardTextColor || "var(--foreground)" }}
                >
                  What&apos;s included
                </h3>
                <ul className="mt-3 space-y-2">
                  {getWhatsIncluded().map((item: string, idx: number) => (
                    <li
                      key={idx}
                      className="flex items-start gap-2 text-sm"
                      style={{ color: themeColors.cardPriceColor || "var(--muted-foreground)" }}
                    >
                      {getIncludedItemIcon(item, themeColors.cardIconColor)}
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {showSalesAnnouncement && product.sales_count > 0 && (
                <div
                  className="mt-4 pt-4 border-t"
                  style={{ borderColor: themeColors.cardBorderColor || "var(--border)" }}
                >
                  <p
                    className="text-sm text-center"
                    style={{ color: themeColors.cardPriceColor || "var(--muted-foreground)" }}
                  >
                    {product.sales_count} {product.sales_count === 1 ? "person has" : "people have"} purchased this
                  </p>
                </div>
              )}
            </div>

            {/* Mobile: Creator info OUTSIDE the card with share button */}
            {creator && (
              <div
                className="mt-4 flex items-center justify-between p-3 rounded-lg border"
                style={{
                  backgroundColor: themeColors.cardBackground || "var(--card)",
                  borderColor: themeColors.cardBorderColor || "var(--border)",
                }}
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <SmartLink href={creatorStoreUrl} className="flex items-center gap-3" target="_blank" rel="noopener noreferrer">
                    <Avatar className="h-8 w-8 shrink-0">
                      <AvatarImage src={creatorAvatarUrl || undefined} />
                      <AvatarFallback>{creatorInitials || "?"}</AvatarFallback>
                    </Avatar>
                    <p
                      className="font-medium truncate text-sm"
                      style={{ color: themeColors.cardTextColor || "var(--foreground)" }}
                    >
                      {creatorProfile?.display_name || "Creator"}
                    </p>
                  </SmartLink>
                  {showRatingNextToSeller && reviewsCount > 0 && (
                    <>
                      <span className="h-3.5 w-px bg-gray-300 shrink-0" />
                      <div className="flex items-center gap-1 shrink-0">
                        <Star
                          className="h-3.5 w-3.5 fill-current"
                          style={{ color: isDarkTheme ? "#fafafa" : "#000000" }}
                        />
                        <span
                          className="text-xs"
                          style={{ color: themeColors.cardPriceColor || "rgb(156, 163, 175)" }}
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
                  className="shrink-0 h-8 w-8"
                  iconSize="h-4 w-4"
                />
              </div>
            )}
          </div>

          {product.description && (
            <div className="mt-6" data-description-section>
              <h2
                className="mb-3 text-lg font-semibold"
                style={{ color: themeColors.textColor || "var(--foreground)" }}
              >
                Description
              </h2>
              <RichDescriptionContent
                html={product.description}
                textColor={themeColors.textColor ? `${themeColors.textColor}cc` : "var(--muted-foreground)"}
              />
            </div>
          )}
        </div>

        {product.type === "course" && courseModules && courseModules.length > 0 && (
          <div className="mt-8 sm:mt-10">
            <h2
              className="mb-4 text-lg font-semibold"
              style={{ color: themeColors.textColor || "var(--foreground)" }}
            >
              Course Curriculum
            </h2>
            <div className="space-y-3">
              {courseModules.map((module, idx) => (
                <div
                  key={module.id}
                  className="rounded-lg border p-4"
                  style={{
                    backgroundColor: themeColors.cardBackground || "var(--card)",
                    borderColor: themeColors.cardBorderColor || "var(--border)",
                  }}
                >
                  <h3
                    className="font-medium"
                    style={{ color: themeColors.cardTextColor || "var(--foreground)" }}
                  >
                    {idx + 1}. {module.title}
                  </h3>
                  {module.lessons && module.lessons.length > 0 && (
                    <ul className="mt-3 space-y-2">
                      {module.lessons.map((lesson) => (
                        <li
                          key={lesson.id}
                          className="flex items-center gap-2 text-sm"
                          style={{ color: themeColors.cardPriceColor || "var(--muted-foreground)" }}
                        >
                          <div
                            className="h-1.5 w-1.5 rounded-full shrink-0"
                            style={{ backgroundColor: themeColors.cardPriceColor ? `${themeColors.cardPriceColor}80` : "var(--muted-foreground)" }}
                          />
                          <span className="break-words">{lesson.title}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="mt-8 sm:mt-10" data-faq-section>
          <h2
            className="mb-4 text-lg font-semibold"
            style={{ color: themeColors.faqTextColor || "var(--foreground)" }}
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
                  style={{ borderColor: themeColors.faqBorderColor || "var(--border)" }}
                >
                  <AccordionTrigger
                    className="min-h-[44px] text-left"
                    style={{ color: themeColors.faqTextColor || "var(--foreground)" }}
                  >
                    {faq.question}
                  </AccordionTrigger>
                  <AccordionContent style={{ color: themeColors.faqTextColor ? `${themeColors.faqTextColor}cc` : "var(--muted-foreground)" }}>
                    {faq.answer}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </div>
      </div>

      <div className="hidden lg:block lg:col-span-2">
        <div
          className="sticky top-6 rounded-xl border p-6 shadow-sm relative z-20"
          style={{
            backgroundColor: themeColors.cardBackground || "var(--card)",
            borderColor: themeColors.cardBorderColor || "var(--border)",
          }}
        >
          {/* Price display - only show static if no variants */}
          {variants.length === 0 && (
            <div className="mb-4">
              <div
                className="text-3xl font-bold"
                style={{ color: themeColors.cardTextColor || "var(--foreground)" }}
              >
                {product.price_cents === 0 ? "Free" : formatPrice(product.price_cents)}
              </div>
              {!!product.compare_at_cents && product.compare_at_cents > product.price_cents && (
                <div className="mt-1 flex items-center gap-2">
                  <span
                    className="text-lg line-through"
                    style={{ color: themeColors.cardPriceColor || "var(--muted-foreground)" }}
                  >
                    {formatPrice(product.compare_at_cents)}
                  </span>
                  <Badge variant="destructive">
                    {Math.round((1 - product.price_cents / product.compare_at_cents) * 100)}% OFF
                  </Badge>
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

          <div
            className="mt-4 border-t pt-4"
            style={{ borderColor: themeColors.cardBorderColor || "var(--border)" }}
          >
            <h3
              className="font-semibold"
              style={{ color: themeColors.cardTextColor || "var(--foreground)" }}
            >
              What&apos;s included
            </h3>
            <ul className="mt-3 space-y-2">
              {getWhatsIncluded().map((item: string, idx: number) => (
                <li
                  key={idx}
                  className="flex items-start gap-2 text-sm"
                  style={{ color: themeColors.cardPriceColor || "var(--muted-foreground)" }}
                >
                  {getIncludedItemIcon(item, themeColors.cardIconColor)}
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>

          {showSalesAnnouncement && product.sales_count > 0 && (
            <div
              className="mt-4 pt-4 border-t"
              style={{ borderColor: themeColors.cardBorderColor || "var(--border)" }}
            >
              <p
                className="text-sm text-center"
                style={{ color: themeColors.cardPriceColor || "var(--muted-foreground)" }}
              >
                {product.sales_count} {product.sales_count === 1 ? "person has" : "people have"} purchased this
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )

  // ---------------------------------------------------------------------------
  // Render with custom config if it exists
  // ---------------------------------------------------------------------------
  if (themedSections && themedSections.length > 0 && productPageConfig) {
    // Get creator bar and sticky add to cart settings from published config
    // Use optional chaining to prevent server-side exceptions
    const headerSettings = productPageConfig?.headerSettings as ProductHeaderSettings | undefined
    const creatorBarSettings = headerSettings?.creatorBar || defaultProductCreatorBarSettings
    const stickyAddToCartSettings = headerSettings?.stickyAddToCart || defaultStickyAddToCartSettings
    // Get theme colors from published config
    const pageBackgroundColor = productPageConfig?.globalColors?.backgroundColor
    const pageTextColor = themeColors.textColor

    return (
      <div
        className="min-h-screen w-full"
        style={{
          background: pageBackgroundColor || "var(--background)",
          color: pageTextColor || "var(--foreground)",
        }}
      >
        <TrackView type="product" creatorId={product.creator_id} productId={product.id} />
        <DynamicFavicon
          avatarUrl={creatorAvatarUrl}
          faviconUrl={productPageConfig?.headerSettings?.faviconUrl}
        />

        {/* Creator Bar - sticky on scroll, offset below header in Capacitor apps */}
        <DiscoverStickyWrapper>
          <LiveProductCreatorBar
            settings={creatorBarSettings}
            creatorName={creatorProfile?.display_name || creator?.name || "Creator"}
            creatorId={product.creator_id}
            creatorUsername={creatorUsername}
            avatarUrl={creatorAvatarUrl}
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
              price_cents: product.price_cents,
              compare_at_cents: product.compare_at_cents,
              reviews_count: reviewsCount,
              reviews_average: reviewsAverage,
            }}
            creatorId={product.creator_id}
            isPurchased={hasPurchased}
            downloadFiles={productDownloadFiles}
          />
        )}

        {/* ✅ Mobile wider (px-3), desktop unchanged */}
        <div className="mx-auto w-full max-w-[1200px] px-3 sm:px-4 lg:px-6 py-6 sm:py-12 pb-24 lg:pb-12">
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

        <SellerFooter />

        {/* Creator quick-nav circle for owners viewing their own product */}
        {isCreatorViewing && (
          <CreatorQuickNav />
        )}
      </div>
    )
  }

  // ---------------------------------------------------------------------------
  // Default rendering when no custom config
  // Apply theme colors to page background
  // ---------------------------------------------------------------------------
  const defaultPageBackgroundColor = themeConfig?.colors?.background || productPageConfig?.globalColors?.backgroundColor
  const defaultPageTextColor = themeColors.textColor

  // ---------------------------------------------------------------------------
  // JSON-LD Structured Data
  // ---------------------------------------------------------------------------
  const canonicalUrl = `https://storelib.com/p/${product.slug}`
  const sellerDisplayName = creatorProfile?.display_name || creator?.name || "Creator"

  const primaryCategory = productCategories[0] || null

  const productJsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.title,
    description: product.description || undefined,
    sku: product.id,
    image: product.gallery_urls?.length
      ? product.gallery_urls
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
      priceCurrency: "USD",
      availability: "https://schema.org/InStock",
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
      ...(primaryCategory
        ? [
            {
              "@type": "ListItem",
              position: 2,
              name: primaryCategory.name,
              item: `https://storelib.com/explore?category=${primaryCategory.slug}`,
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

  return (
    <div
      className="min-h-screen w-full"
      style={{
        background: defaultPageBackgroundColor || "var(--background)",
        color: defaultPageTextColor || "var(--foreground)",
      }}
    >
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(productJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
      <TrackView type="product" creatorId={product.creator_id} productId={product.id} />
      <DynamicFavicon avatarUrl={creatorAvatarUrl} />

      {/* Creator Bar - sticky on scroll, offset below header in Capacitor apps */}
      <DiscoverStickyWrapper>
        <LiveProductCreatorBar
          settings={defaultProductCreatorBarSettings}
          creatorName={creatorProfile?.display_name || creator?.name || "Creator"}
          creatorId={product.creator_id}
          creatorUsername={creatorUsername}
          avatarUrl={creatorAvatarUrl}
        />
      </DiscoverStickyWrapper>

      {/* Sticky Add to Cart - appears on scroll - ALWAYS SHOW */}
      <LiveStickyAddToCart
          settings={defaultStickyAddToCartSettings}
          product={{
            id: product.id,
            slug: product.slug,
            title: product.title,
            price_cents: product.price_cents,
            compare_at_cents: product.compare_at_cents,
            reviews_count: reviewsCount,
            reviews_average: reviewsAverage,
          }}
          creatorId={product.creator_id}
          isPurchased={hasPurchased}
          downloadFiles={productDownloadFiles}
        />

      {/* ✅ Mobile wider (px-3), desktop unchanged */}
      <div className="mx-auto w-full max-w-[1100px] px-3 sm:px-4 lg:px-6 py-6 sm:py-12 pb-24 lg:pb-12">
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

      <SellerFooter />

      {/* Creator quick-nav circle for owners viewing their own product */}
      {isCreatorViewing && (
        <CreatorQuickNav />
      )}
    </div>
  )
}
