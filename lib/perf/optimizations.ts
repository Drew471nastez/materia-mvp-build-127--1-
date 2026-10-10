/**
 * THE OPTIMIZATION HISTORY, WITH THE NUMBERS THAT PROVE EACH ONE
 *
 * The Performance and Health page in /admin reads this list to show what was
 * made faster, when it shipped, and the measurement taken before and after.
 * Append one entry per shipped optimization. An entry without `before` and
 * `after` is shown as shipped with no measurement, never with a guessed one.
 *
 * `id` is a stable slug, `area` names the part of the platform (for example
 * "storefront", "explore", "dashboard", "database"), `shippedAt` is an ISO date
 * (YYYY-MM-DD). `metric` names what was measured ("server render p75", "query
 * count per request", "bytes shipped"), `unit` is the unit of `value` ("ms",
 * "queries", "KB").
 */

export type Optimization = {
  id: string
  title: string
  area: string
  shippedAt: string
  before?: { metric: string; value: number; unit: string }
  after?: { metric: string; value: number; unit: string }
  note?: string
}

export const OPTIMIZATIONS: Optimization[] = []
