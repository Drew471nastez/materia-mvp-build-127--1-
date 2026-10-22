import "server-only"

/**
 * The database half of ./guest-access.ts: which orders a browser's
 * `sl_owned` cookie really holds, read back from the orders themselves.
 * Used by the product page (owned, not Buy), the download route (a file
 * without the receipt link), /api/receipt/remember and /api/receipt/open.
 */
import { canDeliver } from "./rules"
import { GUEST_ACCESS_COOKIE, grantHolds, guestAccessKey, readGrants, type Grant } from "./guest-access"

export interface GuestOrder {
  id: string
  product_id: string
  variant_id: string | null
  status: string | null
  amount_cents?: number | null
  refund_amount_cents?: number | null
  receipt_token: string
  buyer_email: string | null
  buyer_id: string | null
}

type Db = { from: (table: string) => any }

export interface HeldGrants {
  /** Orders whose grant this server signed and that still deliver (paid, not refunded). */
  open: GuestOrder[]
  /** Grants that hold no more: unsigned, expired, the order gone or no longer delivering. Dropped from the cookie on the next write. */
  stale: string[]
  /** Every well formed grant read, signed or not, for rewriting the cookie. */
  grants: Grant[]
}

const EMPTY: HeldGrants = { open: [], stale: [], grants: [] }

/**
 * What a cookie value holds. One read of the orders it names (at most
 * MAX_GRANTS), each grant checked against its own order's token, each order
 * against the delivery rule. `productId` narrows the read to one product.
 */
export async function heldGrants(admin: Db, raw: string | null | undefined, opts: { productId?: string; now?: number; key?: Buffer | null } = {}): Promise<HeldGrants> {
  const grants = readGrants(raw)
  if (grants.length === 0) return EMPTY
  const key = opts.key === undefined ? guestAccessKey() : opts.key
  if (!key) return { ...EMPTY, grants }
  const now = opts.now ?? Date.now()
  try {
    let q = admin.from("orders").select("*").in("id", grants.map((g) => g.orderId))
    if (opts.productId) q = q.eq("product_id", opts.productId)
    const { data, error } = await q
    if (error || !Array.isArray(data)) return { ...EMPTY, grants }
    const byId = new Map<string, GuestOrder>((data as GuestOrder[]).map((o) => [String(o.id).toLowerCase(), o]))
    const open: GuestOrder[] = []
    const stale: string[] = []
    for (const g of grants) {
      const order = byId.get(g.orderId)
      if (!order) {
        /* Narrowed to one product, an order of another product is simply not asked about. */
        if (!opts.productId) stale.push(g.orderId)
        continue
      }
      if (!grantHolds(key, g, order.receipt_token, now) || !canDeliver(order)) {
        stale.push(g.orderId)
        continue
      }
      open.push(order)
    }
    return { open, stale, grants }
  } catch {
    return { ...EMPTY, grants }
  }
}

/** The cookie's value from a Next cookie store or a request's cookies. */
export function guestAccessCookieFrom(jar: { get(name: string): { value?: string } | undefined } | null | undefined): string | null {
  try {
    return jar?.get(GUEST_ACCESS_COOKIE)?.value ?? null
  } catch {
    return null
  }
}

/** The address an order was paid with, shown well enough to recognise and not to harvest (same mask as the receipt). */
export { maskAddress } from "./rules"
