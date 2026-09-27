import { notFound, permanentRedirect } from "next/navigation"
import { cache } from "react"
import { createAdminClient } from "@/lib/supabase/admin"
import type { Metadata } from "next"
import { PublicOnePage } from "@/components/onepage/public-onepage"
import { headers } from "next/headers"
import { getLinksInternalPath, getLinksShareUrl, getLinksUrlWithCustomDomain } from "@/lib/url-helpers"
import { primaryHostFor } from "@/lib/custom-domains/store"
import { onePageIndexable } from "@/lib/seo/indexing"
import { isBanned } from "@/lib/seo/bans"
import { jsonLdScript } from "@/lib/seo/json-ld"
import { onePageSameAs, profilePageJsonLd } from "@/lib/seo/structured-data"
import { activeDomainOf } from "@/lib/website-builder/site-seo-data"
import { publicOnePage } from "@/lib/onepage/public-shape"
import { withLiveProducts, type ProductsDb } from "@/lib/onepage/live-products"
import { creatorName, creatorPhoto, keptPhoto, typedSeoTitle } from "@/lib/account/identity"
import crypto from "crypto"

// Hash IP address for privacy (same as track API)
function hashIP(ip: string): string {
  return crypto.createHash("sha256").update(ip + process.env.SUPABASE_URL).digest("hex").slice(0, 16)
}

export const dynamic = "force-dynamic"

interface Props {
  params: Promise<{ slug: string }>
}

/**
 * ===========================================================================
 *  WHOSE ONEPAGE THIS IS, AND WHETHER A SEARCH ENGINE MAY LIST IT
 * ===========================================================================
 * The page had no canonical, no og:url and no robots rule of its own, so every
 * OnePage was indexable at every address it answers on, a link farm's page of
 * outbound links included, while the sitemap was careful to list only the ones
 * whose owner has earned a creator page (lib/seo/sitemaps.ts). This answers
 * the questions both need, once per request (React `cache`), for the metadata
 * and the page alike:
 *
 *   handle      the owner's username, which the page is canonical under:
 *               storelib.com/<handle>/links, or /links on their connected
 *               domain, where the proxy serves the same page
 *   indexable   the sitemap's own rule, lib/seo/indexing.ts onePageIndexable
 *   banned      an operator banned the owner: the page is not served at all,
 *               as their products are not (lib/seo/bans.ts)
 *
 * The creator row is read whole (`*`), the way the product page reads it, so
 * a column one database has and another does not cannot fail the read.
 */
