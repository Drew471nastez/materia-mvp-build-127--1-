import "server-only"

/**
 * ===========================================================================
 *  THE ORDERS PAGE, ONE PAGE AT A TIME
 * ===========================================================================
 * The page used to read every row the store had (up to 100,000, a thousand
 * at a time, every column), send them all to the browser and group, filter,
 * count and number them there. A store's thousandth order made the page a
 * second slower and its payload a megabyte larger. Now the server answers
 * with what the screen shows: one page of orders, how many match, the five
 * figures and which tabs have something in them.
 *
 * WHAT IS READ, AND WHY
 *
 *   the index     id, created_at and stripe_session_id of every row
 *                 (lib/orders/order-index). An order's number is its place
 *                 among every order the store has, a basket counted once,
 *                 and no stored column holds it, so it is counted, from
 *                 these three columns only. Kept between requests per store
 *                 and brought up to date by reading only the rows written
 *                 since, checked against a count (head: true) of the rows it
 *                 already holds: a row removed or written into the past
 *                 makes it read the whole index again.
 *   the page      every column (`*`, so an older database without a newer
 *                 column still reads) of the rows of the 50 orders shown,
 *                 the orders either side of the page (previous and next on
 *                 an order's page) and the order open over the list, with
 *                 their checkouts. Found through the index, so a basket is
 *                 never split across two pages.
 *   the figures   the rows of the orders placed in the period and the one
 *                 before it, a few named columns, and the lines refunded in
 *                 either from older orders. The same rows Analytics reads
 *                 for the same figures.
 *   the tabs      a handful of the newest candidate rows for each view
 *                 (pending, paid, refunded, to fulfil, returns, cash to
 *                 collect), checked as whole orders.
 *
 * WHAT STILL READS MORE THAN A PAGE. A search, a view other than All, a
 * Source or Fulfillment filter and a sort by total ask about things only an
 * order's rows say (a name, a payment that is part refunded, a parcel's
 * stage), which a filter on the table cannot express without a stored
 * column for each. Those lists read the rows of every order in the period
 * (FALLBACK_ROWS at most, the page's old ceiling) and filter them with the
 * same filterOrders the browser used. The period bounds it: "Last 30 days"
 * reads a month, not the store's history.
 *
 * WHO. The creator id always comes from the session (the page and the
 * route), never from the request, and every read is scoped to it.
 */

import { byCreator, ownRows, scopedOrders, type OrderScope } from "@/lib/analytics/creator-orders"
import { KEYSET_PAGE, keysetFrom, type KeysetAfter } from "@/lib/analytics/keyset"
import {
  PAGE_SIZE,
  VIEWS,
  filterOrders,
  groupOrders,
  inView,
  isPlainQuery,
  orderComparator,
  pageOf,
  type ListQuery,
  type Order,
  type OrderRow,
  type View,
} from "./order-view"
import { readMetrics, type MetricReading } from "./metrics"
import { ordersCurrency } from "./money"
import { readStoreCurrency } from "@/lib/store/selling-currency-read"
import { daySpan, inReportingCurrency, needsConversion, type ReportMoneyRow } from "@/lib/money/report-currency"
import { dayRatesBetween } from "@/lib/markets/fx-server"
import { buildIndex, orderNumbered, ordersWithin, type IndexRow, type IndexedOrder, type OrderIndex } from "./order-index"
import { OrdersReadError, attachCheckouts, readCreatorProducts, toOrderRow, type CreatorProduct } from "./load-rows"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any
export type Span = { start: number; end: number }

const EPOCH = "1970-01-01T00:00:00.000Z"
const INDEX_COLUMNS = "id, created_at, stripe_session_id"
/* What the five figures are counted from (lib/orders/metrics): payment, money, refunds and who bought. */
const FIGURE_COLUMNS =
  "id, product_id, amount_cents, tip_cents, status, created_at, stripe_session_id, refund_amount_cents, refunded_at, payment_method, buyer_email, customer_email, buyer_first_name, buyer_last_name, currency"
