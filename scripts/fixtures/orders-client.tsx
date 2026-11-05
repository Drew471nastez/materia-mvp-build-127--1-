import type { ComponentProps } from "react"
import { useSearchParams } from "next/navigation"
import { OrdersClient as LiveOrdersClient } from "@/app/(storelib)/app/orders/orders-client"
import { filterOrders, groupOrders, inView, pageOf, queryFromParams, VIEWS, type OrderRow } from "@/lib/orders/order-view"
import { listingKey } from "@/lib/orders/listing-params"
import { firstDayOf, rangeWindow, readOrdersPeriod } from "@/lib/orders/range"
import { todayIn } from "@/lib/date-range/range"
import { readMetrics } from "@/lib/orders/metrics"
import { ordersCurrency } from "@/lib/orders/money"
import type { OrdersListing } from "@/lib/orders/paged"

type Props = Omit<ComponentProps<typeof LiveOrdersClient>, "listing" | "listingKey"> & { rows: OrderRow[] }

/** Browser fixtures supply rows, adapting them to the same paged contract as the server. */
export function OrdersClient({ rows, ...props }: Props) {
  const search = useSearchParams()
  const address = new URLSearchParams(search?.toString() ?? "")
  const orders = groupOrders(rows)
  const earliest = orders.reduce<string | null>((first, order) => !first || order.createdAt < first ? order.createdAt : first, null)
  const { period } = readOrdersPeriod(address, props.initialRange, todayIn(props.timeZone, props.now), firstDayOf(earliest ? Date.parse(earliest) : null, props.timeZone))
  const span = rangeWindow(period, { mode: "previous_period" }, props.now, props.timeZone)
  const query = queryFromParams(address)
  const filtered = filterOrders(orders, query, span)
  const page = pageOf(filtered, query.page)
  const listing: OrdersListing = {
    rows, numbers: Object.fromEntries(orders.map(order => [order.id, order.number])),
    pageIds: page.items.map(order => order.id),
    before: filtered[page.from - 2]?.id ?? null, after: filtered[page.to]?.id ?? null,
    matching: filtered.length, range: { page: page.page, pages: page.pages, from: page.from, to: page.to },
    metrics: readMetrics(orders, span, span.previous, props.timeZone),
    summary: { total: orders.length, earliest, ships: orders.some(order => order.shipping !== null), views: VIEWS.filter(view => view.value === "all" || orders.some(order => inView(order, view.value))).map(view => view.value), currency: ordersCurrency(orders) },
    figures: true, partial: false,
  }
  return <LiveOrdersClient {...props} listing={listing} listingKey={listingKey(query, period, props.timeZone)} />
}
