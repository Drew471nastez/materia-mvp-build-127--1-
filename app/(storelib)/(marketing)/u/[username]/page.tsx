import {withVariantPrices} from "@/lib/pricing/variant-price"
import { marketplacePricer, type MarketplaceRowPatch } from "@/lib/money/marketplace-server"
import { personName } from "@/lib/profile/display-name"
import { salesStandings } from "@/lib/products/sales-standings"
import { salesSoldOut } from "@/lib/products/sales-limit"
import type React from "react"
import { applyManualOrder } from "@/lib/store-builder/featured-order"
import { headerAvatar } from "@/lib/store-builder/header-avatar"
import { loadCreatorForUser, loadCreatorForUserStrict, loadProfileByUsername, loadProfileByUsernameStrict } from "@/lib/commerce/creator-page-data"
import { heldForCreatorPage } from "@/lib/commerce/creator-page-held"
import { SiteReadError } from "@/lib/website-builder/site-read"
import { isTransientDbError } from "@/lib/website-builder/write-retry"
import { exactIlike } from "@/lib/onepage/username"
import { withoutContactEmail } from "@/lib/commerce/contact-email"
import { primaryHostFor } from "@/lib/custom-domains/store"
import { SafeRegion } from "@/components/storefront/safe-region"
import { notFound, permanentRedirect } from "next/navigation"
import { createPublicReadClient } from "@/lib/supabase/public-read"
import type { SupabaseClient } from "@supabase/supabase-js"
import { createAdminClient } from "@/lib/supabase/admin"
import { AppAvatar } from "@/components/app/app-avatar"
import { keptPhoto } from "@/lib/account/identity"
import { isReservedWord } from "@/lib/reserved-words"
import Image from "next/image"
import { TrackView } from "@/components/analytics/track-view"
import { StoreTracking } from "@/components/website-builder/store-tracking"
import { CreatorLanguage } from "@/components/storefront/creator-language"
import { creatorPageLanguage } from "@/lib/markets/creator-page-language"
import { CaptureTouch } from "@/components/attribution/capture-touch"
import { getPublishedConfig } from "@/lib/store-builder/get-published-config"
import { loadCommunityBlocks } from "@/lib/communities/server/blocks"
import { SectionRenderer, ShopHeaderRenderer, type ProductData } from "@/components/store-builder/section-renderer"
import type { AboutSettings, ShopHeaderSettings, GlobalStoreSettings, Section } from "@/lib/store-builder/types"
import { defaultAboutSettings, defaultShopHeaderSettings, themePresets } from "@/lib/store-builder/defaults"
import { SubscribeBar } from "@/components/store-builder/subscribe-bar"
import { LiveSubscribeBar } from "@/components/store-builder/live-subscribe-bar"
import { cameFromCommunity, showsSubscribeBar } from "@/lib/storefront/subscribe-bar-visibility"
import { DynamicFavicon } from "@/components/store-builder/dynamic-favicon"
import { SellerFooter } from "@/components/storefront/seller-footer"
import { ensureStorefrontOrRedirectToMember } from "@/lib/profile/storefront-gate"
/* The owner's controls load on demand: a visitor never downloads them (components/storefront/owner-controls-lazy.tsx). */
import { EditAboutButtonForOwner, EditProfileButton, OwnerMenu } from "@/components/storefront/owner-controls-lazy"
/* Who is looking is asked after the page loads (round 49): the page is one HTML for everybody, which a CDN may hold. */
import { CreatorPageViewerProvider, OWNER_FADE_IN, OwnerOnly } from "@/components/storefront/creator-page-viewer"
import { EmbeddedNavigation } from "@/components/storefront/embedded-navigation"
import { StorefrontTabs, type StorefrontTab } from "@/components/storefront/storefront-tabs"
/* The scheme handed to the header, the tabs and the footer, shared with a person's page (round 12). */
import { storefrontFooterSurface, storefrontHeaderSurface, storefrontRootStyle, storefrontTabsSurface } from "@/components/storefront/storefront-template"
import { creatorCommunitiesPanel } from "@/components/profile/creator-communities-tab"
import { communitiesEnabled } from "@/lib/communities/flag"
import { withoutCommunityProducts } from "@/lib/communities/listing"
import { creatorCommunityCards } from "@/lib/communities/server/public"
import type { CommunityCard } from "@/lib/communities/types"
import { creatorBadges } from "@/lib/creators/badges"
import { reviewerOf } from "@/lib/reviews/rules"
import { missingColumn } from "@/lib/reviews/store"
import { ProfileSocial } from "@/components/profile/profile-social"
import { ProfileTopBar, TopBarBack } from "@/components/profile/profile-top-bar"
import { ProfileArrival } from "@/components/profile/profile-arrival"
import { communityBackTarget } from "@/lib/profile/back"
import { locationLine, readProfileLocation } from "@/lib/profile/location"
import { profileShareImageUrl, profileShareVersion } from "@/lib/profile/profile-seo"
import type { ActionScheme } from "@/components/profile/follow-button"

/**
 * ===========================================================================
 *  EVERY CREATOR PAGE IS THE SAME PAGE
 * ===========================================================================
 * A creator who uploads a product and never opens the store builder got a
 * different page from one who did: no Products tab, no About block, no
 * dividers, no payment methods. Reported with two screenshots side by side,
 * and the objection is the right one — those are not a customisation anybody
 * chose, they are the page, and their absence reads as a broken account
 * rather than as an unstyled one.
 *
 * There were two reasons for it, and both were rules that made sense in
 * isolation.
 *
 * The About block only existed if the creator's saved config had an `about`
 * section, which only happens once they have been into the builder. But
 * About with nothing typed in it is not empty: it is the seller's name, how
 * long they have been here, what they have sold, and which cards they take.
 * Every one of those is true of a creator who has never opened the builder,
 * and they are exactly what a stranger deciding whether to buy looks for.
 *
 * And the Products tab appeared only above one product, on the reasoning
 * that a tab onto the thing already on screen is a tab worth nothing. True
 * of the tab; not true of the page, which is what a visitor sees. A shop
 * with one product is still a shop, and it should not be missing a tab that
 * every other shop has.
 *
 * So both are defaults now, not rewards for having visited a builder.
 */
const DEFAULT_ABOUT_SECTION_ID = "about-default"

/**
 * The creator's own About section, or the one every page ends with. Added
 * BEFORE the theme colours are applied, so the block a creator has never
 * touched is coloured by exactly the same pass as one they have.
 */
function withDefaultAbout(sections: Section[]): Section[] {
  if (sections.some((section) => section.type === "about")) return sections
  const last = sections.reduce((n, section) => Math.max(n, section.order ?? 0), 0)
  return [
    ...sections,
    {
      id: DEFAULT_ABOUT_SECTION_ID,
      type: "about",
      order: last + 1,
      settings: { ...defaultAboutSettings },
    } as Section,
  ]
}
import { AllProductsGrid } from "@/components/storefront/all-products-grid"
import { FirstProductPrompt, drawableSections, tabsWithoutProducts } from "@/components/storefront/no-products"
import { ReviewsPanel, type StorefrontReview } from "@/components/storefront/reviews-panel"
import { BackLabelSetter } from "@/components/product/discover-back-breadcrumb"
import { creatorIndexable } from "@/lib/seo/indexing"
import { jsonLdScript } from "@/lib/seo/json-ld"
import { isBanned, spamStateOf } from "@/lib/seo/bans"
import { MAX_LISTED_PRODUCTS, profilePageJsonLd, sameAsUrls } from "@/lib/seo/structured-data"
import { plainSummary } from "@/lib/html-entities"
import { getProductShareUrl } from "@/lib/url-helpers"
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
import { resolveStorefrontChrome, type StorefrontBarColors, type StoredChrome } from "@/lib/store-builder/storefront-chrome"
import { SCHEME_PREVIEW_PARAM, previewSchemeFrom, schemeRootPaints, type RootPaint } from "@/lib/store-builder/scheme-preview"
import { planIntervals } from "@/lib/memberships/intervals"
import { offChannel } from "@/lib/store/channel-filter"
import { readLadder } from "@/lib/supabase/missing-memory"

