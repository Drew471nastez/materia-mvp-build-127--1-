/**
 * ===========================================================================
 *  SEVERAL COMMUNITIES' ANALYTICS, ADDED UP (round 43)
 * ===========================================================================
 * /app/analytics with Communities chosen shows a seller's communities
 * together (or one, by its switcher): members, joins and leaves, churn,
 * active members, posts, payments received, MRR, the busiest spaces. Each
 * community answers for itself (app/api/app/community/<id>/analytics,
 * lib/communities/server/analytics-report), and this adds those answers up,
 * so the figures here are each community's own figures, never counted a
 * second way.
 *
 *   counts      joins, leaves, posts, comments, reactions, visits: summed,
 *               bucket by bucket
 *   levels      members, MRR and paying members at the end of each bucket:
 *               summed too (each is a level of its own community)
 *   active      each community's distinct members, summed: someone active
 *               in two communities is two active members here
 *   rates       churn is the leaves of members there at the start over the
 *               members there were then, both added up; engagement is the
 *               members who took part over the members, both added up. A
 *               rate with nothing to divide by is none, never 0
 *   money       only communities reporting in one currency are added; one
 *               in another currency leaves `money` null with `currencies`
 *               saying why (lib/communities/membership-money moneyTotal)
 *   lists       spaces, posts, plans, join sources and reasons: merged,
 *               each row named with its community when there are several
 *
 * Pure: no clock, no database.
 */
import { rate, type CommunityReport, type Figure, type Line, type ReportRow } from "./analytics-report"

export interface Named {
  id: string
  name: string
  report: CommunityReport
}

export interface CombinedMoney {
  currency: string
  revenue: Figure
  mrr: Figure
  subscribers: Figure
  newPaid: Figure
  cancellations: Figure
  lines: { revenue: Line; mrr: Line; subscribers: Line }
  churnRate: number | null
  refunds: { count: number; totalCents: number }
  bySource: { key: string; cents: number }[]
  byPlan: { key: string; label: string; cents: number; paying: number; previous?: number; community: string }[]
  reasons: { reason: string; count: number }[]
  upgrades: number
  unconverted: number
}

export interface Combined {
  grain: CommunityReport["grain"]
  buckets: number
  figures: {
    members: Figure
    joined: Figure
    left: Figure
    churn: Figure
    active: Figure
    engagement: Figure
    posts: Figure
    comments: Figure
    reactions: Figure
    visits: Figure
  }
  lines: { members: Line; joined: Line; left: Line; active: Line; posts: Line; comments: Line; reactions: Line; visits: Line }
  live: { members: number; active1: number; active7: number; active30: number }
  /** Null when no community sells, or when they report in more than one currency (`currencies`). */
  money: CombinedMoney | null
  /** The currencies the selling communities report in. */
  currencies: string[]
  topSpaces: { key: string; label: string; posts: number; comments: number; community: string; slug: string }[]
  topPosts: { key: string; title: string; reactions: number; comments: number; community: string }[]
  joinSources: ReportRow[]
  leaveReasons: { reason: string; count: number }[]
  /** Each community's own headline figures, for the list and its report. */
  each: { id: string; name: string; members: number | null; joined: number | null; left: number | null; active: number | null; posts: number | null; visits: number | null; revenue: number | null; mrr: number | null; currency: string | null }[]
}

const addLines = (lines: Line[], n: number): Line => {
  const current = Array.from({ length: n }, (_, i) => (lines.some((l) => l.current[i] !== null && l.current[i] !== undefined) ? lines.reduce((t, l) => t + (l.current[i] ?? 0), 0) : null))
  const before = lines.every((l) => l.previous !== null) && lines.length > 0
  const previous = before ? Array.from({ length: n }, (_, i) => lines.reduce((t, l) => t + (l.previous?.[i] ?? 0), 0)) : null
  return { current, previous }
}

/** A count or level added up: null when no community counted it, the period before only when every one has it. */
const addFigures = (fs: Figure[]): Figure => {
  const counted = fs.filter((f) => f.value !== null)
  if (!counted.length) return { value: null, previous: null }
  return {
    value: counted.reduce((t, f) => t + (f.value ?? 0), 0),
    previous: counted.every((f) => f.previous !== null) ? counted.reduce((t, f) => t + (f.previous ?? 0), 0) : null,
  }
}

/** Members when the period began: its first bucket's end, less who joined in it, plus who left in it. */
const startOf = (r: CommunityReport, which: "current" | "previous"): number | null => {
  const m = r.lines.members[which]?.[0]
  if (m === null || m === undefined) return null
  return m - (r.lines.joined[which]?.[0] ?? 0) + (r.lines.left[which]?.[0] ?? 0)
}

