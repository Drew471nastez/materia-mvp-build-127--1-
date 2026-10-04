/**
 * STORELIB PAYMENTS STATUS. One answer for "where is this creator's
 * payments account", read from the Stripe account itself (Stripe is the
 * judge; nothing here is set from Storelib's own form state). Pure: the
 * server reads the account and its bank accounts and passes the facts in.
 *
 * Order matters. A closed account is closed whatever else is due; a failed
 * bank is fixed before anything else about the bank; something the creator
 * must do comes before "we are checking"; and nothing is due while Stripe
 * says it is checking what was sent.
 */

export type StorelibPaymentsStatus =
  | "NOT_STARTED"
  | "INCOMPLETE"
  | "VERIFYING"
  | "ACTION_REQUIRED"
  | "BANK_REQUIRED"
  | "ACTIVE"
  | "RESTRICTED"
  | "PAYOUT_FAILED"
  | "SUSPENDED"

/** What the creator is sent to: Storelib's details form, its bank step, or its bank change. */
export type StatusAction = "setup" | "onboarding" | "bank" | "change_bank" | "support" | null

export interface StatusFacts {
  hasAccount: boolean
  detailsSubmitted: boolean
  chargesEnabled: boolean
  payoutsEnabled: boolean
  currentlyDue: string[]
  pastDue: string[]
  pendingVerification: string[]
  disabledReason: string | null
  /** Unix seconds. */
  currentDeadline: number | null
  /** future_requirements.currently_due + past_due: asked later, not yet. */
  futureDue: string[]
  /** requirements.eventually_due: what Stripe may ask for as sales grow. Only the ID check is read from it. */
  eventuallyDue?: string[]
  /** Requested capabilities by name, with Stripe's status for each. */
  capabilities: Record<string, string>
  /** Stripe's status of each payout bank account (new, validated, verified, verification_failed, errored). */
  externalAccounts: Array<{ status: string | null }>
  /** The latest payout to the bank failed. */
  lastPayoutFailed?: boolean
  /** The account was active before (payments once on). */
  everActive?: boolean
  /**
   * There is no live account, but there was one: it was let go because the
   * current Stripe platform cannot reach it (every creator linked before the
   * move to the new platform), or the creator chose Start over. Setting up
   * again is "Reconnect", not a first-time "Set up".
   */
  reconnect?: boolean
}

export interface StorelibStatusView {
  status: StorelibPaymentsStatus
  title: string
  line: string
  actionLabel: string | null
  action: StatusAction
  /** ISO date when Stripe needs it by, if it does. */
  deadline: string | null
  /** Stripe will ask for more later; nothing is needed now. */
  upcoming: boolean
  /** Charges can be taken right now. */
  canCharge: boolean
}

const BANK = /^external_account$/
const IDENTITY = /verification\.(document|additional_document|proof_of_liveness)|\.id_number|ssn_last_4|\.dob\./
/* Stripe wants to SEE an ID (a document, a liveness check), not a detail typed in: that is "Verify your identity". */
const DOCUMENT = /verification\.(document|additional_document|proof_of_liveness)/

function userDue(f: StatusFacts): { all: string[]; past: string[] } {
  const waiting = new Set(f.pendingVerification)
  const all = [...new Set([...f.pastDue, ...f.currentlyDue])].filter((k) => !waiting.has(k))
  return { all, past: f.pastDue.filter((k) => !waiting.has(k)) }
}