/** A list that needs the orders' own rows reads at most this many, the page's ceiling before it read a page at a time. */
export const FALLBACK_ROWS = 100_000
/** A store's index is read whole at most every so often, whatever the counts say. */
const INDEX_TTL_MS = 10 * 60_000
const INDEX_KEEP = 25
const INDEX_CEILING = 2_000_000
/** Up to this many rows are asked for by id; more are read by their dates. */
const BY_ID_MAX = 400
const ID_CHUNK = 100
/** How many of the newest candidates each tab is checked against. */
const PROBE = 20

/* ─── Reading ─────────────────────────────────────────────────────────── */

type Read = PromiseLike<{ data: Record<string, unknown>[] | null; error: { message: string } | null }>

/** Every row from a keyset onwards, oldest first, up to `ceiling`. */
async function readOnwards(page: (after: KeysetAfter) => Read, from: KeysetAfter, ceiling: number): Promise<{ rows: Record<string, unknown>[]; truncated: boolean }> {
  const rows: Record<string, unknown>[] = []
  let after = from
  while (rows.length < ceiling) {
    const { data, error } = await page(after)
    if (error) throw new OrdersReadError(`Orders: could not read orders (${error.message})`)
    rows.push(...(data ?? []))
    if (!data || data.length < KEYSET_PAGE) return { rows, truncated: false }
    const last = data[data.length - 1]
    after = { t: String(last.created_at), id: String(last.id) }
  }
  return { rows, truncated: true }
}

/* Named columns a database refused once are read as `*` for a while (an older install), each list on its own. */
const refusedUntil = new Map<string, number>()

/**
 * Named columns keep a read small; a database missing one of them is read
 * with `*` instead of failing, the tolerance the page's `select("*")` has
 * always had. A missing creator_id is not this: lib/analytics/creator-orders
 * byCreator reads through the product instead.
 */
async function withColumns<T>(columns: string, read: (columns: string) => Promise<T>): Promise<T> {
  if (columns === "*" || Date.now() < (refusedUntil.get(columns) ?? 0)) return read("*")
  try {
    return await read(columns)
  } catch (error) {
    const message = (error as Error).message
    if (!/column|PGRST204|42703/i.test(message) || /creator_id/.test(message)) throw error
    refusedUntil.set(columns, Date.now() + 5 * 60_000)
    return read("*")
  }
}

/** A count of the store's rows written up to and including `t` (head: true, nothing read). */
async function countUpTo(db: Db, scope: OrderScope, creatorId: string, t: string): Promise<number | null> {
  try {
    const q = db.from("orders").select(scope === "creator" ? "id" : "id, products!inner(creator_id)", { count: "exact", head: true })
    const { count, error } = await (scope === "creator" ? q.eq("creator_id", creatorId) : q.eq("products.creator_id", creatorId)).lte("created_at", t)
    return error || typeof count !== "number" ? null : count
  } catch {
    return null
  }
}

/* ─── The index ───────────────────────────────────────────────────────── */

interface Kept {
  scope: OrderScope
  rows: IndexRow[]
  index: OrderIndex
  readAt: number
}
const kept = new Map<string, Kept>()

/** For tests: forget every store's index (or one). */
export function forgetOrderIndex(creatorId?: string): void {
  if (creatorId) kept.delete(creatorId)
  else kept.clear()
}

function indexPage(db: Db, scope: OrderScope, creatorId: string, columns: string) {
  return (after: KeysetAfter) =>
    keysetFrom(scopedOrders(db, columns, scope, creatorId, null), EPOCH, after)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .limit(KEYSET_PAGE) as Read
}

