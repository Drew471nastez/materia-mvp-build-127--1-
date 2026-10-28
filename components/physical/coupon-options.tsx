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
import { api } from "./ui"
import { SWITCH_GROUP, SwitchRow } from "@/app/app/products/new/editor-controls"
import { tt } from "@/lib/i18n/text"

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
    void api<{ collections: { id: string; title: string }[] }>("/api/collections").then((r) => setAll(r.ok ? r.data.collections : []))
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
    <section className={cardClass} aria-labelledby="coupon-physical-title" data-coupon-physical="">
      <h2 id="coupon-physical-title" className={titleClass}>
        {tt("Shipping and physical products")}
      </h2>
      {/* The same grouped rows and switches as Limits and Active dates above (app/app/products/new/editor-controls), so the page reads as one form. */}
      <div className={SWITCH_GROUP}>
        <SwitchRow title={tt("Free shipping")} hint={tt("Delivery costs nothing with this code. The discount above can be 0.")} checked={freeShipping} onChange={touch(setFreeShipping)} />
        <SwitchRow title={tt("Physical products only")} hint={tt("It takes nothing off downloads or courses in the same cart.")} checked={physicalOnly} onChange={touch(setPhysicalOnly)} />
        <div>
          <SwitchRow title={tt("Limit uses per customer")} hint={tt("Counted by the buyer's email.")} checked={limitOn} onChange={touch(setLimitOn)} />
          {limitOn ? (
            <div className="px-4 pb-3 animate-in fade-in-0 duration-150 motion-reduce:animate-none">
              <input
                type="text"
                inputMode="numeric"
                value={perCustomer}
                onChange={(e) => touch(setPerCustomer)(e.target.value.replace(/[^0-9]/g, "").slice(0, 6))}
                aria-label={tt("Uses per customer")}
                className="h-11 w-full max-w-[160px] rounded-[10px] border border-[#e3e5e8] bg-white px-3.5 text-[16px] tabular-nums text-[#1a1a2e] outline-none transition-[border-color,box-shadow] duration-150 focus:border-[#c9ccd3] focus:shadow-[0_0_0_3px_rgba(17,17,19,0.06)] sm:h-10 sm:rounded-lg sm:text-[14px]"
              />
            </div>
          ) : null}
        </div>
      </div>
      {all && all.length ? (
        <div className="space-y-2" data-coupon-collections="">
          <p className="text-[15px] font-medium text-[#1a1a2e] sm:text-[14px]">{tt("Only for collections")}</p>
          <div className="flex flex-wrap gap-2">
            {all.map((c) => {
              const on = collections.includes(c.id)
              return (
                <button
                  key={c.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => touch(setCollections)(on ? collections.filter((x) => x !== c.id) : [...collections, c.id])}
                  className={cn(
                    "inline-flex h-9 max-w-full cursor-pointer items-center gap-1 truncate rounded-full border px-3.5 text-[13.5px] font-medium transition-colors [-webkit-tap-highlight-color:transparent] sm:h-8 sm:text-[13px]",
                    on ? "border-[#1a1a2e] bg-[#1a1a2e] text-white" : "border-[#d9dbe0] bg-white text-[#1a1a2e] shadow-[inset_0_-1px_0_rgba(0,0,0,0.06)] [@media(hover:hover)]:hover:bg-[#f7f7f8]",
                  )}
                >
                  {on ? <Check className="h-3.5 w-3.5 shrink-0" /> : null}
                  {c.title}
                </button>
              )
            })}
          </div>
          <p className="text-[13px] leading-5 text-[#6b7280]">{collections.length ? tt("It applies only to products in these collections.") : tt("None picked: the products above decide.")}</p>
        </div>
      ) : null}
    </section>
  )
}