/** A rate added up from its parts: the part each community's own rate stands for, over the wholes added. */
function weighted(list: CommunityReport[], rateOf: (r: CommunityReport) => number | null, wholeOf: (r: CommunityReport) => number | null): number | null {
  let part = 0
  let whole = 0
  for (const r of list) {
    const w = wholeOf(r)
    if (w === null || w <= 0) continue
    whole += w
    part += ((rateOf(r) ?? 0) / 100) * w
  }
  return rate(Math.round(part), whole)
}

const membersBeside = (r: CommunityReport, which: "value" | "previous") => {
  const m = r.figures.members[which]
  if (m === null) return null
  return Math.max(0, m - (r.ownerLeftOut ? 1 : 0))
}

const NO_FIGURE: Figure = { value: null, previous: null }
const NO_LINE: Line = { current: [], previous: null }

/**
 * An answer as this file reads it, whatever it lacks: one kept from an older
 * version, or a stand-in, has every figure, line and list, empty where it
 * had none, so a missing part is a dash and never a broken page.
 */
function whole(r: CommunityReport): CommunityReport {
  const figures = new Proxy((r.figures ?? {}) as CommunityReport["figures"], { get: (t, k) => (t as Record<string | symbol, Figure>)[k] ?? NO_FIGURE })
  const lines = new Proxy((r.lines ?? {}) as CommunityReport["lines"], { get: (t, k) => (t as Record<string | symbol, Line>)[k] ?? NO_LINE })
  const m = r.money
  const money = m
    ? {
        ...m,
        figures: new Proxy((m.figures ?? {}) as NonNullable<CommunityReport["money"]>["figures"], { get: (t, k) => (t as Record<string | symbol, Figure>)[k] ?? NO_FIGURE }),
        lines: new Proxy((m.lines ?? {}) as NonNullable<CommunityReport["money"]>["lines"], { get: (t, k) => (t as Record<string | symbol, Line>)[k] ?? NO_LINE }),
        bySource: m.bySource ?? [],
        reasons: m.reasons ?? [],
        refunds: m.refunds ?? { count: 0, totalCents: 0 },
        upgrades: m.upgrades ?? 0,
        churnRate: m.churnRate ?? null,
      }
    : null
  const buckets = typeof r.buckets === "number" ? r.buckets : Math.max(0, ...Object.values(r.lines ?? {}).map((l) => (l as Line)?.current?.length ?? 0))
  return { ...r, grain: r.grain ?? "day", buckets, figures, lines, money, topSpaces: r.topSpaces ?? [], topPosts: r.topPosts ?? [], joins: r.joins ?? { bySource: [], invites: [] }, leaveReasons: r.leaveReasons ?? [] }
}

