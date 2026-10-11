"use client"

/**
 * The store's currency for every price field under it (./currency.ts). The
 * product editor provides it from what its server page read; a field with no
 * provider above it shows US dollars, as it always did.
 */
import * as React from "react"
import { DEFAULT_STORE_CURRENCY, currencyMark, markInset, type CurrencyMark } from "./currency"

const StoreCurrency = React.createContext<string>(DEFAULT_STORE_CURRENCY)

export function StoreCurrencyProvider({ currency, children }: { currency: string | null | undefined; children: React.ReactNode }) {
  return <StoreCurrency.Provider value={currencyMark(currency).code}>{children}</StoreCurrency.Provider>
}

export function useStoreCurrency(): string {
  return React.useContext(StoreCurrency)
}

/**
 * The mark inside a price field, and the padding the input needs so the
 * number never runs under it: `<input style={pad}>` beside `{mark}`.
 */
export function useMoneyMark(className = "text-[14px] text-[#9ca3af]"): { mark: CurrencyMark; node: React.ReactNode; pad: React.CSSProperties } {
  const code = useStoreCurrency()
  return React.useMemo(() => {
    const mark = currencyMark(code)
    const inset = markInset(code)
    const side = mark.position === "prefix" ? "left-3" : "right-3"
    return {
      mark,
      node: (
        <span aria-hidden data-currency-mark={mark.code} className={`pointer-events-none absolute top-1/2 -translate-y-1/2 ${side} ${className}`}>
          {mark.symbol}
        </span>
      ),
      pad: mark.position === "prefix" ? { paddingLeft: inset } : { paddingRight: inset },
    }
  }, [code, className])
}
