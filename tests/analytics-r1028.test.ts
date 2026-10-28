/**
 * ===========================================================================
 *  ROUND ANA-1028: ANALYTICS, VERY ACCURATE, AGAINST NUMBERS WORKED BY HAND
 * ===========================================================================
 * The owner: "analytics very accurate ... refunds subtracted; test orders
 * excluded; €0.00 revenue with 5 orders may be legit (free orders) but check
 * that paid orders in another currency or market aren't counted as 0", and
 * "revenue from paid communities ... tracked and reported correctly".
 *
 *   1. TEST SALES. The admin console's Test sale writes a real order row,
 *      free and in dollars, tagged source_detail.surface "admin". Five of
 *      them read as 5 orders and 0.00 revenue, and pulled conversion, the
 *      average order value and the returning customer rate with them. A lei
 *      store with three paid orders (one in euros) and five test sales,
 *      through the routes' own code: every figure is the three.
 *   2. A COMMUNITY'S MONEY IN ONE CURRENCY. Its orders, programs, tickets,
 *      refunds and memberships were added up as their own cents and labelled
 *      with whichever row came first: a lei store's 100 lei and 20 euros read
 *      as "120 euros". Now the store's currency, each row at its own day's
 *      rate, anything no rate converts left out and counted.
 *   3. SQL part 328: the all time line leaves test sales out too, and the
 *      refund reads have their indexes; run on a Postgres when there is one.
 *   4. Speed: the reads that do not need the orders go beside them.
 *
 *   npx tsx --conditions=react-server tests/analytics-r1028.test.ts
 */
import { existsSync, readFileSync } from "node:fs"
import { execFileSync } from "node:child_process"
import { FakeSupabase, type Row } from "./fake-supabase"
import { fakeDb } from "./_fake-db"
import type { Reports } from "../lib/analytics/reports"
import { countReportAnswer, reportQuestion, allTimeOf } from "../lib/analytics/report-answer"
import { countCommerce } from "../lib/analytics/commerce-server"
import { isTestSale, withoutTestSales } from "../lib/analytics/test-sales"
import { loadCommunityReport, moneyConverter } from "../lib/communities/server/analytics-report"
import { boundsOf, compareBounds, type RangeValue } from "../lib/date-range/range"

/* No network: the ECB history a conversion may reach for answers nothing. */
process.env.NEXT_PUBLIC_SUPABASE_URL ||= "https://placeholder.supabase.co"
process.env.SUPABASE_SERVICE_ROLE_KEY ||= "placeholder"
globalThis.fetch = (async () => {
  throw new Error("offline")
}) as typeof fetch

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
    console.log(`  FAIL  ${label}${detail !== undefined ? ` (${JSON.stringify(detail)})` : ""}`)
  }
}
const read = (p: string) => readFileSync(p, "utf8")

/* Per euro, as the ECB publishes them: 1 euro is 5 lei and 1.25 dollars. No rate for the CFA franc. */
const RATES = { RON: 5, USD: 1.25 }
const FX = Array.from({ length: 40 }, (_, i) => ({ as_of: new Date(Date.parse("2026-09-25T00:00:00Z") + i * 86_400_000).toISOString().slice(0, 10), rates: RATES, base: "EUR" }))

/* ═══ 1. Test sales ═══════════════════════════════════════════════════════ */

const CREATOR = "eeeeeeee-0000-4000-8000-000000000001"
const USER = "eeeeeeee-0000-4000-8000-0000000000a1"
const EBOOK = "eeeeeeee-1111-4000-8000-000000000001"
const NOW = Date.parse("2026-10-27T12:00:00Z")
const WEEK = { start: Date.parse("2026-10-21T00:00:00Z"), end: NOW }
const BEFORE = { start: Date.parse("2026-10-14T00:00:00Z"), end: Date.parse("2026-10-20T12:00:00Z") }
const TEST = { surface: "admin" }

let n = 0
const order = (o: Row): Row => ({ id: `o-${String(++n).padStart(3, "0")}`, creator_id: CREATOR, product_id: EBOOK, status: "completed", quantity: 1, unit_price_cents: o.amount_cents, property_type: "creator_page", source: "storelib", ...o })

