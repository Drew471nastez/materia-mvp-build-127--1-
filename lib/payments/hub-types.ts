import type { PaymentsStage, PayoutStatus, RequirementNote, StageCopy } from "./model"
import type { PayoutDestination } from "./store"
import type { StorelibPaymentsBadge } from "./stripe/creator-badge"
import type { PaymentUxState } from "./stripe/facts"
import type { OnboardingBeat } from "./stripe/onboarding-steps"
import type { StorelibStatusView } from "./stripe/status"

export interface HubOverview {
  provider: "stripe" | "airwallex"
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
  /** Storelib's payments status, read from the Stripe account. Absent on other providers. */
  paymentsStatus?: StorelibStatusView
  /** Stripe could not be reached just now; status is from the last sync. */
  stripeUnreachable?: boolean
  /** Where the creator is in setup. Requirement codes stay on the server. */
  beat?: OnboardingBeat
  statusLabel?: string
  nextPayout?: { amountMinor: number; currency: string; arrivalDate: string | null } | null
}

export interface CreatorRef {
  id: string
  userId: string
  email: string | null
}
