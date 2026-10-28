import "server-only"

/**
 * ===========================================================================
 *  WHAT THE REPORTS READ, FOR ONE SIGNED IN CREATOR
 * ===========================================================================
 * The reads behind /app/analytics, Home's chart and the small summaries on
 * the Website and OnePage screens (app/api/analytics/reports and
 * app/api/analytics/summary). lib/analytics/reports.ts turns them into
 * figures; this file only reads.
 *
 * WHO. Every read is scoped to the creator the caller found from the signed
 * in user, never to anything in the request. A property is honoured only
 * when it is theirs (lib/analytics/properties ownsProperty): a website id
 * that belongs to somebody else is refused before anything is read.
 *
 * COUNTED WHERE THE ROWS ARE. analytics_report (supabase/sql/run-now part
 * 60) counts visitors, visits and the lists in Postgres and answers with a
 * few hundred numbers. Until that part has run, the rows are read here a
 * page at a time and counted by the same rules (reports.ts wireFromRows).
 */

import { unconvertedIncluded } from "./unconverted-count"
import { refundedOrderIds, withRefundHistory } from "./refund-history-server"
import { inStoreCurrency } from "@/lib/money/report-currency-server"
import { readStoreCurrency } from "@/lib/store/selling-currency-read"
import { dayRatesBetween } from "@/lib/markets/fx-server"
import type { createAdminClient } from "@/lib/supabase/admin"
import type { OrderRow } from "@/lib/orders/order-view"
import { byCreator, ownRows, scopedOrders } from "./creator-orders"
import { withoutTestSales } from "./test-sales"
import { onePageOf, publishedInstallOf } from "./property"
import { categorizeServerSource, detectClientAppFromUA, isInternalReferrer, referrerHost } from "./sources"
import { isBotAgent, parseUserAgent } from "./user-agent"
import { socialLinkId, socialLinkLabel } from "@/lib/onepage/link-keys"
import type { SalesMode } from "./sections"
import { counts, propertyParam, type CreatorProperties, type PropertySelector, type WebsiteProperty } from "./properties"
import {
  audienceOf,
  foldLegacyOnePage,
  periodsOf,
  reportArgs,
  spansToRead,
  wireFromRows,
  type LegacyOnePage,
  type OnePageClickRow,
  type OnePageViewRow,
  type ReportWire,
  type Span,
  type StepRow,
  type SubscriberRow,
  type ViewRow,
  type WindowWire,
} from "./reports"
import { navWireFromRows, type NavClickRow, type NavWire } from "./site-clicks"
import { storedRowSeries, type SeriesMap, type StoredDim } from "./row-series"

export type Admin = ReturnType<typeof createAdminClient>

const PAGE = 1000
const CEILING = 200_000
const DAY = 86_400_000

type Read<T> = PromiseLike<{ data: T[] | null; error: { message: string; code?: string } | null }>
type After = { t: string; id: string } | null

/* ─── Reading every row ────────────────────────────────────────────────── */

/**
 * EVERY ROW, A PAGE AT A TIME, EACH PAGE WHERE THE LAST ENDED: sorted by
 * `created_at` then `id`, the next page asked for as "from this time, past
 * this id" (a keyset), never "skip the first n".
 */
export async function readAll<T extends { created_at: string; id?: string }>(page: (after: After) => Read<T>) {
  const rows: T[] = []
  let after: After = null
  while (rows.length < CEILING) {
    const { data, error } = await page(after)
    if (error) throw new Error(error.message)
    rows.push(...(data ?? []))
    if (!data || data.length < PAGE) return { rows, truncated: false }
    const last = data[data.length - 1]
    after = { t: last.created_at, id: String(last.id) }
  }
  return { rows, truncated: true }
}

interface KeysetQuery<Q> {
  gte(column: string, value: string): Q
  or(filters: string): Q
}
/** Where a page starts: the stretch's start, or the last row's time and past its id. */
export function startingAt<Q extends KeysetQuery<Q>>(q: Q, start: string, after: After): Q {
  if (!after) return q.gte("created_at", start)
  return q.gte("created_at", after.t).or(`created_at.gt."${after.t}",id.gt.${after.id}`)
}

/** Every row of every stretch, in order; the stretches are read side by side. */
export async function readSpans<T extends { created_at: string; id?: string }>(spans: Span[], page: (start: string, end: string, after: After) => Read<T>) {
  const reads = await Promise.all(
    spans.map((s) => {
      const iso = [new Date(s.start).toISOString(), new Date(s.end).toISOString()]
      return readAll<T>((after) => page(iso[0], iso[1], after))
    }),
  )
  return { rows: reads.flatMap((r) => r.rows), truncated: reads.some((r) => r.truncated) }
}

