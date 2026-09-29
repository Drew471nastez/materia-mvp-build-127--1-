/**
 * ===========================================================================
 *  STORELIB PAYMENTS: WHAT A CREATOR'S PAYMENTS ARE DOING, IN STORELIB'S WORDS
 * ===========================================================================
 * The provider's own states stay the provider's (kept raw on the row, for us
 * and for support). The creator only ever sees one of the stages below, and
 * whether checkout is open is decided here from what the PROVIDER last said,
 * never from anything Storelib wrote down on its own.
 *
 * Two different things come back from Airwallex and are never mixed up:
 *
 *   the account's LIFECYCLE status, from the Accounts API and the account.*
 *   webhooks: CREATED, SUBMITTED, ACTION_REQUIRED, ACTIVE, SUSPENDED, and
 *   from API version 2026-08-21 DORMANT and CLOSED. Airwallex says more may
 *   be added, so anything else is `unknown` and is not ready.
 *
 *   the embedded onboarding component's `kycStatus`: INIT, SUBMITTED,
 *   SUCCESS, FAILURE. That is how far the person got through the FORM. A
 *   SUCCESS there does not make an account ACTIVE; it only changes what the
 *   screen says while the account is being reviewed.
 *
 * This file is pure: no database, no network, no React. The hub, checkout,
 * the reminders and the tests all read the same answer from it.
 */

export type PaymentProviderId = "stripe" | "airwallex"

/** Airwallex account lifecycle, as documented. `unknown` for a value we have not seen. */
export type AccountLifecycle =
  | "CREATED"
  | "SUBMITTED"
  | "ACTION_REQUIRED"
  | "ACTIVE"
  | "SUSPENDED"
  | "DORMANT"
  | "CLOSED"
  | "unknown"

const LIFECYCLES: readonly string[] = ["CREATED", "SUBMITTED", "ACTION_REQUIRED", "ACTIVE", "SUSPENDED", "DORMANT", "CLOSED"]

export function readLifecycle(raw: unknown): AccountLifecycle {
  const v = typeof raw === "string" ? raw.trim().toUpperCase() : ""
  return (LIFECYCLES.includes(v) ? v : "unknown") as AccountLifecycle
}

/** The embedded onboarding component's own status. Never a lifecycle. */
export type OnboardingFormStatus = "INIT" | "SUBMITTED" | "SUCCESS" | "FAILURE"

export function readFormStatus(raw: unknown): OnboardingFormStatus | null {
  const v = typeof raw === "string" ? raw.trim().toUpperCase() : ""
  return v === "INIT" || v === "SUBMITTED" || v === "SUCCESS" || v === "FAILURE" ? v : null
}

export type AccountKind = "individual" | "business"

/**
 * Where a creator is, in the words the hub uses.
 *
 *   set_up    nothing started                              Set up payments
 *   verify    account made, details not sent               Verify your details
 *   review    sent, Airwallex is checking                  Payments under review
 *   action    Airwallex needs something from them          Action required
 *   payout    verified, no bank account to be paid into    Add payout account
 *   active    verified and a bank account on file          Payments active
 *   paused    suspended by Airwallex                       Payments paused
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

export interface ProviderAccountFacts {
  /** A provider account exists for this creator. */
  hasAccount: boolean
  lifecycle: AccountLifecycle
  /** The embedded form's last status, when the form was used. */
  formStatus: OnboardingFormStatus | null
  /** A payout destination the provider holds for them (a beneficiary). */
  hasPayoutDestination: boolean
}

export function stageOf(f: ProviderAccountFacts): PaymentsStage {
  if (!f.hasAccount) return "set_up"
  switch (f.lifecycle) {
    case "CREATED":
      /* The form says they finished it, and the account has not moved yet:
         that is a review the webhook has not caught up with, not a request
         to fill it in again. */
      return f.formStatus === "SUBMITTED" || f.formStatus === "SUCCESS" ? "review" : "verify"
    case "SUBMITTED":
      return "review"
    case "ACTION_REQUIRED":
      return "action"
    case "ACTIVE":
      return f.hasPayoutDestination ? "active" : "payout"
    case "SUSPENDED":
      return "paused"
    case "DORMANT":
      return "inactive"
    case "CLOSED":
      return "closed"
    default:
      return "checking"
  }
}

/**
 * CHECKOUT IS OPEN only for an account Airwallex says is ACTIVE and that has
 * somewhere to be paid. The destination is part of it for the same reason
 * Stripe's `payouts_enabled` was: a sale that cannot reach the seller is not
 * a sale Storelib takes. Nothing else opens it.
 */
export function checkoutOpen(f: ProviderAccountFacts): boolean {
  return f.hasAccount && f.lifecycle === "ACTIVE" && f.hasPayoutDestination
}

