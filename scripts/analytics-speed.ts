/**
 * ===========================================================================
 *  HOW LONG THE ANALYTICS PAGE'S ANSWER TAKES, ON A BUSY STORE
 * ===========================================================================
 * Run with:  node scripts/bench-analytics.mjs            (Node only)
 *            ANALYTICS_BENCH_PG="-h /tmp/pg -p 5432 -U postgres" node scripts/bench-analytics.mjs
 *
 * Builds a synthetic store: EVENTS page views (default 50,000) over the last
 * 30 days and the 30 before, a tenth as many Buy and checkout steps, a
 * thousand orders, and three times as many rows of other creators around
 * them, so an index that does not lead with the creator shows.
 *
 * Always: how long lib/analytics/reports.ts takes to count it in Node.
 *
 * With a Postgres to use (a throwaway database is created and dropped):
 *   - the reads the route used to make: 1,000 rows a page with OFFSET,
 *     one page after another, on the indexes the database had;
 *   - the same rows read by keyset (after the new indexes);
 *   - analytics_visit_tally and analytics_all_time, the counting done where
 *     the rows are;
 *   - and that the database's counts give every figure exactly as the rows
 *     counted in Node do, for several zones and periods.
 *
 * Database times are measured inside Postgres, so they are the server's own
 * work and leave out the network: every page the old route asked for was
 * also one more round trip to Supabase, counted and shown beside it.
 */
import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { join } from "node:path"
import { buildReports, talliesFromWire, tallyArgs, type StepRow, type ViewRow } from "../lib/analytics/reports"
import { groupOrders, isSale, type OrderRow } from "../lib/orders/order-view"
import { moneyOf } from "../lib/analytics/reports"

const EVENTS = Number(process.env.EVENTS || 50_000)
const PG = process.env.ANALYTICS_BENCH_PG || ""
const HOUR = 3_600_000
const DAY = 24 * HOUR
const NOW = Date.parse("2026-09-25T15:20:00Z")

/* mulberry32: small, seeded, and even enough that a session id is not reused by accident. */
let seed = 42
const rnd = () => {
  seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}
const pick = <T,>(xs: T[]) => xs[Math.floor(rnd() * xs.length)]
let made = 0
const uuid = () => {
  const h = createHash("md5").update(String(made++)).digest("hex")
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`
}

const CREATOR = "11111111-1111-4111-8111-111111111111"
const PRODUCTS = [uuid(), uuid(), uuid()]

function median(xs: number[]) {
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.floor(s.length / 2)]
}
function time<T>(fn: () => T, runs = 5): { ms: number; value: T } {
  let value!: T
  const out: number[] = []
  for (let i = 0; i < runs; i++) {
    const t = performance.now()
    value = fn()
    out.push(performance.now() - t)
  }
  return { ms: median(out), value }
}

/* ── the store ─────────────────────────────────────────────────────────── */

interface Ev extends ViewRow {
  creator_id: string
  event_type: string
}

function makeEvents(creator: string, count: number, from: number, to: number): Ev[] {
  const rows: Ev[] = []
  const sessions = Math.max(1, Math.floor(count / 1.6))
  for (let i = 0; i < count; i++) {
    const t = from + Math.floor(rnd() * (to - from))
    const s = Math.floor(rnd() * sessions)
    rows.push({
      id: uuid(),
      creator_id: creator,
      product_id: rnd() < 0.7 ? pick(PRODUCTS) : null,
      event_type: "view",
      session_id: rnd() < 0.85 ? `sess-${s}` : null,
      visitor_id: rnd() < 0.9 ? `vis-${Math.floor(s / 2)}` : null,
      created_at: new Date(t).toISOString(),
      source_category: pick(["direct", "direct", "social_instagram", "social_tiktok", "organic_search", "referral", "email", null]),
      referrer_domain: pick([null, "www.google.com", "instagram.com", "t.co", "storelib.com", "news.ycombinator.com"]),
      country_code: pick(["US", "US", "RO", "DE", "GB", "FR", "BR", "IN", null]),
      country_name: null,
      city: pick([null, "Bucharest", "New York", "Berlin", "S%C3%A3o%20Paulo", "London"]),
      device_type: pick(["mobile", "mobile", "desktop", "tablet", null]),
      browser: pick(["chrome", "safari", "firefox", "edge", null]),
      os: pick(["iOS", "Android", "Windows", "macOS", null]),
      page_url: pick(["https://storelib.com/ana", "https://storelib.com/ana/presets", `https://storelib.com/ana?fbclid=${Math.floor(rnd() * 1e6)}`, "https://anashop.ro/", "https://anashop.ro/p/brushes"]),
      utm_campaign: pick([null, null, null, "Autumn", "launch"]),
    })
  }
  return rows
}

