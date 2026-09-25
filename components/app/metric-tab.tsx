"use client"

/**
 * ===========================================================================
 *  ONE FIGURE ABOVE A TREND CHART, AND THE BUTTON THAT SHOWS IT
 * ===========================================================================
 * The home page and Analytics each drew their own row of these, and they had
 * drifted: the same four figures, but a violet underline under the chosen one
 * on Analytics and a light grey one at home, a violet tint behind it on one
 * and a grey one on the other, and three different type sizes. The owner
 * asked for the grey line, "like on the homepage". This is the home page's
 * tab, and both rows draw it, so they cannot drift again.
 *
 * The row around it is the same too: a strip that scrolls sideways on a phone,
 * at home and on Analytics alike (components/app/use-tab-strip).
 */
import type * as React from "react"
import { useState } from "react"
import { cn } from "@/lib/utils"
import { ShimmerBlock } from "@/components/ui/shimmer"

/** The line under the chosen tab: light grey, never the accent. */
export const METRIC_TAB_LINE = "#d1d5db"

export function MetricTab({
  tab,
  label,
  value,
  change,
  foot,
  selected,
  soft = false,
  loading = false,
  sample = false,
  onSelect,
  className,
}: {
  /** The name the row finds it by (data-tab), e.g. "views". */
  tab: string
  label: React.ReactNode
  value: React.ReactNode
  /** The change against the period before, drawn beside the value. */
  change?: React.ReactNode
  foot: React.ReactNode
  selected: boolean
  /** The figures are being replaced: they go soft until the new ones land. */
  soft?: boolean
  /**
   * No figure has come back yet. Where a zero used to stand, blurred, and
   * then turn into the real number (a figure that changed twice on landing),
   * the value's line holds a light gray shape until the first answer, which
   * then fades in (components/ui/shimmer).
   */
  loading?: boolean
  /** Sample numbers, not the creator's: drawn fainter. */
  sample?: boolean
  onSelect: () => void
  className?: string
}) {
  /* Whether this tab has waited for its figure, so that figure fades in,
     and a tab that arrived with its figure does not. */
  const [waited, setWaited] = useState(loading)
  if (loading && !waited) setWaited(true)
  return (
    <button
      type="button"
      role="tab"
      aria-selected={selected}
      data-tab={tab}
      onClick={onSelect}
      className={cn(
        "relative min-w-0 cursor-pointer bg-white px-3 py-3 text-left transition-colors duration-200 sm:px-4 sm:py-3.5",
        selected ? "md:bg-[#f9fafb]" : "pointer-fine:hover:bg-[#fafafa]",
        className,
      )}
    >
      {selected ? <span aria-hidden data-metric-tab-line className="absolute inset-x-0 bottom-0 h-[1.5px]" style={{ background: METRIC_TAB_LINE }} /> : null}
      <span className={cn("block truncate text-[11px] font-medium sm:text-[12px]", selected ? "text-[#374151]" : "text-[#6b7280]")}>{label}</span>
      <span className="mt-0.5 flex min-w-0 items-baseline gap-1.5">
        <span
          className={cn(
            "truncate text-[18px] font-semibold tabular-nums tracking-tight transition-[filter,color,opacity] duration-[700ms] ease-[cubic-bezier(0.32,0.72,0,1)] sm:text-[22px]",
            sample ? "text-[#1a1a2e]/50" : "text-[#1a1a2e]",
            soft ? "blur-[2px]" : "blur-0",
            waited && !loading && "shimmer-enter",
          )}
        >
          {loading ? <ShimmerBlock className="shimmer-wait inline-block h-[0.78em] w-[3.4em] rounded-md align-[-0.06em]" /> : value}
        </span>
        {loading ? null : change}
      </span>
      <span
        className={cn(
          "block truncate text-[10px] text-[#9ca3af] transition-[filter,opacity] duration-[700ms] ease-[cubic-bezier(0.32,0.72,0,1)] sm:text-[11px]",
          soft ? "blur-[1px]" : "blur-0",
          waited && !loading && "shimmer-enter",
        )}
      >
        {loading ? <ShimmerBlock className="shimmer-wait inline-block h-[0.8em] w-[7em] rounded-full align-[-0.05em]" /> : foot}
      </span>
    </button>
  )
}