/**
 * Named columns keep a read small; if the database is missing one of them
 * (an older install), the same read is made with `*` rather than the report
 * failing. A missing column must never read as "no visits".
 */
export async function withColumns<T>(columns: string, read: (columns: string) => Promise<T>): Promise<T> {
  try {
    return await read(columns)
  } catch (error) {
    if (!/column|PGRST204|42703/i.test((error as Error).message)) throw error
    console.warn("[analytics] falling back to every column:", (error as Error).message)
    return read("*")
  }
}

/* ─── The database's own counting, once it is there ───────────────────── */

/* Until the owner has run the SQL the function is missing; that is
   remembered for a while, so each request does not ask first. */
let functionsMissingUntil = 0

export async function rpc<T>(admin: Admin, fn: string, args: Record<string, unknown>): Promise<T | null> {
  if (Date.now() < functionsMissingUntil) return null
  const { data, error } = await admin.rpc(fn, args)
  if (!error && data) return data as T
  if (error && (error.code === "PGRST202" || error.code === "42883" || /could not find the function/i.test(error.message ?? ""))) {
    functionsMissingUntil = Date.now() + 5 * 60_000
  } else if (error) {
    /* Anything else (a zone Postgres does not know, a timeout): counted from the rows, so the page still gets its figures. */
    console.warn(`[analytics] ${fn} failed, counting from the rows:`, error.message)
  }
  return null
}

/** A read that may fail on an older database (a table or column not there yet): nothing, rather than no report. */
async function orNone<T>(read: Promise<{ rows: T[]; truncated: boolean }>): Promise<{ rows: T[]; truncated: boolean }> {
  try {
    return await read
  } catch {
    return { rows: [], truncated: false }
  }
}

/* ─── The creator's places ─────────────────────────────────────────────── */

/**
 * THE CREATOR'S PLACES: their OnePage if they have one (found as the
 * events place it, lib/analytics/property onePageOf), and every website that
 * is live or has been live. The live one is where anything that never knew
 * its install belongs (defaultWebsite).
 */
export async function creatorProperties(admin: Admin, creatorId: string, userId: string | null): Promise<CreatorProperties> {
  const installs = (async (): Promise<Array<{ id: string; name?: string | null; status?: string | null; published_at?: string | null }>> => {
    const read = (columns: string) =>
      admin.from("store_theme_installs").select(columns).eq("creator_id", creatorId).order("sort_order", { ascending: true })
    let { data, error } = await read("id, name, status, published_at")
    if (error) ({ data, error } = await read("id, name, status"))
    if (error) return []
    return (data ?? []) as unknown as Array<{ id: string; name?: string | null; status?: string | null; published_at?: string | null }>
  })()
  const [onePageId, rows, live] = await Promise.all([
    onePageOf(admin, creatorId, userId),
    installs,
    publishedInstallOf(admin, creatorId),
  ])
  const websites: WebsiteProperty[] = rows
    /* A draft that was never published has had no visitor. A site that was live and then taken down keeps its history. */
    .filter((r) => r.status === "published" || !!r.published_at || r.id === live)
    .map((r) => {
      const id = String(r.id).toLowerCase()
      return { id, name: (r.name || "").trim() || "Website", published: r.status === "published" || id === (live ? String(live).toLowerCase() : null) }
    })
  const defaultWebsite = (live ? String(live).toLowerCase() : null) ?? websites[0]?.id ?? null
  return { onePageId: onePageId ? onePageId.toLowerCase() : null, websites, defaultWebsite }
}

/* ─── Visits ──────────────────────────────────────────────────────────── */

const VIEW_COLUMNS =
  "id, session_id, visitor_id, product_id, created_at, property_type, property_id, path, source_category, referrer_domain, country_code, device_type, browser, os, page_url, utm_campaign"
const STEP_COLUMNS = "id, event_type, session_id, visitor_id, product_id, property_type, property_id, link_id, link_url, created_at"

export interface CountQuestion {
  creatorId: string
  selector: PropertySelector
  properties: CreatorProperties
  product: string | null
  window: Span
  previous: Span | null
  timeZone: string
  mainDomain: string
  /** The quick part only (visitors, page views, link clicks), or everything. */
  part: "figures" | "detail" | "all"
  now?: number
  /** The All / Digital / Physical switch: the order lines the sales figures keep. Visits are the store's. */
  mode?: SalesMode
}

