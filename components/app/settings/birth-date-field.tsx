"use client"

import * as React from "react"
import { CalendarDays } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { BottomSheet } from "@/components/ui/bottom-sheet"
import { usePhone } from "@/components/app/date-range-picker"
import { primaryDepth } from "@/components/ui/depth-button"
import { MonthGrid } from "@/components/onepage/date-time-field"
import { maskDobTyping, normalizeDobInput } from "@/lib/payments/stripe/details-fields"
import { parts, ymdOf, type Ymd } from "@/lib/date-range/range"
import { cn } from "@/lib/utils"

function todayLocal(): Ymd {
  const n = new Date()
  return ymdOf(n.getFullYear(), n.getMonth(), n.getDate())
}

function parseYmd(raw: string): Ymd | null {
  const iso = normalizeDobInput(raw)
  if (!iso) return null
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!m) return null
  const y = Number(m[1])
  const mo = Number(m[2]) - 1
  const d = Number(m[3])
  return ymdOf(y, mo, d)
}

function toIso(ymd: Ymd): string {
  const p = parts(ymd)
  return `${p.y}-${String(p.m + 1).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`
}

function formatWhileTyping(next: string): string {
  if (/[/.]/.test(next)) return next.replace(/[^\d/.-]/g, "").slice(0, 10)
  return maskDobTyping(next)
}

const FIELD =
  "h-11 w-full min-w-0 rounded-[10px] border border-[#e3e5e8] bg-white px-3.5 text-[16px] text-[#1a1a2e] outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-[#9ca3af] hover:border-[#d5d8dd] focus:border-[#c9ccd3] focus:shadow-[0_0_0_3px_rgba(17,17,19,0.06)] sm:h-10 sm:rounded-lg sm:text-[14px]"
const FIELD_COMPACT =
  "h-10 w-full min-w-0 rounded-[10px] border border-[#e3e5e8] bg-white px-3 text-[14px] text-[#1a1a2e] outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-[#9ca3af] hover:border-[#d5d8dd] focus:border-[#c9ccd3] focus:shadow-[0_0_0_3px_rgba(17,17,19,0.06)] sm:h-9 sm:rounded-lg sm:text-[13px]"

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
  const [focused, setFocused] = React.useState(false)
  const [draft, setDraft] = React.useState("")
  const inputRef = React.useRef<HTMLInputElement>(null)
  const selected = parseYmd(value)
  const today = todayLocal()
  const maxYmd = max ? parseYmd(max) : today
  const maxIso = maxYmd ? toIso(maxYmd) : null

  const display = focused ? draft : value || ""

  React.useEffect(() => {
    if (!focused) setDraft(value || "")
  }, [value, focused])

  const commit = (raw: string) => {
    const iso = normalizeDobInput(raw)
    if (!iso) {
      onChange(raw.trim())
      return
    }
    if (maxIso && iso > maxIso) {
      onChange(raw.trim())
      return
    }
    onChange(iso)
    setDraft(iso)
  }

  const pick = (d: Ymd) => {
    if (maxYmd && d > maxYmd) return
    const iso = toIso(d)
    onChange(iso)
    setDraft(iso)
    if (!phone) setOpen(false)
    inputRef.current?.focus()
  }

  const fieldClass = cn(compact ? FIELD_COMPACT : FIELD, "pr-10", invalid && "border-[#c4290c] hover:border-[#c4290c] focus:border-[#c4290c] focus:shadow-[0_0_0_3px_rgba(196,41,12,0.1)]", className)

  const panel = (sheet: boolean) => (
    <div className={cn("flex flex-col", sheet ? "gap-4" : "gap-3")}>
      <MonthGrid
        selected={selected}
        today={today}
        compact={sheet}
        onPick={pick}
      />
      {sheet ? (
        <button type="button" onClick={() => setOpen(false)} className={cn(primaryDepth, "h-11 w-full rounded-xl text-[14px]")}>
          Done
        </button>
      ) : null}
    </div>
  )

  const calendarButton = (
    <button
      type="button"
      aria-label="Choose date"
      data-birth-date-picker=""
      onClick={() => {
        if (phone) setOpen(true)
      }}
      className={cn(
        "absolute right-1 top-1/2 flex h-8 w-8 -translate-y-1/2 cursor-pointer items-center justify-center rounded-lg text-[#6b7280] outline-none transition-colors hover:bg-[#f4f4f6] hover:text-[#1a1a2e] focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/20",
        open && !phone && "bg-[#f4f4f6] text-[#1a1a2e]",
      )}
    >
      <CalendarDays className="h-4 w-4" strokeWidth={1.75} aria-hidden />
    </button>
  )

  const input = (
    <input
      ref={inputRef}
      id={id}
      type="text"
      inputMode="numeric"
      autoComplete="bday"
      spellCheck={false}
      placeholder="1990-05-02"
      aria-invalid={invalid || undefined}
      data-birth-date-field=""
      value={display}
      onFocus={() => {
        setFocused(true)
        setDraft(value || "")
      }}
      onBlur={() => {
        setFocused(false)
        commit(draft)
      }}
      onChange={(e) => {
        const next = formatWhileTyping(e.target.value)
        setDraft(next)
        const iso = normalizeDobInput(next)
        if (iso && (!maxIso || iso <= maxIso)) onChange(iso)
        else if (!next.trim()) onChange("")
        else onChange(next)
      }}
      className={fieldClass}
    />
  )

  if (phone) {
    return (
      <div className="relative w-full" data-birth-date-wrap="">
        {input}
        {calendarButton}
        <BottomSheet isOpen={open} onClose={() => setOpen(false)} title="Date of birth" aboveKeyboard>
          <div className="px-5 pb-4 pt-1">{panel(true)}</div>
        </BottomSheet>
      </div>
    )
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <div className="relative w-full" data-birth-date-wrap="">
        {input}
        <PopoverTrigger asChild>{calendarButton}</PopoverTrigger>
      </div>
      <PopoverContent
        align="end"
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
