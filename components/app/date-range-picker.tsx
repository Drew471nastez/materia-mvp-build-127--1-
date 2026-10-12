"use client"

/**
 * ===========================================================================
 *  THE DATE RANGE PICKER EVERY /app PAGE USES
 * ===========================================================================
 * One button that says what period is showing. It opens a list:
 *
 *   Today, Yesterday
 *   Last 7 days, Last 30 days, Last 90 days, Last 12 months
 *   Month to date, All time
 *   Custom range ›
 *
 * A row is the answer: it applies and closes. Custom range slides to a
 * second step with the calendar, the two date boxes, Back and Apply. That
 * step is the only place anything waits for a button.
 *
 * The quarters, Black Friday Cyber Monday, "More periods" and Year to date
 * were rows here too, three of them opening lists of their own. The owner
 * asked for them gone, from every page. A link or a cookie that still names
 * one opens on the last 30 days (lib/date-range/range RETIRED_PRESETS).
 *
 * The same two steps everywhere: a popover on a computer (two months), the
 * shared sheet on a phone (one month), and in place inside a dialog.
 *
 * WHAT THE OWNER SAW, AND WHAT CHANGED BECAUSE OF IT
 *
 *   The custom range was always on screen, a calendar and a rail of presets
 *   squeezed into one sheet. It is a second step now, opened only by asking.
 *
 *   A step change moves by transform and opacity, 240ms on the iOS sheet
 *   curve, and the box around the steps follows the new step's size on the
 *   same curve. The size is measured once, from the step itself, and written
 *   to the frame; nothing else computes it.
 *
 *   The sheet emptied itself as it closed (`{open && panel}`), so the list
 *   vanished and the sheet collapsed on its way down. The panel now stays
 *   until the sheet has gone, and a new one is made each time it opens.
 *
 *   Every month is six rows, so moving between months never changes the
 *   height of anything.
 *
 * The dates are calendar days on the creator's clock: lib/date-range/range.ts
 * holds every rule about them, this file only draws.
 */
