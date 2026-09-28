/**
 * ===========================================================================
 *  WHAT THE REVIEW OF THE ANALYTICS SYSTEM FOUND, HELD
 * ===========================================================================
 * Before the analytics system shipped it was read against the Orders page,
 * the calendar and the live store. Each block here failed on the code as it
 * was, and pins what was fixed:
 *
 *   ONE SALE, THE SAME MONEY ON EVERY PAGE. The Orders page, Analytics (All)
 *   and Home give the same orders and the same revenue, to the cent, for the
 *   same period and time zone: refunds in full and in part, disputes, free
 *   orders, failed and unfinished payments, baskets, old orders that carry
 *   no attribution, and a basket whose lines were written either side of the
 *   period's edge (the reports read only inside the period and split it).
 *
 *   A DAY IS THE ZONE'S DAY, ALSO WHEN THE CLOCKS CHANGE. startOfDay took the
 *   clock's time since midnight off an instant, which is an hour wrong on the
 *   two days a year the clocks move: Los Angeles' 1 November 2026 began at
 *   1 am in every daily chart (Orders, Analytics, Home).
 *
 *   A YEAR IS QUICK THE DAY AFTER. The daily cron rolls up every day of the
 *   window it has not rolled up yet, not sixty a night.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { FakeSupabase, type Row } from "./fake-supabase"
import { readOrders } from "../lib/analytics/report-read"
import { buildReports, spansToRead } from "../lib/analytics/reports"
import { bucketStarts } from "../lib/analytics/buckets"
import { homeFromReports } from "../lib/analytics/home-figures"
import { groupOrders, startOfDay, type OrderRow } from "../lib/orders/order-view"
import { readMetrics } from "../lib/orders/metrics"
import { readCreatorOrders, toOrderRow } from "../lib/orders/load-rows"
import { midnightOf } from "../lib/date-range/range"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; failures.push(label); console.log(`  FAIL  ${label}${detail !== undefined ? ` (${JSON.stringify(detail).slice(0, 600)})` : ""}`) }
}

const CREATOR = "c1000000-0000-4000-8000-000000000001"
const P1 = "c1000000-1111-4000-8000-000000000001"
const P2 = "c1000000-1111-4000-8000-000000000002"
const TZ = "America/Los_Angeles"
const HOUR = 3_600_000

async function main() {
  console.log("\nOne sale, the same money on the Orders page, Analytics and Home")
  {
    /* September 2026 in Los Angeles, against August. */
    const window = { start: midnightOf("2026-09-01", TZ), end: midnightOf("2026-10-01", TZ) }
    const previous = { start: midnightOf("2026-08-01", TZ), end: midnightOf("2026-09-01", TZ) }
    const iso = (ms: number) => new Date(ms).toISOString()
    let n = 0
    const row = (at: number, over: Partial<Row> = {}): Row => ({
      id: `c1000000-2222-4000-8000-${String(++n).padStart(12, "0")}`,
      creator_id: CREATOR,
      product_id: P1,
      amount_cents: 2500,
      tip_cents: 0,
      status: "completed",
      created_at: iso(at),
      stripe_session_id: `cs_${n}`,
      refund_amount_cents: null,
      refunded_at: null,
      source: null,
      source_detail: null,
      buyer_email: `b${n}@x.test`,
      ...over,
    })
    const mid = window.start + 10 * 24 * HOUR
    const rows: Row[] = [
      row(mid),
      row(mid + HOUR, { amount_cents: 4000, tip_cents: 500 }),
      /* refunded in full, then in part */
      row(mid + 2 * HOUR, { status: "refunded", refunded_at: iso(mid + 30 * HOUR) }),
      row(mid + 3 * HOUR, { status: "refunded", refund_amount_cents: 700, refunded_at: iso(mid + 30 * HOUR) }),
      /* disputed, failed, unfinished: no sale */
      row(mid + 4 * HOUR, { status: "disputed" }),
      row(mid + 5 * HOUR, { status: "failed" }),
      row(mid + 6 * HOUR, { status: "pending" }),
      /* no status recorded: the Orders page reads it as unfinished */
      row(mid + 6.5 * HOUR, { status: null }),
      /* free */
      row(mid + 7 * HOUR, { amount_cents: 0 }),
      /* a basket of three lines, one refunded in part */
      row(mid + 8 * HOUR, { stripe_session_id: "cs_basket", source: "website" }),
      row(mid + 8 * HOUR + 40, { stripe_session_id: "cs_basket", product_id: P2, amount_cents: 1200 }),
      row(mid + 8 * HOUR + 90, { stripe_session_id: "cs_basket", product_id: P2, amount_cents: 800, status: "refunded", refund_amount_cents: 300 }),
      /* old orders with no attribution, one from a OnePage */
      row(mid + 9 * HOUR, { source: "storelib", source_detail: { surface: "onepage" } }),
      row(mid + 10 * HOUR, { source: "storelib" }),
      /* a basket written across the end of the period: its first line on 30 September, its second on 1 October */
      row(window.end - 150, { stripe_session_id: "cs_edge_end", source: "website", amount_cents: 1500 }),
      row(window.end + 250, { stripe_session_id: "cs_edge_end", product_id: P2, amount_cents: 900 }),
      /* and one across the start: its first line on 31 August, in the comparison, its second on 1 September */
      row(window.start - 100, { stripe_session_id: "cs_edge_start", source: "website", amount_cents: 1100 }),
      row(window.start + 300, { stripe_session_id: "cs_edge_start", product_id: P2, amount_cents: 600 }),
      /* August, for the comparison */
      row(previous.start + 5 * 24 * HOUR, { amount_cents: 999 }),
      row(previous.start + 6 * 24 * HOUR, { status: "refunded", refund_amount_cents: 99, amount_cents: 999 }),
    ]

    /* The Orders page: every row the creator has, as lib/orders/load-rows reads it, and its five figures. */
    const ordersPage = groupOrders(rows.map((r) => toOrderRow(r, undefined)))
    const metrics = readMetrics(ordersPage, window, previous, TZ)
    const pageSales = metrics.find((m) => m.key === "sales")!
    const pageOrders = metrics.find((m) => m.key === "orders")!

    /* Analytics (All): the orders as its route reads them, then its figures; Home is Analytics' answer. */
    const db = new FakeSupabase()
    db.table("orders", {}, rows)
    const read = await readOrders(db as never, spansToRead(window, previous), CREATOR, null)
    const reports = buildReports({ orders: read.rows as OrderRow[], window, previous, timeZone: TZ, mainDomain: "storelib.com", productTitles: {} })
    const home = homeFromReports(reports)

    check(`Orders: the Orders page says ${pageOrders.value}, Analytics ${reports.orders.value}, Home ${home.periodOrders}`,
      pageOrders.value === reports.orders.value && reports.orders.value === home.periodOrders, [pageOrders.value, reports.orders.value, home.periodOrders])
    check(`Revenue: the Orders page says ${pageSales.value} cents, Analytics ${reports.sales.value}, Home ${home.periodRevenue}`,
      pageSales.value === reports.sales.value && reports.sales.value === home.periodRevenue, [pageSales.value, reports.sales.value, home.periodRevenue])
    check("  and the period before: the same orders and the same money", pageOrders.previous === reports.orders.previous && pageSales.previous === reports.sales.previous,
      { orders: [pageOrders.previous, reports.orders.previous], sales: [pageSales.previous, reports.sales.previous] })
    const pageSeries = pageSales.series
    check("  day by day as well", JSON.stringify(pageSeries) === JSON.stringify(reports.sales.series.current), { page: pageSeries, analytics: reports.sales.series.current })
    /* By hand: the two paid orders, the one refunded in part, the free one, the basket less its refund, the two old ones, and the basket across the end whole. The basket across the start is August's, where its first line is. */
    const want = 2500 + 4000 + (2500 - 700) + 0 + (2500 + 1200 + 800 - 300) + 2500 + 2500 + (1500 + 900)
    check(`  ${want} cents by hand: the basket across the end whole, the one across the start in August`, reports.sales.value === want, reports.sales.value)
  }

  console.log("\nA day is the zone's own day, also when the clocks change")
  {
    const fallBack = midnightOf("2026-11-01", TZ)
    check("Los Angeles' 1 November 2026 begins at 07:00 UTC, still summer time", new Date(fallBack).toISOString() === "2026-11-01T07:00:00.000Z", new Date(fallBack).toISOString())
    check("  an instant at 1:30 the second time is on that day", startOfDay(Date.parse("2026-11-01T09:30:00Z"), TZ) === fallBack, new Date(startOfDay(Date.parse("2026-11-01T09:30:00Z"), TZ)).toISOString())
    const spring = midnightOf("2026-03-08", TZ)
    check("  and on 8 March, the day of 23 hours, 3:30 in the morning is on that day", startOfDay(Date.parse("2026-03-08T10:30:00Z"), TZ) === spring, new Date(startOfDay(Date.parse("2026-03-08T10:30:00Z"), TZ)).toISOString())
    const w = { start: midnightOf("2026-10-30", TZ), end: midnightOf("2026-11-04", TZ) }
    const starts = bucketStarts(w, "day", TZ)
    const want = ["2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02", "2026-11-03"].map((d) => midnightOf(d, TZ))
    check("the chart's days start at each of the zone's midnights across the change", JSON.stringify(starts) === JSON.stringify(want), starts.map((s) => new Date(s).toISOString()))
    const march = bucketStarts({ start: midnightOf("2026-03-06", TZ), end: midnightOf("2026-03-11", TZ) }, "day", TZ)
    check("  and across the spring change", JSON.stringify(march) === JSON.stringify(["2026-03-06", "2026-03-07", "2026-03-08", "2026-03-09", "2026-03-10"].map((d) => midnightOf(d, TZ))), march.map((s) => new Date(s).toISOString()))
    const nepal = bucketStarts({ start: midnightOf("2026-11-01", "Asia/Kathmandu"), end: midnightOf("2026-11-04", "Asia/Kathmandu") }, "day", "Asia/Kathmandu")
    check("  and in Kathmandu, 5:45 ahead of UTC", nepal.length === 3 && new Date(nepal[0]).toISOString() === "2026-10-31T18:15:00.000Z", nepal.map((s) => new Date(s).toISOString()))
    const berlin = bucketStarts({ start: midnightOf("2026-10-24", "Europe/Berlin"), end: midnightOf("2026-10-27", "Europe/Berlin") }, "day", "Europe/Berlin")
    check("  and in Berlin on its own change, 25 October", JSON.stringify(berlin) === JSON.stringify(["2026-10-24", "2026-10-25", "2026-10-26"].map((d) => midnightOf(d, "Europe/Berlin"))), berlin.map((s) => new Date(s).toISOString()))
  }

  console.log("\nThe first night after part 61 rolls up the whole year")
  {
    /*
      Until a day is rolled up, a long period counts it from the raw events:
      a year of a store with 750k page views was 19 s of lists, against
      0.7 s rolled up, and rolling up a day takes about 50 ms. The cron filled
      sixty days a night, a year in a week; it fills every missing day now,
      within a budget inside its own maxDuration.
    */
    const cron = readFileSync(join(process.cwd(), "app/api/cron/rollup-daily/route.ts"), "utf8")
    const num = (name: string): number => {
      const m = new RegExp(`const ${name} = ([A-Z_0-9]+|[\\d_]+)`).exec(cron)
      if (!m) return NaN
      return /^[\d_]+$/.test(m[1]) ? Number(m[1].replace(/_/g, "")) : num(m[1])
    }
    const maxDuration = Number(/export const maxDuration = (\d+)/.exec(cron)?.[1])
    check("every missing day of the window, not sixty", num("BACKFILL_PER_RUN") === num("BACKFILL_WINDOW_DAYS") && num("BACKFILL_WINDOW_DAYS") >= 366, [num("BACKFILL_PER_RUN"), num("BACKFILL_WINDOW_DAYS")])
    check("  within a budget that ends before the function's own limit", maxDuration >= 60 && num("BACKFILL_BUDGET_MS") < maxDuration * 1000 && num("BACKFILL_BUDGET_MS") >= 60_000, [num("BACKFILL_BUDGET_MS"), maxDuration])
    check("  one day a call, so a run stopped by the budget keeps what it did", /for \(const date of backfill\) \{\s*if \(Date\.now\(\) - started > BACKFILL_BUDGET_MS\) break\s*const property = await admin\.rpc\(ROLLUP\.refresh, \{ p_day: date \}\)/.test(cron))
  }

  console.log("\nOnly the server writes a page view")
  {
    /*
      Old scripts left "Allow insert analytics" on analytics_events with an
      INSERT grant to anon: anyone holding the public key could write rows
      straight into a creator's counts, past every rule the collector applies
      (bots, refreshes, the owner, a property that is not theirs). Every
      writer in the app goes through the service key (the track routes, the
      OnePage route, checkout, account deletion), so part 61 closes the door
      and the check after says so.
    */
    const part = readFileSync(join(process.cwd(), "supabase/sql/run-now/61_analytics_one_pipeline.sql"), "utf8")
    const after = readFileSync(join(process.cwd(), "supabase/sql/run-now/99_check_after.sql"), "utf8")
    check("part 61 drops the open insert policy", /^DROP POLICY IF EXISTS "Allow insert analytics" ON public\.analytics_events;$/m.test(part))
    check("  and takes writing away from anon and a signed in user", /^REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public\.analytics_events FROM anon, authenticated;$/m.test(part))
    check("  and the check after reads false while the policy is there", /policyname = 'Allow insert analytics'\) as p61_analytics_one_pipeline/.test(after))
    const routes = ["app/api/track-view/route.ts", "app/api/track-event/route.ts", "app/api/onepage/track/route.ts"]
    check("  every tracking route writes with the service key", routes.every((r) => /createAdminClient\(\)/.test(readFileSync(join(process.cwd(), r), "utf8"))))
  }

  console.log("\nThe Orders page keeps a deleted product's sales, as Analytics does")
  {
    /*
      The Orders page read orders through the creator's current products, so a
      sale of a product deleted after part 32 (the order keeps its creator and
      loses its product) was counted by Analytics and missing from Orders.
      Both now read by the order's creator, through the product only until
      part 32 has run.
    */
    const products = [{ id: P1, creator_id: CREATOR, title: "Guide", type: "digital" }]
    const orders = [
      { id: "o1", creator_id: CREATOR, product_id: P1, amount_cents: 1000, status: "completed", created_at: "2026-09-02T10:00:00.000Z" },
      { id: "o2", creator_id: CREATOR, product_id: null, amount_cents: 2500, status: "completed", created_at: "2026-09-03T10:00:00.000Z" },
      { id: "o3", creator_id: "someone-else", product_id: "p-other", amount_cents: 9900, status: "completed", created_at: "2026-09-04T10:00:00.000Z" },
    ]
    const fake = (hasCreatorColumn: boolean) => {
      const asked: string[] = []
      const admin = {
        from(table: string) {
          const filters: Array<[string, unknown]> = []
          let select = ""
          const q: any = {
            select(cols: string) { select = cols; return q },
            eq(col: string, v: unknown) { filters.push([col, v]); return q },
            order() { return q },
            range(from: number, to: number) { return q.then ? q._run(from, to) : q },
            _run(from: number, to: number) {
              asked.push(`${table} ${select} ${filters.map(([c]) => c).join(",")}`)
              if (table === "orders" && !hasCreatorColumn && filters.some(([c]) => c === "creator_id"))
                return Promise.resolve({ data: null, error: { message: "column orders.creator_id does not exist" } })
              const rows: Row[] = table === "products" ? products : orders.map((o) => (hasCreatorColumn ? o : { ...o, creator_id: undefined }))
              const pass = (r: any) => filters.every(([c, v]) => c === "products.creator_id"
                ? products.some((p) => p.id === r.product_id && p.creator_id === v)
                : r[c] === v)
              const data = rows.filter(pass).map((r: any) => (select.includes("products!inner") ? { ...r, products: { creator_id: CREATOR } } : r))
              return Promise.resolve({ data: data.slice(from, to + 1), error: null })
            },
            then(resolve: any, reject: any) { return q._run(0, 999).then(resolve, reject) },
          }
          return q
        },
      }
      return { admin, asked }
    }
    const after32 = fake(true)
    const read = await readCreatorOrders(after32.admin, CREATOR)
    check("after part 32 the deleted product's sale is on the Orders page", read.rows.some((r) => r.id === "o2" && r.product === null), read.rows)
    check("  with the kept product's sale, and nobody else's", read.rows.map((r) => r.id).sort().join() === "o1,o2", read.rows.map((r) => r.id))
    check("  read by the order's creator, not a list of product ids", after32.asked.some((a) => /^orders \* creator_id$/.test(a)), after32.asked)
    const before32 = fake(false)
    const old = await readCreatorOrders(before32.admin, CREATOR)
    check("before part 32 it still reads, through the product", old.rows.map((r) => r.id).join() === "o1" && before32.asked.some((a) => /products!inner/.test(a)), { rows: old.rows.map((r) => r.id), asked: before32.asked })
    check("  and the embedded product is not left on the row", old.rows.every((r) => !("products" in (r as object))))
  }

  console.log("\nThe all time line reads a missing status as the Orders page does")
  {
    /*
      toOrderRow and the reports read an order with no status as unfinished,
      so not a sale. analytics_all_time (Home's totals) counted it as one.
      The last definition, part 61, is the one the database keeps.
    */
    const part = readFileSync(join(process.cwd(), "supabase/sql/run-now/61_analytics_one_pipeline.sql"), "utf8")
    const allTime = part.split("\n").find((l) => l.startsWith("CREATE OR REPLACE FUNCTION public.analytics_all_time")) ?? ""
    check("no status is unfinished, so not a sale", /bool_or\(coalesce\(status, 'pending'\) = 'pending'\) AS any_pending/.test(allTime) && !/coalesce\(status = 'pending', false\)/.test(allTime))
    check("  as the Orders page reads it", toOrderRow({ id: "x", status: null }, undefined).status === "pending")
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) {
    console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
    process.exit(1)
  }
  process.exit(0)
}

void main()
