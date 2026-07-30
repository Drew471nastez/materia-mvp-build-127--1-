import { Metadata } from "next"
import { notFound } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { CategoryPageClient } from "@/components/explore/category-page-client"
import { VALID_CATEGORY_IDS, categoryLabel as resolveCategoryLabel } from "@/lib/marketplace/categories"

// Valid category slugs, from the shared taxonomy. "all" is excluded on purpose:
// that is the feed at "/" (and /explore), so /explore/all would duplicate it.
const VALID_CATEGORIES = VALID_CATEGORY_IDS.filter((id) => id !== "all")

// Category descriptions for SEO — one per slug above
const CATEGORY_DESCRIPTIONS: Record<string, string> = {
  "womenswear": "Shop pre-loved womenswear: dresses, tops, jeans, skirts, jackets and knitwear from independent sellers. Second-hand style at a fraction of retail.",
  "menswear": "Shop second-hand menswear: t-shirts, shirts, hoodies, jeans, jackets and suits. Thousands of pre-loved pieces from sellers across the community.",
  "sneakers": "Buy and sell used and deadstock sneakers - Jordan, Nike, Adidas, Yeezy, New Balance, Vans and more. Verified by the sellers who wore them.",
  "bags-accessories": "Pre-loved bags and accessories: handbags, backpacks, wallets, belts, hats, scarves, sunglasses and watches. Second-hand finds you won't see twice.",
  "jewellery": "Second-hand jewellery: rings, necklaces, earrings, bracelets, brooches and fine gold pieces. Vintage and pre-loved, from costume to fine.",
  "beauty": "Barely-used and unopened beauty: skincare, makeup, fragrance, haircare, nails, tools and gift sets. Try something new for less.",
  "books": "Used books for less: fiction, non-fiction, self-help, manga, comics, textbooks and rare collectible editions. Give a good book a second read.",
  "home": "Second-hand homeware: decor, kitchen and dining, furniture, bedding, lighting, art prints and plants. Furnish your place with pre-loved pieces.",
  "vintage": "Genuine vintage clothing: Y2K, 90s and 80s pieces, vintage streetwear, designer and band tees. One-of-one finds, curated by real sellers.",
}

type Props = {
  params: Promise<{ category: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { category } = await params

  if (!VALID_CATEGORIES.includes(category)) {
    return {
      title: "Category Not Found",
    }
  }

  const label = resolveCategoryLabel(category)
  const description = CATEGORY_DESCRIPTIONS[category] || `Buy and sell pre-loved ${label} on Storelib`

  return {
    title: label,
    description,
    openGraph: {
      title: `${label} | Storelib`,
      description,
      type: "website",
      url: `https://storelib.com/explore/${category}`,
      images: [
        {
          url: "https://skgtqglupjcnfhfscink.supabase.co/storage/v1/object/public/platform%20images/89.jpg",
          width: 1200,
          height: 630,
          alt: `${label} on Storelib`,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: `${label} | Storelib`,
      description,
      images: ["https://skgtqglupjcnfhfscink.supabase.co/storage/v1/object/public/platform%20images/89.jpg"],
    },
    alternates: {
      canonical: `https://storelib.com/explore/${category}`,
    },
  }
}

export const dynamic = "force-dynamic"

export default async function CategoryPage({ params }: Props) {
  const { category } = await params

  if (!VALID_CATEGORIES.includes(category)) {
    notFound()
  }

  const supabase = await createClient()

  // Fetch ALL published products - same select as the feed in app/(marketing)/_explore-feed.tsx
  // Category filtering is done client-side for relevance-based sorting.
  // Resale columns exist only after 20260730_marketplace_physical_attributes.sql;
  // fall back to base columns if the migration hasn't run yet so the page never 400s.
  const BASE_COLS =
    "id, title, slug, description, price_cents, compare_at_cents, thumbnail_url, type, category, creator_id, created_at, sales_count, reviews_count, reviews_average"
  const runProductsQuery = (cols: string) =>
    supabase
      .from("products")
      .select(cols)
      .eq("status", "published")
      .order("created_at", { ascending: false })
      .limit(100)

  let { data: products, error: productsError } = await runProductsQuery(`${BASE_COLS}, size, size_system, condition, brand`)
  if (productsError) {
    console.error("[CategoryPage] Products error (retrying without resale columns):", productsError.message)
    const retry = await runProductsQuery(BASE_COLS)
    products = retry.data
    productsError = retry.error
  }

  // Build products with creator info
  let productsWithCreators: any[] = []

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

  const categoryLabel = resolveCategoryLabel(category)

  const categoryDescription = CATEGORY_DESCRIPTIONS[category] || `Buy and sell pre-loved ${categoryLabel} on Storelib`

  return (
    <main className="min-h-screen bg-white">
      {/* JSON-LD structured data */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "CollectionPage",
            "name": categoryLabel,
            "description": categoryDescription,
            "url": `https://storelib.com/explore/${category}`
          }),
        }}
      />

      <div className="mx-auto max-w-6xl lg:max-w-[1270px] px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        <CategoryPageClient
          initialProducts={productsWithCreators}
          category={category}
          categoryLabel={categoryLabel}
          categoryDescription={categoryDescription}
        />
      </div>
    </main>
  )
}
