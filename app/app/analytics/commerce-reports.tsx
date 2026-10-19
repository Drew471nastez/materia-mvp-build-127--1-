"use client"

/**
 * ===========================================================================
 *  SALES REPORTS: THE STORE'S MONEY, THE WAY SHOPIFY'S ANALYTICS SHOWS IT
 * ===========================================================================
 * Under the main chart, read from app/api/analytics/commerce for the page's
 * own period (lib/analytics/commerce adds it up):
 *
 *   Total sales breakdown     gross, discounts, returns, net, shipping,
 *                             taxes, tips, total, each against the period
 *                             before
 *   Total sales over time     this period's line over the last one's
 *   Average order value       over time, the same way
 *   Total sales by channel    online store, Storelib, OnePage, links
 *   Customers                 the returning customer rate
 *   Fulfillment               how long a physical order took to ship
 *
 * Sessions, conversion, devices, products and sources stay where they
 * were: the main chart's tabs and the reports below this.
 */
import * as React from "react"

import { cn } from "@/lib/utils"
import { HelpLabel } from "@/components/app/help-label"
import { shopMoneyIn } from "@/lib/store/shop-money"
import { tt } from "@/lib/i18n/text"
import type { SalesBreakdown } from "@/lib/analytics/commerce"

type Point = { t: number; total: number; orders: number; aov: number }
interface Answer {
  currency: string
  grain: "day" | "week" | "month"
  breakdown: SalesBreakdown
  previous: SalesBreakdown
  series: Point[]
  previousSeries: Point[]
  channels: Array<{ channel: string; label: string; total: number; orders: number }>
  fulfillment: { hours: number | null; shipped: number }
}

function Card({ title, help, children, className, card }: { title: string; help: string; children: React.ReactNode; className?: string; card: string }) {
  return (
    <section data-card={card} className={cn("flex min-w-0 flex-col rounded-2xl border border-[#e5e7eb]/60 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]", className)}>
      <header className="flex min-h-[52px] items-center px-5 pt-4">
        <HelpLabel as="h3" label={title} description={help} className="max-w-full truncate text-[14px] font-semibold text-[#1a1a2e]" />
      </header>
      <div className="flex min-h-0 flex-1 flex-col px-5 pb-5 pt-2">{children}</div>
    </section>
  )
}

