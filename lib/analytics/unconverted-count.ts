/**
 * HOW MANY SALES A FIGURE LEFT OUT FOR WANT OF A RATE.
 *
 * Analytics says "{count} could not be converted yet and are not included"
 * under its money. It counted every row no rate converted, and a report
 * reads more rows than it adds up: a day either side of the period, the
 * period it is compared with, earlier orders refunded inside it, and
 * payments that failed or never finished. None of those would have been in
 * the figure, so the note named more sales than were missing.
 *
 * Now it counts the lines that would have been added: placed inside the
 * period, of an order that is a sale by the one rule every figure uses
 * (lib/orders/order-view isSale).
 */
import { groupOrders, isSale, type OrderRow } from "@/lib/orders/order-view"

export interface Window {
  start: number
  end: number
}

export function unconvertedIncluded(left: ReadonlyArray<{ created_at: string }> | undefined, window: Window | null | undefined): number {
  if (!left || left.length === 0) return 0
  const inside = left.filter((r) => {
    const at = Date.parse(r.created_at)
    return !window || (Number.isFinite(at) && at >= window.start && at < window.end)
  }) as unknown as OrderRow[]
  if (inside.length === 0) return 0
  let count = 0
  for (const order of groupOrders(inside.map((r) => ({ ...r, status: r.status || "pending", amount_cents: r.amount_cents || 0 })))) {
    if (isSale(order)) count += order.lines.length
  }
  return count
}
