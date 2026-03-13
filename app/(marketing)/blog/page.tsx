import type { Metadata } from "next"
import Image from "next/image"
import Link from "next/link"
import { Calendar, Clock, ArrowRight, BookOpen, TrendingUp, Zap, Users } from "lucide-react"
import { createAdminClient } from "@/lib/supabase/admin"

export const metadata: Metadata = {
  title: "Storelib Blog — Creator Tips, Growth Strategies & Platform News",
  description: "Practical advice for digital product creators. Learn how to start selling, grow your audience, price your products, and build a sustainable creator business.",
  openGraph: {
    title: "Storelib Blog — Creator Tips, Growth Strategies & Platform News",
    description: "Practical advice for digital product creators. Learn how to start selling, grow your audience, price your products, and build a sustainable creator business.",
    url: "https://storelib.com/blog",
    type: "website",
    images: [{
      url: "https://skgtqglupjcnfhfscink.supabase.co/storage/v1/object/public/platform%20images/89.jpg",
      width: 1200,
      height: 630,
      alt: "Storelib Blog",
    }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Storelib Blog — Creator Tips & Strategies",
    description: "Practical advice for digital product creators.",
  },
  alternates: { canonical: "https://storelib.com/blog" },
}

// Hardcoded fallback posts (always available without DB)
const STATIC_POSTS = [
  {
    id: "static-1",
    slug: "how-to-start-selling-digital-products-2026",
    title: "How to Start Selling Digital Products in 2026",
    excerpt: "Turn your skills into income. A no-fluff guide to launching your first digital product store — from choosing what to sell to getting your first sale.",
    category: "Getting Started",
    categoryIcon: BookOpen,
    published_at: "2026-01-15T00:00:00Z",
    read_time: "5 min read",
    gradient: "from-neutral-800 to-neutral-900",
    featured: true,
    cover_image_url: "/images/blog/digital-products-2026.svg",
    is_static: true,
  },
  {
    id: "static-2",
    slug: "why-low-transaction-fees-matter",
    title: "Why Low Transaction Fees Matter for Digital Creators",
    excerpt: "The difference between 3% and 15% fees adds up fast. We break down the real numbers and show how much more you keep with lower fees.",
    category: "Creator Tips",
    categoryIcon: TrendingUp,
    published_at: "2026-02-03T00:00:00Z",
    read_time: "4 min read",
    gradient: "from-neutral-700 to-neutral-800",
    featured: false,
    cover_image_url: "/images/blog/transaction-fees.svg",
    is_static: true,
  },
  {
    id: "static-3",
    slug: "building-an-audience-before-you-launch",
    title: "Building an Audience Before You Launch",
    excerpt: "The creators who sell the most don't start marketing on launch day. Here's how to build anticipation and a waiting list before your product is even ready.",
    category: "Growth",
    categoryIcon: Users,
    published_at: "2026-02-10T00:00:00Z",
    read_time: "6 min read",
    gradient: "from-neutral-800 to-neutral-700",
    featured: false,
    cover_image_url: "/images/blog/digital-products-2026.svg",
    is_static: true,
  },
  {
    id: "static-4",
    slug: "pricing-strategies-for-digital-products",
    title: "Pricing Strategies That Actually Work for Digital Products",
    excerpt: "Most creators underprice their work. Learn proven pricing frameworks, when to offer discounts, and how to position premium products that sell.",
    category: "Strategy",
    categoryIcon: Zap,
    published_at: "2026-02-14T00:00:00Z",
    read_time: "7 min read",
    gradient: "from-neutral-700 to-neutral-900",
    featured: false,
    cover_image_url: "/images/blog/transaction-fees.svg",
    is_static: true,
  },
]

const CATEGORY_ICONS: Record<string, React.ElementType> = {
  "Getting Started": BookOpen,
  "Creator Tips": TrendingUp,
  "Growth": Users,
  "Strategy": Zap,
}

function getCategoryIcon(category: string) {
  return CATEGORY_ICONS[category] || BookOpen
}

async function fetchDbPosts() {
  try {
    const supabase = createAdminClient()
    const { data } = await supabase
      .from("blog_posts")
      .select("id, slug, title, excerpt, category, published_at, read_time, cover_image_url")
      .eq("is_published", true)
      .order("published_at", { ascending: false })
      .limit(20)
    return data || []
  } catch {
    return []
  }
}

export default async function BlogPage() {
  const dbPosts = await fetchDbPosts()

  // Merge: static slugs + DB posts (DB posts that share slug with static are excluded from static list)
  const dbSlugs = new Set(dbPosts.map((p: { slug: string }) => p.slug))
  const staticPosts = STATIC_POSTS.filter(p => !dbSlugs.has(p.slug))

  // Combine: DB posts first, then remaining static posts
  type AnyPost = {
    id: string
    slug: string
    title: string
    excerpt: string
    category: string
    published_at: string | null
    read_time: string
    cover_image_url: string | null
    featured?: boolean
    gradient?: string
    categoryIcon?: React.ElementType
    is_static?: boolean
  }

  const allPosts: AnyPost[] = [
    ...dbPosts.map((p: { id: string; slug: string; title: string; excerpt: string; category: string; published_at: string | null; read_time: string; cover_image_url: string | null }) => ({ ...p, featured: false, gradient: "from-neutral-800 to-neutral-900" })),
    ...staticPosts,
  ]

  // Mark the most recent post as featured
  if (allPosts.length > 0) allPosts[0].featured = true

  const featuredPost = allPosts.find(p => p.featured)
  const otherPosts = allPosts.filter(p => !p.featured)

  return (
    <div className="bg-neutral-50 min-h-screen">
      {/* JSON-LD structured data */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Blog",
            name: "Storelib Blog",
            description: "Practical advice for digital product creators.",
            url: "https://storelib.com/blog",
            publisher: { "@type": "Organization", name: "Storelib", url: "https://storelib.com" },
          }),
        }}
      />

      {/* Hero */}
      <section className="relative pt-20 pb-16 overflow-hidden bg-[#f3f4f6]">
        <div className="relative z-10 max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center animate-in fade-in-0 slide-in-from-bottom-1 duration-500">
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-neutral-900 tracking-tight mb-5">
              Storelib Blog
            </h1>
            <p className="text-lg sm:text-xl text-neutral-500 max-w-2xl mx-auto leading-relaxed">
              Practical advice for creators who sell digital products.
            </p>
          </div>
        </div>
      </section>

      {/* Featured Post */}
      {featuredPost && (
        <section className="py-12">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
            <Link href={`/blog/${featuredPost.slug}`} className="group block">
              <article className="bg-white rounded-2xl border border-neutral-200 overflow-hidden hover:shadow-xl hover:border-neutral-300 transition-all duration-300">
                <div className="grid md:grid-cols-2">
                  <div className={`h-60 sm:h-64 md:h-full min-h-[240px] sm:min-h-[280px] bg-gradient-to-br ${featuredPost.gradient || "from-neutral-800 to-neutral-900"} relative overflow-hidden`}>
                    {featuredPost.cover_image_url && (
                      <Image src={featuredPost.cover_image_url} alt={featuredPost.title} fill className="object-cover opacity-90 group-hover:scale-105 transition-transform duration-700" sizes="(max-width: 768px) 100vw, 50vw" />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent" />
                    <div className="absolute top-4 left-4">
                      <span className="px-3 py-1 rounded-full text-xs font-semibold bg-white/20 text-white backdrop-blur-sm">Featured</span>
                    </div>
                  </div>
                  <div className="p-5 sm:p-6 md:p-8 flex flex-col justify-center">
                    <div className="flex items-center gap-2 mb-4">
                      {(() => { const Icon = featuredPost.categoryIcon || getCategoryIcon(featuredPost.category); return <Icon className="w-4 h-4 text-neutral-500" /> })()}
                      <span className="text-xs font-medium text-neutral-500 uppercase tracking-wider">{featuredPost.category}</span>
                    </div>
                    <h2 className="text-2xl sm:text-3xl font-bold text-neutral-900 mb-3 group-hover:text-neutral-600 transition-colors leading-tight">{featuredPost.title}</h2>
                    <p className="text-neutral-600 text-base leading-relaxed mb-6 line-clamp-3">{featuredPost.excerpt}</p>
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex flex-wrap items-center gap-3 text-sm text-neutral-500">
                        <div className="flex items-center gap-1.5">
                          <Calendar className="w-4 h-4 shrink-0" />
                          <span className="whitespace-nowrap">{featuredPost.published_at ? new Date(featuredPost.published_at).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : ""}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Clock className="w-4 h-4 shrink-0" />
                          <span className="whitespace-nowrap">{featuredPost.read_time}</span>
                        </div>
                      </div>
                      <span className="inline-flex items-center gap-2 text-sm font-semibold text-neutral-900 group-hover:text-neutral-600 transition-colors whitespace-nowrap shrink-0">
                        Read article
                        <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                      </span>
                    </div>
                  </div>
                </div>
              </article>
            </Link>
          </div>
        </section>
      )}

      {/* More Posts */}
      {otherPosts.length > 0 && (
        <section className="pb-16">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
            <h2 className="text-lg font-semibold text-neutral-900 mb-6">More Articles</h2>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {otherPosts.map(post => {
                const Icon = post.categoryIcon || getCategoryIcon(post.category)
                return (
                  <Link key={post.id} href={`/blog/${post.slug}`} className="group block">
                    <article className="bg-white rounded-2xl border border-neutral-200 overflow-hidden hover:shadow-xl hover:border-neutral-300 transition-all duration-300 h-full flex flex-col">
                      <div className={`h-40 bg-gradient-to-br ${post.gradient || "from-neutral-800 to-neutral-900"} relative overflow-hidden`}>
                        {post.cover_image_url && !post.is_static ? (
                          <Image src={post.cover_image_url} alt={post.title} fill className="object-cover opacity-90" sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw" />
                        ) : (
                          <div className="absolute inset-0 flex items-center justify-center">
                            <Icon className="w-10 h-10 text-white/20" />
                          </div>
                        )}
                      </div>
                      <div className="p-5 flex flex-col flex-1">
                        <div className="flex items-center gap-2 mb-3">
                          <Icon className="w-3.5 h-3.5 text-neutral-500" />
                          <span className="text-xs font-medium text-neutral-500 uppercase tracking-wider">{post.category}</span>
                        </div>
                        <h3 className="text-[16px] font-bold text-neutral-900 mb-2 group-hover:text-neutral-600 transition-colors leading-snug">{post.title}</h3>
                        <p className="text-neutral-600 text-sm leading-relaxed mb-4 line-clamp-3 flex-1">{post.excerpt}</p>
                        <div className="flex items-center justify-between pt-4 border-t border-neutral-100">
                          <div className="flex items-center gap-3 text-xs text-neutral-500">
                            <div className="flex items-center gap-1">
                              <Calendar className="w-3.5 h-3.5" />
                              <span>{post.published_at ? new Date(post.published_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : ""}</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <Clock className="w-3.5 h-3.5" />
                              <span>{post.read_time}</span>
                            </div>
                          </div>
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-neutral-900 group-hover:text-neutral-600">
                            Read
                            <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                          </span>
                        </div>
                      </div>
                    </article>
                  </Link>
                )
              })}
            </div>
          </div>
        </section>
      )}

      {/* CTA */}
      <section className="pb-16">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="relative overflow-hidden rounded-2xl bg-[#0a0a0a] p-8 sm:p-12 text-center">
            <div className="absolute top-0 right-0 w-64 h-64 bg-white/[0.03] rounded-full blur-3xl" />
            <div className="absolute bottom-0 left-0 w-48 h-48 bg-white/[0.03] rounded-full blur-3xl" />
            <div className="relative z-10">
              <h2 className="text-2xl sm:text-3xl font-bold text-white mb-4">Ready to start your creator journey?</h2>
              <p className="text-lg text-white/60 mb-6 max-w-xl mx-auto">
                Join creators selling digital products on Storelib. No monthly fees to start.
              </p>
              <Link href="/signup" className="inline-flex items-center gap-2 px-6 py-3.5 rounded-full text-base font-semibold bg-white text-neutral-900 hover:bg-neutral-100 transition-colors">
                Start Selling Free
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
