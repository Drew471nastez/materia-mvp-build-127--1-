"use client"

import { memo, useEffect, useState } from "react"
import { Filter, X } from "lucide-react"
import { SheetDialog, SheetDialogTitle } from "@/components/ui/sheet-dialog"
import { PRIMARY_BUTTON, SECONDARY_BUTTON } from "../analytics/add-reports"
import { cn } from "@/lib/utils"
import { tt } from "@/lib/i18n/text"
import type { ProductFilterValue, ProductListStatus, StockFilter } from "@/lib/products/admin-filters"

export const ProductFilters = memo(function ProductFilters({ value, onApply }: { value: ProductFilterValue; onApply: (value: ProductFilterValue) => void }) {
  const [open, setOpen] = useState(false)
  const [phone, setPhone] = useState(false)
  // Mount the phone sheet while closed so the first press can animate immediately.
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)")
    const sync = () => setPhone(mq.matches)
    sync()
    mq.addEventListener("change", sync)
    return () => mq.removeEventListener("change", sync)
  }, [])
  const [draft, setDraft] = useState(value)
  const [pending, setPending] = useState<ProductFilterValue | null>(null)
  const count = value.statuses.length + value.stock.length
  const toggle = (key: keyof ProductFilterValue, item: ProductListStatus | StockFilter) => {
    setDraft((current) => key === "statuses"
      ? { ...current, statuses: current.statuses.includes(item as ProductListStatus) ? current.statuses.filter((v) => v !== item) : [...current.statuses, item as ProductListStatus] }
      : { ...current, stock: current.stock.includes(item as StockFilter) ? current.stock.filter((v) => v !== item) : [...current.stock, item as StockFilter] })
  }
  const apply = (next: ProductFilterValue) => {
    setOpen(false)
    if (phone) setPending(next)
    else onApply(next)
  }
  return <>
    <button type="button" data-product-filters="" aria-label={count ? tt("Filters ({value})", { value: count }) : tt("Filters")} aria-haspopup="dialog" aria-expanded={open} onClick={() => { setDraft(value); setPending(null); setPhone(window.matchMedia("(max-width: 767px)").matches); setOpen(true) }} className={cn("relative grid h-11 w-11 shrink-0 place-items-center rounded-full text-[#4b5563] outline-none transition-colors hover:bg-[#f1f2f4] focus-visible:ring-2 focus-visible:ring-violet-300", count > 0 && "bg-[#eceef1] text-[#1a1a2e]")}>
      <Filter className="h-5 w-5" />
      {count > 0 ? <span aria-hidden className="absolute right-1 top-1 h-2 w-2 rounded-full bg-[#8b5cf6]" /> : null}
    </button>
    <SheetDialog open={open} onClose={() => setOpen(false)} phone={phone} label={tt("Filters")} showCloseButton={false} sheet={{ fill: false, maxHeight: "90dvh", onClosed: () => { if (pending) { onApply(pending); setPending(null) } } }} className="max-w-[460px] gap-0 rounded-3xl bg-white p-0" dialog={{ "aria-describedby": undefined }}>
      <div className="px-5 pb-[calc(env(safe-area-inset-bottom,0px)+20px)] pt-2 md:pt-5">
        <div className="relative mb-5 flex h-11 items-center justify-center">
          <button type="button" aria-label={tt("Close")} onClick={() => setOpen(false)} className="absolute left-0 grid h-11 w-11 place-items-center rounded-full outline-none hover:bg-[#f5f6f8] focus-visible:ring-2"><X className="h-5 w-5" /></button>
          <SheetDialogTitle className="text-[17px] font-semibold">{tt("Filters")}</SheetDialogTitle>
        </div>
        <fieldset className="mb-6">
          <legend className="mb-2 w-full border-b border-[#e5e7eb] pb-3 text-[16px] font-semibold">{tt("Status")}</legend>
          {([ ["published", tt("Public")], ["draft", tt("Draft")], ["archived", tt("Archived")] ] as [ProductListStatus, string][]).map(([id, label]) => <label key={id} className="flex min-h-11 cursor-pointer items-center gap-3 text-[16px]"><input type="checkbox" checked={draft.statuses.includes(id)} onChange={() => toggle("statuses", id)} className="h-6 w-6 rounded-lg accent-[#1a1a2e]" />{label}</label>)}
        </fieldset>
        <fieldset className="mb-6">
          <legend className="mb-2 w-full border-b border-[#e5e7eb] pb-3 text-[16px] font-semibold">{tt("Stock")}</legend>
          {([["available", tt("Available")], ["sold-out", tt("Sold out")]] as [StockFilter, string][]).map(([id, label]) => <label key={id} className="flex min-h-11 cursor-pointer items-center gap-3 text-[16px]"><input type="checkbox" checked={draft.stock.includes(id)} onChange={() => toggle("stock", id)} className="h-6 w-6 rounded-lg accent-[#1a1a2e]" />{label}</label>)}
        </fieldset>
        <div className="grid gap-2"><button type="button" onClick={() => apply(draft)} className={cn(PRIMARY_BUTTON, "h-12 w-full")}>{tt("Apply filters")}</button><button type="button" onClick={() => apply({ statuses: [], stock: [] })} className={cn(SECONDARY_BUTTON, "h-12 w-full bg-[#f3f4f6]")}>{tt("Reset")}</button></div>
      </div>
    </SheetDialog>
  </>
})
