import type Stripe from "stripe"

export type StripeAccountSessionPurpose = "onboarding" | "management" | "payouts" | "balances"

/**
 * Only the component that is about to be drawn. On an account Storelib is
 * responsible for (requirement_collection "application") the bank is
 * collected inside the component and Stripe's sign-in window is turned off
 * (docs.stripe.com/connect/supported-embedded-components/account-onboarding,
 * "Disable Stripe user authentication": allowed only for those accounts). On
 * an older account Stripe collects for, both stay at Stripe's defaults.
 * Payout buttons stay off: Storelib's own Cash out moves money.
 */
export function accountSessionComponents(purpose: StripeAccountSessionPurpose, storelibCollects: boolean, options: { bank?: boolean } = {}): Stripe.AccountSessionCreateParams.Components {
  /* `bank: false`: the phone app's Account details, whose bank is changed in Storelib's own form (payments-setup-flow ownForms). */
  const features = storelibCollects ? { external_account_collection: options.bank !== false, disable_stripe_user_authentication: true } : {}
  const noMoney = { instant_payouts: false, standard_payouts: false, edit_payout_schedule: false }
  if (purpose === "onboarding") return { account_onboarding: { enabled: true, features } }
  if (purpose === "management") return { account_management: { enabled: true, features } }
  if (purpose === "payouts") return { payouts: { enabled: true, features: { ...features, ...noMoney } } }
  return { balances: { enabled: true, features: { ...features, ...noMoney } } }
}
