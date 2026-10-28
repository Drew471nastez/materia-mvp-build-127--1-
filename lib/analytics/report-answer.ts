import "server-only"

/**
 * ===========================================================================
 *  THE ANALYTICS ANSWER, FOR ONE SIGNED IN CREATOR AND ONE QUESTION
 * ===========================================================================
 * What app/api/analytics/reports answers, here so the route is only who is
 * asking, its short memory and its stream, and so a test can ask the very
 * same question of a database fake (tests/analytics-e2e.test.ts): the
 * question read from the address (reportQuestion), then everything counted
 * at once (countReportAnswer). lib/analytics/reports.ts has the rules.
 */
import { buildReports, moneyOf, previousWindow, spansToRead, type ReportWire, type Span, type WindowWire } from "./reports"
import { isTimeZone } from "@/lib/orders/time-zone"
import { groupOrders, isSale, type OrderRow } from "@/lib/orders/order-view"
import { byCreator, ownRows, scopedOrders } from "./creator-orders"
import { hasOrdersInOtherCurrency, inStoreCurrency } from "@/lib/money/report-currency-server"
import { readStoreCurrency } from "@/lib/store/selling-currency-read"
import { ownsProperty, parseProperty, propertyParam } from "./properties"
import { parseMode } from "./sections"
import {
  countVisits,
  creatorProperties,
  foldLegacy,
  onePageLinkLabels,
  readAll,
  readLegacyOnePage,
  readAudience,
  readDownloads,
  readOrders,
  readSubscribers,
  rpc,
  startingAt,
  withColumns,
  type Admin,
  type CountQuestion,
} from "./report-read"

const PAGE = 1000
/* Long enough for "All time" from 2020 and years past it. */
export const MAX_SPAN_MS = 30 * 366 * 24 * 3_600_000

export type Answer = Record<string, unknown>
type Read<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>

export function comparisonOf(url: URL, span: Span): Span | null | "bad" {
  if (url.searchParams.get("compare") === "none") return null
  const cs = url.searchParams.get("cstart")
  const ce = url.searchParams.get("cend")
  if (!cs && !ce) return previousWindow(span)
  const start = Date.parse(cs || "")
  const end = Date.parse(ce || "")
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || end - start > MAX_SPAN_MS) return "bad"
  return { start, end }
}


export interface AskedQuestion {
  q: CountQuestion
  productTitles: Record<string, string>
  productTypes: Record<string, string | null>
  /** The whole question, sorted, without how it is to be sent: the route's memory key, after who asks. */
  question: string
}

/**
 * THE QUESTION IN THE ADDRESS, FOR THIS USER'S CREATOR: the period, its
 * comparison, the time zone, the place and the product. The creator is
 * always the signed in user's, never the request's, and a place or a product
 * that is not theirs is refused or ignored before anything is read.
 */
