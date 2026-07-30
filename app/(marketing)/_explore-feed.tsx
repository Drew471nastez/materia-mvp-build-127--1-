import { Suspense } from "react"
import { createClient } from "@/lib/supabase/server"
import { VALID_CATEGORY_IDS } from "@/lib/marketplace/categories"
import { ExplorePageClient } from "@/components/explore/explore-page-client"
import { FeaturedCategoriesSection } from "@/components/explore/featured-categories-section"
import { MostPopularSection } from "@/components/explore/most-popular-section"

// Shared implementation of the marketplace feed.
//
// The feed is served from two routes:
//   "/"        — primary surface (marketplace homepage)
//   "/explore" — kept alive because the native app treats it as a Discover route
//                (see lib/isDiscoverMode.ts); redirecting it would break in-app nav.
// Both canonicalise to "/" so the duplicate never competes with itself in search.
//
// Not a route file — leading underscore + non-reserved filename, so Next.js
// never maps it to a URL.

export const FEED_CANONICAL = "https://storelib.com/"

export const FEED_DESCRIPTION =
  "Buy and sell second-hand fashion, sneakers, bags, jewellery, beauty, books, homeware and vintage. Thousands of pre-loved pieces from independent sellers."

export const FEED_KEYWORDS = [
  "second-hand fashion",
  "pre-loved clothing",
  "vintage clothing",
  "used sneakers",
  "thrift marketplace",
  "sell clothes online",
  "womenswear",
  "menswear",
  "resale marketplace",
]

export const FEED_OG_IMAGE =
  "https://skgtqglupjcnfhfscink.supabase.co/storage/v1/object/public/platform%20images/89.jpg"

export const FEED_OG_IMAGE_ALT = "Storelib - Buy & Sell Second-Hand Fashion"

export type FeedSearchParams = { q?: string; category?: string }

export async function ExploreFeed({
  searchParams,
}: {
  searchParams: Promise<FeedSearchParams>
}) {
  // Safely get search params
  let params: FeedSearchParams = {}
  try {
    params = await searchParams
  } catch {
    params = {}
  }

  const searchQuery = (params?.q || "").toLowerCase()
  const rawCategory = (params?.category || "all").toLowerCase()
  const category = VALID_CATEGORY_IDS.includes(rawCategory) ? rawCategory : "all"

  // Initialize data
  let productsWithCreators: any[] = []

  try {
    const supabase = await createClient()

    // Fetch published products — apply search filter server-side via ILIKE
    // to avoid fetching 100 rows when only a few match the query
    let query = supabase
      .from("products")
      .select("id, title, slug, description, price_cents, compare_at_cents, thumbnail_url, type, category, creator_id, created_at, sales_count, reviews_count, reviews_average")
      .eq("status", "published")
      .order("created_at", { ascending: false })
      .limit(100)

    if (searchQuery) {
      query = query.or(`title.ilike.%${searchQuery}%,description.ilike.%${searchQuery}%`)
    }

    const { data: products, error: productsError } = await query

    if (productsError) {
      console.error("[ExploreFeed] Products error:", productsError.message)
    }

    if (products && products.length > 0) {
      // Get creators for products
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

      // Build products with creator info
      productsWithCreators = products.map((product) => {
        const creator = productCreators.find((c) => c.id === product.creator_id)
        const profile = creator ? productCreatorProfiles.find((p) => p.id === creator.user_id) : null
        return {
          ...product,
          creator: creator ? { ...creator, profile } : null,
          categories: [],
          categoryName: product.category || null,
          reviews_count: (product as any).reviews_count || 0,
          reviews_average: (product as any).reviews_average || 0,
        }
      })
    }
  } catch (error: any) {
    console.error("[ExploreFeed] Exception:", error?.message || error)
  }

  // Search filtering is now done server-side via ILIKE in the Supabase query
  const filteredProducts = productsWithCreators

  return (
    <main className="min-h-screen bg-[#f5f5f5]" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
      {/* JSON-LD structured data */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "CollectionPage",
            "name": "Shop Second-Hand Fashion, Sneakers & Vintage",
            "description": FEED_DESCRIPTION,
            "url": FEED_CANONICAL
          }),
        }}
      />

      {/* Semantic page structure for SEO - matches header max-width (1400px) */}
      <div className="mx-auto max-w-[1400px] px-4 sm:px-6 lg:px-8 pt-4 pb-6 sm:pt-5 sm:pb-8">
        {/* Hidden H1 for SEO - visible to screen readers and crawlers */}
        <h1 className="sr-only">
          Buy & Sell Second-Hand Fashion, Sneakers, Bags & Vintage | Storelib
        </h1>

        {/* Main content */}
        <ExplorePageClient
          initialProducts={filteredProducts}
          initialCategory={category}
          searchQuery={searchQuery}
        />

        {/* Below-the-fold sections wrapped in Suspense for streaming SSR */}
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
