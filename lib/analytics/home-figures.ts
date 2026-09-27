/**
 * ===========================================================================
 *  THE HOME PAGE'S FOUR FIGURES AND ITS CHART, BY THE ANALYTICS RULES
 * ===========================================================================
 * Home showed Views, Revenue, Orders and Conversion for the period it names,
 * and counted them in components/app/dashboard-client.tsx by rules of its
 * own that Analytics had already dropped. For the same period the two pages
 * gave different numbers, and Home's were the wrong ones:
 *
 *   A refund of any size took the whole order out of Revenue: a $50 order
 *   refunded $5 was $0 on Home and $45 on Analytics.
 *
 *   An order was a row, not a payment, so a basket of three was three
 *   orders, and the conversion rate was inflated with it.
 *
 *   The comparison was "the same length of time, ending a millisecond
 *   before", so at 10am Today was measured against yesterday from 2pm to
 *   midnight, not against yesterday's morning.
 *
 *   The chart's buckets were shaped by hand on the device's clock. Last 7
 *   days drew eight days, the first one before the period with every order
 *   of that day in it; Last 30 days lost its first two days, Last 90 days
 *   its first six, and Month to date began in the month before.
 *
 * Now Home asks the same question Analytics does, of the same place: the
 * figures come from app/api/analytics/reports (homeQuestion builds the very
 * key the Analytics page and its prefetch ask with, lib/analytics/
 * report-cache), counted on the server from every row, and homeFromReports
 * turns that answer into Home's shapes. Home counts every place together:
 * the creator page, the OnePage and every website. It is Analytics with its
 * property filter on All, so the two show the same numbers for the same
 * period, a visitor counted once however many of the places they saw.
 *
 * homeFigures below is the same mapping from rows, for the tests, so the two
 * cannot drift apart. The rules are those of lib/analytics/reports: orders
 * grouped into payments (lib/orders/order-view), money less what was
 * refunded (moneyOf), failed, pending and disputed payments left out
 * (isSale), conversion as orders over visitors, the period and its
 * comparison from lib/date-range/range, and buckets on the creator's clock
 * from lib/analytics/buckets. Pure, so tests/home-figures.test.ts checks the
 * numbers without a browser.
 */
import { boundsOf, compareBounds, type CompareValue, type RangeValue } from "../date-range/range"
import { groupOrders, isSale, type OrderRow } from "../orders/order-view"
import type { Span } from "./buckets"
import { buildReports, moneyOf, type Reports, type StepRow, type ViewRow } from "./reports"
import { reportKey } from "./report-cache"

/* The tab keys, as the page names them; "views" is the Visitors tab. */
export type HomeMetric = "views" | "orders" | "revenue" | "conversion"

export interface HomePoint {
  label: string
  /** Null only on the conversion line, where the bucket had no visitors: no rate, rather than 0%. */
  value: number | null
  /** Visitors only: link clicks in the same bucket. */
  secondaryValue?: number
  /** Orders only: orders placed in the bucket that have since been refunded. */
  refunds?: number
}

export interface HomePeriodFigures {
  /** Visitors, each counted once in the period, whichever of the creator's places they saw. */
  periodVisitors: number
  prevPeriodVisitors: number
  /** Page views in the period, the line under Visitors. */
  periodPageViews: number
  periodOrders: number
  prevPeriodOrders: number
  /** Cents, less refunds. */
  periodRevenue: number
  prevPeriodRevenue: number
  /** Percent, two decimals: 6.25 for 6.25%. Null when there were no visitors to divide by. */
  conversionRate: number | null
  prevConversionRate: number | null
}

/** What Home compares with, as Analytics does: the period just before. */
const PREVIOUS_PERIOD: CompareValue = { mode: "previous_period" }

/**
 * The period's instants and its comparison's, at `now`, on the creator's
 * clock. Whole days, the last one running to now, and the comparison cut at
 * the same point into its own last day. All time has nothing before it.
 */
