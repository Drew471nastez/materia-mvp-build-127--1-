/**
 * ===========================================================================
 *  A PLATFORM PRICE, WRITTEN IN ITS OWN CURRENCY, NEVER CONVERTED
 * ===========================================================================
 * This file used to hold a static table of exchange rates (1 USD = 4.6 RON,
 * 0.92 EUR...) and turned every marketplace price into lei with it, so a
 * number could be shown in a currency nobody was charged in, at a rate
 * nobody published. It is gone (currency round AM). Real conversions use the
 * European Central Bank's published rates (lib/markets/fx-server), and only
 * where a price really is shown or charged in another currency
 * (lib/money/marketplace for the marketplace's US dollars, lib/money/
 * report-currency for reports).
 *
 * What is left: an amount in minor units, written in the currency it is in
 * (the page's store currency when one is set, else the platform's).
 */
import { SHOP_CURRENCY, shopMoneyIn } from "@/lib/store/shop-money"

export type CurrencyCode = "USD" | "EUR" | "GBP" | "RON" | "CAD" | "AUD"

/** `cents` in `from` (the store's currency, when the page has one), else the platform's; never converted. */
export function formatPlatformMoney(cents: number, from?: string | null): string {
  const currency = typeof from === "string" && /^[a-z]{3}$/i.test(from.trim()) ? from.trim().toUpperCase() : SHOP_CURRENCY
  return shopMoneyIn(cents || 0, currency, { grouping: true })
}
