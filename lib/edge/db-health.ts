/**
 * ===========================================================================
 *  IS THE DATABASE ANSWERING, AS THIS SERVER LAST SAW IT (round 49, edge)
 * ===========================================================================
 * The proxy decides, before any page is drawn, whether a public page should
 * come from its stored copy (./public-snapshot.ts) instead of a draw that
 * would wait on the database for up to seven seconds (siteRead's budget) and
 * then answer "One moment". It cannot see the page's own reads, which run in
 * another function on Vercel, so it goes by the reads it makes itself (every
 * Supabase call through proxy.ts's proxyFetch is reported here) and, when it
 * has made none for a while because every answer is held, by one small read
 * of its own in the background (probe), at most every PROBE_EVERY_MS.
 *
 * A read that got any answer from PostgREST (2xx, 3xx, 4xx) is "up": the
 * database answered, even if the answer was "no such row". A network error,
 * an abort (our own deadline) or a 5xx is "down". DOWN_HOLD_MS after the last
 * failure with no success since, the database counts as down; one success
 * ends that at once.
 *
 * Per server, in memory, never shared: a cold server starts "unknown" and
 * learns from its first reads, which is the cold-instance case the stored
 * copies are for.
 */

export type DbState = "up" | "down" | "unknown"

/** How long one failure, with no success after it, keeps the database "down". */
export const DOWN_HOLD_MS = 30_000
/** How long the last answer is believed before a probe is started. */
export const PROBE_EVERY_MS = 20_000
/** The probe's own limit. */
export const PROBE_MS = 2_500

let lastOk = 0
let lastFail = 0
let probing: Promise<void> | null = null
/*
  When this server started counting. A server that has just started has had
  no time to make reads of its own: its first requests' routing reads (every
  one reported through noteDb) say how the database is, so a probe beside
  them would only be one more round trip on every cold request (measured:
  the 4th foreground read on a cold imported-theme page,
  tests/live-speed-imported). The probe is for a server that has made no
  read FOR A WHILE because every answer is held, so the while counts from
  here too.
*/
let bornAt = Date.now()

/** Say what a database call came back with. */
export function noteDb(ok: boolean, now = Date.now()): void {
  if (ok) lastOk = now
  else lastFail = now
}

/** What a fetch to Supabase came back with, as up or down (see the top of this file). */
export function answeredOk(status: number): boolean {
  return status > 0 && status < 500
}

export function dbState(now = Date.now()): DbState {
  if (lastFail > lastOk && now - lastFail < DOWN_HOLD_MS) return "down"
  if (lastOk > 0 || lastFail > 0) return "up"
  return "unknown"
}

/** Whether the last word is older than PROBE_EVERY_MS (or there is none and this server has been up that long). */
export function stale(now = Date.now()): boolean {
  return now - Math.max(lastOk, lastFail, bornAt) > PROBE_EVERY_MS
}

/**
 * One small read in the background when the last word is old: never awaited
 * by a visitor, never two at once. `read` answers the HTTP status (0 for no
 * answer at all).
 */
export function probeIfStale(read: (signal: AbortSignal) => Promise<number>, now = Date.now()): void {
  if (probing || !stale(now)) return
  const signal = AbortSignal.timeout(PROBE_MS)
  probing = read(signal)
    .then((status) => noteDb(answeredOk(status)))
    .catch(() => noteDb(false))
    .finally(() => {
      probing = null
    })
}

/** The probe a proxy makes: one row of profiles' id, the cheapest read every deployment has. */
export function supabaseProbe(url: string | undefined, key: string | undefined, fetcher: typeof fetch = fetch): (signal: AbortSignal) => Promise<number> {
  return async (signal) => {
    if (!url || !key) return 0
    const r = await fetcher(`${url.replace(/\/+$/, "")}/rest/v1/profiles?select=id&limit=1`, { headers: { apikey: key, Authorization: `Bearer ${key}` }, signal, cache: "no-store" })
    await r.arrayBuffer().catch(() => undefined)
    return r.status
  }
}

/** For the tests. */
export function resetDbHealth(opts: { justStarted?: boolean } = {}): void {
  lastOk = 0
  lastFail = 0
  probing = null
  /* By default a server that has been up for a while and has no word (the probe's own case); justStarted: a cold one. */
  bornAt = opts.justStarted ? Date.now() : 0
}
