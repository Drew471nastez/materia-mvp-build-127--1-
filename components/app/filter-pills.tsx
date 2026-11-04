"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { useEdgeFade } from "@/components/app/use-edge-fade"

/**
 * The pill row the Integrations page draws (All, Installed, the categories),
 * one look for every filter row in /app that picks a group of a list. The
 * owner (round 47): Customer emails' "All, Digital products, Physical
 * products, Communities" are these pills, the same as Integrations.
 *
 * ANALYTICS' CHIP (r51, the owner: "the same Storelib style as /app/
 * analytics' controls ... clicking should feel smooth"). Each pill is the
 * chip the time frame, All pages and All products are drawn as (app/
 * globals.css [data-analytics-controls]): 36px, fully round, white, a
 * hairline ring and a soft shadow, 14px semibold. The chosen one is the dark
 * pill Analytics' own choices use (SegmentedPills `filter`). Nothing slides
 * or grows: the pressed pill eases its own ground and type over 150ms on
 * Settings' curve, the one left eases back, and no layer is stacked over the
 * words. 32px before, with a grey border, and the colour cut in one frame.
 *
 * The classes are exported so a page that draws its own buttons (Integrations,
 * which keeps refs on its row) uses the very same ones.
 */
export const FILTER_PILL =
  "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[14px] font-semibold outline-none transition-[background-color,color,box-shadow] duration-150 ease-[cubic-bezier(0.33,1,0.68,1)] focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/20 motion-reduce:transition-none [-webkit-tap-highlight-color:transparent]"
export const FILTER_PILL_ON = "bg-[#1a1a2e] text-white shadow-[0_0_0_1px_rgba(26,26,46,1),0_1px_2px_rgba(17,24,39,0.05)]"
export const FILTER_PILL_OFF = "bg-white text-[#1a1a2e] shadow-[0_0_0_1px_rgba(17,24,39,0.08),0_1px_2px_rgba(17,24,39,0.05)] pointer-fine:hover:bg-[#f7f7f8] active:bg-[#f1f2f4]"
/* The ring is drawn outside each pill, so the row keeps 4px around them that a sideways scroller would otherwise clip. */
export const FILTER_PILL_ROW =
  "relative -m-1 flex min-w-0 gap-2 overflow-x-auto p-1 [scrollbar-width:none] sm:flex-wrap sm:overflow-visible [&::-webkit-scrollbar]:hidden"

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
  /*
    ON A PHONE THE ROW SCROLLS, AND THE CHOSEN PILL IS KEPT WHOLE (r51). A pill pressed at the cut edge was
    left half off the screen. The row glides it into view, the row only (never the page), and fades the end
    that has more past it (components/app/use-edge-fade). One chosen by the address is simply there.
  */
  const row = useEdgeFade<HTMLDivElement>()
  const placed = React.useRef(false)
  React.useLayoutEffect(() => {
    const strip = row.current
    const pill = strip?.querySelector<HTMLElement>('[aria-selected="true"]')
    if (!strip || !pill || strip.scrollWidth <= strip.clientWidth + 1) {
      placed.current = true
      return
    }
    const room = 28
    let left = strip.scrollLeft
    if (pill.offsetLeft - room < left) left = pill.offsetLeft - room
    else if (pill.offsetLeft + pill.offsetWidth + room > left + strip.clientWidth) left = pill.offsetLeft + pill.offsetWidth + room - strip.clientWidth
    left = Math.max(0, Math.min(strip.scrollWidth - strip.clientWidth, left))
    const still = !placed.current || !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    placed.current = true
    if (Math.abs(left - strip.scrollLeft) < 1) return
    if (typeof strip.scrollTo === "function") strip.scrollTo({ left, behavior: still ? ("instant" as ScrollBehavior) : "smooth" })
    else strip.scrollLeft = left
  }, [value, row])
  return (
    <div ref={row} role="tablist" aria-label={label} className={cn(FILTER_PILL_ROW, "edge-fade", className)} data-filter-pills="">
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
