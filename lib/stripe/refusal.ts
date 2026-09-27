/**
 * ===========================================================================
 *  WHEN STRIPE SAYS NO FOR A REASON NOBODY ON THE PAGE CAN FIX
 * ===========================================================================
 * Three refusals from the production log, each an account problem rather
 * than a fault in the request:
 *
 *   "You cannot create new accounts because your account has been rejected"
 *       Storelib's own Stripe account (the platform) was rejected, so no
 *       creator can open a payout account (/api/stripe/connect/start).
 *   "An account link cannot be created for this account because the account
 *    has been rejected"
 *       This creator's payout account was rejected by Stripe
 *       (/api/stripe/account-link, and connect/start for a returning one).
 *   "Your account cannot currently make live charges"
 *       The platform cannot take payments, so a plan cannot be bought
 *       (/api/billing/subscription/create).
 *
 * Each used to reach the creator as Stripe's own sentence, about "your
 * account", which reads as theirs, with a 500. Now each is a calm sentence
 * that says whose problem it is, a status that is not a server fault, a
 * `code` the screen can use, and one log line naming the refusal for the
 * owner. Nothing retries: every caller runs on a press.
 */
export interface StripeRefusal {
  status: number
  code: "platform_rejected" | "account_rejected" | "platform_cannot_charge"
  error: string
}

const SUPPORT = "support@storelib.com"

export function stripeRefusal(error: unknown): StripeRefusal | null {
  const message = String((error as { message?: unknown } | null)?.message ?? "")
  if (/cannot create new accounts because your account has been rejected/i.test(message))
    return { status: 503, code: "platform_rejected", error: "Payouts cannot be set up on Storelib right now. This is on our side, not yours, and nothing you entered caused it." }
  if (/account link cannot be created for this account because the account has been rejected/i.test(message) || /this account has been rejected/i.test(message))
    return { status: 409, code: "account_rejected", error: `Stripe has closed this payout account, so it cannot be opened from here. Write to ${SUPPORT} and we will sort out your payouts.` }
  if (/cannot currently make live charges/i.test(message))
    return { status: 503, code: "platform_cannot_charge", error: "Plans cannot be bought right now. This is on our side, and nothing was charged." }
  return null
}

/** The one log line for the owner, and the answer for the page. */
export function logStripeRefusal(where: string, refusal: StripeRefusal): void {
  console.warn(`[stripe] ${where}: ${refusal.code} (Stripe refused for an account reason; see the Stripe dashboard)`)
}
