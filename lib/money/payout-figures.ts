import "server-only"

/**
 * The money figures Payouts draws next to Stripe's balance, each in one
 * currency (lib/money/report-currency), read the same way by the page
 * (app/app/payouts/page.tsx) and its refresh (api/stripe/payouts):
 *
 *   1099-K years   in US dollars, because the form and its $20,000 line are
 *                  American: each sale converted at its own day's rate, so a
 *                  lei store is never measured against dollars with lei cents
 *   disputed       in the store's currency, like every other report
 *
 * A sale no rate converts still counts as a transaction; its money is left
 * out and counted in `unconverted`, never added at a guess.
 */
import { inStoreCurrency } from "./report-currency-server"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

export interface TaxYear {
  year: number
  grossCents: number
  transactionCount: number
  isEligible: boolean
}

/** The 1099-K line: $20,000 and 200 transactions in a calendar year. */
export const K1099_GROSS_USD_CENTS = 2_000_000
export const K1099_TRANSACTIONS = 200

interface SaleRow {
  amount_cents: number | null
  created_at: string
  currency?: string | null
}

export async function taxYearsInUsd(db: Db, creatorId: string, rows: SaleRow[], currentYear: number): Promise<{ currentYear: TaxYear; previousYear: TaxYear; unconverted: number }> {
  const years = {
    currentYear: { year: currentYear, grossCents: 0, transactionCount: 0, isEligible: false },
    previousYear: { year: currentYear - 1, grossCents: 0, transactionCount: 0, isEligible: false },
  }
  const bucketOf = (at: string) => {
    const y = new Date(at).getUTCFullYear()
    return y === currentYear ? years.currentYear : y === currentYear - 1 ? years.previousYear : null
  }
  for (const r of rows) {
    const b = bucketOf(r.created_at)
    if (b) b.transactionCount += 1
  }
  const usd = await inStoreCurrency(db, creatorId, rows, "USD")
  for (const r of usd.rows) {
    const b = bucketOf(r.created_at)
    if (b) b.grossCents += r.amount_cents || 0
  }
  for (const y of [years.currentYear, years.previousYear]) {
    y.isEligible = y.grossCents >= K1099_GROSS_USD_CENTS && y.transactionCount >= K1099_TRANSACTIONS
  }
  return { ...years, unconverted: usd.unconverted }
}

/** What open disputes hold, in the store's currency (lower case). */
export async function disputedInStore(db: Db, creatorId: string, rows: SaleRow[], storeCurrency?: string | null): Promise<{ count: number; amountCents: number; currency: string }> {
  const inStore = await inStoreCurrency(db, creatorId, rows, storeCurrency)
  return { count: rows.length, amountCents: inStore.rows.reduce((s, o) => s + (o.amount_cents || 0), 0), currency: inStore.currency.toLowerCase() }
}
