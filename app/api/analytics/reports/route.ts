import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { getMainDomain } from "@/lib/url-helpers"
import { buildReports, moneyOf, previousWindow, spansToRead, type ReportWire, type Span, type WindowWire } from "@/lib/analytics/reports"
import { isTimeZone } from "@/lib/orders/time-zone"
import { groupOrders, isSale, type OrderRow } from "@/lib/orders/order-view"
import { byCreator, ownRows, scopedOrders } from "@/lib/analytics/creator-orders"
import { hasOrdersInOtherCurrency, inStoreCurrency } from "@/lib/money/report-currency-server"
import { readStoreCurrency } from "@/lib/store/selling-currency-read"
import { ownsProperty, parseProperty, propertyParam } from "@/lib/analytics/properties"
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
} from "@/lib/analytics/report-read"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/**
 * The Analytics page's figures, its chart and every card under it, and
 * Home's chart (the same answer), for the signed-in creator only.
 *
 * WHAT IT COUNTS. lib/analytics/reports.ts has the rules and
 * lib/analytics/reports.ts says them in words. Visits are counted in
 * Postgres (analytics_report, lib/analytics/report-read), orders and money
 * from `orders`, as the Orders page counts them.
 *
 * WHICH PLACE. `property` is All (absent), `creator_page`, `onepage` or
 * `website:<install id>` (lib/analytics/properties). A website that is not
 * the creator's own is refused with a 404 before anything is read: the
 * creator is always the signed in user's, never the request's. The old
 * OnePage view (`mode=onepage`) is the OnePage property now.
 *
 * FIGURES FIRST. With `stream=1` the answer is lines of JSON: the figures
 * (every tab and the chart) as soon as they are counted, then everything,
 * the lists included. The two are counted side by side.
 *
 * ASKED TWICE IN A FEW SECONDS, COUNTED ONCE. The same question from the
 * same person within CACHE_MS is answered from memory, and one already
 * being counted is waited for rather than started again. The key is the
 * person and the whole question, so nobody is ever answered with somebody
 * else's figures.
 */
const PAGE = 1000
/* Long enough for "All time" from 2020 and years past it. */
const MAX_SPAN_MS = 30 * 366 * 24 * 3_600_000
/* How long an answer is reused for the same question from the same person. */
const CACHE_MS = 15_000

type Answer = Record<string, unknown>
type Read<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>

/* ─── Answers just given, and ones being counted ──────────────────────── */

const answers = new Map<string, { at: number; answer: Answer }>()
const counting = new Map<string, Promise<Answer>>()

function remembered(key: string): Answer | null {
  const hit = answers.get(key)
  if (!hit) return null
  if (Date.now() - hit.at <= CACHE_MS) return hit.answer
  answers.delete(key)
  return null
}

/** Counted once however many ask at the same moment, and remembered for CACHE_MS. */
function once(key: string, count: () => Promise<Answer>): Promise<Answer> {
  const going = counting.get(key)
  if (going) return going
  const p = count()
    .then((answer) => {
      answers.set(key, { at: Date.now(), answer })
      /* A small memory: the oldest goes first. */
      while (answers.size > 200) answers.delete(answers.keys().next().value as string)
      return answer
    })
    .finally(() => counting.delete(key))
  counting.set(key, p)
  return p
}

/*
  Private, and fresh for the few seconds the server keeps it too. Vary, so a
  browser shared by two accounts never hands one of them the other's answer.
*/
const HEADERS = { "Cache-Control": `private, max-age=${CACHE_MS / 1000}`, Vary: "Cookie, Authorization" }

function comparisonOf(url: URL, span: Span): Span | null | "bad" {
  if (url.searchParams.get("compare") === "none") return null
  const cs = url.searchParams.get("cstart")
  const ce = url.searchParams.get("cend")
  if (!cs && !ce) return previousWindow(span)
  const start = Date.parse(cs || "")
  const end = Date.parse(ce || "")
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || end - start > MAX_SPAN_MS) return "bad"
  return { start, end }
}

