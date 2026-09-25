"use client"

/**
 * ===========================================================================
 *  THE TIME ZONE, PICKED THE WAY ANALYTICS PICKS A PRODUCT
 * ===========================================================================
 * "The select time zone pop up is too AI, our old UI. Bring the Products,
 * Orders and Analytics kind of UI to it." So it is built from the same parts
 * as the Analytics product picker (components/app/date-range-picker): the
 * same rows with a check on the one chosen, in a popover under the field on
 * a computer and the shared sheet on a phone (components/ui/bottom-sheet),
 * with a search field at the top because there are sixty of them.
 *
 * The offset beside each place is worked out now, by the browser, for today:
 * London reads UTC+1 in summer and UTC in winter. The list used to carry fixed
 * strings that were wrong for half the year. The zone this device is in comes
 * first, so the usual answer is one press.
 */
import * as React from "react"
import { ChevronDown } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { BottomSheet } from "@/components/ui/bottom-sheet"
import { cn } from "@/lib/utils"
import { PickerDivider, PickerRow, onRowsKey, pickerSurface, usePhone } from "@/components/app/date-range-picker"

export const TIME_ZONES: { code: string; name: string }[] = [
  { code: "UTC", name: "UTC" },
  { code: "America/New_York", name: "Eastern Time (US & Canada)" },
  { code: "America/Chicago", name: "Central Time (US & Canada)" },
  { code: "America/Denver", name: "Mountain Time (US & Canada)" },
  { code: "America/Los_Angeles", name: "Pacific Time (US & Canada)" },
  { code: "America/Anchorage", name: "Alaska" },
  { code: "Pacific/Honolulu", name: "Hawaii" },
  { code: "America/Phoenix", name: "Arizona" },
  { code: "America/Toronto", name: "Toronto" },
  { code: "America/Vancouver", name: "Vancouver" },
  { code: "America/Mexico_City", name: "Mexico City" },
  { code: "America/Bogota", name: "Bogotá" },
  { code: "America/Lima", name: "Lima" },
  { code: "America/Santiago", name: "Santiago" },
  { code: "America/Sao_Paulo", name: "São Paulo" },
  { code: "America/Buenos_Aires", name: "Buenos Aires" },
  { code: "Europe/London", name: "London" },
  { code: "Europe/Dublin", name: "Dublin" },
  { code: "Europe/Lisbon", name: "Lisbon" },
  { code: "Europe/Paris", name: "Paris" },
  { code: "Europe/Berlin", name: "Berlin" },
  { code: "Europe/Amsterdam", name: "Amsterdam" },
  { code: "Europe/Brussels", name: "Brussels" },
  { code: "Europe/Madrid", name: "Madrid" },
  { code: "Europe/Rome", name: "Rome" },
  { code: "Europe/Zurich", name: "Zurich" },
  { code: "Europe/Vienna", name: "Vienna" },
  { code: "Europe/Stockholm", name: "Stockholm" },
  { code: "Europe/Oslo", name: "Oslo" },
  { code: "Europe/Copenhagen", name: "Copenhagen" },
  { code: "Europe/Warsaw", name: "Warsaw" },
  { code: "Europe/Prague", name: "Prague" },
  { code: "Europe/Budapest", name: "Budapest" },
  { code: "Europe/Helsinki", name: "Helsinki" },
  { code: "Europe/Athens", name: "Athens" },
  { code: "Europe/Bucharest", name: "Bucharest" },
  { code: "Europe/Kiev", name: "Kyiv" },
  { code: "Europe/Moscow", name: "Moscow" },
  { code: "Europe/Istanbul", name: "Istanbul" },
  { code: "Asia/Dubai", name: "Dubai" },
  { code: "Asia/Karachi", name: "Karachi" },
  { code: "Asia/Kolkata", name: "Mumbai, Kolkata, New Delhi" },
  { code: "Asia/Dhaka", name: "Dhaka" },
  { code: "Asia/Bangkok", name: "Bangkok" },
  { code: "Asia/Jakarta", name: "Jakarta" },
  { code: "Asia/Singapore", name: "Singapore" },
  { code: "Asia/Hong_Kong", name: "Hong Kong" },
  { code: "Asia/Shanghai", name: "Beijing, Shanghai" },
  { code: "Asia/Taipei", name: "Taipei" },
  { code: "Asia/Seoul", name: "Seoul" },
  { code: "Asia/Tokyo", name: "Tokyo" },
  { code: "Australia/Perth", name: "Perth" },
  { code: "Australia/Adelaide", name: "Adelaide" },
  { code: "Australia/Brisbane", name: "Brisbane" },
  { code: "Australia/Sydney", name: "Sydney" },
  { code: "Australia/Melbourne", name: "Melbourne" },
  { code: "Pacific/Auckland", name: "Auckland" },
  { code: "Pacific/Fiji", name: "Fiji" },
  { code: "Africa/Cairo", name: "Cairo" },
  { code: "Africa/Johannesburg", name: "Johannesburg" },
  { code: "Africa/Lagos", name: "Lagos" },
  { code: "Africa/Nairobi", name: "Nairobi" },
]

