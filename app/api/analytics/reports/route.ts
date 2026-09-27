import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { getMainDomain } from "@/lib/url-helpers"
import {
  buildOnePageReports,
  buildReports,
  moneyOf,
  previousWindow,
  spansToRead,
  talliesFromWire,
  tallyArgs,
  tallyVisits,
  type OnePageClickRow,
  type OnePageLeadRow,
  type OnePageViewRow,
  type Span,
  type StepRow,
  type ViewRow,
  type VisitTallies,
} from "@/lib/analytics/reports"
import { categorizeServerSource, detectClientAppFromUA, isInternalReferrer, referrerHost } from "@/lib/analytics/sources"
import { parseUserAgent } from "@/lib/analytics/user-agent"
import { isTimeZone } from "@/lib/orders/time-zone"
import { groupOrders, isSale, type OrderRow } from "@/lib/orders/order-view"
import { byCreator, ownRows, scopedOrders } from "@/lib/analytics/creator-orders"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/**
 * The reports under the Analytics chart, and the chart's own numbers, for
 * the signed-in creator only.
 *
 * ON THE SERVER, FROM EVERY ROW. The page used to read events from the
 * browser, where a query returns at most 1,000 rows: a busy week simply
 * stopped counting at the thousandth view, without saying so. Only the
 * finished figures go to the browser, never the rows.
 *
 * COUNTED WHERE THE ROWS ARE. analytics_visit_tally (supabase/migrations/
 * 20261002_analytics_report_speed.sql) counts the views and steps inside
 * Postgres by the rules of lib/analytics/reports.ts and answers with a few
 * hundred numbers; analytics_all_time counts the line under each figure.
 * This used to be every row of the period and the one before, 1,000 a page,
 * one page after another, each page's OFFSET walking every row before it
 * again: sixty-odd round trips and megabytes of rows for a busy month, and
 * seconds before the first number. Until the functions exist the rows are
 * read as before, a page at a time, but the reads side by side and each
 * page starting where the last ended (readAll), and counted in Node.
 *
 * FIGURES FIRST. With `stream=1` the answer is lines of JSON: the figures
 * (every tab, the chart and the order cards) as soon as they are counted,
 * then everything, the visit lists and the funnel included. Without it, one
 * answer, as before, so a page still open from before a deploy reads it.
 *
 * ASKED TWICE IN A FEW SECONDS, COUNTED ONCE. A prefetch and the page it
 * warmed, two tabs, a quick return: the same question from the same person
 * within CACHE_MS is answered from memory, and one already being counted is
 * waited for rather than started again. The key is the person and the whole
 * question, so nobody is ever answered with somebody else's figures, and
 * nothing is kept longer than CACHE_MS: a new sale is on the page within
 * seconds, and the page asks again every minute.
 *
 * WHO. The creator comes from the session, never from the request; a
 * product filter is honoured only for one of that creator's own products.
 *
 * WHAT IT IS COMPARED WITH comes from the page's comparison picker as
 * `cstart` and `cend`, or `compare=none`. Without either it is the same
 * length of time just before.
 */
const PAGE = 1000
const CEILING = 200_000
/* Long enough for "All time" from 2020 and years past it; the reads stop at
   CEILING rows however long the period is. At six years "All time" was
   refused outright and the whole page showed its failed state. */
const MAX_SPAN_MS = 30 * 366 * 24 * 3_600_000
/* How long an answer is reused for the same question from the same person. */
const CACHE_MS = 15_000

const VIEW_COLUMNS =
  "id, session_id, visitor_id, product_id, created_at, source_category, referrer_domain, country_code, country_name, city, device_type, browser, os, page_url, utm_campaign, property_type"

/**
 * THE ONEPAGE IS COUNTED ONCE. Its views are analytics events too now
 * (property onepage, lib/analytics/collect), but this Storelib view has never
 * counted them: the OnePage view reads onepage_views. So they are left out
 * here, as the database's own count leaves them out (part 54's
 * analytics_visit_tally), and a OnePage visit is counted once, in the OnePage
 * view, as before. docs/analytics/events.md, "Legacy and new rows".
 */
