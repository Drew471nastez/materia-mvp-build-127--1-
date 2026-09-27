/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  THE REPORTS UNDER THE ANALYTICS CHART
 * ═══════════════════════════════════════════════════════════════════════════
 * Every card under the chart is worked out here, from the rows the server
 * read, with no clock and no browser of its own. app/api/analytics/reports
 * feeds it; tests/analytics-reports.test.ts checks it.
 *
 * THE RULES, so the numbers agree with each other:
 *
 *   A session is one visit: one analytics session id (30 minutes without a
 *   page, see lib/analytics-utils). A view with no session id counts as its
 *   visitor's visit for that day, and one with neither counts once.
 *
 *   A session is described by its FIRST page: where it came from, which
 *   device, which country, which page it landed on. Five pages in one visit
 *   from Instagram is one Instagram session, not five.
 *
 *   An order is one payment (lib/orders/order-view groups a basket's rows).
 *   Failed and pending payments are not orders. Money is what was charged
 *   less what was refunded, read from the rows' own amounts (moneyOf).
 *
 *   Every figure is compared with the period the comparison picker names,
 *   bucket by bucket on its own calendar, and nothing is ever filled in: an
 *   empty day is zero, an unknown device is "Unknown", a country nobody
 *   recorded is not a country.
 *
 * The chart at the top of the page reads the same object, so the numbers
 * on its tabs and the cards under it cannot disagree.
 */

import { groupOrders, isSale, startOfDay, type OrderRow } from "../orders/order-view"
import { isInternalReferrer } from "./sources"
import { isOnePageHost } from "@/lib/onepage/address"
import { bucketIndex, bucketLabel, bucketStarts, grainFor, previousWindow, spansToRead, type Grain, type Span } from "./buckets"

export { bucketStarts, grainFor, previousWindow, spansToRead, type Grain, type Span }

export interface ViewRow {
  id?: string
  session_id?: string | null
  visitor_id?: string | null
  product_id?: string | null
  created_at: string
  source_category?: string | null
  referrer_domain?: string | null
  country_code?: string | null
  country_name?: string | null
  city?: string | null
  device_type?: string | null
  browser?: string | null
  os?: string | null
  page_url?: string | null
  utm_campaign?: string | null
}

export interface StepRow {
  event_type: string
  session_id?: string | null
  visitor_id?: string | null
  product_id?: string | null
  created_at: string
}

export interface Series {
  labels: string[]
  current: number[]
  previous: number[]
}

export interface Headline {
  value: number
  previous: number
  /** Fraction, 0.12 for +12%. Null when there was nothing before to compare with. */
  change: number | null
}

export interface BreakdownRow {
  key: string
  label: string
  value: number
  previous: number
  /** Share of the card's total, 0..1. */
  share: number
  extra?: { orders?: number; salesCents?: number; code?: string }
}

export interface Reports {
  grain: Grain
  /**
   * The figures and the order cards only: the visit lists and the funnel are
   * still being counted. The page's first, quick answer (app/api/analytics/
   * reports streams it ahead of the rest); the lists wait in their shapes.
   */
  partial?: boolean
  /** False when the picker says No comparison: every `previous` is then empty. */
  compared: boolean
  /** Page views: every page opened, one per page per visitor per half hour (app/api/track-view). */
  views: Headline & { series: Series }
  sessions: Headline & { series: Series }
  conversion: Headline & { series: Series }
  aov: Headline & { series: Series }
  sales: Headline & { series: Series }
  orders: Headline & { series: Series }
  /** Orders placed in each bucket that have since been refunded, in whole or part. */
  refunds: { series: Series }
  salesByChannel: BreakdownRow[]
  salesByProduct: BreakdownRow[]
  funnel: Array<{ key: "sessions" | "buy" | "checkout" | "orders"; label: string; value: number; previous: number; rate: number }>
  breakdowns: {
    source: BreakdownRow[]
    referrer: BreakdownRow[]
    social: BreakdownRow[]
    campaign: BreakdownRow[]
    country: BreakdownRow[]
    city: BreakdownRow[]
    device: BreakdownRow[]
    browser: BreakdownRow[]
    os: BreakdownRow[]
    landing: BreakdownRow[]
    channel: BreakdownRow[]
  }
}

const HOUR = 3_600_000
const DAY = 24 * HOUR

/** Sales by product's one row for every product the creator has deleted. */
export const REMOVED_PRODUCT = "removed"

/* ─── Sessions ────────────────────────────────────────────────────────── */

export function sessionKey(v: ViewRow, timeZone: string): string {
  if (v.session_id) return `s:${v.session_id}`
  if (v.visitor_id) return `v:${v.visitor_id}:${startOfDay(Date.parse(v.created_at), timeZone)}`
  return `e:${v.id ?? v.created_at}`
}

interface Session {
  key: string
  at: number
  first: ViewRow
}

/** One entry per visit, described by its first page. */
export function sessionsOf(views: ViewRow[], w: Span, timeZone: string): Session[] {
  const byKey = new Map<string, Session>()
  for (const v of views) {
    const at = Date.parse(v.created_at)
    if (!(at >= w.start && at < w.end)) continue
    const key = sessionKey(v, timeZone)
    const seen = byKey.get(key)
    if (!seen || at < seen.at) byKey.set(key, { key, at, first: v })
  }
  return [...byKey.values()]
}

/* ─── Labels ──────────────────────────────────────────────────────────── */

const SOURCE_LABEL: Record<string, string> = {
  direct: "Direct",
  organic_search: "Search",
  paid_search: "Paid search",
  paid: "Paid",
  email: "Email",
  affiliate: "Affiliate",
  referral: "Referral",
  social: "Social",
}

const SOCIAL_LABEL: Record<string, string> = {
  instagram: "Instagram",
  tiktok: "TikTok",
  facebook: "Facebook",
  x: "X",
  youtube: "YouTube",
  pinterest: "Pinterest",
  linkedin: "LinkedIn",
  snapchat: "Snapchat",
  reddit: "Reddit",
  threads: "Threads",
  whatsapp: "WhatsApp",
  telegram: "Telegram",
  discord: "Discord",
  twitch: "Twitch",
  bluesky: "Bluesky",
  tumblr: "Tumblr",
}

export function sourceGroup(category: string | null | undefined): string {
  const c = (category || "direct").toLowerCase()
  return c.startsWith("social") ? "social" : c in SOURCE_LABEL ? c : "referral"
}

export function socialNetwork(category: string | null | undefined): string | null {
  const c = (category || "").toLowerCase()
  if (!c.startsWith("social_")) return c === "social" ? "other" : null
  return c.slice("social_".length)
}

function titleCase(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase())
}

