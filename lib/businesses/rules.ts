/**
 * The rules of more than one business on one login, free of any server or
 * browser dependency so tests/business-accounts.test.ts can hold them to
 * account.
 *
 * A login is a group: the account that signed up (the owner) and the
 * business accounts it made (its members), each linked to the owner in
 * public.business_links. No chains: a member never owns one of its own.
 * The database holds the same shape (supabase/migrations/
 * 20261001_business_accounts.sql) and the same limit (supabase/sql/run-now/
 * 38_business_limit_three.sql).
 */

/**
 * How many businesses one login can have, its first one included. The one
 * number the server, the routes and the account menu read. The database's
 * trigger (part 38) holds the same number; tests/business-accounts.test.ts
 * fails if the two ever differ.
 */
export const MAX_BUSINESSES = 3

/** The owner and the businesses it made, oldest first. */
export interface BusinessGroup {
  ownerId: string
  memberIds: string[]
}

export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Every account in the group, the owner first, then its businesses in the order they were made. */
export function groupIds(group: BusinessGroup | null, self: string): string[] {
  return group ? [group.ownerId, ...group.memberIds] : [self]
}

/** Whether `from` may switch to `to`: only inside the group they share, never to itself, never to anything but an id. */
export function maySwitch(group: BusinessGroup | null, from: string, to: string): boolean {
  if (!group || from === to || !UUID_PATTERN.test(to)) return false
  const ids = groupIds(group, from)
  return ids.includes(from) && ids.includes(to)
}

/** Whether another business can be made: from the first business only, and only while the login has fewer than MAX_BUSINESSES. */
export function canAddBusiness(count: number, role: "owner" | "member"): boolean {
  return role === "owner" && count < MAX_BUSINESSES
}

const COUNT_WORDS = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"]

/** A small count as a word, as the copy reads it: "three businesses". */
export function countWord(n: number): string {
  return COUNT_WORDS[n] ?? String(n)
}

/** What the person reads when the login already has MAX_BUSINESSES. */
export const LIMIT_REACHED = `You already have ${countWord(MAX_BUSINESSES)} businesses, the most one login can have.`

/**
 * What the person reads when the app allows another business but the
 * database does not yet (part 38 not run, so the old one per login rule
 * refuses the link). The new account is removed again; nothing is left
 * half made.
 */
export const LIMIT_NOT_OPEN_YET = "Another business cannot be added just yet. Try again later."

/**
 * Why the database refused a link, in a sentence. 23514 is part 38's
 * trigger: the login has MAX_BUSINESSES already, perhaps from a second press
 * a moment before. 23505 on business_links_one_per_owner is the one per
 * login rule part 38 replaces, still in place because part 38 has not run.
 */
export function linkRefusal(error: { code?: string | null; message?: string | null }): string {
  if (error.code === "23514") return LIMIT_REACHED
  if (error.code === "23505") return /business_links_one_per_owner/.test(error.message ?? "") ? LIMIT_NOT_OPEN_YET : LIMIT_REACHED
  return "The business could not be created. Try again in a moment."
}
