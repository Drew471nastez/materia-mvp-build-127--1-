import type { MetadataRoute } from "next"
import { createAdminClient } from "@/lib/supabase/admin"
import { STORELIB_CATEGORIES, categoryToSlug } from "@/lib/blog-categories"
import { VALID_CATEGORY_IDS } from "@/lib/marketplace/categories"
import { DEPARTMENT_NAV, categoryPath } from "@/lib/marketplace/department-nav"

export const dynamic = "force-dynamic"

const BASE = "https://storelib.com"

const STATIC_BLOG_SLUGS = [
  "how-to-start-selling-digital-products-2026",
  "why-low-transaction-fees-matter",
  "building-an-audience-before-you-launch",
  "pricing-strategies-for-digital-products",
]

// Marketplace taxonomy, minus the "all" pseudo-category (that is just "/")
const EXPLORE_CATEGORIES = VALID_CATEGORY_IDS.filter((id) => id !== "all")

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // "/" is the marketplace feed and the primary URL. /explore serves the same feed but
  // canonicalises to "/", so it is intentionally not listed. /features, /pricing and
  // /faq now redirect to "/" and are not advertised either.
  const routes: MetadataRoute.Sitemap = [
    { url: BASE, lastModified: new Date(), changeFrequency: "daily", priority: 1.0 },
    { url: `${BASE}/blog`, lastModified: new Date(), changeFrequency: "daily", priority: 0.9 },
    { url: `${BASE}/signup`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.7 },
    { url: `${BASE}/login`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.5 },
  ]

  /**
   * ═════════════════════════════════════════════════════════════════════════
   *  THE FORTY-TWO PAGES THIS MARKETPLACE ACTUALLY HAS
   * ═════════════════════════════════════════════════════════════════════════
   *
   * Five departments and thirty-seven groups, each a real page with its own
   * title, description and canonical — see app/(marketing)/shop. They were
   * indexable and unlisted, which is the worst of both: a crawler could index
   * them but had to find them first, and the only links in were a menu behind a
   * button and a bar rendered by a client component.
   *
   * A GROUP OUTRANKS ITS DEPARTMENT here, 0.8 against 0.7, and that is
   * deliberate rather than tidy. "Femei" is a category listing; "Femei ·
   * Încălțăminte" is what somebody actually searches for, and it is the page
   * that can answer them. The department is the way in, not the destination.
   *
   * Derived from the taxonomy the sell form uses, so a department added there
   * appears in the sitemap without anybody remembering to come here — the same
   * rule the menus follow. See lib/marketplace/department-nav.
   */
  for (const dept of DEPARTMENT_NAV) {
    routes.push({
      url: `${BASE}${categoryPath(dept.id)}`,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 0.7,
    })
    for (const group of dept.subcategories) {
      routes.push({
        url: `${BASE}${categoryPath(dept.id, group.id)}`,
        lastModified: new Date(),
        changeFrequency: "daily",
        priority: 0.8,
      })
    }
  }

  /**
   * The legacy /explore/<id> pages, still listed because they still resolve and
   * still carry whatever authority they have accumulated. They are the OLD
   * taxonomy — sneakers, jewellery, vintage — and no listing has ever been filed
   * under one, so they are the lower priority of the two sets and are the ones
   * to retire once /shop has been crawled.
   */
  for (const category of EXPLORE_CATEGORIES) {
    routes.push({
      url: `${BASE}/explore/${category}`,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 0.5,
    })
  }

  // Blog category pages
  for (const category of STORELIB_CATEGORIES) {
    routes.push({
      url: `${BASE}/blog/explore/categories/${categoryToSlug(category)}`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.7,
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
      .select("slug, updated_at, published_at")
      .eq("is_published", true)

    for (const post of posts || []) {
      const exists = STATIC_BLOG_SLUGS.includes(post.slug)
      if (!exists) {
        routes.push({
          url: `${BASE}/blog/${post.slug}`,
          lastModified: new Date(post.updated_at || post.published_at),
          changeFrequency: "monthly",
          priority: 0.8,
        })
      }
    }
  } catch {}

  // Published products
  try {
    // products has no `is_published` column — publication state lives in `status`,
    // so the old filter silently errored and emitted zero product URLs
    const { data: products } = await supabase
      .from("products")
      .select("slug, updated_at")
      .eq("status", "published")
      .limit(5000)

    for (const product of products || []) {
      routes.push({
        url: `${BASE}/p/${product.slug}`,
        lastModified: new Date(product.updated_at || Date.now()),
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
