import "server-only"

/**
 * The database half of ./guest-access.ts: which orders a browser's
 * `sl_owned` cookie really holds, read back from the orders themselves.
 * Used by the product page (owned, not Buy), the download route (a file
 * without the receipt link), /api/receipt/remember and /api/receipt/open.
 */
import { canDeliver, isPlausibleToken } from "./rules"
import { GUEST_ACCESS_COOKIE, grantHolds, guestAccessKey, mergeGrants, readGrants, signGrant, writeGrants, type Grant } from "./guest-access"

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

/**
 * The cookie after the receipt `receiptToken` was paid for or opened in this
 * browser: that order and the other lines of the same payment to the same
 * address, each signed with its own token, added in front of what the cookie
 * held, less whatever no longer holds (a refund since, an order gone).
 * `value` is "" when nothing is left to keep. Null when there is no key or
 * the token names no order (nothing to write). Shared by the receipt page's
 * /api/receipt/remember and the checkouts that end on a page of their own
 * (a website's thank you page), so a guest who never opens the receipt is
 * still remembered on the browser that paid.
 */
export async function rememberReceipt(
  admin: Db,
  receiptToken: string,
  raw: string | null | undefined,
  opts: { key?: Buffer | null; now?: number } = {},
): Promise<{ value: string; remembered: number } | null> {
  const key = opts.key === undefined ? guestAccessKey() : opts.key
  if (!key || !isPlausibleToken(receiptToken)) return null
  try {
    const { data: order } = await admin.from("orders").select("*").eq("receipt_token", receiptToken).maybeSingle()
    if (!order) return null
    /* The whole payment: a basket's lines are rows of their own with tokens of their own (the same rule as the receipt loader). */
    let lines: GuestOrder[] = [order as GuestOrder]
    const session = (order as { stripe_session_id?: string | null }).stripe_session_id
    if (session && order.buyer_email) {
      const email = String(order.buyer_email).trim().toLowerCase()
      const { data: siblings } = await admin.from("orders").select("*").eq("stripe_session_id", session)
      lines = [order as GuestOrder, ...((siblings ?? []) as GuestOrder[]).filter((r) => r.id !== order.id && String(r.buyer_email ?? "").trim().toLowerCase() === email)]
    }
    const added: Grant[] = []
    for (const line of lines) {
      if (!canDeliver(line) || !isPlausibleToken(line.receipt_token)) continue
      const g = signGrant(key, { id: String(line.id), receiptToken: line.receipt_token }, opts.now)
      if (g) added.push(g)
    }
    const held = await heldGrants(admin, raw, { key, now: opts.now })
    const kept = readGrants(raw).filter((g) => !held.stale.includes(g.orderId))
    return { value: writeGrants(mergeGrants(kept, added, opts.now)), remembered: added.length }
  } catch {
    return null
  }
}

const PRODUCT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * What this browser bought as a guest of ONE creator's products, for a
 * website's product page: per product, the whole product or the options, and
 * the order the "Open" link names (/api/receipt/open checks the cookie again).
 * Products of other creators are never answered, whatever the cookie holds.
 */
export async function guestOwns(
  admin: Db,
  raw: string | null | undefined,
  scope: { creatorId: string },
  productIds: string[],
  opts: { key?: Buffer | null; now?: number } = {},
): Promise<Record<string, { whole: boolean; options: string[]; orderId: string }>> {
  const ids = [...new Set(productIds.filter((id) => PRODUCT_ID.test(id)))].slice(0, 24)
  if (ids.length === 0 || !PRODUCT_ID.test(scope.creatorId) || readGrants(raw).length === 0) return {}
  let ownable: Set<string>
  try {
    const { data } = await admin.from("products").select("id, type").in("id", ids).eq("creator_id", scope.creatorId)
    ownable = new Set(((data ?? []) as { id: string; type: string }[]).filter((p) => p.type !== "physical" && p.type !== "membership").map((p) => p.id))
  } catch {
    return {}
  }
  if (ownable.size === 0) return {}
  const held = await heldGrants(admin, raw, opts)
  const out: Record<string, { whole: boolean; options: string[]; orderId: string }> = {}
  for (const o of held.open) {
    if (!ownable.has(o.product_id)) continue
    const entry = (out[o.product_id] ??= { whole: false, options: [], orderId: String(o.id) })
    if (!o.variant_id) entry.whole = true
    else if (!entry.options.includes(o.variant_id)) entry.options.push(o.variant_id)
  }
  for (const e of Object.values(out)) if (e.whole) e.options = []
  return out
}

/** The address of "Open" for an order this browser holds: the receipt, reached through the cookie, never with the token in the page. */
export function guestOpenHref(orderId: string): string {
  return `/api/receipt/open?order=${encodeURIComponent(orderId)}`
}