function deviceLabel(d: string | null | undefined): string {
  const v = (d || "").toLowerCase()
  if (v === "mobile") return "Mobile"
  if (v === "desktop") return "Desktop"
  if (v === "tablet") return "Tablet"
  return "Unknown"
}

export function countryName(code: string, stored?: string | null): string {
  if (stored && stored.length > 2) return stored
  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(code) || code
  } catch {
    return code
  }
}

function hostOf(url: string | null | undefined): string | null {
  if (!url) return null
  try {
    return new URL(url).hostname.toLowerCase()
  } catch {
    return null
  }
}

/**
 * Storelib or the creator's own website, from the address the visit landed
 * on: storelib.com is Storelib, a subdomain of it or any other domain is the
 * website the creator built.
 */
export function channelOfUrl(url: string | null | undefined, mainDomain: string): "storelib" | "website" | null {
  const host = hostOf(url)
  if (!host) return null
  const main = mainDomain.toLowerCase().replace(/^www\./, "")
  if (host === main || host === `www.${main}` || isOnePageHost(host) || host === "localhost" || host.endsWith(".vercel.app")) return "storelib"
  return "website"
}

function landingPath(url: string | null | undefined, mainDomain: string): string | null {
  if (!url) return null
  try {
    const u = new URL(url)
    const path = u.pathname.replace(/\/+$/, "") || "/"
    return channelOfUrl(url, mainDomain) === "website" ? `${u.hostname}${path === "/" ? "" : path}` : path
  } catch {
    return null
  }
}

/* ─── Breakdowns ──────────────────────────────────────────────────────── */

/**
 * VISITS IN GROUPS. A breakdown reads a few columns of each visit's first
 * page, so visits that agree on those columns are one group with a count.
 * Counting a group of twelve adds twelve, exactly as twelve visits one by one
 * did, and the groups come in the order of their earliest visit, so the
 * first label a card sees for a key is the one it always saw. The database
 * can hand over these groups (analytics_visit_tally) instead of every row.
 */
export interface VisitGroup {
  first: ViewRow
  n: number
}

type Keyer = (s: { first: ViewRow }) => { key: string; label: string } | null

function breakdown(current: VisitGroup[], previous: VisitGroup[], keyer: Keyer, limit = 25): BreakdownRow[] {
  const now = new Map<string, { label: string; value: number }>()
  const before = new Map<string, number>()
  for (const s of current) {
    const k = keyer(s)
    if (!k) continue
    const row = now.get(k.key)
    if (row) row.value += s.n
    else now.set(k.key, { label: k.label, value: s.n })
  }
  for (const s of previous) {
    const k = keyer(s)
    if (k) before.set(k.key, (before.get(k.key) ?? 0) + s.n)
  }
  const total = [...now.values()].reduce((n, r) => n + r.value, 0)
  return [...now.entries()]
    .map(([key, r]) => ({ key, label: r.label, value: r.value, previous: before.get(key) ?? 0, share: total ? r.value / total : 0 }))
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label))
    .slice(0, limit)
}

function headline(value: number, previous: number): Headline {
  return { value, previous, change: previous > 0 ? (value - previous) / previous : null }
}

/* ─── The breakdowns every kind of page shares ─────────────────────────── */

