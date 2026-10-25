/**
 * Orders with no currency recorded, given the store's currency on the day
 * they were placed (lib/store/currency-at.ts). Read only when some row has
 * none; the changes are read once per call. A database without the changes
 * table (SQL part 176) or a read that fails: the store's currency now.
 */
import { readStoreCurrency } from "./selling-currency-read"
import { anyWithoutCurrency, currencyAtFrom, fillCurrency, type CurrencyChange } from "./currency-at"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

export async function withOrderCurrency<T extends { currency?: unknown; created_at?: unknown }>(db: Db, creatorId: string, rows: T[], storeCurrency?: string | null): Promise<T[]> {
  if (!creatorId || !anyWithoutCurrency(rows)) return rows
  const now = storeCurrency || (await readStoreCurrency(db, creatorId)).currency
  let changes: CurrencyChange[] = []
  try {
    const { data, error } = await db
      .from("store_currency_changes")
      .select("created_at, from_currency, to_currency, previous_currency, restored_at")
      .eq("creator_id", creatorId)
      .order("created_at", { ascending: true })
      .limit(500)
    if (!error && Array.isArray(data)) changes = data as CurrencyChange[]
  } catch {
    /* the store's currency now, for every one */
  }
  return fillCurrency(rows, currencyAtFrom(now, changes))
}
