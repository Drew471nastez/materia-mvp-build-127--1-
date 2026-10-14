import { personName } from "@/lib/profile/display-name"
import { notFound, permanentRedirect, redirect } from "next/navigation"
import { createAdminClient } from "@/lib/supabase/admin"
import type { Metadata } from "next"
import { PublicOnePage } from "@/components/onepage/public-onepage"
import { PriceCurrency } from "@/components/platform/price-currency"
import { cachedStoreCurrency } from "@/lib/store/selling-currency-server"
import { CaptureTouch } from "@/components/attribution/capture-touch"
import { TrackView } from "@/components/analytics/track-view"
import { StoreTracking } from "@/components/website-builder/store-tracking"
import { headers } from "next/headers"
import { after } from "next/server"
import { getLinksInternalPath, getMainDomain } from "@/lib/url-helpers"
import { isOnePageHost, onePageUrl } from "@/lib/onepage/address"
import { isResolvableOnePageName } from "@/lib/onepage/username"
import { primaryHostFor } from "@/lib/custom-domains/store"
import { onePageIndexable } from "@/lib/seo/indexing"
import { jsonLdScript } from "@/lib/seo/json-ld"
import { onePageSameAs, profilePageJsonLd } from "@/lib/seo/structured-data"
import { findPublishedOnePage, liveBlocksFor, onePageOwner, publishedOnePageSeo, publishedShape, resolveOnePage } from "@/lib/onepage/published-page"
import { creatorPageUrl } from "@/lib/onepage/resolve-address"
import { onePageMetadataFrom, resolveOnePageSeo } from "@/lib/onepage/seo"
import crypto from "crypto"

// Hash IP address for privacy (same as track API)
function hashIP(ip: string): string {
  return crypto.createHash("sha256").update(ip + process.env.SUPABASE_URL).digest("hex").slice(0, 16)
}

export const dynamic = "force-dynamic"

interface Props {
  params: Promise<{ slug: string }>
  /* Absent when a caller only has the name (the metadata, /{handle}/links before it passed them on). */
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

/** `?a=1&b=2` from the page's search params, or "". */
function queryOf(params: Record<string, string | string[] | undefined> | undefined): string {
  const q = new URLSearchParams()
  for (const [key, value] of Object.entries(params ?? {})) {
    for (const v of Array.isArray(value) ? value : value === undefined ? [] : [value]) q.append(key, v)
  }
  const text = q.toString()
  return text ? `?${text}` : ""
}

/*
  ===========================================================================
   WHAT THE PAGE SAYS TO GOOGLE AND TO A CHAT APP IS WHAT THE EDITOR SHOWED
  ===========================================================================
  The page's own name, bio, photo and theme give the title, the description
  and the share image; a field the creator typed over in Settings replaces
  only that one (lib/onepage/seo resolveOnePageSeo). The editor's previews
  call the same function on the draft, so the card it draws is the card a
  chat app draws. The image is drawn in the page's theme at
  /<slug>/links/share.png, and its address carries a fingerprint of what it
  is drawn from, so an edit gives it a new address and nothing old is
  shown from a cache.

  The row, the owner and the name and face are read once per request
  (lib/onepage/published-page), from the same shape the body is drawn from,
  so they cannot differ; a page that shows no picture has no icon of its own.
*/
/** Not a page: said once, for the tab and for crawlers. */
const MISSING: Metadata = { title: "Page not found", robots: { index: false, follow: false } }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params

  /* A name that cannot be one is not looked up (lib/onepage/username). */
  if (!isResolvableOnePageName(slug)) return MISSING
  const onepage = await findPublishedOnePage(slug)
  if (!onepage) return MISSING

  // The owner's live profile, with the handle and the indexing answer beside it.
  const owner = await onePageOwner(onepage.seller_id ?? null, onepage.creator_id ?? null, onepage.owner_id ?? null)
  /* The description names the page's products as the body draws them, read live (liveProducts). */
  const { seo, drawn } = await publishedOnePageSeo(onepage, owner, slug, { liveProducts: true })

  /* The sitemap's rule, so a page it does not list does not ask to be listed.
     Not listed means not indexed, and not followed: the links are the whole
     page, and on a farm's page they are what it was made for. */
  const indexable = !owner.banned && onePageIndexable({ status: onepage.status, publishedProducts: owner.publishedProducts, handle: owner.handle })

  return onePageMetadataFrom(seo, { handle: owner.handle, indexable, icon: drawn.avatar_url }) as Metadata
}

