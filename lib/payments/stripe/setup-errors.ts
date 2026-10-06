/**
 * Creator-facing copy for a failed Storelib Payments start.
 * Raw Stripe text is logged on the server, not shown, except where we
 * already know the sentence is about the creator's own country or email.
 */

/** Stripe will not open an account in this country at all. A refused card_payments or recipient agreement is a different account shape, not this. */
export function countryIsUnsupported(message: string): boolean {
  if (/recipient|card_payments|capability/i.test(message)) return false
  return /\bcountry\b.*\b(not supported|is invalid|unknown)\b|\b(not|isn't|is not) supported\b.*\bcountry\b/i.test(message)
}

export function paymentsSetupErrorMessage(error: unknown): string {
  const message = stripeErrorMessage(error)
  if (/cannot create new accounts because your account has been rejected/i.test(message)) {
    return "Payouts cannot be set up on Storelib right now. This is on our side, not yours, and nothing you entered caused it."
  }
  if (/account has been rejected/i.test(message)) {
    return "This payments account cannot be opened from here. Write to support@storelib.com and we will sort out your payouts."
  }
  if (countryIsUnsupported(message)) {
    return "Payments are not available for that country yet. Choose another country, or write to support@storelib.com."
  }
  if (/email/i.test(message) && /invalid|required/i.test(message)) {
    return "Add a valid email address on your account, then try again."
  }
  if (/platform profile|activate your account|managing losses|cannot currently make live charges|connect is not enabled|signed up for connect/i.test(message)) {
    return "Stripe is still blocking new accounts until the platform profile is saved. In Stripe, open Settings, then Connect, then Platform profile, save it, and try again. Nothing was saved on your account."
  }
  return "We could not start setup just now. Nothing was saved. Try again in a moment."
}

export function stripeErrorMessage(error: unknown): string {
  if (!error || typeof error !== "object") return error instanceof Error ? error.message : ""
  const e = error as { message?: unknown; raw?: { message?: unknown } }
  const raw = typeof e.raw?.message === "string" ? e.raw.message : ""
  const msg = typeof e.message === "string" ? e.message : ""
  return raw || msg
}

/** True when a second create, with Connect controller fields, can succeed. */
export function shouldRetryExpressAsController(error: unknown): boolean {
  const message = stripeErrorMessage(error)
  if (/country|email|postal/i.test(message) && !/controller|losses|fees/i.test(message)) return false
  return /controller|cannot use [`']?type[`']?|type parameter|dashboard|losses|fee payer|requirement_collection/i.test(message)
}
