/**
 * ===========================================================================
 *  WHY SOMEBODY LEFT: THE SIX ANSWERS
 * ===========================================================================
 * Round 12, ask 12: leaving asks why (six calm choices, an optional note,
 * and skipping is fine), the answer is kept in community_leave_reasons
 * (part 98, service role only), and the community's owner and admins read
 * the counts and the latest notes in their dashboard. The six keys are the
 * table's own CHECK constraint, in the order they are offered. Pure and
 * browser safe: the dialog, the route and the dashboard card read the same
 * list.
 */

export const LEAVE_REASONS = [
  { key: "not_for_me", label: "It wasn't what I was looking for" },
  { key: "too_busy", label: "I don't have time for it right now" },
  { key: "too_expensive", label: "It costs more than it's worth to me" },
  { key: "content", label: "Not enough useful posts or courses" },
  { key: "people", label: "I didn't connect with the people here" },
  { key: "other", label: "Something else" },
] as const

export type LeaveReason = (typeof LEAVE_REASONS)[number]["key"]

/** The longest note kept (the table's CHECK). */
export const LEAVE_NOTE_MAX = 500

/** The short name the dashboard's card uses for each. */
export const LEAVE_REASON_SHORT: Record<LeaveReason, string> = {
  not_for_me: "Not for me",
  too_busy: "No time",
  too_expensive: "Too expensive",
  content: "Content",
  people: "The people",
  other: "Something else",
}

const KEYS = new Set<string>(LEAVE_REASONS.map((r) => r.key))

export function isLeaveReason(v: unknown): v is LeaveReason {
  return typeof v === "string" && KEYS.has(v)
}

/**
 * What a leave request said about why, from its body: a known reason and a
 * cleaned note (control characters out, spaces folded, cut at the limit),
 * or null when it said nothing usable. A note alone is kept as "other".
 */
export function parseLeaveReason(body: unknown): { reason: LeaveReason; note: string | null } | null {
  if (!body || typeof body !== "object") return null
  const b = body as { reason?: unknown; note?: unknown }
  const raw = typeof b.note === "string" ? b.note : ""
  // eslint-disable-next-line no-control-regex
  const note = raw.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").replace(/[ \t]+/g, " ").trim().slice(0, LEAVE_NOTE_MAX) || null
  if (isLeaveReason(b.reason)) return { reason: b.reason, note }
  return note ? { reason: "other", note } : null
}

/** The dashboard card's figures (lib/communities/server/leave-reasons.ts leaveReasonsSummary). */
export interface LeaveReasonsSummary {
  total: number
  counts: { reason: LeaveReason; count: number }[]
  notes: { reason: LeaveReason; note: string; createdAt: string }[]
}
