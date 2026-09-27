/**
 * ===========================================================================
 *  HOW LONG THE ANALYTICS PAGE'S ANSWER TAKES, ON A BUSY CREATOR
 * ===========================================================================
 * Run with:  node scripts/bench-analytics.mjs            (Node only)
 *            ANALYTICS_BENCH_PG="-h /tmp/pgs -U storelib" node scripts/bench-analytics.mjs
 *
 * A year of a busy creator (VISITS visits, default 200,000, on a creator
 * page, a OnePage and a website: about 2.5 page views each, their checkout
 * steps and OnePage link clicks) among thirty smaller creators with as many
 * visits again between them, so an index that does not lead with the
 * creator shows.
 *
 * Always: how long lib/analytics/reports.ts takes to count a month of it
 * from the rows in Node (the fallback while analytics_report is missing).
 *
 * With a Postgres to use (a throwaway database is made from the
 * repository's own SQL, tests/fixtures/analytics-sql and the run-now parts,
 * and dropped):
 *   - analytics_report for 7 days, 30 days (in UTC, Los Angeles and
 *     Kolkata), 90 days and 12 months, All and one website, its quick part
 *     and the rest, with no rollup at all, and again after every past day is
 *     rolled up (analytics_refresh_property_day), timed inside Postgres;
 *   - that both give the same answer, and that Node, counting the same rows,
 *     gives it too;
 *   - with PLANS=1, the plan of every statement the function runs
 *     (auto_explain), for the 30 days in Los Angeles.
 */
import { execFileSync } from "node:child_process"
import { join } from "node:path"
import { reportArgs, wireFromRows, type ReportWire, type StepRow, type ViewRow } from "../lib/analytics/reports"
import { midnightOf, addDays, type Ymd } from "../lib/date-range/range"

const VISITS = Number(process.env.VISITS || 200_000)
const PG = process.env.ANALYTICS_BENCH_PG || ""
const DB = "storelib_analytics_bench"
const H = "c0000000-0000-0000-0000-000000000000"
const SITE = "c0000000-5555-0000-0000-000000000000"
const TODAY: Ymd = "2026-09-27"
const NOW = "2026-09-27T12:00:00Z"

const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]

/** The Analytics page's own question for a period of whole days in a zone, with the period before it. */
function question(timeZone: string, days: number) {
  const first = addDays(TODAY, -(days - 1))
  const window = { start: midnightOf(first, timeZone), end: midnightOf(addDays(TODAY, 1), timeZone) }
  const previous = { start: midnightOf(addDays(first, -days), timeZone), end: window.start }
  return { window, previous, args: reportArgs(window, previous, timeZone) }
}

if (!PG) {
  console.log("\n  (set ANALYTICS_BENCH_PG to psql connection arguments to time the database)\n")
  process.exit(0)
}

const pgArgs = PG.split(" ").filter(Boolean)
const psql = (sql: string, db = DB): string =>
  execFileSync("psql", [...pgArgs, "-d", db, "-X", "-q", "-At", "-v", "ON_ERROR_STOP=1", "-c", sql], { maxBuffer: 1 << 30, encoding: "utf8" }).trim()
const psqlFile = (path: string) => execFileSync("psql", [...pgArgs, "-d", DB, "-X", "-q", "-v", "ON_ERROR_STOP=1", "-f", path], { stdio: ["ignore", "ignore", "inherit"] })

