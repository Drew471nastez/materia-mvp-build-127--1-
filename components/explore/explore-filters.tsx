"use client"

/**
 * ===========================================================================
 *  THE FILTERS, TWO QUESTIONS AND NOTHING ELSE
 * ===========================================================================
 * "Too complex and weird." There were three sections: subcategory chips that
 * matched a column no product on this page is ever read with (so any of them
 * emptied the list), price chips, and a sort list, then Reset and Apply, and
 * a row of "Active:" chips under the pills repeating all of it. On a
 * computer the panel was a third design again, black pills with ticks in
 * them.
 *
 * Now it asks the two things a buyer actually narrows a catalogue by: how to
 * order it, and what it may cost. Every choice applies the moment it is
 * made, so there is no Apply; the list behind updates as you choose. "Clear
 * all" appears only when something is set.
 *
 * On a computer it is a panel hanging from the Filters button. On a phone it
 * is the shared sheet, and its one button closes it and says how many
 * results you are about to see.
 *
 * "Picking an option feels too abrupt." The tick used to blink from one row
 * to the next and the chosen row's text jumped to a heavier weight, which
 * reflowed it under the finger. Now the chosen row carries the circled
 * check (CheckDisc in ./category-browser), which grows in as the old one
 * shrinks away, by scale and opacity, and no row's text changes.
 */

import * as PopoverPrimitive from "@radix-ui/react-popover"
import { BottomSheet } from "@/components/ui/bottom-sheet"
import { cn } from "@/lib/utils"
import { CheckDisc, useDesktop } from "./category-browser"
import { PANEL_CLASS } from "./explore-category-picker"

/*
  THE ORDER THE PAGE SHOWS BY DEFAULT IS CALLED WHAT IT IS. The first option
  used to be "Newest", and choosing it did not sort by date at all: it left
  the page's own ranking in place. It is "Recommended" now, and Newest means
  newest.
*/
export const SORT_OPTIONS = [
  { id: "recommended", label: "Recommended" },
  { id: "newest", label: "Newest" },
  { id: "popular", label: "Most popular" },
  { id: "price-low", label: "Price: low to high" },
  { id: "price-high", label: "Price: high to low" },
] as const
export const DEFAULT_SORT = "recommended"

export const PRICE_FILTERS = [
  { id: "all", label: "Any price" },
  { id: "free", label: "Free" },
  { id: "under-10", label: "Under $10" },
  { id: "10-50", label: "$10 to $50" },
  { id: "50-plus", label: "$50 and up" },
] as const

/* The page's own pill, so a chosen price reads the way a chosen category does. */
const CHIP = "inline-flex items-center rounded-full border font-medium cursor-pointer select-none whitespace-nowrap outline-none transition-[background-color,border-color,color,box-shadow] duration-150 focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/15 [-webkit-tap-highlight-color:transparent]"
const CHIP_ON = "bg-[#e2e4e8] text-neutral-900 border-[#d7dadf] shadow-[inset_0_1px_1.5px_rgba(15,23,42,0.07),inset_0_-1px_0_rgba(255,255,255,0.45)]"
const CHIP_OFF = "bg-white text-neutral-600 border-neutral-200 hover:border-neutral-300 hover:text-neutral-900"

type SortOption = { readonly id: string; readonly label: string }

