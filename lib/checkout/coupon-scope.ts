/**
 * ===========================================================================
 *  WHICH PRODUCTS A CODE IS FOR, IN EVERY CHECKOUT
 * ===========================================================================
 * A code has three ways to say what it applies to: its products
 * (`product_ids`), its collections (`collection_ids`, the coupon editor's
 * "Only for collections") and "Physical products only" (`physical_only`).
 * The physical checkout honoured all three. The download checkout (one
 * product, priceOrder) and the basket (priceCart) read only the first, so a
 * code for physical products only took money off an ebook, and a code for
 * the Tees collection took it off every course.
 *
 * Now one rule decides it everywhere (scopeCovers), and collections are read
 * the same way for both (productsInCollections): hand-picked items, and a
 * smart collection's rules run over the products being priced.
 */
import { couponCovers, type CouponRow } from "./coupons"
import { inSmartCollection, readRules, type RuleProduct } from "@/lib/physical/collections"
import { SHOP_CURRENCY, shopMoneyIn } from "@/lib/store/shop-money"

type Db = { from: (table: string) => any } // eslint-disable-line @typescript-eslint/no-explicit-any

export type ScopedCoupon = Pick<CouponRow, "product_ids"> & { physical_only?: boolean | null; collection_ids?: string[] | null }

/**
 * Whether the code takes something off this product: never a product that
 * does not ship when it is for physical products only; with collections,
 * only a product in one of them (they decide, the product list does not);
 * else its product list, where none is every product.
 */
export function scopeCovers(coupon: ScopedCoupon, product: { id: string; type: string }, inCollections: ReadonlySet<string> | null): boolean {
  if (coupon.physical_only === true && product.type !== "physical") return false
  if (Array.isArray(coupon.collection_ids) && coupon.collection_ids.length > 0) return !!inCollections && inCollections.has(product.id)
  return couponCovers(coupon, product.id)
}

/**
 * ===========================================================================
 *  WHAT A CODE'S MINIMUM ORDER IS HELD TO, IN EVERY CHECKOUT (round 41)
 * ===========================================================================
 * The physical checkout counted the minimum on the lines' list prices,
 * before upsells and bundles; the basket counted it after them. So a $50
 * minimum code worked on a $55 cart with a $10 bundle saving in one checkout
 * and was refused in the other.
 *
 * The rule, everywhere: the lines the code covers, at what they cost AFTER
 * the store's automatic offers (bundles, quantity breaks) and BEFORE the code
 * itself. `afterOffers` is each line's price times its quantity less its
 * offers' discount; `applies` says which lines the code covers.
 */
export function minimumBase(afterOffers: readonly number[], applies: readonly boolean[]): number {
  return afterOffers.reduce((n, cents, i) => n + (applies[i] ? Math.max(0, Math.round(cents) || 0) : 0), 0)
}

/** The refusal when the covered lines, after offers, come to less than the code's minimum; null when it is met or there is none. */
export function couponMinimumError(coupon: { min_purchase_cents?: number | null }, afterOffers: readonly number[], applies: readonly boolean[], currency?: string): string | null {
  const min = Number(coupon.min_purchase_cents) || 0
  if (min <= 0 || minimumBase(afterOffers, applies) >= min) return null
  return `That code needs an order of at least ${shopMoneyIn(min, currency ?? SHOP_CURRENCY)}.`
}

/** Whether a code needs its collections read before scopeCovers can answer. */
export const needsCollections = (coupon: ScopedCoupon | null | undefined): boolean => !!coupon && Array.isArray(coupon.collection_ids) && coupon.collection_ids.length > 0

/**
 * The products, of those given, that are in any of the code's collections:
 * hand-picked items, and those a smart collection's rules take in. Only the
 * code's own creator's collections are read. A read that fails counts
 * nothing as in, so the code applies to less, never more.
 */
export async function productsInCollections(db: Db, creatorId: string, collectionIds: string[], products: RuleProduct[]): Promise<Set<string>> {
  const out = new Set<string>()
  if (!collectionIds.length || !products.length) return out
  const [{ data: cols }, { data: manual }] = await Promise.all([
    db.from("product_collections").select("id, kind, rules, match").eq("creator_id", creatorId).in("id", collectionIds),
    db.from("product_collection_items").select("collection_id, product_id").in("collection_id", collectionIds),
  ])
  const own = new Set(((cols ?? []) as { id: string }[]).map((c) => c.id))
  for (const m of (manual ?? []) as { collection_id: string; product_id: string }[]) if (own.has(m.collection_id)) out.add(m.product_id)
  for (const col of (cols ?? []) as { kind: string; rules: unknown; match: "all" | "any" }[]) {
    if (col.kind !== "smart") continue
    const rules = readRules(col.rules)
    for (const p of products) if (inSmartCollection(rules, col.match, p)) out.add(p.id)
  }
  return out
}

/** The columns a smart collection's rules read, and the product as they read it. */
export const RULE_PRODUCT_COLUMNS = "id, title, type, tags, vendor, price_cents, compare_at_price_cents, weight_grams, created_at, category"

export function ruleProductOf(p: Record<string, any>): RuleProduct { // eslint-disable-line @typescript-eslint/no-explicit-any
  return { id: p.id, title: p.title ?? "", type: p.type ?? "", tags: p.tags ?? [], vendor: p.vendor ?? null, priceCents: Number(p.price_cents ?? 0), compareAtCents: p.compare_at_price_cents ?? null, inventory: null, weightGrams: p.weight_grams ?? null, createdAt: p.created_at, category: p.category ?? null }
}

/**
 * For the download checkout and the basket: which of these products the
 * code covers, reading the products' rule columns and the collections only
 * when the code has collections. Null when the code's own product list is
 * the whole answer (no collections, not physical only), so nothing is read.
 */
export async function digitalCoverage(db: Db, coupon: (ScopedCoupon & { creator_id: string }) | null, products: { id: string; type: string }[]): Promise<((product: { id: string; type: string }) => boolean) | null> {
  if (!coupon) return null
  if (coupon.physical_only !== true && !needsCollections(coupon)) return null
  let inCollections: Set<string> | null = null
  if (needsCollections(coupon)) {
    const ids = [...new Set(products.map((p) => p.id))]
    const { data } = ids.length ? await db.from("products").select(RULE_PRODUCT_COLUMNS).in("id", ids) : { data: [] }
    inCollections = await productsInCollections(db, coupon.creator_id, coupon.collection_ids as string[], ((data ?? []) as Record<string, unknown>[]).map(ruleProductOf))
  }
  return (product) => scopeCovers(coupon, product, inCollections)
}
