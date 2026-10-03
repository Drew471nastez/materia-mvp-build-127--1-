"use client"

/**
 * Physical sales on Analytics, under the reports, while physical commerce is
 * on: orders and units, what shipping brought in, what is waiting to ship
 * and for how long on average, returns, and stock that needs attention.
 * Its own range (7, 30 or 90 days) so it never slows the page's chart.
 */

import * as React from "react"
import Link from "next/link"
import { cn } from "@/lib/utils"
import { usePhysicalCommerceEnabled } from "@/components/platform/platform-settings-context"
import { CARD, Pill, api, money } from "./ui"

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

export function PhysicalAnalyticsCard() {
  const enabled = usePhysicalCommerceEnabled()
  const [days, setDays] = React.useState(30)
  const [data, setData] = React.useState<Data | null>(null)
  React.useEffect(() => {
    if (!enabled) return
    let gone = false
    setData(null)
    void api<{ analytics: Data }>(`/api/physical/analytics?days=${days}`).then((r) => {
      if (!gone && r.ok) setData(r.data.analytics)
    })
    return () => {
      gone = true
    }
  }, [enabled, days])
  if (!enabled) return null

  const stat = (label: string, value: React.ReactNode, hint?: React.ReactNode) => (
    <div className="min-w-0 rounded-xl bg-[#f8f9fa] px-3.5 py-3">
      <p className="truncate text-[12.5px] text-[#6b7280]">{label}</p>
      <p className="mt-0.5 truncate text-[20px] font-semibold tabular-nums text-[#1a1a2e]">{value}</p>
      {hint ? <p className="truncate text-[12px] text-[#9ca3af]">{hint}</p> : null}
    </div>
  )

  return (
    <section className={cn(CARD, "mt-4 px-4 py-4 sm:px-6 sm:py-5")} data-physical-analytics="">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[16px] font-semibold text-[#1a1a2e] sm:text-[17px]">Physical sales</h2>
        <div className="flex gap-1 rounded-lg bg-[#f1f2f4] p-1">
          {[7, 30, 90].map((d) => (
            <button key={d} type="button" onClick={() => setDays(d)} className={cn("h-7 rounded-md px-2.5 text-[12.5px] font-medium", days === d ? "bg-white text-[#1a1a2e] shadow-[0_1px_2px_rgba(0,0,0,0.06)]" : "text-[#6b7280]")}>
              {d} days
            </button>
          ))}
        </div>
      </div>
      {!data ? (
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-[74px] animate-pulse rounded-xl bg-[#f4f5f7]" />
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            {stat("Orders", data.orders, `${data.units} ${data.units === 1 ? "unit" : "units"} sold`)}
            {stat("Sales", money(data.revenueCents), data.shippingCents ? `${money(data.shippingCents)} shipping` : undefined)}
            {stat("To ship", data.unfulfilled + data.partiallyFulfilled, data.averageHoursToShip !== null ? `Ships in ${data.averageHoursToShip < 48 ? `${Math.round(data.averageHoursToShip)} h` : `${Math.round(data.averageHoursToShip / 24)} days`} on average` : undefined)}
            {stat("Returns", data.returns, data.returnRate !== null ? `${data.returnRate}% of orders` : undefined)}
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-[14px] font-semibold text-[#1a1a2e]">Top products</h3>
              </div>
              {data.topProducts.length === 0 ? (
                <p className="text-[13px] text-[#6b7280]">No physical sales in this range.</p>
              ) : (
                <ul className="divide-y divide-[#f1f2f4]">
                  {data.topProducts.map((p) => (
                    <li key={p.title} className="flex items-center justify-between gap-3 py-2 text-[13.5px]">
                      <span className="min-w-0 truncate text-[#1a1a2e]">{p.title}</span>
                      <span className="shrink-0 tabular-nums text-[#6b7280]">
                        {p.units} · {money(p.revenueCents)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-[14px] font-semibold text-[#1a1a2e]">Stock</h3>
                <Link href="/app/inventory" className="text-[13px] font-medium text-[#1a1a2e] underline underline-offset-2">
                  Inventory
                </Link>
              </div>
              <p className="mb-2 text-[13px] text-[#6b7280]">
                {data.stockValueCents ? `${money(data.stockValueCents)} on hand at cost. ` : ""}
                {data.outOfStock ? `${data.outOfStock} sold out.` : "Nothing sold out."}
              </p>
              <ul className="divide-y divide-[#f1f2f4]">
                {data.lowStock.map((l) => (
                  <li key={`${l.title}-${l.variantName}`} className="flex items-center justify-between gap-3 py-2 text-[13.5px]">
                    <span className="min-w-0 truncate text-[#1a1a2e]">
                      {l.title}
                      {l.variantName !== "Default" ? <span className="text-[#6b7280]">, {l.variantName}</span> : null}
                    </span>
                    <Pill tone="amber">{l.available} left</Pill>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
