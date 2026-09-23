"use client"

/**
 * ===========================================================================
 *  THE DATE RANGE PICKER EVERY /app PAGE USES
 * ===========================================================================
 * One button that says what period is showing, and opens:
 *
 *   a rail of presets        Today, Yesterday, Last ›, Period to date ›,
 *                            Black Friday Cyber Monday ›, Quarters ›, All
 *                            time, Custom range. A › opens its own list in
 *                            place, with the way back at the top.
 *   two date boxes           type a date, or read what the calendar chose
 *   two months               press a start, press an end; the band between
 *                            follows the pointer until the second press
 *   Cancel and Apply         nothing changes on the page until Apply
 *
 * On a phone the same panel is a sheet from the bottom, with one month.
 *
 * `ComparePicker` is its partner: No comparison, Previous period, Previous
 * year, or a custom range chosen with the same panel.
 *
 * The dates are calendar days on the creator's clock: lib/date-range/range.ts
 * holds every rule about them, this file only draws.
 */
import * as React from "react"
import { ArrowRight, CalendarDays, CalendarRange, Check, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { BottomSheet } from "@/components/ui/bottom-sheet"
import { cn } from "@/lib/utils"
import {
  COMPARE_LABEL,
  PRESET_LABEL,
  PRESET_MENU,
  compareRange,
  longDate,
  ordered,
  parseTyped,
  parts,
  presetRange,
  rangeLabel,
  valueLabel,
  ymdOf,
  type CompareMode,
  type CompareValue,
  type DateRange,
  type PresetId,
  type RangeValue,
  type Ymd,
} from "@/lib/date-range/range"

/* ── the look, shared with the orders page's buttons ────────────────────── */

export const pickerButton =
  "inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-lg border border-[#e3e4e8] bg-white px-2.5 text-[13px] font-medium text-[#1a1a2e] shadow-[0_1px_0_rgba(17,24,39,0.05)] transition-colors duration-100 hover:bg-[#f7f7f8] active:bg-[#f1f2f4] data-[state=open]:bg-[#ececef] data-[state=open]:shadow-[inset_0_1px_2px_rgba(17,24,39,0.12)] cursor-pointer select-none"

const surface =
  "overflow-hidden rounded-xl border border-[#e3e4e8] bg-white p-0 text-[#1a1a2e] shadow-[0_12px_40px_-8px_rgba(17,24,39,0.22),0_2px_6px_rgba(17,24,39,0.06)]"

/** The month arrows: a small raised key, not a bare glyph, so they read as something to press. */
const monthNav =
  "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[#e3e4e8] bg-white text-[#303036] shadow-[0_1px_0_rgba(17,24,39,0.06),0_1px_2px_rgba(17,24,39,0.05)] transition-[background-color,box-shadow,translate] duration-100 hover:bg-[#f7f7f8] active:translate-y-px active:bg-[#f1f2f4] active:shadow-[inset_0_1px_2px_rgba(17,24,39,0.12)] disabled:pointer-events-none disabled:opacity-35"
const secondaryBtn =
  "inline-flex h-8 items-center justify-center rounded-lg border border-[#e3e4e8] bg-white px-3 text-[13px] font-medium text-[#1a1a2e] shadow-[0_1px_0_rgba(17,24,39,0.05)] hover:bg-[#f7f7f8] active:bg-[#f1f2f4]"
const primaryBtn =
  "inline-flex h-8 items-center justify-center rounded-lg bg-[#1a1a2e] px-3.5 text-[13px] font-medium text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_1px_2px_rgba(17,24,39,0.25)] hover:bg-[#2a2a40] active:bg-[#111122] disabled:cursor-not-allowed disabled:bg-[#d4d4d8] disabled:shadow-none"

/** True below 640px, where panels become sheets, as everywhere else in /app. */
function usePhone(): boolean {
  const [phone, setPhone] = React.useState(false)
  React.useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)")
    const on = () => setPhone(mq.matches)
    on()
    mq.addEventListener("change", on)
    return () => mq.removeEventListener("change", on)
  }, [])
  return phone
}

