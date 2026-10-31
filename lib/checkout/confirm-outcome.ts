/**
 * ===========================================================================
 *  A CONFIRM THAT FAILED IS NOT ALWAYS A "NO"
 * ===========================================================================
 * The routes that confirm a payment on the server (/api/checkout/confirm-with-pm
 * for the app's card fields, /api/memberships/confirm for a membership paid
 * in the app) used to answer every Stripe error with "Nothing was charged".
 * Only a card error means that. A timeout after the SDK's own retries, a
 * dropped connection, a 5xx, a lock_timeout, an idempotency conflict or
 * "payment_intent_unexpected_state" (the first confirm already went through)
 * can each sit over a payment that DID go through. Told "nothing was
 * charged", the buyer pressed Pay again on a new PaymentIntent and paid twice.
 *
 * So on any error that is not a declined card, the intent is read again
 * (bounded) and the answer is what Stripe says it is now:
 *
 *   succeeded, processing, requires_capture   paid: answered as paid
 *   requires_action                           the bank's page
 *   canceled                                  not charged, can say so
 *   anything else, or no answer               "unknown": we are checking
 *
 * "requires_payment_method" after an ambiguous error is NOT read as unpaid:
 * a confirm still running at Stripe leaves the intent in exactly that state
 * until it finishes, so it is answered "unknown" too. That is safe because
 * the page keeps the same intent for its next press (app/checkout), and a
 * confirm of an intent that already succeeded charges nothing.
 *
 * Pure apart from the read it is handed, so the tests drive it directly.
 */

/** How long the second look at the intent may take, at most. */
export const REREAD_TIMEOUT_MS = 5_000

/** Said while the payment's outcome is not known. Never "nothing was charged". */
export const CHECKING_MESSAGE =
  "We are still checking your payment with the bank. Do not use another card yet. Press Pay again to check: it uses the same payment, so you are not charged twice."

export const PAID_STATES = new Set(["succeeded", "processing", "requires_capture"])

export interface IntentLike {
  status: string
  next_action?: { redirect_to_url?: { url?: string | null } | null } | null
}

export type ConfirmSettled =
  | { kind: "paid"; status: string }
  | { kind: "action"; actionUrl: string | null }
  | { kind: "canceled" }
  | { kind: "unknown" }

/** The bank's own "no": a declined card, an expired one, a wrong code. Its words are the useful ones. */
export function isCardDecline(err: unknown): boolean {
  const e = err as { type?: string; rawType?: string } | null
  return e?.type === "StripeCardError" || e?.rawType === "card_error"
}

export function declineMessage(err: unknown): string {
  const e = err as { raw?: { message?: string }; message?: string } | null
  return e?.raw?.message || e?.message || "The card was declined. Nothing was charged. Try another card."
}

/** The intent read again, or null when that too failed or took longer than `ms`. Never throws. */
export async function rereadIntent<T>(read: () => Promise<T>, ms = REREAD_TIMEOUT_MS): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      read(),
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), ms)
      }),
    ])
  } catch {
    return null
  } finally {
    if (timer) clearTimeout(timer)
  }
}

/** What an intent read again after an ambiguous confirm error tells us. */
export function settledFrom(intent: IntentLike | null): ConfirmSettled {
  if (!intent || typeof intent.status !== "string") return { kind: "unknown" }
  if (PAID_STATES.has(intent.status)) return { kind: "paid", status: intent.status }
  if (intent.status === "requires_action") return { kind: "action", actionUrl: intent.next_action?.redirect_to_url?.url ?? null }
  if (intent.status === "canceled") return { kind: "canceled" }
  return { kind: "unknown" }
}

/** The answer for an unknown outcome: a 503 the page reads as "keep this intent", with the status the page checks. */
export const UNKNOWN_BODY = { status: "unknown", checking: true, error: CHECKING_MESSAGE } as const
