/**
 * A store's selling currency, read with whatever database client the caller
 * has (lib/store/selling-currency-server.ts caches it for pages). Kept apart
 * from the server-only module so code that runs in both places, such as the
 * website's product cards (lib/website-builder/shop-products.ts), can read it.
 *
 * Everything that charges, quotes a total or writes an order reads this,
 * straight from the database, so a change is never charged at the old
 * currency. A database without SQL part 176, a store that never chose and
 * anything unreadable all sell in the platform's currency, as every store did.
 */
import { sellingCurrencyOf, type SellingCurrency } from "./selling-currency"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

export interface StoreCurrency {
  /** What the store prices in and charges. */
  currency: SellingCurrency
  /** What it chose, or null while it sells in the platform's currency without having chosen. */
  chosen: string | null
  /** Where it is based (Store details), or null. */
  country: string | null
  /** False until SQL part 176 has run: the setting cannot be saved yet. */
  ready: boolean
}

const MISSING = new Set(["42703", "PGRST204", "42P01", "PGRST205"])

export async function readStoreCurrency(db: Db, creatorId: string | null | undefined): Promise<StoreCurrency> {
  if (!creatorId) return { currency: sellingCurrencyOf(null), chosen: null, country: null, ready: true }
  try {
    const { data, error } = await db.from("store_settings").select("currency, default_country").eq("creator_id", creatorId).maybeSingle()
    if (error && MISSING.has(error.code)) {
      const { data: older } = await db.from("store_settings").select("default_country").eq("creator_id", creatorId).maybeSingle()
      return { currency: sellingCurrencyOf(null), chosen: null, country: older?.default_country ?? null, ready: false }
    }
    if (error) throw error
    const chosen = typeof data?.currency === "string" && data.currency ? data.currency : null
    return { currency: sellingCurrencyOf(chosen), chosen, country: data?.default_country ?? null, ready: true }
  } catch {
    return { currency: sellingCurrencyOf(null), chosen: null, country: null, ready: true }
  }
}
