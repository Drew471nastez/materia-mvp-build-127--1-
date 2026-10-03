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

type Db = { from: (table: string) => any } // eslint-disable-line @typescript-eslint/no-explicit-any

export interface StockProduct {
  creator_id: string
  track_inventory?: boolean | null
  continue_selling?: boolean | null
}

export interface StockVariant {
  id: string
  name: string
  active?: boolean | null
  track_inventory?: boolean | null
  inventory_policy?: string | null
}

export interface VariantStock {
  soldOut: boolean
  /** How many are left when it is few, else null. */
  left: number | null
  maxQuantity: number
}

/** A variant that is on sale: active, and not one the editor archived. */
export function liveVariant(v: StockVariant): boolean {
  return v.active !== false && !/^Archived /.test(v.name)
}

/** Stock for each live variant, by id. Never throws: stock that cannot be read sells as untracked would. */
export async function physicalStock(db: Db, product: StockProduct, variants: StockVariant[]): Promise<Map<string, VariantStock>> {
  const live = variants.filter(liveVariant)
  const available = new Map<string, number>()
  try {
    const { data: locations } = await db.from("inventory_locations").select("id").eq("creator_id", product.creator_id).eq("active", true).eq("fulfills_orders", true)
    const locIds = ((locations ?? []) as { id: string }[]).map((l) => l.id)
    if (live.length && locIds.length) {
      const { data: levels } = await db.from("inventory_levels").select("variant_id, available").in("variant_id", live.map((v) => v.id)).in("location_id", locIds)
      for (const l of (levels ?? []) as { variant_id: string; available: number }[]) available.set(l.variant_id, (available.get(l.variant_id) ?? 0) + Math.max(0, l.available))
    }
  } catch {
    /* Read as nothing in stock below, which is what an empty warehouse says. */
  }
  const out = new Map<string, VariantStock>()
  for (const v of live) {
    const tracked = v.track_inventory ?? product.track_inventory ?? true
    const keepSelling = v.inventory_policy === "continue" || product.continue_selling === true
    const left = tracked ? (available.get(v.id) ?? 0) : null
    const soldOut = tracked && !keepSelling && (left ?? 0) <= 0
    out.set(v.id, {
      soldOut,
      left: tracked && !keepSelling && left !== null && left > 0 && left <= SAY_LEFT_FROM ? left : null,
      maxQuantity: tracked && !keepSelling ? Math.max(0, Math.min(999, left ?? 0)) : 999,
    })
  }
  return out
}
