/**
 * NEVER A GROW PRICE THE PAGE DID NOT SHOW (lib/billing/stripe-prices).
 * Every screen says PRO_PRICE_CENTS. Before a Grow checkout or an upgrade to
 * Grow, Stripe is asked what the Grow price charges; while it is anything
 * but PRO_PRICE_CENTS a month in US dollars (PRICE_GROWTH_MONTHLY not yet
 * set to the $14 price, or set to the wrong one) the change is refused and
 * nothing is charged.
 */
import { PRO_PRICE_CENTS } from "@/lib/billing/plans"
import { growthPriceId } from "@/lib/billing/stripe-prices"

/** What a Stripe price charges, as far as this check needs it. */
export interface PriceFacts {
  unit_amount: number | null
  currency: string
  recurring?: { interval?: string | null; interval_count?: number | null } | null
  active?: boolean
}

/** Whether a Stripe price charges exactly what the Grow card shows: PRO_PRICE_CENTS, US dollars, once a month. */
export function priceChargesShownGrow(price: PriceFacts | null | undefined): boolean {
  if (!price) return false
  return (
    price.unit_amount === PRO_PRICE_CENTS &&
    String(price.currency).toLowerCase() === "usd" &&
    price.recurring?.interval === "month" &&
    (price.recurring?.interval_count ?? 1) === 1 &&
    price.active !== false
  )
}

let checked: { id: string; ok: boolean; at: number } | null = null
const CHECK_TTL_MS = 10 * 60_000

/**
 * Asks Stripe once in a while (10 minutes) whether the Grow price checkout
 * is about to use charges what the card shows. A failed read is not cached
 * and answers false: nothing is charged on a guess.
 */
export async function growPriceMatchesShown(stripe: { prices: { retrieve(id: string): Promise<PriceFacts> } }, priceId = growthPriceId()): Promise<boolean> {
  const now = Date.now()
  if (checked && checked.id === priceId && now - checked.at < CHECK_TTL_MS) return checked.ok
  try {
    const ok = priceChargesShownGrow(await stripe.prices.retrieve(priceId))
    checked = { id: priceId, ok, at: now }
    if (!ok) console.error("[billing] The Grow Stripe price does not charge what the cards show. Set PRICE_GROWTH_MONTHLY to the $14 monthly price.", { priceId, shownCents: PRO_PRICE_CENTS })
    return ok
  } catch (error) {
    console.error("[billing] Could not read the Grow Stripe price:", (error as Error)?.message)
    return false
  }
}

/** For tests: forget the cached answer. */
export function clearGrowPriceCheck() {
  checked = null
}

/** What a refused Grow checkout says. Nothing was charged. */
export const GROW_PRICE_NOT_READY = "Grow can't be bought for a moment while its price is updated. Nothing was charged. Try again later."
