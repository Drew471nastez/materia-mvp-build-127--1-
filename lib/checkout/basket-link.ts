/**
 * ===========================================================================
 *  A WEBSITE'S BASKET, AS A LINK TO STORELIB'S OWN CHECKOUT
 * ===========================================================================
 * A cart on a creator's website (a site built in the website builder, or an
 * imported Shopify theme) is paid for on storelib.com/checkout/cart: the
 * shop's logo and name in the bar, Back to the site, and Stripe's form inside
 * the page (app/checkout/cart). It used to open Stripe's own hosted page,
 * with none of the shop on it and no way back but the browser's arrow.
 *
 * The link carries ids and quantities only (lib/physical/cart-link
 * encodeItems, the same encoding the physical checkout reads), the page to
 * go back to, a discount code the cart applied, and what the website knows
 * about the visit (the same keys a Buy button's link carries to /checkout,
 * lib/orders/checkout-origin checkoutHrefWithOrigin). NOTHING HERE IS
 * TRUSTED: the page prices every line again from the database, checks the
 * page to go back to against this shop's own sites, and cleans the visit's
 * fields one by one before they reach an order.
 *
 * Pure, so the live site's router (lib/storelib-theme/compat/site.ts), the
 * basket route and the tests all build the same address.
 */
import { decodeItems, encodeItems, type LinkItem } from "@/lib/physical/cart-link"

export const BASKET_CHECKOUT_PATH = "/checkout/cart"

/** `cart=1`: the whole cart was sent, so it is emptied after paying (a Buy it now is not). */
export const WHOLE_CART_PARAM = "cart"
/** Added to the page the buyer lands on after paying a whole cart: the site's cart empties itself. */
export const CLEAR_CART_PARAM = "sl_cart"

const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export interface BasketLinkInput {
  /** storelib.com's own origin, e.g. https://storelib.com. Empty for a relative address. */
  base?: string
  shopId: string
  items: LinkItem[]
  /** Where Back goes: the cart page the buyer came from, on the shop's own site. */
  back?: string | null
  /** A discount code the cart page applied. Priced again on the checkout. */
  couponCode?: string | null
  /** The whole cart was sent (not a Buy it now of one item). */
  wholeCart?: boolean
  /** What the website knows about the visit: its host, where it came from, its touches. */
  origin?: { site?: string | null; from?: string | null; utm_source?: string | null; utm_campaign?: string | null; touches?: string | null } | null
}

export function basketCheckoutHref(input: BasketLinkInput): string {
  const params = new URLSearchParams({ shop: input.shopId, items: encodeItems(input.items) })
  if (input.back) params.set("return", input.back.slice(0, 500))
  const code = typeof input.couponCode === "string" ? input.couponCode.trim().slice(0, 64) : ""
  if (code) params.set("code", code)
  if (input.wholeCart) params.set(WHOLE_CART_PARAM, "1")
  /* The order's Source: a website's, and which one (lib/orders/checkout-origin describeCheckout). */
  params.set("src", "website")
  const o = input.origin ?? {}
  const add: Array<[string, unknown, number]> = [
    ["site", o.site, 253],
    ["ref", o.from, 64],
    ["utm_source", o.utm_source, 120],
    ["utm_campaign", o.utm_campaign, 120],
    /* The visit's touches, which storelib.com cannot read from the site's own storage (lib/attribution/browser). */
    ["sl_at", o.touches, 2000],
  ]
  for (const [key, value, max] of add) {
    if (typeof value === "string" && value.trim() && value.length <= max) params.set(key, value.trim())
  }
  return `${input.base ?? ""}${BASKET_CHECKOUT_PATH}?${params.toString()}`
}

export interface BasketParams {
  shopId: string | null
  items: LinkItem[]
  back: string | null
  couponCode: string | null
  wholeCart: boolean
}

/** The checkout page's reading of its own address: well formed or left out, nothing more. */
export function readBasketParams(q: { get(key: string): string | null }): BasketParams {
  const shop = q.get("shop")
  const code = (q.get("code") ?? "").trim().slice(0, 64)
  return {
    shopId: shop && ID.test(shop) ? shop : null,
    items: decodeItems(q.get("items")),
    back: q.get("return") || null,
    couponCode: code || null,
    wholeCart: q.get(WHOLE_CART_PARAM) === "1",
  }
}

/** The page after paying, told to empty the cart when the whole cart was paid for. */
export function afterPaidTarget(siteOrigin: string, wholeCart: boolean): string {
  return `${siteOrigin}/${wholeCart ? `?${CLEAR_CART_PARAM}=clear` : ""}`
}