export function homeSpans(period: RangeValue, timeZone: string, now: number): { window: Span; previous: Span | null } {
  const b = boundsOf(period, timeZone, now)
  /* At the stroke of midnight Today is no time at all; a millisecond keeps it a span. */
  const window = { start: b.start, end: Math.max(b.end, b.start + 1) }
  const previous = period.preset === "all_time" ? null : compareBounds(period, PREVIOUS_PERIOD, timeZone, now)
  return { window, previous }
}

/** All time, under each figure: payments that are sales, and their money less refunds. */
export function homeTotals(orders: OrderRow[]): { totalOrders: number; totalRevenue: number } {
  const sales = groupOrders(orders).filter(isSale)
  return { totalOrders: sales.length, totalRevenue: sales.reduce((sum, o) => sum + moneyOf(o).net, 0) }
}

/**
 * The question Home asks app/api/analytics/reports for a period: every
 * place, every product, the period just before, in the viewer's zone. `now`
 * is lib/analytics/report-cache reportNow(), so Home, the Analytics page and
 * its prefetch ask the same question and share one answer.
 */
export function homeQuestion(period: RangeValue, timeZone: string, now: number): { window: Span; previous: Span | null; key: string } {
  const { window, previous } = homeSpans(period, timeZone, now)
  const key = reportKey({ start: window.start, end: window.end, compare: previous, product: "all", property: "all", timeZone })
  return { window, previous, key }
}

/** The route's all time line (analytics_all_time) as Home's totals. */
export function homeAllTime(allTime: { orders?: number; salesCents?: number } | null | undefined) {
  return { totalOrders: allTime?.orders ?? 0, totalRevenue: allTime?.salesCents ?? 0 }
}

/**
 * The period's four figures and the chart's four series, from the reports
 * Analytics is drawn from: every number Home shows is one of Analytics'.
 */
export function homeFromReports(r: Reports): HomePeriodFigures & { series: Record<HomeMetric, HomePoint[]> } {
  const percent = (fraction: number | null) => (fraction === null ? null : Number((fraction * 100).toFixed(2)))
  const labels = r.visitors.series.labels
  return {
    periodVisitors: r.visitors.value,
    prevPeriodVisitors: r.visitors.previous,
    periodPageViews: r.views.value,
    periodOrders: r.orders.value,
    prevPeriodOrders: r.orders.previous,
    periodRevenue: r.sales.value,
    prevPeriodRevenue: r.sales.previous,
    conversionRate: percent(r.conversion.value),
    prevConversionRate: percent(r.conversion.previous),
    series: {
      views: labels.map((label, i) => ({ label, value: r.visitors.series.current[i] ?? 0, secondaryValue: r.linkClicks.series.current[i] ?? 0 })),
      orders: labels.map((label, i) => ({ label, value: r.orders.series.current[i] ?? 0, refunds: r.refunds.series.current[i] ?? 0 })),
      /* The chart's axis is written in dollars. */
      revenue: labels.map((label, i) => ({ label, value: (r.sales.series.current[i] ?? 0) / 100 })),
      conversion: labels.map((label, i) => ({ label, value: percent(r.conversion.series.current[i] ?? null) })),
    },
  }
}

/**
 * The same, from rows: what the route counts, counted here. `orders` may be
 * every order the creator has: only the period's and its comparison's are
 * counted. `views` are the page views read for both spans, and `steps` the
 * link clicks (link_click rows).
 */
export function homeFigures(input: {
  orders: OrderRow[]
  views: ViewRow[]
  steps?: StepRow[]
  window: Span
  previous: Span | null
  timeZone: string
}): HomePeriodFigures & { series: Record<HomeMetric, HomePoint[]> } {
  const { window, previous, timeZone } = input
  const r = buildReports({
    views: input.views,
    steps: input.steps ?? [],
    orders: input.orders,
    window,
    previous,
    timeZone,
    mainDomain: "",
    productTitles: {},
  })
  return homeFromReports(r)
}
