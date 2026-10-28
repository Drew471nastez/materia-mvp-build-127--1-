/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  THE ANALYTICS REPORTS: EVERY FIGURE ON /app/analytics AND ON HOME
 * ═══════════════════════════════════════════════════════════════════════════
 * Pure: no clock, no database, no browser. The route
 * (app/api/analytics/reports, lib/analytics/report-read) hands it what the
 * database counted and the rows it read, and gets back every figure the
 * page draws. The comment on each part says what it counts.
 *
 * WHERE EACH NUMBER COMES FROM
 *
 *   Visitors, page views, sessions, traffic sources, pages, products and
 *   the funnel's first three steps are counted by the database
 *   (analytics_report, supabase/sql/run-now part 61) and arrive as a
 *   ReportWire. Until that function exists, wireFromRows counts the very
 *   same things from the rows here, by the same rules, and the tests hold
 *   the two to the same answers.
 *
 *   Orders and revenue come from `orders` only, never from an event: one
 *   order per payment (lib/orders/order-view groupOrders), failed, pending
 *   and disputed payments left out (isSale), money what was charged less
 *   what was refunded (moneyOf). The Orders page and Home count them the
 *   same way, so all three agree to the cent.
 *
 *   The OnePage's visits from before it was counted in analytics_events are
 *   read from onepage_views and folded in here (foldLegacyOnePage), once,
 *   never on top of the events.
 *
 * THE RULES, so the numbers agree with each other:
 *
 *   A visitor is counted once per period and once per bucket of the chart,
 *   whichever of the creator's places they saw: somebody who opened the
 *   OnePage and the website on the same visit is one visitor under All.
 *
 *   Conversion is orders divided by visitors, for the same property and
 *   period. With no visitors there is no rate, not 0%.
 *
 *   Every figure is compared with the period the page names, bucket by
 *   bucket on its own calendar, and nothing is ever filled in: an empty day
 *   is zero, an unknown device is "Unknown".
 */

import { groupOrders, isSale, startOfDay, type OrderRow } from "../orders/order-view"
import { REFERRER_BRAND_KEYS, isInternalReferrer, referrerBrand } from "./sources"
import { osKey } from "./user-agent"
import { isOnePageHost } from "@/lib/onepage/address"
import { socialLinkLabel } from "@/lib/onepage/link-keys"
import { bucketIndex, bucketLabel, bucketStarts, grainFor, previousWindow, spansToRead, type Grain, type Span } from "./buckets"
import {
  ALL,
  counts,
  isSignup,
  orderProperty,
  propertyName,
  subscriberProperty,
  type CreatorProperties,
  type PropertySelector,
  type SubscriberRowLike,
} from "./properties"
import { tt } from "@/lib/i18n/text"
import { appLocale } from "@/lib/i18n/format"
import { lineInMode, type SalesMode } from "./sections"
import { refundsIn } from "./refund-dates"
import { changeOf } from "./percent"

export { bucketStarts, grainFor, previousWindow, spansToRead, type Grain, type Span }

/* ─── Rows ─────────────────────────────────────────────────────────────── */

/** A page view, as analytics_events keeps it (docs/analytics/events.md). */
export interface ViewRow {
  id?: string
  session_id?: string | null
  visitor_id?: string | null
  product_id?: string | null
  created_at: string
  /** Absent entirely on a database from before part 61; null when a row could not be placed. */
  property_type?: string | null
  property_id?: string | null
  path?: string | null
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
  /** The page's title (supabase/sql/run-now part 253); absent before it. */
  page_title?: string | null
}

/** A step towards a sale (buy_click, checkout_start) or a link click, as analytics_events keeps it. */
export interface StepRow {
  id?: string
  event_type: string
  session_id?: string | null
  visitor_id?: string | null
  product_id?: string | null
  property_type?: string | null
  property_id?: string | null
  link_id?: string | null
  link_url?: string | null
  created_at: string
}

/** A OnePage view as app/api/onepage/track wrote it: one per address a UTC day, with an id of its own. */
export interface OnePageViewRow {
  id?: string
  visitor_id?: string | null
  referrer?: string | null
  user_agent?: string | null
  country_code?: string | null
  country_name?: string | null
  created_at: string
}

/** A OnePage link tap as app/api/onepage/track wrote it: one per id, block and UTC day. */
export interface OnePageClickRow {
  id?: string
  block_id: string
  url?: string | null
  visitor_id?: string | null
  created_at: string
}

/** A subscriber, as the reports read one. */
export interface SubscriberRow extends SubscriberRowLike {
  id?: string
  subscribed_at?: string | null
  created_at?: string | null
  last_touch?: { source?: string | null } | null
}

/* ─── What the database answers ───────────────────────────────────────── */

export type WireMaps = Partial<Record<"source" | "referrer" | "campaign" | "device" | "country" | "browser", Record<string, number>>>

/**
 * ONE PERIOD, COUNTED (analytics_report's answer for `cur` or `prev`). The
 * first group is the quick part (`figures`); the rest is `detail`. The lists
 * (pages, products, links, checkouts) are only counted for the period itself.
 */
export interface WindowWire {
  visitors?: number
  views?: number
  product_visitors?: number
  product_views?: number
  visitor_buckets?: number[]
  view_buckets?: number[]
  clicks?: number
  click_buckets?: number[]

  sessions?: number
  session_buckets?: number[]
  maps?: WireMaps
  rolled_days?: number
  raw_runs?: number
  /** [property_type, property_id, path, page views, visitors], the 50 most viewed. */
  pages?: Array<[string | null, string | null, string | null, number, number]>
  /** [product_id, page views, visitors]. */
  products?: Array<[string, number, number]>
  /** Visitors who opened the checkout (checkout_start). */
  checkouts?: number
  /** [property_type, property_id, link, clicks, visitors], the 50 most clicked. */
  links?: Array<[string | null, string | null, string, number, number]>
  /** [system as stored, visitors, page views] (analytics_audience, part 253). */
  os?: Array<[string, number, number]>
  /** Visitors who added something to the cart or pressed Buy (buy_click). */
  carts?: number
  /** [property_type, property_id, path, title]: the latest title each page was viewed with. */
  titles?: Array<[string | null, string | null, string | null, string]>
}

export interface ReportWire {
  cur: WindowWire
  prev: WindowWire
}

/* ─── Shapes the page draws ───────────────────────────────────────────── */

export interface Series {
  labels: string[]
  current: number[]
  previous: number[]
}

/** A rate per bucket: null where there was nobody to divide by. */
export interface RateSeries {
  labels: string[]
  current: Array<number | null>
  previous: Array<number | null>
}

export interface Headline {
  value: number
  previous: number
  /** Fraction, 0.12 for +12%. Null when there was nothing before to compare with. */
  change: number | null
}

export interface RateHeadline {
  /** Null when there were no visitors: no rate, rather than 0%. */
  value: number | null
  previous: number | null
  change: number | null
}

export interface BreakdownRow {
  key: string
  label: string
  value: number
  previous: number
  /** Share of the card's total, 0..1. */
  share: number
  extra?: { orders?: number; salesCents?: number; code?: string; views?: number }
}

export interface PageRow {
  key: string
  /** The path, as the visitor saw it. */
  label: string
  /** Which of the creator's places it is on, under All; null when one place is chosen. */
  place: string | null
  /** The page's own title, when it was recorded (part 253). */
  title?: string | null
  views: number
  visitors: number
  share: number
}

export interface LinkRow {
  key: string
  label: string
  clicks: number
  visitors: number
  share: number
}

export interface ProductRow {
  key: string
  label: string
  /** physical, digital, membership, course or other; null for a removed product. */
  kind?: string | null
  views: number
  orders: number
  salesCents: number
  share: number
}