async function readIndexRows(db: Db, scope: OrderScope, creatorId: string, from: KeysetAfter): Promise<IndexRow[]> {
  const read = await withColumns(INDEX_COLUMNS, (columns) => readOnwards(indexPage(db, scope, creatorId, columns), from, INDEX_CEILING))
  return ownRows(read.rows).map((r) => ({ id: String(r.id), created_at: String(r.created_at), stripe_session_id: (r.stripe_session_id as string | null) ?? null }))
}

/**
 * The store's index: kept from the last request and brought up to date with
 * the rows written since, or read whole. Read whole when nothing is kept,
 * when what is kept is old, or when the count of the rows it holds is not
 * the database's (a row removed, or one written with an earlier time).
 */
export async function orderIndex(db: Db, creatorId: string): Promise<{ index: OrderIndex; scope: OrderScope }> {
  return byCreator(async (scope) => {
    const was = kept.get(creatorId)
    const last = was?.rows[was.rows.length - 1]
    if (was && last && was.scope === scope && Date.now() - was.readAt < INDEX_TTL_MS) {
      const [fresh, upTo] = await Promise.all([
        readIndexRows(db, scope, creatorId, { t: last.created_at, id: last.id }),
        countUpTo(db, scope, creatorId, last.created_at),
      ])
      /* What the database counts up to the last kept row: the kept rows, and any new row written in that same instant. */
      const expected = was.rows.length + fresh.filter((r) => r.created_at === last.created_at).length
      if (upTo === expected) {
        const known = new Set(was.rows.map((r) => r.id))
        const added = fresh.filter((r) => !known.has(r.id))
        if (added.length === 0) return { index: was.index, scope }
        const rows = [...was.rows, ...added]
        const index = buildIndex(rows)
        remember(creatorId, { scope, rows, index, readAt: was.readAt })
        return { index, scope }
      }
    }
    const rows = await readIndexRows(db, scope, creatorId, null)
    const index = buildIndex(rows)
    remember(creatorId, { scope, rows, index, readAt: Date.now() })
    return { index, scope }
  })
}

function remember(creatorId: string, entry: Kept) {
  kept.delete(creatorId)
  kept.set(creatorId, entry)
  while (kept.size > INDEX_KEEP) kept.delete(kept.keys().next().value as string)
}

/* ─── Rows of chosen orders ───────────────────────────────────────────── */

/** The rows with these ids, scoped to the creator: by id when they are few, by their dates when they are many. */
async function readRowsById(db: Db, scope: OrderScope, creatorId: string, index: OrderIndex, ids: string[], columns: string): Promise<Record<string, unknown>[]> {
  const wanted = [...new Set(ids)]
  if (wanted.length === 0) return []
  const out = await withColumns(columns, async (cols) => {
    if (wanted.length <= BY_ID_MAX) {
      const chunks: string[][] = []
      for (let i = 0; i < wanted.length; i += ID_CHUNK) chunks.push(wanted.slice(i, i + ID_CHUNK))
      const reads = await Promise.all(
        chunks.map(async (chunk) => {
          const { data, error } = await scopedOrders(db, cols, scope, creatorId, null).in("id", chunk)
          if (error) throw new OrdersReadError(`Orders: could not read orders (${error.message})`)
          return (data ?? []) as Record<string, unknown>[]
        }),
      )
      return reads.flat()
    }
    /* Many orders: every row between the first and the last of them, keeping theirs. */
    const times = wanted.map((id) => index.rowTime.get(id)).filter((t): t is string => !!t).sort()
    const set = new Set(wanted)
    const read = await readOnwards(
      (after) =>
        keysetFrom(scopedOrders(db, cols, scope, creatorId, null).lte("created_at", times[times.length - 1]), times[0], after)
          .order("created_at", { ascending: true })
          .order("id", { ascending: true })
          .limit(KEYSET_PAGE) as Read,
      null,
      FALLBACK_ROWS * 2,
    )
    return read.rows.filter((r) => set.has(String(r.id)))
  })
  return ownRows(out)
}

