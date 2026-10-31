/**
 * ===========================================================================
 *  WHAT AN EXPLORE CARD KNOWS OF ITS CREATOR (round 45 leftovers)
 * ===========================================================================
 * Explore read `creators.user_id` to find each creator's face, and handed the
 * whole row to the cards, so every product on /explore and /explore/<category>
 * carried its creator's sign in id (and the profile's id, the same id again)
 * in the page's payload. Nothing on a card uses either: a card draws a name,
 * an avatar and a link to /<username>.
 *
 * So the card gets this and only this: the creator's public id (creators.id,
 * which every public route already takes), their handle, their niche tags
 * and their face. Anything that has to act for a creator from a card asks the
 * server with the handle or the public id, and the server resolves the rest.
 */

export interface CardCreator {
  /** creators.id: the creator's public id, never the account's. */
  id: string
  slug: string | null
  niche_tags: string[] | null
  profile: { display_name: string | null; avatar_url: string | null; username: string | null } | null
}

type Row = Record<string, unknown> | null | undefined

const text = (v: unknown): string | null => (typeof v === "string" ? v : null)

/** The card's view of a creator row and its profile row; null without a creator. */
export function cardCreator(creator: Row, profile: Row): CardCreator | null {
  if (!creator || typeof creator.id !== "string") return null
  return {
    id: creator.id,
    slug: text(creator.slug),
    niche_tags: Array.isArray(creator.niche_tags) ? (creator.niche_tags as unknown[]).filter((t): t is string => typeof t === "string") : null,
    profile: profile ? { display_name: text(profile.display_name), avatar_url: text(profile.avatar_url), username: text(profile.username) } : null,
  }
}
