/**
 * The selling currency of several stores in one read, for a STOREFRONT list
 * that spans more than one store: a lei store's 49 is 49 lei on that store's
 * own website, never $49.
 *
 * Not for Explore, the creator pages or a community. Those are Storelib's own
 * surfaces and quote one currency for everybody, so they say which themselves
 * rather than reading any store's setting (lib/pricing/surface-currency). This
 * file used to feed them, which is how a creator changing their own store
 * currency moved every price Storelib showed for them.
 *
 * A store that never chose, a database without SQL part 176, or a read that
 * fails: the platform's currency, as every price was before.
 */
import { sellingCurrencyOf, type SellingCurrency } from "./selling-currency"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

export async function storeCurrencies(db: Db, creatorIds: (string | null | undefined)[]): Promise<Map<string, SellingCurrency>> {
  const ids = [...new Set(creatorIds.filter((id): id is string => typeof id === "string" && id.length > 0))]
  const out = new Map<string, SellingCurrency>()
  if (!ids.length) return out
  try {
    const { data, error } = await db.from("store_settings").select("creator_id, currency").in("creator_id", ids)
    if (!error) for (const r of (data ?? []) as { creator_id: string; currency: string | null }[]) out.set(r.creator_id, sellingCurrencyOf(r.currency))
  } catch {
    /* The platform's currency for all of them. */
  }
  for (const id of ids) if (!out.has(id)) out.set(id, sellingCurrencyOf(null))
  return out
}

/** Each row with its store's currency as `currency`, read once for all of them. */
export async function withStoreCurrency<T extends { creator_id?: string | null }>(db: Db, rows: T[]): Promise<(T & { currency: SellingCurrency })[]> {
  const map = await storeCurrencies(db, rows.map((r) => r.creator_id))
  return rows.map((r) => ({ ...r, currency: (r.creator_id && map.get(r.creator_id)) || sellingCurrencyOf(null) }))
}
