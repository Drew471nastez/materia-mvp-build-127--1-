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
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { DownloadButton } from "@/components/download-button"
import { TrackView } from "@/components/analytics/track-view"
import { SectionRenderer, type ProductData } from "@/components/store-builder/section-renderer"
import { ProductAboutSection } from "@/components/store-builder/unified-section-renderer"
import { DynamicFavicon } from "@/components/store-builder/dynamic-favicon"
import { LiveProductCreatorBar } from "@/components/store-builder/product-creator-bar"
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
import { WishlistButton } from "@/components/wishlist/wishlist-button"
import { RefundPolicyDisplay } from "@/components/product/refund-policy-display"
import { getStoreUrl } from "@/lib/url-helpers"
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
  searchParams: Promise<{ purchase?: string; already_owned?: string; src?: string }>
}

export async function generateMetadata({ params }: ProductPageProps) {
  const { slug } = await params
  const supabase = await createClient()

  // First, try to find product by current slug
  let { data: product } = await supabase
    .from("products")
    .select("title, description, creator_id, slug")
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
          status
        )
      `)
      .eq("old_slug", slug)
      .maybeSingle()

    if (slugHistory?.products && (slugHistory.products as any).status === "published") {
      product = slugHistory.products as any
    }
  }

  if (!product) {
    return { title: "Product Not Found | Storelib" }
  }

  // Fetch creator's published config for favicon
  let faviconUrl: string | undefined
  if (product.creator_id) {
    const { getPublishedConfig } = await import("@/lib/store-builder/get-published-config")
    const publishedConfig = await getPublishedConfig(product.creator_id, "shop")
    const headerSettings = publishedConfig?.headerSettings as ShopHeaderSettings | undefined
    faviconUrl = headerSettings?.faviconUrl || undefined
  }

  return {
    title: `${product.title} | Storelib`,
    description: product.description || "Check out this product on Storelib",
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
  const { purchase, already_owned, src } = await searchParams
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

  const { data: creator } = await supabase.from("creators").select("*").eq("id", product.creator_id).maybeSingle()

  let creatorProfile: any = null
  if (creator?.user_id) {
    const { data: profile } = await supabase.from("profiles").select("*").eq("id", creator.user_id).maybeSingle()
    creatorProfile = profile
  }

  // ---------------------------------------------------------------------------
  // Product page config (specific > creator default)
  // Global settings (creator bar, sticky, buy button, spacing) always come from default template
  // ---------------------------------------------------------------------------
  let productPageConfig: any = null

  // Always fetch the default template for global settings
  const { data: defaultTemplate } = await supabase
    .from("store_builder_configs")
    .select("published_config")
    .eq("creator_id", product.creator_id)
    .eq("page_type", "product")
    .maybeSingle()

  const globalHeaderSettings = defaultTemplate?.published_config?.headerSettings || {}

  const { data: specificConfig } = await supabase
    .from("product_page_configs")
    .select("published_config")
    .eq("creator_id", product.creator_id)
    .eq("product_id", product.id)
    .maybeSingle()

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
  const showSalesAnnouncement =
    (productPageConfig?.headerSettings as ProductHeaderSettings | undefined)?.showSalesAnnouncement ?? false
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
  // Purchase state
  // ---------------------------------------------------------------------------
  let hasPurchased = false
  let firstAssetId: string | null = null
  let user: any = null

  try {
    const {
      data: { user: authUser },
    } = await supabase.auth.getUser()

    user = authUser

    if (user) {
      const { data: entitlement } = await supabase
        .from("entitlements")
        .select("id")
        .eq("buyer_id", user.id)
        .eq("product_id", product.id)
        .maybeSingle()

      hasPurchased = !!entitlement
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

  if (hasPurchased && product.type === "digital") {
    const { data: assets } = await supabase.from("digital_assets").select("id").eq("product_id", product.id).limit(1)
    if (assets && assets.length > 0) {
      firstAssetId = assets[0].id
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
      additional_price_cents,
      max_purchases,
      position,
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

  // Transform variants data
  const variants = productVariants?.map(v => ({
    id: v.id,
    name: v.name,
    description: v.description,
    additional_price_cents: v.additional_price_cents || 0,
    max_purchases: v.max_purchases,
    position: v.position,
    files: v.product_variant_files?.map((pvf: any) => ({
      id: pvf.digital_assets?.id,
      file_name: pvf.digital_assets?.file_name,
    })).filter((f: any) => f.id) || [],
  })) || []

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

  const creatorUsername = creatorProfile?.username || creator?.slug || "creator"

  // Use gallery_urls directly if available (it already includes the thumbnail as first image)
  // Only fall back to thumbnail_url if no gallery_urls exist
  const galleryImages = product.gallery_urls?.length
    ? (product.gallery_urls.filter(Boolean) as string[])
    : product.thumbnail_url
      ? [product.thumbnail_url]
      : []

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
            <div className="hidden lg:flex mt-4 items-center justify-between">
              <div className="flex items-center gap-3 p-2 -ml-2">
                <a
                  href={getStoreUrl(creatorUsername)}
                  className="inline-flex items-center gap-3 rounded-lg transition-colors hover:bg-muted/50 min-h-[44px]"
                >
                  <Avatar className="h-10 w-10 shrink-0">
                    <AvatarImage src={creatorProfile?.avatar_url || undefined} />
                    <AvatarFallback>{creatorInitials || "?"}</AvatarFallback>
                  </Avatar>
                  <p
                    className="font-medium truncate"
                    style={{ color: themeColors.textColor || "var(--foreground)" }}
                  >
                    {creatorProfile?.display_name || "Creator"}
                  </p>
                </a>
                {showRatingNextToSeller && reviewsCount > 0 && (
                  <div className="flex items-center gap-1 shrink-0">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <Star
                        key={star}
                        className="h-4 w-4"
                        style={{
                          color: star <= Math.round(reviewsAverage)
                            ? (themeColors.reviewsStarColor || "#000000")
                            : "rgb(209, 213, 219)",
                          fill: star <= Math.round(reviewsAverage) ? "currentColor" : "none",
                        }}
                      />
                    ))}
                    <span
                      className="text-sm ml-1"
                      style={{ color: themeColors.cardPriceColor || "var(--muted-foreground)" }}
                    >
                      ({reviewsCount})
                    </span>
                  </div>
                )}
              </div>
              <ShareButton productTitle={product.title} productSlug={product.slug} className="shrink-0" />
            </div>
          )}

          {/* Mobile: Price card and Creator info ABOVE description */}
          <div className="mt-6 lg:hidden">
            <div
              className="rounded-xl border p-4 sm:p-6 shadow-sm"
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
                  {product.compare_at_cents && product.compare_at_cents > product.price_cents && (
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
                variants={variants}
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
                  <a href={getStoreUrl(creatorUsername)} className="flex items-center gap-3">
                    <Avatar className="h-8 w-8 shrink-0">
                      <AvatarImage src={creatorProfile?.avatar_url || undefined} />
                      <AvatarFallback>{creatorInitials || "?"}</AvatarFallback>
                    </Avatar>
                    <p
                      className="font-medium truncate text-sm"
                      style={{ color: themeColors.cardTextColor || "var(--foreground)" }}
                    >
                      {creatorProfile?.display_name || "Creator"}
                    </p>
                  </a>
                  {showRatingNextToSeller && reviewsCount > 0 && (
                    <div className="flex items-center gap-0.5 shrink-0">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <Star
                          key={star}
                          className="h-3 w-3"
                          style={{
                            color: star <= Math.round(reviewsAverage)
                              ? (themeColors.reviewsStarColor || "#000000")
                              : "rgb(209, 213, 219)",
                            fill: star <= Math.round(reviewsAverage) ? "currentColor" : "none",
                          }}
                        />
                      ))}
                      <span
                        className="text-xs ml-1"
                        style={{ color: themeColors.cardPriceColor || "var(--muted-foreground)" }}
                      >
                        ({reviewsCount})
                      </span>
                    </div>
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
          className="sticky top-6 rounded-xl border p-6 shadow-sm"
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
              {product.compare_at_cents && product.compare_at_cents > product.price_cents && (
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
            variants={variants}
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
        className="min-h-screen overflow-x-hidden w-full"
        style={{
          background: pageBackgroundColor || "var(--background)",
          color: pageTextColor || "var(--foreground)",
        }}
      >
        <TrackView type="product" creatorId={product.creator_id} productId={product.id} />
        <DynamicFavicon
          avatarUrl={creatorProfile?.avatar_url}
          faviconUrl={productPageConfig?.headerSettings?.faviconUrl}
        />

        {/* Creator Bar - at top */}
        <LiveProductCreatorBar
          settings={creatorBarSettings}
          creatorName={creatorProfile?.display_name || creator?.name || "Creator"}
          creatorId={product.creator_id}
          creatorUsername={creatorUsername}
          avatarUrl={creatorProfile?.avatar_url}
        />

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
      className="min-h-screen overflow-x-hidden w-full"
      style={{
        background: defaultPageBackgroundColor || "var(--background)",
        color: defaultPageTextColor || "var(--foreground)",
      }}
    >
      <TrackView type="product" creatorId={product.creator_id} productId={product.id} />
      <DynamicFavicon avatarUrl={creatorProfile?.avatar_url} />

      {/* Creator Bar - at top */}
      <LiveProductCreatorBar
        settings={defaultProductCreatorBarSettings}
        creatorName={creatorProfile?.display_name || creator?.name || "Creator"}
        creatorId={product.creator_id}
        avatarUrl={creatorProfile?.avatar_url}
      />

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
    </div>
  )
}
