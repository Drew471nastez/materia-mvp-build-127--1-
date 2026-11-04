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
 *   TICKETS      what the events took in the period (round 14): tickets
 *                bought, free ones given, gross, refunded and what is left,
 *                added up from the ticket rows. Absent until run-now part
 *                105 has run, and absent while nothing has ever been sold.
 *
 * Every number is counted from rows. Counts are head requests; the two
 * sums (MRR, refunds) read a page of 1000 at a time and only the columns
 * they add up; nothing loads a whole table.
 *
 * CHURN RATE is the subscriptions cancelled in the period over the ones
 * there were at its start (active now, plus cancelled in it, minus started
 * in it). With nothing at the start there is no rate, never a made up one.
 */
import { communitySellingProducts, membershipsOf, mrrOfRows } from "./membership-money"
import { MEMBER_SOURCES } from "../types"
import type { EventMoneyStats, JoinStats, MoneyAndGrowth, RevenueStats } from "@/components/community/creator/view-types"

export type { EventMoneyStats, JoinStats, MoneyAndGrowth, RevenueStats }
import { cancellationsWithReasons, refundsFor } from "./membership-lifecycle"
import { missing, reasonOf, type Db } from "./db"

const DAY = 86_400_000
const PAGE = 1000
const MAX_PAGES = 50

async function headCount(q: PromiseLike<{ count: number | null; error: { code?: string; message?: string } | null }>): Promise<number> {
  const { count, error } = await q
  if (error && !missing(error)) console.error(`[communities] stats count: ${reasonOf(error)}`)
  return error ? 0 : (count ?? 0)
}

/** The product ids that sell this community: the same set its Overview and Analytics read (./membership-money). */
async function sellingProducts(db: Db, communityId: string): Promise<{ recurring: string[]; all: string[]; owner: string | null }> {
  const p = await communitySellingProducts(db, communityId)
  return { recurring: p.recurring, all: p.all, owner: p.owner }
}

/* Round 41: MRR by the one rule (../membership-money.ts): a free trial was counted as paying here, and nowhere else. */
async function mrrOf(db: Db, productIds: string[], creatorId: string | null, owner: string | null): Promise<{ cents: number; currency: string; active: number }> {
  /* Round 43: in the currency the community's Analytics reports in, converted the same way (./membership-money mrrOfRows). */
  const m = await mrrOfRows(db, (await membershipsOf(db, productIds, { open: true, owner })) ?? [], Date.now(), creatorId)
  return { cents: m.cents, currency: m.currency, active: m.paying }
}

/** Which store a community belongs to, for its currency. */
async function storeOf(db: Db, communityId: string): Promise<string | null> {
  const { data, error } = await db.from("communities").select("creator_id").eq("id", communityId).maybeSingle()
  return error ? null : ((data as { creator_id?: string | null } | null)?.creator_id ?? null)
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
    recurring.length ? storeOf(db, communityId).then((store) => mrrOf(db, recurring, store, products.owner)) : Promise.resolve({ cents: 0, currency: "usd", active: 0 }),
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
    /* A cancellation that gave no reason is "none", which the screen words as such. */
    reasons: (why?.counts ?? []).filter((c) => c.count > 0).map((c) => ({ reason: c.reason ?? "none", count: c.count })).sort((a, b) => b.count - a.count),
    latestCancellations: (why?.latest ?? []).map((l) => ({ ...l, reason: l.reason ?? "none" })),
    churnRate: churnRate({ activeNow: mrr.active, cancelled: cancellations, started }),
    refunds: refundLine,
  }
}

/* ── Event tickets (round 14, run-now part 105) ────────────────────── */

type TicketSums = { rows: number; cents: number; currency: string | null; invited: number; events: Set<string> }

/**
 * The ticket rows of one community in the period, added up a page of 1000 at
 * a time, by whichever date the caller asks for: `paid_at` for what was
 * taken, `refunded_at` for what went back. Null when part 105 has not run,
 * which is how the screen knows to say nothing about tickets at all.
 */
