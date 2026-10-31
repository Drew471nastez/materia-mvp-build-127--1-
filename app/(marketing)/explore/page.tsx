import { Metadata } from "next"
import { salesStandings } from "@/lib/products/sales-standings"
import { salesSoldOut } from "@/lib/products/sales-limit"
import { Suspense } from "react"
import { createClient } from "@/lib/supabase/server"
import { currentUserForRequest } from "@/lib/auth/request-scope"
import { settleWithin } from "@/lib/net/request"

import { createAdminClient } from "@/lib/supabase/admin"
import { marketplacePricer } from "@/lib/money/marketplace-server"
import { offChannelAmong } from "@/lib/store/channel-filter"
import { EMPTY_INTERESTS, type Interests } from "@/lib/explore/interests"
import { readInterests } from "@/lib/explore/read-interests"
import { ExplorePageClient } from "@/components/explore/explore-page-client"
import { ExplorePullRefresh } from "@/components/explore/explore-pull-refresh"
import { VALID_SUBCATEGORY_IDS } from "@/lib/marketplace/categories"
import { MostPopularSection } from "@/components/explore/most-popular-section"
import { jsonLdScript } from "@/lib/seo/json-ld"
import { STORELIB_OG_IMAGE, storelibAssetUrl } from "@/lib/brand/logo"
import { planIntervals } from "@/lib/memberships/intervals"
import { excludingCommunityProducts } from "@/lib/communities/listing"
import { communitiesEnabled } from "@/lib/communities/flag"
import { exploreCommunities } from "@/lib/communities/server/explore"
import type { CommunityCard } from "@/lib/communities/types"
import { communitiesQuery, communityServerSort, discoverModeFor } from "@/lib/explore/communities-mode"
import type { CommunitiesFirstPage } from "@/components/explore/explore-communities-results"
import { isExploreDiscoverModeSwitcherEnabled } from "@/lib/platform/explore-discover-mode-switcher"
import { exploreCategoryFrom } from "@/lib/explore/explore-address"
import { cachedExploreCatalogue } from "@/lib/explore/catalogue-cache"
import { createPublicReadClient } from "@/lib/supabase/public-read"
import { exploreIndexing } from "@/lib/seo/explore-indexing"
import { LeaveCopy } from "@/components/navigation/leave-copy"

/** How long Explore waits for a signed in person's own ordering before showing the ordinary one. */
const INTERESTS_WAIT_MS = 1_500

/*
  THE PRODUCTS, OR THE COMMUNITIES, EACH CANONICAL AT ITS OWN ADDRESS
  (lib/seo/explore-indexing). The sitemap lists /explore?type=communities, and
  this page used to tell search engines that address was /explore. A search
  is a results page: noindex, its links followed.
*/
export async function generateMetadata({ searchParams }: { searchParams: Promise<{ q?: string; type?: string }> }): Promise<Metadata> {
  const params = await searchParams.catch(() => ({}) as { q?: string; type?: string })
  const q = typeof params?.q === "string" ? params.q : null
  const type = typeof params?.type === "string" ? params.type : null
  /* Asked only when the address asks for communities, so every other Explore view reads nothing more. */
  const seo = exploreIndexing({ q, type, communitiesOn: type === "communities" ? await communitiesEnabled() : false })
  if (!seo.communities && seo.index) return EXPLORE_METADATA
  const title = seo.communities ? "Storelib | Discover communities" : "Storelib | Discover"
  const description = seo.communities ? "Communities run by independent creators on Storelib. Browse them by topic and join the ones you like." : EXPLORE_METADATA.description
  return {
    ...EXPLORE_METADATA,
    title: { absolute: title },
    ...(description ? { description } : {}),
    openGraph: { ...EXPLORE_METADATA.openGraph, title, url: seo.canonical, ...(description ? { description } : {}) },
    twitter: { ...EXPLORE_METADATA.twitter, title, ...(description ? { description } : {}) },
    alternates: { canonical: seo.canonical },
    robots: seo.index ? EXPLORE_METADATA.robots : { index: false, follow: true },
  }
}