export async function reportQuestion(
  admin: Admin,
  userId: string,
  url: URL,
  mainDomain: string,
  /**
   * The store, when the route already knows it (lib/team/server
   * requireTeamPermission): its id, and its owner's account for the
   * OnePage. Without it the store is the signed in account's own.
   */
  store?: { creatorId: string; ownerUserId: string | null },
): Promise<AskedQuestion | { status: number; error: string }> {
  const start = Date.parse(url.searchParams.get("start") || "")
  const end = Date.parse(url.searchParams.get("end") || "")
  const tz = url.searchParams.get("tz")
  const timeZone = isTimeZone(tz) ? tz : "UTC"
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || end - start > MAX_SPAN_MS) return { status: 400, error: "Bad period" }
  const span = { start, end }
  const previous = comparisonOf(url, span)
  if (previous === "bad") return { status: 400, error: "Bad comparison" }
  /* The old OnePage view is the OnePage property now. */
  const selector = url.searchParams.get("mode") === "onepage" && !url.searchParams.get("property") ? parseProperty("onepage") : parseProperty(url.searchParams.get("property"))

  /* The All / Digital / Physical switch: which order lines the sales figures keep. */
  const mode = parseMode(url.searchParams.get("kind"))

  const question = new URLSearchParams(url.searchParams)
  question.delete("stream")
  question.delete("mode")
  question.delete("kind")
  if (mode !== "all") question.set("kind", mode)
  question.set("property", propertyParam(selector) ?? "all")
  question.sort()

  /* The creator and their products in one round trip, found from the session's user, or from the store the route was given. */
  const joined = store
    ? await admin.from("creators").select("id, products(id, title, type)").eq("id", store.creatorId).maybeSingle()
    : await admin.from("creators").select("id, products(id, title, type)").eq("user_id", userId).maybeSingle()
  let creator = joined.data as { id: string; products?: Array<{ id: string; title: string; type?: string | null }> } | null
  let products = creator?.products ?? []
  if (joined.error || (creator && !Array.isArray(creator.products))) {
    /* The two not joined on this install: two reads, as before. */
    const { data } = store ? await admin.from("creators").select("id").eq("id", store.creatorId).maybeSingle() : await admin.from("creators").select("id").eq("user_id", userId).single()
    creator = data as { id: string } | null
    if (creator) products = ((await admin.from("products").select("id, title, type").eq("creator_id", creator.id)).data ?? []) as typeof products
  }
  if (!creator) return { status: 404, error: "Creator not found" }
  const productTitles = Object.fromEntries(products.map((p) => [p.id, p.title || "Untitled product"]))
  const productTypes = Object.fromEntries(products.map((p) => [p.id, p.type ?? null]))

  /* Only the creator's own places: a website id that is not theirs is answered with nothing at all. */
  const properties = await creatorProperties(admin, creator.id, store ? store.ownerUserId : userId)
  if (!ownsProperty(properties, selector)) return { status: 404, error: "No such property" }

  const wanted = url.searchParams.get("product")
  const product = wanted && wanted !== "all" && productTitles[wanted] ? wanted : null
  return {
    q: { creatorId: creator.id, selector, properties, product, window: span, previous, timeZone, mainDomain, part: "all", mode },
    productTitles,
    productTypes,
    question: question.toString(),
  }
}

/**
 * The answer. Everything is asked for at once: the quick part of the visits
 * and the rest (side by side in Postgres), the OnePage's history, the
 * orders, the sign-ups and the all time line. With `figuresFirst`, the
 * figures go out as soon as their part and the orders are in.
 */
