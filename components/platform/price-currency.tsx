"use client"

/**
 * The currency a page's prices are in, when the page is one store's: its
 * product page, its creator page, its OnePage. A product's `price_cents` is
 * in its store's currency (lib/store/selling-currency), so the native pages
 * that draw it are told which, once, here, and every price inside reads it:
 * a lei store's 49 is 49 lei, never $49.
 *
 * Nothing set: the platform's currency, as every price was before. It only
 * says what a number is in. What a visitor sees it as (the marketplace's own
 * display preference, components/locale-provider) is unchanged.
 */
import { createContext, useCallback, useContext, type ReactNode } from "react"
import { SHOP_CURRENCY, shopMoneyIn } from "@/lib/store/shop-money"
import { useStoreCurrencyIfSet } from "@/lib/store/currency-context"

const Ctx = createContext<string | null>(null)

export function PriceCurrency({ currency, children }: { currency: string | null | undefined; children: ReactNode }) {
  return <Ctx.Provider value={currency || null}>{children}</Ctx.Provider>
}

/** The page's store currency, or null when no page set one. */
export function usePageCurrency(): string | null {
  return useContext(Ctx)
}

/** The currency this page's prices are in: the store's, else the platform's. */
export function usePriceCurrency(): string {
  return useContext(Ctx) ?? SHOP_CURRENCY
}

/** shopMoney in this page's store currency: "49 lei" on a lei store's page, "$49.00" elsewhere. */
export function usePageMoney(): (cents: number, opts?: { grouping?: boolean }) => string {
  const currency = usePriceCurrency()
  return (cents, opts) => shopMoneyIn(cents, currency, opts)
}

/**
 * The currency of the store whose prices these are, wherever they are drawn:
 * on its own public page (PriceCurrency), in its dashboard (/app's
 * LiveStoreCurrency, from Settings › Store details), else the platform's.
 * For what is drawn in both places, a product picker, an offer, a buy box:
 * a lei store's 49 is "49.00 lei" in its editor and on its page alike.
 */
export function useSellerCurrency(): string {
  const page = useContext(Ctx)
  const store = useStoreCurrencyIfSet()
  return page ?? store ?? SHOP_CURRENCY
}

/** shopMoney in useSellerCurrency's currency. */
export function useSellerMoney(): (cents: number, opts?: { grouping?: boolean }) => string {
  const currency = useSellerCurrency()
  return useCallback((cents: number, opts?: { grouping?: boolean }) => shopMoneyIn(cents, currency, opts), [currency])
}
