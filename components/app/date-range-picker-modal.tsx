"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { ChevronLeft, ChevronRight, X } from "lucide-react"
import { cn } from "@/lib/utils"

/**
 * Shopify-admin-style date range picker.
 *
 * - Mobile: iOS-style bottom sheet (slides up, dim backdrop, drag handle).
 * - Desktop: centered modal with subtle backdrop, fade + gentle scale.
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
      const dow = today.getDay()
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
  const firstOfMonth = new Date(year, month, 1)
  const firstDay = firstOfMonth.getDay()
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

  // Mount/unmount with animation — keep mounted briefly after close so the
  // exit transition has time to play, then fully unmount to free memory.
  const [mounted, setMounted] = useState(open)
  const [entered, setEntered] = useState(false)

  // Drag-to-dismiss state (mobile only). dragY is applied as translateY while
  // the finger is down; on release we either snap back or commit to close.
  const [dragY, setDragY] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const [isDesktop, setIsDesktop] = useState(false)
  const sheetRef = useRef<HTMLDivElement>(null)
  const dragStartYRef = useRef(0)
  const dragLastYRef = useRef(0)
  const dragLastTimeRef = useRef(0)
  const dragVelocityRef = useRef(0)

  // Track viewport so we can apply different motion (slide vs scale) per size.
  useEffect(() => {
    const mql = window.matchMedia("(min-width: 768px)")
    const update = () => setIsDesktop(mql.matches)
    update()
    mql.addEventListener("change", update)
    return () => mql.removeEventListener("change", update)
  }, [])

  const baseMonth = useMemo(() => {
    const anchor = initialStart ?? new Date()
    return new Date(anchor.getFullYear(), anchor.getMonth(), 1)
  }, [initialStart])
  const [viewMonth, setViewMonth] = useState<Date>(baseMonth)

  // Mount / enter on open. Unmount after exit transition on close.
  useEffect(() => {
    if (open) {
      setMounted(true)
      setStart(initialStart ?? null)
      setEnd(initialEnd ?? null)
      setHover(null)
      setViewMonth(baseMonth)
      // Double rAF so the browser paints the "closed" state once before
      // flipping to the "open" state — guarantees the transition fires.
      const r1 = requestAnimationFrame(() => {
        const r2 = requestAnimationFrame(() => setEntered(true))
        return () => cancelAnimationFrame(r2)
      })
      return () => cancelAnimationFrame(r1)
    }
    setEntered(false)
    const t = setTimeout(() => setMounted(false), 360)
    return () => clearTimeout(t)
  }, [open, initialStart, initialEnd, baseMonth])

  // Lock body scroll while open so the backdrop can't be scrolled through.
  useEffect(() => {
    if (!open) return
    const prevOverflow = document.body.style.overflow
    const prevOverscroll = document.documentElement.style.overscrollBehavior
    document.body.style.overflow = "hidden"
    document.documentElement.style.overscrollBehavior = "none"
    return () => {
      document.body.style.overflow = prevOverflow
      document.documentElement.style.overscrollBehavior = prevOverscroll
    }
  }, [open])

  // Close on Escape.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, onOpenChange])

  // Reset drag offset whenever the sheet closes so it starts clean next open.
  useEffect(() => {
    if (!open) {
      setDragY(0)
      setIsDragging(false)
      dragVelocityRef.current = 0
    }
  }, [open])

  // Begin drag only when the touch starts on the handle/header region
  // (first ~80px of the sheet) so the calendar grid and preset scroller
  // stay usable and don't fight the drag gesture.
  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0]
    const sheetEl = sheetRef.current
    if (!sheetEl) return
    const rect = sheetEl.getBoundingClientRect()
    const touchYInSheet = touch.clientY - rect.top
    if (touchYInSheet > 80) return
    dragStartYRef.current = touch.clientY
    dragLastYRef.current = touch.clientY
    dragLastTimeRef.current = Date.now()
    dragVelocityRef.current = 0
    setIsDragging(true)
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging) return
    const currentY = e.touches[0].clientY
    const diff = currentY - dragStartYRef.current
    if (diff > 0) {
      e.preventDefault()
      const now = Date.now()
      const dt = Math.max(1, now - dragLastTimeRef.current)
      dragVelocityRef.current = (currentY - dragLastYRef.current) / dt
      dragLastYRef.current = currentY
      dragLastTimeRef.current = now
      // Light rubber-banding past 160px so the sheet never feels stuck.
      const resisted = diff <= 160 ? diff * 0.92 : 147 + (diff - 160) * 0.4
      setDragY(resisted)
    } else {
      setDragY(0)
    }
  }

  const handleTouchEnd = () => {
    if (!isDragging) return
    setIsDragging(false)
    // Commit close on big drop OR fast downward flick; otherwise snap back.
    if (dragY > 100 || dragVelocityRef.current > 0.55) {
      onOpenChange(false)
    } else {
      setDragY(0)
    }
  }

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

  if (!mounted) return null

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
      {/* Backdrop — dim on both mobile and desktop for clear modal feel.
          Opacity tracks finger drag on mobile so backdrop lifts with the sheet. */}
      <div
        className={cn(
          "fixed inset-0 z-[120] bg-black/40 md:bg-black/30 backdrop-blur-[2px]",
        )}
        style={{
          opacity: entered
            ? isDesktop
              ? 1
              : Math.max(0, 1 - dragY / 400)
            : 0,
          transition: isDragging
            ? "none"
            : isDesktop
            ? "opacity 220ms cubic-bezier(0.32, 0.72, 0, 1)"
            : "opacity 360ms cubic-bezier(0.32, 0.72, 0, 1)",
        }}
        onClick={() => onOpenChange(false)}
        aria-hidden="true"
      />

      {/* Centering wrapper — bottom-aligned on mobile, center on desktop. */}
      <div className="fixed inset-0 z-[121] pointer-events-none flex items-end md:items-center justify-center md:p-4">
        <div
          ref={sheetRef}
          role="dialog"
          aria-modal="true"
          aria-label="Select date range"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onTouchCancel={handleTouchEnd}
          className={cn(
            "relative bg-white flex flex-col overflow-hidden w-full max-h-[92svh] rounded-t-[24px] shadow-[0_-12px_40px_-12px_rgba(17,24,39,0.22)] pointer-events-auto",
            "md:w-[min(720px,100%)] md:max-h-[calc(100svh-32px)] md:rounded-2xl md:border md:border-[#e5e7eb] md:shadow-[0_16px_40px_-12px_rgba(17,24,39,0.22)]",
          )}
          style={{
            willChange: "transform, opacity",
            WebkitBackfaceVisibility: "hidden",
            backfaceVisibility: "hidden",
            // Desktop: fade + gentle scale. Mobile: slide up from bottom, with
            // 1:1 finger tracking while dragging (transition disabled then).
            transform: isDesktop
              ? entered
                ? "translate3d(0, 0, 0) scale(1)"
                : "translate3d(0, 0, 0) scale(0.97)"
              : entered
              ? `translate3d(0, ${dragY}px, 0)`
              : "translate3d(0, 100%, 0)",
            transition: isDragging
              ? "none"
              : isDesktop
              ? "transform 240ms cubic-bezier(0.32, 0.72, 0, 1), opacity 240ms cubic-bezier(0.32, 0.72, 0, 1)"
              : "transform 420ms cubic-bezier(0.32, 0.72, 0, 1), opacity 420ms cubic-bezier(0.32, 0.72, 0, 1)",
            opacity: entered ? 1 : 0,
            touchAction: "pan-y",
          }}
        >
          {/* Mobile drag handle — touch-none so iOS hands the gesture to our
              drag tracker instead of treating it as a scroll. */}
          <div className="md:hidden flex justify-center pt-3 pb-1 shrink-0 touch-none cursor-grab active:cursor-grabbing">
            <div className="h-[5px] w-10 rounded-full bg-[#d1d5db]" />
          </div>

          {/* Mobile header */}
          <div className="md:hidden flex items-center justify-between px-4 pt-1 pb-2 shrink-0 touch-none">
            <span className="text-[15px] font-semibold text-[#1a1a2e]">Select date range</span>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="h-8 w-8 flex items-center justify-center rounded-lg text-[#6b7280] hover:bg-[#f3f4f6] transition-colors"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex flex-col md:flex-row flex-1 min-h-0 overflow-y-auto overscroll-contain">
            {/* Presets — horizontal pills on mobile, column on desktop */}
            <div className="md:w-[160px] md:border-r md:border-[#e5e7eb] px-3 py-2 md:p-3 shrink-0">
              <div className="flex md:flex-col gap-1.5 md:gap-1 overflow-x-auto md:overflow-visible -mx-1 px-1 md:mx-0 md:px-0 scrollbar-hide">
                {PRESETS.map((p) => (
                  <button
                    key={p.value}
                    type="button"
                    onClick={() => applyPreset(p.value)}
                    className="shrink-0 md:shrink md:w-full text-left px-3 py-1.5 md:py-2 text-[13px] font-medium text-[#374151] rounded-full md:rounded-lg bg-[#f3f4f6] md:bg-transparent hover:bg-[#e5e7eb] md:hover:bg-[#f3f4f6] transition-colors whitespace-nowrap active:scale-[0.97]"
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Calendar area */}
            <div className="flex-1 p-4 md:p-5 min-w-0">
              <div className="flex items-center justify-between mb-3">
                <button
                  type="button"
                  onClick={() => setViewMonth(addMonths(viewMonth, -1))}
                  className="h-9 w-9 flex items-center justify-center rounded-lg hover:bg-[#f3f4f6] text-[#6b7280] transition-colors active:scale-95"
                  aria-label="Previous month"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setViewMonth(addMonths(viewMonth, 1))}
                  className="h-9 w-9 flex items-center justify-center rounded-lg hover:bg-[#f3f4f6] text-[#6b7280] transition-colors active:scale-95"
                  aria-label="Next month"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
              <div className="flex flex-col md:flex-row gap-5">
                <Month monthDate={viewMonth} />
                <div className="hidden md:block flex-1 min-w-0">
                  <Month monthDate={nextMonth} />
                </div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between gap-3 border-t border-[#e5e7eb] px-4 md:px-5 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,_0px))] md:pb-3 bg-white shrink-0">
            <div className="text-[12px] md:text-[13px] text-[#374151] truncate">
              {start ? formatDateLabel(start) : "Start"}
              <span className="mx-2 text-[#9ca3af]">–</span>
              {end ? formatDateLabel(end) : "End"}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="h-9 px-4 rounded-lg bg-[#f3f4f6] hover:bg-[#e5e7eb] text-[13px] font-medium text-[#374151] transition-colors active:scale-[0.98]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleApply}
                disabled={!start || !end}
                className="h-9 px-4 rounded-lg bg-[#8b5cf6] hover:bg-[#7c3aed] text-[13px] font-semibold text-white transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