function call(timeZone: string, days: number, part: string, property: string | null = null, id: string | null = null): { ms: number; wire: ReportWire } {
  const { args } = question(timeZone, days)
  const arr = (xs: number[]) => `'{${xs.join(",")}}'::bigint[]`
  const fn = `public.analytics_report('${H}', ${property ? `'${property}'` : "NULL"}, ${id ? `'${id}'` : "NULL"}, '${SITE}', NULL, ${args.p_cur_start}, ${args.p_cur_end}, ${args.p_prev_start}, ${args.p_prev_end}, ${arr(args.p_cur_starts)}, ${arr(args.p_prev_starts)}, '${part}', '${NOW}')`
  const out = psql(`create temp table if not exists bench_out (ms numeric, j jsonb); truncate bench_out;
    do $$ declare t0 timestamptz := clock_timestamp(); j jsonb; begin j := ${fn}; insert into bench_out values (round(extract(epoch from clock_timestamp() - t0)::numeric * 1000), j); end $$;
    select ms || '|' || j::text from bench_out`)
  const bar = out.indexOf("|")
  return { ms: Number(out.slice(0, bar)), wire: JSON.parse(out.slice(bar + 1)) as ReportWire }
}
const withoutBookkeeping = (w: ReportWire) => JSON.stringify({ cur: { ...w.cur, rolled_days: 0, raw_runs: 0 }, prev: { ...w.prev, rolled_days: 0, raw_runs: 0 } })