const notOnePage = (row: { property_type?: string | null }) => row.property_type !== "onepage"
/* What the figures read of an order (lib/orders/order-view, reports.ts moneyOf). */
const ORDER_COLUMNS =
  "id, product_id, amount_cents, tip_cents, status, created_at, stripe_session_id, refund_amount_cents, source, buyer_country_code, buyer_country"

type Admin = ReturnType<typeof createAdminClient>
type Read<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>
type After = { t: string; id: string } | null
type Answer = Record<string, unknown>

/**
 * EVERY ROW, A PAGE AT A TIME, EACH PAGE WHERE THE LAST ENDED. Every read is
 * sorted by `created_at` and then by `id`: rows written in the same
 * millisecond have no order of their own, and a row at the edge of a page
 * could otherwise be read twice or not at all. The next page is asked for as
 * "from this time, past this id" (a keyset), never "skip the first n": an
 * OFFSET makes Postgres walk every row before it again, so page fifty cost
 * fifty pages.
 */
async function readAll<T extends { created_at: string; id?: string }>(page: (after: After) => Read<T>) {
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
function startingAt<Q extends KeysetQuery<Q>>(q: Q, start: string, after: After): Q {
  if (!after) return q.gte("created_at", start)
  return q.gte("created_at", after.t).or(`created_at.gt."${after.t}",id.gt.${after.id}`)
}

/** Every row of every stretch, in order; the stretches are read side by side. */
async function readSpans<T extends { created_at: string; id?: string }>(spans: Span[], page: (start: string, end: string, after: After) => Read<T>) {
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
async function withColumns<T>(columns: string, read: (columns: string) => Promise<T>): Promise<T> {
  try {
    return await read(columns)
  } catch (error) {
    if (!/column|PGRST204/i.test((error as Error).message)) throw error
    console.warn("[analytics/reports] falling back to every column:", (error as Error).message)
    return read("*")
  }
}

/* ─── The database's own counting, once it is there ───────────────────── */

/* Until the owner has run the SQL the functions are missing; that is
   remembered for a while, so each request does not ask first. */
let functionsMissingUntil = 0

async function rpc<T>(admin: Admin, fn: string, args: Record<string, unknown>): Promise<T | null> {
  if (Date.now() < functionsMissingUntil) return null
  const { data, error } = await admin.rpc(fn, args)
  if (!error && data) return data as T
  if (error && (error.code === "PGRST202" || error.code === "42883" || /could not find the function/i.test(error.message ?? ""))) {
    functionsMissingUntil = Date.now() + 5 * 60_000
  } else if (error) {
    /* Anything else (a zone Postgres does not know, a timeout): counted in
       Node from the rows, so the page still gets its figures. */
    console.warn(`[analytics/reports] ${fn} failed, counting in Node:`, error.message)
  }
  return null
}

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

  /* Who asks, and the whole question. */
  const question = new URLSearchParams(url.searchParams)
  question.delete("stream")
  question.sort()
  const key = `${user.id}|${question}`
  const known = remembered(key)
  if (known) return stream ? streamed(Promise.resolve(null), Promise.resolve(known)) : NextResponse.json(known, { headers: HEADERS })

  const admin = createAdminClient()

  if (url.searchParams.get("mode") === "onepage") {
    const all = once(key, async () => ({ ...(await onePage(admin, user.id, span, previous, timeZone)), viewer: user.id }))
    return stream ? streamed(Promise.resolve(null), all) : answered(all, "[analytics/reports onepage]")
  }

  /* The creator and their products in one round trip, found from the session's user. */
  const joined = await admin.from("creators").select("id, products(id, title)").eq("user_id", user.id).maybeSingle()
  let creator = joined.data as { id: string; products?: Array<{ id: string; title: string }> } | null
  let products = creator?.products ?? []
  if (joined.error || (creator && !Array.isArray(creator.products))) {
    /* The two not joined on this install: two reads, as before. */
    const { data } = await admin.from("creators").select("id").eq("user_id", user.id).single()
    creator = data
    if (creator) products = (await admin.from("products").select("id, title").eq("creator_id", creator.id)).data ?? []
  }
  if (!creator) return NextResponse.json({ error: "Creator not found" }, { status: 404 })
  const productTitles = Object.fromEntries(products.map((p) => [p.id, p.title || "Untitled product"]))

  const wanted = url.searchParams.get("product")
  const product = wanted && wanted !== "all" && productTitles[wanted] ? wanted : null

  const { figures, all } = storeAnswer(admin, key, {
    creatorId: creator.id,
    product,
    productTitles,
    span,
    previous,
    timeZone,
    figuresFirst: stream,
    viewer: user.id,
  })
  return stream ? streamed(figures, all) : answered(all, "[analytics/reports]")
}

/**
 * The store's answer. Everything is asked for at once: the orders, the all
 * time line, and the visits (counted by the database, or read and counted
 * here). With `figuresFirst`, the database is also asked for the figures
 * alone, which it counts without the lists, so the tabs and the chart need
 * not wait for them.
 */
function storeAnswer(
  admin: Admin,
  key: string,
  q: {
    creatorId: string
    product: string | null
    productTitles: Record<string, string>
    span: Span
    previous: Span | null
    timeZone: string
    figuresFirst: boolean
    /** Who it is counted for: the page shows a kept answer only to them (lib/analytics/report-cache). */
    viewer: string
  },
): { figures: Promise<Answer | null>; all: Promise<Answer> } {
  let figures: Promise<Answer | null> = Promise.resolve(null)
  const all = once(key, async () => {
    const spans = spansToRead(q.span, q.previous)
    const base = { window: q.span, previous: q.previous, timeZone: q.timeZone, mainDomain: getMainDomain(), productTitles: q.productTitles }
    const args = { p_creator_id: q.creatorId, p_product_id: q.product, ...tallyArgs(q.span, q.previous, q.timeZone) }

    const orders = readOrders(admin, spans, q.creatorId, q.product)
    const allTime = allTimeOf(admin, q.creatorId, q.product)
    const visits = (async (): Promise<{ visits: VisitTallies; truncated: boolean }> => {
      const wire = await rpc<Parameters<typeof talliesFromWire>[0]>(admin, "analytics_visit_tally", { ...args, p_detail: true })
      if (wire) return { visits: talliesFromWire(wire, true), truncated: false }
      const [views, steps] = await Promise.all([readViews(admin, spans, q.creatorId, q.product), readSteps(admin, spans, q.creatorId, q.product)])
      return { visits: tallyVisits({ views: views.rows, steps: steps.rows, window: q.span, previous: q.previous, timeZone: q.timeZone }), truncated: views.truncated || steps.truncated }
    })()
    /* Nothing is left unhandled while the others are awaited. */
    for (const p of [orders, allTime, visits]) p.catch(() => {})

    if (q.figuresFirst) {
      figures = rpc<Parameters<typeof talliesFromWire>[0]>(admin, "analytics_visit_tally", { ...args, p_detail: false })
        .then(async (wire) => {
          if (!wire) return null
          const [o, a] = await Promise.all([orders, allTime])
          return { reports: buildReports({ ...base, visits: talliesFromWire(wire, false), orders: o }), allTime: a, truncated: false }
        })
        .catch(() => null)
    }

    const [v, o, a] = await Promise.all([visits, orders, allTime])
    return { reports: buildReports({ ...base, visits: v.visits, orders: o }), allTime: a, truncated: v.truncated, viewer: q.viewer }
  })
  return { figures, all }
}

/* ─── The rows, while the database cannot count them itself ───────────── */

async function readViews(admin: Admin, spans: Span[], creatorId: string, product: string | null) {
  const read = await withColumns(VIEW_COLUMNS, (columns) =>
    readSpans<ViewRow & { id: string; property_type?: string | null }>(spans, (start, end, after) => {
      let q = admin.from("analytics_events").select(columns).eq("creator_id", creatorId).eq("event_type", "view").lt("created_at", end)
      if (product) q = q.eq("product_id", product)
      return startingAt(q, start, after)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .limit(PAGE) as unknown as Read<ViewRow & { id: string; property_type?: string | null }>
    }),
  )
  /* Filtered after the read, so a page edge is still where the keyset left it. */
  return { rows: read.rows.filter(notOnePage), truncated: read.truncated }
}

async function readSteps(admin: Admin, spans: Span[], creatorId: string, product: string | null) {
  const read = await readSpans<StepRow & { id: string }>(spans, (start, end, after) => {
    let q = admin
      .from("analytics_events")
      .select("id, event_type, session_id, visitor_id, product_id, created_at")
      .eq("creator_id", creatorId)
      .in("event_type", ["buy_click", "checkout_start"])
      .lt("created_at", end)
    if (product) q = q.eq("product_id", product)
    return startingAt(q, start, after)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .limit(PAGE) as unknown as Read<StepRow & { id: string }>
  })
  /* The id only says where a page starts: a step with neither a session nor
     a visitor is keyed by its time (reports.ts sessionKey), as it always was. */
  return { rows: read.rows.map(({ id: _id, ...step }) => step as StepRow), truncated: read.truncated }
}

/* The creator's orders by the order's own creator, never by a list of product ids (lib/analytics/creator-orders). */
function readOrders(admin: Admin, spans: Span[], creatorId: string, product: string | null): Promise<OrderRow[]> {
  return byCreator((scope) =>
    withColumns(ORDER_COLUMNS, async (columns) => {
      const read = await readSpans<OrderRow>(spans, (start, end, after) =>
        startingAt(scopedOrders(admin, columns, scope, creatorId, product).lt("created_at", end), start, after)
          .order("created_at", { ascending: true })
          .order("id", { ascending: true })
          .limit(PAGE) as unknown as Read<OrderRow>,
      )
      return ownRows(read.rows)
    }),
  )
}

/**
 * ALL TIME, under each figure on the chart's tabs. Counted on the server
 * rather than in the browser, where "all time" was the first thousand rows:
 * by the database when it can (analytics_all_time), else from the rows here.
 */
async function allTimeOf(admin: Admin, creatorId: string, product: string | null) {
  const counted = await rpc<{ views: number; orders: number; sales_cents: number }>(admin, "analytics_all_time", {
    p_creator_id: creatorId,
    p_product_id: product,
  })
  if (counted) return { views: Number(counted.views) || 0, orders: Number(counted.orders) || 0, salesCents: Number(counted.sales_cents) || 0 }

  const countViews = (withoutOnePage: boolean) => {
    let q = admin.from("analytics_events").select("id", { count: "exact", head: true }).eq("creator_id", creatorId).eq("event_type", "view")
    if (withoutOnePage) q = q.or("property_type.is.null,property_type.neq.onepage")
    if (product) q = q.eq("product_id", product)
    return q
  }
  /* Before part 54 there is no property_type, and no OnePage row to leave out. */
  const viewsQuery = countViews(true).then((r) => (r.error ? countViews(false) : r))
  const everyOrder = byCreator((scope) =>
    withColumns(ORDER_COLUMNS, async (columns) =>
      ownRows(
        (
          await readAll<OrderRow>((after) =>
            startingAt(scopedOrders(admin, columns, scope, creatorId, product), "1970-01-01T00:00:00.000Z", after)
              .order("created_at", { ascending: true })
              .order("id", { ascending: true })
              .limit(PAGE) as unknown as Read<OrderRow>,
          )
        ).rows,
      ),
    ),
  )
  const [{ count }, rows] = await Promise.all([viewsQuery, everyOrder])
  const sales = groupOrders(rows).filter(isSale)
  return { views: count ?? 0, orders: sales.length, salesCents: sales.reduce((sum, o) => sum + moneyOf(o).net, 0) }
}

/* ─── OnePage ──────────────────────────────────────────────────────────── */

type Block = { id?: string; type?: string; data?: Record<string, unknown> }

/** What a creator called a block, so "Top links" reads as their page does. */
function blockLabel(block: Block): string | null {
  const d = (block.data ?? {}) as Record<string, unknown>
  const pick = (...keys: string[]) => keys.map((k) => d[k]).find((v) => typeof v === "string" && v.trim()) as string | undefined
  return (
    pick("label", "title", "product_title", "headline", "digital_product_title", "spotify_title", "apple_music_title", "soundcloud_title", "name") ??
    null
  )
}

/* What the OnePage reports read of each table (buildOnePageReports), and the id a page starts after. */
const ONEPAGE_COLUMNS: Record<string, string> = {
  onepage_views: "id, visitor_id, referrer, user_agent, country_code, country_name, created_at",
  onepage_clicks: "id, block_id, url, visitor_id, created_at",
  onepage_leads: "id, created_at",
}

async function onePage(admin: Admin, userId: string, span: Span, previous: Span | null, timeZone: string): Promise<Answer> {
  /* The OnePage is found from the session's user, never from the request. */
  const { data: page } = await admin
    .from("onepages")
    .select("id, published_blocks, draft_blocks")
    .eq("owner_id", userId)
    .maybeSingle()

  const spans = spansToRead(span, previous)
  const read = <T extends { created_at: string; id?: string }>(table: string) =>
    withColumns(ONEPAGE_COLUMNS[table], (columns) =>
      readSpans<T>(spans, (start, end, after) =>
        startingAt(admin.from(table).select(columns).eq("onepage_id", page!.id).lt("created_at", end), start, after)
          .order("created_at", { ascending: true })
          .order("id", { ascending: true })
          .limit(PAGE) as unknown as Read<T>,
      ),
    )
  const countAll = async (table: string) => {
    const { count } = await admin.from(table).select("*", { count: "exact", head: true }).eq("onepage_id", page!.id)
    return count ?? 0
  }

  /* The rows and the all time counts, all asked for at once. */
  const none = { rows: [], truncated: false }
  const [views, clicks, leads, allViews, allClicks, allLeads] = page?.id
    ? await Promise.all([
        read<OnePageViewRow>("onepage_views"),
        read<OnePageClickRow & { id?: string }>("onepage_clicks"),
        read<OnePageLeadRow & { id?: string }>("onepage_leads"),
        countAll("onepage_views"),
        countAll("onepage_clicks"),
        countAll("onepage_leads"),
      ])
    : [none, none, none, 0, 0, 0]

  const blocks = ((page?.published_blocks as Block[] | null) || (page?.draft_blocks as Block[] | null) || []) as Block[]
  const linkLabels: Record<string, string> = {}
  for (const b of blocks) {
    const label = b?.id ? blockLabel(b) : null
    if (b?.id && label) linkLabels[b.id] = label
  }

  const reports = buildOnePageReports({
    views: views.rows,
    clicks: clicks.rows,
    leads: leads.rows,
    window: span,
    previous,
    timeZone,
    mainDomain: getMainDomain(),
    linkLabels,
    /* Storelib itself and the payment pages are where a visitor just was,
       not where the visit came from: direct, as the Referrers card has it. */
    categorize: (host, ua) =>
      categorizeServerSource(host && !isInternalReferrer(host, getMainDomain()) ? host : "Direct", null, null, detectClientAppFromUA(ua)),
    parseAgent: parseUserAgent,
    hostOf: referrerHost,
  })
  return {
    reports,
    allTime: { views: allViews, clicks: allClicks, subscribers: allLeads },
    truncated: views.truncated || clicks.truncated || leads.truncated,
    hasPage: !!page?.id,
  }
}
