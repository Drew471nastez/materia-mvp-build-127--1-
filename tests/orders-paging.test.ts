/**
 * THE ORDERS PAGE, ONE PAGE AT A TIME (lib/orders/paged.ts)
 *
 * The page used to read every row a store had and work everything out from
 * them. It now reads a page. These check, against a fake database holding a
 * few thousand rows, that what the creator sees did not change: each page,
 * read the new way, is the page the old way drew, order for order and number
 * for number, with the same count, the same five figures and the same tabs.
 *
 * The old way is still here to compare with: lib/orders/load-rows
 * readCreatorOrders reads every row, and order-view groupOrders, filterOrders
 * and pageOf are what the browser did with them.
 *
 *   numbers     every order keeps the number it had, on every page, after a
 *               new order arrives, and after a row is removed; the seller's
 *               emails count the same numbers
 *   baskets     a basket's rows are never split across two pages, even with
 *               other orders written between its lines
 *   counts      matching, pages, from and to, the five figures (with refunds
 *               of older orders inside the period) and which tabs show
 *   reads       a page reads its own rows, not the store's, and the index is
 *               brought up to date with only the rows written since
 */
import { FakeSupabase, type Row } from "./fake-supabase"
import {
  DEFAULT_QUERY,
  FIRST_ORDER_NUMBER,
  PAGE_SIZE,
  VIEWS,
  filterOrders,
  groupOrders,
  inView,
  pageOf,
  paramsFromQuery,
  type ListQuery,
  type Order,
} from "../lib/orders/order-view"
import { readMetrics } from "../lib/orders/metrics"
import { ordersCurrency } from "../lib/orders/money"
import { rangeWindow } from "../lib/orders/range"
import { presetRange, todayIn, type RangeValue } from "../lib/date-range/range"
import { readCreatorOrders } from "../lib/orders/load-rows"
import { countOrdersWithin, forgetOrderIndex, readOneOrder, readOrdersForExport, readOrdersListing, type ListingRequest } from "../lib/orders/paged"
import { buildIndex } from "../lib/orders/order-index"
import { numbersOf } from "../lib/orders/order-number-server"
import { listingAskFrom, listingKey, listingParams } from "../lib/orders/listing-params"
import { pickByNumber } from "../lib/orders/export-csv"

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
    console.log(`  FAIL  ${label}${detail === undefined ? "" : ` (${JSON.stringify(detail).slice(0, 600)})`}`)
  }
}

/* ─── A store ─────────────────────────────────────────────────────────── */

const CREATOR = "creator-1"
const OTHER = "creator-2"
const TZ = "UTC"
const NOW = Date.parse("2026-09-24T12:00:00Z")
const DAY = 86_400_000
const HOUR = 3_600_000

/* The same numbers on every run. */
let seed = 7
const rand = () => {
  seed = (seed * 1103515245 + 12345) % 2147483648
  return seed / 2147483648
}

let n = 0
const id = () => `r${String(++n).padStart(6, "0")}`
const iso = (ms: number) => new Date(ms).toISOString()

function orderRow(at: number, extra: Partial<Row> = {}): Row {
  const i = Math.floor(rand() * 40)
  return {
    id: id(),
    creator_id: CREATOR,
    product_id: ["p1", "p2", "p3"][i % 3],
    amount_cents: 500 + (i % 7) * 250,
    tip_cents: 0,
    fee_cents: 50,
    status: "completed",
    created_at: iso(at),
    stripe_session_id: `cs_${n}`,
    buyer_email: `buyer${i}@example.com`,
    buyer_first_name: ["Ana", "Ben", "Cleo", "Dan"][i % 4],
    buyer_last_name: ["Pop", "Ionescu", "Smith"][i % 3],
    source: i % 5 === 0 ? "website" : "storelib",
    refund_amount_cents: null,
    refunded_at: null,
    currency: "usd",
    ...extra,
  }
}

