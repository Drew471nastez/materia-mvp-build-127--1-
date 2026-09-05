import type { MetadataRoute } from "next"
import { createAdminClient } from "@/lib/supabase/admin"
import { STORELIB_CATEGORIES, categoryToSlug } from "@/lib/blog-categories"
import { CATEGORIES } from "@/lib/marketplace/categories"
import { deservesIndexing } from "@/lib/security/spam-signals"

export const dynamic = "force-dynamic"

const BASE = "https://storelib.com"

const STATIC_BLOG_SLUGS = [
  "how-to-start-selling-digital-products-2026",
  "why-low-transaction-fees-matter",
  "building-an-audience-before-you-launch",
  "pricing-strategies-for-digital-products",
]

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // "/" is the digital-products landing and the primary URL.
  //
  // /pricing, /features and /faq are back. They were 307ing to "/" for the
  // whole marketplace era and so were deliberately left out of here; they are
  // the pages somebody comparing platforms actually lands on, and a pricing
  // page nobody can find is a pricing page nobody reads.
  const routes: MetadataRoute.Sitemap = [
    { url: BASE, lastModified: new Date(), changeFrequency: "daily", priority: 1.0 },
    { url: `${BASE}/pricing`, lastModified: new Date(), changeFrequency: "weekly", priority: 0.9 },
    { url: `${BASE}/features`, lastModified: new Date(), changeFrequency: "weekly", priority: 0.8 },
    { url: `${BASE}/explore`, lastModified: new Date(), changeFrequency: "daily", priority: 0.9 },
    { url: `${BASE}/blog`, lastModified: new Date(), changeFrequency: "daily", priority: 0.9 },
    { url: `${BASE}/faq`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.6 },
    { url: `${BASE}/signup`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.7 },
    { url: `${BASE}/login`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.5 },
  ]

  /**
   * ONE ROW PER CATEGORY. NO SUBCATEGORY ROWS.
   *
   * An earlier version of this file also emitted `/explore/<id>?sub=<sub>` for
   * all seventy subcategories, ranked ABOVE their parent. That was wrong twice
   * over: /explore/[category]/page.tsx does not read `sub` at all -- the
   * subcategory chips are a client-side filter inside CategoryPageClient -- so
   * every one of those URLs served the same unfiltered page. Seventy sitemap
   * rows resolving to fourteen distinct documents is duplicate content, and we
   * were the ones handing Google the list.
   *
   * Derived from lib/marketplace/categories.ts, so a category added there
   * appears here without anybody remembering to come back.
   */
  for (const category of CATEGORIES) {
    if (category.id === "all") continue
    routes.push({
      url: `${BASE}/explore/${category.id}`,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 0.8,
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
