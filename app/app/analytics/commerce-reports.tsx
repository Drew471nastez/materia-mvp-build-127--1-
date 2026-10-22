"use client"

/**
 * ===========================================================================
 *  SALES REPORTS: THE STORE'S MONEY, THE WAY SHOPIFY'S ANALYTICS SHOWS IT
 * ===========================================================================
 * Under the main chart, read from app/api/analytics/commerce for the page's
 * own period, comparison, time zone, product and place (lib/analytics/
 * commerce adds it up):
 *
 *   Total sales breakdown     gross, discounts, returns, net, shipping,
 *                             taxes, tips, total, each against the period
 *                             it is compared with
 *   Total sales over time     this period's line over that one's, in the
 *                             chart's own buckets on the seller's clock
 *   Total sales by channel    online store, Storelib, OnePage, links
 *   Customers                 the returning customer rate
 *   Fulfillment               how long a physical order took to ship
 *
 * Shipping and fulfilment are only for a seller who ships or has a
 * published website (lib/analytics/sections).
 *
 * DRAWN BEFORE THE ANSWER. Every card, its title, its switcher and the names
 * of its rows are on the first paint, each body in a fixed height; the
 * numbers fill them. The block used to be one empty 320px box that became
 * four cards of another height when the answer came, and every card under
 * it jumped 360 to 1,000px (scripts/check-analytics-tabs.mjs). The last
 * answer to the same question is kept (lib/analytics/commerce-cache) and
 * drawn at once on a return.
 */
import * as React from "react"

import { cn } from "@/lib/utils"
import { HelpLabel } from "@/components/app/help-label"
import { ShimmerBlock } from "@/components/ui/shimmer"
import { shopMoneyIn } from "@/lib/store/shop-money"
import { useStoreCurrency } from "@/lib/store/currency-context"
import { tt } from "@/lib/i18n/text"
import { bucketLabel, type Grain } from "@/lib/analytics/buckets"
import type { SalesBreakdown } from "@/lib/analytics/commerce"
import { COMMERCE_FRESH_MS, askCommerce, commerceKey, commerceQuestionOf, keptCommerce } from "@/lib/analytics/commerce-cache"
import { ReportFill, ReportTabs } from "./analytics-reports"

type Point = { t: number; total: number; orders: number; aov: number }
interface Answer {
  currency: string
  grain: Grain
  timeZone?: string
  compared?: boolean
  breakdown: SalesBreakdown
  previous: SalesBreakdown
  series: Point[]
  previousSeries: Point[]
  channels: Array<{ channel: string; label: string; total: number; orders: number }>
  fulfillment: { hours: number | null; shipped: number }
  fulfillmentBefore?: { hours: number | null; shipped: number }
}

const ACCENT = "#8b5cf6"
const CHANNEL_ROWS = 5

function Card({ title, help, children, className, card, tabs }: { title: string; help: string; children: React.ReactNode; className?: string; card: string; tabs?: React.ReactNode }) {
  return (
    <section data-card={card} className={cn("flex min-w-0 flex-col rounded-2xl border border-[#e5e7eb]/60 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]", className)}>
      <header className="flex min-h-[52px] flex-col justify-center gap-2.5 px-5 pt-4">
        <div className="min-w-0">
          <HelpLabel as="h3" label={title} description={help} className="max-w-full truncate text-[14px] font-semibold text-[#1a1a2e]" />
        </div>
        {tabs ? <div className="orders-strip -mx-1 overflow-x-auto px-1">{tabs}</div> : null}
      </header>
      <div className="flex min-h-0 flex-1 flex-col px-5 pb-5 pt-2">{children}</div>
    </section>
  )
}

function Delta({ now, before, invert = false, compared }: { now: number; before: number; invert?: boolean; compared: boolean }) {
  if (!compared) return null
  if (before === 0) return <span className="text-[12px] text-[#9ca3af]">{now > 0 ? tt("New") : "–"}</span>
  const pct = Math.round(((now - before) / Math.abs(before)) * 100)
  if (pct === 0) return <span className="text-[12px] tabular-nums text-[#9ca3af]">0%</span>
  const good = invert ? pct < 0 : pct > 0
  return (
    <span className={cn("text-[12px] font-medium tabular-nums", good ? "text-[#15803d]" : "text-[#b42318]")}>
      {pct > 0 ? "↗" : "↘"} {Math.abs(pct)}%
    </span>
  )
}

/** A number still on its way: a light block the size of a figure, so the row keeps its height. */
const Pending = ({ w = "w-16" }: { w?: string }) => <ShimmerBlock className={cn("inline-block h-3.5 rounded-full align-middle", w)} />

