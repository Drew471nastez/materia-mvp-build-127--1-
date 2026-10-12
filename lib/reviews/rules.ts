import { tt } from "@/lib/i18n/text"
/**
 * ===========================================================================
 *  REVIEWS, THE RULES WITH NO DATABASE
 * ===========================================================================
 * What a review is allowed to be, how its author is named, and what a
 * seller can say about one, as plain functions the routes, the pages and the
 * tests share. Nothing here reads a row or imports a server module, so a
 * client component may use it too.
 *
 *   A REVIEW        one to five whole stars and 10 to 1000 characters,
 *                   one per order and one per buyer and product. Its author
 *                   can change it or delete it at any time.
 *   WHO WROTE IT    the buyer's profile name and photo when the order is on
 *                   an account; otherwise the first name they bought with
 *                   (a guest who reviewed from their receipt link). Always a
 *                   verified purchase: nobody without an order can write one.
 *   THE SELLER      answers once, in public, and can change or remove that
 *                   answer. They cannot delete a review; they can report it,
 *                   which hides it until Storelib looks (review_reports).
 *   PUBLISHED       only published reviews are shown and counted. A hidden
 *                   one stays in the table, with its report beside it.
 */

export const MIN_REVIEW_CHARS = 10
export const MAX_REVIEW_CHARS = 1000
export const MAX_REPLY_CHARS = 1000
export const MAX_NAME_CHARS = 40

/** What each number of stars means, as the form and the seller's list say it. */
export const RATING_WORDS = ["", "Poor", "Fair", "Good", "Very good", "Excellent"] as const

export type ReviewStatus = "published" | "hidden"

export const REPORT_REASONS = [
  { id: "abusive", get label() { return tt("Abusive, hateful or threatening") } },
  { id: "spam", get label() { return tt("Spam or advertising") } },
  { id: "off_topic", get label() { return tt("Not about this product") } },
  { id: "not_a_buyer", get label() { return tt("Not written by a real buyer") } },
  { id: "personal_info", get label() { return tt("Shares private information") } },
  { id: "other", get label() { return tt("Something else") } },
] as const

export type ReportReason = (typeof REPORT_REASONS)[number]["id"]

export function isReportReason(value: unknown): value is ReportReason {
  return typeof value === "string" && REPORT_REASONS.some((r) => r.id === value)
}

export type ReviewInput = { ok: true; rating: number; content: string } | { ok: false; error: string }

/**
 * What a browser sent, checked for shape and never trusted: a whole number
 * of stars from one to five, and text of the right length once trimmed.
 */
export function checkReviewInput(body: { rating?: unknown; content?: unknown } | null | undefined): ReviewInput {
  const rating = Number(body?.rating)
  const content = typeof body?.content === "string" ? body.content.trim() : ""
  if (!body?.rating || !content) return { ok: false, error: tt("productId, rating, and content are required") }
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return { ok: false, error: tt("Rating must be between 1 and 5") }
  if (content.length < MIN_REVIEW_CHARS) return { ok: false, error: tt("Review must be at least {minReviewChars} characters", { minReviewChars: MIN_REVIEW_CHARS }) }
  if (content.length > MAX_REVIEW_CHARS) return { ok: false, error: tt("Keep the review under {maxReviewChars} characters", { maxReviewChars: MAX_REVIEW_CHARS }) }
  return { ok: true, rating, content }
}

export type ReplyInput = { ok: true; text: string } | { ok: false; error: string }

export function checkReplyInput(value: unknown): ReplyInput {
  const text = typeof value === "string" ? value.trim().replace(/\r\n/g, "\n") : ""
  if (text.length < 2) return { ok: false, error: tt("Write a reply first.") }
  if (text.length > MAX_REPLY_CHARS) return { ok: false, error: tt("Keep the reply under {maxReplyChars} characters", { maxReplyChars: MAX_REPLY_CHARS }) }
  return { ok: true, text }
}

/**
 * The name a guest's review carries: the first name they bought with, as
 * typed, cut to one short word or two. Never the address. Null when there
 * is nothing to use, and the review then reads "Verified buyer".
 */
export function guestReviewerName(firstName: unknown): string | null {
  if (typeof firstName !== "string") return null
  const clean = firstName.replace(/[\u0000-\u001f<>@]/g, " ").replace(/\s+/g, " ").trim()
  if (!clean || /\w\.\w/.test(clean)) return null
  return clean.slice(0, MAX_NAME_CHARS)
}

export interface ReviewAuthorFields {
  reviewer_name?: string | null
  /** False for a website visitor's or an imported review (run-now part 134): never called a verified buyer. */
  verified?: boolean | null
  buyer?: { display_name?: string | null; username?: string | null; avatar_url?: string | null } | null
}

/** What a review reads as when nobody ever gave a name. */
export const UNNAMED_REVIEWER = "Verified buyer"
/** The same for a review not tied to a purchase. */
export const UNNAMED_CUSTOMER = "Customer"

/**
 * Who wrote it, as a review card shows it.
 *
 * `avatarName` is what the circle beside the name is drawn from, and it is
 * empty rather than "Verified buyer" when the name is that stand in: "VB" in
 * a circle reads as somebody's initials, and this person has no initials. The
 * avatar draws its person glyph on an empty name.
 */
export function reviewerOf(review: ReviewAuthorFields): { name: string; avatarUrl: string | null; avatarName: string; named: boolean } {
  const buyer = Array.isArray(review.buyer) ? review.buyer[0] : review.buyer
  const given = (buyer?.display_name || "").trim() || (review.reviewer_name || "").trim() || (buyer?.username || "").trim()
  const name = (given || (review.verified === false ? UNNAMED_CUSTOMER : UNNAMED_REVIEWER)).slice(0, 60)
  return { name, avatarUrl: buyer?.avatar_url || null, avatarName: given ? name : "", named: !!given }
}

/** A review's own status, reading an older row with no status column as published. */
export function statusOf(review: { status?: string | null }): ReviewStatus {
  return review.status === "hidden" ? "hidden" : "published"
}

export type StarCounts = Record<1 | 2 | 3 | 4 | 5, number>

/** How many reviews gave each number of stars, the count and the average to one decimal. */
export function summarize(ratings: readonly number[]): { count: number; average: number; stars: StarCounts } {
  const stars: StarCounts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
  let sum = 0
  let count = 0
  for (const r of ratings) {
    const n = Math.round(Number(r))
    if (n < 1 || n > 5) continue
    stars[n as 1 | 2 | 3 | 4 | 5]++
    sum += n
    count++
  }
  return { count, average: count ? Math.round((sum / count) * 10) / 10 : 0, stars }
}

/** Whole percentages for the bars, from counts. */
export function percentOf(count: number, total: number): number {
  return total > 0 ? Math.round((count / total) * 100) : 0
}
