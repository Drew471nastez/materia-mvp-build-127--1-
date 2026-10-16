/**
 * ===========================================================================
 *  EVERY ORDER'S NUMBER, FROM THREE COLUMNS
 * ===========================================================================
 * An order's number (#1001 for the store's first) is its place among the
 * store's orders, oldest first, a basket counted once (order-view
 * groupOrders). It is not stored, so it can only be counted over every
 * order the store has. That count needs three columns of each row and
 * nothing else: its id, when it was written and its Stripe session (the
 * rows of one basket share it).
 *
 * buildIndex is that count, with the same grouping and the same order as
 * groupOrders, so a number read from here is the number the Orders page has
 * always shown. lib/orders/paged.ts reads these three columns (and keeps
 * them between requests) to number one page of orders without reading the
 * others; lib/orders/order-number-server.ts numbers the seller's emails
 * with it.
 */
import { FIRST_ORDER_NUMBER, byTimeThenId, orderKeyOf } from "./order-view"

export interface IndexRow {
  id: string
  created_at: string
  stripe_session_id?: string | null
}

export interface IndexedOrder {
  /** The first row's id: the order's id everywhere on the page. */
  id: string
  createdAt: string
  /** createdAt as milliseconds, as the list's date range compares it. */
  at: number
  number: number
  /** Every row of the order, oldest first. */
  rowIds: string[]
}

export interface OrderIndex {
  /** Oldest first: orders[i] is number FIRST_ORDER_NUMBER + i. */
  orders: IndexedOrder[]
  /** Any row id to the order it belongs to. */
  byRow: Map<string, IndexedOrder>
  /** Any row id to when it was written. */
  rowTime: Map<string, string>
}

export function buildIndex(rows: IndexRow[]): OrderIndex {
  const groups = new Map<string, IndexRow[]>()
  for (const row of rows) {
    const key = orderKeyOf(row)
    const group = groups.get(key)
    if (group) group.push(row)
    else groups.set(key, [row])
  }
  const firsts: IndexRow[][] = []
  for (const group of groups.values()) {
    group.sort(byTimeThenId)
    firsts.push(group)
  }
  firsts.sort((a, b) => byTimeThenId(a[0], b[0]))
  const byRow = new Map<string, IndexedOrder>()
  const rowTime = new Map<string, string>()
  const orders = firsts.map((group, i): IndexedOrder => {
    const first = group[0]
    const order: IndexedOrder = {
      id: first.id,
      createdAt: first.created_at,
      at: Date.parse(first.created_at),
      number: FIRST_ORDER_NUMBER + i,
      rowIds: group.map((r) => r.id),
    }
    for (const r of group) {
      byRow.set(r.id, order)
      rowTime.set(r.id, r.created_at)
    }
    return order
  })
  return { orders, byRow, rowTime }
}

/** The order with this number, or null. */
export function orderNumbered(index: OrderIndex, n: number): IndexedOrder | null {
  return index.orders[n - FIRST_ORDER_NUMBER] ?? null
}

/** The orders placed inside a window (every order for none), oldest first, as the list's date range counts them. */
export function ordersWithin(index: OrderIndex, window: { start: number; end: number } | null): IndexedOrder[] {
  if (!window) return index.orders
  return index.orders.filter((o) => o.at >= window.start && o.at < window.end)
}
