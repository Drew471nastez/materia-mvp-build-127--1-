import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { byCreator, ownRows, scopedOrders } from "@/lib/analytics/creator-orders"
import { inStoreCurrency } from "@/lib/money/report-currency-server"
import { breakdownOf, channelsOf, commerceRowCounts, grainFor, seriesOf, type CommerceOrderRow } from "@/lib/analytics/commerce"
import { creatorProperties } from "@/lib/analytics/report-read"
import { isTimeZone } from "@/lib/orders/time-zone"
import { ownsProperty, parseProperty } from "@/lib/analytics/properties"

export const dynamic = "force-dynamic"

const COLUMNS =
  "id, amount_cents, tip_cents, tax_cents, tax_included, shipping_cents, unit_price_cents, quantity, status, refund_amount_cents, created_at, source, source_detail, stripe_session_id, buyer_email, currency, product_id, property_type, property_id, checkout_id"
const WITHOUT_CHECKOUT =
  "id, amount_cents, tip_cents, tax_cents, tax_included, shipping_cents, unit_price_cents, quantity, status, refund_amount_cents, created_at, source, source_detail, stripe_session_id, buyer_email, currency, product_id, property_type, property_id"
const WITH_PRODUCT =
  "id, amount_cents, tip_cents, tax_cents, tax_included, shipping_cents, unit_price_cents, quantity, status, refund_amount_cents, created_at, source, source_detail, stripe_session_id, buyer_email, currency, product_id"
const FALLBACK = "id, amount_cents, tip_cents, status, refund_amount_cents, created_at, source, source_detail, stripe_session_id, buyer_email, currency"
const PAGE = 1000
const CEILING = 50_000
const DAY = 86_400_000
/** The same ceiling as /api/analytics/reports, so All time is the same period on every card. */
const MAX_SPAN = 30 * 366 * DAY

/** An instant from the address: ms since 1970 or an ISO date. */
function instant(v: string | null): number | null {
  if (!v) return null
  const n = /^\d+$/.test(v) ? Number(v) : Date.parse(v)
  return Number.isFinite(n) ? n : null
}

/**
 * THE STORE'S SALES REPORTS (app/app/analytics commerce-reports): the sales
 * breakdown, sales and average order value over time, sales by channel, the
 * returning customer rate and how long physical orders take to ship, for the
 * period asked and the one it is compared with. Every amount in the store's
 * currency.
 *
 *   ?from=&to=           the period (ms)
 *   &cstart=&cend=       what it is compared with, the very instants the
 *                        chart above was asked for (lib/date-range/range
 *                        compareBounds): a running Today is compared with
 *                        yesterday until the same hour, not with the hours
 *                        just before it
 *   &compare=none        no comparison (All time, or the seller chose none)
 *   &tz=                 the seller's time zone: the chart's buckets start
 *                        at their midnight
 *   &product= &property= the same filters as every other figure, the
 *                        fulfilment time included
 */