export function referrerKeyer(mainDomain: string): Keyer {
  return (s) => {
    const d = (s.first.referrer_domain || "").trim().toLowerCase().replace(/^www\./, "")
    if (!d || d === "direct") return null
    /* A whole host, not a suffix: "mystorelib.com" is somebody else's site. */
    const self = channelOfUrl(`https://${d}`, mainDomain) === "storelib" || isInternalReferrer(d, mainDomain)
    return self ? null : { key: d, label: d }
  }
}

const keyCountry: Keyer = (s) =>
  s.first.country_code && s.first.country_code !== "XX"
    ? { key: s.first.country_code.toUpperCase(), label: countryName(s.first.country_code.toUpperCase(), s.first.country_name) }
    : null

function visitBreakdowns(now: VisitGroups, before: VisitGroups, mainDomain: string) {
  return {
    source: breakdown(now.source, before.source, (s) => {
      const g = sourceGroup(s.first.source_category)
      return { key: g, label: SOURCE_LABEL[g] }
    }),
    referrer: breakdown(now.referrer, before.referrer, referrerKeyer(mainDomain)),
    social: breakdown(now.source, before.source, (s) => {
      const n = socialNetwork(s.first.source_category)
      return n ? { key: n, label: SOCIAL_LABEL[n] ?? (n === "other" ? "Other social" : titleCase(n)) } : null
    }),
    campaign: breakdown(now.campaign, before.campaign, (s) => {
      const c = (s.first.utm_campaign || "").trim()
      return c ? { key: c.toLowerCase(), label: c } : null
    }),
    country: breakdown(now.country, before.country, keyCountry).map((r) => ({ ...r, extra: { code: r.key } })),
    city: breakdown(now.city, before.city, (s) => {
      const c = (s.first.city || "").trim()
      if (!c) return null
      let city = c
      try {
        city = decodeURIComponent(c)
      } catch {
        /* Stored plain. */
      }
      const cc = (s.first.country_code || "").toUpperCase()
      return { key: `${city}|${cc}`, label: cc ? `${city}, ${countryName(cc, s.first.country_name)}` : city }
    }),
    device: breakdown(now.device, before.device, (s) => {
      const d = deviceLabel(s.first.device_type)
      return { key: d.toLowerCase(), label: d }
    }),
    browser: breakdown(now.browser, before.browser, (s) => {
      const b = (s.first.browser || "").trim()
      return { key: (b || "unknown").toLowerCase(), label: b ? titleCase(b) : "Unknown" }
    }),
    os: breakdown(now.os, before.os, (s) => {
      const o = (s.first.os || "").trim()
      return { key: (o || "unknown").toLowerCase(), label: o || "Unknown" }
    }),
  }
}

/* ─── Visits, counted ─────────────────────────────────────────────────── */

/** What each breakdown reads of a visit's first page, and nothing else. */
export const GROUP_COLUMNS = {
  source: ["source_category"],
  referrer: ["referrer_domain"],
  campaign: ["utm_campaign"],
  country: ["country_code", "country_name"],
  city: ["city", "country_code", "country_name"],
  device: ["device_type"],
  browser: ["browser"],
  os: ["os"],
  page: ["page_url"],
} as const satisfies Record<string, ReadonlyArray<keyof ViewRow>>

export type VisitGroupKind = keyof typeof GROUP_COLUMNS
export type VisitGroups = Record<VisitGroupKind, VisitGroup[]>

/**
 * ONE WINDOW'S VISITS, COUNTED: everything the page needs from the view and
 * step rows. Worked out here from the rows (tallyVisits), or by the database
 * from the same rows by the same rules (analytics_visit_tally, read back by
 * talliesFromWire), and either way handed to the same buildReports.
 */
export interface VisitTally {
  /** Page views in the window, and per bucket of the chart. */
  views: number
  viewBuckets: number[]
  /** Visits (sessionsOf) in the window, and per bucket, by when each began. */
  sessions: number
  sessionBuckets: number[]
  /** Visits that pressed Buy, and that reached the checkout. Absent from a quick first answer. */
  steps?: { buy: number; checkout: number }
  /** The visits in groups, earliest visit first (groupVisits). Absent from a quick first answer. */
  groups?: VisitGroups
}

export interface VisitTallies {
  cur: VisitTally
  prev: VisitTally
}

/** Visits in groups, per breakdown, in the order of each group's earliest visit. */
export function groupVisits(sessions: Array<{ first: ViewRow }>): VisitGroups {
  const out = {} as VisitGroups
  for (const kind of Object.keys(GROUP_COLUMNS) as VisitGroupKind[]) {
    const cols = GROUP_COLUMNS[kind] as ReadonlyArray<keyof ViewRow>
    const byTuple = new Map<string, VisitGroup>()
    for (const s of sessions) {
      const tuple = cols.length === 1 ? String(s.first[cols[0]] ?? "\u0000") : JSON.stringify(cols.map((c) => s.first[c] ?? null))
      const g = byTuple.get(tuple)
      if (g) g.n++
      else {
        const first = { created_at: s.first.created_at } as ViewRow
        for (const c of cols) (first as unknown as Record<string, unknown>)[c] = s.first[c] ?? null
        byTuple.set(tuple, { first, n: 1 })
      }
    }
    out[kind] = [...byTuple.values()]
  }
  return out
}