/** Every row of these orders as the page draws them: each with its product, and a parcel's place from its checkout. */
async function readOrderRows(db: Db, scope: OrderScope, creatorId: string, index: OrderIndex, orders: IndexedOrder[], products: Map<string, CreatorProduct>): Promise<OrderRow[]> {
  const raw = await readRowsById(db, scope, creatorId, index, orders.flatMap((o) => o.rowIds), "*")
  const rows = raw.map((r) => toOrderRow(r, products.get(String(r.product_id))))
  await attachCheckouts(db, creatorId, rows)
  return rows
}

function numbersFor(orders: IndexedOrder[]): Record<string, number> {
  const numbers: Record<string, number> = {}
  for (const o of orders) numbers[o.id] = o.number
  return numbers
}

/** The orders a few row ids belong to, once each. */
function ordersOf(index: OrderIndex, rowIds: Iterable<string>): IndexedOrder[] {
  const out = new Map<string, IndexedOrder>()
  for (const id of rowIds) {
    const o = index.byRow.get(id)
    if (o) out.set(o.id, o)
  }
  return [...out.values()]
}

/** The ids of a product's rows written from `since` on: the orders a Product filter keeps. */
async function productRowIds(db: Db, scope: OrderScope, creatorId: string, product: string, since: number | null): Promise<string[]> {
  const from = since === null ? EPOCH : new Date(since).toISOString()
  const read = await readOnwards(
    (after) =>
      keysetFrom(scopedOrders(db, "id, created_at", scope, creatorId, product), from, after)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .limit(KEYSET_PAGE) as Read,
    null,
    FALLBACK_ROWS * 2,
  )
  return read.rows.map((r) => String(r.id))
}

/* ─── The list ────────────────────────────────────────────────────────── */

export interface ListingRequest {
  query: ListQuery
  /** The period the table and the figures cover. */
  window: Span
  /** The period the figures are compared with; null for none (All time). */
  previous: Span | null
  timeZone: string
  /** An order to send whatever page it is on: the one open over the list. */
  open?: string | null
  /**
   * False when the browser already has this period's figures and tabs and
   * only the list changed (another page, a search): they are not read again,
   * and the answer says so (`figures: false`).
   */
  figures?: boolean
}

export interface OrdersSummary {
  /** Every order the store has had. */
  total: number
  /** The first order's time, where All time begins. */
  earliest: string | null
  /** Something the store sold ships: the Fulfillment filter is offered. */
  ships: boolean
  /** The views with an order in them (All always). */
  views: View[]
  /** What the figures are written in (lib/orders/money ordersCurrency). */
  currency: string
}

export interface OrdersListing {
  /** The rows of the page's orders, of the orders either side of it, and of the open one. */
  rows: OrderRow[]
  /** Each of those orders' number, by its id: counted over every order, never over these rows. */
  numbers: Record<string, number>
  /** The page's orders, in the list's order. */
  pageIds: string[]
  /** The order just before the page and just after it, in the list's order. */
  before: string | null
  after: string | null
  matching: number
  range: { page: number; pages: number; from: number; to: number }
  metrics: MetricReading[]
  summary: OrdersSummary
  /** False when the figures, tabs and currency were not read (ListingRequest.figures): keep the ones before. */
  figures: boolean
  /** The list was worked out from the newest FALLBACK_ROWS rows of the period only. */
  partial: boolean
}

interface Chosen {
  /** The orders whose rows are sent, and their rows when they were already read. */
  send: IndexedOrder[]
  rows: OrderRow[] | null
  pageIds: string[]
  before: string | null
  after: string | null
  matching: number
  range: OrdersListing["range"]
  partial: boolean
  /** Orders read whole on the way, for the tabs. */
  seen: Order[]
}