function store(): { db: FakeSupabase; basket: string; straddler: string; oldRefund: string } {
  n = 0
  seed = 7
  const rows: Row[] = []
  /* About 2,600 rows over 200 days: singles, three-line baskets, and the odd pending, failed, disputed or refunded payment. */
  let t = NOW - 200 * DAY
  for (;;) {
    t += Math.floor(rand() * 2 * HOUR) + 60_000
    if (t >= NOW - HOUR) break
    const roll = rand()
    if (roll < 0.12) {
      const first = orderRow(t, { source: "website" })
      rows.push(first)
      for (let k = 1; k < 3; k++) rows.push(orderRow(t + k * 1000, { stripe_session_id: first.stripe_session_id, buyer_email: first.buyer_email, buyer_first_name: first.buyer_first_name, buyer_last_name: first.buyer_last_name, source: "website" }))
    } else if (roll < 0.15) rows.push(orderRow(t, { status: "pending" }))
    else if (roll < 0.17) rows.push(orderRow(t, { status: "failed" }))
    else if (roll < 0.18) rows.push(orderRow(t, { status: "disputed" }))
    else if (roll < 0.22) rows.push(orderRow(t, { status: "refunded", refund_amount_cents: rand() < 0.5 ? 200 : null, refunded_at: rand() < 0.8 ? iso(t + 3 * DAY) : null }))
    else if (roll < 0.25) rows.push(orderRow(t, { stripe_session_id: null }))
    else rows.push(orderRow(t))
  }
  /* Two orders in the very same instant: the tie is broken by id, as the page broke it. */
  const tie = NOW - 2 * DAY
  rows.push(orderRow(tie, { id: "r900001" }), orderRow(tie, { id: "r900000" }))
  /* A basket with sixty other orders written between its lines: one order, on one page, wherever its lines fall. */
  const b0 = NOW - 10 * DAY
  const basketFirst = orderRow(b0, { id: "r950000", stripe_session_id: "cs_straddle", source: "website" })
  rows.push(basketFirst)
  for (let k = 1; k <= 60; k++) rows.push(orderRow(b0 + k * 60_000))
  rows.push(orderRow(b0 + 61 * 60_000, { id: "r950001", stripe_session_id: "cs_straddle", product_id: "p2" }))
  /* A basket written across the start of the period: placed by its first line, before the period. */
  const start30 = rangeWindow({ preset: "last_30_days", ...presetRange("last_30_days", todayIn(TZ, NOW)) }, { mode: "previous_period" }, NOW, TZ).start
  rows.push(orderRow(start30 - 500, { id: "r960000", stripe_session_id: "cs_edge" }), orderRow(start30 + 500, { id: "r960001", stripe_session_id: "cs_edge" }))
  /* An order from long ago refunded this week: its refund counts this week. */
  const old = orderRow(NOW - 150 * DAY, { id: "r970000", status: "refunded", refund_amount_cents: 300, refunded_at: iso(NOW - 3 * DAY) })
  rows.push(old)
  /* Physical orders: one to fulfil, one with a return asked for, one cash on delivery still to collect. */
  rows.push(orderRow(NOW - 4 * DAY, { id: "r980000", checkout_id: "co_1", quantity: 2 }))
  rows.push(orderRow(NOW - 3 * DAY, { id: "r980001", checkout_id: "co_2" }))
  rows.push(orderRow(NOW - 2 * DAY, { id: "r980002", checkout_id: "co_3", payment_method: "cash_on_delivery" }))
  /* Another store's rows, which no read may return. */
  for (let k = 0; k < 40; k++) rows.push(orderRow(NOW - k * DAY, { creator_id: OTHER, buyer_email: "theirs@example.com" }))

  const db = new FakeSupabase()
  db.table("orders", {}, rows)
  db.table("products", {}, [
    { id: "p1", creator_id: CREATOR, title: "Brushes", type: "digital" },
    { id: "p2", creator_id: CREATOR, title: "Canvas", type: "physical" },
    { id: "p3", creator_id: CREATOR, title: "Course", type: "course" },
  ])
  db.table("commerce_checkouts", {}, [
    { id: "co_1", creator_id: CREATOR, fulfillment_status: "unfulfilled", return_status: "none", delivery_method: "shipping", shipping_rate: { name: "Standard" }, provider: "stripe", currency: "usd", created_at: iso(NOW - 4 * DAY) },
    { id: "co_2", creator_id: CREATOR, fulfillment_status: "delivered", return_status: "requested", delivery_method: "shipping", shipping_rate: { name: "Express" }, provider: "stripe", currency: "usd", created_at: iso(NOW - 3 * DAY) },
    { id: "co_3", creator_id: CREATOR, fulfillment_status: "unfulfilled", return_status: "none", delivery_method: "shipping", shipping_rate: null, provider: "cod", cod_collected_at: null, currency: "usd", created_at: iso(NOW - 2 * DAY) },
  ])
  db.table("fulfillments", {}, [])
  return { db, basket: basketFirst.id as string, straddler: "r960000", oldRefund: old.id as string }
}

