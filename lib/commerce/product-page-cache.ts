/**
 * ===========================================================================
 *  THE SHARED HALF OF A PRODUCT PAGE, FETCHED ONCE FOR EVERYBODY
 * ===========================================================================
 * Measured on production before this existed:
 *
 *     cache-control: private, no-cache, no-store, max-age=0, must-revalidate
 *     x-vercel-cache: MISS          (on every request, always)
 *     ttfb: 0.94s, 1.17s, 2.43s, 2.78s, 4.51s, 5.17s, 5.67s
 *
 * Every visitor paid a full server render, and most of that render is the
 * same handful of rows for all of them: the product, the creator, the shop's
 * theme, the product's own overrides.
 *
 * This is the split every marketplace makes. The page stays dynamic, because
 * whether YOU have bought this is not cacheable and never will be — but the
 * product itself is one row that changes when a creator edits it and not
 * once per visitor, so it is fetched once and shared until it changes.
 *
 * ---------------------------------------------------------------------------
 *  TWO CACHES, AND THEY DO DIFFERENT JOBS
 * ---------------------------------------------------------------------------
 *   React's cache()      one request. Stops the layout, generateMetadata and
 *                        the page each paying for the same row.
 *   unstable_cache()     across requests. Stops every VISITOR paying for it.
 *
 * They stack: the outer one dedupes within a render, the inner one survives
 * between renders.
 *
 * ---------------------------------------------------------------------------
 *  IT FALLS BACK RATHER THAN BREAKING
 * ---------------------------------------------------------------------------
 * The cached reads go through an anon client with no session (see
 * lib/supabase/public-read.ts), so row-level security applies to them as it
 * would to a stranger. If a table's policy turns out to need a session, the
 * anon read comes back EMPTY rather than wrong — and an empty product page
 * is worse than a slow one.
 *
 * So every loader below falls back to the per-request client when the cached
 * read finds nothing. Worst case this is exactly as fast as it was before;
 * it cannot be more broken.
 *
 * ---------------------------------------------------------------------------
 *  STALENESS
 * ---------------------------------------------------------------------------
 * Tags let a save clear this immediately, and `revalidate` is the backstop
 * for any save path that forgets to. Sixty seconds, because a creator who
 * edits a price and reloads has to see the new one — the tag is what makes
 * that instant, and the TTL is what limits the damage when the tag is
 * missed.
 */
import { unstable_cache } from "next/cache"
import { createPublicReadClient } from "@/lib/supabase/public-read"

/** The backstop, in seconds. Tag invalidation is the fast path. */
export const PRODUCT_CACHE_TTL = 60

export const productTag = (slug: string) => `product:${slug}`
export const creatorTag = (creatorId: string) => `creator:${creatorId}`

/** The page's own select: the row plus the categories it shows. */
export const PRODUCT_SELECT = `
      *,
      product_categories (
        category_id,
        category:categories (
          id,
          name,
          slug,
          type
        )
      )
    `

export const cachedProductBySlug = (slug: string) =>
  unstable_cache(
    async () => {
      const supabase = createPublicReadClient()
      const { data } = await supabase
        .from("products")
        .select(PRODUCT_SELECT)
        .eq("slug", slug)
        .eq("status", "published")
        .maybeSingle()
      return data ?? null
    },
    ["product-by-slug", slug],
    { revalidate: PRODUCT_CACHE_TTL, tags: [productTag(slug)] },
  )()

export const cachedCreator = (creatorId: string) =>
  unstable_cache(
    async () => {
      const supabase = createPublicReadClient()
      const { data } = await supabase.from("creators").select("*").eq("id", creatorId).maybeSingle()
      return data ?? null
    },
    ["creator", creatorId],
    { revalidate: PRODUCT_CACHE_TTL, tags: [creatorTag(creatorId)] },
  )()

export const cachedCreatorProfile = (userId: string) =>
  unstable_cache(
    async () => {
      const supabase = createPublicReadClient()
      const { data } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle()
      return data ?? null
    },
    ["creator-profile", userId],
    { revalidate: PRODUCT_CACHE_TTL, tags: [creatorTag(userId)] },
  )()

export const cachedStoreConfig = (creatorId: string, pageType: string) =>
  unstable_cache(
    async () => {
      const supabase = createPublicReadClient()
      const { data } = await supabase
        .from("store_builder_configs")
        .select("published_config")
        .eq("creator_id", creatorId)
        .eq("page_type", pageType)
        .maybeSingle()
      return data ?? null
    },
    ["store-config", creatorId, pageType],
    { revalidate: PRODUCT_CACHE_TTL, tags: [creatorTag(creatorId)] },
  )()

export const cachedProductPageConfig = (creatorId: string, productId: string) =>
  unstable_cache(
    async () => {
      const supabase = createPublicReadClient()
      const { data } = await supabase
        .from("product_page_configs")
        .select("published_config")
        .eq("creator_id", creatorId)
        .eq("product_id", productId)
        .maybeSingle()
      return data ?? null
    },
    ["product-page-config", creatorId, productId],
    { revalidate: PRODUCT_CACHE_TTL, tags: [creatorTag(creatorId), productTag(productId)] },
  )()
