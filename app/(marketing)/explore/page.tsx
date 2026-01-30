import { createClient } from "@/lib/supabase/server"
import { ExploreContent } from "@/components/explore/explore-content"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Search } from "lucide-react"
import Link from "next/link"

export const metadata = {
  title: "Explore Creators & Products | Storelib",
  description: "Discover digital products, courses, and communities from top creators.",
}

export const dynamic = "force-dynamic"

const CATEGORIES = [
  "All",
  "Design",
  "Development",
  "Marketing",
  "Business",
  "Photography",
  "Writing",
  "Music",
  "Fitness",
  "Finance",
  "Education",
]

export default async function ExplorePage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; q?: string; category?: string; sort?: string; src?: string }>
}) {
  // Safely get search params
  let params: { tab?: string; q?: string; category?: string; sort?: string; src?: string } = {}
  try {
    params = await searchParams
  } catch {
    params = {}
  }

  const searchQuery = (params?.q || "").toLowerCase()
  const category = params?.category || "All"
  const sortBy = params?.sort || "newest"
  const activeTab = params?.tab || "products"
  const src = params?.src || "platform"

  // Initialize data arrays
  let creatorsWithProfiles: any[] = []
  let productsWithCreators: any[] = []
  let dbError: string | null = null

  try {
    const supabase = await createClient()

    // Fetch creators with store_published = true
    const { data: creators, error: creatorsError } = await supabase
      .from("creators")
      .select("id, user_id, slug, headline, bio, niche_tags, avatar_url, created_at")
      .eq("store_published", true)
      .order("created_at", { ascending: false })
      .limit(24)

    if (creatorsError) {
      console.error("[ExplorePage] Creators error:", creatorsError.message)
      dbError = creatorsError.message
    }

    if (creators && creators.length > 0) {
      // Get profiles for creators
      const creatorUserIds = creators.map((c) => c.user_id).filter(Boolean)
      let creatorProfiles: any[] = []

      if (creatorUserIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, display_name, avatar_url, username")
          .in("id", creatorUserIds)
        creatorProfiles = profiles || []
      }

      // Get product counts
      const creatorIds = creators.map((c) => c.id)
      let productCounts: Record<string, number> = {}

      if (creatorIds.length > 0) {
        const { data: counts } = await supabase
          .from("products")
          .select("creator_id")
          .in("creator_id", creatorIds)
          .eq("status", "published")

        if (counts) {
          counts.forEach((p) => {
            productCounts[p.creator_id] = (productCounts[p.creator_id] || 0) + 1
          })
        }
      }

      // Build creators with profiles
      creatorsWithProfiles = creators.map((creator) => ({
        ...creator,
        profile: creatorProfiles.find((p) => p.id === creator.user_id) || null,
        products_count: productCounts[creator.id] || 0,
      }))
    }

    // Fetch published products
    const { data: products, error: productsError } = await supabase
      .from("products")
      .select("id, title, slug, description, price_cents, compare_at_cents, thumbnail_url, type, category, creator_id, created_at, sales_count")
      .eq("status", "published")
      .order("created_at", { ascending: false })
      .limit(24)

    if (productsError) {
      console.error("[ExplorePage] Products error:", productsError.message)
      dbError = productsError.message
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
          reviews_count: 0,
          reviews_average: 0,
        }
      })
    }
  } catch (error: any) {
    console.error("[ExplorePage] Exception:", error?.message || error)
    dbError = error?.message || "Unknown error"
  }

  // Filter by search and category
  const filteredCreators = creatorsWithProfiles.filter((c) => {
    if (!c) return false
    if (searchQuery) {
      const name = (c.profile?.display_name || "").toLowerCase()
      const headline = (c.headline || "").toLowerCase()
      const bio = (c.bio || "").toLowerCase()
      if (!name.includes(searchQuery) && !headline.includes(searchQuery) && !bio.includes(searchQuery)) {
        return false
      }
    }
    if (category !== "All" && !c.niche_tags?.includes(category)) {
      return false
    }
    return true
  })

  const filteredProducts = productsWithCreators.filter((p) => {
    if (!p) return false
    if (searchQuery) {
      const title = (p.title || "").toLowerCase()
      const desc = (p.description || "").toLowerCase()
      if (!title.includes(searchQuery) && !desc.includes(searchQuery)) {
        return false
      }
    }
    if (category !== "All" && !p.creator?.niche_tags?.includes(category)) {
      return false
    }
    return true
  })

  return (
    <div className="mx-auto max-w-6xl px-4 py-12 min-h-screen page-scroll">
      <div className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight">Explore</h1>
        <p className="mt-2 text-muted-foreground">Discover creators and their products</p>
      </div>

      <form className="mb-6">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input name="q" placeholder="Search creators or products..." className="pl-10" defaultValue={searchQuery} />
          <input type="hidden" name="tab" value={activeTab} />
          <input type="hidden" name="category" value={category} />
          <input type="hidden" name="sort" value={sortBy} />
          <input type="hidden" name="src" value={src} />
        </div>
      </form>

      <div className="mb-6 flex flex-wrap gap-2">
        {CATEGORIES.map((cat) => (
          <Link key={cat} href={`/explore?tab=${activeTab}&category=${cat}&q=${searchQuery}&sort=${sortBy}&src=${src}`}>
            <Badge variant={category === cat ? "default" : "outline"} className="cursor-pointer">
              {cat}
            </Badge>
          </Link>
        ))}
      </div>

      <div className="mb-6 flex gap-4 text-sm">
        <span className="text-muted-foreground">Sort:</span>
        <Link
          href={`/explore?tab=${activeTab}&category=${category}&q=${searchQuery}&sort=newest&src=${src}`}
          className={sortBy === "newest" ? "font-medium text-foreground" : "text-muted-foreground hover:text-foreground"}
        >
          Newest
        </Link>
        <Link
          href={`/explore?tab=${activeTab}&category=${category}&q=${searchQuery}&sort=trending&src=${src}`}
          className={sortBy === "trending" ? "font-medium text-foreground" : "text-muted-foreground hover:text-foreground"}
        >
          Trending
        </Link>
        <Link
          href={`/explore?tab=${activeTab}&category=${category}&q=${searchQuery}&sort=featured&src=${src}`}
          className={sortBy === "featured" ? "font-medium text-foreground" : "text-muted-foreground hover:text-foreground"}
        >
          Featured
        </Link>
      </div>

      {/* Tab content with smooth skeleton loading */}
      <ExploreContent
        products={filteredProducts}
        creators={filteredCreators}
        activeTab={activeTab}
        category={category}
        searchQuery={searchQuery}
        sortBy={sortBy}
        src={src}
        dbError={dbError}
      />
    </div>
  )
}
