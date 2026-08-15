import type { MetadataRoute } from "next"
import { createAdminClient } from "@/lib/supabase/admin"
import { STORELIB_CATEGORIES, categoryToSlug } from "@/lib/blog-categories"
import { VALID_CATEGORY_IDS } from "@/lib/marketplace/categories"
import { DEPARTMENT_NAV, categoryPath } from "@/lib/marketplace/department-nav"
import { deservesIndexing } from "@/lib/security/spam-signals"

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

  /**
   * ═════════════════════════════════════════════════════════════════════════
   *  SELLER STOREFRONTS — ONLY THE ONES THAT SELL SOMETHING
   * ═════════════════════════════════════════════════════════════════════════
   *
   * This block used to list every profile that had a username, and that is how
   * a link farm found Storelib. Three hundred and sixty accounts signed up in
   * same-day batches, published nothing, and collected exactly what they came
   * for: an indexable URL on an authoritative domain, submitted to Google by
   * this file, for free, within a day of registering.
   *
   * The fix is not a better blocklist — that is an arms race and the farm gets
   * the last move. The fix is that SEO surface is EARNED BY PUBLISHING. An
   * account with nothing for sale has no storefront worth crawling; that is
   * true of a spammer and equally true of the real seller who signed up in
   * March and never finished, whose empty page was a thin-content liability in
   * the index anyway.
   *
   * So the rule is one line and it has no exceptions: at least one published
   * product, or you are not in the sitemap. lib/security/spam-signals.ts holds
   * it as `deservesIndexing`, and app/(marketing)/u/[username]/page.tsx reads
   * the same rule for its robots tag — the two must never disagree, or a page
   * says index-me while the sitemap says it does not exist.
   *
   * A seller crosses the line the moment they publish. Nothing to re-run: the
   * sitemap is force-dynamic and rebuilt per request.
   */
  try {
    // Who has published something. products.creator_id points at creators.id,
    // and it is creators.user_id that matches profiles.id — two hops, both
    // needed, and neither is joinable in PostgREST without an FK alias that
    // this schema does not declare.
    const { data: publishedRows } = await supabase
      .from("products")
      .select("creator_id")
      .eq("status", "published")
      .limit(20000)

    const publishingCreatorIds = [
      ...new Set((publishedRows || []).map((p: { creator_id: string | null }) => p.creator_id).filter(Boolean)),
    ] as string[]

    if (publishingCreatorIds.length) {
      const { data: creators } = await supabase
        .from("creators")
        .select("user_id")
        .in("id", publishingCreatorIds)

      const publishingUserIds = [
        ...new Set((creators || []).map((c: { user_id: string | null }) => c.user_id).filter(Boolean)),
      ] as string[]

      // Chunked: `.in()` builds a query string, and twenty thousand ids in one
      // would exceed what the server will accept as a URL.
      for (let i = 0; i < publishingUserIds.length; i += 500) {
        const { data: sellers } = await supabase
          .from("profiles")
          .select("username, updated_at")
          .in("id", publishingUserIds.slice(i, i + 500))
          .not("username", "is", null)

        for (const seller of sellers || []) {
          // The spam verdict is checked as well as the publication gate, so a
          // farm that files one decoy listing to buy its way in still does not.
          if (!deservesIndexing({ publishedProducts: 1, handle: seller.username })) continue
          routes.push({
            url: `${BASE}/u/${seller.username}`,
            lastModified: new Date(seller.updated_at),
            changeFrequency: "weekly",
            priority: 0.6,
          })
        }
      }
    }
  } catch {}

  return routes
}