/** The selector as analytics_report's first arguments. */
function selectorArgs(q: CountQuestion) {
  const s = q.selector
  return {
    p_creator_id: q.creatorId,
    p_property_type: s.type === "all" ? null : s.type,
    p_property_id: s.type === "website" ? s.id : null,
    p_default_website: q.properties.defaultWebsite,
    p_product_id: q.product,
  }
}

/**
 * THE VISITS OF BOTH PERIODS, COUNTED: by the database when it can, else
 * from the rows read here. The OnePage's older visits are not in here yet:
 * foldLegacy adds them.
 */
type Counted = { wire: ReportWire; truncated: boolean; counted: "database" | "rows" }

/**
 * `shared` is one request's memory: when the database cannot count and the
 * rows are read here, the quick part and the rest are counted from one read
 * of them, not two.
 */
export async function countVisits(admin: Admin, q: CountQuestion, shared: { rows?: Promise<Counted> } = {}): Promise<Counted> {
  const args = { ...selectorArgs(q), ...reportArgs(q.window, q.previous, q.timeZone), p_now: q.now ? new Date(q.now).toISOString() : null }
  const ask = (part: "figures" | "detail") => rpc<ReportWire>(admin, "analytics_report", { ...args, p_part: part })
  /* The quick part and the rest side by side: Postgres counts them on two connections at once. */
  const answers = q.part === "all" ? await Promise.all([ask("figures"), ask("detail")]) : [await ask(q.part), null]
  if (answers[0] && (q.part !== "all" || answers[1])) {
    const [a, b] = answers
    const merge = (x: WindowWire | undefined, y: WindowWire | undefined): WindowWire => ({ ...(x ?? {}), ...(y ?? {}) })
    return { wire: { cur: merge(a!.cur, b?.cur), prev: merge(a!.prev, b?.prev) }, truncated: false, counted: "database" }
  }
  shared.rows ??= countFromRows(admin, q)
  return shared.rows
}

/** Every part, from the rows: what the database counts, counted here (reports.ts wireFromRows). */
async function countFromRows(admin: Admin, q: CountQuestion): Promise<Counted> {
  /* The rows, a day before the earlier period (a visit that runs into it began there) to the end of the later one. */
  const spans = spansToRead({ start: q.window.start - DAY, end: q.window.end }, q.previous ? { start: q.previous.start - DAY, end: q.previous.end } : null)
  const [views, steps] = await Promise.all([
    withColumns(VIEW_COLUMNS, (columns) =>
      readSpans<ViewRow & { id: string }>(spans, (start, end, after) => {
        let r = admin.from("analytics_events").select(columns).eq("creator_id", q.creatorId).eq("event_type", "view").lt("created_at", end)
        if (q.product) r = r.eq("product_id", q.product)
        return startingAt(r, start, after).order("created_at", { ascending: true }).order("id", { ascending: true }).limit(PAGE) as unknown as Read<ViewRow & { id: string }>
      }),
    ),
    orNone<StepRow>(
      withColumns(STEP_COLUMNS, (columns) =>
        readSpans<StepRow & { id: string }>(spans, (start, end, after) =>
          startingAt(admin.from("analytics_events").select(columns).eq("creator_id", q.creatorId).in("event_type", ["checkout_start", "link_click", "buy_click"]).lt("created_at", end), start, after)
            .order("created_at", { ascending: true })
            .order("id", { ascending: true })
            .limit(PAGE) as unknown as Read<StepRow & { id: string }>,
        ),
      ),
    ),
  ])
  const wire = wireFromRows({
    views: views.rows,
    steps: steps.rows,
    window: q.window,
    previous: q.previous,
    timeZone: q.timeZone,
    selector: q.selector,
    defaultWebsite: q.properties.defaultWebsite,
    product: q.product,
    mainDomain: q.mainDomain,
  })
  return { wire, truncated: views.truncated || steps.truncated, counted: "rows" }
}

/* ─── The OnePage before its events ───────────────────────────────────── */

/**
 * THE ONEPAGE'S HISTORY. Its first row in analytics_events is the moment it
 * started being counted there; its onepage_views and onepage_clicks from
 * before that moment are read, and nothing after it (lib/analytics/reports
 * foldLegacyOnePage). Only asked for All and the OnePage, without a product.
 */
