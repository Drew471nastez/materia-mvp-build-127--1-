/*
  THE STORE CURRENCY THE OPEN APP IS SHOWING, on its own, so the currency
  context (lib/store/currency-context.tsx, under LocaleProvider in the root
  layout) can note it without importing Analytics' cache. Through that one
  import every page, a creator's published website included, loaded the
  Analytics cache, its date ranges, its time zones and its number formats
  (46KB of source) before its first tap. ./report-cache.ts reads it from here.
*/
let notedCurrency = ""

/** Settings told the app the store's currency (lib/store/currency-context). The prefetch uses it so its question matches the page. */
export function noteStoreCurrency(code: string) {
  const currency = code.trim().toUpperCase()
  if (/^[A-Z]{3}$/.test(currency)) notedCurrency = currency
}

export function notedStoreCurrency(): string {
  return notedCurrency
}
