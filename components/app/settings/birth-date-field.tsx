"use client"

import * as React from "react"
import { CalendarDays, ChevronDown } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { BottomSheet } from "@/components/ui/bottom-sheet"
import { usePhone } from "@/components/app/date-range-picker"
import { primaryDepth } from "@/components/ui/depth-button"
import { MonthGrid } from "@/components/onepage/date-time-field"
import { parts, ymdOf, type Ymd } from "@/lib/date-range/range"
import { cn } from "@/lib/utils"

const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

function todayLocal(): Ymd {
  const n = new Date()
  return ymdOf(n.getFullYear(), n.getMonth(), n.getDate())
}

function parseYmd(raw: string): Ymd | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw.trim())
  if (!m) return null
  const y = Number(m[1])
  const mo = Number(m[2]) - 1
  const d = Number(m[3])
  if (mo < 0 || mo > 11 || d < 1 || d > 31) return null
  const date = new Date(y, mo, d)
  if (date.getFullYear() !== y || date.getMonth() !== mo || date.getDate() !== d) return null
  return ymdOf(y, mo, d)
}

function formatYmd(ymd: Ymd): string {
  const p = parts(ymd)
  return `${MONTHS_SHORT[p.m]} ${p.d}, ${p.y}`
}

function toIso(ymd: Ymd): string {
  const p = parts(ymd)
  return `${p.y}-${String(p.m + 1).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`
}

export function BirthDateField({
  value,
  onChange,
  id,
  className,
  invalid,
  max,
  compact,
}: {
  value: string
  onChange: (iso: string) => void
  id?: string
  className?: string
  invalid?: boolean
  max?: string
  compact?: boolean
}) {
  const phone = usePhone()
  const [open, setOpen] = React.useState(false)
  const selected = parseYmd(value)
  const today = todayLocal()
  const maxYmd = max ? parseYmd(max) : today
  const label = selected ? formatYmd(selected) : "Select date"

  const pick = (d: Ymd) => {
    onChange(toIso(d))
    if (!phone) setOpen(false)
  }

  const trigger = (
    <button
      type="button"
      id={id}
      aria-haspopup="dialog"
      aria-invalid={invalid || undefined}
      data-birth-date-field=""
      data-open={open ? "" : undefined}
      onClick={phone ? () => setOpen(true) : undefined}
      className={cn(
        compact
          ? "flex h-10 w-full min-w-0 cursor-pointer items-center gap-2 rounded-[10px] border border-[#e3e5e8] bg-white px-3 text-left text-[14px] transition-[border-color,box-shadow] duration-150 hover:border-[#d5d8dd] focus-visible:border-[#c9ccd3] focus-visible:shadow-[0_0_0_3px_rgba(17,17,19,0.06)] sm:h-9 sm:rounded-lg sm:text-[13px]"
          : "flex h-11 w-full min-w-0 cursor-pointer items-center gap-2 rounded-[10px] border border-[#e3e5e8] bg-white px-3.5 text-left text-[16px] transition-[border-color,box-shadow] duration-150 hover:border-[#d5d8dd] focus-visible:border-[#c9ccd3] focus-visible:shadow-[0_0_0_3px_rgba(17,17,19,0.06)] sm:h-10 sm:rounded-lg sm:text-[14px]",
        selected ? "text-[#1a1a2e]" : "text-[#9ca3af]",
        invalid && "border-[#c4290c]",
        open && "border-[#c9ccd3] shadow-[0_0_0_3px_rgba(17,17,19,0.06)]",
        className,
      )}
    >
      <CalendarDays className="h-4 w-4 shrink-0 text-[#6b7280]" strokeWidth={1.75} aria-hidden />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <ChevronDown className={cn("h-4 w-4 shrink-0 text-[#9ca3af] transition-transform duration-150", open && "rotate-180")} aria-hidden />
    </button>
  )

  const panel = (compact: boolean) => (
    <div className={cn("flex flex-col", compact ? "gap-4" : "gap-3")}>
      <MonthGrid
        selected={selected}
        today={today}
        compact={compact}
        onPick={(d) => {
          if (maxYmd && d > maxYmd) return
          pick(d)
        }}
      />
      {phone ? (
        <button type="button" onClick={() => setOpen(false)} className={cn(primaryDepth, "h-11 w-full rounded-xl text-[14px]")}>
          Done
        </button>
      ) : null}
    </div>
  )

  if (phone) {
    return (
      <>
        {trigger}
        <BottomSheet isOpen={open} onClose={() => setOpen(false)} title="Date of birth" aboveKeyboard>
          <div className="px-5 pb-4 pt-1">{panel(true)}</div>
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
        collisionPadding={12}
        className="w-[min(308px,calc(100vw-24px))] rounded-2xl border border-[#e3e4e8] bg-white p-4 shadow-[0_16px_48px_-12px_rgba(17,24,39,0.28),0_2px_6px_rgba(17,24,39,0.06)]"
        onOpenAutoFocus={(e) => {
          e.preventDefault()
          const el = e.currentTarget as HTMLElement | null
          requestAnimationFrame(() => el?.querySelector<HTMLElement>('[data-day][tabindex="0"]')?.focus({ preventScroll: true }))
        }}
      >
        {panel(false)}
      </PopoverContent>
    </Popover>
  )
}
