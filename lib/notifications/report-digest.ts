/**
 * ===========================================================================
 *  ONE EMAIL A DAY ABOUT REPORTS, PER MODERATOR AND COMMUNITY
 * ===========================================================================
 * A report reaches the community's owner, admins and moderators at once in
 * the bell and on their phones (lib/communities/server/reports.ts). Email is
 * slower and louder, so it is batched: at most one email a day per person
 * per community, and none on a day with nothing new. Never one per report.
 *
 * WHEN. Days are UTC days, so every server agrees on which day it is.
 *
 *   The first report of a quiet day   that day's email, an hour later
 *                                     (REPORT_DIGEST_DELAY_MS), so a burst
 *                                     of reports is one email; never later
 *                                     than the day's last minute, so the
 *                                     day's email goes on its own day.
 *   More reports before it goes       nothing new: the email waiting will
 *                                     include them (it reads them when it
 *                                     runs).
 *   A report after the day's email    tomorrow's email, an hour into
 *   went (or while it is going)       tomorrow.
 *
 * Each email is a community_jobs row keyed report_digest:<community>:
 * <person>:<day>, unique, so a day can never hold two. When it runs it reads
 * the reports made since it was planned that are still open, and sends
 * nothing when there are none (all handled meanwhile). Pure, so
 * tests/communities-notify.test.ts holds every rule.
 */

export const REPORT_DIGEST_DELAY_MS = 60 * 60_000
const DAY_MS = 86_400_000

/** "2026-10-05": the UTC day of a moment. */
export function utcDay(at: number): string {
  return new Date(at).toISOString().slice(0, 10)
}

function dayStartOf(at: number): number {
  return Math.floor(at / DAY_MS) * DAY_MS
}

/** The queue key of one person's email about one community on one day. */
export function reportDigestKey(communityId: string, userId: string, at: number): string {
  return `report_digest:${communityId}:${userId}:${utcDay(at)}`
}

export interface ReportDigestPlan {
  /** The day the email belongs to, and that day's first moment. */
  day: string
  dayStart: number
  /** When it goes. */
  runAt: number
}

/**
 * What a new report plans, from the state of today's email for this person
 * and community (null: there is none). Null: nothing to plan, today's email
 * is still waiting and will include it.
 */
export function reportDigestPlan(now: number, todayState: string | null): ReportDigestPlan | null {
  const today = dayStartOf(now)
  if (todayState === null) {
    return { day: utcDay(today), dayStart: today, runAt: Math.min(now + REPORT_DIGEST_DELAY_MS, today + DAY_MS - 60_000) }
  }
  if (todayState === "pending") return null
  const tomorrow = today + DAY_MS
  return { day: utcDay(tomorrow), dayStart: tomorrow, runAt: tomorrow + REPORT_DIGEST_DELAY_MS }
}

export const REPORT_REASON_WORDS: Record<string, string> = {
  spam: "spam",
  abuse: "abusive",
  harassment: "harassment",
  off_topic: "off topic",
  illegal: "illegal",
  other: "something else",
}

const TARGET_WORDS: Record<string, string> = { post: "A post", comment: "A comment", message: "A message", member: "A member" }

/** One line of the email per report: "A post, reported as spam: "selling followers"". At most 140 characters. */
export function reportLine(r: { target_type: string; reason: string; note?: string | null }): string {
  const what = TARGET_WORDS[r.target_type] ?? "Something"
  const why = REPORT_REASON_WORDS[r.reason] ?? "something else"
  const note = String(r.note ?? "").replace(/\s+/g, " ").trim()
  const line = note ? `${what}, reported as ${why}: "${note}"` : `${what}, reported as ${why}`
  return line.length <= 140 ? line : `${line.slice(0, 136).trimEnd()}..."`
}

/** The email's data: the count, the first five lines, and how many more. */
export function reportDigestData(reports: readonly { target_type: string; reason: string; note?: string | null }[]): Record<string, string | number> {
  const out: Record<string, string | number> = { reportCount: reports.length }
  reports.slice(0, 5).forEach((r, i) => {
    out[`line${i + 1}`] = reportLine(r)
  })
  if (reports.length > 5) out.moreCount = reports.length - 5
  return out
}