export async function readLegacyOnePage(admin: Admin, q: CountQuestion): Promise<{ legacy: LegacyOnePage | null; truncated: boolean }> {
  const onePageId = q.properties.onePageId
  if (!onePageId || q.product || (q.selector.type !== "all" && q.selector.type !== "onepage")) return { legacy: null, truncated: false }
  /* The first OnePage view: the whole key of idx_analytics_events_property_type_time, so the index's first entry is the answer. */
  const first = await admin
    .from("analytics_events")
    .select("created_at")
    .eq("creator_id", q.creatorId)
    .eq("property_type", "onepage")
    .eq("property_id", onePageId)
    .eq("event_type", "view")
    .order("created_at", { ascending: true })
    .limit(1)
  /* Before part 61 there is no property_type, and no OnePage event: the old tables are the whole record. */
  const sinceIso = !first.error && Array.isArray(first.data) && first.data[0] ? (first.data[0] as { created_at: string }).created_at : null
  const since = sinceIso ? Date.parse(sinceIso) : null
  const spans = spansToRead(q.window, q.previous)
    .map((s) => ({ start: s.start, end: since === null ? s.end : Math.min(s.end, since) }))
    .filter((s) => s.end > s.start)
  if (spans.length === 0) return { legacy: { onePageId, since, views: [], clicks: [] }, truncated: false }
  const read = <T extends { created_at: string; id?: string }>(table: string, columns: string) =>
    withColumns(columns, (cols) =>
      readSpans<T>(spans, (start, end, after) =>
        startingAt(admin.from(table).select(cols).eq("onepage_id", onePageId).lt("created_at", end), start, after)
          .order("created_at", { ascending: true })
          .order("id", { ascending: true })
          .limit(PAGE) as unknown as Read<T>,
      ),
    )
  const [views, clicks] = await Promise.all([
    read<OnePageViewRow & { id: string }>("onepage_views", "id, visitor_id, referrer, user_agent, country_code, created_at"),
    orNone<OnePageClickRow>(read<OnePageClickRow & { id: string }>("onepage_clicks", "id, block_id, url, visitor_id, created_at")),
  ])
  return { legacy: { onePageId, since, views: views.rows, clicks: clicks.rows }, truncated: views.truncated || clicks.truncated }
}

export function foldLegacy(wire: ReportWire, legacy: LegacyOnePage | null, q: CountQuestion): ReportWire {
  return foldLegacyOnePage(wire, legacy, { window: q.window, previous: q.previous, timeZone: q.timeZone, selector: q.selector, product: q.product }, {
    isBot: isBotAgent,
    /* Storelib itself and the payment pages are where a visitor just was, not where the visit came from: direct. */
    categorize: (host, ua) => categorizeServerSource(host && !isInternalReferrer(host, q.mainDomain) ? host : "Direct", null, null, detectClientAppFromUA(ua)),
    parseAgent: parseUserAgent,
    hostOf: referrerHost,
    mainDomain: q.mainDomain,
  })
}

type Block = { id?: string; type?: string; data?: Record<string, unknown> }

/** What a creator called a block, so the OnePage's links read as their page does. */
function blockLabel(block: Block): string | null {
  const d = (block.data ?? {}) as Record<string, unknown>
  const pick = (...keys: string[]) => keys.map((k) => d[k]).find((v) => typeof v === "string" && v.trim()) as string | undefined
  return pick("label", "title", "product_title", "headline", "digital_product_title", "spotify_title", "apple_music_title", "soundcloud_title", "name") ?? null
}

export async function onePageLinkLabels(admin: Admin, onePageId: string | null): Promise<Record<string, string>> {
  if (!onePageId) return {}
  const { data } = await admin.from("onepages").select("published_blocks, draft_blocks").eq("id", onePageId).maybeSingle()
  const page = data as { published_blocks?: Block[] | null; draft_blocks?: Block[] | null } | null
  const labels: Record<string, string> = {}
  const walk = (blocks: Block[] | null | undefined) => {
    for (const b of blocks ?? []) {
      const label = b?.id ? blockLabel(b) : null
      if (b?.id && label && !labels[b.id]) labels[b.id] = label
      /* A row of social icons: each icon is counted under `<row>__<platform>` (lib/onepage/link-keys) and listed by the platform's name. */
      if (b?.id && b.type === "social_row") {
        if (!labels[b.id]) labels[b.id] = "Social icons"
        const platforms = (b.data as { platforms?: Array<{ platform?: string }> } | undefined)?.platforms
        for (const p of Array.isArray(platforms) ? platforms : []) {
          if (!p?.platform) continue
          const id = socialLinkId(b.id, p.platform)
          const name = socialLinkLabel(id)
          if (name && !labels[id]) labels[id] = name
        }
      }
      const children = (b?.data as { children?: Block[] } | undefined)?.children
      if (Array.isArray(children)) walk(children)
    }
  }
  walk(page?.published_blocks)
  walk(page?.draft_blocks)
  return labels
}

