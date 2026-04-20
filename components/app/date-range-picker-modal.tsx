"use client"

import { useEffect, useMemo, useState } from "react"
import { ChevronLeft, ChevronRight, X } from "lucide-react"
import { cn } from "@/lib/utils"

/**
 * Shopify-admin-style date range picker.
 *
 * - Left column: quick-select presets (Today, Last 7 days, etc.)
 * - Middle/right: two-month calendar grid, click to pick start → end
 * - Footer: textual range summary + Cancel/Apply
 *
 * Pure React, no external calendar lib — keeps bundle small and styling exact.
 */

type Preset =
  | "today"
  | "yesterday"
  | "last_7_days"
  | "last_30_days"
  | "last_90_days"
  | "week_to_date"
  | "month_to_date"
  | "year_to_date"
  | "last_month"

const PRESETS: { value: Preset; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "last_7_days", label: "Last 7 days" },
  { value: "last_30_days", label: "Last 30 days" },
  { value: "last_90_days", label: "Last 90 days" },
  { value: "week_to_date", label: "Week to date" },
  { value: "month_to_date", label: "Month to date" },
  { value: "year_to_date", label: "Year to date" },
  { value: "last_month", label: "Last month" },
]

const WEEKDAY_HEADERS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
]

function startOfDay(d: Date) {
  const out = new Date(d)
  out.setHours(0, 0, 0, 0)
  return out
}

function endOfDay(d: Date) {
  const out = new Date(d)
  out.setHours(23, 59, 59, 999)
  return out
}

function addDays(d: Date, n: number) {
  const out = new Date(d)
  out.setDate(out.getDate() + n)
  return out
}

function addMonths(d: Date, n: number) {
  const out = new Date(d)
  out.setMonth(out.getMonth() + n)
  return out
}

function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

