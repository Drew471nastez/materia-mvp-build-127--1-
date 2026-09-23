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
