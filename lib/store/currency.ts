/**
 * ===========================================================================
 *  THE STORE'S CURRENCY, AS THE PRODUCT EDITOR WRITES PRICES IN IT
 * ===========================================================================
 * Prices are typed as amounts with two decimals and saved as hundredths
 * (`price_cents`), whatever the currency. This file only decides how a
 * price field and a price label look for the store's currency: which mark,
 * and on which side of the number.
 *
 *   USD  $25.00      EUR  €25.00      GBP  £25.00      CAD  CA$25.00
 *   RON  25.00 lei   SEK  25.00 kr    CHF  25.00 CHF   PLN  25.00 zł
 *
 * The store's currency is the one Settings keeps on the creator
 * (`creators.payout_currency`), the same one the Taxes tab and the customer
 * email previews already name (app/api/store/taxes, app/api/store/emails).
 * Anything unreadable is US dollars, which is what every field showed before.
 *
 * Pure, so the editor, its physical cards and tests read it the same way.
 */
import { currencyWord } from "@/lib/markets/money"

export const DEFAULT_STORE_CURRENCY = "USD"

/** A three letter ISO code in capitals, or USD for anything else. */
export function storeCurrencyOf(raw: unknown): string {
  const code = typeof raw === "string" ? raw.trim().toUpperCase() : ""
  if (!/^[A-Z]{3}$/.test(code)) return DEFAULT_STORE_CURRENCY
  try {
    new Intl.NumberFormat("en-US", { style: "currency", currency: code })
    return code
  } catch {
    return DEFAULT_STORE_CURRENCY
  }
}

export interface CurrencyMark {
  code: string
  /** "$", "€", "CA$", "lei", "kr"... */
  symbol: string
  /** Before the number ($25.00) or after it (25.00 lei). */
  position: "prefix" | "suffix"
  /** 2 for most, 0 for yen and forint. */
  decimals: number
}

const marks = new Map<string, CurrencyMark>()

/** How the currency's mark sits beside a price. */
export function currencyMark(raw: unknown): CurrencyMark {
  const code = storeCurrencyOf(raw)
  const hit = marks.get(code)
  if (hit) return hit
  let symbol = code
  let position: CurrencyMark["position"] = "suffix"
  let decimals = 2
  try {
    const wide = new Intl.NumberFormat("en-US", { style: "currency", currency: code })
    decimals = wide.resolvedOptions().maximumFractionDigits ?? 2
    const parts = wide.formatToParts(1)
    const sym = parts.find((p) => p.type === "currency")?.value ?? code
    if (!/^[A-Za-z]+$/.test(sym)) {
      /* A sign ($, €, £, CA$): before the number, as English writes it. */
      symbol = sym
      position = parts.findIndex((p) => p.type === "currency") < parts.findIndex((p) => p.type === "integer") ? "prefix" : "suffix"
    } else {
      /* A code (RON, SEK): its short local word after the number (lei, kr), which is how those prices are written. */
      symbol = currencyWord(code) ?? code
      position = "suffix"
    }
  } catch {
    /* Kept as the code, after the number. */
  }
  const mark = { code, symbol, position, decimals }
  marks.set(code, mark)
  return mark
}

/** 2500 → "$25.00", "25.00 lei", "¥25". Hundredths in, as every price is stored. */
export function formatStoreMoney(cents: number, raw: unknown): string {
  const m = currencyMark(raw)
  const n = Number.isFinite(cents) ? cents / 100 : 0
  const amount = n.toLocaleString("en-US", { minimumFractionDigits: m.decimals, maximumFractionDigits: m.decimals })
  return m.position === "prefix" ? `${m.symbol}${amount}` : `${amount} ${m.symbol}`
}

/** What an empty price field shows: "0.00", or "0" for a currency without decimals. */
export function moneyPlaceholder(raw: unknown): string {
  return currencyMark(raw).decimals === 0 ? "0" : "0.00"
}

/**
 * The room a price field leaves for the mark, in pixels from the field's
 * edge: 12px of the field's own padding, then the mark, then a gap. Measured
 * by characters (14px Inter is about 8px a character), so CA$ gets more
 * room than $ and nothing overlaps the number.
 */
export function markInset(raw: unknown): number {
  const m = currencyMark(raw)
  return 12 + Math.ceil(m.symbol.length * 8) + (m.position === "prefix" ? 4 : 8)
}
