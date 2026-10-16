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
import { readPublicRow } from "@/lib/security/public-rows"

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
      /* Every public column, never a private one (lib/security/public-rows). */
      return readPublicRow(createPublicReadClient(), "creators", (q) => q.eq("id", creatorId))
    },
    ["creator", creatorId],
    { revalidate: PRODUCT_CACHE_TTL, tags: [creatorTag(creatorId)] },
  )()

export const cachedCreatorProfile = (userId: string) =>
  unstable_cache(
    async () => {
      return readPublicRow(createPublicReadClient(), "profiles", (q) => q.eq("id", userId))
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
        /* A failed read is thrown, never held for a minute as "no config" (the loaders read again on the session). */
        .throwOnError()
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
        .throwOnError()
      return data ?? null
    },
    ["product-page-config", creatorId, productId],
    { revalidate: PRODUCT_CACHE_TTL, tags: [creatorTag(creatorId), productTag(productId)] },
  )()

/**
 * ===========================================================================
 *  THE REST OF THE SHARED HALF, WHICH IS WHERE THE TIME ACTUALLY WENT
 * ===========================================================================
 * The five loaders above cache the product row, the creator, and the three
 * config rows. Instrumented on production (lib/perf/phase-timer.ts), those
 * five together answer in 21ms to 66ms, and the page still took a second or
 * more. The timing split says where the rest of it is:
 *
 *     total=3827  client=1  creatorAndConfig=21  user=0  assets=503  variants=3302
 *     total=2882  client=1  creatorAndConfig=35  user=0  assets=38   variants=2808
 *     total=1012  client=1  creatorAndConfig=52  user=0  assets=26   variants=933
 *     total=367   client=0  creatorAndConfig=62  user=0  assets=166  variants=139
 *
 * One query, `product_variants` with its files joined, is 40% to 86% of the
 * whole render. It is not a missing index — scripts/045 and scripts/048 both
 * create `idx_product_variants_product` — it is the row-level security policy
 * on that table, which runs
 *
 *     EXISTS (SELECT 1 FROM products p WHERE p.id = product_variants.product_id
 *             AND p.status = 'published')
 *     OR EXISTS (SELECT 1 FROM products p JOIN creators c ON ...
 *                WHERE ... AND c.user_id = auth.uid())
 *
 * per row, on the variants AND on the two tables joined to them, with
 * `auth.uid()` re-evaluated every time. That is why the same query measures
 * 139ms cold and 3302ms under a handful of concurrent visitors: the cost is
 * per row and it compounds.
 *
 * supabase/migrations/20260916_rls_initplan.sql fixes the policy itself. This
 * caches the result, which is the half that ships without database access and
 * helps every visitor after the first either way.
 *
 * ---------------------------------------------------------------------------
 *  WHY THE ANON CLIENT IS ALLOWED TO READ THESE
 * ---------------------------------------------------------------------------
 * Not by assumption. The first branch of the policy quoted above grants the
 * SELECT to anybody as long as the product is published, and this page only
 * ever renders a published product — `cachedProductBySlug` filters on it. So
 * the sessionless client sees exactly what the cookie client would see here,
 * and nothing that belongs to one visitor is stored.
 *
 * Personalised data is NOT here and must never move here: whether you own
 * this product, your orders, your session. Those stay on the per-request
 * client in the page, uncached, exactly as they were.
 */

/**
 * ---------------------------------------------------------------------------
 *  SHAPES, DECLARED HERE BECAUSE THE CLIENT CANNOT INFER THEM
 * ---------------------------------------------------------------------------
 * `createClient` from supabase-js with no Database generic resolves a row to
 * `never`, so every field read downstream is an error. The per-request client
 * in lib/supabase/server.ts happens to widen to `any` instead, which is why
 * the page typechecked before. These say what the selects above return, so
 * the page keeps real types rather than trading one silent `any` for another.
 */
export type CachedVariant = {
  id: string
  name: string | null
  description: string | null
  price_cents: number | null
  max_purchases: number | null
  position: number | null
  pay_what_you_want?: boolean | null
  pwyw_min_price_cents?: number | null
  pwyw_suggested_price_cents?: number | null
  product_variant_files?: Array<{
    digital_asset_id: string | null
    digital_assets?: { id: string; file_name: string | null } | null
  }> | null
}

export type CachedAsset = { id: string; file_name: string | null }

export type CachedCourseModule = {
  id: string
  title: string
  lessons: Array<{ id: string; title: string; module_id: string; duration_seconds?: number | null; is_preview?: boolean }>
}

/** The seller's other products: the card's fields, and the row's others. */
export type CachedProductRow = {
  id: string
  slug: string | null
  title: string | null
  thumbnail_url: string | null
  price_cents: number | null
  compare_at_cents: number | null
  sales_count: number | null
  description: string | null
  [key: string]: unknown
}

export type CachedReview = { [key: string]: any }

export const VARIANT_SELECT = `
      id,
      name,
      description,
      price_cents,
      max_purchases,
      position,
      pay_what_you_want,
      pwyw_min_price_cents,
      pwyw_suggested_price_cents,
      product_variant_files (
        digital_asset_id,
        digital_assets (
          id,
          file_name
        )
      )
    `

export const cachedVariants = (productId: string) =>
  unstable_cache(
    async () => {
      const supabase = createPublicReadClient()
      const { data } = await supabase
        .from("product_variants")
        .select(VARIANT_SELECT)
        .eq("product_id", productId)
        .order("position")
      return (data ?? []) as unknown as CachedVariant[]
    },
    ["product-variants", productId],
    { revalidate: PRODUCT_CACHE_TTL, tags: [productTag(productId)] },
  )()