/* ─── Orders and sign-ups ─────────────────────────────────────────────── */

/* What the figures read of an order (lib/orders/order-view, reports.ts moneyOf), and where it was made. */
const ORDER_COLUMNS =
  "id, product_id, amount_cents, tip_cents, status, created_at, stripe_session_id, refund_amount_cents, refunded_at, source, source_detail, property_type, property_id, buyer_country_code, buyer_country, currency, quantity"

/** The day rates through the reports' own client (lib/markets/fx-server fx_rates): the database that answers the question answers its rates. */
export const ratesFrom = (admin: Admin) => (from: string, to: string) => dayRatesBetween(from, to, admin)

/** The most refunded lines of older orders read for one question (refundedEarlier). */
const REFUNDED_CEILING = 5000

/**
 * REFUNDS MADE IN THE PERIODS, OF ORDERS PLACED BEFORE THEM. A refund is
 * dated by the day it was made (lib/analytics/refund-dates), so a refund
 * today of an order from March takes its money off today's figures; the
 * order is outside every read by its own date, so its refunded lines are
 * read by `refunded_at`, with the rest of their basket, so the payment is
 * whole and placed as the Orders page places it. `query` makes a fresh
 * scoped read of the creator's orders (scopedOrders). Lines already read
 * (`have`) are not read twice. A database without `refunded_at` has no
 * refund dates to read: nothing comes back, and those refunds stay on
 * their order's day. `alsoIds` are orders with a part refund inside the
 * periods on the seller's ledger (refund-history-server refundedOrderIds),
 * whose row's refunded_at, the LAST refund, can be after them.
 */
export async function refundedEarlier<T extends { id: string; stripe_session_id?: string | null }>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query: () => any,
  spans: Span[],
  have: ReadonlySet<string>,
  alsoIds: string[] = [],
): Promise<T[]> {
  const out: T[] = []
  const seen = new Set(have)
  const add = (rows: T[] | null | undefined) => {
    for (const r of rows ?? []) {
      if (!r || seen.has(r.id)) continue
      seen.add(r.id)
      out.push(r)
    }
  }
  try {
    for (const s of spans) {
      const { data, error } = await query()
        .eq("status", "refunded")
        .gte("refunded_at", new Date(s.start).toISOString())
        .lt("refunded_at", new Date(s.end).toISOString())
        .order("refunded_at", { ascending: true })
        .limit(REFUNDED_CEILING)
      if (error) throw new Error(error.message)
      add(data as T[])
    }
    const wanted = alsoIds.filter((id) => !seen.has(id))
    for (let i = 0; i < wanted.length && out.length < REFUNDED_CEILING; i += 100) {
      const { data, error } = await query().eq("status", "refunded").in("id", wanted.slice(i, i + 100)).limit(1000)
      if (error) throw new Error(error.message)
      add(data as T[])
    }
    const baskets = [...new Set(out.map((r) => r.stripe_session_id).filter((x): x is string => !!x))]
    for (let i = 0; i < baskets.length && out.length < REFUNDED_CEILING * 2; i += 100) {
      const { data, error } = await query().in("stripe_session_id", baskets.slice(i, i + 100)).limit(1000)
      if (error) throw new Error(error.message)
      add(data as T[])
    }
  } catch (error) {
    console.warn("[analytics] refunds of earlier orders not read:", (error as Error).message)
  }
  return out
}

/**
 * A day either side of each stretch. A basket's lines are written one at a
 * time (lib/checkout/fulfil-cart-item), moments apart, and the Orders page
 * groups every line of a payment and places it by its first line. Read only
 * inside the period, a basket across its edge was half an order: its first
 * line alone at the end of the period, or its later lines counted as an
 * order of their own at the start of the next. With the margin the payment
 * is whole, and the reports keep only payments whose first line is inside.
 */
export function orderSpans(spans: Span[]): Span[] {
  const wide = spans.map((s) => ({ start: s.start - DAY, end: s.end + DAY })).sort((a, b) => a.start - b.start)
  const out: Span[] = []
  for (const s of wide) {
    const last = out[out.length - 1]
    if (last && s.start <= last.end) last.end = Math.max(last.end, s.end)
    else out.push({ ...s })
  }
  return out
}

