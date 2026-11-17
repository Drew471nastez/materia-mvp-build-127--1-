"use client"

import { memo, useEffect, useState } from "react"
import { Filter } from "lucide-react"
import { SheetDialog, SheetDialogTitle } from "@/components/ui/sheet-dialog"
import { PRIMARY_BUTTON, SECONDARY_BUTTON } from "../analytics/add-reports"
import { cn } from "@/lib/utils"
import { tt } from "@/lib/i18n/text"
import type { ProductFilterValue, ProductListStatus, StockFilter } from "@/lib/products/admin-filters"

/*
  Products round 15: "smoother and cleaner, and the checkboxes too", and no X.
  The sheet closes by its handle, a tap outside, Escape, or Apply and Reset;
  a screen reader still has a Close button, out of sight until it has focus.
*/

/** A row is the whole press: the name on the left, the box on the right. */
const ROW =
  "group/filter flex min-h-12 cursor-pointer items-center justify-between gap-3 rounded-xl px-3 text-[15px] text-[#1a1a2e] transition-colors duration-150 hover:bg-[#f8f9fa] active:bg-[#f1f2f4] motion-reduce:transition-none [-webkit-tap-highlight-color:transparent]"

/** A checkbox drawn for Storelib: a soft square that fills with the /app violet, and a tick that draws in. */
function FilterCheck({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <span className="relative grid h-[22px] w-[22px] shrink-0 place-items-center">
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="peer absolute inset-0 m-0 cursor-pointer appearance-none rounded-[7px] border-[1.5px] border-[#d1d5db] bg-white outline-none transition-[background-color,border-color,box-shadow] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover/filter:border-[#b6bac2] checked:border-[#8b5cf6] checked:bg-[#8b5cf6] group-hover/filter:checked:border-[#7c3aed] group-hover/filter:checked:bg-[#7c3aed] focus-visible:shadow-[0_0_0_3px_rgba(139,92,246,0.25)] motion-reduce:transition-none"
      />
      <svg
        aria-hidden
        viewBox="0 0 16 16"
        className="pointer-events-none relative h-3.5 w-3.5 scale-50 text-white opacity-0 transition-[opacity,scale] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] peer-checked:scale-100 peer-checked:opacity-100 motion-reduce:transition-none"
      >
        <path d="M3.5 8.5 6.5 11.5 12.5 4.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  )
}

function Group<T extends string>({ legend, options, chosen, onToggle }: { legend: string; options: [T, string][]; chosen: T[]; onToggle: (id: T) => void }) {
  return (
    <fieldset className="min-w-0">
      <legend className="mb-1 px-3 text-[13px] font-medium text-[#6b7280]">{legend}</legend>
      {options.map(([id, label]) => (
        <label key={id} className={ROW} data-filter-option={id}>
          <span className="min-w-0 truncate">{label}</span>
          <FilterCheck checked={chosen.includes(id)} onChange={() => onToggle(id)} />
        </label>
      ))}
    </fieldset>
  )
}

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
    <SheetDialog open={open} onClose={() => setOpen(false)} phone={phone} label={tt("Filters")} showCloseButton={false} sheet={{ fill: false, maxHeight: "90dvh", onClosed: () => { if (pending) { onApply(pending); setPending(null) } } }} className="max-w-[420px] gap-0 rounded-2xl sm:max-w-[420px] border-[#e5e7eb] bg-white p-0 shadow-[0_24px_64px_-16px_rgba(17,24,39,0.28),0_2px_6px_rgba(17,24,39,0.06)]" dialog={{ "aria-describedby": undefined }}>
      <div data-filters-sheet="" className="px-3 pb-[calc(env(safe-area-inset-bottom,0px)+16px)] pt-1 md:px-3 md:pt-4">
        <div className="relative mb-2 flex h-10 items-center justify-center">
          <SheetDialogTitle className="text-[17px] font-semibold text-[#1a1a2e]">{tt("Filters")}</SheetDialogTitle>
          {/* Out of sight: the handle, a tap outside and Escape close it; a screen reader or a Tab still finds this. */}
          <button type="button" onClick={() => setOpen(false)} className="sr-only rounded-lg text-[14px] focus-visible:px-2 text-[#6b7280] outline-none focus-visible:not-sr-only focus-visible:absolute focus-visible:left-1 focus-visible:top-1.5 focus-visible:ring-2 focus-visible:ring-[#8b5cf6]/40">{tt("Close")}</button>
        </div>
        <div className="space-y-4">
          <Group legend={tt("Status")} options={[["published", tt("Public")], ["draft", tt("Draft")], ["archived", tt("Archived")]] as [ProductListStatus, string][]} chosen={draft.statuses} onToggle={(id) => toggle("statuses", id)} />
          <div className="mx-3 h-px bg-[#eef0f2]" aria-hidden />
          <Group legend={tt("Stock")} options={[["available", tt("Available")], ["sold-out", tt("Sold out")]] as [StockFilter, string][]} chosen={draft.stock} onToggle={(id) => toggle("stock", id)} />
        </div>
        <div className="mt-5 grid grid-cols-[1fr_2fr] gap-2 px-2">
          <button type="button" onClick={() => apply({ statuses: [], stock: [] })} className={cn(SECONDARY_BUTTON, "h-12 w-full rounded-xl border-transparent bg-[#f3f4f6] text-[15px] shadow-none transition-colors duration-150 hover:bg-[#eceef1] active:bg-[#e5e7eb]")}>{tt("Reset")}</button>
          <button type="button" onClick={() => apply(draft)} className={cn(PRIMARY_BUTTON, "h-12 w-full rounded-xl text-[15px] transition-colors duration-150")}>{tt("Apply filters")}</button>
        </div>
      </div>
    </SheetDialog>
  </>
})
