/**
 * ===========================================================================
 *  WHICH STRIPE PRICE IS WHICH PLAN
 * ===========================================================================
 * One place for the plan prices in Stripe, read by checkout
 * (app/api/billing/subscription/create), a plan change
 * (app/api/billing/subscription/change) and everything that reads a
 * subscription back (lib/billing/subscription-state paidPlanFromPrice, so the
 * webhook's sync and the Billing tab).
 *
 * GROW WENT FROM $29 TO $14 (the owner). A Stripe price's amount cannot be
 * edited, so Grow has two prices on the same Stripe product:
 *
 *   PRICE_GROWTH_MONTHLY          the $14 price every new Grow checkout uses
 *   PRICE_GROWTH_MONTHLY_LEGACY   the $29 price (comma separated if there is
 *                                 more than one), which existing subscribers
 *                                 pay until scripts/migrate-grow-price.mjs
 *                                 moves them at their next renewal
 *
 * Both are read as `growth`, and so is the $29 price this code always knew
 * (LEGACY_GROWTH_PRICE_ID), so a subscriber on either is Grow throughout.
 *
 * NEVER A PRICE THE PAGE DID NOT SHOW. Every screen says PRO_PRICE_CENTS
 * (lib/billing/plans). Until PRICE_GROWTH_MONTHLY names the $14 price, the
 * fallback below is the $29 one, and a checkout for it would charge $29
 * under a $14 card. lib/billing/grow-price-guard asks Stripe what the price
 * charges, and a Grow checkout or upgrade is refused (nothing charged) while
 * it is anything but PRO_PRICE_CENTS a month in US dollars.
 *
 * Pure: no imports, so the subscription readers stay light.
 */
/** The $29 Grow price, live since the plans were made. Kept as `growth` for every subscriber still on it. */
export const LEGACY_GROWTH_PRICE_ID = "price_1SzBWaBYevnBVyznNCTOXDoS"
/** The $99 Pro price (plan id `pro`). */
export const DEFAULT_PRO_PRICE_ID = "price_1SzBXSBYevnBVyznYjXfOOXX"

function envList(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((v) => v.trim())
    .filter((v) => v.startsWith("price_"))
}

/** The price a new Grow checkout uses: PRICE_GROWTH_MONTHLY, else the legacy one (refused by growPriceMatchesShown while it is $29). */
export function growthPriceId(env: Record<string, string | undefined> = process.env): string {
  return env.PRICE_GROWTH_MONTHLY?.trim() || LEGACY_GROWTH_PRICE_ID
}

/** The price a new Pro checkout uses. */
export function proPriceId(env: Record<string, string | undefined> = process.env): string {
  return env.PRICE_PRO_MONTHLY?.trim() || DEFAULT_PRO_PRICE_ID
}

/** Every price id read as Grow: the current one, PRICE_GROWTH_MONTHLY_LEGACY's and the old $29 one. */
export function growthPriceIds(env: Record<string, string | undefined> = process.env): string[] {
  return [...new Set([growthPriceId(env), ...envList(env.PRICE_GROWTH_MONTHLY_LEGACY), LEGACY_GROWTH_PRICE_ID])]
}

/** The Grow prices a subscriber may still be on that are not the current one: what the migration moves. */
export function legacyGrowthPriceIds(env: Record<string, string | undefined> = process.env): string[] {
  const current = growthPriceId(env)
  return growthPriceIds(env).filter((id) => id !== current)
}

/** The plan a Stripe price is, or null for a price this code does not know. Never "free". */
export function planFromPriceId(priceId: string | null | undefined, env: Record<string, string | undefined> = process.env): "growth" | "pro" | null {
  if (!priceId) return null
  if (growthPriceIds(env).includes(priceId)) return "growth"
  if (priceId === proPriceId(env)) return "pro"
  /* The live account's own ids, whatever the environment says (as before). */
  if (priceId.includes("SzBWa")) return "growth"
  if (priceId.includes("SzBXS")) return "pro"
  return null
}
