/**
 * WHY A CREATOR CANCELS PRO.
 *
 * The Cancel plan dialog in Settings > Plan asks once, as a short list and
 * an optional note (components/app/billing/cancel-plan-dialog.tsx). The
 * answer goes two places from app/api/billing/subscription/cancel:
 *
 *   - Stripe's own `cancellation_details` on the subscription (feedback is
 *     one of Stripe's fixed values, the note is its comment), so it is there
 *     in the Stripe dashboard whatever else happens;
 *   - the server only table `plan_cancellations` (SQL part 128), one row per
 *     cancellation, with the reason as written here and when it was undone.
 *
 * Neither is needed to cancel: a cancel with no reason (the upgrade page's
 * Downgrade to Free) still cancels.
 */

export const CANCEL_REASONS = [
  { key: "too_expensive", label: "It costs too much", stripe: "too_expensive" },
  { key: "not_selling", label: "I'm not selling enough yet", stripe: "unused" },
  { key: "missing_features", label: "Something I need is missing", stripe: "missing_features" },
  { key: "switching", label: "I'm moving to another platform", stripe: "switched_service" },
  { key: "taking_break", label: "I'm taking a break", stripe: "unused" },
  { key: "other", label: "Something else", stripe: "other" },
] as const

export type CancelReason = (typeof CANCEL_REASONS)[number]["key"]
export type StripeCancelFeedback = (typeof CANCEL_REASONS)[number]["stripe"]

/** The longest note kept. The table holds the same limit. */
export const CANCEL_NOTE_MAX = 500

export function isCancelReason(value: unknown): value is CancelReason {
  return typeof value === "string" && CANCEL_REASONS.some((r) => r.key === value)
}

/**
 * What a cancel request said, cleaned: a reason from the list or none, and a
 * note trimmed to CANCEL_NOTE_MAX or none. Anything else in the body is
 * ignored, and a body that is not an object reads as nothing said.
 */
export function readCancelFeedback(body: unknown): { reason: CancelReason | null; note: string | null } {
  if (!body || typeof body !== "object") return { reason: null, note: null }
  const b = body as Record<string, unknown>
  const reason = isCancelReason(b.reason) ? b.reason : null
  const raw = typeof b.note === "string" ? b.note.replace(/\s+/g, " ").trim() : ""
  const note = raw ? raw.slice(0, CANCEL_NOTE_MAX) : null
  return { reason, note }
}

/** Stripe's `cancellation_details` for what was said, or nothing when nothing was. */
export function stripeCancellationDetails(feedback: { reason: CancelReason | null; note: string | null }):
  | { feedback?: StripeCancelFeedback; comment?: string }
  | undefined {
  const match = feedback.reason ? CANCEL_REASONS.find((r) => r.key === feedback.reason) : undefined
  if (!match && !feedback.note) return undefined
  return {
    ...(match ? { feedback: match.stripe } : {}),
    ...(feedback.note ? { comment: feedback.note } : {}),
  }
}
