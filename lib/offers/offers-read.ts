/**
 * Reading a store's offers (store_offers, SQL parts 116 and 230) with
 * whatever database client the caller has: the checkout's and the basket's
 * pricing (lib/physical/checkout-pricing-server.ts, lib/checkout/pricing.ts),
 * the cart and the product page. Kept apart from ./offers-server.ts, which
 * is server only and holds the store's own edits, so pricing code that its
 * tests run directly can import it. The arithmetic is ./offers.ts.
 *
 * A database that has part 116 and not yet 230 still reads and applies the
 * offers it has, with the defaults for the settings 230 adds (shown
 * everywhere, no dates, combines with codes, no limits).
 */
import { loggable } from "@/lib/admin/plain-reason"
import { selectTolerant } from "@/lib/supabase/tolerant-select"
import { inSmartCollection, readRules, type RuleProduct } from "@/lib/physical/collections"
import { MAX_OFFERS, OFFER_KINDS, PLACEMENTS_FOR, placementsOf, type Offer, type OfferLine, type Placement } from "@/lib/offers/offers"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

export type Row = {
  id: string
  kind: Offer["kind"]
  title: string
  product_ids: string[]
  trigger_product_ids: string[]
  discount_type: Offer["discountType"]
  discount_value: number
  active: boolean
  position: number
  trigger_collection_ids?: string[] | null
  placements?: string[] | null
  starts_at?: string | null
  ends_at?: string | null
  combines_with_codes?: boolean | null
  max_per_order?: number | null
  min_subtotal_cents?: number | null
}
export const BASE_COLUMNS = "id, kind, title, product_ids, trigger_product_ids, discount_type, discount_value, active, position"
/** Added by SQL part 230. */
export const PART_230_COLUMNS = ["trigger_collection_ids", "placements", "starts_at", "ends_at", "combines_with_codes", "max_per_order", "min_subtotal_cents"] as const
export const COLUMNS = `${BASE_COLUMNS}, ${PART_230_COLUMNS.join(", ")}`
export const MISSING = new Set(["42P01", "PGRST205", "42703", "PGRST204"])
export const PART_230 = "supabase/sql/run-now/230_store_offers_settings.sql"

export const offerOf = (r: Row): Offer => {
  const kind = r.kind
  return {
    id: r.id,
    kind,
    title: r.title,
    productIds: r.product_ids ?? [],
    triggerIds: r.trigger_product_ids ?? [],
    discountType: r.discount_type,
    discountValue: Number(r.discount_value) || 0,
    active: r.active !== false,
    triggerCollectionIds: r.trigger_collection_ids ?? [],
    placements: Array.isArray(r.placements) ? placementsOf({ kind, placements: r.placements as Placement[] }) : [...PLACEMENTS_FOR[kind]],
    startsAt: r.starts_at ?? null,
    endsAt: r.ends_at ?? null,
    combinesWithCodes: r.combines_with_codes !== false,
    maxPerOrder: r.max_per_order ?? null,
    minSubtotalCents: r.min_subtotal_cents ?? null,
  }
}

/**
 * The store's offers, in its order. `live`: only those on now (switched on,
 * started, not ended), for a buyer. A database without part 116 has none; a
 * failed read has none too, so a checkout never stops on it. `settings`
 * says whether part 230's columns are there.
 */
export async function loadOffers(db: Db, creatorId: string, opts: { activeOnly?: boolean } = {}): Promise<{ offers: Offer[]; ready: boolean; settings: boolean }> {
  try {
    const { data, error, dropped } = await selectTolerant("offers", COLUMNS, PART_230_COLUMNS, (columns) => {
      let q = db.from("store_offers").select(columns).eq("creator_id", creatorId)
      if (opts.activeOnly) q = q.eq("active", true)
      return q.order("position", { ascending: true }).order("created_at", { ascending: true }).limit(MAX_OFFERS)
    })
    if (error) {
      if (!MISSING.has(error.code ?? "")) console.error(`[offers] read failed: ${loggable(error)}`)
      return { offers: [], ready: !MISSING.has(error.code ?? ""), settings: false }
    }
    return { offers: ((data ?? []) as Row[]).filter((r) => OFFER_KINDS.includes(r?.kind)).map(offerOf), ready: true, settings: dropped.length === 0 }
  } catch (e) {
    console.error(`[offers] read failed: ${loggable(e)}`)
    return { offers: [], ready: true, settings: false }
  }
}

/* ─────────────────── trigger collections, for the products in a cart ─────────────────── */

const RULE_PRODUCT_COLUMNS = "id, title, type, tags, vendor, price_cents, compare_at_price_cents:compare_at_cents, weight_grams, created_at, category"

/**
 * Which of `collectionIds` (the store's) each of `productIds` is in: a hand
 * picked collection by its items, a smart one by its rules applied to the
 * product, as the storefront and a code's collections apply them.
 */
export async function collectionsOf(db: Db, creatorId: string, collectionIds: string[], productIds: string[]): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>()
  if (collectionIds.length === 0 || productIds.length === 0) return out
  try {
    const { data: cols } = await db.from("product_collections").select("id, kind, rules, match").eq("creator_id", creatorId).in("id", collectionIds)
    const rows = (cols ?? []) as { id: string; kind: string; rules: unknown; match: "all" | "any" }[]
    if (rows.length === 0) return out
    const add = (productId: string, collectionId: string) => out.set(productId, [...(out.get(productId) ?? []), collectionId])
    const manual = rows.filter((r) => r.kind !== "smart").map((r) => r.id)
    if (manual.length) {
      const { data: items } = await db.from("product_collection_items").select("collection_id, product_id").in("collection_id", manual).in("product_id", productIds)
      for (const i of (items ?? []) as { collection_id: string; product_id: string }[]) add(i.product_id, i.collection_id)
    }
    const smart = rows.filter((r) => r.kind === "smart")
    if (smart.length) {
      const { data: ps } = await selectTolerant("offer collections", RULE_PRODUCT_COLUMNS, ["tags", "vendor", "compare_at_price_cents:compare_at_cents", "weight_grams", "category"], (columns) =>
        db.from("products").select(columns).eq("creator_id", creatorId).in("id", productIds),
      )
      for (const p of (ps ?? []) as Record<string, any>[]) { // eslint-disable-line @typescript-eslint/no-explicit-any
        const rp: RuleProduct = { id: p.id, title: p.title ?? "", type: p.type ?? "", tags: p.tags ?? [], vendor: p.vendor ?? null, priceCents: p.price_cents ?? 0, compareAtCents: p.compare_at_price_cents ?? null, inventory: null, weightGrams: p.weight_grams ?? null, createdAt: p.created_at, category: p.category ?? null }
        for (const c of smart) if (inSmartCollection(readRules(c.rules), c.match === "any" ? "any" : "all", rp)) add(p.id, c.id)
      }
    }
  } catch (e) {
    console.error(`[offers] collections read failed: ${loggable(e)}`)
  }
  return out
}

/**
 * A cart's lines ready for applyOffers: each with the trigger collections
 * its product is in, read only when one of the store's offers names some.
 */
export async function offerLinesFor(db: Db, creatorId: string, offers: Offer[], lines: OfferLine[]): Promise<OfferLine[]> {
  const wanted = [...new Set(offers.flatMap((o) => o.triggerCollectionIds ?? []))]
  if (wanted.length === 0) return lines
  const of = await collectionsOf(db, creatorId, wanted, [...new Set(lines.map((l) => l.productId))])
  return lines.map((l) => ({ ...l, collectionIds: of.get(l.productId) ?? [] }))
}
