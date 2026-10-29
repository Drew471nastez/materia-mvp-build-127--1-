"use client"

/**
 * ===========================================================================
 *  WHICH OF THE CREATOR'S PLACES ANALYTICS COUNTS
 * ===========================================================================
 * All pages, the creator page, the OnePage, or one website (each by its own
 * name when there is more than one). The date picker's parts, like the
 * product picker (components/app/product-picker): the same button, the same
 * list with a check on the one showing, a popover on a computer and the
 * shared sheet on a phone. A row is the answer: it applies and closes.
 *
 * Only the places the creator has are listed (lib/analytics/properties
 * propertyOptions); a creator with one place has nothing to choose and the
 * page draws no picker at all.
 */
import * as React from "react"
import { ChevronDown } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { BottomSheet } from "@/components/ui/bottom-sheet"
import { cn } from "@/lib/utils"
import { PickerDivider, PickerRow, onRowsKey, pickerButton, pickerSurface, usePhone } from "@/components/app/date-range-picker"
import { propertyParam, sameProperty, type PropertyOption, type PropertySelector } from "@/lib/analytics/properties"
import { tt } from "@/lib/i18n/text"

function List({ options, value, compact, onPick }: { options: PropertyOption[]; value: PropertySelector; compact: boolean; onPick: (p: PropertySelector) => void }) {
  const [all, ...places] = options
  const websites = places.filter((o) => o.value.type === "website")
  const named = websites.length > 1
  return (
    <div className={compact ? "px-2 pb-2 pt-1" : "p-1.5"}>
      <div role="menu" aria-label={tt("Property")} onKeyDown={onRowsKey}>
        <PickerRow rowKey="all" compact={compact} checked={sameProperty(value, all.value)} onClick={() => onPick(all.value)}>
          {all.label}
        </PickerRow>
        <PickerDivider compact={compact} />
        {places.map((o, i) => (
          <React.Fragment key={propertyParam(o.value) ?? "all"}>
            {/* Several websites are a group of their own under the rest. */}
            {named && o.value.type === "website" && places[i - 1]?.value.type !== "website" ? <PickerDivider compact={compact} /> : null}
            <PickerRow rowKey={propertyParam(o.value) ?? "all"} compact={compact} checked={sameProperty(value, o.value)} detail={named && o.value.type === "website" ? tt("Website") : null} onClick={() => onPick(o.value)}>
              {o.label}
            </PickerRow>
          </React.Fragment>
        ))}
      </div>
    </div>
  )
}

export function PropertyPicker({
  options,
  value,
  onChange,
  className,
}: {
  options: PropertyOption[]
  value: PropertySelector
  onChange: (p: PropertySelector) => void
  className?: string
}) {
  const [open, setOpen] = React.useState(false)
  const phone = usePhone()
  const label = options.find((o) => sameProperty(o.value, value))?.label ?? options[0]?.label ?? tt("All pages")
  /* A choice closes the picker at once; the page catches up behind it. */
  const pick = (p: PropertySelector) => {
    setOpen(false)
    React.startTransition(() => onChange(p))
  }
  if (options.length < 2) return null
  const trigger = (
    <button
      type="button"
      className={cn(pickerButton, "min-w-0 max-w-[200px] sm:max-w-[240px]", className)}
      data-state={open ? "open" : "closed"}
      data-property-picker=""
      data-filter-set={options[0] && !sameProperty(value, options[0].value) ? "" : undefined}
      aria-haspopup="dialog"
      aria-expanded={open}
      title={label}
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
        <BottomSheet isOpen={open} onClose={() => setOpen(false)} title={tt("Property")}>
          <div data-property-list="">
            <List options={options} value={value} compact onPick={pick} />
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
        data-property-list=""
        className={cn(pickerSurface, "w-[240px] max-w-[calc(100vw-24px)]")}
        onOpenAutoFocus={(e) => {
          /* Onto the place showing. */
          e.preventDefault()
          const el = e.currentTarget as HTMLElement | null
          ;(el?.querySelector<HTMLElement>("[data-row][data-checked]") ?? el?.querySelector<HTMLElement>("[data-row]"))?.focus({ preventScroll: true })
        }}
      >
        <List options={options} value={value} compact={false} onPick={pick} />
      </PopoverContent>
    </Popover>
  )
}
