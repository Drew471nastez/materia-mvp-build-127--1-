import { Metadata } from "next"
import { Suspense } from "react"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { EMPTY_INTERESTS, type Interests } from "@/lib/explore/interests"
import { readInterests } from "@/lib/explore/read-interests"
import { ExplorePageClient } from "@/components/explore/explore-page-client"
import { FeaturedCategoriesSection } from "@/components/explore/featured-categories-section"
import { MostPopularSection } from "@/components/explore/most-popular-section"
import { jsonLdScript } from "@/lib/seo/json-ld"
import { STORELIB_OG_IMAGE, storelibAssetUrl } from "@/lib/brand/logo"
import { planIntervals } from "@/lib/memberships/intervals"

// SEO-optimized metadata
export const metadata: Metadata = {
  title: { absolute: "Storelib | Discover" },
  description: "Discover premium digital products from independent creators. Design templates, AI prompts, productivity tools, development resources and more.",
  keywords: ["digital products", "productivity tools", "design assets", "social media templates", "AI tools", "digital downloads", "creator marketplace", "online store"],
  openGraph: {
    title: "Storelib | Discover",
    description: "Discover premium digital products from independent creators. Design templates, AI prompts, productivity tools, development resources and more.",
    type: "website",
    url: "/explore",
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

// Categories that match the client-side categories (including header categories)
const VALID_CATEGORIES = [
  "all", "productivity", "design", "social-media", "ai",
  // Additional categories from header
  "development", "marketing", "business", "music", "photography",
  "video", "ecommerce", "education", "audio-music", "other", "freebies"
]

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

export default async function ExplorePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; category?: string; c?: string }>
}) {
  // Safely get search params
  let params: { q?: string; category?: string; c?: string } = {}
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
  const rawCategory = (params?.c || params?.category || "all").toLowerCase()
  const category = VALID_CATEGORIES.includes(rawCategory) ? rawCategory : "all"

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

  // Initialize data
  let productsWithCreators: any[] = []

  try {
    const supabase = await createClient()

    /*
      Asked for beside the catalogue rather than before it: neither needs the
      other, and this route is force-dynamic with nothing cached in front of
      it, so a read in series is a round trip every visitor pays for.
      A failure here is not a failure of the page — the catch below leaves
      `interests` empty and everybody gets the ordinary Explore.
    */
    const interestsPromise = (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return EMPTY_INTERESTS
      if (!(await personalizationOn(supabase, user.id, user.user_metadata?.personalized_recommendations))) return EMPTY_INTERESTS
      return readInterests(user.id, user.email)
    })().catch(() => EMPTY_INTERESTS)

    // Fetch published products — apply search filter server-side via ILIKE
    // to avoid fetching 100 rows when only a few match the query
    let query = supabase
      .from("products")
      .select("id, title, slug, description, price_cents, compare_at_cents, pay_what_you_want, pwyw_min_price_cents, thumbnail_url, type, category, creator_id, created_at, sales_count, reviews_count, reviews_average")
      .eq("status", "published")
      .order("created_at", { ascending: false })
      .limit(100)

    if (searchQuery) {
      query = query.or(`title.ilike.%${searchQuery}%,description.ilike.%${searchQuery}%`)
    }

    const { data: products, error: productsError } = await query

    if (productsError) {
      console.error("[ExplorePage] Products error:", productsError.message)
    }

    if (products && products.length > 0) {
      // Get creators for products
      /* A yearly only membership says "/year" on its card (lib/memberships/intervals); asked beside the creators. */
      const intervalsPromise = planIntervals(supabase, products.filter((p) => p.type === "membership").map((p) => p.id))
      const productCreatorIds = [...new Set(products.map((p) => p.creator_id).filter(Boolean))]
      let productCreators: any[] = []

      if (productCreatorIds.length > 0) {
        const { data: pCreators } = await supabase
          .from("creators")
          .select("id, user_id, slug, niche_tags")
          .in("id", productCreatorIds)
        productCreators = pCreators || []
      }

      // Get profiles for product creators
      const productCreatorUserIds = productCreators.map((c) => c.user_id).filter(Boolean)
      let productCreatorProfiles: any[] = []

      if (productCreatorUserIds.length > 0) {
        const { data: pcProfiles } = await supabase
          .from("profiles")
          .select("id, display_name, avatar_url, username")
          .in("id", productCreatorUserIds)
        productCreatorProfiles = pcProfiles || []
      }

      const intervals = await intervalsPromise
      // Build products with creator info
      productsWithCreators = products.map((product) => {
        const creator = productCreators.find((c) => c.id === product.creator_id)
        const profile = creator ? productCreatorProfiles.find((p) => p.id === creator.user_id) : null
        return {
          ...product,
          ...(intervals.has(product.id) ? { price_interval: intervals.get(product.id) } : {}),
          creator: creator ? { ...creator, profile } : null,
          categories: [],
          categoryName: product.category || null,
          reviews_count: (product as any).reviews_count || 0,
          reviews_average: (product as any).reviews_average || 0,
        }
      })
    }

    /* Started above, collected here, so the two reads overlap. */
    interests = await interestsPromise
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
    <main className="explore-ground min-h-screen bg-[#f8f9fa]" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
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
      <div className="mx-auto max-w-[1400px] px-4 sm:px-6 lg:px-8 pt-4 pb-6 sm:pt-5 sm:pb-8">
        {/* Hidden H1 for SEO - visible to screen readers and crawlers */}
        <h1 className="sr-only">
          Discover Digital Products - Productivity, Design, AI & More | Storelib
        </h1>

        {/* Main content */}
        <ExplorePageClient
          initialProducts={filteredProducts}
          initialCategory={category}
          interests={interests}
          searchQuery={searchQuery}
        />

        {/*
          Below-the-fold sections, wrapped in Suspense for streaming SSR, in
          the order the owner asked for: eight rows of products and their
          pagination, then the categories board, then Most popular. Most
          popular was briefly first, directly under the pagination; the
          instruction that put the board back in between is the current one.
        */}
        <Suspense fallback={null}>
          <FeaturedCategoriesSection products={productsWithCreators} />
        </Suspense>

        <Suspense fallback={null}>
          <MostPopularSection products={productsWithCreators} />
        </Suspense>
      </div>
    </main>
  )
}