export interface FunnelStep {
  key: "visitors" | "product" | "cart" | "checkout" | "orders"
  label: string
  value: number
  /** Of the step before, 0..1; null for the first step, after a step with nothing recorded, or when more reached this step than the one before. */
  rate: number | null
  /** False when this step was not recorded for the period (nothing here while a later step has something). */
  recorded: boolean
}

/** One kind of product's sales: physical, digital, a membership, a course. */
export interface KindRow {
  key: string
  label: string
  /** Payments with at least one line of this kind. */
  orders: number
  units: number
  salesCents: number
  /** Lines of this kind refunded, in whole or part. */
  refunds: number
  share: number
}

/** Digital products: what sold, and how many of those orders were downloaded. */
export interface DigitalFigures {
  orders: number
  salesCents: number
  /** Revenue over orders; null with no orders. */
  averageCents: number | null
  /** Downloads of the period's digital orders, and how many of those orders were downloaded at least once. Null when they could not be read. */
  downloads: { total: number; orders: number } | null
  top: Array<{ key: string; label: string; orders: number; salesCents: number; downloads: number | null }>
}

export interface SubscriberFigures extends Headline {
  byProperty: BreakdownRow[]
  bySource: BreakdownRow[]
}

export interface Reports {
  grain: Grain
  /**
   * The quick first answer: the figures and the chart, and not yet the
   * lists (app/api/analytics/reports streams it ahead of the rest).
   */
  partial?: boolean
  /** False when there is no comparison: every `previous` is then empty. */
  compared: boolean
  visitors: Headline & { series: Series }
  /** Page views: every page opened, one per page per visitor per half hour. */
  views: Headline & { series: Series }
  sessions: Headline & { series: Series }
  conversion: RateHeadline & { series: RateSeries }
  sales: Headline & { series: Series }
  orders: Headline & { series: Series }
  /**
   * Refunds made in each bucket, dated by the refund (lib/analytics/
   * refund-dates), whatever day the order was placed: one order refunded on
   * one day is one. `cents` is the money that went back.
   */
  refunds: { value: number; previous: number; cents: number; previousCents: number; series: Series }
  /** Link clicks in each bucket (the OnePage's links and links out of every page). */
  linkClicks: { value: number; series: Series }
  topPages: PageRow[]
  topLinks: LinkRow[]
  topProducts: ProductRow[]
  funnel: FunnelStep[]
  /** Sales by kind of product, the largest first. */
  kinds: KindRow[]
  digital: DigitalFigures
  subscribers: SubscriberFigures | null
  breakdowns: {
    source: BreakdownRow[]
    social: BreakdownRow[]
    referrer: BreakdownRow[]
    campaign: BreakdownRow[]
    country: BreakdownRow[]
    device: BreakdownRow[]
    browser: BreakdownRow[]
    /** Visitors by operating system; `extra.views` their page views. */
    os: BreakdownRow[]
    /** Orders by the buyer's country; `extra.salesCents` their revenue. */
    orderCountry: BreakdownRow[]
  }
}

const HOUR = 3_600_000
const DAY = 24 * HOUR
const SLOT = 15 * 60_000

/** Top products' one row for every product the creator has deleted. */
export const REMOVED_PRODUCT = "removed"

/* ─── Sessions, for the pages that still count them from rows ────────── */

export function sessionKey(v: { session_id?: string | null; visitor_id?: string | null; id?: string; created_at: string }, timeZone: string): string {
  if (v.session_id) return `s:${v.session_id}`
  if (v.visitor_id) return `v:${v.visitor_id}:${startOfDay(Date.parse(v.created_at), timeZone)}`
  return `e:${v.id ?? v.created_at}`
}

interface Session {
  key: string
  at: number
  first: ViewRow
}

/** One entry per visit, described by its first page (lib/website-builder/site-performance). */
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

export const SOURCE_LABEL: Record<string, string> = {
  get direct() { return tt("Direct") },
  get organic_search() { return tt("Search") },
  get paid_search() { return tt("Paid search") },
  get paid() { return tt("Paid") },
  get email() { return tt("Email") },
  get affiliate() { return tt("Affiliate") },
  get referral() { return tt("Referral") },
  get social() { return tt("Social") },
  /* Opened from Storelib Explore, the marketplace (lib/analytics/events EXPLORE_SOURCE). */
  get explore() { return tt("Storelib Explore") },
}

