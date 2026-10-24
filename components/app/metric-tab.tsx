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
import * as React from "react"
import { cn } from "@/lib/utils"

/** The line under the chosen tab: light grey, never the accent. */
export const METRIC_TAB_LINE = "#d1d5db"

/**
 * ONE LINE FOR THE ROW, THAT SLIDES. Analytics' row draws this instead of a
 * line per tab: a tap moves it from the tab it was under to the one chosen,
 * its width becoming the new tab's, by `translate` and `width` over 260ms on
 * the /app curve, the way the cards' switchers move their pill. A line per
 * tab cut from one to the next, the one jump left in the row. Placed on its
 * own (absolute), so nothing else is laid out again; measured before the
 * paint and again when the row changes size. With reduced motion it is
 * simply there.
 *
 * It measures the row it is drawn in, its own parent: a ref handed down
 * from the row is still empty when a child's layout effect runs on the
 * first commit, and the line stayed away until the first tap.
 */
export function MetricTabLine({ value }: { value: string }) {
  const self = React.useRef<HTMLSpanElement>(null)
  const [at, setAt] = React.useState<{ x: number; w: number; glide: boolean } | null>(null)
  React.useLayoutEffect(() => {
    const el = self.current?.parentElement
    if (!el) return
    const calm = typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    /* The first placement is a cut; every one after it glides, a tab or a resize alike. */
    const place = () => {
      const on = el.querySelector<HTMLElement>(`[role="tab"][data-tab="${value}"]`)
      if (!on) return
      const x = on.offsetLeft
      const w = on.offsetWidth
      setAt((a) => (a && a.x === x && a.w === w ? a : { x, w, glide: !!a && !calm }))
    }
    place()
    const ro = typeof ResizeObserver === "function" ? new ResizeObserver(() => place()) : null
    ro?.observe(el)
    return () => ro?.disconnect()
  }, [value])
  return (
    <span
      ref={self}
      aria-hidden
      data-metric-tab-line=""
      data-glide={at?.glide ? "" : undefined}
      className={cn("pointer-events-none absolute bottom-0 left-0 z-[1] h-[1.5px] border-0", at?.glide && "transition-[translate,width] duration-[260ms] motion-reduce:transition-none")}
      style={{ background: METRIC_TAB_LINE, width: at?.w ?? 0, translate: `${at?.x ?? 0}px 0`, visibility: at ? "visible" : "hidden", transitionTimingFunction: "cubic-bezier(0.32,0.72,0,1)" }}
    />
  )
}

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
  line = true,
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
   * No figure has come back yet. The tab draws what it has (a zero, or the
   * figure from before) soft, the same blur as a figure being replaced, and
   * it clears to the real number over 700ms when the answer lands. "I don't
   * like the skeleton structure in the chart tabs; before it was the blur
   * thing, I liked those, revert it." A gray bar stood here for one round.
   */
  loading?: boolean
  /** Sample numbers, not the creator's: drawn fainter. */
  sample?: boolean
  onSelect: () => void
  className?: string
  /** False when the row draws one line that slides from tab to tab (Analytics' MetricTabLine) instead of each tab its own. */
  line?: boolean
}) {
  const blurred = soft || loading
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
      {selected && line ? <span aria-hidden data-metric-tab-line className="absolute inset-x-0 bottom-0 h-[1.5px]" style={{ background: METRIC_TAB_LINE }} /> : null}
      <span className={cn("block truncate text-[11px] font-medium sm:text-[12px]", selected ? "text-[#374151]" : "text-[#6b7280]")}>{label}</span>
      <span className="mt-0.5 flex min-w-0 items-baseline gap-1.5">
        <span
          className={cn(
            "truncate text-[18px] font-semibold tabular-nums tracking-tight transition-[filter,color,opacity] duration-[700ms] ease-[cubic-bezier(0.32,0.72,0,1)] sm:text-[22px]",
            sample ? "text-[#1a1a2e]/50" : "text-[#1a1a2e]",
            blurred ? "blur-[2px]" : "blur-0",
          )}
        >
          {value}
        </span>
        {/* The change against a figure that is not in yet would be a wrong number drawn sharp, so it waits for the answer. */}
        {loading ? null : change}
      </span>
      <span
        className={cn(
          "block truncate text-[10px] text-[#9ca3af] transition-[filter,opacity] duration-[700ms] ease-[cubic-bezier(0.32,0.72,0,1)] sm:text-[11px]",
          blurred ? "blur-[1px]" : "blur-0",
        )}
      >
        {foot}
      </span>
    </button>
  )
}
