"use client"

/**
 * ===========================================================================
 *  A DATE AND A TIME: WHEN A SALE ENDS, WHEN A LAUNCH STARTS
 * ===========================================================================
 * The control for `datetime`. It was one `datetime-local` box, which on a
 * computer is a row of tiny fields and a calendar that hides the time, and
 * which printed the date back under itself in a line nobody read.
 *
 * Now it reads like a sentence and is set in one or two taps:
 *
 *   ┌──────────────────────────────────────────┐
 *   │  Sat, 14 Mar 2026 · 23:00                │   what was chosen, in words,
 *   │  in 5 days, 4 hours                      │   and how far away it is
 *   ├──────────────────────┬───────────────────┤
 *   │  [ 2026-03-14 ]      │  [ 23:00 ]        │   the device's own pickers
 *   └──────────────────────┴───────────────────┘
 *     1 day  3 days  1 week  Month end           (Clear sits top right)
 *
 * The date and the time are two pickers, because they are two decisions and
 * a phone's wheels already know both. The shortcuts (from now) set the date and keep
 * the time (23:59 when there was none, the end of the day a sale means).
 *
 * Stored as written, `2026-03-14T23:00`, with no time zone added: the
 * creator's "Sunday 11pm" is read as Sunday 11pm wherever it is drawn
 * (lib/storelib-theme/values.ts, parseDatetime), and a countdown section's
 * own Timezone setting says which Sunday. A zone that was stored is kept.
 */
import * as React from "react"

import { cn } from "@/lib/utils"
import { cleanDatetime } from "@/lib/storelib-theme/values"
import { TEXT_BUTTON } from "./styles"
import { tt } from "@/lib/i18n/text"
import { formatDate } from "@/lib/i18n/format"

