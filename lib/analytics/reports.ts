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
 *   Failed and pending payments are not orders. Money is what was paid less
 *   what was refunded.
 *
 *   Every figure is compared with the same length of time just before, and
 *   nothing is ever filled in: an empty day is zero, an unknown device is
 *   "Unknown", a country nobody recorded is not a country.
 */

import { groupOrders, startOfDay, type OrderRow } from "../orders/order-view"
import { bucketIndex, bucketLabel, bucketStarts, grainFor, previousWindow, type Grain, type Span } from "./buckets"

export { bucketStarts, grainFor, previousWindow, type Grain, type Span }

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
  sessions: Headline & { series: Series }
  conversion: Headline & { series: Series }
  aov: Headline & { series: Series }
  sales: Headline
  orders: Headline
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
  if (host === main || host === `www.${main}` || host === "localhost" || host.endsWith(".vercel.app")) return "storelib"
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

type Keyer = (s: Session) => { key: string; label: string } | null

function breakdown(current: Session[], previous: Session[], keyer: Keyer, limit = 25): BreakdownRow[] {
  const now = new Map<string, { label: string; value: number }>()
  const before = new Map<string, number>()
  for (const s of current) {
    const k = keyer(s)
    if (!k) continue
    const row = now.get(k.key)
    if (row) row.value++
    else now.set(k.key, { label: k.label, value: 1 })
  }
  for (const s of previous) {
    const k = keyer(s)
    if (k) before.set(k.key, (before.get(k.key) ?? 0) + 1)
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
  return (s: Session) => {
    const d = (s.first.referrer_domain || "").trim().toLowerCase().replace(/^www\./, "")
    if (!d || d === "direct") return null
    const self = channelOfUrl(`https://${d}`, mainDomain) === "storelib" || d.endsWith(mainDomain.replace(/^www\./, ""))
    return self ? null : { key: d, label: d }
  }
}

const keyCountry: Keyer = (s) =>
  s.first.country_code && s.first.country_code !== "XX"
    ? { key: s.first.country_code.toUpperCase(), label: countryName(s.first.country_code.toUpperCase(), s.first.country_name) }
    : null

function visitBreakdowns(now: Session[], before: Session[], mainDomain: string) {
  return {
    source: breakdown(now, before, (s) => {
      const g = sourceGroup(s.first.source_category)
      return { key: g, label: SOURCE_LABEL[g] }
    }),
    referrer: breakdown(now, before, referrerKeyer(mainDomain)),
    social: breakdown(now, before, (s) => {
      const n = socialNetwork(s.first.source_category)
      return n ? { key: n, label: SOCIAL_LABEL[n] ?? (n === "other" ? "Other social" : titleCase(n)) } : null
    }),
    campaign: breakdown(now, before, (s) => {
      const c = (s.first.utm_campaign || "").trim()
      return c ? { key: c.toLowerCase(), label: c } : null
    }),
    country: breakdown(now, before, keyCountry).map((r) => ({ ...r, extra: { code: r.key } })),
    city: breakdown(now, before, (s) => {
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
    device: breakdown(now, before, (s) => {
      const d = deviceLabel(s.first.device_type)
      return { key: d.toLowerCase(), label: d }
    }),
    browser: breakdown(now, before, (s) => {
      const b = (s.first.browser || "").trim()
      return { key: (b || "unknown").toLowerCase(), label: b ? titleCase(b) : "Unknown" }
    }),
    os: breakdown(now, before, (s) => {
      const o = (s.first.os || "").trim()
      return { key: (o || "unknown").toLowerCase(), label: o || "Unknown" }
    }),
  }
}

/* ─── Everything ──────────────────────────────────────────────────────── */

export function buildReports(input: {
  views: ViewRow[]
  steps: StepRow[]
  orders: OrderRow[]
  window: Span
  timeZone: string
  mainDomain: string
  productTitles: Record<string, string>
}): Reports {
  const { views, steps, window: cur, timeZone, mainDomain } = input
  const prev = previousWindow(cur)
  const grain = grainFor(cur)
  const starts = bucketStarts(cur, grain, timeZone)
  const prevStarts = starts.map((s) => s - (cur.start - prev.start))
  const labels = starts.map((s) => bucketLabel(s, grain, timeZone))

  const sessionsNow = sessionsOf(views, cur, timeZone)
  const sessionsBefore = sessionsOf(views, prev, timeZone)

  /* Orders: one per payment, failed and pending left out. */
  const allOrders = groupOrders(input.orders).filter((o) => o.payment !== "failed" && o.payment !== "pending")
  const inWindow = (o: { createdAt: string }, w: Span) => {
    const at = Date.parse(o.createdAt)
    return at >= w.start && at < w.end
  }
  const ordersNow = allOrders.filter((o) => inWindow(o, cur))
  const ordersBefore = allOrders.filter((o) => inWindow(o, prev))
  const net = (o: (typeof allOrders)[number]) => Math.max(0, o.totalCents - o.refundedCents)
  const paid = (list: typeof allOrders) => list.filter((o) => o.totalCents > 0)

  const series = (fill: (starts: number[], w: Span) => number[]) => ({
    labels,
    current: fill(starts, cur),
    previous: fill(prevStarts, prev),
  })

  const countIn = (items: number[], bucketFrom: number[], w: Span) => {
    const out = bucketFrom.map(() => 0)
    for (const at of items) {
      if (!(at >= w.start && at < w.end)) continue
      const i = bucketIndex(bucketFrom, at)
      if (i >= 0) out[i]++
    }
    return out
  }

  const sessionTimes = (list: Session[]) => list.map((s) => s.at)
  const orderTimes = (list: typeof allOrders) => list.map((o) => Date.parse(o.createdAt))

  const sessionSeries = series((b, w) => countIn(sessionTimes(w === cur ? sessionsNow : sessionsBefore), b, w))
  const orderCounts = series((b, w) => countIn(orderTimes(w === cur ? ordersNow : ordersBefore), b, w))
  const conversionSeries: Series = {
    labels,
    current: orderCounts.current.map((o, i) => (sessionSeries.current[i] ? o / sessionSeries.current[i] : 0)),
    previous: orderCounts.previous.map((o, i) => (sessionSeries.previous[i] ? o / sessionSeries.previous[i] : 0)),
  }
  const aovIn = (list: typeof allOrders, bucketFrom: number[], w: Span) => {
    const sum = bucketFrom.map(() => 0)
    const n = bucketFrom.map(() => 0)
    for (const o of paid(list)) {
      const at = Date.parse(o.createdAt)
      if (!(at >= w.start && at < w.end)) continue
      const i = bucketIndex(bucketFrom, at)
      if (i < 0) continue
      sum[i] += o.totalCents
      n[i]++
    }
    return sum.map((s, i) => (n[i] ? s / n[i] : 0))
  }
  const aovSeries = series((b, w) => aovIn(w === cur ? ordersNow : ordersBefore, b, w))
  const aov = (list: typeof allOrders) => {
    const p = paid(list)
    return p.length ? p.reduce((n, o) => n + o.totalCents, 0) / p.length : 0
  }

  const rate = (o: number, s: number) => (s > 0 ? o / s : 0)

  /* Sales by channel: where each payment came from. */
  const channelRows = (() => {
    const label = { website: "Website", storelib: "Storelib", unknown: "Not recorded" } as const
    const sum = (list: typeof allOrders) => {
      const m = new Map<keyof typeof label, number>()
      for (const o of list) {
        const k = (o.source ?? "unknown") as keyof typeof label
        m.set(k, (m.get(k) ?? 0) + net(o))
      }
      return m
    }
    const now = sum(ordersNow)
    const before = sum(ordersBefore)
    const total = [...now.values()].reduce((n, v) => n + v, 0)
    return [...now.entries()]
      .filter(([, v]) => v > 0)
      .map(([k, v]) => ({ key: k, label: label[k], value: v, previous: before.get(k) ?? 0, share: total ? v / total : 0 }))
      .sort((a, b) => b.value - a.value)
  })()

  /* Sales by product: each product's own line of each payment. */
  const productRows = (() => {
    const tally = (list: typeof allOrders) => {
      const m = new Map<string, { cents: number; units: number }>()
      for (const o of list) {
        for (const line of o.lines) {
          if (line.status !== "completed" && line.status !== "refunded") continue
          const refunded =
            line.status === "refunded"
              ? Math.min(line.amount_cents || 0, line.refund_amount_cents && line.refund_amount_cents > 0 ? line.refund_amount_cents : line.amount_cents || 0)
              : 0
          const row = m.get(line.product_id) ?? { cents: 0, units: 0 }
          row.cents += Math.max(0, (line.amount_cents || 0) - refunded)
          row.units += 1
          m.set(line.product_id, row)
        }
      }
      return m
    }
    const now = tally(ordersNow)
    const before = tally(ordersBefore)
    const total = [...now.values()].reduce((n, v) => n + v.cents, 0)
    return [...now.entries()]
      .map(([id, v]) => ({
        key: id,
        label: input.productTitles[id] || "Removed product",
        value: v.cents,
        previous: before.get(id)?.cents ?? 0,
        share: total ? v.cents / total : 0,
        extra: { orders: v.units },
      }))
      .sort((a, b) => b.value - a.value || (b.extra.orders ?? 0) - (a.extra.orders ?? 0))
      .slice(0, 8)
  })()

  /* The funnel, counted in visits: each step once per visit. */
  const stepSessions = (type: string, w: Span) => {
    const keys = new Set<string>()
    for (const s of steps) {
      if (s.event_type !== type) continue
      const at = Date.parse(s.created_at)
      if (!(at >= w.start && at < w.end)) continue
      keys.add(sessionKey({ ...s, created_at: s.created_at }, timeZone))
    }
    return keys.size
  }
  const funnelRaw = [
    { key: "sessions" as const, label: "Sessions", value: sessionsNow.length, previous: sessionsBefore.length },
    { key: "buy" as const, label: "Pressed Buy", value: stepSessions("buy_click", cur), previous: stepSessions("buy_click", prev) },
    { key: "checkout" as const, label: "Reached checkout", value: stepSessions("checkout_start", cur), previous: stepSessions("checkout_start", prev) },
    { key: "orders" as const, label: "Ordered", value: ordersNow.length, previous: ordersBefore.length },
  ]
  const funnel = funnelRaw.map((f) => ({ ...f, rate: rate(f.value, sessionsNow.length) }))

  /* Country: visits, and the orders and money from buyers there. */
  const countryRows = (() => {
    const rows = breakdown(sessionsNow, sessionsBefore, keyCountry, 25)
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

  const refDomain = referrerKeyer(mainDomain)

  return {
    grain,
    sessions: { ...headline(sessionsNow.length, sessionsBefore.length), series: sessionSeries },
    conversion: { ...headline(rate(ordersNow.length, sessionsNow.length), rate(ordersBefore.length, sessionsBefore.length)), series: conversionSeries },
    aov: { ...headline(aov(ordersNow), aov(ordersBefore)), series: aovSeries },
    sales: headline(ordersNow.reduce((n, o) => n + net(o), 0), ordersBefore.reduce((n, o) => n + net(o), 0)),
    orders: headline(ordersNow.length, ordersBefore.length),
    salesByChannel: channelRows,
    salesByProduct: productRows,
    funnel,
    breakdowns: {
      ...visitBreakdowns(sessionsNow, sessionsBefore, mainDomain),
      country: countryRows,
      landing: breakdown(sessionsNow, sessionsBefore, (s) => {
        const p = landingPath(s.first.page_url, mainDomain)
        return p ? { key: p, label: p } : null
      }),
      channel: breakdown(sessionsNow, sessionsBefore, (s) => {
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
  timeZone: string
  mainDomain: string
  linkLabels: Record<string, string>
  categorize: (referrerHost: string, userAgent: string | null) => string
  parseAgent: (ua: string | null | undefined) => { device: string | null; browser: string | null; os: string | null }
  hostOf: (referrer: string | null | undefined) => string
}): OnePageReports {
  const { window: cur, timeZone } = input
  const prev = previousWindow(cur)
  const grain = grainFor(cur)
  const starts = bucketStarts(cur, grain, timeZone)
  const prevStarts = starts.map((s) => s - (cur.start - prev.start))
  const labels = starts.map((s) => bucketLabel(s, grain, timeZone))

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

  const times = (rows: Array<{ created_at: string }>) => rows.map((r) => Date.parse(r.created_at))
  const countIn = (items: number[], from: number[], w: Span) => {
    const out = from.map(() => 0)
    for (const at of items) {
      if (!(at >= w.start && at < w.end)) continue
      const i = bucketIndex(from, at)
      if (i >= 0) out[i]++
    }
    return out
  }
  const inSpan = (at: number, w: Span) => at >= w.start && at < w.end
  const sum = (xs: number[]) => xs.reduce((n, x) => n + x, 0)

  const viewTimes = now.map((s) => s.at).concat(before.map((s) => s.at))
  const clickTimes = times(input.clicks)
  const leadTimes = times(input.leads)
  const viewSeries = { labels, current: countIn(viewTimes, starts, cur), previous: countIn(viewTimes, prevStarts, prev) }
  const clickSeries = { labels, current: countIn(clickTimes, starts, cur), previous: countIn(clickTimes, prevStarts, prev) }
  const leadSeries = { labels, current: countIn(leadTimes, starts, cur), previous: countIn(leadTimes, prevStarts, prev) }
  const ctrSeries = {
    labels,
    current: clickSeries.current.map((c, i) => (viewSeries.current[i] ? c / viewSeries.current[i] : 0)),
    previous: clickSeries.previous.map((c, i) => (viewSeries.previous[i] ? c / viewSeries.previous[i] : 0)),
  }
  const clicksNow = clickTimes.filter((t) => inSpan(t, cur)).length
  const clicksBefore = clickTimes.filter((t) => inSpan(t, prev)).length
  const ratio = (a: number, b: number) => (b > 0 ? a / b : 0)

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
    views: { ...headline(now.length, before.length), series: viewSeries },
    clicks: { ...headline(clicksNow, clicksBefore), series: clickSeries },
    ctr: { ...headline(ratio(clicksNow, now.length), ratio(clicksBefore, before.length)), series: ctrSeries },
    subscribers: {
      ...headline(leadTimes.filter((t) => inSpan(t, cur)).length, leadTimes.filter((t) => inSpan(t, prev)).length),
      series: leadSeries,
    },
    links: linkRows,
    breakdowns: visitBreakdowns(now, before, input.mainDomain),
  }
}
