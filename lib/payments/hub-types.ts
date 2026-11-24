import type { PaymentsStage, PayoutStatus, RequirementNote, StageCopy } from "./model"
import type { StorelibPaymentsBadge } from "./stripe/creator-badge"
import type { PaymentUxState } from "./stripe/facts"
import type { OnboardingBeat } from "./stripe/onboarding-steps"
import type { StorelibStatusView } from "./stripe/status"

/** The bank account a creator is paid into, masked: never a full number. */
export interface PayoutDestination {
  bankName: string | null
  country: string | null
  currency: string | null
  last4: string | null
  holder: "individual" | "business" | null
}

export interface HubOverview {
  provider: "stripe"
  environment: "sandbox" | "production"
  configured: boolean
  tableMissing: boolean
  stage: PaymentsStage
  copy: StageCopy
  kind: "individual" | "business" | null
  requirements: RequirementNote[]
  checkoutOpen: boolean
  balances: Array<{ currency: string; availableMinor: number; pendingMinor: number }>
  balancesAt: string | null
  payoutDestination: PayoutDestination | null
  payouts: Array<{ id: string; amountMinor: number; currency: string; status: PayoutStatus; statusText: string; createdAt: string | null }>
  can: {
    embeddedOnboarding: boolean
    hostedOnboarding: boolean
    embeddedPayoutForm: boolean
    requestPayout: boolean
  }
  unavailable: string[]
  stripe?: { publishableKey: string | null }
  badge: StorelibPaymentsBadge
  uxState: PaymentUxState
  /** Stripe Connect flags. Absent on other providers. */
  chargesEnabled?: boolean
  payoutsEnabled?: boolean
  prefill?: { firstName: string; lastName: string; country: string | null }
  /** Live name and currency from Stripe. Currency is never guessed from the country. */
  payoutHint?: {
    accountName: string
    currency: string | null
    country: string | null
    holderType: "individual" | "company"
    /** False for an older Express account, where Stripe's own form still adds the bank. */
    inStorelib: boolean
  } | null
  /**
   * The account already there, for setup's country step (lib/payments/stripe/account-country):
   * its country, whether it can still change (nothing sent on it), and whether
   * the seller chose it (null when only the cached row was read).
   */
  setupCountry?: { country: string | null; changeable: boolean; chosen: boolean | null }
  /** Only on POST start with `session: true`: the Account Session for Stripe's form, made beside the overview. */
  session?: { purpose: "stripe_onboarding"; clientSecret: string; publishableKey: string; stripeSignIn: boolean; expiresAt: number | null }
  /** The Stripe platform's country (ISO), when known: setup uses it to say which countries can be paid out before anything is opened. */
  platformCountry?: string | null
  /** The seller's country from the request (Vercel's x-vercel-ip-country), when there is one: the first guess on the country step. */
  detectedCountry?: string | null
  /** Countries outside Stripe's cross-border region the owner opened (STRIPE_SETTLEMENT_COUNTRIES): paid through accounts charged on their behalf. */
  settlementCountries?: string[]
  /** Storelib's payments status, read from the Stripe account. Absent on other providers. */
  paymentsStatus?: StorelibStatusView
  /** Stripe could not be reached just now; status is from the last sync. */
  stripeUnreachable?: boolean
  /** Where the creator is in setup. Requirement codes stay on the server. */
  beat?: OnboardingBeat
  statusLabel?: string
  nextPayout?: { amountMinor: number; currency: string; arrivalDate: string | null } | null
  /**
   * This creator was paid through Airwallex before Storelib moved to Stripe,
   * and Stripe is not set up yet: Settings shows a one-time note to connect it.
   */
  airwallexBefore?: boolean
  /** Setup still has the ID check ahead: Stripe lists the document and none is on file. The stepper shows the step from the start. */
  idAhead?: boolean
}

export interface CreatorRef {
  id: string
  userId: string
  email: string | null
}
