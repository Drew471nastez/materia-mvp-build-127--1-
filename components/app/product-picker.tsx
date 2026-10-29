"use client"

/**
 * ===========================================================================
 *  WHICH PRODUCT ANALYTICS COUNTS
 * ===========================================================================
 * "The All products selector in analytics should be the same UI as the
 * timeframe selector, and on mobile a smooth, clean bottom sheet."
 *
 * So it is the date picker's parts (components/app/date-range-picker): the
 * same button, a label and a chevron with nothing in front, the same list
 * with a check on the one showing, in the same popover on a computer and the
 * shared sheet on a phone (components/ui/bottom-sheet). A row is the answer:
 * it applies and closes, and the page catches up behind the close.
 *
 * A creator with more than eight products gets a search field at the top of
 * the list; one with fewer can see them all at once and does not need one.
 */
import * as React from "react"
import { ChevronDown } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { BottomSheet } from "@/components/ui/bottom-sheet"
import { cn } from "@/lib/utils"
import { PickerDivider, PickerRow, onRowsKey, pickerButton, pickerSurface, usePhone } from "@/components/app/date-range-picker"
import { tt } from "@/lib/i18n/text"

/** More than this many products and the list can be searched. */
export const SEARCH_FROM = 9

export interface PickerProduct {
  id: string
  title: string
}

function List({
  products,
  value,
  compact,
  onPick,
}: {
  products: PickerProduct[]
  value: string
  compact: boolean
  onPick: (id: string) => void
}) {
  const searchable = products.length >= SEARCH_FROM
  const [query, setQuery] = React.useState("")
  const q = query.trim().toLowerCase()
  const shown = q ? products.filter((p) => (p.title || "").toLowerCase().includes(q)) : products
  return (
    <div className={compact ? "px-2 pb-2 pt-1" : "p-1.5"}>
      {searchable ? (
        <div className={compact ? "px-1 pb-2" : "px-1 pb-1.5 pt-0.5"}>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault()
                e.currentTarget.closest("[data-product-picker]")?.querySelector<HTMLElement>("[data-row]")?.focus()
              }
            }}
            placeholder={tt("Search products")}
            aria-label={tt("Search products")}
            autoComplete="off"
            data-product-search
            className={cn(
              /* 16px on a phone: anything smaller and iOS zooms the page to type. */
              "w-full min-w-0 rounded-lg border border-[#d5d7dd] bg-white px-3 text-[#1a1a2e] outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-[#9ca3af] focus:border-[#c9ccd3] focus:shadow-[0_0_0_3px_rgba(17,17,19,0.06)]",
              compact ? "h-11 text-[16px]" : "h-9 text-[13px]",
            )}
          />
        </div>
      ) : null}
      <div role="menu" aria-label={tt("Product")} onKeyDown={onRowsKey} className={cn(!compact && "max-h-[320px] overflow-y-auto overscroll-contain")}>
        {!q ? (
          <>
            <PickerRow rowKey="all" compact={compact} checked={value === "all"} onClick={() => onPick("all")}>
              {tt("All products")}
            </PickerRow>
            {products.length ? <PickerDivider compact={compact} /> : null}
          </>
        ) : null}
        {shown.map((p) => (
          <PickerRow key={p.id} rowKey={p.id} compact={compact} checked={value === p.id} onClick={() => onPick(p.id)}>
            {p.title || tt("Untitled product")}
          </PickerRow>
        ))}
        {q && shown.length === 0 ? (
          <p className={cn("px-3 py-2 text-[#6b7280]", compact ? "text-[15px]" : "text-[13px]")}>{tt("No product called “{value}”", { value: query.trim() })}</p>
        ) : null}
      </div>
    </div>
  )
}

export function ProductPicker({
  products,
  value,
  onChange,
  align = "end",
  className,
}: {
  products: PickerProduct[]
  /** A product id, or "all". */
  value: string
  onChange: (id: string) => void
  align?: "start" | "end"
  className?: string
}) {
  const [open, setOpen] = React.useState(false)
  /* A new list each time it opens, so a search never outlives the open it was typed in. */
  const [session, setSession] = React.useState(0)
  const phone = usePhone()
  const label = value === "all" ? tt("All products") : products.find((p) => p.id === value)?.title || tt("All products")
  const setShown = (o: boolean) => {
    if (o) setSession((s) => s + 1)
    setOpen(o)
  }
  /* A choice closes the picker at once; the page catches up behind it. */
  const pick = (id: string) => {
    setOpen(false)
    React.startTransition(() => onChange(id))
  }
  const trigger = (
    <button
      type="button"
      className={cn(pickerButton, "min-w-0 max-w-[220px] sm:max-w-[260px]", className)}
      data-state={open ? "open" : "closed"}
      data-filter-set={value === "all" ? undefined : ""}
      aria-haspopup="dialog"
      aria-expanded={open}
      title={label}
      onClick={phone ? () => setShown(true) : undefined}
    >
      <span className="min-w-0 truncate">{label}</span>
      <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 text-[#6b7280] transition-transform duration-150", open && "rotate-180")} aria-hidden />
    </button>
  )
  const list = (compact: boolean) => <List key={session} products={products} value={value} compact={compact} onPick={pick} />

  if (phone) {
    return (
      <>
        {trigger}
        {/* A little shorter than a sheet's tallest (round 24, "its height, it's too big"): 74% of the screen. */}
        <BottomSheet isOpen={open} onClose={() => setOpen(false)} title={tt("Product")} maxHeight="min(74dvh, 620px)">
          <div data-product-picker>{list(true)}</div>
        </BottomSheet>
      </>
    )
  }
  return (
    <Popover open={open} onOpenChange={setShown}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        align={align}
        sideOffset={6}
        data-product-picker
        className={cn(pickerSurface, "w-[280px] max-w-[calc(100vw-24px)]")}
        onOpenAutoFocus={(e) => {
          /* Onto the search when there is one, otherwise onto the product showing. */
          e.preventDefault()
          const el = e.currentTarget as HTMLElement | null
          const target =
            el?.querySelector<HTMLElement>("[data-product-search]") ??
            el?.querySelector<HTMLElement>("[data-row][data-checked]") ??
            el?.querySelector<HTMLElement>("[data-row]")
          target?.focus({ preventScroll: true })
        }}
      >
        {list(false)}
      </PopoverContent>
    </Popover>
  )
}
