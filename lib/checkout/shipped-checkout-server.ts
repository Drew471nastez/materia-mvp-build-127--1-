import "server-only"

/**
 * ===========================================================================
 *  A CART THAT SHIPS IS PAID FOR ON THE STORE'S WEBSITE (round 49)
 * ===========================================================================
 * The owner: buying a physical product from a OnePage opened the old
 * checkout design (storelib.com/checkout/physical, Stripe's embedded form
 * under the shop's bar). Every other place a product that ships is bought
 * (the website's product pages and cart) pays on the website's own
 * checkout, https://<site>/checkout (app/checkout/site), drawn as the
 * Explore checkout is.
 *
 * The OnePage now links there itself (lib/onepage/shipped-checkout). This is
 * for the old addresses still in the wild (an email, a saved link, a page
 * cached before the change): storelib.com/checkout?productId=<a thing that
 * ships> and storelib.com/checkout/physical?shop=&items=. When the shop has a
 * published website that serves a checkout, the same cart goes there, with
 * Back kept: a OnePage of this creator's (checked, lib/onepage/return-address)
 * or a page of that website; a link that said it came from a OnePage keeps
 * ?src=onepage for the order's Source.
 *
 * Null when the shop has no such website: the old page stays the checkout
 * for that shop, since nothing else can take a cart that ships for it.
 */
import { getMainDomain } from "@/lib/url-helpers"
import { onePageReturnFor, siteHostsFor } from "@/lib/checkout/site-hosts"
import { firstServingSite, servingSiteOrigin } from "@/lib/checkout/site-checkout-server"
import { sameSitePath, siteCheckoutHref } from "@/lib/checkout/site-checkout"
import type { LinkItem } from "@/lib/physical/cart-link"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

export interface ShippedCheckoutAsk {
  shopId: string
  items: LinkItem[]
  /** Where Back went on the old link (`cancel` or `return`): a OnePage, a page of the website, or anything (dropped). */
  back?: string | null
  /** The old link's ?src. */
  src?: string | null
  visit?: { from?: string | null; utm_source?: string | null; utm_campaign?: string | null; touches?: string | null } | null
  code?: string | null
}

/** The website's checkout for this cart, or null when the shop has no published website serving one. Never throws. */
export async function websiteCheckoutFor(db: Db, ask: ShippedCheckoutAsk): Promise<string | null> {
  if (!ask.shopId || ask.items.length === 0) return null
  try {
    const back = typeof ask.back === "string" && ask.back.trim() ? ask.back.trim() : null
    const [onePage, origin] = await Promise.all([
      back ? onePageReturnFor(ask.shopId, back).catch(() => null) : Promise.resolve(null),
      (async () => {
        /* The website Back named, when it is this shop's and serves a checkout; else the shop's first that does. */
        if (back && /^https?:\/\//i.test(back)) {
          const named = await servingSiteOrigin(db, ask.shopId, new URL(back).origin).catch(() => null)
          if (named) return named
        }
        return firstServingSite(db, ask.shopId, await siteHostsFor(ask.shopId, db))
      })(),
    ])
    if (!origin || new URL(origin).hostname === getMainDomain()) return null
    const host = new URL(origin).host
    return siteCheckoutHref({
      origin,
      items: ask.items,
      back: onePage ? null : sameSitePath(back, host),
      couponCode: ask.code ?? null,
      onePage,
      source: ask.src === "onepage" ? "onepage" : null,
      visit: ask.visit ?? null,
    })
  } catch {
    return null
  }
}