const ORDERS: Row[] = [
  /* A, who bought before: 30.00 lei. */
  order({ amount_cents: 3000, currency: "ron", buyer_email: "a@example.com", created_at: "2026-10-21T10:00:00Z" }),
  /* B: 10.00 euros = 50.00 lei. A paid order in another currency is never 0. */
  order({ amount_cents: 1000, currency: "eur", buyer_email: "b@example.com", created_at: "2026-10-22T10:00:00Z" }),
  /* C: 10.00 lei. C's only earlier "order" is a test sale, so C is new. */
  order({ amount_cents: 1000, currency: "ron", buyer_email: "c@example.com", created_at: "2026-10-24T10:00:00Z" }),
  /* Five admin test sales this week, free and in dollars, as app/api/admin/sales-trigger writes them. */
  ...[22, 23, 23, 24, 25].map((d, i) => order({ amount_cents: 0, tip_cents: 0, currency: "usd", provider: "free", buyer_email: i === 0 ? "a@example.com" : `t${i}@example.com`, source_detail: TEST, created_at: `2026-10-${d}T15:00:00Z` })),
  /* A test sale the week before, and one long before that names C. */
  order({ amount_cents: 0, currency: "usd", buyer_email: "t9@example.com", source_detail: TEST, created_at: "2026-10-15T15:00:00Z" }),
  order({ amount_cents: 0, currency: "usd", buyer_email: "c@example.com", source_detail: TEST, created_at: "2026-09-01T15:00:00Z" }),
  /* A's real earlier order: A is returning. */
  order({ amount_cents: 2000, currency: "ron", buyer_email: "a@example.com", created_at: "2026-09-02T10:00:00Z" }),
]

function world(): FakeSupabase {
  const db = new FakeSupabase()
  db.clock = NOW
  db.table("products", {}, [{ id: EBOOK, creator_id: CREATOR, title: "Ebook", type: "digital" }])
  db.table("creators", { embeds: { products: (r, d) => d.rows("products").filter((p) => p.creator_id === r.id).map((p) => ({ id: p.id, title: p.title, type: p.type })) } }, [{ id: CREATOR, user_id: USER, slug: "ilinca", display_name: "Ilinca" }])
  for (const t of ["store_theme_installs", "onepages", "onepage_views", "onepage_clicks", "custom_domains", "download_events", "fulfillments", "subscribers", "commerce_checkouts", "ledger_events"]) db.table(t, {}, [])
  db.table("store_settings", {}, [{ creator_id: CREATOR, currency: "RON" }])
  db.table("fx_rates", {}, FX as unknown as Row[])
  db.table("orders", {}, ORDERS)
  db.table("analytics_events", {}, ["v1", "v2", "v3", "v4", "v5", "v6"].map((v, i) => ({ id: `e${i}`, event_type: "view", visitor_id: v, session_id: v, created_at: `2026-10-2${1 + i}T09:00:00Z`, property_type: "creator_page", path: "/ilinca", creator_id: CREATOR, source_category: "direct", referrer_domain: "Direct" })) as unknown as Row[])
  return db
}

