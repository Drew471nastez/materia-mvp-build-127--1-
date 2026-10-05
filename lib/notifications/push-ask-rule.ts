/**
 * WHEN THE APP ASKS FOR NOTIFICATIONS ON ITS OWN.
 *
 * A reinstall resets the phone: the permission goes back to "not asked" and
 * the device token changes, so somebody whose account still says push is on
 * silently stops receiving anything. The app asks again
 * (components/platform/notifications-ask.tsx), and this is the rule for how
 * often, kept apart from the sheet so it can be read back on its own.
 *
 * A "not now" is honoured for a week and asked three times in all, then
 * never again: Settings, Notifications is always there for somebody who
 * changes their mind, and nagging for a permission is how an app earns a
 * "Don't Allow" it can never undo.
 */

export const ASK_AGAIN_AFTER_MS = 7 * 24 * 3600 * 1000
export const ASK_AT_MOST = 3

export interface AskRecord {
  /** When they were last asked. */
  at: number
  /** How many times in all, on this install. */
  count: number
}

export function shouldAsk(record: AskRecord | null, now: number): boolean {
  if (!record) return true
  if (record.count >= ASK_AT_MOST) return false
  return now - record.at >= ASK_AGAIN_AFTER_MS
}
