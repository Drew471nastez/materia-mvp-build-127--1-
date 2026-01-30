import { createClient } from "@/lib/supabase/server"
import { CreatorCard } from "@/components/explore/creator-card"
import { ProductCard } from "@/components/explore/product-card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Search } from "lucide-react"
import Link from "next/link"

export const metadata = {
  title: "Explore Creators & Products | Storelib",
  description: "Discover digital products, courses, and communities from top creators.",
}

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
  let params: { tab?: string; q?: string; category?: string; sort?: string; src?: string }
  try {
    params = await searchParams
  } catch (e) {
    console.error("[ExplorePage] Error awaiting searchParams:", e)
    params = {}
  }

  const supabase = await createClient()
  const searchQuery = params.q?.toLowerCase() || ""
  const category = params.category || "All"
  const sortBy = params.sort || "newest"
  const activeTab = params.tab || "products"
  const src = params.src || "platform"

  // Initialize all data arrays with safe defaults
  let creators: any[] = []
  let creatorProfiles: any[] = []
  let productCounts: any[] = []
  let products: any[] = []
  let productCreators: any[] = []
  let productCreatorProfiles: any[] = []

  try {
    // Fetch creators
    const { data: creatorsData, error: creatorsError } = await supabase
      .from("creators")
      .select("*")
      .eq("store_published", true)
      .order("created_at", { ascending: sortBy === "oldest" })
      .limit(24)

    if (creatorsError) {
      console.error("[ExplorePage] Creators query error:", creatorsError)
    }
    creators = creatorsData || []

    // Fetch creator profiles
    const creatorUserIds = creators.map((c) => c.user_id).filter(Boolean)
    if (creatorUserIds.length > 0) {
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("*")
        .in("id", creatorUserIds)

      if (profilesError) {
        console.error("[ExplorePage] Creator profiles error:", profilesError)
      }
      creatorProfiles = profiles || []
    }

    // Fetch product counts per creator
    const creatorIds = creators.map((c) => c.id) || []
    if (creatorIds.length > 0) {
      const { data: counts, error: countsError } = await supabase
        .from("products")
        .select("creator_id")
        .in("creator_id", creatorIds)
        .eq("status", "published")

      if (countsError) {
        console.error("[ExplorePage] Product counts error:", countsError)
      }
      productCounts = counts || []
    }
  } catch (e) {
    console.error("[ExplorePage] Error fetching creators:", e)
  }

  // Build creator data with profiles and product counts
  const creatorsWithProfiles = creators.map((creator) => {
    const profile = creatorProfiles.find((p) => p.id === creator.user_id)
    const creatorProducts = productCounts.filter((p) => p.creator_id === creator.id)
    return {
      ...creator,
      profile,
      products_count: creatorProducts.length,
    }
  })

  try {
    // Fetch products - simplified query without nested joins that might cause issues
    const { data: productsData, error: productsError } = await supabase
      .from("products")
      .select("*")
      .eq("status", "published")
      .order(sortBy === "trending" ? "sales_count" : "created_at", {
        ascending: sortBy === "oldest",
        nullsFirst: false,
      })
      .limit(24)

    if (productsError) {
      console.error("[ExplorePage] Products query error:", productsError)
    }
    products = productsData || []

    // Fetch product creators
    const productCreatorIds = [...new Set(products.map((p) => p.creator_id).filter(Boolean))]
    if (productCreatorIds.length > 0) {
      const { data: pCreators, error: pCreatorsError } = await supabase
        .from("creators")
        .select("*")
        .in("id", productCreatorIds)

      if (pCreatorsError) {
        console.error("[ExplorePage] Product creators error:", pCreatorsError)
      }
      productCreators = pCreators || []
    }

    // Fetch product creator profiles
    const productCreatorUserIds = productCreators.map((c) => c.user_id).filter(Boolean)
    if (productCreatorUserIds.length > 0) {
      const { data: pcProfiles, error: pcProfilesError } = await supabase
        .from("profiles")
        .select("*")
        .in("id", productCreatorUserIds)

      if (pcProfilesError) {
        console.error("[ExplorePage] Product creator profiles error:", pcProfilesError)
      }
      productCreatorProfiles = pcProfiles || []
    }
  } catch (e) {
    console.error("[ExplorePage] Error fetching products:", e)
  }

  // Build products with creator info
  const productsWithCreators = products.map((product) => {
    const creator = productCreators.find((c) => c.id === product.creator_id)
    const profile = productCreatorProfiles.find((p) => p.id === creator?.user_id)
    return {
      ...product,
      creator: creator ? { ...creator, profile } : null,
      categories: [],
      categoryName: product.category || null,
      reviews_count: 0,
      reviews_average: 0,
    }
  })

  // Filter by search and category
  const filteredCreators = creatorsWithProfiles.filter((c) => {
    if (searchQuery) {
      const name = c.profile?.display_name?.toLowerCase() || ""
      const headline = c.headline?.toLowerCase() || ""
      const bio = c.bio?.toLowerCase() || ""
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
    if (searchQuery) {
      const title = p.title?.toLowerCase() || ""
      const desc = p.description?.toLowerCase() || ""
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
          className={
            sortBy === "newest" ? "font-medium text-foreground" : "text-muted-foreground hover:text-foreground"
          }
        >
          Newest
        </Link>
        <Link
          href={`/explore?tab=${activeTab}&category=${category}&q=${searchQuery}&sort=trending&src=${src}`}
          className={
            sortBy === "trending" ? "font-medium text-foreground" : "text-muted-foreground hover:text-foreground"
          }
        >
          Trending
        </Link>
        <Link
          href={`/explore?tab=${activeTab}&category=${category}&q=${searchQuery}&sort=featured&src=${src}`}
          className={
            sortBy === "featured" ? "font-medium text-foreground" : "text-muted-foreground hover:text-foreground"
          }
        >
          Featured
        </Link>
      </div>

      <Tabs defaultValue={activeTab}>
        <TabsList>
          <TabsTrigger value="products" asChild>
            <Link href={`/explore?tab=products&category=${category}&q=${searchQuery}&sort=${sortBy}&src=${src}`}>
              Products ({filteredProducts.length})
            </Link>
          </TabsTrigger>
          <TabsTrigger value="creators" asChild>
            <Link href={`/explore?tab=creators&category=${category}&q=${searchQuery}&sort=${sortBy}&src=${src}`}>
              Creators ({filteredCreators.length})
            </Link>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="products" className="mt-6">
          {filteredProducts.length > 0 ? (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {filteredProducts.map((product) => (
                <ProductCard key={product.id} product={product} srcParam="?src=platform" />
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-border p-12 text-center">
              <p className="text-muted-foreground">
                {searchQuery ? `No products found for "${searchQuery}"` : "No products found yet."}
              </p>
            </div>
          )}
        </TabsContent>

        <TabsContent value="creators" className="mt-6">
          {filteredCreators.length > 0 ? (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {filteredCreators.map((creator) => (
                <CreatorCard key={creator.id} creator={creator} />
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-border p-12 text-center">
              <p className="text-muted-foreground">
                {searchQuery ? `No creators found for "${searchQuery}"` : "No creators found yet."}
              </p>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