export function getStorelibPaymentsStatus(f: StatusFacts): StorelibStatusView {
  const deadline = f.currentDeadline ? new Date(f.currentDeadline * 1000).toISOString() : null
  const upcoming = f.futureDue.length > 0
  /*
   * A Storelib sale is a destination charge, so what this account has to be
   * able to do is receive the transfer (lib/payments/stripe/readiness). A
   * recipient account, a seller in another country than the platform, never
   * has charges_enabled, and read that way it was stuck on "paused" forever.
   */
  const takes = f.capabilities.transfers ? f.capabilities.transfers === "active" : f.chargesEnabled
  const base = { deadline, upcoming, canCharge: takes && f.payoutsEnabled && f.detailsSubmitted }
  const view = (status: StorelibPaymentsStatus, title: string, line: string, actionLabel: string | null, action: StatusAction): StorelibStatusView => ({
    status,
    title,
    line,
    actionLabel,
    action,
    ...base,
  })

  if (!f.hasAccount) {
    /*
      A CONNECTION THAT WAS LET GO IS RECONNECTED, NOT SET UP. The first step
      is the same either way (a fresh account under the current platform),
      but a creator who had payments working and now sees "Set up payments"
      reads it as their account having been wiped. Their orders and payouts
      are all still there; only the link to Stripe is new.
    */
    if (f.reconnect) return view("NOT_STARTED", "Reconnect payments", "Set up payments again to keep selling. Your orders and payout history are safe.", "Reconnect payments", "setup")
    return view("NOT_STARTED", "Set up payouts", "Get paid directly to your bank account.", "Set up payouts", "setup")
  }

  const reason = f.disabledReason ?? ""
  /* Stripe can keep a disabled_reason after capabilities return; trust live flags for pause. */
  if (/^rejected\./.test(reason)) {
    return view("SUSPENDED", "Payments are turned off", "This account can't accept payments. Write to support@storelib.com and we'll help.", "Contact support", "support")
  }
  if (reason === "platform_paused" && !(takes && f.payoutsEnabled)) {
    return view("SUSPENDED", "Payments are turned off", "This account can't accept payments. Write to support@storelib.com and we'll help.", "Contact support", "support")
  }

  const bankFailed = f.lastPayoutFailed || f.externalAccounts.some((b) => b.status === "errored" || b.status === "verification_failed")
  if (bankFailed) {
    return view("PAYOUT_FAILED", "Update your payout account", "We couldn't verify this bank account. Check the account details or add another payout account.", "Update payout account", "change_bank")
  }

  const due = userDue(f)
  const details = due.all.filter((k) => !BANK.test(k))
  const pastDetails = due.past.filter((k) => !BANK.test(k))
  const identity = details.some((k) => IDENTITY.test(k))

  if (details.length > 0) {
    if (!f.detailsSubmitted && !f.everActive) {
      return view("INCOMPLETE", "Finish setting up payments", "Pick up where you left off.", "Continue setup", "onboarding")
    }
    if (pastDetails.length > 0 || reason === "requirements.past_due") {
      if (f.everActive) return view("RESTRICTED", "Payouts are temporarily paused", "Complete the requested verification to resume payouts.", "Fix now", "onboarding")
      return identity
        ? view("RESTRICTED", "Verify your identity", "One more step is needed to activate payments.", "Continue verification", "onboarding")
        : view("RESTRICTED", "More information needed", "More information is needed to activate payments.", "Continue", "onboarding")
    }
    if (takes) {
      return details.some((k) => DOCUMENT.test(k))
        ? view("ACTION_REQUIRED", "Verify your identity", "Verify your identity to keep receiving payouts.", "Verify identity", "onboarding")
        : view("ACTION_REQUIRED", "More information needed", "Update your payout details to keep your account active.", "Update details", "onboarding")
    }
    return identity
      ? view("ACTION_REQUIRED", "Verify your identity", "One more step is needed to activate payments.", "Continue verification", "onboarding")
      : view("ACTION_REQUIRED", "More information needed", "More information is needed to activate payments.", "Continue", "onboarding")
  }

  /*
   * THE ID CHECK IS THE LAST STEP OF SETUP (lib/payments/stripe/own-form.ts
   * viewOf). A seller whose details are in but whose ID is not has not
   * finished, whatever Stripe is checking in the meantime: "Verification in
   * progress" with no button here sent them away from the one step left,
   * and then asked for it again days later as "more information".
   */
  const idStillToDo = !f.everActive && !(takes && f.payoutsEnabled) && (f.eventuallyDue ?? []).some((k) => DOCUMENT.test(k))
  if (idStillToDo) return view("INCOMPLETE", "Finish setting up payments", "One step left: verify your identity.", "Continue setup", "onboarding")

  const checking = f.pendingVerification.length > 0 || reason === "requirements.pending_verification" || reason === "under_review" || reason === "listed"
  if (checking && !(takes && f.payoutsEnabled)) {
    return view("VERIFYING", "Verification in progress", "We're checking your information. No action is needed right now.", null, null)
  }

  const bankMissing = f.externalAccounts.length === 0 || due.all.some((k) => BANK.test(k))
  if (bankMissing) return view("BANK_REQUIRED", "Add your bank account", "Add the account where you'd like to receive payouts.", "Add bank account", "bank")

  if (takes && f.payoutsEnabled) return view("ACTIVE", "Payments active", "You're ready to accept payments.", null, null)

  const capabilityPending = Object.values(f.capabilities).some((s) => s === "pending")
  if (capabilityPending || (!f.detailsSubmitted && !f.everActive)) {
    return view("VERIFYING", "Verification in progress", "We're checking your information. No action is needed right now.", null, null)
  }
  return view("RESTRICTED", "Payments need attention", "Our payment partner paused this account. Write to support@storelib.com and we'll sort it out.", "Contact support", "support")
}