/** The step rows' visits: each step counted once per visit. */
function stepVisits(steps: StepRow[], type: string, w: Span, timeZone: string): number {
  const keys = new Set<string>()
  for (const s of steps) {
    if (s.event_type !== type) continue
    const at = Date.parse(s.created_at)
    if (!(at >= w.start && at < w.end)) continue
    keys.add(sessionKey({ ...s, created_at: s.created_at }, timeZone))
  }
  return keys.size
}

/**
 * The two windows' visits, counted from the rows, by the rules at the top of
 * this file. The database's analytics_visit_tally is this function in SQL.
 */
export function tallyVisits(input: { views: ViewRow[]; steps: StepRow[]; window: Span; previous?: Span | null; timeZone: string }): VisitTallies {
  const { views, steps, window: cur, timeZone } = input
  const { starts, prev, prevStarts, compared } = periodsOf(cur, input.previous, timeZone)
  const n = starts.length
  const one = (w: Span, bucketStartsOf: number[]): VisitTally => {
    const sessions = sessionsOf(views, w, timeZone)
    const viewTimes: Array<{ at: number }> = []
    for (const v of views) {
      const at = Date.parse(v.created_at)
      if (at >= w.start && at < w.end) viewTimes.push({ at })
    }
    return {
      views: viewTimes.length,
      viewBuckets: bucketCounts(viewTimes, bucketStartsOf, w, n),
      sessions: sessions.length,
      sessionBuckets: bucketCounts(sessions.map((s) => ({ at: s.at })), bucketStartsOf, w, n),
      steps: { buy: stepVisits(steps, "buy_click", w, timeZone), checkout: stepVisits(steps, "checkout_start", w, timeZone) },
      groups: groupVisits(sessions),
    }
  }
  return { cur: one(cur, starts), prev: compared ? one(prev, prevStarts) : one(prev, []) }
}

/**
 * WHAT THE DATABASE IS ASKED (analytics_visit_tally's arguments): the two
 * windows and the very bucket starts this file draws, so the database never
 * works out a calendar of its own.
 */
export function tallyArgs(window: Span, previous: Span | null | undefined, timeZone: string) {
  const { starts, prev, prevStarts } = periodsOf(window, previous, timeZone)
  return {
    p_time_zone: timeZone,
    p_cur_start: window.start,
    p_cur_end: window.end,
    p_prev_start: prev.start,
    p_prev_end: prev.end,
    p_cur_starts: starts,
    p_prev_starts: prevStarts,
  }
}

type WireGroup = Array<string | number | null>
interface WireTally {
  views: number
  view_buckets: number[]
  sessions: number
  session_buckets: number[]
  steps?: { buy: number; checkout: number } | null
  groups?: Partial<Record<VisitGroupKind, WireGroup[]>> | null
}

/**
 * The database's answer, as the tallies above. Each group comes as its
 * columns (GROUP_COLUMNS order), its count and the rank of its earliest
 * visit; sorted by that rank they are in the order tallyVisits makes.
 */
export function talliesFromWire(wire: { cur: WireTally; prev: WireTally }, detail: boolean): VisitTallies {
  const one = (t: WireTally): VisitTally => {
    const out: VisitTally = {
      views: Number(t.views) || 0,
      viewBuckets: (t.view_buckets ?? []).map(Number),
      sessions: Number(t.sessions) || 0,
      sessionBuckets: (t.session_buckets ?? []).map(Number),
    }
    if (!detail) return out
    out.steps = { buy: Number(t.steps?.buy) || 0, checkout: Number(t.steps?.checkout) || 0 }
    const groups = {} as VisitGroups
    for (const kind of Object.keys(GROUP_COLUMNS) as VisitGroupKind[]) {
      const cols = GROUP_COLUMNS[kind] as ReadonlyArray<keyof ViewRow>
      const rows = [...(t.groups?.[kind] ?? [])].sort((a, b) => Number(a[cols.length + 1]) - Number(b[cols.length + 1]))
      groups[kind] = rows.map((r) => {
        const first = { created_at: "" } as ViewRow
        cols.forEach((c, i) => ((first as unknown as Record<string, unknown>)[c] = r[i] ?? null))
        return { first, n: Number(r[cols.length]) || 0 }
      })
    }
    out.groups = groups
    return out
  }
  return { cur: one(wire.cur), prev: one(wire.prev) }
}

/* ─── Everything ──────────────────────────────────────────────────────── */

/**
 * THE TWO PERIODS AND THEIR BUCKETS.
 *
 * The period before is the one the comparison picker names, handed in by the
 * page (lib/date-range/range compareBounds): the previous period, the same
 * days a year earlier, a custom range, or none. It used to be fixed here as
 * "the same length just before", whatever the picker said, and with a period
 * that runs to now that length is not whole days: at 3pm on the seventh day
 * of "Last 7 days" the period before started at 9am, so every dashed point
 * was a day shifted by six hours.
 *
 * Bucket i of the comparison is bucket i of its own period, counted on its
 * own calendar: the same hour of yesterday, the same day of last year.
 */
