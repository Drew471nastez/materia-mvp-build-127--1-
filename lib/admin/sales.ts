import "server-only"

import type { Reader } from "./platform-metrics"
import { dayKey, dayRange } from "./platform-metrics"

/**
 * ===========================================================================
 *  MONEY, ADDED UP ONCE, AND BY THE RIGHT JOIN
 * ===========================================================================
 * `orders` has no creator column. An order belongs to a product
 * (orders.product_id, a foreign key), and a product belongs to a creator
 * (products.creator_id). The admin asked orders for `creator_id` and the
 * database answered "column orders.creator_id does not exist", so every
 * per-creator figure on the old dashboard was missing. Every figure here
 * that is "per creator" goes through products, the same way the creator's
 * own Orders page does (lib/orders/load-rows.ts).
 *
 * The totals are added up inside the database by three functions from
 * supabase/sql/RUN_ADMIN_CONSOLE.sql. Before that file is run they do not
 * exist, and the same numbers are added up here from the order rows instead,
 * a thousand at a time up to a ceiling. If the ceiling is reached the notice
 * says so: a total that stopped counting is not presented as the total.
 */

export type StatusTotal = { status: string; orders: number; gross: number; fees: number }
export type CreatorSales = { creatorId: string; orders: number; gross: number; fees: number }

const ROW_CEILING = 50_000

type RpcTotal = { order_status: string; orders: number | string; gross_cents: number | string; fee_cents: number | string }
type RpcCreator = { creator_id: string; orders: number | string; gross_cents: number | string; fee_cents: number | string }
type RpcDay = { day: string; orders: number | string; gross_cents: number | string; fee_cents: number | string }

const n = (v: unknown) => (typeof v === "number" ? v : Number(v) || 0)

/** Every order row matching a shape, a page at a time, up to the ceiling. */
async function allRows<T>(r: Reader, metric: string, select: string, shape: (q: any) => any): Promise<{ rows: T[]; partial: boolean } | null> { // eslint-disable-line @typescript-eslint/no-explicit-any
  const rows: T[] = []
  for (let from = 0; from < ROW_CEILING; from += 1000) {
    const batch = await r.rows<T>(metric, "orders", select, (q) => shape(q).order("created_at", { ascending: false }).range(from, from + 999))
    if (!batch) return null
    rows.push(...batch)
    if (batch.length < 1000) return { rows, partial: false }
  }
  return { rows, partial: true }
}

/** Orders, money and fees by status, since a moment or for all time. */
export async function orderTotals(r: Reader, metric: string, since: string | null): Promise<{ totals: StatusTotal[]; from: "rpc" | "rows" } | null> {
  const rpc = await r.rpc<RpcTotal[]>(metric, "admin_order_totals", { p_since: since })
  if (rpc.data) {
    return {
      from: "rpc",
      totals: rpc.data.map((t) => ({ status: t.order_status, orders: n(t.orders), gross: n(t.gross_cents), fees: n(t.fee_cents) })),
    }
  }
  if (!rpc.missing) return null

  const read = await allRows<{ status: string | null; amount_cents: number | null; fee_cents: number | null }>(
    r, metric, "status, amount_cents, fee_cents", (q) => (since ? q.gte("created_at", since) : q),
  )
  if (!read) return null
  if (read.partial) r.notice(`Totals stop at the newest ${ROW_CEILING.toLocaleString("en-US")} orders until supabase/sql/RUN_ADMIN_CONSOLE.sql is run.`)
  const by = new Map<string, StatusTotal>()
  for (const o of read.rows) {
    const status = o.status || "unknown"
    const t = by.get(status) ?? { status, orders: 0, gross: 0, fees: 0 }
    t.orders += 1
    t.gross += o.amount_cents ?? 0
    t.fees += o.fee_cents ?? 0
    by.set(status, t)
  }
  return { from: "rows", totals: [...by.values()] }
}

export function pick(totals: StatusTotal[] | null | undefined, status: string): StatusTotal {
  return totals?.find((t) => t.status === status) ?? { status, orders: 0, gross: 0, fees: 0 }
}

/**
 * Completed sales per creator. With `ids`, for exactly those creators; with
 * none, the top `limit` by money.
 */
