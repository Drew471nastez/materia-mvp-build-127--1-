import type React from "react"
import { hasBoughtFromCreator } from "@/lib/commerce/has-bought-from-creator"
import { applyManualOrder } from "@/lib/store-builder/featured-order"
import { SafeRegion } from "@/components/storefront/safe-region"
import { notFound, redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { isReservedWord } from "@/lib/reserved-words"
import Image from "next/image"
import { TrackView } from "@/components/analytics/track-view"
import { getPublishedConfig } from "@/lib/store-builder/get-published-config"
import { SectionRenderer, ShopHeaderRenderer, type ProductData } from "@/components/store-builder/section-renderer"
import type { AboutSettings, ShopHeaderSettings, GlobalStoreSettings, Section } from "@/lib/store-builder/types"
import { defaultShopHeaderSettings, themePresets } from "@/lib/store-builder/defaults"
import { SubscribeBar } from "@/components/store-builder/subscribe-bar"
import { LiveSubscribeBar } from "@/components/store-builder/live-subscribe-bar"
import { DynamicFavicon } from "@/components/store-builder/dynamic-favicon"
import { SellerFooter } from "@/components/storefront/seller-footer"
import { EditProfileButton } from "@/components/storefront/edit-profile-button"
import { EditAboutButton } from "@/components/storefront/edit-about-button"
import { OwnerMenu } from "@/components/storefront/owner-menu"
import { EmbeddedNavigation } from "@/components/storefront/embedded-navigation"
import { StorefrontTabs, EmptyTabPanel, type StorefrontTab } from "@/components/storefront/storefront-tabs"
import { AllProductsGrid } from "@/components/storefront/all-products-grid"
import { ReviewsPanel, type StorefrontReview } from "@/components/storefront/reviews-panel"
import { BackLabelSetter } from "@/components/product/discover-back-breadcrumb"
import { deservesIndexing } from "@/lib/security/spam-signals"
import {
  STOREFRONT_PAGE_BACKGROUND,
  storefrontSectionBackground,
} from "@/lib/store-builder/page-surface"
/**
 * THE CHROME IS NOT THE SECTIONS. `applySectionThemeColors` below writes the
 * scheme into `config.sections`; the profile header, the tab strip, the bar
 * across the top and the footer are rendered OUTSIDE that list, so none of
 * them ever heard about a scheme change. This resolves their colours.
 */
import { resolveStorefrontChrome, type StorefrontBarColors } from "@/lib/store-builder/storefront-chrome"

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
  searchParams: Promise<{ src?: string; embedded?: string }>
}

