/**
 * ===========================================================================
 *  MORE CURRENCIES AFTER THE STORE'S CURRENCY CHANGES
 * ===========================================================================
 * A market can carry the store's own exchange rate (lib/markets/model.ts
 * Market.rate): how much of the market's currency ONE UNIT OF THE STORE'S
 * is. That number is about the store's currency, so it cannot outlive it:
 * a euro store's "1 EUR = 0.85 GBP" read after a change to lei priced a
 * 100 lei basket at 85 pounds.
 *
 *   convert   every price was multiplied by the change's rate, so the
 *             market's rate is divided by it: a visitor in that market sees
 *             the same amounts as before the change
 *   keep      the amounts kept their numbers in a new currency, so no old
 *             rate says anything about it: dropped, and the market follows
 *             the day's rate from the new currency (lib/markets/pricing)
 *
 * A market in the store's new currency needs no rate at all (it shows the
 * store's own prices, lib/markets/model validateLocalization). Undo is the
 * same move the other way, at the inverse rate.
 *
 * Pure, so the route and the tests agree.
 */

export interface BaseChange {
  from: string
  to: string
  mode: "keep" | "convert"
  /** What one unit of `from` became in `to` when converting; null when keeping. */
  rate: number | null
}

const code = (v: unknown) => (typeof v === "string" ? v.trim().toUpperCase() : "")

export function marketsForNewBase(markets: unknown, change: BaseChange): { markets: unknown[]; changed: boolean } {
  if (!Array.isArray(markets)) return { markets: [], changed: false }
  const to = code(change.to)
  const rate = change.mode === "convert" && typeof change.rate === "number" && Number.isFinite(change.rate) && change.rate > 0 ? change.rate : null
  let changed = false
  const out = markets.map((m) => {
    if (!m || typeof m !== "object") return m
    const market = m as Record<string, unknown>
    const own = typeof market.rate === "number" ? market.rate : typeof market.rate === "string" && market.rate.trim() ? Number(market.rate) : null
    if (own === null || !Number.isFinite(own) || own <= 0) return m
    changed = true
    const { rate: _old, ...rest } = market
    if (code(market.currency) === to || rate === null) return rest
    return { ...rest, rate: Number((own / rate).toPrecision(6)) }
  })
  return { markets: out, changed }
}
