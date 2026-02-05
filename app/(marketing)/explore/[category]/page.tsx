import { Metadata } from "next"
import { notFound } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { CategoryPageClient } from "@/components/explore/category-page-client"

// Valid categories
const VALID_CATEGORIES = [
  "design",
  "development",
  "marketing",
  "business",
  "ai",
  "social-media",
  "productivity",
  "photography",
  "video",
  "audio-music",
  "education",
  "ecommerce",
  "freebies",
  "other",
]

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
  "marketing": "Find email templates, ad creatives, landing pages and SEO tools. Supercharge your marketing with professional templates.",
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
    title: `${label} Products | Storelib`,
    description,
    openGraph: {
      title: `${label} Products | Storelib`,
      description,
      type: "website",
      url: `https://storelib.com/explore/${category}`,
      images: [
        {
          url: "https://skgtqglupjcnfhfscink.supabase.co/storage/v1/object/public/platform%20images/89.jpg",
          width: 1200,
          height: 630,
          alt: `${label} Products on Storelib`,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: `${label} Products | Storelib`,
      description,
      images: ["https://skgtqglupjcnfhfscink.supabase.co/storage/v1/object/public/platform%20images/89.jpg"],
    },
  }
}

export async function generateStaticParams() {
  return VALID_CATEGORIES.map((category) => ({
    category,
  }))
}

export default async function CategoryPage({ params }: Props) {
  const { category } = await params

  if (!VALID_CATEGORIES.includes(category)) {
    notFound()
  }

  const supabase = await createClient()

  // Fetch products for this category
  const { data: products, error } = await supabase
    .from("products")
    .select(`
      *,
      creator:users!products_user_id_fkey (
        id,
        username,
        display_name,
        avatar_url,
        niche_tags
      )
    `)
    .eq("status", "published")
    .order("created_at", { ascending: false })

  if (error) {
    console.error("Error fetching products:", error)
  }

  const categoryLabel = CATEGORY_LABELS[category] || category

  return (
    <main className="min-h-screen bg-white">
      <div className="mx-auto max-w-6xl lg:max-w-[1270px] px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        <CategoryPageClient
          initialProducts={products || []}
          category={category}
          categoryLabel={categoryLabel}
        />
      </div>
    </main>
  )
}
