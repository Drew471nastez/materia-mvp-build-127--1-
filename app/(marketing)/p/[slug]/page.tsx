import { notFound } from "next/navigation"
import Link from "next/link"
import { createClient } from "@/lib/supabase/server"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Check, ArrowRight, CheckCircle, Download, Files, Infinity, Star, Heart } from "lucide-react"
import { BuyButton } from "@/components/checkout/buy-button"
import { ProductGallery } from "@/components/product/product-gallery"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { DownloadButton } from "@/components/download-button"
import { TrackView } from "@/components/analytics/track-view"
import { SectionRenderer, type ProductData } from "@/components/store-builder/section-renderer"
import { DynamicFavicon } from "@/components/store-builder/dynamic-favicon"
import { LiveProductCreatorBar } from "@/components/store-builder/product-creator-bar"
import { LiveStickyAddToCart } from "@/components/store-builder/sticky-add-to-cart"
import type { Section, ProductHeaderSettings } from "@/lib/store-builder/types"
import {
  defaultMoreFromSellerSettings,
  defaultProductCreatorBarSettings,
  defaultStickyAddToCartSettings,
} from "@/lib/store-builder/defaults"
import type { ShopHeaderSettings } from "@/lib/store-builder/types"
import { SellerFooter } from "@/components/storefront/seller-footer"
import { ShareButton } from "@/components/product/share-button"
import { WishlistButton } from "@/components/wishlist/wishlist-button"

// Icon mapping for what's included items
function getIncludedItemIcon(item: string) {
  const lowerItem = item.toLowerCase()
  if (lowerItem.includes("instant") || lowerItem.includes("download")) {
    return <Download className="h-4 w-4 mt-0.5 shrink-0 text-black" />
  }
  if (lowerItem.includes("files") || lowerItem.includes("included")) {
    return <Files className="h-4 w-4 mt-0.5 shrink-0 text-black" />
  }
  if (lowerItem.includes("lifetime") || lowerItem.includes("access")) {
    return <Infinity className="h-4 w-4 mt-0.5 shrink-0 text-black" />
  }
  return <Check className="h-4 w-4 mt-0.5 shrink-0 text-green-600" />
}

export const dynamic = "force-dynamic"

interface ProductPageProps {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ purchase?: string; already_owned?: string; src?: string }>
}