function Delta({ now, before, invert = false }: { now: number; before: number; invert?: boolean }) {
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

/** A line of this period over a dashed line of the last, with a soft fill: a chart that reads at a glance. */
function LineChart({ series, previous, format, label }: { series: Point[]; previous: Point[]; format: (n: number) => string; label: (p: Point) => number }) {
  const [hover, setHover] = React.useState<number | null>(null)
  const W = 600
  const H = 160
  const values = series.map(label)
  const prevValues = previous.map(label)
  const max = Math.max(1, ...values, ...prevValues)
  const x = (i: number, n: number) => (n <= 1 ? W / 2 : (i / (n - 1)) * W)
  const y = (v: number) => H - 8 - (v / max) * (H - 24)
  const path = (vals: number[]) => vals.map((v, i) => `${i ? "L" : "M"}${x(i, vals.length).toFixed(1)} ${y(v).toFixed(1)}`).join(" ")
  const area = values.length ? `${path(values)} L${x(values.length - 1, values.length).toFixed(1)} ${H} L0 ${H} Z` : ""
  const id = React.useId().replace(/:/g, "")
  const at = hover ?? values.length - 1
  const day = (t: number) => new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" })
  return (
    <div className="relative">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <span className="text-[13px] text-[#6b7280]">{series[at] ? day(series[at].t) : ""}</span>
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
            <stop offset="0" stopColor="#1a1a2e" stopOpacity="0.1" />
            <stop offset="1" stopColor="#1a1a2e" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map((f) => (
          <line key={f} x1="0" x2={W} y1={H - 8 - f * (H - 24)} y2={H - 8 - f * (H - 24)} stroke="#f1f2f4" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        ))}
        {prevValues.length ? <path d={path(prevValues)} fill="none" stroke="#c7cbd1" strokeWidth="1.5" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" /> : null}
        {area ? <path d={area} fill={`url(#${id}f)`} /> : null}
        {values.length ? <path d={path(values)} fill="none" stroke="#1a1a2e" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" /> : null}
        {values.length ? <line x1={x(at, values.length)} x2={x(at, values.length)} y1="0" y2={H} stroke="#e5e7eb" strokeWidth="1" vectorEffect="non-scaling-stroke" /> : null}
      </svg>
      <div className="mt-2 flex items-center gap-4 text-[12px] text-[#6b7280]">
        <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-3 rounded bg-[#1a1a2e]" />{tt("This period")}</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-0 w-3 border-t border-dashed border-[#9ca3af]" />{tt("Previous period")}</span>
      </div>
    </div>
  )
}

export function CommerceReports({ span }: { span: { start: number; end: number } }) {
  const [data, setData] = React.useState<Answer | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [metric, setMetric] = React.useState<"total" | "aov" | "orders">("total")

  React.useEffect(() => {
    let live = true
    setLoading(true)
    fetch(`/api/analytics/commerce?from=${Math.floor(span.start)}&to=${Math.ceil(span.end)}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: Answer | null) => {
        if (!live) return
        if (d) setData(d)
        setLoading(false)
      })
      .catch(() => live && setLoading(false))
    return () => {
      live = false
    }
  }, [span.start, span.end])

  if (!data) {
    return loading ? <div aria-hidden className="h-[320px] rounded-2xl border border-[#e5e7eb]/60 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]" /> : null
  }
  const money = (n: number) => shopMoneyIn(n, data.currency, { grouping: true })
  const b = data.breakdown
  const p = data.previous
  const rows: Array<{ key: keyof SalesBreakdown; label: string; sign?: "-"; strong?: boolean; invert?: boolean }> = [
    { key: "gross", label: tt("Gross sales") },
    { key: "discounts", label: tt("Discounts"), sign: "-", invert: true },
    { key: "returns", label: tt("Returns"), sign: "-", invert: true },
    { key: "net", label: tt("Net sales"), strong: true },
    { key: "shipping", label: tt("Shipping charges") },
    { key: "taxes", label: tt("Taxes") },
    { key: "tips", label: tt("Tips") },
    { key: "total", label: tt("Total sales"), strong: true },
  ]
  const channelMax = Math.max(1, ...data.channels.map((c) => c.total))
  const hours = data.fulfillment.hours
  const waitText = hours === null ? "–" : hours < 1 ? tt("{n} min", { n: Math.max(1, Math.round(hours * 60)) }) : hours < 48 ? tt("{n} h", { n: Math.round(hours * 10) / 10 }) : tt("{n} days", { n: Math.round((hours / 24) * 10) / 10 })

  return (
    <div className={cn("grid grid-cols-1 gap-3 transition-opacity duration-300 lg:grid-cols-2", loading ? "opacity-60" : "opacity-100")} data-commerce-reports="">
      <Card card="sales-breakdown" title={tt("Total sales breakdown")} help={tt("Gross sales at list price, less discounts and returns, is net sales. Add shipping, taxes and tips for total sales, what buyers paid less refunds.")}>
        <div className="divide-y divide-[#f1f2f4]">
          {rows.map((r) => (
            <div key={r.key} className={cn("flex items-center justify-between gap-3 py-2 text-[13.5px]", r.strong ? "font-semibold text-[#1a1a2e]" : "text-[#374151]")}>
              <span className="min-w-0 truncate">{r.label}</span>
              <span className="flex shrink-0 items-center gap-3">
                <span className="w-[52px] text-right">
                  <Delta now={b[r.key] as number} before={p[r.key] as number} invert={r.invert} />
                </span>
                <span className="min-w-[88px] text-right tabular-nums">{r.sign && (b[r.key] as number) > 0 ? `−${money(b[r.key] as number)}` : money(b[r.key] as number)}</span>
              </span>
            </div>
          ))}
        </div>
      </Card>

      <Card card="sales-over-time" title={metric === "aov" ? tt("Average order value over time") : metric === "orders" ? tt("Orders over time") : tt("Total sales over time")} help={tt("This period against the one before it, at the same points.")}>
        <div className="mb-3 inline-flex w-fit items-center rounded-lg bg-[#f1f2f4] p-0.5" role="tablist">
          {(["total", "aov", "orders"] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={metric === m}
              onClick={() => setMetric(m)}
              className={cn(
                "h-8 rounded-md px-3 text-[12px] font-medium transition-[background-color,color,box-shadow] duration-150 sm:h-7 sm:px-2.5",
                metric === m ? "bg-white text-[#1a1a2e] shadow-[0_1px_2px_rgba(17,24,39,0.12)]" : "text-[#6b7280] hover:text-[#1a1a2e]",
              )}
            >
              {m === "total" ? tt("Total sales") : m === "aov" ? tt("Average order value") : tt("Orders")}
            </button>
          ))}
        </div>
        <LineChart
          series={data.series}
          previous={data.previousSeries}
          format={metric === "orders" ? (n) => String(n) : money}
          label={(pt) => (metric === "aov" ? pt.aov : metric === "orders" ? pt.orders : pt.total)}
        />
      </Card>

      <Card card="sales-by-channel" title={tt("Total sales by channel")} help={tt("Where each order was placed: your online store, Storelib (Explore, product and creator pages, communities), your OnePage or a checkout link.")}>
        {data.channels.length === 0 ? (
          <p className="py-6 text-center text-[13px] text-[#6b7280]">{tt("No sales in this period.")}</p>
        ) : (
          <div className="space-y-3">
            {data.channels.map((c) => (
              <div key={c.channel}>
                <div className="flex items-center justify-between gap-3 text-[13.5px]">
                  <span className="truncate text-[#303036]">{tt(c.label)}</span>
                  <span className="shrink-0 tabular-nums text-[#1a1a2e]">
                    {money(c.total)} <span className="text-[12px] text-[#9ca3af]">· {tt("{count, plural, one {# order} other {# orders}}", { count: c.orders })}</span>
                  </span>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[#f1f2f4]">
                  <div className="h-full rounded-full bg-[#1a1a2e]/80 transition-[width] duration-500 ease-out" style={{ width: `${Math.max(2, (c.total / channelMax) * 100)}%` }} />
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
        {[
          { key: "aov", title: tt("Average order value"), value: money(b.aov), delta: <Delta now={b.aov} before={p.aov} />, help: tt("Gross sales less discounts, divided by orders.") },
          { key: "returning", title: tt("Returning customer rate"), value: `${Math.round(b.returningRate * 100)}%`, delta: <Delta now={b.returningRate} before={p.returningRate} />, help: tt("Customers with two or more orders in this period, out of every customer who ordered.") },
          { key: "fulfil", title: tt("Order fulfillment time"), value: waitText, delta: <span className="text-[12px] text-[#9ca3af]">{tt("{count, plural, one {# shipped} other {# shipped}}", { count: data.fulfillment.shipped })}</span>, help: tt("How long a physical order took from payment to shipped, on average.") },
        ].map((f) => (
          <section key={f.key} data-card={f.key} className="flex min-w-0 flex-col justify-between rounded-2xl border border-[#e5e7eb]/60 bg-white px-5 py-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <HelpLabel as="h3" label={f.title} description={f.help} className="truncate text-[13px] font-medium text-[#4b5563]" />
            <div className="mt-2 flex items-baseline justify-between gap-2">
              <span className="truncate text-[22px] font-semibold tabular-nums tracking-tight text-[#1a1a2e]">{f.value}</span>
              {f.delta}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}
