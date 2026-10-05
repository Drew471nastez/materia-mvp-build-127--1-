import "server-only"

/**
 * ===========================================================================
 *  MONEY AND GROWTH OF ONE COMMUNITY, FOR ITS ANALYTICS
 * ===========================================================================
 * What the Analytics section shows above the daily charts (./analytics.ts):
 *
 *   REVENUE      for a paid community: monthly recurring revenue, active
 *                subscribers, new subscribers and cancellations in the
 *                period with why (worker M's cancellationsWithReasons,
 *                ./membership-lifecycle.ts, when it answers), the churn
 *                rate, and refunds (M's refundsFor, else the refunded
 *                orders of the products that sell it).
 *   JOINS        how people came in during the period, by source (free,
 *                subscription, purchase, invite, added by hand...), and the
 *                invite links that brought the most.
 *   ACTIVE       members who opened the community in the last 7 and 30 days.
 *
 * Every number is counted from rows. Counts are head requests; the two
 * sums (MRR, refunds) read a page of 1000 at a time and only the columns
 * they add up; nothing loads a whole table.
 *
 * CHURN RATE is the subscriptions cancelled in the period over the ones
 * there were at its start (active now, plus cancelled in it, minus started
 * in it). With nothing at the start there is no rate, never a made up one.
 */
import { monthlyValue } from "@/lib/memberships/state"
import { MEMBER_SOURCES } from "../types"
import type { JoinStats, MoneyAndGrowth, RevenueStats } from "@/components/community/creator/view-types"

export type { JoinStats, MoneyAndGrowth, RevenueStats }
import { cancellationsWithReasons, refundsFor } from "./membership-lifecycle"
import { recurringProductIds } from "./tiers"
import { missing, reasonOf, type Db } from "./db"

const DAY = 86_400_000
const PAGE = 1000
const MAX_PAGES = 50

async function headCount(q: PromiseLike<{ count: number | null; error: { code?: string; message?: string } | null }>): Promise<number> {
  const { count, error } = await q
  if (error && !missing(error)) console.error(`[communities] stats count: ${reasonOf(error)}`)
  return error ? 0 : (count ?? 0)
}

/** The product ids that sell this community: recurring tiers (memberships) and one time ones (orders). */
async function sellingProducts(db: Db, communityId: string): Promise<{ recurring: string[]; all: string[] }> {
  const { data } = await db.from("community_tiers").select("product_id, billing").eq("community_id", communityId).eq("kind", "paid").limit(50)
  const rows = ((data as { product_id: string | null; billing: string | null }[] | null) ?? []).filter((t) => t.product_id)
  const recurring = rows.filter((t) => t.billing === "recurring").map((t) => t.product_id as string)
  return { recurring: recurring.length ? recurring : await recurringProductIds(db, communityId), all: rows.map((t) => t.product_id as string) }
}

async function mrrOf(db: Db, productIds: string[]): Promise<{ cents: number; currency: string; active: number }> {
  let cents = 0
  let active = 0
  let currency = "usd"
  let after: string | null = null
  for (let page = 0; page < MAX_PAGES; page++) {
    let q = db.from("memberships").select("id, status, billing_interval, amount_cents, currency").in("product_id", productIds).in("status", ["active", "past_due", "trialing"])
    if (after) q = q.gt("id", after)
    const { data, error } = await q.order("id", { ascending: true }).limit(PAGE)
    if (error) break
    const rows = (data as { id: string; status: string; billing_interval: string; amount_cents: number; currency: string | null }[] | null) ?? []
    for (const m of rows) {
      cents += monthlyValue(m)
      active += 1
    }
    if (rows[0]?.currency) currency = rows[0].currency
    if (rows.length < PAGE) break
    after = rows[rows.length - 1].id
  }
  return { cents, currency, active }
}

/** Refunded orders of the products that sell it, in the period: the fallback while M's refundsFor is not there. */
async function refundedOrders(db: Db, productIds: string[], since: string): Promise<{ count: number; totalCents: number; currency: string }> {
  let count = 0
  let totalCents = 0
  let currency = "usd"
  let after: string | null = null
  for (let page = 0; page < MAX_PAGES; page++) {
    let q = db.from("orders").select("id, amount_cents, refund_amount_cents, currency").in("product_id", productIds).eq("status", "refunded").gte("refunded_at", since)
    if (after) q = q.gt("id", after)
    const { data, error } = await q.order("id", { ascending: true }).limit(PAGE)
    if (error) {
      if (!missing(error)) console.error(`[communities] stats refunds: ${reasonOf(error)}`)
      break
    }
    const rows = (data as { id: string; amount_cents: number | null; refund_amount_cents: number | null; currency: string | null }[] | null) ?? []
    for (const o of rows) {
      count += 1
      totalCents += Math.max(0, o.refund_amount_cents ?? o.amount_cents ?? 0)
    }
    if (rows[0]?.currency) currency = rows[0].currency
    if (rows.length < PAGE) break
    after = rows[rows.length - 1].id
  }
  return { count, totalCents, currency }
}

