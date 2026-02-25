/**
 * Performance observability utilities.
 *
 * Usage in API routes:
 *   const timer = startTimer()
 *   // ... do work ...
 *   logSlowRequest(timer, request, { extra: "context" })
 *
 * Usage for individual queries:
 *   const t = startTimer()
 *   const { data } = await supabase.from("products").select("*")
 *   logSlowQuery(t, "products.select", 100)
 */

const SLOW_REQUEST_MS = 300
const SLOW_QUERY_MS = 100

export function startTimer(): number {
  return performance.now()
}

export function elapsed(start: number): number {
  return Math.round(performance.now() - start)
}

/** Log if the request exceeded the slow threshold */
export function logSlowRequest(
  start: number,
  request: { method: string; url: string },
  meta?: Record<string, unknown>
) {
  const ms = elapsed(start)
  if (ms > SLOW_REQUEST_MS) {
    const url = new URL(request.url)
    console.warn(
      `[perf] Slow request: ${request.method} ${url.pathname} — ${ms}ms`,
      meta ? JSON.stringify(meta) : ""
    )
  }
  return ms
}

/** Log if an individual DB query exceeded the threshold */
export function logSlowQuery(
  start: number,
  label: string,
  thresholdMs = SLOW_QUERY_MS
) {
  const ms = elapsed(start)
  if (ms > thresholdMs) {
    console.warn(`[perf] Slow query: ${label} — ${ms}ms`)
  }
  return ms
}