export async function GET(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const url = new URL(request.url)
  const end = Math.min(Date.now() + DAY, Number(url.searchParams.get("to")) || Date.now())
  const start = Math.max(end - MAX_SPAN, Number(url.searchParams.get("from")) || end - 30 * DAY)
  if (!(end > start)) return NextResponse.json({ error: "Bad period" }, { status: 400 })
  const length = end - start
  const tzParam = url.searchParams.get("tz")
  const timeZone = isTimeZone(tzParam) ? tzParam : "UTC"
  const cs = instant(url.searchParams.get("cstart"))
  const ce = instant(url.searchParams.get("cend"))
  const compared = url.searchParams.get("compare") !== "none"
  /* No comparison is an empty stretch at the start: nothing is read for it and every "before" is zero. */
  const previous = !compared
    ? { start, end: start }
    : cs !== null && ce !== null && ce > cs && ce - cs <= MAX_SPAN
      ? { start: cs, end: ce }
      : { start: start - length, end: start }
  const readFrom = Math.min(previous.start, start)
  const readTo = Math.max(previous.end, end)

  const admin = createAdminClient()
  const { data: creator } = await admin.from("creators").select("id").eq("user_id", user.id).maybeSingle()
  if (!creator) return NextResponse.json({ error: "Creator not found" }, { status: 404 })
  const creatorId = (creator as { id: string }).id
  const selector = parseProperty(url.searchParams.get("property"))
  const properties = await creatorProperties(admin, creatorId, user.id)
  if (!ownsProperty(properties, selector)) return NextResponse.json({ error: "No such property" }, { status: 404 })
  const wanted = url.searchParams.get("product")
  let productId: string | null = null
  if (wanted && wanted !== "all") {
    const { data: product } = await admin.from("products").select("id").eq("id", wanted).eq("creator_id", creatorId).maybeSingle()
    if (product) productId = wanted
  }

  const read = async (columns: string): Promise<CommerceOrderRow[]> =>
    byCreator(async (scope) => {
      const rows: CommerceOrderRow[] = []
      for (let from = 0; rows.length < CEILING; from += PAGE) {
        const { data, error } = await scopedOrders(admin, columns, scope, creatorId, null)
          .gte("created_at", new Date(readFrom).toISOString())
          .lt("created_at", new Date(readTo).toISOString())
          .order("created_at", { ascending: true })
          .order("id", { ascending: true })
          .range(from, from + PAGE - 1)
        if (error) throw new Error(error.message)
        rows.push(...ownRows((data ?? []) as CommerceOrderRow[]))
        if (!data || data.length < PAGE) break
      }
      return rows
    })

  let raw: CommerceOrderRow[]
  let canProduct = true
  let canProperty = true
  try {
    raw = await read(COLUMNS).catch((e) => {
      if (/checkout_id/i.test((e as Error).message)) return read(WITHOUT_CHECKOUT)
      throw e
    })
  } catch (e) {
    if (!/column|42703|PGRST204/i.test((e as Error).message)) return NextResponse.json({ error: "Reports are not available right now." }, { status: 500 })
    try {
      raw = await read(WITH_PRODUCT)
      canProperty = false
    } catch (e2) {
      if (!/column|42703|PGRST204/i.test((e2 as Error).message)) return NextResponse.json({ error: "Reports are not available right now." }, { status: 500 })
      raw = await read(FALLBACK)
      canProduct = false
      canProperty = false
    }
  }
  raw = raw.filter((row) =>
    commerceRowCounts(row, {
      productId: canProduct ? productId : null,
      property: canProperty ? selector : { type: "all" },
      defaultWebsite: properties.defaultWebsite,
    }),
  )
  const inStore = await inStoreCurrency(admin, creatorId, raw as never[])
  const rows = inStore.rows as unknown as CommerceOrderRow[]
  const inSpan = (r: CommerceOrderRow, s: { start: number; end: number }) => {
    const t = Date.parse(r.created_at)
    return t >= s.start && t < s.end
  }
  const now = rows.filter((r) => inSpan(r, { start, end }))
  const before = rows.filter((r) => inSpan(r, previous))
  const grain = grainFor({ start, end })

  /*
    HOW LONG A PHYSICAL ORDER WAITED TO SHIP: payment to "shipped", on
    average, for the parcels shipped in the period, and in the one it is
    compared with. Only the orders the page is looking at: a product or a
    place chosen above keeps only the shipped orders with a line of that
    product, placed there (the same rule as every sale here).
  */
  const filtered = !!productId || (canProperty && selector.type !== "all")
  const fulfillmentIn = async (span: { start: number; end: number }): Promise<{ hours: number | null; shipped: number }> => {
    if (!(span.end > span.start)) return { hours: null, shipped: 0 }
    try {
      const { data: shipped } = await admin
        .from("fulfillments")
        .select("checkout_id, shipped_at")
        .eq("creator_id", creatorId)
        .not("shipped_at", "is", null)
        .gte("shipped_at", new Date(span.start).toISOString())
        .lt("shipped_at", new Date(span.end).toISOString())
        .limit(1000)
      let list = (shipped ?? []) as Array<{ checkout_id: string; shipped_at: string }>
      if (!list.length) return { hours: null, shipped: 0 }
      let ids = [...new Set(list.map((f) => f.checkout_id))]
      if (filtered) {
        const { data: lines } = await admin.from("orders").select("checkout_id, product_id, property_type, property_id, source, source_detail").in("checkout_id", ids)
        const keep = new Set(
          ((lines ?? []) as Array<CommerceOrderRow & { checkout_id: string }>)
            .filter((l) => commerceRowCounts({ ...l, id: "", created_at: "" }, { productId, property: canProperty ? selector : { type: "all" }, defaultWebsite: properties.defaultWebsite }))
            .map((l) => l.checkout_id),
        )
        ids = ids.filter((id) => keep.has(id))
        list = list.filter((f) => keep.has(f.checkout_id))
        if (!ids.length) return { hours: null, shipped: 0 }
      }
      const { data: checkouts } = await admin.from("commerce_checkouts").select("id, created_at").in("id", ids)
      const placed = new Map(((checkouts ?? []) as Array<{ id: string; created_at: string }>).map((c) => [c.id, Date.parse(c.created_at)]))
      const waits = list.map((f) => Date.parse(f.shipped_at) - (placed.get(f.checkout_id) ?? NaN)).filter((w) => Number.isFinite(w) && w >= 0)
      return { hours: waits.length ? waits.reduce((a, b) => a + b, 0) / waits.length / 3_600_000 : null, shipped: waits.length }
    } catch {
      /* No physical commerce tables: no fulfillment figure. */
      return { hours: null, shipped: 0 }
    }
  }
  const [fulfillment, fulfillmentBefore] = await Promise.all([fulfillmentIn({ start, end }), fulfillmentIn(previous)])

  return NextResponse.json(
    {
      currency: inStore.currency,
      grain,
      timeZone,
      viewer: user.id,
      compared,
      breakdown: breakdownOf(now),
      previous: breakdownOf(before),
      series: seriesOf(now, { start, end }, timeZone, grain),
      previousSeries: compared ? seriesOf(before, previous, timeZone, grain) : [],
      channels: channelsOf(now),
      fulfillment,
      fulfillmentBefore,
      unconverted: inStore.unconverted,
    },
    { headers: { "Cache-Control": "private, no-store" } },
  )
}
