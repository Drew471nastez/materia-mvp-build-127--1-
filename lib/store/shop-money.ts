/**
 * ===========================================================================
 *  THE CURRENCY A STORE'S PRICES ARE IN, AND HOW A WEBSITE WRITES THEM
 * ===========================================================================
 * A price is typed as an amount and kept as hundredths (`price_cents`), and
 * checkout charges exactly that number in the platform's charge currency
 * (lib/payments/fees/currency-rules platformChargeCurrency, lei unless the
 * deployment says dollars: lib/checkout/currency.ts explains why). So that is
 * the currency every price is in: the base a market converts from, the code
 * a website's cards and product page print, the one search engines are told.
 *
 * It is not the payout currency (creators.payout_currency), which is where
 * the money goes and can be anything; it used to be read as the base, and a
 * website both said "$" over lei and converted lei as if they were dollars.
 *
 * Pure, so the server, the website's own scripts and the tests agree.
 */
import { platformChargeCurrencyUpper } from "@/lib/payments/fees/currency-rules"

/** "RON", or "USD" on a deployment that charges in dollars. */
export const SHOP_CURRENCY = platformChargeCurrencyUpper()

/* One set of formats a currency, made once: the platform's, and each store currency a website asks for. */
const formats = new Map<string, { plain: Intl.NumberFormat; grouped: Intl.NumberFormat; whole: Intl.NumberFormat }>()
function formatsOf(currency: string) {
  const code = /^[A-Z]{3}$/.test(currency) ? currency : SHOP_CURRENCY
  let f = formats.get(code)
  if (!f) {
    f = {
      plain: new Intl.NumberFormat("en-US", { style: "currency", currency: code, minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: false }),
      grouped: new Intl.NumberFormat("en-US", { style: "currency", currency: code, minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      whole: new Intl.NumberFormat("en-US", { style: "currency", currency: code, minimumFractionDigits: 0, maximumFractionDigits: 2 }),
    }
    formats.set(code, f)
  }
  return f
}

/**
 * A store price as a website writes it: "$48.00" on a dollar deployment,
 * exactly as cards always printed it, "RON 48.00" on a lei one. `grouping`
 * for the product page's "$1,250.00".
 */
export function shopMoney(cents: number, opts: { grouping?: boolean } = {}): string {
  return shopMoneyIn(cents, SHOP_CURRENCY, opts)
}

/**
 * A price in a store's own currency (lib/store/selling-currency), written the
 * same way: "RON 48.00", "€48.00". A store that never chose one sells in
 * the platform's, so this is shopMoney for it.
 */
export function shopMoneyIn(cents: number, currency: string, opts: { grouping?: boolean } = {}): string {
  const v = (Number.isFinite(cents) ? cents : 0) / 100
  const f = formatsOf(currency.toUpperCase())
  return (opts.grouping ? f.grouped : f.plain).format(v)
}

/** A whole amount a buyer typed in a filter ("$10", "RON 10"). */
export function shopAmount(units: number): string {
  return shopAmountIn(units, SHOP_CURRENCY)
}

/** shopAmount in a store's own currency. */
export function shopAmountIn(units: number, currency: string): string {
  return formatsOf(currency.toUpperCase()).whole.format(units)
}