psql(`drop database if exists ${DB}`, "postgres")
psql(`create database ${DB}`, "postgres")
try {
  for (const f of [
    "tests/fixtures/analytics-sql/schema.sql",
    "supabase/sql/run-now/04_event_and_email_types.sql",
    "supabase/sql/run-now/25_analytics_speed.sql",
    "supabase/sql/run-now/32_orders_keep_sales.sql",
    "tests/fixtures/analytics-sql/report_schema.sql",
    "supabase/sql/run-now/61_analytics_one_pipeline.sql",
  ]) psqlFile(join(process.cwd(), f))

  const t = Date.now()
  psql(`
    ALTER TABLE public.analytics_events ALTER COLUMN session_id DROP NOT NULL;
    INSERT INTO public.creators (id, user_id, slug) SELECT ('c0000000-0000-0000-0000-' || lpad(g::text, 12, '0'))::uuid, gen_random_uuid(), 'c' || g FROM generate_series(0, 30) g;
    INSERT INTO public.products (id, creator_id, title) SELECT ('c0000000-1111-0000-0000-' || lpad(g::text, 12, '0'))::uuid, '${H}', 'Product ' || g FROM generate_series(1, 20) g;
    INSERT INTO public.store_theme_installs (id, creator_id, status, sort_order, name) VALUES ('${SITE}', '${H}', 'published', 0, 'Site');
    SELECT setseed(0.7);
    CREATE TABLE bench_visit AS
    SELECT g, CASE WHEN g % 2 = 0 THEN 0 ELSE 1 + g % 30 END AS c, timestamptz '2025-09-27 00:00+00' + random() * interval '365 days' AS t0,
      random() < 0.7 AS consented, floor(random() * ${Math.max(1000, Math.floor(VISITS / 5))})::int AS person, floor(random() * 4)::int AS extra,
      floor(random() * 9)::int AS src, random() AS rp, floor(random() * 20)::int AS prod
    FROM generate_series(1, ${VISITS * 2}) g;
    INSERT INTO public.analytics_events (creator_id, product_id, event_type, session_id, visitor_id, property_type, property_id, path, page_url, source_category, referrer_domain, utm_campaign, device_type, browser, country_code, created_at)
    SELECT ('c0000000-0000-0000-0000-' || lpad(v.c::text, 12, '0'))::uuid,
      CASE WHEN v.c = 0 AND (v.g + k) % 3 = 1 THEN ('c0000000-1111-0000-0000-' || lpad((1 + v.prod)::text, 12, '0'))::uuid END,
      'view', 's_' || v.g, CASE WHEN v.consented THEN 'v_' || v.person ELSE 'anon_' || v.person || '_' || to_char(v.t0 AT TIME ZONE 'UTC', 'YYYYMMDD') END,
      CASE WHEN v.rp < 0.5 THEN 'creator_page' WHEN v.rp < 0.7 THEN 'onepage' ELSE 'website' END,
      CASE WHEN v.rp >= 0.7 AND v.c = 0 THEN '${SITE}'::uuid END,
      CASE WHEN v.rp >= 0.5 AND v.rp < 0.7 THEN '/h/links' WHEN (v.g + k) % 3 = 1 THEN '/products/p' || (1 + v.prod) ELSE (ARRAY['/', '/about', '/shop', '/contact', '/blog/a-long-post-name'])[1 + (v.g + k) % 5] END,
      'https://h.storelib.com/', (ARRAY['direct', 'social_instagram', 'social_instagram', 'social_tiktok', 'organic_search', 'referral', 'email', 'social_youtube', 'paid'])[1 + v.src],
      (ARRAY['Direct', 'l.instagram.com', 'www.instagram.com', 'tiktok.com', 'www.google.com', 'blog.example.org', 'Direct', 'youtube.com', 'Direct'])[1 + v.src],
      CASE WHEN v.src IN (6, 8) THEN 'campaign-' || (v.g % 7) END, (ARRAY['mobile', 'desktop', 'tablet'])[1 + v.g % 3], (ARRAY['Safari', 'Chrome', 'Firefox', 'Edge'])[1 + v.g % 4], (ARRAY['RO', 'US', 'IN', 'GB', 'DE', 'FR'])[1 + v.g % 6],
      v.t0 + k * interval '6 minutes'
    FROM bench_visit v, generate_series(0, CASE WHEN v.rp >= 0.5 AND v.rp < 0.7 THEN 0 ELSE v.extra END) k
    ORDER BY 16;
    INSERT INTO public.analytics_events (creator_id, product_id, event_type, session_id, visitor_id, property_type, property_id, path, created_at)
    SELECT e.creator_id, e.product_id, 'checkout_start', e.session_id, e.visitor_id, e.property_type, e.property_id, '/checkout', e.created_at + interval '1 minute'
    FROM public.analytics_events e WHERE e.event_type = 'view' AND e.product_id IS NOT NULL AND abs(hashtext(e.session_id)) % 4 = 0 ORDER BY e.created_at;
    INSERT INTO public.analytics_events (creator_id, event_type, session_id, visitor_id, property_type, property_id, path, link_id, created_at)
    SELECT e.creator_id, 'link_click', e.session_id, e.visitor_id, e.property_type, e.property_id, e.path, 'blk-' || (abs(hashtext(e.session_id)) % 6), e.created_at + interval '30 seconds'
    FROM public.analytics_events e WHERE e.event_type = 'view' AND e.property_type = 'onepage' AND abs(hashtext(e.session_id)) % 2 = 0 ORDER BY e.created_at;
    DROP TABLE bench_visit;`)
  psql("VACUUM ANALYZE public.analytics_events")
  const size = psql(`select count(*) || ' events, ' || count(*) filter (where creator_id = '${H}' and event_type = 'view') || ' of them the busy creator''s page views' from analytics_events`)
  console.log(`\n  ${size} (made in ${Math.round((Date.now() - t) / 1000)}s)\n`)

  const cases: Array<[string, string, number, string | null, string | null]> = [
    ["7 days, Los Angeles", "America/Los_Angeles", 7, null, null],
    ["30 days, UTC", "UTC", 30, null, null],
    ["30 days, Los Angeles", "America/Los_Angeles", 30, null, null],
    ["30 days, Kolkata", "Asia/Kolkata", 30, null, null],
    ["30 days, the website", "America/Los_Angeles", 30, "website", SITE],
    ["90 days, Los Angeles", "America/Los_Angeles", 90, null, null],
    ["12 months, Los Angeles", "America/Los_Angeles", 365, null, null],
  ]
  const run = (label: string) => {
    console.log(`  ${label}                          figures   the rest`)
    const answers = new Map<string, ReportWire>()
    for (const [name, tz, days, property, id] of cases) {
      call(tz, days, "figures", property, id) /* warm */
      const figures = median([1, 2, 3].map(() => call(tz, days, "figures", property, id).ms))
      const detail = [1, 2, 3].map(() => call(tz, days, "detail", property, id))
      const all = call(tz, days, "all", property, id).wire
      answers.set(name, all)
      console.log(`    ${name.padEnd(26)} ${String(figures).padStart(6)} ms ${String(median(detail.map((d) => d.ms))).padStart(7)} ms   ${all.cur.visitors} visitors, ${all.cur.sessions} visits, ${all.cur.rolled_days} days rolled up`)
    }
    return answers
  }
  const bare = run("No rollup:")
  const rolled = psql(`select sum(public.analytics_refresh_property_day(d::date)) from generate_series(date '2025-09-01', date '2026-09-26', interval '1 day') d`)
  psql("analyze")
  console.log(`\n  analytics_refresh_property_day, every past day: ${rolled} rows\n`)
  const withRollup = run("Every past day rolled up:")
  let differ = 0
  for (const [name] of cases) if (withoutBookkeeping(bare.get(name)!) !== withoutBookkeeping(withRollup.get(name)!)) (differ++, console.log(`    DIFFERENT with the rollup: ${name}`))

  /* Node, counting the same rows: the 30 days in Kolkata. */
  const { window, previous } = question("Asia/Kolkata", 30)
  const from = new Date(previous.start - 86_400_000).toISOString()
  const rows = JSON.parse(psql(`select coalesce(json_agg(e order by e.created_at, e.id), '[]') from (select id::text, event_type, session_id, visitor_id, product_id::text, property_type, property_id::text, path, source_category, referrer_domain, utm_campaign, device_type, browser, country_code, page_url, link_id, link_url, created_at from analytics_events where creator_id = '${H}' and created_at >= '${from}' and created_at < '${new Date(window.end).toISOString()}') e`)) as Array<ViewRow & StepRow>
  const views = rows.filter((r) => r.event_type === "view")
  const steps = rows.filter((r) => r.event_type !== "view")
  const t0 = performance.now()
  const node = wireFromRows({ views, steps, window, previous, timeZone: "Asia/Kolkata", selector: { type: "all" }, defaultWebsite: SITE, product: null, mainDomain: "storelib.com" })
  const nodeMs = Math.round(performance.now() - t0)
  const db = withRollup.get("30 days, Kolkata")!
  const keys = ["visitors", "views", "sessions", "clicks", "product_visitors", "checkouts", "visitor_buckets", "session_buckets"] as const
  const nodeSame = keys.every((k) => JSON.stringify(node.cur[k]) === JSON.stringify(db.cur[k]))
  if (!nodeSame) differ++
  console.log(`\n  Node counts the 30 days in Kolkata from ${rows.length.toLocaleString("en-US")} rows in ${nodeMs} ms: ${nodeSame ? "the same figures" : "DIFFERENT figures"} as the database`)

  if (process.env.PLANS) {
    const { args } = question("America/Los_Angeles", 30)
    const plans = execFileSync("bash", ["-c", `psql ${pgArgs.join(" ")} -d ${DB} -X -q -c "$0" 2>&1`,
      `LOAD 'auto_explain'; SET auto_explain.log_min_duration = 0; SET auto_explain.log_nested_statements = on; SET auto_explain.log_analyze = on; SET auto_explain.log_level = notice; select length(public.analytics_report('${H}', NULL, NULL, '${SITE}', NULL, ${args.p_cur_start}, ${args.p_cur_end}, ${args.p_prev_start}, ${args.p_prev_end}, '{${args.p_cur_starts.join(",")}}'::bigint[], '{${args.p_prev_starts.join(",")}}'::bigint[], 'all', '${NOW}')::text)`], { encoding: "utf8", maxBuffer: 1 << 28 })
    console.log(`\n  The plans, 30 days in Los Angeles:\n${plans}`)
  }
  console.log(`\n  ${differ ? `${differ} DIFFERENT` : "every answer the same"}\n`)
  if (differ) process.exitCode = 1
} finally {
  if (!process.env.KEEP) psql(`drop database if exists ${DB}`, "postgres")
}