/** The churn rate as the screen shows it: one decimal, or null when nobody was there to lose. */
export function churnRate(a: { activeNow: number; cancelled: number; started: number }): number | null {
  const atStart = a.activeNow + a.cancelled - a.started
  if (atStart <= 0) return null
  return Math.round((a.cancelled / atStart) * 1000) / 10
}

async function revenueStats(db: Db, communityId: string, since: string): Promise<RevenueStats | null> {
  const products = await sellingProducts(db, communityId)
  if (!products.all.length && !products.recurring.length) return null
  const recurring = products.recurring
  const subs = () => db.from("memberships").select("id", { count: "exact", head: true }).in("product_id", recurring)
  const [mrr, started, cancelled, why, refunds] = await Promise.all([
    recurring.length ? mrrOf(db, recurring) : Promise.resolve({ cents: 0, currency: "usd", active: 0 }),
    recurring.length ? headCount(subs().gte("created_at", since).neq("status", "incomplete")) : Promise.resolve(0),
    recurring.length ? headCount(subs().gte("canceled_at", since)) : Promise.resolve(0),
    cancellationsWithReasons(db, communityId, { since, limit: 5 }).catch(() => null),
    refundsFor(db, communityId, { since, limit: 5 }).catch(() => null),
  ])
  const refundLine = refunds ? { count: refunds.count, totalCents: refunds.totalCents, currency: refunds.currency } : await refundedOrders(db, products.all, since)
  /* M's record counts the members who cancelled from the community, with why; the memberships count them from Stripe. The larger is the truer. */
  const cancellations = Math.max(cancelled, why?.total ?? 0)
  return {
    currency: mrr.currency,
    mrrCents: mrr.cents,
    activeSubscribers: mrr.active,
    newSubscribers: started,
    cancellations,
    reasons: (why?.counts ?? []).filter((c) => c.count > 0).sort((a, b) => b.count - a.count),
    latestCancellations: why?.latest ?? [],
    churnRate: churnRate({ activeNow: mrr.active, cancelled: cancellations, started }),
    refunds: refundLine,
  }
}

/** A name for an invite on the screen: who it was for, or which link it was. */
export function inviteLabel(i: { email: string | null; created_at: string; max_uses: number | null }): string {
  if (i.email) return `Invite to ${i.email}`
  const when = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(Date.parse(i.created_at))
  return `Link made ${when}`
}

async function joinStats(db: Db, communityId: string, since: string): Promise<JoinStats> {
  const joined = () => db.from("community_members").select("id", { count: "exact", head: true }).eq("community_id", communityId).gte("joined_at", since)
  const sources = MEMBER_SOURCES.filter((s) => s !== "owner")
  const counts = await Promise.all(sources.map((s) => headCount(joined().eq("source", s))))
  const bySource = sources.map((source, i) => ({ source, count: counts[i] })).filter((x) => x.count > 0).sort((a, b) => b.count - a.count)
  /* The links that brought people in: the uses in the period, a page at most, grouped by link. */
  const invites: JoinStats["invites"] = []
  type Invite = { id: string; email: string | null; created_at: string; max_uses: number | null; revoked_at: string | null }
  const { data: links, error } = await db.from("community_invites").select("id, email, created_at, max_uses, revoked_at").eq("community_id", communityId).gt("uses", 0).order("created_at", { ascending: false }).limit(200)
  const byId = new Map(((links as Invite[] | null) ?? []).map((r) => [r.id, r]))
  if (!error && byId.size) {
    const { data: uses } = await db.from("community_invite_uses").select("invite_id").in("invite_id", [...byId.keys()]).gte("used_at", since).limit(5000)
    const per = new Map<string, number>()
    for (const u of (uses as { invite_id: string }[] | null) ?? []) per.set(u.invite_id, (per.get(u.invite_id) ?? 0) + 1)
    for (const [id, n] of [...per.entries()].sort((x, y) => y[1] - x[1]).slice(0, 5)) {
      const r = byId.get(id)
      if (r) invites.push({ id, label: inviteLabel(r), uses: n, revoked: Boolean(r.revoked_at) })
    }
  } else if (error && !missing(error)) console.error(`[communities] stats invites: ${reasonOf(error)}`)
  return { total: bySource.reduce((n, x) => n + x.count, 0), bySource, invites }
}

/** Revenue, joins and active members for the last `days` days. */
export async function loadMoneyAndGrowth(db: Db, communityId: string, days: number, now: number = Date.now()): Promise<MoneyAndGrowth> {
  const since = new Date(now - days * DAY).toISOString()
  const active = (d: number) => headCount(db.from("community_members").select("id", { count: "exact", head: true }).eq("community_id", communityId).eq("status", "active").gte("last_active_at", new Date(now - d * DAY).toISOString()))
  const [revenue, joins, last7, last30] = await Promise.all([revenueStats(db, communityId, since).catch((e) => (console.error(`[communities] stats revenue: ${reasonOf(e)}`), null)), joinStats(db, communityId, since), active(7), active(30)])
  return { days, revenue, joins, active: { last7, last30 } }
}
