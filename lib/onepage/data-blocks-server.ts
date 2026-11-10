import "server-only"

/**
 * ===========================================================================
 *  THE DATA AND MONEY BLOCKS, FILLED ON THE SERVER (round AR)
 * ===========================================================================
 * What the live page's blocks are given before they are drawn, beside the
 * shelves and posts (./storelib-blocks-server), in the same cached read
 * (lib/onepage/published-page liveBlocksFor):
 *
 *   tips      whether the creator can take a payment now, and the currency
 *   stats     a number Storelib tracks (subscribers, sales, reviews, the
 *             average rating), read now; a typed one is left as typed
 *   paid      the product's name, price and checkout; the locked part is
 *             taken out of every block (./paid-access withoutLocked)
 *   reviews   the store's own published reviews and their score
 *   rss       the feed's latest posts, through the SSRF guard
 *   events    Bandsintown's upcoming shows for the artist, with BANDSINTOWN_APP_ID
 *   promo     a code from the store: the coupon's own code while it can be
 *             used, and none (the block is left out) once it cannot
 *
 * Every step fails to the block as it was, and a page without these blocks
 * reads nothing.
 */
import { appTarget, type AppBlockData, type AppItem } from "./app-blocks"
import { compactCount, statSourceOf } from "./stat-count"
import { withoutLocked } from "./paid-access"
import { reviewSourceOf } from "./reviews-block"
import { bandsintownArtist, bandsintownEvents, mergeEvents, parseFeed, FEED_ITEMS_MAX } from "./feeds"
import { couponUsable, promoCode } from "./storelib-blocks"
import { productCheckoutUrl } from "./product-block"
import { isPubliclyVisible, publicOnly } from "@/lib/products/visibility"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any
type Block = { id?: string; type?: string; enabled?: boolean; data?: Record<string, unknown> | null; [k: string]: unknown }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const RESOLVED_APPS = new Set(["tips", "stats", "paid", "reviews", "rss", "events"])

function needs(block: Block): boolean {
  if (block.enabled === false) return false
  if (block.type === "promo_code") return typeof block.data?.coupon_id === "string"
  if (block.type !== "app") return false
  const provider = String(block.data?.provider ?? "")
  if (!RESOLVED_APPS.has(provider)) return false
  if (provider === "stats") return Array.isArray(block.data?.items) && (block.data!.items as AppItem[]).some((i) => statSourceOf(i) !== "typed")
  if (provider === "events") return !!bandsintownArtist(block.data?.bandsintown_artist)
  if (provider === "reviews") return reviewSourceOf(block.data) === "storelib"
  return true
}

/** Does a block array hold anything this file fills? */
export function needsDataResolving(blocks: unknown): boolean {
  if (!Array.isArray(blocks)) return false
  return blocks.some((raw) => {
    const b = raw as Block | null
    if (!b || typeof b !== "object") return false
    if (needs(b)) return true
    return b.type === "group" && needsDataResolving(b.data?.children)
  })
}

/* ─── The reads ─────────────────────────────────────────────────────── */

export interface DataDeps {
  /** The creator's account can take payments now (lib/payments/service). */
  ready: (creatorId: string) => Promise<boolean>
  /** The store's selling currency. */
  currency: (creatorId: string) => Promise<string>
  /** A price as the store writes it. */
  money: (cents: number, currency: string) => string
  /** The store's published reviews and their score (lib/reviews/storefront-server). */
  reviews: (creatorId: string) => Promise<{ items: NonNullable<AppBlockData["review_items"]>; summary: AppBlockData["review_summary"] } | null>
  /** A public address, read with the SSRF guard. */
  fetchText: (url: string) => Promise<string | null>
  /** Bandsintown's events answer for an artist, or null with no key. */
  bandsintown: (artist: string) => Promise<unknown | null>
}

async function count(q: Promise<{ count: number | null; error: unknown }>): Promise<number | null> {
  try {
    const { count: n, error } = await q
    return error || typeof n !== "number" ? null : n
  } catch {
    return null
  }
}