import * as React from "react"
import { Check, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { BottomSheet } from "@/components/ui/bottom-sheet"
import { cn } from "@/lib/utils"
import {
  PRESET_LABEL,
  PRESET_MENU,
  lengthOf,
  longDate,
  ordered,
  parseTyped,
  parts,
  presetRange,
  rangeLabel,
  valueLabel,
  ymdOf,
  type PresetId,
  type RangeValue,
  type Ymd,
} from "@/lib/date-range/range"
import { tt } from "@/lib/i18n/text"
import { calendarWeekdays, formatDate, weekdayNames } from "@/lib/i18n/format"

/* ── the look ───────────────────────────────────────────────────────────── */

export const pickerButton =
  "inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-lg border border-[#e3e4e8] bg-white px-2.5 text-[13px] font-medium text-[#1a1a2e] shadow-[0_1px_0_rgba(17,24,39,0.05)] transition-colors duration-100 hover:bg-[#f7f7f8] active:bg-[#f1f2f4] data-[state=open]:bg-[#ececef] data-[state=open]:shadow-[inset_0_1px_2px_rgba(17,24,39,0.12)] data-open:bg-[#ececef] data-open:shadow-[inset_0_1px_2px_rgba(17,24,39,0.12)] cursor-pointer select-none outline-none focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/20 focus-visible:ring-offset-1"

export const pickerSurface =
  "overflow-hidden rounded-xl border border-[#e3e4e8] bg-white p-0 text-[#1a1a2e] shadow-[0_12px_40px_-8px_rgba(17,24,39,0.22),0_2px_6px_rgba(17,24,39,0.06)]"

/** The month arrows: a small raised key, not a bare glyph, so they read as something to press. */
const monthNav =
  "flex shrink-0 items-center justify-center rounded-lg border border-[#e3e4e8] bg-white text-[#303036] shadow-[0_1px_0_rgba(17,24,39,0.06),0_1px_2px_rgba(17,24,39,0.05)] transition-[background-color,box-shadow,translate] duration-100 hover:bg-[#f7f7f8] active:translate-y-px active:bg-[#f1f2f4] active:shadow-[inset_0_1px_2px_rgba(17,24,39,0.12)] disabled:pointer-events-none disabled:opacity-35"
const secondaryBtn =
  "inline-flex items-center justify-center rounded-lg border border-[#e3e4e8] bg-white font-medium text-[#1a1a2e] shadow-[0_1px_0_rgba(17,24,39,0.05)] hover:bg-[#f7f7f8] active:bg-[#f1f2f4]"
const primaryBtn =
  "inline-flex items-center justify-center rounded-lg bg-[#1a1a2e] font-medium text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_1px_2px_rgba(17,24,39,0.25)] hover:bg-[#2a2a40] active:bg-[#111122] disabled:cursor-not-allowed disabled:bg-[#d4d4d8] disabled:shadow-none"

/** A month's arrival: the sheet's own curve. */
const MONTH_EASE = "cubic-bezier(0.32, 0.72, 0, 1)"

/** How long one step takes to become the next. The curve is in globals.css (.drp-*). */
export const STEP_MS = 240

/** True below 640px, where panels become sheets, as everywhere else in /app. */
export function usePhone(): boolean {
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

/* ── the frame the steps move in ────────────────────────────────────────── */

const NO_STEPS: readonly string[] = []
/**
 * A kept step: out of sight, out of the flow, its rendering skipped where
 * the browser has content-visibility. Set as a style: a class that hides
 * something is a change the page's :has() rules answer by restyling the
 * whole document, a style is not (scripts/check-app-sheets-frames.mjs).
 */
const STEP_AWAY: React.CSSProperties = { visibility: "hidden", contentVisibility: "hidden", pointerEvents: "none", position: "absolute", left: 0, top: 0 }
const STEP_AWAY_FULL: React.CSSProperties = { ...STEP_AWAY, right: 0 }
const CUSTOM_AHEAD: readonly string[] = ["custom"]

/**
 * Two steps side by side for the length of one move.
 *
 * The step that is leaving keeps its React key, so it keeps its state while
 * it goes, and is inert and out of sight from the first frame. The frame's
 * size is the arriving step's, read from that step by a ResizeObserver and
 * written straight to the frame, which transitions it on the same curve as
 * the slide (see .drp-frame).
 *
 * A STEP ONCE SHOWN IS KEPT, out of sight, out of the flow and inert, and
 * `content-visibility: hidden` where the browser has it. Going to the
 * custom range built the calendar on the tap (two month grids, 150 elements
 * styled and laid out) and Back threw it away and built the list again: 75
 * to 120ms each on a phone's CPU, and an element put in or taken out under a
 * sheet is also a change the page's :has() rules answer by restyling the
 * whole document (scripts/check-app-sheets-frames.mjs). Now a step that
 * comes back is only shown again.
 */
function StepFrame({
  active,
  dir,
  compact,
  render,
  ahead = NO_STEPS,
}: {
  active: string
  dir: 1 | -1
  compact: boolean
  render: (key: string) => React.ReactNode
  /** Steps built with the frame and kept out of sight, so the first visit to each is only a show. */
  ahead?: readonly string[]
}) {
  const [shown, setShown] = React.useState(active)
  const [leaving, setLeaving] = React.useState<{ key: string; dir: 1 | -1 } | null>(null)
  const [kept, setKept] = React.useState<string[]>(() => [active, ...ahead.filter((k) => k !== active)])
  /* Decided during the render that receives the new step, so the first frame
     painted already has both layers in place. */
  if (shown !== active) {
    setLeaving({ key: shown, dir })
    setShown(active)
    if (!kept.includes(active)) setKept([...kept, active])
  }
  React.useEffect(() => {
    if (!leaving) return
    const t = window.setTimeout(() => setLeaving(null), STEP_MS)
    return () => window.clearTimeout(t)
  }, [leaving])

  const frameRef = React.useRef<HTMLDivElement>(null)
  const activeRef = React.useRef<HTMLDivElement>(null)
  React.useLayoutEffect(() => {
    const el = activeRef.current
    const frame = frameRef.current
    if (!el || !frame) return
    const fit = () => {
      frame.style.width = compact ? "" : `${el.offsetWidth}px`
      frame.style.height = `${el.offsetHeight}px`
    }
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(el)
    return () => ro.disconnect()
  }, [shown, compact])

  return (
    <div ref={frameRef} className="drp-frame relative overflow-hidden" data-drp-frame>
      {kept.map((k) => {
        const on = k === shown
        const going = !on && leaving?.key === k
        const motion = leaving ? (on ? (leaving.dir === 1 ? "drp-in-next" : "drp-in-back") : going ? (leaving.dir === 1 ? "drp-out-next" : "drp-out-back") : null) : null
        return (
          <div
            key={k}
            ref={on ? activeRef : undefined}
            data-drp-step={k}
            inert={!on}
            className={cn(
              compact ? "w-full" : "w-max",
              going && "pointer-events-none absolute left-0 top-0",
              going && compact && "right-0",
              motion,
            )}
            /* A kept step is away by its style, not by classes: see STEP_AWAY. */
            style={!on && !going ? (compact ? STEP_AWAY_FULL : STEP_AWAY) : undefined}
          >
            {render(k)}
          </div>
        )
      })}
    </div>
  )
}

/* ── the list ───────────────────────────────────────────────────────────── */

export function PickerRow({
  compact,
  checked,
  drill = false,
  detail,
  rowKey,
  onClick,
  children,
}: {
  compact: boolean
  checked: boolean
  drill?: boolean
  detail?: string | null
  rowKey: string
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      role={drill ? "menuitem" : "menuitemradio"}
      aria-checked={drill ? undefined : checked}
      aria-haspopup={drill ? "menu" : undefined}
      data-row={rowKey}
      data-checked={checked || undefined}
      onClick={onClick}
      className={cn(
        "flex w-full cursor-pointer items-center gap-3 rounded-lg text-left outline-none transition-colors duration-100 focus-visible:bg-[#f1f1f4]",
        compact ? "min-h-[44px] px-3 text-[15px] active:bg-[#f1f1f4]" : "min-h-[34px] px-2.5 text-[13px] hover:bg-[#f4f4f6] active:bg-[#ececef]",
        checked ? "font-semibold text-[#1a1a2e]" : "text-[#303036]",
      )}
    >
      {/* The name always reads in full; the dates beside it give way first. */}
      <span className={cn("truncate", detail ? "shrink-0" : "min-w-0 flex-1")}>{children}</span>
      {detail ? (
        <span className={cn("min-w-0 flex-1 truncate text-right font-normal tabular-nums text-[#6b7280]", compact ? "text-[13px]" : "text-[12px]")}>{detail}</span>
      ) : null}
      {drill ? (
        <ChevronRight className="h-4 w-4 shrink-0 text-[#9ca3af]" aria-hidden />
      ) : checked ? (
        <Check className="h-4 w-4 shrink-0 text-[#1a1a2e]" strokeWidth={2.25} aria-hidden />
      ) : (
        /* The check's place, kept, so a label never moves when it is chosen. */
        <span className="w-4 shrink-0" aria-hidden />
      )}
    </button>
  )
}

/** Up and down move between rows, as in any menu. */
export function onRowsKey(e: React.KeyboardEvent<HTMLElement>) {
  const step = { ArrowDown: 1, ArrowUp: -1 }[e.key]
  const edge = e.key === "Home" ? 0 : e.key === "End" ? -1 : null
  if (step === undefined && edge === null) return
  const rows = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>("[data-row]"))
  if (!rows.length) return
  e.preventDefault()
  const at = rows.indexOf(document.activeElement as HTMLButtonElement)
  const next = edge !== null ? (edge === 0 ? 0 : rows.length - 1) : at < 0 ? 0 : (at + (step as number) + rows.length) % rows.length
  rows[next].focus()
}

export function PickerDivider({ compact }: { compact: boolean }) {
  return <div aria-hidden className={cn("h-px bg-[#eef0f2]", compact ? "mx-3 my-1" : "mx-2 my-1")} />
}

function PresetList({
  value,
  today,
  firstDay,
  compact,
  onPreset,
  onOpen,
}: {
  value: RangeValue
  today: Ymd
  firstDay?: Ymd
  compact: boolean
  onPreset: (id: PresetId) => void
  onOpen: (step: "custom") => void
}) {
  return (
    <div role="menu" aria-label={tt("Date range")} onKeyDown={onRowsKey} className={compact ? "px-2 pb-2 pt-1" : "p-1.5"}>
      {PRESET_MENU.map((section, i) => (
        <React.Fragment key={i}>
          {i > 0 ? <PickerDivider compact={compact} /> : null}
          {section.map((g) =>
            g.kind === "item" ? (
              <PickerRow
                key={g.id}
                rowKey={g.id}
                compact={compact}
                checked={value.preset === g.id}
                detail={value.preset === g.id ? rangeLabel(presetRange(g.id, today, firstDay)) : null}
                onClick={() => onPreset(g.id)}
              >
                {PRESET_LABEL[g.id]}
              </PickerRow>
            ) : (
              <PickerRow
                key="custom"
                rowKey="custom"
                compact={compact}
                drill
                checked={value.preset === "custom"}
                detail={value.preset === "custom" ? rangeLabel(value) : null}
                onClick={() => onOpen("custom")}
              >
                {tt("Custom range")}
              </PickerRow>
            ),
          )}
        </React.Fragment>
      ))}
    </div>
  )
}

/* ── the calendar ───────────────────────────────────────────────────────── */

/* The day and month names in the dashboard's language (lib/i18n/format), read when drawn. */
/** "October 2026" / "octubre de 2026" / "Oktober 2026". */
const monthYear = (y: number, m: number) => formatDate(Date.UTC(y, m, 15), { month: "long", year: "numeric", timeZone: "UTC" })

/** Always six weeks, so every month is the same height and nothing below it moves. */
function monthCells(y: number, m: number): (Ymd | null)[] {
  const first = new Date(Date.UTC(y, m, 1)).getUTCDay()
  const days = new Date(Date.UTC(y, m + 1, 0)).getUTCDate()
  const cells: (Ymd | null)[] = Array.from({ length: first }, () => null)
  for (let d = 1; d <= days; d++) cells.push(ymdOf(y, m, d))
  while (cells.length < 42) cells.push(null)
  return cells
}

/** One day's square and the band under it. */
function Month({
  y,
  m,
  range,
  hover,
  today,
  onPick,
  onHover,
  focusDay,
  setFocusDay,
  compact,
}: {
  y: number
  m: number
  range: { start: Ymd | null; end: Ymd | null }
  hover: Ymd | null
  today: Ymd
  onPick: (d: Ymd) => void
  onHover: (d: Ymd | null) => void
  focusDay: Ymd
  setFocusDay: (d: Ymd) => void
  compact: boolean
}) {
  /* While only a start is chosen, the band runs to wherever the pointer is. */
  const previewing = !!range.start && !range.end && !!hover
  const lo = previewing ? ordered(range.start as Ymd, hover as Ymd).start : range.start
  const hi = previewing ? ordered(range.start as Ymd, hover as Ymd).end : range.end ?? range.start
  const cells = monthCells(y, m)
  const cell = compact ? 44 : 36
  return (
    <div className={cn("min-w-0", compact ? "w-full" : "w-[280px]")}>
      <div className={cn("grid grid-cols-7 pb-1.5 text-center font-medium text-[#8b8f98]", compact ? "text-[12px]" : "text-[11.5px]")} aria-hidden>
        {(compact ? weekdayNames("narrow") : calendarWeekdays()).map((w, i) => (
          <div key={i}>{w}</div>
        ))}
      </div>
      <div role="grid" aria-label={monthYear(y, m)} className="grid grid-cols-7" style={{ gridTemplateRows: `repeat(6, ${cell}px)` }} onMouseLeave={() => onHover(null)}>
        {cells.map((cellDay, i) => {
          /*
            Keyed by place, not by day, and every square has its band, its
            button and its dot whether it is a day or not (the ones that are
            not are `hidden`): the next month is the same 42 squares with
            other numbers and nothing is put in or taken out, which under a
            sheet is a change the page's :has() rules answer by restyling the
            whole document (scripts/check-app-sheets-frames.mjs).
          */
          const d = cellDay ?? ("" as Ymd)
          const isDay = !!cellDay
          const disabled = isDay && d > today
          const inBand = isDay && lo && hi && lo !== hi ? d >= lo && d <= hi : false
          const isStart = isDay && d === lo
          const isEnd = isDay && d === hi
          const edge = (isStart || isEnd) && !(previewing && d === hover && d !== range.start)
          const col = i % 7
          return (
            <div key={i} className="relative flex items-center justify-center">
              <span
                aria-hidden
                className={cn(
                  "drp-band absolute inset-y-0",
                  !inBand && "hidden",
                  previewing ? "bg-[#f4f4f7]" : "bg-[#efeff3]",
                  isStart ? "left-1/2" : "left-0",
                  isEnd ? "right-1/2" : "right-0",
                  !isStart && col === 0 && "rounded-l-lg",
                  !isEnd && col === 6 && "rounded-r-lg",
                )}
              />
              <button
                type="button"
                hidden={!isDay}
                data-day={isDay ? d : undefined}
                tabIndex={isDay && d === focusDay ? 0 : -1}
                /* aria-disabled, not disabled: a :disabled that changes is a
                   change under a :has() in the app's CSS, answered with a
                   restyle of the whole document on every arrow tap. */
                aria-disabled={disabled || !isDay || undefined}
                aria-pressed={edge}
                aria-current={isDay && d === today ? "date" : undefined}
                aria-label={isDay ? longDate(d) : undefined}
                onClick={() => isDay && !disabled && onPick(d)}
                onMouseEnter={() => isDay && onHover(d)}
                onFocus={() => isDay && setFocusDay(d)}
                className={cn(
                  "relative flex items-center justify-center rounded-lg tabular-nums outline-none transition-[background-color,color,box-shadow] duration-150",
                  compact ? "h-11 w-11 text-[16px]" : "h-9 w-9 text-[13px]",
                  "focus-visible:shadow-[0_0_0_2px_#fff,0_0_0_4px_rgba(26,26,46,0.55)]",
                  disabled
                    ? "cursor-default text-[#c7c9cf]"
                    : edge
                      ? "cursor-pointer bg-[#1a1a2e] font-semibold text-white shadow-[0_1px_2px_rgba(17,24,39,0.25),inset_0_1px_0_rgba(255,255,255,0.12)]"
                      : cn("cursor-pointer text-[#1a1a2e] active:bg-[#e4e4e9]", !compact && "hover:bg-[#e8e8ed]"),
                  isDay && d === today && !edge && "font-semibold",
                )}
              >
                {isDay ? parts(d).d : ""}
                <span aria-hidden hidden={!isDay || d !== today} className={cn("absolute left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-current", compact ? "bottom-[6px]" : "bottom-[4px]")} />
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/** "Dec 31, 2025": what a narrow date box shows, where the long form is cut off. */
function shortDate(v: Ymd): string {
  const { y, m, d } = parts(v)
  return formatDate(Date.UTC(y, m, d), { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })
}

function DateBox({ label, value, onCommit, compact }: { label: string; value: Ymd | null; onCommit: (v: Ymd) => void; compact: boolean }) {
  const show = (v: Ymd) => (compact ? shortDate(v) : longDate(v))
  const [text, setText] = React.useState(value ? show(value) : "")
  const [bad, setBad] = React.useState(false)
  React.useEffect(() => {
    setText(value ? show(value) : "")
    setBad(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, compact])
  const commit = () => {
    const v = parseTyped(text)
    if (v) {
      setBad(false)
      onCommit(v)
    } else if (text.trim()) setBad(true)
  }
  return (
    <label className="flex min-w-0 flex-1 flex-col gap-1">
      <span className="text-[11px] font-medium text-[#6b7280]">{label}</span>
      <input
        value={text}
        placeholder={compact ? tt("Mon D, YYYY") : tt("Month D, YYYY")}
        inputMode="text"
        autoComplete="off"
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
          /* 16px on a phone: anything smaller and iOS zooms the page to type. */
          "min-w-0 rounded-lg border bg-white px-3 tabular-nums text-[#1a1a2e] outline-none transition-[border-color,box-shadow] duration-150",
          compact ? "h-11 text-[16px]" : "h-9 text-[13px]",
          bad ? "border-[#e5484d] focus:shadow-[0_0_0_3px_rgba(229,72,77,0.18)]" : "border-[#d5d7dd] focus:border-[#1a1a2e] focus:shadow-[0_0_0_3px_rgba(26,26,46,0.10)]",
        )}
      />
    </label>
  )
}

interface PanelProps {
  initial: DateRangeDraft
  today: Ymd
  months: 1 | 2
  /** Back to the list. Without it the footer has no Back. */
  onBack?: () => void
  onApply: (v: RangeValue) => void
  /**
   * Inside another dialog that has its own buttons: no footer, and every
   * complete choice is handed over as it is made.
   */
  inline?: boolean
  /** A new number starts the panel again from `initial`, for a panel that is kept between visits. */
  reset?: number
}

type DateRangeDraft = { start: Ymd; end: Ymd }

/**
 * THE CUSTOM RANGE: two date boxes, the months, and Back and Apply. The
 * second step of the picker, and on its own in the orders export dialog.
 */
export function RangePanel({ initial, today, months, onBack, onApply, inline = false, reset = 0 }: PanelProps) {
  const compact = months === 1
  const [draft, setDraft] = React.useState<{ start: Ymd | null; end: Ymd | null }>({ start: initial.start, end: initial.end })
  const [hover, setHover] = React.useState<Ymd | null>(null)
  /* The months shown end with the range's end, so a range is seen, not scrolled to. */
  const endParts = parts(initial.end)
  const [view, setViewState] = React.useState(() => ({ y: endParts.y, m: endParts.m - (months === 2 ? 1 : 0) }))
  /* Which way the months last moved, so the new ones arrive from that side. */
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
  /* Kept between visits (StepFrame): each visit starts where a new panel would. */
  const [lastReset, setLastReset] = React.useState(reset)
  if (reset !== lastReset) {
    setLastReset(reset)
    setDraft({ start: initial.start, end: initial.end })
    setHover(null)
    setViewState({ y: endParts.y, m: endParts.m - (months === 2 ? 1 : 0) })
    setDir(0)
    setFocusDay(initial.end)
  }

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

  const pick = (d: Ymd) => {
    setFocusDay(d)
    setDraft((cur) => {
      if (!cur.start || cur.end) return { start: d, end: null }
      return ordered(cur.start, d)
    })
  }

  /* Arrow keys move through days, the way a date grid does; Page keys move a month. */
  const onGridKey = (e: React.KeyboardEvent) => {
    const { y, m, d } = parts(focusDay)
    const byDay = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key]
    const byMonth = { PageUp: -1, PageDown: 1 }[e.key]
    if (byDay === undefined && byMonth === undefined) return
    e.preventDefault()
    let next = byDay !== undefined ? ymdOf(y, m, d + byDay) : ymdOf(y, m + (byMonth as number), Math.min(d, new Date(Date.UTC(y, m + (byMonth as number) + 1, 0)).getUTCDate()))
    if (next > today) next = today
    setFocusDay(next)
    show(next)
    requestAnimationFrame(() => gridRef.current?.querySelector<HTMLButtonElement>(`[data-day="${next}"]`)?.focus())
  }

  const monthsShown = Array.from({ length: months }, (_, i) => {
    const t = view.y * 12 + view.m + i
    return { y: Math.floor(t / 12), m: t % 12 }
  })
  const lastShown = monthsShown[months - 1]
  const canForward = lastShown.y * 12 + lastShown.m < parts(today).y * 12 + parts(today).m
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
    if (inline && draft.start && draft.end) applyRef.current({ start: draft.start, end: draft.end, preset: "custom" })
  }, [inline, draft.start, draft.end])

  /**
   * A MONTH ARRIVES FROM THE SIDE IT WAS ASKED FOR, and the grid under it is
   * the same grid with other numbers in it. Each month used to be a new grid
   * (keyed by the month), so every arrow tap took 42 days out of the page
   * and put 42 in: 60 to 110ms of rendering, styling and layout on a
   * phone's CPU, and an element put in or taken out under a sheet is a
   * change the page's :has() rules answer by restyling the whole document
   * (scripts/check-app-sheets-frames.mjs). The slide is played on the
   * compositor on the grid that stays: it never starts invisible, so the
   * days are readable from the first frame.
   */
  const labelsRef = React.useRef<HTMLDivElement>(null)
  const firstMonth = React.useRef(true)
  React.useLayoutEffect(() => {
    if (firstMonth.current) {
      firstMonth.current = false
      return
    }
    if (!dir || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return
    const from = `translate3d(${dir === 1 ? 14 : -14}px, 0, 0)`
    const moving = [...Array.from(labelsRef.current?.children ?? []), ...Array.from(gridRef.current?.children ?? [])]
    for (const el of moving) {
      el.animate([{ opacity: 0.35, transform: from }, { opacity: 1, transform: "none" }], { duration: 220, easing: MONTH_EASE })
    }
  }, [view.y, view.m]) // eslint-disable-line react-hooks/exhaustive-deps
  const days = complete ? lengthOf({ start: draft.start as Ymd, end: draft.end as Ymd }) : 0
  const navSize = compact ? "h-10 w-10" : "h-8 w-8"

  return (
    <div className={cn(compact ? "w-full" : "w-[624px]")}>
      <div className={cn(compact ? "px-4 pt-1" : "px-5 pt-4")}>
        <div className="flex items-end gap-2">
          <DateBox
            label={tt("Start")}
            compact={compact}
            value={draft.start}
            onCommit={(v) => {
              const clamped = v > today ? today : v
              setDraft((d) => (d.end ? ordered(clamped, d.end) : { start: clamped, end: null }))
              setFocusDay(clamped)
              show(clamped)
            }}
          />
          <DateBox
            label={tt("End")}
            compact={compact}
            value={draft.end}
            onCommit={(v) => {
              const clamped = v > today ? today : v
              setDraft((d) => ordered(d.start ?? clamped, clamped))
              setFocusDay(clamped)
              show(clamped)
            }}
          />
        </div>

        <div className={cn("flex items-center justify-between", compact ? "mt-3" : "mt-4")}>
          <button type="button" aria-label={tt("Previous month")} onClick={back} className={cn(monthNav, navSize)}>
            <ChevronLeft className="h-4 w-4" strokeWidth={2.25} />
          </button>
          <div ref={labelsRef} className="flex flex-1 justify-around overflow-hidden">
            {monthsShown.map((mo, i) => (
              <span
                key={i}
                aria-live="polite"
                className={cn("font-semibold tabular-nums text-[#1a1a2e]", compact ? "text-[15px]" : "text-[14px]")}
              >
                {monthYear(mo.y, mo.m)}
              </span>
            ))}
          </div>
          {/* aria-disabled with the same look, not disabled: see the days above. */}
          <button type="button" aria-label={tt("Next month")} aria-disabled={!canForward || undefined} onClick={forward} className={cn(monthNav, navSize, !canForward && "pointer-events-none opacity-35")}>
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
          className={cn("mt-3 flex overflow-hidden", compact ? "pb-3" : "gap-6 pb-4")}
        >
          {monthsShown.map((mo, i) => (
            <div key={i} className={cn(compact && "w-full")}>
              <Month
                compact={compact}
                y={mo.y}
                m={mo.m}
                range={draft}
                hover={hover}
                today={today}
                onPick={pick}
                onHover={setHover}
                focusDay={focusDay}
                setFocusDay={setFocusDay}
              />
            </div>
          ))}
        </div>
      </div>

      {!inline && (
        <div className={cn("flex items-center justify-between gap-3 border-t border-[#eef0f2]", compact ? "px-4 pb-1 pt-3" : "px-5 py-3")}>
          <p className={cn("min-w-0 truncate tabular-nums text-[#6b7280]", compact ? "text-[13px]" : "text-[12px]")} aria-live="polite">
            {complete ? `${days} ${days === 1 ? "day" : "days"}` : draft.start ? tt("Pick the last day") : tt("Pick the first day")}
          </p>
          <div className="flex shrink-0 gap-2">
            {onBack ? (
              <button type="button" className={cn(secondaryBtn, compact ? "h-11 px-4 text-[15px]" : "h-8 px-3 text-[13px]")} onClick={onBack}>
                {tt("Back")}
              </button>
            ) : null}
            <button
              type="button"
              className={cn(primaryBtn, compact ? "h-11 px-5 text-[15px]" : "h-8 px-3.5 text-[13px]")}
              disabled={!complete}
              onClick={() => complete && onApply({ start: draft.start as Ymd, end: draft.end as Ymd, preset: "custom" })}
            >
              {tt("Apply")}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

/* ── the steps together ─────────────────────────────────────────────────── */

function PickerPanel({
  value,
  today,
  firstDay,
  compact,
  onPick,
  restart = 0,
  ahead,
}: {
  value: RangeValue
  today: Ymd
  firstDay?: Ymd
  compact: boolean
  onPick: (v: RangeValue) => void
  /** A new number puts the panel back on the list, for a sheet that is kept between opens. */
  restart?: number
  /** Steps to build with the panel (see StepFrame `ahead`). */
  ahead?: readonly string[]
}) {
  const [step, setStep] = React.useState("list")
  const [dir, setDir] = React.useState<1 | -1>(1)
  const [lastRestart, setLastRestart] = React.useState(restart)
  if (restart !== lastRestart) {
    setLastRestart(restart)
    setStep("list")
    setDir(-1)
  }
  const rootRef = React.useRef<HTMLDivElement>(null)
  /** Where focus goes once the next step is on screen: the step it came from loses it. */
  const focusNext = React.useRef<string | null>(null)
  /* Each visit to the custom range starts it again (RangePanel reset). */
  const [visits, setVisits] = React.useState(0)
  const go = (next: string, d: 1 | -1, focus: string) => {
    focusNext.current = focus
    setDir(d)
    setStep(next)
    if (next === "custom") setVisits((n) => n + 1)
  }
  React.useEffect(() => {
    const sel = focusNext.current
    focusNext.current = null
    if (!sel) return
    rootRef.current?.querySelector<HTMLElement>(`[data-drp-step="${CSS.escape(step)}"] ${sel}`)?.focus({ preventScroll: true })
  }, [step])

  const preset = (id: PresetId) => onPick({ preset: id, ...presetRange(id, today, firstDay) })
  const render = (key: string) => {
    if (key === "custom") {
      return (
        <RangePanel
          initial={{ start: value.start, end: value.end }}
          today={today}
          months={compact ? 1 : 2}
          onBack={() => go("list", -1, `[data-row="custom"]`)}
          onApply={onPick}
          reset={visits}
        />
      )
    }
    return (
      <div className={compact ? undefined : "w-[288px]"}>
        <PresetList
          value={value}
          today={today}
          firstDay={firstDay}
          compact={compact}
          onPreset={preset}
          onOpen={(next) => go(next, 1, `[data-day][tabindex="0"]`)}
        />
      </div>
    )
  }

  return (
    <div ref={rootRef} data-drp-panel>
      <StepFrame active={step} dir={dir} compact={compact} render={render} ahead={ahead} />
    </div>
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
  /* A new panel each time it opens, so it always opens on the list. Not
     keyed by the value: a panel that is closing keeps what it shows. */
  const [session, setSession] = React.useState(0)
  const phone = usePhone()
  const compact = phone || inline
  /**
   * A choice closes the picker at once; the page catches up behind it, at a
   * priority that cannot hold up the close.
   *
   * ON A PHONE, ONCE THE SHEET HAS GONE. The home page drawing a new period
   * is 100 to 270ms of main thread on a phone's CPU (a chart, the figures,
   * their morphs), and it landed in the frames of the sheet's slide down.
   * The website builder's sheets tell their page about a release when the
   * sheet has arrived; this one tells the page about a choice when the
   * sheet has left, 340ms later, so the page's own motion is seen whole.
   */
  const pendingPick = React.useRef<RangeValue | null>(null)
  const onChangeRef = React.useRef(onChange)
  onChangeRef.current = onChange
  const flushPick = React.useCallback(() => {
    const v = pendingPick.current
    pendingPick.current = null
    if (v) React.startTransition(() => onChangeRef.current(v))
  }, [])
  const setShown = (o: boolean) => {
    if (o) setSession((s) => s + 1)
    /* Opened again before the last choice reached the page: it reaches it now. */
    if (o) flushPick()
    setOpen(o)
  }
  const pick = (v: RangeValue) => {
    setOpen(false)
    if (phone && !inline) {
      pendingPick.current = v
      return
    }
    React.startTransition(() => onChange(v))
  }
  /* The phone sheet is kept between opens (BottomSheet keepMounted), so the
     panel goes back to the list once it is out of sight, not on the tap. */
  const [restart, setRestart] = React.useState(0)
  const onSheetClosed = React.useCallback(() => {
    setRestart((n) => n + 1)
    flushPick()
  }, [flushPick])
  /* Only the picker that is on screen keeps a sheet: the home page draws one for each width. */
  const triggerRef = React.useRef<HTMLButtonElement>(null)
  const [onScreen, setOnScreen] = React.useState(false)
  React.useEffect(() => {
    const el = triggerRef.current
    setOnScreen(!!el && el.getClientRects().length > 0)
  }, [phone])
  const trigger = (
    <button
      ref={triggerRef}
      type="button"
      className={cn(pickerButton, className)}
      /* On a phone the button opens a modal sheet and says so with data-open.
         `data-state` and `aria-expanded` are both named in :has() rules in
         the app's CSS, and a change to either restyled the whole document
         on the tap (scripts/check-app-sheets-frames.mjs). The popover on a
         computer still gets both from Radix's trigger. */
      data-state={phone && !inline ? undefined : open ? "open" : "closed"}
      data-open={open ? "" : undefined}
      aria-haspopup="dialog"
      aria-expanded={phone && !inline ? undefined : open}
      title={value.preset === "custom" ? undefined : rangeLabel(value)}
      onClick={compact ? () => setShown(inline ? !open : true) : undefined}
    >
      <span className="tabular-nums">{valueLabel(value)}</span>
      <ChevronDown className={cn("h-3.5 w-3.5 text-[#6b7280] transition-transform duration-150", open && "rotate-180")} aria-hidden />
    </button>
  )
  const panel = <PickerPanel key={session} value={value} today={today} firstDay={firstDay} compact={compact} onPick={pick} />

  if (inline) {
    return (
      <div>
        {trigger}
        {open && <div className="mt-2 overflow-hidden rounded-xl border border-[#e3e4e8] bg-white">{panel}</div>}
      </div>
    )
  }
  if (phone) {
    return (
      <>
        {trigger}
        {/* Kept, and built while the page is idle: the tap only slides it up. */}
        <BottomSheet isOpen={open} onClose={() => setOpen(false)} title={tt("Date range")} keepMounted={onScreen} onClosed={onSheetClosed}>
          <PickerPanel value={value} today={today} firstDay={firstDay} compact onPick={pick} restart={restart} ahead={CUSTOM_AHEAD} />
        </BottomSheet>
      </>
    )
  }
  return (
    <Popover open={open} onOpenChange={setShown}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        align={align}
        sideOffset={6}
        className={cn(pickerSurface, "w-auto max-w-[calc(100vw-24px)]")}
        onOpenAutoFocus={(e) => {
          /* Onto the period that is showing, not the first row. */
          e.preventDefault()
          const el = e.currentTarget as HTMLElement | null
          const row = el?.querySelector<HTMLElement>("[data-row][data-checked]") ?? el?.querySelector<HTMLElement>("[data-row]")
          row?.focus({ preventScroll: true })
        }}
      >
        {panel}
      </PopoverContent>
    </Popover>
  )
}