/* ── the calendar ───────────────────────────────────────────────────────── */

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]

function monthCells(y: number, m: number): (Ymd | null)[] {
  const first = new Date(Date.UTC(y, m, 1)).getUTCDay()
  const days = new Date(Date.UTC(y, m + 1, 0)).getUTCDate()
  const cells: (Ymd | null)[] = Array.from({ length: first }, () => null)
  for (let d = 1; d <= days; d++) cells.push(ymdOf(y, m, d))
  while (cells.length % 7) cells.push(null)
  return cells
}

function Month({
  y,
  m,
  range,
  hover,
  max,
  min,
  onPick,
  onHover,
  focusDay,
  setFocusDay,
  big = false,
  slide,
}: {
  big?: boolean
  /** The class that slides this month in from the side it came from. */
  slide?: string
  y: number
  m: number
  range: { start: Ymd | null; end: Ymd | null }
  hover: Ymd | null
  max: Ymd
  min?: Ymd
  onPick: (d: Ymd) => void
  onHover: (d: Ymd | null) => void
  focusDay: Ymd
  setFocusDay: (d: Ymd) => void
}) {
  /* While only a start is chosen, the band runs to wherever the pointer is. */
  const lo = range.start && !range.end && hover ? ordered(range.start, hover).start : range.start
  const hi = range.start && !range.end && hover ? ordered(range.start, hover).end : range.end ?? range.start
  const cells = monthCells(y, m)
  return (
    <div className="min-w-0 flex-1">
      <div className={cn("grid grid-cols-7 text-center font-medium text-[#6b7280]", big ? "text-[12.5px]" : "text-[12px]")}>
        {WEEKDAYS.map((w) => (
          <div key={w} className="pb-2" aria-hidden>
            {w}
          </div>
        ))}
      </div>
      <div role="grid" aria-label={`${MONTHS_LONG[m]} ${y}`} className={cn("grid grid-cols-7", slide)} onMouseLeave={() => onHover(null)}>
        {cells.map((d, i) => {
          if (!d) return <div key={`e${i}`} aria-hidden />
          const disabled = d > max || (min !== undefined && d < min)
          const inBand = lo && hi ? d >= lo && d <= hi : false
          const isStart = d === lo
          const isEnd = d === hi
          const col = i % 7
          const edge = isStart || isEnd
          return (
            <div
              key={d}
              className={cn(
                "relative flex items-center justify-center transition-colors duration-150",
                big ? "h-10" : "h-9",
                inBand && "bg-[#f1f1f3]",
                inBand && (isStart || col === 0) && "rounded-l-lg",
                inBand && (isEnd || col === 6) && "rounded-r-lg",
              )}
            >
              <button
                type="button"
                data-day={d}
                tabIndex={d === focusDay ? 0 : -1}
                disabled={disabled}
                aria-pressed={edge}
                aria-label={longDate(d)}
                onClick={() => onPick(d)}
                onMouseEnter={() => onHover(d)}
                onFocus={() => setFocusDay(d)}
                className={cn(
                  "flex w-full items-center justify-center rounded-lg tabular-nums outline-none transition-[background-color,color,box-shadow] duration-100",
                  big ? "h-10 text-[15px]" : "h-9 text-[13px]",
                  "focus-visible:ring-2 focus-visible:ring-[#1a1a2e] focus-visible:ring-offset-1",
                  disabled ? "cursor-default text-[#c4c6cc]" : "cursor-pointer",
                  edge
                    ? "drp-day-edge bg-[#1a1a2e] font-semibold text-white shadow-[0_1px_2px_rgba(17,24,39,0.25),inset_0_1px_0_rgba(255,255,255,0.12)]"
                    : !disabled && "hover:bg-[#e6e6ea] active:bg-[#dcdce2]",
                )}
              >
                {parts(d).d}
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ── the panel: rail, date boxes, months, footer ────────────────────────── */

/** "Dec 31, 2025": what a narrow date box shows, where the long form is cut off. */
function shortDate(v: Ymd): string {
  const { y, m, d } = parts(v)
  return `${MONTHS_LONG[m].slice(0, 3)} ${d}, ${y}`
}

function DateBox({ label, value, onCommit, short = false }: { label: string; value: Ymd | null; onCommit: (v: Ymd) => void; short?: boolean }) {
  const show = (v: Ymd) => (short ? shortDate(v) : longDate(v))
  const [text, setText] = React.useState(value ? show(value) : "")
  const [bad, setBad] = React.useState(false)
  React.useEffect(() => {
    setText(value ? show(value) : "")
    setBad(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, short])
  const commit = () => {
    const v = parseTyped(text)
    if (v) {
      setBad(false)
      onCommit(v)
    } else if (text.trim()) setBad(true)
  }
  return (
    <input
      aria-label={label}
      value={text}
      placeholder={label}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault()
          commit()
        }
      }}
      aria-invalid={bad || undefined}
      className={cn(
        "h-9 min-w-0 flex-1 rounded-lg border bg-white px-3 text-[13px] tabular-nums text-[#1a1a2e] outline-none transition-shadow",
        bad ? "border-[#e5484d] focus:shadow-[0_0_0_2px_rgba(229,72,77,0.2)]" : "border-[#d5d7dd] focus:border-[#1a1a2e] focus:shadow-[0_0_0_2px_rgba(26,26,46,0.12)]",
      )}
    />
  )
}

interface PanelProps {
  initial: RangeValue
  today: Ymd
  firstDay?: Ymd
  /** Hide the rail: the comparison's custom range has no presets. */
  presets?: boolean
  months: 1 | 2
  onCancel: () => void
  onApply: (v: RangeValue) => void
  /**
   * Inside another dialog that has its own buttons: no footer, and every
   * complete choice is handed over as it is made.
   */
  inline?: boolean
}

export function RangePanel({ initial, today, firstDay, presets = true, months, onCancel, onApply, inline = false }: PanelProps) {
  const [draft, setDraft] = React.useState<{ start: Ymd | null; end: Ymd | null; preset: PresetId | "custom" }>({
    start: initial.start,
    end: initial.end,
    preset: initial.preset,
  })
  const [hover, setHover] = React.useState<Ymd | null>(null)
  const [group, setGroup] = React.useState<string | null>(null)
  /* The months shown end with the range's end, so a range is seen, not scrolled to. */
  const endParts = parts(initial.end)
  const [view, setViewState] = React.useState(() => ({ y: endParts.y, m: endParts.m - (months === 2 ? 1 : 0) }))
  /* Which way the months last moved, so the new ones slide in from that side. */
  const [dir, setDir] = React.useState<0 | 1 | -1>(0)
  const setView = (next: { y: number; m: number } | ((v: { y: number; m: number }) => { y: number; m: number })) => {
    setViewState((v) => {
      const n = typeof next === "function" ? next(v) : next
      const delta = n.y * 12 + n.m - (v.y * 12 + v.m)
      if (delta !== 0) setDir(delta > 0 ? 1 : -1)
      return n
    })
  }
  const [focusDay, setFocusDay] = React.useState<Ymd>(initial.end)
  const gridRef = React.useRef<HTMLDivElement>(null)

  const show = (d: Ymd) => {
    const p = parts(d)
    setView((v) => {
      const first = v.y * 12 + v.m
      const last = first + months - 1
      const at = p.y * 12 + p.m
      if (at >= first && at <= last) return v
      const start = at > last ? at - months + 1 : at
      return { y: Math.floor(start / 12), m: start % 12 }
    })
  }

  const choosePreset = (id: PresetId) => {
    const r = presetRange(id, today, firstDay)
    setDraft({ ...r, preset: id })
    show(r.end)
  }

  const pick = (d: Ymd) => {
    setFocusDay(d)
    setDraft((cur) => {
      if (!cur.start || cur.end) return { start: d, end: null, preset: "custom" }
      const r = ordered(cur.start, d)
      return { start: r.start, end: r.end, preset: "custom" }
    })
  }

  /* Arrow keys move through days, the way a date grid does. */
  const onGridKey = (e: React.KeyboardEvent) => {
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key]
    if (step === undefined) return
    e.preventDefault()
    const { y, m, d } = parts(focusDay)
    const next = ymdOf(y, m, d + step)
    if (next > today) return
    setFocusDay(next)
    show(next)
    requestAnimationFrame(() => gridRef.current?.querySelector<HTMLButtonElement>(`[data-day="${next}"]`)?.focus())
  }

  const monthsShown = Array.from({ length: months }, (_, i) => {
    const t = view.y * 12 + view.m + i
    return { y: Math.floor(t / 12), m: t % 12 }
  })
  const canForward = monthsShown[months - 1].y * 12 + monthsShown[months - 1].m < parts(today).y * 12 + parts(today).m
  const back = () => setView((v) => ({ y: v.m === 0 ? v.y - 1 : v.y, m: (v.m + 11) % 12 }))
  const forward = () => {
    if (canForward) setView((v) => ({ y: v.m === 11 ? v.y + 1 : v.y, m: (v.m + 1) % 12 }))
  }
  /* On a phone a sideways swipe across the days turns the month, the way the
     system calendar does. Vertical movement is left to the sheet. */
  const swipe = React.useRef<{ x: number; y: number } | null>(null)

  const complete = draft.start !== null && draft.end !== null
  const applyRef = React.useRef(onApply)
  applyRef.current = onApply
  React.useEffect(() => {
    if (inline && draft.start && draft.end) applyRef.current({ start: draft.start, end: draft.end, preset: draft.preset })
  }, [inline, draft.start, draft.end, draft.preset])
  const openGroup = PRESET_MENU.flat().find((g) => g.kind === "group" && g.label === group)

  return (
    <div className={cn("flex", months === 1 ? "flex-col" : "flex-row")}>
      {presets && (
        <nav
          aria-label="Presets"
          className={cn(
            "shrink-0 bg-[#fafafb]",
            months === 1 ? "max-h-[180px] overflow-y-auto border-b border-[#eef0f2] px-2 py-2" : "w-[220px] border-r border-[#eef0f2] px-2 py-3",
          )}
        >
          {openGroup && openGroup.kind === "group" ? (
            <div>
              <button
                type="button"
                onClick={() => setGroup(null)}
                className="flex h-8 w-full items-center gap-1 rounded-lg px-2 text-[13px] font-semibold text-[#1a1a2e] hover:bg-[#f1f1f3]"
              >
                <ChevronLeft className="h-4 w-4" />
                {openGroup.label}
              </button>
              <div className="mt-1 space-y-0.5">
                {openGroup.children.map((id) => (
                  <RailItem key={id} active={draft.preset === id} onClick={() => choosePreset(id)}>
                    {id.startsWith("bfcm") ? rangeLabel(presetRange(id, today)) : id.startsWith("q") ? `${PRESET_LABEL[id]} · ${rangeLabel(presetRange(id, today))}` : PRESET_LABEL[id]}
                  </RailItem>
                ))}
              </div>
            </div>
          ) : (
            PRESET_MENU.map((section, i) => (
              <div key={i} className={cn("space-y-0.5", i > 0 && "mt-2 border-t border-[#eef0f2] pt-2")}>
                {section.map((g) =>
                  g.kind === "item" ? (
                    <RailItem key={g.id} active={draft.preset === g.id} onClick={() => choosePreset(g.id)}>
                      {PRESET_LABEL[g.id]}
                    </RailItem>
                  ) : g.kind === "group" ? (
                    <RailItem
                      key={g.label}
                      active={g.children.includes(draft.preset as PresetId)}
                      onClick={() => setGroup(g.label)}
                      trailing={<ChevronRight className="h-4 w-4 text-[#9ca3af]" />}
                    >
                      {g.label}
                    </RailItem>
                  ) : (
                    <RailItem key="custom" active={draft.preset === "custom"} onClick={() => setDraft((d) => ({ ...d, preset: "custom" }))}>
                      Custom range
                    </RailItem>
                  ),
                )}
              </div>
            ))
          )}
        </nav>
      )}

      <div className="min-w-0 flex-1">
        <div className={cn(months === 2 ? "px-5 pt-4" : "px-4 pt-3")}>
          <div className="flex items-center gap-2">
            <DateBox
              label="Start date"
              short={months === 1}
              value={draft.start}
              onCommit={(v) => {
                const clamped = v > today ? today : v
                setDraft((d) => {
                  const r = d.end ? ordered(clamped, d.end) : { start: clamped, end: null }
                  return { start: r.start, end: r.end, preset: "custom" }
                })
                show(clamped)
              }}
            />
            <ArrowRight className="h-4 w-4 shrink-0 text-[#9ca3af]" aria-hidden />
            <DateBox
              label="End date"
              short={months === 1}
              value={draft.end}
              onCommit={(v) => {
                const clamped = v > today ? today : v
                setDraft((d) => {
                  const r = ordered(d.start ?? clamped, clamped)
                  return { start: r.start, end: r.end, preset: "custom" }
                })
                show(clamped)
              }}
            />
          </div>

          <div className="mt-4 flex items-center justify-between">
            <button type="button" aria-label="Previous month" onClick={back} className={cn(monthNav, months === 1 && "h-10 w-10")}>
              <ChevronLeft className="h-4 w-4" strokeWidth={2.25} />
            </button>
            <div className="flex flex-1 justify-around overflow-hidden text-[14px] font-semibold text-[#1a1a2e]">
              {monthsShown.map((mo) => (
                <span
                  key={`${mo.y}-${mo.m}`}
                  aria-live="polite"
                  className={cn("tabular-nums", dir === 1 && "drp-slide-next", dir === -1 && "drp-slide-prev")}
                >
                  {MONTHS_LONG[mo.m]} {mo.y}
                </span>
              ))}
            </div>
            <button
              type="button"
              aria-label="Next month"
              disabled={!canForward}
              onClick={forward}
              className={cn(monthNav, months === 1 && "h-10 w-10")}
            >
              <ChevronRight className="h-4 w-4" strokeWidth={2.25} />
            </button>
          </div>

          <div
            ref={gridRef}
            onKeyDown={onGridKey}
            onTouchStart={(e) => {
              const t = e.touches[0]
              swipe.current = t ? { x: t.clientX, y: t.clientY } : null
            }}
            onTouchEnd={(e) => {
              const from = swipe.current
              swipe.current = null
              const t = e.changedTouches[0]
              if (!from || !t) return
              const dx = t.clientX - from.x
              const dy = t.clientY - from.y
              if (Math.abs(dx) < 44 || Math.abs(dx) < Math.abs(dy) * 1.5) return
              if (dx < 0) forward()
              else back()
            }}
            className={cn("mt-2 flex overflow-hidden pb-4", months === 2 ? "gap-6" : "")}
          >
            {monthsShown.map((mo) => (
              <Month
                big={months === 1}
                slide={dir === 1 ? "drp-slide-next" : dir === -1 ? "drp-slide-prev" : undefined}
                key={`${mo.y}-${mo.m}`}
                y={mo.y}
                m={mo.m}
                range={draft}
                hover={hover}
                max={today}
                onPick={pick}
                onHover={setHover}
                focusDay={focusDay}
                setFocusDay={setFocusDay}
              />
            ))}
          </div>
        </div>

        {!inline && <div className="flex items-center justify-between gap-3 border-t border-[#eef0f2] px-4 py-3 sm:px-5">
          <p className="min-w-0 truncate text-[12px] text-[#6b7280]" aria-live="polite">
            {complete ? rangeLabel({ start: draft.start as Ymd, end: draft.end as Ymd }) : draft.start ? "Pick the last day" : "Pick the first day"}
          </p>
          <div className="flex shrink-0 gap-2">
            <button type="button" className={secondaryBtn} onClick={onCancel}>
              Cancel
            </button>
            <button
              type="button"
              className={primaryBtn}
              disabled={!complete}
              onClick={() => complete && onApply({ start: draft.start as Ymd, end: draft.end as Ymd, preset: draft.preset })}
            >
              Apply
            </button>
          </div>
        </div>}
      </div>
    </div>
  )
}

function RailItem({ active, onClick, children, trailing }: { active: boolean; onClick: () => void; children: React.ReactNode; trailing?: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active || undefined}
      className={cn(
        "flex min-h-8 w-full items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left text-[13px] transition-colors duration-75",
        active ? "bg-[#ececef] font-semibold text-[#1a1a2e]" : "text-[#303036] hover:bg-[#f1f1f3]",
      )}
    >
      <span className="min-w-0">{children}</span>
      {trailing}
    </button>
  )
}

/* ── the button and where the panel opens ───────────────────────────────── */

export interface DateRangePickerProps {
  value: RangeValue
  onChange: (v: RangeValue) => void
  /** Today on the creator's clock (lib/date-range/range.ts todayIn). */
  today: Ymd
  /** Where "All time" begins. */
  firstDay?: Ymd
  align?: "start" | "end"
  className?: string
  /**
   * Inside a dialog: the panel opens in place below the button, one month
   * wide, instead of in a popover or a sheet, which would open behind it.
   */
  inline?: boolean
}

export function DateRangePicker({ value, onChange, today, firstDay, align = "start", className, inline = false }: DateRangePickerProps) {
  const [open, setOpen] = React.useState(false)
  const phoneQuery = usePhone()
  const phone = phoneQuery || inline
  const label = valueLabel(value)
  const trigger = (
    <button
      type="button"
      className={cn(pickerButton, className)}
      data-state={open ? "open" : "closed"}
      aria-haspopup="dialog"
      aria-expanded={open}
      title={value.preset === "custom" ? undefined : rangeLabel(value)}
      onClick={phone ? () => setOpen((o) => (inline ? !o : true)) : undefined}
    >
      <CalendarDays className="h-4 w-4 text-[#4b5563]" strokeWidth={1.75} />
      <span className="tabular-nums">{label}</span>
      <ChevronDown className={cn("h-3.5 w-3.5 text-[#6b7280] transition-transform duration-150", open && "rotate-180")} />
    </button>
  )
  const panel = (months: 1 | 2) => (
    <RangePanel
      key={`${value.start}${value.end}${value.preset}`}
      initial={value}
      today={today}
      firstDay={firstDay}
      months={months}
      onCancel={() => setOpen(false)}
      onApply={(v) => {
        setOpen(false)
        onChange(v)
      }}
    />
  )
  if (inline) {
    return (
      <div>
        {trigger}
        {open && <div className="mt-2 overflow-hidden rounded-xl border border-[#e3e4e8] bg-white">{panel(1)}</div>}
      </div>
    )
  }
  if (phone) {
    return (
      <>
        {trigger}
        <BottomSheet isOpen={open} onClose={() => setOpen(false)} title="Date range">
          {open && panel(1)}
        </BottomSheet>
      </>
    )
  }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent align={align} sideOffset={6} className={cn(surface, "w-auto max-w-[calc(100vw-24px)]")}>
        {panel(2)}
      </PopoverContent>
    </Popover>
  )
}

/* ── the comparison ─────────────────────────────────────────────────────── */

export interface ComparePickerProps {
  value: CompareValue
  onChange: (v: CompareValue) => void
  /** The period being compared, so the button can say what it is compared with. */
  range: DateRange
  today: Ymd
  align?: "start" | "end"
  className?: string
}

const COMPARE_MODES: CompareMode[] = ["none", "previous_period", "previous_year", "custom"]

export function ComparePicker({ value, onChange, range, today, align = "start", className }: ComparePickerProps) {
  const [open, setOpen] = React.useState(false)
  const [custom, setCustom] = React.useState(false)
  const phone = usePhone()
  const cr = compareRange(range, value)
  const label = cr ? rangeLabel(cr) : COMPARE_LABEL.none
  const close = () => {
    setOpen(false)
    setCustom(false)
  }
  const trigger = (
    <button
      type="button"
      className={cn(pickerButton, className)}
      data-state={open ? "open" : "closed"}
      aria-haspopup="dialog"
      aria-expanded={open}
      aria-label={`Compare to: ${cr ? `${COMPARE_LABEL[value.mode]}, ${label}` : label}`}
      onClick={phone ? () => setOpen(true) : undefined}
    >
      <CalendarRange className="h-4 w-4 text-[#4b5563]" strokeWidth={1.75} />
      <span className={cn("tabular-nums", !cr && "text-[#4b5563]")}>{label}</span>
      <ChevronDown className={cn("h-3.5 w-3.5 text-[#6b7280] transition-transform duration-150", open && "rotate-180")} />
    </button>
  )
  const initialCustom: RangeValue = {
    preset: "custom",
    ...(value.mode === "custom" && value.range ? value.range : compareRange(range, { mode: "previous_period" }) ?? range),
  }
  const body = (months: 1 | 2) =>
    custom ? (
      <RangePanel
        initial={initialCustom}
        today={today}
        presets={false}
        months={months}
        onCancel={() => setCustom(false)}
        onApply={(v) => {
          onChange({ mode: "custom", range: { start: v.start, end: v.end } })
          close()
        }}
      />
    ) : (
      <div role="menu" aria-label="Compare to" className="min-w-[220px] p-1.5">
        {COMPARE_MODES.map((mode) => {
          const r = mode === "custom" ? null : compareRange(range, { mode })
          return (
            <button
              key={mode}
              type="button"
              role="menuitemradio"
              aria-checked={value.mode === mode}
              onClick={() => {
                if (mode === "custom") {
                  setCustom(true)
                  return
                }
                onChange({ mode })
                close()
              }}
              className={cn(
                "flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left text-[13px] transition-colors duration-75 hover:bg-[#f1f1f3]",
                value.mode === mode && "bg-[#ececef]",
              )}
            >
              <span className="flex-1">
                <span className={cn("block", value.mode === mode ? "font-semibold" : "font-medium")}>{COMPARE_LABEL[mode]}</span>
                {r && <span className="block text-[12px] tabular-nums text-[#6b7280]">{rangeLabel(r)}</span>}
              </span>
              {value.mode === mode && <Check className="h-4 w-4 text-[#1a1a2e]" strokeWidth={2.25} />}
            </button>
          )
        })}
      </div>
    )
  if (phone) {
    return (
      <>
        {trigger}
        <BottomSheet isOpen={open} onClose={close} title={custom ? "Compare to" : "Comparison"}>
          {open && body(1)}
        </BottomSheet>
      </>
    )
  }
  return (
    <Popover open={open} onOpenChange={(o) => (o ? setOpen(true) : close())}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent align={align} sideOffset={6} className={cn(surface, "w-auto max-w-[calc(100vw-24px)]")}>
        {body(2)}
      </PopoverContent>
    </Popover>
  )
}

/**
 * The two series names under a chart: the period and what it is compared
 * with, a solid and a dashed swatch, the way the chart draws them.
 */
export function RangeLegend({ range, compare, color = "#8b5cf6" }: { range: DateRange; compare: DateRange | null; color?: string }) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-1 text-[12px] text-[#6b7280]">
      <span className="inline-flex items-center gap-1.5 tabular-nums">
        <span className="h-[3px] w-4 rounded-full" style={{ background: color }} aria-hidden />
        {rangeLabel(range)}
      </span>
      {compare && (
        <span className="inline-flex items-center gap-1.5 tabular-nums">
          <span
            className="h-[3px] w-4 rounded-full opacity-60"
            style={{ backgroundImage: `repeating-linear-gradient(90deg, ${color} 0 4px, transparent 4px 7px)` }}
            aria-hidden
          />
          {rangeLabel(compare)}
        </span>
      )}
    </div>
  )
}

export { longDate }