async function ticketSums(db: Db, communityId: string, since: string, column: "paid_at" | "refunded_at", until?: string): Promise<TicketSums | null> {
  const out: TicketSums = { rows: 0, cents: 0, currency: null, invited: 0, events: new Set<string>() }
  let after: string | null = null
  for (let page = 0; page < MAX_PAGES; page++) {
    let q = db.from("community_event_tickets").select("id, event_id, source, amount_cents, currency").eq("community_id", communityId).gte(column, since)
    if (until) q = q.lt(column, until)
    if (after) q = q.gt("id", after)
    const { data, error } = await q.order("id", { ascending: true }).limit(PAGE)
    if (error) {
      if (missing(error)) return null
      console.error(`[communities] ticket sums: ${reasonOf(error)}`)
      break
    }
    const rows = (data as { id: string; event_id: string; source: string; amount_cents: number | null; currency: string | null }[] | null) ?? []
    for (const t of rows) {
      const cents = Math.max(0, t.amount_cents ?? 0)
      if (t.source === "purchase") {
        out.rows += 1
        out.cents += cents
        if (cents > 0) out.events.add(t.event_id)
      } else out.invited += 1
      if (!out.currency && t.currency) out.currency = t.currency
    }
    if (rows.length < PAGE) break
    after = rows[rows.length - 1].id
  }
  return out
}

/**
 * What the events took in the period: tickets bought, free ones given,
 * gross, refunded and what is left. Counted from the ticket rows, never
 * from a price times a count. Null while part 105 has not run, or when
 * nothing has ever been sold, so the Analytics screen stays as it was.
 * `until` ends the period (round 31: any period the picker chooses).
 */
export async function loadEventMoney(db: Db, communityId: string, since: string, until?: string): Promise<EventMoneyStats | null> {
  const [took, back] = await Promise.all([ticketSums(db, communityId, since, "paid_at", until), ticketSums(db, communityId, since, "refunded_at", until)])
  if (!took) return null
  const refundedCents = back?.cents ?? 0
  if (took.rows === 0 && took.invited === 0 && refundedCents === 0) return null
  return {
    sold: took.rows,
    invited: took.invited,
    grossCents: took.cents,
    refundedCents,
    netCents: Math.max(0, took.cents - refundedCents),
    refunds: back?.rows ?? 0,
    events: took.events.size,
    currency: took.currency ?? back?.currency ?? "usd",
  }
}

/** A name for an invite on the screen: who it was for, or which link it was. */
export function inviteLabel(i: { email: string | null; created_at: string; max_uses: number | null }): string {
  if (i.email) return `Invite to ${i.email}`
  const when = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(Date.parse(i.created_at))
  return `Link made ${when}`
}

/** How the members who joined in the period came in, and the invite links that brought the most. `until` ends the period (round 31). */
export async function joinStats(db: Db, communityId: string, since: string, until?: string): Promise<JoinStats> {
  const joined = () => {
    const q = db.from("community_members").select("id", { count: "exact", head: true }).eq("community_id", communityId).gte("joined_at", since)
    return until ? q.lt("joined_at", until) : q
  }
  const sources = MEMBER_SOURCES.filter((s) => s !== "owner")
  const counts = await Promise.all(sources.map((s) => headCount(joined().eq("source", s))))
  const bySource = sources.map((source, i) => ({ source, count: counts[i] })).filter((x) => x.count > 0).sort((a, b) => b.count - a.count)
  /* The links that brought people in: the uses in the period, a page at most, grouped by link. */
  const invites: JoinStats["invites"] = []
  type Invite = { id: string; email: string | null; created_at: string; max_uses: number | null; revoked_at: string | null }
  const { data: links, error } = await db.from("community_invites").select("id, email, created_at, max_uses, revoked_at").eq("community_id", communityId).gte("uses", 1).order("created_at", { ascending: false }).limit(200)
  const byId = new Map(((links as Invite[] | null) ?? []).map((r) => [r.id, r]))
  if (!error && byId.size) {
    let usesQ = db.from("community_invite_uses").select("invite_id").in("invite_id", [...byId.keys()]).gte("used_at", since)
    if (until) usesQ = usesQ.lt("used_at", until)
    const { data: uses } = await usesQ.limit(5000)
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
  const [revenue, joins, last7, last30, events] = await Promise.all([
    revenueStats(db, communityId, since).catch((e) => (console.error(`[communities] stats revenue: ${reasonOf(e)}`), null)),
    joinStats(db, communityId, since),
    active(7),
    active(30),
    loadEventMoney(db, communityId, since).catch(() => null),
  ])
  return { days, revenue, joins, active: { last7, last30 }, events }
}