const periodEnd = NOW
const periodStart = NOW - 30 * DAY
const window = { start: periodStart, end: periodEnd }
const previous = { start: periodStart - 30 * DAY, end: periodStart }

const ownViews = makeEvents(CREATOR, EVENTS, previous.start, periodEnd)
const ownSteps: Ev[] = makeEvents(CREATOR, Math.floor(EVENTS / 10), previous.start, periodEnd).map((e) => ({ ...e, event_type: rnd() < 0.6 ? "buy_click" : "checkout_start" }))
const others: Ev[] = []
for (let c = 0; c < 3; c++) others.push(...makeEvents(uuid(), EVENTS, previous.start - 30 * DAY, periodEnd))
const orders: OrderRow[] = Array.from({ length: 1000 }, (_, i) => ({
  id: uuid(),
  product_id: pick(PRODUCTS),
  amount_cents: pick([0, 900, 2000, 4500]),
  status: pick(["completed", "completed", "completed", "refunded", "failed", "pending"]),
  refund_amount_cents: pick([null, 300]),
  created_at: new Date(previous.start - 200 * DAY + Math.floor(rnd() * 260 * DAY)).toISOString(),
  stripe_session_id: i % 7 === 0 ? `cs_${Math.floor(i / 14)}` : null,
  source: pick([null, "storelib", "website"]),
  buyer_country_code: pick(["US", "RO", null]),
  buyer_country: null,
}))

const byTime = (a: { created_at: string; id?: string }, b: { created_at: string; id?: string }) =>
  a.created_at.localeCompare(b.created_at) || String(a.id).localeCompare(String(b.id))

/* ── Node ──────────────────────────────────────────────────────────────── */

console.log(`\nA store with ${EVENTS.toLocaleString("en-US")} page views over 60 days, ${ownSteps.length.toLocaleString("en-US")} steps, ${orders.length} orders\n`)
{
  const views = [...ownViews].sort(byTime)
  const steps = [...ownSteps].sort(byTime).map(({ event_type, session_id, visitor_id, product_id, created_at }) => ({ event_type, session_id, visitor_id, product_id, created_at }))
  const inWindow = orders.filter((o) => {
    const t = Date.parse(o.created_at)
    return t >= previous.start && t < periodEnd
  })
  const r = time(() => buildReports({ views, steps, orders: inWindow, window, previous, timeZone: "America/New_York", mainDomain: "storelib.com", productTitles: {} }))
  console.log(`  Node counts every row (buildReports):      ${r.ms.toFixed(0).padStart(6)} ms`)
}

if (!PG) {
  console.log("\n  (set ANALYTICS_BENCH_PG to psql connection arguments to time the database too)\n")
  process.exit(0)
}

/* ── Postgres ──────────────────────────────────────────────────────────── */

const DB = "storelib_analytics_bench"
const pgArgs = PG.split(" ").filter(Boolean)
function psql(sql: string, db = DB, input?: string): string {
  return execFileSync("psql", [...pgArgs, "-d", db, "-X", "-q", "-At", "-v", "ON_ERROR_STOP=1", "-c", sql], { input, maxBuffer: 1 << 30, encoding: "utf8" }).trim()
}
function psqlFile(path: string) {
  execFileSync("psql", [...pgArgs, "-d", DB, "-X", "-q", "-v", "ON_ERROR_STOP=1", "-f", path], { stdio: ["ignore", "ignore", "inherit"] })
}
function copy(table: string, columns: string[], rows: Array<Record<string, unknown>>) {
  const esc = (v: unknown) => (v === null || v === undefined ? "\\N" : String(v).replace(/\\/g, "\\\\").replace(/\t/g, "\\t").replace(/\n/g, "\\n"))
  const body = rows.map((r) => columns.map((c) => esc(r[c])).join("\t")).join("\n") + "\n"
  execFileSync("psql", [...pgArgs, "-d", DB, "-X", "-q", "-v", "ON_ERROR_STOP=1", "-c", `copy public.${table} (${columns.join(", ")}) from stdin`], { input: body, maxBuffer: 1 << 30 })
}