/** The orders a query keeps, newest of the period first, before a page is cut from them. */
async function candidates(db: Db, scope: OrderScope, creatorId: string, index: OrderIndex, query: ListQuery, window: Span | null): Promise<IndexedOrder[]> {
  const within = ordersWithin(index, window)
  if (!query.product) return within
  /* A product's orders: found by the product's rows in the table, then whole through the index. */
  const ids = await productRowIds(db, scope, creatorId, query.product, window ? window.start : null)
  const keep = new Set(ordersOf(index, ids).map((o) => o.id))
  return within.filter((o) => keep.has(o.id))
}

/** The newest orders whose rows add up to at most FALLBACK_ROWS. */
function bounded(orders: IndexedOrder[]): { orders: IndexedOrder[]; partial: boolean } {
  let rows = 0
  for (const o of orders) rows += o.rowIds.length
  if (rows <= FALLBACK_ROWS) return { orders, partial: false }
  const newest = [...orders].sort((a, b) => b.at - a.at || b.number - a.number)
  const out: IndexedOrder[] = []
  rows = 0
  for (const o of newest) {
    if (rows + o.rowIds.length > FALLBACK_ROWS) break
    rows += o.rowIds.length
    out.push(o)
  }
  return { orders: out, partial: true }
}

async function choosePage(db: Db, scope: OrderScope, creatorId: string, index: OrderIndex, products: Map<string, CreatorProduct>, req: ListingRequest): Promise<Chosen> {
  const { query, window } = req
  const pool = await candidates(db, scope, creatorId, index, query, window)

  if (isPlainQuery(query)) {
    /* Dates, a product and a sort by date: the index alone says which orders, in which order, and how many. */
    const sorted = [...pool].sort(orderComparator(query.sort) as unknown as (a: IndexedOrder, b: IndexedOrder) => number)
    const page = pageOf(sorted, query.page)
    const first = (page.page - 1) * PAGE_SIZE
    const before = first > 0 ? sorted[first - 1] : null
    const after = sorted[first + page.items.length] ?? null
    return {
      send: [...page.items, ...(before ? [before] : []), ...(after ? [after] : [])],
      rows: null,
      pageIds: page.items.map((o) => o.id),
      before: before?.id ?? null,
      after: after?.id ?? null,
      matching: sorted.length,
      range: { page: page.page, pages: page.pages, from: page.from, to: page.to },
      partial: false,
      seen: [],
    }
  }

  /* A view, a search, a filter or a sort by total: the period's orders, read whole and filtered as the browser filtered them. */
  const { orders: within, partial } = bounded(pool)
  const rows = await readOrderRows(db, scope, creatorId, index, within, products)
  const orders = groupOrders(rows, numbersFor(within))
  const filtered = filterOrders(orders, query, window)
  const page = pageOf(filtered, query.page)
  const first = (page.page - 1) * PAGE_SIZE
  const before = first > 0 ? filtered[first - 1] : null
  const after = filtered[first + page.items.length] ?? null
  const sendIds = new Set([...page.items, ...(before ? [before] : []), ...(after ? [after] : [])].map((o) => o.id))
  return {
    send: within.filter((o) => sendIds.has(o.id)),
    rows: rows.filter((r) => sendIds.has(index.byRow.get(r.id)?.id ?? "")),
    pageIds: page.items.map((o) => o.id),
    before: before?.id ?? null,
    after: after?.id ?? null,
    matching: filtered.length,
    range: { page: page.page, pages: page.pages, from: page.from, to: page.to },
    partial,
    seen: orders,
  }
}

/* ─── The five figures ────────────────────────────────────────────────── */