/** "UTC+2", "UTC−3", "UTC+5:30", "UTC" for today, in this browser. */
export function offsetOf(code: string, at = new Date()): string {
  try {
    const part = new Intl.DateTimeFormat("en-US", { timeZone: code, timeZoneName: "longOffset" })
      .formatToParts(at)
      .find((p) => p.type === "timeZoneName")?.value
    const m = /GMT([+-])(\d{2}):(\d{2})/.exec(part ?? "")
    if (!m) return "UTC"
    const h = String(Number(m[2]))
    return `UTC${m[1] === "-" ? "−" : "+"}${h}${m[3] === "00" ? "" : `:${m[3]}`}`
  } catch {
    return ""
  }
}

/** Minutes east of UTC, for ordering the list west to east. */
function minutesOf(code: string, at = new Date()): number {
  const o = offsetOf(code, at)
  const m = /UTC([+−])(\d+)(?::(\d+))?/.exec(o)
  if (!m) return 0
  const v = Number(m[2]) * 60 + Number(m[3] ?? 0)
  return m[1] === "+" ? v : -v
}

/** The name a zone is shown by: the list's, or the city at the end of its code. */
export function zoneName(code: string): string {
  return TIME_ZONES.find((z) => z.code === code)?.name ?? code.split("/").pop()!.replace(/_/g, " ")
}

function deviceZone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null
  } catch {
    return null
  }
}

function List({ value, compact, onPick }: { value: string; compact: boolean; onPick: (code: string) => void }) {
  const [query, setQuery] = React.useState("")
  const zones = React.useMemo(() => {
    const now = new Date()
    return TIME_ZONES.map((z) => ({ ...z, offset: offsetOf(z.code, now), minutes: minutesOf(z.code, now) })).sort(
      (a, b) => a.minutes - b.minutes || a.name.localeCompare(b.name),
    )
  }, [])
  const device = React.useMemo(deviceZone, [])
  const q = query.trim().toLowerCase()
  const shown = q
    ? zones.filter((z) => z.name.toLowerCase().includes(q) || z.code.toLowerCase().includes(q) || z.offset.toLowerCase().includes(q))
    : zones

  return (
    <div className={compact ? "px-2 pb-2 pt-1" : "p-1.5"}>
      <div className={compact ? "px-1 pb-2" : "px-1 pb-1.5 pt-0.5"}>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault()
              e.currentTarget.closest("[data-time-zone-picker]")?.querySelector<HTMLElement>("[data-row]")?.focus()
            }
          }}
          placeholder="Search a city or UTC offset"
          aria-label="Search time zones"
          autoComplete="off"
          data-time-zone-search
          className={cn(
            /* 16px on a phone: anything smaller and iOS zooms the page to type. */
            "w-full min-w-0 rounded-lg border border-[#d5d7dd] bg-white px-3 text-[#1a1a2e] outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-[#9ca3af] focus:border-[#c9ccd3] focus:shadow-[0_0_0_3px_rgba(17,17,19,0.06)]",
            compact ? "h-11 text-[16px]" : "h-9 text-[13px]",
          )}
        />
      </div>
      <div
        role="menu"
        aria-label="Time zone"
        onKeyDown={onRowsKey}
        className={cn("overflow-y-auto overscroll-contain", compact ? "max-h-[52dvh]" : "max-h-[320px]")}
      >
        {!q && device && device !== value ? (
          <>
            <PickerRow rowKey={`device:${device}`} compact={compact} checked={false} detail={offsetOf(device)} onClick={() => onPick(device)}>
              This device: {zoneName(device)}
            </PickerRow>
            <PickerDivider compact={compact} />
          </>
        ) : null}
        {shown.map((z) => (
          <PickerRow key={z.code} rowKey={z.code} compact={compact} checked={value === z.code} detail={z.offset} onClick={() => onPick(z.code)}>
            {z.name}
          </PickerRow>
        ))}
        {q && shown.length === 0 ? (
          <p className={cn("px-3 py-2 text-[#6b7280]", compact ? "text-[15px]" : "text-[13px]")}>No time zone matches “{query.trim()}”</p>
        ) : null}
      </div>
    </div>
  )
}

