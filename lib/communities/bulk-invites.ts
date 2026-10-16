/**
 * ===========================================================================
 *  INVITING A LIST OF PEOPLE (round 32)
 * ===========================================================================
 * The addresses in what an admin pasted or uploaded: a column of emails, a
 * line of them with commas, or a CSV exported from a mailing list (the
 * address is found in whichever column holds it, "Name <a@b.co>" too).
 * Pure and browser safe: the sheet counts with the same reading the server
 * sends with.
 */

export const BULK_INVITE_MAX = 200
/** Email invites one community sends in a day, whoever sends them. */
export const BULK_INVITES_PER_DAY = 500
/** What a pasted or uploaded file may hold, in characters. */
export const BULK_TEXT_MAX = 200_000

const EMAIL = /[A-Za-z0-9._%+'-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g
const VALID = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export interface ParsedList {
  /** Each address once, lower case, in the order first found. */
  emails: string[]
  /** How many times an address appeared again. */
  repeated: number
  /** More than BULK_INVITE_MAX: these are left out. */
  over: number
}

/** Every distinct email address in a pasted list or a CSV file. */
export function parseEmailList(text: unknown, max: number = BULK_INVITE_MAX): ParsedList {
  const s = typeof text === "string" ? text.slice(0, BULK_TEXT_MAX) : ""
  const seen = new Set<string>()
  const emails: string[] = []
  let repeated = 0
  for (const m of s.matchAll(EMAIL)) {
    const e = m[0].toLowerCase().replace(/^[.'-]+|[.'-]+$/g, "")
    if (e.length > 254 || !VALID.test(e)) continue
    if (seen.has(e)) {
      repeated++
      continue
    }
    seen.add(e)
    emails.push(e)
  }
  return { emails: emails.slice(0, max), repeated, over: Math.max(0, emails.length - max) }
}

export interface BulkInviteResult {
  /** Invited now, and the email went out (or is queued). */
  sent: number
  /** Already a member: not invited. */
  members: number
  /** Invited in the last week already: not sent again. */
  recent: number
  /** Could not be invited (the day's limit, or an error). */
  failed: number
  /** Left for tomorrow by the community's daily limit. */
  limited: number
}