async function testSales() {
  console.log("\nTest sales: a lei store with three paid orders and five admin test sales this week")
  check("an admin's test sale is told by its source_detail, as an object or as the checkout's short string", isTestSale({ source_detail: { surface: "admin" } }) && isTestSale({ source_detail: "s=admin" }) && !isTestSale({ source_detail: { surface: "onepage" } }) && !isTestSale({ source_detail: null }) && !isTestSale(null))
  const plain = [{ id: "x", source_detail: null }]
  check("  and a list with none is handed back as it is", withoutTestSales(plain) === plain)

  const db = world()
  const url = new URL("https://storelib.com/api/analytics/reports")
  url.searchParams.set("start", new Date(WEEK.start).toISOString())
  url.searchParams.set("end", new Date(WEEK.end).toISOString())
  url.searchParams.set("cstart", new Date(BEFORE.start).toISOString())
  url.searchParams.set("cend", new Date(BEFORE.end).toISOString())
  url.searchParams.set("tz", "UTC")
  const q = await reportQuestion(db as never, USER, url, "storelib.com")
  if ("error" in q) throw new Error(String((q as { error: string }).error))
  const answer = await countReportAnswer(db as never, q.q, q.productTitles, q.productTypes, USER)
  const r = answer.reports as Reports
  /* By hand: 30.00 + 10 euros at 5 lei + 10.00 = 90.00 lei, 3 orders, 6 visitors. */
  check("orders 3, not 8: the five test sales are not orders", r.orders.value === 3, r.orders.value)
  check("revenue 90.00 lei: 30 lei + 10 euros (50 lei at its day's rate) + 10 lei; the euro order is never 0", r.sales.value === 9000, r.sales.value)
  check("conversion 3 of 6 visitors = 50%, not 8 of 6", r.conversion.value === 0.5, r.conversion.value)
  check("the chart's order buckets add up to the total", r.orders.series.current.reduce((a, b) => a + b, 0) === 3, r.orders.series.current)
  check("the week before: no order (its only one was a test sale)", r.orders.previous === 0 && r.sales.previous === 0, [r.orders.previous, r.sales.previous])
  const conv = answer.conversion as { unconverted: number; currency: string }
  check("nothing 'could not be converted': a test sale in dollars no longer counts as an unconverted order", conv.unconverted === 0 && conv.currency === "RON", conv)

  const c = await countCommerce(db as never, { creatorId: CREATOR, properties: q.q.properties, selector: q.q.selector, productId: null, productTypes: q.productTypes, span: WEEK, previous: BEFORE, timeZone: "UTC", mode: "all" })
  check("the sales breakdown agrees: 3 orders, 90.00 lei, average order 30.00 lei (not 11.25 over 8)", c.breakdown.orders === 3 && c.breakdown.total === 9000 && c.breakdown.aov === 3000, [c.breakdown.orders, c.breakdown.total, c.breakdown.aov])
  check("returning customers 1 of 3: A bought before; C's earlier test sale does not make C a customer", c.breakdown.customers === 3 && c.breakdown.returningCustomers === 1, [c.breakdown.customers, c.breakdown.returningCustomers])
  check("no 'Test sales' row among the channels", !c.channels.some((x) => x.key === "admin"), c.channels.map((x) => x.key))

  const all = await allTimeOf(db as never, CREATOR)
  check("all time: 4 orders, 110.00 lei (the three and A's September order), without the seven test sales", all.orders === 4 && all.salesCents === 11000, all)
}

/* ═══ 2. A community's money ══════════════════════════════════════════════ */

const CID = "c0000000-0000-4000-8000-000000001028"
const OWNER = "00000000-0000-4000-8000-000000000001"
const TZ = "Europe/Bucharest"
const CNOW = Date.parse("2026-10-28T10:00:00.000Z")
const CWEEK: RangeValue = { start: "2026-10-19", end: "2026-10-25", preset: "custom" }

