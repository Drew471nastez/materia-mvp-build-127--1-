"use client"

import { cn } from "@/lib/utils"
import type { DiscoverMode } from "./explore-hero"

const OPTIONS: { id: DiscoverMode; label: string }[] = [
  { id: "products", label: "Digital products" },
  { id: "communities", label: "Communities" },
]

/** Storelib-style segmented control (light gray track, white sliding pill). */
export function DiscoverModeSegment({
  mode,
  onChange,
}: {
  mode: DiscoverMode
  onChange: (mode: DiscoverMode) => void
}) {
  return (
    <div
      role="tablist"
      aria-label="Discover"
      className="mx-auto mb-3 inline-flex max-w-full rounded-full bg-[#eef0f3] p-0.5 shadow-[inset_0_1px_2px_rgba(15,23,42,0.05)]"
    >
      {OPTIONS.map((opt) => {
        const on = mode === opt.id
        return (
          <button
            key={opt.id}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => {
              if (!on) onChange(opt.id)
            }}
            className={cn(
              "relative rounded-full px-3 py-1.5 text-[12px] font-medium leading-none transition-[color,box-shadow,transform] duration-150 ease-[cubic-bezier(0.33,1,0.68,1)] sm:px-3.5 sm:text-[13px]",
              "outline-none focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/15 [-webkit-tap-highlight-color:transparent]",
              on
                ? "bg-white text-[#1a1a2e] shadow-[0_1px_2px_rgba(15,23,42,0.07),0_1px_1px_rgba(15,23,42,0.04)]"
                : "text-[#6b7280] hover:text-[#374151]",
            )}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}
