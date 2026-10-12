import "server-only"

/**
 * ===========================================================================
 *  ONE ORDER NUMBER FOR THE SELLER
 * ===========================================================================
 * An order has two names, for two readers:
 *
 *   the seller   the Orders page's number, #1001 for the store's first order
 *                and up (lib/orders/order-view groupOrders: the store's
 *                orders oldest first, a basket counted once). Every email,
 *                page and message the SELLER reads names an order this way.
 *   the buyer    the order's reference, the first eight characters of its id
 *                (#85737C57: lib/physical/status orderNumber, lib/receipts/
 *                rules orderNumberOf). It is what the buyer's confirmation,
 *                order page, receipt and every buyer email already say, and it
 *                never changes, so a buyer never sees a different number.
 *
 * Where the seller reads something a buyer wrote (a cancel or return
 * request, a message from Contact the shop), the email names the order by
 * the seller's number and gives the buyer's reference beside it ("Buyer's
 * reference 85737C57"), so the seller can match what the buyer quotes.
 * Documented for the owner in lib/admin/commerce-docs.ts.
 *
 * The number is not stored: it is counted the way the Orders page counts it,
 * from the store's order rows. Null when they cannot be read; the caller
 * then falls back to the buyer's reference.
 */
import { FIRST_ORDER_NUMBER } from "./order-view"
import { byCreator, ownRows, scopedOrders } from "@/lib/analytics/creator-orders"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any
type Row = { id: string; stripe_session_id: string | null; created_at: string; checkout_id?: string | null }

/** The Orders page's numbers, by order row id and by checkout id. */
export async function sellerOrderNumbers(db: Db, creatorId: string): Promise<{ byOrder: Map<string, number>; byCheckout: Map<string, number> } | null> {
  try {
    const rows = await byCreator(async (scope) => {
      const out: Row[] = []
      for (let from = 0; from < 100_000; from += 1000) {
        const { data, error } = await scopedOrders(db, "id, stripe_session_id, created_at, checkout_id", scope, creatorId, null).order("created_at", { ascending: true }).order("id", { ascending: true }).range(from, from + 999)
        if (error) throw new Error(`order numbers: ${error.message}`)
        out.push(...((data ?? []) as Row[]))
        if (!data || data.length < 1000) break
      }
      return ownRows(out) as Row[]
    })
    return numbersOf(rows)
  } catch (e) {
    console.error("[orders] numbers not read:", e instanceof Error ? e.message : e)
    return null
  }
}

/** Pure: the same grouping and order as groupOrders, so the numbers are the Orders page's. */
export function numbersOf(rows: Row[]): { byOrder: Map<string, number>; byCheckout: Map<string, number> } {
  const groups = new Map<string, Row[]>()
  for (const r of rows) {
    const key = r.stripe_session_id ? `s:${r.stripe_session_id}` : `o:${r.id}`
    const g = groups.get(key)
    if (g) g.push(r)
    else groups.set(key, [r])
  }
  const firsts = [...groups.values()].map((g) => {
    g.sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id))
    return g
  })
  firsts.sort((a, b) => a[0].created_at.localeCompare(b[0].created_at) || a[0].id.localeCompare(b[0].id))
  const byOrder = new Map<string, number>()
  const byCheckout = new Map<string, number>()
  firsts.forEach((g, i) => {
    for (const r of g) {
      byOrder.set(r.id, FIRST_ORDER_NUMBER + i)
      if (r.checkout_id && !byCheckout.has(r.checkout_id)) byCheckout.set(r.checkout_id, FIRST_ORDER_NUMBER + i)
    }
  })
  return { byOrder, byCheckout }
}

/** "#1003" for one order (a cart that ships by its checkout, a download by its order row), or null. */
export async function sellerOrderNumber(db: Db, creatorId: string, ref: { checkoutId?: string | null; orderId?: string | null }): Promise<string | null> {
  const n = await sellerOrderNumbers(db, creatorId)
  if (!n) return null
  const v = (ref.checkoutId ? n.byCheckout.get(ref.checkoutId) : undefined) ?? (ref.orderId ? n.byOrder.get(ref.orderId) : undefined)
  return v ? `#${v}` : null
}

/** For a message to the seller about one order row: the Orders page's number and the buyer's reference, or the reference alone. */
export async function sellerNumberAndRef(db: Db, creatorId: string, orderId: string): Promise<{ orderNumber: string; buyerReference: string | null }> {
  const ref = orderId.replace(/-/g, "").slice(0, 8).toUpperCase()
  const n = await sellerOrderNumber(db, creatorId, { orderId }).catch(() => null)
  return n ? { orderNumber: n, buyerReference: ref } : { orderNumber: ref, buyerReference: null }
}