/**
 * The answer as lines of JSON: `figures` when they are counted, if that is
 * before everything is, then `all`. A failure is a line of its own.
 */
function streamed(figures: Promise<Answer | null>, all: Promise<Answer>) {
  const encoder = new TextEncoder()
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      let done = false
      figures.then(
        (f) => {
          if (f && !done) controller.enqueue(encoder.encode(`${JSON.stringify({ part: "figures", ...f })}\n`))
        },
        () => {},
      )
      try {
        const answer = await all
        done = true
        controller.enqueue(encoder.encode(`${JSON.stringify({ part: "all", ...answer })}\n`))
      } catch (error) {
        done = true
        console.error("[analytics/reports]", (error as Error).message)
        controller.enqueue(encoder.encode(`${JSON.stringify({ part: "error", error: "Could not read analytics" })}\n`))
      }
      controller.close()
    },
  })
  return new Response(body, { headers: { ...HEADERS, "Content-Type": "application/x-ndjson; charset=utf-8" } })
}

async function answered(all: Promise<Answer>, label: string) {
  try {
    return NextResponse.json(await all, { headers: HEADERS })
  } catch (error) {
    console.error(label, (error as Error).message)
    return NextResponse.json({ error: "Could not read analytics" }, { status: 500 })
  }
}

export async function GET(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const url = new URL(request.url)
  const start = Date.parse(url.searchParams.get("start") || "")
  const end = Date.parse(url.searchParams.get("end") || "")
  const tz = url.searchParams.get("tz")
  const timeZone = isTimeZone(tz) ? tz : "UTC"
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || end - start > MAX_SPAN_MS) {
    return NextResponse.json({ error: "Bad period" }, { status: 400 })
  }
  const span = { start, end }
  const previous = comparisonOf(url, span)
  if (previous === "bad") return NextResponse.json({ error: "Bad comparison" }, { status: 400 })
  const stream = url.searchParams.get("stream") === "1"
  /* The old OnePage view is the OnePage property now. */
  const selector = url.searchParams.get("mode") === "onepage" && !url.searchParams.get("property") ? parseProperty("onepage") : parseProperty(url.searchParams.get("property"))

  /* Who asks, and the whole question. */
  const question = new URLSearchParams(url.searchParams)
  question.delete("stream")
  question.delete("mode")
  question.set("property", propertyParam(selector) ?? "all")
  question.sort()
  const key = `${user.id}|${question}`
  const known = remembered(key)
  if (known) return stream ? streamed(Promise.resolve(null), Promise.resolve(known)) : NextResponse.json(known, { headers: HEADERS })

  const admin = createAdminClient()

  /* The creator and their products in one round trip, found from the session's user. */
  const joined = await admin.from("creators").select("id, products(id, title, type)").eq("user_id", user.id).maybeSingle()
  let creator = joined.data as { id: string; products?: Array<{ id: string; title: string; type?: string | null }> } | null
  let products = creator?.products ?? []
  if (joined.error || (creator && !Array.isArray(creator.products))) {
    /* The two not joined on this install: two reads, as before. */
    const { data } = await admin.from("creators").select("id").eq("user_id", user.id).single()
    creator = data
    if (creator) products = (await admin.from("products").select("id, title, type").eq("creator_id", creator.id)).data ?? []
  }
  if (!creator) return NextResponse.json({ error: "Creator not found" }, { status: 404 })
  const productTitles = Object.fromEntries(products.map((p) => [p.id, p.title || "Untitled product"]))
  const productTypes = Object.fromEntries(products.map((p) => [p.id, p.type ?? null]))

  /* Only the creator's own places: a website id that is not theirs is answered with nothing at all. */
  const properties = await creatorProperties(admin, creator.id, user.id)
  if (!ownsProperty(properties, selector)) return NextResponse.json({ error: "No such property" }, { status: 404 })

  const wanted = url.searchParams.get("product")
  const product = wanted && wanted !== "all" && productTitles[wanted] ? wanted : null

  const q: CountQuestion = {
    creatorId: creator.id,
    selector,
    properties,
    product,
    window: span,
    previous,
    timeZone,
    mainDomain: getMainDomain(),
    part: "all",
  }
  const { figures, all } = storeAnswer(admin, key, q, productTitles, productTypes, user.id, stream)
  return stream ? streamed(figures, all) : answered(all, "[analytics/reports]")
}

