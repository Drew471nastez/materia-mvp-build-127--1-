/**
 * ===========================================================================
 *  THE ONE ANSWER A CART GETS ABOUT THE STORE'S OFFERS
 * ===========================================================================
 * POST /api/offers/cart (app/api/offers/cart/route.ts), asked by the cart
 * drawer, the cart page and an imported theme's cart (lib/storelib-theme/
 * compat/objects.ts), with
 *
 *   { shopId, items: [{ productId, variantId, quantity, customPriceCents?, properties? }] }
 *
 * (lib/website-builder/cart checkoutItems, the same items the checkout is
 * sent). The server prices every item itself from the database, never from
 * the browser: the shop's own published products only, an option that is
 * the product's own and active, a pay what you want amount held to its
 * minimum. An item it cannot price is left out of everything below, not
 * guessed at; an offer id is never taken from the browser at all, the offers
 * are the store's active ones (lib/offers/offers.ts applyOffers), so a cart
 * cannot claim a discount it does not qualify for.
 *
 * What it answers is the same arithmetic the checkout charges by
 * (lib/physical/checkout-pricing-server.ts runs applyOffers on its own
 * pricing of the same items), so the drawer, the cart page and the checkout
 * show one set of numbers:
 *
 *   currency       the store's currency, in which every amount here is
 *   subtotalCents  the items as the server priced them, before any offer
 *   offerCents     what every offer takes off, together
 *   totalCents     subtotalCents less offerCents (before shipping, tax and a
 *                  code, which only the checkout knows)
 *   freeShipping   an offer the cart gets makes its shipping free
 *   offers         each offer the cart gets now, with what it saves
 *   lines          what each item it priced gets off, in the order sent:
 *                  its unit price and quantity as the server priced them,
 *                  its discount, and each offer's part of it, so a cart in
 *                  a market's currency converts each line as checkout does
 *                  (lib/markets/cart-money offerSavingsShown)
 *   suggestions    checkout offers shown in the cart that this cart
 *                  qualifies for, their product not in it yet
 *   completions    bundles shown in the cart that it holds part of, with the
 *                  products still missing
 *
 * A cart that changed while this was asked (a quantity pressed twice) asks
 * again and drops the older answer (components/offers/cart-offers.tsx
 * useCartOffers). Adding a bundle or an upsell puts every line in or none
 * (lib/website-builder/cart addAllLines).
 */

export interface OfferItem {
  id: string
  title: string
  slug: string
  imageUrl: string | null
  type: string
  priceCents: number
  /** In stock or selling past it, active (lib/offers/offers-server.ts offerProducts): an option that cannot be bought is not offered. */
  variants: { id: string; name: string; priceCents: number }[]
  /** Pay what you want: at its minimum, counted in a set, never discounted. */
  payWhatYouWant?: boolean
}

export interface CartOffersAnswer {
  currency: string | null
  subtotalCents: number
  offerCents: number
  totalCents: number
  freeShipping: boolean
  offers: { offerId: string; title: string; savedCents: number; freeShipping: boolean }[]
  lines: { productId: string; variantId: string | null; discountCents: number; unitCents?: number; quantity?: number; offers?: { offerId: string; title: string; savedCents: number }[] }[]
  suggestions: { offerId: string; title: string; label: string | null; product: OfferItem; offerPriceCents: number }[]
  completions: { offerId: string; title: string; label: string | null; missing: OfferItem[]; savingCents: number }[]
}

/** The answer for a cart that gets nothing (no shop, no items, no offers). */
export const NO_CART_OFFERS: CartOffersAnswer = { currency: null, subtotalCents: 0, offerCents: 0, totalCents: 0, freeShipping: false, offers: [], lines: [], suggestions: [], completions: [] }