function communityTables(withStore: boolean, rows: { orders: Row[]; programs: Row[]; tickets: Row[]; memberships: Row[] }): Record<string, Row[]> {
  return {
    communities: [{ id: CID, owner_user_id: OWNER, creator_id: CREATOR, created_at: "2025-06-01T00:00:00.000Z" }],
    community_members: [{ id: "m1", community_id: CID, user_id: OWNER, status: "active", role: "owner", source: "owner", joined_at: "2026-01-01T00:00:00.000Z" }],
    community_tiers: [{ community_id: CID, product_id: "prod1", billing: "recurring", kind: "paid", name: "Monthly" }],
    store_settings: withStore ? [{ creator_id: CREATOR, currency: "RON" }] : [],
    fx_rates: FX as unknown as Row[],
    orders: rows.orders,
    community_program_access: rows.programs,
    community_module_access: [],
    community_event_tickets: rows.tickets,
    memberships: rows.memberships,
  }
}
const at = (iso: string) => new Date(Date.parse(iso)).toISOString()
const MIXED = {
  orders: [
    /* 100.00 lei. */
    { id: "o1", product_id: "prod1", status: "completed", amount_cents: 10000, refund_amount_cents: null, refunded_at: null, currency: "ron", created_at: at("2026-10-20T12:00:00Z") },
    /* 20.00 euros = 100.00 lei. */
    { id: "o2", product_id: "prod1", status: "completed", amount_cents: 2000, refund_amount_cents: null, refunded_at: null, currency: "eur", created_at: at("2026-10-21T12:00:00Z") },
    /* 40.00 euros, 10.00 given back on the 23rd: 30 euros = 150.00 lei kept, 50.00 lei refunded. */
    { id: "o3", product_id: "prod1", status: "refunded", amount_cents: 4000, refund_amount_cents: 1000, refunded_at: at("2026-10-23T12:00:00Z"), currency: "eur", created_at: at("2026-10-22T12:00:00Z") },
    /* 1,000 CFA francs: no rate, never guessed, counted. */
    { id: "o4", product_id: "prod1", status: "completed", amount_cents: 1000, refund_amount_cents: null, refunded_at: null, currency: "xaf", created_at: at("2026-10-22T13:00:00Z") },
  ],
  /* A program for $25.00 = 20 euros = 100.00 lei. */
  programs: [{ program_id: "pr1", user_id: "u6", community_id: CID, source: "purchase", amount_cents: 2500, currency: "usd", revoked_at: null, created_at: at("2026-10-23T12:00:00Z") }],
  /* A ticket for 10.00 euros = 50.00 lei. */
  tickets: [{ id: "t1", event_id: "e1", community_id: CID, source: "purchase", status: "paid", amount_cents: 1000, currency: "eur", paid_at: at("2026-10-24T12:00:00Z"), refunded_at: null }],
  /* One member paying 9.00 euros a month since September: 45.00 lei a month. */
  memberships: [{ id: "ms1", buyer_id: "u7", product_id: "prod1", status: "active", billing_interval: "month", amount_cents: 900, currency: "eur", created_at: at("2026-09-01T10:00:00Z"), started_at: at("2026-09-01T10:00:00Z"), canceled_at: null, ended_at: null, trial_end: null }],
}

function communityDb(tables: Record<string, Row[]>) {
  const base = fakeDb(tables)
  return { from: base.from, rpc: async () => ({ data: null, error: { code: "PGRST202", message: "Could not find the function" } }) }
}
function cq() {
  const b = boundsOf(CWEEK, TZ, CNOW)
  return { start: b.start, end: b.end, compare: compareBounds(CWEEK, { mode: "previous_period" }, TZ, CNOW), timeZone: TZ }
}

async function communityMoney() {
  console.log("\nA community of a lei store, sold in lei, euros and dollars")
  const r = await loadCommunityReport(communityDb(communityTables(true, MIXED)) as never, { id: CID, owner_user_id: OWNER, creator_id: CREATOR, created_at: "2025-06-01T00:00:00.000Z" }, cq(), CNOW)
  const m = r.money
  const raw = 10000 + 2000 + 3000 + 2500 + 1000
  check(`revenue 500.00 lei: 100 lei + 20 € + 30 € kept of 40 € + $25 + a 10 € ticket, each at its day's rate (the old sum of cents was ${raw / 100} "euros")`, !!m && m.currency === "ron" && m.figures.revenue.value === 50000, m && { currency: m.currency, revenue: m.figures.revenue.value })
  check("  the chart's days add up to it", !!m && m.lines.revenue.current.reduce((a, b) => a + b, 0) === 50000, m?.lines.revenue.current)
  check("by source in lei: memberships 350, programs 100, tickets 50", !!m && JSON.stringify(m.bySource) === JSON.stringify([{ key: "memberships", cents: 35000 }, { key: "programs", cents: 10000 }, { key: "tickets", cents: 5000 }]), m?.bySource)
  check("refunds: one order, 10 € = 50.00 lei given back", !!m && m.refunds.count === 1 && m.refunds.totalCents === 5000, m?.refunds)
  check("monthly revenue 45.00 lei from the 9 € member, one subscriber", !!m && m.figures.mrr.value === 4500 && m.figures.subscribers.value === 1, m && [m.figures.mrr.value, m.figures.subscribers.value])
  check("the CFA franc order is left out of the money and counted, not added as 1,000", !!m && m.unconverted === 1, m?.unconverted)
  check("by plan, in lei, as Revenue counts it", !!m && m.byPlan?.[0]?.cents === 35000 && m.byPlan?.[0]?.label === "Monthly", m?.byPlan)

  console.log("\nA community whose store never chose a currency and always sold in euros: exactly as before")
  const euro = { ...MIXED, orders: MIXED.orders.filter((o) => o.currency === "eur"), programs: [{ ...MIXED.programs[0], amount_cents: 2000, currency: "eur" }] }
  const e = (await loadCommunityReport(communityDb(communityTables(false, euro)) as never, { id: CID, owner_user_id: OWNER, creator_id: CREATOR, created_at: "2025-06-01T00:00:00.000Z" }, cq(), CNOW)).money
  check("in euros, nothing converted: 20 + 30 + 20 + 10 = 80.00 €", !!e && e.currency === "eur" && e.figures.revenue.value === 8000 && e.unconverted === undefined, e && { currency: e.currency, revenue: e.figures.revenue.value, unconverted: e.unconverted })

  const days = FX.map((d) => ({ asOf: d.as_of, rates: d.rates }))
  const yen = moneyConverter("JPY", [{ asOf: "2026-10-20", rates: { JPY: 160, RON: 5 } }]).rows([{ currency: "ron", amount_cents: 3000, at: "2026-10-21T10:00:00Z" }], (x) => x.at, ["amount_cents"])
  check("a conversion into a currency with no decimals: 30.00 lei = 6 € = 960 yen", yen.rows[0].amount_cents === 960 && yen.left === 0, yen)
  const old = moneyConverter("RON", days).rows([{ currency: "eur", amount_cents: 1000, at: "2026-01-02T10:00:00Z" }], (x) => x.at, ["amount_cents"])
  check("a day with no rate within a week is not guessed", old.rows.length === 0 && old.left === 1, old)
}

