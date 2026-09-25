/**
 * ===========================================================================
 *  BADGES STORELIB GIVES A CREATOR
 * ===========================================================================
 * A mark beside a creator's name that the creator did not choose and cannot
 * set: Storelib grants it. That is what separates these from the Verified
 * badge on the Pro plan, which is a setting the creator turns on in the
 * builder (`globalSettings.verifiedBadgeEnabled`) and lives in their page's
 * config. Those stay where they are.
 *
 * WHERE THEY ARE STORED. `profiles.badges`, a text[] of the ids below
 * (supabase/migrations/20261001_creator_badges.sql). A list rather than a
 * boolean per badge, so the next one is a new id and not a new column.
 *
 * AND BEFORE THAT COLUMN EXISTS. The pages read the profile with
 * `select("*")`, so the column arrives by itself once the SQL has been run.
 * Until then `GRANTED_BY_HANDLE` grants the same badges by username, so the
 * page is right on the day this ships rather than on the day somebody runs
 * a migration. The two are merged, so running the SQL changes nothing that
 * is already showing.
 *
 * Only known ids come out. Whatever else a row holds is dropped here, so a
 * typo in the table is a badge that does not show, never an empty mark or a
 * label nobody wrote.
 */

export type CreatorBadgeId = "veteran"

export const CREATOR_BADGES: Record<CreatorBadgeId, { label: string }> = {
  /* One of the first creators to sell on Storelib. */
  veteran: { label: "Veteran" },
}

/** The order they sit in beside a name, whatever order a row lists them. */
const ORDER: CreatorBadgeId[] = ["veteran"]

/**
 * Granted in code, keyed by the handle in lowercase. Mirrors the grant in
 * the migration; see the note at the top.
 */
const GRANTED_BY_HANDLE: Record<string, CreatorBadgeId[]> = {
  /* Luca Dragoste, storelib.com/lucadragoste. */
  lucadragoste: ["veteran"],
}

const isBadge = (value: unknown): value is CreatorBadgeId =>
  typeof value === "string" && Object.prototype.hasOwnProperty.call(CREATOR_BADGES, value)

export function creatorBadges(
  profile: { username?: string | null; badges?: unknown } | null | undefined,
): CreatorBadgeId[] {
  if (!profile) return []
  const stored = Array.isArray(profile.badges) ? profile.badges.filter(isBadge) : []
  const handle = typeof profile.username === "string" ? profile.username.trim().toLowerCase() : ""
  const granted = handle ? GRANTED_BY_HANDLE[handle] ?? [] : []
  const all = new Set<CreatorBadgeId>([...stored, ...granted])
  return ORDER.filter((id) => all.has(id))
}
