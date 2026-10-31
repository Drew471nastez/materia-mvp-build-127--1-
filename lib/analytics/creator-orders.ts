import "server-only"

import type { createAdminClient } from "@/lib/supabase/admin"
import type { OrderRow } from "@/lib/orders/order-view"
import { homeTotals } from "./home-figures"
import { KEYSET_PAGE, keysetFrom, readByKeyset } from "./keyset"
import { readStoreCurrency } from "@/lib/store/selling-currency-read"
import { hasOrdersInOtherCurrency, inStoreCurrency } from "@/lib/money/report-currency-server"
import { withoutTestSales } from "./test-sales"

/* What a sale and its money are counted from (lib/orders/order-view, reports.ts moneyOf). */
const SALE_COLUMNS = "id, product_id, amount_cents, status, created_at, stripe_session_id, refund_amount_cents, currency, source_detail"

/**
 * THE CREATOR'S ORDERS, BY THE CREATOR, NEVER BY A LIST OF PRODUCT IDS.
 * They were read with `.in("product_id", <every current product>)`: a
 * product the creator had deleted took its sales out of every figure, and a
 * large catalog made the request's address longer than a server takes.
 * Now each order carries its creator (orders.creator_id, supabase/sql/
 * run-now part 32) and is read by it, so a deleted product's orders, which
 * keep no product, are still counted, under "Removed product". Until that
 * part has run the column is missing, and the orders are read through
 * their product (`products!inner`) as Home and Customers read them: the
 * same rows the database still has, since until then deleting a product
 * deleted its orders too.
 */
let creatorColumnMissingUntil = 0

type Admin = ReturnType<typeof createAdminClient>

export type OrderScope = "creator" | "product"
/** The creator's orders as a query to add a period, an order and a page to. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function scopedOrders(admin: Admin, columns: string, scope: OrderScope, creatorId: string, product: string | null): any {
  const select = scope === "creator" ? columns : `${columns}, products!inner(creator_id)`
  let q = admin.from("orders").select(select)
  q = scope === "creator" ? q.eq("creator_id", creatorId) : q.eq("products.creator_id", creatorId)
  return product ? q.eq("product_id", product) : q
}

/** Read by the order's own creator when the database has it, else through the product. */
export async function byCreator<T>(read: (scope: OrderScope) => Promise<T>): Promise<T> {
  if (Date.now() >= creatorColumnMissingUntil) {
    try {
      return await read("creator")
    } catch (error) {
      if (!/creator_id/.test((error as Error).message) || !/column|does not exist|PGRST|schema cache/i.test((error as Error).message)) throw error
      creatorColumnMissingUntil = Date.now() + 5 * 60_000
    }
  }
  return read("product")
}

/** The embedded product was only the filter. */
export const ownRows = <T,>(rows: T[]): T[] => rows.map((row) => {
  if (!row || typeof row !== "object" || !("products" in row)) return row
  const { products: _owner, ...order } = row as T & { products?: unknown }
  return order as T
})


/**
 * EVERY SALE THE CREATOR HAS MADE, AND WHAT THEY MADE, counted by the rule
 * every figure uses (one payment is one sale; failed, pending and disputed
 * payments are not; money less refunds). Home's "Make your first sale" and
 * its sales challenges read this. They used to count the rows of one read
 * of the orders, and a read stops at 1,000 rows, so a store past its
 * thousandth order was stuck at a thousand rows' worth.
 *
 * Counted by the database when it can (analytics_all_time, the line under
 * Analytics' figures, run-now parts 25 and 32), else from every order read a
 * page at a time.
 */
export async function creatorSalesTotals(admin: Admin, creatorId: string, opts: { noFetch?: boolean } = {}): Promise<{ sales: number; revenueCents: number }> {
  /*
    IN THE STORE'S CURRENCY. The database's count adds every order's cents as
    they are, which is only a total while every order is in the store's
    currency. With any order in another one (a market's, a dollar plan's, a
    store that changed currency), the orders are read and each is converted
    at its own day's ECB rate first (lib/money/report-currency).
  */
  const storeCurrency = (await readStoreCurrency(admin, creatorId)).currency
  const mixed = await byCreator((scope) => hasOrdersInOtherCurrency((columns) => scopedOrders(admin, columns, scope, creatorId, null), storeCurrency))
  if (!mixed) try {
    const { data, error } = await admin.rpc("analytics_all_time", { p_creator_id: creatorId, p_product_id: null })
    if (!error && data) {
      const d = data as { orders?: number; sales_cents?: number }
      return { sales: Math.max(0, Number(d.orders) || 0), revenueCents: Math.max(0, Number(d.sales_cents) || 0) }
    }
  } catch {
    /* counted from the rows below */
  }
  try {
    const rows = await byCreator(async (scope) => {
      const read = await readByKeyset<OrderRow>((after) =>
        keysetFrom(scopedOrders(admin, SALE_COLUMNS, scope, creatorId, null), "1970-01-01T00:00:00.000Z", after)
          .order("created_at", { ascending: true })
          .order("id", { ascending: true })
          .limit(KEYSET_PAGE),
      )
      /* An admin's test sale is not a sale (lib/analytics/test-sales). */
      return withoutTestSales(ownRows(read.rows))
    })
    const { totalOrders, totalRevenue } = homeTotals((await inStoreCurrency(admin, creatorId, rows, storeCurrency, { noFetch: opts.noFetch })).rows)
    return { sales: totalOrders, revenueCents: Math.max(0, totalRevenue) }
  } catch (error) {
    console.error("[creator-orders] sales not counted:", (error as Error).message)
    return { sales: 0, revenueCents: 0 }
  }
}

/**
 * WHAT HOME'S BANNER TELLS FROM THE ORDERS (lib/home/announcements
 * salesSummaryFrom): every order of the last 30 days, a page at a time, and
 * the first few the creator ever had, for the first sale. Never every order:
 * the totals come from creatorSalesTotals.
 */
export async function creatorSalesRows(admin: Admin, creatorId: string, now: number, opts: { noFetch?: boolean } = {}): Promise<{ recent: OrderRow[]; earliest: OrderRow[] }> {
  const since = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString()
  try {
    return await byCreator(async (scope) => {
      const [recent, earliest] = await Promise.all([
        readByKeyset<OrderRow>((after) =>
          keysetFrom(scopedOrders(admin, SALE_COLUMNS, scope, creatorId, null), since, after)
            .order("created_at", { ascending: true })
            .order("id", { ascending: true })
            .limit(KEYSET_PAGE),
        ),
        /* A basket is several rows, and a failed payment is no sale: enough rows to find the first one that is. */
        scopedOrders(admin, SALE_COLUMNS, scope, creatorId, null)
          .order("created_at", { ascending: true })
          .order("id", { ascending: true })
          .limit(50)
          .then(({ data, error }: { data: OrderRow[] | null; error: { message: string } | null }) => {
            if (error) throw new Error(error.message)
            return data ?? []
          }),
      ])
      /* In the store's currency, each at its own day's rate (lib/money/report-currency), as every figure is. */
      const storeCurrency = (await readStoreCurrency(admin, creatorId)).currency
      const [r, e] = await Promise.all([inStoreCurrency(admin, creatorId, ownRows(recent.rows), storeCurrency, { noFetch: opts.noFetch }), inStoreCurrency(admin, creatorId, ownRows(earliest as OrderRow[]), storeCurrency, { noFetch: opts.noFetch })])
      return { recent: r.rows, earliest: e.rows }
    })
  } catch (error) {
    console.error("[creator-orders] banner sales not read:", (error as Error).message)
    return { recent: [], earliest: [] }
  }
}
