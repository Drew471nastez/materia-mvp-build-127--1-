/**
 * ===========================================================================
 *  WHAT A PRICED BASKET IS ALLOWED TO DO NEXT
 * ===========================================================================
 * The basket route (app/api/checkout/cart) and the branded basket checkout
 * page (app/checkout/cart) both start from lib/checkout/pricing priceCart and
 * must agree on what follows, or the cart page would say "go" and the
 * checkout "no". One function, pure, so the tests run every branch:
 *
 *   refuse   priceCart refused it, more than one shop is in it, the link
 *            named a shop the products are not from, nothing in it can be
 *            bought, or the total is under the smallest card payment
 *   ships    something in it ships: the whole cart goes to the physical
 *            checkout, which takes digital lines beside shipped ones
 *   free     a code took the whole basket to $0, or (on a checkout that
 *            keeps $0 lines) everything in it is free: no card at all
 *   pay      one shop, server prices, at least $0.50: the branded checkout
 *
 * Whether the seller can take payments is a database read and is asked
 * after this, by the caller (lib/payments/service checkoutReadyForCreator).
 */
import { MIN_CHARGE_CENTS, type PricedCart } from "./pricing"

export type BasketDecision =
  | { kind: "refuse"; status: number; error: string; dropped?: string[] }
  | { kind: "ships"; creatorId: string; items: Extract<PricedCart, { ok: true }>["ships"] }
  | { kind: "free"; creatorId: string }
  | { kind: "pay"; creatorId: string }

export const ONE_SHOP_ONLY = "A cart can only hold one shop's products"

export function basketDecision(priced: PricedCart, opts: { shopId?: string | null } = {}): BasketDecision {
  if (priced.ok === false) return { kind: "refuse", status: priced.status, error: priced.error }
  /* ONE SELLER, FROM THE DATA: a destination charge pays one connected account. */
  if (priced.creatorIds.length !== 1) return { kind: "refuse", status: 400, error: ONE_SHOP_ONLY }
  const creatorId = priced.creatorIds[0]
  /* A link names its shop; products of another shop under that name are not this shop's checkout. */
  if (opts.shopId && opts.shopId !== creatorId) return { kind: "refuse", status: 400, error: ONE_SHOP_ONLY }

  if (priced.ships.length > 0) return { kind: "ships", creatorId, items: priced.ships }

  if (priced.lines.length === 0) {
    const named = priced.dropped.filter((d) => !/^[0-9a-f-]{36}$/i.test(d))
    return {
      kind: "refuse",
      status: 400,
      error: priced.ownedAny
        ? "You already own everything in this cart"
        : named.length > 0
          ? `${named.slice(0, 3).join(", ")} can't be bought right now. Remove ${named.length === 1 ? "it" : "them"} and try again.`
          : "These products are no longer on sale. Remove them and try again.",
      dropped: priced.dropped,
    }
  }

  /* Free: a code took it to $0, or every line is free on its own (kept only by a checkout that asks, priceCart keepFree). The prices are the server's either way. */
  if (priced.totalCents === 0 && (priced.coupon || priced.lines.every((l) => l.item.priceCents === 0))) return { kind: "free", creatorId }

  if (priced.totalCents < MIN_CHARGE_CENTS) {
    return {
      kind: "refuse",
      status: 400,
      error: priced.coupon ? "The smallest card payment is $0.50. Remove the code or add to the cart." : "Minimum payment amount is $0.50",
    }
  }
  return { kind: "pay", creatorId }
}