export function periodsOf(cur: Span, previous: Span | null | undefined, timeZone: string) {
  const prev = previous === undefined ? previousWindow(cur) : previous
  const grain = grainFor(cur)
  const starts = bucketStarts(cur, grain, timeZone)
  const labels = starts.map((s) => bucketLabel(s, grain, timeZone))
  /* No comparison: an empty span, so everything before counts nothing. */
  const before: Span = prev ?? { start: cur.start, end: cur.start }
  const prevStarts = prev ? bucketStarts(prev, grain, timeZone) : []
  return { grain, starts, labels, prev: before, prevStarts, compared: !!prev }
}

/**
 * Counts per bucket. The comparison has as many buckets as the period,
 * padded with nothing where it is shorter, and a longer one is cut at the
 * period's length (its whole length still counts in the headline).
 */
function bucketCounts(items: Array<{ at: number; n?: number }>, starts: number[], w: Span, length: number): number[] {
  const out = Array.from({ length }, () => 0)
  if (starts.length === 0) return out
  for (const item of items) {
    if (!(item.at >= w.start && item.at < w.end)) continue
    const i = bucketIndex(starts, item.at)
    if (i >= 0 && i < length) out[i] += item.n ?? 1
  }
  return out
}

type Grouped = ReturnType<typeof groupOrders>[number]

/**
 * WHAT A PAYMENT BROUGHT IN, FROM ITS OWN LINES.
 *
 * A row's `amount_cents` is what Stripe charged, the tip included (it is
 * the session's `amount_total`), and the tip is ALSO kept on its own in
 * `tip_cents`. The order view adds the two, so every tip was counted twice
 * in Sales and in the average order. Money here is the lines' amounts, less
 * what was refunded on each, never below nothing.
 */
export function moneyOf(o: Grouped): { gross: number; refunded: number; net: number } {
  let gross = 0
  let refunded = 0
  for (const line of o.lines) {
    const m = lineMoney(line)
    gross += m.gross
    refunded += m.refunded
  }
  return { gross, refunded, net: Math.max(0, gross - refunded) }
}

/**
 * ONE LINE'S MONEY, the unit moneyOf adds up. Sales by product reads the
 * same function, so its rows add up to Total sales: it used to keep only
 * lines marked completed or refunded, with its own copy of the refund rule,
 * while the total counted every line of the payment.
 */
export function lineMoney(line: OrderRow): { gross: number; refunded: number; net: number } {
  const gross = Math.max(0, line.amount_cents || 0)
  let refunded = 0
  if (line.status === "refunded") {
    const recorded = line.refund_amount_cents
    refunded = typeof recorded === "number" && recorded > 0 ? Math.min(recorded, gross) : gross
  }
  return { gross, refunded, net: gross - refunded }
}