/**
 * File NAMES and ids, which the page already treats as public — the comment
 * at the call site says so, and the download API is what enforces
 * entitlement. No storage path, no signed URL, no bytes.
 */
export const cachedProductAssets = (productId: string) =>
  unstable_cache(
    async () => {
      const supabase = createPublicReadClient()
      const { data } = await supabase
        .from("digital_assets")
        .select("id, file_name")
        .eq("product_id", productId)
        .order("created_at", { ascending: true })
      return (data ?? []) as unknown as CachedAsset[]
    },
    ["product-assets", productId],
    { revalidate: PRODUCT_CACHE_TTL, tags: [productTag(productId)] },
  )()

/** What a "More from seller" card reads of a product, and nothing else. */
export const MORE_FROM_CREATOR_COLUMNS = "id, slug, title, thumbnail_url, price_cents, compare_at_cents, sales_count, description, type"

export const cachedMoreFromCreator = (creatorId: string, excludeProductId: string) =>
  unstable_cache(
    async () => {
      const supabase = createPublicReadClient()
      /*
        The card's columns only (app/(marketing)/p/[slug] moreProductsData),
        not the whole row: `*` carried every product's search vector, gallery,
        questions and custom fields into the data cache and back on every
        product page, to draw four cards. All of these are columns the
        Explore catalogue already names, so no database lacks one.
      */
      const { data } = await supabase
        .from("products")
        .select(MORE_FROM_CREATOR_COLUMNS)
        .eq("creator_id", creatorId)
        .eq("status", "published")
        .neq("type", "physical")
        .neq("id", excludeProductId)
        .limit(4)
      return (data ?? []) as unknown as CachedProductRow[]
    },
    ["more-from-creator", creatorId, excludeProductId],
    { revalidate: PRODUCT_CACHE_TTL, tags: [creatorTag(creatorId)] },
  )()

export const cachedReviews = (productId: string) =>
  unstable_cache(
    async () => {
      const supabase = createPublicReadClient()
      /*
        Published reviews only, with the columns a card draws (the buyer's
        name and photo, the seller's reply) and nothing else. Before run-now
        part 52 there is no status or reply column, and PostgREST refuses a
        request naming one (42703): asked again the old way, so reviews keep
        showing either way.
      */
      const read = (columns: string, published: boolean) => {
        let q = supabase.from("reviews").select(columns).eq("product_id", productId)
        if (published) q = q.eq("status", "published")
        return q.order("created_at", { ascending: false }).limit(10)
      }
      const buyer = "buyer:profiles!buyer_id(id, display_name, avatar_url)"
      /* With run-now part 134: whether it is a verified buyer's, so the card says so only then. */
      let res = await read(`id, product_id, rating, content, created_at, edited_at, reviewer_name, seller_reply, seller_reply_at, verified, source, ${buyer}`, true)
      if (res.error && (res.error.code === "42703" || res.error.code === "PGRST204")) {
        res = await read(`id, product_id, rating, content, created_at, edited_at, reviewer_name, seller_reply, seller_reply_at, ${buyer}`, true)
      }
      if (res.error && (res.error.code === "42703" || res.error.code === "PGRST204")) {
        res = await read(`id, product_id, rating, content, created_at, ${buyer}`, false)
      }
      return (res.data ?? []) as unknown as CachedReview[]
    },
    ["product-reviews", productId],
    { revalidate: PRODUCT_CACHE_TTL, tags: [productTag(productId)] },
  )()

/**
 * THE COURSE OUTLINE WAS THREE ROUND TRIPS IN A ROW: the course, then its
 * modules, then the lessons in those modules. Each one needs the answer to
 * the one before it, so they could not be started together — but the whole
 * chain is the same for every visitor, so it can be run once and shared.
 * Titles only, which is what the page renders before anybody buys.
 */
export const cachedCourseOutline = (productId: string) =>
  unstable_cache(
    async () => {
      const supabase = createPublicReadClient()
      /*
        ONE CALL, AND IT STILL SEES THE LESSONS. A visitor may read a course's
        module titles and its free preview lessons, nothing else (run-now part
        74), so the lesson titles of a published course come from
        public.course_outline(), which returns titles, running times and the
        preview marks and nothing a buyer paid for. Before that part has run
        it is not there, and the three reads below are what the page had.
      */
      const outline = (await (supabase.rpc as (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }>)("course_outline", { p_product_id: productId })) as { data: unknown; error: unknown }
      if (!outline.error && Array.isArray(outline.data)) {
        return (outline.data.length ? outline.data : null) as CachedCourseModule[] | null
      }
      const { data: course } = await supabase
        .from("courses")
        .select("id")
        .eq("product_id", productId)
        .maybeSingle()
      if (!course) return null as CachedCourseModule[] | null

      const { data: modules } = await supabase
        .from("course_modules")
        .select("id, title")
        .eq("course_id", (course as unknown as { id: string }).id)
        .order("position")
      if (!modules || modules.length === 0) return [] as CachedCourseModule[]

      const { data: lessons } = await supabase
        .from("course_lessons")
        .select("id, title, module_id")
        .in("module_id", modules.map((m) => (m as unknown as { id: string }).id))
        .order("position")

      return modules.map((m) => ({
        ...(m as unknown as { id: string; title: string }),
        lessons: (lessons ?? []).filter(
          (l) => (l as unknown as { module_id: string }).module_id === (m as unknown as { id: string }).id,
        ),
      })) as unknown as CachedCourseModule[]
    },
    ["course-outline", productId],
    { revalidate: PRODUCT_CACHE_TTL, tags: [productTag(productId)] },
  )()