/** Ids of rows refunded inside a stretch: by when they were refunded, and (no refund time kept) by when they were written. */
async function refundedRowIds(db: Db, scope: OrderScope, creatorId: string, span: Span): Promise<string[]> {
  const lo = new Date(span.start).toISOString()
  const hi = new Date(span.end).toISOString()
  const read = (filter: (q: Db) => Db) =>
    readOnwards(
      (after) =>
        keysetFrom(filter(scopedOrders(db, "id, created_at", scope, creatorId, null).eq("status", "refunded")), EPOCH, after)
          .order("created_at", { ascending: true })
          .order("id", { ascending: true })
          .limit(KEYSET_PAGE) as Read,
      null,
      FALLBACK_ROWS,
    ).then(
      (r) => r.rows.map((row) => String(row.id)),
      /* An older database without refunded_at: its refunds are counted by when they were written, read below. */
      () => [] as string[],
    )
  const [byRefund, byWritten] = await Promise.all([read((q) => q.gte("refunded_at", lo).lt("refunded_at", hi)), read((q) => q.gte("created_at", lo).lt("created_at", hi))])
  return [...byRefund, ...byWritten]
}

async function readFigures(db: Db, scope: OrderScope, creatorId: string, index: OrderIndex, req: ListingRequest): Promise<{ metrics: MetricReading[]; orders: Order[]; currency: string }> {
  const spans = [req.window, req.previous].filter((s): s is Span => !!s && s.end > s.start)
  const placed = index.orders.filter((o) => spans.some((s) => o.at >= s.start && o.at < s.end))
  /* A refund in the period of an order placed before it counts on the day it was refunded, so its order is read too. */
  const lo = Math.min(...spans.map((s) => s.start))
  const hi = Math.max(...spans.map((s) => s.end))
  const refunded = spans.length ? ordersOf(index, await refundedRowIds(db, scope, creatorId, { start: lo, end: hi })) : []
  const all = new Map<string, IndexedOrder>()
  for (const o of [...placed, ...refunded]) all.set(o.id, o)
  const raw = await readRowsById(db, scope, creatorId, index, [...all.values()].flatMap((o) => o.rowIds), FIGURE_COLUMNS)
  const numbers = numbersFor([...all.values()])
  const orders = groupOrders(raw.map((r) => toOrderRow(r, undefined)), numbers)
  const counted = await metricsInStore(db, creatorId, raw as unknown as ReportMoneyRow[], orders, numbers, req)
  return { metrics: counted.metrics, orders, currency: counted.currency }
}

/**
 * The five figures in the store's currency. Orders already in it are added
 * as they are. Orders in another currency are converted at that day's ECB
 * rate, and only when every one of them converts: a missing rate leaves the
 * sum in the currency most orders were charged in, rather than a mix or a
 * guess. The order rows themselves are not rewritten.
 */
async function metricsInStore(
  db: Db,
  creatorId: string,
  raw: ReportMoneyRow[],
  orders: Order[],
  numbers: Record<string, number>,
  req: ListingRequest,
): Promise<{ metrics: MetricReading[]; currency: string }> {
  const asCharged = () => ({ metrics: readMetrics(orders, req.window, req.previous, req.timeZone), currency: ordersCurrency(orders) })
  try {
    const store = (await readStoreCurrency(db, creatorId)).currency
    if (!needsConversion(raw, store)) return asCharged()
    const span = daySpan(raw)
    const days = span ? await dayRatesBetween(span.from, span.to, db) : []
    const done = inReportingCurrency(raw, store, days)
    if (done.unconverted > 0 || done.rows.length !== raw.length) return asCharged()
    const converted = groupOrders(done.rows.map((r) => toOrderRow(r, undefined)), numbers)
    return { metrics: readMetrics(converted, req.window, req.previous, req.timeZone), currency: store }
  } catch {
    return asCharged()
  }
}

/* ─── The tabs ────────────────────────────────────────────────────────── */

/** Ids from a read that may fail on an older database (a column or table not there yet): none, rather than no page. */
async function idsOf(read: PromiseLike<{ data: Array<Record<string, unknown>> | null; error: unknown }>, key = "id"): Promise<string[]> {
  try {
    const { data, error } = await read
    if (error) return []
    return (data ?? []).map((r) => r[key]).filter((v): v is string => typeof v === "string" && !!v)
  } catch {
    return []
  }
}