function FilterChoices({
  phone,
  sortOptions,
  sortBy,
  setSortBy,
  priceFilter,
  setPriceFilter,
}: {
  phone: boolean
  sortOptions: readonly SortOption[]
  sortBy: string
  setSortBy: (v: string) => void
  priceFilter: string
  setPriceFilter: (v: string) => void
}) {
  const label = phone ? "px-4 pb-1 pt-3 text-[13px] font-medium text-[#6b7280]" : "px-2.5 pb-1 pt-2 text-[12px] font-medium text-[#6b7280]"
  const row = phone
    ? "flex min-h-[48px] w-full items-center gap-3 px-4 text-left text-[16px] font-medium leading-5 active:bg-[#f1f2f4]"
    : "flex min-h-[36px] w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-[14px] leading-5 hover:bg-[#f4f5f6] focus-visible:bg-[#f1f2f4]"
  return (
    <div className={phone ? "pb-3" : "p-1.5"} data-filter-choices="">
      <div role="radiogroup" aria-label="Sort by">
        <p className={label}>Sort by</p>
        {sortOptions.map((o) => {
          const on = sortBy === o.id
          return (
            <button
              key={o.id}
              type="button"
              role="radio"
              aria-checked={on}
              data-filter-sort={o.id}
              onClick={() => setSortBy(o.id)}
              className={cn(row, "cursor-pointer select-none text-[#1a1a2e] outline-none transition-colors duration-100 [-webkit-tap-highlight-color:transparent]")}
            >
              <span className="min-w-0 flex-1 truncate">{o.label}</span>
              <CheckDisc on={on} />
            </button>
          )
        })}
      </div>
      <div role="radiogroup" aria-label="Price" className={phone ? "mt-2" : "mt-1 border-t border-[#eef0f2] pt-1"}>
        <p className={label}>Price</p>
        <div className={cn("flex flex-wrap", phone ? "gap-2 px-4 pb-1 pt-1.5" : "gap-1.5 px-2.5 pb-1.5 pt-1")}>
          {PRICE_FILTERS.map((f) => {
            const on = priceFilter === f.id
            return (
              <button
                key={f.id}
                type="button"
                role="radio"
                aria-checked={on}
                data-filter-price={f.id}
                onClick={() => setPriceFilter(f.id)}
                className={cn(CHIP, phone ? "h-10 px-4 text-[15px]" : "h-8 px-3 text-[13px]", on ? CHIP_ON : CHIP_OFF)}
              >
                {f.label}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export function ExploreFilters({
  open,
  onOpenChange,
  sortOptions = SORT_OPTIONS,
  sortBy,
  setSortBy,
  priceFilter,
  setPriceFilter,
  activeCount,
  onClear,
  resultCount,
  triggerClassName,
  children,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The orders on offer. A category page has no ranking of its own, so it leaves Recommended out. */
  sortOptions?: readonly SortOption[]
  sortBy: string
  setSortBy: (v: string) => void
  priceFilter: string
  setPriceFilter: (v: string) => void
  activeCount: number
  onClear: () => void
  /** How many products the choices leave, for the phone's button. */
  resultCount: number
  triggerClassName: string
  children: React.ReactNode
}) {
  const desktop = useDesktop()
  const choices = (phone: boolean) => (
    <FilterChoices phone={phone} sortOptions={sortOptions} sortBy={sortBy} setSortBy={setSortBy} priceFilter={priceFilter} setPriceFilter={setPriceFilter} />
  )
  /*
    CLEAR ALL COMES AND GOES, IT DOES NOT BLINK. It used to be added when a
    choice was made and removed when there was none, so it popped in beside
    the title. It is always in place now and fades and settles in (or out)
    by opacity and scale, and while there is nothing to clear it is inert.
  */
  const clear = (phone: boolean) => {
    const on = activeCount > 0
    return (
      <button
        type="button"
        data-filter-clear=""
        data-on={on ? "" : undefined}
        onClick={onClear}
        inert={!on}
        aria-hidden={!on || undefined}
        tabIndex={on ? 0 : -1}
        className={cn(
          "cursor-pointer rounded-md font-medium text-[#6b7280] outline-none transition-[opacity,scale,color] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:text-[#1a1a2e] focus-visible:text-[#1a1a2e] motion-reduce:transition-none [-webkit-tap-highlight-color:transparent]",
          phone ? "-mr-2 px-2 py-2 text-[15px]" : "-mr-1 px-1.5 py-1 text-[13px]",
          on ? "scale-100 opacity-100" : "pointer-events-none scale-95 opacity-0",
        )}
      >
        Clear all
      </button>
    )
  }

  if (desktop) {
    return (
      <PopoverPrimitive.Root open={open} onOpenChange={onOpenChange}>
        <PopoverPrimitive.Trigger asChild>
          <button type="button" data-filters-button="" className={triggerClassName}>
            {children}
          </button>
        </PopoverPrimitive.Trigger>
        <PopoverPrimitive.Portal>
          <PopoverPrimitive.Content
            data-filters-panel=""
            align="end"
            side="bottom"
            sideOffset={8}
            collisionPadding={16}
            aria-label="Filters"
            className={`${PANEL_CLASS} w-[296px]`}
          >
            <div className="flex h-11 shrink-0 items-center justify-between border-b border-[#eef0f2] px-4">
              <p className="text-[14px] font-semibold">Filters</p>
              {clear(false)}
            </div>
            {choices(false)}
          </PopoverPrimitive.Content>
        </PopoverPrimitive.Portal>
      </PopoverPrimitive.Root>
    )
  }

  const results = resultCount === 0 ? "No results" : `Show ${resultCount} ${resultCount === 1 ? "result" : "results"}`
  return (
    <>
      <button type="button" data-filters-button="" aria-haspopup="dialog" aria-expanded={open} onClick={() => onOpenChange(true)} className={triggerClassName}>
        {children}
      </button>
      <BottomSheet
        isOpen={open}
        onClose={() => onOpenChange(false)}
        label="Filters"
        hideFrom="md"
        fill
        maxHeight="min(86dvh, 720px)"
        header={
          <div data-filters-sheet="" className="flex items-center justify-between px-4 pb-1 pt-2">
            <p className="text-[17px] font-semibold leading-6 text-[#1a1a2e]">Filters</p>
            {clear(true)}
          </div>
        }
      >
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain" style={{ touchAction: "pan-y" }}>
          {choices(true)}
        </div>
        <div className="shrink-0 border-t border-[#eef0f2] px-4 pt-3">
          {/*
            THE SHEET CLOSES ITSELF, THEN THE PAGE HEARS. This called
            onOpenChange(false) itself, so the whole page behind re-rendered
            before the sheet could take its first step down (about 90ms at a
            phone's speed, measured). `data-sheet-close` hands the close to
            the sheet, which starts the slide and tells the page a frame
            later (components/ui/bottom-sheet.tsx, A BUTTON INSIDE CAN CLOSE
            IT).
          */}
          <button
            type="button"
            data-filters-done=""
            data-sheet-close=""
            className="h-12 w-full cursor-pointer rounded-[12px] bg-[#111113] text-[16px] font-semibold text-white shadow-[0_1px_2px_rgba(0,0,0,0.18),inset_0_1px_0_rgba(255,255,255,0.08)] outline-none transition-[background-color,scale] duration-100 active:scale-[0.99] active:bg-black [-webkit-tap-highlight-color:transparent]"
          >
            {results}
          </button>
        </div>
      </BottomSheet>
    </>
  )
}
