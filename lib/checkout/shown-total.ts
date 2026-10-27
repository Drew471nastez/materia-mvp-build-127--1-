/**
 * ===========================================================================
 *  NEVER CHARGED AN AMOUNT THE BUYER DID NOT SEE
 * ===========================================================================
 * A website's checkout prices the cart when the page asks (the quote) and
 * again when Pay makes the payment (app/api/checkout/site, intent): the
 * market, its exchange rate, the code and the stock are all read fresh then.
 * Between the two the day's rate can move, or the country cookie change, and
 * the card was charged the new figure while the page still showed the old
 * one. The page now sends the total it showed, and the payment is only made
 * when what would be charged is that total in that currency. Otherwise the
 * buyer is told the new total and the page prices itself again.
 *
 * Pure: tests/orders-ad2.test.ts runs it.
 */

export interface ShownTotal {
  cents: number
  currency: string
}

/** The total a page says it showed, or null when it sent none or one that cannot be read. Paying with none is refused (app/api/checkout/site intent): a tab opened before a deploy is asked to refresh, and prices itself again. */
export function shownTotalOf(value: unknown): ShownTotal | null {
  if (!value || typeof value !== "object") return null
  const v = value as { cents?: unknown; currency?: unknown }
  if (typeof v.cents !== "number" || !Number.isSafeInteger(v.cents) || v.cents < 0) return null
  if (typeof v.currency !== "string" || !/^[A-Za-z]{3}$/.test(v.currency)) return null
  return { cents: v.cents, currency: v.currency.toUpperCase() }
}

/** Whether charging `cents` in `currency` would be something other than what the page showed. */
export function differsFromShown(shown: ShownTotal | null, cents: number, currency: string): boolean {
  if (!shown) return false
  return shown.cents !== Math.round(cents) || shown.currency !== String(currency || "").toUpperCase()
}

/** The code the route answers with, which the page reads to price itself again. */
export const TOTAL_CHANGED = "total_changed"