/** A row as the Orders page reads it (lib/orders/load-rows toOrderRow): no status is an unfinished payment, no amount is nothing. */
function asOrdersPageRow(row: OrderRow): OrderRow {
  return { ...row, status: row.status || "pending", amount_cents: row.amount_cents || 0 }
}

/* The creator's orders by the order's own creator, never by a list of product ids (lib/analytics/creator-orders). */
export function readOrders(
  admin: Admin,
  spans: Span[],
  creatorId: string,
  product: string | null,
  /** The period the figures add up: the "could not be converted" count is of its sales only (lib/analytics/unconverted-count). */
  counted?: Span,
): Promise<{ rows: OrderRow[]; truncated: boolean; conversion: { currency: string; converted: number; unconverted: number } }> {
  /*
    Side by side with the orders themselves, the two reads that do not need
    them: the refunds the ledger dates inside the periods, and the store's
    currency. They were each a round trip after the orders had come back.
  */
  const ledger = refundedOrderIds(admin, creatorId, spans)
  const storeCurrency = readStoreCurrency(admin, creatorId)
  return byCreator((scope) =>
    withColumns(ORDER_COLUMNS, async (columns) => {
      const read = await readSpans<OrderRow>(orderSpans(spans), (start, end, after) =>
        startingAt(scopedOrders(admin, columns, scope, creatorId, product).lt("created_at", end), start, after)
          .order("created_at", { ascending: true })
          .order("id", { ascending: true })
          .limit(PAGE) as unknown as Read<OrderRow>,
      )
      /* An admin's test sale is not a buyer's order (lib/analytics/test-sales). */
      const own = withoutTestSales(ownRows(read.rows))
      const ledgerRefunded = await ledger
      const earlier = await refundedEarlier<OrderRow>(() => scopedOrders(admin, columns, scope, creatorId, product), spans, new Set(own.map((r) => r.id)), ledgerRefunded)
      /* Each part refund on its own day, from the seller's ledger (lib/analytics/refund-dates), before the money is converted. */
      const dated = await withRefundHistory(admin, creatorId, [...own, ...withoutTestSales(ownRows(earlier))].map(asOrdersPageRow))
      /* Every amount in the store's currency, each order at its own day's ECB rate (lib/money/report-currency): Revenue never adds lei to dollars. */
      const inStore = await inStoreCurrency(admin, creatorId, dated, (await storeCurrency).currency, { rates: ratesFrom(admin) })
      const unconverted = inStore.unconverted > 0 ? unconvertedIncluded(inStore.left, counted ?? spans[spans.length - 1]) : 0
      return { rows: inStore.rows, truncated: read.truncated, conversion: { currency: inStore.currency, converted: inStore.converted, unconverted } }
    }),
  )
}

const SUBSCRIBER_COLUMNS = "id, subscribed_at, created_at, source, source_detail, property_type, property_id, last_touch"

/** Sign-ups in both periods, by when they signed up. Null when the table cannot be read: the card then says nothing rather than zero. */
export async function readSubscribers(admin: Admin, spans: Span[], creatorId: string): Promise<SubscriberRow[] | null> {
  try {
    const rows: SubscriberRow[] = []
    for (const s of spans) {
      const read = await withColumns(SUBSCRIBER_COLUMNS, async (columns) => {
        const out: SubscriberRow[] = []
        let from = 0
        for (;;) {
          const { data, error } = await admin
            .from("subscribers")
            .select(columns)
            .eq("creator_id", creatorId)
            .gte("subscribed_at", new Date(s.start).toISOString())
            .lt("subscribed_at", new Date(s.end).toISOString())
            .order("subscribed_at", { ascending: true })
            .order("id", { ascending: true })
            .range(from, from + PAGE - 1)
          if (error) throw new Error(error.message)
          out.push(...((data ?? []) as unknown as SubscriberRow[]))
          if (!data || data.length < PAGE || out.length >= CEILING) return out
          from += PAGE
        }
      })
      rows.push(...read)
    }
    return rows
  } catch (error) {
    console.warn("[analytics] subscribers not read:", (error as Error).message)
    return null
  }
}

/** The report's question, as the page and the cache name it (for logs and the answer). */
export function describe(q: CountQuestion): string {
  return `${propertyParam(q.selector) ?? "all"} ${new Date(q.window.start).toISOString()}..${new Date(q.window.end).toISOString()} ${q.timeZone} ${periodsOf(q.window, q.previous, q.timeZone).grain}`
}

/* ─── Systems, carts and page titles ──────────────────────────────────── */

type Audience = Pick<WindowWire, "os" | "carts" | "titles">

