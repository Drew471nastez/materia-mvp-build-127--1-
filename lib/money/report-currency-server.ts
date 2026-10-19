import "server-only"

/**
 * The store's orders in the store's currency, for a report to add up
 * (lib/money/report-currency): the rates read only when some order is in
 * another currency, and only for the days the orders cover.
 */
import { dayRatesBetween, keptDays, refreshHistory } from "@/lib/markets/fx-server"
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
  let days = span ? await dayRatesBetween(span.from, span.to) : []
  let out = inReportingCurrency(rows, currency, days)
  /*
    A sale whose day has no kept rate was left out (never guessed), so a store
    that changed currency saw "no revenue" for its older sales whenever the
    daily rate job had not filled the history yet. Fetch the ECB's own
    history once (this server, at most every 6 hours) and convert again.
  */
  if (out.unconverted > 0 && span && (await fillHistoryOnce(span.from))) {
    days = await dayRatesBetween(span.from, span.to)
    out = inReportingCurrency(rows, currency, days)
  }
  return { ...out, currency }
}

let historyTriedAt = 0
/** The ECB history behind a report, fetched at most once every 6 hours per server: the last 90 days, or every day since 1999 for older sales. */
async function fillHistoryOnce(from: string): Promise<boolean> {
  if (Date.now() - historyTriedAt < 6 * 3_600_000) return false
  historyTriedAt = Date.now()
  const older = Date.parse(`${from}T00:00:00Z`) < Date.now() - 85 * 86_400_000
  const r = await refreshHistory(undefined, { full: older || (await keptDays()) < 250 })
  return r.ok && (r.added ?? 0) > 0
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
