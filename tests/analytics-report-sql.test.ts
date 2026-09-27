/**
 * ===========================================================================
 *  THE REPORTS AGAINST A REAL POSTGRES
 * ===========================================================================
 * analytics_report (supabase/sql/run-now part 61) answers /app/analytics,
 * Home and the Website and OnePage summaries. Here it runs on a throwaway
 * database made from the repository's own SQL and seeded with two months of
 * visits, OnePage history, orders and sign-ups for two creators
 * (tests/fixtures/analytics-sql/report_seed.sql), and every figure it gives
 * is held to a second answer written another way, straight from the rows:
 *
 *   for All and for each of the creator's places, in UTC, Los Angeles and
 *   Kolkata (a half hour zone), August against July;
 *   before the daily rollup exists and after every day is rolled up (the
 *   answer must not move);
 *   the same rows counted in Node (lib/analytics/reports wireFromRows, the
 *   fallback while the function is missing) give the same answer;
 *   the OnePage's history from before its first event, folded in by
 *   foldLegacyOnePage, is counted once; orders and revenue through
 *   buildReports are the independent sum to the cent;
 *   another creator's website id returns nothing;
 *   every read the function makes can be served by an index;
 *   99_check_after.sql runs, and its p60 columns read true.
 *
 * It needs a Postgres it may create a database in: ANALYTICS_PG_HOST (a host
 * or a socket directory) and ANALYTICS_PG_USER, a superuser. Without one it
 * says so and checks only what it can read.
 */
import { execFileSync } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { buildReports, foldLegacyOnePage, reportArgs, wireFromRows, type ReportWire, type StepRow, type ViewRow, type WindowWire } from "../lib/analytics/reports"
import { midnightOf } from "../lib/date-range/range"
import type { CreatorProperties, PropertySelector } from "../lib/analytics/properties"
import type { OrderRow } from "../lib/orders/order-view"
import { categorizeServerSource, detectClientAppFromUA, referrerHost } from "../lib/analytics/sources"
import { isBotAgent, parseUserAgent } from "../lib/analytics/user-agent"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; failures.push(label); console.log(`  FAIL  ${label}${detail !== undefined ? ` (${typeof detail === "string" ? detail : JSON.stringify(detail).slice(0, 600)})` : ""}`) }
}
const root = process.cwd()
const read = (p: string) => readFileSync(join(root, p), "utf8")
const FIX = "tests/fixtures/analytics-sql"
const PART = "supabase/sql/run-now/61_analytics_one_pipeline.sql"

const A = "a1000000-0000-0000-0000-000000000001"
const OP = "a1000000-7777-0000-0000-000000000001"
const W1 = "a1000000-5555-0000-0000-000000000001"
const W2 = "a1000000-5555-0000-0000-000000000002"
const BEE_SITE = "b1000000-5555-0000-0000-000000000001"
const PLACES: CreatorProperties = { onePageId: OP, websites: [{ id: W1, name: "Studio" }, { id: W2, name: "Shop" }], defaultWebsite: W1 }
const SELECTORS: Array<{ name: string; s: PropertySelector }> = [
  { name: "all", s: { type: "all" } },
  { name: "creator page", s: { type: "creator_page" } },
  { name: "OnePage", s: { type: "onepage" } },
  { name: "live website", s: { type: "website", id: W1 } },
  { name: "offline website", s: { type: "website", id: W2 } },
]
const ZONES = ["UTC", "America/Los_Angeles", "Asia/Kolkata"]
const NOW = "2026-09-27T00:00:00Z"

console.log("\nThe function, as text")
{
  const part = read(PART)
  const report = part.split("\n").find((l) => l.startsWith("CREATE OR REPLACE FUNCTION public.analytics_report(")) ?? ""
  check("analytics_report is in part 61, on one line", report.length > 1000)
  check("  it takes the chart's bucket starts from the caller, so it never works out a calendar of its own", /p_cur_starts bigint\[\], p_prev_starts bigint\[\]/.test(report) && !/AT TIME ZONE p_time_zone/.test(report))
  check("  and is not SECURITY DEFINER: only the server's role may run it", !/SECURITY DEFINER/.test(report) && /^REVOKE ALL ON FUNCTION public\.analytics_report\([^)]*\) FROM PUBLIC, anon, authenticated;$/m.test(part))
}