/* ═══ 3. SQL part 328 ═════════════════════════════════════════════════════ */

function sqlPart() {
  console.log("\nSQL part 328")
  const file = "supabase/sql/run-now/328_analytics_test_sales_and_refund_reads.sql"
  const sql = read(file)
  const lines = sql.trim().split("\n")
  check("every line after the note is one whole statement", lines.slice(1).every((l) => /;\s*$/.test(l)) && lines[0].startsWith("/*") && lines[0].endsWith("*/"))
  const allTime = lines.find((l) => l.startsWith("CREATE OR REPLACE FUNCTION public.analytics_all_time")) ?? ""
  const p61 = read("supabase/sql/run-now/61_analytics_one_pipeline.sql").split("\n").find((l) => l.startsWith("CREATE OR REPLACE FUNCTION public.analytics_all_time")) ?? ""
  check("the all time line is part 61's word for word, with test sales left out", allTime === p61.replace("(p_product_id IS NULL OR o.product_id = p_product_id) )", "(p_product_id IS NULL OR o.product_id = p_product_id) AND coalesce(o.source_detail ->> 'surface', '') <> 'admin' )") && allTime !== p61)
  check("  and stays the server's alone", /REVOKE ALL ON FUNCTION public\.analytics_all_time\(uuid, uuid\) FROM PUBLIC, anon, authenticated;/.test(sql) && /GRANT EXECUTE ON FUNCTION public\.analytics_all_time\(uuid, uuid\) TO service_role;/.test(sql))
  check("the refunds of earlier orders and the ledger's refunds are read by an index", /orders_creator_refunded_at ON public\.orders \(creator_id, refunded_at\) WHERE status = 'refunded'/.test(sql) && /ledger_events_creator_refund_time ON public\.ledger_events \(creator_id, created_at\) WHERE event_type = 'refund'/.test(sql))
  check("listed in the README and read by the after check", read("supabase/sql/run-now/README.md").includes("328_analytics_test_sales_and_refund_reads.sql") && /as p328_analytics_test_sales\b/.test(read("supabase/sql/run-now/99_check_after.sql")))

  const PSQL = ["/usr/bin/psql", "/usr/lib/postgresql/16/bin/psql"].find((p) => existsSync(p))
  const host = process.env.ANALYTICS_PG_HOST
  if (!PSQL || !host) {
    console.log(`  skipped  the Postgres run: ${!PSQL ? "no psql here" : "ANALYTICS_PG_HOST is not set"}`)
    return
  }
  const args = ["-h", host, "-p", process.env.ANALYTICS_PG_PORT || "5432", "-U", process.env.ANALYTICS_PG_USER || "postgres", "-v", "ON_ERROR_STOP=1", "-q"]
  const db = `r1028_${process.pid}`
  const run = (d: string, a: string[], input?: string) => execFileSync(PSQL, [...args, d, ...a], { encoding: "utf8", input })
  run("postgres", ["-c", `drop database if exists ${db}`, "-c", `create database ${db}`])
  try {
    run(db, [], `do $$ begin create role anon; exception when duplicate_object then null; end $$; do $$ begin create role authenticated; exception when duplicate_object then null; end $$; do $$ begin create role service_role; exception when duplicate_object then null; end $$;
      create table orders (id uuid primary key default gen_random_uuid(), creator_id uuid, product_id uuid, stripe_session_id text, status text, amount_cents int, refund_amount_cents int, refunded_at timestamptz, source_detail jsonb, created_at timestamptz default now());
      create table analytics_events (id uuid default gen_random_uuid(), creator_id uuid, product_id uuid, event_type text, property_type text, created_at timestamptz default now());
      create table ledger_events (id uuid default gen_random_uuid(), creator_id uuid, order_id uuid, event_type text, created_at timestamptz default now());
      insert into orders (creator_id, status, amount_cents, source_detail) values ('${CREATOR}', 'completed', 1000, '{"surface":"creator_page"}'), ('${CREATOR}', 'completed', 2500, null), ('${CREATOR}', 'refunded', 2000, null), ('${CREATOR}', 'completed', 0, '{"surface":"admin"}'), ('${CREATOR}', 'completed', 0, '{"surface":"admin"}'), ('${CREATOR}', 'completed', 500, '"s=onepage"');`)
    run(db, ["-f", file])
    run(db, ["-f", file])
    const got = JSON.parse(run(db, ["-tAc", `select public.analytics_all_time('${CREATOR}', null)`]).trim())
    check("on Postgres, twice: 3 sales of 40.00 and a refunded one, the two test sales left out", got.orders === 4 && got.sales_cents === 4000, got)
    const idx = run(db, ["-tAc", "select string_agg(indexname, ',' order by indexname) from pg_indexes where indexname in ('orders_creator_refunded_at', 'ledger_events_creator_refund_time')"]).trim()
    check("  and both indexes are there", idx === "ledger_events_creator_refund_time,orders_creator_refunded_at", idx)
  } finally {
    run("postgres", ["-c", `drop database if exists ${db}`])
  }
}