const EXPLORE_METADATA: Metadata = {
  title: { absolute: "Storelib | Discover" },
  description: "Discover premium digital products from independent creators. Design templates, AI prompts, productivity tools, development resources and more.",
  keywords: ["digital products", "productivity tools", "design assets", "social media templates", "AI tools", "digital downloads", "creator marketplace", "online store"],
  openGraph: {
    title: "Storelib | Discover",
    description: "Discover premium digital products from independent creators. Design templates, AI prompts, productivity tools, development resources and more.",
    type: "website",
    url: "https://storelib.com/explore",
    siteName: "Storelib",
    images: [
      {
        url: storelibAssetUrl(STORELIB_OG_IMAGE),
        width: 1200,
        height: 630,
        alt: "Storelib - Discover Digital Products",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Storelib | Discover",
    description: "Discover premium digital products from independent creators. Design templates, AI prompts, productivity tools, development resources and more.",
    images: [storelibAssetUrl(STORELIB_OG_IMAGE)],
  },
  alternates: {
    canonical: "https://storelib.com/explore",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
}

export const dynamic = "force-dynamic"

/**
 * The switch in Settings, Privacy (app/api/account/preferences): off means
 * nobody's purchases or wishlist shape what they are shown here. A column
 * that is not there yet, or a read that fails, is the default: on.
 */
async function personalizationOn(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  kept?: boolean,
): Promise<boolean> {
  /* The viewer's own setting, a private column: read by the server for this signed in id (lib/security/public-columns). */
  const { data: pref } = await createAdminClient()
    .from("profiles")
    .select("personalized_recommendations")
    .eq("id", userId)
    .maybeSingle()
  const column = (pref as { personalized_recommendations?: boolean } | null)?.personalized_recommendations
  /* No column yet: the choice Settings kept on the account (app/api/account/preferences). */
  return typeof column === "boolean" ? column : kept !== false
}

/** What the grid shows of a product. */
const PRODUCT_COLUMNS =
  "id, title, slug, description, price_cents, compare_at_cents, pay_what_you_want, pwyw_min_price_cents, thumbnail_url, type, category, creator_id, created_at, sales_count, reviews_count, reviews_average"
/**
 * ITS CREATOR, EMBEDDED ON products.creator_id (the key checkout embeds on).
 * Not their face: creators.user_id points at auth.users, not at profiles,
 * so there is no key between creators and profiles for PostgREST to follow,
 * and an embed of profiles on creators_user_id_fkey was refused on every load ("Could not
 * find a relationship between 'creators' and 'profiles' in the schema
 * cache", 750 times in a week), after which the page read everything again
 * in three steps. The faces are one read by user id, beside the others.
 */
const CREATOR_EMBED = "creator:creators(id, user_id, slug, niche_tags)"
/** The face a card draws, the same fields the separate read always asked for. */
const PROFILE_FIELDS = "id, display_name, avatar_url, username"

type Supabase = Awaited<ReturnType<typeof createClient>>

/*
  THE CATALOGUE IN TWO ROUND TRIPS, NEITHER OF THEM REFUSED. The products with
  their creators in one read; then, together, the creators' faces, the
  products their creators took off Explore and the membership intervals. It
  was a refused read, then products, creators and profiles one after another.
  Should the creators embed ever be refused (a renamed key), the products are
  read alone and the creators beside the faces, so the page is never empty.
*/
async function readCatalog(supabase: Supabase, searchQuery: string): Promise<any[]> {
  const read = (columns: string) =>
    excludingCommunityProducts((exclude) => {
      let query = supabase.from("products").select(columns).eq("status", "published").neq("type", "physical")
      /* A product that sells a community tier is found through its community, not in this list (lib/communities/listing). */
      if (exclude) query = query.is("community_id", null)
      query = query.order("created_at", { ascending: false }).limit(100)
      /* A search is applied here, by ILIKE, rather than fetching a hundred rows to keep a few. */
      if (searchQuery) query = query.or(`title.ilike.%${searchQuery}%,description.ilike.%${searchQuery}%`)
      return query
    })

  let { data: products, error } = (await read(`${PRODUCT_COLUMNS}, ${CREATOR_EMBED}`)) as { data: any[] | null; error: { message: string } | null }
  let embedded = !error
  if (error) {
    console.error("[ExplorePage] Creators embed refused, reading them on their own:", error.message)
    ;({ data: products, error } = (await read(PRODUCT_COLUMNS)) as { data: any[] | null; error: { message: string } | null })
    embedded = false
  }
  if (error) console.error("[ExplorePage] Products error:", error.message)
  if (!products || products.length === 0) return []

  const one = (c: any) => (Array.isArray(c) ? c[0] ?? null : c ?? null)
  /* The creators, embedded; only on a refused embed a read of their own. */
  const creatorsPromise: Promise<any[]> = embedded
    ? Promise.resolve(products.map((p) => one(p.creator)).filter(Boolean))
    : (async () => {
        const ids = [...new Set(products!.map((p) => p.creator_id).filter(Boolean))]
        if (!ids.length) return []
        const { data } = await supabase.from("creators").select("id, user_id, slug, niche_tags").in("id", ids)
        return data || []
      })()
  const profilesPromise = creatorsPromise.then(async (creators) => {
    const userIds = [...new Set(creators.map((c) => c.user_id).filter(Boolean))]
    if (!userIds.length) return [] as any[]
    const { data } = await supabase.from("profiles").select(PROFILE_FIELDS).in("id", userIds)
    return (data || []) as any[]
  })
  /* A yearly only membership says "/year" on its card (lib/memberships/intervals). */
  const intervalsPromise = planIntervals(supabase, products.filter((p) => p.type === "membership").map((p) => p.id))
  /* Settings › Sales channels: a product its creator took off Explore is not here. */
  const together = Promise.all([
    offChannelAmong(createAdminClient(), products.map((p) => p.id), "marketplace"),
    creatorsPromise,
    profilesPromise,
    intervalsPromise,
    /* Limit sales: a download whose limited run has gone says Sold out on its card (lib/products/sales-limit), counted on the server. */
    salesStandings(createAdminClient(), products.map((p) => p.id)),
    /* Each card's price as the marketplace shows it: its store's currency, or US dollars once that store is switched over (lib/money/marketplace-server). */
    marketplacePricer(createAdminClient(), products.map((p) => p.creator_id), products.map((p) => p.id)),
  ])
  const [offExplore, creators, profiles, intervals, standings, priceOf] = await together
  if (offExplore.size) products = products.filter((p) => !offExplore.has(p.id))

  const creatorById = new Map(creators.map((c) => [c.id, c]))
  const profileById = new Map(profiles.map((x) => [x.id, x]))
  const creatorOf = (p: any) => {
    const creator = creatorById.get(p.creator_id) ?? one(p.creator)
    if (!creator) return null
    return { ...creator, profile: profileById.get(creator.user_id) ?? null }
  }

  return products.map((product) => ({
    ...product,
    ...(intervals.has(product.id) ? { price_interval: intervals.get(product.id) } : {}),
    ...(salesSoldOut(standings.get(product.id)) ? { sold_out: true } : {}),
    ...priceOf(product),
    creator: creatorOf(product),
    categories: [],
    categoryName: product.category || null,
    reviews_count: product.reviews_count || 0,
    reviews_average: product.reviews_average || 0,
  }))
}

export default async function ExplorePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; category?: string; c?: string; sub?: string; type?: string; srt?: string }>
}) {
  // Safely get search params
  let params: { q?: string; category?: string; c?: string; sub?: string; type?: string; srt?: string } = {}
  try {
    params = await searchParams
  } catch {
    params = {}
  }

  const searchQuery = (params?.q || "").toLowerCase()
  /*
    `c` IS THE ONE THE PAGE WRITES NOW, and `category` is still read.

    Switching a category used to leave ?category=design behind; the owner
    asked for a shorter, shareable shape carrying the sort and the language
    as well. Renaming a query parameter without reading the old one breaks
    every link already pointing here: the header's own category menu, the
    structured data on every product page, and anything anybody has shared.
    So the new name wins when both are present and the old one keeps working.
  */
  const category = exploreCategoryFrom({ c: params?.c, category: params?.category })

  /*
    EVERYTHING THIS PAGE READS STARTS AT ONCE. The two switches, the cookie,
    the visitor and the catalogue used to be asked for one after another, and
    the catalogue then waited for its creators, which waited for their
    profiles: five or six round trips in series before the grid could be
    drawn. None of them needs another's answer except the communities, which
    need the switch, so they all start here and are collected where they are
    used. The grid arrives one round trip after the slowest read instead of
    after the sum of them.
  */
  const supabasePromise = createClient()
  /* Browsing is the same catalogue for everybody, read as a stranger and held for a minute, cleared by a product save (lib/explore/catalogue-cache.ts); a search stays a live read. */
  const catalogRead = searchQuery
    ? supabasePromise.then((supabase) => readCatalog(supabase, searchQuery))
    : cachedExploreCatalogue(() => readCatalog(createPublicReadClient() as unknown as Supabase, ""))
  const catalogPromise = catalogRead.catch((error: unknown) => {
    console.error("[ExplorePage] Exception:", (error as { message?: string })?.message || error)
    return [] as any[]
  })
  const [discoverModeSwitcherEnabled, communitiesOn] = await Promise.all([
    isExploreDiscoverModeSwitcherEnabled(),
    communitiesEnabled(),
  ])
  /*
    COMMUNITIES, WHILE THEY ARE SWITCHED ON, and only then: communities mode
    (?type=communities, the hero's switcher, the Communities pill), and on a
    product search the communities that match, above the products. The
    switch is the one gate (lib/explore/communities-mode discoverModeFor):
    off, an address or a cookie asking for communities gets the products.
    In communities mode the first page of real communities is drawn here,
    for the same pill, word and order the page opens on, beside the
    catalogue rather than after it.
  */
  /* Round AG: a visit opens on products unless the address asks; the tab's own memory is read by the page (lib/explore/discover-mode-cookie). */
  const initialDiscoverMode = discoverModeFor({ communitiesOn, type: params?.type ?? null, cookie: null })
  const communityResultsPromise: Promise<CommunityCard[]> =
    communitiesOn && searchQuery && initialDiscoverMode === "products" ? exploreCommunities({ q: searchQuery, limit: 3 }).then((p) => p.items).catch(() => []) : Promise.resolve([])
  /* A subcategory from the More picker, inside its category: communities are found by its parent narrowed by its words (lib/communities/server/explore.ts). */
  const sub = category !== "all" && params?.sub && VALID_SUBCATEGORY_IDS.includes(params.sub) ? params.sub : null
  const firstCommunitiesPromise: Promise<CommunitiesFirstPage | null> =
    initialDiscoverMode === "communities"
      ? exploreCommunities({ q: searchQuery, category, sub, sort: communityServerSort(params?.srt) })
          .then((p) => ({ query: communitiesQuery({ q: searchQuery, category, sub, srt: params?.srt ?? null }), items: p.items, next: p.next, broadened: p.broadened === true }))
          .catch(() => null)
      : Promise.resolve(null)

  /*
    ═══════════════════════════════════════════════════════════════════════
     WHO IS THIS, AND HAVE THEY SHOWN US ANYTHING
    ═══════════════════════════════════════════════════════════════════════
    Signed out, this is one cheap auth call that returns nobody and the page
    is exactly what it was. Signed in with too little history, the same: the
    threshold is in lib/explore/interests and nothing on screen changes until
    it is met. Only past it does "All" become "For you".

    It sits next to the catalogue query rather than in front of it, because
    neither needs the other.
  */
  let interests: Interests = EMPTY_INTERESTS
  let productsWithCreators: any[] = []

  try {
    const supabase = await supabasePromise

    /*
      Asked for beside the catalogue rather than before it: neither needs the
      other, and this route is force-dynamic with nothing cached in front of
      it, so a read in series is a round trip every visitor pays for.
      A failure here is not a failure of the page: the catch leaves
      `interests` empty and everybody gets the ordinary Explore.
    */
    /*
      AND IT HAS A DEADLINE. It was a bare getUser() then two reads, none
      bounded, and the grid waited on all of it: a slow minute for Supabase
      Auth was a blank Explore for everybody signed in. Personal ordering is
      worth INTERESTS_WAIT_MS and no more; after that the ordinary Explore.
    */
    const interestsPromise = settleWithin(
      (async () => {
        const { user } = await currentUserForRequest()
        if (!user) return EMPTY_INTERESTS
        if (!(await personalizationOn(supabase, user.id, user.user_metadata?.personalized_recommendations))) return EMPTY_INTERESTS
        return readInterests(user.id, user.email)
      })(),
      INTERESTS_WAIT_MS,
      EMPTY_INTERESTS,
    )

    ;[productsWithCreators, interests] = await Promise.all([catalogPromise, interestsPromise])
  } catch (error: any) {
    console.error("[ExplorePage] Exception:", error?.message || error)
  }

  // Search filtering is now done server-side via ILIKE in the Supabase query
  const filteredProducts = productsWithCreators

  /*
    THE GROUND IS #f8f9fa, WHICH IS THE ONE THIS PRODUCT ALREADY USES.

    It was #f5f5f5, and read as heavy behind a page of product pictures:
    "too darkened, just lighten it a little". Four levels of luminance is a
    little — the lift is felt rather than seen — and it is not a new grey.
    Every surface under /app is already this colour, so explore agrees with
    the rest of the product instead of being a third value nobody could
    name. The dot ground over the top is measured against it by
    scripts/check-ground.mjs, which reads the colour from this line.
  */
  return (
    <div className="explore-ground min-h-screen bg-[#f8f9fa]" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
      {/* A community opened from here: this page goes out under the community's bar as it comes in (round 31). */}
      <LeaveCopy surface=".explore-ground" />
      {/* JSON-LD structured data */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLdScript({
            "@context": "https://schema.org",
            "@type": "CollectionPage",
            "name": "Discover Digital Products",
            "description": "Discover premium digital products from independent creators.",
            "url": "https://storelib.com/explore"
          }),
        }}
      />

      {/* Semantic page structure for SEO - matches header max-width (1400px) */}
      <ExplorePullRefresh>
      <div className="mx-auto max-w-[1400px] px-4 sm:px-6 lg:px-8 pt-4 pb-6 sm:pt-5 sm:pb-8">
        {/* The page's one h1 is the hero's (components/explore/explore-hero), the sentence a screen reader reads; a second one here made two. */}

        {/* Main content */}
        <ExplorePageClient
          initialProducts={filteredProducts}
          initialCategory={category}
          interests={interests}
          searchQuery={searchQuery}
          discoverHeadlineSegmentEnabled={discoverModeSwitcherEnabled}
          initialDiscoverMode={initialDiscoverMode}
          communitiesEnabled={communitiesOn}
          communityResults={await communityResultsPromise}
          initialCommunities={await firstCommunitiesPromise}
        />

        {/*
          Below the fold: eight rows of products and their pagination, then
          Most popular. NO CATEGORIES BOARD. "Explore categories you can
          build with" sat between the two, a grid of the same categories
          the pill row and its More already offer; the owner asked for it
          off, on a computer and a phone.
        */}
        <Suspense fallback={null}>
          <MostPopularSection products={productsWithCreators} />
        </Suspense>
      </div>
      </ExplorePullRefresh>
    </div>
  )
}
