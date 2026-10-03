/**
 * ===========================================================================
 *  MONEY IN THE CURRENCY IT IS ACTUALLY IN
 * ===========================================================================
 * Payouts used to draw every figure in US dollars: the sales, the chart, the
 * balance and each payout went through `fmt(amount, "usd")`, and the Stripe
 * balance was divided by a market exchange rate first. Storelib charges in
 * lei (lib/checkout/currency), and a Romanian creator's Stripe balance and
 * payouts are in lei, so a 360 lei sale read as "$360.00" and the balance
 * read as an approximate dollar figure that was never what reached the bank.
 *
 * Now nothing is converted for display:
 *
 *   a sale         in the currency it was charged in (orders.currency)
 *   the balance    in the currency Stripe holds it in, the account's own
 *                  default first (pickBalance)
 *   a payout       in the currency Stripe paid it in
 *
 * Pure, so tests/payouts-currency.test.ts holds it as it is.
 */

export interface BalanceAmount {
  amount: number
  currency: string
}

export interface PickedBalance {
  currency: string
  available: number
  pending: number
  /** Any other currency Stripe holds money in, so nothing is hidden. */
  others: Array<{ currency: string; available: number; pending: number }>
}

/**
 * The balance to show, from Stripe's own `balance.retrieve`: the account's
 * default currency when Stripe holds anything in it, otherwise the currency
 * holding the most. Amounts are Stripe's, unchanged (an available balance
 * can be below zero after a dispute or a refund, and is shown as it is).
 */
export function pickBalance(
  balance: { available?: BalanceAmount[] | null; pending?: BalanceAmount[] | null } | null | undefined,
  preferred?: string | null,
): PickedBalance | null {
  if (!balance) return null
  const by = new Map<string, { available: number; pending: number }>()
  const add = (list: BalanceAmount[] | null | undefined, key: "available" | "pending") => {
    for (const b of list ?? []) {
      if (!b || typeof b.amount !== "number" || typeof b.currency !== "string") continue
      const c = b.currency.toLowerCase()
      const row = by.get(c) ?? { available: 0, pending: 0 }
      row[key] += b.amount
      by.set(c, row)
    }
  }
  add(balance.available, "available")
  add(balance.pending, "pending")
  if (by.size === 0) return null
  const want = (preferred || "").toLowerCase()
  const size = (r: { available: number; pending: number }) => Math.abs(r.available) + Math.abs(r.pending)
  const chosen = want && by.has(want) ? want : [...by.entries()].sort((a, b) => size(b[1]) - size(a[1]))[0][0]
  const row = by.get(chosen)!
  const others = [...by.entries()]
    .filter(([c, r]) => c !== chosen && size(r) > 0)
    .map(([currency, r]) => ({ currency, available: r.available, pending: r.pending }))
  return { currency: chosen, available: row.available, pending: row.pending, others }
}

/** The currency most of these sales were charged in, or the fallback when there are none. */
export function salesCurrencyOf(orders: Array<{ currency?: string | null }>, fallback: string): string {
  const count = new Map<string, number>()
  for (const o of orders) {
    const c = typeof o.currency === "string" && /^[a-z]{3}$/i.test(o.currency) ? o.currency.toLowerCase() : null
    if (c) count.set(c, (count.get(c) ?? 0) + 1)
  }
  if (count.size === 0) return fallback.toLowerCase()
  return [...count.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0]
}

/**
 * Stripe's pending balance transactions, as the days they become
 * available: what "Arriving soon" is made of, with Stripe's own dates rather
 * than a guessed "2 to 7 days". Net of Stripe's fees, in the balance's
 * currency, soonest first.
 */
export function upcomingByDay(
  transactions: Array<{ status?: string | null; available_on?: number | null; net?: number | null; currency?: string | null }>,
  currency: string,
  limit = 10,
): Array<{ date: string; amount: number; currency: string }> {
  const by = new Map<string, number>()
  for (const t of transactions) {
    if (t.status !== "pending" || typeof t.available_on !== "number" || typeof t.net !== "number") continue
    if ((t.currency || "").toLowerCase() !== currency.toLowerCase()) continue
    const day = new Date(t.available_on * 1000).toISOString().slice(0, 10)
    by.set(day, (by.get(day) ?? 0) + t.net)
  }
  return [...by.entries()]
    .filter(([, amount]) => amount !== 0)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([date, amount]) => ({ date, amount, currency: currency.toLowerCase() }))
}
