/**
 * ===========================================================================
 *  AN ORDER WITH NO CURRENCY IS IN WHAT THE STORE SOLD IN THAT DAY
 * ===========================================================================
 * Orders from before orders kept their currency have none. Analytics read
 * them as the store's currency and Orders as the platform's (dollars), so a
 * lei store's old sale was "25.00 lei" in one and "$25.00" in the other.
 *
 * Both now read it the same way: the currency the store sold in when the
 * order was placed, from its currency changes (store_currency_changes, each
 * change and each undo with its time), else the store's currency now. A
 * store that never changed currency gets its currency now for every one.
 *
 * Pure: lib/store/currency-at-server.ts reads the changes and fills rows.
 */

/** One change of the store's currency as store_currency_changes keeps it. */
export interface CurrencyChange {
  created_at: string
  from_currency: string
  to_currency: string
  previous_currency?: string | null
  restored_at?: string | null
}

const code = (v: unknown): string | null => {
  const c = typeof v === "string" ? v.trim().toUpperCase() : ""
  return /^[A-Z]{3}$/.test(c) ? c : null
}

/**
 * The store's currency at any moment: start from what it sells in now and
 * step back over every change (and undo) made after that moment.
 */
export function currencyAtFrom(now: string, changes: CurrencyChange[]): (at: unknown) => string {
  const current = code(now) ?? "USD"
  /* Each step: when it happened, and the currency before it. */
  const steps: { t: number; before: string }[] = []
  for (const c of changes) {
    const t = Date.parse(c.created_at)
    const from = code(c.from_currency)
    const to = code(c.to_currency)
    if (Number.isFinite(t) && from) steps.push({ t, before: from })
    const back = c.restored_at ? Date.parse(c.restored_at) : NaN
    if (Number.isFinite(back) && to) steps.push({ t: back, before: to })
  }
  steps.sort((a, b) => b.t - a.t)
  return (at: unknown) => {
    const t = typeof at === "string" || typeof at === "number" ? new Date(at).getTime() : NaN
    if (!Number.isFinite(t)) return current
    let currency = current
    for (const s of steps) {
      if (s.t <= t) break
      currency = s.before
    }
    return currency
  }
}

/** Rows with no currency recorded, given the store's currency on their own day; the others as they are. Copies, never the rows given. */
export function fillCurrency<T extends { currency?: unknown; created_at?: unknown }>(rows: T[], at: (createdAt: unknown) => string): T[] {
  return rows.map((r) => (code(r.currency) ? r : { ...r, currency: at(r.created_at) }))
}

/** Whether any row has no currency recorded. */
export function anyWithoutCurrency(rows: Array<{ currency?: unknown }>): boolean {
  return rows.some((r) => !code(r.currency))
}