export function combineReports(input: Named[]): Combined | null {
  if (!input.length) return null
  const list = input.map((x) => ({ ...x, report: whole(x.report) }))
  const reports = list.map((x) => x.report)
  const n = Math.max(...reports.map((r) => r.buckets))
  const several = list.length > 1
  const f = (k: keyof CommunityReport["figures"]) => addFigures(reports.map((r) => r.figures[k]))
  const l = (k: keyof CommunityReport["lines"]) => addLines(reports.map((r) => r.lines[k]), n)

  /* One community is its own figures, to the decimal; several are added up from their parts. */
  const one = reports.length === 1 ? reports[0] : null
  const churn: Figure = one ? one.figures.churn : {
    value: weighted(reports, (r) => r.figures.churn.value, (r) => startOf(r, "current")),
    previous: reports.every((r) => r.figures.churn.previous !== null || startOf(r, "previous") === null) ? weighted(reports, (r) => r.figures.churn.previous, (r) => startOf(r, "previous")) : null,
  }
  const engagement: Figure = one ? one.figures.engagement : {
    value: reports.some((r) => r.figures.engagement.value !== null) ? weighted(reports, (r) => r.figures.engagement.value, (r) => membersBeside(r, "value")) : null,
    previous: reports.some((r) => r.figures.engagement.previous !== null) ? weighted(reports, (r) => r.figures.engagement.previous, (r) => membersBeside(r, "previous")) : null,
  }

  /* Money: the selling communities, added up only in one currency. */
  const selling = list.filter((x) => x.report.money)
  const currencies = [...new Set(selling.map((x) => (x.report.money as NonNullable<CommunityReport["money"]>).currency.toLowerCase()))]
  let money: CombinedMoney | null = null
  if (selling.length && currencies.length === 1) {
    const ms = selling.map((x) => x.report.money as NonNullable<CommunityReport["money"]>)
    const mf = (k: "revenue" | "mrr" | "subscribers" | "newPaid" | "cancellations") => addFigures(ms.map((m) => m.figures[k]))
    const by = new Map<string, number>()
    for (const m of ms) for (const s of m.bySource) by.set(s.key, (by.get(s.key) ?? 0) + s.cents)
    const reasons = new Map<string, number>()
    for (const m of ms) for (const r of m.reasons) reasons.set(r.reason, (reasons.get(r.reason) ?? 0) + r.count)
    money = {
      currency: currencies[0],
      revenue: mf("revenue"),
      mrr: mf("mrr"),
      subscribers: mf("subscribers"),
      newPaid: mf("newPaid"),
      cancellations: mf("cancellations"),
      lines: { revenue: addLines(ms.map((m) => m.lines.revenue), n), mrr: addLines(ms.map((m) => m.lines.mrr), n), subscribers: addLines(ms.map((m) => m.lines.subscribers), n) },
      /* Paying at the start is what each churn rate divides: cancelled over it, added up. */
      churnRate: ms.length === 1 ? ms[0].churnRate : paidChurn(ms),
      refunds: { count: ms.reduce((t, m) => t + m.refunds.count, 0), totalCents: ms.reduce((t, m) => t + m.refunds.totalCents, 0) },
      bySource: [...by].map(([key, cents]) => ({ key, cents })).filter((x) => x.cents > 0).sort((a, b) => b.cents - a.cents),
      byPlan: selling
        .flatMap((x) => ((x.report.money as NonNullable<CommunityReport["money"]>).byPlan ?? []).map((p) => ({ ...p, key: `${x.id}:${p.key}`, community: several ? x.name : "" })))
        .sort((a, b) => b.cents - a.cents || b.paying - a.paying),
      reasons: [...reasons].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count),
      upgrades: ms.reduce((t, m) => t + m.upgrades, 0),
      unconverted: ms.reduce((t, m) => t + (m.unconverted ?? 0), 0),
    }
  }

  const sources = new Map<string, { value: number; previous?: number }>()
  for (const r of reports) for (const s of r.joins.bySource) {
    const x = sources.get(s.key) ?? { value: 0 }
    x.value += s.value
    sources.set(s.key, x)
  }
  const reasons = new Map<string, number>()
  for (const r of reports) for (const x of r.leaveReasons ?? []) reasons.set(x.reason, (reasons.get(x.reason) ?? 0) + x.count)

  return {
    grain: reports[0].grain,
    buckets: n,
    figures: {
      members: f("members"),
      joined: f("joined"),
      left: f("left"),
      churn,
      active: f("active"),
      engagement,
      posts: f("posts"),
      comments: f("comments"),
      reactions: f("reactions"),
      visits: f("visits"),
    },
    lines: { members: l("members"), joined: l("joined"), left: l("left"), active: l("active"), posts: l("posts"), comments: l("comments"), reactions: l("reactions"), visits: l("visits") },
    live: {
      members: reports.reduce((t, r) => t + (r.live?.members ?? 0), 0),
      active1: reports.reduce((t, r) => t + (r.live?.active1 ?? 0), 0),
      active7: reports.reduce((t, r) => t + (r.live?.active7 ?? 0), 0),
      active30: reports.reduce((t, r) => t + (r.live?.active30 ?? 0), 0),
    },
    money,
    currencies,
    topSpaces: list
      .flatMap((x) => x.report.topSpaces.map((s) => ({ key: `${x.id}:${s.id}`, label: s.name, posts: s.posts, comments: s.comments, community: several ? x.name : "", slug: s.slug })))
      .sort((a, b) => b.posts + b.comments - (a.posts + a.comments) || a.label.localeCompare(b.label)),
    topPosts: list
      .flatMap((x) => x.report.topPosts.map((p) => ({ key: `${x.id}:${p.id}`, title: p.title, reactions: p.reactions, comments: p.comments, community: several ? x.name : "" })))
      .sort((a, b) => b.reactions + b.comments - (a.reactions + a.comments)),
    joinSources: [...sources].map(([key, v]) => ({ key, label: key, value: v.value })).filter((r) => r.value > 0).sort((a, b) => b.value - a.value),
    leaveReasons: [...reasons].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count),
    each: list.map((x) => ({
      id: x.id,
      name: x.name,
      members: x.report.live?.members ?? x.report.figures.members.value,
      joined: x.report.figures.joined.value,
      left: x.report.figures.left.value,
      active: x.report.figures.active.value,
      posts: x.report.figures.posts.value,
      visits: x.report.figures.visits.value,
      revenue: x.report.money?.figures.revenue.value ?? null,
      mrr: x.report.money?.figures.mrr.value ?? null,
      currency: x.report.money?.currency ?? null,
    })),
  }
}

/**
 * Paid churn added up: each community's rate stands for cancelled over paying at the start; paying at the start is
 * the paying members at the end, less who started paying, plus who cancelled.
 */
function paidChurn(ms: NonNullable<CommunityReport["money"]>[]): number | null {
  let cancelled = 0
  let atStart = 0
  for (const m of ms) {
    const start = (m.figures.subscribers.value ?? 0) - (m.figures.newPaid.value ?? 0) + (m.figures.cancellations.value ?? 0)
    if (start <= 0 || m.churnRate === null) continue
    atStart += start
    cancelled += Math.round((m.churnRate / 100) * start)
  }
  return rate(cancelled, atStart)
}

