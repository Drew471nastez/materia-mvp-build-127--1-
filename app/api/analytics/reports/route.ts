import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { getMainDomain } from "@/lib/url-helpers"
import { buildReports, previousWindow, type StepRow, type ViewRow } from "@/lib/analytics/reports"
import { isTimeZone } from "@/lib/orders/time-zone"
import type { OrderRow } from "@/lib/orders/order-view"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/**
 * The reports under the Analytics chart, for the signed-in creator only.
 *
 * ON THE SERVER, AND EVERY ROW. The page used to read events from the
 * browser, where a query returns at most 1,000 rows: a busy week simply
 * stopped counting at the thousandth view, without saying so. Here they are
 * read a page at a time up to a ceiling that is reported if it is ever hit,
 * and only the finished figures go to the browser, never the rows.
 *
 * WHO. The creator comes from the session, never from the request; a
 * product filter is honoured only for one of that creator's own products.
 */
const PAGE = 1000
const CEILING = 200_000
const MAX_SPAN_MS = 6 * 366 * 24 * 3_600_000

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

  const admin = createAdminClient()
  const { data: creator } = await admin.from("creators").select("id").eq("user_id", user.id).single()
  if (!creator) return NextResponse.json({ error: "Creator not found" }, { status: 404 })

  const { data: productsData } = await admin.from("products").select("id, title").eq("creator_id", creator.id)
  const products = productsData ?? []
  const productTitles = Object.fromEntries(products.map((p: { id: string; title: string }) => [p.id, p.title || "Untitled product"]))

  const wanted = url.searchParams.get("product")
  const product = wanted && wanted !== "all" && productTitles[wanted] ? wanted : null

  const span = { start, end }
  const from = new Date(previousWindow(span).start).toISOString()
  const to = new Date(end).toISOString()

  try {
    const views = await readAll<ViewRow>((a, b) => {
      let q = admin
        .from("analytics_events")
        .select(VIEW_COLUMNS)
        .eq("creator_id", creator.id)
        .eq("event_type", "view")
        .gte("created_at", from)
        .lt("created_at", to)
        .order("created_at", { ascending: true })
        .range(a, b)
      if (product) q = q.eq("product_id", product)
      return q as unknown as PromiseLike<{ data: ViewRow[] | null; error: { message: string } | null }>
    })

    const steps = await readAll<StepRow>((a, b) => {
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
      const read = await readAll<OrderRow>((a, b) =>
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
      timeZone,
      mainDomain: getMainDomain(),
      productTitles,
    })

    return NextResponse.json(
      { reports, truncated: views.truncated || steps.truncated },
      { headers: { "Cache-Control": "private, no-store" } },
    )
  } catch (error) {
    console.error("[analytics/reports]", (error as Error).message)
    return NextResponse.json({ error: "Could not read analytics" }, { status: 500 })
  }
}
