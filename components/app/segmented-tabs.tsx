"use client"

/**
 * ===========================================================================
 *  A SEGMENTED CONTROL THAT SWITCHES A VIEW: All, Digital products, ...
 * ===========================================================================
 * The same track and white thumb as the segmented choices in /app (Settings ›
 * Checkout's, the email editor's Preview and Edit), used where one choice
 * changes what the card below shows, so it is a set of tabs for a screen
 * reader (role=tablist) rather than a radio group.
 *
 *   one thumb that slides   one white thumb under the words, moved with
 *                           transform only; every segment the same width, so
 *                           the thumb never changes size and nothing is laid
 *                           out again while it moves. The words cross fade
 *                           between their quiet and their chosen colour by
 *                           opacity, two layers of the same label, so nothing
 *                           but transform and opacity is animated.
 *   the keyboard            one tab stop (the chosen segment); the arrows move
 *                           and choose, Home and End go to the ends, as WAI's
 *                           tabs with automatic activation
 *   a phone                 as wide as its card, each segment a share of it,
 *                           36px tall inside a 44px track, a shorter label
 *                           where one is given (`short`)
 *   reduced motion          no slide and no fade: the thumb is just there
 */
import * as React from "react"
import { cn } from "@/lib/utils"

export interface SegmentedTab<T extends string> {
  id: T
  label: string
  /** The words on a phone, when the label is long ("Digital" for "Digital products"). */
  short?: string
}

export function SegmentedTabs<T extends string>({
  value,
  onChange,
  tabs,
  label,
  controls,
  className,
  idPrefix = "seg",
}: {
  value: T
  onChange: (v: T) => void
  tabs: SegmentedTab<T>[]
  /** What the choice is about, for a screen reader ("Email families"). */
  label: string
  /** The id of the panel the tabs change. */
  controls?: string
  className?: string
  idPrefix?: string
}) {
  const refs = React.useRef<Array<HTMLButtonElement | null>>([])
  const index = Math.max(0, tabs.findIndex((t) => t.id === value))
  const pick = (i: number) => {
    const n = tabs.length
    const next = ((i % n) + n) % n
    onChange(tabs[next].id)
    refs.current[next]?.focus()
  }
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowRight" || e.key === "ArrowDown") pick(index + 1)
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") pick(index - 1)
    else if (e.key === "Home") pick(0)
    else if (e.key === "End") pick(tabs.length - 1)
    else return
    e.preventDefault()
  }
  return (
    <div
      role="tablist"
      aria-label={label}
      onKeyDown={onKeyDown}
      className={cn("relative grid w-full rounded-xl bg-[#f1f2f4] p-1 sm:inline-grid sm:w-auto", className)}
      style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}
      data-segmented-tabs=""
    >
      {/* The thumb: one segment wide, moved a whole segment at a time. */}
      <span
        aria-hidden
        className="pointer-events-none absolute bottom-1 left-1 top-1 rounded-lg bg-white shadow-[0_1px_2px_rgba(16,24,40,0.08),0_1px_1px_rgba(16,24,40,0.04)] transition-[transform] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] will-change-transform motion-reduce:transition-none"
        style={{ width: `calc((100% - 8px) / ${tabs.length})`, transform: `translate3d(${index * 100}%,0,0)` }}
        data-segmented-thumb=""
      />
      {tabs.map((t, i) => {
        const on = i === index
        const words = (
          <>
            <span className="hidden sm:inline">{t.label}</span>
            <span className="sm:hidden">{t.short ?? t.label}</span>
          </>
        )
        return (
          <button
            key={t.id}
            ref={(el) => {
              refs.current[i] = el
            }}
            type="button"
            role="tab"
            id={`${idPrefix}-${t.id}`}
            aria-selected={on}
            aria-controls={controls}
            tabIndex={on ? 0 : -1}
            onClick={() => onChange(t.id)}
            className="relative z-[1] grid h-9 min-w-0 cursor-pointer place-items-center rounded-lg px-1.5 text-[12.5px] font-medium sm:text-[13px] outline-none [-webkit-tap-highlight-color:transparent] focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/20 sm:h-8 sm:px-3.5"
            data-segment={t.id}
          >
            {/* Two layers of the same words: the quiet one and the chosen one, cross faded. */}
            <span aria-hidden className={cn("col-start-1 row-start-1 truncate whitespace-nowrap text-[#6b7280] transition-opacity duration-200 motion-reduce:transition-none", on ? "opacity-0" : "opacity-100")}>
              {words}
            </span>
            <span className={cn("col-start-1 row-start-1 truncate whitespace-nowrap text-[#1a1a2e] transition-opacity duration-200 motion-reduce:transition-none", on ? "opacity-100" : "opacity-0")}>{words}</span>
          </button>
        )
      })}
    </div>
  )
}