export async function creatorSales(
  r: Reader,
  metric: string,
  options: { ids?: string[]; since?: string | null; limit?: number },
): Promise<CreatorSales[] | null> {
  const ids = options.ids && options.ids.length ? options.ids : null
  if (options.ids && options.ids.length === 0) return []
  const rpc = await r.rpc<RpcCreator[]>(metric, "admin_creator_sales", {
    p_creator_ids: ids,
    p_since: options.since ?? null,
    p_limit: options.limit ?? 10,
  })
  if (rpc.data) {
    return rpc.data.map((c) => ({ creatorId: c.creator_id, orders: n(c.orders), gross: n(c.gross_cents), fees: n(c.fee_cents) }))
  }
  if (!rpc.missing) return null

  /*
    Without the function: the products first, then their completed orders,
    joined here. For a page of creators that is two small reads. For "the
    top creators" it is every completed order in the window, which is why
    the function exists.
  */
  let productOwner: Map<string, string> | null = null
  if (ids) {
    const products = await r.rows<{ id: string; creator_id: string }>(metric, "products", "id, creator_id", (q) => q.in("creator_id", ids).limit(5000))
    if (!products) return null
    productOwner = new Map(products.map((p) => [p.id, p.creator_id]))
    if (productOwner.size === 0) return []
  }

  /* Ids go in the address, so they go in batches a URL can carry. */
  const productIds = productOwner ? [...productOwner.keys()] : null
  const batches = productIds ? Array.from({ length: Math.ceil(productIds.length / 150) }, (_, i) => productIds.slice(i * 150, i * 150 + 150)) : [null]
  type Sold = { amount_cents: number | null; fee_cents: number | null; product_id: string | null; product?: { creator_id: string | null } | null }
  const rows: Sold[] = []
  for (const batch of batches) {
    const read = await allRows<Sold>(
      r,
      metric,
      productOwner ? "amount_cents, fee_cents, product_id" : "amount_cents, fee_cents, product_id, product:products(creator_id)",
      (q) => {
        let b = q.eq("status", "completed")
        if (options.since) b = b.gte("created_at", options.since)
        if (batch) b = b.in("product_id", batch)
        return b
      },
    )
    if (!read) return null
    if (read.partial) r.notice(`Sales per creator stop at the newest ${ROW_CEILING.toLocaleString("en-US")} orders until supabase/sql/RUN_ADMIN_CONSOLE.sql is run.`)
    rows.push(...read.rows)
  }

  const by = new Map<string, CreatorSales>()
  for (const o of rows) {
    const owner = productOwner ? productOwner.get(o.product_id ?? "") : o.product?.creator_id
    if (!owner) continue
    const c = by.get(owner) ?? { creatorId: owner, orders: 0, gross: 0, fees: 0 }
    c.orders += 1
    c.gross += o.amount_cents ?? 0
    c.fees += o.fee_cents ?? 0
    by.set(owner, c)
  }
  const list = [...by.values()].sort((a, b) => b.gross - a.gross)
  return ids ? list : list.slice(0, options.limit ?? 10)
}

/** Completed sales per UTC day, oldest first, with quiet days as zero. */
export async function dailySales(r: Reader, metric: string, days: number): Promise<{ days: string[]; gross: number[]; orders: number[] } | null> {
  const window = dayRange(days)
  const gross = new Map(window.map((d) => [d, 0]))
  const orders = new Map(window.map((d) => [d, 0]))

  const rpc = await r.rpc<RpcDay[]>(metric, "admin_daily_sales", { p_days: days })
  if (rpc.data) {
    for (const d of rpc.data) {
      const k = String(d.day).slice(0, 10)
      if (gross.has(k)) {
        gross.set(k, n(d.gross_cents))
        orders.set(k, n(d.orders))
      }
    }
  } else {
    if (!rpc.missing) return null
    const read = await allRows<{ created_at: string; amount_cents: number | null }>(r, metric, "created_at, amount_cents", (q) =>
      q.eq("status", "completed").gte("created_at", `${window[0]}T00:00:00.000Z`))
    if (!read) return null
    for (const o of read.rows) {
      const k = dayKey(o.created_at)
      if (!gross.has(k)) continue
      gross.set(k, gross.get(k)! + (o.amount_cents ?? 0))
      orders.set(k, orders.get(k)! + 1)
    }
  }
  return { days: window, gross: window.map((d) => gross.get(d)!), orders: window.map((d) => orders.get(d)!) }
}
