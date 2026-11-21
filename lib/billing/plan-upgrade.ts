/**
 * ===========================================================================
 *  A STORELIB PLAN UPGRADE, PAID BEFORE IT HAPPENS
 * ===========================================================================
 * Billing's upgrade (app/api/billing/subscription/change). The difference for
 * the rest of the period is invoiced at once (always_invoice), and Stripe holds
 * the change until that invoice is paid (payment_behavior
 * pending_if_incomplete), the way a community member's upgrade is made
 * (lib/communities/server/plan-change.ts):
 *
 *   paid         the card paid at once: the subscription is on the new price
 *   needs_action the bank wants to confirm (3-D Secure, routine for European
 *                cards): the invoice's payment secret goes to the dialog,
 *                which confirms it with Stripe.js and then asks the route to
 *                finish. Until then the old plan stays, and an unpaid held
 *                change expires in Stripe by itself
 *   declined     the card was refused: nothing changed
 *
 * Stripe takes no metadata and no cancel_at_period_end with a held change, so
 * those are written once the new price is on the subscription. A held change
 * leaves the subscription's items as they were, so the plan sync, which reads
 * the plan from the price first (lib/billing/subscription-state
 * paidPlanFromSubscription), never marks the plan changed before it is paid.
 */

/** How an upgrade is billed: the difference for the rest of the period, invoiced and charged at once. */
export const UPGRADE_PRORATION = "always_invoice" as const

/** What a creator is told when the card did not pay for an upgrade. Nothing changed. */
export const UPGRADE_NOT_PAID = "Your card was not charged, so your plan did not change. Update your card in Billing and try again."

/** What a finish is told when Stripe does not show the new plan paid yet. */
export const UPGRADE_NOT_FINISHED = "The payment for the new plan has not gone through, so your plan did not change."

export type UpgradeOutcome =
  | { kind: "paid"; subscription: UpgradedSub }
  | { kind: "needs_action"; clientSecret: string }
  | { kind: "declined"; error: string }

export type UpgradedSub = {
  id?: string
  status?: string
  pending_update?: unknown
  items?: { data?: { price?: { id?: string | null } | null }[] }
  latest_invoice?: { confirmation_secret?: { client_secret?: string | null } | null } | string | null
  [key: string]: unknown
}

export interface UpgradeDeps {
  update: (id: string, params: Record<string, unknown>) => Promise<UpgradedSub>
}

/** Whether the subscription is on the new price with nothing held: the only proof that an upgrade was paid. */
export function upgradeLanded(sub: UpgradedSub | null | undefined, priceId: string): boolean {
  return !!sub && sub.items?.data?.[0]?.price?.id === priceId && !sub.pending_update
}

/** Asks Stripe for the upgrade and says how its payment went. A declined card is an answer; anything else throws. */
export async function startPlanUpgrade(deps: UpgradeDeps, input: { subscriptionId: string; itemId: string; priceId: string }): Promise<UpgradeOutcome> {
  let sub: UpgradedSub
  try {
    sub = await deps.update(input.subscriptionId, {
      items: [{ id: input.itemId, price: input.priceId }],
      proration_behavior: UPGRADE_PRORATION,
      payment_behavior: "pending_if_incomplete",
      expand: ["latest_invoice.confirmation_secret"],
    })
  } catch (e) {
    const err = e as { type?: string; code?: string; statusCode?: number; raw?: { message?: string } }
    if (err?.type === "StripeCardError" || err?.code === "card_declined" || err?.statusCode === 402) {
      return { kind: "declined", error: err.raw?.message ? `${err.raw.message} ${UPGRADE_NOT_PAID}` : UPGRADE_NOT_PAID }
    }
    throw e
  }
  if (sub?.pending_update) {
    const invoice = sub.latest_invoice && typeof sub.latest_invoice === "object" ? sub.latest_invoice : null
    const secret = invoice?.confirmation_secret?.client_secret
    return secret ? { kind: "needs_action", clientSecret: secret } : { kind: "declined", error: UPGRADE_NOT_PAID }
  }
  if (!upgradeLanded(sub, input.priceId)) return { kind: "declined", error: UPGRADE_NOT_PAID }
  return { kind: "paid", subscription: sub }
}