export function buildReports(input: {
  /** The rows, counted here (tallyVisits); or `visits`, already counted by the database. */
  views?: ViewRow[]
  steps?: StepRow[]
  visits?: VisitTallies
  orders: OrderRow[]
  window: Span
  /** What the period is compared with: null for no comparison, left out for the period just before. */
  previous?: Span | null
  timeZone: string
  mainDomain: string
  productTitles: Record<string, string>
}): Reports {
  const { window: cur, timeZone, mainDomain } = input
  const { grain, starts, labels, prev, prevStarts, compared } = periodsOf(cur, input.previous, timeZone)
  const n = starts.length

  /* The visits, counted once: from the rows here, or as the database counted them. */
  const visits = input.visits ?? tallyVisits({ views: input.views ?? [], steps: input.steps ?? [], window: cur, previous: input.previous, timeZone })
  const now = visits.cur
  const then = visits.prev
  /* A quick first answer has the figures and not yet the visit lists or the funnel. */
  const partial = !now.groups || !then.groups || !now.steps || !then.steps

  /* Orders: one per payment, failed, pending and disputed left out (isSale). */
  const allOrders = groupOrders(input.orders).filter(isSale)
  const inWindow = (o: { createdAt: string }, w: Span) => {
    const at = Date.parse(o.createdAt)
    return at >= w.start && at < w.end
  }
  const ordersNow = allOrders.filter((o) => inWindow(o, cur))
  const ordersBefore = allOrders.filter((o) => inWindow(o, prev))
  const net = (o: Grouped) => moneyOf(o).net
  const paid = (list: Grouped[]) => list.filter((o) => moneyOf(o).gross > 0)

  /** A series from what happened, in the period and the one before. */
  const series = (items: (w: Span) => Array<{ at: number; n?: number }>): Series => ({
    labels,
    current: bucketCounts(items(cur), starts, cur, n),
    previous: compared ? bucketCounts(items(prev), prevStarts, prev, n) : [],
  })

  /* Visits and page views per bucket, as tallied: the same counts series() makes from times. */
  const tallied = (a: VisitTally, b: VisitTally, pick: (t: VisitTally) => number[]): Series => ({
    labels,
    current: pick(a),
    previous: compared ? pick(b) : [],
  })
  const sessionSeries = tallied(now, then, (t) => t.sessionBuckets)
  const viewSeries = tallied(now, then, (t) => t.viewBuckets)
  const orderTimes = (list: Grouped[]) => list.map((o) => ({ at: Date.parse(o.createdAt) }))
  const orderSeries = series((w) => orderTimes(w === cur ? ordersNow : ordersBefore))
  const salesSeries = series((w) => (w === cur ? ordersNow : ordersBefore).map((o) => ({ at: Date.parse(o.createdAt), n: net(o) })))
  const refundSeries = series((w) =>
    (w === cur ? ordersNow : ordersBefore).filter((o) => moneyOf(o).refunded > 0).map((o) => ({ at: Date.parse(o.createdAt) })),
  )
  const ratio = (a: number[], b: number[]) => a.map((o, i) => (b[i] ? o / b[i] : 0))
  const conversionSeries: Series = {
    labels,
    current: ratio(orderSeries.current, sessionSeries.current),
    previous: ratio(orderSeries.previous, sessionSeries.previous),
  }
  const aovSeries: Series = (() => {
    const sums = series((w) => paid(w === cur ? ordersNow : ordersBefore).map((o) => ({ at: Date.parse(o.createdAt), n: moneyOf(o).gross })))
    const counts = series((w) => orderTimes(paid(w === cur ? ordersNow : ordersBefore)))
    return { labels, current: ratio(sums.current, counts.current), previous: ratio(sums.previous, counts.previous) }
  })()
  const aov = (list: Grouped[]) => {
    const p = paid(list)
    return p.length ? p.reduce((sum, o) => sum + moneyOf(o).gross, 0) / p.length : 0
  }

  const rate = (o: number, s: number) => (s > 0 ? o / s : 0)
  const head = (value: number, previous: number) => (compared ? headline(value, previous) : { value, previous: 0, change: null })

  /**
   * SALES BY CHANNEL: where each payment was made, and every payment is in
   * it. Two things emptied this card while orders were plainly there:
   *
   *   A channel whose money came to nothing was dropped, so a period of free
   *   downloads, or of orders all refunded, showed "No sales" beside a
   *   product list full of them. A channel is listed when it has orders.
   *
   *   An order from before the source was written down had no channel, and
   *   was put under "Not recorded". The checkout calls a sale Storelib unless
   *   a website's Buy button says otherwise (lib/orders/order-source), and a
   *   basket is always a website's, which the order view already knows: an
   *   order with nothing recorded is a Storelib sale by that same rule.
   *
   * The ring is shared out by money, or by orders when the money is nothing.
   */
  const channelRows: BreakdownRow[] = (() => {
    const label = { website: "Website", storelib: "Storelib" } as const
    const tally = (list: Grouped[]) => {
      const m = new Map<keyof typeof label, { cents: number; orders: number }>()
      for (const o of list) {
        const k: keyof typeof label = o.source === "website" ? "website" : "storelib"
        const row = m.get(k) ?? { cents: 0, orders: 0 }
        row.cents += net(o)
        row.orders += 1
        m.set(k, row)
      }
      return m
    }
    const now = tally(ordersNow)
    const before = tally(ordersBefore)
    const cents = [...now.values()].reduce((sum, v) => sum + v.cents, 0)
    const count = [...now.values()].reduce((sum, v) => sum + v.orders, 0)
    return [...now.entries()]
      .map(([k, v]) => ({
        key: k,
        label: label[k],
        value: v.cents,
        previous: before.get(k)?.cents ?? 0,
        share: cents > 0 ? v.cents / cents : count > 0 ? v.orders / count : 0,
        extra: { orders: v.orders },
      }))
      .sort((a, b) => b.value - a.value || (b.extra.orders ?? 0) - (a.extra.orders ?? 0))
  })()

  /* Sales by product: each product's own line of each payment, by the rule
     Total sales is counted with (lineMoney), so the two agree. A product
     the creator has deleted keeps its sales, in one "Removed product" row:
     its orders stay, with no product once supabase/sql/run-now part 32 has
     run, and with the id of a product that is gone before it. */
  const productRows = (() => {
    const keyOf = (id: string | null | undefined) => (id && input.productTitles[id] ? id : REMOVED_PRODUCT)
    const tally = (list: Grouped[]) => {
      const m = new Map<string, { cents: number; units: number }>()
      for (const o of list) {
        for (const line of o.lines) {
          const key = keyOf(line.product_id)
          const row = m.get(key) ?? { cents: 0, units: 0 }
          row.cents += lineMoney(line).net
          row.units += 1
          m.set(key, row)
        }
      }
      return m
    }
    const now = tally(ordersNow)
    const before = tally(ordersBefore)
    const total = [...now.values()].reduce((sum, v) => sum + v.cents, 0)
    return [...now.entries()]
      .map(([id, v]) => ({
        key: id,
        label: id === REMOVED_PRODUCT ? "Removed product" : input.productTitles[id],
        value: v.cents,
        previous: before.get(id)?.cents ?? 0,
        share: total ? v.cents / total : 0,
        extra: { orders: v.units },
      }))
      .sort((a, b) => b.value - a.value || (b.extra.orders ?? 0) - (a.extra.orders ?? 0))
      .slice(0, 8)
  })()

  /* The funnel, counted in visits: each step once per visit (tallyVisits). */
  const funnelRaw = [
    { key: "sessions" as const, label: "Sessions", value: now.sessions, previous: then.sessions },
    { key: "buy" as const, label: "Pressed Buy", value: now.steps?.buy ?? 0, previous: then.steps?.buy ?? 0 },
    { key: "checkout" as const, label: "Reached checkout", value: now.steps?.checkout ?? 0, previous: then.steps?.checkout ?? 0 },
    { key: "orders" as const, label: "Ordered", value: ordersNow.length, previous: ordersBefore.length },
  ]
  const funnel = partial ? [] : funnelRaw.map((f) => ({ ...f, rate: rate(f.value, now.sessions) }))

  /*
    Country: visits, and the orders and money from buyers there.

    EVERY COUNTRY FIRST, THEN THE TOP 25. The visits were cut to 25 before
    the orders were added, so a country outside those 25 that had orders
    came back as a new row saying 0 visits, beside a country that had them.
  */
  const countryRows = (() => {
    /* A quick first answer has no visit lists yet: the card waits for the whole answer. */
    if (partial || !now.groups || !then.groups) return []
    const rows = breakdown(now.groups.country, then.groups.country, keyCountry, Infinity)
    const byCode = new Map(rows.map((r) => [r.key, r]))
    for (const o of ordersNow) {
      const code = (o.lines[0].buyer_country_code || "").toUpperCase()
      if (!code || code === "XX") continue
      let row = byCode.get(code)
      if (!row) {
        row = { key: code, label: countryName(code, o.lines[0].buyer_country), value: 0, previous: 0, share: 0 }
        byCode.set(code, row)
        rows.push(row)
      }
      row.extra = {
        code,
        orders: (row.extra?.orders ?? 0) + 1,
        salesCents: (row.extra?.salesCents ?? 0) + net(o),
      }
    }
    for (const r of rows) r.extra = { code: r.key, orders: r.extra?.orders ?? 0, salesCents: r.extra?.salesCents ?? 0 }
    return rows.sort((a, b) => b.value - a.value || (b.extra?.orders ?? 0) - (a.extra?.orders ?? 0)).slice(0, 25)
  })()

  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)

  const noGroups = { source: [], referrer: [], campaign: [], country: [], city: [], device: [], browser: [], os: [], page: [] } satisfies VisitGroups
  const groupsNow = now.groups ?? noGroups
  const groupsThen = then.groups ?? noGroups

  return {
    grain,
    compared,
    ...(partial ? { partial: true } : {}),
    views: { ...head(now.views, then.views), series: viewSeries },
    sessions: { ...head(now.sessions, then.sessions), series: sessionSeries },
    conversion: { ...head(rate(ordersNow.length, now.sessions), rate(ordersBefore.length, then.sessions)), series: conversionSeries },
    aov: { ...head(aov(ordersNow), aov(ordersBefore)), series: aovSeries },
    sales: { ...head(sum(ordersNow.map(net)), sum(ordersBefore.map(net))), series: salesSeries },
    orders: { ...head(ordersNow.length, ordersBefore.length), series: orderSeries },
    refunds: { series: refundSeries },
    salesByChannel: channelRows,
    salesByProduct: productRows,
    funnel,
    breakdowns: {
      ...visitBreakdowns(groupsNow, groupsThen, mainDomain),
      country: countryRows,
      landing: breakdown(groupsNow.page, groupsThen.page, (s) => {
        const p = landingPath(s.first.page_url, mainDomain)
        return p ? { key: p, label: p } : null
      }),
      channel: breakdown(groupsNow.page, groupsThen.page, (s) => {
        const c = channelOfUrl(s.first.page_url, mainDomain)
        return c ? { key: c, label: c === "website" ? "Website" : "Storelib" } : { key: "unknown", label: "Not recorded" }
      }),
    },
  }
}

