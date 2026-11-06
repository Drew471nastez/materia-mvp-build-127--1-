/**
 * ===========================================================================
 *  THE SAME SHOP SETTING, ASKED ONCE PER REQUEST
 * ===========================================================================
 * One page of a shop asks the same small questions about the store from
 * several places: the store's currency and home country, its commerce
 * settings, its shipping profiles and locations. A product page asked
 * store_settings about fourteen times, and a list that works out delivery
 * or stock per product asked again for every product (round 55, the owner's
 * logs: 17 store_settings reads for every 17 products reads).
 *
 * `oncePerClient` keeps one answer per database client and question. A
 * request makes its own client (lib/supabase/admin createAdminClient), so
 * the answer lives as long as that request and is dropped with it. A client
 * kept for longer (a webhook's module level client) holds an answer for
 * HOLD_MS at most, so nothing here is a cache between requests.
 *
 * Never for stock: inventory levels, reservations and what a cart may hold
 * are read every time, and the checkout counts stock again before it sells.
 * A read that throws is not kept.
 */

/** The longest one answer is kept, whatever the client. */
export const HOLD_MS = 2_000

const held = new WeakMap<object, Map<string, { at: number; value: Promise<unknown> }>>()

/** `read()`, asked once per `db` client and `key` (within HOLD_MS). */
export function oncePerClient<T>(db: unknown, key: string, read: () => Promise<T>): Promise<T> {
  if (!db || (typeof db !== "object" && typeof db !== "function")) return read()
  let mine = held.get(db as object)
  if (!mine) {
    mine = new Map()
    held.set(db as object, mine)
  }
  const now = Date.now()
  const hit = mine.get(key)
  if (hit && now - hit.at < HOLD_MS) return hit.value as Promise<T>
  if (mine.size > 200) mine.clear()
  const value = Promise.resolve().then(read)
  const entry = { at: now, value }
  mine.set(key, entry)
  value.catch(() => {
    if (mine!.get(key) === entry) mine!.delete(key)
  })
  return value
}
