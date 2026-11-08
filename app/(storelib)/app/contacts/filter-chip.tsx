"use client"

/**
 * One filter of the People list, drawn as Orders draws its filters
 * (app/app/orders/orders-list.tsx FilterChip): a dashed chip while it is
 * unset, a filled one with its value and an × once it is set, and its
 * choices in the app's popover. A chip whose choice is typed (a tag, two
 * dates) takes its own body instead of a list.
 */
import * as React from "react"
import { ChevronDown, X } from "lucide-react"
import { Popover, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import { tt } from "@/lib/i18n/text"
import { MenuOption, MenuSurface } from "../orders/order-parts"

export function FilterChip({
  label,
  value,
  onClear,
  options,
  selected,
  onSelect,
  children,
  id,
}: {
  label: string
  /** What is chosen, in words; null while unset. */
  value: string | null
  onClear: () => void
  options?: Array<{ value: string; label: string }>
  selected?: string
  onSelect?: (value: string) => void
  /** A body of its own, given a way to close the popover. */
  children?: (close: () => void) => React.ReactNode
  id?: string
}) {
  const [open, setOpen] = React.useState(false)
  const close = () => setOpen(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <div
        data-contacts-chip={id}
        className={cn(
          "flex h-7 shrink-0 items-center rounded-lg border text-[12px] font-medium max-sm:h-8 max-sm:text-[13px]",
          value ? "border-[#1a1a2e]/15 bg-[#f1f2f4] text-[#1a1a2e]" : "border-dashed border-[#c9ccd3] text-[#4b5563]",
        )}
      >
        <PopoverTrigger asChild>
          <button type="button" className="flex h-full max-w-[240px] cursor-pointer items-center gap-1 px-2.5">
            <span className="truncate">{value ? `${label}: ${value}` : label}</span>
            {value ? null : <ChevronDown className="h-3.5 w-3.5 shrink-0" />}
          </button>
        </PopoverTrigger>
        {value ? (
          <button type="button" aria-label={tt("Clear {label}", { label })} className="flex h-full cursor-pointer items-center pr-2 text-[#6b7280] hover:text-[#1a1a2e]" onClick={onClear}>
            <X className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>
      <MenuSurface className="max-h-[320px] w-[260px] overflow-y-auto">
        {children ? (
          children(close)
        ) : (
          <div role="menu" aria-label={label}>
            {(options ?? []).map((o) => (
              <MenuOption
                key={o.value}
                selected={o.value === (selected ?? "")}
                onSelect={() => {
                  onSelect?.(o.value)
                  close()
                }}
              >
                {o.label}
              </MenuOption>
            ))}
          </div>
        )}
      </MenuSurface>
    </Popover>
  )
}
