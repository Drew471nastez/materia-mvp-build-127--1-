/**
 * ===========================================================================
 *  PAY AGAIN USES THE SAME PAYMENT WHILE THE LAST ONE IS NOT KNOWN
 * ===========================================================================
 * The pages' side of lib/checkout/confirm-outcome.ts. When a confirm ends
 * without a sure answer (no answer at all, a 5xx, a { status: "unknown" },
 * or Stripe.js reporting its connection or Stripe itself failing), the page
 * keeps that PaymentIntent and its client secret, and the next Pay press
 * confirms the SAME one instead of asking for a new one. Stripe never charges
 * one PaymentIntent twice: a second confirm of a paid one is refused and the
 * server reads it as paid.
 *
 * The held intent is tied to what it was made for (the amount and the
 * choices that change it). A press for a different order first asks whether
 * the held one was paid, and only a sure "not paid" lets a new one be made.
 *
 * Pure, so the checkout, the membership page and the tests agree.
 */

/** The confirm routes' answer as the pages read it (null: no answer came at all). */
export interface ConfirmAnswer {
  ok: boolean
  status: number
  data: { status?: string; error?: string } & Record<string, unknown>
}

/** True when the answer does not say whether the buyer was charged. */
export function confirmOutcomeUnknown(answer: ConfirmAnswer | null | undefined): boolean {
  if (!answer) return true
  if (answer.status === 0 || answer.status >= 500) return true
  return answer.data?.status === "unknown"
}

/**
 * A Stripe.js confirm error that does not say whether the buyer was charged:
 * the connection, Stripe itself, a rate limit, an idempotency or lock
 * conflict, or "unexpected state" (an earlier confirm already went through).
 * A card error or the buyer's typing is a sure "no" and is not one of these.
 */
export function stripeJsOutcomeUnknown(error: { type?: string; code?: string } | null | undefined): boolean {
  if (!error) return false
  if (error.type === "card_error" || error.type === "validation_error") return false
  if (error.type === "api_connection_error" || error.type === "api_error" || error.type === "rate_limit_error" || error.type === "idempotency_error") return true
  return error.code === "payment_intent_unexpected_state" || error.code === "setup_intent_unexpected_state" || error.code === "lock_timeout"
}

/** The intent a Stripe.js error carries, when it says it was paid after all (an "unexpected state" over a succeeded one). */
export function paidIntentInError(error: { payment_intent?: { id?: string; status?: string } | null; setup_intent?: { id?: string; status?: string } | null } | null | undefined): { id: string; status: string } | null {
  const intent = error?.payment_intent ?? error?.setup_intent ?? null
  if (!intent?.id || !intent.status) return null
  return intent.status === "succeeded" || intent.status === "processing" ? { id: intent.id, status: intent.status } : null
}

/** What a held intent was made for: the same key, the same order. */
export function intentKey(parts: Record<string, unknown>): string {
  return JSON.stringify(Object.keys(parts).sort().map((k) => [k, parts[k] ?? null]))
}

export interface Held<T> {
  intent: T
  key: string
}

/**
 * What the next press does with a held intent:
 *   "create"  nothing held: ask for a new one
 *   "reuse"   the same order: confirm the held one again
 *   "check"   a different order: ask whether the held one was paid first
 */
export function nextPress<T>(held: Held<T> | null | undefined, key: string): "create" | "reuse" | "check" {
  if (!held) return "create"
  return held.key === key ? "reuse" : "check"
}