/* ─── The old way, to compare with ────────────────────────────────────── */

async function oldPage(db: FakeSupabase, query: ListQuery, window: { start: number; end: number }) {
  const { rows } = await readCreatorOrders(db, CREATOR)
  const all = groupOrders(rows)
  const filtered = filterOrders(all, query, window)
  return { all, filtered, page: pageOf(filtered, query.page) }
}

function periodOf(preset: "last_30_days" | "last_7_days" | "all_time", firstDay?: string): RangeValue {
  return { preset, ...presetRange(preset, todayIn(TZ, NOW), firstDay) }
}

function ask(query: ListQuery, period: RangeValue): ListingRequest {
  const span = rangeWindow(period, { mode: "previous_period" }, NOW, TZ)
  return { query, window: { start: span.start, end: span.end }, previous: span.previous, timeZone: TZ }
}

const ids = (orders: Array<{ id: string }>) => orders.map((o) => o.id).join()

async function samePage(db: FakeSupabase, label: string, query: ListQuery, period: RangeValue) {
  const req = ask(query, period)
  const before = await oldPage(db, query, req.window)
  const now = await readOrdersListing(db, CREATOR, req)
  const page = groupOrders(now.rows, now.numbers)
  const byId = new Map(page.map((o) => [o.id, o]))
  const shown = now.pageIds.map((i) => byId.get(i)).filter((o): o is Order => !!o)
  const old = before.page.items
  check(`${label}: the same orders in the same order`, ids(shown) === ids(old), { now: ids(shown).slice(0, 200), old: ids(old).slice(0, 200) })
  check(`${label}: each with the number it always had`, shown.every((o, i) => o.number === old[i]?.number), shown.map((o) => o.number).slice(0, 10))
  check(`${label}: each whole, every line of its basket`, shown.every((o, i) => o.lines.length === old[i]?.lines.length && o.totalCents === old[i]?.totalCents && o.payment === old[i]?.payment))
  check(`${label}: the same count and pages`, now.matching === before.filtered.length && JSON.stringify(now.range) === JSON.stringify({ page: before.page.page, pages: before.page.pages, from: before.page.from, to: before.page.to }), { now: [now.matching, now.range], old: [before.filtered.length, before.page] })
  const first = (before.page.page - 1) * PAGE_SIZE
  check(`${label}: the orders either side, for previous and next`, now.before === (before.filtered[first - 1]?.id ?? null) && now.after === (before.filtered[first + old.length]?.id ?? null), [now.before, now.after])
  return { now, before, req }
}

/* ─── The checks ──────────────────────────────────────────────────────── */