/**
 * The answer. Everything is asked for at once: the quick part of the visits
 * and the rest (side by side in Postgres), the OnePage's history, the
 * orders, the sign-ups and the all time line. With `figuresFirst`, the
 * figures go out as soon as their part and the orders are in.
 */
function storeAnswer(
  admin: Admin,
  key: string,
  q: CountQuestion,
  productTitles: Record<string, string>,
  productTypes: Record<string, string | null>,
  /** Who it is counted for: the page shows a kept answer only to them (lib/analytics/report-cache). */
  viewer: string,
  figuresFirst: boolean,
): { figures: Promise<Answer | null>; all: Promise<Answer> } {
  let figures: Promise<Answer | null> = Promise.resolve(null)
  const all = once(key, async () => {
    const spans = spansToRead(q.window, q.previous)
    const shared = {}
    const quick = countVisits(admin, { ...q, part: "figures" }, shared)
    const rest = countVisits(admin, { ...q, part: "detail" }, shared)
    const legacy = readLegacyOnePage(admin, q)
    const orders = readOrders(admin, spans, q.creatorId, q.product)
    const subscribers = q.product ? Promise.resolve(null) : readSubscribers(admin, spans, q.creatorId)
    const labels = q.selector.type === "onepage" || q.selector.type === "all" ? onePageLinkLabels(admin, q.properties.onePageId) : Promise.resolve({})
    const allTime = q.selector.type === "all" && !q.product ? allTimeOf(admin, q.creatorId) : Promise.resolve(null)
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

    const base = { window: q.window, previous: q.previous, timeZone: q.timeZone, mainDomain: q.mainDomain, productTitles, selector: q.selector, properties: q.properties, product: q.product }
    if (figuresFirst) {
      figures = Promise.all([quick, legacy, orders, allTime])
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
          return { reports: buildReports({ ...base, wire, orders: o.rows }), allTime: a, truncated: false, viewer, property: propertyParam(q.selector) ?? "all", properties: q.properties }
        })
        .catch(() => null)
    }

    const [v, d, l, o, s, labelsById, a, [audNow, audBefore], dl] = await Promise.all([quick, rest, legacy, orders, subscribers, labels, allTime, audience, downloads])
    const fromRows = d.counted === "rows"
    const merged: ReportWire = {
      cur: { ...v.wire.cur, ...d.wire.cur, ...(fromRows || !audNow.audience ? {} : audNow.audience) },
      prev: { ...v.wire.prev, ...d.wire.prev, ...(fromRows || !audBefore.audience ? {} : { os: audBefore.audience.os }) },
    }
    const wire = foldLegacy(merged, l.legacy, q)
    return {
      reports: buildReports({ ...base, wire, orders: o.rows, subscribers: s ?? undefined, linkLabels: labelsById, productTypes, downloadsByLine: dl }),
      allTime: a,
      truncated: v.truncated || d.truncated || l.truncated || o.truncated || audNow.truncated || audBefore.truncated,
      /* Sales in another currency, each converted to the store's at its own day's rate; any no rate could convert are left out and counted. */
      conversion: o.conversion,
      viewer,
      property: propertyParam(q.selector) ?? "all",
      properties: q.properties,
    }
  })
  return { figures, all }
}

/**
 * ALL TIME, under Revenue and Orders when every place is shown: by the
 * database when it can (analytics_all_time), else from every order here.
 */
async function allTimeOf(admin: Admin, creatorId: string) {
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
