import { Metadata } from "next"
import { createClient } from "@/lib/supabase/server"
import { ExplorePageClient } from "@/components/explore/explore-page-client"
import { FeaturedCategoriesSection } from "@/components/explore/featured-categories-section"

// SEO-optimized metadata
export const metadata: Metadata = {
  title: "Discover",
  description: "Discover - Sell Digital Products On Storelib. Browse thousands of digital products from top creators. Find courses, templates, ebooks, and design assets.",
  keywords: ["digital products", "online courses", "templates", "ebooks", "design assets", "creator economy", "sell digital products"],
  openGraph: {
    title: "Discover | Storelib",
    description: "Discover - Sell Digital Products On Storelib. Browse thousands of digital products from top creators.",
    type: "website",
    url: "/explore",
  },
  twitter: {
    card: "summary_large_image",
    title: "Discover | Storelib",
    description: "Discover - Sell Digital Products On Storelib. Browse thousands of digital products from top creators.",
  },
  alternates: {
    canonical: "/explore",
  },
}

export const dynamic = "force-dynamic"

// Categories that match the client-side categories
const VALID_CATEGORIES = ["all", "design", "development", "marketing", "business", "education"]

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

    // Fetch published products with optional category filtering
    let query = supabase
      .from("products")
      .select("id, title, slug, description, price_cents, compare_at_cents, thumbnail_url, type, category, creator_id, created_at, sales_count, reviews_count, reviews_average")
      .eq("status", "published")
      .order("created_at", { ascending: false })
      .limit(50)

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

  // Server-side filtering by search query
  const filteredProducts = searchQuery
    ? productsWithCreators.filter((p) => {
        if (!p) return false
        const title = (p.title || "").toLowerCase()
        const desc = (p.description || "").toLowerCase()
        return title.includes(searchQuery) || desc.includes(searchQuery)
      })
    : productsWithCreators

  return (
    <main className="min-h-screen bg-white">
      {/* Semantic page structure for SEO - optimized width for desktop */}
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        {/* Hidden H1 for SEO - visible to screen readers and crawlers */}
        <h1 className="sr-only">
          Discover - Sell Digital Products On Storelib
        </h1>

        {/* Main content */}
        <ExplorePageClient
          initialProducts={filteredProducts}
          initialCategory={category}
          searchQuery={searchQuery}
        />

        {/* Featured Categories Section - Etsy-like design */}
        <FeaturedCategoriesSection products={productsWithCreators} />
      </div>
    </main>
  )
}
