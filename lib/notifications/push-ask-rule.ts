/**
 * HOW OFTEN THE APP ASKS ABOUT NOTIFICATIONS.
 *
 * The one rule for every permission the app asks for now lives in
 * lib/native-permissions-rule.ts (permissionAskStep): never before sign in,
 * one sheet per launch, each kind at most every seven days and a limited
 * number of times per install. These names are kept for what still reads
 * them.
 */
import { ASK_AT_MOST_TIMES, ASK_EVERY_MS, type PermissionAskRecord } from "../native-permissions-rule"

export const ASK_AGAIN_AFTER_MS = ASK_EVERY_MS
export const ASK_AT_MOST = ASK_AT_MOST_TIMES

export type AskRecord = PermissionAskRecord

export function shouldAsk(record: AskRecord | null, now: number): boolean {
  if (!record) return true
  if (record.count >= ASK_AT_MOST) return false
  return now - record.at >= ASK_AGAIN_AFTER_MS
}
