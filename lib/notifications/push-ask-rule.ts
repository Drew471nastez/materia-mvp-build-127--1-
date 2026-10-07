/**
 * HOW OFTEN THE APP SAYS NOTIFICATIONS ARE OFF.
 *
 * The phone's own prompt is asked on every install
 * (components/platform/notifications-ask.tsx). After a "Don't Allow" only the
 * phone's settings can turn them back on, so a sheet that opens those
 * settings comes back every few days, a limited number of times per install.
 */

export const ASK_AGAIN_AFTER_MS = 4 * 24 * 3600 * 1000
export const ASK_AT_MOST = 8

export interface AskRecord {
  /** When they were last reminded. */
  at: number
  /** How many times in all, on this install. */
  count: number
}

export function shouldAsk(record: AskRecord | null, now: number): boolean {
  if (!record) return true
  if (record.count >= ASK_AT_MOST) return false
  return now - record.at >= ASK_AGAIN_AFTER_MS
}