export async function generateMetadata({ params }: ProductPageProps) {
  const { slug } = await params
  const supabase = await createClient()

  const { data: product } = await supabase
    .from("products")
    .select("title, description, creator_id")
    .eq("slug", slug)
    .eq("status", "published")
    .maybeSingle()

  if (!product) {
    return { title: "Product Not Found | Materia" }
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
    title: `${product.title} | Materia`,
    description: product.description || "Check out this product on Materia",
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

  const { data: product, error: productError } = await supabase
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
    productPageConfig = {
      ...specificConfig.published_config,
      headerSettings: {
        ...specificConfig.published_config.headerSettings,
        // Use global settings for these fields (from default template)
        creatorBar: globalHeaderSettings.creatorBar || specificConfig.published_config.headerSettings?.creatorBar,
        stickyAddToCart: globalHeaderSettings.stickyAddToCart || specificConfig.published_config.headerSettings?.stickyAddToCart,
        buyButtonColor: globalHeaderSettings.buyButtonColor || specificConfig.published_config.headerSettings?.buyButtonColor,
        buyButtonTextColor: globalHeaderSettings.buyButtonTextColor || specificConfig.published_config.headerSettings?.buyButtonTextColor,
        spacing: globalHeaderSettings.spacing || specificConfig.published_config.headerSettings?.spacing,
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

  // Get more-from-seller section settings from published config, or use defaults
  const publishedMoreFromSellerSection = productPageConfig?.sections?.find(
    (s: Section) => s.type === "more-from-seller",
  )

  const moreFromSellerSection: Section = publishedMoreFromSellerSection || {
    id: "more-from-seller-default",
    type: "more-from-seller",
    settings: { ...defaultMoreFromSellerSettings },
    order: 999,
  }

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

  const galleryImages = product.gallery_urls?.length
    ? ([product.thumbnail_url, ...product.gallery_urls].filter(Boolean) as string[])
    : product.thumbnail_url
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

      {already_owned === "true" && (
        <Alert className="mb-6 border-blue-500/50 bg-blue-50 text-blue-800">
          <CheckCircle className="h-4 w-4" />
          <AlertTitle>You already own this</AlertTitle>
          <AlertDescription>
            You already have access to this product. Download it below or view it in your library.
          </AlertDescription>
        </Alert>
      )}
    </>
  )

  const MainProductContent = (
    <div className="grid gap-8 lg:grid-cols-5 lg:gap-12 lg:items-start w-full">
      <div className="lg:col-span-3 min-w-0 w-full">
        {galleryImages.length > 0 ? (
          <ProductGallery
            images={galleryImages}
            title={product.title}
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
            <h1 className="text-2xl sm:text-3xl font-semibold text-foreground break-words flex-1 min-w-0">
              {product.title}
            </h1>
            <div className="flex items-center gap-2 flex-shrink-0">
              <Badge variant="secondary" className="shrink-0 capitalize">
                {productCategories[0]?.name || product.type}
              </Badge>
            </div>
          </div>

          {/* Desktop: Creator info above description with share button */}
          {creator && (
            <div className="hidden lg:flex mt-4 items-center justify-between">
              <div className="flex items-center gap-3 p-2 -ml-2">
                <Link
                  href={`/u/${creatorUsername}${srcParam}`}
                  className="inline-flex items-center gap-3 rounded-lg transition-colors hover:bg-muted/50 min-h-[44px]"
                >
                  <Avatar className="h-10 w-10 shrink-0">
                    <AvatarImage src={creatorProfile?.avatar_url || undefined} />
                    <AvatarFallback>{creatorInitials || "?"}</AvatarFallback>
                  </Avatar>
                  <p className="font-medium text-foreground truncate">{creatorProfile?.display_name || "Creator"}</p>
                </Link>
                {showRatingNextToSeller && reviewsCount > 0 && (
                  <div className="flex items-center gap-1 shrink-0">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <Star
                        key={star}
                        className={`h-4 w-4 ${star <= Math.round(reviewsAverage) ? "fill-current text-black" : "text-gray-300"}`}
                      />
                    ))}
                    <span className="text-sm text-muted-foreground ml-1">({reviewsCount})</span>
                  </div>
                )}
              </div>
              <ShareButton productTitle={product.title} productSlug={product.slug} className="shrink-0" />
            </div>
          )}

          {/* Mobile: Price card and Creator info ABOVE description */}
          <div className="mt-6 lg:hidden">
            <div className="rounded-xl border border-border bg-card p-4 sm:p-6 shadow-sm">
              <div className="mb-4">
                <div className="text-2xl font-bold text-foreground">
                  {product.price_cents === 0 ? "Free" : formatPrice(product.price_cents)}
                </div>
                {product.compare_at_cents && product.compare_at_cents > product.price_cents && (
                  <div className="mt-1 flex items-center gap-2">
                    <span className="text-base text-muted-foreground line-through">
                      {formatPrice(product.compare_at_cents)}
                    </span>
                    <Badge variant="destructive">
                      {Math.round((1 - product.price_cents / product.compare_at_cents) * 100)}% OFF
                    </Badge>
                  </div>
                )}
              </div>

              {hasPurchased ? (
                <div className="space-y-3">
                  {product.type === "digital" && firstAssetId && (
                    <DownloadButton assetId={firstAssetId} className="w-full min-h-[44px]" size="default">
                      Download File
                    </DownloadButton>
                  )}
                  <Button variant="outline" className="w-full bg-transparent min-h-[44px]" asChild>
                    <Link href="/library/my-downloads">
                      <ArrowRight className="mr-2 h-4 w-4" />
                      View in Library
                    </Link>
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  <BuyButton
                    productId={product.id}
                    price={product.price_cents}
                    creatorId={product.creator_id}
                    backgroundColor={buyButtonColor}
                    textColor={buyButtonTextColor}
                  />
                  <WishlistButton productId={product.id} isLoggedIn={!!user} />
                </div>
              )}

              <div className="mt-4 border-t border-border pt-4">
                <h3 className="font-semibold text-foreground">What&apos;s included</h3>
                <ul className="mt-3 space-y-2">
                  {getWhatsIncluded().map((item, idx) => (
                    <li key={idx} className="flex items-start gap-2 text-sm text-muted-foreground">
                      {getIncludedItemIcon(item)}
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {showSalesAnnouncement && product.sales_count > 0 && (
                <div className="mt-4 pt-4 border-t border-border">
                  <p className="text-sm text-muted-foreground text-center">
                    {product.sales_count} {product.sales_count === 1 ? "person has" : "people have"} purchased this
                  </p>
                </div>
              )}
            </div>

            {/* Mobile: Creator info OUTSIDE the card with share button */}
            {creator && (
              <div className="mt-4 flex items-center justify-between p-3 rounded-lg border border-border bg-card">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <Link href={`/u/${creatorUsername}${srcParam}`} className="flex items-center gap-3">
                    <Avatar className="h-8 w-8 shrink-0">
                      <AvatarImage src={creatorProfile?.avatar_url || undefined} />
                      <AvatarFallback>{creatorInitials || "?"}</AvatarFallback>
                    </Avatar>
                    <p className="font-medium text-foreground truncate text-sm">
                      {creatorProfile?.display_name || "Creator"}
                    </p>
                  </Link>
                  {showRatingNextToSeller && reviewsCount > 0 && (
                    <div className="flex items-center gap-0.5 shrink-0">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <Star
                          key={star}
                          className={`h-3 w-3 ${star <= Math.round(reviewsAverage) ? "fill-current text-black" : "text-gray-300"}`}
                        />
                      ))}
                      <span className="text-xs text-muted-foreground ml-1">({reviewsCount})</span>
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
            <div className="mt-6">
              <h2 className="mb-3 text-lg font-semibold text-foreground">Description</h2>
              <p className="whitespace-pre-wrap text-muted-foreground leading-relaxed break-words">
                {product.description.replace(/\*\*/g, "").replace(/\n\n\*\*What you'll get:\*\*\n/g, "")}
              </p>
            </div>
          )}
        </div>

        {product.type === "course" && courseModules && courseModules.length > 0 && (
          <div className="mt-8 sm:mt-10">
            <h2 className="mb-4 text-lg font-semibold text-foreground">Course Curriculum</h2>
            <div className="space-y-3">
              {courseModules.map((module, idx) => (
                <div key={module.id} className="rounded-lg border border-border bg-card p-4">
                  <h3 className="font-medium text-foreground">
                    {idx + 1}. {module.title}
                  </h3>
                  {module.lessons && module.lessons.length > 0 && (
                    <ul className="mt-3 space-y-2">
                      {module.lessons.map((lesson) => (
                        <li key={lesson.id} className="flex items-center gap-2 text-sm text-muted-foreground">
                          <div className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50 shrink-0" />
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

        <div className="mt-8 sm:mt-10">
          <h2 className="mb-4 text-lg font-semibold text-foreground">Frequently Asked Questions</h2>

          {/* ✅ Mobile: add a tiny inner gutter so FAQ isn't edge-to-edge */}
          <div className="px-2 sm:px-0">
            <Accordion type="single" collapsible className="w-full">
              <AccordionItem value="item-1">
                <AccordionTrigger className="min-h-[44px] text-left">How do I access my purchase?</AccordionTrigger>
                <AccordionContent>
                  After completing your purchase, you&apos;ll have instant access to your content through your library.
                  You can access it anytime by logging in to your Materia account.
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="item-2">
                <AccordionTrigger className="min-h-[44px] text-left">Is there a refund policy?</AccordionTrigger>
                <AccordionContent>
                  Refund policies are set by individual creators. Please contact the creator directly if you have
                  questions about refunds.
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="item-3">
                <AccordionTrigger className="min-h-[44px] text-left">How long do I have access?</AccordionTrigger>
                <AccordionContent>
                  You have lifetime access to all purchased content. Once you buy, it&apos;s yours forever.
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </div>
        </div>
      </div>

      <div className="hidden lg:block lg:col-span-2">
        <div className="sticky top-6 rounded-xl border border-border bg-card p-6 shadow-sm">
          <div className="mb-4">
            <div className="text-3xl font-bold text-foreground">
              {product.price_cents === 0 ? "Free" : formatPrice(product.price_cents)}
            </div>
            {product.compare_at_cents && product.compare_at_cents > product.price_cents && (
              <div className="mt-1 flex items-center gap-2">
                <span className="text-lg text-muted-foreground line-through">
                  {formatPrice(product.compare_at_cents)}
                </span>
                <Badge variant="destructive">
                  {Math.round((1 - product.price_cents / product.compare_at_cents) * 100)}% OFF
                </Badge>
              </div>
            )}
          </div>

          {hasPurchased ? (
            <div className="space-y-3">
              {product.type === "digital" && firstAssetId && (
                <DownloadButton assetId={firstAssetId} className="w-full min-h-[44px]" size="default">
                  Download File
                </DownloadButton>
              )}
              <Button variant="outline" className="w-full bg-transparent min-h-[44px]" asChild>
                <Link href="/library/my-downloads">
                  <ArrowRight className="mr-2 h-4 w-4" />
                  View in Library
                </Link>
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <BuyButton
                productId={product.id}
                price={product.price_cents}
                creatorId={product.creator_id}
                backgroundColor={buyButtonColor}
                textColor={buyButtonTextColor}
              />
              <WishlistButton productId={product.id} isLoggedIn={!!user} />
            </div>
          )}

          <div className="mt-4 border-t border-border pt-4">
            <h3 className="font-semibold text-foreground">What&apos;s included</h3>
            <ul className="mt-3 space-y-2">
              {getWhatsIncluded().map((item, idx) => (
                <li key={idx} className="flex items-start gap-2 text-sm text-muted-foreground">
                  {getIncludedItemIcon(item)}
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>

          {showSalesAnnouncement && product.sales_count > 0 && (
            <div className="mt-4 pt-4 border-t border-border">
              <p className="text-sm text-muted-foreground text-center">
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
  if (productPageConfig?.sections && productPageConfig.sections.length > 0) {
    // Get creator bar and sticky add to cart settings from published config
    const headerSettings = productPageConfig.headerSettings as ProductHeaderSettings | undefined
    const creatorBarSettings = headerSettings?.creatorBar || defaultProductCreatorBarSettings
    const stickyAddToCartSettings = headerSettings?.stickyAddToCart || defaultStickyAddToCartSettings

    return (
      <div className="min-h-screen bg-background overflow-x-hidden w-full">
        <TrackView type="product" creatorId={product.creator_id} productId={product.id} />
        <DynamicFavicon
          avatarUrl={creatorProfile?.avatar_url}
          faviconUrl={productPageConfig.headerSettings?.faviconUrl}
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

        {productPageConfig.sections.map((section: any) => (
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
          />
        ))}

        <SellerFooter />
      </div>
    )
  }

  // ---------------------------------------------------------------------------
  // Default rendering when no custom config
  // ---------------------------------------------------------------------------
  return (
    <div className="min-h-screen bg-background overflow-x-hidden w-full">
      <TrackView type="product" creatorId={product.creator_id} productId={product.id} />
      <DynamicFavicon url={undefined} />

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

      {/* Default reviews section if there are reviews */}
      {reviewsCount > 0 && (
        <SectionRenderer
          section={{
            id: "default-reviews",
            type: "reviews",
            settings: {
              ...defaultMoreFromSellerSettings,
              visible: true,
            },
            order: 0,
          }}
          productId={product.id}
          reviews={reviews || []}
          reviewsCount={reviewsCount}
          reviewsAverage={reviewsAverage}
        />
      )}

      <SellerFooter />
    </div>
  )
}
