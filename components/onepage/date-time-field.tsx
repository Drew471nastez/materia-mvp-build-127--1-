"use client"

/**
 * ===========================================================================
 *  A DAY AND A TIME, FOR A BLOCK'S SCHEDULE AND A COUNTDOWN
 * ===========================================================================
 * The owner: "It doesn't have a calendar which is minimal and clean, adapted
 * to our UI. I don't like the time input, it looks clunky." It was the
 * browser's <input type="datetime-local">: a box reading "mm/dd/yyyy, --:--
 * --" with a grey calendar icon, whose picker is the operating system's own
 * (a different one in every browser, a spinning wheel on an iPhone), and
 * whose text changes shape with the visitor's locale.
 *
 * Now it is a field that says the moment in words ("Jan 2, 6:00 PM", or
 * "Any time" when there is none) and opens:
 *
 *   A MONTH        seven columns, six rows always (so moving between months
 *                  never changes the height of anything), Sunday first as the
 *                  app's date range picker has it. Today has a dot under it;
 *                  the chosen day is dark. The arrows are small raised keys.
 *                  The arrow keys move between days.
 *   A TIME         hour and minute as two small boxes you type into (or step
 *                  with the arrow keys), and AM or PM beside them. Typing
 *                  "6" moves on to the minutes by itself; "1" waits, because
 *                  it might be 10, 11 or 12.
 *   CLEAR, DONE    Clear empties the field; Done closes. Nothing waits for
 *                  Done: every choice is written as it is made, so closing
 *                  the popover any other way loses nothing.
 *
 * A popover under the field on a computer; the app's shared BottomSheet on a
 * phone (components/ui/bottom-sheet), with 44px days.
 *
 * TIMES ARE THE CREATOR'S. The day and the clock are read and written in the
 * creator's own time zone (lib/onepage/schedule), which the schedule panel
 * names under its fields, and stored as an instant, which is what the live
 * page compares with the time now.
 */
import * as React from "react"
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { BottomSheet } from "@/components/ui/bottom-sheet"
import { usePhone } from "@/components/app/date-range-picker"
import { primaryDepth, secondaryDepth } from "@/components/ui/depth-button"
import { addDays, parts, ymdOf, type Ymd } from "@/lib/date-range/range"
import { dayLabel, from12, isoFromWall, timeLabel, to12, todayIn, viewerZone, wallFromIso } from "@/lib/onepage/schedule"
import { cn } from "@/lib/utils"

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"]
const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]
const focusRing = "outline-none focus-visible:shadow-[0_0_0_2px_#fff,0_0_0_4px_rgba(26,26,46,0.45)]"

/** Always six weeks, so every month is the same height. */
function monthCells(y: number, m: number): (Ymd | null)[] {
  const first = new Date(Date.UTC(y, m, 1)).getUTCDay()
  const days = new Date(Date.UTC(y, m + 1, 0)).getUTCDate()
  const cells: (Ymd | null)[] = Array.from({ length: first }, () => null)
  for (let d = 1; d <= days; d++) cells.push(ymdOf(y, m, d))
  while (cells.length < 42) cells.push(null)
  return cells
}

