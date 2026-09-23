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
  type OnePageClickRow,
  type OnePageLeadRow,
  type OnePageViewRow,
  type Span,
  type StepRow,
  type ViewRow,
} from "@/lib/analytics/reports"
import { categorizeServerSource, detectClientAppFromUA, isInternalReferrer, referrerHost } from "@/lib/analytics/sources"
import { parseUserAgent } from "@/lib/analytics/user-agent"
import { isTimeZone } from "@/lib/orders/time-zone"
import { groupOrders, type OrderRow } from "@/lib/orders/order-view"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/**
 * The reports under the Analytics chart, and the chart's own numbers, for
 * the signed-in creator only.
 *
 * ON THE SERVER, AND EVERY ROW. The page used to read events from the
 * browser, where a query returns at most 1,000 rows: a busy week simply
 * stopped counting at the thousandth view, without saying so. Here they are
 * read a page at a time up to a ceiling that is reported if it is ever hit,
 * and only the finished figures go to the browser, never the rows.
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

const VIEW_COLUMNS =
  "id, session_id, visitor_id, product_id, created_at, source_category, referrer_domain, country_code, country_name, city, device_type, browser, os, page_url, utm_campaign"


async function readAll<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>) {
  const rows: T[] = []
  for (let from = 0; from < CEILING; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1)
    if (error) throw new Error(error.message)
    rows.push(...(data ?? []))
    if (!data || data.length < PAGE) return { rows, truncated: false }
  }
  return { rows, truncated: true }
}

/** Every row of every stretch, in order. */
async function readSpans<T>(spans: Span[], page: (from: string, to: string, a: number, b: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>) {
  let truncated = false
  const rows: T[] = []
  for (const s of spans) {
    const iso = [new Date(s.start).toISOString(), new Date(s.end).toISOString()]
    const read = await readAll<T>((a, b) => page(iso[0], iso[1], a, b))
    rows.push(...read.rows)
    truncated ||= read.truncated
  }
  return { rows, truncated }
}

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

  const admin = createAdminClient()

  if (url.searchParams.get("mode") === "onepage") return onePage(admin, user.id, span, previous, timeZone)

  const { data: creator } = await admin.from("creators").select("id").eq("user_id", user.id).single()
  if (!creator) return NextResponse.json({ error: "Creator not found" }, { status: 404 })

  const { data: productsData } = await admin.from("products").select("id, title").eq("creator_id", creator.id)
  const products = productsData ?? []
  const productTitles = Object.fromEntries(products.map((p: { id: string; title: string }) => [p.id, p.title || "Untitled product"]))

  const wanted = url.searchParams.get("product")
  const product = wanted && wanted !== "all" && productTitles[wanted] ? wanted : null

  const spans = spansToRead(span, previous)

  try {
    /*
      Named columns keep the read small; if the database is missing one of
      them (an older install), the same read is made with `*` rather than
      the report failing. A missing column must never read as "no visits".
    */
    let columns = VIEW_COLUMNS
    const probe = await admin.from("analytics_events").select(VIEW_COLUMNS).eq("creator_id", creator.id).limit(1)
    if (probe.error) {
      console.warn("[analytics/reports] falling back to every column:", probe.error.message)
      columns = "*"
    }
    const views = await readSpans<ViewRow>(spans, (from, to, a, b) => {
      let q = admin
        .from("analytics_events")
        .select(columns)
        .eq("creator_id", creator.id)
        .eq("event_type", "view")
        .gte("created_at", from)
        .lt("created_at", to)
        .order("created_at", { ascending: true })
        .range(a, b)
      if (product) q = q.eq("product_id", product)
      return q as unknown as PromiseLike<{ data: ViewRow[] | null; error: { message: string } | null }>
    })

    const steps = await readSpans<StepRow>(spans, (from, to, a, b) => {
      let q = admin
        .from("analytics_events")
        .select("event_type, session_id, visitor_id, product_id, created_at")
        .eq("creator_id", creator.id)
        .in("event_type", ["buy_click", "checkout_start"])
        .gte("created_at", from)
        .lt("created_at", to)
        .order("created_at", { ascending: true })
        .range(a, b)
      if (product) q = q.eq("product_id", product)
      return q as unknown as PromiseLike<{ data: StepRow[] | null; error: { message: string } | null }>
    })

    let orders: OrderRow[] = []
    const productIds = product ? [product] : products.map((p: { id: string }) => p.id)
    if (productIds.length > 0) {
      const read = await readSpans<OrderRow>(spans, (from, to, a, b) =>
        admin
          .from("orders")
          .select("*")
          .in("product_id", productIds)
          .gte("created_at", from)
          .lt("created_at", to)
          .order("created_at", { ascending: true })
          .range(a, b) as unknown as PromiseLike<{ data: OrderRow[] | null; error: { message: string } | null }>,
      )
      orders = read.rows
    }

    const reports = buildReports({
      views: views.rows,
      steps: steps.rows,
      orders,
      window: span,
      previous,
      timeZone,
      mainDomain: getMainDomain(),
      productTitles,
    })

    /*
      ALL TIME, under each figure on the chart's tabs. Counted here rather
      than in the browser, where "all time" was the first thousand rows.
    */
    const allTime = await (async () => {
      let viewsQuery = admin.from("analytics_events").select("id", { count: "exact", head: true }).eq("creator_id", creator.id).eq("event_type", "view")
      if (product) viewsQuery = viewsQuery.eq("product_id", product)
      const { count } = await viewsQuery
      let orderCount = 0
      let salesCents = 0
      if (productIds.length > 0) {
        const read = await readAll<OrderRow>((a, b) =>
          admin
            .from("orders")
            .select("*")
            .in("product_id", productIds)
            .order("created_at", { ascending: true })
            .range(a, b) as unknown as PromiseLike<{ data: OrderRow[] | null; error: { message: string } | null }>,
        )
        const counted = groupOrders(read.rows).filter((o) => o.payment !== "failed" && o.payment !== "pending")
        orderCount = counted.length
        salesCents = counted.reduce((sum, o) => sum + moneyOf(o).net, 0)
      }
      return { views: count ?? 0, orders: orderCount, salesCents }
    })()

    return NextResponse.json(
      { reports, allTime, truncated: views.truncated || steps.truncated },
      { headers: { "Cache-Control": "private, no-store" } },
    )
  } catch (error) {
    console.error("[analytics/reports]", (error as Error).message)
    return NextResponse.json({ error: "Could not read analytics" }, { status: 500 })
  }
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

async function onePage(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
  span: Span,
  previous: Span | null,
  timeZone: string,
) {
  /* The OnePage is found from the session's user, never from the request. */
  const { data: page } = await admin
    .from("onepages")
    .select("id, published_blocks, draft_blocks")
    .eq("owner_id", userId)
    .maybeSingle()

  const spans = spansToRead(span, previous)
  const read = <T,>(table: string) =>
    readSpans<T>(spans, (from, to, a, b) =>
      admin
        .from(table)
        .select("*")
        .eq("onepage_id", page!.id)
        .gte("created_at", from)
        .lt("created_at", to)
        .order("created_at", { ascending: true })
        .range(a, b) as unknown as PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
    )
  const countAll = async (table: string) => {
    const { count } = await admin.from(table).select("*", { count: "exact", head: true }).eq("onepage_id", page!.id)
    return count ?? 0
  }

  try {
    const [views, clicks, leads] = page?.id
      ? await Promise.all([read<OnePageViewRow>("onepage_views"), read<OnePageClickRow>("onepage_clicks"), read<OnePageLeadRow>("onepage_leads")])
      : [{ rows: [], truncated: false }, { rows: [], truncated: false }, { rows: [], truncated: false }]
    const [allViews, allClicks, allLeads] = page?.id
      ? await Promise.all([countAll("onepage_views"), countAll("onepage_clicks"), countAll("onepage_leads")])
      : [0, 0, 0]

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
    return NextResponse.json(
      {
        reports,
        allTime: { views: allViews, clicks: allClicks, subscribers: allLeads },
        truncated: views.truncated || clicks.truncated || leads.truncated,
        hasPage: !!page?.id,
      },
      { headers: { "Cache-Control": "private, no-store" } },
    )
  } catch (error) {
    console.error("[analytics/reports onepage]", (error as Error).message)
    return NextResponse.json({ error: "Could not read analytics" }, { status: 500 })
  }
}
