import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { createAdminClient } from "@/lib/supabase/admin"
import {
  STORELIB_CATEGORIES,
  CATEGORY_SUBTITLES,
  categoryToSlug,
  slugToCategory,
} from "@/lib/blog-categories"
import BlogListing, { type BlogPost } from "../../../_blog-listing"
import { jsonLdScript } from "@/lib/seo/json-ld"

/*
  HELD AT THE EDGE FOR A MINUTE, NOT RENDERED FOR EVERY READER (the owner:
  marketing pages served from the CDN). Nothing here depends on who is
  reading: the posts come from the admin client, which reads no cookie. It
  was force-dynamic, so every visit ran a function and the same database
  reads for the same page. Rebuilt in the background at most once a minute,
  the same minute next.config's `/blog/:path*` rule already gives the CDN.
*/
export const revalidate = 60

const STATIC_POSTS: BlogPost[] = [
  { id: "s1", slug: "how-to-start-selling-digital-products-2026", title: "How to Start Selling Digital Products in 2026", excerpt: "Turn your skills into income. A no-fluff guide to launching your first digital product store.", category: "Getting Started", published_at: "2026-01-15T00:00:00Z", read_time: "5 min read", cover_image_url: "/images/blog/digital-products-2026.svg", gradient: "from-neutral-800 to-neutral-900" },
  { id: "s2", slug: "why-low-transaction-fees-matter", title: "Why Low Transaction Fees Matter for Digital Creators", excerpt: "The difference between 3% and 15% fees adds up fast. We break down the real numbers.", category: "Creator Tips", published_at: "2026-02-03T00:00:00Z", read_time: "4 min read", cover_image_url: "/images/blog/transaction-fees.svg", gradient: "from-neutral-700 to-neutral-800" },
  { id: "s3", slug: "building-an-audience-before-you-launch", title: "Building an Audience Before You Launch", excerpt: "The creators who sell the most don't start marketing on launch day.", category: "Growth", published_at: "2026-02-10T00:00:00Z", read_time: "6 min read", cover_image_url: "/images/blog/digital-products-2026.svg", gradient: "from-neutral-800 to-neutral-700" },
  { id: "s4", slug: "pricing-strategies-for-digital-products", title: "Pricing Strategies That Actually Work for Digital Products", excerpt: "Most creators underprice their work. Learn proven pricing frameworks.", category: "Strategy", published_at: "2026-02-14T00:00:00Z", read_time: "7 min read", cover_image_url: "/images/blog/transaction-fees.svg", gradient: "from-neutral-700 to-neutral-900" },
]

async function fetchDbPostsByCategory(category: string): Promise<BlogPost[]> {
  try {
    const supabase = createAdminClient()
    const { data } = await supabase
      .from("blog_posts")
      .select("id, slug, title, excerpt, category, published_at, read_time, cover_image_url")
      .eq("is_published", true)
      .eq("category", category)
      .order("published_at", { ascending: false })
      .limit(50)
    return (data || []) as BlogPost[]
  } catch {
    return []
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ category: string }>
}): Promise<Metadata> {
  const { category: slug } = await params
  const category = slugToCategory(slug)
  if (!category) return { title: "Not Found" }

  const title = `${category} — Storelib Blog`
  const description = CATEGORY_SUBTITLES[category] || `Browse all Storelib articles about ${category}.`

  return {
    title,
    description,
    openGraph: { title, description, url: `https://storelib.com/blog/explore/categories/${slug}`, type: "website", siteName: "Storelib" },
    twitter: { card: "summary", title, description },
    alternates: { canonical: `https://storelib.com/blog/explore/categories/${slug}` },
    robots: { index: true, follow: true, googleBot: { index: true, follow: true } },
  }
}

export async function generateStaticParams() {
  return STORELIB_CATEGORIES.map(cat => ({ category: categoryToSlug(cat) }))
}

export default async function CategoryPage({
  params,
}: {
  params: Promise<{ category: string }>
}) {
  const { category: slug } = await params
  const category = slugToCategory(slug)
  if (!category) notFound()

  const dbPosts = await fetchDbPostsByCategory(category)
  const dbSlugs = new Set(dbPosts.map(p => p.slug))
  const staticForCat = STATIC_POSTS.filter(p => p.category === category && !dbSlugs.has(p.slug))

  const posts = [...dbPosts, ...staticForCat].sort(
    (a, b) => new Date(b.published_at || 0).getTime() - new Date(a.published_at || 0).getTime()
  )

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLdScript({
            "@context": "https://schema.org",
            "@type": "CollectionPage",
            name: `${category} — Storelib Blog`,
            description: CATEGORY_SUBTITLES[category] || `Browse all Storelib articles about ${category}.`,
            url: `https://storelib.com/blog/explore/categories/${categoryToSlug(category)}`,
            isPartOf: { "@type": "Blog", name: "Storelib Blog", url: "https://storelib.com/blog" },
            breadcrumb: {
              "@type": "BreadcrumbList",
              itemListElement: [
                { "@type": "ListItem", position: 1, name: "Blog", item: "https://storelib.com/blog" },
                { "@type": "ListItem", position: 2, name: category, item: `https://storelib.com/blog/explore/categories/${categoryToSlug(category)}` },
              ],
            },
          }),
        }}
      />
      <BlogListing
        posts={posts}
        activeCategory={category}
        title={category}
        subtitle={CATEGORY_SUBTITLES[category] || `Browse all articles about ${category}.`}
      />
    </>
  )
}
