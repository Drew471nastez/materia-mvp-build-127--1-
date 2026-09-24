import "server-only"

import type { AttentionItem, OverviewPayload } from "../types"
import { Reader, dayKey, dayRange, distinct, isoDaysAgo, isoMinutesAgo, startOfTodayIso } from "../platform-metrics"
import { creatorSales, dailySales, orderTotals, pick } from "../sales"
import { creatorRef } from "./common"

/**
 * The first screen: what the platform sold, who is selling, and what needs
 * somebody today. Every number is one query; a failed one is null and the
 * card says why.
 */
export async function overview(r: Reader): Promise<Omit<OverviewPayload, "problems" | "notices">> {
  const since30 = isoDaysAgo(30)
  const today = startOfTodayIso()

  const [all, last30, todayTotals, series, top, active, creators, newCreators, accounts, signupRows, publishedProducts, publishedSites, live, pro] =
    await Promise.all([
      orderTotals(r, "orders, all time", null),
      orderTotals(r, "orders, 30 days", since30),
      orderTotals(r, "orders, today", today),
      dailySales(r, "sales by day", 30),
      creatorSales(r, "top creators", { since: since30, limit: 8 }),
      creatorSales(r, "creators with a sale", { since: since30, limit: 100_000 }),
      r.count("creators", "creators"),
      r.count("new creators", "creators", (q) => q.gte("created_at", since30)),
      r.count("accounts", "profiles"),
      r.rows<{ created_at: string }>("signups by day", "profiles", "created_at", (q) => q.gte("created_at", since30).order("created_at", { ascending: false }).limit(20000)),
      r.count("published products", "products", (q) => q.eq("status", "published")),
      r.count("published websites", "sites", (q) => q.eq("status", "published")),
      r.rows<{ visitor_id: string | null }>("live now", "analytics_events", "visitor_id", (q) =>
        q.eq("event_type", "view").gte("created_at", isoMinutesAgo(5)).limit(5000)),
      r.count("paid plans", "subscriptions", (q) => q.in("status", ["active", "trialing"])),
    ])

  /* The creators behind the top list, by name. */
  const topIds = (top ?? []).map((t) => t.creatorId)
  const names = topIds.length
    ? await r.rows<{ id: string; slug: string | null; display_name: string | null }>("top creator names", "creators", "id, slug, display_name", (q) => q.in("id", topIds))
    : []

  const signupsByDay = new Map(dayRange(30).map((d) => [d, 0]))
  for (const s of signupRows ?? []) {
    const k = dayKey(s.created_at)
    if (signupsByDay.has(k)) signupsByDay.set(k, signupsByDay.get(k)! + 1)
  }

  const attention = await needsAttention(r)
  const t30 = last30?.totals
  const tAll = all?.totals

  return {
    figures: {
      gmvToday: todayTotals ? pick(todayTotals.totals, "completed").gross : null,
      gmv30: t30 ? pick(t30, "completed").gross : null,
      gmvAll: tAll ? pick(tAll, "completed").gross : null,
      fees30: t30 ? pick(t30, "completed").fees : null,
      feesAll: tAll ? pick(tAll, "completed").fees : null,
      ordersToday: todayTotals ? pick(todayTotals.totals, "completed").orders : null,
      orders30: t30 ? pick(t30, "completed").orders : null,
      ordersAll: tAll ? pick(tAll, "completed").orders : null,
      failed30: t30 ? pick(t30, "failed").orders : null,
      refunded30: t30 ? pick(t30, "refunded").orders : null,
      disputes: tAll ? pick(tAll, "disputed").orders : null,
      creators,
      newCreators30: newCreators,
      activeCreators30: active ? active.length : null,
      accounts,
      signups30: signupRows ? signupRows.length : null,
      publishedProducts,
      publishedSites,
      liveNow: live ? distinct(live, "visitor_id") : null,
      proSubscriptions: pro,
    },
    totalsFrom: all?.from ?? last30?.from ?? null,
    series: series
      ? { days: series.days, gmv: series.gross, orders: series.orders, signups: series.days.map((d) => signupsByDay.get(d) ?? 0) }
      : null,
    topCreators: top
      ? top.map((t) => {
          const ref = creatorRef((names ?? []).find((n) => n.id === t.creatorId) ?? { id: t.creatorId })
          return { id: t.creatorId, name: ref?.name ?? t.creatorId.slice(0, 8), handle: ref?.handle ?? "", orders: t.orders, gross: t.gross }
        })
      : null,
    attention,
  }
}

/**
 * The short list of things a person should look at today. Each is a count
 * with a link to the view that lists them; a count that could not be read
 * is left out here and shows up in that view's own problems instead.
 */
async function needsAttention(r: Reader): Promise<AttentionItem[]> {
  const week = isoDaysAgo(7)
  const [disputes, failedPayouts, overdueHolds, reports, failedDeploys, failedDomains, failedCampaigns, failedPayments] = await Promise.all([
    r.count("attention: disputes", "orders", (q) => q.eq("status", "disputed")),
    r.count("attention: failed payouts", "payouts", (q) => q.eq("status", "failed").gte("created_at", isoDaysAgo(30))),
    r.count("attention: overdue holds", "ledger_events", (q) => q.eq("event_type", "sale").is("released_at", null).lt("hold_until", isoDaysAgo(2))),
    r.count("attention: reports", "conversation_reports", (q) => q.eq("status", "open")),
    r.count("attention: failed deploys", "site_deployments", (q) => q.eq("status", "failed").gte("created_at", week)),
    r.count("attention: failed domains", "custom_domains", (q) => q.eq("status", "failed")),
    r.count("attention: failed campaigns", "email_campaigns", (q) => q.eq("status", "failed").gte("created_at", week)),
    r.count("attention: failed payments", "orders", (q) => q.eq("status", "failed").gte("created_at", isoDaysAgo(1))),
  ])

  const items: (AttentionItem | null)[] = [
    disputes ? { key: "disputes", label: disputes === 1 ? "Order in dispute" : "Orders in dispute", count: disputes, view: "orders", filter: "disputed" } : null,
    failedPayments ? { key: "payments", label: "Failed payments today", count: failedPayments, view: "orders", filter: "failed" } : null,
    failedPayouts ? { key: "payouts", label: failedPayouts === 1 ? "Payout failed this month" : "Payouts failed this month", count: failedPayouts, view: "payouts", filter: "failed" } : null,
    overdueHolds ? { key: "holds", label: "Holds past their release date", count: overdueHolds, view: "payouts" } : null,
    reports ? { key: "reports", label: reports === 1 ? "Open message report" : "Open message reports", count: reports, view: "people" } : null,
    failedDeploys ? { key: "deploys", label: "Website publishes failed this week", count: failedDeploys, view: "websites" } : null,
    failedDomains ? { key: "domains", label: "Domains failing", count: failedDomains, view: "websites", filter: "domains" } : null,
    failedCampaigns ? { key: "campaigns", label: "Email campaigns failed this week", count: failedCampaigns, view: "email" } : null,
  ]
  return items.filter((i): i is AttentionItem => i !== null)
}
