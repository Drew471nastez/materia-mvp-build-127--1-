/**
 * THE FIVE FIGURES AT THE TOP OF ORDERS
 *
 * The ones a creator acts on, and nothing they have to decode: what came in,
 * how many orders, what an order is worth, how many people bought, and what
 * went back out. Each over the page's date range, against the same length of
 * time just before, with the shape of it underneath.
 */
import { bucketIndex, bucketStarts, grainFor } from "../analytics/buckets"
import { isSale, type Order } from "./order-view"
import { tt } from "@/lib/i18n/text"

export type MetricKey = "sales" | "orders" | "aov" | "customers" | "refunds"

export const METRICS: Array<{ key: MetricKey; label: string; money?: boolean; upIsBad?: boolean; help: string }> = [
  { key: "sales", get label() { return tt("Total sales") }, money: true, get help() { return tt("Money taken from orders in this period, less anything refunded.") } },
  { key: "orders", get label() { return tt("Orders") }, get help() { return tt("Orders placed in this period. Failed, unfinished and disputed payments are not counted.") } },
  { key: "aov", get label() { return tt("Average order value") }, money: true, get help() { return tt("What a paid order was worth on average. Free orders are left out.") } },
  { key: "customers", get label() { return tt("Customers") }, get help() { return tt("Different people who ordered in this period, told apart by their email.") } },
  { key: "refunds", get label() { return tt("Refunds") }, money: true, upIsBad: true, get help() { return tt("Money given back in this period, counted on the day it was refunded.") } },
]

export interface MetricReading {
  key: MetricKey
  value: number
  previous: number
  series: number[]
  previousSeries: number[]
  /** Fraction, 0.12 for +12%. Null when there is nothing before to compare with. */
  change: number | null
}

interface Window {
  start: number
  end: number
}

/* Failed, unfinished and disputed payments are not sales (lib/orders/order-view isSale). */
const counted = isSale
const net = (o: Order) => Math.max(0, o.totalCents - o.refundedCents)
const buyer = (o: Order) => (o.customerEmail || o.customerName || o.id).toLowerCase()

function inside(at: number, w: Window) {
  return at >= w.start && at < w.end
}

function refundsIn(orders: Order[], w: Window, starts: number[]): { total: number; series: number[] } {
  const series = starts.map(() => 0)
  let total = 0
  for (const o of orders) {
    for (const line of o.lines) {
      if (line.status !== "refunded") continue
      const at = Date.parse(line.refunded_at || line.created_at)
      if (!inside(at, w)) continue
      /* What was charged, the tip already inside it. */
      const whole = line.amount_cents || 0
      const cents = line.refund_amount_cents && line.refund_amount_cents > 0 ? Math.min(line.refund_amount_cents, whole) : whole
      total += cents
      const i = bucketIndex(starts, at)
      if (i >= 0) series[i] += cents
    }
  }
  return { total, series }
}

function reading(orders: Order[], key: MetricKey, w: Window, starts: number[]): { total: number; series: number[] } {
  if (key === "refunds") return refundsIn(orders, w, starts)
  const placed = orders.filter((o) => counted(o) && inside(Date.parse(o.createdAt), w))
  const series = starts.map(() => 0)
  const bucketOf = (o: Order) => bucketIndex(starts, Date.parse(o.createdAt))
  switch (key) {
    case "sales": {
      let total = 0
      for (const o of placed) {
        total += net(o)
        const i = bucketOf(o)
        if (i >= 0) series[i] += net(o)
      }
      return { total, series }
    }
    case "orders": {
      for (const o of placed) {
        const i = bucketOf(o)
        if (i >= 0) series[i]++
      }
      return { total: placed.length, series }
    }
    case "aov": {
      const sum = starts.map(() => 0)
      const n = starts.map(() => 0)
      const paid = placed.filter((o) => o.totalCents > 0)
      for (const o of paid) {
        const i = bucketOf(o)
        if (i < 0) continue
        sum[i] += o.totalCents
        n[i]++
      }
      const total = paid.length ? paid.reduce((t, o) => t + o.totalCents, 0) / paid.length : 0
      return { total, series: sum.map((v, i) => (n[i] ? v / n[i] : 0)) }
    }
    case "customers": {
      const seen = starts.map(() => new Set<string>())
      const all = new Set<string>()
      for (const o of placed) {
        all.add(buyer(o))
        const i = bucketOf(o)
        if (i >= 0) seen[i].add(buyer(o))
      }
      return { total: all.size, series: seen.map((s) => s.size) }
    }
  }
}

/** The five figures for a window, and for the one before it when there is one. */
export function readMetrics(
  orders: Order[],
  window: Window,
  previous: Window | null,
  timeZone: string,
): MetricReading[] {
  const grain = grainFor(window)
  const starts = bucketStarts(window, grain, timeZone)
  /* The comparison's own buckets: a custom comparison can be longer or
     shorter than the range, and shifted copies of this window's starts
     would pile everything past their end into the last one. */
  const prevStarts = previous ? bucketStarts(previous, grain, timeZone) : []
  return METRICS.map(({ key }) => {
    const cur = reading(orders, key, window, starts)
    const prev = previous ? reading(orders, key, previous, prevStarts) : { total: 0, series: [] as number[] }
    return {
      key,
      value: cur.total,
      previous: prev.total,
      series: cur.series,
      previousSeries: prev.series,
      change: previous && prev.total > 0 ? (cur.total - prev.total) / prev.total : null,
    }
  })
}

/**
 * Counts from every order, money from `money`: the same orders with each one
 * in the store's currency and any no rate converts left out
 * (lib/orders/paged metricsInStore). Orders and customers never shrink
 * because a rate was missing; money never adds two currencies' cents.
 */
export function moneyFrom(all: MetricReading[], money: MetricReading[]): MetricReading[] {
  const isMoney = new Set(METRICS.filter((m) => m.money).map((m) => m.key))
  return all.map((r) => (isMoney.has(r.key) ? money.find((m) => m.key === r.key) ?? r : r))
}