/**
 * Which tabs have an order in them, and whether anything ships: each asked
 * of a few of the newest rows that could make it so, read as whole orders
 * and checked by the list's own inView. A row that could (a completed
 * payment for Paid) can belong to an order that is not (a basket with a line
 * still pending), so a tab is shown only for an order that really is.
 */
async function readTabs(db: Db, scope: OrderScope, creatorId: string, index: OrderIndex, products: Map<string, CreatorProduct>, seen: Order[]): Promise<{ views: View[]; ships: boolean; orders: Order[] }> {
  const newest = (filter: (q: Db) => Db, n = PROBE) =>
    idsOf(filter(scopedOrders(db, "id", scope, creatorId, null)).order("created_at", { ascending: false }).limit(n))
  const checkouts = async (filter: (q: Db) => Db) => {
    const ids = await idsOf(filter(db.from("commerce_checkouts").select("id").eq("creator_id", creatorId)).order("created_at", { ascending: false }).limit(PROBE))
    return ids.length ? idsOf(scopedOrders(db, "id", scope, creatorId, null).in("checkout_id", ids)) : []
  }
  /* Each question only when the orders already read (this page, a filtered list) have not answered it. */
  const shown = (view: View) => seen.some((o) => inView(o, view))
  const ask = (answered: boolean, read: () => Promise<string[]>) => (answered ? Promise.resolve([] as string[]) : read())
  const found = await Promise.all([
    ask(shown("pending"), () => newest((q) => q.eq("status", "pending"), 1)),
    ask(shown("paid"), () => newest((q) => q.eq("status", "completed"))),
    ask(shown("refunded"), () => newest((q) => q.eq("status", "refunded"))),
    ask(seen.some((o) => o.shipping !== null), () => newest((q) => q.not("checkout_id", "is", null))),
    ask(shown("unfulfilled"), () => checkouts((q) => q.in("fulfillment_status", ["unfulfilled", "processing", "partially_fulfilled"]))),
    ask(shown("returns"), () => checkouts((q) => q.in("return_status", ["requested", "in_progress"]))),
    ask(shown("cash"), () => checkouts((q) => q.eq("provider", "cod").is("cod_collected_at", null))),
  ])
  const known = new Set(seen.map((o) => o.id))
  const probe = ordersOf(index, found.flat()).filter((o) => !known.has(o.id))
  const read = probe.length ? groupOrders(await readOrderRows(db, scope, creatorId, index, probe, products), numbersFor(probe)) : []
  const pool = [...seen, ...read]
  return {
    views: VIEWS.filter((v) => v.value === "all" || pool.some((o) => inView(o, v.value))).map((v) => v.value),
    ships: pool.some((o) => o.shipping !== null),
    orders: read,
  }
}

/* ─── All of it ───────────────────────────────────────────────────────── */

/**
 * One page of the list, its figures and its tabs, for the signed-in creator.
 * The request can wait for the first order's time (`earliest`), which is
 * where All time begins: the page works its period out from it.
 */
