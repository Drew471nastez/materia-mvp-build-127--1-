import "server-only"

/**
 * ===========================================================================
 *  THE SALES REPORTS' READS, FOR ONE SIGNED IN CREATOR
 * ===========================================================================
 * What app/api/analytics/commerce and the export (app/api/analytics/export)
 * read: the creator's order lines for both periods, a day either side so a
 * basket is whole (report-read orderSpans), in the store's currency; the
 * customers among them who had bought before; the checkouts behind the
 * physical lines, for the fulfillment rate; and how long shipped parcels
 * waited. lib/analytics/commerce commerceReport adds them up by the rules
 * the page's tabs use.
 *
 * WHO. The creator is the caller's, found from the signed in user; a place
 * that is not theirs is refused, a product that is not theirs is ignored.
 */
import { unconvertedIncluded } from "./unconverted-count"
import { refundedOrderIds, withRefundHistory } from "./refund-history-server"
import type { createAdminClient } from "@/lib/supabase/admin"
import type { OrderRow } from "@/lib/orders/order-view"
import { inStoreCurrency } from "@/lib/money/report-currency-server"
import { readStoreCurrency } from "@/lib/store/selling-currency-read"
import { byCreator, ownRows, scopedOrders } from "./creator-orders"
import { isTestSale, withoutTestSales } from "./test-sales"
import { creatorProperties, orderSpans, ratesFrom, readSpans, refundedEarlier, startingAt } from "./report-read"
import { spansToRead } from "./buckets"
import { commerceReport, commerceRowCounts, customersOf, grainFor, salesOf, linesFor, withListTotal, type CommerceOrderRow, type CommerceReport, type Span } from "./commerce"
import { ownsProperty, type CreatorProperties, type PropertySelector } from "./properties"
import { lineInMode, type SalesMode } from "./sections"

type Admin = ReturnType<typeof createAdminClient>
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Read<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }> & any

const BASE = "id, product_id, amount_cents, tip_cents, status, created_at, stripe_session_id, refund_amount_cents, source, source_detail, buyer_email, currency, quantity"
/* The richest read first; an older database without a column is read with less, never left blank. */
const COLUMN_SETS = [
  `${BASE}, refunded_at, tax_cents, tax_included, shipping_cents, unit_price_cents, property_type, property_id, checkout_id`,
  `${BASE}, tax_cents, tax_included, shipping_cents, unit_price_cents, property_type, property_id, checkout_id`,
  `${BASE}, tax_cents, tax_included, shipping_cents, unit_price_cents, property_type, property_id`,
  `${BASE}, tax_cents, tax_included, shipping_cents, unit_price_cents`,
  BASE,
  "id, product_id, amount_cents, tip_cents, status, created_at, stripe_session_id, refund_amount_cents, source, source_detail, buyer_email, currency",
]

export interface CommerceQuestion {
  creatorId: string
  properties: CreatorProperties
  selector: PropertySelector
  productId: string | null
  productTypes: Record<string, string | null>
  span: Span
  previous: Span | null
  timeZone: string
  mode: SalesMode
}

export interface CommerceAnswer extends CommerceReport {
  currency: string
  grain: ReturnType<typeof grainFor>
  timeZone: string
  compared: boolean
  /** More order lines than one read takes: the figures are of the first ones only, and the page says so. */
  truncated: boolean
  /** Lines in another currency no rate could convert: left out of the money, and counted. */
  unconverted: number
  fulfillment: { hours: number | null; shipped: number }
  fulfillmentBefore: { hours: number | null; shipped: number }
  /** The place could not be told on this database (before part 60): every place's sales are shown. */
  placeUnknown: boolean
}

/** The creator's order lines for the stretches, the richest columns the database has. */
async function readLines(admin: Admin, creatorId: string, spans: Span[]): Promise<{ rows: OrderRow[]; truncated: boolean; columns: string }> {
  let last: Error | null = null
  /* The ledger's refunds in the periods do not need the orders: asked for beside them, not after them. */
  const ledger = refundedOrderIds(admin, creatorId, spans)
  for (const columns of COLUMN_SETS) {
    try {
      const read = await byCreator(async (scope) => {
        const got = await readSpans<OrderRow>(orderSpans(spans), (start, end, after) =>
          startingAt(scopedOrders(admin, columns, scope, creatorId, null).lt("created_at", end), start, after)
            .order("created_at", { ascending: true })
            .order("id", { ascending: true })
            .limit(1000) as Read<OrderRow>,
        )
        /* Refunds made in the periods of orders placed before them: dated by the refund (report-read refundedEarlier). */
        /* An admin's test sale is not a buyer's order (lib/analytics/test-sales). */
        const own = withoutTestSales(ownRows(got.rows))
        const ledgerRefunded = /refunded_at/.test(columns) ? await ledger : []
        const earlier = /refunded_at/.test(columns) ? await refundedEarlier<OrderRow>(() => scopedOrders(admin, columns, scope, creatorId, null), spans, new Set(own.map((r) => r.id)), ledgerRefunded) : []
        /* Each part refund on its own day, from the seller's ledger (lib/analytics/refund-dates). */
        return { rows: await withRefundHistory(admin, creatorId, [...own, ...withoutTestSales(ownRows(earlier))]), truncated: got.truncated }
      })
      return { rows: read.rows, truncated: read.truncated, columns }
    } catch (e) {
      last = e as Error
      if (!/column|42703|PGRST204/i.test(last.message)) throw last
    }
  }
  throw last ?? new Error("orders not read")
}

