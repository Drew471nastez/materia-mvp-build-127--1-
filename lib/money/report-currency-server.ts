import "server-only"

/**
 * The store's orders in the store's currency, for a report to add up
 * (lib/money/report-currency): the rates read only when some order is in
 * another currency, and only for the days the orders cover.
 */
import { dayRatesBetween } from "@/lib/markets/fx-server"
import { readStoreCurrency } from "@/lib/store/selling-currency-read"
import { daySpan, inReportingCurrency, needsConversion, type ReportConversion, type ReportMoneyRow } from "./report-currency"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

export interface StoreCurrencyReport<T> extends ReportConversion<T> {
  /** The store's currency, upper case: what every amount in `rows` is now in. */
  currency: string
}

/** `rows` in the store's currency (given, or read), each converted at its own day's ECB rate. */
export async function inStoreCurrency<T extends ReportMoneyRow>(db: Db, creatorId: string, rows: T[], storeCurrency?: string | null): Promise<StoreCurrencyReport<T>> {
  const currency = (storeCurrency || (await readStoreCurrency(db, creatorId)).currency).toUpperCase()
  if (!needsConversion(rows, currency)) {
    const unknown = rows.filter((r) => !(typeof r.currency === "string" && /^[a-z]{3}$/i.test(r.currency.trim()))).length
    return { rows, converted: 0, unconverted: 0, unknown, currency }
  }
  const span = daySpan(rows)
  const days = span ? await dayRatesBetween(span.from, span.to) : []
  return { ...inReportingCurrency(rows, currency, days), currency }
}

/**
 * Whether the creator has any order recorded in a currency other than the
 * store's. Only then is a total worked out order by order; otherwise the
 * database's own count (analytics_all_time), which adds cents as they are,
 * is exactly right and stays the fast path. Unreadable: false, as before.
 */
export async function hasOrdersInOtherCurrency(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  scoped: (columns: string) => any,
  storeCurrency: string,
): Promise<boolean> {
  try {
    const { data, error } = await scoped("id").not("currency", "is", null).not("currency", "ilike", storeCurrency.toLowerCase()).limit(1)
    if (error) return false
    return Array.isArray(data) && data.length > 0
  } catch {
    return false
  }
}
