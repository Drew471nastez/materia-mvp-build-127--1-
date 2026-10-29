"use client"

/**
 * ===========================================================================
 *  WHAT ANALYTICS SHOWS: ALL, DIGITAL, PHYSICAL OR COMMUNITIES, AS ONE FILTER
 * ===========================================================================
 * Round 42, the owner: not a row of segments but one filter, like the
 * Emails subscribers' Status and Source; round 43 drew it as the round white
 * pill the period and the place are again (app/globals.css
 * [data-analytics-controls]). "All types" until something is
 * chosen, then the choice's own name ("Digital"), the way All pages and All
 * products read beside it. The date picker's parts, like the property and
 * product pickers (components/app/property-picker, product-picker): the
 * same button, the same list with a check on the one showing, a popover on a
 * computer and the shared sheet on a phone. A row is the answer: it applies
 * and closes.
 *
 * A pointer resting on a row, or a finger landing on one, is told to
 * `onIntent`, so the page can read that view ahead (app/app/analytics).
 */
import * as React from "react"
import { ChevronDown } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { BottomSheet } from "@/components/ui/bottom-sheet"
import { cn } from "@/lib/utils"
import { PickerDivider, PickerRow, onRowsKey, pickerButton, pickerSurface, usePhone } from "@/components/app/date-range-picker"
import { tt } from "@/lib/i18n/text"

export interface KindOption<T extends string> {
  value: T
  label: string
}

function List<T extends string>({ options, value, compact, onPick, onIntent }: { options: KindOption<T>[]; value: T; compact: boolean; onPick: (v: T) => void; onIntent?: (v: T) => void }) {
  const [all, ...rest] = options
  const row = (o: KindOption<T>) => (
    <div key={o.value} role="none" onPointerEnter={onIntent ? () => onIntent(o.value) : undefined} onTouchStart={onIntent ? () => onIntent(o.value) : undefined}>
      <PickerRow rowKey={o.value} compact={compact} checked={o.value === value} onClick={() => onPick(o.value)}>
        {o.label}
      </PickerRow>
    </div>
  )
  return (
    <div className={compact ? "px-2 pb-2 pt-1" : "p-1.5"}>
      <div role="menu" aria-label={tt("Type")} onKeyDown={onRowsKey}>
        {all ? row(all) : null}
        {rest.length ? <PickerDivider compact={compact} /> : null}
        {rest.map(row)}
      </div>
    </div>
  )
}

/**
 * `options` starts with All (its value is the default); `allLabel` is what
 * the chip says while it is chosen.
 */
export function KindPicker<T extends string>({
  options,
  value,
  onChange,
  onIntent,
  allLabel,
  className,
}: {
  options: KindOption<T>[]
  value: T
  onChange: (v: T) => void
  onIntent?: (v: T) => void
  allLabel: string
  className?: string
}) {
  const [open, setOpen] = React.useState(false)
  const phone = usePhone()
  if (options.length < 2) return null
  const isAll = value === options[0].value
  const label = isAll ? allLabel : options.find((o) => o.value === value)?.label ?? allLabel
  /* A choice closes the picker at once; the page catches up behind it. */
  const pick = (v: T) => {
    setOpen(false)
    React.startTransition(() => onChange(v))
  }
  const trigger = (
    <button
      type="button"
      className={cn(pickerButton, "min-w-0 max-w-[200px]", className)}
      data-state={open ? "open" : "closed"}
      data-kind-picker=""
      data-filter-set={isAll ? undefined : ""}
      aria-haspopup="dialog"
      aria-expanded={open}
      onClick={phone ? () => setOpen(true) : undefined}
    >
      <span className="min-w-0 truncate">{label}</span>
      <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 text-[#6b7280] transition-transform duration-150", open && "rotate-180")} aria-hidden />
    </button>
  )

  if (phone) {
    return (
      <>
        {trigger}
        <BottomSheet isOpen={open} onClose={() => setOpen(false)} title={tt("Type")}>
          <div data-kind-list="">
            <List options={options} value={value} compact onPick={pick} onIntent={onIntent} />
          </div>
        </BottomSheet>
      </>
    )
  }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={6}
        data-kind-list=""
        className={cn(pickerSurface, "w-[200px] max-w-[calc(100vw-24px)]")}
        onOpenAutoFocus={(e) => {
          /* Onto the one showing. */
          e.preventDefault()
          const el = e.currentTarget as HTMLElement | null
          ;(el?.querySelector<HTMLElement>("[data-row][data-checked]") ?? el?.querySelector<HTMLElement>("[data-row]"))?.focus({ preventScroll: true })
        }}
      >
        <List options={options} value={value} compact={false} onPick={pick} onIntent={onIntent} />
      </PopoverContent>
    </Popover>
  )
}