/* ─── OnePage ──────────────────────────────────────────────────────────── */

export interface OnePageViewRow {
  id?: string
  visitor_id?: string | null
  referrer?: string | null
  user_agent?: string | null
  country_code?: string | null
  country_name?: string | null
  created_at: string
}

export interface OnePageClickRow {
  block_id: string
  url?: string | null
  visitor_id?: string | null
  created_at: string
}

export interface OnePageLeadRow {
  created_at: string
}

export interface OnePageReports {
  grain: Grain
  compared: boolean
  views: Headline & { series: Series }
  clicks: Headline & { series: Series }
  ctr: Headline & { series: Series }
  subscribers: Headline & { series: Series }
  links: BreakdownRow[]
  breakdowns: ReturnType<typeof visitBreakdowns>
}

/**
 * A OnePage view is already one per visitor per day (app/api/onepage/track),
 * so each is a visit. Its source, device and browser are read from what it
 * kept: the referrer and the browser's signature, by the same rules a
 * Storelib page view is named with (lib/analytics/sources, user-agent).
 */
export function buildOnePageReports(input: {
  views: OnePageViewRow[]
  clicks: OnePageClickRow[]
  leads: OnePageLeadRow[]
  window: Span
  /** What the period is compared with: null for no comparison, left out for the period just before. */
  previous?: Span | null
  timeZone: string
  mainDomain: string
  linkLabels: Record<string, string>
  categorize: (referrerHost: string, userAgent: string | null) => string
  parseAgent: (ua: string | null | undefined) => { device: string | null; browser: string | null; os: string | null }
  hostOf: (referrer: string | null | undefined) => string
}): OnePageReports {
  const { window: cur, timeZone } = input
  const { grain, starts, labels, prev, prevStarts, compared } = periodsOf(cur, input.previous, timeZone)
  const n = starts.length

  const asViews: ViewRow[] = input.views.map((v, i) => {
    const agent = input.parseAgent(v.user_agent)
    const host = input.hostOf(v.referrer)
    return {
      id: v.id ?? `v${i}`,
      session_id: `op:${v.id ?? i}`,
      visitor_id: v.visitor_id ?? null,
      created_at: v.created_at,
      source_category: input.categorize(host, v.user_agent ?? null),
      referrer_domain: host || "Direct",
      country_code: v.country_code ?? null,
      country_name: v.country_name ?? null,
      device_type: agent.device,
      browser: agent.browser,
      os: agent.os,
      page_url: null,
    }
  })
  const now = sessionsOf(asViews, cur, timeZone)
  const before = sessionsOf(asViews, prev, timeZone)

  const times = (rows: Array<{ created_at: string }>) => rows.map((r) => ({ at: Date.parse(r.created_at) }))
  const inSpan = (at: number, w: Span) => at >= w.start && at < w.end
  const sum = (xs: number[]) => xs.reduce((total, x) => total + x, 0)
  const series = (items: Array<{ at: number }>): Series => ({
    labels,
    current: bucketCounts(items, starts, cur, n),
    previous: compared ? bucketCounts(items, prevStarts, prev, n) : [],
  })

  const clickTimes = times(input.clicks)
  const leadTimes = times(input.leads)
  /* Each window from its own sessions. One list for both counted a session
     inside an overlapping comparison twice in each series. */
  const at = (xs: Array<{ at: number }>) => xs.map((s) => ({ at: s.at }))
  const viewSeries: Series = {
    labels,
    current: bucketCounts(at(now), starts, cur, n),
    previous: compared ? bucketCounts(at(before), prevStarts, prev, n) : [],
  }
  const clickSeries = series(clickTimes)
  const leadSeries = series(leadTimes)
  const ctrSeries = {
    labels,
    current: clickSeries.current.map((c, i) => (viewSeries.current[i] ? c / viewSeries.current[i] : 0)),
    previous: clickSeries.previous.map((c, i) => (viewSeries.previous[i] ? c / viewSeries.previous[i] : 0)),
  }
  const clicksNow = clickTimes.filter((t) => inSpan(t.at, cur)).length
  const clicksBefore = clickTimes.filter((t) => inSpan(t.at, prev)).length
  const ratio = (a: number, b: number) => (b > 0 ? a / b : 0)
  const head = (value: number, previous: number) => (compared ? headline(value, previous) : { value, previous: 0, change: null })

  /* Links: clicks per block, named from the page's own blocks. */
  const linkRows = (() => {
    const tally = (w: Span) => {
      const m = new Map<string, number>()
      for (const c of input.clicks) {
        if (!inSpan(Date.parse(c.created_at), w)) continue
        m.set(c.block_id, (m.get(c.block_id) ?? 0) + 1)
      }
      return m
    }
    const a = tally(cur)
    const b = tally(prev)
    const total = sum([...a.values()])
    const urlOf = new Map(input.clicks.map((c) => [c.block_id, c.url || ""]))
    return [...a.entries()]
      .map(([id, value]) => {
        const url = urlOf.get(id) || ""
        const label = input.linkLabels[id] || input.hostOf(url) || "Link"
        return { key: id, label, value, previous: b.get(id) ?? 0, share: total ? value / total : 0 }
      })
      .sort((x, y) => y.value - x.value || x.label.localeCompare(y.label))
      .slice(0, 25)
  })()

  return {
    grain,
    compared,
    views: { ...head(now.length, before.length), series: viewSeries },
    clicks: { ...head(clicksNow, clicksBefore), series: clickSeries },
    ctr: { ...head(ratio(clicksNow, now.length), ratio(clicksBefore, before.length)), series: ctrSeries },
    subscribers: {
      ...head(leadTimes.filter((t) => inSpan(t.at, cur)).length, leadTimes.filter((t) => inSpan(t.at, prev)).length),
      series: leadSeries,
    },
    links: linkRows,
    breakdowns: visitBreakdowns(groupVisits(now), groupVisits(before), input.mainDomain),
  }
}