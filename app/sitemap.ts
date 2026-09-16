import type { MetadataRoute } from "next"
import { createAdminClient } from "@/lib/supabase/admin"
import { STORELIB_CATEGORIES, categoryToSlug } from "@/lib/blog-categories"
import { CATEGORIES } from "@/lib/marketplace/categories"
import { deservesIndexing } from "@/lib/security/spam-signals"
import { getProductShareUrl } from "@/lib/url-helpers"

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

  /**
   * ═════════════════════════════════════════════════════════════════════════
   *  PUBLISHED PRODUCTS, AND THE SELLERS BEHIND THEM, FROM ONE PASS
   * ═════════════════════════════════════════════════════════════════════════
   * A product's address is `storelib.com/<handle>/<slug>`, so the sitemap has
   * to know whose product each one is. That is the same two hops the seller
   * block below already made — products to creators to profiles — and it used
   * to make them separately, querying products twice per request.
   *
   * It is one pass now, and the map it builds serves both lists. A product
   * whose creator has no handle keeps the only address it has, `/p/<slug>`,
   * which is what getProductShareUrl returns for an empty handle.
   *
   * Listing a URL here that redirects elsewhere is the specific thing a
   * sitemap should not do: it spends crawl budget to be told to go somewhere
   * else, and splits the signal between two addresses for the same page.
   */
  const handleByCreatorId = new Map<string, { username: string; updatedAt: string }>()

  try {
    // products has no `is_published` column — publication state lives in `status`,
    // so the old filter silently errored and emitted zero product URLs
    const { data: products } = await supabase
      .from("products")
      .select("slug, updated_at, creator_id")
      .eq("status", "published")
      .limit(5000)

    const creatorIds = [
      ...new Set((products || []).map((p: { creator_id: string | null }) => p.creator_id).filter(Boolean)),
    ] as string[]

    if (creatorIds.length) {
      // products.creator_id points at creators.id, and it is creators.user_id
      // that matches profiles.id — two hops, neither joinable in PostgREST
      // without an FK alias this schema does not declare.
      const { data: creators } = await supabase
        .from("creators")
        .select("id, user_id")
        .in("id", creatorIds)

      const userIdByCreatorId = new Map<string, string>()
      for (const c of (creators || []) as { id: string; user_id: string | null }[]) {
        if (c.user_id) userIdByCreatorId.set(c.id, c.user_id)
      }

      const userIds = [...new Set(userIdByCreatorId.values())]
      const profileByUserId = new Map<string, { username: string; updatedAt: string }>()

      // Chunked: `.in()` builds a query string, and twenty thousand ids in one
      // would exceed what the server will accept as a URL.
      for (let i = 0; i < userIds.length; i += 500) {
        const { data: sellers } = await supabase
          .from("profiles")
          .select("id, username, updated_at")
          .in("id", userIds.slice(i, i + 500))
          .not("username", "is", null)

        for (const seller of (sellers || []) as { id: string; username: string; updated_at: string }[]) {
          profileByUserId.set(seller.id, { username: seller.username, updatedAt: seller.updated_at })
        }
      }

      for (const [creatorId, userId] of userIdByCreatorId) {
        const profile = profileByUserId.get(userId)
        if (profile) handleByCreatorId.set(creatorId, profile)
      }
    }

    for (const product of (products || []) as { slug: string; updated_at: string | null; creator_id: string | null }[]) {
      const handle = product.creator_id ? handleByCreatorId.get(product.creator_id)?.username : undefined
      routes.push({
        url: getProductShareUrl(handle || "", product.slug),
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
  /* Every entry in this map is by definition a creator with a published
     product, because that is the only query it was built from. The two hops
     are already paid for above. */
  for (const profile of new Set(handleByCreatorId.values())) {
    // The spam verdict is checked as well as the publication gate, so a farm
    // that files one decoy listing to buy its way in still does not get in.
    if (!deservesIndexing({ publishedProducts: 1, handle: profile.username })) continue
    routes.push({
      url: `${BASE}/${profile.username}`,
      lastModified: new Date(profile.updatedAt),
      changeFrequency: "weekly",
      priority: 0.6,
    })
  }

  return routes
}
