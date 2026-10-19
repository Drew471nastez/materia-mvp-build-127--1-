import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { byCreator, ownRows, scopedOrders } from "@/lib/analytics/creator-orders"
import { inStoreCurrency } from "@/lib/money/report-currency-server"
import { breakdownOf, channelsOf, grainFor, seriesOf, type CommerceOrderRow } from "@/lib/analytics/commerce"

export const dynamic = "force-dynamic"

const COLUMNS =
  "id, amount_cents, tip_cents, tax_cents, tax_included, shipping_cents, unit_price_cents, quantity, status, refund_amount_cents, created_at, source, source_detail, stripe_session_id, buyer_email, currency"
const FALLBACK = "id, amount_cents, tip_cents, status, refund_amount_cents, created_at, source, source_detail, stripe_session_id, buyer_email, currency"
const PAGE = 1000
const CEILING = 50_000
const DAY = 86_400_000
/** The longest period a report covers: a little over two years. */
const MAX_SPAN = 800 * DAY

/**
 * THE STORE'S SALES REPORTS (app/app/analytics commerce-reports): the sales
 * breakdown, sales and average order value over time, sales by channel, the
 * returning customer rate and how long physical orders take to ship, for the
 * period asked and the one before it. Every amount in the store's currency.
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
  const previous = { start: start - length, end: start }

  const admin = createAdminClient()
  const { data: creator } = await admin.from("creators").select("id").eq("user_id", user.id).maybeSingle()
  if (!creator) return NextResponse.json({ error: "Creator not found" }, { status: 404 })
  const creatorId = (creator as { id: string }).id

  const read = async (columns: string): Promise<CommerceOrderRow[]> =>
    byCreator(async (scope) => {
      const rows: CommerceOrderRow[] = []
      for (let from = 0; rows.length < CEILING; from += PAGE) {
        const { data, error } = await scopedOrders(admin, columns, scope, creatorId, null)
          .gte("created_at", new Date(previous.start).toISOString())
          .lt("created_at", new Date(end).toISOString())
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
  try {
    raw = await read(COLUMNS)
  } catch (e) {
    if (!/column|42703|PGRST204/i.test((e as Error).message)) return NextResponse.json({ error: "Reports are not available right now." }, { status: 500 })
    raw = await read(FALLBACK)
  }
  const inStore = await inStoreCurrency(admin, creatorId, raw as never[])
  const rows = inStore.rows as unknown as CommerceOrderRow[]
  const inSpan = (r: CommerceOrderRow, s: { start: number; end: number }) => {
    const t = Date.parse(r.created_at)
    return t >= s.start && t < s.end
  }
  const now = rows.filter((r) => inSpan(r, { start, end }))
  const before = rows.filter((r) => inSpan(r, previous))
  const grain = grainFor({ start, end })

  /* How long a physical order waited to ship: payment to "shipped", on average, for orders shipped in the period. */
  let fulfillment: { hours: number | null; shipped: number } = { hours: null, shipped: 0 }
  try {
    const { data: shipped } = await admin
      .from("fulfillments")
      .select("checkout_id, shipped_at")
      .eq("creator_id", creatorId)
      .not("shipped_at", "is", null)
      .gte("shipped_at", new Date(start).toISOString())
      .lt("shipped_at", new Date(end).toISOString())
      .limit(1000)
    const list = (shipped ?? []) as Array<{ checkout_id: string; shipped_at: string }>
    if (list.length) {
      const ids = [...new Set(list.map((f) => f.checkout_id))]
      const { data: checkouts } = await admin.from("commerce_checkouts").select("id, created_at").in("id", ids)
      const placed = new Map(((checkouts ?? []) as Array<{ id: string; created_at: string }>).map((c) => [c.id, Date.parse(c.created_at)]))
      const waits = list.map((f) => Date.parse(f.shipped_at) - (placed.get(f.checkout_id) ?? NaN)).filter((w) => Number.isFinite(w) && w >= 0)
      fulfillment = { hours: waits.length ? waits.reduce((a, b) => a + b, 0) / waits.length / 3_600_000 : null, shipped: waits.length }
    }
  } catch {
    /* No physical commerce tables: no fulfillment figure. */
  }

  return NextResponse.json(
    {
      currency: inStore.currency,
      grain,
      breakdown: breakdownOf(now),
      previous: breakdownOf(before),
      series: seriesOf(now, { start, end }, grain),
      previousSeries: seriesOf(before, previous, grain),
      channels: channelsOf(now),
      fulfillment,
      unconverted: inStore.unconverted,
    },
    { headers: { "Cache-Control": "private, no-store" } },
  )
}