/* ═══ 4. Speed ════════════════════════════════════════════════════════════ */

function speed() {
  console.log("\nSpeed: what does not need the orders is read beside them")
  const rr = read("lib/analytics/report-read.ts")
  const body = rr.slice(rr.indexOf("export function readOrders("), rr.indexOf("const SUBSCRIBER_COLUMNS"))
  check("the ledger's refunds and the store's currency are asked for before the orders' own read", body.indexOf("refundedOrderIds(admin, creatorId, spans)") < body.indexOf("readSpans<OrderRow>") && body.indexOf("readStoreCurrency(admin, creatorId)") < body.indexOf("readSpans<OrderRow>"))
  const cs = read("lib/analytics/commerce-server.ts")
  check("  and in the sales reports too", cs.indexOf("const ledger = refundedOrderIds(") < cs.indexOf("for (const columns of COLUMN_SETS)") && /const storeCurrency = readStoreCurrency\(admin, q\.creatorId\)\n  const read = await readLines/.test(cs))
}

function onePageRepeats() {
  console.log("\nOnePage: one view an address a day, one tap a visitor, block and day, even after a race")
  const route = read("app/api/onepage/track/route.ts")
  check("the repeat checks read one row (limit 1), so two rows from a race are not an error read as none, which wrote a third", (route.match(/\.limit\(1\)/g) ?? []).length >= 2 && !/\.maybeSingle\(\)\s*\n\s*\n\s*if \(!existing/.test(route) && /if \(!existingView\?\.length\)/.test(route) && /if \(!existingClick\?\.length\)/.test(route))
}

async function main() {
  await testSales()
  onePageRepeats()
  await communityMoney()
  sqlPart()
  speed()
  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) {
    console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
    process.exit(1)
  }
  process.exit(0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
