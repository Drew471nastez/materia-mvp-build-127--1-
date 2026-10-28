/**
 * ===========================================================================
 *  A COMMUNITY'S MEMBERSHIP MONEY: ONE RULE FOR EVERY SCREEN (round 41)
 * ===========================================================================
 * The owner: "Inside a community it shows monthly revenue $83.33, and
 * /app/community tabs show 83 MRR, but when I go to analytics the revenue is
 * not there."
 *
 * There were three sums of the same memberships: the community list's card
 * (active and past due), the community's Overview (the same) and its money
 * stats (active, past due and trialing, so a free trial was revenue), and
 * the Analytics report (paying at a moment, out of any trial). Now every one
 * of them is this file, and the two numbers are told apart by name:
 *
 *   MRR                what the plans being paid for bring in a month, at a
 *                      moment: a monthly plan its price, a yearly plan a
 *                      twelfth of its price ($1,000 a year is $83.33). Not
 *                      money received; a level, like a member count.
 *   PAYMENTS RECEIVED  the money that actually came in during a period: the
 *                      community's orders (a paid membership invoice becomes
 *                      an order, lib/memberships/sync recordPaidInvoice),
 *                      less what was refunded. A yearly plan paid in March is
 *                      $1,000 in March and nothing in April, while its MRR is
 *                      $83.33 in both. /app/analytics counts the very same
 *                      orders by the very same rule (lib/analytics/reports
 *                      lineMoney), so its Revenue for these products and this
 *                      figure agree to the cent.
 *
 * Pure: no clock, no database.
 */
import { lineMoney } from "@/lib/analytics/reports"
import type { OrderRow } from "@/lib/orders/order-view"

export interface MembershipMoneyRow {
  id?: string
  status: string
  billing_interval: string
  amount_cents: number
  currency?: string | null
  created_at: string
  started_at?: string | null
  canceled_at?: string | null
  ended_at?: string | null
  trial_end?: string | null
  product_id?: string | null
}

/** The columns every MRR read asks for. */
export const MEMBERSHIP_MONEY_COLUMNS = "id, product_id, status, billing_interval, amount_cents, currency, created_at, started_at, canceled_at, ended_at, trial_end"

/** Paying at a moment: started, not ended, out of any trial. A trial with no end date is not paying yet. */
export function payingAt(m: MembershipMoneyRow, t: number): boolean {
  if (m.status === "incomplete") return false
  const started = Date.parse(m.started_at ?? m.created_at)
  if (!(started <= t)) return false
  const ended = m.ended_at ? Date.parse(m.ended_at) : m.status === "canceled" || m.status === "expired" ? Date.parse(m.canceled_at ?? m.created_at) : Infinity
  if (ended <= t) return false
  if (m.trial_end && Date.parse(m.trial_end) > t) return false
  if (m.status === "trialing" && !m.trial_end) return false
  return true
}

/** One plan's monthly value: its price a month, a yearly price a twelfth. */
export function monthlyOf(m: Pick<MembershipMoneyRow, "billing_interval" | "amount_cents">): number {
  const cents = Math.max(0, Math.round(m.amount_cents || 0))
  return m.billing_interval === "year" ? Math.round(cents / 12) : cents
}

/** MRR at a moment, and how many pay for it. */
export function mrrAt(rows: readonly MembershipMoneyRow[], t: number): { cents: number; paying: number; currency: string } {
  let cents = 0
  let paying = 0
  let currency: string | null = null
  for (const m of rows) {
    if (!payingAt(m, t)) continue
    cents += monthlyOf(m)
    paying += 1
    if (!currency && m.currency) currency = m.currency.toLowerCase()
  }
  return { cents, paying, currency: currency ?? (rows.find((m) => m.currency)?.currency ?? "usd").toLowerCase() }
}

export interface PaymentRow {
  created_at: string
  amount_cents: number | null
  refund_amount_cents: number | null
  status: string
  product_id?: string | null
}

const PAID = new Set(["completed", "refunded"])

/** One order's money received, less its refund; nothing for a payment that did not go through. */
export function paymentNet(o: PaymentRow): number {
  if (!PAID.has(String(o.status ?? "").toLowerCase())) return 0
  return lineMoney(o as unknown as OrderRow).net
}

/** Payments received in [start, end): the sum and how many payments. */
export function paymentsIn(orders: readonly PaymentRow[], span: { start: number; end: number }): { cents: number; count: number } {
  let cents = 0
  let count = 0
  for (const o of orders) {
    const t = Date.parse(o.created_at)
    if (!(t >= span.start && t < span.end) || !PAID.has(String(o.status ?? "").toLowerCase())) continue
    cents += paymentNet(o)
    count += 1
  }
  return { cents, count }
}

interface Figure {
  value: number | null
  previous: number | null
}

/** One community's money, as its Analytics answer carries it (lib/communities/analytics-report MoneyReport). */
export interface MoneyAnswer {
  currency: string
  figures: { revenue: Figure; mrr: Figure; subscribers: Figure }
  bySource: { key: "memberships" | "programs" | "tickets"; cents: number }[]
}

/** What a set of communities took in, added up: only answers in one currency are added together. */
export function moneyTotal(list: MoneyAnswer[]): { currency: string; revenue: Figure; mrr: Figure; paying: number; bySource: { key: string; cents: number }[] } | null {
  if (list.length === 0) return null
  const currency = list[0].currency.toLowerCase()
  if (list.some((m) => m.currency.toLowerCase() !== currency)) return null
  const add = (k: "revenue" | "mrr") => ({
    value: list.reduce((t, m) => t + (m.figures[k].value ?? 0), 0),
    previous: list.every((m) => m.figures[k].previous === null) ? null : list.reduce((t, m) => t + (m.figures[k].previous ?? 0), 0),
  })
  const by = new Map<string, number>()
  for (const m of list) for (const x of m.bySource) by.set(x.key, (by.get(x.key) ?? 0) + x.cents)
  return {
    currency,
    revenue: add("revenue"),
    mrr: add("mrr"),
    paying: list.reduce((t, m) => t + (m.figures.subscribers.value ?? 0), 0),
    bySource: [...by].map(([key, cents]) => ({ key, cents })).filter((x) => x.cents > 0).sort((a, b) => b.cents - a.cents),
  }
}
