import type { MetadataRoute } from "next"
import { createAdminClient } from "@/lib/supabase/admin"

const BASE = "https://storelib.com"

const STATIC_BLOG_SLUGS = [
  "how-to-start-selling-digital-products-2026",
  "why-low-transaction-fees-matter",
  "building-an-audience-before-you-launch",
  "pricing-strategies-for-digital-products",
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

  // Static blog posts
  for (const slug of STATIC_BLOG_SLUGS) {
    routes.push({
      url: `${BASE}/blog/${slug}`,
      lastModified: new Date("2026-02-14"),
      changeFrequency: "monthly",
      priority: 0.8,
    })
  }

  // DB-published blog posts
  try {
    const supabase = createAdminClient()
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

  return routes
}
