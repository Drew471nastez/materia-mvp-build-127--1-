import type { IsoDate } from "./types"

/**
 * The day the competitor facts were checked against their official pages.
 * A fact checked on another day carries its own date in its Source.
 */
export const CHECKED_ON: IsoDate = "2026-10-29"

/** "29 October 2026", the way the pages print a date. */
export function formatCheckedDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number)
  const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]
  return `${d} ${months[(m ?? 1) - 1]} ${y}`
}