function formatDateLabel(d: Date) {
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

function presetRange(preset: Preset): { start: Date; end: Date } {
  const now = new Date()
  const today = startOfDay(now)
  switch (preset) {
    case "today":
      return { start: today, end: endOfDay(now) }
    case "yesterday": {
      const y = addDays(today, -1)
      return { start: y, end: endOfDay(y) }
    }
    case "last_7_days":
      return { start: addDays(today, -6), end: endOfDay(now) }
    case "last_30_days":
      return { start: addDays(today, -29), end: endOfDay(now) }
    case "last_90_days":
      return { start: addDays(today, -89), end: endOfDay(now) }
    case "week_to_date": {
      const dow = today.getDay() // 0 = Sun
      return { start: addDays(today, -dow), end: endOfDay(now) }
    }
    case "month_to_date": {
      const s = new Date(today.getFullYear(), today.getMonth(), 1)
      return { start: s, end: endOfDay(now) }
    }
    case "year_to_date": {
      const s = new Date(today.getFullYear(), 0, 1)
      return { start: s, end: endOfDay(now) }
    }
    case "last_month": {
      const s = new Date(today.getFullYear(), today.getMonth() - 1, 1)
      const e = new Date(today.getFullYear(), today.getMonth(), 0)
      return { start: s, end: endOfDay(e) }
    }
  }
}

function buildMonthGrid(year: number, month: number) {
  // month is 0-indexed. Returns 6 rows × 7 cols of Date | null cells
  // (nulls for leading/trailing blanks outside the month).
  const firstOfMonth = new Date(year, month, 1)
  const firstDay = firstOfMonth.getDay() // 0 = Sun
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const grid: (Date | null)[] = []
  for (let i = 0; i < firstDay; i++) grid.push(null)
  for (let d = 1; d <= daysInMonth; d++) grid.push(new Date(year, month, d))
  while (grid.length % 7 !== 0) grid.push(null)
  return grid
}

export function DateRangePickerModal({
  open,
  onOpenChange,
  initialStart,
  initialEnd,
  onApply,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialStart?: Date | null
  initialEnd?: Date | null
  onApply: (start: Date, end: Date) => void
}) {
  const [start, setStart] = useState<Date | null>(initialStart ?? null)
  const [end, setEnd] = useState<Date | null>(initialEnd ?? null)
  const [hover, setHover] = useState<Date | null>(null)

  const baseMonth = useMemo(() => {
    const anchor = initialStart ?? new Date()
    return new Date(anchor.getFullYear(), anchor.getMonth(), 1)
  }, [initialStart])
  const [viewMonth, setViewMonth] = useState<Date>(baseMonth)

  // Reset state whenever the modal is opened fresh.
  useEffect(() => {
    if (open) {
      setStart(initialStart ?? null)
      setEnd(initialEnd ?? null)
      setHover(null)
      setViewMonth(baseMonth)
    }
  }, [open, initialStart, initialEnd, baseMonth])

  // Close on Escape.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, onOpenChange])

  const handleDayClick = (d: Date) => {
    if (!start || (start && end)) {
      setStart(startOfDay(d))
      setEnd(null)
      return
    }
    if (d < start) {
      setEnd(endOfDay(start))
      setStart(startOfDay(d))
    } else {
      setEnd(endOfDay(d))
    }
  }

  const applyPreset = (p: Preset) => {
    const r = presetRange(p)
    setStart(r.start)
    setEnd(r.end)
    setViewMonth(new Date(r.start.getFullYear(), r.start.getMonth(), 1))
  }

  const handleApply = () => {
    if (start && end) {
      onApply(start, end)
      onOpenChange(false)
    }
  }

  const nextMonth = addMonths(viewMonth, 1)

  const Month = ({ monthDate }: { monthDate: Date }) => {
    const grid = buildMonthGrid(monthDate.getFullYear(), monthDate.getMonth())
    const rangeEnd = end ?? hover
    return (
      <div className="flex-1 min-w-0">
        <div className="text-center text-[14px] font-semibold text-[#1a1a2e] mb-3">
          {MONTH_NAMES[monthDate.getMonth()]} {monthDate.getFullYear()}
        </div>
        <div className="grid grid-cols-7 text-center text-[11px] font-medium text-[#9ca3af] mb-1">
          {WEEKDAY_HEADERS.map((h) => (
            <div key={h} className="py-1">{h}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-y-1">
          {grid.map((d, i) => {
            if (!d) return <div key={i} />
            const isStart = start && isSameDay(d, start)
            const isEnd = end && isSameDay(d, end)
            const inRange =
              start && rangeEnd &&
              d > start && d < rangeEnd
            const isEndpoint = isStart || isEnd
            return (
              <button
                key={i}
                type="button"
                onClick={() => handleDayClick(d)}
                onMouseEnter={() => setHover(d)}
                onMouseLeave={() => setHover((h) => (h && isSameDay(h, d) ? null : h))}
                className={cn(
                  "mx-auto h-9 w-9 flex items-center justify-center text-[13px] rounded-lg transition-colors duration-150",
                  isEndpoint && "bg-[#1a1a2e] text-white font-semibold",
                  !isEndpoint && inRange && "bg-[#f3f4f6] text-[#1a1a2e]",
                  !isEndpoint && !inRange && "text-[#1a1a2e] hover:bg-[#f3f4f6]",
                )}
              >
                {d.getDate()}
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <>
      {/* Overlay */}
      <div
        className={cn(
          "fixed inset-0 z-[90] bg-black/30 transition-opacity duration-[200ms] ease-[cubic-bezier(0.32,0.72,0,1)]",
          open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none",
        )}
        onClick={() => onOpenChange(false)}
        aria-hidden="true"
      />
      {/* Card */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Select date range"
        className={cn(
          "fixed z-[91] left-1/2 top-1/2 w-[min(960px,calc(100vw-32px))] max-h-[calc(100svh-32px)] overflow-y-auto -translate-x-1/2 -translate-y-1/2 bg-white rounded-2xl border border-[#e5e7eb] shadow-[0_24px_48px_-12px_rgba(17,24,39,0.22)] transition-all duration-[220ms] ease-[cubic-bezier(0.32,0.72,0,1)]",
          open
            ? "opacity-100 scale-100 pointer-events-auto"
            : "opacity-0 scale-[0.98] pointer-events-none",
        )}
      >
        <div className="flex flex-col md:flex-row">
          {/* Presets column */}
          <div className="md:w-[180px] md:border-r md:border-[#e5e7eb] p-3">
            <div className="flex items-center justify-between md:hidden pb-2">
              <span className="text-[13px] font-semibold text-[#1a1a2e]">Range</span>
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="h-7 w-7 flex items-center justify-center rounded-md text-[#6b7280] hover:bg-[#f3f4f6] transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex md:flex-col gap-1 overflow-x-auto md:overflow-visible">
              {PRESETS.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => applyPreset(p.value)}
                  className="shrink-0 md:shrink md:w-full text-left px-3 py-2 text-[13px] font-medium text-[#374151] rounded-lg hover:bg-[#f3f4f6] transition-colors whitespace-nowrap"
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Calendar area */}
          <div className="flex-1 p-4 md:p-6">
            <div className="flex items-center justify-between mb-3">
              <button
                type="button"
                onClick={() => setViewMonth(addMonths(viewMonth, -1))}
                className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-[#f3f4f6] text-[#6b7280] transition-colors"
                aria-label="Previous month"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setViewMonth(addMonths(viewMonth, 1))}
                className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-[#f3f4f6] text-[#6b7280] transition-colors"
                aria-label="Next month"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
            <div className="flex flex-col md:flex-row gap-6">
              <Month monthDate={viewMonth} />
              <Month monthDate={nextMonth} />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 border-t border-[#e5e7eb] px-4 md:px-6 py-3">
          <div className="text-[13px] text-[#374151]">
            {start ? formatDateLabel(start) : "Start"}
            <span className="mx-2 text-[#9ca3af]">–</span>
            {end ? formatDateLabel(end) : "End"}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="h-9 px-4 rounded-lg bg-[#f3f4f6] hover:bg-[#e5e7eb] text-[13px] font-medium text-[#374151] transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleApply}
              disabled={!start || !end}
              className="h-9 px-4 rounded-lg bg-[#2463eb] hover:bg-[#1d4ed8] text-[13px] font-semibold text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Apply
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
