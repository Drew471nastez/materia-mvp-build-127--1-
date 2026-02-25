import { Metadata } from "next"
import { Suspense } from "react"
import { createClient } from "@/lib/supabase/server"
import { ExplorePageClient } from "@/components/explore/explore-page-client"
import { FeaturedCategoriesSection } from "@/components/explore/featured-categories-section"
import { MostPopularSection } from "@/components/explore/most-popular-section"

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
  },
  twitter: {
    card: "summary_large_image",
    title: "Storelib | Discover",
    description: "Discover premium digital products from independent creators. Design templates, AI prompts, productivity tools, development resources and more.",
  },
  alternates: {
    canonical: "/explore",
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

export default async function ExplorePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; category?: string }>
}) {
  // Safely get search params
  let params: { q?: string; category?: string } = {}
  try {
    params = await searchParams
  } catch {
    params = {}
  }

  const searchQuery = (params?.q || "").toLowerCase()
  const rawCategory = (params?.category || "all").toLowerCase()
  const category = VALID_CATEGORIES.includes(rawCategory) ? rawCategory : "all"

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
      console.error("[ExplorePage] Products error:", productsError.message)
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
    console.error("[ExplorePage] Exception:", error?.message || error)
  }

  // Search filtering is now done server-side via ILIKE in the Supabase query
  const filteredProducts = productsWithCreators

  return (
    <main className="min-h-screen bg-white">
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
