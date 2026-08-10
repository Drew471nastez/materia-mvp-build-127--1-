/**
 * ===========================================================================
 *  THE NUMBER ON THE CARD IS THE NUMBER YOU PAY
 * ===========================================================================
 *
 * A listing priced at 130 lei cost 141 at the till: 5% of the item plus a flat
 * 4 lei of buyer protection, added at the checkout and nowhere before it. Every
 * price on the site was a number that went up when you committed to it, and the
 * grid was a grid of prices that were all slightly wrong in the same direction.
 *
 * That is the one arithmetic a marketplace must not get wrong twice. It is
 * quoted INCLUSIVE now, everywhere a buyer reads it — feed, listing page,
 * saved items — with a mark beside it saying so, and the checkout still
 * itemises what the mark stands for.
 *
 * ---------------------------------------------------------------------------
 * IT USES THE CHECKOUT'S OWN FUNCTION
 * ---------------------------------------------------------------------------
 * `buyerProtectionFee` comes from lib/checkout/pricing, which is the function
 * the PaymentIntent is built from. Re-deriving "5% and 4 lei" here would be two
 * copies of one rule, and the day they disagree is the day the card shows one
 * total and the bank takes another — which is exactly the bug this file exists
 * to close, reintroduced from the other end.
 *
 * ---------------------------------------------------------------------------
 * WHAT THE SELLER SEES IS DELIBERATELY NOT THIS
 * ---------------------------------------------------------------------------
 * The price field in the sell form is what the SELLER is asking for, and it is
 * what their payout is computed from. Showing them the inclusive figure there
 * would tell somebody typing 130 that they are earning 141. Buyers read the
 * inclusive number; sellers read theirs.
 */

import { buyerProtectionFee } from "@/lib/checkout/pricing"

/**
 * What a buyer will be asked for, before shipping.
 *
 * Shipping is genuinely not known at this point — it depends on the courier and
 * the locker they have not chosen yet — so it stays out and the checkout adds
 * it as its own line. Protection is knowable from the price alone, which is
 * precisely why hiding it until the end was indefensible.
 */
export function buyerPaysCents(itemCents: number): number {
  if (!Number.isFinite(itemCents) || itemCents <= 0) return 0
  return Math.round(itemCents) + buyerProtectionFee(itemCents)
}
