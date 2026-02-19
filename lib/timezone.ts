/**
 * Timezone utility — reads the user's preferred timezone from localStorage
 * and provides helpers for timezone-aware date formatting.
 */

const STORAGE_KEY = "storelib_timezone"

/** Get the user's stored timezone or fall back to browser detection / UTC */
export function getStoredTimezone(): string {
  if (typeof window === "undefined") return "UTC"
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) return stored
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
  } catch {
    return "UTC"
  }
}

/** Format a date string/Date with the user's timezone applied */
export function formatDateWithTimezone(
  dateStr: string | Date,
  options: Intl.DateTimeFormatOptions = {},
): string {
  const tz = getStoredTimezone()
  const date = typeof dateStr === "string" ? new Date(dateStr) : dateStr
  return date.toLocaleDateString("en-US", { ...options, timeZone: tz })
}

/** Format a date+time string/Date with the user's timezone applied */
export function formatDateTimeWithTimezone(
  dateStr: string | Date,
  options: Intl.DateTimeFormatOptions = {},
): string {
  const tz = getStoredTimezone()
  const date = typeof dateStr === "string" ? new Date(dateStr) : dateStr
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
    ...options,
    timeZone: tz,
  })
}

/** Get hour number (0-23) in the user's timezone */
export function getHourInTimezone(date: Date): number {
  const tz = getStoredTimezone()
  const parts = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    hour12: false,
    timeZone: tz,
  }).formatToParts(date)
  const hourPart = parts.find((p) => p.type === "hour")
  return parseInt(hourPart?.value || "0", 10)
}

/** Get a short date key (e.g., "Jan 15") in the user's timezone */
export function getDateKeyInTimezone(date: Date | string): string {
  const tz = getStoredTimezone()
  const d = typeof date === "string" ? new Date(date) : date
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: tz,
  })
}
