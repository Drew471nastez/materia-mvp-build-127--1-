/**
 * Beacons per address per minute, counted in memory per server instance.
 * Not a limit anything can rely on (instances do not share memory), and it
 * does not need to be: the database's daily cap (part 126, perf_ingest) is
 * the bound that holds. This only stops one address filling a day's sample.
 */
export type HitStore = Map<string, { n: number; until: number }>

export function allowedBeacon(address: string | null, now: number, perMinute: number, store: HitStore): boolean {
  if (!address) return true
  if (store.size > 5000) {
    for (const [k, v] of store) if (v.until < now) store.delete(k)
    if (store.size > 5000) store.clear()
  }
  const seen = store.get(address)
  if (!seen || seen.until < now) {
    store.set(address, { n: 1, until: now + 60_000 })
    return true
  }
  seen.n += 1
  return seen.n <= perMinute
}
