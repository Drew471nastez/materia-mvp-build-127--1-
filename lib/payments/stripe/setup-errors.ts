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

/*
  STRIPE HAS NOT APPROVED STORELIB FOR TRANSFERS-ONLY ACCOUNTS (round AV).
  A seller in another country than the platform can only be paid out through
  an account with transfers and no card_payments (./payout-regions), and Stripe
  opens that shape only after it approves the platform for it. Until then every
  attempt answers this same sentence. Production, Nov 6 to 10: the same seller
  pressed Start again and again and was told "Try again in a moment", which
  could never work. It is the platform's approval, not the seller's input.
*/
export function needsPlatformApproval(message: string): boolean {
  return /needs approval for accounts to have requested the .?transfers.? capability without/i.test(message)
}

/**
 * What a failed start tells the seller, and what kind of failure it is, so
 * the page offers the one next step that can work: pick another country,
 * try again, or write to support. "Try again" is only offered when trying
 * again can change the answer (Stripe did not answer, a rate limit). Every
 * other answer says what to do instead (Nov 23 2026: a seller was told to
 * try again over and over for a refusal that no retry could change).
 */
export type SetupProblemCode = "country_unsupported" | "platform_setup" | "account_closed" | "email" | "retry" | "unknown"

export interface SetupProblem {
  message: string
  code: SetupProblemCode
}

const SUPPORT = "support@storelib.com"
/* Seller-facing: a setting on Storelib's side. The owner is told the exact place in the server log (connect.ts). */
const OUR_SIDE = `Payouts can't be set up on Storelib right now because of a setting on our side. Nothing was saved, and there is nothing for you to change. Write to ${SUPPORT} and we will tell you as soon as it works.`

/** Stripe's own facts about a failed call, for the log line. Never shown to a seller. */
export interface StripeErrorFacts {
  type: string | null
  code: string | null
  param: string | null
  statusCode: number | null
  requestId: string | null
  message: string
}

export function stripeErrorFacts(error: unknown): StripeErrorFacts {
  const e = (error && typeof error === "object" ? error : {}) as {
    type?: unknown
    code?: unknown
    param?: unknown
    statusCode?: unknown
    requestId?: unknown
    raw?: { type?: unknown; code?: unknown; param?: unknown; requestId?: unknown }
  }
  const str = (...xs: unknown[]) => {
    for (const x of xs) if (typeof x === "string" && x) return x
    return null
  }
  return {
    type: str(e.type, e.raw?.type),
    code: str(e.code, e.raw?.code),
    param: str(e.param, e.raw?.param),
    statusCode: typeof e.statusCode === "number" ? e.statusCode : null,
    requestId: str(e.requestId, e.raw?.requestId),
    message: stripeErrorMessage(error).replace(/\s+/g, " ").slice(0, 300),
  }
}

export function paymentsSetupError(error: unknown): SetupProblem {
  const message = stripeErrorMessage(error)
  const facts = stripeErrorFacts(error)
  if (needsPlatformApproval(message)) {
    return {
      code: "platform_setup",
      message: `Payouts to your country are not open on Storelib yet. Stripe has to approve this on our side, so there is nothing you need to change, and nothing was saved. Write to ${SUPPORT} and we will tell you when it opens.`,
    }
  }
  if (/cannot create new accounts because your account has been rejected/i.test(message)) {
    return { code: "platform_setup", message: "Payouts cannot be set up on Storelib right now. This is on our side, not yours, and nothing you entered caused it." }
  }
  if (/account has been rejected/i.test(message)) {
    return { code: "account_closed", message: `This payments account cannot be opened from here. Write to ${SUPPORT} and we will sort out your payouts.` }
  }
  if (countryIsUnsupported(message)) {
    return { code: "country_unsupported", message: `Payments are not available for that country yet. Choose another country, or write to ${SUPPORT}.` }
  }
  if (/email/i.test(message) && /invalid|required|not a valid/i.test(message)) {
    return { code: "email", message: "Stripe did not accept the email address on your Storelib account. Change it in Settings, then set up payouts again." }
  }
  if (
    facts.type === "StripeAuthenticationError" ||
    /invalid api key|expired api key|platform profile|activate your account|managing losses|cannot currently make live charges|connect is not enabled|signed up for connect|review the responsibilities|platform-profile/i.test(message)
  ) {
    return { code: "platform_setup", message: OUR_SIDE }
  }
  if (/keys for idempotent requests|idempotency/i.test(message)) {
    return { code: "retry", message: "Your last try is still going through. Wait a minute, then try again." }
  }
  if (
    facts.type === "StripeConnectionError" ||
    facts.type === "StripeAPIError" ||
    facts.type === "StripeRateLimitError" ||
    facts.code === "rate_limit" ||
    (facts.statusCode !== null && facts.statusCode >= 500) ||
    /timed? ?out|ECONNRESET|socket hang up|network/i.test(message)
  ) {
    return { code: "retry", message: "Stripe did not answer just now. Nothing was saved. Try again in a minute." }
  }
  const ref = facts.requestId ? ` and mention reference ${facts.requestId}` : ""
  return { code: "unknown", message: `Stripe did not accept the setup. Nothing was saved. Write to ${SUPPORT}${ref}, and we will fix it with you.` }
}

export function paymentsSetupErrorMessage(error: unknown): string {
  return paymentsSetupError(error).message
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
