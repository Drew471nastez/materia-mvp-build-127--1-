/**
 * ===========================================================================
 *  STORELIB PAYMENTS: WHAT A CREATOR'S PAYMENTS ARE DOING, IN STORELIB'S WORDS
 * ===========================================================================
 * Stripe's own states stay Stripe's (kept raw on the creators row, for us and
 * for support). The creator only ever sees one of the stages below
 * (lib/payments/stripe/facts stripeStageOf).
 *
 * Stripe is the only payments provider. Orders paid through Airwallex before
 * it was removed keep `provider = "airwallex"` on their rows; they are read
 * only (lib/payments/past-provider).
 *
 * This file is pure: no database, no network, no React.
 */

export type PaymentProviderId = "stripe"

/**
 * Where a creator is, in the words the hub uses.
 *
 *   set_up    nothing started                              Set up payments
 *   verify    account made, details not sent               Verify your details
 *   review    sent, being checked                          Payments under review
 *   action    something more is needed from them           Action required
 *   payout    verified, no bank account to be paid into    Add payout account
 *   active    verified and a bank account on file          Payments active
 *   paused    disabled by Stripe                           Payments paused
 *   inactive  dormant                                      Payments inactive
 *   closed    closed                                       Payments closed
 *   checking  a status we do not know yet                  Checking your account
 */
export type PaymentsStage =
  | "set_up"
  | "verify"
  | "review"
  | "action"
  | "payout"
  | "active"
  | "paused"
  | "inactive"
  | "closed"
  | "checking"

export interface StageCopy {
  /** The status line: a few words. */
  title: string
  /** One sentence, only where the title does not already say it. */
  line: string | null
  /** The one thing to press, if there is one. */
  action: string | null
  tone: "neutral" | "waiting" | "attention" | "good" | "stopped"
}

export const STAGE_COPY: Record<PaymentsStage, StageCopy> = {
  set_up: { title: "Set up payments", line: "Verify who you are and add a bank account to start selling.", action: "Set up payments", tone: "neutral" },
  verify: { title: "Verify your details", line: "Finish the form so buyers can pay you.", action: "Continue", tone: "attention" },
  review: { title: "Payments under review", line: "We are checking your details. We will email you when it is done.", action: null, tone: "waiting" },
  action: { title: "Action required", line: null, action: "Resolve", tone: "attention" },
  payout: { title: "Add payout account", line: "You are verified. Add the bank account your sales are paid into.", action: "Add payout account", tone: "attention" },
  active: { title: "Payments active", line: null, action: null, tone: "good" },
  paused: { title: "Payments paused", line: "Checkout is off while this is reviewed. Contact support if you did not expect it.", action: null, tone: "stopped" },
  inactive: { title: "Payments inactive", line: "This account has not been used for a long time. Contact support to use it again.", action: null, tone: "stopped" },
  closed: { title: "Payments closed", line: "This payments account is closed.", action: null, tone: "stopped" },
  checking: { title: "Checking your account", line: "We are waiting for an update. This page refreshes on its own.", action: null, tone: "waiting" },
}

export interface RequirementNote {
  /** Stable key for the UI, never shown. */
  key: string
  /** What to do, in Storelib's words. */
  text: string
}

export type PayoutStatus = "processing" | "paid" | "failed" | "cancelled" | "waiting"

/** Stripe's payout statuses (paid, pending, in_transit, canceled, failed) in the hub's five words. Anything else is "Waiting". */
export function payoutStatusOf(raw: string | undefined | null): { status: PayoutStatus; text: string } {
  const s = (raw ?? "").toUpperCase()
  if (s === "PAID") return { status: "paid", text: "Paid" }
  if (s === "FAILED") return { status: "failed", text: "Failed" }
  if (s === "CANCELED" || s === "CANCELLED") return { status: "cancelled", text: "Cancelled" }
  if (s === "IN_TRANSIT") return { status: "processing", text: "On its way" }
  return { status: "waiting", text: "Waiting" }
}
