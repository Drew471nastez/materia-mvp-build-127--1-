/**
 * Stripe connected-account state → Storelib payments stages (pure).
 */

import { STAGE_COPY, type PaymentsStage, type RequirementNote, type StageCopy } from "../model"

export type PaymentUxState =
  | "PAYMENTS_NOT_CONFIGURED"
  | "VERIFICATION_IN_PROGRESS"
  | "ACTION_REQUIRED"
  | "PAYMENTS_ACTIVE"
  | "PAYMENTS_RESTRICTED"
  | "PAYOUTS_RESTRICTED"

export interface StripeCreatorSnapshot {
  accountId: string | null
  chargesEnabled: boolean
  payoutsEnabled: boolean
  detailsSubmitted: boolean
  disabledReason: string | null
  currentlyDue: string[]
  pastDue: string[]
  pendingVerification: string[]
  hasExternalAccount: boolean
  accountKind: "individual" | "business" | null
}

export function snapshotFromCreatorRow(row: {
  stripe_account_id?: string | null
  charges_enabled?: boolean | null
  payouts_enabled?: boolean | null
  details_submitted?: boolean | null
  stripe_requirements?: string[] | null
}): StripeCreatorSnapshot {
  const req = Array.isArray(row.stripe_requirements) ? row.stripe_requirements : []
  return {
    accountId: row.stripe_account_id ?? null,
    chargesEnabled: row.charges_enabled === true,
    payoutsEnabled: row.payouts_enabled === true,
    detailsSubmitted: row.details_submitted === true,
    disabledReason: null,
    currentlyDue: req,
    pastDue: [],
    pendingVerification: [],
    hasExternalAccount: false,
    accountKind: null,
  }
}

export function mergeStripeAccount(
  base: StripeCreatorSnapshot,
  account: {
    charges_enabled?: boolean
    payouts_enabled?: boolean
    details_submitted?: boolean
    disabled_reason?: string | null
    business_type?: string | null
    requirements?: {
      currently_due?: string[]
      past_due?: string[]
      pending_verification?: string[]
    } | null
  },
  hasExternalAccount: boolean,
): StripeCreatorSnapshot {
  const req = account.requirements ?? {}
  return {
    ...base,
    accountId: base.accountId,
    chargesEnabled: !!account.charges_enabled,
    payoutsEnabled: !!account.payouts_enabled,
    detailsSubmitted: !!account.details_submitted,
    disabledReason: account.disabled_reason ?? null,
    currentlyDue: req.currently_due ?? [],
    pastDue: req.past_due ?? [],
    pendingVerification: req.pending_verification ?? [],
    hasExternalAccount,
    accountKind: account.business_type === "company" ? "business" : account.business_type === "individual" ? "individual" : base.accountKind,
  }
}

export function stripeCheckoutReady(s: StripeCreatorSnapshot): boolean {
  if (!s.accountId?.startsWith("acct_")) return false
  if (!s.chargesEnabled || !s.payoutsEnabled || !s.detailsSubmitted) return false
  if (s.pastDue.length > 0) return false
  if (s.disabledReason) return false
  return true
}

/**
 * CHECKOUT'S GATE, FROM THE CREATORS ROW ALONE (no Stripe call on a buyer's
 * Pay). Never stricter than the gate every live seller passed before
 * Storelib Payments: an `acct_` account, charges and payouts not switched
 * off, and marked connected. A row the sync has since filled in (all three
 * flags true) passes too, whatever its old status word says.
 */
export function stripeRowReady(row: {
  stripe_account_id?: string | null
  stripe_onboarding_status?: string | null
  charges_enabled?: boolean | null
  payouts_enabled?: boolean | null
  details_submitted?: boolean | null
} | null | undefined): boolean {
  if (!row?.stripe_account_id?.startsWith("acct_")) return false
  if (row.charges_enabled === false || row.payouts_enabled === false) return false
  if (row.stripe_onboarding_status === "connected") return true
  return row.charges_enabled === true && row.payouts_enabled === true && row.details_submitted === true
}

export function paymentUxStateOf(s: StripeCreatorSnapshot): PaymentUxState {
  if (!s.accountId) return "PAYMENTS_NOT_CONFIGURED"
  if (s.pastDue.length > 0 || (s.currentlyDue.length > 0 && s.detailsSubmitted)) return "ACTION_REQUIRED"
  if (s.disabledReason || (!s.chargesEnabled && s.detailsSubmitted)) return "PAYMENTS_RESTRICTED"
  if (s.chargesEnabled && !s.payoutsEnabled) return "PAYOUTS_RESTRICTED"
  if (stripeCheckoutReady(s)) return "PAYMENTS_ACTIVE"
  if (!s.detailsSubmitted) return "VERIFICATION_IN_PROGRESS"
  return "VERIFICATION_IN_PROGRESS"
}

export function stripeStageOf(s: StripeCreatorSnapshot): PaymentsStage {
  if (!s.accountId) return "set_up"
  if (s.disabledReason) return "paused"
  if (s.pastDue.length > 0 || (s.currentlyDue.length > 0 && s.detailsSubmitted)) return "action"
  if (stripeCheckoutReady(s)) return "active"
  if (s.chargesEnabled && s.payoutsEnabled && s.detailsSubmitted && !s.hasExternalAccount) return "payout"
  if (s.detailsSubmitted && (s.pendingVerification.length > 0 || (!s.chargesEnabled && !s.payoutsEnabled))) return "review"
  if (!s.detailsSubmitted) return "verify"
  if (!s.hasExternalAccount) return "payout"
  return "checking"
}

const STRIPE_REVIEW_LINE = "We are checking your details. We will email you when payments are ready."

export function stripeStageCopy(stage: PaymentsStage): StageCopy {
  const base = STAGE_COPY[stage]
  if (stage === "review") return { ...base, line: STRIPE_REVIEW_LINE }
  if (stage === "action") return { ...base, line: "We need a little more information before we can continue processing your payments.", action: "Complete verification" }
  return base
}

export function stripeRequirementNotes(s: StripeCreatorSnapshot): RequirementNote[] {
  if (s.pastDue.length > 0) {
    return [{ key: "past_due", text: "Some verification steps are overdue. Continue to finish them." }]
  }
  if (s.currentlyDue.length > 0) {
    return [{ key: "due", text: "Additional verification is required. Continue and we will show you what is needed." }]
  }
  if (s.pendingVerification.length > 0) {
    return [{ key: "pending", text: "Documents are being reviewed. This usually takes a short time." }]
  }
  return []
}