async function main() {
  console.log("\nNumbering")
  {
    const { db } = store()
    forgetOrderIndex()
    const { rows } = await readCreatorOrders(db, CREATOR)
    const all = groupOrders(rows)
    const index = buildIndex(db.rows("orders").filter((r) => r.creator_id === CREATOR) as never)
    const byIndex = new Map(index.orders.map((o) => [o.id, o.number]))
    check(`every one of the ${all.length} orders keeps its number`, all.every((o) => byIndex.get(o.id) === o.number) && index.orders.length === all.length)
    check("  from #1001, a basket counted once", Math.min(...all.map((o) => o.number)) === FIRST_ORDER_NUMBER && all.length < rows.length)
    const seller = numbersOf(db.rows("orders").filter((r) => r.creator_id === CREATOR) as never)
    check("  and the seller's emails count the same numbers", all.every((o) => o.lines.every((l) => seller.byOrder.get(l.id) === o.number)))
    check("two orders in one instant are told apart by id, as before", (all.find((o) => o.id === "r900000")?.number ?? 0) + 1 === all.find((o) => o.id === "r900001")?.number)
  }

  console.log("\nPages, against the page as it was drawn")
  {
    const { db } = store()
    forgetOrderIndex()
    const all30 = periodOf("last_30_days")
    const { now } = await samePage(db, "Last 30 days, page 1", DEFAULT_QUERY, all30)
    for (const page of [2, 3, 99]) await samePage(db, `Last 30 days, page ${page}`, { ...DEFAULT_QUERY, page }, all30)
    await samePage(db, "Last 30 days, oldest first", { ...DEFAULT_QUERY, sort: "oldest", page: 2 }, all30)
    const { rows } = await readCreatorOrders(db, CREATOR)
    const firstDay = todayIn(TZ, Date.parse(groupOrders(rows).at(-1)!.createdAt))
    const allTime = periodOf("all_time", firstDay)
    for (const page of [1, 7, 20]) await samePage(db, `All time, page ${page}`, { ...DEFAULT_QUERY, page }, allTime)
    await samePage(db, "Last 7 days", DEFAULT_QUERY, periodOf("last_7_days"))
    await samePage(db, "A product", { ...DEFAULT_QUERY, product: "p2" }, all30)
    await samePage(db, "The Paid view", { ...DEFAULT_QUERY, view: "paid", page: 2 }, all30)
    await samePage(db, "Payment pending", { ...DEFAULT_QUERY, view: "pending" }, allTime)
    await samePage(db, "Refunded", { ...DEFAULT_QUERY, view: "refunded" }, allTime)
    await samePage(db, "Unfulfilled", { ...DEFAULT_QUERY, view: "unfulfilled" }, all30)
    await samePage(db, "A search by name", { ...DEFAULT_QUERY, q: "cleo smith" }, allTime)
    await samePage(db, "A search by number", { ...DEFAULT_QUERY, q: "#105" }, allTime)
    await samePage(db, "A search by product", { ...DEFAULT_QUERY, q: "canvas", page: 2 }, all30)
    await samePage(db, "From a website", { ...DEFAULT_QUERY, source: "website" }, all30)
    await samePage(db, "Fulfillment: unfulfilled", { ...DEFAULT_QUERY, fulfillment: "unfulfilled" }, all30)
    await samePage(db, "Highest total", { ...DEFAULT_QUERY, sort: "total_desc", page: 3 }, allTime)
    await samePage(db, "Lowest total", { ...DEFAULT_QUERY, sort: "total_asc" }, all30)
    const flip = await readOrdersListing(db, CREATOR, { ...ask({ ...DEFAULT_QUERY, page: 2 }, all30), figures: false })
    const flipOld = await samePage(db, "Page 2 again", { ...DEFAULT_QUERY, page: 2 }, all30)
    check("another page of the same period can leave the figures out, and says so", flip.figures === false && flip.metrics.length === 0 && flip.pageIds.join() === flipOld.now.pageIds.join() && flip.summary.total === flipOld.now.summary.total)
    check("a page sends its own orders and the two beside it, not the store", groupOrders(now.rows, now.numbers).length <= PAGE_SIZE + 2, groupOrders(now.rows, now.numbers).length)
    check("  and never another store's", !JSON.stringify(now).includes("theirs@example.com"))
  }

  console.log("\nBaskets across a page's edge")
  {
    const { db, basket, straddler } = store()
    forgetOrderIndex()
    const all30 = periodOf("last_30_days")
    const old = await oldPage(db, DEFAULT_QUERY, ask(DEFAULT_QUERY, all30).window)
    const at = old.filtered.findIndex((o) => o.id === basket)
    const pageNo = Math.floor(at / PAGE_SIZE) + 1
    const firstLine = new Set<string>()
    let seenOn = 0
    for (let page = 1; page <= old.page.pages; page++) {
      const now = await readOrdersListing(db, CREATOR, ask({ ...DEFAULT_QUERY, page }, all30))
      const orders = groupOrders(now.rows, now.numbers)
      const shown = orders.filter((o) => now.pageIds.includes(o.id))
      for (const o of shown) firstLine.add(o.id)
      const b = shown.find((o) => o.id === basket)
      if (b) {
        seenOn = page
        check("the basket with sixty orders between its lines is one order with both lines", b.lines.map((l) => l.id).join() === "r950000,r950001", b.lines.map((l) => l.id))
      }
      check(`  page ${page}: no line of it stands as an order of its own`, !shown.some((o) => o.id === "r950001") && !orders.some((o) => o.lines.length === 1 && o.lines[0].id === "r950001"))
    }
    check("  on the page its first line places it, and only there", seenOn === pageNo, [seenOn, pageNo])
    check("every order of the period is on exactly one page", firstLine.size === old.filtered.length, [firstLine.size, old.filtered.length])
    check("a basket begun before the period stays out of it, its later line too", !firstLine.has(straddler) && !firstLine.has("r960001"))
    const one = await readOneOrder(db, CREATOR, "r960001")
    check("an order asked for by a later line's id comes back whole, with its number", one?.rows.map((r) => r.id).sort().join() === "r960000,r960001" && one.numbers.r960000 === old.all.find((o) => o.id === straddler)?.number)
    check("  and another store's order is not found", (await readOneOrder(db, OTHER, "r960001")) === null)
    const open = await readOrdersListing(db, CREATOR, { ...ask(DEFAULT_QUERY, all30), open: "r970000" })
    check("the order open over the list is sent with any page, whatever its dates", groupOrders(open.rows, open.numbers).some((o) => o.id === "r970000" && o.number === old.all.find((x) => x.id === "r970000")?.number) && !open.pageIds.includes("r970000"))
  }

  console.log("\nThe five figures, the tabs and the totals")
  {
    const { db } = store()
    forgetOrderIndex()
    const { rows } = await readCreatorOrders(db, CREATOR)
    const all = groupOrders(rows)
    for (const [label, period] of [["Last 30 days", periodOf("last_30_days")], ["Last 7 days", periodOf("last_7_days")]] as const) {
      const req = ask(DEFAULT_QUERY, period)
      const now = await readOrdersListing(db, CREATOR, req)
      const want = readMetrics(all, req.window, req.previous, TZ)
      for (const m of want) {
        const got = now.metrics.find((x) => x.key === m.key)
        check(`${label}: ${m.key} is ${Math.round(m.value)} against ${Math.round(m.previous)}, day by day`, JSON.stringify(got) === JSON.stringify(m), { got, want: m })
      }
    }
    const req = ask(DEFAULT_QUERY, periodOf("last_7_days"))
    const now = await readOrdersListing(db, CREATOR, req)
    const refunds = now.metrics.find((m) => m.key === "refunds")!
    check("an old order refunded this week counts in this week's refunds", refunds.value >= 300)
    const views = VIEWS.filter((v) => v.value === "all" || all.some((o) => inView(o, v.value))).map((v) => v.value)
    check("the same tabs show", JSON.stringify(now.summary.views) === JSON.stringify(views), { now: now.summary.views, old: views })
    check("  the store ships something, so Fulfillment is offered", now.summary.ships === all.some((o) => o.shipping !== null) && now.summary.ships)
    check("every order counted, for Export's All orders and an empty page's words", now.summary.total === all.length)
    check("All time begins at the first order", now.summary.earliest === all.at(-1)!.createdAt)
    check("the figures in the store's currency", now.summary.currency === ordersCurrency(all))
    const w = req.window
    check("By date counts the orders those dates hold", (await countOrdersWithin(db, CREATOR, w)) === all.filter((o) => Date.parse(o.createdAt) >= w.start && Date.parse(o.createdAt) < w.end).length)

    /* An older database without one of the figures' columns: read with every column instead, the same figures. */
    forgetOrderIndex()
    const refusing = {
      from(name: string) {
        const q = db.from(name) as unknown as { select: (c: string, o?: unknown) => unknown; then: (a: unknown, b: unknown) => Promise<unknown>; refuse?: boolean }
        const select = q.select.bind(q)
        q.select = (c: string, o?: unknown) => {
          if (name === "orders" && /customer_email/.test(c)) q.refuse = true
          return select(c, o)
        }
        const then = q.then.bind(q)
        q.then = (a: unknown, b: unknown) =>
          q.refuse ? Promise.resolve({ data: null, error: { code: "42703", message: "column orders.customer_email does not exist" } }).then(a as never, b as never) : then(a, b)
        return q
      },
      rpc: db.rpc.bind(db),
    }
    const tolerant = await readOrdersListing(refusing, CREATOR, req)
    check("a database missing a named column still gives the same figures", JSON.stringify(tolerant.metrics) === JSON.stringify(now.metrics))
  }

  console.log("\nThe index: read once, then only what is new")
  {
    const { db } = store()
    forgetOrderIndex()
    const reads: number[] = []
    const counting = {
      from(name: string) {
        const q = db.from(name) as unknown as { select: (c: string, o?: unknown) => unknown; then: (a: (v: { data: unknown[] | null }) => unknown, b: unknown) => Promise<unknown>; isIndex?: boolean }
        const select = q.select.bind(q)
        q.select = (c: string, o?: unknown) => {
          if (name === "orders" && c === "id, created_at, stripe_session_id") q.isIndex = true
          return select(c, o)
        }
        const then = q.then.bind(q)
        q.then = (a, b) =>
          then((v: { data: unknown[] | null }) => {
            if (q.isIndex) reads.push(v.data?.length ?? 0)
            return a(v)
          }, b)
        return q
      },
      rpc: db.rpc.bind(db),
    }
    const req = ask(DEFAULT_QUERY, periodOf("last_30_days"))
    const first = await readOrdersListing(counting, CREATOR, req)
    const whole = reads.reduce((a, b) => a + b, 0)
    check(`the first visit reads the index whole (${whole} rows, three columns)`, whole === db.rows("orders").filter((r) => r.creator_id === CREATOR).length)
    reads.length = 0
    db.tables.orders.push(orderRow(NOW - 60_000, { id: "r990000" }))
    const second = await readOrdersListing(counting, CREATOR, req)
    check("the next reads only the row written since", reads.reduce((a, b) => a + b, 0) === 1, reads)
    check("  and the new order is first, numbered next", second.pageIds[0] === "r990000" && second.numbers.r990000 === first.summary.total + FIRST_ORDER_NUMBER)
    check("  every other order keeps its number", Object.entries(first.numbers).every(([k, v]) => second.numbers[k] === undefined || second.numbers[k] === v))
    /* A row removed: the count no longer matches, the index is read again, and the page is the page the old way draws. */
    const gone = db.tables.orders.findIndex((r) => r.id === "r000010")
    db.tables.orders.splice(gone, 1)
    reads.length = 0
    await samePage(counting as never, "After a row is removed", DEFAULT_QUERY, periodOf("last_30_days"))
    check("  read whole again, since the count no longer matched", reads.length > 1 && reads.reduce((a, b) => a + b, 0) >= db.rows("orders").filter((r) => r.creator_id === CREATOR).length, reads)
    /* A row written into the past (an import): every later order moves up one, as the page always counted. */
    db.tables.orders.push(orderRow(NOW - 20 * DAY, { id: "r990001" }))
    await samePage(counting as never, "After a row is written into the past", { ...DEFAULT_QUERY, page: 2 }, periodOf("last_30_days"))
  }

  console.log("\nExport")
  {
    const { db } = store()
    forgetOrderIndex()
    const { rows } = await readCreatorOrders(db, CREATOR)
    const all = groupOrders(rows)
    const numbers = [1010, 1500, 1003, 99999]
    const byNumber = await readOrdersForExport(db, CREATOR, { numbers })
    check("orders by number are the orders those numbers name", ids(byNumber) === ids(pickByNumber(all, numbers)))
    const req = ask({ ...DEFAULT_QUERY, view: "paid", sort: "total_desc" }, periodOf("last_30_days"))
    const view = await readOrdersForExport(db, CREATOR, { query: req.query, window: req.window })
    check("This view is the list's every page", ids(view) === ids(filterOrders(all, req.query, req.window)))
    const everything = await readOrdersForExport(db, CREATOR, { query: DEFAULT_QUERY, window: null })
    check("All orders is every order, newest first, numbered", ids(everything) === ids(all) && everything.every((o, i) => o.number === all[i].number))
  }

  console.log("\nWhat the browser asks for")
  {
    const req = ask({ ...DEFAULT_QUERY, view: "refunded", q: "ana", page: 3 }, periodOf("last_30_days"))
    const back = listingAskFrom(listingParams({ ...req, open: "r000001" }))
    check("the ask reads back as it was written",
      !!back && paramsFromQuery(back.query).toString() === paramsFromQuery(req.query).toString() && back.query.page === 3 && back.window.start === req.window.start && back.window.end === req.window.end && back.previous?.end === req.previous?.end && back.open === "r000001")
    check("  and no period is no ask", listingAskFrom(new URLSearchParams("view=paid")) === null)
    const period = periodOf("last_30_days")
    check("the key does not move with the clock, only with what is asked", listingKey(DEFAULT_QUERY, period, TZ) === listingKey({ ...DEFAULT_QUERY }, { ...period }, TZ) && listingKey(DEFAULT_QUERY, period, TZ) !== listingKey({ ...DEFAULT_QUERY, page: 2 }, period, TZ))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) {
    console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
    process.exit(1)
  }
}

main()
