"use client"

/**
 * A discount code's physical options in the coupon editor, while physical
 * commerce is on: free shipping, physical products only, once per customer,
 * and the collections it is for. Saved after the code is (the editor calls
 * `handle.save(id)`), through /api/physical/coupons/[id].
 */

import * as React from "react"
import { cn } from "@/lib/utils"
import { usePhysicalCommerceEnabled } from "@/components/platform/platform-settings-context"
import { Check } from "lucide-react"
import { NumberInput, Toggle, api } from "./ui"

export interface CouponOptionsHandle {
  freeShipping: () => boolean
  dirty: () => boolean
  save: (couponId: string) => Promise<string | null>
}

export function PhysicalCouponOptions({
  initial,
  handle,
  onChange,
  cardClass,
  titleClass,
}: {
  initial: { free_shipping?: boolean; physical_only?: boolean; per_customer_limit?: number | null; collection_ids?: string[] | null } | null
  handle: React.MutableRefObject<CouponOptionsHandle | null>
  onChange: () => void
  cardClass: string
  titleClass: string
}) {
  const enabled = usePhysicalCommerceEnabled()
  const start = React.useRef({
    freeShipping: initial?.free_shipping === true,
    physicalOnly: initial?.physical_only === true,
    perCustomer: initial?.per_customer_limit ? String(initial.per_customer_limit) : "",
    collections: initial?.collection_ids ?? [],
  })
  const [freeShipping, setFreeShipping] = React.useState(start.current.freeShipping)
  const [physicalOnly, setPhysicalOnly] = React.useState(start.current.physicalOnly)
  const [limitOn, setLimitOn] = React.useState(!!start.current.perCustomer)
  const [perCustomer, setPerCustomer] = React.useState(start.current.perCustomer || "1")
  const [collections, setCollections] = React.useState<string[]>(start.current.collections)
  const [all, setAll] = React.useState<{ id: string; title: string }[] | null>(null)

  React.useEffect(() => {
    if (!enabled) return
    void api<{ collections: { id: string; title: string }[] }>("/api/physical/collections").then((r) => setAll(r.ok ? r.data.collections : []))
  }, [enabled])

  const now = { freeShipping, physicalOnly, perCustomer: limitOn ? perCustomer : "", collections }
  handle.current = enabled
    ? {
        freeShipping: () => freeShipping,
        dirty: () => JSON.stringify(now) !== JSON.stringify(start.current),
        save: async (id) => {
          if (JSON.stringify(now) === JSON.stringify(start.current) && initial) return null
          const r = await api(`/api/physical/coupons/${id}`, { method: "PUT", body: { freeShipping, physicalOnly, perCustomerLimit: limitOn ? Number(perCustomer) || 1 : null, collectionIds: collections } })
          if (!r.ok) return r.error
          start.current = now
          return null
        },
      }
    : null
  if (!enabled) return null
  const touch = <T,>(set: (v: T) => void) => (v: T) => {
    set(v)
    onChange()
  }

  return (
    <section className={cardClass} aria-labelledby="coupon-physical-title">
      <h2 id="coupon-physical-title" className={titleClass}>
        Shipping and physical products
      </h2>
      <div className="mt-3 space-y-4">
        <Toggle label="Free shipping" description="Delivery costs nothing with this code. The discount above can be 0." checked={freeShipping} onChange={touch(setFreeShipping)} />
        <Toggle label="Physical products only" description="It takes nothing off downloads or courses in the same cart." checked={physicalOnly} onChange={touch(setPhysicalOnly)} />
        <div className="space-y-2">
          <Toggle label="Limit uses per customer" description="Counted by the buyer's email." checked={limitOn} onChange={touch(setLimitOn)} />
          {limitOn ? <NumberInput value={perCustomer} onChange={touch(setPerCustomer)} className="max-w-[140px]" aria-label="Uses per customer" /> : null}
        </div>
        {all && all.length ? (
          <div className="space-y-2">
            <p className="text-[14px] font-medium text-[#1a1a2e]">Only for collections</p>
            <div className="flex flex-wrap gap-1.5">
              {all.map((c) => {
                const on = collections.includes(c.id)
                return (
                  <button
                    key={c.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => touch(setCollections)(on ? collections.filter((x) => x !== c.id) : [...collections, c.id])}
                    className={cn("inline-flex h-8 items-center gap-1 rounded-lg border px-2.5 text-[13px] font-medium", on ? "border-[#1a1a2e] bg-[#1a1a2e] text-white" : "border-[#e5e7eb] text-[#374151] hover:bg-[#f7f7f8]")}
                  >
                    {on ? <Check className="h-3.5 w-3.5" /> : null}
                    {c.title}
                  </button>
                )
              })}
            </div>
            <p className="text-[12.5px] text-[#6b7280]">{collections.length ? "It applies only to products in these collections." : "None picked: the products above decide."}</p>
          </div>
        ) : null}
      </div>
    </section>
  )
}
