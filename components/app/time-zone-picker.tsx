"use client"

/**
 * ===========================================================================
 *  THE TIME ZONE FIELD
 * ===========================================================================
 * "The time zone as well, make it cleaner." Built from the same parts as the
 * Language field (components/ui/choice-list): a popover under the field on a
 * computer and the shared sheet on a phone, a search at the top, and rows
 * with the city, its region under it and today's offset on the right, a
 * check on the one chosen.
 *
 * Every zone the browser knows is listed (about 420), west to east, not the
 * sixty that happened to be in a hand written list, so any city can be found
 * by its own name. The offset is worked out now, for today: London reads
 * UTC+1 in summer and UTC in winter.
 *
 * What the choice changes is lib/account/time-zone's to say: it is saved to
 * the account and followed by the server as well as the browser.
 */
import * as React from "react"
import { ChoiceAction, ChoicePicker, type Choice } from "@/components/ui/choice-list"
import { tt } from "@/lib/i18n/text"

/** Zones better known by another name, found by it in search and shown under the city. */
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
  /* The older names some browsers still list these under. */
  { code: "Asia/Calcutta", name: "Mumbai, Kolkata, New Delhi" },
  { code: "Asia/Saigon", name: "Ho Chi Minh City" },
  { code: "Asia/Katmandu", name: "Kathmandu" },
  { code: "Asia/Rangoon", name: "Yangon" },
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
function minutesOf(offset: string): number {
  const m = /UTC([+−])(\d+)(?::(\d+))?/.exec(offset)
  if (!m) return 0
  const v = Number(m[2]) * 60 + Number(m[3] ?? 0)
  return m[1] === "+" ? v : -v
}

/** The city at the end of a zone's name: "Buenos Aires" from America/Argentina/Buenos_Aires. */
function cityOf(code: string): string {
  return code.split("/").pop()!.replace(/_/g, " ")
}

/** The name a zone is shown by: the city, or the list's name for the few that have one. */
export function zoneName(code: string): string {
  if (code === "UTC") return "UTC"
  return cityOf(code)
}

/** Every zone this browser knows, else the list above. */
function allZones(): string[] {
  try {
    const list = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.("timeZone")
    if (list && list.length > 0) return list.includes("UTC") ? list : [...list, "UTC"]
  } catch {
    /* An older browser: the curated list. */
  }
  return TIME_ZONES.map((z) => z.code)
}

let cached: { at: number; choices: Choice[] } | null = null

/**
 * The zones as choices, west to east: the city, its region under it
 * ("America · Argentina", or "Eastern Time (US & Canada)" where the zone has
 * a better known name), and today's offset on the right. Search finds a
 * city, a region, a name, or an offset written any usual way.
 */
export function timeZoneChoices(now = new Date()): Choice[] {
  if (cached && Math.abs(cached.at - now.getTime()) < 60 * 60 * 1000) return cached.choices
  const names = new Map(TIME_ZONES.map((z) => [z.code, z.name]))
  const choices = allZones()
    .map((code) => {
      const offset = offsetOf(code, now)
      const parts = code.split("/")
      const region = parts.length > 1 ? parts.slice(0, -1).join(" · ").replace(/_/g, " ") : tt("Coordinated Universal Time")
      const known = names.get(code)
      const plain = offset.replace("−", "-")
      return {
        value: code,
        label: zoneName(code),
        detail: known && known !== cityOf(code) ? known : region,
        aside: offset,
        keywords: `${code} ${known ?? ""} ${region} ${plain} ${plain.replace("UTC", "GMT")} ${plain.replace("UTC", "")}`,
        minutes: minutesOf(offset),
      }
    })
    .sort((a, b) => a.minutes - b.minutes || a.label.localeCompare(b.label))
    .map(({ minutes: _minutes, ...c }) => c)
  cached = { at: now.getTime(), choices }
  return choices
}

function deviceZone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null
  } catch {
    return null
  }
}

/**
 * The field and its list. The field is Settings' own 44px field: the city on
 * the left, today's offset on the right, a chevron. Above the list, while
 * nothing is typed, "Use my current time zone" when this device is in a
 * different one.
 */
export function TimeZonePicker({ value, onChange }: { value: string; onChange: (code: string) => void }) {
  const device = React.useMemo(deviceZone, [])
  return (
    <ChoicePicker
      name="time-zone"
      title={tt("Time zone")}
      choices={timeZoneChoices}
      value={value}
      onChange={onChange}
      placeholder={tt("Search a city, region or UTC offset")}
      fieldLabel={zoneName(value)}
      fieldAside={offsetOf(value)}
      lead={
        device && device !== value
          ? (compact, pick) => (
              <ChoiceAction compact={compact} aside={offsetOf(device)} onClick={() => pick(device)}>
                {tt("Use my current time zone ({name})", { name: zoneName(device) })}
              </ChoiceAction>
            )
          : undefined
      }
    />
  )
}
