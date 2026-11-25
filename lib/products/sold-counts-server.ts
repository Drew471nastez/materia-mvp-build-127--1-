import "server-only"

/**
 * ===========================================================================
 *  HOW MANY OF A PRODUCT HAVE SOLD, VERIFIED FROM PAID ORDERS
 * ===========================================================================
 * What a theme's sold counter reads as `product.metafields.custom.sold_count`
 * (lib/storelib-theme/compat/objects.ts productMetafields; Materia's Sold
 * counter in product mode). Counted from the store's own order lines, never
 * typed in and never estimated:
 *
 *   COUNTED      the units of a line that was paid (orders.status completed),
 *                and of one partly refunded (partially_refunded): the money
 *                given back does not say which units, so its units stay,
 *                less those on a completed return (commerce_return_items of a
 *                commerce_returns row with status completed).
 *   NOT COUNTED  a line refunded in full or voided (a cancelled order ends
 *                in one of the two), one not paid yet (pending, cash on
 *                delivery not collected, failed), and one disputed while
 *                the payment is in question.
 *   ZERO         a product of this store with no paid unit is 0, said as 0.
 *   UNKNOWN      null when anything could not be read whole (an error, or
 *                more lines than are read in one go): the field is then left
 *                out and a theme hides its counter, rather than show a number
 *                that is short.
 *
 * Read with the server's own client: orders are private, and a read through
 * a visitor's client would come back empty under row level security, which
 * would print as a confident 0.
 */

export const SOLD_STATUSES = ["completed", "partially_refunded"] as const
/** Read in pages of this; past MAX_LINES the count is not given rather than given short. */
const PAGE = 1000
const MAX_LINES = 50_000

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = { from: (table: string) => any }

type Line = { id: string; product_id: string | null; quantity: number | null; created_at?: string | null }

/**
 * Units sold of each of these products (all of them one store's), or null
 * when the count could not be read whole. Every product asked for is in the
 * answer, 0 when none of it has sold.
 */
export async function soldCounts(db: Db, productIds: string[]): Promise<Map<string, number> | null> {
  const read = await countSold(db, productIds, Date.now())
  return read ? new Map([...read].map(([id, c]) => [id, c.all])) : null
}

/**
 * RECENT SALES (round 26): the same count, and the units of it sold in the
 * last 24 hours, 7 days and 30 days, by when the order was placed
 * (orders.created_at). What a theme's Sold counter says as "5 sold in the
 * last 24 hours" (custom.sold_count_24h, _7d, _30d). Returned units are
 * taken from the window their line was sold in. Null when not read whole.
 */
export type SoldWindows = { all: number; h24: number; d7: number; d30: number }
export const SOLD_WINDOWS_MS = { h24: 24 * 3600_000, d7: 7 * 24 * 3600_000, d30: 30 * 24 * 3600_000 } as const

export async function soldCountsWithWindows(db: Db, productIds: string[], now = Date.now()): Promise<Map<string, SoldWindows> | null> {
  return countSold(db, productIds, now)
}

/** The windows a line placed at `at` is in, none when its time is unknown or in the future. */
function windowsOf(at: unknown, now: number): (keyof typeof SOLD_WINDOWS_MS)[] {
  const t = typeof at === "string" || typeof at === "number" ? new Date(at).getTime() : NaN
  if (!Number.isFinite(t) || t > now + 60_000) return []
  const age = now - t
  return (Object.keys(SOLD_WINDOWS_MS) as (keyof typeof SOLD_WINDOWS_MS)[]).filter((k) => age <= SOLD_WINDOWS_MS[k])
}

async function countSold(db: Db, productIds: string[], now: number): Promise<Map<string, SoldWindows> | null> {
  const ids = [...new Set(productIds.filter((x) => typeof x === "string" && x))]
  const counts = new Map<string, SoldWindows>(ids.map((id) => [id, { all: 0, h24: 0, d7: 0, d30: 0 }]))
  if (ids.length === 0) return counts
  const lineProduct = new Map<string, string>()
  const lineWindows = new Map<string, (keyof typeof SOLD_WINDOWS_MS)[]>()
  let read = 0
  for (let i = 0; i < ids.length; i += 80) {
    const batch = ids.slice(i, i + 80)
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await db.from("orders").select("id, product_id, quantity, created_at").in("product_id", batch).in("status", SOLD_STATUSES as unknown as string[]).order("id").range(from, from + PAGE - 1)
      if (error) return null
      const rows = (data ?? []) as Line[]
      for (const r of rows) {
        if (!r.product_id || !counts.has(r.product_id)) continue
        /* A line with no quantity is one unit (a download, an older order). */
        const units = Math.max(1, Math.floor(Number(r.quantity) || 1))
        const c = counts.get(r.product_id)!
        c.all += units
        const windows = windowsOf(r.created_at, now)
        for (const w of windows) c[w] += units
        lineProduct.set(r.id, r.product_id)
        if (windows.length) lineWindows.set(r.id, windows)
      }
      read += rows.length
      if (read > MAX_LINES) return null
      if (rows.length < PAGE) break
    }
  }
  /* Units on a completed return are not sold. A store without returns (the table not there yet) has none to take away. */
  const lineIds = [...lineProduct.keys()]
  for (let i = 0; i < lineIds.length; i += 200) {
    const { data, error } = await db
      .from("commerce_return_items")
      .select("order_id, quantity, commerce_returns!inner(status)")
      .in("order_id", lineIds.slice(i, i + 200))
      .eq("commerce_returns.status", "completed")
    if (error) {
      const code = String((error as { code?: string }).code ?? "")
      if (code === "42P01" || code === "PGRST205") break
      return null
    }
    for (const r of (data ?? []) as { order_id: string; quantity: number | null }[]) {
      const product = lineProduct.get(r.order_id)
      if (!product) continue
      const c = counts.get(product)!
      const back = Math.max(0, Math.floor(Number(r.quantity) || 0))
      c.all = Math.max(0, c.all - back)
      for (const w of lineWindows.get(r.order_id) ?? []) c[w] = Math.max(0, c[w] - back)
    }
  }
  return counts
}