export default async function PublicOnePageRoute({ params, searchParams }: Props) {
  const { slug } = await params

  /*
    A NAME THAT CANNOT BE ONE IS A 404 BEFORE THE DATABASE IS ASKED. The
    proxy sends every address on storelib.me that holds no OnePage here as
    `/l/-`, and a path with a slash, a dot run or a percent sign in it is
    nobody's page either.
  */
  if (!isResolvableOnePageName(slug)) notFound()

  const adminSupabase = createAdminClient()

  /* The same answer the metadata read, held for the request (lib/onepage/published-page). */
  const address = await resolveOnePage(slug)

  if (address.kind !== "page") {
    /* The query the visitor came with (utm, ref) goes with them. */
    const query = queryOf(await searchParams)
    if (address.kind === "moved") {
      /*
        A renamed account or page: their page, at the address it has now.
        Permanent (308), so a search engine moves what it knows there. On
        storelib.me that is storelib.me/{name} in one step; on storelib.com
        it is the route, which the proxy sends on to storelib.me (and the
        native app keeps).
      */
      const onOnePageHost = isOnePageHost((await headers()).get("host"))
      permanentRedirect(`${onOnePageHost ? onePageUrl(address.name) : getLinksInternalPath(address.name)}${query}`)
    }
    if (address.kind === "creator") {
      /*
        The account is real and has no published OnePage: its creator page,
        rather than a 404 for a link the Share card handed out. Temporary
        (307), so the address moves to the OnePage the day they make one.
      */
      redirect(`${creatorPageUrl(address.username, getMainDomain())}${query}`)
    }
    notFound()
  }
  const onepage = address.page

  /*
    An operator banned the owner: the page goes the way their products went,
    before anything is counted. The answer is the one the metadata asked for,
    held for the request (onePageOwner).
  */
  const owner = await onePageOwner(onepage.seller_id ?? null, onepage.creator_id ?? null, onepage.owner_id ?? null)
  /* Said in the server log, never on the page: a page that exists and answers 404 is otherwise indistinguishable from one that does not. */
  if (owner.banned) console.warn(`OnePage ${onepage.id} at "${slug}" withheld: its owner is banned (found by ${address.via})`)
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

    /*
      COUNTED AFTER THE PAGE IS SENT (next/server `after`). The same two
      reads, the same row, the same one view per address a day; the visitor
      no longer waits on them before the first byte. Everything they need
      from the request is read above, while the request is still here.
    */
    after(async () => {
      try {
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
    })
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

  /*
    THE SHAPE THE PAGE IS DRAWN FROM, BUILT WHERE THE EDITOR'S PREVIEW
    BUILDS IT (lib/onepage/public-shape): the published copy, falling back
    to the row, with a block outside its schedule left out. The preview
    frames this same component with the draft in the same shape, so what a
    creator sees there is what this renders.
  */
  const transformedOnepage = publishedShape(onepage, owner, {
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

    Asked by the seller the shape names, the field the editor's preview
    frame asks by too (components/onepage/preview-document.tsx), so both
    read the same products for the same page. tests/onepage-preview-parity.test.ts.
  */
  /* The same read the metadata made for these blocks, once per request (liveBlocksFor). */
  transformedOnepage.blocks = await liveBlocksFor(transformedOnepage.seller_id ?? "", transformedOnepage.blocks)

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
            name: personName({ name: transformedOnepage.title, username: owner.handle }),
            image: transformedOnepage.avatar_url,
            /* The same words the metadata gives (lib/onepage/seo), from the blocks drawn below with their products read live. */
            description: resolveOnePageSeo({
              name: transformedOnepage.title,
              bio: transformedOnepage.bio,
              blocks: transformedOnepage.blocks,
              socialLinks: transformedOnepage.social_links,
              handle: onepage.slug || slug,
              avatarUrl: transformedOnepage.avatar_url,
              theme: transformedOnepage.theme,
              settings: onepage.settings,
              pageUrl: owner.canonical ?? "",
            }).description.value,
            sameAs: onePageSameAs(transformedOnepage.social_links),
          }),
        )
      : null

  return (
    <>
      {structured && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: structured }} />}
      {/* Its products are its seller's, in the seller's store currency (components/platform/price-currency). */}
      <PriceCurrency currency={transformedOnepage.seller_id ? await cachedStoreCurrency(transformedOnepage.seller_id) : null}>
        <PublicOnePage onepage={transformedOnepage} />
      </PriceCurrency>
      {/* Where this visit came from, for an order or a sign-up that starts here (lib/attribution). */}
      <CaptureTouch creatorId={resolvedCreatorId} property="onepage" />
      {/* The OnePage in Analytics, as one property among the creator's, by the
          same rules as every other page (lib/analytics/collect). The count
          above, in onepage_views, is the OnePage editor's and is unchanged.
          Its links report their own clicks, with the block they came from. */}
      {resolvedCreatorId && <TrackView creatorId={resolvedCreatorId} links={false} />}
      {/* The store's own Google Analytics and pixels (Settings › Integrations). */}
      {resolvedCreatorId && <StoreTracking creatorId={resolvedCreatorId} />}
    </>
  )
}