/** The most rows read here for one period when the database cannot count them (before part 253). */
const AUDIENCE_CEILING = 50_000

/**
 * WHO WAS LOOKING, FOR ONE PERIOD: visitors by operating system, the
 * visitors who added to the cart, and each page's title. Counted by
 * analytics_audience (supabase/sql/run-now part 253) when it is there; else
 * from the rows, at most AUDIENCE_CEILING of them, by the same rules
 * (reports.ts audienceOf). Null when neither can be read: the cards then
 * say nothing rather than zero.
 */
export async function readAudience(admin: Admin, q: CountQuestion, w: Span): Promise<{ audience: Audience | null; truncated: boolean }> {
  const counted = await rpc<Audience>(admin, "analytics_audience", {
    ...selectorArgs(q),
    p_start: new Date(w.start).toISOString(),
    p_end: new Date(w.end).toISOString(),
  })
  if (counted) return { audience: { os: counted.os ?? [], carts: Number(counted.carts) || 0, titles: counted.titles ?? [] }, truncated: false }
  try {
    const start = new Date(w.start).toISOString()
    const end = new Date(w.end).toISOString()
    const read = async (columns: string) => {
      const rows: Array<ViewRow & StepRow & { id: string }> = []
      let after: After = null
      while (rows.length < AUDIENCE_CEILING) {
        let r = admin.from("analytics_events").select(columns).eq("creator_id", q.creatorId).in("event_type", ["view", "buy_click"]).lt("created_at", end)
        if (q.product) r = r.eq("product_id", q.product)
        const { data, error } = await (startingAt(r, start, after).order("created_at", { ascending: true }).order("id", { ascending: true }).limit(PAGE) as unknown as Read<ViewRow & StepRow & { id: string }>)
        if (error) throw new Error(error.message)
        rows.push(...(data ?? []))
        if (!data || data.length < PAGE) return { rows, truncated: false }
        const last = data[data.length - 1]
        after = { t: last.created_at, id: String(last.id) }
      }
      return { rows, truncated: true }
    }
    const base = "id, event_type, visitor_id, session_id, os, property_type, property_id, product_id, path, created_at"
    let got: { rows: Array<ViewRow & StepRow & { id: string }>; truncated: boolean }
    try {
      got = await read(`${base}, page_title`)
    } catch (error) {
      if (!/column|PGRST204|42703/i.test((error as Error).message)) throw error
      got = await read(base)
    }
    const mine = got.rows.filter((r) => counts(q.selector, { type: (r.property_type ?? null) as never, id: r.property_id ?? null }, q.properties.defaultWebsite))
    const a = audienceOf(mine.filter((r) => r.event_type === "view"), mine.filter((r) => r.event_type === "buy_click"))
    return { audience: a, truncated: got.truncated }
  } catch (error) {
    console.warn("[analytics] systems and carts not read:", (error as Error).message)
    return { audience: null, truncated: false }
  }
}

/**
 * DOWNLOADS OF THESE ORDER LINES: download_events by their order id, for the
 * Digital card. At most 5,000 lines are asked about, 200 at a time. Null when
 * the table cannot be read. A download logged with only its entitlement (no
 * order id) is not found here.
 */
export async function readDownloads(admin: Admin, lineIds: string[]): Promise<Record<string, number> | null> {
  const ids = [...new Set(lineIds)].slice(0, 5000)
  if (ids.length === 0) return {}
  try {
    const out: Record<string, number> = {}
    const chunks: string[][] = []
    for (let i = 0; i < ids.length; i += 200) chunks.push(ids.slice(i, i + 200))
    for (let i = 0; i < chunks.length; i += 5) {
      const answers = await Promise.all(
        chunks.slice(i, i + 5).map((chunk) => Promise.resolve(admin.from("download_events").select("order_id").in("order_id", chunk).limit(10_000))),
      )
      for (const { data, error } of answers) {
        if (error) throw new Error(error.message)
        for (const row of (data ?? []) as Array<{ order_id: string | null }>) if (row.order_id) out[row.order_id] = (out[row.order_id] ?? 0) + 1
      }
    }
    return out
  } catch (error) {
    console.warn("[analytics] downloads not read:", (error as Error).message)
    return null
  }
}

/* ─── Clicks between pages, and each row's own line ───────────────────── */

const NAV_COLUMNS = "id, event_type, session_id, visitor_id, property_type, property_id, path, link_url, link_label, created_at"

