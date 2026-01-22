import { notFound } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Package, ShoppingBag } from "lucide-react"
import { isReservedWord } from "@/lib/reserved-words"
import Image from "next/image"
import { TrackView } from "@/components/analytics/track-view"
import { getPublishedConfig } from "@/lib/store-builder/get-published-config"
import { SectionRenderer, ShopHeaderRenderer, type ProductData } from "@/components/store-builder/section-renderer"
import type { ShopHeaderSettings, GlobalStoreSettings, Section } from "@/lib/store-builder/types"
import { defaultShopHeaderSettings, themePresets } from "@/lib/store-builder/defaults"
import { SubscribeBar } from "@/components/store-builder/subscribe-bar"
import { DynamicFavicon } from "@/components/store-builder/dynamic-favicon"
import { SellerFooter } from "@/components/storefront/seller-footer"

export const dynamic = "force-dynamic"

interface StorefrontPageProps {
  params: Promise<{ username: string }>
  searchParams: Promise<{ src?: string }>
}

export async function generateMetadata({ params }: StorefrontPageProps) {
  const { username } = await params

  if (isReservedWord(username)) {
    return { title: "Page Not Found | Storelib" }
  }

  const supabase = await createClient()

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, username")
    .eq("username", username)
    .maybeSingle()

  if (!profile) {
    return { title: "Creator Not Found | Storelib" }
  }

  // Fetch creator to get published config for favicon
  const { data: creator } = await supabase
    .from("creators")
    .select("id")
    .eq("user_id", (await supabase.from("profiles").select("id").eq("username", username).single()).data?.id)
    .maybeSingle()

  let faviconUrl: string | undefined
  if (creator) {
    const publishedConfig = await getPublishedConfig(creator.id, "shop")
    const headerSettings = publishedConfig?.headerSettings as ShopHeaderSettings | undefined
    faviconUrl = headerSettings?.faviconUrl || undefined
  }

  return {
    title: `${profile.display_name || profile.username || "Creator"} | Storelib`,
    description: `Check out ${profile.display_name || profile.username}'s products on Storelib`,
    ...(faviconUrl && {
      icons: {
        icon: faviconUrl,
        apple: faviconUrl,
      },
    }),
  }
}

