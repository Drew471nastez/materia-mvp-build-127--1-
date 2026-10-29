/**
 * Orders with no currency recorded, given the store's currency on the day
 * they were placed (lib/store/currency-at.ts). Read only when some row has
 * none. A database without the changes table (SQL part 176) or a read that
 * fails: the store's currency now.
 *
 * ONCE PER REQUEST, AND BOTH AT ONCE. The Orders page asks this for its page
 * of rows, its figures and its tabs, and the figures ask the store's
 * currency again: store_settings was read three times and
 * store_currency_changes twice, one after the other, before the page could
 * be drawn (scripts/measure-speed18.mjs, app-orders). Within one render the
 * two reads are now made once per database client and store, side by side,
 * and every later ask shares the answer. React's `cache` lives for one
 * request only, so nothing is kept between requests or between people; a
 * route handler, where it remembers nothing, reads as before.
 */
import { cache } from "react"
import { readStoreCurrency, type StoreCurrency } from "./selling-currency-read"
import { anyWithoutCurrency, currencyAtFrom, fillCurrency, type CurrencyChange } from "./currency-at"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

/* One table of answers per request, keyed by the client and then the store: a read through another client is its own read. */
const answers = cache(() => new WeakMap<object, Map<string, Promise<unknown>>>())

function once<T>(db: Db, key: string, read: () => Promise<T>): Promise<T> {
  if (!db || typeof db !== "object") return read()
  const table = answers()
  let byKey = table.get(db)
  if (!byKey) {
    byKey = new Map()
    table.set(db, byKey)
  }
  const had = byKey.get(key) as Promise<T> | undefined
  if (had) return had
  const fresh = read()
  byKey.set(key, fresh)
  return fresh
}

/** The store's currency (./selling-currency-read), read once per request for this client. */
export function storeCurrencyOnce(db: Db, creatorId: string): Promise<StoreCurrency> {
  return once(db, `currency:${creatorId}`, () => readStoreCurrency(db, creatorId))
}

/** The store's currency changes, oldest first, read once per request for this client; none when they cannot be read. */
export function currencyChangesOnce(db: Db, creatorId: string): Promise<CurrencyChange[]> {
  return once(db, `changes:${creatorId}`, async () => {
    try {
      const { data, error } = await db
        .from("store_currency_changes")
        .select("created_at, from_currency, to_currency, previous_currency, restored_at")
        .eq("creator_id", creatorId)
        .order("created_at", { ascending: true })
        .limit(500)
      if (!error && Array.isArray(data)) return data as CurrencyChange[]
    } catch {
      /* the store's currency now, for every one */
    }
    return []
  })
}

export async function withOrderCurrency<T extends { currency?: unknown; created_at?: unknown }>(db: Db, creatorId: string, rows: T[], storeCurrency?: string | null): Promise<T[]> {
  if (!creatorId || !anyWithoutCurrency(rows)) return rows
  const [now, changes] = await Promise.all([
    storeCurrency ? Promise.resolve(storeCurrency) : storeCurrencyOnce(db, creatorId).then((s) => s.currency as string),
    currencyChangesOnce(db, creatorId),
  ])
  return fillCurrency(rows, currencyAtFrom(now, changes))
}