const onePageOwner = cache(async (sellerId: string | null, creatorId: string | null, ownerId: string | null) => {
  const supabase = createAdminClient()
  const effective = sellerId || creatorId || null
  const { data: creator } = effective
    ? await supabase.from("creators").select("*").eq("id", effective).maybeSingle()
    : ownerId
      ? await supabase.from("creators").select("*").eq("user_id", ownerId).maybeSingle()
      : { data: null }
  const row = creator as { id?: string; user_id?: string | null; banned_at?: string | null } | null
  // profiles.avatar_url and profiles.display_name are the single source of
  // truth: Settings and Store Builder both sync to them, and every copy of
  // them follows a change (lib/account/profile-follow).
  const userId = ownerId || row?.user_id || null
  const { data: profile } = userId
    ? await supabase.from("profiles").select("avatar_url, display_name, username").eq("id", userId).maybeSingle()
    : { data: null }
  const id = row?.id ?? effective
  const [products, domain] = await Promise.all([
    id
      ? supabase.from("products").select("id", { count: "exact", head: true }).eq("creator_id", id).eq("status", "published")
      : Promise.resolve({ count: 0 }),
    id ? activeDomainOf(id) : Promise.resolve(null),
  ])
  const handle = (profile as { username?: string | null } | null)?.username || null
  return {
    handle,
    banned: isBanned(row),
    avatarUrl: (profile as { avatar_url?: string | null } | null)?.avatar_url || null,
    displayName: (profile as { display_name?: string | null } | null)?.display_name || null,
    publishedProducts: products.count ?? 0,
    canonical: handle ? (domain ? getLinksUrlWithCustomDomain(handle, domain) : getLinksShareUrl(handle)) : null,
  }
})

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params

  const supabase = createAdminClient()

  // First try to find onepage by slug
  let { data: onepage, error } = await supabase
    .from("onepages")
    .select("published_profile, settings, seller_id, creator_id, owner_id, avatar_url, title, status")
    .eq("slug", slug)
    .eq("status", "published")
    .single()

  // If not found by slug, try to find by username (for subdomain routing)
  if (error || !onepage) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("id, username")
      .ilike("username", slug)
      .maybeSingle()

    if (profile) {
      const { data: creator } = await supabase
        .from("creators")
        .select("id")
        .eq("user_id", profile.id)
        .maybeSingle()

      if (creator) {
        const { data: creatorOnepage } = await supabase
          .from("onepages")
          .select("published_profile, settings, seller_id, creator_id, owner_id, avatar_url, title, status")
          .or(`seller_id.eq.${creator.id},creator_id.eq.${creator.id}`)
          .eq("status", "published")
          .maybeSingle()

        if (creatorOnepage) {
          onepage = creatorOnepage
          error = null
        }
      }

      if (!onepage) {
        const { data: ownerOnepage } = await supabase
          .from("onepages")
          .select("published_profile, settings, seller_id, creator_id, owner_id, avatar_url, title, status")
          .eq("owner_id", profile.id)
          .eq("status", "published")
          .maybeSingle()

        if (ownerOnepage) {
          onepage = ownerOnepage
          error = null
        }
      }
    }
  }

  if (!onepage) {
    return { title: slug || "Page Not Found" }
  }

  const profile = onepage.published_profile as any
  const settings = onepage.settings as any

  const effectiveSellerId = onepage.seller_id || onepage.creator_id || null

  // The owner's live profile: the name and the photo, with the handle and
  // the indexing answer beside them (onePageOwner above).
  const owner = await onePageOwner(onepage.seller_id ?? null, onepage.creator_id ?? null, onepage.owner_id ?? null)
  const userProfileAvatarUrl: string | null = owner.avatarUrl

  /*
    ===========================================================================
     THE NAME AND THE FACE IN THE TAB ARE THE ONES ON THE PAGE
    ===========================================================================
    "Why is it still showing Zarra Bianco and my old picture?" The page body
    read the name through lib/onepage/public-shape and got it right; this
    built its own, from the copy taken when the page was published and
    nothing else, and stopped at "Creator" rather than asking the profile.
    So a creator who renamed themselves saw the old name in the phone's
    bottom bar for as long as they did not republish.

    One resolver now answers both (lib/account/identity): the page's
    published name, its draft name, then the live profile. Same order for
    the picture, with a sign in provider's photo left in a copy passed over,
    because lib/account/avatar says that one belongs to the profile alone.
  */
  const displayName =
    creatorName({ published: profile?.title, own: onepage.title, live: owner.displayName }) || "Creator"
  /* A Meta title that is only the page's name again is what the SEO card
     filled its box with, not something anybody typed (typedSeoTitle). */
  const seoTitle = typedSeoTitle(settings?.seo_title, displayName) ?? undefined
  // For browser tab: let the root layout template add "| Storelib"
  // If user set a custom SEO title, use it as-is (absolute) to avoid template doubling
  const pageTitle = seoTitle || displayName
  const ogTitle = seoTitle?.replace(/ \| Storelib$/i, "") || displayName

  // Favicon
  let faviconUrl: string | null | undefined = creatorPhoto({
    published: profile?.avatar_url,
    own: onepage.avatar_url,
    live: userProfileAvatarUrl,
  })
  /* The sitemap's rule, so a page it does not list does not ask to be listed. */
  const indexable = !owner.banned && onePageIndexable({ status: onepage.status, publishedProducts: owner.publishedProducts, handle: owner.handle })

  if (!faviconUrl && effectiveSellerId) {
    try {
      const { data: storeConfig } = await supabase
        .from("store_builder_configs")
        .select("published_config")
        .eq("creator_id", effectiveSellerId)
        .eq("page_type", "shop")
        .maybeSingle()

      /* Through the same rule, so a picture Google sent that is still sitting
         in the page header cannot be the icon either (lib/account/identity). */
      const headerSettings = storeConfig?.published_config?.headerSettings as any
      faviconUrl = keptPhoto(headerSettings?.avatarUrl) || keptPhoto(headerSettings?.faviconUrl)
    } catch {
      // Ignore
    }
  }

  // The share card's picture: the creator's own social image when they set
  // one, else the same face the tab shows.
  const socialImageUrl = settings?.social_image_url || faviconUrl || undefined

  /*
    The address it is shared at: <creator page domain>/links, or
    storelib.com/<handle>/links under the owner's own handle, which is the
    one the sitemap lists (onePageOwner). The address it was reached at when
    there is no handle to name.
  */
  const pageHost = await primaryHostFor(effectiveSellerId, "creator_page")
  const pageAddress = owner.canonical ?? getLinksShareUrl(slug, pageHost)

  return {
    title: pageTitle,
    description: settings?.seo_description || profile?.bio || undefined,
    /*
      ONE ADDRESS. The same page answers at storelib.com/<handle>/links, at
      /l/<slug>, and at /links on a connected domain; the canonical names the
      one the creator gives out, and the share card says the same.
    */
    alternates: { canonical: pageAddress },
    openGraph: {
      url: pageAddress,
      title: ogTitle,
      description: settings?.seo_description || profile?.bio || undefined,
      type: "profile",
      ...(owner.handle ? { username: owner.handle } : {}),
      images: socialImageUrl ? [socialImageUrl] : undefined,
    },
    twitter: {
      card: socialImageUrl ? "summary_large_image" : "summary",
      title: ogTitle,
      description: settings?.seo_description || profile?.bio || undefined,
      images: socialImageUrl ? [socialImageUrl] : undefined,
    },
    /*
      Not listed means not indexed, and not followed: the links are the
      whole page, and on a farm's page they are what it was made for. The
      creator page makes the same call (app/(marketing)/u/[username]).
    */
    robots: indexable
      ? { index: true, follow: true, googleBot: { index: true, follow: true, "max-image-preview": "large" as const } }
      : { index: false, follow: false, googleBot: { index: false, follow: false } },
    ...(faviconUrl && {
      icons: {
        icon: faviconUrl,
        apple: faviconUrl,
      },
    }),
  }
}

