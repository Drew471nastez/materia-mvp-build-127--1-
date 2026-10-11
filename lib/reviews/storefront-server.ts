import "server-only"

/**
 * ===========================================================================
 *  STORELIB REVIEWS ON A WEBSITE: THE READ
 * ===========================================================================
 * The published reviews a website's review sections draw (./storefront.ts
 * says what they are handed). Read with the service role, filtered to one
 * creator and to status published, and held for a minute per creator under
 * the creator's tag, which every review change already clears
 * (lib/reviews/store forgetReviewPages). The product's own reviews are read
 * beside the shop's when the page is about one.
 *
 * Before run-now part 133 the new columns are not there; the read falls back
 * to the columns part 52 made, so reviews still show, without titles or
 * photos. Never throws: a page whose reviews will not load draws without
 * them.
 */
import { unstable_cache } from "next/cache"
import { createAdminClient } from "@/lib/supabase/admin"
import { creatorTag } from "@/lib/commerce/product-page-cache"
import { publishedReviewsApp } from "./app-server"
import { readReviewsApp, type ReviewsAppSettings } from "./app-settings"
import { buildStorefrontReviews, emptyStorefrontReviews, sampleStorefrontReviews, type StorefrontProductRow, type StorefrontReviewRow, type StorefrontReviews } from "./storefront"
import { missingColumn } from "./store"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

const BUYER = "buyer:profiles!buyer_id(display_name)"
const COLUMNS = `id, product_id, rating, title, content, created_at, reviewer_name, verified, featured, photos, seller_reply, ${BUYER}`
const OLD_COLUMNS = `id, product_id, rating, content, created_at, reviewer_name, seller_reply, ${BUYER}`
const SHOP_LIMIT = 48
const PRODUCT_LIMIT = 50

async function readRows(db: Db, key: "creator_id" | "product_id", value: string, limit: number): Promise<StorefrontReviewRow[]> {
  const run = (cols: string) => db.from("reviews").select(cols).eq(key, value).eq("status", "published").order("created_at", { ascending: false }).limit(limit)
  let res = await run(COLUMNS)
  if (res.error && missingColumn(res.error)) res = await run(OLD_COLUMNS)
  if (res.error) return []
  return (res.data ?? []) as StorefrontReviewRow[]
}

async function readRatings(db: Db, key: "creator_id" | "product_id", value: string): Promise<number[]> {
  const res = await db.from("reviews").select("rating").eq(key, value).eq("status", "published").limit(5000)
  if (res.error) return []
  return ((res.data ?? []) as { rating: number }[]).map((r) => Number(r.rating))
}

interface ShopReviews {
  rows: StorefrontReviewRow[]
  ratings: number[]
  products: StorefrontProductRow[]
}

async function readShop(db: Db, creatorId: string): Promise<ShopReviews> {
  const [rows, ratings] = await Promise.all([readRows(db, "creator_id", creatorId, SHOP_LIMIT), readRatings(db, "creator_id", creatorId)])
  const ids = [...new Set(rows.map((r) => r.product_id))]
  const { data } = ids.length ? await db.from("products").select("id, title, slug, thumbnail_url").in("id", ids) : { data: [] }
  return { rows, ratings, products: (data ?? []) as StorefrontProductRow[] }
}

function cachedShop(creatorId: string): Promise<ShopReviews> {
  return unstable_cache(
    async () => {
      try {
        return await readShop(createAdminClient(), creatorId)
      } catch {
        return { rows: [], ratings: [], products: [] }
      }
    },
    ["storefront-reviews", creatorId],
    { revalidate: 60, tags: [creatorTag(creatorId)] },
  )()
}

function cachedProduct(creatorId: string, productId: string): Promise<{ rows: StorefrontReviewRow[]; ratings: number[] }> {
  return unstable_cache(
    async () => {
      try {
        const db = createAdminClient()
        const [rows, ratings] = await Promise.all([readRows(db, "product_id", productId, PRODUCT_LIMIT), readRatings(db, "product_id", productId)])
        return { rows, ratings }
      } catch {
        return { rows: [], ratings: [] }
      }
    },
    ["storefront-reviews-product", creatorId, productId],
    { revalidate: 60, tags: [creatorTag(creatorId)] },
  )()
}

/**
 * What a published page of the website hands its review sections. The app
 * off reads as `enabled: false` with nothing in it, and the sections draw
 * nothing.
 */
export async function storefrontReviews(creatorId: string, product?: { id: string; title?: string | null } | null): Promise<StorefrontReviews> {
  const db = createAdminClient()
  let settings: ReviewsAppSettings
  try {
    settings = await publishedReviewsApp(db, creatorId)
  } catch {
    settings = readReviewsApp(null)
  }
  if (!settings.enabled) return emptyStorefrontReviews(settings, creatorId)
  const [shop, own] = await Promise.all([cachedShop(creatorId), product?.id ? cachedProduct(creatorId, product.id) : Promise.resolve(null)])
  const products = [...shop.products]
  if (product?.id && !products.some((p) => p.id === product.id)) products.push({ id: product.id, title: product.title ?? "" })
  return buildStorefrontReviews({
    settings,
    creatorId,
    rows: shop.rows,
    shopRatings: shop.ratings,
    products,
    product: product?.id && own ? { id: product.id, title: product.title, rows: own.rows, ratings: own.ratings } : null,
    limit: 24,
  })
}

/**
 * For the builder's canvas: the same, uncached, with the app's settings as
 * they are now and sample reviews in place of none, so a section can be
 * placed and styled before the first review. The app off still draws in
 * the canvas (marked sample), so turning it on is not a step before laying
 * the page out.
 */
export async function canvasReviews(db: Db, creatorId: string, product?: { id: string; title?: string | null } | null): Promise<StorefrontReviews> {
  const { data } = await db.from("store_settings").select("reviews").eq("creator_id", creatorId).maybeSingle().then(
    (r: { data: unknown }) => r,
    () => ({ data: null }),
  )
  const settings = readReviewsApp((data as { reviews?: unknown } | null)?.reviews)
  const shop = await readShop(db, creatorId).catch(() => ({ rows: [], ratings: [], products: [] }) as ShopReviews)
  const own = product?.id ? { rows: await readRows(db, "product_id", product.id, PRODUCT_LIMIT), ratings: await readRatings(db, "product_id", product.id) } : null
  if (shop.rows.length === 0 && !(own && own.rows.length)) return { ...sampleStorefrontReviews(settings, creatorId, product ?? null), enabled: true }
  const built = buildStorefrontReviews({ settings, creatorId, rows: shop.rows, shopRatings: shop.ratings, products: shop.products, product: product?.id && own ? { id: product.id, title: product.title, rows: own.rows, ratings: own.ratings } : null })
  return { ...built, enabled: true }
}
