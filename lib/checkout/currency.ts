/**
 * ===========================================================================
 *  THE CURRENCY THE PLATFORM ACTUALLY CHARGES
 * ===========================================================================
 *
 * Storelib is a Romanian marketplace. Prices are quoted in lei, the couriers
 * bill in lei, and the buyers hold Romanian cards — so the card should be
 * charged in lei.
 *
 * ---------------------------------------------------------------------------
 * WHAT IT WAS DOING BEFORE, AND WHY THAT IS A REAL PROBLEM
 * ---------------------------------------------------------------------------
 * `products.price_cents` held USD cents. The interface converted them to RON at
 * a STATIC rate of 4.6 for display, and the PaymentIntent was created with
 * `currency: "usd"`.
 *
 * That is internally consistent — nobody was charged 4.6× too much — but it
 * means the number on the checkout page was never the number on the bank
 * statement. A buyer reading "382,35 RON" had roughly $382 taken, which their
 * bank then converted back at ITS rate, with ITS margin. Beyond being a bad
 * experience, EU consumer rules expect the price shown to be the price charged.
 *
 * ---------------------------------------------------------------------------
 * THE ONE THING THAT MUST NOT BE GUESSED
 * ---------------------------------------------------------------------------
 * Switching the charge currency WITHOUT converting the stored amounts turns a
 * $100 listing into 100 lei — a 78% discount applied silently to every item in
 * the catalogue. The stored amounts and the declared currency have to move
 * together, which is why `PLATFORM_CURRENCY` and the migration that rewrites
 * `price_cents` are described in one place: supabase/sql/RUN_CURRENCY_RON.sql.
 *
 * Until that migration has been run, this file must keep saying "usd".
 */

/** ISO-4217, lower-case, as Stripe wants it. */
export type PlatformCurrency = "usd" | "ron"

/**
 * What the card is charged in.
 *
 * ---------------------------------------------------------------------------
 * THE DEFAULT IS NOW LEI, AND HERE IS THE EVIDENCE FOR THAT
 * ---------------------------------------------------------------------------
 * It defaulted to "usd", on the reasoning that a deployment which has not run
 * the migration must not quote lei against dollar-denominated rows. That
 * reasoning is sound and the default was still wrong, because it assumed the
 * stored numbers began life as dollars. They did not.
 *
 * `products.price_cents` is written by exactly one screen — the sell form — and
 * that form takes a number typed by a Romanian seller and multiplies it by 100.
 * A seller who types 360 means 360 lei. The row holds 36000 bani and always has.
 * Nothing in this product has ever asked anybody for a price in dollars.
 *
 * The observable proof: a listing was created at 360 and displayed at ~1656,
 * which is 360 × 4.6 — the display conversion applied to a number that was
 * already lei. The catalogue was never USD-denominated; the READER was wrong
 * about what it was reading.
 *
 * So the historical default was not a safe fallback, it was a standing bug:
 * every price on the site quoted 4.6× high, and every card charged in dollars
 * against a lei number.
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS DOES NOT MEAN
 * ---------------------------------------------------------------------------
 * It does NOT mean supabase/sql/RUN_CURRENCY_RON.sql should now be run. That
 * migration multiplies every stored amount by 4.6 to convert genuine USD cents
 * into bani. Run against a catalogue that is already in bani it does exactly
 * what the bug did, permanently and to the data rather than to the display.
 *
 * The env var still overrides, so a deployment that really does hold USD rows
 * can set NEXT_PUBLIC_PLATFORM_CURRENCY=usd and keep the old behaviour while it
 * migrates.
 */
export const PLATFORM_CURRENCY: PlatformCurrency =
  process.env.NEXT_PUBLIC_PLATFORM_CURRENCY === "usd" ? "usd" : "ron"

/** Both RON and USD are two-decimal currencies, so the minor unit is 1/100 in
 *  either case and no zero-decimal special case is needed. */
export const MINOR_UNITS_PER_MAJOR = 100