export async function countReportAnswer(
  admin: Admin,
  q: CountQuestion,
  productTitles: Record<string, string>,
  productTypes: Record<string, string | null>,
  /** Who it is counted for: the page shows a kept answer only to them (lib/analytics/report-cache). */
  viewer: string,
  /** Handed the figures' own answer, before anything is awaited, when they are to go first. */
  onFigures?: (figures: Promise<Answer | null>) => void,
): Promise<Answer> {
  {
    const spans = spansToRead(q.window, q.previous)
    const shared = {}
    const quick = countVisits(admin, { ...q, part: "figures" }, shared)
    const rest = countVisits(admin, { ...q, part: "detail" }, shared)
    const legacy = readLegacyOnePage(admin, q)
    const orders = readOrders(admin, spans, q.creatorId, q.product, q.window)
    const subscribers = q.product ? Promise.resolve(null) : readSubscribers(admin, spans, q.creatorId)
    const labels = q.selector.type === "onepage" || q.selector.type === "all" ? onePageLinkLabels(admin, q.properties.onePageId) : Promise.resolve({})
    const allTime = q.selector.type === "all" && !q.product && (q.mode ?? "all") === "all" ? allTimeOf(admin, q.creatorId) : Promise.resolve(null)
    /* Nothing is left unhandled while the others are awaited. */
    /*
      Systems, carts and page titles (part 253), for both periods. When the
      visits themselves were counted from the rows, those rows already gave
      them (wireFromRows), so nothing is read twice.
    */
    const audience = Promise.all([readAudience(admin, q, q.window), q.previous ? readAudience(admin, q, q.previous) : Promise.resolve({ audience: null, truncated: false })])
    /* Downloads of the period's digital order lines, for the Digital card. */
    const downloads = orders.then((o) => {
      const inside = o.rows.filter((r) => {
        const at = Date.parse(r.created_at)
        return at >= q.window.start && at < q.window.end && productTypes[r.product_id] !== "physical"
      })
      return readDownloads(admin, inside.map((r) => r.id))
    })
    for (const p of [quick, rest, legacy, orders, subscribers, labels, allTime, audience, downloads]) p.catch(() => {})

    const base = { window: q.window, previous: q.previous, timeZone: q.timeZone, mainDomain: q.mainDomain, productTitles, selector: q.selector, properties: q.properties, product: q.product, mode: q.mode ?? "all", productTypes }
    if (onFigures) {
      onFigures(Promise.all([quick, legacy, orders, allTime])
        .then(([v, l, o, a]) => {
          const only = (w: WindowWire): WindowWire => ({
            visitors: w.visitors,
            views: w.views,
            product_visitors: w.product_visitors,
            product_views: w.product_views,
            visitor_buckets: w.visitor_buckets,
            view_buckets: w.view_buckets,
            clicks: w.clicks,
            click_buckets: w.click_buckets,
          })
          const wire = foldLegacy({ cur: only(v.wire.cur), prev: only(v.wire.prev) }, l.legacy, q)
          return { reports: buildReports({ ...base, wire, orders: o.rows }), allTime: a, truncated: false, viewer, property: propertyParam(q.selector) ?? "all", properties: q.properties, kind: q.mode ?? "all" }
        })
        .catch(() => null))
    }

    const [v, d, l, o, s, labelsById, a, [audNow, audBefore], dl] = await Promise.all([quick, rest, legacy, orders, subscribers, labels, allTime, audience, downloads])
    const fromRows = d.counted === "rows"
    const merged: ReportWire = {
      cur: { ...v.wire.cur, ...d.wire.cur, ...(fromRows || !audNow.audience ? {} : audNow.audience) },
      prev: { ...v.wire.prev, ...d.wire.prev, ...(fromRows || !audBefore.audience ? {} : { os: audBefore.audience.os }) },
    }
    const wire = foldLegacy(merged, l.legacy, q)
    return {
      reports: buildReports({ ...base, wire, orders: o.rows, subscribers: s ?? undefined, linkLabels: labelsById, downloadsByLine: dl }),
      allTime: a,
      truncated: v.truncated || d.truncated || l.truncated || o.truncated || audNow.truncated || audBefore.truncated,
      /* Sales in another currency, each converted to the store's at its own day's rate; any no rate could convert are left out and counted. */
      conversion: o.conversion,
      viewer,
      property: propertyParam(q.selector) ?? "all",
      properties: q.properties,
      kind: q.mode ?? "all",
    }
  }
}

/**
 * ALL TIME, under Revenue and Orders when every place is shown: by the
 * database when it can (analytics_all_time), else from every order here.
 */
export async function allTimeOf(admin: Admin, creatorId: string) {
  /* The database's count adds cents as they are: right only while every order is in the store's currency. Otherwise each is converted at its own day's rate (lib/money/report-currency). */
  const storeCurrency = (await readStoreCurrency(admin, creatorId)).currency
  const mixed = await byCreator((scope) => hasOrdersInOtherCurrency((columns) => scopedOrders(admin, columns, scope, creatorId, null), storeCurrency))
  const counted = mixed ? null : await rpc<{ views: number; orders: number; sales_cents: number }>(admin, "analytics_all_time", { p_creator_id: creatorId, p_product_id: null })
  if (counted) return { orders: Number(counted.orders) || 0, salesCents: Number(counted.sales_cents) || 0 }
  const read = await byCreator((scope) =>
    withColumns("id, product_id, amount_cents, tip_cents, status, created_at, stripe_session_id, refund_amount_cents, currency", async (columns) =>
      ownRows(
        (
          await readAll<OrderRow>((after) =>
            startingAt(scopedOrders(admin, columns, scope, creatorId, null), "1970-01-01T00:00:00.000Z", after)
              .order("created_at", { ascending: true })
              .order("id", { ascending: true })
              .limit(PAGE) as unknown as Read<OrderRow>,
          )
        ).rows,
      ),
    ),
  )
  const rows = (await inStoreCurrency(admin, creatorId, read, storeCurrency)).rows
  const sales = groupOrders(rows).filter(isSale)
  return { orders: sales.length, salesCents: sales.reduce((sum, o) => sum + moneyOf(o).net, 0) }
}