export async function generateMetadata({ params }: StorefrontPageProps) {
  const { username } = await params

  if (isReservedWord(username)) {
    return { title: "Page Not Found" }
  }

  const supabase = await createClient()

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, display_name, username, avatar_url, email")
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
  const { src, embedded: embeddedParam } = await searchParams
  /**
   * Inside /creator-page this page IS the editor, so the controls that
   * would take somebody to the editor have nowhere to go, and links into /app
   * would load the whole app inside the frame. See
   * components/creator-page-workspace.tsx.
   */
  const embedded = embeddedParam === "1"

  if (isReservedWord(username)) {
    notFound()
  }

  const supabase = await createClient()

  /**
   * WHO IS LOOKING, ASKED FIRST AND AWAITED LAST.
   *
   * This reads the session cookie and depends on nothing else on the page,
   * so it is started here and handed to the batch below as an already
   * running promise. It used to be issued inside that batch, which was fine
   * for the batch itself but not for what needs it: the purchase check could
   * not run until the batch had come back, so it became a FOURTH round trip
   * in series on a page that is already dynamic. Started here, it is settled
   * by the time the batch is assembled and the purchase check can join it.
   *
   * No await on this line. Awaiting it here would put the round trip back in
   * series, in a worse place.
   */
  const viewerPromise = supabase.auth.getUser()

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
    viewerBoughtFromCreator,
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
    viewerPromise,
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
      .select("id, rating, comment, created_at, product:products(title, slug), buyer:profiles!buyer_id(display_name, avatar_url)")
      .eq("creator_id", creator.id)
      .order("created_at", { ascending: false })
      .limit(30),
    /**
     * HAS THIS VIEWER BOUGHT ANYTHING FROM THIS CREATOR, which decides whether
     * the contact address goes into the page at all.
     *
     * It needs the viewer and the creator. The creator is known by the time
     * this array is built, and the viewer is the promise started at the top of
     * the request, so chaining off it here costs nothing in series: both are
     * settled or in flight alongside everything else in this batch. Awaited on
     * its own below the batch, as it was, it was a whole round trip of dead
     * time on every visit by every signed-in person.
     */
    viewerPromise.then(({ data }) => hasBoughtFromCreator(supabase, data.user?.id, creator.id)),
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
    buyerAvatarUrl: review.buyer?.avatar_url ?? null,
  }))

  /**
   * Built once and handed to whichever header branch renders, so the control
   * cannot end up present on the configured page and missing on the fallback.
   * `null` for everyone who is not the owner — a visitor never receives the
   * component, not even hidden.
   */
  const buildOwnerActions = (headerSettings?: ShopHeaderSettings, themePreset?: string) => {
    if (!viewerIsOwner) return null
    const links = headerSettings?.socialLinks
    return (
      <div className="flex items-center gap-2">
      <EditProfileButton
        embedded={embedded}
        displayName={profile.display_name || ""}
        bio={headerSettings?.bio || creator.bio || ""}
        username={profile.username}
        avatarUrl={headerSettings?.avatarUrl ?? profile.avatar_url}
        coverUrl={headerSettings?.coverImageUrl ?? creator.cover_url}
        coverFocalPoint={headerSettings?.coverFocalPoint ?? null}
        socialLinks={{
          instagram: links?.instagram?.url || "",
          tiktok: links?.tiktok?.url || "",
          youtube: links?.youtube?.url || "",
          twitter: links?.twitter?.url || "",
          spotify: links?.spotify?.url || "",
          facebook: links?.facebook?.url || "",
          linkedin: links?.linkedin?.url || "",
          twitch: links?.twitch?.url || "",
        }}
        display={{
          showReviews: headerSettings?.showReviews,
          showFollowers: headerSettings?.showFollowers,
          // The sales badge needs both flags to be on, so the switch has to
          // show the AND of them or it lies about its own state.
          showTotalSalesBadge:
            (headerSettings?.showTotalSalesBadge ?? true) && (creator.show_total_sales_badge ?? true),
          showSocialMedia: headerSettings?.showSocialMedia,
        }}
        themePreset={themePreset}
      />
      {/* Everything that needs a whole screen rather than a dialog. */}
      <OwnerMenu embedded={embedded} />
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
  /**
   * `bar` is the scheme's answer for the four colours, already reconciled
   * with whatever the creator typed. It is a parameter rather than something
   * read in here because the scheme is only known inside the published-config
   * branch, and the fallback branch below has no scheme at all.
   */
  const buildSubscribeBarSettings = (headerSettings?: ShopHeaderSettings, bar?: StorefrontBarColors) => {
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
        buttonText: savedSettings.buttonText || "",
        /**
         * The flag that separates "the creator typed this" from "the builder
         * wrote the default out". getButtonText needs it, and without it the
         * "Or your own label" field saves and changes nothing.
         */
        buttonTextPreset: savedSettings.buttonTextPreset,
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
        /**
         * THE FOUR COLOURS COME FROM THE SCHEME when the creator has not
         * chosen. These were hardcoded white / black / blue / white, below
         * the scheme entirely, which is why the bar stayed a white strip
         * across the top of a black page. Every preset carries a
         * `subscribeBar` block built against its own palette; `bar` is that,
         * with the creator's own values already layered over it.
         */
        backgroundColor: bar?.backgroundColor || savedSettings.colors?.backgroundColor || "#ffffff",
        textColor: bar?.textColor || savedSettings.colors?.textColor || "#000000",
        buttonColor: bar?.buttonColor || savedSettings.buttonColor || "#2563eb",
        buttonTextColor: bar?.buttonTextColor || savedSettings.buttonTextColor || "#ffffff",
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
      buttonText: "",
      dismissible: false,
      position: "top" as const,
      showAvatar: true,
      avatarUrl: profile.avatar_url || undefined,
      creatorName: profile.display_name || username,
      backgroundColor: bar?.backgroundColor || "#ffffff",
      textColor: bar?.textColor || "#000000",
      buttonColor: bar?.buttonColor || "#2563eb",
      buttonTextColor: bar?.buttonTextColor || "#ffffff",
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
    /**
     * =====================================================================
     *  ONE ADDRESS, RESOLVED ONCE
     * =====================================================================
     * ALWAYS AN ADDRESS. The creator's typed one wins; when it is empty or
     * they cleared it, the account's own email stands in, so a page can
     * never end up with nowhere to be reached. That is the owner's explicit
     * call: a creator page without a contact was the thing they did not
     * want.
     *
     * Resolved HERE rather than at each place that shows it. It used to be
     * worked out inline where About was rendered, which is how the header's
     * line and the About block would have come to show different addresses
     * the first time either expression was edited.
     */
    /**
     * =====================================================================
     *  ONLY THE PEOPLE WHO BOUGHT SOMETHING GET THE ADDRESS
     * =====================================================================
     * It was on the page for everyone, which makes a creator's inbox a
     * public address the moment they open a shop. The people with a reason
     * to write to a seller are the people who bought from them, and that is
     * a question the database can answer.
     *
     * GATED HERE, WHERE THE VALUE IS RESOLVED, RATHER THAN WHERE IT IS
     * DRAWN. This runs on the server, so an address a visitor may not have
     * is never put into the page — not hidden in it. Hiding it with a class
     * leaves it in the HTML for anyone who looks, which is not a gate.
     *
     * THE FALLBACK STAYS, AND IT IS WORTH KNOWING WHAT IT IS. With no typed
     * address this uses the account's, which is the owner's explicit call —
     * a creator page with nowhere to be reached was the thing they did not
     * want. It is the address that resets their password, so it reaches a
     * narrower audience now than it did: buyers rather than the internet.
     * Removing it is a separate decision from this one and not mine to make.
     *
     * NO EXCEPTION FOR THE OWNER, AND THAT IS THE POINT. It had one, so
     * that a creator could tell from the page what was set. What actually
     * happened is that the page showed the owner a Contact link no visitor
     * could see, and the owner reported the gate as broken — which is the
     * failure mode of every owner-only preview of a hidden thing. A creator
     * looking at their own page sees what a visitor sees.
     *
     * Where they check the address is the editor, next to the field they
     * typed it into, which is the only place it can be both visible and
     * unambiguous.
     */
    const resolvedContactEmail = headerSettings.contactEmail || profile.email || undefined
    /*
      NO EXCEPTION FOR THE OWNER, which is #204's call and stands: an
      owner-only preview of a hidden thing showed them a Contact link no
      visitor could see, and that got reported as the gate being broken.

      Resolved with the batch above rather than awaited on this line, which
      is the only part of that change kept here: the question is the same one
      for everybody, it just stopped costing a round trip of its own.
    */
    const viewerBought = viewerBoughtFromCreator
    const publicContactEmail = viewerBought ? resolvedContactEmail : undefined
    const globalSettings = publishedConfig.globalSettings as GlobalStoreSettings | undefined
    /**
     * ONE RESOLUTION FOR THE WHOLE OF THE CHROME.
     *
     * The page colour, the type on it, the muted type, the hairlines, the
     * badges, the footer band and the bar's four colours, decided together
     * from the scheme and whatever the creator stored. Everything below reads
     * from this rather than reaching for the design system's tokens, which is
     * how the name came out black-on-black and the footer came out white
     * under a black page: those components were painted by a stylesheet that
     * has never heard of a colour scheme.
     */
    /**
     * BOTH PLACES. The builder writes the bar's background and text under
     * `colors` — that is where the type declares them — and an earlier
     * version of the quick editor's API wrote them at the top level instead,
     * where nothing read them. `colors` is canonical; the top level is the
     * fallback for rows that version left behind.
     */
    const storedBar = (headerSettings?.subscribeBar || {}) as NonNullable<ShopHeaderSettings["subscribeBar"]>
    const chrome = resolveStorefrontChrome(globalSettings?.themePreset, {
      pageBackground: publishedConfig.globalColors?.backgroundColor,
      text: headerSettings?.textsColor || headerSettings?.colors?.textColor,
      avatarBorder: headerSettings?.profileImageBorderColor,
      /**
       * BOTH PLACES. The builder writes the bar's background and text under
       * `colors`; the quick editor writes them at the top level. A reader
       * that asks for only one of the two is a control that saves and does
       * nothing, which is what both of them were at different times.
       */
      bar: {
        backgroundColor: storedBar.colors?.backgroundColor || (storedBar as unknown as Record<string, string>).backgroundColor,
        textColor: storedBar.colors?.textColor || (storedBar as unknown as Record<string, string>).textColor,
        buttonColor: storedBar.buttonColor,
        buttonTextColor: storedBar.buttonTextColor,
      },
    })
    const subscribeBarSettings = buildSubscribeBarSettings(headerSettings, chrome.bar)
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
          /**
           * The scheme's colours AND the design system's variables rebound to
           * them, so `text-muted-foreground`, `bg-card` and `border-border`
           * inside this subtree mean what the creator's scheme says rather
           * than what the Storelib app says. See storefront-chrome.ts.
           */
          style={{
            background: chrome.pageBackground,
            color: chrome.text,
            ...(chrome.tokens as React.CSSProperties),
          }}
        >
          <DynamicFavicon avatarUrl={profile.avatar_url} faviconUrl={headerSettings.faviconUrl} />
          {/* In the workspace's canvas, a product link has to stay framable. */}
          {embedded && <EmbeddedNavigation />}
        <TrackView type="store" creatorId={creator.id} />

        {subscribeBarSettings.visible && (
          /**
           * THE BAR EDITS ITSELF, and only for its owner.
           *
           * The pencil used to sit here as a sibling and edit two strings; the
           * bar's colours were a panel in the workspace's toolbar. Both halves
           * are one control now, and it lives INSIDE LiveSubscribeBar because
           * a draft that repaints as somebody types is state, and two siblings
           * in a Server Component cannot share state.
           *
           * It is seeded with what the bar ACTUALLY SHOWS rather than the raw
           * stored value: the bar generates its own sentence from a preset
           * when nothing is stored, and opening a dialog onto an empty box is
           * not editing what you are looking at.
           *
           * A visitor gets the plain bar, with no listener, no draft state and
           * no editor in the payload at all.
           */
          viewerIsOwner ? (
            <LiveSubscribeBar
              settings={{ ...subscribeBarSettings, creatorUserId: profile.id }}
              creatorId={creator.id}
              editor={{
                values: {
                  text: subscribeBarSettings.customCtaText || subscribeBarSettings.text || "",
                  buttonText:
                    storedBar.buttonTextPreset === "custom" ? subscribeBarSettings.buttonText || "" : "",
                  style: subscribeBarSettings.style || "style1",
                  buttonStyle: subscribeBarSettings.buttonStyle || "style1",
                  backgroundColor: subscribeBarSettings.backgroundColor || "",
                  textColor: subscribeBarSettings.textColor || "",
                  buttonColor: subscribeBarSettings.buttonColor || "",
                  buttonTextColor: subscribeBarSettings.buttonTextColor || "",
                },
              }}
            />
          ) : (
            <SubscribeBar settings={{ ...subscribeBarSettings, creatorUserId: profile.id }} creatorId={creator.id} />
          )
        )}

        <ShopHeaderRenderer
          settings={headerSettings}
          creator={creator}
          profile={profile}
          products={products || []}
          productCount={products?.length || 0}
          globalSettings={globalSettings}
          ownerActions={buildOwnerActions(headerSettings, chrome.preset)}
          reviewCount={creatorReviewCount}
          reviewAverage={creatorRating}
          followerCount={followerCount ?? 0}
          /**
           * The scheme's type colours. Without these the block reads its own
           * stored `colors.textColor`, which for nearly every account on the
           * platform is a "#000000" the builder wrote out on some unrelated
           * save — so a creator on a dark scheme got their own name in black
           * on black, which is the screenshot that started this.
           */
          surface={{ textColor: chrome.text, mutedColor: chrome.muted, avatarBorderColor: chrome.avatarBorder }}
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
              sellerContactEmail={publicContactEmail}
              /**
               * The owner's way into the story block, decided here because
               * this is the only place that knows who is looking. The
               * builder's inline "+ Add a story headline" placeholders exist
               * only in the canvas, so a creator on their own page had no way
               * to change the block in front of them.
               */
              aboutOwnerActions={
                viewerIsOwner ? (
                  <EditAboutButton
                    headline={(aboutSection.settings as AboutSettings).headline || ""}
                    story={(aboutSection.settings as AboutSettings).aboutContent || ""}
                    media={(aboutSection.settings as AboutSettings).mediaItems || []}
                    contactEmail={publicContactEmail ?? ""}
                  />
                ) : null
              }
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
                  /*
                    The catalogue in the creator's own order. Unarranged
                    products keep their place at the front, newest first,
                    which is what this tab did before there was an order.
                  */
                  products={applyManualOrder(productsData, headerSettings.productsOrder)}
                  hasManualOrder={(headerSettings.productsOrder?.length ?? 0) > 0}
                  creatorName={profile.display_name}
                  creatorUsername={profile.username}
                  creatorAvatarUrl={profile.avatar_url}
                  isOwner={viewerIsOwner}
                  /**
                   * The builder's "Hide Category Filter" switch lives on the
                   * Featured section, because that is where the filter used to
                   * be. It is the Products tab's filter now, so the setting has
                   * to travel — otherwise it is a control that saves and does
                   * nothing, which it already was once.
                   */
                  showCategoryFilter={
                    !(
                      regularSections.find((s) => s.type === "featured-products")?.settings as
                        | { hideCategoryFilter?: boolean }
                        | undefined
                    )?.hideCategoryFilter
                  }
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
                icon="communities"
                title="No communities yet"
                detail="This creator hasn't opened any yet."
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
              <StorefrontTabs
                tabs={tabs}
                surface={{ textColor: chrome.text, mutedColor: chrome.muted, borderColor: chrome.border }}
              />
              {/*
                The reviews and the About block are wrapped, the products are
                not. See components/storefront/safe-region: a shop that loses
                its reviews is still a shop; a shop that quietly loses its
                products is a page that looks fine and sells nothing.
              */}
              {creatorReviewCount > 0 && (
                <SafeRegion name="reviews">
                  <ReviewsPanel reviews={reviewsForPanel} average={creatorRating} total={creatorReviewCount} />
                </SafeRegion>
              )}
              <SafeRegion name="about">{about}</SafeRegion>
            </>
          )
        })()}

        <SafeRegion name="footer">
          <SellerFooter
            surface={{
              backgroundColor: chrome.footerBackground,
              textColor: chrome.footerText,
              mutedColor: chrome.footerMuted,
              borderColor: chrome.border,
            }}
          />
        </SafeRegion>
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
