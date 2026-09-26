import "server-only"

/**
 * ===========================================================================
 *  WHAT A PERSON HAS SAID THEY WANT
 * ===========================================================================
 * One row per person, category and channel in notification_preferences. No
 * row means the registry's default. Required service notifications
 * (security, money, receipts) are always allowed, whatever the rows say:
 * turning them off would hide a failed payout or a changed password.
 *
 * Marketing needs a row that says yes; the default never counts as consent.
 *
 * Every function takes the service role client (routes, the webhook) or a
 * NotifyStore (the worker, tests).
 */
import { storeOf, type DbLike, type PreferenceRow, type PreferenceSource } from "./store"
import type { Channel, PreferenceCategory, RegistryEntry } from "./types"

export type { PreferenceRow, PreferenceSource }

export async function getPreferences(db: DbLike, userId: string): Promise<PreferenceRow[]> {
  return storeOf(db).preferences(userId)
}

export async function setPreference(
  db: DbLike,
  userId: string,
  category: PreferenceCategory,
  channel: Channel,
  enabled: boolean,
  source: PreferenceSource,
): Promise<void> {
  /* Security cannot be switched off, from any source. */
  if (category === "security" && !enabled) return
  await storeOf(db).setPreference(userId, category, channel, enabled, source)
}

/** The decision, from rows already read. */
export function decide(rows: readonly PreferenceRow[], entry: RegistryEntry, channel: Channel): boolean {
  if (entry.requirement === "required_service") return true
  const row = rows.find((r) => r.category === entry.category && r.channel === channel)
  if (entry.requirement === "marketing") return row?.enabled === true
  return row ? row.enabled : entry.defaultOn
}

export async function allowed(db: DbLike, userId: string | null | undefined, entry: RegistryEntry, channel: Channel): Promise<boolean> {
  if (entry.requirement === "required_service") return true
  if (!userId) return entry.requirement !== "marketing" && entry.defaultOn
  return decide(await storeOf(db).preferences(userId), entry, channel)
}
