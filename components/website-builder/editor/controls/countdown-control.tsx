"use client"

/**
 * ===========================================================================
 *  WHEN AN IMPORTED THEME'S COUNTDOWN ENDS
 * ===========================================================================
 * An imported Shopify theme's countdown keeps its deadline in settings of
 * its own: `end_date` with `end_hour`, `end_minute` and `utc_offset`, or one
 * `end_iso`, or a `countdown_date` typed as text. The panel drew each as a
 * text box or a slider, so a creator typed "2026-11-03", slid an hour to 23
 * and guessed what "+2" meant in November.
 *
 * Now they are one control, drawn where the first of them was:
 *
 *   ┌──────────────────────────────────────────┐
 *   │  Ends Tue 3 Nov, 23:59 in Bucharest (UTC+2)│  the deadline, said
 *   ├──────────────────────┬───────────────────┤
 *   │  [ 2026-11-03 ]      │  [ 23:59 ]        │  the device's own pickers
 *   │  [ UTC+2                              ▾ ] │  the zone, when one is kept
 *   └──────────────────────────────────────────┘
 *     A fixed UTC offset does not move with daylight saving.
 *
 * Which settings, how each was written and how a change is written back
 * are lib/storelib-theme/countdown.ts: the ids never change, and a value is
 * written in the shape it was stored in, only when it is changed. A change
 * writes only the settings it changes, through the same setting writer as
 * every other control, so the canvas draws that section again and the
 * frame starts that countdown alone again (canvas-bridge.ts, A VALUE A
 * SCRIPT READS ONCE).
 */
import * as React from "react"

import { cn } from "@/lib/utils"
import {
  daylightHint,
  deadlineWords,
  offsetChoices,
  offsetLabel,
  readCountdown,
  writeCountdown,
  zoneOffsetAt,
  type CountdownEdit,
  type CountdownFieldLike,
  type CountdownGroup,
  type DeadlineWords,
} from "@/lib/storelib-theme/countdown"
import { activeLanguage, tt } from "@/lib/i18n/text"
import { formatDate } from "@/lib/i18n/format"
import { NOTE, PROBLEM } from "./styles"

const pad = (n: number) => String(n).padStart(2, "0")

/** The editor's own zone: what a "visitor" deadline is read in here, and whose city names an offset. */
function useLocalZone() {
  return React.useMemo(() => {
    let timeZone: string | null = null
    try {
      timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? null
    } catch {
      timeZone = null
    }
    const offsetAt = (instant: number) => {
      if (timeZone) {
        try {
          return zoneOffsetAt(timeZone, instant)
        } catch {
          /* falls through to the device's clock */
        }
      }
      return -new Date(instant).getTimezoneOffset()
    }
    return { timeZone, offsetAt }
  }, [])
}

/** "Tue 3 Nov, 23:59" in English as the module says it; another language by Intl, UTC on both sides so no zone moves the day. */
function whenInWords(w: DeadlineWords, date: { year: number; month: number; day: number }, time: { hour: number; minute: number } | null, thisYear: number) {
  if (activeLanguage() === "en") return w.when
  const day = formatDate(Date.UTC(date.year, date.month - 1, date.day, 12), {
    weekday: "short",
    day: "numeric",
    month: "short",
    ...(date.year === thisYear ? {} : { year: "numeric" }),
    timeZone: "UTC",
  })
  return time ? `${day}, ${pad(time.hour)}:${pad(time.minute)}` : day
}

function sentence(w: DeadlineWords, when: string): string {
  if (w.zone === null) return w.ended ? tt("Ended {when} in each visitor's own time", { when }) : tt("Ends {when} in each visitor's own time", { when })
  if (w.city) return w.ended ? tt("Ended {when} in {city} ({zone})", { when, city: w.city, zone: w.zone }) : tt("Ends {when} in {city} ({zone})", { when, city: w.city, zone: w.zone })
  return w.ended ? tt("Ended {when} {zone}", { when, zone: w.zone }) : tt("Ends {when} {zone}", { when, zone: w.zone })
}