psql(`drop database if exists ${DB}`, "postgres")
psql(`create database ${DB}`, "postgres")
try {
  /* The tables as production has them, with the indexes it had before. */
  psql(`
    do $$ begin create role anon; exception when others then null; end $$;
    do $$ begin create role authenticated; exception when others then null; end $$;
    do $$ begin create role service_role; exception when others then null; end $$;
    create table public.creators (id uuid primary key, user_id uuid);
    create table public.products (id uuid primary key, creator_id uuid references public.creators(id), title text);
    create table public.analytics_events (
      id uuid primary key, creator_id uuid not null, product_id uuid, event_type text not null,
      session_id text, visitor_id text, source_category text, referrer_domain text, country_code text, country_name text, city text,
      device_type text, browser text, os text, page_url text, utm_campaign text, created_at timestamptz not null);
    create index idx_analytics_creator_type_date on public.analytics_events(creator_id, event_type, created_at desc);
    create index idx_analytics_creator_date on public.analytics_events(creator_id, created_at desc);
    create index idx_analytics_product on public.analytics_events(product_id);
    create table public.orders (id uuid primary key, product_id uuid, amount_cents int, tip_cents int, status text, created_at timestamptz,
      stripe_session_id text, refund_amount_cents int, source text, buyer_country_code text, buyer_country text);
    create index idx_orders_product_id on public.orders(product_id);
    create index idx_orders_created_at on public.orders(created_at desc);
    create table public.onepage_views (id uuid primary key, onepage_id uuid, created_at timestamptz);
    create table public.onepage_clicks (id uuid primary key, onepage_id uuid, created_at timestamptz);
    create table public.onepage_leads (id uuid primary key, onepage_id uuid, created_at timestamptz);
  `)
  psql(`insert into public.creators (id) values ('${CREATOR}'); insert into public.products (id, creator_id, title) values ${PRODUCTS.map((p, i) => `('${p}', '${CREATOR}', 'P${i}')`).join(", ")}`)
  const evCols = ["id", "creator_id", "product_id", "event_type", "session_id", "visitor_id", "source_category", "referrer_domain", "country_code", "country_name", "city", "device_type", "browser", "os", "page_url", "utm_campaign", "created_at"]
  copy("analytics_events", evCols, [...ownViews, ...ownSteps, ...others] as unknown as Array<Record<string, unknown>>)
  copy("orders", ["id", "product_id", "amount_cents", "status", "created_at", "stripe_session_id", "refund_amount_cents", "source", "buyer_country_code", "buyer_country"], orders as unknown as Array<Record<string, unknown>>)
  psql("vacuum analyze")

  const iso = (ms: number) => new Date(ms).toISOString()
  const VIEW_COLUMNS = "id, session_id, visitor_id, product_id, created_at, source_category, referrer_domain, country_code, country_name, city, device_type, browser, os, page_url, utm_campaign"
  const spanSql = `created_at >= '${iso(previous.start)}' and created_at < '${iso(periodEnd)}'`

  /*
    The old reads, as PostgREST ran them: each page one statement, its rows
    turned into JSON (json_agg), one after another. Timed in Postgres, which
    prints the result as a NOTICE.
  */
  const timed = (sql: string): { pages: number; ms: number } => {
    const res = execFileSync("bash", ["-c", `psql ${pgArgs.join(" ")} -d ${DB} -X -q -v ON_ERROR_STOP=1 -c "$0" 2>&1`, sql], { encoding: "utf8" })
    const m = /RESULT (\d+) (\d+)/.exec(res)
    if (!m) throw new Error(res)
    return { pages: Number(m[1]), ms: Number(m[2]) }
  }
  const pagedSql = (from: string, cols: string, where: string, keyset: boolean) =>
    keyset
      ? `do $$ declare t0 timestamptz := clock_timestamp(); pages int := 0; got int; last_t timestamptz; last_id uuid; j json; begin
          loop
            select json_agg(r order by r.created_at, r.id), count(*) into j, got
              from (select ${cols} from ${from} where ${where} and (last_t is null or created_at >= last_t) and (last_t is null or created_at > last_t or id > last_id) order by created_at, id limit 1000) r;
            pages := pages + 1;
            exit when got < 1000;
            last_id := (j->(got-1)->>'id')::uuid;
            last_t := (j->(got-1)->>'created_at')::timestamptz;
          end loop;
          raise notice 'RESULT % %', pages, round(extract(epoch from clock_timestamp() - t0) * 1000); end $$`
      : `do $$ declare t0 timestamptz := clock_timestamp(); pages int := 0; got int; j json; begin
          loop
            select json_agg(r order by r.created_at, r.id), count(*) into j, got from (select ${cols} from ${from} where ${where} order by created_at, id limit 1000 offset pages * 1000) r;
            pages := pages + 1;
            exit when got < 1000;
          end loop;
          raise notice 'RESULT % %', pages, round(extract(epoch from clock_timestamp() - t0) * 1000); end $$`

  const own = `creator_id = '${CREATOR}'`
  const readViews = (keyset: boolean) => timed(pagedSql("public.analytics_events", VIEW_COLUMNS, `${own} and event_type = 'view' and ${spanSql}`, keyset))
  const readSteps = (keyset: boolean) =>
    timed(pagedSql("public.analytics_events", "id, event_type, session_id, visitor_id, product_id, created_at", `${own} and event_type in ('buy_click', 'checkout_start') and ${spanSql}`, keyset))
  const productList = PRODUCTS.map((p) => `'${p}'`).join(", ")
  const readOrders = (keyset: boolean, all: boolean) =>
    timed(pagedSql("public.orders", keyset ? "id, product_id, amount_cents, status, created_at, stripe_session_id, refund_amount_cents, source, buyer_country_code, buyer_country" : "*", `product_id in (${productList})${all ? "" : ` and ${spanSql}`}`, keyset))

  const before = { views: readViews(false), steps: readSteps(false), orders: readOrders(false, false), allOrders: readOrders(false, true) }
  const beforeMs = before.views.ms + before.steps.ms + before.orders.ms + before.allOrders.ms
  const beforeTrips = before.views.pages + before.steps.pages + before.orders.pages + before.allOrders.pages + 4 /* auth, creator, products, probe */ + 1 /* all-time views count */
  console.log(`\n  BEFORE: the rows, 1,000 a page with OFFSET, one page after another`)
  console.log(`    views ${before.views.pages} pages ${before.views.ms} ms, steps ${before.steps.pages} pages ${before.steps.ms} ms, orders ${before.orders.pages} + all-time orders ${before.allOrders.pages} pages ${before.orders.ms + before.allOrders.ms} ms`)
  console.log(`    database work ${beforeMs} ms, in ${beforeTrips} round trips to Supabase, one after another`)
  console.log(`    then Node counts every row (above)`)

  psqlFile(join(process.cwd(), "supabase/migrations/20261002_analytics_report_speed.sql"))
  psql("analyze")

  const after = { views: readViews(true), steps: readSteps(true), orders: readOrders(true, false) }
  console.log(`\n  FALLBACK (functions not installed yet): keyset pages on the new indexes, the reads side by side`)
  console.log(`    views ${after.views.pages} pages ${after.views.ms} ms, steps ${after.steps.pages} pages ${after.steps.ms} ms, orders ${after.orders.pages} pages ${after.orders.ms} ms`)
  console.log(`    slowest chain ${Math.max(after.views.ms, after.steps.ms, after.orders.ms)} ms of database work`)

  const call = (fn: string) => {
    const res = execFileSync("bash", ["-c", `psql ${pgArgs.join(" ")} -d ${DB} -X -q -v ON_ERROR_STOP=1 -c "$0" 2>&1`, `do $$ declare t0 timestamptz := clock_timestamp(); j jsonb; begin j := ${fn}; raise notice 'RESULT 1 %', round(extract(epoch from clock_timestamp() - t0) * 1000); end $$`], { encoding: "utf8" })
    const m = /RESULT 1 (\d+)/.exec(res)
    if (!m) throw new Error(res)
    return Number(m[1])
  }
  const argsFor = (tz: string, w = window, p: typeof previous | null = previous, detail = true, product: string | null = null) => {
    const a = tallyArgs(w, p, tz)
    return `public.analytics_visit_tally('${CREATOR}', ${product ? `'${product}'` : "null"}, '${tz}', ${a.p_cur_start}, ${a.p_cur_end}, ${a.p_prev_start}, ${a.p_prev_end}, array[${a.p_cur_starts.join(",")}]::bigint[], array[${a.p_prev_starts.join(",")}]::bigint[], ${detail})`
  }
  const med = (f: () => number) => median([f(), f(), f()])
  const full = med(() => call(argsFor("America/New_York")))
  const quick = med(() => call(argsFor("America/New_York", window, previous, false)))
  const allTime = med(() => call(`public.analytics_all_time('${CREATOR}', null)`))
  console.log(`\n  AFTER: counted where the rows are, three calls side by side`)
  console.log(`    analytics_visit_tally, the figures (quick)   ${String(quick).padStart(5)} ms`)
  console.log(`    analytics_visit_tally, everything            ${String(full).padStart(5)} ms`)
  console.log(`    analytics_all_time                           ${String(allTime).padStart(5)} ms`)

  /* ── the same figures ─────────────────────────────────────────────── */
  console.log(`\n  The database's counts against Node's, figure by figure`)
  const rowsFor = (where: string, cols: string) =>
    JSON.parse(psql(`select coalesce(json_agg(r order by r.created_at, r.id), '[]') from (select ${cols} from public.analytics_events where ${own} and ${where}) r`)) as Array<ViewRow & StepRow>
  const orderRows = JSON.parse(psql(`select coalesce(json_agg(r order by r.created_at, r.id), '[]') from (select * from public.orders where product_id in (${productList})) r`)) as OrderRow[]
  let same = 0
  let differ = 0
  const cases: Array<{ tz: string; w: { start: number; end: number }; p: { start: number; end: number } | null; product: string | null }> = [
    { tz: "America/New_York", w: window, p: previous, product: null },
    { tz: "Europe/Bucharest", w: { start: NOW - 7 * DAY, end: NOW }, p: { start: NOW - 14 * DAY, end: NOW - 7 * DAY }, product: null },
    { tz: "Asia/Kolkata", w: { start: NOW - DAY, end: NOW }, p: { start: NOW - 2 * DAY, end: NOW - DAY }, product: PRODUCTS[0] },
    { tz: "UTC", w: { start: NOW - 45 * DAY, end: NOW }, p: null, product: null },
    { tz: "Australia/Adelaide", w: { start: NOW - 20 * DAY, end: NOW }, p: { start: NOW - 35 * DAY, end: NOW - 10 * DAY }, product: PRODUCTS[1] },
  ]
  for (const c of cases) {
    const lo = Math.min(c.w.start, c.p?.start ?? c.w.start)
    const hi = Math.max(c.w.end, c.p?.end ?? c.w.end)
    const inRange = (col = "created_at") => `${col} >= '${iso(lo)}' and ${col} < '${iso(hi)}'${c.product ? ` and product_id = '${c.product}'` : ""}`
    const views = rowsFor(`event_type = 'view' and ${inRange()}`, VIEW_COLUMNS) as ViewRow[]
    const steps = (rowsFor(`event_type in ('buy_click', 'checkout_start') and ${inRange()}`, "id, event_type, session_id, visitor_id, product_id, created_at") as StepRow[]).map(
      ({ event_type, session_id, visitor_id, product_id, created_at }) => ({ event_type, session_id, visitor_id, product_id, created_at }),
    )
    const ords = orderRows.filter((o) => (!c.product || o.product_id === c.product) && Date.parse(o.created_at) >= lo && Date.parse(o.created_at) < hi)
    const base = { orders: ords, window: c.w, previous: c.p, timeZone: c.tz, mainDomain: "storelib.com", productTitles: {} }
    const fromRows = JSON.stringify(buildReports({ ...base, views, steps }))
    const wire = JSON.parse(psql(`select ${argsFor(c.tz, c.w, c.p, true, c.product)}`))
    const fromDb = JSON.stringify(buildReports({ ...base, visits: talliesFromWire(wire, true) }))
    const ok = fromRows === fromDb
    ok ? same++ : differ++
    console.log(`    ${ok ? "same     " : "DIFFERENT"} ${c.tz}, ${Math.round((c.w.end - c.w.start) / DAY)} days${c.p ? "" : ", no comparison"}${c.product ? ", one product" : ""}`)
    /* The quick answer's figures are the whole answer's figures. */
    const quickWire = JSON.parse(psql(`select ${argsFor(c.tz, c.w, c.p, false, c.product)}`))
    const q = buildReports({ ...base, visits: talliesFromWire(quickWire, false) })
    const f = JSON.parse(fromRows)
    const quickOk = ["views", "sessions", "conversion", "aov", "sales", "orders"].every((k) => JSON.stringify((q as never)[k]) === JSON.stringify(f[k]))
    quickOk ? same++ : differ++
    if (!quickOk) console.log("    DIFFERENT quick figures")
  }
  const all = JSON.parse(psql(`select public.analytics_all_time('${CREATOR}', null)`))
  const sales = groupOrders(orderRows).filter(isSale)
  const allOk = all.orders === sales.length && Number(all.sales_cents) === sales.reduce((n, o) => n + moneyOf(o).net, 0) && all.views === ownViews.length
  allOk ? same++ : differ++
  console.log(`    ${allOk ? "same     " : "DIFFERENT"} all time: ${all.views} views, ${all.orders} orders, ${all.sales_cents} cents`)
  console.log(`\n  ${same} the same, ${differ} different\n`)
  if (differ) process.exitCode = 1
} finally {
  if (!process.env.KEEP) psql(`drop database if exists ${DB}`, "postgres")
}

