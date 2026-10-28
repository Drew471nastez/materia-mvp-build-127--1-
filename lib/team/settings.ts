/**
 * ===========================================================================
 *  THE STORE SETTINGS A TEAM MEMBER MAY CHANGE (round 41)
 * ===========================================================================
 * Store settings, given to a member, is Settings › Store details: the
 * store's name, its contact email, its phone and its logo. Nothing else in
 * Settings is theirs: payouts and billing, the business details printed on
 * invoices, the store's currency, checkout, taxes, domains, deleting the
 * store, the team's ownership and every key stay with the owner. Pure, so
 * the route, the page and the suite ask the same lists.
 */
import { permits, type TeamPermission } from "./permissions"

/** The Settings sections a member with Store settings sees, besides their own account's. */
export const MEMBER_SETTINGS_TABS: readonly string[] = ["store"]

/** What a member may send to PUT /api/store/settings. */
export const MEMBER_STORE_SETTING_KEYS: readonly string[] = ["storeName", "supportEmail", "phone", "phoneCountry", "logoUrl"]

/* Said in English as the route's other answers are. i18n-ignore-start */
export const OWNER_KEEPS_SETTING = "Only the store's owner can change that."
/* i18n-ignore-end */

/** Whether a member may send this change: every key one of MEMBER_STORE_SETTING_KEYS, and at least one. */
export function memberMaySave(body: Record<string, unknown>): boolean {
  const keys = Object.keys(body)
  return keys.length > 0 && keys.every((k) => MEMBER_STORE_SETTING_KEYS.includes(k))
}

/** The Settings sections a member working in a store sees beyond their own account's. */
export function memberSettingsTabs(perms: readonly TeamPermission[] | null): readonly string[] {
  return perms && permits(perms, "settings") ? MEMBER_SETTINGS_TABS : []
}
