import type { PaymentsStage, PayoutStatus, RequirementNote, StageCopy } from "./model"
import type { PayoutDestination } from "./store"
import type { StorelibPaymentsBadge } from "./stripe/creator-badge"
import type { PaymentUxState } from "./stripe/facts"

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
  nextPayout?: { amountMinor: number; currency: string; arrivalDate: string | null } | null
}

export interface CreatorRef {
  id: string
  userId: string
  email: string | null
}
