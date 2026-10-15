/**
 * ===========================================================================
 *  THE CURRENCY A STORE SELLS IN
 * ===========================================================================
 * Each store chooses one currency (Settings › Store details › Country &
 * Currency, `store_settings.currency`, SQL part 176). Its whole catalog is
 * priced in it: products, options, compare-at prices, shipping rates, local
 * delivery, coupons and the cash on delivery fee. Its website shows those
 * prices, and its website checkout charges exactly that amount in exactly
 * that currency: a store in lei charges lei.
 *
 * Four currencies are kept apart, as Shopify keeps them:
 *
 *   selling currency   this file: what the store prices in and charges
 *   visitor currency   lib/markets: a converted estimate a website may show
 *                      a visitor from abroad; the charge stays in the
 *                      selling currency, and checkout says so
 *   payout currency    where the money lands (Stripe, Payouts); a separate
 *                      settlement, never the buyer's charge
 *   platform currency  Storelib's own (lib/payments/fees/currency-rules.ts),
 *                      what the marketplace, creator pages and the wallet
 *                      ledger use
 *
 * A store that never chose keeps the platform currency, so every store
 * that existed before this setting prices and charges exactly as it did.
 *
 * A store can sell only in a currency Storelib can really charge: one with
 * a fee rule (lib/payments/fees/currency-rules.ts) that Stripe takes for a
 * card payment, with two decimals, as prices are typed and kept in
 * hundredths. Anything else is refused when it is chosen, never at
 * checkout.
 *
 * Pure, so the settings, both checkouts, the server and the tests agree.
 */
import { CURRENCY_FEE_RULES, platformChargeCurrencyUpper } from "@/lib/payments/fees/currency-rules"
import { decimalsOf } from "@/lib/payments/money"

/** What a store can sell in, in the order the settings list them. */
export const SELLING_CURRENCIES = ["USD", "EUR", "GBP", "RON", "CAD", "AUD"] as const
export type SellingCurrency = (typeof SELLING_CURRENCIES)[number]

/**
 * Stripe's smallest card charge in each currency, in its minor units
 * (stripe.com/docs/currencies#minimum-and-maximum-charge-amounts). An order
 * below it cannot be paid by card; cash on delivery has no such floor.
 */
export const STRIPE_MINIMUM_MINOR: Record<SellingCurrency, number> = {
  USD: 50,
  EUR: 50,
  GBP: 30,
  RON: 200,
  CAD: 50,
  AUD: 50,
}

/**
 * A country's own currency, for the ones Storelib's merchants and buyers
 * come from most. A country missing here has no local currency Storelib
 * can sell in, and the store is offered the platform's.
 */
export const COUNTRY_CURRENCY: Record<string, string> = {
  US: "USD", PR: "USD", EC: "USD", SV: "USD", PA: "USD",
  GB: "GBP", IM: "GBP", JE: "GBP", GG: "GBP",
  RO: "RON",
  CA: "CAD",
  AU: "AUD",
  /* The euro area, and the countries that use the euro without being in it. */
  AT: "EUR", BE: "EUR", HR: "EUR", CY: "EUR", EE: "EUR", FI: "EUR", FR: "EUR", DE: "EUR", GR: "EUR", IE: "EUR",
  IT: "EUR", LV: "EUR", LT: "EUR", LU: "EUR", MT: "EUR", NL: "EUR", PT: "EUR", SK: "EUR", SI: "EUR", ES: "EUR",
  AD: "EUR", MC: "EUR", SM: "EUR", VA: "EUR", ME: "EUR", XK: "EUR",
  /* Their own currencies, which Storelib cannot charge yet. */
  MD: "MDL", BG: "BGN", HU: "HUF", PL: "PLN", CZ: "CZK", DK: "DKK", SE: "SEK", NO: "NOK", CH: "CHF", RS: "RSD",
  UA: "UAH", TR: "TRY", NZ: "NZD", JP: "JPY", IN: "INR", BR: "BRL", MX: "MXN", ZA: "ZAR", SG: "SGD", AE: "AED",
}

/** "RON", or null for an unreadable code. */
export function currencyCodeOf(raw: unknown): string | null {
  const code = typeof raw === "string" ? raw.trim().toUpperCase() : ""
  return /^[A-Z]{3}$/.test(code) ? code : null
}

export function isSellingCurrency(raw: unknown): raw is SellingCurrency {
  const code = currencyCodeOf(raw)
  return !!code && (SELLING_CURRENCIES as readonly string[]).includes(code)
}

export type SellCheck = { ok: true; currency: SellingCurrency } | { ok: false; currency: string | null; reason: string }

/**
 * Whether a store can sell in this currency: Storelib has a fee rule for
 * it, Stripe takes card payments in it, and it has two decimals. The
 * reason is a sentence the settings show before anything is saved.
 */
export function canSellIn(raw: unknown): SellCheck {
  const code = currencyCodeOf(raw)
  if (!code) return { ok: false, currency: null, reason: "Choose a currency from the list." }
  if (!isSellingCurrency(code) || !CURRENCY_FEE_RULES[code]) {
    return { ok: false, currency: code, reason: `Card payments in ${code} aren't available on Storelib yet. Choose one of ${SELLING_CURRENCIES.join(", ")}.` }
  }
  if (decimalsOf(code) !== 2) return { ok: false, currency: code, reason: `${code} has no cents, and Storelib keeps prices in cents.` }
  return { ok: true, currency: code }
}

/** The platform's own currency, which every store sells in until it chooses another. */
export function platformSellingCurrency(): SellingCurrency {
  const code = platformChargeCurrencyUpper()
  return isSellingCurrency(code) ? code : "USD"
}

/** The currency a store sells in: its own choice when it can sell in it, else the platform's. */
export function sellingCurrencyOf(stored: unknown): SellingCurrency {
  const check = canSellIn(stored)
  return check.ok ? check.currency : platformSellingCurrency()
}

/** The currency a store based in this country would normally sell in: its local one when Storelib can charge it. */
export function suggestedCurrencyFor(country: unknown): SellingCurrency {
  const cc = typeof country === "string" ? country.trim().toUpperCase() : ""
  const local = COUNTRY_CURRENCY[cc]
  return local && isSellingCurrency(local) ? local : platformSellingCurrency()
}

/** The local currency of a country when Storelib cannot sell in it ("PLN"), for the one line that says so. */
export function unsupportedLocalCurrency(country: unknown): string | null {
  const cc = typeof country === "string" ? country.trim().toUpperCase() : ""
  const local = COUNTRY_CURRENCY[cc]
  return local && !isSellingCurrency(local) ? local : null
}

/** Stripe's smallest card charge in this currency, in minor units. */
export function minimumChargeMinor(currency: unknown): number {
  const code = currencyCodeOf(currency)
  return code && isSellingCurrency(code) ? STRIPE_MINIMUM_MINOR[code] : 50
}

/** "Romanian leu (RON)", in English, for the settings list. */
export function currencyLabel(code: string, locale = "en"): string {
  try {
    const name = new Intl.DisplayNames([locale, "en"], { type: "currency" }).of(code)
    return name && name !== code ? `${name.charAt(0).toUpperCase()}${name.slice(1)} (${code})` : code
  } catch {
    return code
  }
}