const pad = (n: number) => String(n).padStart(2, "0")
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`


/** "2026-05-01 18:00", as older countdowns were typed, reads as "2026-05-01T18:00". */
export function normaliseDatetime(value: unknown): string {
  if (typeof value !== "string") return ""
  return cleanDatetime(value.trim().replace(/^(\d{4}-\d{2}-\d{2})[ ]+(\d)/, "$1T$2"))
}

/** "Sat, 14 Mar 2026 · 23:00", read from the parts so no zone moves it. */
export function datetimeInWords(date: string, time: string): string {
  const [y, m, d] = date.split("-").map(Number)
  if (!y || !m || !d) return ""
  /* In the dashboard's language; UTC on both sides, so no zone moves the day. */
  const day = formatDate(Date.UTC(y, m - 1, d, 12), { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })
  return `${day}${time ? ` · ${time}` : ""}`
}

/** "in 5 days, 4 hours", "in 40 minutes", "2 days ago": on this device's clock, so roughly. */
export function datetimeFromNow(date: string, time: string, now: number): string {
  const at = new Date(`${date}T${time || "00:00"}`).getTime()
  if (!Number.isFinite(at)) return ""
  const diff = at - now
  const mins = Math.round(Math.abs(diff) / 60_000)
  const hours = Math.floor(mins / 60)
  const days = Math.floor(hours / 24)
  const dayWords = (n: number) => tt("{n, plural, one {# day} other {# days}}", { n })
  const hourWords = (n: number) => tt("{n, plural, one {# hour} other {# hours}}", { n })
  const span =
    days >= 1 ? (hours % 24 && days < 7 ? `${dayWords(days)}, ${hourWords(hours % 24)}` : dayWords(days))
    : hours >= 1 ? hourWords(hours)
    : mins >= 1 ? tt("{n, plural, one {# minute} other {# minutes}}", { n: mins })
    : tt("less than a minute")
  return diff >= 0 ? tt("in {span}", { span }) : tt("{span} ago", { span })
}

export function DateTimeControl({
  value,
  onChange,
  label,
}: {
  value: string
  onChange: (v: string) => void
  label?: string
}) {
  const clean = normaliseDatetime(value)
  const date = clean.slice(0, 10)
  const time = clean.length >= 16 ? clean.slice(11, 16) : ""
  /* A zone that was stored rides along untouched; this control never adds one. */
  const zone = clean.length > 16 ? clean.slice(16) : ""

  /* The distance is on a clock, so it moves while the panel is open. Once a minute is plenty. */
  const [now, setNow] = React.useState(() => Date.now())
  React.useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 60_000)
    return () => window.clearInterval(t)
  }, [])

  const write = (d: string, t: string) => onChange(d ? `${d}T${t || "00:00"}${zone}` : "")
  const keepTime = time || "23:59"
  const shortcuts: { label: string; date: () => string }[] = [
    { label: tt("1 day"), date: () => ymd(new Date(Date.now() + 86_400_000)) },
    { label: tt("3 days"), date: () => ymd(new Date(Date.now() + 3 * 86_400_000)) },
    { label: tt("1 week"), date: () => ymd(new Date(Date.now() + 7 * 86_400_000)) },
    {
      label: tt("Month end"),
      date: () => {
        const d = new Date()
        return ymd(new Date(d.getFullYear(), d.getMonth() + 1, 0))
      },
    },
  ]

  const past = date ? new Date(`${date}T${time || "00:00"}`).getTime() < now : false
  const field =
    "h-9 w-full min-w-0 rounded-md border border-border bg-white px-2 text-[12.5px] tabular-nums text-foreground outline-none transition-colors focus:border-foreground/40 focus:ring-2 focus:ring-neutral-900/10 disabled:opacity-50 dark:bg-white/[0.04] max-sm:h-11 max-sm:text-[16px]"

  return (
    <div className="space-y-2" data-datetime-control="">
      <div className="overflow-hidden rounded-lg border border-border bg-white dark:bg-white/[0.03]">
        <div className="relative px-3 py-2.5 pr-14" aria-live="polite" data-datetime-summary="">
          {date && (
            <button type="button" className={cn(TEXT_BUTTON, "absolute right-1.5 top-1.5")} onClick={() => onChange("")} data-datetime-clear="">
              {tt("Clear")}
            </button>
          )}
          {date ? (
            <>
              <p className="text-[13px] font-medium text-foreground max-sm:text-[15px]">{datetimeInWords(date, time)}</p>
              <p className={cn("mt-0.5 text-[12px] max-sm:text-[13px]", past ? "text-[#b45309]" : "text-muted-foreground")}>
                {past ? tt("Already passed, {date}", { date: datetimeFromNow(date, time, now) }) : datetimeFromNow(date, time, now)}
              </p>
            </>
          ) : (
            <p className="text-[13px] text-muted-foreground max-sm:text-[15px]">{tt("No date set yet")}</p>
          )}
        </div>
        <div className="grid grid-cols-2 gap-1.5 border-t border-border bg-[#fafafa] p-1.5 dark:bg-white/[0.02]">
          <label className="relative block">
            <input
              type="date"
              aria-label={label ? `${label}: date` : tt("Date")}
              data-datetime-date=""
              className={field}
              value={date}
              onChange={(e) => write(e.target.value, time)}
            />
          </label>
          <label className="relative block">
            <input
              type="time"
              aria-label={label ? `${label}: time` : tt("Time")}
              data-datetime-time=""
              className={field}
              value={time}
              disabled={!date}
              onChange={(e) => write(date, e.target.value)}
            />
          </label>
        </div>
      </div>
      <div className="grid grid-cols-[1fr_1fr_1fr_1.4fr] gap-1" data-datetime-shortcuts="">
        {shortcuts.map((s) => (
          <button
            key={s.label}
            type="button"
            onClick={() => write(s.date(), keepTime)}
            className="h-7 truncate rounded-full border border-border px-0.5 text-[11px] font-medium text-foreground/80 transition-colors hover:border-foreground/30 hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900/15 max-sm:h-9 max-sm:text-[13px]"
          >
            {s.label}
          </button>
        ))}
      </div>
    </div>
  )
}
