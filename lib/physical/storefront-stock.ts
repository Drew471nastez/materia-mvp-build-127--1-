/**
 * What a buyer may be told about a physical product's stock, per variant:
 * whether it can be bought, how many are left when that is few, and the
 * most one order may take. One place, read by the buy box's own route
 * (app/api/physical/storefront/product) and by the product section on a
 * creator's website (lib/products/product-section-data.ts), so the two never
 * disagree about whether the last one sold.
 *
 * Exact stock levels, locations and costs never leave this file.
 */

/** "Only N left" is said from this many down; above it a buyer just sees In stock. */
export const SAY_LEFT_FROM = 10

import { cappedQuantity, orderLimits } from "./order-limit"
import { oncePerClient } from "@/lib/supabase/per-client"
import { sellsWhenOut } from "./inventory-rules"

type Db = { from: (table: string) => any } // eslint-disable-line @typescript-eslint/no-explicit-any

export interface StockProduct {
  /** With the id, the product's Limit sales is read too and the most one order may take stops at it (./order-limit.ts). */
  id?: string
  creator_id: string
  track_inventory?: boolean | null
  continue_selling?: boolean | null
  /** The product's own low stock line; null: the shop's (Settings › Locations › Low stock). */
  low_stock_threshold?: number | null
}

export interface StockVariant {
  id: string
  name: string
  active?: boolean | null
  track_inventory?: boolean | null
  inventory_policy?: string | null
  /** The variant's own low stock line (part 214), when the caller read it. */
  low_stock_threshold?: number | null
}

/** Each variant's own line: what the caller read, else one small read that a database without part 214 answers with nothing. Never throws. */
async function ownLines(db: Db, live: StockVariant[]): Promise<Map<string, number>> {
  const out = new Map<string, number>()
  for (const v of live) if (typeof v.low_stock_threshold === "number") out.set(v.id, v.low_stock_threshold)
  const unknown = live.filter((v) => v.low_stock_threshold === undefined).map((v) => v.id)
  if (unknown.length === 0) return out
  try {
    const { data, error } = await db.from("product_variants").select("id, low_stock_threshold").in("id", unknown)
    if (!error) for (const r of (data ?? []) as { id: string; low_stock_threshold: number | null }[]) if (typeof r.low_stock_threshold === "number") out.set(r.id, r.low_stock_threshold)
  } catch {
    /* The product's line. */
  }
  return out
}

export interface VariantStock {
  soldOut: boolean
  /** How many are left when it is few, else null. */
  left: number | null
  maxQuantity: number
  /** The low stock line: at or under it, "Only N left" shows. The product's own, else the shop's. */
  lowAt: number
  /**
   * How many there are, when stock is counted; null when it is not. Only for
   * an imported theme's product page while Website settings › Commerce ›
   * Show stock left is on (lib/storelib-theme/compat/product-facts.ts): a
   * Shopify theme's inventory block says In stock, Low stock and its own
   * count from it. Never in the buy box's answer.
   */
  count?: number | null
}

/** The line "Only N left" is said from: the product's own, else the shop's, else 5. Never under 1. */
export function lowStockLine(productThreshold: number | null | undefined, shopDefault: number | null | undefined): number {
  const own = typeof productThreshold === "number" && Number.isFinite(productThreshold) ? productThreshold : null
  const shop = typeof shopDefault === "number" && Number.isFinite(shopDefault) ? shopDefault : 5
  return Math.max(1, Math.floor(own ?? shop))
}

/** What a buyer is told about one variant, from what is available across the locations that ship. Pure. */
export function variantStock(available: number, o: { tracked: boolean; keepSelling: boolean; lowAt: number }): VariantStock {
  const left = o.tracked ? Math.max(0, available) : null
  const counted = o.tracked && !o.keepSelling
  /* Said when few: up to the low stock line, or ten when the line is lower, so a block set to show from 8 still has the number. */
  const sayFrom = Math.max(SAY_LEFT_FROM, o.lowAt)
  return {
    soldOut: counted && (left ?? 0) <= 0,
    left: counted && left !== null && left > 0 && left <= sayFrom ? left : null,
    maxQuantity: counted ? Math.max(0, Math.min(999, left ?? 0)) : 999,
    lowAt: o.lowAt,
    count: left,
  }
}

/** A variant that is on sale: active, and not one the editor archived. */
export function liveVariant(v: StockVariant): boolean {
  return v.active !== false && !/^Archived /.test(v.name)
}

/**
 * The shop's commerce settings a storefront reads (Settings › Shipping and
 * delivery, Returns, the low stock line), once per request and shop
 * (lib/supabase/per-client.ts): one product page asked them three times, a
 * quote once per product. Every column is part 78's.
 */
export function commerceRow(db: Db, creatorId: string): Promise<{ data: { returns_enabled?: boolean | null; return_window_days?: number | null; default_location_id?: string | null; low_stock_default?: number | null } | null; error?: unknown }> {
  return oncePerClient(db, `commerce-settings:${creatorId}`, async () => (await db.from("commerce_settings").select("returns_enabled, return_window_days, default_location_id, low_stock_default").eq("creator_id", creatorId).maybeSingle()) as never)
}

/** Stock for each live variant, by id. Never throws: stock that cannot be read sells as untracked would. */
export async function physicalStock(db: Db, product: StockProduct, variants: StockVariant[]): Promise<Map<string, VariantStock>> {
  const live = variants.filter(liveVariant)
  const available = new Map<string, number>()
  let shopLine: number | null = null
  try {
    const { data: settings } = await commerceRow(db, product.creator_id)
    if (settings && typeof settings.low_stock_default === "number") shopLine = settings.low_stock_default
  } catch {
    /* The default line, 5. */
  }
  try {
    /* Which locations fulfil orders: once per request (lib/supabase/per-client.ts). What each holds is read below on every call. */
    const { data: locations } = await oncePerClient(db, `fulfilling-locations:${product.creator_id}`, async () => (await db.from("inventory_locations").select("id").eq("creator_id", product.creator_id).eq("active", true).eq("fulfills_orders", true)) as { data: { id: string }[] | null })
    const locIds = ((locations ?? []) as { id: string }[]).map((l) => l.id)
    if (live.length && locIds.length) {
      const { data: levels } = await db.from("inventory_levels").select("variant_id, available").in("variant_id", live.map((v) => v.id)).in("location_id", locIds)
      for (const l of (levels ?? []) as { variant_id: string; available: number }[]) available.set(l.variant_id, (available.get(l.variant_id) ?? 0) + Math.max(0, l.available))
    }
  } catch {
    /* Read as nothing in stock below, which is what an empty warehouse says. */
  }
  /* A variant's own low stock line (part 214) where it has one, else the product's, else the shop's. */
  const own = await ownLines(db, live)
  const limit = product.id ? ((await orderLimits(db, [product.id])).get(product.id) ?? null) : null
  const out = new Map<string, VariantStock>()
  for (const v of live) {
    const tracked = v.track_inventory ?? product.track_inventory ?? true
    const keepSelling = sellsWhenOut(v.inventory_policy, product.continue_selling)
    const lowAt = lowStockLine(own.get(v.id) ?? product.low_stock_threshold, shopLine)
    const s = variantStock(available.get(v.id) ?? 0, { tracked, keepSelling, lowAt })
    out.set(v.id, { ...s, maxQuantity: cappedQuantity(s.maxQuantity, limit) })
  }
  return out
}