export default async function StorefrontPage({ params, searchParams }: StorefrontPageProps) {
  const { username } = await params
  const { src } = await searchParams

  if (isReservedWord(username)) {
    notFound()
  }

  const supabase = await createClient()

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("*")
    .ilike("username", username)
    .maybeSingle()

  if (profileError) {
    console.error("[v0] Profile query error:", profileError)
  }

  if (!profile) {
    notFound()
  }

  const { data: creator, error: creatorError } = await supabase
    .from("creators")
    .select("*")
    .eq("user_id", profile.id)
    .maybeSingle()

  if (creatorError) {
    console.error("[v0] Creator query error:", creatorError)
  }

  if (!creator) {
    return (
      <div className="min-h-screen bg-background overflow-x-hidden">
        <div className="mx-auto max-w-4xl px-4 py-12">
          <div className="flex flex-col items-center text-center">
            <Avatar
              className="h-24 w-24 shadow-lg"
              style={{
                borderWidth: "1.3px",
                borderStyle: "solid",
                borderColor: "#e5e7eb",
              }}
            >
              <AvatarImage src={profile.avatar_url || undefined} alt={profile.display_name || ""} />
              <AvatarFallback className="text-2xl">
                {profile.display_name
                  ?.split(" ")
                  .map((n: string) => n[0])
                  .join("")
                  .toUpperCase() || "?"}
              </AvatarFallback>
            </Avatar>
            <h1 className="mt-4 text-2xl font-semibold text-foreground">{profile.display_name || username}</h1>
            <p className="mt-6 text-muted-foreground">This creator hasn't set up their store yet.</p>
          </div>
        </div>
      </div>
    )
  }

  const { data: products, error: productsError } = await supabase
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
    .eq("creator_id", creator.id)
    .eq("status", "published")
    .order("created_at", { ascending: false })

  if (productsError) {
    console.error("[v0] Products query error:", productsError)
  }

  const publishedConfig = await getPublishedConfig(creator.id, "shop")

  const srcParam = src === "platform" ? "?src=platform" : ""

  const productsData: ProductData[] =
    products?.map((p) => ({
      id: p.id,
      slug: p.slug,
      title: p.title,
      thumbnail_url: p.thumbnail_url,
      price_cents: p.price_cents,
      compare_at_cents: p.compare_at_cents,
      sales_count: p.sales_count,
      description: p.description,
      whats_included: p.whats_included,
      gallery_urls: p.gallery_urls,
      categories: p.product_categories?.map((pc: any) => pc.category).filter(Boolean) || [],
    })) || []

  // Helper function to build subscribe bar settings from published config or defaults
  const buildSubscribeBarSettings = (headerSettings?: ShopHeaderSettings) => {
    const savedSettings = headerSettings?.subscribeBar

    // If there are saved settings from store builder, use them
    if (savedSettings) {
      return {
        visible: savedSettings.visible ?? true,

        // ✅ IMPORTANT:
        // - if customCtaText is empty -> bar uses style text
        // - if customCtaText has value -> bar uses that
        customCtaText: savedSettings.customCtaText || "",

        // ✅ keep text only for backward compatibility (don’t force a sentence)
        text: savedSettings.text || "",

        placeholder: savedSettings.placeholder || "Enter your email",
        buttonText: savedSettings.buttonText || "Subscribe",
        dismissible: false,
        position: savedSettings.position || ("top" as const),
        showAvatar: savedSettings.showAvatar ?? true,
        avatarUrl:
  headerSettings?.avatarUrl === ""
    ? undefined
    : headerSettings?.avatarUrl !== undefined
      ? headerSettings.avatarUrl
      : profile.avatar_url || undefined,
        creatorName: profile.display_name || username,
        backgroundColor: savedSettings.colors?.backgroundColor || "#ffffff",
        textColor: savedSettings.colors?.textColor || "#000000",
        buttonColor: savedSettings.buttonColor || "#2563eb",
        buttonTextColor: savedSettings.buttonTextColor || "#ffffff",
        style: savedSettings.style || "style1",
        enableStickyBar: savedSettings.enableStickyBar ?? false,
        enableStickyOnScrollUp: savedSettings.enableStickyOnScrollUp ?? false,
        buttonStyle: savedSettings.buttonStyle || "style1",
      }
    }

    return {
      visible: true,
      customCtaText: "",
      text: "",
      placeholder: "Enter your email",
      buttonText: "Subscribe",
      dismissible: false,
      position: "top" as const,
      showAvatar: true,
      avatarUrl: profile.avatar_url || undefined,
      creatorName: profile.display_name || username,
      backgroundColor: "#ffffff",
      textColor: "#000000",
      buttonColor: "#2563eb",
      buttonTextColor: "#ffffff",
      style: "style1" as const,
      enableStickyBar: false,
      enableStickyOnScrollUp: false,
      buttonStyle: "style1" as const,
    }
  }

  // Use published config if it exists and has sections
  if (publishedConfig && publishedConfig.sections && publishedConfig.sections.length > 0) {
    const headerSettings = (publishedConfig.headerSettings as ShopHeaderSettings) || defaultShopHeaderSettings
    const globalSettings = publishedConfig.globalSettings as GlobalStoreSettings | undefined
    const subscribeBarSettings = buildSubscribeBarSettings(headerSettings)
    // Get theme colors from published config
    const pageBackgroundColor = publishedConfig.globalColors?.backgroundColor
    const pageTextColor = headerSettings?.colors?.textColor
    // Calculate total sales for About section
    const totalSales = products?.reduce((acc, p) => acc + (p.sales_count || 0), 0) || 0
    // Calculate products count for About section
    const productsCount = products?.length || 0

    // Get theme preset and config
    const themePreset = globalSettings?.themePreset || "default"
    const themeConfig = themePresets[themePreset as keyof typeof themePresets]

    // Apply theme colors to all sections from the shop page config
    // This ensures sections always reflect the current theme preset
    const applySectionThemeColors = (sections: Section[]): Section[] => {
      if (!themeConfig) return sections

      return sections.map((section) => {
        const newSection = { ...section, settings: { ...section.settings } }

        // Apply featured-products section colors from theme
        if (section.type === "featured-products") {
          newSection.settings = {
            ...newSection.settings,
            colors: {
              ...newSection.settings.colors,
              backgroundColor: themeConfig.sections?.featuredProductsBackgroundColor || newSection.settings.colors?.backgroundColor,
              textColor: themeConfig.sections?.featuredProductsTextColor || themeConfig.colors?.foreground || newSection.settings.colors?.textColor,
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
              ...newSection.settings.colors,
              backgroundColor: themeConfig.about?.backgroundColor || newSection.settings.colors?.backgroundColor,
              textColor: themeConfig.about?.textColor || newSection.settings.colors?.textColor,
            },
            mutedTextColor: themeConfig.about?.mutedTextColor,
          }
        }

        // Apply text block colors from theme
        if (section.type === "text-block") {
          newSection.settings = {
            ...newSection.settings,
            colors: {
              ...newSection.settings.colors,
              backgroundColor: themeConfig.textBlock?.backgroundColor || newSection.settings.colors?.backgroundColor,
              textColor: themeConfig.textBlock?.headlineColor || newSection.settings.colors?.textColor,
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
              ...newSection.settings.colors,
              backgroundColor: themeConfig.imageText?.backgroundColor || newSection.settings.colors?.backgroundColor,
              textColor: themeConfig.imageText?.textColor || newSection.settings.colors?.textColor,
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
              ...newSection.settings.colors,
              backgroundColor: themeConfig.benefits?.backgroundColor || newSection.settings.colors?.backgroundColor,
              textColor: themeConfig.benefits?.textColor || newSection.settings.colors?.textColor,
            },
            iconColor: themeConfig.benefits?.iconColor,
          }
        }

        // Apply announcement bar colors from theme
        if (section.type === "announcement-bar") {
          newSection.settings = {
            ...newSection.settings,
            colors: {
              ...newSection.settings.colors,
              backgroundColor: themeConfig.announcementBar?.backgroundColor || newSection.settings.colors?.backgroundColor,
              textColor: themeConfig.announcementBar?.textColor || newSection.settings.colors?.textColor,
            },
          }
        }

        return newSection
      })
    }

    // Apply theme colors to all sections
    const themedSections = applySectionThemeColors(publishedConfig.sections)

    return (
      <div
        className="min-h-screen overflow-x-hidden"
        style={{
          background: pageBackgroundColor || "var(--background)",
          color: pageTextColor || "var(--foreground)",
        }}
      >
        <DynamicFavicon avatarUrl={profile.avatar_url} faviconUrl={headerSettings.faviconUrl} />
        <TrackView type="store" creatorId={creator.id} />

        {subscribeBarSettings.visible && <SubscribeBar settings={subscribeBarSettings} creatorId={creator.id} />}

        <ShopHeaderRenderer
          settings={headerSettings}
          creator={creator}
          profile={profile}
          products={products || []}
          productCount={products?.length || 0}
          globalSettings={globalSettings}
        />

        {(() => {
          // Separate About section to render last
          const regularSections = themedSections
            .filter((s) => s.type !== "about")
            .sort((a, b) => a.order - b.order)
          const aboutSection = themedSections.find((s) => s.type === "about")

          return (
            <>
              {regularSections.map((section) => (
                <SectionRenderer
                  key={section.id}
                  section={section}
                  products={productsData}
                  globalSettings={globalSettings}
                  creatorName={profile.display_name || undefined}
                />
              ))}

              {/* About section - always rendered last */}
              {aboutSection && (
                <SectionRenderer
                  key={aboutSection.id}
                  section={aboutSection}
                  products={productsData}
                  globalSettings={globalSettings}
                  creatorName={profile.display_name || undefined}
                  sellerMemberSince={profile.created_at}
                  sellerTotalSales={totalSales}
                  sellerProductsCount={productsCount}
                />
              )}
            </>
          )
        })()}

        <SellerFooter />
      </div>
    )
  }

  // Default rendering when no custom config exists
  const initials = profile.display_name
    ?.split(" ")
    .map((n: string) => n[0])
    .join("")
    .toUpperCase()

  const productCount = products?.length ?? 0
  const totalSales = products?.reduce((acc, p) => acc + (p.sales_count || 0), 0) || 0
  const showTotalSalesBadge = creator.show_total_sales_badge !== false

  // Use default subscribe bar settings for stores without published config
  const defaultSubscribeSettings = buildSubscribeBarSettings()

  return (
    <div className="min-h-screen bg-background overflow-x-hidden">
      <DynamicFavicon avatarUrl={profile.avatar_url} />
      <TrackView type="store" creatorId={creator.id} />

      {defaultSubscribeSettings.visible && <SubscribeBar settings={defaultSubscribeSettings} creatorId={creator.id} />}

      {creator.cover_url && (
        <div className="relative h-48 sm:h-64 w-full overflow-hidden">
          <Image
            src={creator.cover_url || "/placeholder.svg"}
            alt={`${profile.display_name || username} cover`}
            fill
            sizes="100vw"
            className="object-cover"
            priority
          />
        </div>
      )}

      <div className="mx-auto max-w-4xl px-4 py-8 sm:py-12">
        <div className="flex flex-col items-center text-center">
          <Avatar
            className="h-20 w-20 sm:h-24 sm:w-24 border-4 border-background shadow-lg shrink-0"
            style={{ marginTop: creator.cover_url ? "-2.5rem" : "0" }}
          >
            <AvatarImage src={profile.avatar_url || undefined} alt={profile.display_name || ""} />
            <AvatarFallback className="text-xl sm:text-2xl">{initials || "?"}</AvatarFallback>
          </Avatar>
          <h1 className="mt-4 text-xl sm:text-2xl font-semibold text-foreground break-words max-w-full px-4">
            {profile.display_name || username}
          </h1>
          {creator.headline && (
            <p className="mt-1 text-sm sm:text-base text-muted-foreground break-words max-w-full px-4">
              {creator.headline}
            </p>
          )}

          {creator.niche_tags && creator.niche_tags.length > 0 && (
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {creator.niche_tags.map((tag: string) => (
                <Badge key={tag} variant="secondary">
                  {tag}
                </Badge>
              ))}
            </div>
          )}

          {creator.bio && <p className="mt-6 max-w-xl text-sm text-muted-foreground break-words px-4">{creator.bio}</p>}

          <div className="mt-6 flex flex-wrap gap-4 sm:gap-8 justify-center">
            <div className="flex items-center gap-2 text-sm sm:text-base text-muted-foreground">
              <Package className="h-4 w-4 sm:h-5 sm:w-5" />
              <span>{productCount} products</span>
            </div>
            {showTotalSalesBadge && totalSales > 0 && (
              <div className="flex items-center gap-2 text-sm sm:text-base text-muted-foreground">
                <ShoppingBag className="h-4 w-4 sm:h-5 sm:w-5" />
                <span>{totalSales} sales</span>
              </div>
            )}
          </div>
        </div>
      </div>

      <SellerFooter />
    </div>
  )
}
