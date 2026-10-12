/**
 * ===========================================================================
 *  ONE WAY TO ASK A TRACKING AGGREGATOR ANYTHING
 * ===========================================================================
 * A timeout, JSON both ways, one quick second try when the aggregator is
 * busy (429, with its Retry-After up to two seconds) or down (5xx), and an
 * error that says whether trying later is worth it. The cron and the
 * webhook decide what to do with that: a parcel that could not be read is
 * looked at again later with backoff (./model.ts nextCheckAt), never lost.
 *
 * `fetch` is the global one, read at call time, so a test replaces it with
 * a stub of the aggregator's API and nothing real is ever called.
 */

export class TrackingError extends Error {
  readonly status: number
  readonly retry: boolean
  readonly code: string | null
  constructor(message: string, status: number, retry: boolean, code: string | null = null) {
    super(message)
    this.name = "TrackingError"
    this.status = status
    this.retry = retry
    this.code = code
  }
}

export const TRACKING_TIMEOUT_MS = 10_000

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms))

export async function ask<T = any>(name: string, url: string, init: { method?: "GET" | "POST"; headers: Record<string, string>; body?: unknown }, tries = 2): Promise<{ status: number; body: T }> {
  for (let attempt = 1; ; attempt++) {
    let res: Response
    try {
      res = await fetch(url, {
        method: init.method ?? "GET",
        headers: { Accept: "application/json", "User-Agent": "Storelib/1.0 (+https://storelib.com)", ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}), ...init.headers },
        body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
        signal: AbortSignal.timeout(TRACKING_TIMEOUT_MS),
        cache: "no-store",
      })
    } catch {
      if (attempt < tries) {
        await pause(400)
        continue
      }
      throw new TrackingError(`${name} could not be reached.`, 0, true)
    }
    const text = await res.text().catch(() => "")
    let body: any = null
    if (text) {
      try {
        body = JSON.parse(text)
      } catch {
        body = text
      }
    }
    if ((res.status === 429 || res.status >= 500) && attempt < tries) {
      const after = Number(res.headers.get("retry-after"))
      await pause(Number.isFinite(after) && after > 0 ? Math.min(after * 1000, 2000) : 500)
      continue
    }
    if (res.status === 429) throw new TrackingError(`${name} is busy. Storelib looks again shortly.`, 429, true)
    if (res.status >= 500) throw new TrackingError(`${name} had a problem (${res.status}). Storelib looks again shortly.`, res.status, true)
    if (res.status === 401 || res.status === 403) throw new TrackingError(`${name} did not accept the tracking key.`, res.status, false, "key")
    return { status: res.status, body: body as T }
  }
}
