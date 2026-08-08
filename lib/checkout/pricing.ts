/**
 * ===========================================================================
 *  WHAT THE BUYER PAYS, AND WHO GETS IT
 * ===========================================================================
 *
 * One function, used by BOTH the summary the buyer reads and the amount Stripe
 * charges. That is the whole point of it existing: a checkout that displays one
 * total and charges another is the worst bug this file could have, and the only
 * way to be sure they agree is for them to be the same arithmetic.
 *
 * ---------------------------------------------------------------------------
 * The three lines a buyer sees
 * ---------------------------------------------------------------------------
 *   Comandă                       the item
 *   Taxă de protecție             5% of the item + a fixed amount
 *   Expediere                     the courier, at cost
 *   ─────────────────────────────
 *   Total de plată
 *
 * ---------------------------------------------------------------------------
 * WHO ENDS UP WITH THE MONEY — the part that is easy to get wrong
 * ---------------------------------------------------------------------------
 * The seller is paid for THE ITEM, minus the platform's existing commission.
 * They are not paid the protection fee and they are not paid the shipping —
 * the platform collects both, and out of the shipping it pays the courier.
 *
 * So the Stripe `application_fee_amount` is NOT simply a percentage of the
 * total. Computing it that way would quietly hand the seller a share of the
 * buyer's protection fee and a share of the postage, on every single order.
 * `platformTakesCents` below is the number that goes there.
 *
 * ---------------------------------------------------------------------------
 * A CURRENCY MISMATCH THAT PREDATES THIS FILE
 * ---------------------------------------------------------------------------
 * The app displays RON and the PaymentIntent is created with `currency: "usd"`.
 * Everything here works in the same minor unit as `price_cents`, whatever that
 * unit turns out to be, so the percentage is always right and the FIXED part is
 * the one thing that depends on the answer. `BUYER_PROTECTION_FIXED` is
 * therefore a named constant rather than a number sprinkled through the code —
 * when the currency question is settled, exactly one line changes.
 */

/** 5% of the item price. */
export const BUYER_PROTECTION_PERCENT = 0.05

/**
 * Plus a flat 4 RON — 400 bani.
 *
 * The flat part is what makes small orders viable: a percentage alone earns 50
 * bani on a 10-lei sale, which does not cover the cost of handling a dispute
 * about it.
 */
export const BUYER_PROTECTION_FIXED = 400

export interface PricingInput {
  /** The item, in minor units. An accepted offer price belongs here. */
  itemCents: number
  /** What the courier costs for the chosen method. Zero when not yet chosen. */
  shippingCents?: number
  /** Optional, and it all goes to the seller. */
  tipCents?: number
  /** The platform's existing commission on the ITEM, from lib/billing. */
  platformCommissionCents?: number
}

export interface PricingBreakdown {
  itemCents: number
  buyerProtectionCents: number
  shippingCents: number
  tipCents: number
  /** What the card is charged. */
  totalCents: number
  /** What Stripe should move to the platform: commission + protection + postage. */
  platformTakesCents: number
  /** What lands in the seller's account. */
  sellerReceivesCents: number
}

/**
 * Rounded to a whole minor unit, half up.
 *
 * Money must never carry a fraction into Stripe — an amount of 2077.5 is
 * rejected outright — and rounding at the END of each line rather than on the
 * total keeps the printed breakdown adding up to the printed total. A buyer who
 * sums three visible numbers and gets a different answer stops trusting the
 * page, and they are right to.
 */
function round(n: number): number {
  return Math.round(n)
}

/**
 * The buyer-protection fee for an item at this price.
 *
 * Exported on its own because the listing page quotes it before there is a
 * checkout, and quoting it with different arithmetic would be a lie told early.
 */
export function buyerProtectionFee(itemCents: number): number {
  if (!Number.isFinite(itemCents) || itemCents <= 0) return 0
  return round(itemCents * BUYER_PROTECTION_PERCENT + BUYER_PROTECTION_FIXED)
}

export function priceCheckout(input: PricingInput): PricingBreakdown {
  const itemCents = Math.max(0, Math.round(input.itemCents || 0))
  const shippingCents = Math.max(0, Math.round(input.shippingCents || 0))
  const tipCents = Math.max(0, Math.round(input.tipCents || 0))
  const buyerProtectionCents = buyerProtectionFee(itemCents)

  const totalCents = itemCents + buyerProtectionCents + shippingCents + tipCents

  // The commission applies to the ITEM (and any tip, which is the seller's
  // money too). Never to the protection fee or the postage — those were never
  // the seller's to be taxed on.
  const commission = Math.max(0, Math.round(input.platformCommissionCents || 0))

  // Everything the platform keeps. Shipping is in here because the platform is
  // what pays the courier.
  const platformTakesCents = commission + buyerProtectionCents + shippingCents

  return {
    itemCents,
    buyerProtectionCents,
    shippingCents,
    tipCents,
    totalCents,
    platformTakesCents,
    // Guarded: a misconfigured commission larger than the item must not produce
    // a negative transfer, which Stripe rejects and which would strand a paid
    // order with no payout.
    sellerReceivesCents: Math.max(0, itemCents + tipCents - commission),
  }
}

/** The lines to render, in the order a buyer reads them. Empty lines are
 *  omitted rather than shown as zero — "Expediere 0,00" invites the question
 *  of whether shipping is free or simply not chosen yet. */
export function breakdownLines(b: PricingBreakdown): Array<{ label: string; cents: number; info?: string }> {
  const lines: Array<{ label: string; cents: number; info?: string }> = [
    { label: "Comandă", cents: b.itemCents },
    {
      label: "Taxă de protecție pentru cumpărători",
      cents: b.buyerProtectionCents,
      info: "Acoperă rambursarea dacă articolul nu ajunge sau nu corespunde descrierii.",
    },
  ]
  if (b.shippingCents > 0) lines.push({ label: "Expediere", cents: b.shippingCents })
  if (b.tipCents > 0) lines.push({ label: "Bacșiș", cents: b.tipCents })
  return lines
}
