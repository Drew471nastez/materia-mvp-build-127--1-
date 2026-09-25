/**
 * ===========================================================================
 *  THE NUMBERS IN THE BAR ABOVE THE WEBSITE'S COVER
 * ===========================================================================
 * Visits to the live website, orders its Buy buttons and basket brought in,
 * the share of visits that ordered, and how fast the site was for the people
 * who visited (lib/website-builder/web-vitals.ts). All for one period, each
 * compared with the period just before it.
 *
 * WHAT COUNTS AS THE WEBSITE. A visit is the website's when the page it
 * landed on was on the website's own address (a storelib.com subdomain or a
 * connected domain), by the rule Analytics already uses for its Channel card
 * (channelOfUrl). An order is the website's when the checkout recorded it as
 * one (lib/orders/order-source.ts). Failed and pending payments are not
 * orders. The rules are the Analytics page's rules, so the two agree.
 *
 * Pure: the server reads the rows (site-performance-read.ts), this counts
 * them, and tests/web-vitals.test.ts checks the counting.
 */

import { channelOfUrl, sessionsOf, type ViewRow } from "@/lib/analytics/reports"
import { groupOrders, isSale, type OrderRow } from "@/lib/orders/order-view"
import type { RangeValue } from "@/lib/date-range/range"
import type { VitalsState } from "./web-vitals"
import type { Span } from "./site-period"

export type { Span }

export interface Figure {
  value: number
  /** Null when there is nothing to compare with (All time). */
  previous: number | null
  /** Fraction, 0.12 for +12%. Null without a previous value above zero. */
  change: number | null
}

export interface WebsitePerformance {
  /** Null when the visits could not be read; never a zero standing in. */
  visits: Figure | null
  orders: Figure | null
  /** Orders per visit. Null when either side could not be read. */
  conversion: Figure | null
  /** True when a busy period hit the read ceiling: the count is a floor. */
  truncated: boolean
  vitals: VitalsState
}

export interface PerformanceAnswer {
  period: RangeValue
  timeZone: string
  figures: WebsitePerformance
}

function figure(value: number, previous: number | null): Figure {
  return {
    value,
    previous,
    change: previous !== null && previous > 0 ? (value - previous) / previous : null,
  }
}

const within = (at: number, w: Span) => at >= w.start && at < w.end

/**
 * Visits, orders and conversion from the rows. `views` may hold views from
 * Storelib itself: only the website's are counted. `orders` may hold any of
 * the creator's orders: only the website's paid ones are counted.
 */
export function trafficFigures(input: {
  views: ViewRow[] | null
  orders: OrderRow[] | null
  span: Span
  previous: Span | null
  timeZone: string
  mainDomain: string
}): Pick<WebsitePerformance, "visits" | "orders" | "conversion"> {
  const { span, previous, timeZone, mainDomain } = input

  let visits: Figure | null = null
  if (input.views) {
    const site = input.views.filter((v) => channelOfUrl(v.page_url, mainDomain) === "website")
    const now = sessionsOf(site, span, timeZone).length
    const before = previous ? sessionsOf(site, previous, timeZone).length : null
    visits = figure(now, before)
  }

  let orders: Figure | null = null
  if (input.orders) {
    const counted = groupOrders(input.orders).filter(
      (o) => o.source === "website" && isSale(o),
    )
    const inWindow = (w: Span) => counted.filter((o) => within(Date.parse(o.createdAt), w)).length
    orders = figure(inWindow(span), previous ? inWindow(previous) : null)
  }

  let conversion: Figure | null = null
  if (visits && orders) {
    const rate = (o: number, v: number) => (v > 0 ? o / v : 0)
    conversion = figure(
      rate(orders.value, visits.value),
      previous && visits.previous !== null && orders.previous !== null ? rate(orders.previous, visits.previous) : null,
    )
  }

  return { visits, orders, conversion }
}