export const SOCIAL_LABEL: Record<string, string> = {
  instagram: "Instagram",
  tiktok: "TikTok",
  facebook: "Facebook",
  x: "X",
  youtube: "YouTube",
  pinterest: "Pinterest",
  linkedin: "LinkedIn",
  get snapchat() { return tt("Snapchat") },
  get reddit() { return tt("Reddit") },
  get threads() { return tt("Threads") },
  whatsapp: "WhatsApp",
  telegram: "Telegram",
  discord: "Discord",
  twitch: "Twitch",
  get bluesky() { return tt("Bluesky") },
  get tumblr() { return tt("Tumblr") },
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

/** A source category in words: the network for social ones ("Instagram"), else the group ("Search"). */
export function sourceName(category: string | null | undefined): string {
  const n = socialNetwork(category)
  if (n) return SOCIAL_LABEL[n] ?? (n === "other" ? tt("Social") : titleCase(n))
  return SOURCE_LABEL[sourceGroup(category)]
}

export function countryName(code: string, stored?: string | null): string {
  const locale = appLocale()
  /* The stored name is English; another language names the country itself. */
  if (stored && stored.length > 2 && (locale.startsWith("en") || !/^[A-Z]{2}$/.test(code))) return stored
  try {
    return new Intl.DisplayNames([locale], { type: "region" }).of(code) || stored || code
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

/* ─── Money ───────────────────────────────────────────────────────────── */

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
 * ONE LINE'S MONEY, the unit moneyOf adds up. Top products reads the same
 * function, so its rows add up to Revenue.
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

/**
 * THE CREATOR'S SALES FOR ONE PROPERTY: payments, sales only, each under
 * exactly one property (lib/analytics/properties orderProperty), so All is
 * the sum of the parts and no order is counted twice or left out.
 */
export function salesFor(orders: OrderRow[], selector: PropertySelector, defaultWebsite: string | null): Grouped[] {
  return groupOrders(orders)
    .filter(isSale)
    .filter((o) => counts(selector, orderProperty(o), defaultWebsite))
}

/* ─── Periods and buckets ─────────────────────────────────────────────── */

/**
 * THE TWO PERIODS AND THEIR BUCKETS.
 *
 * The period before is the one the page names, handed in by it (lib/
 * date-range/range compareBounds): the previous period, or none. Bucket i
 * of the comparison is bucket i of its own period, counted on its own
 * calendar: the same hour of yesterday, the same day of last month.
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

/** The same length as the chart: padded with zeros, or cut. */
function fit(xs: number[] | undefined, length: number): number[] {
  return Array.from({ length }, (_, i) => Number(xs?.[i]) || 0)
}

/**
 * WHAT THE DATABASE IS ASKED (analytics_report's arguments): the two
 * periods and the very bucket starts this file draws, so the database never
 * works out a calendar of its own.
 */
export function reportArgs(window: Span, previous: Span | null | undefined, timeZone: string) {
  const { starts, prev, prevStarts } = periodsOf(window, previous, timeZone)
  return {
    p_cur_start: window.start,
    p_cur_end: window.end,
    p_prev_start: prev.start,
    p_prev_end: prev.end,
    p_cur_starts: starts,
    p_prev_starts: prevStarts,
  }
}

/* ─── The same counting, from rows ─────────────────────────────────────── */

/**
 * WHERE A ROW IS, before part 61 gave it a property: the host it was
 * recorded on, as part 61's backfill places it. Storelib's own hosts are the
 * creator page, any other host a website (the live one).
 */
function placeOf(row: { property_type?: string | null; property_id?: string | null; page_url?: string | null }, mainDomain: string): { type: string | null; id: string | null } {
  if (row.property_type !== undefined) return { type: row.property_type ?? null, id: row.property_id ?? null }
  const channel = channelOfUrl(row.page_url, mainDomain)
  if (!channel) return { type: null, id: null }
  return channel === "storelib" ? { type: "creator_page", id: null } : { type: "website", id: null }
}

const visitorOf = (r: { visitor_id?: string | null; session_id?: string | null; id?: string; created_at: string }) =>
  (r.visitor_id || "") || (r.session_id || "") || `e:${r.id ?? r.created_at}`

const utcDay = (ms: number) => Math.floor(ms / DAY) * DAY

function sessionOf(r: ViewRow): string {
  if (r.session_id) return r.session_id
  if (r.visitor_id) return `v:${r.visitor_id}:${new Date(r.created_at).toISOString().slice(0, 10)}`
  return `e:${r.id ?? r.created_at}`
}

/** A breakdown key of a visit's first page, exactly as analytics_property_counts writes it. */
function dimsOf(r: ViewRow): Record<"source" | "referrer" | "campaign" | "device" | "country" | "browser", string | null> {
  /* The same steps as the SQL: the leading "www." off first (as written), then lower case. */
  const referrer = (r.referrer_domain || "").replace(/^www\./, "").toLowerCase()
  return {
    source: r.source_category || "direct",
    referrer: referrer || "direct",
    campaign: r.utm_campaign || null,
    device: (r.device_type || "").toLowerCase() || "unknown",
    country: (r.country_code || "").toUpperCase() || "unknown",
    browser: (r.browser || "").toLowerCase() || "unknown",
  }
}

const MAP_CAP: Record<string, number> = { country: 300 }

/**
 * THE DATABASE'S COUNTING, DONE HERE FROM THE ROWS: analytics_report by the
 * same rules, for a database that does not have it yet, and for the tests,
 * which hold the two to the same answer. `views` are the page views from a
 * day before the earlier period to the end of the later one (a visit is
 * counted where it began); `steps` the checkout_start and link_click rows of
 * both periods.
 */
export function wireFromRows(input: {
  views: ViewRow[]
  steps: StepRow[]
  window: Span
  previous: Span | null
  timeZone: string
  selector: PropertySelector
  defaultWebsite: string | null
  product: string | null
  mainDomain: string
}): ReportWire {
  const { window: cur, timeZone, selector, defaultWebsite, product, mainDomain } = input
  const { starts, prev, prevStarts } = periodsOf(cur, input.previous, timeZone)
  const keep = (row: { property_type?: string | null; property_id?: string | null; page_url?: string | null; product_id?: string | null }) => {
    const place = placeOf(row, mainDomain)
    if (!counts(selector, { type: place.type as never, id: place.id }, defaultWebsite)) return false
    return !product || row.product_id === product
  }
  const views = input.views.filter(keep).map((v) => ({ v, at: Date.parse(v.created_at), place: placeOf(v, mainDomain) }))
  views.sort((a, b) => a.at - b.at || String(a.v.id ?? "").localeCompare(String(b.v.id ?? "")))
  const steps = input.steps.filter((s) => (s.event_type === "link_click" ? !product && keep({ ...s, product_id: null }) : keep(s)))

  /*
    A visit begins at its first page within that day and the day before
    (analytics_property_counts): per property and visit, a page starts one
    when the visit's page before it is from before the previous UTC day.
  */
  const lastAt = new Map<string, number>()
  const startsAt: Array<{ at: number; row: ViewRow }> = []
  for (const { v, at, place } of views) {
    if (!place.type) continue
    const key = `${place.type}:${place.id ?? ""}|${sessionOf(v)}`
    const before = lastAt.get(key)
    if (before === undefined || before < utcDay(at) - DAY) startsAt.push({ at, row: v })
    lastAt.set(key, at)
  }

  const one = (w: Span, bucketStartsOf: number[], lists: boolean): WindowWire => {
    const inside = views.filter((x) => x.at >= w.start && x.at < w.end)
    const n = bucketStartsOf.length
    const bucketOf = (at: number) => (n > 0 ? bucketIndex(bucketStartsOf, at) : -1)

    const people = new Map<string, boolean>()
    const perBucket = Array.from({ length: n }, () => ({ views: 0, people: new Set<string>() }))
    let productViews = 0
    for (const { v, at } of inside) {
      const who = visitorOf(v)
      people.set(who, (people.get(who) ?? false) || !!v.product_id)
      if (v.product_id) productViews++
      const b = bucketOf(at)
      if (b >= 0 && b < n) {
        perBucket[b].views++
        perBucket[b].people.add(who)
      }
    }

    const clicks = steps.filter((s) => s.event_type === "link_click" && Date.parse(s.created_at) >= w.start && Date.parse(s.created_at) < w.end)
    const clickBuckets = Array.from({ length: n }, () => 0)
    for (const c of clicks) {
      const b = bucketOf(Date.parse(c.created_at))
      if (b >= 0 && b < n) clickBuckets[b]++
    }

    /* Visits and where they came from: counted per UTC day, each map's longest tail folded into "(other)" as the rollup does. */
    const began = startsAt.filter((s) => s.at >= w.start && s.at < w.end)
    const sessionBuckets = Array.from({ length: n }, () => 0)
    const perDay = new Map<string, Map<string, Map<string, number>>>()
    for (const s of began) {
      const b = bucketOf(Math.floor(s.at / SLOT) * SLOT)
      if (b >= 0 && b < n) sessionBuckets[b]++
      const place = placeOf(s.row, mainDomain)
      const dayKey = `${utcDay(s.at)}|${place.type}:${place.id ?? ""}`
      let kinds = perDay.get(dayKey)
      if (!kinds) perDay.set(dayKey, (kinds = new Map()))
      for (const [kind, k] of Object.entries(dimsOf(s.row))) {
        if (k === null) continue
        let m = kinds.get(kind)
        if (!m) kinds.set(kind, (m = new Map()))
        m.set(k, (m.get(k) ?? 0) + 1)
      }
    }
    const maps: Record<string, Record<string, number>> = {}
    for (const kinds of perDay.values()) {
      for (const [kind, m] of kinds) {
        const cap = MAP_CAP[kind] ?? 100
        const ranked = [...m.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
        const out = (maps[kind] ??= {})
        ranked.forEach(([k, c], i) => {
          const key = i < cap ? k : "(other)"
          out[key] = (out[key] ?? 0) + c
        })
      }
    }

    const wire: WindowWire = {
      visitors: people.size,
      views: inside.length,
      product_visitors: [...people.values()].filter(Boolean).length,
      product_views: productViews,
      visitor_buckets: perBucket.map((b) => b.people.size),
      view_buckets: perBucket.map((b) => b.views),
      clicks: clicks.length,
      click_buckets: clickBuckets,
      sessions: began.length,
      session_buckets: sessionBuckets,
      maps,
    }
    const audience = audienceOf(inside.map((x) => x.v), steps.filter((st) => st.event_type === "buy_click" && Date.parse(st.created_at) >= w.start && Date.parse(st.created_at) < w.end))
    wire.os = audience.os
    if (!lists) return wire
    wire.carts = audience.carts
    wire.titles = audience.titles

    const pages = new Map<string, { pt: string | null; pid: string | null; path: string | null; views: number; people: Set<string> }>()
    const products = new Map<string, { views: number; people: Set<string> }>()
    for (const { v, place } of inside) {
      const key = `${place.type}|${place.id}|${v.path ?? ""}`
      const page = pages.get(key) ?? { pt: place.type, pid: place.id, path: v.path ?? null, views: 0, people: new Set<string>() }
      page.views++
      page.people.add(visitorOf(v))
      pages.set(key, page)
      if (v.product_id) {
        const p = products.get(v.product_id) ?? { views: 0, people: new Set<string>() }
        p.views++
        p.people.add(visitorOf(v))
        products.set(v.product_id, p)
      }
    }
    /* As the SQL orders them: views, then visitors, then the path in byte order, a missing path last. */
    const pathOrder = (a: string | null, b: string | null) => (a === b ? 0 : a === null ? 1 : b === null ? -1 : a < b ? -1 : 1)
    const byPath = (a: { views: number; people: Set<string>; path: string | null }, b: { views: number; people: Set<string>; path: string | null }) =>
      b.views - a.views || b.people.size - a.people.size || pathOrder(a.path, b.path)
    wire.pages = [...pages.values()].sort(byPath).slice(0, 50).map((p) => [p.pt, p.pid, p.path, p.views, p.people.size])
    wire.products = [...products.entries()]
      .sort((a, b) => b[1].views - a[1].views || (a[0] < b[0] ? -1 : 1))
      .map(([id, p]) => [id, p.views, p.people.size])
    const checkoutPeople = new Set(
      steps.filter((s) => s.event_type === "checkout_start" && Date.parse(s.created_at) >= w.start && Date.parse(s.created_at) < w.end).map(visitorOf),
    )
    wire.checkouts = checkoutPeople.size
    const links = new Map<string, { pt: string | null; pid: string | null; link: string; clicks: number; people: Set<string> }>()
    for (const c of clicks) {
      const link = c.link_id || c.link_url || ""
      const key = `${c.property_type}|${c.property_id}|${link}`
      const l = links.get(key) ?? { pt: c.property_type ?? null, pid: c.property_id ?? null, link, clicks: 0, people: new Set<string>() }
      l.clicks++
      l.people.add(visitorOf(c))
      links.set(key, l)
    }
    wire.links = [...links.values()]
      .sort((a, b) => b.clicks - a.clicks || (a.link < b.link ? -1 : a.link > b.link ? 1 : 0))
      .slice(0, 50)
      .map((l) => [l.pt, l.pid, l.link, l.clicks, l.people.size])
    return wire
  }

  return { cur: one(cur, starts, true), prev: one(prev, prevStarts, false) }
}

/**
 * WHO WAS LOOKING, COUNTED FROM ROWS: analytics_audience (part 253) by the
 * same rules, for a database without it and for the tests. `views` and
 * `carts` are one period's page views and buy_click rows, already narrowed
 * to the property and product asked for. A visitor is the visitor id, else
 * the visit, else the row, as everywhere in this file.
 */
export function audienceOf(views: ViewRow[], carts: StepRow[]): Required<Pick<WindowWire, "os" | "carts" | "titles">> {
  const os = new Map<string, { people: Set<string>; views: number }>()
  const titles = new Map<string, { at: number; row: [string | null, string | null, string | null, string] }>()
  for (const v of views) {
    const k = (v.os || "").trim() || "unknown"
    const o = os.get(k) ?? { people: new Set<string>(), views: 0 }
    o.people.add(visitorOf(v))
    o.views++
    os.set(k, o)
    if (v.page_title && v.path) {
      const key = `${v.property_type ?? ""}|${v.property_id ?? ""}|${v.path}`
      const at = Date.parse(v.created_at)
      const seen = titles.get(key)
      if (!seen || at > seen.at) titles.set(key, { at, row: [v.property_type ?? null, v.property_id ?? null, v.path, v.page_title] })
    }
  }
  return {
    os: [...os.entries()]
      .map(([k, o]): [string, number, number] => [k, o.people.size, o.views])
      .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
      .slice(0, 40),
    carts: new Set(carts.map(visitorOf)).size,
    titles: [...titles.values()].map((t) => t.row).slice(0, 2000),
  }
}

/* ─── The OnePage's history before its events ─────────────────────────── */

export interface LegacyOnePage {
  onePageId: string
  /** The first moment the OnePage has a row in analytics_events: before it, its visits are only in onepage_views. Null when it has none yet. */
  since: number | null
  views: OnePageViewRow[]
  clicks: OnePageClickRow[]
}

export interface LegacyDeps {
  isBot: (userAgent: string | null | undefined) => boolean
  categorize: (referrerHost: string, userAgent: string | null) => string
  parseAgent: (ua: string | null | undefined) => { device: string | null; browser: string | null; os: string | null }
  hostOf: (referrer: string | null | undefined) => string
  mainDomain: string
}

/**
 * THE ONEPAGE, COUNTED ONCE. Since part 61 a OnePage visit is written to
 * analytics_events (property onepage) and, as before, to onepage_views.
 * Before the first of those events, onepage_views is the only record. So a
 * OnePage visit is read from onepage_views only before `since`, and from the
 * events from then on: never from both.
 *
 * The two tables do not share an id for the same browser (onepage_views
 * keeps a hash of the address and the browser's signature; the events keep
 * the visitor cookie, or a daily hash with no consent), so a person seen on
 * the OnePage before the switch and on the website is two visitors: there
 * is nothing that could tell them apart honestly. A onepage_views row is one
 * address on one UTC day, so it is one visitor, one visit and one view.
 * Robots are left out by their signature, as the events leave them out;
 * the owner cannot be told apart in the old table and is counted there.
 */
export function foldLegacyOnePage(
  wire: ReportWire,
  legacy: LegacyOnePage | null,
  input: { window: Span; previous: Span | null; timeZone: string; selector: PropertySelector; product: string | null },
  deps: LegacyDeps,
): ReportWire {
  if (!legacy || input.product || (input.selector.type !== "all" && input.selector.type !== "onepage")) return wire
  const { starts, prev, prevStarts } = periodsOf(input.window, input.previous, input.timeZone)
  const before = (at: number) => legacy.since === null || at < legacy.since
  const views = legacy.views
    .map((v) => ({ v, at: Date.parse(v.created_at) }))
    .filter(({ v, at }) => Number.isFinite(at) && before(at) && !deps.isBot(v.user_agent))
  const clicks = legacy.clicks.map((c) => ({ c, at: Date.parse(c.created_at) })).filter(({ at }) => Number.isFinite(at) && before(at))

  const add = (w: Span, bucketStartsOf: number[], base: WindowWire, lists: boolean): WindowWire => {
    const n = bucketStartsOf.length
    const inside = views.filter((x) => x.at >= w.start && x.at < w.end)
    const tapped = clicks.filter((x) => x.at >= w.start && x.at < w.end)
    if (inside.length === 0 && tapped.length === 0) return base
    const bucketOf = (at: number) => (n > 0 ? bucketIndex(bucketStartsOf, at) : -1)
    const people = new Set<string>()
    const bucketPeople = Array.from({ length: n }, () => new Set<string>())
    const viewBuckets = fit(base.view_buckets, n)
    const sessionBuckets = fit(base.session_buckets, n)
    const clickBuckets = fit(base.click_buckets, n)
    const maps: Record<string, Record<string, number>> = {}
    for (const [kind, m] of Object.entries(base.maps ?? {})) maps[kind] = { ...m }
    const bump = (kind: string, key: string) => {
      const m = (maps[kind] ??= {})
      m[key] = (m[key] ?? 0) + 1
    }
    for (const { v, at } of inside) {
      const who = `op:${v.visitor_id || v.id || at}`
      people.add(who)
      const b = bucketOf(at)
      if (b >= 0 && b < n) {
        bucketPeople[b].add(who)
        viewBuckets[b]++
      }
      const sb = bucketOf(Math.floor(at / SLOT) * SLOT)
      if (sb >= 0 && sb < n) sessionBuckets[sb]++
      const host = deps.hostOf(v.referrer)
      const internal = !host || isInternalReferrer(host, deps.mainDomain)
      const agent = deps.parseAgent(v.user_agent)
      bump("source", deps.categorize(internal ? tt("Direct") : host, v.user_agent ?? null))
      bump("referrer", internal ? "direct" : host)
      bump("device", (agent.device || "").toLowerCase() || "unknown")
      bump("country", (v.country_code || "").toUpperCase() || "unknown")
      bump("browser", (agent.browser || "").toLowerCase() || "unknown")
    }
    for (const { at } of tapped) {
      const b = bucketOf(at)
      if (b >= 0 && b < n) clickBuckets[b]++
    }
    const out: WindowWire = {
      ...base,
      visitors: (base.visitors ?? 0) + people.size,
      views: (base.views ?? 0) + inside.length,
      visitor_buckets: fit(base.visitor_buckets, n).map((x, i) => x + bucketPeople[i].size),
      view_buckets: viewBuckets,
      sessions: base.sessions === undefined ? undefined : base.sessions + inside.length,
      session_buckets: base.session_buckets === undefined ? undefined : sessionBuckets,
      maps: base.maps === undefined ? undefined : maps,
      clicks: (base.clicks ?? 0) + tapped.length,
      click_buckets: clickBuckets,
    }
    if (lists && base.pages) {
      const pages = [...base.pages]
      if (inside.length > 0) pages.push(["onepage", legacy.onePageId, null, inside.length, people.size])
      pages.sort((a, b) => b[3] - a[3] || b[4] - a[4] || ((a[2] ?? "") < (b[2] ?? "") ? -1 : 1))
      out.pages = pages.slice(0, 50)
    }
    if (lists && base.links) {
      const byBlock = new Map<string, { clicks: number; people: Set<string> }>()
      for (const { c, at } of tapped) {
        const l = byBlock.get(c.block_id) ?? { clicks: 0, people: new Set<string>() }
        l.clicks++
        l.people.add(`op:${c.visitor_id || c.id || at}`)
        byBlock.set(c.block_id, l)
      }
      const links = [...base.links]
      for (const [block, l] of byBlock) {
        const same = links.findIndex((x) => x[0] === "onepage" && x[2] === block)
        if (same >= 0) links[same] = [links[same][0], links[same][1], block, links[same][3] + l.clicks, links[same][4] + l.people.size]
        else links.push(["onepage", legacy.onePageId, block, l.clicks, l.people.size])
      }
      links.sort((a, b) => b[3] - a[3] || (a[2] < b[2] ? -1 : 1))
      out.links = links.slice(0, 50)
    }
    return out
  }
  return { cur: add(input.window, starts, wire.cur, true), prev: add(prev, prevStarts, wire.prev, false) }
}

/* ─── Everything ──────────────────────────────────────────────────────── */

function headline(value: number, previous: number): Headline {
  /* Against a negative period (a week of refunds) the change is measured by its size (lib/analytics/percent). */
  return { value, previous, change: changeOf(value, previous) }
}

/** Rows of a breakdown map, its previous period beside it, the largest first. */
function mapRows(now: Record<string, number> | undefined, before: Record<string, number> | undefined, keyer: (k: string) => { key: string; label: string } | null, limit = 25): BreakdownRow[] {
  const cur = new Map<string, { label: string; value: number }>()
  const prev = new Map<string, number>()
  for (const [k, n] of Object.entries(now ?? {})) {
    const row = keyer(k)
    if (!row) continue
    const seen = cur.get(row.key)
    if (seen) seen.value += Number(n) || 0
    else cur.set(row.key, { label: row.label, value: Number(n) || 0 })
  }
  for (const [k, n] of Object.entries(before ?? {})) {
    const row = keyer(k)
    if (row) prev.set(row.key, (prev.get(row.key) ?? 0) + (Number(n) || 0))
  }
  const total = [...cur.values()].reduce((s, r) => s + r.value, 0)
  return [...cur.entries()]
    .filter(([, r]) => r.value > 0)
    .map(([key, r]) => ({ key, label: r.label, value: r.value, previous: prev.get(key) ?? 0, share: total ? r.value / total : 0 }))
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label))
    .slice(0, limit)
}

const OTHER = "(other)"

export function referrerKeyer(mainDomain: string) {
  return (k: string) => {
    const d = k.trim().toLowerCase().replace(/^www\./, "")
    if (!d || d === "direct") return null
    if (d === OTHER) return { key: OTHER, label: tt("Other websites") }
    /* A whole host, not a suffix: "mystorelib.com" is somebody else's site. */
    /* A brand's key as already folded (a merge of two answers) stays that brand. */
    if (REFERRER_BRAND_KEYS.has(d)) return { key: d, label: referrerBrandLabel(d) }
    const self = channelOfUrl(`https://${d}`, mainDomain) === "storelib" || isInternalReferrer(d, mainDomain)
    if (self) return null
    /* One row per company: google.com, google.co.uk and the Google app are Google; l.instagram.com is Instagram; t.co is X. */
    return referrerBrand(d) ?? { key: d, label: d }
  }
}

function referrerBrandLabel(key: string): string {
  const probe: Record<string, string> = { google: "google.com", gmail: "mail.google.com", gemini: "gemini.google.com", x: "x.com", instagram: "instagram.com", facebook: "facebook.com", threads: "threads.net", tiktok: "tiktok.com", youtube: "youtube.com", pinterest: "pinterest.com", linkedin: "linkedin.com", snapchat: "snapchat.com", reddit: "reddit.com", whatsapp: "whatsapp.com", telegram: "telegram.org", discord: "discord.com", twitch: "twitch.tv", bluesky: "bsky.app", tumblr: "tumblr.com", bing: "bing.com", duckduckgo: "duckduckgo.com", brave: "search.brave.com", ecosia: "ecosia.org", baidu: "baidu.com", chatgpt: "chatgpt.com", perplexity: "perplexity.ai", messenger: "messenger.com", github: "github.com", stripe: "stripe.com", apple: "apple.com", linktree: "linktr.ee", substack: "substack.com", spotify: "spotify.com" }
  return referrerBrand(probe[key] ?? key)?.label ?? key
}

/** The systems by name, as people call them. */
function osLabel(k: string): string {
  if (k === "unknown") return tt("Unknown")
  if (k === "other" || k === OTHER) return tt("Other")
  return k
}

/** What kind of product a type is, as the reports group them. */
export function kindOf(type: string | null | undefined): "physical" | "digital" | "membership" | "course" | "other" {
  const t = (type || "").toLowerCase()
  if (t === "physical") return "physical"
  if (t === "membership" || t === "subscription") return "membership"
  if (t === "course") return "course"
  if (t === "digital" || t === "" || t === "download" || t === "ebook" || t === "file") return "digital"
  return "other"
}

function kindLabel(k: string): string {
  if (k === "physical") return tt("Physical")
  if (k === "digital") return tt("Digital")
  if (k === "membership") return tt("Memberships")
  if (k === "course") return tt("Courses")
  return tt("Other")
}

function deviceLabel(d: string): string {
  if (d === "mobile") return tt("Mobile")
  if (d === "desktop") return tt("Desktop")
  if (d === "tablet") return tt("Tablet")
  if (d === OTHER) return tt("Other")
  return tt("Unknown")
}

/** What a OnePage block is called on the page, else where the link goes. */
function linkLabel(link: string, labels: Record<string, string>): string {
  if (labels[link]) return labels[link]
  /* An icon in a row of social icons (lib/onepage/link-keys): the platform's name, for a row whose icons are the profile's. */
  const icon = socialLinkLabel(link)
  if (icon) return icon
  const host = hostOf(link)
  if (host) {
    try {
      const u = new URL(link)
      const path = u.pathname.replace(/\/+$/, "")
      return `${host.replace(/^www\./, "")}${path}`
    } catch {
      return host
    }
  }
  if (/^(mailto|tel|sms):$/.test(link)) return link === "mailto:" ? tt("Email") : link === "tel:" ? tt("Phone") : tt("Text message")
  return tt("Link")
}

export function buildReports(input: {
  /** What the database counted (analytics_report), the OnePage's history already folded in. */
  wire?: ReportWire
  /** Or the rows, counted here by the same rules (wireFromRows). */
  views?: ViewRow[]
  steps?: StepRow[]
  orders: OrderRow[]
  /** The period's and the comparison's sign-ups; left out, the card is not shown. */
  subscribers?: SubscriberRow[]
  window: Span
  /** What the period is compared with: null for no comparison, left out for the period just before. */
  previous?: Span | null
  timeZone: string
  mainDomain: string
  productTitles: Record<string, string>
  selector?: PropertySelector
  properties?: CreatorProperties
  product?: string | null
  /** A OnePage block's name, by its id. */
  linkLabels?: Record<string, string>
  /** Each product's type (physical, digital, membership, course), by its id. */
  productTypes?: Record<string, string | null>
  /** Downloads of each order line (download_events by order id); null when they could not be read. */
  downloadsByLine?: Record<string, number> | null
  /**
   * The All / Digital / Physical switch (lib/analytics/sections). Digital or
   * Physical keeps only the order lines of that kind, so a mixed basket is
   * an order of each with only its own lines' money. Visits are the store's
   * whatever is switched: a visit is not of one kind.
   */
  mode?: SalesMode
}): Reports {
  const { window: cur, timeZone, mainDomain } = input
  const selector = input.selector ?? ALL
  const properties: CreatorProperties = input.properties ?? { onePageId: null, websites: [], defaultWebsite: null }
  const defaultWebsite = properties.defaultWebsite
  const { grain, starts, labels, prev, prevStarts, compared } = periodsOf(cur, input.previous, timeZone)
  const n = starts.length

  const wire =
    input.wire ??
    wireFromRows({
      views: input.views ?? [],
      steps: input.steps ?? [],
      window: cur,
      previous: input.previous === undefined ? previousWindow(cur) : input.previous,
      timeZone,
      selector,
      defaultWebsite,
      product: input.product ?? null,
      mainDomain,
    })
  const now = wire.cur
  const then = wire.prev
  /* A quick first answer has the figures and not yet the lists. */
  const partial = now.maps === undefined || now.pages === undefined

  /* Orders: one per payment, sales only, under the property asked for, of the kind the switch keeps. */
  const mode = input.mode ?? "all"
  /* Grouped first, so a basket is a sale or not as a whole (a pending line of the other kind keeps it pending), then only this kind's lines. */
  const allSales = mode === "all" ? salesFor(input.orders, selector, defaultWebsite) : salesFor(input.orders, selector, defaultWebsite).map((o) => ({ ...o, lines: o.lines.filter((l) => lineInMode((input.productTypes ?? {})[l.product_id], mode)) })).filter((o) => o.lines.length > 0)
  const inWindow = (o: { createdAt: string }, w: Span) => {
    const at = Date.parse(o.createdAt)
    return at >= w.start && at < w.end
  }
  const ordersNow = allSales.filter((o) => inWindow(o, cur))
  const ordersBefore = allSales.filter((o) => inWindow(o, prev))
  /*
    SALES BY THE ORDER'S DAY, REFUNDS BY THE REFUND'S (lib/analytics/
    refund-dates, as Shopify dates them). An order counts its whole charge on
    the day it was placed; a refund takes its money off on the day it was
    made, of any order the reads found, placed in the period or long before.
  */
  const gross = (o: Grouped) => moneyOf(o).gross
  const refundedNow = refundsIn(allSales, cur, (l) => lineMoney(l).refunded)
  const refundedBefore = compared ? refundsIn(allSales, prev, (l) => lineMoney(l).refunded) : []
  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)

  const series = (items: (w: Span) => Array<{ at: number; n?: number }>): Series => ({
    labels,
    current: bucketCounts(items(cur), starts, cur, n),
    previous: compared ? bucketCounts(items(prev), prevStarts, prev, n) : [],
  })
  const wired = (a: number[] | undefined, b: number[] | undefined): Series => ({
    labels,
    current: fit(a, n),
    previous: compared ? fit(b, n) : [],
  })
  const head = (value: number, previous: number) => (compared ? headline(value, previous) : { value, previous: 0, change: null })

  const orderSeries = series((w) => (w === cur ? ordersNow : ordersBefore).map((o) => ({ at: Date.parse(o.createdAt) })))
  const salesSeries = series((w) => [
    ...(w === cur ? ordersNow : ordersBefore).map((o) => ({ at: Date.parse(o.createdAt), n: gross(o) })),
    ...(w === cur ? refundedNow : refundedBefore).map((e) => ({ at: e.at, n: -e.cents })),
  ])
  /* One order refunded on one day is one refund: two lines of a basket refunded together are one. */
  const refundCount = (events: typeof refundedNow, bucketsOf: number[]) => {
    const seen = new Set<string>()
    return events.filter((e) => {
      const k = `${e.order.id}|${bucketIndex(bucketsOf, e.at)}`
      if (seen.has(k)) return false
      seen.add(k)
      return true
    })
  }
  const refundsNowCounted = refundCount(refundedNow, starts)
  const refundsBeforeCounted = refundCount(refundedBefore, prevStarts)
  const refundSeries = series((w) => (w === cur ? refundsNowCounted : refundsBeforeCounted).map((e) => ({ at: e.at })))
  const salesNow = sum(ordersNow.map(gross)) - sum(refundedNow.map((e) => e.cents))
  const salesBefore = sum(ordersBefore.map(gross)) - sum(refundedBefore.map((e) => e.cents))
  const visitorSeries = wired(now.visitor_buckets, then.visitor_buckets)
  const viewSeries = wired(now.view_buckets, then.view_buckets)
  const sessionSeries = wired(now.session_buckets, then.session_buckets)
  const clickSeries = wired(now.click_buckets, then.click_buckets)

  /* Conversion: orders over visitors, for the same property and period. No visitors, no rate. */
  const rateOf = (orders: number, visitors: number) => (visitors > 0 ? orders / visitors : null)
  const conversionNow = rateOf(ordersNow.length, now.visitors ?? 0)
  const conversionBefore = compared ? rateOf(ordersBefore.length, then.visitors ?? 0) : null
  const conversion: Reports["conversion"] = {
    value: conversionNow,
    previous: conversionBefore,
    change: conversionNow !== null && conversionBefore !== null && conversionBefore > 0 ? (conversionNow - conversionBefore) / conversionBefore : null,
    series: {
      labels,
      current: orderSeries.current.map((o, i) => rateOf(o, visitorSeries.current[i])),
      previous: compared ? orderSeries.previous.map((o, i) => rateOf(o, visitorSeries.previous[i])) : [],
    },
  }

  /* Top pages: each page of each place, its views and its visitors. */
  const placeLabel = (pt: string | null, pid: string | null) =>
    selector.type === "all" && pt ? propertyName({ type: pt as never, id: pid }, properties) : null
  const pageTotal = sum((now.pages ?? []).map((p) => Number(p[3]) || 0))
  /*
    NO "PAGE UNKNOWN". A view with a place but no path (written before the
    path was kept) is named by its place: "Creator page", the website's name,
    "OnePage". Views with neither (from before places were kept) are one row,
    "Earlier visits", last, so the list never fills with rows nobody can read.
  */
  const placeOf = (pt: string | null, pid: string | null) => (pt ? propertyName({ type: pt as never, id: pid }, properties) : null)
  const named: PageRow[] = []
  let earlier: PageRow | null = null
  const titleOf = new Map((now.titles ?? []).map(([pt, pid, path, title]) => [`${pt ?? ""}|${pid ?? ""}|${path ?? ""}`, title]))
  for (const [pt, pid, path, views, visitors] of now.pages ?? []) {
    const v = Number(views) || 0
    const u = Number(visitors) || 0
    if (!path && !pt) {
      earlier = earlier ?? { key: "earlier", label: tt("Earlier visits"), place: null, views: 0, visitors: 0, share: 0 }
      earlier.views += v
      earlier.visitors += u
      continue
    }
    named.push({
      key: `${pt ?? ""}|${pid ?? ""}|${path ?? ""}`,
      label: path ?? placeOf(pt, pid) ?? tt("Earlier visits"),
      place: path ? placeLabel(pt, pid) : null,
      title: path ? titleOf.get(`${pt ?? ""}|${pid ?? ""}|${path}`) ?? null : null,
      views: v,
      visitors: u,
      share: 0,
    })
  }
  const topPages: PageRow[] = [...named, ...(earlier ? [earlier] : [])].map((r) => ({ ...r, share: pageTotal ? r.views / pageTotal : 0 }))

  /* Top links: the OnePage's blocks by the name they have on the page. */
  const linkTotal = sum((now.links ?? []).map((l) => Number(l[3]) || 0))
  const topLinks: LinkRow[] = (now.links ?? []).map(([pt, pid, link, clicks, visitors]) => ({
    key: `${pt ?? ""}|${pid ?? ""}|${link}`,
    label: linkLabel(link, input.linkLabels ?? {}),
    clicks: Number(clicks) || 0,
    visitors: Number(visitors) || 0,
    share: linkTotal ? (Number(clicks) || 0) / linkTotal : 0,
  }))

  /*
    Top products: page views from the events, orders and money from each
    product's own lines of each payment (lineMoney), so the rows add up to
    Revenue. A deleted product keeps its sales under "Removed product".
  */
  const topProducts: ProductRow[] = (() => {
    const keyOf = (id: string | null | undefined) => (id && input.productTitles[id] ? id : REMOVED_PRODUCT)
    /*
      ORDERS ARE PAYMENTS, NOT LINES. A basket holds one line per variant
      (lib/checkout/fulfil-cart-item), so a red mug and a blue mug in one
      order are two lines of one product: that is one order of the mug, as
      the kinds and the Digital card already count it, not two.
    */
    const rows = new Map<string, { views: number; orders: Set<string>; cents: number }>()
    const rowOf = (key: string) => {
      const row = rows.get(key) ?? { views: 0, orders: new Set<string>(), cents: 0 }
      rows.set(key, row)
      return row
    }
    for (const [id, views] of now.products ?? []) rowOf(keyOf(id)).views += Number(views) || 0
    for (const o of ordersNow) {
      for (const line of o.lines) {
        const row = rowOf(keyOf(line.product_id))
        row.orders.add(o.id)
        row.cents += lineMoney(line).gross
      }
    }
    for (const e of refundedNow) rowOf(keyOf(e.line.product_id)).cents -= e.cents
    const cents = sum([...rows.values()].map((r) => Math.max(0, r.cents)))
    const orders = sum([...rows.values()].map((r) => r.orders.size))
    const views = sum([...rows.values()].map((r) => r.views))
    return [...rows.entries()]
      .map(([key, r]) => ({
        key,
        label: key === REMOVED_PRODUCT ? tt("Removed product") : input.productTitles[key],
        kind: key === REMOVED_PRODUCT ? null : kindOf((input.productTypes ?? {})[key]),
        views: r.views,
        orders: r.orders.size,
        salesCents: r.cents,
        share: cents > 0 ? Math.max(0, r.cents) / cents : orders > 0 ? r.orders.size / orders : views > 0 ? r.views / views : 0,
      }))
      .sort((a, b) => b.salesCents - a.salesCents || b.orders - a.orders || b.views - a.views || a.label.localeCompare(b.label))
      .slice(0, 25)
  })()

  /*
    The funnel, in people: visitors, visitors who opened a product, visitors
    who opened the checkout, and orders. A step with nothing while a later
    step has something was not recorded (a checkout opened on the website's
    own checkout before it was tracked, an order made without the checkout
    page): it says so rather than 0%, and the next step has no rate.
  */
  const funnel: FunnelStep[] = (() => {
    if (partial) return []
    const values = [now.visitors ?? 0, now.product_visitors ?? 0, now.carts ?? 0, now.checkouts ?? 0, ordersNow.length]
    const steps: Array<Pick<FunnelStep, "key" | "label">> = [
      { key: "visitors", label: tt("Visitors") },
      { key: "product", label: tt("Viewed a product") },
      { key: "cart", label: tt("Added to cart") },
      { key: "checkout", label: tt("Started checkout") },
      { key: "orders", label: tt("Ordered") },
    ]
    return steps.map((s, i) => {
      const value = values[i]
      const recorded = !(value === 0 && values.slice(i + 1).some((v) => v > 0))
      const before = i > 0 ? values[i - 1] : 0
      const beforeRecorded = i > 0 && !(before === 0 && values.slice(i).some((v) => v > 0))
      const rate = i > 0 && recorded && beforeRecorded && before > 0 && value <= before ? value / before : null
      return { ...s, value, rate, recorded }
    })
  })()

  /*
    BY KIND OF PRODUCT: physical, digital, memberships, courses. Each line
    of each payment under its product's kind, money as Top products counts
    it (lineMoney), so the kinds add up to Revenue. A payment with lines of
    two kinds is an order of each.
  */
  const types = input.productTypes ?? {}
  const kinds: KindRow[] = (() => {
    const rows = new Map<string, { orders: Set<string>; units: number; cents: number; refunds: number }>()
    for (const o of ordersNow) {
      for (const line of o.lines) {
        const k = kindOf(types[line.product_id])
        const row = rows.get(k) ?? { orders: new Set<string>(), units: 0, cents: 0, refunds: 0 }
        row.orders.add(o.id)
        row.units += Math.max(1, Number(line.quantity) || 1)
        row.cents += lineMoney(line).gross
        rows.set(k, row)
      }
    }
    for (const e of refundedNow) {
      const k = kindOf(types[e.line.product_id])
      const row = rows.get(k) ?? { orders: new Set<string>(), units: 0, cents: 0, refunds: 0 }
      row.cents -= e.cents
      row.refunds++
      rows.set(k, row)
    }
    const total = sum([...rows.values()].map((r) => Math.max(0, r.cents)))
    const orderTotal = sum([...rows.values()].map((r) => r.orders.size))
    return [...rows.entries()]
      .map(([key, r]) => ({ key, label: kindLabel(key), orders: r.orders.size, units: r.units, salesCents: r.cents, refunds: r.refunds, share: total > 0 ? Math.max(0, r.cents) / total : orderTotal > 0 ? r.orders.size / orderTotal : 0 }))
      .sort((a, b) => b.salesCents - a.salesCents || b.orders - a.orders || a.key.localeCompare(b.key))
  })()

  /* Digital products: everything that does not ship. Downloads are of these very orders' lines. */
  const digital: DigitalFigures = (() => {
    const per = new Map<string, { orders: Set<string>; cents: number; downloads: number }>()
    const orders = new Set<string>()
    let cents = 0
    let downloads = 0
    const downloaded = new Set<string>()
    const counted = input.downloadsByLine ?? null
    let charged = 0
    const productKey = (id: string | null | undefined) => (id && input.productTitles[id] ? id : REMOVED_PRODUCT)
    for (const e of refundedNow) {
      if (kindOf(types[e.line.product_id]) === "physical") continue
      cents -= e.cents
      const key = productKey(e.line.product_id)
      const row = per.get(key) ?? { orders: new Set<string>(), cents: 0, downloads: 0 }
      row.cents -= e.cents
      per.set(key, row)
    }
    for (const o of ordersNow) {
      for (const line of o.lines) {
        if (kindOf(types[line.product_id]) === "physical") continue
        orders.add(o.id)
        const m = lineMoney(line).gross
        cents += m
        charged += m
        const key = productKey(line.product_id)
        const row = per.get(key) ?? { orders: new Set<string>(), cents: 0, downloads: 0 }
        row.orders.add(o.id)
        row.cents += m
        const n = counted ? Number(counted[line.id]) || 0 : 0
        row.downloads += n
        downloads += n
        if (n > 0) downloaded.add(o.id)
        per.set(key, row)
      }
    }
    return {
      orders: orders.size,
      salesCents: cents,
      /* What an order brought in when it was placed: a refund of an older order is not this period's average. */
      averageCents: orders.size > 0 ? Math.round(charged / orders.size) : null,
      downloads: counted ? { total: downloads, orders: downloaded.size } : null,
      top: [...per.entries()]
        .map(([key, r]) => ({ key, label: key === REMOVED_PRODUCT ? tt("Removed product") : input.productTitles[key], orders: r.orders.size, salesCents: r.cents, downloads: counted ? r.downloads : null }))
        .sort((a, b) => b.salesCents - a.salesCents || b.orders - a.orders || a.label.localeCompare(b.label))
        .slice(0, 25),
    }
  })()

  /* Sign-ups: people who left their email on one of the creator's places or at checkout. */
  const subscribers: SubscriberFigures | null = (() => {
    if (!input.subscribers) return null
    const whenOf = (r: SubscriberRow) => Date.parse(r.subscribed_at || r.created_at || "")
    const mine = input.subscribers.filter((r) => isSignup(r) && counts(selector, subscriberProperty(r), defaultWebsite))
    const inside = (w: Span) => mine.filter((r) => {
      const at = whenOf(r)
      return at >= w.start && at < w.end
    })
    const nowRows = inside(cur)
    const beforeRows = compared ? inside(prev) : []
    const group = (rows: SubscriberRow[], keyer: (r: SubscriberRow) => { key: string; label: string }) => {
      const m = new Map<string, { label: string; value: number }>()
      for (const r of rows) {
        const k = keyer(r)
        const row = m.get(k.key) ?? { label: k.label, value: 0 }
        row.value++
        m.set(k.key, row)
      }
      return m
    }
    const rows = (keyer: (r: SubscriberRow) => { key: string; label: string }) => {
      const a = group(nowRows, keyer)
      const b = group(beforeRows, keyer)
      return [...a.entries()]
        .map(([key, r]) => ({ key, label: r.label, value: r.value, previous: b.get(key)?.value ?? 0, share: nowRows.length ? r.value / nowRows.length : 0 }))
        .sort((x, y) => y.value - x.value || x.label.localeCompare(y.label))
    }
    return {
      ...head(nowRows.length, beforeRows.length),
      byProperty: selector.type === "all" ? rows((r) => {
        const on = subscriberProperty(r)
        const label = propertyName(on, properties)
        return { key: label, label }
      }) : [],
      bySource: rows((r) => {
        const source = r.last_touch?.source ?? null
        return source ? { key: sourceName(source), label: sourceName(source) } : { key: "not_recorded", label: tt("Not recorded") }
      }),
    }
  })()

  const maps = now.maps ?? {}
  const before = then.maps ?? {}
  const breakdowns: Reports["breakdowns"] = {
    source: mapRows(maps.source, before.source, (k) => {
      if (k === OTHER) return { key: "other", label: tt("Other") }
      const g = sourceGroup(k)
      return { key: g, label: SOURCE_LABEL[g] }
    }),
    social: mapRows(maps.source, before.source, (k) => {
      const nw = socialNetwork(k)
      return nw ? { key: nw, label: SOCIAL_LABEL[nw] ?? (nw === "other" ? tt("Other social") : titleCase(nw)) } : null
    }),
    referrer: mapRows(maps.referrer, before.referrer, referrerKeyer(mainDomain)),
    campaign: mapRows(maps.campaign, before.campaign, (k) => (k === OTHER ? { key: OTHER, label: tt("Other campaigns") } : k.trim() ? { key: k.toLowerCase(), label: k } : null)),
    country: mapRows(maps.country, before.country, (k) =>
      k === "unknown" || k === "XX" || k === OTHER || !/^[A-Z]{2}$/.test(k) ? null : { key: k, label: countryName(k) },
    ).map((r) => ({ ...r, extra: { code: r.key } })),
    device: mapRows(maps.device, before.device, (k) => ({ key: k === OTHER ? OTHER : ["mobile", "desktop", "tablet"].includes(k) ? k : "unknown", label: deviceLabel(k) })),
    browser: mapRows(maps.browser, before.browser, (k) =>
      k === "unknown" ? { key: "unknown", label: tt("Unknown") } : k === OTHER ? { key: OTHER, label: tt("Other") } : { key: k, label: titleCase(k) },
    ),
    /* Visitors by system: iOS, Android, Windows, macOS, Linux, ChromeOS by name, everything else Other. */
    os: (() => {
      const toMap = (xs: WindowWire["os"]) => Object.fromEntries(Object.entries((xs ?? []).reduce<Record<string, number>>((m, [k, people]) => ((m[k] = (m[k] ?? 0) + (Number(people) || 0)), m), {})))
      const views = new Map<string, number>()
      for (const [k, , v] of now.os ?? []) views.set(osKey(k), (views.get(osKey(k)) ?? 0) + (Number(v) || 0))
      return mapRows(toMap(now.os), toMap(then.os), (k) => {
        const key = osKey(k)
        return { key, label: osLabel(key) }
      }).map((r) => ({ ...r, extra: { views: views.get(r.key) ?? 0 } }))
    })(),
    /* Orders by where the buyer is, from the order itself. */
    orderCountry: (() => {
      const codeOf = (o: Grouped) => {
        const code = (o.lines[0]?.buyer_country_code || "").toUpperCase()
        return /^[A-Z]{2}$/.test(code) && code !== "XX" ? code : null
      }
      const count = (list: Grouped[], refunds: typeof refundedNow) => {
        const m: Record<string, number> = {}
        const cents: Record<string, number> = {}
        for (const o of list) {
          const code = codeOf(o)
          if (!code) continue
          m[code] = (m[code] ?? 0) + 1
          cents[code] = (cents[code] ?? 0) + gross(o)
        }
        /* A refund is taken off a country with an order in the period; one that only refunded an older order has no row of its own. */
        for (const e of refunds) {
          const code = codeOf(e.order)
          if (code && code in cents) cents[code] -= e.cents
        }
        return { m, cents }
      }
      const a = count(ordersNow, refundedNow)
      const b = count(ordersBefore, refundedBefore)
      return mapRows(a.m, b.m, (k) => ({ key: k, label: countryName(k) })).map((r) => ({ ...r, extra: { code: r.key, salesCents: a.cents[r.key] ?? 0 } }))
    })(),
  }

  return {
    grain,
    compared,
    ...(partial ? { partial: true } : {}),
    visitors: { ...head(now.visitors ?? 0, then.visitors ?? 0), series: visitorSeries },
    views: { ...head(now.views ?? 0, then.views ?? 0), series: viewSeries },
    sessions: { ...head(now.sessions ?? 0, then.sessions ?? 0), series: sessionSeries },
    conversion,
    sales: { ...head(salesNow, salesBefore), series: salesSeries },
    orders: { ...head(ordersNow.length, ordersBefore.length), series: orderSeries },
    refunds: {
      value: refundsNowCounted.length,
      previous: compared ? refundsBeforeCounted.length : 0,
      cents: sum(refundedNow.map((e) => e.cents)),
      previousCents: sum(refundedBefore.map((e) => e.cents)),
      series: refundSeries,
    },
    linkClicks: { value: now.clicks ?? 0, series: clickSeries },
    topPages,
    topLinks,
    topProducts,
    funnel,
    kinds,
    digital,
    subscribers,
    breakdowns,
  }
}
