/**
 * What Stripe's embedded setup asks, shared by Payouts on the web
 * (components/app/settings/payments-setup-flow.tsx) and the apps' browser
 * sheet (app/payouts-sheet). Two of Stripe's steps are left out: what kind of
 * seller you are and the live selfie; the account is opened as a person, with
 * its website, category and description filled, before the form is drawn.
 */
import type { CollectionOptions } from "@stripe/connect-js"

export const SETUP_COLLECTION: CollectionOptions = {
  fields: "eventually_due",
  futureRequirements: "omit",
  requirements: {
    exclude: [
      "business_type",
      /* Filled before the form is drawn (the store's address, digital goods, what is sold there): never asked. */
      "business_profile.url",
      "business_profile.mcc",
      "business_profile.product_description",
      "individual.verification.proof_of_liveness",
      "individual.verification.additional_document",
      "documents.bank_account_ownership_verification",
    ],
  },
}

/** Changing the bank: only the payout account. */
export const BANK_COLLECTION: CollectionOptions = { fields: "currently_due", futureRequirements: "omit", requirements: { only: ["external_account"] } }
