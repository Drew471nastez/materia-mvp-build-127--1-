import type { Metadata } from "next"
import { createAdminClient } from "@/lib/supabase/admin"
import BlogListing, { type BlogPost } from "./_blog-listing"
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

export const metadata: Metadata = {
  title: "Storelib Blog — Creator Tips, Growth Strategies & Platform News",
  description: "Practical advice for digital product creators. Learn how to start selling, grow your audience, price your products, and build a sustainable creator business.",
  openGraph: {
    title: "Storelib Blog — Creator Tips, Growth Strategies & Platform News",
    description: "Practical advice for digital product creators on selling, growth, and strategy.",
    url: "https://storelib.com/blog",
    type: "website",
    siteName: "Storelib",
  },
  twitter: { card: "summary_large_image", title: "Storelib Blog", description: "Practical advice for digital product creators on selling, growth, and strategy." },
  alternates: { canonical: "https://storelib.com/blog" },
  robots: { index: true, follow: true, googleBot: { index: true, follow: true } },
}

const STATIC_POSTS: BlogPost[] = [
  { id: "s1", slug: "how-to-start-selling-digital-products-2026", title: "How to Start Selling Digital Products in 2026", excerpt: "Turn your skills into income. A no-fluff guide to launching your first digital product store — from choosing what to sell to getting your first sale.", category: "Getting Started", published_at: "2026-01-15T00:00:00Z", read_time: "5 min read", cover_image_url: "/images/blog/digital-products-2026.svg", gradient: "from-neutral-800 to-neutral-900" },
  { id: "s2", slug: "why-low-transaction-fees-matter", title: "Why Low Transaction Fees Matter for Digital Creators", excerpt: "The difference between 3% and 15% fees adds up fast. We break down the real numbers and show how much more you keep with lower fees.", category: "Creator Tips", published_at: "2026-02-03T00:00:00Z", read_time: "4 min read", cover_image_url: "/images/blog/transaction-fees.svg", gradient: "from-neutral-700 to-neutral-800" },
  { id: "s3", slug: "building-an-audience-before-you-launch", title: "Building an Audience Before You Launch", excerpt: "The creators who sell the most don't start marketing on launch day. Here's how to build anticipation and a waiting list before your product is even ready.", category: "Growth", published_at: "2026-02-10T00:00:00Z", read_time: "6 min read", cover_image_url: "/images/blog/digital-products-2026.svg", gradient: "from-neutral-800 to-neutral-700" },
  { id: "s4", slug: "pricing-strategies-for-digital-products", title: "Pricing Strategies That Actually Work for Digital Products", excerpt: "Most creators underprice their work. Learn proven pricing frameworks, when to offer discounts, and how to position premium products that sell.", category: "Strategy", published_at: "2026-02-14T00:00:00Z", read_time: "7 min read", cover_image_url: "/images/blog/transaction-fees.svg", gradient: "from-neutral-700 to-neutral-900" },
]

async function fetchDbPosts(): Promise<BlogPost[]> {
  try {
    const supabase = createAdminClient()
    const { data } = await supabase
      .from("blog_posts")
      .select("id, slug, title, excerpt, category, published_at, read_time, cover_image_url")
      .eq("is_published", true)
      .order("published_at", { ascending: false })
      .limit(50)
    return (data || []) as BlogPost[]
  } catch {
    return []
  }
}

export default async function BlogPage() {
  const dbPosts = await fetchDbPosts()
  const dbSlugs = new Set(dbPosts.map(p => p.slug))
  const staticFiltered = STATIC_POSTS.filter(p => !dbSlugs.has(p.slug))
  const allPosts = [...dbPosts, ...staticFiltered].sort(
    (a, b) => new Date(b.published_at || 0).getTime() - new Date(a.published_at || 0).getTime()
  )

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLdScript({
            "@context": "https://schema.org",
            "@type": "Blog",
            name: "Storelib Blog",
            description: "Practical advice for digital product creators.",
            url: "https://storelib.com/blog",
            publisher: { "@type": "Organization", name: "Storelib", url: "https://storelib.com" },
          }),
        }}
      />
      <BlogListing
        posts={allPosts}
        activeCategory={null}
        title="Blog"
        subtitle="The latest from Storelib — tips, platform news, and strategies to grow your business."
      />
    </>
  )
}