export async function readOrdersListing(db: Db, creatorId: string, ask: ListingRequest | ((earliest: string | null) => ListingRequest)): Promise<OrdersListing & { products: CreatorProduct[] }> {
  const [productList, { index, scope }] = await Promise.all([readCreatorProducts(db, creatorId), orderIndex(db, creatorId)])
  const products = new Map(productList.map((p) => [p.id, p]))
  const req = typeof ask === "function" ? ask(index.orders[0]?.createdAt ?? null) : ask

  const withFigures = req.figures !== false
  const [chosen, figures] = await Promise.all([
    choosePage(db, scope, creatorId, index, products, req),
    withFigures ? readFigures(db, scope, creatorId, index, req) : Promise.resolve({ metrics: [] as MetricReading[], orders: [] as Order[], currency: "" }),
  ])

  /* The open order, wherever it is in the list (or outside its dates). */
  const open = req.open ? index.byRow.get(req.open) ?? null : null
  const extra = open && !chosen.send.some((o) => o.id === open.id) ? [open] : []
  const rows = chosen.rows
    ? [...chosen.rows, ...(extra.length ? await readOrderRows(db, scope, creatorId, index, extra, products) : [])]
    : await readOrderRows(db, scope, creatorId, index, [...chosen.send, ...extra], products)
  const sent = [...chosen.send, ...extra]
  const page = groupOrders(rows, numbersFor(sent))

  const tabs = withFigures ? await readTabs(db, scope, creatorId, index, products, [...chosen.seen, ...page]) : { views: [] as View[], ships: false, orders: [] as Order[] }

  /* The figures' currency: what most of the orders read here were charged in, an order's checkout first. */
  const byId = new Map<string, Order>()
  for (const o of [...figures.orders, ...tabs.orders, ...chosen.seen, ...page]) byId.set(o.id, o)

  return {
    products: productList,
    rows,
    numbers: numbersFor(sent),
    pageIds: chosen.pageIds,
    before: chosen.before,
    after: chosen.after,
    matching: chosen.matching,
    range: chosen.range,
    metrics: figures.metrics,
    summary: {
      total: index.orders.length,
      earliest: index.orders[0]?.createdAt ?? null,
      ships: tabs.ships,
      views: tabs.views,
      currency: figures.currency || ordersCurrency([...byId.values()]),
    },
    figures: withFigures,
    partial: chosen.partial,
  }
}

/** One order by its id or any of its rows' ids, with its number; null when it is not this creator's. */
export async function readOneOrder(db: Db, creatorId: string, id: string): Promise<{ rows: OrderRow[]; numbers: Record<string, number> } | null> {
  const [productList, { index, scope }] = await Promise.all([readCreatorProducts(db, creatorId), orderIndex(db, creatorId)])
  const order = index.byRow.get(id)
  if (!order) return null
  const rows = await readOrderRows(db, scope, creatorId, index, [order], new Map(productList.map((p) => [p.id, p])))
  return { rows, numbers: numbersFor([order]) }
}

/** How many orders were placed inside a window: Export's By date. */
export async function countOrdersWithin(db: Db, creatorId: string, window: Span): Promise<number> {
  const { index } = await orderIndex(db, creatorId)
  return ordersWithin(index, window).length
}

/** What an export can ask for: orders by number, or a list as the page draws it (every order for no window). */
export type ExportChoice = { numbers: number[] } | { query: ListQuery; window: Span | null }

/** The orders an export writes, whole and numbered, in the list's order (by number, as chosen). */
export async function readOrdersForExport(db: Db, creatorId: string, choice: ExportChoice): Promise<Order[]> {
  const [productList, { index, scope }] = await Promise.all([readCreatorProducts(db, creatorId), orderIndex(db, creatorId)])
  const products = new Map(productList.map((p) => [p.id, p]))
  if ("numbers" in choice) {
    const picked: IndexedOrder[] = []
    const seen = new Set<number>()
    for (const n of choice.numbers) {
      const o = orderNumbered(index, n)
      if (o && !seen.has(n)) {
        seen.add(n)
        picked.push(o)
      }
    }
    const orders = groupOrders(await readOrderRows(db, scope, creatorId, index, picked, products), numbersFor(picked))
    const byNumber = new Map(orders.map((o) => [o.number, o]))
    return picked.map((o) => byNumber.get(o.number)).filter((o): o is Order => !!o)
  }
  const pool = await candidates(db, scope, creatorId, index, choice.query, choice.window)
  const { orders: within } = bounded(pool)
  const orders = groupOrders(await readOrderRows(db, scope, creatorId, index, within, products), numbersFor(within))
  return filterOrders(orders, choice.query, choice.window)
}
