/**
 * THE ORDERS PAGE'S NUMBERS
 *
 * lib/orders/order-view.ts decides what every cell of the Orders table and
 * every figure in its metrics strip says. These are the cases that would be
 * wrong quietly: a basket counted as three orders, an order renumbered when a
 * new one arrives, "Today" drawn in the server's time zone, a refund counted
 * on the day of the sale. Plus the source a checkout records, and the source
 * files that must keep doing it.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import {
  FIRST_ORDER_NUMBER,
  PAGE_SIZE,
  filterOrders,
  groupOrders,
  hiddenColumnsFrom,
  listDate,
  pageOf,
  paramsFromQuery,
  queryFromParams,
  startOfDay,
  DEFAULT_QUERY,
  type OrderRow,
} from "../lib/orders/order-view"
import { readMetrics } from "../lib/orders/metrics"
import { DEFAULT_PRESET, rangeWindow, readOrdersPeriod, serializePeriod } from "../lib/orders/range"
import { presetRange, rangeLabel, type PresetId, type RangeValue } from "../lib/date-range/range"
import { orderSourceFrom, orderSourceFromRequest, tagOrderSource } from "../lib/orders/order-source"
import { readTimeZone } from "../lib/orders/time-zone"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${label}`)
  } else {
    failed++
    failures.push(label)
    console.log(`  FAIL  ${label}${detail === undefined ? "" : ` (${JSON.stringify(detail)})`}`)
  }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

const HOUR = 3_600_000
const DAY = 24 * HOUR

function row(id: string, at: string, extra: Partial<OrderRow> = {}): OrderRow {
  return {
    id,
    product_id: extra.product_id ?? "p1",
    amount_cents: 1000,
    status: "completed",
    created_at: at,
    buyer_email: "ana@example.com",
    buyer_first_name: "Ana",
    buyer_last_name: "Pop",
    product: { id: extra.product_id ?? "p1", title: "Preset pack" },
    ...extra,
  }
}

async function main() {
  console.log("\nOrders: grouping and numbering")
  {
    const rows = [
      row("c", "2025-04-09T10:00:00Z"),
      row("b2", "2025-04-08T10:00:01Z", { stripe_session_id: "cs_1", product_id: "p2", product: { id: "p2", title: "Brushes" } }),
      row("b1", "2025-04-08T10:00:00Z", { stripe_session_id: "cs_1" }),
      row("a", "2025-04-07T09:40:00Z"),
    ]
    const orders = groupOrders(rows)
    check("a basket paid once is one order", orders.length === 3, orders.length)
    const basket = orders.find((o) => o.id === "b1")
    check("  with both items in it", basket?.itemCount === 2 && basket.totalCents === 2000, basket)
    check("  and is known to come from a website", basket?.source === "website")
    check("newest first", orders.map((o) => o.id).join() === "c,b1,a", orders.map((o) => o.id))
    check(
      "numbers run oldest first from #1001",
      orders.map((o) => o.number).join() === `${FIRST_ORDER_NUMBER + 2},${FIRST_ORDER_NUMBER + 1},${FIRST_ORDER_NUMBER}`,
      orders.map((o) => o.number),
    )
    const more = groupOrders([...rows, row("d", "2025-04-10T10:00:00Z")])
    check("an order keeps its number when a newer one arrives", more.find((o) => o.id === "a")?.number === FIRST_ORDER_NUMBER)
    check("a single order with no recorded source says so", orders.find((o) => o.id === "a")?.source === null)
    check("a recorded source is used", groupOrders([row("x", "2025-01-01T00:00:00Z", { source: "storelib" })])[0].source === "storelib")
  }

  console.log("\nOrders: statuses")
  {
    const [paid] = groupOrders([row("p", "2025-01-01T00:00:00Z")])
    check("completed is Paid and Fulfilled", paid.payment === "paid" && paid.fulfillment === "fulfilled")
    const [pending] = groupOrders([row("q", "2025-01-01T00:00:00Z", { status: "pending" })])
    check("pending is Payment pending and Unfulfilled", pending.payment === "pending" && pending.fulfillment === "unfulfilled")
    const [partial] = groupOrders([row("r", "2025-01-01T00:00:00Z", { status: "refunded", refund_amount_cents: 400 })])
    check("a part refund is Partially refunded", partial.payment === "partially_refunded" && partial.refundedCents === 400)
    const [whole] = groupOrders([row("s", "2025-01-01T00:00:00Z", { status: "refunded", refund_amount_cents: null })])
    check("a refund with no amount recorded is the whole order", whole.payment === "refunded" && whole.refundedCents === 1000)
    const [failedOrder] = groupOrders([row("t", "2025-01-01T00:00:00Z", { status: "failed" })])
    check("failed is Failed", failedOrder.payment === "failed")
    const [mailed] = groupOrders([row("u", "2025-01-01T00:00:00Z", { buyer_notified_at: "2025-01-01T00:01:00Z" })])
    check("a receipt that arrived is Delivered", mailed.delivery === "delivered" && mailed.deliveredAt === "2025-01-01T00:01:00Z")
    const [bounced] = groupOrders([row("v", "2025-01-01T00:00:00Z", { buyer_email_last_error: "mailbox full" })])
    check("a receipt that did not is Not delivered", bounced.delivery === "failed")
    const [unknown] = groupOrders([row("w", "2025-01-01T00:00:00Z")])
    check("no record either way is left blank, not guessed", unknown.delivery === null)
  }

  console.log("\nOrders: time zones")
  {
    /* 23:30 in New York is already tomorrow in UTC. */
    const now = Date.parse("2025-04-08T03:30:00Z")
    const ny = startOfDay(now, "America/New_York")
    check("midnight is the viewer's midnight", new Date(ny).toISOString() === "2025-04-07T04:00:00.000Z", new Date(ny).toISOString())
    check(
      "an order at 9:40 pm in New York reads Today there",
      listDate("2025-04-08T01:40:00Z", now, "America/New_York") === "Today at 9:40 pm",
      listDate("2025-04-08T01:40:00Z", now, "America/New_York"),
    )
    check(
      "and the same instant is also Today in UTC, at 1:40 am",
      listDate("2025-04-08T01:40:00Z", now, "UTC") === "Today at 1:40 am",
      listDate("2025-04-08T01:40:00Z", now, "UTC"),
    )
    check("an older order in the same year has no year", listDate("2025-02-01T12:00:00Z", now, "UTC") === "Feb 1 at 12:00 pm")
    check("an order from another year has one", listDate("2024-02-01T12:00:00Z", now, "UTC") === "Feb 1, 2024")
    check("a bad zone falls back rather than throwing", typeof listDate("2025-04-08T01:40:00Z", now, "Mars/Olympus") === "string")
    check("the cookie is read only when it names a real zone", readTimeZone("Europe%2FBucharest") === "Europe/Bucharest" && readTimeZone("nope") === "UTC")
  }

  console.log("\nOrders: the date range")
  {
    const now = Date.parse("2025-04-08T15:30:00Z")
    const day = "2025-04-08"
    const preset = (id: PresetId, firstDay?: string): RangeValue => ({ preset: id, ...presetRange(id, day, firstDay) })
    const prev = { mode: "previous_period" } as const
    check("the last 30 days until the creator picks another", DEFAULT_PRESET === "last_30_days" && readOrdersPeriod(new URLSearchParams(), null, day).period.preset === "last_30_days")
    const today = rangeWindow(preset("today"), prev, now, "UTC")
    check("Today runs from midnight to now", today.start === Date.parse("2025-04-08T00:00:00Z") && today.end === now)
    check("  compared with yesterday up to the same time", today.previous!.start === today.start - DAY && today.previous!.end === now - DAY)
    const month = rangeWindow(preset("last_30_days"), prev, now, "UTC")
    check("Last 30 days is thirty days including today", month.start === Date.parse("2025-03-10T00:00:00Z"), new Date(month.start).toISOString())
    const ytd = rangeWindow(preset("year_to_date"), prev, now, "Europe/Bucharest")
    check("This year starts at New Year's midnight where the creator is", new Date(ytd.start).toISOString() === "2024-12-31T22:00:00.000Z", new Date(ytd.start).toISOString())
    const all = rangeWindow(preset("all_time", "2023-06-02"), prev, now, "UTC")
    check("All time reaches the first order, with nothing to compare it with", all.start === Date.parse("2023-06-02T00:00:00Z") && all.previous === null)
    const custom = readOrdersPeriod(new URLSearchParams(), "custom:2025-02-01:2025-02-10", day).period
    const cw = rangeWindow(custom, prev, now, "UTC")
    check("a custom range covers both of its days", cw.start === Date.parse("2025-02-01T00:00:00Z") && cw.end === Date.parse("2025-02-11T00:00:00Z"))
    check("  and reads as its days", rangeLabel(custom) === "Feb 1\u201310, 2025", rangeLabel(custom))
    check("  and round-trips through the cookie", readOrdersPeriod(new URLSearchParams(), encodeURIComponent(serializePeriod(custom, prev)), day).period.end === "2025-02-10")
    check("a reversed custom range is put the right way round", readOrdersPeriod(new URLSearchParams("range=custom&from=2025-02-10&to=2025-02-01"), null, day).period.start === "2025-02-01")
    check("junk is not a range", readOrdersPeriod(new URLSearchParams("range=custom&from=2025-02-30&to=2025-03-01"), null, day).period.preset === "last_30_days")
  }

  console.log("\nOrders: the five figures")
  {
    const now = Date.parse("2025-04-08T15:30:00Z")
    const orders = groupOrders([
      row("t1", "2025-04-08T09:00:00Z", { buyer_email: "a@x.com" }),
      row("t2", "2025-04-08T14:00:00Z", { stripe_session_id: "cs_9", buyer_email: "b@x.com" }),
      row("t3", "2025-04-08T14:00:01Z", { stripe_session_id: "cs_9", product_id: "p2", buyer_email: "b@x.com" }),
      row("t4", "2025-04-08T15:00:00Z", { buyer_email: "a@x.com", amount_cents: 0 }),
      row("y1", "2025-04-07T10:00:00Z"),
      row("y2", "2025-04-07T16:00:00Z"),
      row("old", "2025-03-01T10:00:00Z", { status: "refunded", refund_amount_cents: 700, refunded_at: "2025-04-08T11:00:00Z" }),
      row("bad", "2025-04-08T12:00:00Z", { status: "failed" }),
    ])
    const w = rangeWindow({ preset: "today", start: "2025-04-08", end: "2025-04-08" }, { mode: "previous_period" }, now, "UTC")
    const m = Object.fromEntries(readMetrics(orders, w, w.previous, "UTC").map((r) => [r.key, r]))
    check("orders: the basket once, not the failed payment", m.orders.value === 3, m.orders.value)
    check("  compared with yesterday up to this hour", m.orders.previous === 1 && m.orders.change === 2, m.orders)
    const byTotal = filterOrders(orders, { ...DEFAULT_QUERY, sort: "total_desc" }, w)
    check("sorting by total puts the basket first", byTotal[0].id === "t2", byTotal.map((o) => o.id))
    check("the table only lists orders inside the range", filterOrders(orders, DEFAULT_QUERY, w).every((o) => Date.parse(o.createdAt) >= w.start))
    check("total sales: what was paid in the period", m.sales.value === 1000 + 2000 + 0, m.sales.value)
    check("average order value leaves free orders out", m.aov.value === 1500, m.aov.value)
    check("customers: two people, however many orders", m.customers.value === 2, m.customers.value)
    check("a refund counts on the day it was refunded", m.refunds.value === 700, m.refunds.value)
    check("the line has a point for the hour of each order", m.orders.series[9] === 1 && m.orders.series[14] === 1, m.orders.series)
    const allTime = rangeWindow({ preset: "all_time", ...presetRange("all_time", "2025-04-08", "2025-03-01") }, { mode: "previous_period" }, now, "UTC")
    const quiet = readMetrics(orders, allTime, allTime.previous, "UTC")
    check("all time has figures and no comparison", quiet.every((r) => r.change === null) && quiet.find((r) => r.key === "orders")!.value === 6)
  }

  console.log("\nOrders: the list")
  {
    const rows = Array.from({ length: 120 }, (_, i) =>
      row(`o${i}`, new Date(Date.parse("2025-01-01T00:00:00Z") + i * HOUR).toISOString(), {
        buyer_first_name: i === 7 ? "Mihai" : "Ana",
        source: i % 2 ? "website" : "storelib",
        status: i === 3 ? "refunded" : "completed",
      }),
    )
    const orders = groupOrders(rows)
    const page2 = pageOf(orders, 2)
    check("fifty to a page", PAGE_SIZE === 50 && page2.items.length === 50 && page2.from === 51 && page2.to === 100)
    check("a page past the end is the last page", pageOf(orders, 99).page === 3 && pageOf(orders, 99).items.length === 20)
    check("search finds an order by number", filterOrders(orders, { ...DEFAULT_QUERY, q: "#1008" }).length === 1)
    check("and by customer", filterOrders(orders, { ...DEFAULT_QUERY, q: "mihai" }).length === 1)
    check("and by product", filterOrders(orders, { ...DEFAULT_QUERY, q: "preset" }).length === 120)
    check("the Website filter", filterOrders(orders, { ...DEFAULT_QUERY, source: "website" }).length === 60)
    check("the Refunded view", filterOrders(orders, { ...DEFAULT_QUERY, view: "refunded" }).length === 1)

    const q = { view: "paid" as const, q: "ana", source: "website" as const, product: "p1", sort: "total_desc" as const, page: 3 }
    const params = paramsFromQuery(q, new URLSearchParams("order=abc&period=7d"))
    check("the list's state round-trips through the address", JSON.stringify(queryFromParams(params)) === JSON.stringify(q))
    check("  without touching the open order or the period", params.get("order") === "abc" && params.get("period") === "7d")
    check("  and the defaults are left out of it", paramsFromQuery(DEFAULT_QUERY).toString() === "")
    check("junk in the address is ignored", queryFromParams(new URLSearchParams("view=hax&source=evil&page=-4")).view === "all")
    check("hidden columns: unknown names are dropped", hiddenColumnsFrom("date.evil.source").join() === "date,source")
  }

  console.log("\nOrders: where an order came from")
  {
    const req = (referer?: string) => new Request("https://storelib.com/api/checkout/process", { headers: referer ? { referer } : {} })
    check("a checkout opened from a website's Buy button", orderSourceFromRequest(req("https://storelib.com/checkout?productId=1&src=website")) === "website")
    check("any other checkout is Storelib", orderSourceFromRequest(req("https://storelib.com/checkout?productId=1")) === "storelib")
    check("no referer is Storelib", orderSourceFromRequest(req()) === "storelib")
    check("metadata decided at checkout wins", orderSourceFrom({ order_source: "website" }, req()) === "website")
    check("junk metadata is ignored", orderSourceFrom({ order_source: "<script>" }) === "storelib")

    let updated: unknown = null
    const fakeAdmin = {
      from: () => ({
        update: (v: unknown) => ({
          in: async (_c: string, ids: string[]) => {
            updated = { v, ids }
            return { error: { message: "Could not find the 'source' column of 'orders'" } }
          },
        }),
      }),
    }
    await tagOrderSource(fakeAdmin, ["o1", null, ""], "website")
    check("tagging writes the source for the real ids", JSON.stringify(updated) === JSON.stringify({ v: { source: "website" }, ids: ["o1"] }))
    let threw = false
    try {
      await tagOrderSource({ from: () => { throw new Error("down") } }, "o1", "storelib")
    } catch {
      threw = true
    }
    check("and a failure never reaches the payment", !threw)

    const insertFirst: Array<[string, RegExp]> = [
      ["app/api/checkout/process/route.ts", /Order created successfully:", order\.id\)\n\s*await tagOrderSource\(admin, order\.id, orderSourceFromRequest\(request\)\)/],
      ["app/api/checkout/quick-free/route.ts", /await tagOrderSource\(admin, order\.id, orderSourceFromRequest\(request\)\)/],
      ["lib/checkout/fulfil-payment.ts", /await tagOrderSource\(admin, order\.id, orderSourceFrom\(m, opts\.request\)\)/],
      ["app/api/stripe/webhook/route.ts", /await tagOrderSource\(supabaseAdmin, order\.id, orderSourceFrom\(metadata\)\)/],
      ["lib/checkout/fulfil-cart-item.ts", /await tagOrderSource\(ctx\.admin, order\.id, "website"\)/],
    ]
    for (const [file, pattern] of insertFirst) {
      const src = read(file)
      check(`${file} records the source`, pattern.test(src))
      check(`  and never puts it in the insert itself`, !/insert\([^)]*source:/s.test(src.replace(/source: "checkout"/g, "")))
    }
    check("the PaymentIntent carries it to fulfilment", (read("app/api/checkout/stripe-session/route.ts").match(/\[SOURCE_METADATA_KEY\]: orderSourceFromRequest\(request\)/g) ?? []).length === 1)
    check("a website's Buy button marks its checkout", /&src=website`/.test(read("components/website-builder/sections/renderers/ProductSection.tsx")))
    check("the column arrives by SQL, additive", /add column if not exists source text/.test(read("supabase/sql/RUN_ORDER_SOURCE.sql")))
  }

  console.log("\nOrders: the page")
  {
    /* The page reads its rows through lib/orders/load-rows.ts, which the
       app's export link reads through too, so both count the same orders. */
    const page = read("app/app/orders/sales/page.tsx")
    const loader = read("lib/orders/load-rows.ts")
    check("the page reads its orders through the shared reader", /await readCreatorOrders\(admin, creator\.id\)/.test(page))
    check(
      "products are read with every column, so a missing one can never empty the list",
      /\.from\("products"\)\s*\.select\("\*"\)/.test(loader) && !/gallery_images"\)/.test(loader),
    )
    check("a failed read stops the page instead of drawing no orders", /if \(productsError\) throw/.test(loader) && /if \(ordersError\) throw/.test(loader))
    check("every order is read, a thousand at a time", /\.range\(from, from \+ 999\)/.test(loader))
    check("the range the creator chose last time is read on the server", /initialRange=\{jar\.get\(RANGE_COOKIE\)/.test(page))
    check("the orders are read for the signed-in creator's own products", /\.eq\("user_id", user\.id\)/.test(page) && /\.eq\("creator_id", creatorId\)/.test(loader) && /\.in\(\s*"product_id",/.test(loader))
    check("no Stripe call stands between the creator and the page", /after\(\(\) => catchMissedRefunds/.test(page) && !/await stripe\./.test(page.split("export default")[1]))
    const client = read("app/app/orders/orders-client.tsx")
    check("the list stays mounted under an open order", /inert=\{listCovered\}/.test(client) && !/listCovered \?\s*null/.test(client))
    check("opening an order does not ask the server", !/router\.push\(/.test(client))
    const list = read("app/app/orders/orders-list.tsx")
    check("the checkbox and Order columns are frozen", (list.match(/orders-sticky left-0/g) ?? []).length >= 2 && (list.match(/orders-sticky orders-edge left-10/g) ?? []).length >= 2)
    check("the export does not let a cell run as a formula", /\^\[=\+\\-@\\t\\r\]/.test(read("lib/orders/export-csv.ts")))
    check("  and the dialog writes its file with that same function", /from "@\/lib\/orders\/export-csv"/.test(read("app/app/orders/export-dialog.tsx")))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) {
    console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
    process.exit(1)
  }
}

main()