/**
 * The fixed part of the buyer-protection fee, in the minor unit being charged.
 *
 * 4 lei. Expressed per-currency because "400" means four lei in one world and
 * four dollars in the other — roughly an 18-lei fee, which is not what was
 * specified and would quietly overcharge every small order.
 *
 * The USD figure is 4 lei converted at the same static rate the display has
 * always used, so the fee is the same size in real terms whichever way the flag
 * is set.
 */
export const BUYER_PROTECTION_FIXED_BY_CURRENCY: Record<PlatformCurrency, number> = {
  ron: 400,
  usd: 87,
}

/**
 * ===========================================================================
 *  THE BUYER-PROTECTION LADDER
 * ===========================================================================
 *
 * The fee is a FLAT amount decided by the size of the order, not a percentage:
 *
 *   0.01 to 7.99 lei    1.00 lei
 *   8.00 to 9.99        1.25
 *   10.00 to 11.99      1.50
 *   12.00 to 14.99      1.75
 *   15.00 and up        4.00
 *
 * Why a ladder rather than the "5% + 4 lei" this replaced: at 130 lei both come
 * to roughly the same number, and at 10 lei the old rule charged 4.50 on a
 * ten-lei item — a 45% surcharge, on precisely the orders a second-hand
 * marketplace lives on. The ladder keeps the fee proportionate at the bottom
 * and lands on the same flat 4 lei everywhere above fifteen, which is where
 * nearly all the volume is.
 *
 * The 5% did not disappear; it moved to the side of the transaction it always
 * described. It is the SELLER's commission now — see SELLER_COMMISSION_PERCENT
 * in lib/checkout/pricing.ts — so the platform takes 5% from the seller and a
 * flat fee from the buyer, and neither is a percentage stacked on the other.
 *
 * ---------------------------------------------------------------------------
 * BOUNDARIES ARE HALF-OPEN AND EXPRESSED IN MINOR UNITS
 * ---------------------------------------------------------------------------
 * `upTo` is EXCLUSIVE, so 7.99 falls in the first band and 8.00 falls in the
 * second — which is what "0.01–7.99" and "8–9.99" mean and what a `<=` against
 * 799 would get wrong for 7.995 if a price ever carried a fraction of a ban.
 * Minor units throughout, because that is what `price_cents` holds and every
 * comparison against a float in lei is a rounding bug waiting for a price
 * ending in .99.
 *
 * The USD column is the lei figure at the same static rate the rest of this
 * file uses, so a deployment on the other flag charges the same fee in real
 * terms rather than four dollars.
 */
export type ProtectionBand = { upTo: number; fee: number }

export const BUYER_PROTECTION_LADDER_BY_CURRENCY: Record<PlatformCurrency, ProtectionBand[]> = {
  ron: [
    { upTo: 800, fee: 100 },
    { upTo: 1000, fee: 125 },
    { upTo: 1200, fee: 150 },
    { upTo: 1500, fee: 175 },
  ],
  usd: [
    { upTo: 174, fee: 22 },
    { upTo: 217, fee: 27 },
    { upTo: 261, fee: 33 },
    { upTo: 326, fee: 38 },
  ],
}

/**
 * The floor under a listing price.
 *
 * Five lei, and it is a marketplace rule rather than a payments one: below it
 * the protection fee is a fifth of the order, the courier costs several times
 * the item, and the listing is almost always a mistake or a test. Stripe's own
 * floor (MIN_CHARGE_BY_CURRENCY) is lower and stays where it is — it answers a
 * different question, which is whether a charge can be made at all.
 */
export const MIN_LISTING_PRICE_BY_CURRENCY: Record<PlatformCurrency, number> = {
  ron: 500,
  usd: 109,
}

export function minimumListingPriceCents(): number {
  return MIN_LISTING_PRICE_BY_CURRENCY[PLATFORM_CURRENCY]
}

/** Stripe rejects a payment below roughly $0.50; the equivalent floor in lei. */
export const MIN_CHARGE_BY_CURRENCY: Record<PlatformCurrency, number> = {
  ron: 250,
  usd: 50,
}

export function minimumChargeCents(): number {
  return MIN_CHARGE_BY_CURRENCY[PLATFORM_CURRENCY]
}
