/**
 * ===========================================================================
 *  MAY CHECKOUT TAKE MONEY FOR THIS SELLER? ONE ANSWER.
 * ===========================================================================
 * Checkout, Home, the product editor, Payouts, the reminders and the admin
 * screens all asked this, and each asked it its own way: one wanted
 * charges_enabled true, one only "not false" (so an account Stripe had not
 * answered for yet slipped through), one trusted a status word. This is the
 * rule they all use now. Pure: the server reads the account and passes the
 * facts in.
 *
 * STORELIB'S CHARGE MODEL. A sale is a destination charge: Storelib's own
 * Stripe account takes the card (no on_behalf_of), and the seller's share is
 * transferred to their connected account in the same charge
 * (transfer_data.destination). So what the seller's account must be able to
 * do is RECEIVE A TRANSFER: its `transfers` capability has to be active.
 * Its own `card_payments` capability is never used for a Storelib sale.
 *
 * That matters because a seller in a different country from the platform is
 * a recipient account (lib/payments/stripe/connect.ts createConnectedAccount):
 * it only ever asks for transfers, so Stripe reports charges_enabled false
 * for it forever, and a rule built on charges_enabled could never let it
 * sell. Where Stripe did not send capabilities at all (a cached row from
 * before they were kept), charges_enabled stands in, as it always has.
 *
 * Payouts must be on as well. That is Storelib's choice, not Stripe's: a
 * seller who cannot be paid out should not be taking buyers' money that
 * would sit somewhere they cannot reach, and it is the rule every live
 * seller has been held to so far.
 */

export interface SellerAccountFacts {
  /** A real connected account id (acct_...). */
  accountId: string | null
  detailsSubmitted: boolean
  chargesEnabled: boolean
  payoutsEnabled: boolean
  /** Stripe's status of the transfers capability (active, pending, inactive), or null when not known. */
  transfersStatus: string | null
  pastDue: string[]
  disabledReason: string | null
  /**
   * Sales for this seller are made on_behalf_of their account (a country
   * outside Stripe's cross-border region, lib/payments/stripe/payout-regions
   * settlement): the account must take cards itself, so charges_enabled
   * counts too. Absent or false everywhere else.
   */
  needsCharges?: boolean
}

/** Stripe switched the account off for good, or paused the whole platform's access to it. */
export function accountTurnedOff(disabledReason: string | null | undefined): boolean {
  const reason = disabledReason ?? ""
  return /^rejected\./.test(reason) || reason === "platform_paused"
}

/** The seller's account can receive Storelib's transfer for a sale. */
export function canReceiveTransfers(f: Pick<SellerAccountFacts, "transfersStatus" | "chargesEnabled">): boolean {
  if (f.transfersStatus) return f.transfersStatus === "active"
  return f.chargesEnabled
}

/** Storelib's single answer to "may checkout take money for this seller". */
export function canAcceptPayments(f: SellerAccountFacts): boolean {
  if (!f.accountId?.startsWith("acct_")) return false
  if (!f.detailsSubmitted || !f.payoutsEnabled) return false
  if (!canReceiveTransfers(f)) return false
  if (f.needsCharges && !f.chargesEnabled) return false
  if (f.pastDue.length > 0) return false
  if (accountTurnedOff(f.disabledReason)) return false
  return true
}

/** The same facts from a Stripe account object. */
export function sellerFactsOfAccount(account: {
  id: string
  details_submitted?: boolean | null
  charges_enabled?: boolean | null
  payouts_enabled?: boolean | null
  capabilities?: object | null
  requirements?: { past_due?: string[] | null; disabled_reason?: string | null } | null
}): SellerAccountFacts {
  const transfers = (account.capabilities as Record<string, unknown> | null | undefined)?.transfers
  return {
    accountId: account.id,
    detailsSubmitted: !!account.details_submitted,
    chargesEnabled: !!account.charges_enabled,
    payoutsEnabled: !!account.payouts_enabled,
    transfersStatus: typeof transfers === "string" ? transfers : null,
    pastDue: account.requirements?.past_due ?? [],
    disabledReason: account.requirements?.disabled_reason ?? null,
  }
}

/**
 * THE GATE FROM THE CREATORS ROW, for checkout (no Stripe call on a buyer's
 * Pay). The sync writes can_accept_payments from the rule above every time
 * it reads the account, and writes stripe_onboarding_status "connected" from
 * the same rule, so the two always agree. A row without the new column (the
 * SQL part has not run, or a screen that does not select it) reads the
 * status word, and failing that all three flags, as every screen did before.
 *
 * The account id is only checked when the caller selected it: Home and the
 * product editor read a slimmer row, and "not selected" is not "no account".
 */
export function rowCanAcceptPayments(row: {
  stripe_account_id?: string | null
  stripe_onboarding_status?: string | null
  charges_enabled?: boolean | null
  payouts_enabled?: boolean | null
  details_submitted?: boolean | null
  can_accept_payments?: boolean | null
} | null | undefined): boolean {
  if (!row) return false
  if (row.stripe_account_id !== undefined && !row.stripe_account_id?.startsWith("acct_")) return false
  if (typeof row.can_accept_payments === "boolean") return row.can_accept_payments
  if (row.payouts_enabled === false) return false
  /* A recipient account's charges_enabled is false for good, so "connected" (written from the rule above) decides. */
  if (row.stripe_onboarding_status === "connected") return true
  if (row.charges_enabled === false) return false
  return row.charges_enabled === true && row.payouts_enabled === true && row.details_submitted !== false
}

/** What a buyer is told when the seller cannot take payment. Nothing about the seller's verification. */
export const BUYER_UNAVAILABLE = "This product is temporarily unavailable for purchase."

/*
 * WHAT HOME SAYS ABOUT PAYMENTS, from the creators row alone (no Stripe call
 * on every dashboard load; the sync keeps the row current). Coarser than the
 * Payouts page's status (lib/payments/stripe/status.ts), and only from columns
 * every database has, so Home never breaks on a part not yet run:
 *
 *   ready        checkout can take money (the rule above)
 *   not_started  no payments account yet
 *   setup        an account, setup not finished
 *   identity     Stripe wants to see an ID now
 *   info         Stripe wants another detail now
 *   paused       was selling, and something now stops payouts
 *   review       nothing to do, Stripe is checking
 */
export type HomePaymentsState = "ready" | "not_started" | "setup" | "identity" | "info" | "paused" | "review"

const SEE_ID = /verification\.(document|additional_document|proof_of_liveness)/

export function homePaymentsState(row: Parameters<typeof rowCanAcceptPayments>[0] & {
  stripe_requirements?: string[] | null
  stripe_connected_at?: string | null
} | null | undefined): HomePaymentsState {
  if (!row) return "not_started"
  if (rowCanAcceptPayments(row)) return "ready"
  /* Not selected: the status word is all there is. */
  if (row.stripe_account_id === undefined) return row.stripe_onboarding_status === "pending" ? "setup" : "not_started"
  if (!row.stripe_account_id) return "not_started"
  const due = Array.isArray(row.stripe_requirements) ? row.stripe_requirements : []
  const asks = due.filter((k) => k !== "external_account")
  if (row.stripe_connected_at) return asks.length > 0 || row.payouts_enabled === false ? "paused" : "review"
  if (row.details_submitted !== true) return "setup"
  if (asks.some((k) => SEE_ID.test(k))) return "identity"
  if (asks.length > 0) return "info"
  if (due.includes("external_account")) return "setup"
  return "review"
}
