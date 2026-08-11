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
 *   Taxă de protecție             5% of the item, plus a fixed part by size
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
 * CURRENCY
 * ---------------------------------------------------------------------------
 * Everything here works in whatever minor unit `price_cents` holds, so the
 * PERCENTAGE is always correct regardless. The FIXED part is the one number
 * that depends on which currency that is, and it comes from
 * lib/checkout/currency.ts rather than being written here — see the note on
 * BUYER_PROTECTION_FIXED below for what happens when it is not.
 */

import {
  BUYER_PROTECTION_FIXED_BY_CURRENCY,
  BUYER_PROTECTION_LADDER_BY_CURRENCY,
  PLATFORM_CURRENCY,
} from "@/lib/checkout/currency"

/** The percentage part of the buyer-protection fee. */
export const BUYER_PROTECTION_PERCENT = 0.05

/**
 * WHAT THE SELLER PAYS: NOTHING.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS IS ZERO AND NOT FIVE PERCENT
 * ---------------------------------------------------------------------------
 * The platform's cut is five percent plus a fixed amount, and it is charged
 * ONCE — to the buyer, inside the protection fee. Charging the same five
 * percent again on the seller's side would be taking it twice from one
 * transaction, which is not what "5% and the fixed fee" describes and is not
 * what the buyer-protection page has been telling people the whole time
 * ("5% din prețul articolului, plus 4 lei").
 *
 * It is the arrangement the marketplaces this one is modelled on use, and it
 * is the one that makes the sell form honest: a seller types 350 and is paid
 * 350. Nothing is deducted from a number they chose.
 *
 * Left as a named constant at zero rather than deleted. The commission is a
 * commercial decision, not a fact about the code, and a zero with the reasoning
 * beside it is a decision somebody can revisit in one line — where a deleted
 * concept is a decision they have to rediscover.
 */
export const SELLER_COMMISSION_PERCENT = 0

/**
 * The top of the buyer-protection ladder: a flat 4 lei on anything from 15 lei
 * up, which is nearly every order. See BUYER_PROTECTION_LADDER_BY_CURRENCY for
 * the four bands below it and for why the fee stopped being a percentage.
 *
 * Taken from the currency module rather than written here as 400, because 400
 * minor units is four LEI in one configuration and four DOLLARS in the other —
 * roughly an eighteen-lei fee, which is not what was asked for and would
 * quietly overcharge every small order.
 */
export const BUYER_PROTECTION_FIXED = BUYER_PROTECTION_FIXED_BY_CURRENCY[PLATFORM_CURRENCY]

const PROTECTION_LADDER = BUYER_PROTECTION_LADDER_BY_CURRENCY[PLATFORM_CURRENCY]

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
  const cents = round(itemCents)
  // The fixed part comes off the ladder; `upTo` is exclusive, so 799 is in the
  // first band and 800 opens the second.
  let fixed = BUYER_PROTECTION_FIXED
  for (const band of PROTECTION_LADDER) {
    if (cents < band.upTo) {
      fixed = band.fee
      break
    }
  }
  // BOTH PARTS. A flat fee alone earns four lei on a 350-lei order, which does
  // not cover the risk being carried on it; a percentage alone earns fifty bani
  // on a ten-lei one, which does not cover a single dispute about it. The
  // percentage scales with the exposure and the fixed part covers the floor,
  // which is why every marketplace that offers this charges both.
  return round(cents * BUYER_PROTECTION_PERCENT) + fixed
}

/**
 * The platform's cut of the item, taken from the seller.
 *
 * Exported so the sell form can tell a seller what they will actually be paid
 * before they publish, using the same arithmetic the payout runs on. A payout
 * figure quoted with a second copy of this rule is a promise the transfer does
 * not keep.
 */
export function sellerCommissionCents(itemCents: number): number {
  if (!Number.isFinite(itemCents) || itemCents <= 0) return 0
  return round(round(itemCents) * SELLER_COMMISSION_PERCENT)
}

/** What lands in the seller's account for an item at this price, before any
 *  tip. The inverse of the line above, and the number the sell form quotes. */
export function sellerReceivesCents(itemCents: number): number {
  if (!Number.isFinite(itemCents) || itemCents <= 0) return 0
  return Math.max(0, round(itemCents) - sellerCommissionCents(itemCents))
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
