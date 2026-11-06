import {withVariantPrices} from "@/lib/pricing/variant-price"
/**
 * ===========================================================================
 *  ONE REQUEST, ONE QUERY PER ROW
 * ===========================================================================
 * Rendering a product page runs three pieces of code that each need the same
 * handful of rows, and none of them knew about the others:
 *
 *   layout.tsx        products, (slug history), store_builder_configs
 *   generateMetadata  products, (slug history), creators, profiles,
 *                     store_builder_configs
 *   page.tsx          products, creators, profiles, store_builder_configs x3,
 *                     and eleven more
 *
 * So every visit fetched the product row three times, the creator twice, the
 * creator's profile twice and the shop's config twice — nine round trips to
 * fetch four rows. On a page somebody is waiting to look at.
 *
 * React's `cache()` is scoped to one request. The first caller pays for the
 * query and every caller after it gets the same promise, so the three files
 * below can go on asking for what they need without knowing who asked first.
 * Nothing is cached BETWEEN requests: a creator who edits a product still
 * sees the change on the next load, exactly as before.
 *
 * WHY THE FULL ROW EVERY TIME. The three callers wanted three different
 * column lists, and three different column lists are three different queries.
 * One shape, asked for once, is fewer bytes over the wire than the narrow
 * ones were — because there were three of them.
 */
import { cache } from "react"
import { readPublicRow } from "@/lib/security/public-rows"
import { readPublishedProductPageConfig, readPublishedStoreConfig } from "@/lib/store-builder/public-config"
import { sanitizeDescription } from "@/lib/rich-text/sanitize"
import { createPublicReadClient } from "@/lib/supabase/public-read"
import {

  cachedCreator,
  cachedCreatorProfile,
  cachedProductBySlug,
  cachedProductPageConfig,
  cachedStoreConfig,
} from "./product-page-cache"


/*
  READ AS A STRANGER, FOR EVERYBODY (round 49). These rows draw the creator
  page and the product page, which are one HTML for every visitor so a CDN
  may hold them (tests/cdnpages-r49): the anon key with no session, never the
  visitor's own client, so no read here touches cookies() and no session can
  widen what the page shows. "Nothing published" is answered from the shared
  copy; a save expires it at once (lib/storefront/creator-page-purge).
*/
const stranger = () => createPublicReadClient() as never


/** The page's own select, unchanged: the row plus the categories it shows. */
const PRODUCT_SELECT = `
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

export interface ProductLookup {
  product: any | null
  /**
   * The slug in the URL is an old one and this row was found through
   * product_slug_history. The page redirects on this; the layout and the
   * metadata just use the row, because a redirect from three places is three
   * chances to disagree about where to go.
   */
  viaHistory: boolean
}

/**
 * THE DESCRIPTION, CLEANED ON THE WAY OUT. Every caller of the loader puts
 * it on the page one way or another, and the rows already in the database
 * were saved before anything sanitised them, some with the old editor's
 * inline event handlers in them. lib/rich-text/sanitize.ts. A copy, because
 * the shared row is the cache's.
 */
function withSafeDescription(product: any): any {
  if (!product || typeof product.description !== "string") return product
  return { ...product, description: sanitizeDescription(product.description) }
}

/**
 * `owner` is the creator the address names (storelib.com/<handle>/<slug>,
 * app/(marketing)/[sellername]/[productSlug]): the slug is looked up among
 * that creator's products only, because a slug is unique per creator and
 * not across Storelib. Without one (/p/<slug>) the oldest product with the
 * slug, never "no row" because two creators chose the same word.
 */
export const loadProductBySlug = cache(async (slug: string, owner?: string | null): Promise<ProductLookup> => {
  /*
    THE SHARED COPY FIRST. A published product is the same row for every
    visitor, so it is fetched once and kept for a minute rather than queried
    per request. product-page-cache.ts explains the two caches and why the
    fallback below is not optional.
  */
  const shared = await cachedProductBySlug(slug, owner)
  if (shared) return { product: withSafeDescription(shared), viaHistory: false }

  const supabase = createPublicReadClient()

  let currentQuery = supabase.from("products").select(PRODUCT_SELECT).eq("slug", slug).eq("status", "published")
  if (owner) currentQuery = currentQuery.eq("creator_id", owner)
  const { data: currentRows } = await currentQuery.order("created_at", { ascending: true }).limit(1)
  const current = Array.isArray(currentRows) ? currentRows[0] : null

  if (current) return { product: withSafeDescription((await withVariantPrices(supabase,[current]))[0]), viaHistory: false }

  /*
    THE RENAMED-PRODUCT PATH, and it is deliberately two queries rather than
    one embedded select. Nesting categories two levels inside `products!inner`
    is a shape PostgREST will refuse on some schemas, and this path only runs
    for a link somebody sent before the creator renamed the product. A second
    round trip on the rare path is cheaper than a clever query that can fail
    on the common one.
  */
  /* Several products may once have had this slug, one per creator: the owner's, else the most recent move. */
  const { data: moves } = await supabase
    .from("product_slug_history")
    .select("product_id, products!inner (id, status, creator_id)")
    .eq("old_slug", slug)
    .order("created_at", { ascending: false })
    .limit(10)

  const history = ((moves ?? []) as { product_id?: string; products?: unknown }[]).find((h) => {
    const p = (Array.isArray(h.products) ? h.products[0] : h.products) as { status?: string; creator_id?: string } | undefined
    return !!h.product_id && p?.status === "published" && (!owner || p.creator_id === owner)
  })
  if (!history?.product_id) {
    return { product: null, viaHistory: false }
  }

  const { data: renamed } = await supabase
    .from("products")
    .select(PRODUCT_SELECT)
    .eq("id", history.product_id)
    .eq("status", "published")
    .maybeSingle()

  return { product: withSafeDescription(renamed ?? null), viaHistory: !!renamed }
})

export const loadCreator = cache(async (creatorId: string) => {
  const shared = await cachedCreator(creatorId)
  if (shared) return shared
  return readPublicRow(stranger(), "creators", (q) => q.eq("id", creatorId))
})

export const loadCreatorProfile = cache(async (userId: string) => {
  const shared = await cachedCreatorProfile(userId)
  if (shared) return shared
  return readPublicRow(stranger(), "profiles", (q) => q.eq("id", userId))
})

/**
 * `store_builder_configs` keyed by creator and page type. The page reads both
 * "shop" and "product"; the layout reads "product"; the metadata reads
 * "shop". Two queries between them now instead of four.
 */
export const loadStoreConfig = cache(async (creatorId: string, pageType: string) => {
  const shared = await cachedStoreConfig(creatorId, pageType).catch(() => undefined)
  if (shared) return shared
  /* Nothing published, and a visitor with no session cannot have just published it (lib/supabase/session-cookie.ts). */
  if (shared === null) return null
  /* Read fresh, the same narrow server read the cache makes (lib/store-builder/public-config.ts, round 48): a session no longer widens what a config read sees. */
  return readPublishedStoreConfig(creatorId, pageType).catch(() => null)
})

/** The per-product override, which only the page reads. Here for symmetry. */
export const loadProductPageConfig = cache(async (creatorId: string, productId: string) => {
  const shared = await cachedProductPageConfig(creatorId, productId).catch(() => undefined)
  if (shared) return shared
  /* As above: no session, nothing more to find. */
  if (shared === null) return null
  return readPublishedProductPageConfig(creatorId, productId).catch(() => null)
})
