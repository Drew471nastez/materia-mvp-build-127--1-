"use client"

/**
 * Physical sales on Analytics, under the reports, while physical commerce is
 * on: orders and units, what shipping brought in, what is waiting to ship
 * and for how long on average, returns, and stock that needs attention.
 *
 * FOR THE PAGE'S OWN PERIOD (`span`), the one the chart above shows, so the
 * two never disagree; it had a 7, 30 and 90 day switch of its own. Drawn
 * like every other card on the page: the same frame, the same tabs (Top
 * products, Stock), and while a new period loads the figures it has stay in
 * place, softened, never grey blocks.
 */

import * as React from "react"
import Link from "next/link"
import { cn } from "@/lib/utils"
import { usePhysicalCommerceEnabled } from "@/components/platform/platform-settings-context"
import { Pill, api, useShopMoney } from "./ui"
import { tt } from "@/lib/i18n/text"

interface Data {
  orders: number
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
  topProducts: { title: string; units: number; revenueCents: number }[]
}

const EMPTY: Data = { orders: 0, units: 0, revenueCents: 0, shippingCents: 0, taxCents: 0, unfulfilled: 0, partiallyFulfilled: 0, averageHoursToShip: null, returns: 0, returnRate: null, lowStock: [], outOfStock: 0, stockValueCents: 0, topProducts: [] }

export function PhysicalAnalyticsCard({ span }: { span?: { start: number; end: number } | null }) {
  const money = useShopMoney()
  const enabled = usePhysicalCommerceEnabled()
  const [data, setData] = React.useState<Data | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [tab, setTab] = React.useState<"products" | "stock">("products")
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

  const stat = (label: string, value: React.ReactNode, hint?: React.ReactNode) => (
    <div className="min-w-0 rounded-xl bg-[#f8f9fa] px-3.5 py-3">
      <p className="truncate text-[12.5px] text-[#6b7280]">{label}</p>
      <p className="mt-0.5 truncate text-[20px] font-semibold tabular-nums text-[#1a1a2e]">{value}</p>
      <p className="truncate text-[12px] text-[#9ca3af]">{hint ?? "\u00a0"}</p>
    </div>
  )

  return (
    <section data-card="physical" data-physical-analytics="" className="mt-4 flex min-w-0 flex-col rounded-2xl border border-[#e5e7eb]/60 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
      <header className="flex min-h-[52px] flex-col justify-center gap-0.5 px-5 pt-4">
        <h3 className="text-[14px] font-semibold text-[#1a1a2e]">{tt("Physical sales")}</h3>
        <p className="text-[12.5px] text-[#6b7280]">{tt("Orders you ship or hand over, for the period above.")}</p>
      </header>
      <div className={cn("space-y-4 px-5 pb-5 pt-3 transition-[opacity,filter] duration-200", loading && data ? "opacity-60 blur-[1px]" : "", !data ? "opacity-60" : "")} aria-busy={loading}>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          {stat(tt("Orders"), d.orders, tt("{units, plural, one {# unit} other {# units}} sold", { units: d.units }))}
          {stat(tt("Sales"), money(d.revenueCents), d.shippingCents ? tt("{amount} shipping", { amount: money(d.shippingCents) }) : undefined)}
          {stat(tt("To ship"), d.unfulfilled + d.partiallyFulfilled, d.averageHoursToShip !== null ? tt("Ships in {value} on average", { value: d.averageHoursToShip < 48 ? `${Math.round(d.averageHoursToShip)} h` : tt("{value} days", { value: Math.round(d.averageHoursToShip / 24) }) }) : undefined)}
          {stat(tt("Returns"), d.returns, d.returnRate !== null ? tt("{returnRate}% of orders", { returnRate: d.returnRate }) : undefined)}
        </div>
        <div>
          <div className="mb-2 flex items-center justify-between gap-3">
            <div role="tablist" className="inline-flex shrink-0 items-center rounded-lg bg-[#f1f2f4] p-0.5">
              {(
                [
                  ["products", tt("Top products")],
                  ["stock", tt("Stock")],
                ] as const
              ).map(([v, label]) => (
                <button
                  key={v}
                  type="button"
                  role="tab"
                  aria-selected={tab === v}
                  onClick={() => setTab(v)}
                  className={cn(
                    "h-8 cursor-pointer rounded-md px-3 text-[12px] font-medium transition-[background-color,color,box-shadow] duration-150 sm:h-7 sm:px-2.5",
                    tab === v ? "bg-white text-[#1a1a2e] shadow-[0_1px_2px_rgba(17,24,39,0.12)]" : "text-[#6b7280] hover:text-[#1a1a2e]",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            {tab === "stock" ? (
              <Link href="/app/inventory" className="text-[13px] font-medium text-[#1a1a2e] underline underline-offset-2">
                {tt("Inventory")}
              </Link>
            ) : null}
          </div>
          {tab === "products" ? (
            d.topProducts.length === 0 ? (
              <p className="py-2 text-[13px] text-[#6b7280]">{data ? tt("No physical sales in this period.") : "\u00a0"}</p>
            ) : (
              <ul className="divide-y divide-[#f1f2f4]">
                {d.topProducts.map((p) => (
                  <li key={p.title} className="flex items-center justify-between gap-3 py-2 text-[13.5px]">
                    <span className="min-w-0 truncate text-[#1a1a2e]">{p.title}</span>
                    <span className="shrink-0 tabular-nums text-[#6b7280]">
                      {tt("{units} sold · {amount}", { units: p.units, amount: money(p.revenueCents) })}
                    </span>
                  </li>
                ))}
              </ul>
            )
          ) : (
            <>
              <p className="mb-2 text-[13px] text-[#6b7280]">
                {d.stockValueCents ? tt("{amount} on hand at cost. ", { amount: money(d.stockValueCents) }) : ""}
                {d.outOfStock ? tt("{outOfStock} sold out.", { outOfStock: d.outOfStock }) : tt("Nothing sold out.")}
              </p>
              <ul className="divide-y divide-[#f1f2f4]">
                {d.lowStock.map((l) => (
                  <li key={`${l.title}-${l.variantName}`} className="flex items-center justify-between gap-3 py-2 text-[13.5px]">
                    <span className="min-w-0 truncate text-[#1a1a2e]">
                      {l.title}
                      {l.variantName !== "Default" ? <span className="text-[#6b7280]">, {l.variantName}</span> : null}
                    </span>
                    <Pill tone="amber">{tt("{available} left", { available: l.available })}</Pill>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>
    </section>
  )
}
