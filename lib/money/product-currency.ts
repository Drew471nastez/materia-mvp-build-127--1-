/**
 * ===========================================================================
 *  THE CURRENCY A PRODUCT'S OWN PRICE IS IN
 * ===========================================================================
 * Almost every product is priced in its store's currency
 * (lib/store/selling-currency): a lei store's 49 is 49 lei. Two kinds are
 * not, and never were:
 *
 *   membership   its plan is a Stripe Price in US dollars (membership_plans
 *                .currency, written "USD"), typed in an editor that shows "$"
 *                (components/memberships/creator-screen.tsx), and every
 *                renewal is billed in dollars
 *   community    a community's one-time plan, typed in the same "$" editor
 *                (components/community/creator/parts.tsx PriceInput) and
 *                shown on the community page in dollars
 *
 * So their price is in US dollars wherever it is drawn (a card on Explore,
 * a creator page, OnePage, /app, checkout, receipts) and wherever it is
 * charged. Nothing here converts anything: it only says which currency a
 * stored number is in, so a dollar plan is never relabelled as lei.
 *
 * Pure, so pages, routes and tests read the same rule.
 */
import { sellingCurrencyOf } from "@/lib/store/selling-currency"

/** The currency membership and community plans are priced and billed in. */
export const PLAN_CURRENCY = "USD" as const

export interface ProductKindLike {
  type?: string | null
}

/** Whether this product's own price is in US dollars whatever its store sells in. */
export function isPlanPriced(p: ProductKindLike | null | undefined): boolean {
  const t = p?.type
  return t === "membership" || t === "community"
}

/** The currency this product's stored price is in: dollars for a plan, else its store's (read the way every store price is, lib/store/selling-currency). */
export function productPriceCurrency(p: ProductKindLike | null | undefined, storeCurrency: string | null | undefined): string {
  return isPlanPriced(p) ? PLAN_CURRENCY : sellingCurrencyOf(storeCurrency)
}