/** The card's pill: a word or two and its tone. */
export const STATUS_PILL: Record<StorelibPaymentsStatus, { label: string; tone: "gray" | "blue" | "amber" | "green" | "red" }> = {
  NOT_STARTED: { label: "Setup required", tone: "gray" },
  INCOMPLETE: { label: "Setup incomplete", tone: "amber" },
  VERIFYING: { label: "Under review", tone: "blue" },
  ACTION_REQUIRED: { label: "Action required", tone: "amber" },
  BANK_REQUIRED: { label: "Add bank account", tone: "amber" },
  ACTIVE: { label: "Payments active", tone: "green" },
  RESTRICTED: { label: "Needs attention", tone: "red" },
  PAYOUT_FAILED: { label: "Payout failed", tone: "red" },
  SUSPENDED: { label: "Turned off", tone: "red" },
}

/** The older five-beat name the setup card and panel still read. */
export function beatOfStatus(status: StorelibPaymentsStatus): "personal" | "verification" | "bank" | "review" | "done" {
  if (status === "NOT_STARTED") return "personal"
  if (status === "BANK_REQUIRED" || status === "PAYOUT_FAILED") return "bank"
  if (status === "VERIFYING") return "review"
  if (status === "ACTIVE") return "done"
  return "verification"
}

/** The setup panel's step for a status: Account, Verify, or Bank. */
export function setupStepOf(status: StorelibPaymentsStatus): 0 | 1 | 2 {
  if (status === "NOT_STARTED") return 0
  if (status === "BANK_REQUIRED" || status === "PAYOUT_FAILED") return 2
  return 1
}

/** Minimal facts from a Stripe account object and its bank accounts. */
export function statusFactsOf(
  account: {
    charges_enabled?: boolean | null
    payouts_enabled?: boolean | null
    details_submitted?: boolean | null
    requirements?: {
      currently_due?: string[] | null
      past_due?: string[] | null
      pending_verification?: string[] | null
      disabled_reason?: string | null
      current_deadline?: number | null
      eventually_due?: string[] | null
    } | null
    future_requirements?: { currently_due?: string[] | null; past_due?: string[] | null } | null
    capabilities?: object | null
  } | null,
  externalAccounts: Array<{ status?: string | null }>,
  extra: { lastPayoutFailed?: boolean; everActive?: boolean; reconnect?: boolean } = {},
): StatusFacts {
  const r = account?.requirements ?? null
  const caps: Record<string, string> = {}
  for (const [k, v] of Object.entries((account?.capabilities ?? {}) as Record<string, unknown>)) if (typeof v === "string") caps[k] = v
  return {
    hasAccount: !!account,
    detailsSubmitted: !!account?.details_submitted,
    chargesEnabled: !!account?.charges_enabled,
    payoutsEnabled: !!account?.payouts_enabled,
    currentlyDue: r?.currently_due ?? [],
    pastDue: r?.past_due ?? [],
    pendingVerification: r?.pending_verification ?? [],
    disabledReason: r?.disabled_reason ?? null,
    currentDeadline: r?.current_deadline ?? null,
    futureDue: [...(account?.future_requirements?.currently_due ?? []), ...(account?.future_requirements?.past_due ?? [])],
    eventuallyDue: r?.eventually_due ?? [],
    capabilities: caps,
    externalAccounts: externalAccounts.map((e) => ({ status: e.status ?? null })),
    lastPayoutFailed: extra.lastPayoutFailed,
    everActive: extra.everActive,
    reconnect: extra.reconnect,
  }
}