async function trackedNumber(db: Db, creatorId: string, source: string): Promise<string | null> {
  switch (source) {
    case "subscribers": {
      const n = await count(db.from("subscribers").select("id", { count: "exact", head: true }).eq("creator_id", creatorId).eq("status", "subscribed"))
      return n === null ? null : compactCount(n)
    }
    case "sales": {
      const n = await count(db.from("orders").select("id", { count: "exact", head: true }).eq("creator_id", creatorId).eq("status", "completed"))
      return n === null ? null : compactCount(n)
    }
    case "reviews": {
      const n = await count(db.from("reviews").select("id", { count: "exact", head: true }).eq("creator_id", creatorId).eq("status", "published"))
      return n === null ? null : compactCount(n)
    }
    case "rating": {
      try {
        const { data, error } = await db.from("reviews").select("rating").eq("creator_id", creatorId).eq("status", "published").limit(5000)
        if (error || !Array.isArray(data) || !data.length) return null
        const ratings = (data as { rating: number }[]).map((r) => Number(r.rating)).filter((r) => r >= 1 && r <= 5)
        if (!ratings.length) return null
        /* One decimal, cut and never rounded up: 4.96 reads 4.9, not 5.0. */
        return (Math.floor((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10).toFixed(1)
      } catch {
        return null
      }
    }
    default:
      return null
  }
}

async function resolveApp(db: Db, deps: DataDeps, creatorId: string, block: Block): Promise<Block> {
  const data = (block.data ?? {}) as AppBlockData & Record<string, unknown>
  switch (data.provider) {
    case "tips": {
      const ready = await deps.ready(creatorId).catch(() => false)
      return { ...block, data: { ...data, tip_ready: ready, tip_currency: ready ? await deps.currency(creatorId).catch(() => "usd") : undefined } }
    }
    case "stats": {
      const items = await Promise.all(
        (Array.isArray(data.items) ? data.items : []).map(async (i) => {
          const source = statSourceOf(i)
          if (source === "typed") return i
          const value = await trackedNumber(db, creatorId, source)
          /* A number that cannot be read now is left out, never shown as 0 or as an old figure. */
          return value === null ? { ...i, value: "" } : { ...i, value }
        }),
      )
      return { ...block, data: { ...data, items } }
    }
    case "paid": {
      const id = typeof data.paid_product_id === "string" && UUID.test(data.paid_product_id) ? data.paid_product_id : null
      if (!id) return { ...block, data: { ...data, paid_ready: false } }
      const { data: product } = await publicOnly(db.from("products").select("id, title, price_cents, status, type, creator_id").eq("id", id).eq("creator_id", creatorId)).maybeSingle()
      if (!product || !isPubliclyVisible(product)) return { ...block, data: { ...data, paid_ready: false } }
      const p = product as { id: string; title?: string; price_cents?: number | null }
      const currency = await deps.currency(creatorId).catch(() => "usd")
      return {
        ...block,
        data: { ...data, paid_ready: true, paid_title: p.title || "", paid_price: p.price_cents && p.price_cents > 0 ? deps.money(p.price_cents, currency) : "", paid_checkout: productCheckoutUrl(p.id) },
      }
    }
    case "reviews": {
      const got = await deps.reviews(creatorId).catch(() => null)
      return got ? { ...block, data: { ...data, review_items: got.items, review_summary: got.summary } } : block
    }
    case "rss": {
      const want = typeof data.feed_count === "number" ? Math.max(0, Math.min(FEED_ITEMS_MAX, Math.floor(data.feed_count))) : 3
      const target = appTarget(data)
      if (!want || !target) return block
      const xml = await deps.fetchText(target.href).catch(() => null)
      return xml ? { ...block, data: { ...data, feed_items: parseFeed(xml, want) } } : block
    }
    case "events": {
      const artist = bandsintownArtist(data.bandsintown_artist)
      if (!artist) return block
      const json = await deps.bandsintown(artist).catch(() => null)
      if (!json) return block
      const own = (Array.isArray(data.items) ? data.items : []) as AppItem[]
      return { ...block, data: { ...data, items: mergeEvents(own, bandsintownEvents(json) as AppItem[]).slice(0, 24) } }
    }
    default:
      return block
  }
}

async function resolvePromo(db: Db, creatorId: string, block: Block): Promise<Block> {
  const data = (block.data ?? {}) as Record<string, unknown>
  const id = typeof data.coupon_id === "string" && UUID.test(data.coupon_id) ? data.coupon_id : null
  if (!id) return block
  const { data: coupon, error } = await db.from("coupons").select("id, code, is_active, starts_at, expires_at, usage_limit, usage_count, creator_id").eq("id", id).eq("creator_id", creatorId).maybeSingle()
  if (error) return block
  /* The store's code as it is now; once it cannot be used, no code, so the block is left out. */
  const code = coupon && couponUsable(coupon) ? promoCode((coupon as { code?: string }).code) : null
  return { ...block, data: { ...data, code: code ?? "" } }
}

/** One block, filled. Fails to the block as it was. */
export async function resolveDataBlock(db: Db, deps: DataDeps, creatorId: string, block: Block): Promise<Block> {
  if (!creatorId || !needs(block)) return block
  try {
    return block.type === "promo_code" ? await resolvePromo(db, creatorId, block) : await resolveApp(db, deps, creatorId, block)
  } catch {
    return block
  }
}

/** The page's blocks, each data block filled and every locked part taken out. Never throws. */
export async function withDataBlocks<T>(db: Db, deps: DataDeps, creatorId: string, blocks: T): Promise<T> {
  if (!Array.isArray(blocks)) return blocks
  let out: unknown[] = blocks
  if (creatorId && needsDataResolving(blocks)) {
    const walk = async (list: unknown[]): Promise<unknown[]> =>
      Promise.all(
        list.map(async (raw) => {
          const b = raw as Block | null
          if (!b || typeof b !== "object") return raw
          if (b.type === "group" && Array.isArray(b.data?.children)) return { ...b, data: { ...b.data, children: await walk(b.data!.children as unknown[]) } }
          return resolveDataBlock(db, deps, creatorId, b)
        }),
      )
    try {
      out = await walk(blocks)
    } catch {
      out = blocks
    }
  }
  return withoutLocked(out) as unknown as T
}

/* ─── The real deps ─────────────────────────────────────────────────── */

/** The deps the live page uses: the payment check, the store's currency, its reviews, the guarded fetch and Bandsintown. */
export async function liveDataDeps(db: Db): Promise<DataDeps> {
  const [{ checkoutReadyForCreator }, { readStoreCurrency }, { formatStoreMoney }] = await Promise.all([
    import("@/lib/payments/service"),
    import("@/lib/store/selling-currency-read"),
    import("@/lib/store/currency"),
  ])
  return {
    ready: (creatorId) => checkoutReadyForCreator(creatorId),
    currency: async (creatorId) => (await readStoreCurrency(db, creatorId)).currency,
    money: (cents, currency) => formatStoreMoney(cents, currency),
    reviews: async (creatorId) => {
      const { storefrontReviews } = await import("@/lib/reviews/storefront-server")
      const r = await storefrontReviews(creatorId)
      const list = r.enabled ? r.all.items : []
      if (!list.length) return { items: [], summary: null }
      const summary = r.all.summary
      return {
        items: list.slice(0, 12).map((v) => ({ id: v.id, rating: v.rating, title: v.title, body: v.body.slice(0, 600), author: v.author, date: v.date, verified: v.verified, product_title: v.product_title || undefined })),
        summary: { average: summary.average, count: summary.count, average_label: summary.average_label, count_label: summary.count_label },
      }
    },
    fetchText: async (url) => {
      const { fetchPublic } = await import("@/lib/api/public-fetch")
      const res = await fetchPublic(url, { maxBytes: 1_500_000, timeoutMs: 6000, maxRedirects: 3 })
      if (!res.ok) return null
      return await res.text()
    },
    bandsintown: async (artist) => {
      const key = process.env.BANDSINTOWN_APP_ID
      if (!key) return null
      const res = await fetch(`https://rest.bandsintown.com/artists/${encodeURIComponent(artist)}/events?app_id=${encodeURIComponent(key)}&date=upcoming`, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(6000) })
      return res.ok ? await res.json() : null
    },
  }
}
