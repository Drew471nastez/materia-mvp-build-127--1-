import type { MetadataRoute } from "next"
import { createAdminClient } from "@/lib/supabase/admin"

const BASE = "https://storelib.com"

const STATIC_BLOG_SLUGS = [
  "how-to-start-selling-digital-products-2026",
  "why-low-transaction-fees-matter",
  "building-an-audience-before-you-launch",
  "pricing-strategies-for-digital-products",
]

const CATEGORIES = [
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

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const routes: MetadataRoute.Sitemap = [
    { url: BASE, lastModified: new Date(), changeFrequency: "weekly", priority: 1.0 },
    { url: `${BASE}/blog`, lastModified: new Date(), changeFrequency: "weekly", priority: 0.9 },
    { url: `${BASE}/explore`, lastModified: new Date(), changeFrequency: "daily", priority: 0.9 },
    { url: `${BASE}/signup`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.7 },
    { url: `${BASE}/login`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.5 },
    { url: `${BASE}/pricing`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.7 },
  ]

  // Category pages
  for (const category of CATEGORIES) {
    routes.push({
      url: `${BASE}/explore/${category}`,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 0.8,
    })
  }

  // Static blog posts
  for (const slug of STATIC_BLOG_SLUGS) {
    routes.push({
      url: `${BASE}/blog/${slug}`,
      lastModified: new Date("2026-02-14"),
      changeFrequency: "monthly",
      priority: 0.8,
    })
  }

  const supabase = createAdminClient()

  // DB-published blog posts
  try {
    const { data: posts } = await supabase
      .from("blog_posts")
      .select("slug, updated_at")
      .eq("is_published", true)

    for (const post of posts || []) {
      const exists = STATIC_BLOG_SLUGS.includes(post.slug)
      if (!exists) {
        routes.push({
          url: `${BASE}/blog/${post.slug}`,
          lastModified: new Date(post.updated_at),
          changeFrequency: "monthly",
          priority: 0.8,
        })
      }
    }
  } catch {}

  // Published products
  try {
    const { data: products } = await supabase
      .from("products")
      .select("slug, updated_at")
      .eq("is_published", true)
      .limit(5000)

    for (const product of products || []) {
      routes.push({
        url: `${BASE}/p/${product.slug}`,
        lastModified: new Date(product.updated_at),
        changeFrequency: "weekly",
        priority: 0.7,
      })
    }
  } catch {}

  // Seller storefronts (profiles with a username)
  try {
    const { data: sellers } = await supabase
      .from("profiles")
      .select("username, updated_at")
      .not("username", "is", null)
      .limit(5000)

    for (const seller of sellers || []) {
      routes.push({
        url: `${BASE}/u/${seller.username}`,
        lastModified: new Date(seller.updated_at),
        changeFrequency: "weekly",
        priority: 0.6,
      })
    }
  } catch {}

  return routes
}
