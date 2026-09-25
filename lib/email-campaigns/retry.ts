/**
 * ===========================================================================
 *  WHAT A PROVIDER ANSWER MEANS FOR THE ADDRESS IT WAS ABOUT
 * ===========================================================================
 * Three outcomes, and mixing them up is how a campaign either goes out twice
 * or quietly never goes out:
 *
 *   sent      the provider took it. Recorded with its message id, never sent
 *             again.
 *   retry     the provider or the network had a bad moment: 429, 5xx, a
 *             timeout. Nothing about the address is wrong, so it waits and
 *             is tried again, a little later each time, up to MAX_ATTEMPTS.
 *   failed    the provider refused this message for good (a 4xx about the
 *             message or the address). Recorded with the reason, not retried.
 *   halt      the provider refused US: bad credentials, domain not allowed,
 *             service not configured. Every address would fail the same way,
 *             so none of them is marked failed; the campaign pauses with the
 *             reason and picks up when it is fixed.
 */

export type ProviderOutcome = "sent" | "retry" | "failed" | "halt"

export interface ProviderAnswer {
  success: boolean
  /** HTTP status when there was a response. Absent for a network error or timeout. */
  status?: number
  error?: string
  messageId?: string
  /** The request never got an answer in time. */
  timedOut?: boolean
  /** Our side could not send at all (no API key). */
  notConfigured?: boolean
}

export const MAX_ATTEMPTS = 5

/** Seconds to wait before attempt n+1, n counted from 1. */
const BACKOFF_SECONDS = [30, 120, 600, 1800, 3600]

export function classify(answer: ProviderAnswer): ProviderOutcome {
  if (answer.success) return "sent"
  if (answer.notConfigured) return "halt"
  const s = answer.status
  if (s === undefined || answer.timedOut) return "retry"
  if (s === 401 || s === 403) return "halt"
  if (s === 408 || s === 425 || s === 429) return "retry"
  if (s >= 500) return "retry"
  if (s >= 400) return "failed"
  return "retry"
}

/** Retry or give up, given how many attempts this address has had. */
export function afterAttempt(answer: ProviderAnswer, attempts: number): ProviderOutcome {
  const outcome = classify(answer)
  if (outcome === "retry" && attempts >= MAX_ATTEMPTS) return "failed"
  return outcome
}

export function backoffSeconds(attempts: number): number {
  const i = Math.max(0, Math.min(BACKOFF_SECONDS.length - 1, attempts - 1))
  return BACKOFF_SECONDS[i]
}

export function nextAttemptAt(attempts: number, now = Date.now()): string {
  return new Date(now + backoffSeconds(attempts) * 1000).toISOString()
}

/**
 * The reason, in words a creator can act on, and short enough for a table
 * cell. Never the provider's raw body: that can carry the address back out.
 */
export function plainReason(answer: ProviderAnswer): string {
  if (answer.notConfigured) return "Email sending is not set up on the server."
  if (answer.timedOut) return "The email service did not answer in time."
  const s = answer.status
  if (s === undefined) return "Could not reach the email service."
  if (s === 401 || s === 403) return "The email service refused the sending account."
  if (s === 429) return "The email service asked us to slow down."
  if (s >= 500) return "The email service had a temporary problem."
  const msg = (answer.error || "").toLowerCase()
  if (/address|recipient|to parameter|mailbox/.test(msg)) return "The address was refused as invalid."
  if (/size|too large|413/.test(msg) || s === 413) return "The email is too large to send."
  return "The email service refused this message."
}
