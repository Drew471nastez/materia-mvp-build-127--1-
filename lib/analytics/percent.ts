/**
 * ===========================================================================
 *  PERCENTAGES ON ANALYTICS, ONE SET OF RULES
 * ===========================================================================
 * Pure, so the cards, the tabs, the export and the tests write a share and a
 * change the same way.
 *
 *   A rate with nothing to divide by is no rate: null, written "–", never
 *   NaN, never 0%.
 *
 *   A change against nothing is not +100% and not Infinity: null, which the
 *   page writes as "New" when there is something now.
 *
 *   A change against a negative figure (net sales can be below zero in a
 *   week of refunds, now that refunds are dated by their own day) is
 *   measured against its size, so going from -10 to +5 reads as up.
 *
 *   Shares of one whole that are written rounded add up to exactly 100
 *   (largest remainder): three equal parts are 34%, 33% and 33%, not 33% three times.
 */

/** The change from `before` to `now`, as a fraction; null when there was nothing before. */
export function changeOf(now: number, before: number): number | null {
  if (!Number.isFinite(now) || !Number.isFinite(before) || before === 0) return null
  return (now - before) / Math.abs(before)
}

/** `part / whole`, or null when the whole is nothing (or either is not a number). */
export function ratio(part: number, whole: number): number | null {
  if (!Number.isFinite(part) || !Number.isFinite(whole) || whole === 0) return null
  return part / whole
}

/**
 * Each value's share of their sum, in percent with `decimals` places,
 * rounded so the shares add up to exactly 100 (the largest remainders get
 * the units rounding took off). Negative values count as nothing. All
 * nothing: every share 0.
 */
export function roundShares(values: number[], decimals = 0): number[] {
  const clean = values.map((v) => (Number.isFinite(v) && v > 0 ? v : 0))
  const total = clean.reduce((a, b) => a + b, 0)
  if (total <= 0) return clean.map(() => 0)
  const unit = 10 ** decimals
  const exact = clean.map((v) => (v / total) * 100 * unit)
  const floors = exact.map(Math.floor)
  let left = 100 * unit - floors.reduce((a, b) => a + b, 0)
  const order = exact
    .map((x, i) => ({ i, rest: x - floors[i] }))
    .sort((a, b) => b.rest - a.rest || clean[b.i] - clean[a.i] || a.i - b.i)
  for (const { i } of order) {
    if (left <= 0) break
    floors[i] += 1
    left -= 1
  }
  return floors.map((f) => f / unit)
}

/** A fraction as "12%", "2.5%" under 10%, or "–" when there is no rate. */
export function percentText(f: number | null | undefined): string {
  if (f === null || f === undefined || !Number.isFinite(f)) return "–"
  const p = f * 100
  return `${(p > 0 && p < 10 ? p.toFixed(1) : Math.round(p).toString()).replace(/\.0$/, "")}%`
}