export default async function PublicOnePageRoute({ params }: Props) {
  const { slug } = await params

  const adminSupabase = createAdminClient()

  // First try to find onepage by slug
  let { data: onepage, error } = await adminSupabase
    .from("onepages")
    .select("*")
    .eq("slug", slug)
    .eq("status", "published")
    .single()

  // If not found by slug, try to find by username (for subdomain routing)
  // This handles the case where username.storelib.com/links is accessed
  // and the middleware passes the username as the slug
  if (error || !onepage) {
    // Look up the user by username
    const { data: profile } = await adminSupabase
      .from("profiles")
      .select("id, username")
      .ilike("username", slug)
      .maybeSingle()

    if (profile) {
      // Find the creator for this user
      const { data: creator } = await adminSupabase
        .from("creators")
        .select("id")
        .eq("user_id", profile.id)
        .maybeSingle()

      if (creator) {
        // Try to find onepage by seller_id (creator_id)
        const { data: creatorOnepage } = await adminSupabase
          .from("onepages")
          .select("*")
          .eq("seller_id", creator.id)
          .eq("status", "published")
          .maybeSingle()

        if (creatorOnepage) {
          onepage = creatorOnepage
          error = null
        } else {
          // Also try by creator_id field
          const { data: altOnepage } = await adminSupabase
            .from("onepages")
            .select("*")
            .eq("creator_id", creator.id)
            .eq("status", "published")
            .maybeSingle()

          if (altOnepage) {
            onepage = altOnepage
            error = null
          }
        }
      }

      // If still not found, try by owner_id (user_id)
      if (!onepage) {
        const { data: ownerOnepage } = await adminSupabase
          .from("onepages")
          .select("*")
          .eq("owner_id", profile.id)
          .eq("status", "published")
          .maybeSingle()

        if (ownerOnepage) {
          onepage = ownerOnepage
          error = null
        }
      }
    }
  }

  if (!onepage) {
    // Check username history — maybe this slug was an old username
    const { data: historyRecord } = await adminSupabase
      .from("username_history")
      .select("new_username")
      .ilike("old_username", slug)
      .order("changed_at", { ascending: false })
      .limit(1)
      .maybeSingle()

    if (historyRecord?.new_username) {
      /* Their page, at the address it has now: /{handle}/links. Permanent
         (308), so a search engine moves what it knows there. */
      permanentRedirect(getLinksInternalPath(historyRecord.new_username))
    }

    notFound()
  }

  /*
    An operator banned the owner: the page goes the way their products went,
    before anything is counted. The answer is the one the metadata asked for,
    held for the request (onePageOwner).
  */
  const owner = await onePageOwner(onepage.seller_id ?? null, onepage.creator_id ?? null, onepage.owner_id ?? null)
  if (owner.banned) notFound()

  // Track view with IP/device deduplication (one view per IP per day)
  try {
    const headersList = await headers()
    const forwardedFor = headersList.get("x-forwarded-for")
    const ip = forwardedFor ? forwardedFor.split(",")[0].trim() : "unknown"
    const ipHash = hashIP(ip)
    const userAgent = headersList.get("user-agent") || ""
    const referrer = headersList.get("referer") || ""

    // Get country from Vercel geo headers
    const countryCode = headersList.get("x-vercel-ip-country") || ""
    const countryNames: Record<string, string> = {
      US: "United States", GB: "United Kingdom", CA: "Canada", AU: "Australia",
      DE: "Germany", FR: "France", ES: "Spain", IT: "Italy", NL: "Netherlands",
      BR: "Brazil", MX: "Mexico", JP: "Japan", KR: "South Korea", IN: "India",
      CN: "China", RU: "Russia", PL: "Poland", SE: "Sweden", NO: "Norway",
      DK: "Denmark", FI: "Finland", PT: "Portugal", BE: "Belgium", AT: "Austria",
      CH: "Switzerland", IE: "Ireland", NZ: "New Zealand", SG: "Singapore",
      HK: "Hong Kong", TW: "Taiwan", TH: "Thailand", MY: "Malaysia", PH: "Philippines",
      ID: "Indonesia", VN: "Vietnam", ZA: "South Africa", AE: "United Arab Emirates",
      SA: "Saudi Arabia", IL: "Israel", TR: "Turkey", EG: "Egypt", NG: "Nigeria",
      KE: "Kenya", AR: "Argentina", CL: "Chile", CO: "Colombia", PE: "Peru",
      RO: "Romania", UA: "Ukraine", CZ: "Czech Republic", HU: "Hungary", GR: "Greece",
    }
    const countryName = countryCode ? (countryNames[countryCode] || countryCode) : ""

    // Generate visitor ID from IP hash + user agent (for deduplication)
    const visitorId = crypto
      .createHash("sha256")
      .update(ipHash + userAgent)
      .digest("hex")
      .slice(0, 32)

    // Check for duplicate view (same IP within the same calendar day - UTC)
    const today = new Date()
    today.setUTCHours(0, 0, 0, 0)
    const todayStr = today.toISOString()

    const { data: existingView } = await adminSupabase
      .from("onepage_views")
      .select("id")
      .eq("onepage_id", onepage.id)
      .eq("ip_hash", ipHash)
      .gte("created_at", todayStr)
      .maybeSingle()

    // Only insert if no view from this IP today
    if (!existingView) {
      await adminSupabase.from("onepage_views").insert({
        onepage_id: onepage.id,
        visitor_id: visitorId,
        referrer,
        user_agent: userAgent.slice(0, 500),
        ip_hash: ipHash,
        country_code: countryCode || null,
        country_name: countryName || null,
      })
    }
  } catch {
    // Ignore
  }

  // IMPORTANT: Resolve the correct creator_id for subscribe functionality
  // Priority: seller_id > creator_id > lookup from owner_id
  let resolvedCreatorId = onepage.seller_id || onepage.creator_id || null

  // If no direct creator reference, look up creator by owner_id (user_id)
  if (!resolvedCreatorId && onepage.owner_id) {
    const { data: creator } = await adminSupabase
      .from("creators")
      .select("id")
      .eq("user_id", onepage.owner_id)
      .maybeSingle()

    if (creator) {
      resolvedCreatorId = creator.id

      // Also update the onepage record so future lookups are faster
      await adminSupabase
        .from("onepages")
        .update({ seller_id: creator.id, creator_id: creator.id })
        .eq("id", onepage.id)
    }
  }

  /* The owner's live name, for a page with no name of its own. onePageOwner
     read it already for the metadata and holds it for the request. */
  const profileDisplayName: string | null = owner.displayName

  /*
    THE SHAPE THE PAGE IS DRAWN FROM, BUILT WHERE THE EDITOR'S PREVIEW
    BUILDS IT (lib/onepage/public-shape): the published copy, falling back
    to the row, with a block outside its schedule left out. The preview
    frames this same component with the draft in the same shape, so what a
    creator sees there is what this renders.
  */
  const transformedOnepage = publicOnePage(onepage, {
    source: "published",
    displayName: profileDisplayName,
    /* The live photo, for a page that never had one of its own, and for one
       whose copy is still the picture Google sent (lib/account/identity). */
    liveAvatarUrl: owner.avatarUrl,
    /* The creator page's own domain names the OnePage too (<domain>/links):
       read here as well as kept in settings.custom_domain, so a share link is
       right the moment a domain connects. */
    customDomain: await primaryHostFor(resolvedCreatorId, "creator_page"),
    sellerId: resolvedCreatorId,
  })

  /*
    AND ITS PRODUCTS, READ FROM THE PRODUCTS AND NOT FROM THE COPY IN THE
    BLOCK. A product block stores the title, price, picture and address the
    product had when it was added, and publishing freezes that copy a second
    time into `published_blocks`. Deleting the product left the row on the
    page with its picture and a button to a 404; archiving or unpublishing it
    did the same, and a price change was not shown at all.

    So every block that names a product is resolved against the row here, on
    each render: gone, archived or unpublished takes the block off the page,
    and a live one is drawn from the product. This route is force-dynamic, so
    it happens the moment the creator presses delete, with nothing to purge
    and nothing to run. lib/onepage/live-products.ts.
  */
  transformedOnepage.blocks = await withLiveProducts(
    adminSupabase as unknown as ProductsDb,
    resolvedCreatorId ?? "",
    transformedOnepage.blocks,
  )

  /*
    WHO THIS PAGE IS ABOUT, for a search engine, and only on a page it may
    list: the same answer the metadata gave (`owner` above, from
    onePageOwner). `sameAs` is the social links the page draws, so an engine
    can tie this page to the accounts it already knows.
  */
  const structured =
    owner.canonical && onePageIndexable({ status: onepage.status, publishedProducts: owner.publishedProducts, handle: owner.handle })
      ? jsonLdScript(
          profilePageJsonLd({
            url: owner.canonical,
            name: transformedOnepage.title || owner.handle || "Creator",
            image: transformedOnepage.avatar_url,
            description: transformedOnepage.bio,
            sameAs: onePageSameAs(transformedOnepage.social_links),
          }),
        )
      : null

  return (
    <>
      {structured && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: structured }} />}
      <PublicOnePage onepage={transformedOnepage} />
    </>
  )
}