const PSQL = ["/usr/bin/psql", "/usr/lib/postgresql/16/bin/psql", "/usr/local/bin/psql"].find((p) => existsSync(p))
const HOST = process.env.ANALYTICS_PG_HOST
const USER = process.env.ANALYTICS_PG_USER || "storelib"

function psql(db: string, args: string[]): string {
  try {
    return execFileSync(PSQL!, ["-h", HOST!, "-U", USER, "-d", db, "-v", "ON_ERROR_STOP=1", "-X", "-q", ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 64 * 1024 * 1024 })
  } catch (e) {
    const x = e as { stdout?: string; stderr?: string }
    throw new Error(`${x.stderr || ""}${x.stdout || ""}`.slice(0, 2000))
  }
}
/** Runs SQL and returns psql's notices too (they go to stderr). */
function withNotices(db: string, sql: string): string {
  return execFileSync("/bin/sh", ["-c", `"$0" -h "$1" -U "$2" -d "$3" -v ON_ERROR_STOP=1 -X -q -tA -c "$4" 2>&1`, PSQL!, HOST!, USER, db, sql], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 })
}
function runFile(db: string, file: string): string {
  return execFileSync("/bin/sh", ["-c", `"$0" -h "$1" -U "$2" -d "$3" -v ON_ERROR_STOP=1 -X -q -f "$4" 2>&1`, PSQL!, HOST!, USER, db, join(root, file)], { encoding: "utf8" })
}
const json = <T>(db: string, sql: string): T => JSON.parse(psql(db, ["-tA", "-c", sql]).trim()) as T

