/**
 * ===========================================================================
 *  A ONEPAGE'S BUY FOR A PRODUCT THAT SHIPS: THE WEBSITE'S CHECKOUT (round 49)
 * ===========================================================================
 * The owner: "buying a physical product from a OnePage sends the buyer to the
 * OLD checkout page design. It should go to the NEW checkout, the same one
 * physical products use from creator pages and websites."
 *
 * The old one is storelib.com/checkout/physical (app/checkout/physical:
 * Stripe's embedded form under the shop's bar). The new one is the store's
 * website checkout, https://<site>/checkout (app/checkout/site), drawn as the
 * Explore checkout is, which every product page of a website and its cart
 * pay on. It takes the cart in the link (ids, option, quantity, the buyer's
 * answers), asks for the delivery address and method, lets the option be
 * chosen or changed and the quantity moved, and prices it all on the server.
 *
 * Every OnePage way to buy a product that ships now opens it:
 *
 *   the sheet's Check out     straight there, the option, quantity and
 *                             answers chosen in the sheet (the product's facts
 *                             name the website, app/api/onepage/product)
 *   the block's tap           straight there once the product's facts are read
 *   ("Buy instantly")         (as the block nears the screen), no option named,
 *                             so the buyer picks one there; before that, and
 *                             for a crawler, /checkout?productId=…&src=onepage
 *                             on storelib.com, which sends it on to the same
 *                             place (app/checkout/page.tsx,
 *                             lib/checkout/shipped-checkout-server)
 *   an old /checkout/physical sent on with its cart (app/checkout/physical)
 *   link
 *
 * And every one carries ?src=onepage (the order's Source is the OnePage, as
 * Analytics counts it, lib/orders/checkout-origin) and ?cancel=<the OnePage>
 * (Back, and Continue shopping after paying, checked on the server against
 * this creator's OnePages, lib/onepage/return-address).
 *
 * Pure: no React, no database.
 */
import { siteCheckoutHref } from "@/lib/checkout/site-checkout"
import { physicalCheckoutHref, type LinkItem } from "@/lib/physical/cart-link"

/** What the OnePage's links add so the checkout knows where it began (lib/orders/order-source ONEPAGE_SOURCE). */
export const ONEPAGE_SRC = "onepage"

/** A store website's origin, as the product's facts name it: https only (http on a developer's machine), nothing after the host. */
export function cleanSiteOrigin(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw) return null
  try {
    const u = new URL(raw)
    const local = /^(localhost|127\.0\.0\.1)$/.test(u.hostname)
    if (u.protocol !== "https:" && !(local && u.protocol === "http:")) return null
    if (u.username || u.password) return null
    return u.origin
  } catch {
    return null
  }
}

/**
 * Where the sheet's Check out goes for a product that ships: the store's
 * website checkout with this cart when the store has a website (`siteOrigin`),
 * else storelib.com's link for the same cart, which the server sends on to a
 * website should one exist by then, and which is the only checkout a store
 * with no website has.
 */
export function onePageShippedCheckoutHref(input: { siteOrigin: string | null | undefined; shopId: string; items: LinkItem[]; onePage: string | null }): string {
  const origin = cleanSiteOrigin(input.siteOrigin)
  if (origin) return siteCheckoutHref({ origin, items: input.items, onePage: input.onePage, source: "onepage" })
  const path = physicalCheckoutHref(input.shopId, input.items, input.onePage)
  return `${path}&src=${ONEPAGE_SRC}`
}

/**
 * The block's own tap for a product that ships, once its facts name the website: straight to that checkout, one
 * navigation instead of storelib.com's hop. No option named (the checkout asks for one when there are several; a
 * product with one is bought as that one) and one of it. Null until the website is known: the link stays
 * storelib.com's, which sends it on to the same place.
 */
export function onePageTapCheckoutHref(input: { siteOrigin: string | null | undefined; shopId: string | null | undefined; productId: string; onePage: string | null }): string | null {
  const origin = cleanSiteOrigin(input.siteOrigin)
  if (!origin || !input.shopId) return null
  return onePageShippedCheckoutHref({ siteOrigin: origin, shopId: input.shopId, items: [{ productId: input.productId, variantId: null, quantity: 1 }], onePage: input.onePage })
}
