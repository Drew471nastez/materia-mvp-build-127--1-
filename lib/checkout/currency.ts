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
 * Env-driven so the switch is a deployment decision taken at the same moment as
 * the data migration, rather than a code change that has to race it. Defaults
 * to the historical value: a deployment that has not migrated must not
 * accidentally start quoting lei against dollar-denominated rows.
 */
export const PLATFORM_CURRENCY: PlatformCurrency =
  process.env.NEXT_PUBLIC_PLATFORM_CURRENCY === "ron" ? "ron" : "usd"

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

/** Stripe rejects a payment below roughly $0.50; the equivalent floor in lei. */
export const MIN_CHARGE_BY_CURRENCY: Record<PlatformCurrency, number> = {
  ron: 250,
  usd: 50,
}

export function minimumChargeCents(): number {
  return MIN_CHARGE_BY_CURRENCY[PLATFORM_CURRENCY]
}