export const dynamic = "force-dynamic"

/**
 * The default page colour behind a creator's white surfaces. Light enough that
 * nobody would call the page grey, dark enough that a white card has an edge.
 */


/**
 * THERE IS NO WHITE HEADER SHEET. Read this before adding one back.
 *
 * The first attempt at giving this page some depth put the top bar, the
 * cover, the profile and the tab strip on one white surface above a grey page.
 * What that produced was a hard horizontal seam across the middle, white above
 * and grey below, which looked like a rendering fault rather than a design.
 *
 * The whole page is the light grey. White is reserved for the things that are
 * meant to sit ON it (the top bar and the product cards), so those read as
 * raised objects and everything else reads as background.
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
  searchParams: Promise<{ src?: string; embedded?: string; scheme?: string; from?: string; back?: string; lang?: string }>
}

export async function generateMetadata({ params }: StorefrontPageProps) {
  const { username } = await params

  if (isReservedWord(username)) {
    return { title: "Page Not Found" }
  }

  /* Read as a stranger, for everybody (round 49): the page and its head are one HTML a CDN may hold. */
  const supabase = createPublicReadClient() as unknown as SupabaseClient

  /*
    THE PAGE'S OWN LOADERS, not a second set of queries.

    This asked for the profile, then the creator, then the config, then the
    SEO override, then the product count: five round trips in a row, three of
    them for rows the page below fetches anyway. The loaders are deduped per
    request, so the profile and the creator are now paid for once between the
    two, and the three reads that only need the creator go out together.
    The lookup is the page's own, case and all, so every address below is
    built from the username as stored, whatever case it was typed in.
  */
  const profile = await loadProfileByUsername(username)

  if (!profile) {
    /* The page below answers 404 or the renamed handle's address; this title is never one to index. */
    return { title: "Creator Not Found", robots: { index: false, follow: false } }
  }
  const handle: string = profile.username || username

  const creator = await loadCreatorForUser(profile.id)

  /*
    THE OVERRIDE AND THE COUNT, HELD FOR EVERY VISITOR (round rel2-public, lib/commerce/creator-page-held): the same for
    everybody, keyed by the ids the live lookup above answered (never by the name alone), cleared by every writer of the
    page and a minute at most. A read that failed is not held.
  */
  const readHead = async () => {
    const [override, publishedProducts] = await Promise.all([
      supabase
        .from("seo_overrides")
        .select("seo_title, seo_description")
        .eq("type", "creator")
        .eq("identifier", handle)
        .maybeSingle(),
      creator
        ? supabase
            .from("products")
            .select("id", { count: "exact", head: true })
            .eq("creator_id", creator.id)
            .eq("status", "published")
            /* Every type, physical too (round 41): a seller of shipped goods is a seller, and the sitemap counts them the same way. */
            .then(({ count, error }) => ({ count: count ?? 0, failed: !!error }))
        : Promise.resolve({ count: 0, failed: false }),
    ])
    return { data: override.data as { seo_title?: string | null; seo_description?: string | null } | null, publishedProducts: publishedProducts.count, failed: !!override.error || publishedProducts.failed }
  }
  const [publishedConfigForMeta, { data: seoOverride, publishedProducts }, pageHost] = await Promise.all([
    creator ? getPublishedConfig(creator.id, "shop") : Promise.resolve(null),
    creator ? heldForCreatorPage(["creator-page-head", "v1", creator.id, profile.id, handle], creator.id, profile.id, readHead, (h) => h.failed) : readHead(),
    /* Cached (lib/custom-domains/store.ts), and needs only the creator. */
    primaryHostFor(creator?.id, "creator_page"),
  ])
  /* An operator's spam verdict, if any (lib/seo/bans.ts): it overrides the handle score both ways. */
  const spamState = await spamStateOf(profile.id)

  let faviconUrl: string | undefined
  let socialPreviewImage: string
  /* The creator's own words for search results, from the page builder's SEO tab. */
  let ownTitle: string | undefined
  let ownDescription: string | undefined
  let headerBio: string | undefined
  if (creator) {
    const publishedConfig = publishedConfigForMeta
    const headerSettings = publishedConfig?.headerSettings as ShopHeaderSettings | undefined
    faviconUrl = headerSettings?.faviconUrl || undefined
    headerBio = headerSettings?.bio || undefined

    const globalSettings = publishedConfig?.globalSettings as GlobalStoreSettings | undefined
    ownTitle = globalSettings?.seoTitle?.trim() || undefined
    ownDescription = globalSettings?.seoDescription?.trim() || undefined
    /* Through lib/account/identity, so a picture a sign in provider sent that
       is still sitting in the header cannot be the share card's face after
       the person replaced or removed their photo. "" means initials. */
    const avatarFromHeader = keptPhoto(headerSettings?.avatarUrl) ?? undefined

    /*
      The picture a shared link shows (round 12: "a dynamic social image
      built from the avatar, name, handle (and cover when set) for both
      creators and people without a store"):
        1) the Social image chosen in SEO settings, which is a picture of the
           shop and not of the person, so it is its own thing and wins
        2) the card drawn for them (/member/<handle>/share.png, the same one
           a person without a store gets: lib/profile/profile-seo.ts), from
           their photo (the profile's, the one face the whole platform
           shows, else the header's copy), name, @handle, bio and cover
      The bare photo used to be the second choice: a square face cropped
      into a wide card, with nothing saying whose page it was.
    */
    const chosenImage = globalSettings?.socialImageUrl && globalSettings.socialImageUrl !== "" ? globalSettings.socialImageUrl : undefined
    socialPreviewImage =
      chosenImage ||
      profileShareImageUrl(
        handle,
        profileShareVersion([
          profile.display_name,
          handle,
          headerBio || creator.bio,
          profile.avatar_url || avatarFromHeader,
          headerSettings?.coverImageUrl || creator.cover_url,
        ]),
      )
  } else {
    socialPreviewImage = profileShareImageUrl(handle, profileShareVersion([profile.display_name, handle, profile.bio, profile.avatar_url]))
  }

  /*
    THE PAGE'S OWN ADDRESS: its own domain when it has one, the address
    canonicals and link previews name. og:url named `<name>.storelib.com`,
    which is the creator's WEBSITE, a different page, so a share of the
    creator page was counted against the website and previewed as it.
  */
  const pageUrl = pageHost ? `https://${pageHost}/` : `https://storelib.com/${handle}`
  const displayTitle = personName({ name: profile.display_name, username: profile.username })
  const defaultDescription = `Check out ${profile.display_name || profile.username}'s products on Storelib`

  /*
    Whose words describe the page, in order: an operator's override, what the
    creator typed in the page builder's SEO tab (offered there for years and
    read by nothing), their headline or bio, which is what that tab says it
    falls back to, and last the sentence every page used to get. The root
    layout adds "| Storelib" to a title, so a typed one loses its own.
  */
  const title = seoOverride?.seo_title?.replace(/ \| Storelib$/i, "") || ownTitle?.replace(/ \| Storelib$/i, "") || displayTitle
  const description =
    seoOverride?.seo_description ||
    ownDescription ||
    plainSummary(creator?.headline || headerBio || creator?.bio || "", 200) ||
    defaultDescription

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "website",
      siteName: "Storelib",
      url: pageUrl,
      images: [
        {
          url: socialPreviewImage,
          width: 1200,
          height: 630,
          alt: `${profile.display_name || profile.username || "Store"} on Storelib`,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [socialPreviewImage],
    },
    alternates: {
      canonical: pageUrl,
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
     * lib/seo/sitemaps.ts applies the identical rule via the same `creatorIndexable`
     * helper. If these two ever disagree, the sitemap is advertising a page
     * that tells crawlers to go away, which is worse than either alone.
     */
    ...(() => {
      /* And not banned: a ban takes the products down, and a product put back afterwards does not buy the page back. */
      const indexable = creatorIndexable({ publishedProducts, handle, spamState }) && !isBanned(creator)
      return {
        robots: indexable
          ? { index: true, follow: true, googleBot: { index: true, follow: true, "max-image-preview": "large" as const } }
          : { index: false, follow: false, googleBot: { index: false, follow: false } },
      }
    })(),
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
  const { src, embedded: embeddedParam, [SCHEME_PREVIEW_PARAM]: schemeParam, from, back, lang } = await searchParams
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

  await ensureStorefrontOrRedirectToMember(username)

  /*
    NOBODY IS ASKED WHO IS LOOKING (round 49). Every read on this page is the
    one a stranger gets, through the anon key with no session, so the HTML is
    the same bytes for a stranger, a signed in visitor, a buyer and the owner,
    and the CDN may hold one copy for all of them (next.config.mjs,
    tests/cdnpages-r49). What was somebody's own (the owner's controls, the
    Contact link for a buyer) is asked after the page loads, by
    components/storefront/creator-page-viewer from /api/creator-page/viewer.
    No cookies(), no headers() anywhere on this render.
  */
  const supabase = createPublicReadClient() as unknown as SupabaseClient

  /**
   * THE SAME LOOKUP THE LAYOUT ALREADY MADE.
   *
   * The layout above this needs the creator's theme to tint the loading
   * skeleton, and it used to fetch this row, the creator row and the shop's
   * config for itself — in series, before anything at all could render. Both
   * go through lib/commerce/creator-page-data now, which dedupes within the
   * request: whichever asks first pays, and the second gets the same promise.
   */
  /* Strict: a read that failed THROWS (the error screen, Try again), never this page's 404. */
  const profile = await loadProfileByUsernameStrict(username)

  if (!profile) {
    // Check username history for redirects (old username → new username)
    const adminSupabase = createAdminClient()
    const { data: historyRecord, error: historyError } = await adminSupabase
      .from("username_history")
      .select("new_username")
      /* Literally: `_` and `%` in an address are not wildcards (exactIlike). */
      .ilike("old_username", exactIlike(username))
      .order("changed_at", { ascending: false })
      .limit(1)
      .maybeSingle()
    /* A failed history read is not "no old name": the error screen, never a 404 for a renamed creator. */
    if (historyError) throw new SiteReadError("username history", historyError.message ?? "the read failed")

    if (historyRecord?.new_username) {
      /* PERMANENT: the old name is gone for good, and a 308 is what tells a
         search engine to move what it knows to the new address, where a 307
         keeps it on the old one. */
      permanentRedirect(`/${historyRecord.new_username}`)
    }

    notFound()
  }

  /* Deduped with the layout's, as above. Strict: a failed read is the error screen, not "nothing set up yet". */
  const creator = await loadCreatorForUserStrict(profile.id)

  if (!creator) {
    return (
      // Same page colour as a real storefront — this is still a creator page,
      // just one with nothing set up on it yet.
      <div className="min-h-screen overflow-x-hidden" style={{ background: STOREFRONT_PAGE_BACKGROUND }}>
        <div className="mx-auto max-w-4xl px-4 py-12">
          <div className="flex flex-col items-center text-center">
            {/* The photo, else the initials, else a plain person. Never a "?". */}
            <AppAvatar
              src={profile.avatar_url}
              name={(profile.display_name || profile.username || "").trim()}
              alt=""
              size={96}
              tone="theme"
              markWhileLoading
              className="shadow-lg"
              style={{ borderWidth: "1.3px", borderStyle: "solid", borderColor: "#e5e7eb" }}
            />
            <h1 className="mt-4 text-2xl font-semibold text-foreground">{profile.display_name || username}</h1>
            <p className="mt-6 text-muted-foreground">This creator hasn't set up their store yet.</p>
          </div>
        </div>
      </div>
    )
  }

  /* The page's own address: its connected domain when it has one (cached,
     started now so it waits on nothing), else storelib.com/<name>. Named by
     the structured data below, like the canonical in generateMetadata. */
  const pageHostPromise = primaryHostFor(creator.id, "creator_page")
  /*
    THE COMMUNITIES TAB: only the ones this creator made, never the ones they
    joined ("Creator pages: NO Activity tab; the Communities tab lists ONLY
    communities they created"). `null` while communities are switched off,
    which is no tab at all; started now, read below.
  */
  const communitiesPromise: Promise<CommunityCard[] | null> = communitiesEnabled()
    .then((on) => (on ? creatorCommunityCards(creator.id) : null))
    .catch(() => null)

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
  /*
    STARTED WITH THE BATCH BELOW, AWAITED WHERE THEY ALWAYS WERE. Whether
    the viewer follows them, where they are from and which products are off
    this page need only the profile, the creator and the viewer, all known or
    in flight by now. They waited for the whole batch and then for each
    other: two more round trips in a row on every visit
    (lib/perf/optimizations.ts). Same reads, same answers.

    NO FOLLOWER OR FOLLOWING COUNT IS READ HERE. The owner (round 38):
    followers and following live on personal profiles and member profiles
    inside communities, not on creator pages. So neither count is queried;
    Follow itself stays.
  */
  /* Whether the viewer follows this creator is no longer read: a creator page has no Follow (r40). */
  /*
    THE ADDRESS THE CREATOR TYPED is not read here (round 49): the published
    config has none (lib/store-builder/public-config.ts, round 48), the
    owner's own About form asks /api/creator-page/viewer for it, and a
    buyer's Contact asks /api/creator-contact.
  */
  /*
    HELD FOR EVERY VISITOR (round rel2-public, lib/commerce/creator-page-held): the products with their variant prices,
    the reviews, where they are from, what is off this page, each limited download's standing and each membership's
    interval are the same for everybody, so they are read once and held, keyed by the creator's and the profile's ids
    (the lookup above is live, so a renamed account never shows somebody else's page) and cleared by every writer of
    the page (lib/storefront/creator-page-purge) and every product writer, a minute at most otherwise: the CDN keeps
    the drawn page that long already. A read that failed is answered for this visit and not held.
  */
  const readCatalogue = async () => {
    const [
      { data: catalogue, error: productsError, status: productsStatus },
      { data: creatorReviews, error: creatorReviewsError },
      place,
      offPage,
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
        /* The marketplace profile sells what Storelib sells; shipped products live on the creator's own website. */
        .neq("type", "physical")
        .order("created_at", { ascending: false }),
      /**
       * The reviews behind the rating in the meta row. Capped, because the tab
       * shows the most recent rather than the complete history and a creator
       * with thousands should not send thousands down the wire to render two
       * columns of cards.
       */
      /*
        ═══════════════════════════════════════════════════════════════════════
         `content`, NOT `comment`, AND THE WHOLE QUERY FAILED ON IT
        ═══════════════════════════════════════════════════════════════════════
        There is no `comment` column on reviews. PostgREST does not skip a
        column it does not recognise, it refuses the request:

            HTTP 400
            42703 column reviews.comment does not exist
            hint: Perhaps you meant to reference the column "reviews.content".

        So this returned no rows, and a creator page with reviews on it said
        "No reviews yet". The product page was right the whole time because it
        asks for `content`, which is why one screen showed a review and the
        other said there were none.
      */
      /*
        ═══════════════════════════════════════════════════════════════════════
         `reviewer_name`, AND WHY A REVIEW HERE HAD NO NAME AND A "?" FOR A FACE
        ═══════════════════════════════════════════════════════════════════════
        A guest reviews from their receipt link (run-now part 52): the row has
        no `buyer_id` and carries the first name they bought with in
        `reviewer_name`. This asked for the profile join alone, so for those
        reviews the panel had nothing to write and nothing to draw: the name
        was left off and the circle fell back to a literal question mark.

        Asked for again without it when part 52 has not run, because PostgREST
        refuses a select naming a column that is not there (42703) rather than
        skipping it, and that would empty the whole panel.
      */
      /*
        With run-now part 134: `verified`, so an imported review without a name
        is never called a verified buyer. The rung that answered is remembered
        per server (lib/supabase/missing-memory.ts, round 54): this page is not
        cached, and on a database without the part every view was refused once
        first. Both column lists are written out rather than built from a
        variable, so tests/review-columns can read them and hold them to the table.
      */
      readLadder(
        "reviews:creator-page",
        [
          () => supabase
            .from("reviews")
            .select("id, rating, content, created_at, reviewer_name, verified, product:products(title, slug), buyer:profiles!buyer_id(display_name, avatar_url)")
            .eq("creator_id", creator.id)
            .order("created_at", { ascending: false })
            .limit(30),
          () => supabase
            .from("reviews")
            .select("id, rating, content, created_at, reviewer_name, product:products(title, slug), buyer:profiles!buyer_id(display_name, avatar_url)")
            .eq("creator_id", creator.id)
            .order("created_at", { ascending: false })
            .limit(30),
          () => supabase
            .from("reviews")
            .select("id, rating, content, created_at, product:products(title, slug), buyer:profiles!buyer_id(display_name, avatar_url)")
            .eq("creator_id", creator.id)
            .order("created_at", { ascending: false })
            .limit(30),
        ],
        missingColumn,
      ),
      readProfileLocation(createAdminClient(), profile.id),
      offChannel(createAdminClient(), creator.id, "creator_page"),
    ])
    const pricedCatalogue = catalogue ? await withVariantPrices(supabase,catalogue) : catalogue
    /* Every product's standing and every membership's interval, read here for the whole catalogue (the page lists a part of it). */
    const [intervals, standings] = await Promise.all([
      planIntervals(supabase, (pricedCatalogue ?? []).filter((p) => p.type === "membership").map((p) => p.id)),
      readStandings((pricedCatalogue ?? []).map((p) => p.id)),
    ])
    return {
      catalogue: pricedCatalogue,
      /* The answer's HTTP status rides along: a 5xx or 429 from Supabase is no answer, not a refusal (the throw below). */
      productsError: productsError ? { message: productsError.message, code: productsError.code, status: productsStatus } : null,
      creatorReviews: (creatorReviews ?? null) as unknown[] | null,
      creatorReviewsError: creatorReviewsError ? { message: (creatorReviewsError as { message?: string }).message } : null,
      place,
      offPage: [...offPage],
      intervals: [...intervals.entries()],
      standings: [...standings.entries()],
    }
  }
  const [held, publishedConfig] = await Promise.all([
    heldForCreatorPage(["creator-page-catalogue", "v1", creator.id, profile.id], creator.id, profile.id, readCatalogue, (r) => !!r.productsError || !!r.creatorReviewsError),
    getPublishedConfig(creator.id, "shop"),
  ])
  const { catalogue: pricedCatalogue, productsError, creatorReviews, creatorReviewsError, place } = held
  /*
    NO ANSWER FROM THE PRODUCTS READ IS THE SHOP'S ERROR SCREEN, NEVER AN EMPTY SHOP (round AW). With no copy held
    for it (a first visit, a save's expire, a deploy: new servers hold no last good copy, and the data cache's keys
    can change with the build), a read that timed out or found the database away drew this store with no products, as a 200, and the CDN
    kept that page for every visitor for five minutes and replaced its own good copy with it (next.config.mjs
    EDGE_PAGE; lib/commerce/creator-page-held says why the copy above is not always there). A throw is a 5xx, which
    Vercel never stores: the CDN goes on serving the last good page, and a visitor with none gets Try again. A read
    that ANSWERED with an error (a query that is wrong, which a retry will not change) still draws the page as before.
  */
  if (productsError && isTransientDbError(productsError, productsError.status)) {
    throw new SiteReadError("creator page products", productsError.message || productsError.code || "the read failed")
  }
  const pageHost = await pageHostPromise
  /* Where the creator is from (held above). No Follow and no Message on a creator page (r40), so nothing reads the follow graph here. */
  /* Opened from a person's profile inside a community: the way back lands there even with nothing behind (lib/profile/back communityBackTarget). */
  const backTarget = communityBackTarget(back)
  /*
    THE WAY BACK, FROM THE ADDRESS ONLY (round 49). It also read the Referer
    here; the same test runs in the browser after load (components/profile/
    profile-top-bar useCameFromSomewhere, document.referrer and the in-app
    history), so a visitor who came from another page of ours still gets it,
    and the HTML no longer depends on where anybody came from.
  */
  const backShown = !!backTarget || from === "community" || from === "explore"
  /* Every address this page answers to, from the handle only (the same for every visitor): coming from one of them is not "from elsewhere" (useCameFromSomewhere). A creator's own website's "/" is the browser's own pathname there. */
  const ownPaths = [`/${username}`, `/u/${username}`, ...(profile.username ? [`/${profile.username}`, `/u/${profile.username}`, `/@${profile.username}`] : [])]
  /*
    WHICH TOP BAR (lib/storefront/subscribe-bar-visibility.ts). Every creator
    page has one. Opened on its own, and in the editor's frame, it is the
    creator's newsletter bar (the owner's has the pencil); from a community it
    is the slim bar with the way back, the photo and the name.
  */
  /* From the address only (round 49): links out of a community carry ?from=community (lib/communities/member-profile-view). */
  const newsletterBar = embedded || showsSubscribeBar({ creatorPage: true, fromCommunity: cameFromCommunity({ from, backTarget, referer: null }) })
  /* A product that sells a community tier is on the Communities tab, not in the grid (lib/communities/listing). */
  /* Settings › Sales channels: a product taken off the Creator page is not in its grid; its own link still opens it. */
  const offPage = new Set<string>(held.offPage)
  /* In the language the address names (?lang=), when the store published it: approved translations of each product laid over (lib/markets/creator-page-language). The proxy sends a visitor who chose one, or whose browser asks for one in a store that shows visitors their own, to that address (round 49). */
  const pageLanguage = embedded ? null : await creatorPageLanguage(creator.id, typeof lang === "string" ? lang : null).catch(() => null)
  const products = pricedCatalogue ? withoutCommunityProducts(pricedCatalogue).filter((p: { id: string }) => !offPage.has(p.id)).map((p) => (pageLanguage ? (pageLanguage.product(p as unknown as Record<string, unknown>) as unknown as typeof p) : p)) : pricedCatalogue
  const communityCards = await communitiesPromise
  const pageAddress = pageHost ? `https://${pageHost}/` : `https://storelib.com/${profile.username || username}`

  /*
    THE OWNER'S CONTROLS: the owner, or (round 42) a team member with Creator
    page working in this very store. Decided in the browser after load
    (round 49, /api/creator-page/viewer asks lib/team/server teamStoreIdFor
    as this page did); every save goes through the routes, which ask again
    (lib/team/creator-page). The server draws the visitor's page for all.
  */

  /*
    ═══════════════════════════════════════════════════════════════════════
     WHAT THE HEADER IS HANDED IS WHAT EVERY VISITOR DOWNLOADS
    ═══════════════════════════════════════════════════════════════════════
    The header is a client component, so every prop it takes is serialised
    into the page for whoever opens it. It was given the whole `creators` row
    and the whole `profiles` row: the account email, the Stripe account and
    customer ids, the plan, the country, the last time they were seen, every
    push preference. None of it was drawn, and all of it was in the HTML of
    every creator page for anybody who looked.

    The contact address is gated on a purchase further down this file, and
    this was handing the account address out beside it regardless.

    So the header gets the fields it reads and nothing else. The server keeps
    the full rows for the decisions it makes itself.
  */
  const headerCreator = {
    cover_url: creator.cover_url ?? null,
    bio: creator.bio ?? null,
    show_total_sales_badge: creator.show_total_sales_badge ?? undefined,
  }
  const headerProfile = {
    display_name: profile.display_name ?? null,
    avatar_url: profile.avatar_url ?? null,
    username: profile.username ?? null,
    created_at: profile.created_at ?? null,
  }

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

  /*
    A DROPPED ERROR IS WHY NOBODY NOTICED FOR SO LONG. `{ data }` on its own
    turns a refused query into an empty list, and an empty list of reviews is
    a completely ordinary thing for a page to have. It is not an exception
    here — the page still renders, with whatever the panel shows for none —
    but it says so, so the next mistyped column is a line in the log rather
    than a screen that quietly disagrees with the product page.
  */
  if (creatorReviewsError) {
    console.error("[creator-page] reviews query failed", {
      creatorId: creator.id,
      message: creatorReviewsError.message,
    })
  }

  const reviewsForPanel: StorefrontReview[] = (creatorReviews || []).map((review: any) => {
    /* The account's display name, else the name the guest bought with. Never the address. */
    const author = reviewerOf(review)
    return {
      id: review.id,
      rating: review.rating,
      /* The column is `content`; `comment` is what the display type calls it. */
      comment: review.content,
      created_at: review.created_at,
      productTitle: review.product?.title ?? null,
      productSlug: review.product?.slug ?? null,
      buyerName: author.named ? author.name : null,
      buyerAvatarUrl: author.avatarUrl,
    }
  })

  /**
   * Built once and handed to whichever header branch renders, so the control
   * cannot end up present on the configured page and missing on the fallback.
   * `null` for everyone who is not the owner — a visitor never receives the
   * component, not even hidden.
   */
  /**
   * WHERE THEY ARE FROM AND FOLLOW under the creator's name, the same block a
   * member's profile has (components/profile/profile-social), drawn in the
   * page's own colours. Not in the editor's canvas, where the page is being
   * edited rather than visited.
   *
   * NO FOLLOWERS OR FOLLOWING ON A CREATOR PAGE (round 38). The owner: "I
   * want followers and following to only be inside profiles, inside
   * communities, not in creator pages at all". So the counts are never
   * drawn here, whatever the old Show followers switch says; the button
   * stays. The owner sees no Follow on their own page, so with no place to
   * show either there is nothing to draw.
   */
  /* NO FOLLOW ON A CREATOR PAGE (r40). The owner: "there should be no follow button". The row is where they are from, or nothing, so no empty gap is left under the name. `scheme` is still taken so both header branches call it the same way. */
  const buildFollowRow = (_scheme?: ActionScheme | null) => {
    if (embedded) return null
    const location = locationLine(place)
    if (!location) return null
    return <ProfileSocial tone="storefront" showCounts={false} location={location} />
  }

  const buildOwnerActions = (
    headerSettings?: ShopHeaderSettings,
    themePreset?: string,
    schemeRoots?: Record<string, RootPaint>,
  ) => {
    const links = headerSettings?.socialLinks
    /* Every prop below is already on the page for everybody (the name, the bio, the pictures, the links): nothing private rides along with the controls. */
    return (
      <OwnerOnly>
      <div className="flex items-center gap-2" style={OWNER_FADE_IN}>
      <EditProfileButton
        embedded={embedded}
        displayName={profile.display_name || ""}
        bio={headerSettings?.bio || creator.bio || ""}
        username={profile.username}
        avatarUrl={headerSettings?.avatarUrl ?? profile.avatar_url}
        coverUrl={headerSettings?.coverImageUrl ?? creator.cover_url}
        coverFocalPoint={headerSettings?.coverFocalPoint ?? null}
        coverZoom={headerSettings?.coverZoom ?? null}
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
          /* What the page really does (r51): the rating needs the old Stats master as well, and the icons hide only on Edit profile's own switch. */
          showReviews: (headerSettings?.showStats ?? true) && (headerSettings?.showReviews ?? true),
          // The sales badge needs both flags to be on, so the switch has to
          // show the AND of them or it lies about its own state.
          showTotalSalesBadge:
            (headerSettings?.showTotalSalesBadge ?? true) && (creator.show_total_sales_badge ?? true),
          showSocialMedia: headerSettings?.hideSocialLinks !== true,
        }}
        themePreset={themePreset}
        schemeRoots={schemeRoots}
      />
      {/* Everything that needs a whole screen rather than a dialog. */}
      <OwnerMenu embedded={embedded} />
      </div>
      </OwnerOnly>
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
  /* The username as stored: the address typed may be /Andrew, the page is /andrew. */
  const pageHandle: string = profile.username || username
  /* The products drawn here leave out physical ones; the rule counts every published product (round 41), asked only when none is drawn. */
  const listedCount =
    (products?.length ?? 0) ||
    ((await supabase.from("products").select("id", { count: "exact", head: true }).eq("creator_id", creator.id).eq("status", "published")).count ?? 0)
  const indexable = creatorIndexable({ publishedProducts: listedCount, handle: pageHandle, spamState: await spamStateOf(profile.id) }) && !isBanned(creator)

  /*
    WHO THE PAGE IS ABOUT, AND WHAT THEY SELL, printed by both branches below
    and only when `indexable`. `sameAs` is every social link the header
    draws, so a search engine can tie this page to the accounts it already
    knows; the products are the published ones this page lists, newest first,
    at most twenty, each at its canonical address (on the page's own
    domain when it has one, like the page).
  */
  const shopHeader = publishedConfig?.headerSettings as ShopHeaderSettings | undefined
  const profileJsonLd = profilePageJsonLd({
    url: pageAddress,
    name: profile.display_name || username,
    image: profile.avatar_url,
    description: shopHeader?.bio || creator.bio,
    sameAs: sameAsUrls(Object.values(shopHeader?.socialLinks ?? {}).map((link) => link?.url)),
    products: (products ?? [])
      .slice(0, MAX_LISTED_PRODUCTS)
      .filter((p) => p.slug && p.title)
      .map((p) => ({ name: p.title as string, url: getProductShareUrl(pageHandle, p.slug, pageHost) })),
  })

  const srcParam = src === "platform" ? "?src=platform" : ""

  /* A membership's card says "$9/month", and "/year" for a yearly only plan: read only when the page sells one (lib/memberships/intervals). */
  /* Limit sales: a download whose limited run has gone says Sold out on its card (lib/products/sales-limit), counted on the server, asked beside the intervals. */
  /* Each card's price as the marketplace shows it: the store's currency, or US dollars once it is switched over (lib/money/marketplace-server). */
  const intervals = new Map(held.intervals)
  const standings = new Map(held.standings)
  const priceOf = await marketplacePricer(createAdminClient(), [creator.id], (products ?? []).map((p) => p.id))
  const productsData: ProductData[] =
    products?.map((p) => ({
      id: p.id,
      slug: p.slug,
      title: p.title,
      thumbnail_url: p.thumbnail_url,
      price_cents: p.price_cents,
      variant_count:p.variant_count,variant_min_price_cents:p.variant_min_price_cents,variant_max_price_cents:p.variant_max_price_cents,variant_prices_known:p.variant_prices_known,single_variant_id:p.single_variant_id,
      type: p.type ?? undefined,
      price_interval: intervals.get(p.id) ?? null,
      compare_at_cents: p.compare_at_cents,
      pay_what_you_want: p.pay_what_you_want ?? null,
      pwyw_min_price_cents: p.pwyw_min_price_cents ?? null,
      sales_count: p.sales_count,
      description: p.description,
      whats_included: p.whats_included,
      gallery_urls: p.gallery_urls,
      categories: p.product_categories?.map((pc: any) => pc.category).filter(Boolean) || [],
      // Already on the row the select above returns — the card shows a rating
      // for free, and only when there is one to show.
      reviews_count: p.reviews_count,
      reviews_average: p.reviews_average,
      ...((p.sold_out||salesSoldOut(standings.get(p.id))) ? { sold_out: true } : {}),
      ...marketplaceCard(priceOf({ ...p, creator_id: creator.id })),
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
     * OFF for as long as it existed, so essentially every stored config on
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
         * builder: the bar is the one control on a creator page with a job to
         * do, and it is not optional. Old configs still hold `visible: false`;
         * this ignores them on purpose.
         */
        visible: true,

        // IMPORTANT:
        // - if customCtaText is empty -> bar uses style text
        // - if customCtaText has value -> bar uses that
        customCtaText: savedSettings.customCtaText || "",

        // keep text only for backward compatibility (don't force a sentence)
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
      // Always visible: see the note above.
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
    /* No typed contact address in it (lib/store-builder/public-config); the owner's own form asks for theirs (round 49, /api/creator-page/viewer). */
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
    /*
      ROUND 49: THE GATE MOVED TO THE BROWSER, THE ADDRESS DID NOT. The page
      hands every visitor the handle; the Contact link is drawn only once
      /api/creator-page/viewer says this person bought from the creator
      (components/storefront/creator-page-viewer useContactShown), and the
      address is still answered by /api/creator-contact alone, which asks the
      same question again (lib/commerce/contact-email.ts) and falls back to
      the account's address as before. Nothing private is in the HTML.
    */
    const publicContactHandle = profile.username || username
    const savedGlobalSettings = publishedConfig.globalSettings as GlobalStoreSettings | undefined
    /**
     * A SCHEME BEING TRIED IN EDIT PROFILE, for the owner only, drawn in
     * place of the saved one and saved by nothing. See
     * lib/store-builder/scheme-preview. The owner's controls are still handed
     * the SAVED scheme, so Cancel knows what to put back.
     */
    /* Its own address (?scheme=), which the CDN never holds (next.config.mjs); round 49: decided by the address alone, since the page no longer asks who is looking. */
    const previewScheme = previewSchemeFrom(schemeParam, true)
    const globalSettings =
      previewScheme && savedGlobalSettings ? { ...savedGlobalSettings, themePreset: previewScheme } : savedGlobalSettings
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
    const storedChrome: StoredChrome = {
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
        /**
         * Which of the four this creator picked themselves. Without it the
         * resolver falls back to guessing from the colour, and a bar whose
         * button text was deliberately set to white reads as one nobody has
         * touched.
         */
        chosen: storedBar.colorChoices,
      },
    }
    const chrome = resolveStorefrontChrome(globalSettings?.themePreset, storedChrome)
    /* The saved scheme, resolved the same way, for the owner's controls. */
    const savedPreset = previewScheme ? resolveStorefrontChrome(savedGlobalSettings?.themePreset).preset : chrome.preset
    /* What each scheme paints the page's root with, so a press shows at once. For the owner's controls; colours only. */
    const schemeRoots = schemeRootPaints(storedChrome)
    const subscribeBarSettings = buildSubscribeBarSettings(headerSettings, chrome.bar)
    /* The exact URL the header will request; see the preload below. */
    const headerAvatarPreload = headerAvatar(headerSettings, profile.avatar_url)
    // Calculate total sales for About section
    const totalSales = products?.reduce((acc, p) => acc + (p.sales_count || 0), 0) || 0
    /*
      SALES LIVE IN ABOUT ONLY, beside Joined and Products, above the payment
      methods; the header no longer prints them. The creator's Sales count
      switch (both flags, as the profile dialog shows it) decides whether the
      About figure is there at all.
    */
    const salesShown = (headerSettings?.showTotalSalesBadge ?? true) && (creator.show_total_sales_badge ?? true)
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
    const themedSections = applySectionThemeColors(withDefaultAbout(publishedConfig.sections)).map((section) => ({
      ...section,
      settings: {
        ...section.settings,
        colors: {
          ...section.settings.colors,
          backgroundColor: storefrontSectionBackground(section.settings.colors?.backgroundColor),
        },
      },
    }))

    /* The Community sections' live data, read here on the server: nothing while communities are off, and only this creator's published, public communities (lib/communities/server/blocks.ts). No read at all on a page without one. */
    const communityBlocks = themedSections.some((s) => s.type === "community") ? await loadCommunityBlocks(createAdminClient(), creator.id, themedSections) : {}

    const breadcrumbJsonLd = {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Explore", item: "https://storelib.com/explore" },
        { "@type": "ListItem", position: 2, name: profile.display_name || username },
      ],
    }

    return (
      <CreatorPageViewerProvider creatorId={creator.id}>
        {indexable && (
          <>
            <script
              type="application/ld+json"
              dangerouslySetInnerHTML={{ __html: jsonLdScript(profileJsonLd) }}
            />
            <script
              type="application/ld+json"
              dangerouslySetInnerHTML={{ __html: jsonLdScript(breadcrumbJsonLd) }}
            />
          </>
        )}
        {/*
          THE PAGE IS A VERY LIGHT GREY, not white.

          Everything on a creator page is white: the top bar, the header, the
          tab strip, every product card. So on a white page there was
          nothing to see them against and the whole thing read as one
          undifferentiated sheet. A grey barely darker than the cards is enough
          to give each surface an edge without drawing a single border.

          A creator who has chosen their own page colour still gets it; this is
          only the default.
        */}
        <div
          /* clip, not hidden: hidden makes this a scroll box of its own, and the top bar's sticky would stick to it rather than the window. */
          className="min-h-screen overflow-x-clip"
          /* The element a scheme press repaints before the render lands (scheme-preview). */
          data-storefront-root=""
          /**
           * The scheme's colours AND the design system's variables rebound to
           * them, so `text-muted-foreground`, `bg-card` and `border-border`
           * inside this subtree mean what the creator's scheme says rather
           * than what the Storelib app says. See storefront-chrome.ts.
           */
          style={storefrontRootStyle(chrome)}
          /* A creator's page keeps its creator's colours in the person's dark look (lib/appearance, round 28); round 31, the header and the sheets around it follow the person (app/theme-dark.css leaves this out). */
          data-own-look=""
        >
          {/* Where this visit came from, for an order or a sign-up that starts here (lib/attribution). */}
          <CaptureTouch creatorId={creator.id} property="creator_page" />
          <DynamicFavicon avatarUrl={profile.avatar_url} faviconUrl={headerSettings.faviconUrl} />
          {/* In the workspace's canvas, a product link has to stay framable. */}
          {embedded && <EmbeddedNavigation />}
        <TrackView type="store" creatorId={creator.id} />
        {/* The store's own Google Analytics and pixels (Settings › Integrations), as on its website; never in the editor's canvas. */}
        {!embedded && <StoreTracking creatorId={creator.id} />}

        {newsletterBar && (
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
           * Everybody is drawn the plain bar (round 49: one HTML for all);
           * the owner's own, with the pencil, replaces it once the page has
           * asked who is looking (components/storefront/creator-page-viewer).
           */
          <OwnerOnly
            fallback={
            <SubscribeBar
              settings={{ ...subscribeBarSettings, creatorUserId: profile.id }}
              creatorId={creator.id}
              leading={!embedded ? <TopBarBack initiallyShown={backShown} ownPaths={ownPaths} /> : undefined}
            />
            }
          >
            <LiveSubscribeBar
              settings={{ ...subscribeBarSettings, creatorUserId: profile.id }}
              creatorId={creator.id}
              leading={!embedded ? <TopBarBack initiallyShown={backShown} ownPaths={ownPaths} /> : undefined}
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
          </OwnerOnly>
        )}

        {/*
          ===================================================================
           THE AVATAR STARTS DOWNLOADING WITH THE HTML, NOT AFTER HYDRATION
          ===================================================================
          Radix's Avatar loads its picture with a detached `new Image()` inside
          an effect, so the request cannot begin until the bundle has arrived,
          parsed and hydrated. On a phone that is most of a second of empty
          circle before the download even starts — "sometimes it takes some
          time to load the profile avatar", exactly.

          A preload in the server-rendered HTML is found by the browser's
          preload scanner in the first bytes of the document, so the picture is
          usually in cache by the time Radix asks. The URL comes from the same
          helper the header itself calls: one character of difference and this
          downloads the avatar a second time and shows it no sooner.
        */}
        {/* Arriving from a community: a native push, and the cover only once it is whole (round 15, components/profile/profile-arrival). */}
        <ProfileArrival />
        {/* From a community the top bar is this slim one, the way back, the photo and the name, in the bar's scheme colours (lib/storefront/subscribe-bar-visibility.ts). */}
        {!embedded && !newsletterBar ? (
          <ProfileTopBar
            always
            initiallyShown={backShown}
            ownPaths={ownPaths}
            name={profile.display_name || username}
            avatarUrl={profile.avatar_url ?? null}
            colors={{ background: chrome.bar.backgroundColor, text: chrome.bar.textColor }}
            width="max-w-[1150px]"
            fallback={backTarget ?? undefined}
          />
        ) : null}

        {headerAvatarPreload.url && (
          // eslint-disable-next-line @next/next/no-page-custom-font
          <link rel="preload" as="image" href={headerAvatarPreload.url} fetchPriority="high" />
        )}

        <ShopHeaderRenderer
          /* Without contactEmail: a client component's props are in the page's payload (lib/commerce/contact-email.ts). */
          settings={withoutContactEmail(headerSettings)}
          creator={headerCreator}
          profile={headerProfile}
          products={productsData}
          productCount={products?.length || 0}
          globalSettings={globalSettings}
          ownerActions={buildOwnerActions(headerSettings, savedPreset, schemeRoots)}
          reviewCount={creatorReviewCount}
          reviewAverage={creatorRating}
          followRow={buildFollowRow(chrome.action)}
          badges={creatorBadges(profile)}
          /**
           * The scheme's type colours. Without these the block reads its own
           * stored `colors.textColor`, which for nearly every account on the
           * platform is a "#000000" the builder wrote out on some unrelated
           * save — so a creator on a dark scheme got their own name in black
           * on black, which is the screenshot that started this.
           */
          surface={storefrontHeaderSurface(chrome)}
        />
        {(() => {
          // Separate About section to render last
          /*
            Only the sections that will draw something: a hidden one, an empty
            one, one the live page has no drawing for, a community that is
            gone, or a product rail without products all drew nothing but
            their spacing, and a Home of only those was the blank band under
            an empty "Home" tab (components/storefront/no-products drawableSections).
          */
          const regularSections = drawableSections(
            themedSections.filter((s) => s.type !== "about").sort((a, b) => a.order - b.order),
            { productCount: productsData.length, communityBlocks },
          )
          const aboutSection = themedSections.find((s) => s.type === "about")

          /**
           * About moves OUT of Home and into its own tab. It used to be pinned
           * last in the Home panel, below every other section, which is where
           * nobody reads it — and with a tab bar across the top there is now
           * somewhere obvious for it to live. It is only offered when the
           * creator actually has an About section.
           */
          /**
           * ═══════════════════════════════════════════════════════════════
           *  A PAGE WITH PRODUCTS ON IT SHOWS THE PRODUCTS
           * ═══════════════════════════════════════════════════════════════
           * Only the Featured section draws a catalogue, so a page arranged
           * without one — saved before that section existed, or a creator
           * who removed it while laying the page out — rendered whatever
           * sections it had and no products at all. A creator who had
           * published one got a header, a tab strip and a horizon.
           *
           * Reported twice, the second time after the same hole had been
           * closed for a page with NO configuration at all, which is how it
           * became clear there were two ways to arrive at the same empty
           * page rather than one.
           *
           * So the rule is the page's, not the branch's: if the creator has
           * published products and nothing on the page is going to show
           * them, the catalogue goes at the end. A page that does have a
           * Featured section is untouched, because that section is the
           * creator's own answer to this and a second grid under it would be
           * the same products twice.
           */
          const showsProducts = regularSections.some((s) => s.type === "featured-products")
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
                  /* One arrangement, both tabs. See applyManualOrder. */
                  productsOrder={headerSettings?.productsOrder}
                  communityBlocks={communityBlocks}
                />
              ))}

              {!showsProducts && productsData.length > 0 && (
                <AllProductsGrid
                  products={applyManualOrder(productsData, headerSettings.productsOrder)}
                  hasManualOrder={(headerSettings.productsOrder?.length ?? 0) > 0}
                  creatorName={profile.display_name}
                  creatorUsername={profile.username}
                  creatorAvatarUrl={profile.avatar_url}
                />
              )}
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
              sellerMemberSince={profile.created_at}
              sellerTotalSales={salesShown ? totalSales : 0}
              sellerProductsCount={productsCount}
              sellerContactHandle={publicContactHandle}
              /**
               * The owner's way into the story block, decided here because
               * this is the only place that knows who is looking. The
               * builder's inline "+ Add a story headline" placeholders exist
               * only in the canvas, so a creator on their own page had no way
               * to change the block in front of them.
               */
              aboutOwnerActions={
                <OwnerOnly>
                  <EditAboutButtonForOwner
                    headline={(aboutSection.settings as AboutSettings).headline || ""}
                    story={(aboutSection.settings as AboutSettings).aboutContent || ""}
                    media={(aboutSection.settings as AboutSettings).mediaItems || []}
                  />
                </OwnerOnly>
              }
            />
          ) : null

          /**
           * Both panels are rendered HERE, on the server, and handed to the tab
           * strip as props. Switching tabs is then a visibility change — no
           * fetch, no spinner, no second render of the sections — and Home is
           * still in the first HTML the visitor and the crawler receive.
           *
           * The Products tab is there whenever there is a product, including
           * when there is exactly one. It used to want two, on the reasoning
           * that a tab onto the thing already on screen is worth nothing —
           * true of the tab, and not true of the page. A visitor does not see
           * a tab that was not worth drawing; they see a shop missing a tab
           * that every other shop has, and cannot tell that from an account
           * that is half set up. StorefrontTabs renders a lone panel bare,
           * with no strip, so a creator with no products still gets no strip.
           */
          const noProducts = productsData.length === 0
          /* No products: Home is a tab only when something is left in it (components/storefront/no-products). */
          const tabs: StorefrontTab[] = noProducts
            ? tabsWithoutProducts({ home: regularSections.length > 0 ? home : null, communitiesPanel: creatorCommunitiesPanel(communityCards), communities: communityCards })
            : [{ id: "home", label: "Home", panel: home }]
          if (!noProducts) {
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
           * COMMUNITIES. The creator's published, public communities as cards
           * in their own scheme (lib/communities/server/public.ts
           * creatorCommunityCards), or "No communities yet" when they have
           * made none. No tab while communities are switched off.
           */
          const communitiesPanel = noProducts ? null : creatorCommunitiesPanel(communityCards)
          if (communitiesPanel) {
            tabs.push({
              id: "communities",
              label: "Communities",
              panel: communitiesPanel,
            })
          }

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
              {/* The creator on their own page with nothing published: one quiet line and the way to a first product. */}
              {noProducts && !embedded ? <OwnerOnly><FirstProductPrompt scheme={chrome.action} /></OwnerOnly> : null}
              {tabs.length ? (
                <StorefrontTabs
                  tabs={tabs}
                  surface={storefrontTabsSurface(chrome)}
                />
              ) : null}
              {/*
                The reviews and the About block are wrapped, the products are
                not. See components/storefront/safe-region: a shop that loses
                its reviews is still a shop; a shop that quietly loses its
                products is a page that looks fine and sells nothing.
              */}
              {creatorReviewCount > 0 && (
                <SafeRegion name="reviews">
                  <ReviewsPanel reviews={reviewsForPanel} average={creatorRating} total={creatorReviewCount} creatorUsername={username} />
                </SafeRegion>
              )}
              <SafeRegion name="about">{about}</SafeRegion>
            </>
          )
        })()}

        <SafeRegion name="footer">
          {pageLanguage ? <CreatorLanguage code={pageLanguage.code} defaultLanguage={pageLanguage.defaultLanguage} languages={pageLanguage.languages} /> : null}
          <SellerFooter surface={storefrontFooterSurface(chrome)} />
        </SafeRegion>
      </div>
      </CreatorPageViewerProvider>
    )
  }

  // Default rendering when no custom config exists. The initials, sales total
  // and badge flag that used to be computed here belonged to the hand-written
  // header this branch no longer has — UnifiedShopHeader derives all three from
  // the props it is given.
  const productCount = products?.length ?? 0
  /* The same sum the configured branch makes for its About block. */
  const fallbackTotalSales = products?.reduce((acc, p) => acc + (p.sales_count || 0), 0) || 0

  // Use default subscribe bar settings for stores without published config
  const defaultSubscribeSettings = buildSubscribeBarSettings()

  const defaultBreadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Explore", item: "https://storelib.com/explore" },
      { "@type": "ListItem", position: 2, name: profile.display_name || username },
    ],
  }

  return (
    <CreatorPageViewerProvider creatorId={creator.id}>
      {indexable && (
        <>
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: jsonLdScript(profileJsonLd) }}
          />
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: jsonLdScript(defaultBreadcrumbJsonLd) }}
          />
        </>
      )}
      <div
        className="min-h-screen overflow-x-clip"
        style={{ background: STOREFRONT_PAGE_BACKGROUND }}
        data-own-look=""
      >
        <CaptureTouch creatorId={creator.id} property="creator_page" />
        <DynamicFavicon avatarUrl={profile.avatar_url} />
        <BackLabelSetter label={profile.display_name || username} />
      <TrackView type="store" creatorId={creator.id} />
        {/* The store's own Google Analytics and pixels (Settings › Integrations), as on its website; never in the editor's canvas. */}
        {!embedded && <StoreTracking creatorId={creator.id} />}

      {newsletterBar && (
        <SubscribeBar
          settings={{ ...defaultSubscribeSettings, creatorUserId: profile.id }}
          creatorId={creator.id}
          leading={!embedded ? <TopBarBack initiallyShown={backShown} ownPaths={ownPaths} /> : undefined}
        />
      )}

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
      <ProfileArrival />
      {!embedded && !newsletterBar ? (
        <ProfileTopBar always initiallyShown={backShown} ownPaths={ownPaths} name={profile.display_name || username} avatarUrl={profile.avatar_url ?? null} width="max-w-[1150px]" fallback={backTarget ?? undefined} />
      ) : null}
      <ShopHeaderRenderer
        settings={defaultShopHeaderSettings}
        creator={headerCreator}
        profile={headerProfile}
        products={productsData}
        productCount={productCount}
        ownerActions={buildOwnerActions(defaultShopHeaderSettings)}
        reviewCount={creatorReviewCount}
        reviewAverage={creatorRating}
        followRow={buildFollowRow(resolveStorefrontChrome(undefined).action)}
        badges={creatorBadges(profile)}
      />

      {/**
        * ═══════════════════════════════════════════════════════════════════
        *  PUBLISHING A PRODUCT PUBLISHES THE PAGE IT IS ON
        * ═══════════════════════════════════════════════════════════════════
        * This branch is a creator who has never opened the page builder, and
        * it drew the header and then the footer. Nothing in between. A
        * creator who signed up, made a product and pressed Publish got an
        * avatar, a name, a tab strip and a horizon — their product existed,
        * was published, had its own page, and was nowhere on theirs.
        *
        * Reported with a screenshot of exactly that, and it is the right
        * complaint: publishing a product is the act of putting it on sale,
        * and nobody publishes one in order to then go and design a page
        * before anybody can see it. There is no second step to explain
        * because there should not be one.
        *
        * The same grid the Products tab uses, so a page that was never
        * arranged looks like one that was, and the day the creator does open
        * the builder they are changing something they have already seen
        * rather than filling in a blank.
        *
        * `products` here is already the published ones, newest first: the
        * query above asks for status published and nothing else reaches this
        * branch.
        */}
      {/**
        * ═══════════════════════════════════════════════════════════════════
        *  AND THE SAME TABS AND THE SAME ENDING AS EVERY OTHER PAGE
        * ═══════════════════════════════════════════════════════════════════
        * This branch drew the header, a bare grid and the footer. Against a
        * creator who had been into the builder it was missing the tab strip,
        * the Products tab with its filter, the divider, the About block with
        * the seller's name and stats, and the payment methods. None of that
        * is a customisation anybody chose — it is the page — so a creator who
        * simply uploaded a product looked like a broken account rather than
        * an unstyled one. Reported with the two side by side.
        *
        * The same components the configured branch uses, in the same order,
        * so there is one answer to what a creator page looks like.
        */}
      {(() => {
        /* No products: no Home over nothing, the communities on their own, and the owner's line (components/storefront/no-products). */
        if (productsData.length === 0) {
          const bare = tabsWithoutProducts({ home: null, communitiesPanel: creatorCommunitiesPanel(communityCards), communities: communityCards })
          return (
            <>
              {!embedded ? <OwnerOnly><FirstProductPrompt /></OwnerOnly> : null}
              {bare.length ? <StorefrontTabs tabs={bare} /> : null}
            </>
          )
        }
        const tabs: StorefrontTab[] = [
          {
            id: "home",
            label: "Home",
            panel: (
              <AllProductsGrid
                products={productsData}
                creatorName={profile.display_name}
                creatorUsername={profile.username}
                creatorAvatarUrl={profile.avatar_url}
              />
            ),
          },
        ]
        tabs.push({
          id: "products",
          label: "Products",
          panel: (
            <AllProductsGrid
              products={productsData}
              creatorName={profile.display_name}
              creatorUsername={profile.username}
              creatorAvatarUrl={profile.avatar_url}
            />
          ),
        })
        /* The communities they made, or "No communities yet" (components/profile/creator-communities-tab.tsx); no Activity tab on a creator page. */
        const communitiesPanel = creatorCommunitiesPanel(communityCards)
        if (communitiesPanel) {
          tabs.push({
            id: "communities",
            label: "Communities",
            panel: communitiesPanel,
          })
        }
        return <StorefrontTabs tabs={tabs} />
      })()}

      {/*
        THE REVIEWS, AS ON EVERY OTHER PAGE. The header above claims a rating
        ("4.5 · 2 reviews") on this branch too, and the claim had nowhere to
        be read: the configured page puts the reviews here, between the tabs
        and About, and this one skipped them. Same condition, same panel.
      */}
      {creatorReviewCount > 0 && (
        <SafeRegion name="reviews">
          <ReviewsPanel reviews={reviewsForPanel} average={creatorRating} total={creatorReviewCount} creatorUsername={username} />
        </SafeRegion>
      )}

      {/* The About block every page ends with: who the seller is, how long
          they have been here, what they have sold, and which cards they
          take. All four are true of somebody who has never opened the
          builder. */}
      <SectionRenderer
        section={{
          id: DEFAULT_ABOUT_SECTION_ID,
          type: "about",
          order: 0,
          settings: { ...defaultAboutSettings },
        } as Section}
        products={productsData}
        creatorName={profile.display_name || undefined}
        creatorUsername={profile.username}
        creatorAvatarUrl={profile.avatar_url}
        sellerMemberSince={profile.created_at}
        sellerTotalSales={(creator.show_total_sales_badge ?? true) ? fallbackTotalSales : 0}
        sellerProductsCount={productsData.length}
        aboutOwnerActions={
          <OwnerOnly>
            <EditAboutButtonForOwner headline="" story="" media={[]} />
          </OwnerOnly>
        }
      />

      {pageLanguage ? <CreatorLanguage code={pageLanguage.code} defaultLanguage={pageLanguage.defaultLanguage} languages={pageLanguage.languages} /> : null}
      <SellerFooter />
    </div>
    </CreatorPageViewerProvider>
  )
}

/** Each limited download's standing, read with the server's own client (product_sales_status is server only). Empty when it cannot be read. */
async function readStandings(productIds: string[]) {
  try {
    const { createAdminClient } = await import("@/lib/supabase/admin")
    return await salesStandings(createAdminClient(), productIds)
  } catch {
    return new Map<string, import("@/lib/products/sales-limit").SalesStanding>()
  }
}

/** A card's marketplace price: dollars once the store is switched over (the amounts and the currency), else its store's currency alone. */
function marketplaceCard(patch: MarketplaceRowPatch): Partial<ProductData> {
  const out: Partial<ProductData> = { currency: patch.currency,...(patch.variant_min_price_cents!==undefined?{variant_min_price_cents:patch.variant_min_price_cents,variant_max_price_cents:patch.variant_max_price_cents}:{}) }
  if (typeof patch.price_cents === "number") out.price_cents = patch.price_cents
  if (patch.pwyw_min_price_cents !== undefined) out.pwyw_min_price_cents = patch.pwyw_min_price_cents
  if (patch.compare_at_cents !== undefined) out.compare_at_cents = patch.compare_at_cents ?? undefined
  return out
}