/** A line of this period over a dashed line of the one it is compared with, with a soft fill. */
function LineChart({ series, previous, format, value, grain, timeZone }: { series: Point[]; previous: Point[]; format: (n: number) => string; value: (p: Point) => number; grain: Grain; timeZone: string }) {
  const [hover, setHover] = React.useState<number | null>(null)
  const W = 600
  const H = 160
  const values = series.map(value)
  const prevValues = previous.map(value)
  const max = Math.max(1, ...values, ...prevValues)
  const x = (i: number, n: number) => (n <= 1 ? W / 2 : (i / (n - 1)) * W)
  const y = (v: number) => H - 8 - (v / max) * (H - 24)
  const path = (vals: number[]) => vals.map((v, i) => `${i ? "L" : "M"}${x(i, vals.length).toFixed(1)} ${y(v).toFixed(1)}`).join(" ")
  const area = values.length ? `${path(values)} L${x(values.length - 1, values.length).toFixed(1)} ${H} L0 ${H} Z` : ""
  const id = React.useId().replace(/:/g, "")
  const at = hover ?? values.length - 1
  return (
    <div className="relative">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <span className="text-[13px] text-[#6b7280]">{series[at] ? bucketLabel(series[at].t, grain, timeZone) : ""}</span>
        <span className="text-[13px] font-semibold tabular-nums text-[#1a1a2e]">{series[at] ? format(values[at]) : ""}</span>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="h-[160px] w-full touch-none overflow-visible"
        onPointerMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect()
          const i = Math.round(((e.clientX - r.left) / r.width) * (values.length - 1))
          setHover(Math.max(0, Math.min(values.length - 1, i)))
        }}
        onPointerLeave={() => setHover(null)}
        aria-hidden
      >
        <defs>
          <linearGradient id={`${id}f`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={ACCENT} stopOpacity="0.14" />
            <stop offset="1" stopColor={ACCENT} stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map((f) => (
          <line key={f} x1="0" x2={W} y1={H - 8 - f * (H - 24)} y2={H - 8 - f * (H - 24)} stroke="#f1f2f4" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        ))}
        {prevValues.length ? <path d={path(prevValues)} fill="none" stroke="#c7cbd1" strokeWidth="1.5" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" /> : null}
        {area ? <path d={area} fill={`url(#${id}f)`} /> : null}
        {values.length ? <path d={path(values)} fill="none" stroke={ACCENT} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" /> : null}
        {values.length ? <line x1={x(at, values.length)} x2={x(at, values.length)} y1="0" y2={H} stroke="#e5e7eb" strokeWidth="1" vectorEffect="non-scaling-stroke" /> : null}
      </svg>
    </div>
  )
}

/** The legend under the chart: drawn from the start, its words are the period's, not the answer's. */
function Legend({ compared }: { compared: boolean }) {
  return (
    <div className="mt-2 flex h-5 items-center gap-4 text-[12px] text-[#6b7280]">
      <span className="inline-flex items-center gap-1.5">
        <span className="h-0.5 w-3 rounded" style={{ background: ACCENT }} />
        {tt("This period")}
      </span>
      {compared ? (
        <span className="inline-flex items-center gap-1.5">
          <span className="h-0 w-3 border-t border-dashed border-[#9ca3af]" />
          {tt("Previous period")}
        </span>
      ) : null}
    </div>
  )
}

export interface CommerceReportsProps {
  span: { start: number; end: number }
  /** What the period is compared with: the chart's own instants, or null for none. */
  compare: { start: number; end: number } | null
  timeZone: string
  /** "all" or a product id. The sales cards follow the same product as the chart. */
  product?: string
  /** "all", "creator_page", "onepage" or "website:<id>". */
  property?: string
  /** Shipping in the breakdown, for a store that ships or has a published website, while what is chosen could ship. */
  showShipping?: boolean
  /** Order fulfillment time, on the same terms. */
  showFulfillment?: boolean
  /** Who is signed in: a kept answer counted for anybody else is never drawn. */
  viewer?: string | null
  /** The page's minute: asks the same question again. */
  refresh?: number
}

