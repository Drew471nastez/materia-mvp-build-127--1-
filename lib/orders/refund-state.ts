/**
 * Whether an order gave ALL its money back. The table has one status,
 * "refunded", for a partial refund and a full one alike; the amount says
 * which (lib/orders/order-view.ts reads it the same way). A partial refund
 * is a gesture on a sale that stands, so the buyer keeps the product; a
 * full one takes it back.
 */
export function fullyRefunded(row: { status?: string | null; amount_cents?: number | null; refund_amount_cents?: number | null }): boolean {
  if (row.status !== "refunded") return false
  const recorded = row.refund_amount_cents
  const total = row.amount_cents || 0
  return !(typeof recorded === "number" && recorded > 0 && recorded < total)
}

/**
 * ===========================================================================
 *  THE AMOUNT THE REFUND DIALOG READ, ECHOED BACK (round AW)
 * ===========================================================================
 * A partial refund can be made again by design: $5 of a $20 order, then $5
 * more. So the idempotency key names what was refunded before
 * (`storelib-refund:<order>:<refunded before>:<amount>`), and a refund that
 * went through moves the key on. That is right for a second refund the
 * seller means, and wrong for the same press sent again: the answer to the
 * first one is lost (a phone that dropped the connection, the app sent to
 * the background, a function that timed out after Stripe said yes), the page
 * says the refund did not go through, the seller presses Refund again, and
 * the buyer is sent the money twice, taken back from the seller. A second
 * tab still showing the order from before the first refund does the same.
 *
 * The admin refund already asks for this (lib/admin/refund-plan.ts): the
 * request carries the figure the person read, and nothing is refunded when
 * the order has moved on since. The creator's Orders page and a community's
 * payments do now too: the dialog sends what it showed as left to refund,
 * and the server refuses (409, REFUND_CHANGED) when the order holds another
 * figure, answering what it holds so the page can show it. A request with no
 * figure (a page loaded before this) refunds as before.
 */
export const REFUND_CHANGED = "refund_changed"

/** True when the page said how much was left to refund and the order now holds another figure. Absent is not a change. */
export function refundEchoStale(sent: unknown, refundableNow: number): boolean {
  if (sent === undefined || sent === null || sent === "") return false
  const n = typeof sent === "number" ? sent : typeof sent === "string" && /^\d{1,12}$/.test(sent.trim()) ? Number(sent.trim()) : Number.NaN
  /* A figure that is not a whole amount is never a yes to send money back. */
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) return true
  return n !== Math.max(0, Math.round(refundableNow))
}

/** What the seller reads when the order moved on: what has gone back already, and that nothing more did. */
export function refundChangedMessage(refundedCents: number, money: (cents: number) => string): string {
  return refundedCents > 0
    ? `${money(refundedCents)} of this order has already been refunded, so nothing more was sent back now. Check what is left and refund again if you need to.`
    : "This order changed since you opened it, so nothing was refunded. Check the amount and try again."
}
