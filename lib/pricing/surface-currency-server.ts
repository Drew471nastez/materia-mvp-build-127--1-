import "server-only"

/**
 * ===========================================================================
 *  WHICH SURFACE A CHECKOUT IS ON, AND SO WHICH CURRENCY IT CHARGES
 * ===========================================================================
 * /checkout and /api/checkout/stripe-session answer on more than one host.
 * On storelib.com they are Storelib's own checkout: the one a creator page,
 * a OnePage, an Explore card and a community tier all send the buyer to.
 * A creator's published website serves its own checkout on its own host
 * instead (app/checkout/site, proxy.ts siteCheckoutFor), and the shipped and
 * basket checkouts are that website's too.
 *
 * So the currency is not a property of the route, it is a property of the
 * host the request arrived on: this creator's own website, or Storelib. The
 * host is read from the database the way a website sign in reads it
 * (lib/site-accounts/hosts siteOwnerOfHost) and never from anything the
 * page claims, and the website has to be the PRODUCT'S own creator's, so a
 * link from one creator's site cannot buy another creator's product in the
 * first creator's currency.
 *
 * Nothing is converted. The amount is the row's integer; the surface says
 * which currency that integer is in, and the same answer goes to the
 * summary, the PaymentIntent, the order row, the tax and the receipt
 * (lib/pricing/surface-currency).
 */
import { siteOfHost } from "@/lib/checkout/site-checkout-server"
import { readStoreCurrency } from "@/lib/store/selling-currency-read"
import { STORELIB_CURRENCY, surfaceOfHost, type PriceSurface } from "./surface-currency"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

export interface SurfaceCurrency {
  /** "storefront" for the creator's own website, "platform" for Storelib's own checkout. */
  surface: PriceSurface
  /** Upper case, for what the page writes. */
  currency: string
  /** Lower case, for Stripe and `orders.currency`. */
  charge: string
}

/**
 * The currency this checkout shows and charges. `host` is the request's own
 * Host header; `creatorId` is the product's seller.
 *
 * A host that cannot be placed (a read that failed, a preview, a live AI
 * site, localhost) is Storelib's, which is the safe way round: Storelib's
 * own currency is the one every surface agreed on before any store chose,
 * so an unreadable host never charges a currency the buyer was not shown.
 */
export async function checkoutSurfaceCurrency(db: Db, opts: { host: string | null | undefined; creatorId: string | null | undefined }): Promise<SurfaceCurrency> {
  let siteCreatorId: string | null = null
  try {
    siteCreatorId = (await siteOfHost(db, opts.host))?.creatorId ?? null
  } catch {
    siteCreatorId = null
  }
  const surface = surfaceOfHost(siteCreatorId, opts.creatorId)
  if (surface !== "storefront") return { surface, currency: STORELIB_CURRENCY, charge: STORELIB_CURRENCY.toLowerCase() }
  const currency = (await readStoreCurrency(db, opts.creatorId)).currency
  return { surface, currency, charge: currency.toLowerCase() }
}