export function CommerceReports({ span, compare, timeZone, product = "all", property = "all", showShipping = true, showFulfillment = true, viewer = null, refresh = 0 }: CommerceReportsProps) {
  const currency = useStoreCurrency()
  const key = commerceKey({ start: span.start, end: span.end, compare, product, property, timeZone, currency })
  const question = commerceQuestionOf(key)
  const [state, setState] = React.useState<{ data: Answer | null; question: string; loading: boolean }>(() => ({ data: null, question: "", loading: true }))
  const [metric, setMetric] = React.useState<"total" | "aov" | "orders">("total")
  const refreshed = React.useRef(refresh)

  /* Before the paint: the kept answer to this question, so a return draws its numbers in the first frame. */
  React.useLayoutEffect(() => {
    const known = keptCommerce<Answer>(key, viewer)
    setState((s) => (known && s.question !== question ? { data: known.answer, question, loading: true } : { ...s, loading: true }))
    const polled = refreshed.current !== refresh
    refreshed.current = refresh
    if (known && !polled && Date.now() - known.at < COMMERCE_FRESH_MS) {
      setState((s) => ({ ...s, loading: false }))
      return
    }
    let live = true
    askCommerce<Answer>(key, viewer)
      .then((d) => live && setState({ data: d, question, loading: false }))
      .catch(() => live && setState((s) => ({ ...s, loading: false })))
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, viewer, refresh])

  const data = state.data
  /* Numbers for another question stay on screen, softened, until this one's land. */
  const soft = !!data && state.question !== question
  const compared = compare !== null && data?.compared !== false
  const money = (n: number) => shopMoneyIn(n, data?.currency || currency || "USD", { grouping: true })
  const b = data?.breakdown
  const p = data?.previous
  const rows: Array<{ key: keyof SalesBreakdown; label: string; sign?: "-"; strong?: boolean; invert?: boolean }> = [
    { key: "gross", label: tt("Gross sales") },
    { key: "discounts", label: tt("Discounts"), sign: "-", invert: true },
    { key: "returns", label: tt("Returns"), sign: "-", invert: true },
    { key: "net", label: tt("Net sales"), strong: true },
    ...(showShipping ? [{ key: "shipping" as const, label: tt("Shipping charges") }] : []),
    { key: "taxes", label: tt("Taxes") },
    { key: "tips", label: tt("Tips") },
    { key: "total", label: tt("Total sales"), strong: true },
  ]
  const channels = (data?.channels ?? []).slice(0, CHANNEL_ROWS)
  const channelMax = Math.max(1, ...channels.map((c) => c.total))
  const hours = data?.fulfillment.hours ?? null
  const before = data?.fulfillmentBefore?.hours ?? null
  const waitText = hours === null ? "–" : hours < 1 ? tt("{n} min", { n: Math.max(1, Math.round(hours * 60)) }) : hours < 48 ? tt("{n} h", { n: Math.round(hours * 10) / 10 }) : tt("{n} days", { n: Math.round((hours / 24) * 10) / 10 })
  const grain = data?.grain ?? "day"
  const zone = data?.timeZone ?? timeZone

  const figures = [
    { key: "aov", title: tt("Average order value"), value: b ? money(b.aov) : null, delta: b && p ? <Delta compared={compared} now={b.aov} before={p.aov} /> : null, help: tt("Gross sales less discounts, divided by orders.") },
    { key: "returning", title: tt("Returning customer rate"), value: b ? `${Math.round(b.returningRate * 100)}%` : null, delta: b && p ? <Delta compared={compared} now={b.returningRate} before={p.returningRate} /> : null, help: tt("Customers with two or more orders in this period, out of every customer who ordered.") },
    ...(showFulfillment
      ? [{
          key: "fulfil",
          title: tt("Order fulfillment time"),
          value: data ? waitText : null,
          delta: data ? (
            <span className="inline-flex items-center gap-2">
              {hours !== null && before !== null ? <Delta compared={compared} now={hours} before={before} invert /> : null}
              <span className="text-[12px] text-[#9ca3af]">{tt("{count, plural, one {# shipped} other {# shipped}}", { count: data.fulfillment.shipped })}</span>
            </span>
          ) : null,
          help: tt("How long a physical order took from payment to shipped, on average."),
        }]
      : []),
  ]

  return (
    <div aria-busy={state.loading} className={cn("grid grid-cols-1 gap-3 transition-opacity duration-300 lg:grid-cols-2", soft ? "opacity-60" : "opacity-100")} data-commerce-reports="">
      <Card card="sales-breakdown" title={tt("Total sales breakdown")} help={tt("Gross sales at list price, less discounts and returns, is net sales. Add shipping, taxes and tips for total sales, what buyers paid less refunds.")}>
        <div className="divide-y divide-[#f1f2f4]">
          {rows.map((r) => (
            <div key={r.key} className={cn("flex h-[37px] items-center justify-between gap-3 text-[13.5px]", r.strong ? "font-semibold text-[#1a1a2e]" : "text-[#374151]")}>
              <span className="min-w-0 truncate">{r.label}</span>
              <span className="flex shrink-0 items-center gap-3">
                <span className="w-[52px] text-right">{b && p ? <Delta compared={compared} now={b[r.key] as number} before={p[r.key] as number} invert={r.invert} /> : null}</span>
                <span className="min-w-[88px] text-right tabular-nums">{b ? (r.sign && (b[r.key] as number) > 0 ? `−${money(b[r.key] as number)}` : money(b[r.key] as number)) : <Pending />}</span>
              </span>
            </div>
          ))}
        </div>
      </Card>

      <Card
        card="sales-over-time"
        title={metric === "aov" ? tt("Average order value over time") : metric === "orders" ? tt("Orders over time") : tt("Total sales over time")}
        help={tt("This period against the one before it, at the same points.")}
        tabs={
          <ReportTabs
            label={tt("Sales over time")}
            value={metric}
            onChange={setMetric}
            options={[
              { value: "total", label: tt("Total sales") },
              { value: "aov", label: tt("Average order value") },
              { value: "orders", label: tt("Orders") },
            ]}
          />
        }
      >
        <div className="h-[208px]">
          {data ? (
            <LineChart
              series={data.series}
              previous={compared ? data.previousSeries : []}
              format={metric === "orders" ? (n) => String(n) : money}
              value={(pt) => (metric === "aov" ? pt.aov : metric === "orders" ? pt.orders : pt.total)}
              grain={grain}
              timeZone={zone}
            />
          ) : (
            <div aria-hidden className="flex h-full flex-col">
              <div className="mb-2 flex h-5 items-center justify-between">
                <Pending w="w-14" />
                <Pending w="w-12" />
              </div>
              <div className="relative h-[160px]">
                <span className="absolute inset-x-0 bottom-2 h-px bg-[#eceef1]" />
              </div>
            </div>
          )}
        </div>
        <Legend compared={compare !== null} />
      </Card>

      <Card card="sales-by-channel" title={tt("Total sales by channel")} help={tt("Where each order was placed: your online store, Storelib (Explore, product and creator pages, communities), your OnePage or a checkout link.")}>
        <div className="h-[200px]">
          {!data ? (
            <div aria-hidden className="space-y-3">
              {[0.9, 0.55, 0.3].map((w, i) => (
                <div key={i}>
                  <div className="flex h-5 items-center justify-between">
                    <Pending w="w-24" />
                    <Pending w="w-16" />
                  </div>
                  <ShimmerBlock className="mt-1.5 h-1.5 rounded-full" style={{ width: `${w * 100}%` }} />
                </div>
              ))}
            </div>
          ) : channels.length === 0 ? (
            <p className="flex h-full items-center justify-center text-center text-[13px] text-[#6b7280]">{tt("No sales in this period.")}</p>
          ) : (
            <div className="space-y-3">
              {channels.map((c) => (
                <div key={c.channel} data-channel={c.channel}>
                  <div className="flex h-5 items-center justify-between gap-3 text-[13.5px]">
                    <span className="truncate text-[#303036]">{tt(c.label)}</span>
                    <span className="shrink-0 tabular-nums text-[#1a1a2e]">
                      {money(c.total)} <span className="text-[12px] text-[#9ca3af]">· {tt("{count, plural, one {# order} other {# orders}}", { count: c.orders })}</span>
                    </span>
                  </div>
                  <ReportFill share={c.total / channelMax} color={ACCENT} track="#f1f2f4" className="mt-1.5 h-1.5 rounded-full" />
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>

      {/*
        The figures, one under the other beside the channels: the name on the left, never cut, and the number on
        the right with its change under it. Three tiles side by side squeezed the names ("Returning customer rate")
        and the numbers ("22 min") on a laptop, so they stack at every width.
      */}
      <div className="grid grid-cols-1 content-start gap-3">
        {figures.map((f) => (
          <section key={f.key} data-card={f.key} className="flex min-h-[76px] min-w-0 items-center justify-between gap-4 rounded-2xl border border-[#e5e7eb]/60 bg-white px-5 py-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <HelpLabel as="h3" label={f.title} description={f.help} className="min-w-0 text-[13.5px] font-medium leading-5 text-[#4b5563]" />
            <div className="flex shrink-0 flex-col items-end gap-0.5">
              <span className="flex h-7 items-center whitespace-nowrap text-[22px] font-semibold leading-7 tabular-nums tracking-tight text-[#1a1a2e]">{f.value ?? <Pending w="w-20" />}</span>
              <span className="h-[18px] whitespace-nowrap">{f.delta}</span>
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}