/** The account itself can receive split funds (verified), whatever the payout destination. */
export function canReceiveFunds(f: ProviderAccountFacts): boolean {
  return f.hasAccount && f.lifecycle === "ACTIVE"
}

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
  review: { title: "Payments under review", line: "Airwallex is checking your details. We will email you when it is done.", action: null, tone: "waiting" },
  action: { title: "Action required", line: null, action: "Resolve", tone: "attention" },
  payout: { title: "Add payout account", line: "You are verified. Add the bank account your sales are paid into.", action: "Add payout account", tone: "attention" },
  active: { title: "Payments active", line: null, action: null, tone: "good" },
  paused: { title: "Payments paused", line: "Checkout is off while this is reviewed. Contact support if you did not expect it.", action: null, tone: "stopped" },
  inactive: { title: "Payments inactive", line: "This account has not been used for a long time. Contact support to use it again.", action: null, tone: "stopped" },
  closed: { title: "Payments closed", line: "This payments account is closed.", action: null, tone: "stopped" },
  checking: { title: "Checking your account", line: "We are waiting for an update. This page refreshes on its own.", action: null, tone: "waiting" },
}

/* ── What Airwallex is asking for, in plain words ─────────────────────── */

export interface RequirementNote {
  /** Stable key for the UI, never shown. */
  key: string
  /** What to do, in Storelib's words. */
  text: string
}

/** The documented `requirements` object on a retrieved account, reduced to what we read. */
export interface AirwallexRequirements {
  agreement_to_terms_and_conditions_required?: unknown
  photo_file_id_required?: { error_code?: string } | null
  photo_holding_id_required?: Array<{ error_code?: string }> | null
  primary_identification_required?: Array<{ error_code?: string }> | null
  secondary_identification_required?: Array<{ error_code?: string }> | null
  reason_for_duplicate_account_required?: unknown
  other?: unknown
}

const DOCUMENT_REASON: Record<string, string> = {
  EXPIRED_DOCUMENT: "the document has expired",
  BLURRY_IMAGE: "the photo was blurry",
  GLARE_IMAGE: "there was glare on the photo",
  DOCUMENT_TYPE_FAILED: "that type of document is not accepted",
  FACE_MATCHING_FAILED: "the face did not match the document",
  ADDRESS_NOT_FOUND: "the address could not be confirmed",
  DATA_COMPARISON_TOO_LOW: "the details did not match what you entered",
}

/**
 * The account's `requirements`, as a short list the hub shows under Action
 * required. The provider's own messages are not shown (they are written for
 * platforms), and nothing personal is carried: no names, no file ids.
 */
export function requirementNotes(req: AirwallexRequirements | null | undefined, nextActionType?: string | null): RequirementNote[] {
  const out: RequirementNote[] = []
  if (!req || typeof req !== "object") {
    if (nextActionType) out.push({ key: "next", text: "Airwallex needs more information to finish checking your account." })
    return out
  }
  if (req.agreement_to_terms_and_conditions_required) out.push({ key: "terms", text: "Accept the terms to activate your account." })
  const doc = (list: Array<{ error_code?: string }> | null | undefined, which: string, key: string) => {
    if (!Array.isArray(list) || list.length === 0) return
    const reason = DOCUMENT_REASON[list[0]?.error_code ?? ""]
    out.push({ key, text: `Upload ${which}${reason ? `: ${reason}` : ""}.` })
  }
  doc(req.primary_identification_required, "a new photo of your ID", "primary_id")
  doc(req.secondary_identification_required, "a second form of ID", "secondary_id")
  if (Array.isArray(req.photo_holding_id_required) && req.photo_holding_id_required.length) out.push({ key: "holding_id", text: "Upload a photo of yourself holding your ID." })
  if (req.photo_file_id_required) out.push({ key: "selfie", text: "Take the selfie again." })
  if (req.reason_for_duplicate_account_required) out.push({ key: "duplicate", text: "Tell us why you need a second account." })
  if (Array.isArray(req.other) && req.other.length) out.push({ key: "other", text: "Airwallex needs more information. Continue to see what." })
  if (out.length === 0 && nextActionType) out.push({ key: "next", text: "Airwallex needs more information to finish checking your account." })
  return out
}

/* ── Payouts and refunds, in numbers and words ────────────────────────── */

export type PayoutStatus = "processing" | "paid" | "failed" | "cancelled" | "waiting"

/** Airwallex's transfer statuses, in the hub's five words. Anything not yet known is "Waiting". */
export function payoutStatusOf(raw: string | undefined | null): { status: PayoutStatus; text: string } {
  const s = (raw ?? "").toUpperCase()
  if (s === "PAID" || s === "SENT") return { status: "paid", text: s === "PAID" ? "Paid" : "Sent" }
  if (s === "FAILED") return { status: "failed", text: "Failed" }
  if (s === "CANCELLED" || s === "CANCELLATION_REQUESTED") return { status: "cancelled", text: "Cancelled" }
  if (s === "PROCESSING" || s === "SCHEDULED") return { status: "processing", text: "On its way" }
  return { status: "waiting", text: "Waiting" }
}

/**
 * The creator's part of a refund, in proportion to their part of the sale
 * (lib/payments/refunds). Rounded down: never more than they received.
 */
export function creatorPartOf(refundMinor: number, grossMinor: number, creatorShareMinor: number): number {
  if (grossMinor <= 0 || refundMinor <= 0 || creatorShareMinor <= 0) return 0
  return Math.min(creatorShareMinor, Math.floor((creatorShareMinor * refundMinor) / grossMinor))
}
