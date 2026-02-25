/**
 * Observability utilities for monitoring application performance.
 *
 * Tracks:
 * - P50/P95 response times per route
 * - SWR cache hit rate
 * - Slow query detection
 * - Error rate monitoring
 *
 * In production, these metrics can be exported to your observability platform
 * (Vercel Analytics, Datadog, etc.). In development, they log to console.
 */

// ────────────────────────────────────────────────────────────────────────────
// Percentile tracker (P50/P95)
// ────────────────────────────────────────────────────────────────────────────

interface PercentileData {
  values: number[]
  maxSamples: number
}

const routeTimings = new Map<string, PercentileData>()

/** Max samples per route to keep in memory */
const MAX_SAMPLES = 500

/** Slow query threshold in milliseconds */
const SLOW_QUERY_THRESHOLD_MS = 2000

/**
 * Record a response time for a route.
 */
export function recordTiming(route: string, durationMs: number) {
  let data = routeTimings.get(route)
  if (!data) {
    data = { values: [], maxSamples: MAX_SAMPLES }
    routeTimings.set(route, data)
  }

  data.values.push(durationMs)
  if (data.values.length > data.maxSamples) {
    data.values.shift()
  }

  // Log slow queries
  if (durationMs > SLOW_QUERY_THRESHOLD_MS) {
    console.warn(`[observability] Slow route: ${route} took ${durationMs}ms`)
  }
}

/**
 * Calculate percentile from sorted array.
 */
function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0
  const index = Math.ceil((p / 100) * sorted.length) - 1
  return sorted[Math.max(0, index)]
}

/**
 * Get P50/P95 metrics for a route (or all routes).
 */
export function getTimingMetrics(route?: string): Record<string, {
  p50: number
  p95: number
  avg: number
  count: number
  max: number
}> {
  const metrics: Record<string, { p50: number; p95: number; avg: number; count: number; max: number }> = {}

  const entries = route
    ? [[route, routeTimings.get(route)] as const]
    : Array.from(routeTimings.entries())

  for (const [name, data] of entries) {
    if (!data || data.values.length === 0) continue

    const sorted = [...data.values].sort((a, b) => a - b)
    const sum = sorted.reduce((a, b) => a + b, 0)

    metrics[name] = {
      p50: Math.round(percentile(sorted, 50)),
      p95: Math.round(percentile(sorted, 95)),
      avg: Math.round(sum / sorted.length),
      count: sorted.length,
      max: sorted[sorted.length - 1],
    }
  }

  return metrics
}

// ────────────────────────────────────────────────────────────────────────────
// Cache hit rate tracker
// ────────────────────────────────────────────────────────────────────────────

interface CacheStats {
  hits: number
  misses: number
}

const cacheMetrics = new Map<string, CacheStats>()

/**
 * Record a cache hit or miss for a given cache namespace.
 */
export function recordCacheAccess(namespace: string, hit: boolean) {
  let stats = cacheMetrics.get(namespace)
  if (!stats) {
    stats = { hits: 0, misses: 0 }
    cacheMetrics.set(namespace, stats)
  }

  if (hit) {
    stats.hits++
  } else {
    stats.misses++
  }
}

/**
 * Get cache hit rates.
 */
export function getCacheMetrics(): Record<string, {
  hits: number
  misses: number
  hitRate: number
  total: number
}> {
  const result: Record<string, { hits: number; misses: number; hitRate: number; total: number }> = {}

  for (const [namespace, stats] of cacheMetrics.entries()) {
    const total = stats.hits + stats.misses
    result[namespace] = {
      ...stats,
      total,
      hitRate: total > 0 ? Math.round((stats.hits / total) * 100) : 0,
    }
  }

  return result
}

// ────────────────────────────────────────────────────────────────────────────
// Slow query log
// ────────────────────────────────────────────────────────────────────────────

interface SlowQuery {
  query: string
  durationMs: number
  timestamp: Date
  route: string
}

const slowQueries: SlowQuery[] = []
const MAX_SLOW_QUERIES = 100

/**
 * Record a slow database query.
 */
export function recordSlowQuery(query: string, durationMs: number, route: string) {
  if (durationMs < SLOW_QUERY_THRESHOLD_MS) return

  slowQueries.push({ query, durationMs, timestamp: new Date(), route })
  if (slowQueries.length > MAX_SLOW_QUERIES) {
    slowQueries.shift()
  }

  console.warn(
    `[observability] Slow query on ${route}: ${durationMs}ms — ${query.slice(0, 100)}...`,
  )
}

/**
 * Get recent slow queries, sorted by duration descending.
 */
export function getSlowQueries(limit = 20): SlowQuery[] {
  return [...slowQueries]
    .sort((a, b) => b.durationMs - a.durationMs)
    .slice(0, limit)
}

// ────────────────────────────────────────────────────────────────────────────
// Middleware helper: time a route handler
// ────────────────────────────────────────────────────────────────────────────

/**
 * Wrap an API route handler to automatically record timing.
 *
 * Usage:
 * ```ts
 * export const GET = withTiming("/api/products", async (req) => {
 *   // ... handler logic
 * })
 * ```
 */
export function withTiming(
  routeName: string,
  handler: (request: Request) => Promise<Response>,
): (request: Request) => Promise<Response> {
  return async (request: Request) => {
    const start = performance.now()
    try {
      const response = await handler(request)
      const duration = performance.now() - start
      recordTiming(routeName, duration)
      return response
    } catch (error) {
      const duration = performance.now() - start
      recordTiming(routeName, duration)
      throw error
    }
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Health / metrics endpoint data
// ────────────────────────────────────────────────────────────────────────────

/**
 * Get all observability metrics as a single object.
 * Useful for a /api/metrics endpoint.
 */
export function getAllMetrics() {
  return {
    timings: getTimingMetrics(),
    cache: getCacheMetrics(),
    slowQueries: getSlowQueries(10),
    timestamp: new Date().toISOString(),
  }
}