/** Stable text of a value: object keys sorted, so two answers compare by content. */
function canon(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canon).join(",")}]`
  if (v && typeof v === "object") return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canon((v as Record<string, unknown>)[k])}`).join(",")}}`
  return JSON.stringify(v)
}
const sortedRows = (rows: unknown[] | undefined) => (rows ?? []).map(canon).sort()

/** The periods: August against July, each a month of the zone's own days. */
function periods(timeZone: string) {
  const window = { start: midnightOf("2026-08-01", timeZone), end: midnightOf("2026-09-01", timeZone) }
  const previous = { start: midnightOf("2026-07-01", timeZone), end: midnightOf("2026-08-01", timeZone) }
  return { window, previous, args: reportArgs(window, previous, timeZone) }
}

function reportCall(s: PropertySelector, timeZone: string, part = "all", creator = A, forgedId?: string): string {
  const { args } = periods(timeZone)
  const type = s.type === "all" ? "NULL" : `'${s.type}'`
  const id = forgedId ? `'${forgedId}'` : s.type === "website" ? `'${s.id}'` : "NULL"
  const arr = (xs: number[]) => `'{${xs.join(",")}}'::bigint[]`
  return `select public.analytics_report('${creator}', ${type}, ${id}, '${W1}', NULL, ${args.p_cur_start}, ${args.p_cur_end}, ${args.p_prev_start}, ${args.p_prev_end}, ${arr(args.p_cur_starts)}, ${arr(args.p_prev_starts)}, '${part}', '${NOW}')::text`
}

/** Which rows of analytics_events `e` a selector counts, as the rules say: a website row that never knew its install is the live one's. */
function where(s: PropertySelector, e = "e"): string {
  if (s.type === "all") return "true"
  if (s.type !== "website") return `${e}.property_type = '${s.type}'`
  return s.id === W1 ? `${e}.property_type = 'website' AND (${e}.property_id = '${W1}' OR ${e}.property_id IS NULL)` : `${e}.property_type = 'website' AND ${e}.property_id = '${s.id}'`
}

/**
 * THE SECOND ANSWER: one period counted straight from analytics_events, with
 * the zone's own calendar (AT TIME ZONE) for the buckets and a window
 * function for where each visit began, none of it shared with part 61.
 */
function independent(s: PropertySelector, timeZone: string, w: { start: number; end: number }, lists: boolean): string {
  const ws = new Date(w.start).toISOString()
  const we = new Date(w.end).toISOString()
  const n = Math.round((w.end - w.start) / 86_400_000)
  const P = where(s)
  const PA = where(s, "a")
  const vk = "coalesce(nullif(e.visitor_id, ''), nullif(e.session_id, ''), 'e:' || e.id::text)"
  const bucket = (col: string) => `((${col} AT TIME ZONE '${timeZone}')::date - ('${ws}'::timestamptz AT TIME ZONE '${timeZone}')::date)`
  const perBucket = (expr: string, from: string) => `(SELECT jsonb_agg((SELECT ${expr} FROM ${from} x WHERE x.b = g) ORDER BY g) FROM generate_series(0, ${n - 1}) g)`
  const map = (key: string, extra = "true") => `(SELECT coalesce(jsonb_object_agg(k, c), '{}'::jsonb) FROM (SELECT ${key} AS k, count(*) AS c FROM starts a WHERE ${extra} GROUP BY 1) m)`
  const detail = lists
    ? `,
    'pages', (SELECT coalesce(jsonb_agg(jsonb_build_array(pt, pid, path, c, v)), '[]') FROM (SELECT property_type AS pt, property_id AS pid, path, count(*) AS c, count(DISTINCT vk) AS v FROM views GROUP BY 1, 2, 3) t),
    'products', (SELECT coalesce(jsonb_agg(jsonb_build_array(product_id, c, v)), '[]') FROM (SELECT product_id, count(*) AS c, count(DISTINCT vk) AS v FROM views WHERE product_id IS NOT NULL GROUP BY 1) t),
    'checkouts', (SELECT count(DISTINCT vk) FROM ev WHERE event_type = 'checkout_start'),
    'links', (SELECT coalesce(jsonb_agg(jsonb_build_array(pt, pid, link, c, v)), '[]') FROM (SELECT property_type AS pt, property_id AS pid, coalesce(link_id, link_url, '') AS link, count(*) AS c, count(DISTINCT vk) AS v FROM clicks GROUP BY 1, 2, 3) t)`
    : ""
  return `
  WITH ev AS (
    SELECT e.*, ${vk} AS vk, ${bucket("e.created_at")} AS b
    FROM public.analytics_events e
    WHERE e.creator_id = '${A}' AND ${P} AND e.created_at >= '${ws}' AND e.created_at < '${we}'
  ), views AS (SELECT * FROM ev WHERE event_type = 'view'),
  clicks AS (SELECT * FROM ev WHERE event_type = 'link_click'),
  keyed AS (
    SELECT e.*, CASE WHEN coalesce(e.session_id, '') <> '' THEN 's:' || e.session_id WHEN coalesce(e.visitor_id, '') <> '' THEN 'v:' || e.visitor_id || ':' || (e.created_at AT TIME ZONE 'UTC')::date ELSE 'e:' || e.id::text END AS sk
    FROM public.analytics_events e WHERE e.creator_id = '${A}' AND e.event_type = 'view' AND e.property_type IS NOT NULL
  ), lagged AS (
    SELECT k.*, lag(k.created_at) OVER (PARTITION BY k.property_type, k.property_id, k.sk ORDER BY k.created_at, k.id) AS before_at FROM keyed k
  ), starts AS (
    SELECT a.*, ((to_timestamp(floor(extract(epoch FROM a.created_at) / 900) * 900) AT TIME ZONE '${timeZone}')::date - ('${ws}'::timestamptz AT TIME ZONE '${timeZone}')::date) AS b
    FROM lagged a
    WHERE (a.before_at IS NULL OR a.before_at < (date_trunc('day', a.created_at AT TIME ZONE 'UTC') - interval '1 day') AT TIME ZONE 'UTC')
      AND a.created_at >= '${ws}' AND a.created_at < '${we}' AND ${PA}
  )
  SELECT jsonb_build_object(
    'visitors', (SELECT count(DISTINCT vk) FROM views),
    'views', (SELECT count(*) FROM views),
    'product_visitors', (SELECT count(DISTINCT vk) FROM views WHERE product_id IS NOT NULL),
    'product_views', (SELECT count(*) FROM views WHERE product_id IS NOT NULL),
    'visitor_buckets', ${perBucket("count(DISTINCT x.vk)", "views")},
    'view_buckets', ${perBucket("count(*)", "views")},
    'clicks', (SELECT count(*) FROM clicks),
    'click_buckets', ${perBucket("count(*)", "clicks")},
    'sessions', (SELECT count(*) FROM starts),
    'session_buckets', ${perBucket("count(*)", "starts")},
    'maps', jsonb_build_object(
      'source', ${map("coalesce(nullif(a.source_category, ''), 'direct')")},
      'referrer', ${map("CASE WHEN coalesce(a.referrer_domain, '') = '' THEN 'direct' ELSE lower(regexp_replace(a.referrer_domain, '^www\\.', '')) END")},
      'campaign', ${map("a.utm_campaign", "coalesce(a.utm_campaign, '') <> ''")},
      'device', ${map("coalesce(nullif(lower(a.device_type), ''), 'unknown')")},
      'country', ${map("coalesce(nullif(upper(a.country_code), ''), 'unknown')")},
      'browser', ${map("coalesce(nullif(lower(a.browser), ''), 'unknown')")}
    )${detail}
  )::text`
}

const FIGURE_KEYS = ["visitors", "views", "product_visitors", "product_views", "visitor_buckets", "view_buckets", "clicks", "click_buckets", "sessions", "session_buckets"] as const
const LIST_KEYS = ["pages", "products", "links"] as const

/** Every difference between the function's period and the second answer's. */
function differences(fn: WindowWire, want: WindowWire, lists: boolean): string[] {
  const out: string[] = []
  for (const k of FIGURE_KEYS) if (canon(fn[k]) !== canon(want[k])) out.push(`${k}: ${canon(fn[k]).slice(0, 120)} vs ${canon(want[k]).slice(0, 120)}`)
  for (const k of ["source", "referrer", "campaign", "device", "country", "browser"] as const) {
    if (canon(fn.maps?.[k] ?? {}) !== canon(want.maps?.[k] ?? {})) out.push(`maps.${k}: ${canon(fn.maps?.[k]).slice(0, 120)} vs ${canon(want.maps?.[k]).slice(0, 120)}`)
  }
  if (lists) {
    for (const k of LIST_KEYS) if (canon(sortedRows(fn[k])) !== canon(sortedRows(want[k]))) out.push(`${k}: ${canon(fn[k]).slice(0, 160)} vs ${canon(want[k]).slice(0, 160)}`)
    if (fn.checkouts !== want.checkouts) out.push(`checkouts: ${fn.checkouts} vs ${want.checkouts}`)
  }
  return out
}
const withoutBookkeeping = (w: ReportWire) => canon({ cur: { ...w.cur, rolled_days: 0, raw_runs: 0 }, prev: { ...w.prev, rolled_days: 0, raw_runs: 0 } })

let reachable = false
if (PSQL && HOST) {
  try {
    psql("postgres", ["-tAc", "select 1"])
    reachable = true
  } catch {
    reachable = false
  }
}

if (!reachable) {
  console.log(`\n  skipped  the Postgres run: ${!PSQL ? "no psql here" : !HOST ? "ANALYTICS_PG_HOST is not set" : "no Postgres answers at ANALYTICS_PG_HOST"}`)
} else {
  const db = `analytics_report_${process.pid}`
  psql("postgres", ["-c", `drop database if exists ${db}`, "-c", `create database ${db}`])
  try {
    console.log("\nA database with two creators' two months")
    for (const f of [`${FIX}/schema.sql`, "supabase/sql/run-now/04_event_and_email_types.sql", "supabase/sql/run-now/25_analytics_speed.sql", "supabase/sql/run-now/32_orders_keep_sales.sql", `${FIX}/report_schema.sql`, "supabase/sql/run-now/60_attribution.sql", PART, `${FIX}/report_seed.sql`]) {
      const out = runFile(db, f)
      if (/ERROR/.test(out)) throw new Error(`${f}: ${out}`)
    }
    const counts = psql(db, ["-tA", "-c", "select count(*) filter (where creator_id = 'a1000000-0000-0000-0000-000000000001'), count(*) from analytics_events"]).trim()
    console.log(`        analytics_events: ${counts.replace("|", " of creator A, ")} in all`)

    /* Node's counting of the same rows (the fallback while the function is missing). */
    const eventRows = json<Array<ViewRow & StepRow>>(db, `select coalesce(json_agg(e order by e.created_at, e.id), '[]')::text from (select id::text, event_type, session_id, visitor_id, product_id::text, property_type, property_id::text, path, source_category, referrer_domain, utm_campaign, device_type, browser, country_code, page_url, link_id, link_url, created_at from analytics_events where creator_id = '${A}') e`)
    const viewRows = eventRows.filter((e) => e.event_type === "view")
    const stepRows = eventRows.filter((e) => e.event_type === "checkout_start" || e.event_type === "link_click")

    const answers = new Map<string, ReportWire>()
    const timings: number[] = []
    for (const timeZone of ZONES) {
      console.log(`\n${timeZone}: August against July, the function against the rows`)
      const { window, previous } = periods(timeZone)
      for (const { name, s } of SELECTORS) {
        const t = Date.now()
        const fn = json<ReportWire>(db, reportCall(s, timeZone))
        timings.push(Date.now() - t)
        answers.set(`${timeZone}|${name}`, fn)
        const cur = json<WindowWire>(db, independent(s, timeZone, window, true))
        const prev = json<WindowWire>(db, independent(s, timeZone, previous, false))
        const d = [...differences(fn.cur, cur, true).map((x) => `cur ${x}`), ...differences(fn.prev, prev, false).map((x) => `prev ${x}`)]
        check(`${name}: ${fn.cur.visitors} visitors, ${fn.cur.views} page views, ${fn.cur.sessions} visits, ${fn.cur.clicks} link clicks, every bucket and list as the rows say`, d.length === 0 && (fn.cur.views ?? 0) > 0 === (cur.views ?? 0) > 0, d)
        check(`  the rollup is not there yet: every day counted from the events`, fn.cur.rolled_days === 0 && (fn.cur.raw_runs ?? 0) >= 1, { rolled: fn.cur.rolled_days, runs: fn.cur.raw_runs })
        const node = wireFromRows({ views: viewRows, steps: stepRows, window, previous, timeZone, selector: s, defaultWebsite: W1, product: null, mainDomain: "storelib.com" })
        const nd = [...differences(fn.cur, node.cur, true).map((x) => `cur ${x}`), ...differences(fn.prev, node.prev, false).map((x) => `prev ${x}`)]
        check(`  Node counts the same rows to the same answer`, nd.length === 0, nd)
      }
      const all = answers.get(`${timeZone}|all`)!
      const parts = SELECTORS.slice(1).map(({ name }) => answers.get(`${timeZone}|${name}`)!)
      check("page views under All are the places' added up; visitors under All are fewer, each person once",
        parts.reduce((n, p) => n + (p.cur.views ?? 0), 0) === all.cur.views && parts.reduce((n, p) => n + (p.cur.visitors ?? 0), 0) > (all.cur.visitors ?? 0),
        { views: [all.cur.views, parts.map((p) => p.cur.views)], visitors: [all.cur.visitors, parts.map((p) => p.cur.visitors)] })
    }
    check("the zones really differ: Los Angeles' and Kolkata's August are not UTC's",
      answers.get("UTC|all")!.cur.views !== answers.get("America/Los_Angeles|all")!.cur.views && answers.get("UTC|all")!.cur.views !== answers.get("Asia/Kolkata|all")!.cur.views)
    console.log(`        analytics_report, August and July, every part: ${Math.min(...timings)} to ${Math.max(...timings)} ms a call (psql included)`)

    console.log("\nWith every day rolled up")
    const rolled = psql(db, ["-tA", "-c", "select sum(public.analytics_refresh_property_day(d::date)) from generate_series(date '2026-06-28', date '2026-09-08', interval '1 day') d"]).trim()
    console.log(`        analytics_refresh_property_day: ${rolled} rows`)
    for (const timeZone of ZONES) {
      for (const { name, s } of SELECTORS) {
        const fn = json<ReportWire>(db, reportCall(s, timeZone))
        const before = answers.get(`${timeZone}|${name}`)!
        check(`${timeZone}, ${name}: the same answer from the rollup (${fn.cur.rolled_days} days rolled, ${fn.cur.raw_runs} counted from the events)`,
          withoutBookkeeping(fn) === withoutBookkeeping(before) && (fn.cur.rolled_days ?? 0) >= 29, { rolled: fn.cur.rolled_days, runs: fn.cur.raw_runs })
      }
    }
    check("in UTC a month is 31 whole days: nothing is counted from the events", answers.size > 0 && json<ReportWire>(db, reportCall({ type: "all" }, "UTC")).cur.raw_runs === 0)

    console.log("\nThe OnePage's history, counted once")
    const since = psql(db, ["-tA", "-c", `select min(created_at) from analytics_events where creator_id = '${A}' and property_type = 'onepage' and property_id = '${OP}' and event_type = 'view'`]).trim()
    const sinceMs = Number(psql(db, ["-tA", "-c", `select (extract(epoch from '${since}'::timestamptz) * 1000)::bigint`]).trim())
    check("the switch is the OnePage's first event: 2026-08-10, after which both tables hold every visit", new Date(sinceMs).toISOString().startsWith("2026-08-10T"), since)
    const shared = psql(db, ["-tA", "-c", `select count(*) from (select distinct visitor_id from onepage_views where onepage_id = '${OP}') o join (select distinct visitor_id from analytics_events where creator_id = '${A}') e using (visitor_id)`]).trim()
    check("the two tables' visitor ids never match (an address and browser hash against the visitor cookie or the daily hash)", shared === "0", shared)
    const legacyViews = json<Array<{ id: string; visitor_id: string; referrer: string; user_agent: string; country_code: string | null; created_at: string }>>(db, `select coalesce(json_agg(v), '[]')::text from (select id::text, visitor_id, referrer, user_agent, country_code, created_at from onepage_views where onepage_id = '${OP}') v`)
    const legacyClicks = json<Array<{ id: string; block_id: string; url: string; visitor_id: string; created_at: string }>>(db, `select coalesce(json_agg(c), '[]')::text from (select id::text, block_id, url, visitor_id, created_at from onepage_clicks where onepage_id = '${OP}') c`)
    const deps = {
      isBot: isBotAgent,
      categorize: (host: string, ua: string | null) => categorizeServerSource(host || "Direct", null, null, detectClientAppFromUA(ua)),
      parseAgent: parseUserAgent,
      hostOf: referrerHost,
      mainDomain: "storelib.com",
    }
    const orders = json<OrderRow[]>(db, `select coalesce(json_agg(o), '[]')::text from (select id::text, product_id::text, amount_cents, tip_cents, status, created_at, stripe_session_id, refund_amount_cents, source, source_detail, property_type, property_id::text from orders where creator_id = '${A}') o`)
    for (const timeZone of ZONES) {
      const { window, previous } = periods(timeZone)
      const ws = new Date(window.start).toISOString()
      const we = new Date(window.end).toISOString()
      for (const { name, s } of SELECTORS) {
        const wire = answers.get(`${timeZone}|${name}`)!
        const folded = foldLegacyOnePage(wire, { onePageId: OP, since: sinceMs, views: legacyViews, clicks: legacyClicks }, { window, previous, timeZone, selector: s, product: null }, deps)
        const counted = s.type === "all" || s.type === "onepage"
        const old = json<{ visitors: number; views: number; clicks: number }>(db, `select json_build_object('visitors', count(distinct visitor_id), 'views', count(*), 'clicks', (select count(*) from onepage_clicks where onepage_id = '${OP}' and created_at >= '${ws}' and created_at < least('${we}'::timestamptz, '${since}'::timestamptz)))::text
          from onepage_views where onepage_id = '${OP}' and created_at >= '${ws}' and created_at < least('${we}'::timestamptz, '${since}'::timestamptz) and user_agent not ilike '%bot%' and user_agent not ilike 'facebookexternalhit%'`)
        const wantVisitors = (wire.cur.visitors ?? 0) + (counted ? old.visitors : 0)
        const wantViews = (wire.cur.views ?? 0) + (counted ? old.views : 0)
        const wantClicks = (wire.cur.clicks ?? 0) + (counted ? old.clicks : 0)
        if (s.type === "all" || s.type === "onepage" || timeZone === "UTC") {
          check(`${timeZone}, ${name}: ${counted ? `${old.visitors} people from before the switch added, robots and the old table's copies after it left out` : "no OnePage history under another place"}`,
            folded.cur.visitors === wantVisitors && folded.cur.views === wantViews && folded.cur.clicks === wantClicks,
            { got: [folded.cur.visitors, folded.cur.views, folded.cur.clicks], want: [wantVisitors, wantViews, wantClicks] })
        }

        /* Orders and revenue through buildReports against the sum in SQL, by the Orders page's rules. */
        const r = buildReports({ wire: folded, orders, window, previous, timeZone, mainDomain: "storelib.com", productTitles: {}, selector: s, properties: PLACES })
        const place = s.type === "all" ? "true" : s.type === "website" ? (s.id === W1 ? "pt = 'website' and (pid is null or pid = '" + W1 + "')" : "pt = 'website' and pid = '" + s.id + "'") : `pt = '${s.type}'`
        const want = json<{ orders: number; cents: number }>(db, `
          with pay as (
            select coalesce(stripe_session_id, id::text) as k,
              (array_agg(created_at order by created_at, id))[1] as at,
              bool_and(status = 'failed') as failed, bool_or(status = 'pending') as pending, bool_or(status = 'disputed') as disputed,
              sum(greatest(amount_cents, 0) - case when status = 'refunded' then case when refund_amount_cents > 0 then least(refund_amount_cents, greatest(amount_cents, 0)) else greatest(amount_cents, 0) end else 0 end) as net,
              (array_agg(property_type order by created_at, id) filter (where property_type in ('creator_page', 'onepage', 'website')))[1] as own_type,
              (array_agg(property_id order by created_at, id) filter (where property_type in ('creator_page', 'onepage', 'website')))[1] as own_id,
              (array_agg(source order by created_at, id) filter (where source in ('website', 'storelib')))[1] as src,
              count(*) as lines, bool_or(source_detail->>'surface' = 'onepage') as onepage
            from orders where creator_id = '${A}' group by 1
          ), placed as (
            select *, case when own_type is not null then own_type when coalesce(src, case when lines > 1 then 'website' end) = 'website' then 'website' when onepage then 'onepage' else 'creator_page' end as pt,
              case when own_type in ('onepage', 'website') then own_id::text end as pid
            from pay
          )
          select json_build_object('orders', count(*), 'cents', coalesce(sum(net), 0))::text from placed
          where not failed and not pending and not disputed and at >= '${ws}' and at < '${we}' and ${place}`)
        check(`${timeZone}, ${name}: ${want.orders} orders and $${(want.cents / 100).toFixed(2)}, to the cent`, r.orders.value === want.orders && r.sales.value === want.cents, { got: [r.orders.value, r.sales.value], want })
        if (s.type === "all" && timeZone === "UTC") {
          check("  conversion is orders over unique visitors", r.conversion.value === want.orders / (folded.cur.visitors ?? 1), r.conversion.value)
        }
      }
    }

    console.log("\nAnother creator's place")
    const forged = json<ReportWire>(db, reportCall({ type: "website", id: BEE_SITE }, "UTC", "all", A))
    check("creator A asking for creator B's website gets nothing at all",
      forged.cur.visitors === 0 && forged.cur.views === 0 && forged.cur.sessions === 0 && (forged.cur.pages ?? []).length === 0 && (forged.cur.links ?? []).length === 0 && Object.keys(forged.cur.maps?.source ?? {}).length === 0, forged.cur)
    const bee = json<ReportWire>(db, reportCall({ type: "all" }, "UTC", "all", "b1000000-0000-0000-0000-000000000002"))
    check("  while B's own report has B's visits, none of them in A's", (bee.cur.views ?? 0) > 0 && (bee.cur.pages ?? []).every((p) => p[1] === null || String(p[1]).startsWith("b1000000")))

    console.log("\nEvery read can be served by an index")
    const plans = withNotices(db, `LOAD 'auto_explain'; SET auto_explain.log_min_duration = 0; SET auto_explain.log_nested_statements = on; SET auto_explain.log_level = notice; SET enable_seqscan = off; ${reportCall({ type: "website", id: W1 }, "Asia/Kolkata")}`)
    const seq = plans.split("\n").filter((l) => /Seq Scan on analytics_(events|property_daily)/.test(l))
    check("with sequential scans made a last resort, no read of the events or the rollup needs one", seq.length === 0 && /Index (Only )?Scan|Bitmap Index Scan/.test(plans), seq.slice(0, 3))

    console.log("\nA day of 25 hours, and a zone 5:45 ahead of UTC")
    {
      /*
        Visits at 23:30 on the clock of Los Angeles and of Kathmandu, and on
        either side of the night Los Angeles turns its clocks back
        (2026-11-01, 1:30 happens twice). Each visit is one person and one
        visit, so every day's count is how many of them that zone's calendar
        puts on that day, worked out here with Intl and nothing else of ours.
      */
      const at = [
        "2026-10-31T23:30:00-07:00",
        "2026-11-01T01:30:00-07:00",
        "2026-11-01T01:30:00-08:00",
        "2026-11-01T23:30:00-08:00",
        "2026-11-02T00:10:00-08:00",
        "2026-11-01T23:30:00+05:45",
        "2026-11-02T00:05:00+05:45",
        "2026-11-01T18:10:00Z",
        "2026-11-02T18:14:00Z",
        "2026-11-02T18:16:00Z",
      ].map((t) => new Date(t).toISOString())
      psql(db, ["-c", `insert into analytics_events (creator_id, event_type, session_id, visitor_id, property_type, path, source_category, created_at) select '${A}', 'view', 'dst_s' || i, 'dst_v' || i, 'creator_page', '/ana', 'direct', t::timestamptz from unnest(array['${at.join("','")}']) with ordinality u(t, i)`])
      const dstRows = json<ViewRow[]>(db, `select coalesce(json_agg(e order by e.created_at, e.id), '[]')::text from (select id::text, event_type, session_id, visitor_id, product_id::text, property_type, property_id::text, path, source_category, referrer_domain, utm_campaign, device_type, browser, country_code, page_url, created_at from analytics_events where creator_id = '${A}' and created_at >= '2026-10-29' and created_at < '2026-11-06') e`)
      const localDay = (iso: string, tz: string) => new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso))
      const days = ["2026-10-31", "2026-11-01", "2026-11-02", "2026-11-03"]
      const call = (tz: string) => {
        const window = { start: midnightOf(days[0], tz), end: midnightOf("2026-11-04", tz) }
        const a = reportArgs(window, null, tz)
        const arr = (xs: number[]) => `'{${xs.join(",")}}'::bigint[]`
        return { window, fn: json<ReportWire>(db, `select public.analytics_report('${A}', 'creator_page', NULL, '${W1}', NULL, ${a.p_cur_start}, ${a.p_cur_end}, ${a.p_prev_start}, ${a.p_prev_end}, ${arr(a.p_cur_starts)}, ${arr(a.p_prev_starts)}, 'all', '2026-11-20T00:00:00Z')::text`), starts: a.p_cur_starts }
      }
      const first: Record<string, ReportWire> = {}
      for (const tz of ["America/Los_Angeles", "Asia/Kathmandu", "UTC"]) {
        const { window, fn, starts } = call(tz)
        first[tz] = fn
        const want = days.map((d) => at.filter((t) => localDay(t, tz) === d).length)
        check(`${tz}: four days, the chart's buckets start at each local midnight`, starts.length === 4 && starts.every((s, i) => s === midnightOf(days[i], tz)), starts.map((s) => new Date(s).toISOString()))
        check(`  page views, visitors and visits land on the zone's own day: ${want.join(", ")}`,
          canon(fn.cur.view_buckets) === canon(want) && canon(fn.cur.visitor_buckets) === canon(want) && canon(fn.cur.session_buckets) === canon(want),
          { views: fn.cur.view_buckets, visitors: fn.cur.visitor_buckets, visits: fn.cur.session_buckets, want })
        const node = wireFromRows({ views: dstRows, steps: [], window, previous: null, timeZone: tz, selector: { type: "creator_page" }, defaultWebsite: W1, product: null, mainDomain: "storelib.com" })
        check("  and Node counts the same", canon(node.cur.view_buckets) === canon(want) && canon(node.cur.session_buckets) === canon(want), { node: [node.cur.view_buckets, node.cur.session_buckets] })
      }
      check("  2026-11-01 in Los Angeles is 25 hours long and holds both 1:30s", midnightOf("2026-11-02", "America/Los_Angeles") - midnightOf("2026-11-01", "America/Los_Angeles") === 25 * 3_600_000)
      psql(db, ["-tA", "-c", "select sum(public.analytics_refresh_property_day(d::date)) from generate_series(date '2026-10-29', date '2026-11-05', interval '1 day') d"])
      for (const tz of ["America/Los_Angeles", "Asia/Kathmandu", "UTC"]) {
        const { fn } = call(tz)
        check(`${tz}: the same days from the rollup (${fn.cur.rolled_days} days rolled up)`, withoutBookkeeping(fn) === withoutBookkeeping(first[tz]) && (fn.cur.rolled_days ?? 0) >= 2, { rolled: fn.cur.rolled_days, got: fn.cur.session_buckets, before: first[tz].cur.session_buckets })
      }
    }

    console.log("\nThe check after")
    const check99 = psql(db, ["-x", "-f", join(root, "supabase/sql/run-now/99_check_after.sql")])
    check("the whole of 99_check_after.sql runs", /p61_analytics_one_pipeline/.test(check99))
    check("  and both p60 columns read true", /p61_analytics_one_pipeline\s*\|\s*t/.test(check99) && /p61_analytics_reports\s*\|\s*t/.test(check99), check99.split("\n").filter((l) => /p60/.test(l)))
  } catch (e) {
    check("the Postgres run finished", false, (e as Error).message)
  } finally {
    try {
      psql("postgres", ["-c", `drop database if exists ${db}`])
    } catch {
      /* left for the next run's drop */
    }
  }
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) {
  for (const f of failures) console.log(`  - ${f}`)
  process.exit(1)
}