const NOT_A_SALE = new Set(["failed", "pending", "disputed", ""])

/** Of these customers, the ones with a sale before `before` (lower case emails). */
async function boughtBefore(admin: Admin, creatorId: string, emails: string[], before: number): Promise<Set<string>> {
  const out = new Set<string>()
  if (emails.length === 0) return out
  try {
    for (let i = 0; i < emails.length && i < 5000; i += 100) {
      const chunk = emails.slice(i, i + 100)
      const rows = await byCreator(async (scope) => {
        const { data, error } = await scopedOrders(admin, "buyer_email, status, source_detail", scope, creatorId, null)
          .in("buyer_email", chunk)
          .lt("created_at", new Date(before).toISOString())
          .limit(5000)
        if (error) throw new Error(error.message)
        return ownRows((data ?? []) as Array<{ buyer_email: string | null; status: string | null; source_detail?: unknown }>)
      })
      /* A sale, by the line: an unfinished, failed or disputed payment made nobody a customer. */
      /* Nor did an admin's test sale (lib/analytics/test-sales). */
      for (const r of rows) if (r.buyer_email && !NOT_A_SALE.has(String(r.status ?? "pending")) && !isTestSale(r)) out.add(r.buyer_email.trim().toLowerCase())
    }
  } catch (error) {
    console.warn("[analytics/commerce] earlier customers not read:", (error as Error).message)
  }
  return out
}

/** Each checkout's fulfillment_status, for the lines that name one. */
async function checkoutStatuses(admin: Admin, creatorId: string, ids: string[]): Promise<Record<string, string | null>> {
  const out: Record<string, string | null> = {}
  if (ids.length === 0) return out
  try {
    for (let i = 0; i < ids.length; i += 200) {
      const { data, error } = await admin.from("commerce_checkouts").select("id, fulfillment_status").eq("creator_id", creatorId).in("id", ids.slice(i, i + 200))
      if (error) throw new Error(error.message)
      for (const c of (data ?? []) as Array<{ id: string; fulfillment_status: string | null }>) out[c.id] = c.fulfillment_status
    }
  } catch {
    /* No physical commerce tables: no fulfillment rate. */
  }
  return out
}

/**
 * HOW LONG A PHYSICAL ORDER WAITED TO SHIP: payment to "shipped", on
 * average, for the parcels shipped in the stretch, only those of the
 * orders the page is looking at (product, place, switch).
 */
async function fulfillmentIn(admin: Admin, q: CommerceQuestion, span: Span, filtered: boolean): Promise<{ hours: number | null; shipped: number }> {
  if (!(span.end > span.start)) return { hours: null, shipped: 0 }
  try {
    const { data: shipped } = await admin
      .from("fulfillments")
      .select("checkout_id, shipped_at")
      .eq("creator_id", q.creatorId)
      .not("shipped_at", "is", null)
      .gte("shipped_at", new Date(span.start).toISOString())
      .lt("shipped_at", new Date(span.end).toISOString())
      .limit(5000)
    let list = (shipped ?? []) as Array<{ checkout_id: string; shipped_at: string }>
    if (!list.length) return { hours: null, shipped: 0 }
    let ids = [...new Set(list.map((f) => f.checkout_id))]
    if (filtered) {
      const { data: lines } = await admin.from("orders").select("checkout_id, product_id, property_type, property_id, source, source_detail").in("checkout_id", ids.slice(0, 1000))
      const keep = new Set(
        ((lines ?? []) as Array<CommerceOrderRow & { checkout_id: string }>)
          .filter((l) => lineInMode(q.productTypes[String(l.product_id)], q.mode))
          .filter((l) => commerceRowCounts({ ...l, id: "", created_at: "" }, { productId: q.productId, property: q.selector, defaultWebsite: q.properties.defaultWebsite }))
          .map((l) => l.checkout_id),
      )
      ids = ids.filter((id) => keep.has(id))
      list = list.filter((f) => keep.has(f.checkout_id))
      if (!ids.length) return { hours: null, shipped: 0 }
    }
    const { data: checkouts } = await admin.from("commerce_checkouts").select("id, created_at").in("id", ids.slice(0, 1000))
    const placed = new Map(((checkouts ?? []) as Array<{ id: string; created_at: string }>).map((c) => [c.id, Date.parse(c.created_at)]))
    const waits = list.map((f) => Date.parse(f.shipped_at) - (placed.get(f.checkout_id) ?? NaN)).filter((w) => Number.isFinite(w) && w >= 0)
    return { hours: waits.length ? waits.reduce((a, b) => a + b, 0) / waits.length / 3_600_000 : null, shipped: waits.length }
  } catch {
    return { hours: null, shipped: 0 }
  }
}

