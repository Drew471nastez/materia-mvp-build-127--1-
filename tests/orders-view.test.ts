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
import {
  channelOf,
  cleanOrigin,
  decodeOrigin,
  encodeOrigin,
  fromOfHost,
  orderOriginFrom,
  orderSourceFrom,
  orderSourceFromRequest,
  originFromRequest,
  originOf,
  sourceDetailText,
  sourceText,
  surfaceOfPath,
  tagOrderSource,
} from "../lib/orders/order-source"
import { checkoutHrefWithOrigin, describeCheckout, describePage, type OriginInput } from "../lib/orders/checkout-origin"
import { ordersCsv } from "../lib/orders/export-csv"
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
    const mtd = rangeWindow(preset("month_to_date"), prev, now, "Europe/Bucharest")
    check("Month to date starts at the first's midnight where the creator is, on summer time", new Date(mtd.start).toISOString() === "2025-03-31T21:00:00.000Z", new Date(mtd.start).toISOString())
    const newYear = rangeWindow({ preset: "custom", start: "2025-01-01", end: day }, prev, now, "Europe/Bucharest")
    check("  and a range from New Year starts at that midnight, on winter time", new Date(newYear.start).toISOString() === "2024-12-31T22:00:00.000Z", new Date(newYear.start).toISOString())
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

    /* With a detail: both columns in one update, and the source alone when
       the database has only the older column. */
    const writes: unknown[] = []
    const olderDb = {
      from: () => ({
        update: (v: Record<string, unknown>) => ({
          in: async () => {
            writes.push(v)
            return "source_detail" in v ? { error: { message: "Could not find the 'source_detail' column of 'orders' in the schema cache" } } : { error: null }
          },
        }),
      }),
    }
    await tagOrderSource(olderDb, "o1", "website", { surface: "website", site: "andrewrullz.storelib.com", from: "instagram" })
    check(
      "a detail is written with the source, and the source alone when its column is not there yet",
      JSON.stringify(writes) ===
        JSON.stringify([{ source: "website", source_detail: { surface: "website", site: "andrewrullz.storelib.com", from: "instagram" } }, { source: "website" }]),
      writes,
    )
    const newerWrites: unknown[] = []
    await tagOrderSource(
      { from: () => ({ update: (v: unknown) => ({ in: async () => { newerWrites.push(v); return { error: null } } }) }) },
      "o1",
      "storelib",
      { surface: "product", from: "google" },
    )
    check("one update when both columns are there", newerWrites.length === 1, newerWrites)
    let threw = false
    try {
      await tagOrderSource({ from: () => { throw new Error("down") } }, "o1", "storelib")
    } catch {
      threw = true
    }
    check("and a failure never reaches the payment", !threw)

    /* Every path that makes an order records where it came from, after the
       insert and never inside it. */
    const insertFirst: Array<[string, RegExp]> = [
      ["app/api/checkout/process/route.ts", /Order created successfully:", order\.id\)\n\s*const origin = originOf\(body\.origin, request\)\n\s*const channel = channelOf\(origin, orderSourceFromRequest\(request\)\)\n\s*await tagOrderSource\(admin, order\.id, channel, origin\)/],
      ["app/api/checkout/quick-free/route.ts", /const origin = originOf\(body\.origin, request\)\n\s*const channel = channelOf\(origin, orderSourceFromRequest\(request\)\)\n\s*await tagOrderSource\(admin, order\.id, channel, origin\)/],
      ["lib/checkout/fulfil-payment.ts", /const origin = orderOriginFrom\(m, opts\.request\)\n\s*const source = orderSourceFrom\(m, opts\.request\)\n\s*await tagOrderSource\(admin, order\.id, source, origin\)/],
      ["app/api/stripe/webhook/route.ts", /await tagOrderSource\(supabaseAdmin, order\.id, orderSourceFrom\(metadata\), orderOriginFrom\(metadata\)\)/],
      ["lib/checkout/fulfil-cart-item.ts", /await tagOrderSource\(ctx\.admin, order\.id, "website", ctx\.origin\)/],
      ["app/api/admin/sales-trigger/route.ts", /await tagOrderSource\(admin, order\.id, "storelib", \{ surface: "admin" \}\)/],
    ]
    for (const [file, pattern] of insertFirst) {
      const src = read(file)
      check(`${file} records the source`, pattern.test(src))
      check(`  and never puts it in the insert itself`, !/insert\([^)]*source:/s.test(src.replace(/source: "checkout"/g, "")))
    }
    const session = read("app/api/checkout/stripe-session/route.ts")
    check(
      "the PaymentIntent carries the source and the detail to fulfilment",
      /const channel = channelOf\(origin, orderSourceFromRequest\(request\)\)/.test(session) &&
        /\[SOURCE_METADATA_KEY\]: channel,/.test(session) &&
        /\[ORIGIN_METADATA_KEY\]: encodeOrigin\(origin\)/.test(session) &&
        /const origin = originOf\(body\.origin, request\)/.test(session),
    )
    check("a basket's session carries the detail", /\[ORIGIN_METADATA_KEY\]: origin/.test(read("app/api/checkout/cart/route.ts")) && /origin: orderOriginFrom\(metadata\)/.test(read("lib/checkout/fulfil-cart-session.ts")))
    check("the checkout page, the OnePage form and the cart send where they began",
      /origin: checkoutOrigin\(creator\.id\)/.test(read("app/checkout/checkout-client.tsx")) &&
        /origin: pageOrigin\(\)/.test(read("components/onepage/public-onepage.tsx")) &&
        /origin: pageOrigin\(\)/.test(read("components/website-builder/cart-page-body.tsx")))
    check("a website adds itself to every link to checkout", /<CheckoutLinkOrigin \/>/.test(read("app/(site)/layout.tsx")) && /checkoutHrefWithOrigin\(`\/checkout\?productId=/.test(read("components/website-builder/sections/renderers/ProductSection.tsx")))
    check("a website's Buy button marks its checkout", /&src=website`/.test(read("components/website-builder/sections/renderers/ProductSection.tsx")))
    const sql = read("supabase/sql/RUN_ORDER_SOURCE.sql")
    check("the columns arrive by SQL, additive", /add column if not exists source text/.test(sql) && /add column if not exists source_detail jsonb/.test(sql))
    check("and by a migration with the same columns", /add column if not exists source_detail jsonb/i.test(read("supabase/migrations/20260925_order_source_detail.sql")))
  }

  console.log("\nOrders: the detail of where an order came from")
  {
    check("a product page's path", surfaceOfPath("/andrew/preset-pack") === "product" && surfaceOfPath("/p/preset-pack") === "product")
    check("a profile's path", surfaceOfPath("/andrew") === "profile" && surfaceOfPath("/u/andrew") === "profile")
    check("a OnePage's path", surfaceOfPath("/andrew/links") === "onepage" && surfaceOfPath("/l/andrew") === "onepage")
    check("Explore", surfaceOfPath("/explore") === "explore" && surfaceOfPath("/explore/templates?x=1") === "explore")
    check("Storelib's own pages are none of those", ["/library", "/app/orders", "/checkout", "/pricing", "/"].every((p) => surfaceOfPath(p) === null))
    check("hosts to names", fromOfHost("l.instagram.com") === "instagram" && fromOfHost("www.google.co.uk") === "google" && fromOfHost("t.co") === "x" && fromOfHost("m.youtube.com") === "youtube" && fromOfHost("someblog.net") === "someblog.net")

    const clean = cleanOrigin({ surface: "website", site: "WWW.Andrew.com", from: "<b>", utm_source: "ig", utm_campaign: "ana@example.com", extra: "x" })
    check("every field checked: a site is a host, junk and an address are dropped", JSON.stringify(clean) === JSON.stringify({ surface: "website", site: "andrew.com", utm_source: "ig" }), clean)
    check("nothing valid is nothing", cleanOrigin({ surface: "moon" }) === null && cleanOrigin("") === null && cleanOrigin(null) === null)
    const full = { surface: "website" as const, site: "andrewrullz.storelib.com", from: "instagram", utm_source: "ig", utm_campaign: "fall_drop" }
    const packed = encodeOrigin(full)
    check("the metadata string is short and round-trips", packed.length < 120 && JSON.stringify(decodeOrigin(packed)) === JSON.stringify(full), packed)
    check("a payment made before the detail existed has none", orderOriginFrom({ order_source: "storelib" }) === null)
    check("the metadata's detail is read back", JSON.stringify(orderOriginFrom({ order_via: packed })) === JSON.stringify(full))

    check("a website's checkout is a Website order whatever the address says", channelOf({ surface: "website" }, "storelib") === "website" && channelOf({ surface: "product" }, "storelib") === "storelib" && channelOf(null, "website") === "website")
    const fromReq = (referer: string) => originFromRequest(new Request("https://storelib.com/api/x", { headers: { referer } }))
    check("a route reads a website's checkout from the Referer", JSON.stringify(fromReq("https://storelib.com/checkout?productId=1&src=website&site=andrew.storelib.com&ref=tiktok")) === JSON.stringify({ surface: "website", site: "andrew.storelib.com", from: "tiktok" }))
    check("and a OnePage from its path", fromReq("https://storelib.com/andrew/links")?.surface === "onepage")
    check("what the page sent wins over the Referer", originOf({ surface: "explore" }, new Request("https://storelib.com/api/x", { headers: { referer: "https://storelib.com/andrew/links" } }))?.surface === "explore")

    check("the order page's line", sourceText("website", full) === "Website · andrewrullz.storelib.com · from Instagram", sourceText("website", full))
    check("a Storelib page", sourceText("storelib", { surface: "product", from: "google" }) === "Storelib · Product page · from Google")
    check("direct reads Direct", sourceText("storelib", { surface: "explore", from: "direct" }) === "Storelib · Explore · Direct")
    check("the channel alone when that is all there is", sourceText("storelib", null) === "Storelib")
    check("and nothing recorded stays Not recorded", sourceText(null, null) === "Not recorded" && sourceText(undefined, { surface: "product" }) === "Not recorded")
    check("an admin's test sale says so", sourceText("storelib", { surface: "admin" }) === "Storelib · Test sale")
    check("the export's detail column", sourceDetailText("website", full) === "andrewrullz.storelib.com · from Instagram · utm_source ig · utm_campaign fall_drop")

    const base: OriginInput = {
      href: "https://storelib.com/checkout?productId=1",
      referrer: "",
      trail: [],
      landingSearch: "",
      userAgent: "Mozilla/5.0 (iPhone) Safari",
      mainDomain: "storelib.com",
    }
    const at = (o: Partial<OriginInput>) => describeCheckout({ ...base, ...o })
    check(
      "a website's Buy button: which website, and where its visit came from",
      JSON.stringify(at({ href: "https://storelib.com/checkout?productId=1&src=website&site=andrewrullz.storelib.com&ref=instagram", referrer: "https://andrewrullz.storelib.com/" })) ===
        JSON.stringify({ surface: "website", site: "andrewrullz.storelib.com", from: "instagram" }),
      at({ href: "https://storelib.com/checkout?productId=1&src=website&site=andrewrullz.storelib.com&ref=instagram", referrer: "https://andrewrullz.storelib.com/" }),
    )
    const bare = at({ href: "https://storelib.com/checkout?productId=1&src=website", referrer: "https://andrewrullz.storelib.com/" })
    check("a website link with nothing added: the website from the referrer, and no guess at the visit", JSON.stringify(bare) === JSON.stringify({ surface: "website", site: "andrewrullz.storelib.com" }), bare)
    check("in Instagram's own browser, that is where the visit is", at({ href: "https://storelib.com/checkout?productId=1&src=website", referrer: "https://andrewrullz.storelib.com/", userAgent: "Mozilla/5.0 (iPhone) Instagram 300.0" })?.from === "instagram")
    const spa = at({ trail: ["/andrew/preset-pack"], referrer: "https://www.tiktok.com/" })
    check("a product page opened from TikTok, then Buy", JSON.stringify(spa) === JSON.stringify({ surface: "product", from: "tiktok" }), spa)
    const explored = at({ trail: ["/explore", "/andrew/preset-pack"] })
    check("a product found on Explore, with no referrer at all: Explore, Direct", JSON.stringify(explored) === JSON.stringify({ surface: "explore", from: "direct" }), explored)
    check("a product found on the profile", at({ trail: ["/andrew", "/andrew/preset-pack"], referrer: "https://l.instagram.com/" })?.surface === "profile")
    check("and on the profile after a full load of the product page", at({ trail: ["/andrew/preset-pack"], referrer: "https://storelib.com/andrew" })?.surface === "profile")
    check("a product page reached from somewhere else in Storelib is the product page", at({ trail: ["/library", "/andrew/preset-pack"] })?.surface === "product")
    const hard = at({ referrer: "https://storelib.com/andrew" })
    check("a full load from the profile: the profile, and nothing claimed about the visit", JSON.stringify(hard) === JSON.stringify({ surface: "profile" }), hard)
    check("with Analytics' first address (consent given), the visit is known", at({ referrer: "https://storelib.com/andrew", firstTouch: { referrerDomain: "youtube.com" } })?.from === "youtube")
    const link = at({ href: "https://storelib.com/checkout?productId=1&utm_source=newsletter&utm_campaign=launch", referrer: "https://mail.google.com/" })
    check("a checkout link opened from an email, with its tags", JSON.stringify(link) === JSON.stringify({ surface: "link", from: "email", utm_source: "newsletter", utm_campaign: "launch" }), link)
    check("a landing page's tags are kept through client navigations", at({ trail: ["/andrew/preset-pack"], landingSearch: "?utm_source=ig&utm_campaign=drop" })?.utm_campaign === "drop")
    check("coming back from the card's bank page says nothing about the visit", at({ trail: ["/andrew/x"], referrer: "https://hooks.stripe.com/3d" })?.from === undefined)
    check("a checkout on a creator's own domain is their website", at({ href: "https://www.andrewshop.com/checkout?productId=1", referrer: "https://www.andrewshop.com/products/x" })?.site === "andrewshop.com")

    const page = (o: Partial<OriginInput>) => describePage({ ...base, ...o })
    check("a website page names itself", JSON.stringify(page({ href: "https://andrewrullz.storelib.com/products/x", referrer: "https://l.instagram.com/" })) === JSON.stringify({ surface: "website", site: "andrewrullz.storelib.com", from: "instagram" }))
    check("a website visited from the creator's Storelib page", page({ href: "https://andrewrullz.storelib.com/", referrer: "https://storelib.com/andrew" })?.from === "storelib")
    check("the OnePage names itself", page({ href: "https://storelib.com/andrew/links" })?.surface === "onepage" && page({ href: "https://www.andrewshop.com/links" })?.surface === "onepage")

    const here = { surface: "website" as const, site: "andrewrullz.storelib.com", from: "instagram" }
    check("a checkout link gets the website's account added", checkoutHrefWithOrigin("/checkout?productId=1&src=website", here) === "/checkout?productId=1&src=website&site=andrewrullz.storelib.com&ref=instagram")
    check("keys it already has are left alone", checkoutHrefWithOrigin("/checkout?productId=1&ref=tiktok", here) === "/checkout?productId=1&ref=tiktok&site=andrewrullz.storelib.com")
    check("any other link is left alone", checkoutHrefWithOrigin("/products/x", here) === "/products/x" && checkoutHrefWithOrigin("/checkout?productId=1", null) === "/checkout?productId=1")

    const [detailed] = groupOrders([row("z", "2025-01-01T00:00:00Z", { source: "website", source_detail: { surface: "website", site: "andrew.com", from: "tiktok" } })])
    check("an order reads its detail from its row", detailed.sourceDetail?.site === "andrew.com" && detailed.sourceDetail?.from === "tiktok")
    const [plain] = groupOrders([row("y", "2025-01-01T00:00:00Z", { source_detail: "<junk>" })])
    check("and junk in the row is no detail", plain.sourceDetail === null)
    const csv = ordersCsv([detailed], "UTC", "plain")
    check("the export has the detail beside the source", /"Source","Source detail"/.test(csv) && /"Website","andrew.com · from TikTok"/.test(csv), csv.split("\n").slice(0, 2))
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
    check("the checkbox and Order columns are frozen, and the Order column is the edge that casts the shadow", (list.match(/orders-sticky left-0/g) ?? []).length >= 2 && (list.match(/data-scroll-edge="" className=[^>]*orders-sticky left-10/g) ?? []).length >= 2)
    const parts = read("app/app/orders/order-parts.tsx")
    check("the metric lines are Storelib violet, the comparison grey and dashed",
      /stroke="#8b5cf6"/.test(parts) && !/#2a78d6/i.test(parts) && /stroke="#b6bcc6"[\s\S]{0,80}strokeDasharray="3 3"/.test(parts))
    check("the list and an order share one top bar, sticky across the pane, with a hairline and a soft shadow once scrolled under",
      /export function PaneBar/.test(parts) && /className="orders-bar sticky top-0/.test(parts)
        && /<PaneBar width=\{LIST_WIDTH\}/.test(list) && /<PaneBar width=\{ORDER_WIDTH\}/.test(parts) && /<OrderBarFrame/.test(read("app/app/orders/order-detail.tsx"))
        && /\.orders-bar\[data-scrolled="true"\] \{\s*box-shadow: 0 1px 0 rgba\(17, 24, 39, 0\.07\)/.test(read("app/globals.css")))
    check("no comparison control; the changes are always against the period before",
      !/ComparePicker/.test(list) && /const compare = PREVIOUS_PERIOD/.test(client))
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
