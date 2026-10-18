"use client"

/**
 * The store's currency for every price field under it (./currency.ts). The
 * product editor provides it from what its server page read; a field with no
 * provider above it shows US dollars, as it always did.
 */
import * as React from "react"
import { DEFAULT_STORE_CURRENCY, currencyMark, markInset, type CurrencyMark } from "./currency"

const StoreCurrency = React.createContext<string | null>(null)

export function StoreCurrencyProvider({ currency, children }: { currency: string | null | undefined; children: React.ReactNode }) {
  return <StoreCurrency.Provider value={currencyMark(currency).code}>{children}</StoreCurrency.Provider>
}

/** The event Settings › Country & Currency sends when the store's currency changes, so every price field under /app follows at once. */
export const STORE_CURRENCY_EVENT = "storelib:store-currency"

/** StoreCurrencyProvider for the whole of /app (app/app/layout.tsx): from the server's read, then from the setting as it is changed. */
export function LiveStoreCurrency({ currency, children }: { currency: string | null | undefined; children: React.ReactNode }) {
  const [now, setNow] = React.useState(currency)
  React.useEffect(() => setNow(currency), [currency])
  /* The server could not say (the app restoring its session, a slow read): asked here, so a lei store's fields never fall back to dollars. */
  React.useEffect(() => {
    if (currency) return
    let live = true
    fetch("/api/store/currency", { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { currency?: unknown } | null) => {
        if (live && typeof d?.currency === "string" && /^[A-Z]{3}$/.test(d.currency)) setNow(d.currency)
      })
      .catch(() => {})
    return () => {
      live = false
    }
  }, [currency])
  React.useEffect(() => {
    const on = (e: Event) => {
      const next = (e as CustomEvent<string>).detail
      if (typeof next === "string" && /^[A-Z]{3}$/.test(next)) setNow(next)
    }
    window.addEventListener(STORE_CURRENCY_EVENT, on)
    return () => window.removeEventListener(STORE_CURRENCY_EVENT, on)
  }, [])
  return <StoreCurrencyProvider currency={now}>{children}</StoreCurrencyProvider>
}

export function useStoreCurrency(): string {
  return React.useContext(StoreCurrency) ?? DEFAULT_STORE_CURRENCY
}

/** The store's currency when a provider above says it (all of /app does), else null: a public page reads its own (components/platform/price-currency). */
export function useStoreCurrencyIfSet(): string | null {
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
