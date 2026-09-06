import { notFound, redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
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
import { EditProfileButton } from "@/components/storefront/edit-profile-button"
import { OwnerMenu } from "@/components/storefront/owner-menu"
import { StorefrontTabs, EmptyTabPanel, type StorefrontTab } from "@/components/storefront/storefront-tabs"
import { AllProductsGrid } from "@/components/storefront/all-products-grid"
import { ReviewsPanel, type StorefrontReview } from "@/components/storefront/reviews-panel"
import { BackLabelSetter } from "@/components/product/discover-back-breadcrumb"
import { deservesIndexing } from "@/lib/security/spam-signals"
import {
  STOREFRONT_PAGE_BACKGROUND,
  storefrontPageBackground,
  storefrontSectionBackground,
} from "@/lib/store-builder/page-surface"

export const dynamic = "force-dynamic"

/**
 * The default page colour behind a creator's white surfaces. Light enough that
 * nobody would call the page grey, dark enough that a white card has an edge.
 */


/**
 * THERE IS NO WHITE HEADER SHEET. Read this before adding one back.
 *
 * The first attempt at giving this page some depth put the subscribe bar, the
 * cover, the profile and the tab strip on one white surface above a grey page.
 * What that produced was a hard horizontal seam across the middle, white above
 * and grey below, which looked like a rendering fault rather than a design.
 *
 * The whole page is the light grey. White is reserved for the things that are
 * meant to sit ON it — the subscribe bar and the product cards — so those read
 * as raised objects and everything else reads as background.
 *
 * The second seam came from the other direction: the theme presets set white
 * EXPLICITLY (`pageBackgroundColor` and `featuredProductsBackgroundColor` are
 * both "#ffffff" in the default), so the Featured section painted a white
 * block under the tab strip whatever the page was doing. That is why the
 * colours go through lib/store-builder/page-surface — a stored white means
 * "nobody chose", any other colour is a real choice and is left alone.
 */

interface StorefrontPageProps {
  params: Promise<{ username: string }>
  searchParams: Promise<{ src?: string }>
}

export async function generateMetadata({ params }: StorefrontPageProps) {
  const { username } = await params

  if (isReservedWord(username)) {
    return { title: "Page Not Found" }
  }

  const supabase = await createClient()

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, display_name, username, avatar_url")
    .eq("username", username)
    .maybeSingle()

  if (!profile) {
    return { title: "Creator Not Found" }
  }

  // Fetch creator to get published config for favicon
  const { data: creator } = await supabase
    .from("creators")
    .select("id")
    .eq("user_id", profile.id)
    .maybeSingle()

  let faviconUrl: string | undefined
  let socialPreviewImage: string | undefined
  if (creator) {
    const publishedConfig = await getPublishedConfig(creator.id, "shop")
    const headerSettings = publishedConfig?.headerSettings as ShopHeaderSettings | undefined
    faviconUrl = headerSettings?.faviconUrl || undefined

    const globalSettings = publishedConfig?.globalSettings as GlobalStoreSettings | undefined
    const avatarFromHeader =
      headerSettings?.avatarUrl && headerSettings.avatarUrl !== "" ? headerSettings.avatarUrl : undefined

    // Source-of-truth order for social image:
    // 1) Explicit Social Image in SEO settings
    // 2) Store Builder header/profile avatar
    // 3) Profile avatar
    socialPreviewImage =
      (globalSettings?.socialImageUrl && globalSettings.socialImageUrl !== "" ? globalSettings.socialImageUrl : undefined) ||
      avatarFromHeader ||
      profile.avatar_url ||
      undefined
  } else {
    socialPreviewImage = profile.avatar_url || undefined
  }

  // Check for admin SEO overrides
  const { data: seoOverride } = await supabase
    .from("seo_overrides")
    .select("seo_title, seo_description")
    .eq("type", "creator")
    .eq("identifier", username)
    .maybeSingle()

  const siteUrl = `https://${username}.storelib.com`
  const displayTitle = profile.display_name || profile.username || "Creator"
  const defaultDescription = `Check out ${profile.display_name || profile.username}'s products on Storelib`

  // Use SEO overrides if set, otherwise use defaults
  const title = seoOverride?.seo_title?.replace(/ \| Storelib$/i, "") || displayTitle
  const description = seoOverride?.seo_description || defaultDescription

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "website",
      siteName: "Storelib",
      url: siteUrl,
      images: socialPreviewImage
        ? [
            {
              url: socialPreviewImage,
              width: 1200,
              height: 630,
              alt: `${profile.display_name || profile.username || "Store"} social preview`,
            },
          ]
        : undefined,
    },
    twitter: {
      card: socialPreviewImage ? "summary_large_image" : "summary",
      title,
      description,
      images: socialPreviewImage ? [socialPreviewImage] : undefined,
    },
    alternates: {
      canonical: `https://storelib.com/u/${username}`,
    },
    /**
     * ═══════════════════════════════════════════════════════════════════════
     *  INDEXING IS EARNED BY PUBLISHING SOMETHING
     * ═══════════════════════════════════════════════════════════════════════
     *
     * This was `index: true` for everybody, and that is what a link farm bought
     * three hundred and sixty accounts to get. Signing up minted an indexable
     * page on an authoritative domain, with a canonical, structured data and a
     * subdomain, in the time it takes to fill in an email field. Nobody
     * published a product, because products were never the point.
     *
     * An empty storefront now says noindex, and says nofollow with it — the
     * follow half is not an afterthought, it is the actual currency. A farm
     * puts its links in the store description and the bio; nofollow is what
     * stops this page passing authority to them even if a crawler arrives via
     * some route the sitemap does not control.
     *
     * This costs a genuine seller nothing. An account with nothing for sale has
     * no page worth ranking, and Google treats a thin empty profile as a
     * liability across the whole domain rather than as a neutral. They are
     * indexed the moment they publish, on the next crawl, with no action from
     * anybody — the page is force-dynamic and this is recomputed per request.
     *
     * app/sitemap.ts applies the identical rule via the same `deservesIndexing`
     * helper. If these two ever disagree, the sitemap is advertising a page
     * that tells crawlers to go away, which is worse than either alone.
     */
    ...(await (async () => {
      let publishedProducts = 0
      if (creator) {
        const { count } = await supabase
          .from("products")
          .select("id", { count: "exact", head: true })
          .eq("creator_id", creator.id)
          .eq("status", "published")
        publishedProducts = count ?? 0
      }
      const indexable = deservesIndexing({ publishedProducts, handle: username })
      return {
        robots: indexable
          ? { index: true, follow: true, googleBot: { index: true, follow: true, "max-image-preview": "large" as const } }
          : { index: false, follow: false, googleBot: { index: false, follow: false } },
      }
    })()),
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
    // Check username history for redirects (old username → new username)
    const adminSupabase = createAdminClient()
    const { data: historyRecord } = await adminSupabase
      .from("username_history")
      .select("new_username")
      .ilike("old_username", username)
      .order("changed_at", { ascending: false })
      .limit(1)
      .maybeSingle()

    if (historyRecord?.new_username) {
      redirect(`/u/${historyRecord.new_username}`)
    }

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
      // Same page colour as a real storefront — this is still a creator page,
      // just one with nothing set up on it yet.
      <div className="min-h-screen overflow-x-hidden" style={{ background: STOREFRONT_PAGE_BACKGROUND }}>
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

  /**
   * The products and the published shop config are fetched together.
   *
   * Both key off `creator.id` alone and neither reads anything the other
   * returns, but they ran in series -- and `getPublishedConfig` was issued only
   * after the full product list, with its nested category join, had come back.
   * Two sequential round trips on a storefront, before any HTML is sent.
   *
   * The profile → creator hop above genuinely IS sequential: the creator is
   * looked up by `profile.id`, so it cannot start any earlier.
   */
  const [
    { data: products, error: productsError },
    publishedConfig,
    {
      data: { user: viewer },
    },
    { count: followerCount },
    { data: creatorReviews },
  ] = await Promise.all([
    supabase
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
      .order("created_at", { ascending: false }),
    getPublishedConfig(creator.id, "shop"),
    /**
     * Who is looking. Joined to the batch above rather than awaited on its own
     * — it reads the session cookie and touches nothing the other two return,
     * so paying for it in series would be a third round trip before the first
     * byte of a page that is already dynamic.
     *
     * This decides ONE thing: whether the owner gets an edit control on their
     * own page. It is not an authorisation — every write it leads to is
     * re-checked against the session on the server (see
     * app/api/creator-profile/route.ts), so a forged answer here buys nothing
     * but a button that fails.
     */
    supabase.auth.getUser(),
    /**
     * How many people follow this creator. A follow points at their PROFILE
     * rather than their creator row — a person is the thing you follow — so
     * this counts against `profile.id`.
     *
     * `head: true` means the rows never travel; only the count does.
     */
    supabase.from("follows").select("id", { count: "exact", head: true }).eq("following_id", profile.id),
    /**
     * The reviews behind the rating in the meta row. Capped, because the tab
     * shows the most recent rather than the complete history and a creator
     * with thousands should not send thousands down the wire to render two
     * columns of cards.
     */
    supabase
      .from("reviews")
      .select("id, rating, comment, created_at, product:products(title, slug), buyer:profiles!buyer_id(display_name)")
      .eq("creator_id", creator.id)
      .order("created_at", { ascending: false })
      .limit(30),
  ])

  const viewerIsOwner = !!viewer && viewer.id === profile.id

  /**
   * The creator's rating, across everything they sell.
   *
   * Each product carries its own count and average, so the creator's average is
   * WEIGHTED by how many reviews each product has — a five-star product with
   * one review must not drag a four-star product with two hundred up to 4.5.
   * Products nobody has reviewed contribute nothing rather than a zero.
   */
  const reviewTotals = (products || []).reduce(
    (acc, p) => {
      const count = p.reviews_count || 0
      if (count > 0) {
        acc.count += count
        acc.weighted += (p.reviews_average || 0) * count
      }
      return acc
    },
    { count: 0, weighted: 0 },
  )
  const creatorReviewCount = reviewTotals.count
  const creatorRating = creatorReviewCount > 0 ? reviewTotals.weighted / creatorReviewCount : 0

  const reviewsForPanel: StorefrontReview[] = (creatorReviews || []).map((review: any) => ({
    id: review.id,
    rating: review.rating,
    comment: review.comment,
    created_at: review.created_at,
    productTitle: review.product?.title ?? null,
    productSlug: review.product?.slug ?? null,
    buyerName: review.buyer?.display_name ?? null,
  }))

  /**
   * Built once and handed to whichever header branch renders, so the control
   * cannot end up present on the configured page and missing on the fallback.
   * `null` for everyone who is not the owner — a visitor never receives the
   * component, not even hidden.
   */
  const buildOwnerActions = (headerSettings?: ShopHeaderSettings) => {
    if (!viewerIsOwner) return null
    const links = headerSettings?.socialLinks
    return (
      <div className="flex items-center gap-2">
      <EditProfileButton
        displayName={profile.display_name || ""}
        bio={headerSettings?.bio || creator.bio || ""}
        username={profile.username}
        avatarUrl={headerSettings?.avatarUrl ?? profile.avatar_url}
        coverUrl={headerSettings?.coverImageUrl ?? creator.cover_url}
        socialLinks={{
          instagram: links?.instagram?.url || "",
          tiktok: links?.tiktok?.url || "",
          youtube: links?.youtube?.url || "",
          twitter: links?.twitter?.url || "",
          spotify: links?.spotify?.url || "",
        }}
      />
      {/* Everything that needs a whole screen rather than a dialog. */}
      <OwnerMenu />
      </div>
    )
  }

  if (productsError) {
    console.error("[v0] Products query error:", productsError)
  }

  /**
   * The same gate generateMetadata applies, computed once here for the body.
   *
   * Structured data is not decoration: ProfilePage and BreadcrumbList are what
   * make a page eligible for rich results and what tell Google this URL
   * describes a real entity worth showing. Emitting them for an account that
   * has published nothing is asserting something untrue, and for the link farm
   * it was half the prize. An empty storefront still renders — the person who
   * owns it sees their page exactly as before — it just stops claiming to be a
   * search result.
   */
  const indexable = deservesIndexing({ publishedProducts: products?.length ?? 0, handle: username })

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
      // Already on the row the select above returns — the card shows a rating
      // for free, and only when there is one to show.
      reviews_count: p.reviews_count,
      reviews_average: p.reviews_average,
    })) || []

  // Helper function to build subscribe bar settings from published config or defaults
  const buildSubscribeBarSettings = (headerSettings?: ShopHeaderSettings) => {
    const savedSettings = headerSettings?.subscribeBar

    /**
     * The sticky default, and why it is not just `?? true`.
     *
     * The builder writes the whole settings object out on every save whether
     * or not anyone touched the sticky switch, and that switch defaulted to
     * OFF for as long as it existed — so essentially every stored config on
     * the platform carries an explicit `false` that never represented a
     * decision. `?? true` cannot see past it: `false ?? true` is `false`.
     * That is why the last two attempts at this changed nothing on the live
     * page.
     *
     * `stickyBarChoiceMade` is the flag that separates a real choice from a
     * default that got saved past. Absent -> nobody has chosen, the platform
     * default (sticky, revealed on scroll up) applies. Present -> this
     * creator moved the switch themselves, and their value is honoured
     * exactly, `false` included. The builder sets it on either sticky
     * toggle; the migration backfills it for configs that predate it.
     */
    const stickyDefaults = (saved?: ShopHeaderSettings["subscribeBar"]) =>
      saved?.stickyBarChoiceMade
        ? {
            enableStickyBar: saved.enableStickyBar ?? true,
            enableStickyOnScrollUp: saved.enableStickyOnScrollUp ?? true,
          }
        : { enableStickyBar: true, enableStickyOnScrollUp: true }

    // If there are saved settings from store builder, use them
    if (savedSettings) {
      return {
        /**
         * ALWAYS VISIBLE. The "Show Subscribe Bar" toggle was deleted from the
         * builder — the bar is the one control on a creator page with a job to
         * do, and it is not optional. Old configs still hold `visible: false`;
         * this ignores them on purpose.
         */
        visible: true,

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
        ...stickyDefaults(savedSettings),
        buttonStyle: savedSettings.buttonStyle || "style1",
      }
    }

    return {
      // Always visible — see the note above.
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
      // A storefront with no saved config has certainly made no choice, so it
      // gets the platform default like everyone else.
      ...stickyDefaults(undefined),
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
    /**
     * Every section's background goes through the surface rule after the theme
     * has had its say. The presets set white explicitly, so without this the
     * Featured block paints a white slab under the tab strip and the cards on
     * it have nothing to be seen against — the seam the page colour was
     * supposed to remove, arriving from the section instead.
     *
     * A section a creator actually coloured keeps that colour.
     */
    const themedSections = applySectionThemeColors(publishedConfig.sections).map((section) => ({
      ...section,
      settings: {
        ...section.settings,
        colors: {
          ...section.settings.colors,
          backgroundColor: storefrontSectionBackground(section.settings.colors?.backgroundColor),
        },
      },
    }))

    const profilePageJsonLd = {
      "@context": "https://schema.org",
      "@type": "ProfilePage",
      mainEntity: {
        "@type": "Person",
        name: profile.display_name || username,
        url: `https://storelib.com/u/${username}`,
        ...(profile.avatar_url ? { image: profile.avatar_url } : {}),
      },
    }

    const breadcrumbJsonLd = {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Explore", item: "https://storelib.com/explore" },
        { "@type": "ListItem", position: 2, name: profile.display_name || username },
      ],
    }

    return (
      <>
        {indexable && (
          <>
            <script
              type="application/ld+json"
              dangerouslySetInnerHTML={{ __html: JSON.stringify(profilePageJsonLd) }}
            />
            <script
              type="application/ld+json"
              dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
            />
          </>
        )}
        {/*
          THE PAGE IS A VERY LIGHT GREY, not white.

          Everything on a creator page is white — the subscribe bar, the header,
          the tab strip, every product card — so on a white page there was
          nothing to see them against and the whole thing read as one
          undifferentiated sheet. A grey barely darker than the cards is enough
          to give each surface an edge without drawing a single border.

          A creator who has chosen their own page colour still gets it; this is
          only the default.
        */}
        <div
          className="min-h-screen overflow-x-hidden"
          style={{
            background: storefrontPageBackground(pageBackgroundColor),
            color: pageTextColor || "var(--foreground)",
          }}
        >
          <DynamicFavicon avatarUrl={profile.avatar_url} faviconUrl={headerSettings.faviconUrl} />
        <TrackView type="store" creatorId={creator.id} />

        {subscribeBarSettings.visible && <SubscribeBar settings={{ ...subscribeBarSettings, creatorUserId: profile.id }} creatorId={creator.id} />}

        <ShopHeaderRenderer
          settings={headerSettings}
          creator={creator}
          profile={profile}
          products={products || []}
          productCount={products?.length || 0}
          globalSettings={globalSettings}
          ownerActions={buildOwnerActions(headerSettings)}
          reviewCount={creatorReviewCount}
          reviewAverage={creatorRating}
          followerCount={followerCount ?? 0}
        />

        {(() => {
          // Separate About section to render last
          const regularSections = themedSections
            .filter((s) => s.type !== "about")
            .sort((a, b) => a.order - b.order)
          const aboutSection = themedSections.find((s) => s.type === "about")

          /**
           * About moves OUT of Home and into its own tab. It used to be pinned
           * last in the Home panel, below every other section, which is where
           * nobody reads it — and with a tab bar across the top there is now
           * somewhere obvious for it to live. It is only offered when the
           * creator actually has an About section.
           */
          const home = (
            <>
              {regularSections.map((section) => (
                <SectionRenderer
                  key={section.id}
                  section={section}
                  products={productsData}
                  globalSettings={globalSettings}
                  creatorName={profile.display_name || undefined}
                  creatorUsername={profile.username}
                  creatorAvatarUrl={profile.avatar_url}
                  viewerIsOwner={viewerIsOwner}
                />
              ))}

            </>
          )

          const about = aboutSection ? (
            <SectionRenderer
              key={aboutSection.id}
              section={aboutSection}
              products={productsData}
              globalSettings={globalSettings}
              creatorName={profile.display_name || undefined}
              creatorUsername={profile.username}
              creatorAvatarUrl={profile.avatar_url}
              viewerIsOwner={viewerIsOwner}
              sellerMemberSince={profile.created_at}
              sellerTotalSales={totalSales}
              sellerProductsCount={productsCount}
            />
          ) : null

          /**
           * Both panels are rendered HERE, on the server, and handed to the tab
           * strip as props. Switching tabs is then a visibility change — no
           * fetch, no spinner, no second render of the sections — and Home is
           * still in the first HTML the visitor and the crawler receive.
           *
           * The Products tab only earns its place once there is more than one
           * product to show; below that it is a tab onto the thing already on
           * screen. StorefrontTabs renders a lone panel bare, with no strip.
           */
          const tabs: StorefrontTab[] = [{ id: "home", label: "Home", panel: home }]
          if (productsData.length > 1) {
            tabs.push({
              id: "products",
              label: "Products",
              panel: (
                <AllProductsGrid
                  products={productsData}
                  creatorName={profile.display_name}
                  creatorUsername={profile.username}
                  creatorAvatarUrl={profile.avatar_url}
                  isOwner={viewerIsOwner}
                />
              ),
            })
          }

          /**
           * Communities is here because it was asked for, and the feature is
           * not built: Storelib has no paid membership a creator sells, and
           * `community_posts` is their own dashboard feed rather than something
           * anyone joins. The panel says that instead of opening onto nothing —
           * a blank tab reads as broken, a sentence reads as "not yet".
           *
           * When the feature lands, this panel is the only thing that changes.
           */
          tabs.push({
            id: "communities",
            label: "Communities",
            panel: (
              <EmptyTabPanel
                title="No communities yet"
                detail="Paid communities are not available on Storelib yet. When they are, the ones this creator runs will appear here."
              />
            ),
          })

          /**
           * THREE TABS: Home, Products, Communities. Reviews and About are
           * both below them.
           *
           * Reviews was a fourth tab, shown once a creator had any. It reads
           * better at the foot of the page for the same reason About does —
           * the meta row claims a rating, and the evidence for that claim
           * belongs where a visitor arrives after looking at the work, not
           * behind a tab that takes them away from it. It still only appears
           * when there is something to show; an empty reviews block under
           * every storefront is worse than none.
           *
           * ABOUT IS LAST, always. It is the last thing on the page whichever
           * tab you are on — you read it after looking at the work, not
           * instead of looking at it. As a tab it was a destination competing
           * with the products for a click it was never going to win.
           */
          return (
            <>
              <StorefrontTabs tabs={tabs} />
              {creatorReviewCount > 0 && (
                <ReviewsPanel reviews={reviewsForPanel} average={creatorRating} total={creatorReviewCount} />
              )}
              {about}
            </>
          )
        })()}

        <SellerFooter />
      </div>
      </>
    )
  }

  // Default rendering when no custom config exists. The initials, sales total
  // and badge flag that used to be computed here belonged to the hand-written
  // header this branch no longer has — UnifiedShopHeader derives all three from
  // the props it is given.
  const productCount = products?.length ?? 0

  // Use default subscribe bar settings for stores without published config
  const defaultSubscribeSettings = buildSubscribeBarSettings()

  const defaultProfilePageJsonLd = {
    "@context": "https://schema.org",
    "@type": "ProfilePage",
    mainEntity: {
      "@type": "Person",
      name: profile.display_name || username,
      url: `https://storelib.com/u/${username}`,
      ...(profile.avatar_url ? { image: profile.avatar_url } : {}),
    },
  }

  const defaultBreadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Explore", item: "https://storelib.com/explore" },
      { "@type": "ListItem", position: 2, name: profile.display_name || username },
    ],
  }

  return (
    <>
      {indexable && (
        <>
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: JSON.stringify(defaultProfilePageJsonLd) }}
          />
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: JSON.stringify(defaultBreadcrumbJsonLd) }}
          />
        </>
      )}
      <div
        className="min-h-screen overflow-x-hidden"
        style={{ background: STOREFRONT_PAGE_BACKGROUND }}
      >
        <DynamicFavicon avatarUrl={profile.avatar_url} />
        <BackLabelSetter label={profile.display_name || username} />
      <TrackView type="store" creatorId={creator.id} />

      {defaultSubscribeSettings.visible && <SubscribeBar settings={{ ...defaultSubscribeSettings, creatorUserId: profile.id }} creatorId={creator.id} />}

      {/*
        THE SAME HEADER AS THE CONFIGURED PAGE, not a second hand-written one.

        This branch used to carry its own cover-avatar-name-bio-stats markup —
        about fifty lines that were a near copy of UnifiedShopHeader and drifted
        from it. Every improvement to the real header had to be made twice, and
        in practice was made once: this copy had no handle, no social icons, and
        no way for the owner to edit anything.

        A creator with no published config is not a different KIND of page, only
        a page whose settings are all defaults — so it renders the real header
        with the real defaults. `showPlaceholder` stays off here because the
        renderer passes no editor callbacks, so nothing editor-only leaks onto a
        public page.
      */}
      <ShopHeaderRenderer
        settings={defaultShopHeaderSettings}
        creator={creator}
        profile={profile}
        products={products || []}
        productCount={productCount}
        ownerActions={buildOwnerActions(defaultShopHeaderSettings)}
        reviewCount={creatorReviewCount}
        reviewAverage={creatorRating}
        followerCount={followerCount ?? 0}
      />

      <SellerFooter />
    </div>
    </>
  )
}
