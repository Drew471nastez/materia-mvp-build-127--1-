/**
 * TEST SALES ARE NOT SALES IN ANALYTICS
 *
 * The admin console's Test sale (app/api/admin/sales-trigger) writes a real
 * order row, free and in dollars, so a seller's notifications, emails and
 * Orders list can be tried end to end. It is tagged where it came from
 * (source_detail.surface "admin", lib/orders/order-source) and the Orders
 * list says "Test sale" beside it. Analytics counted it as an order: five
 * test sales read as 5 orders and 0.00 revenue, and pulled conversion and
 * the average order value down with them.
 *
 * Every Analytics read of orders leaves them out (report-read readOrders,
 * commerce-server, the all time line and its SQL, part 321), so the figures
 * are of buyers only. The Orders list keeps showing them, marked.
 *
 * Pure.
 */
import { cleanOrigin } from "@/lib/orders/order-source"

/** An admin's test sale (source_detail.surface "admin"), not a buyer's order. */
export function isTestSale(row: { source_detail?: unknown } | null | undefined): boolean {
  return !!row && cleanOrigin(row.source_detail)?.surface === "admin"
}

/** The rows without the test sales; the same array when there are none. */
export function withoutTestSales<T extends { source_detail?: unknown }>(rows: T[]): T[] {
  return rows.some(isTestSale) ? rows.filter((r) => !isTestSale(r)) : rows
}
