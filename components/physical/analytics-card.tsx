"use client"

/**
 * Physical sales on Analytics, right under the chart while physical commerce
 * is on: what shipped orders brought in and how the shop gets there, from a
 * product page to a paid checkout, then where buyers are, what sells and the
 * stock that needs attention.
 *
 * FOR THE PAGE'S OWN PERIOD (`span`), the one the chart above shows, so the
 * two never disagree. Drawn like the report cards under it: the same frame,
 * tabs and bar lists (app/app/analytics/analytics-reports), figures in one
 * row of plain numbers rather than boxes of their own. While a new period
 * loads, the figures it has stay in place, softened.
 */

import * as React from "react"
import Link from "next/link"
import { cn } from "@/lib/utils"
import { usePhysicalCommerceEnabled } from "@/components/platform/platform-settings-context"
import { ReportList, ReportTabs, type ReportListRow } from "@/app/app/analytics/analytics-reports"
import { countryName } from "@/lib/analytics/reports"
import { api, useShopMoney } from "./ui"
import { tt } from "@/lib/i18n/text"
import { appLocale } from "@/lib/i18n/format"

interface Data {
  orders: number
  netCents?: number
  averageOrderCents?: number | null
  refundedCents?: number
  refunds?: number
  startedCheckouts?: number
  checkoutConversion?: number | null
  productViews?: number
  addsToCart?: number
  addToCartRate?: number | null
  averageHoursToDeliver?: number | null
  countries?: { code: string; orders: number; revenueCents: number }[]
  units: number
  revenueCents: number
  shippingCents: number
  taxCents: number
  unfulfilled: number
  partiallyFulfilled: number
  averageHoursToShip: number | null
  returns: number
  returnRate: number | null
  lowStock: { title: string; variantName: string; available: number }[]
  outOfStock: number
  stockValueCents: number
  topProducts: { id?: string; title: string; units: number; revenueCents: number; orders?: number }[]
}

const EMPTY: Data = { orders: 0, units: 0, revenueCents: 0, shippingCents: 0, taxCents: 0, unfulfilled: 0, partiallyFulfilled: 0, averageHoursToShip: null, returns: 0, returnRate: null, lowStock: [], outOfStock: 0, stockValueCents: 0, topProducts: [] }

type Tab = "products" | "countries" | "stock"

const count = (n: number) => Math.round(n).toLocaleString(appLocale())
const pct = (f: number | null | undefined) => (f === null || f === undefined ? "–" : `${(f * 100).toFixed(f > 0 && f < 0.1 ? 1 : 0).replace(/\.0+$/, "")}%`)
const hours = (h: number | null | undefined) => (h === null || h === undefined ? "–" : h < 48 ? `${Math.round(h)} h` : tt("{value} days", { value: Math.round(h / 24) }))

