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
 * would to a stranger. The two config rows are the one exception
 * (round 48): read by the server through lib/store-builder/public-config.ts,
 * one column, nothing private in it, see cachedStoreConfig below. If a table's policy turns out to need a session, the
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
import { communityPath } from "@/components/community/public/paths"
import { unstable_cache } from "next/cache"
import { createPublicReadClient } from "@/lib/supabase/public-read"
import { readPublicRow } from "@/lib/security/public-rows"
import { excludingCommunityProducts } from "@/lib/communities/listing"
import { readPublishedProductPageConfig, readPublishedStoreConfig } from "@/lib/store-builder/public-config"

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

/*
  A SLUG IS UNIQUE PER CREATOR, NOT ACROSS STORELIB (round 44). Two creators
  may both sell an `ebook`, and `.maybeSingle()` answers no row at all when
  two match, so both products were a 404 at the addresses every link and the
  sitemap name. Held to its creator when the address names one
  (storelib.com/<handle>/<slug>); without one (/p/<slug>) the oldest, which
  is the one the slug first belonged to, as the website's product page reads
  it (components/website-builder/theme/render-product.tsx).
*/
export const cachedProductBySlug = (slug: string, creatorId?: string | null) =>
  unstable_cache(
    async () => {
      const supabase = createPublicReadClient()
      let query = supabase.from("products").select(PRODUCT_SELECT).eq("slug", slug).eq("status", "published")
      if (creatorId) query = query.eq("creator_id", creatorId)
      const { data } = await query.order("created_at", { ascending: true }).limit(1)
      return (Array.isArray(data) ? data[0] : null) ?? null
    },
    ["product-by-slug", slug, creatorId ?? ""],
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

/*
  THE TWO CONFIG ROWS ARE READ BY THE SERVER, NOT THE ANON KEY (round 48,
  R48-6). Read with the anon key they needed a policy that let the anon role
  read the tables, and with it anybody holding the key read every row
  directly, drafts and contact addresses included. They go through
  lib/store-builder/public-config.ts: the service role, the published_config
  column alone, the contact address taken out before it is returned. So what
  is held here for everybody is what the anon read held, less the address.
  Same keys, tags and minute as before.
*/
export const cachedStoreConfig = (creatorId: string, pageType: string) =>
  unstable_cache(
    /* A failed read is thrown, never held for a minute as "no config" (the loaders read again). */
    async () => readPublishedStoreConfig(creatorId, pageType),
    ["store-config", creatorId, pageType],
    { revalidate: PRODUCT_CACHE_TTL, tags: [creatorTag(creatorId)] },
  )()

export const cachedProductPageConfig = (creatorId: string, productId: string) =>
  unstable_cache(
    async () => readPublishedProductPageConfig(creatorId, productId),
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

        ROUND AG, THE OWNER: "a community's extra pricing plans show as separate products". A community sells each plan
        through a product of its own, and every one of them was a card. Now the ordinary products are read without
        those (lib/communities/listing excludingCommunityProducts), and each of the creator's public communities is one
        card of its own: its name and cover, the price of its cheapest plan, linking through one plan's address (which
        opens the community, app/(marketing)/p/[slug]).
      */
      const plainRead = excludingCommunityProducts((exclude) => {
        let q = supabase
          .from("products")
          .select(MORE_FROM_CREATOR_COLUMNS)
          .eq("creator_id", creatorId)
          .eq("status", "published")
          .neq("type", "physical")
          .neq("id", excludeProductId)
        if (exclude) q = q.is("community_id", null)
        return q.limit(4)
      })
      const communitiesRead = supabase
        .from("communities")
        .select("id, slug, name, tagline, cover_url, logo_url")
        .eq("creator_id", creatorId)
        .eq("status", "published")
        .eq("visibility", "public")
        .is("deleted_at", null)
        .is("archived_at", null)
        .limit(2)
      const [{ data: plain }, { data: communities, error: communitiesError }] = await Promise.all([plainRead, communitiesRead])
      const cards: CachedProductRow[] = []
      const list = communitiesError ? [] : ((communities ?? []) as Array<{ id: string; slug: string | null; name: string | null; tagline: string | null; cover_url: string | null; logo_url: string | null }>)
      if (list.length) {
        const { data: planRows } = await supabase
          .from("products")
          .select(`${MORE_FROM_CREATOR_COLUMNS}, community_id`)
          .in("community_id", list.map((c) => c.id))
          .eq("status", "published")
          .neq("id", excludeProductId)
        const plans = ((planRows ?? []) as unknown as Array<CachedProductRow & { community_id: string }>).filter((p) => !!p.slug)
        for (const c of list) {
          const mine = plans.filter((p) => p.community_id === c.id)
          /*
            ROUND AJ: A FREE COMMUNITY IS A CARD TOO. One with no paid plan has no product to link through, so it was
            left out; its card now goes straight to the community's own page (communityPath), free to join.
          */
          if (!mine.length) {
            if (c.slug) cards.push({ id: `community:${c.id}`, slug: null, href: communityPath(c.slug), title: c.name || "", thumbnail_url: c.cover_url || c.logo_url, price_cents: 0, compare_at_cents: null, sales_count: null, description: c.tagline, kind: "community", type: "community" })
            continue
          }
          const paid = mine.filter((p) => (p.price_cents ?? 0) > 0).sort((a, b) => (a.price_cents ?? 0) - (b.price_cents ?? 0))
          const pick = paid[0] ?? mine[0]
          cards.push({ ...pick, title: c.name || pick.title, thumbnail_url: c.cover_url || c.logo_url || pick.thumbnail_url, description: c.tagline ?? pick.description, compare_at_cents: null, kind: "community" })
        }
      }
      for (const p of (plain ?? []) as unknown as CachedProductRow[]) if (cards.length < 4) cards.push(p)
      return cards.slice(0, 4)
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
