/**
 * A COMMUNITY'S REFUND POLICY AND CONTACT EMAIL, AS THEY ARE KEPT.
 *
 * CONTRACT STAND-IN (round 13). Worker M owns this file and its columns
 * (run-now part 101: communities.refund_policy, contact_email,
 * contact_email_public). This copy holds only the names the round's
 * contract fixes, so the community Settings (worker A) can be written
 * against them; on merge, M's file is the one to keep.
 *
 * Pure, browser safe.
 */

/** The longest refund policy a community keeps, in characters. */
export const REFUND_POLICY_MAX = 2000

/** Plain text, line breaks kept, no control characters, trimmed, at most REFUND_POLICY_MAX; empty is null. */
export function cleanRefundPolicy(v: unknown): string | null {
  if (typeof v !== "string") return null
  const text = v
    .replace(/\r\n?/g, "\n")
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, REFUND_POLICY_MAX)
  return text || null
}

/** A plausible email address, lowercased, or null when empty or not one. */
export function cleanContactEmail(v: unknown): string | null {
  if (typeof v !== "string") return null
  const email = v.trim().toLowerCase()
  if (!email || email.length > 254) return null
  return /^[^\s@<>()",;]+@[^\s@<>()",;]+\.[a-z]{2,}$/i.test(email) ? email : null
}