/**
 * The field and its list. The field is Settings' own 44px field, with the
 * place on the left, its offset on the right and a chevron, so it reads as
 * one of the page's inputs rather than a button.
 */
export function TimeZonePicker({ value, onChange }: { value: string; onChange: (code: string) => void }) {
  const [open, setOpen] = React.useState(false)
  const [session, setSession] = React.useState(0)
  const phone = usePhone()
  const setShown = (o: boolean) => {
    if (o) setSession((s) => s + 1)
    setOpen(o)
  }
  const pick = (code: string) => {
    setOpen(false)
    onChange(code)
  }
  const offset = offsetOf(value)
  const trigger = (
    <button
      type="button"
      data-time-zone-field=""
      data-state={open ? "open" : "closed"}
      aria-haspopup="dialog"
      aria-expanded={open}
      onClick={phone ? () => setShown(true) : undefined}
      className="flex h-11 w-full min-w-0 cursor-pointer items-center gap-2 rounded-xl border border-[#e5e7eb] bg-white px-3 text-left text-[14px] text-[#1a1a2e] shadow-[0_1px_0_rgba(17,24,39,0.04)] outline-none transition-[background-color,box-shadow,border-color] duration-100 hover:bg-[#fafafb] data-[state=open]:border-[#1a1a2e] data-[state=open]:shadow-[0_0_0_3px_rgba(26,26,46,0.08)] focus-visible:border-[#1a1a2e] focus-visible:shadow-[0_0_0_3px_rgba(26,26,46,0.10)]"
    >
      <span className="min-w-0 flex-1 truncate">{zoneName(value)}</span>
      {offset ? <span className="shrink-0 tabular-nums text-[13px] text-[#6b7280]">{offset}</span> : null}
      <ChevronDown className={cn("h-4 w-4 shrink-0 text-[#6b7280] transition-transform duration-150", open && "rotate-180")} aria-hidden />
    </button>
  )
  const list = (compact: boolean) => <List key={session} value={value} compact={compact} onPick={pick} />

  if (phone) {
    return (
      <>
        {trigger}
        <BottomSheet isOpen={open} onClose={() => setOpen(false)} title="Time zone">
          <div data-time-zone-picker>{list(true)}</div>
        </BottomSheet>
      </>
    )
  }
  return (
    <Popover open={open} onOpenChange={setShown}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={6}
        data-time-zone-picker
        className={cn(pickerSurface, "w-[var(--radix-popover-trigger-width)] min-w-[300px] max-w-[calc(100vw-24px)]")}
        onOpenAutoFocus={(e) => {
          e.preventDefault()
          ;(e.currentTarget as HTMLElement | null)?.querySelector<HTMLElement>("[data-time-zone-search]")?.focus({ preventScroll: true })
          /* The chosen zone in view under the search, not the top of a list of sixty. */
          ;(e.currentTarget as HTMLElement | null)?.querySelector<HTMLElement>("[data-row][data-checked]")?.scrollIntoView({ block: "center" })
        }}
      >
        {list(false)}
      </PopoverContent>
    </Popover>
  )
}