export function PhysicalAnalyticsCard({ span }: { span?: { start: number; end: number } | null }) {
  const money = useShopMoney()
  const enabled = usePhysicalCommerceEnabled()
  const [data, setData] = React.useState<Data | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [tab, setTab] = React.useState<Tab>("products")
  const query = span ? `from=${Math.floor(span.start)}&to=${Math.ceil(span.end)}` : "days=30"
  React.useEffect(() => {
    if (!enabled) return
    let gone = false
    setLoading(true)
    void api<{ analytics: Data }>(`/api/physical/analytics?${query}`).then((r) => {
      if (gone) return
      if (r.ok) setData(r.data.analytics)
      setLoading(false)
    })
    return () => {
      gone = true
    }
  }, [enabled, query])
  if (!enabled) return null
  const d = data ?? EMPTY
  const net = d.netCents ?? d.revenueCents

  /* The figures, in the order a shop reads its day: money, then the way to it, then what is left to do. */
  const figures: Array<{ key: string; label: string; value: string; note?: string }> = [
    { key: "sales", label: tt("Sales"), value: money(net), note: d.refundedCents ? tt("{amount} refunded", { amount: money(d.refundedCents) }) : tt("Less refunds") },
    { key: "orders", label: tt("Orders"), value: count(d.orders), note: tt("{units, plural, one {# unit} other {# units}}", { units: d.units }) },
    { key: "aov", label: tt("Average order"), value: d.averageOrderCents == null ? "–" : money(d.averageOrderCents), note: d.shippingCents ? tt("{amount} shipping", { amount: money(d.shippingCents) }) : " " },
    { key: "cart", label: tt("Add to cart rate"), value: pct(d.addToCartRate), note: tt("{adds} of {views} product views", { adds: count(d.addsToCart ?? 0), views: count(d.productViews ?? 0) }) },
    { key: "checkout", label: tt("Checkout conversion"), value: pct(d.checkoutConversion), note: tt("{paid} of {started} checkouts paid", { paid: count(d.orders), started: count(d.startedCheckouts ?? 0) }) },
    { key: "ship", label: tt("To ship"), value: count(d.unfulfilled + d.partiallyFulfilled), note: d.averageHoursToShip !== null ? tt("Ships in {value} on average", { value: hours(d.averageHoursToShip) }) : " " },
    { key: "deliver", label: tt("Delivered in"), value: hours(d.averageHoursToDeliver), note: tt("From payment, on average") },
    { key: "returns", label: tt("Returns"), value: count(d.returns), note: d.returnRate !== null ? tt("{returnRate}% of orders", { returnRate: d.returnRate }) : " " },
  ]

  const productRows: ReportListRow[] = d.topProducts.map((p, i) => ({ key: p.id ?? `${i}:${p.title}`, label: p.title, value: p.revenueCents, note: tt("{units, plural, one {# unit} other {# units}}", { units: p.units }) }))
  const countryRows: ReportListRow[] = (d.countries ?? []).map((c) => ({ key: c.code, code: c.code, label: countryName(c.code), value: c.orders, note: money(c.revenueCents) }))

  return (
    <section data-card="physical" data-physical-analytics="" className="flex min-w-0 flex-col rounded-2xl border border-[#e5e7eb]/60 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
      <header className="flex min-h-[52px] items-center justify-between gap-3 px-5 pt-4">
        <h3 className="text-[14px] font-semibold text-[#1a1a2e]">{tt("Physical sales")}</h3>
        {tab === "stock" ? (
          <Link href="/app/inventory" className="text-[13px] font-medium text-[#1a1a2e] underline underline-offset-2">
            {tt("Inventory")}
          </Link>
        ) : null}
      </header>
      <div className={cn("px-5 pb-5 pt-2 transition-[opacity,filter] duration-200", loading && data ? "opacity-60 blur-[1px]" : "", !data ? "opacity-60" : "")} aria-busy={loading}>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4" data-physical-figures="">
          {figures.map((f) => (
            <div key={f.key} data-figure={f.key} className="min-w-0">
              <dt className="truncate text-[12px] text-[#6b7280]">{f.label}</dt>
              <dd className="truncate text-[20px] font-semibold tabular-nums leading-7 text-[#1a1a2e]">{f.value}</dd>
              <dd className="truncate text-[12px] tabular-nums text-[#9ca3af]">{f.note ?? " "}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-5 border-t border-[#eef0f2] pt-4">
          <div className="orders-strip -mx-1 overflow-x-auto px-1">
            <ReportTabs value={tab} onChange={setTab} options={[{ value: "products", label: tt("Top products") }, { value: "countries", label: tt("Countries") }, { value: "stock", label: tt("Stock") }]} />
          </div>
          <div className="mt-2 flex min-h-[120px] flex-col">
            {tab === "products" ? (
              <ReportList key="products" title={tt("Top products")} rows={productRows} format={money} empty={data ? tt("No physical sales in this period.") : " "} />
            ) : tab === "countries" ? (
              <ReportList key="countries" title={tt("Countries")} rows={countryRows} format={count} lead={{ flag: true }} empty={data ? tt("No shipped orders in this period.") : " "} />
            ) : (
              <>
                <p className="mb-1 text-[13px] text-[#6b7280]">
                  {d.stockValueCents ? tt("{amount} on hand at cost. ", { amount: money(d.stockValueCents) }) : ""}
                  {d.outOfStock ? tt("{outOfStock} sold out.", { outOfStock: d.outOfStock }) : tt("Nothing sold out.")}
                </p>
                <ReportList
                  key="stock"
                  title={tt("Stock")}
                  rows={d.lowStock.map((l, i) => ({ key: `${i}:${l.title}:${l.variantName}`, label: l.variantName !== "Default" ? `${l.title}, ${l.variantName}` : l.title, value: l.available, note: tt("{available} left", { available: l.available }) }))}
                  format={count}
                  empty={tt("No product is running low.")}
                />
              </>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
