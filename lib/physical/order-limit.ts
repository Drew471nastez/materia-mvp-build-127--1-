/**
 * ===========================================================================
 *  LIMIT SALES, FOR A THING THAT SHIPS: THE MOST ONE ORDER MAY TAKE
 * ===========================================================================
 * A physical product's "Limit sales" in the product editor. Stock already
 * stops sales at zero, so a total cap would say the same thing twice; what a
 * seller of a limited drop wants is "up to 2 per order". It is kept on the
 * product (`products.max_per_order`, SQL part 131) and read in three places,
 * each through this file:
 *
 *   the editor     saves it with the product's physical details
 *                  (lib/physical/catalog-server.ts)
 *   the shop       the quantity picker stops at it (lib/physical/storefront-stock.ts)
 *   the checkout   a cart over it is refused with the reason
 *                  (lib/physical/checkout-pricing-server.ts)
 *
 * Every read is its own request and forgives a database that has not run
 * part 131 yet: no limit, as before.
 */

type Db = { from: (table: string) => any } // eslint-disable-line @typescript-eslint/no-explicit-any

/** The highest limit a seller can type; the checkout's own line maximum is 999. */
export const MAX_ORDER_LIMIT = 999

/** A stored or typed limit as a whole number from 1 to 999, or null for none. */
export function readOrderLimit(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null
  const n = typeof value === "number" ? value : Number.parseInt(String(value), 10)
  if (!Number.isFinite(n)) return null
  const whole = Math.floor(n)
  return whole >= 1 ? Math.min(MAX_ORDER_LIMIT, whole) : null
}

/** The most a buyer may pick of one variant: what stock allows, held to the limit. */
export function cappedQuantity(stockMax: number, limit: number | null): number {
  return limit === null ? stockMax : Math.max(0, Math.min(stockMax, limit))
}

/** The column is missing: part 131 has not run. */
export function missingColumn(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false
  return error.code === "42703" || error.code === "PGRST204" || /max_per_order/.test(error.message ?? "")
}

/** Each product's limit, by id. Products with none, or a database without the column, are absent. */
export async function orderLimits(db: Db, productIds: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>()
  if (!productIds.length) return out
  try {
    const { data, error } = await db.from("products").select("id, max_per_order").in("id", productIds)
    if (error) return out
    for (const r of (data ?? []) as { id: string; max_per_order: unknown }[]) {
      const limit = readOrderLimit(r.max_per_order)
      if (limit !== null) out.set(r.id, limit)
    }
  } catch {
    /* No limit: the checkout sells as it did before part 131. */
  }
  return out
}

/** A cart line over its product's limit, in the words the checkout shows. Quantities of one product's variants count together. */
export function overLimit(lines: { productId: string; title: string; quantity: number }[], limits: Map<string, number>): string | null {
  const total = new Map<string, number>()
  for (const l of lines) total.set(l.productId, (total.get(l.productId) ?? 0) + l.quantity)
  for (const [productId, qty] of total) {
    const limit = limits.get(productId)
    if (limit !== undefined && qty > limit) {
      const title = lines.find((l) => l.productId === productId)?.title ?? "This product"
      return `${title}: up to ${limit} per order. Lower the quantity to continue.`
    }
  }
  return null
}