function MonthGrid({
  selected,
  today,
  onPick,
  compact,
  before,
}: {
  selected: Ymd | null
  today: Ymd
  onPick: (d: Ymd) => void
  compact: boolean
  /** Days before this are drawn quieter (an end before its start would never show). */
  before?: Ymd | null
}) {
  /* Opens on the chosen day; with none, on the day it may not be before (an end after a far start), or today. */
  const opensOn = selected ?? (before && before > today ? before : today)
  const start = parts(opensOn)
  const [view, setView] = React.useState({ y: start.y, m: start.m })
  const [focusDay, setFocusDay] = React.useState<Ymd>(opensOn)
  const gridRef = React.useRef<HTMLDivElement>(null)
  const go = (delta: number) => setView((v) => ({ y: v.y + Math.floor((v.m + delta) / 12), m: (((v.m + delta) % 12) + 12) % 12 }))
  const cells = monthCells(view.y, view.m)
  const size = compact ? "h-11 w-11 text-[16px]" : "h-9 w-9 text-[13.5px]"

  const onKey = (e: React.KeyboardEvent) => {
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key]
    if (step === undefined) return
    e.preventDefault()
    const next = addDays(focusDay, step)
    const p = parts(next)
    setFocusDay(next)
    if (p.y !== view.y || p.m !== view.m) setView({ y: p.y, m: p.m })
    requestAnimationFrame(() => gridRef.current?.querySelector<HTMLButtonElement>(`[data-day="${next}"]`)?.focus())
  }

  const nav = cn(secondaryDepth, "rounded-lg text-[#303036]", compact ? "h-11 w-11" : "h-8 w-8")
  return (
    <div data-month-grid="" className="w-full">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className={cn("font-semibold text-[#1a1a2e]", compact ? "text-[17px]" : "text-[14.5px]")} aria-live="polite">
          {MONTHS_LONG[view.m]} {view.y}
        </p>
        <div className="flex gap-1.5">
          <button type="button" aria-label="Previous month" data-month-prev="" onClick={() => go(-1)} className={nav}>
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button type="button" aria-label="Next month" data-month-next="" onClick={() => go(1)} className={nav}>
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div className={cn("grid grid-cols-7 pb-1 text-center font-medium text-[#8b8f98]", compact ? "text-[12.5px]" : "text-[11.5px]")} aria-hidden>
        {WEEKDAYS.map((w) => (
          <div key={w}>{w}</div>
        ))}
      </div>
      <div ref={gridRef} role="grid" aria-label={`${MONTHS_LONG[view.m]} ${view.y}`} className="grid grid-cols-7 justify-items-center gap-y-0.5" onKeyDown={onKey}>
        {cells.map((d, i) => {
          /* An empty square keeps its place in the grid, so the 1st sits under its own weekday. */
          if (!d) return <span key={i} aria-hidden className={size} />
          const on = !!d && d === selected
          const isToday = !!d && d === today
          const quiet = !!d && !!before && d < before
          return (
            <button
              key={i}
              type="button"
              data-day={d ?? undefined}
              tabIndex={d && d === focusDay ? 0 : -1}
              aria-pressed={on}
              aria-current={isToday ? "date" : undefined}
              aria-label={d ? dayLabel(d) : undefined}
              onClick={() => d && onPick(d)}
              onFocus={() => d && setFocusDay(d)}
              className={cn(
                "relative flex cursor-pointer items-center justify-center rounded-lg tabular-nums transition-[background-color,color] duration-150",
                focusRing,
                size,
                on
                  ? "bg-[#1a1a2e] font-semibold text-white shadow-[0_1px_2px_rgba(17,24,39,0.25),inset_0_1px_0_rgba(255,255,255,0.12)]"
                  : cn(quiet ? "text-[#b8bbc2]" : "text-[#1a1a2e]", "hover:bg-[#efeff3] active:bg-[#e4e4e9]", isToday && "font-semibold"),
              )}
            >
              {d ? parts(d).d : ""}
              {isToday && !on ? <span aria-hidden className={cn("absolute left-1/2 -ml-0.5 h-1 w-1 rounded-full bg-current", compact ? "bottom-[6px]" : "bottom-[4px]")} /> : null}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/**
 * Hour and minute you type into, and AM or PM. `onChange` is given the
 * 24 hour clock. A box keeps what is being typed until it makes a time, and
 * says the time again when it loses focus.
 */
export function TimeInput({ hour, minute, onChange, compact }: { hour: number; minute: number; onChange: (hour: number, minute: number) => void; compact: boolean }) {
  const { hour12, pm } = to12(hour)
  const [hText, setHText] = React.useState(String(hour12))
  const [mText, setMText] = React.useState(String(minute).padStart(2, "0"))
  const hFocused = React.useRef(false)
  const mFocused = React.useRef(false)
  const minuteRef = React.useRef<HTMLInputElement>(null)
  React.useEffect(() => {
    if (!hFocused.current) setHText(String(hour12))
  }, [hour12])
  React.useEffect(() => {
    if (!mFocused.current) setMText(String(minute).padStart(2, "0"))
  }, [minute])

  const box = cn(
    "w-[2.4ch] bg-transparent text-center font-medium tabular-nums text-[#1a1a2e] outline-none rounded-md focus:bg-[#efeff3]",
    compact ? "h-9 text-[18px]" : "h-8 text-[15px]",
  )
  const stepKeys = (e: React.KeyboardEvent, which: "h" | "m") => {
    const d = { ArrowUp: 1, ArrowDown: -1 }[e.key]
    if (d === undefined) return
    e.preventDefault()
    if (which === "h") onChange((hour + d + 24) % 24, minute)
    else {
      const step = e.shiftKey ? 15 : 1
      const total = (hour * 60 + minute + d * step + 1440) % 1440
      onChange(Math.floor(total / 60), total % 60)
    }
  }

  return (
    <div className="flex items-center gap-2" data-time-input="">
      <div className={cn("inline-flex items-center rounded-xl border border-[#e3e4e8] bg-white px-2 transition-[border-color,box-shadow] focus-within:border-[#1a1a2e] focus-within:shadow-[0_0_0_3px_rgba(26,26,46,0.08)]", compact ? "h-12" : "h-10")}>
        <input
          aria-label="Hour"
          data-time-hour=""
          inputMode="numeric"
          autoComplete="off"
          value={hText}
          onFocus={(e) => {
            hFocused.current = true
            e.currentTarget.select()
          }}
          onBlur={() => {
            hFocused.current = false
            setHText(String(to12(hour).hour12))
          }}
          onKeyDown={(e) => stepKeys(e, "h")}
          onChange={(e) => {
            let t = e.target.value.replace(/\D/g, "").slice(-2)
            if (Number(t) > 12) t = t.slice(-1)
            setHText(t)
            const n = Number(t)
            if (n >= 1 && n <= 12) {
              onChange(from12(n, pm), minute)
              /* One digit that cannot start a two digit hour (2 to 9), or a whole two digit one: on to the minutes. */
              if (t.length === 2 || n >= 2) minuteRef.current?.focus()
            }
          }}
          className={box}
        />
        <span aria-hidden className={cn("font-medium text-[#6b7280]", compact ? "text-[18px]" : "text-[15px]")}>:</span>
        <input
          ref={minuteRef}
          aria-label="Minute"
          data-time-minute=""
          inputMode="numeric"
          autoComplete="off"
          value={mText}
          onFocus={(e) => {
            mFocused.current = true
            e.currentTarget.select()
          }}
          onBlur={() => {
            mFocused.current = false
            setMText(String(minute).padStart(2, "0"))
          }}
          onKeyDown={(e) => stepKeys(e, "m")}
          onChange={(e) => {
            let t = e.target.value.replace(/\D/g, "").slice(-2)
            if (Number(t) > 59) t = t.slice(-1)
            setMText(t)
            if (t !== "") onChange(hour, Number(t))
          }}
          className={box}
        />
      </div>
      <div role="radiogroup" aria-label="Morning or afternoon" className={cn("inline-flex rounded-xl bg-[#f1f2f4] p-1", compact ? "h-12" : "h-10")}>
        {(["AM", "PM"] as const).map((x) => {
          const on = (x === "PM") === pm
          return (
            <button
              key={x}
              type="button"
              role="radio"
              aria-checked={on}
              data-time-ampm={x}
              onClick={() => onChange(from12(hour12, x === "PM"), minute)}
              className={cn(
                "cursor-pointer rounded-lg px-3 text-[13px] font-semibold transition-[background-color,color,box-shadow] duration-150",
                focusRing,
                on ? "bg-white text-[#1a1a2e] shadow-[0_1px_2px_rgba(16,24,40,0.12)]" : "text-[#6b7280] hover:text-[#1a1a2e]",
              )}
            >
              {x}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export interface DateTimeFieldProps {
  /** The stored instant (ISO), or null for none. */
  value: string | null | undefined
  onChange: (iso: string | null) => void
  /** Names the sheet and the field: "Show from". */
  label: string
  /** What the field says with no value: "Any time". */
  emptyLabel?: string
  /** The clock a day gets when it is picked with no time yet. */
  defaultTime?: { hour: number; minute: number }
  /** Days before this instant are drawn quieter. */
  after?: string | null
  /** No Clear: a countdown always has a date. */
  required?: boolean
  timeZone?: string
  className?: string
}

export function DateTimeField({
  value,
  onChange,
  label,
  emptyLabel = "Any time",
  defaultTime = { hour: 9, minute: 0 },
  after,
  required = false,
  timeZone,
  className,
}: DateTimeFieldProps) {
  const phone = usePhone()
  const [open, setOpen] = React.useState(false)
  /* Read after mounting, so the server's HTML and the first render agree. */
  const [zone, setZone] = React.useState(timeZone ?? "UTC")
  React.useEffect(() => setZone(timeZone ?? viewerZone()), [timeZone])
  const wall = wallFromIso(value, zone)
  const today = todayIn(zone, Date.now())
  /* The time shown before a day is chosen, so the clock can be set first. */
  const [loose, setLoose] = React.useState(defaultTime)
  const hour = wall?.hour ?? loose.hour
  const minute = wall?.minute ?? loose.minute
  const afterYmd = wallFromIso(after, zone)?.ymd ?? null

  const write = (ymd: Ymd | null, h: number, m: number) => {
    setLoose({ hour: h, minute: m })
    if (ymd) onChange(isoFromWall(ymd, h, m, zone))
  }
  const text = wall ? `${dayLabel(wall.ymd, today)}, ${timeLabel(wall.hour, wall.minute)}` : emptyLabel

  const trigger = (
    <button
      type="button"
      aria-label={`${label}: ${text}`}
      aria-haspopup="dialog"
      data-datetime-field={label}
      data-open={open ? "" : undefined}
      onClick={phone ? () => setOpen(true) : undefined}
      className={cn(
        "inline-flex h-11 min-w-0 max-w-full shrink-0 cursor-pointer items-center gap-2 rounded-full border border-[#e3e4e8] bg-white pl-3.5 pr-4 text-[14px] font-medium tabular-nums transition-[border-color] duration-150 hover:border-[#c9cbd1] data-[open]:border-[#1a1a2e] [-webkit-tap-highlight-color:transparent]",
        focusRing,
        wall ? "text-[#1a1a2e]" : "text-[#6b7280]",
        className,
      )}
    >
      <CalendarDays aria-hidden className="h-4 w-4 shrink-0 text-[#6b7280]" strokeWidth={1.75} />
      <span className="truncate">{text}</span>
    </button>
  )

  const panel = (compact: boolean) => (
    <div data-datetime-panel="" className={cn("flex flex-col", compact ? "gap-5" : "gap-4")}>
      <MonthGrid key={open ? "open" : "shut"} selected={wall?.ymd ?? null} today={today} compact={compact} before={afterYmd} onPick={(d) => write(d, hour, minute)} />
      <div className="h-px bg-[#eef0f2]" aria-hidden />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className={cn("font-medium text-[#1a1a2e]", compact ? "text-[15px]" : "text-[13.5px]")}>Time</p>
        <TimeInput hour={hour} minute={minute} compact={compact} onChange={(h, m) => write(wall?.ymd ?? null, h, m)} />
      </div>
      {!wall ? <p className="-mt-2 text-[12.5px] text-[#6b7280]">Pick a day to set it.</p> : null}
      <div className="flex items-center justify-between gap-2">
        {!required && wall ? (
          <button type="button" onClick={() => { onChange(null); setOpen(false) }} data-datetime-clear="" className={cn(secondaryDepth, "rounded-xl px-4 text-[14px]", compact ? "h-12" : "h-10")}>
            Clear
          </button>
        ) : (
          <span />
        )}
        <button type="button" onClick={() => setOpen(false)} data-datetime-done="" className={cn(primaryDepth, "rounded-xl px-5 text-[14px]", compact ? "h-12" : "h-10")}>
          Done
        </button>
      </div>
    </div>
  )

  if (phone) {
    return (
      <>
        {trigger}
        <BottomSheet isOpen={open} onClose={() => setOpen(false)} title={label}>
          <div className="px-5 pb-[max(16px,env(safe-area-inset-bottom))] pt-2">{panel(true)}</div>
        </BottomSheet>
      </>
    )
  }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        collisionPadding={12}
        className="w-[308px] rounded-2xl border border-[#e3e4e8] bg-white p-4 text-[#1a1a2e] shadow-[0_16px_48px_-12px_rgba(17,24,39,0.28),0_2px_6px_rgba(17,24,39,0.06)]"
        onOpenAutoFocus={(e) => {
          /* Onto the chosen day (or today), not the first button. */
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
