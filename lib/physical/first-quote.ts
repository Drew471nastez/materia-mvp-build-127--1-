/**
 * THE PHYSICAL CHECKOUT'S FIRST QUOTE, ASKED BY THE SERVER.
 *
 * app/checkout/physical/page.tsx prices the cart in the link before the
 * first frame by asking the quote route with this body, and the page
 * (physical-checkout.tsx) takes that answer in place of its own first ask
 * while nothing it would send is different: the same cart, no code, no
 * address typed, the same country, no delivery chosen (or the one the
 * answer chose), not cash. The moment any of those changes it asks the
 * route itself, as it always did.
 */
import type { LinkItem } from "./cart-link"

export function firstQuoteBody(shopId: string, items: LinkItem[], country: string) {
  return { shopId, items, couponCode: null, country, region: "", postalCode: "", city: "", deliveryOptionId: null, email: "" }
}

export interface FirstQuoteAsk {
  items: LinkItem[] | null
  couponCode: string | null
  country: string
  region: string
  postalCode: string
  city: string
  deliveryOptionId: string | null
  cash: boolean
}

/** Whether the page's ask now is the one the server already answered (`chosenId`: the delivery that answer chose, which the page then selects). */
export function sameAsFirstQuote(first: { items: LinkItem[]; country: string }, chosenId: string | null, now: FirstQuoteAsk): boolean {
  if (!now.items || JSON.stringify(now.items) !== JSON.stringify(first.items)) return false
  if (now.couponCode || now.cash) return false
  if (now.country !== first.country || now.region || now.postalCode || now.city) return false
  return now.deliveryOptionId === null || now.deliveryOptionId === chosenId
}