/**
 * CLICKS BETWEEN PAGES OF THE SAME SITE in both periods (lib/analytics/
 * site-clicks): counted by analytics_nav_clicks (part 331) when it is there,
 * else from the nav_click rows, by the same rules. Null when neither can be
 * read: the card then says nothing rather than zero.
 */
export async function readNavClicks(admin: Admin, q: CountQuestion): Promise<NavWire | null> {
  const counted = await rpc<NavWire>(admin, "analytics_nav_clicks", {
    p_creator_id: q.creatorId,
    p_property_type: q.selector.type === "all" ? null : q.selector.type,
    p_property_id: q.selector.type === "website" ? q.selector.id : null,
    p_default_website: q.properties.defaultWebsite,
    p_cur_start: new Date(q.window.start).toISOString(),
    p_cur_end: new Date(q.window.end).toISOString(),
    p_prev_start: q.previous ? new Date(q.previous.start).toISOString() : null,
    p_prev_end: q.previous ? new Date(q.previous.end).toISOString() : null,
  })
  if (counted) return { cur: Number(counted.cur) || 0, prev: Number(counted.prev) || 0, rows: counted.rows ?? [] }
  try {
    const read = await withColumns(NAV_COLUMNS, (columns) =>
      readSpans<NavClickRow & { id: string }>(spansToRead(q.window, q.previous), (start, end, after) =>
        startingAt(admin.from("analytics_events").select(columns).eq("creator_id", q.creatorId).eq("event_type", "nav_click").lt("created_at", end), start, after)
          .order("created_at", { ascending: true })
          .order("id", { ascending: true })
          .limit(PAGE) as unknown as Read<NavClickRow & { id: string }>,
      ),
    )
    return navWireFromRows({ rows: read.rows, window: q.window, previous: q.previous, selector: q.selector, defaultWebsite: q.properties.defaultWebsite })
  } catch (error) {
    console.warn("[analytics] clicks between pages not read:", (error as Error).message)
    return null
  }
}

/**
 * ONE DIMENSION'S STORED KEYS, A LINE EACH, for the period alone
 * (lib/analytics/row-series): counted by analytics_row_series (part 331)
 * when it is there, else from the rows of the period (and the day before it,
 * where a visit running into it began), by the same rules.
 */
export async function readStoredRowSeries(admin: Admin, q: CountQuestion, dim: StoredDim): Promise<{ series: SeriesMap; truncated: boolean }> {
  const { starts } = periodsOf(q.window, null, q.timeZone)
  const counted = await rpc<SeriesMap>(admin, "analytics_row_series", {
    ...selectorArgs(q),
    p_start: new Date(q.window.start).toISOString(),
    p_end: new Date(q.window.end).toISOString(),
    p_starts: starts.map((s) => new Date(s).toISOString()),
    p_dim: dim,
  })
  if (counted) return { series: counted, truncated: false }
  const clicks = dim === "link" || dim === "nav"
  if (clicks && q.product) return { series: {}, truncated: false }
  const spans = [{ start: clicks || dim === "page" ? q.window.start : q.window.start - DAY, end: q.window.end }]
  const read = clicks
    ? await withColumns(dim === "nav" ? NAV_COLUMNS : STEP_COLUMNS, (columns) =>
        readSpans<StepRow & { id: string }>(spans, (start, end, after) =>
          startingAt(admin.from("analytics_events").select(columns).eq("creator_id", q.creatorId).eq("event_type", dim === "nav" ? "nav_click" : "link_click").lt("created_at", end), start, after)
            .order("created_at", { ascending: true })
            .order("id", { ascending: true })
            .limit(PAGE) as unknown as Read<StepRow & { id: string }>,
        ),
      )
    : await withColumns(VIEW_COLUMNS, (columns) =>
        readSpans<ViewRow & { id: string }>(spans, (start, end, after) => {
          let r = admin.from("analytics_events").select(columns).eq("creator_id", q.creatorId).eq("event_type", "view").lt("created_at", end)
          if (q.product) r = r.eq("product_id", q.product)
          return startingAt(r, start, after).order("created_at", { ascending: true }).order("id", { ascending: true }).limit(PAGE) as unknown as Read<ViewRow & { id: string }>
        }),
      )
  const series = storedRowSeries({
    views: clicks ? [] : (read.rows as ViewRow[]),
    steps: clicks ? (read.rows as StepRow[]) : [],
    window: q.window,
    timeZone: q.timeZone,
    selector: q.selector,
    defaultWebsite: q.properties.defaultWebsite,
    product: q.product,
    dim,
  })
  return { series, truncated: read.truncated }
}