/** The creator's places and products for a question, checked: a place that is not theirs is null. */
export async function commerceContext(admin: Admin, userId: string, creatorId: string, selector: PropertySelector, wanted: string | null) {
  const [properties, products] = await Promise.all([
    creatorProperties(admin, creatorId, userId),
    admin.from("products").select("id, type").eq("creator_id", creatorId).limit(5000),
  ])
  if (!ownsProperty(properties, selector)) return null
  const productTypes = Object.fromEntries(((products.data ?? []) as Array<{ id: string; type: string | null }>).map((p) => [p.id, p.type ?? null]))
  const productId = wanted && wanted !== "all" && wanted in productTypes ? wanted : null
  return { properties, productTypes, productId }
}

/** The customers' emails as the rows hold them and in lower case: the column is compared as written. */
function asStored(orders: Array<{ lines: Array<{ buyer_email?: string | null }> }>): string[] {
  const raw = orders.flatMap((o) => o.lines.map((l) => (l.buyer_email || "").trim()).filter(Boolean))
  return [...new Set([...raw, ...customersOf(orders as never)])]
}

/** Every sales figure for the question, read and counted. */
export async function countCommerce(admin: Admin, q: CommerceQuestion): Promise<CommerceAnswer> {
  const spans = spansToRead(q.span, q.previous)
  /* The store's currency beside the orders, not after them. */
  const storeCurrency = readStoreCurrency(admin, q.creatorId)
  const read = await readLines(admin, q.creatorId, spans)
  const placeUnknown = !/property_type/.test(read.columns)
  const inStore = await inStoreCurrency(admin, q.creatorId, withListTotal(read.rows as CommerceOrderRow[]) as unknown as OrderRow[], (await storeCurrency).currency, { rates: ratesFrom(admin) })
  const rows = inStore.rows
  const selector: PropertySelector = placeUnknown ? { type: "all" } : q.selector

  /* Who of the period's customers had bought before it began: returning, as Shopify counts them. */
  const first = commerceReport({ rows, span: q.span, previous: q.previous, timeZone: q.timeZone, selector, properties: q.properties, productId: q.productId, mode: q.mode, productTypes: q.productTypes })
  const before = q.previous ? salesOf(linesFor(rows, q), selector, q.properties.defaultWebsite, q.mode, q.productTypes).filter((o) => {
    const t = Date.parse(o.createdAt)
    return t >= q.previous!.start && t < q.previous!.end
  }) : []
  const checkoutIds = [...new Set(rows.map((r) => r.checkout_id).filter((c): c is string => !!c))]
  const filtered = !!q.productId || selector.type !== "all" || q.mode !== "all"
  const [earlierNow, earlierBefore, checkouts, fulfillment, fulfillmentBefore] = await Promise.all([
    boughtBefore(admin, q.creatorId, asStored(first.orders), q.span.start),
    q.previous ? boughtBefore(admin, q.creatorId, asStored(before), q.previous.start) : Promise.resolve(new Set<string>()),
    checkoutStatuses(admin, q.creatorId, checkoutIds),
    fulfillmentIn(admin, q, q.span, filtered),
    q.previous ? fulfillmentIn(admin, q, q.previous, filtered) : Promise.resolve({ hours: null, shipped: 0 }),
  ])
  const report = commerceReport({ rows, span: q.span, previous: q.previous, timeZone: q.timeZone, selector, properties: q.properties, productId: q.productId, mode: q.mode, productTypes: q.productTypes, earlier: { now: earlierNow, before: earlierBefore }, checkouts })
  return {
    ...report,
    currency: inStore.currency,
    grain: grainFor(q.span),
    timeZone: q.timeZone,
    compared: !!q.previous,
    truncated: read.truncated,
    /* Only the period's own sales that no rate converted, not every row read around it (lib/analytics/unconverted-count). */
    unconverted: inStore.unconverted > 0 ? unconvertedIncluded(inStore.left as unknown as Array<{ created_at: string }>, q.span) : 0,
    fulfillment,
    fulfillmentBefore,
    placeUnknown,
  }
}
