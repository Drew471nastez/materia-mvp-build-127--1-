"use client"

/**
 * The currency a page's prices are in, said once at the top of the page so
 * every price inside reads the same answer.
 *
 * Which answer belongs to which page is lib/pricing/surface-currency: a
 * creator's own website is in the currency their store chose, and Storelib's
 * own pages (Explore, /u, /p, /l, communities) are in STORELIB_CURRENCY
 * whatever any store chose. Nothing set: Storelib's, because a page that
 * never said is Storelib's.
 *
 * It only says what a number is in. What a visitor sees it as (the
 * marketplace's own display preference, components/locale-provider) is
 * unchanged, and no amount is converted here.
 */
import { createContext, useContext, type ReactNode } from "react"
import { shopMoneyIn } from "@/lib/store/shop-money"
import { STORELIB_CURRENCY } from "@/lib/pricing/surface-currency"

const Ctx = createContext<string | null>(null)

export function PriceCurrency({ currency, children }: { currency: string | null | undefined; children: ReactNode }) {
  return <Ctx.Provider value={currency || null}>{children}</Ctx.Provider>
}

/** The page's store currency, or null when no page set one. */
export function usePageCurrency(): string | null {
  return useContext(Ctx)
}

/** The currency this page's prices are in: the store's on a storefront, else Storelib's. */
export function usePriceCurrency(): string {
  return useContext(Ctx) ?? STORELIB_CURRENCY
}

/** An amount in this page's currency: "49.00 lei" on a lei store's website, "$49.00" on Storelib's own pages. */
export function usePageMoney(): (cents: number, opts?: { grouping?: boolean }) => string {
  const currency = usePriceCurrency()
  return (cents, opts) => shopMoneyIn(cents, currency, opts)
}
