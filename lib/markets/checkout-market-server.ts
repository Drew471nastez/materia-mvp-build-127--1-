import "server-only"

/**
 * ===========================================================================
 *  THE MARKET A WEBSITE'S CHECKOUT CHARGES IN
 * ===========================================================================
 * The same market the website's pages were drawn in (proxy.ts visitorMarket):
 * the country the visitor chose in the website's selector (the sl_country
 * cookie, "home" for the store's own prices), else the one their connection
 * is in. Its prices are converted with the day's rates or the store's own
 * rate for it, from the store's currency read fresh, never a cached copy, so
 * a store that just changed currency is never charged in the old one.
 *
 * Null: the store's own currency, as every checkout charged before.
 */
import { createAdminClient } from "@/lib/supabase/admin"
import { readStoreCurrency } from "@/lib/store/selling-currency-read"
import { cachedRates } from "./fx-server"
import { marketOfCountry, siteLanguages } from "./live"
import { pricingFor, type Pricing } from "./pricing"
import { chargingPricing, marketCharge, type MarketCharge } from "./checkout-charge"

/** The visitor's country as the website reads it: their choice in its selector, else where their connection is. Null for "home" or unknown. */
export function checkoutVisitorCountry(chosen: string | null | undefined, seen: string | null | undefined): string | null {
  if (chosen === "home") return null
  if (chosen && /^[A-Za-z]{2}$/.test(chosen)) return chosen.toUpperCase()
  return seen && /^[A-Za-z]{2}$/.test(seen) ? seen.toUpperCase() : null
}

/** The visitor's country from a request's cookies and headers (the site checkout's API calls come from the site's own host, with its cookies). */
export function countryOfRequest(request: Request): string | null {
  const cookie = request.headers.get("cookie") ?? ""
  const chosen = /(?:^|;\s*)sl_country=([^;]+)/.exec(cookie)?.[1]
  return checkoutVisitorCountry(chosen ? decodeURIComponent(chosen) : null, request.headers.get("x-vercel-ip-country") || request.headers.get("cf-ipcountry"))
}

/**
 * The delivery country a checkout starts on, from the website's selector and
 * where the visitor is. The selector names a market by its first country
 * (lib/markets/choice.ts), so a visitor in France who went to lei and back
 * to euros has Germany in the cookie: where they are wins while it is in the
 * same market. Choosing the store's own prices ("home") moves nobody, and a
 * country picked in an imported theme's list stays picked.
 */
export function deliveryCountryGuess(markets: { countries: string[] }[], chosen: string | null | undefined, seen: string | null | undefined): string | null {
  const where = checkoutVisitorCountry(null, seen)
  const picked = checkoutVisitorCountry(chosen, null)
  if (!picked) return where
  if (!where || where === picked) return picked
  return markets.some((m) => m.countries.includes(picked) && m.countries.includes(where)) ? where : picked
}

export interface CheckoutMarket {
  /** The store's own currency: what every price is typed in. */
  storeCurrency: string
  /** The visitor's market's prices, when it shows its own currency today. */
  pricing: Pricing | null
  /** Set when the checkout charges in that currency (Storelib can charge it). */
  charge: MarketCharge | null
  /** What the card is charged in. */
  chargeCurrency: string
}

export async function checkoutMarket(creatorId: string, country: string | null, db: unknown = createAdminClient()): Promise<CheckoutMarket> {
  const storeCurrency = (await readStoreCurrency(db, creatorId)).currency
  let pricing: Pricing | null = null
  if (country) {
    const langs = await siteLanguages(creatorId)
    const market = langs.saved ? marketOfCountry(langs, country) : null
    if (market) pricing = pricingFor(market, storeCurrency, await cachedRates().catch(() => null))
  }
  const charging = chargingPricing(pricing)
  return { storeCurrency, pricing, charge: charging ? marketCharge(charging) : null, chargeCurrency: charging ? charging.currency : storeCurrency }
}
