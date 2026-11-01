"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

/**
 * The pill row the Integrations page draws (All, Installed, the categories),
 * one look for every filter row in /app that picks a group of a list: a 32px
 * pill with a hairline border, the chosen one filled near black. The owner
 * (round 47): Customer emails' "All, Digital products, Physical products,
 * Communities" are these pills, the same as Integrations.
 *
 * The classes are exported so a page that draws its own buttons (Integrations,
 * which keeps refs on its row) uses the very same ones.
 */
export const FILTER_PILL =
  "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium [-webkit-tap-highlight-color:transparent]"
export const FILTER_PILL_ON = "border-[#1a1a2e] bg-[#1a1a2e] text-white"
export const FILTER_PILL_OFF = "border-[#e5e7eb] bg-white text-[#374151] hover:border-[#d1d5db] active:bg-[#f3f4f6]"
export const FILTER_PILL_ROW =
  "relative -mx-1 flex min-w-0 gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none] sm:flex-wrap sm:overflow-visible [&::-webkit-scrollbar]:hidden"

export interface FilterPillOption<T extends string> {
  value: T
  label: string
  count?: number
}

export function FilterPills<T extends string>({
  options,
  value,
  onChange,
  label,
  className,
}: {
  options: FilterPillOption<T>[]
  value: T
  onChange: (value: T) => void
  label: string
  className?: string
}) {
  return (
    <div role="tablist" aria-label={label} className={cn(FILTER_PILL_ROW, className)} data-filter-pills="">
      {options.map((o) => {
        const on = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => {
              if (!on) onChange(o.value)
            }}
            data-filter-pill={o.value}
            className={cn(FILTER_PILL, on ? FILTER_PILL_ON : FILTER_PILL_OFF)}
          >
            {o.label}
            {typeof o.count === "number" ? <span className={cn("tabular-nums", on ? "text-white/70" : "text-[#9ca3af]")}>{o.count}</span> : null}
          </button>
        )
      })}
    </div>
  )
}
