import { Metadata } from "next"
import { notFound } from "next/navigation"
import { CATEGORY_PAGES } from "@/lib/explore/category-pages"
import { createClient } from "@/lib/supabase/server"
import { CategoryPageClient } from "@/components/explore/category-page-client"
import { jsonLdScript } from "@/lib/seo/json-ld"
import { STORELIB_OG_IMAGE, storelibAssetUrl } from "@/lib/brand/logo"
import { planIntervals } from "@/lib/memberships/intervals"
import { excludingCommunityProducts } from "@/lib/communities/listing"
import { createAdminClient } from "@/lib/supabase/admin"
import { offChannelAmong } from "@/lib/store/channel-filter"

/*
  The list moved to lib/explore/category-pages so that whatever DRAWS a link
  to one of these can ask whether the page exists. It could not before, and
  the explore page's "Show All" button spent a while pointing at
  /explore/for-you — a pill that is a feed, not a category — which is a 404.
*/
const VALID_CATEGORIES: readonly string[] = CATEGORY_PAGES

// Category labels for display
const CATEGORY_LABELS: Record<string, string> = {
  "design": "Design",
  "development": "Development",
  "marketing": "Marketing",
  "business": "Business",
  "ai": "AI",
  "social-media": "Social Media",
  "productivity": "Productivity",
  "photography": "Photography",
  "video": "Video",
  "audio-music": "Audio & Music",
  "education": "Education",
  "ecommerce": "E-commerce",
  "freebies": "Freebies",
  "other": "Other",
}

// Category descriptions for SEO
const CATEGORY_DESCRIPTIONS: Record<string, string> = {
  "design": "Browse premium design templates, UI kits, graphics, fonts, mockups and more. Find the perfect design resources for your next project.",
  "development": "Discover web templates, mobile apps, scripts, plugins and development tools. Build faster with ready-made code resources.",
  "marketing": "Find email templates, ad creatives, landing pages and SEO tools. Ready to adapt for your next campaign.",
  "business": "Get spreadsheets, presentations, documents and contracts. Professional business templates to streamline your workflow.",
  "ai": "Explore AI prompts, ChatGPT templates and automation tools. Leverage AI with curated prompt libraries and tools.",
  "social-media": "Download Instagram templates, TikTok content, YouTube assets and more. Grow your social media presence with stunning templates.",
  "productivity": "Find Notion templates, calendars, planners and checklists. Boost your productivity with organized template systems.",
  "photography": "Discover Lightroom presets, photo overlays, Photoshop actions and stock photos. Enhance your photography with professional tools.",
  "video": "Find video templates, transitions, motion graphics and effects. Create stunning videos with premium assets.",
  "audio-music": "Browse royalty-free music, sound effects, loops and samples. Find the perfect audio for your projects.",
  "education": "Explore online courses, eBooks, tutorials and worksheets. Learn new skills with quality educational content.",
  "ecommerce": "Get store themes, product photography templates and e-commerce tools. Build and grow your online store.",
  "freebies": "Discover free digital products, templates, and resources. Get started with no cost - perfect for trying before you buy.",
  "other": "Browse miscellaneous digital products and resources that don't fit into specific categories.",
}

type Props = {
  params: Promise<{ category: string }>
  searchParams: Promise<{ sub?: string | string[] }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { category } = await params

  if (!VALID_CATEGORIES.includes(category)) {
    return {
      title: "Category Not Found",
    }
  }

  const label = CATEGORY_LABELS[category] || category
  const description = CATEGORY_DESCRIPTIONS[category] || `Browse ${label} products on Storelib`

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
          url: storelibAssetUrl(STORELIB_OG_IMAGE),
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
      images: [storelibAssetUrl(STORELIB_OG_IMAGE)],
    },
    alternates: {
      canonical: `https://storelib.com/explore/${category}`,
    },
  }
}

export const dynamic = "force-dynamic"

export default async function CategoryPage({ params, searchParams }: Props) {
  const { category } = await params
  /* Read here so the first HTML is already the subcategory: the heading, the
     pressed pill and the list. It was read in an effect after hydration, so a
     link to ?sub=fonts painted every Design product first and then swapped. */
  const subParam = (await searchParams)?.sub
  const initialSub = typeof subParam === "string" ? subParam : undefined

  if (!VALID_CATEGORIES.includes(category)) {
    notFound()
  }

  const supabase = await createClient()

  // Fetch ALL published products - same query as the working /explore page
  // Category filtering is done client-side for relevance-based sorting
  /* A product that sells a community tier is found through its community, not here (lib/communities/listing). */
  const { data: catalogue, error: productsError } = await excludingCommunityProducts((exclude) => {
    let q = supabase
      .from("products")
      .select("id, title, slug, description, price_cents, compare_at_cents, pay_what_you_want, pwyw_min_price_cents, thumbnail_url, type, category, creator_id, created_at, sales_count, reviews_count, reviews_average")
      .eq("status", "published")
      .neq("type", "physical")
    if (exclude) q = q.is("community_id", null)
    return q.order("created_at", { ascending: false }).limit(100)
  })

  if (productsError) {
    console.error("[CategoryPage] Products error:", productsError.message)
  }
  /* Settings › Sales channels: a product its creator took off Explore is not here. */
  const offExplore = catalogue?.length ? await offChannelAmong(createAdminClient(), catalogue.map((p) => p.id), "marketplace") : new Set<string>()
  const products = catalogue ? catalogue.filter((p) => !offExplore.has(p.id)) : catalogue

  // Build products with creator info
  let productsWithCreators: any[] = []

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

  const categoryLabel = CATEGORY_LABELS[category] || category

  const categoryDescription = CATEGORY_DESCRIPTIONS[category] || `Browse ${categoryLabel} products on Storelib`

  return (
    /* Explore's ground and container, which the loading screen draws too
       (./loading.tsx), so nothing moves when the products arrive. */
    <main className="explore-ground min-h-screen bg-[#f8f9fa]" style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
      {/* JSON-LD structured data */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLdScript({
            "@context": "https://schema.org",
            "@type": "CollectionPage",
            "name": categoryLabel,
            "description": categoryDescription,
            "url": `https://storelib.com/explore/${category}`
          }),
        }}
      />

      <div className="mx-auto max-w-[1400px] px-4 sm:px-6 lg:px-8 pt-4 pb-6 sm:pt-5 sm:pb-8">
        <CategoryPageClient
          initialProducts={productsWithCreators}
          category={category}
          categoryLabel={categoryLabel}
          initialSubcategory={initialSub}
        />
      </div>
    </main>
  )
}
