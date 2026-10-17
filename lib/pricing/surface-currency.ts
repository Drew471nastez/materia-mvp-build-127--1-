/**
 * ===========================================================================
 *  WHICH CURRENCY A SURFACE'S PRICES ARE IN
 * ===========================================================================
 * Storelib shows the same catalog in two different places, and they are not
 * the same shop:
 *
 *   the creator's storefront   their website at <name>.storelib.com or on
 *                              their own domain, its cart, its checkout and
 *                              the shipped checkout that serves it. Priced
 *                              and charged in the currency the store chose
 *                              (Settings › Country & Currency,
 *                              store_settings.currency,
 *                              lib/store/selling-currency). A store in lei
 *                              shows lei there and charges lei.
 *
 *   Storelib itself            Explore and the category pages, the creator
 *                              page (/u/...), the product page (/p/...), a
 *                              OnePage (/l/...), communities and their
 *                              checkouts, and Storelib's own checkout at
 *                              /checkout. One currency for everybody,
 *                              STORELIB_CURRENCY, whatever any store chose.
 *
 * WHY THERE IS A BOUNDARY AT ALL. A store's currency used to be read
 * wherever a price was drawn, so a creator who set their store to RON moved
 * every price Storelib itself shows for them: their Explore cards, their
 * creator page, their community's plans, and the currency those checkouts
 * charged. One merchant's settings changing what a marketplace quotes is
 * not a currency feature, it is a leak. The storefront is theirs; Explore,
 * the creator pages and the communities are Storelib's.
 *
 * NOTHING IS CONVERTED HERE, AND THAT IS DELIBERATE. `price_cents` is one
 * integer. A surface says which currency that integer is in; it never
 * multiplies it by a rate to reach a nicer symbol. So a creator-page or
 * community checkout charges the integer in USD, and says USD on the
 * summary, on the PaymentIntent, on the order row and on the receipt. A
 * storefront checkout charges the same integer in the store's currency and
 * says that everywhere. A number shown in one currency and taken in another
 * is the bug this file exists to make impossible; a silent conversion to
 * make a symbol look right is the other half of the same bug.
 *
 * Orders are never re-read through this. An order keeps the currency it was
 * made in (`orders.currency`), and so do its refunds, invoices, receipts,
 * payouts and wallet lines. lib/orders/money.ts reads the row.
 *
 * Pure and dependency free, so the pages, the API routes, the website code
 * and the tests all decide the same way.
 */

/**
 * The currency Storelib's own surfaces price and charge in. Not read from a
 * store, and not from NEXT_PUBLIC_PLATFORM_CURRENCY: that env var says what
 * a deployment's own checkout machinery charges (lib/checkout/currency) and
 * is a separate question from what the marketplace quotes.
 */
export const STORELIB_CURRENCY = "USD"

/** The same, lower case, as Stripe and `orders.currency` write it. */
export const STORELIB_CHARGE_CURRENCY = "usd"

/** Where a price is being shown or charged. */
export type PriceSurface =
  /** The creator's own website, its cart, its checkout, the shipped checkout. */
  | "storefront"
  /** storelib.com/u/<name>, /p/<slug>, /l/<slug>. */
  | "creator_page"
  /** Explore, the category pages, search and discovery. */
  | "explore"
  /** A community: plan prices, public pricing, upgrades, tickets, programs, membership presentation. */
  | "community"
  /** Storelib's own checkout at /checkout, and anything else on storelib.com. */
  | "platform"

/** The surfaces that are Storelib's rather than one store's. */
export const STORELIB_SURFACES: readonly PriceSurface[] = ["creator_page", "explore", "community", "platform"]

/** Whether this surface is Storelib's own, and so priced in STORELIB_CURRENCY. */
export function isStorelibSurface(surface: PriceSurface): boolean {
  return surface !== "storefront"
}

/** "RON", or null for anything that is not a three letter code. */
export function currencyCodeOrNull(raw: unknown): string | null {
  const code = typeof raw === "string" ? raw.trim().toUpperCase() : ""
  return /^[A-Z]{3}$/.test(code) ? code : null
}

/**
 * The currency this surface's prices are in, upper case.
 *
 * A storefront needs the store's own currency handed in (read it with
 * lib/store/selling-currency-read readStoreCurrency, or the cached reader);
 * without one it falls back to Storelib's, which is what a store that never
 * chose sells in anyway. Every other surface ignores the store entirely:
 * passing one in is not an error, it is just not used, which is the whole
 * point of the boundary.
 */
export function surfaceCurrency(surface: PriceSurface, storeCurrency?: string | null): string {
  if (surface === "storefront") return currencyCodeOrNull(storeCurrency) ?? STORELIB_CURRENCY
  return STORELIB_CURRENCY
}

/** The same, lower case, as Stripe and `orders.currency` write it. */
export function surfaceChargeCurrency(surface: PriceSurface, storeCurrency?: string | null): string {
  return surfaceCurrency(surface, storeCurrency).toLowerCase()
}

/**
 * Which surface a request on storelib.com or on a website host belongs to.
 * `siteCreatorId` is the creator whose published website serves this host
 * (lib/checkout/site-checkout-server siteOfRequest), null on storelib.com.
 * The product's own creator is checked too, so a link from one creator's
 * website cannot buy another creator's product in the first creator's
 * currency.
 */
export function surfaceOfHost(siteCreatorId: string | null | undefined, productCreatorId: string | null | undefined): PriceSurface {
  return siteCreatorId && productCreatorId && siteCreatorId === productCreatorId ? "storefront" : "platform"
}
