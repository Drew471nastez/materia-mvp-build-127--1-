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

const plain = new Intl.NumberFormat("en-US", { style: "currency", currency: SHOP_CURRENCY, minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: false })
const grouped = new Intl.NumberFormat("en-US", { style: "currency", currency: SHOP_CURRENCY, minimumFractionDigits: 2, maximumFractionDigits: 2 })
const whole = new Intl.NumberFormat("en-US", { style: "currency", currency: SHOP_CURRENCY, minimumFractionDigits: 0, maximumFractionDigits: 2 })

/**
 * A store price as a website writes it: "$48.00" on a dollar deployment,
 * exactly as cards always printed it, "RON 48.00" on a lei one. `grouping`
 * for the product page's "$1,250.00".
 */
export function shopMoney(cents: number, opts: { grouping?: boolean } = {}): string {
  const v = (Number.isFinite(cents) ? cents : 0) / 100
  return (opts.grouping ? grouped : plain).format(v)
}

/** A whole amount a buyer typed in a filter ("$10", "RON 10"). */
export function shopAmount(units: number): string {
  return whole.format(units)
}
