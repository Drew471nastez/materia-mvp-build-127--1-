/**
 * ===========================================================================
 *  A LIMITED RUN'S STANDING, AS THE DATABASE COUNTS IT
 * ===========================================================================
 * The reads behind "Sold out", "Only 3 left" and the editor's "12 of 100
 * sold" (lib/products/sales-limit.ts says the words). The functions are
 * server only (SQL part 150, granted to service_role): asked with any other
 * client, or before the part has run, they answer nothing and every surface
 * shows what it showed before. Kept apart from lib/checkout/sales-limit.ts,
 * which holds copies and is server only, because the shop's card code that
 * calls these is also imported by client components.
 */
import { readSalesLimit, type SalesStanding } from "./sales-limit"

type Db = { rpc?: (fn: string, args: Record<string, unknown>) => any } // eslint-disable-line @typescript-eslint/no-explicit-any

/**
 * Each limited product's standing: its limit, copies sold, copies held.
 * Products with no limit are absent, and so is everything on a database
 * before part 150 or one that cannot be asked: the page sells as before.
 */
export async function salesStandings(db: Db | { from: unknown }, productIds: string[]): Promise<Map<string, SalesStanding>> {
  const out = new Map<string, SalesStanding>()
  const ids = [...new Set(productIds)].filter((id) => typeof id === "string" && /^[0-9a-f-]{36}$/i.test(id)).slice(0, 500)
  const rpc = (db as Db).rpc
  if (!ids.length || typeof rpc !== "function") return out
  try {
    const { data, error } = await rpc.call(db, "product_sales_status", { p_products: ids })
    if (error) return out
    for (const r of (data ?? []) as { product_id: string; sales_limit: unknown; sold: unknown; held: unknown }[]) {
      const limit = readSalesLimit(r.sales_limit)
      if (limit === null) continue
      out.set(r.product_id, { limit, sold: Math.max(0, Number(r.sold) || 0), held: Math.max(0, Number(r.held) || 0) })
    }
  } catch {
    /* no standings: nothing is shown as limited */
  }
  return out
}

/** One product's standing, or null. */
export async function salesStanding(db: Db | { from: unknown }, productId: string): Promise<SalesStanding | null> {
  return (await salesStandings(db, [productId])).get(productId) ?? null
}

/** Copies of a product sold, limit or not (product_copies_sold): what the editor shows beside the limit. Null when the database cannot say (before part 150). */
export async function copiesSold(db: Db, productId: string): Promise<number | null> {
  if (!db.rpc || !productId) return null
  try {
    const { data, error } = await db.rpc("product_copies_sold", { p_product: productId })
    if (error || data === null || data === undefined) return null
    const n = Number(data)
    return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : null
  } catch {
    return null
  }
}
