import type Stripe from "stripe"
import type { PayoutRoute } from "./payout-regions"

/**
 * The account shapes onboarding asks Stripe for, in order (the first one
 * Stripe accepts is kept). Pure, so tests/round-ap pins it.
 *
 * A creator in the platform's country: a full account (cards + transfers),
 * then transfers only. A creator in another country of the cross-border
 * region: transfers only on the FULL agreement first, never the recipient
 * one (lib/payments/stripe/payout-regions explains why), then cards +
 * transfers on the full agreement.
 *
 * WHY CARDS COME BACK ACROSS A BORDER (Nov 23 2026, a seller: "it just keeps
 * saying try again"). Stripe opens a transfers-only full account only after
 * it approves the platform for that shape ("Your platform needs approval for
 * accounts to have requested the `transfers` capability without the
 * `card_payments` capability"). Until then every seller outside Romania was
 * refused, every time. A full account that may also take cards needs no such
 * approval, and Stripe pays it out across the region as long as Storelib's
 * destination charges carry no on_behalf_of, which they do not unless
 * NEXT_PUBLIC_SELLER_STATEMENT_NAME=1 (lib/payments/platform-descriptor: keep
 * it unset; docs/stripe-connect-checklist.md). Transfers only stays first, so
 * once Stripe approves it every new cross-border account is that shape again.
 * An unsupported country gets no attempt at all.
 */
export function accountAttempts(
  shared: Stripe.AccountCreateParams,
  route: PayoutRoute,
  options: { storelibOnly?: boolean } = {},
): Stripe.AccountCreateParams[] {
  if (route === "unsupported") return []
  const crossBorder = route === "cross-border"
  const full: Stripe.AccountCreateParams.Capabilities = {
    card_payments: { requested: true },
    transfers: { requested: true },
  }
  const transfersOnly: Stripe.AccountCreateParams.Capabilities = { transfers: { requested: true } }
  const inStorelib: Stripe.AccountCreateParams.Controller = {
    stripe_dashboard: { type: "none" },
    fees: { payer: "application" },
    losses: { payments: "application" },
    requirement_collection: "application",
  }
  const acknowledged: Stripe.AccountCreateParams.Controller = {
    stripe_dashboard: { type: "express" },
    fees: { payer: "application" },
    losses: { payments: "application" },
    requirement_collection: "stripe",
  }

  const merchant = { ...shared, capabilities: full }
  /* Destination charges only need transfers. card_payments is extra, and
     Stripe refuses it for some countries (Romania included) with a message
     that sounds like the country itself is unsupported. Transfers, with no
     recipient agreement, still pays the seller out. */
  const paidOut = { ...shared, capabilities: transfersOnly }

  /* Never the recipient agreement: Stripe makes no cross-border payouts to
     it, and refuses it within one country anyway. Cross-border tries
     transfers only on the full agreement first, then the full account with
     cards (see above). Same country tries a full account, then transfers only. */
  const storelibAttempts: Stripe.AccountCreateParams[] = crossBorder
    ? [
        { ...paidOut, controller: inStorelib },
        { ...merchant, controller: inStorelib },
      ]
    : [
        { ...merchant, controller: inStorelib },
        { ...paidOut, controller: inStorelib },
      ]
  const expressAttempts: Stripe.AccountCreateParams[] = crossBorder
    ? [
        { ...paidOut, controller: acknowledged },
        { ...merchant, controller: acknowledged },
        { ...paidOut, type: "express" },
        { ...merchant, type: "express" },
      ]
    : [
        { ...merchant, controller: acknowledged },
        { ...paidOut, controller: acknowledged },
        { ...merchant, type: "express" },
      ]
  return options.storelibOnly ? storelibAttempts : [...storelibAttempts, ...expressAttempts]
}