export function CountdownControl({
  group,
  fields,
  settings,
  onPatch,
  label,
}: {
  group: CountdownGroup
  fields: readonly CountdownFieldLike[]
  settings: Record<string, unknown>
  /** The settings to write, by id: only those that change. */
  onPatch: (patch: Record<string, unknown>) => void
  label?: string
}) {
  const zone = useLocalZone()
  const state = readCountdown(group, fields, settings)

  /* "Ended" arrives while the panel is open. Once a minute is plenty. */
  const [now, setNow] = React.useState(() => Date.now())
  React.useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 60_000)
    return () => window.clearInterval(t)
  }, [])

  const apply = (edit: CountdownEdit) => {
    const patch = writeCountdown(group, fields, settings, edit)
    if (Object.keys(patch).length) onPatch(patch)
  }

  const date = state.date ? `${state.date.year}-${pad(state.date.month)}-${pad(state.date.day)}` : ""
  const time = state.time ? `${pad(state.time.hour)}:${pad(state.time.minute)}` : ""
  const words = deadlineWords(state, now, zone)
  const thisYear = new Date(now).getFullYear()
  const said = words && state.date ? sentence(words, whenInWords(words, state.date, state.time, thisYear)) : null
  const choosesZone = state.zone === "setting" || state.zone === "inline"
  const choices = React.useMemo(() => {
    const list = offsetChoices(group, fields)
    return state.offset !== null && !list.includes(state.offset) ? [...list, state.offset].sort((a, b) => a - b) : list
  }, [group, fields, state.offset])
  const hint = choosesZone ? daylightHint(state, zone) : null

  const field =
    "h-9 w-full min-w-0 rounded-md border border-border bg-white px-2 text-[12.5px] tabular-nums text-foreground outline-none transition-colors focus:border-foreground/40 focus:ring-2 focus:ring-neutral-900/10 disabled:opacity-50 dark:bg-white/[0.04] max-sm:h-11 max-sm:text-[16px]"

  return (
    <div className="space-y-1.5" data-countdown-control={group.lead}>
      <div className="overflow-hidden rounded-lg border border-border bg-white dark:bg-white/[0.03]">
        <div className="px-3 py-2.5" aria-live="polite" data-countdown-summary="">
          {said ? (
            <p className={cn("text-[13px] font-medium max-sm:text-[15px]", words?.ended ? "text-[#b45309]" : "text-foreground")} data-countdown-ended={words?.ended ? "" : undefined}>
              {said}
            </p>
          ) : (
            <p className="text-[13px] text-muted-foreground max-sm:text-[15px]">{tt("No date set yet")}</p>
          )}
        </div>
        <div className="space-y-1.5 border-t border-border bg-[#fafafa] p-1.5 dark:bg-white/[0.02]">
          {/* Side by side while both fit their whole value ("11/03/2026", "11:59 PM" in a 12 hour locale), one under the other when they do not: never clipped. */}
          <div className="flex flex-wrap gap-1.5">
            <input
              type="date"
              aria-label={label ? `${label}: ${tt("Date")}` : tt("Date")}
              data-countdown-date=""
              className={cn(field, "min-w-[9.5rem] flex-[1.25_1_0%] max-sm:min-w-[10.5rem]")}
              value={date}
              min="1000-01-01"
              max="9999-12-31"
              onChange={(e) => {
                const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(e.target.value)
                if (m) apply({ date: { year: +m[1], month: +m[2], day: +m[3] } })
              }}
            />
            {state.canTime && (
              <input
                type="time"
                aria-label={label ? `${label}: ${tt("Time")}` : tt("Time")}
                data-countdown-time=""
                className={cn(field, "min-w-[7.5rem] flex-[1_1_0%] max-sm:min-w-[8.75rem]")}
                value={time}
                disabled={!state.date}
                onChange={(e) => {
                  const m = /^(\d{2}):(\d{2})/.exec(e.target.value)
                  if (m) apply({ time: { hour: +m[1], minute: +m[2] } })
                }}
              />
            )}
          </div>
          {choosesZone && (
            <div className="relative">
              <select
                aria-label={tt("Time zone")}
                data-countdown-zone=""
                className={cn(field, "appearance-none pr-8")}
                value={state.offset ?? 0}
                disabled={!state.date}
                onChange={(e) => apply({ offset: Number(e.target.value) })}
              >
                {choices.map((o) => (
                  <option key={o} value={o}>
                    {offsetLabel(o)}
                  </option>
                ))}
              </select>
              <svg aria-hidden="true" viewBox="0 0 12 12" className="pointer-events-none absolute right-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground">
                <path d="M3 4.5 6 7.5 9 4.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
          )}
        </div>
      </div>
      {state.invalid && <p className={PROBLEM}>{tt("{value} is not a real date. Pick a day.", { value: state.invalid })}</p>}
      {choosesZone && (
        <p className={NOTE} data-countdown-dst="">
          {tt("A fixed UTC offset does not move with daylight saving.")}
          {hint ? ` ${tt("{city} is on {zone} on that date.", hint)}` : ""}
        </p>
      )}
      {state.zone === "utc" && <p className={NOTE}>{tt("Saved in UTC.")}</p>}
    </div>
  )
}
