"use client"
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import type { Slot } from "@/lib/forms/slots"

/*
  THE BOOKING SHEET'S DAY AND TIME (round AR), for a visitor on a OnePage,
  website or creator page, the visitor moving their own booking
  (/booking/<token>), and the creator moving one from /app/bookings.

  Two views, one at a time so a phone has the whole width for each:
    day   the month, every date drawn: a date with a free time is a filled
          circle that can be pressed, every other date is faint and cannot
    time  that date's free times in the visitor's own zone

  Which view shows is the caller's state (`day`), never the address, so the
  sheet's Back steps from times to the month without a reload and without
  touching the page's history (AR1 owns the sheet's own history). A step
  slides 12px and fades in 200ms, from the side it came from; with reduced
  motion it simply appears.

  Times come from `load`, a month at a time (the server's slots route, or
  the manage and reschedule routes), are kept per month and length, and the
  next month is read ahead once this one is drawn, so paging is instant.
  The server checks the chosen time again when it is booked.
*/

export type SlotPage = { slots: Slot[]; horizon?: string | null }
export type SlotLoader = (fromIso: string, days: number, duration: number) => Promise<SlotPage>

const keyIn = (tz: string, ms: number) => new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ms))
const timeLabel = (iso: string, tz: string) => new Intl.DateTimeFormat(undefined, { timeZone: tz, hour: "numeric", minute: "2-digit" }).format(new Date(iso))
const longDay = (key: string) => new Intl.DateTimeFormat(undefined, { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${key}T12:00:00Z`))
const monthName = (y: number, m: number) => new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, 15)))

/** Monday first, except where the week starts on Sunday (the United States, Canada, Japan and a few more). */
function weekStart(): number {
  try {
    const lang = navigator.language || "en-GB"
    const info = (new Intl.Locale(lang) as unknown as { weekInfo?: { firstDay?: number }; getWeekInfo?: () => { firstDay?: number } })
    const first = info.getWeekInfo?.().firstDay ?? info.weekInfo?.firstDay
    if (first) return first % 7
    return /^(en-US|en-CA|ja|he|pt-BR)/.test(lang) ? 0 : 1
  } catch {
    return 1
  }
}

const ink = "var(--sheet-ink,#1a1a2e)"

export function BookingPicker({
  load,
  zone,
  duration,
  durations,
  onDuration,
  value,
  onPick,
  day,
  onDay,
  version = 0,
  meta,
}: {
  load: SlotLoader
  zone: string
  duration: number
  /** Every length offered, the default first. Two or more draw a choice above the month. */
  durations?: number[]
  onDuration?: (minutes: number) => void
  value: Slot | null
  onPick: (s: Slot) => void
  /** The chosen date (YYYY-MM-DD, the visitor's zone): times show while it is set. */
  day: string | null
  onDay: (day: string | null) => void
  /** Bumped after a time was taken, to read the month again. */
  version?: number
  /** A line over the month: length, price, where. */
  meta?: ReactNode
}) {
  const today = useMemo(() => keyIn(zone, Date.now()), [zone])
  const [month, setMonth] = useState(() => {
    const k = value ? keyIn(zone, Date.parse(value.start)) : day || today
    return { y: Number(k.slice(0, 4)), m: Number(k.slice(5, 7)) }
  })
  const [pages, setPages] = useState<Record<string, SlotPage | "loading" | { error: string }>>({})
  const dir = useRef<"fwd" | "back">("fwd")
  const jumped = useRef(false)
  const first = useMemo(weekStart, [])
  const pageKey = (y: number, m: number) => `${duration}:${y}-${String(m).padStart(2, "0")}:${version}`

  const read = (y: number, m: number, force = false) => {
    const k = pageKey(y, m)
    if (!force && pages[k]) return
    setPages((p) => ({ ...p, [k]: "loading" }))
    /* The month in any zone: from a day before its first to a day after its last (14 hours either side covers every zone). */
    const from = Math.max(Date.now(), Date.UTC(y, m - 1, 1) - 86_400_000)
    const to = Date.UTC(y, m, 1) + 86_400_000
    const days = Math.max(1, Math.min(42, Math.ceil((to - from) / 86_400_000)))
    load(new Date(from).toISOString(), days, duration).then(
      (r) => setPages((p) => ({ ...p, [k]: r })),
      (e) => setPages((p) => ({ ...p, [k]: { error: e instanceof Error ? e.message : "Times could not be loaded." } })),
    )
  }

  const k = pageKey(month.y, month.m)
  const page = pages[k]
  useEffect(() => {
    read(month.y, month.m)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [k])

  const ready = page && page !== "loading" && !("error" in page) ? (page as SlotPage) : null
  const prefix = `${month.y}-${String(month.m).padStart(2, "0")}`
  const byDay = useMemo(() => {
    const map = new Map<string, Slot[]>()
    for (const s of ready?.slots || []) {
      const d = keyIn(zone, Date.parse(s.start))
      if (!d.startsWith(prefix)) continue
      map.set(d, [...(map.get(d) || []), s])
    }
    return map
  }, [ready, zone, prefix])
  const horizonKey = ready?.horizon ? keyIn(zone, Date.parse(ready.horizon)) : null
  const nextMonth = month.m === 12 ? { y: month.y + 1, m: 1 } : { y: month.y, m: month.m + 1 }
  const canNext = !horizonKey || horizonKey >= `${nextMonth.y}-${String(nextMonth.m).padStart(2, "0")}-01`
  const canPrev = prefix > today.slice(0, 7)

  /* Drawn: read the next month ahead, and on the first open skip a month with nothing left in it. */
  useEffect(() => {
    if (!ready) return
    if (canNext) read(nextMonth.y, nextMonth.m)
    if (!jumped.current && !day && !value) {
      jumped.current = true
      if (!byDay.size && canNext) setMonth(nextMonth)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready])

  const go = (delta: 1 | -1) => {
    dir.current = delta > 0 ? "fwd" : "back"
    setMonth(({ y, m }) => (m + delta === 0 ? { y: y - 1, m: 12 } : m + delta === 13 ? { y: y + 1, m: 1 } : { y, m: m + delta }))
  }

  const cells = useMemo(() => {
    const lead = (new Date(Date.UTC(month.y, month.m - 1, 1)).getUTCDay() - first + 7) % 7
    const count = new Date(Date.UTC(month.y, month.m, 0)).getUTCDate()
    return [...Array(lead).fill(null), ...Array.from({ length: count }, (_, i) => `${prefix}-${String(i + 1).padStart(2, "0")}`)] as (string | null)[]
  }, [month, first, prefix])
  const weekdays = useMemo(() => Array.from({ length: 7 }, (_, i) => new Intl.DateTimeFormat(undefined, { weekday: "narrow", timeZone: "UTC" }).format(new Date(Date.UTC(2024, 0, 7 + ((i + first) % 7))))), [first])

  const chosen = day ? (ready ? byDay.get(day) : null) : null
  const enter = dir.current === "fwd" ? "motion-safe:slide-in-from-right-3" : "motion-safe:slide-in-from-left-3"
  const zoneWords = zone.replace(/_/g, " ").replace(/\//g, " / ")

  if (day) {
    const list = chosen || []
    return (
      <div key={`time-${day}`} className={`min-w-0 space-y-3 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200 ${enter}`} data-booking-view="time">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => ((dir.current = "back"), onDay(null))}
            className="-ml-2 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full outline-none transition-[background-color,transform] duration-100 hover:bg-[color-mix(in_srgb,var(--sheet-ink,#1a1a2e)_6%,transparent)] focus-visible:ring-2 focus-visible:ring-[var(--sheet-ink,#1a1a2e)]/25 active:scale-95"
            aria-label="Back to the month"
            data-booking-back=""
          >
            <ChevronLeft className="h-5 w-5" aria-hidden />
          </button>
          <div className="min-w-0">
            <p className="truncate text-[15px] font-semibold">{longDay(day)}</p>
            <p className="text-xs text-[var(--sheet-muted,#6b7280)]">Times in {zoneWords}</p>
          </div>
        </div>
        {!ready ? (
          <p className="text-sm text-[var(--sheet-muted,#6b7280)]" role="status">
            Checking times…
          </p>
        ) : list.length ? (
          <div className="grid grid-cols-2 gap-2 min-[420px]:grid-cols-3" role="radiogroup" aria-label={`Times on ${longDay(day)}`} data-booking-times="">
            {list.map((s) => {
              const on = value?.start === s.start
              return (
                <button
                  key={s.start}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => onPick(s)}
                  className={`min-h-12 rounded-xl border text-[15px] font-semibold tabular-nums outline-none transition-[background-color,border-color,color,transform] duration-100 focus-visible:ring-2 focus-visible:ring-[var(--sheet-ink,#1a1a2e)]/25 active:scale-[0.97] ${on ? "border-[var(--sheet-ink,#1a1a2e)] bg-[var(--sheet-ink,#1a1a2e)] text-[var(--sheet-on-ink,#fff)]" : "border-[color-mix(in_srgb,var(--sheet-ink,#1a1a2e)_22%,transparent)] bg-[var(--form-field,#fff)] text-[var(--sheet-ink,#1a1a2e)] hover:border-[var(--sheet-ink,#1a1a2e)]"}`}
                >
                  {timeLabel(s.start, zone)}
                </button>
              )
            })}
          </div>
        ) : (
          <p className="text-sm text-[var(--sheet-muted,#6b7280)]">No free times left on this day. Choose another day.</p>
        )}
      </div>
    )
  }

  return (
    <div key={`day-${prefix}`} className={`min-w-0 space-y-3 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200 ${enter}`} data-booking-view="day">
      {meta}
      {durations && durations.length > 1 && onDuration ? (
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Length" data-booking-durations="">
          {durations.map((d) => (
            <button
              key={d}
              type="button"
              role="radio"
              aria-checked={d === duration}
              onClick={() => onDuration(d)}
              className={`min-h-10 rounded-full border px-4 text-sm font-semibold outline-none transition-[background-color,border-color,color,transform] duration-100 focus-visible:ring-2 focus-visible:ring-[var(--sheet-ink,#1a1a2e)]/25 active:scale-[0.97] ${d === duration ? "border-[var(--sheet-ink,#1a1a2e)] bg-[var(--sheet-ink,#1a1a2e)] text-[var(--sheet-on-ink,#fff)]" : "border-[color-mix(in_srgb,var(--sheet-ink,#1a1a2e)_22%,transparent)] bg-[var(--form-field,#fff)]"}`}
            >
              {d >= 60 && d % 60 === 0 ? `${d / 60} h` : `${d} min`}
            </button>
          ))}
        </div>
      ) : null}
      <div className="flex items-center justify-between">
        <p className="text-[15px] font-semibold" aria-live="polite" data-booking-month="">
          {monthName(month.y, month.m)}
        </p>
        <div className="-mr-2 flex">
          {[-1, 1].map((delta) => {
            const enabled = delta < 0 ? canPrev : canNext
            return (
              <button
                key={delta}
                type="button"
                disabled={!enabled}
                onClick={() => go(delta as 1 | -1)}
                aria-label={delta < 0 ? "Previous month" : "Next month"}
                className="inline-flex h-11 w-11 items-center justify-center rounded-full outline-none transition-[background-color,transform] duration-100 hover:bg-[color-mix(in_srgb,var(--sheet-ink,#1a1a2e)_6%,transparent)] focus-visible:ring-2 focus-visible:ring-[var(--sheet-ink,#1a1a2e)]/25 active:scale-95 disabled:opacity-30 disabled:hover:bg-transparent"
              >
                {delta < 0 ? <ChevronLeft className="h-5 w-5" aria-hidden /> : <ChevronRight className="h-5 w-5" aria-hidden />}
              </button>
            )
          })}
        </div>
      </div>
      <div className="grid grid-cols-7 text-center text-[11px] font-medium uppercase text-[var(--sheet-muted,#6b7280)]" aria-hidden>
        {weekdays.map((w, i) => (
          <span key={i} className="py-1">
            {w}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-y-1" role="grid" aria-label={monthName(month.y, month.m)} data-booking-grid="" aria-busy={!ready}>
        {cells.map((c, i) => {
          if (!c) return <span key={`x${i}`} />
          const open = !!byDay.get(c)?.length
          const n = Number(c.slice(8))
          const isToday = c === today
          return (
            <span key={c} className="flex justify-center">
              <button
                type="button"
                disabled={!open}
                onClick={() => ((dir.current = "fwd"), onDay(c))}
                data-day={c}
                data-open={open ? "" : undefined}
                aria-label={`${longDay(c)}${open ? "" : ", no times"}`}
                className={`relative inline-flex aspect-square w-full max-w-11 items-center justify-center rounded-full text-[15px] tabular-nums outline-none transition-[background-color,color,transform] duration-100 focus-visible:ring-2 focus-visible:ring-[var(--sheet-ink,#1a1a2e)]/30 ${open ? "bg-[color-mix(in_srgb,var(--sheet-ink,#1a1a2e)_9%,transparent)] font-semibold text-[var(--sheet-ink,#1a1a2e)] hover:bg-[color-mix(in_srgb,var(--sheet-ink,#1a1a2e)_16%,transparent)] active:scale-95" : "cursor-default text-[color-mix(in_srgb,var(--sheet-ink,#1a1a2e)_32%,transparent)]"}`}
              >
                {n}
                {isToday ? <span aria-hidden className="absolute bottom-1 h-1 w-1 rounded-full" style={{ background: ink }} /> : null}
              </button>
            </span>
          )
        })}
      </div>
      <p className="text-xs text-[var(--sheet-muted,#6b7280)]" role="status" data-booking-zone="">
        {!page || page === "loading"
          ? "Checking which days are free…"
          : "error" in page
            ? (page as { error: string }).error
            : byDay.size
              ? `Times in ${zoneWords}.`
              : canNext
                ? `No free days in ${monthName(month.y, month.m)}. Try the next month.`
                : "No free days left to book."}
      </p>
      {page && page !== "loading" && "error" in page ? (
        <button type="button" className="min-h-11 text-sm underline" onClick={() => read(month.y, month.m, true)}>
          Try again
        </button>
      ) : null}
    </div>
  )
}
