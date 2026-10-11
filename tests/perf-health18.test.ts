/**
 * /admin/performance and what feeds it (round 18, H18A):
 *
 *   lib/perf/scoring.ts            the Health Index rules
 *   lib/perf/problems.ts           problems ranked by user impact
 *   lib/perf/routes.ts             area and route pattern of a page
 *   lib/perf/telemetry.ts          what a beacon may say
 *   lib/perf/beacon-client.ts      the browser collector
 *   components/perf/perf-beacon.tsx the dice, before anything loads
 *   lib/perf/server-timing.ts      the API timing wrapper
 *   supabase/sql/run-now/126_perf_health.sql  storage, cap, retention
 *   app/admin/performance/**, app/api/perf/admin  the page, admin only
 *
 * The rule through all of it: a number on the page is measured, and a
 * number that is not there says "insufficient data".
 */

import { readFileSync } from "node:fs"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"

import { PerformanceAdmin } from "@/app/admin/performance/performance-admin"
import { CLIENT_SAMPLE_RATE, DAILY_CAP, FULL_VIEWS_PER_PAGE_LOAD, MAX_BATCH, MAX_ERRORS_PER_PAGE, MAX_ITEMS_PER_PAGE_LOAD, MIN_RATE_BASE, MIN_SAMPLES, RAW_RETENTION_DAYS, ROLLUP_RETENTION_DAYS, SERVER_ROUTE_PER_MINUTE, SERVER_SAMPLE_RATE } from "@/lib/perf/config"
import { allowedBeacon, type HitStore } from "@/lib/perf/limit"
import { OPTIMIZATIONS, type Optimization } from "@/lib/perf/optimizations"
import { rankProblems } from "@/lib/perf/problems"
import type { PerfReport } from "@/lib/perf/report"
import { windowOf } from "@/lib/perf/report"
import { classify, isStorelibHost } from "@/lib/perf/routes"
import {
  MIN_SUB_SCORES,
  NO_EXTRAS,
  SUB_SCORES,
  errorsPer100,
  healthIndex,
  measureScore,
  p75Of,
  rateValue,
  scoreBand,
  scoreSub,
  type Aggregate,
} from "@/lib/perf/scoring"
import { cleanBatch, maskDetail, serverRow } from "@/lib/perf/telemetry"
import { pendingTimings, timed } from "@/lib/perf/server-timing"

let passed = 0
let failed = 0
const failures: string[] = []

function check(name: string, ok: boolean, detail?: string) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    failures.push(name)
    console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ""}`)
  }
}

const read = (p: string) => readFileSync(p, "utf8")

function agg(area: string, metric: string, samples: number, p75: number, device = "*", bad = 0, route = "*"): Aggregate {
  return { area, device, route, metric, samples, p50: p75, p75, p95: p75, bad }
}

async function main() {
  console.log("\nThe contract H18B fills")
  {
    const src = read("lib/perf/optimizations.ts")
    check("Optimization has id, title, area, shippedAt, before?, after?, note?", /export type Optimization = \{\s*id: string\s*title: string\s*area: string\s*shippedAt: string\s*before\?: \{ metric: string; value: number; unit: string \}\s*after\?: \{ metric: string; value: number; unit: string \}\s*note\?: string\s*\}/.test(src))
    check("OPTIMIZATIONS is an array of them", Array.isArray(OPTIMIZATIONS) && /export const OPTIMIZATIONS: Optimization\[\]/.test(src))
    const entries: Optimization[] = OPTIMIZATIONS
    check("every entry has a date and, when measured, both sides", entries.every((o) => /^\d{4}-\d{2}-\d{2}$/.test(o.shippedAt) && (!o.before === !o.after)))
  }

  console.log("\nRule 2: a measurement's score")
  check("100 at zero", measureScore(0, 2500, 4000) === 100)
  check("90 on the good line", measureScore(2500, 2500, 4000) === 90)
  check("95 halfway to the good line", measureScore(1250, 2500, 4000) === 95)
  check("50 on the poor line", measureScore(4000, 2500, 4000) === 50)
  check("70 halfway between good and poor", measureScore(3250, 2500, 4000) === 70)
  check("0 at twice the poor line and past it", measureScore(8000, 2500, 4000) === 0 && measureScore(20000, 2500, 4000) === 0)
  check("a count whose good line is zero: 100 at zero, 50 at poor", measureScore(0, 0, 5) === 100 && measureScore(5, 0, 5) === 50)
  check("a value that is not a number scores 0, never 100", measureScore(Number.NaN, 200, 500) === 0)
  check("Google's ratings", rateValue(0.1, 0.1, 0.25) === "good" && rateValue(0.2, 0.1, 0.25) === "needs-improvement" && rateValue(0.3, 0.1, 0.25) === "poor")
  check("bands: 90 good, 50 needs work, under 50 poor", scoreBand(90) === "good" && scoreBand(89) === "needs-improvement" && scoreBand(50) === "needs-improvement" && scoreBand(49) === "poor")

  console.log("\nRule 3: not enough data is insufficient data")
  {
    const few = [agg("app", "lcp", MIN_SAMPLES - 1, 1000)]
    check(`a percentile under ${MIN_SAMPLES} samples does not count`, !p75Of(few, "app", "lcp").enough)
    check(`at ${MIN_SAMPLES} it does`, p75Of([agg("app", "lcp", MIN_SAMPLES, 1000)], "app", "lcp").enough)
    const r = errorsPer100([agg("app", "view", MIN_RATE_BASE - 1, 1), agg("app", "js_error", 3, 1)], "app")
    check(`an error rate under ${MIN_RATE_BASE} page views does not count`, !r.enough)
    const r2 = errorsPer100([agg("app", "view", 200, 1), agg("app", "js_error", 3, 1)], "app")
    check("errors per 100 page views", r2.enough && r2.value === 1.5)
    check("no page views is no rate at all, never zero", errorsPer100([], "app").value === null)
  }

  console.log("\nRules 4 and 5: sub scores and the Health Index")
  {
    const empty = healthIndex([], NO_EXTRAS)
    check("nothing measured: no Health Index", empty.score === null && empty.used === 0)
    check("nothing measured: every sub score is insufficient data", empty.subs.every((s) => s.score === null && s.measures.every((m) => m.score === null && !m.enough)))
    check("nine sub scores, the owner's list", SUB_SCORES.map((s) => s.id).join(",") === "app,storefront,explore,community,builder,database,checkout,infra,mobile")

    const explore = SUB_SCORES.find((s) => s.id === "explore")!
    const one = scoreSub(explore, [agg("explore", "lcp", 100, 2500)], NO_EXTRAS)
    check("a sub score with one measurement of five is insufficient", one.score === null && one.used === 1)
    const two = scoreSub(explore, [agg("explore", "lcp", 100, 2500), agg("explore", "cls", 100, 0)], NO_EXTRAS)
    check("with two it is their plain average", two.score === 95 && two.used === 2)

    const aggs = [
      agg("explore", "lcp", 100, 2500), agg("explore", "cls", 100, 0.1), // 90, 90
      agg("app", "inp", 100, 500), agg("app", "nav", 100, 1000), // 50, 50
    ]
    const two_subs = healthIndex(aggs, NO_EXTRAS)
    check(`fewer than ${MIN_SUB_SCORES} sub scores: no Health Index`, two_subs.score === null && two_subs.used === 2)
    const three = healthIndex([...aggs, agg("builder", "lcp", 100, 0), agg("builder", "inp", 100, 0)], NO_EXTRAS)
    // explore 90 (w1), app 50 (w1.5), builder 100 (w1) => (90 + 75 + 100) / 3.5 = 75.7
    check("the weighted average of the sub scores that have one", three.score === 76, String(three.score))

    const infra = SUB_SCORES.find((s) => s.id === "infra")!
    check("infrastructure without a token is insufficient data", scoreSub(infra, [], { ...NO_EXTRAS, jobs: { late: 0, known: 5 } }).score === null)
    check("with Supabase's health it scores", scoreSub(infra, [], { ...NO_EXTRAS, jobs: { late: 0, known: 5 }, supabaseDown: 0 }).score === 100)
    const checkout = SUB_SCORES.find((s) => s.id === "checkout")!
    const pay = scoreSub(checkout, [agg("checkout", "api", 100, 300, "*", 0)], { ...NO_EXTRAS, payments: { failed: 5, completed: 95 } })
    check("failed payments: 5 of 100 is on the good line", pay.measures.find((m) => m.key === "checkout.payments")?.score === 90 && pay.score !== null)
    check("fewer than 20 orders is insufficient", scoreSub(checkout, [], { ...NO_EXTRAS, payments: { failed: 1, completed: 10 } }).measures.find((m) => m.key === "checkout.payments")?.enough === false)
  }

  console.log("\nProblems, ranked by user impact")
  {
    const list = rankProblems(
      [
        agg("explore", "lcp", 300, 4000, "*", 0, "/explore"), // severity 0.5, impact 150
        agg("builder", "lcp", 40, 8000, "*", 0, "/app/website-builder"), // severity 1, impact 40
        agg("app", "lcp", 10, 9000, "*", 0, "/app"), // too few samples
        agg("app", "lcp", 500, 1000, "*", 0, "/app/products"), // under the good line
        agg("community", "api", 200, 200, "*", 3, "/api/community/:id/posts"), // 3 failures
      ],
      [{ detail: "TypeError: x", area: "app", route: "/app", n: 60, lastAt: null }],
    )
    check("a common slow page outranks a rare very slow one", list[0].id === "slow:explore:/explore:lcp" && list.findIndex((p) => p.id.includes("website-builder")) > list.findIndex((p) => p.id.includes("js-error")))
    check("too few samples or under the good line is not a problem", !list.some((p) => p.id.includes(":/app:") && p.kind === "slow") && !list.some((p) => p.id.includes("/app/products")))
    check("server errors are listed with their count", list.some((p) => p.kind === "api-error" && p.samples === 3))
    check("nothing measured, no problems", rankProblems([], null).length === 0)
  }

  console.log("\nWhich page is which")
  {
    const c = (p: string) => JSON.stringify(classify(p))
    check("the dashboard", c("/app/products") === JSON.stringify({ area: "app", route: "/app/products" }))
    check("an order id never stored", classify("/app/orders/3f2b7c1e-1111-4222-8333-444455556666")?.route === "/app/orders/:id")
    check("the builder", classify("/app/website-builder/navigation")?.area === "builder" && classify("/app/courses/abc/builder")?.route === "/app/courses/:id/builder")
    check("Explore", classify("/explore")?.route === "/explore" && classify("/explore/art")?.route === "/explore/:category")
    check("a community post, no slug kept", classify("/community/salajanywood/post/123")?.route === "/community/:slug/post/:id" && classify("/c/salajanywood/learn/prog?lesson=lesson-1")?.route === "/c/:slug/learn/:id")
    check("a creator page and a product", classify("/mara")?.route === "/:seller" && classify("/mara/my-presets")?.area === "product")
    check("admin, sign in and marketing pages are not measured", classify("/admin") === null && classify("/login") === null && classify("/pricing") === null && classify("/") === null)
    check("published sites on their own address are left to their own collector", !isStorelibHost("mara.storelib.com") && !isStorelibHost("shop.example.com") && isStorelibHost("storelib.com") && isStorelibHost("www.storelib.com"))
  }

  console.log("\nWhat a beacon may say")
  {
    const rows = cleanBatch(
      {
        i: [
          ["lcp", "explore", "/explore", 2300.6],
          ["lcp", "explore", "/explore", 90_000], // past a minute: dropped
          ["evil", "explore", "/explore", 1],
          ["lcp", "sites", "/", 1], // sites have their own collector
          ["lcp", "explore", "/Explore?q=me@x.com", 1],
          ["cls", "app", "/app", 0.123456],
          ["view", "app", "/app", 999],
          ["js_error", "app", "/app", 1, "Failed for anna@example.com on 3f2b7c1e-1111-4222-8333-444455556666 at https://storelib.com/x?token=abc order 123456"],
        ],
        cookie: "ignored",
      },
      "mobile",
    )
    check("only known metrics, areas and route patterns pass", rows.length === 4 && rows.every((r) => r.d === "mobile"))
    check("numbers rounded and clamped", rows[0].v === 2301 && rows.find((r) => r.m === "cls")?.v === 0.1235 && rows.find((r) => r.m === "view")?.v === 1)
    const err = rows.find((r) => r.m === "js_error")?.x ?? ""
    check("an error message keeps no address, id, number or query", !/anna|example\.com\b(?!\/)|3f2b7c1e|token|123456/.test(err) && err.includes("<email>"), err)
    const many = cleanBatch({ i: Array.from({ length: 100 }, () => ["view", "app", "/app", 1]) }, "desktop")
    check(`at most ${MAX_BATCH} items a beacon`, many.length === MAX_BATCH)
    const errs = cleanBatch({ i: Array.from({ length: 10 }, (_, k) => ["js_error", "app", "/app", 1, `E${k}`]) }, "desktop")
    check(`at most ${MAX_ERRORS_PER_PAGE} errors a beacon`, errs.length === MAX_ERRORS_PER_PAGE)
    check("not the right shape is nothing", cleanBatch(null, "mobile").length === 0 && cleanBatch({ i: "x" }, "mobile").length === 0)
    check("mask keeps messages short", maskDetail("x".repeat(500)).length === 160)
    check("server rows are checked too", serverRow("checkout", "/api/checkout/process", "mobile", 120.4, 200)?.v === 120 && serverRow("checkout", "/API?x", "mobile", 1, 200) === null)
    const store: HitStore = new Map()
    const now = 1_000_000
    let allowed = 0
    for (let k = 0; k < 30; k++) if (allowedBeacon("1.2.3.4", now, 20, store)) allowed++
    check("one address gets 20 beacons a minute", allowed === 20 && allowedBeacon("1.2.3.4", now + 61_000, 20, store))
  }

  console.log("\nCheap: every page load, capped, batched, after the page")
  {
    /*
      Round 20: one in five left most figures on "insufficient data" for days
      at Storelib's traffic. Every page load and every timed call is measured
      now; what keeps it cheap is the caps (tests/perf-collect.test.ts).
    */
    check("every page load and every timed API call, with caps per page load and per route", CLIENT_SAMPLE_RATE === 1 && SERVER_SAMPLE_RATE === 1 && MAX_ITEMS_PER_PAGE_LOAD > 0 && FULL_VIEWS_PER_PAGE_LOAD > 0 && SERVER_ROUTE_PER_MINUTE > 0)
    const comp = read("components/perf/perf-beacon.tsx")
    check("the dice are rolled before the collector is downloaded", /if \(Math\.random\(\) >= CLIENT_SAMPLE_RATE\) return[\s\S]*import\("@\/lib\/perf\/beacon-client"\)/.test(comp))
    check("and it loads when the browser is idle", /requestIdleCallback/.test(comp))
    const client = read("lib/perf/beacon-client.ts")
    check("sent with sendBeacon, in batches, when the page is hidden or left, and at the next idle moment", /navigator\.sendBeacon/.test(client) && /FLUSH_AT = 20/.test(client) && /visibilitychange/.test(client) && /pagehide/.test(client) && /requestIdleCallback/.test(client))
    check("no cookie, no storage, no address sent", !/document\.cookie|localStorage|sessionStorage|location\.href|location\.search/.test(client))
    check("nothing runs per frame", !/setInterval/.test(client) && (client.match(/requestAnimationFrame/g) ?? []).length === 2)
    check("never in a frame or a scripted browser", /window\.self !== window\.top/.test(client) && /navigator\.webdriver/.test(client))
    const layout = read("app/layout.tsx")
    check("mounted once, in the root layout", /<PerfBeacon \/>/.test(layout))

    const realRandom = Math.random
    try {
      const before = pendingTimings().length
      Math.random = () => 0.99
      const handler = timed("app", "/api/dashboard", async () => new Response("ok", { status: 200 }))
      const res = await handler()
      check("every request is answered untouched and recorded", res.status === 200 && pendingTimings().length === before + 1)
      Math.random = () => 0
      await handler()
      const last = pendingTimings()[pendingTimings().length - 1]
      check("a request is recorded with its status", pendingTimings().length === before + 2 && last.m === "api" && last.s === 200 && last.r === "/api/dashboard")
      const throws = timed("checkout", "/api/checkout/process", async (): Promise<Response> => {
        throw new Error("boom")
      })
      let rethrown = false
      try {
        await throws()
      } catch (e) {
        rethrown = (e as Error).message === "boom"
      }
      check("a handler that throws is recorded as a 500 and the error goes on unchanged", rethrown && pendingTimings()[pendingTimings().length - 1].s === 500)
    } finally {
      Math.random = realRandom
    }
    const st = read("lib/perf/server-timing.ts")
    check("timings are written after the response, one write pending at a time, in batches", /after\(flush\)/.test(st) && /if \(pending\) return/.test(st) && /MAX_BUFFER = 200/.test(st))
    const wrapped = ["app/api/checkout/process/route.ts", "app/api/checkout/stripe-session/route.ts", "app/api/checkout/confirm-payment/route.ts", "app/api/checkout/cart/route.ts", "app/api/explore/communities/route.ts", "app/api/dashboard/route.ts"]
    check("the routes that matter are timed", wrapped.every((f) => /export const (GET|POST) = timed\("/.test(read(f))))
  }

  console.log("\nStorage: part 126, small and server only")
  {
    const sql = read("supabase/sql/run-now/126_perf_health.sql")
    const lines = sql.trimEnd().split("\n")
    check("the migration is the same part", sql === read("supabase/migrations/20261226_perf_health.sql"))
    check("one statement per line, notify last", lines.slice(1).every((l) => l.trim().endsWith(";")) && lines[lines.length - 1] === "notify pgrst, 'reload schema';")
    check("idempotent", lines.slice(1).every((l) => /^(CREATE TABLE IF NOT EXISTS|CREATE INDEX IF NOT EXISTS|ALTER TABLE \S+ ENABLE ROW LEVEL SECURITY|REVOKE|GRANT|CREATE OR REPLACE FUNCTION|notify)/.test(l)))
    for (const t of ["perf_samples", "perf_day_counts", "perf_daily", "perf_scores"]) {
      check(`${t}: row level security on, nothing for visitors or signed in users`, sql.includes(`ALTER TABLE public.${t} ENABLE ROW LEVEL SECURITY;`) && sql.includes(`REVOKE ALL ON public.${t} FROM PUBLIC, anon, authenticated;`) && !new RegExp(`CREATE POLICY[^;]*${t}`).test(sql))
    }
    const fns = ["perf_ingest(text, jsonb, integer)", "perf_window(timestamptz)", "perf_rollup_day(date)", "perf_errors(timestamptz, integer)", "perf_slow_queries(integer, double precision, integer)"]
    check("every function is the service role's alone", fns.every((f) => sql.includes(`REVOKE ALL ON FUNCTION public.${f} FROM PUBLIC, anon, authenticated;`) && sql.includes(`GRANT EXECUTE ON FUNCTION public.${f} TO service_role;`)))
    check("a daily cap counted per source before anything is kept", /INSERT INTO public\.perf_day_counts[\s\S]*IF v_n > greatest\(coalesce\(p_cap, 0\), 0\) THEN RETURN 0/.test(sql))
    /* Part 132 keeps raw samples longer, for the 30 day window; it replaces only that function. */
    const p132 = read("supabase/sql/run-now/132_perf_collect_everywhere.sql")
    check(`raw samples kept ${RAW_RETENTION_DAYS} days (part 132), rollups ${ROLLUP_RETENTION_DAYS}`, sql.includes("interval '8 days'") && p132.includes(`interval '${RAW_RETENTION_DAYS} days'`) && p132.includes(`v_today - ${ROLLUP_RETENTION_DAYS}`))
    check("caps are what the routes pass", read("app/api/perf/beacon/route.ts").includes("DAILY_CAP.client") && read("lib/perf/server-timing.ts").includes("DAILY_CAP.server") && DAILY_CAP.client <= 50_000)
    check("pg_stat_statements is read only where it exists, with a reason otherwise", /WHERE e\.extname = 'pg_stat_statements'; IF v_schema IS NULL THEN RETURN jsonb_build_object\('available', false/.test(sql) && /EXCEPTION WHEN others THEN RETURN jsonb_build_object\('available', false/.test(sql))
    check("published websites' own Web Vitals only where their table exists", (sql.match(/to_regclass\('public\.site_web_vitals'\) IS NOT NULL/g) ?? []).length === 2)
    check("the README and the check after know it", read("supabase/sql/run-now/README.md").includes("`126_perf_health.sql`") && read("supabase/sql/run-now/99_check_after.sql").includes("as p126_perf_health"))
    const cron = read("app/api/cron/rollup-daily/route.ts")
    check("the existing nightly cron rolls up and scores the day; no new cron", /rollupAndScorePerfDay\(date\)/.test(cron) && !read("vercel.json").includes("perf"))
  }

  console.log("\nNo number without data, and only for the admin")
  {
    const base: PerfReport = {
      generatedAt: new Date().toISOString(),
      window: "7d",
      ready: false,
      readyReason: "Waiting for database part 126.",
      sampling: { client: 0.2, server: 0.2 },
      health: healthIndex([], NO_EXTRAS),
      aggs: [],
      history: [],
      errors: null,
      slow: { available: false, reason: "Waiting for database part 126" },
      payments: { failed: 0, completed: 0 },
      jobs: { late: 0, known: 0 },
      supabase: { configured: false },
      vercel: { configured: false },
      problems: [],
      optimizations: [],
    }
    const html = renderToStaticMarkup(createElement(PerformanceAdmin, { initial: base }))
    check("no Health Index drawn", !html.includes("data-health-score=") && html.includes("data-health-score-empty"))
    check("no figure drawn anywhere", !html.includes("data-figure-value"))
    check("every figure says insufficient data", (html.match(/Insufficient data/g) ?? []).length >= 60)
    check("the page says what it waits for", html.includes("Waiting for database part 126"))
    check("tokens that are not set are named, not guessed", html.includes("SUPABASE_ACCESS_TOKEN") && html.includes("VERCEL_API_TOKEN"))

    const full = renderToStaticMarkup(
      createElement(PerformanceAdmin, {
        initial: { ...base, ready: true, readyReason: null, aggs: [agg("*", "lcp", 40, 2100)], health: healthIndex([agg("*", "lcp", 40, 2100)], NO_EXTRAS) },
      }),
    )
    check("a measured figure is drawn with its samples", full.includes("2.1 s") && full.includes("40 samples"))
    check("one figure does not make an index", full.includes("data-health-score-empty"))

    check("the window is 24h, 7d or 30d, nothing else", windowOf("24h") === "24h" && windowOf("30d") === "30d" && windowOf("x") === "7d" && windowOf(null) === "7d")
    const page = read("app/admin/performance/page.tsx")
    check("the page checks the admin cookie before it reads anything", /if \(!\(await isAdminAuthenticated\(\)\)\) return <AdminLogin \/>[\s\S]*readPerfReport\(/.test(page))
    const api = read("app/api/perf/admin/route.ts")
    check("the refresh route asks for the admin first", /const denied = await requireAdmin\(\)\s*if \(denied\) return denied[\s\S]*readPerfReport\(/.test(api))
    check("the readers are server only", /^import "server-only"/.test(read("lib/perf/read.ts")) && /^import "server-only"/.test(read("lib/perf/daily.ts")) && /^import "server-only"/.test(read("lib/perf/infra.ts")))
    const beacon = read("app/api/perf/beacon/route.ts")
    check("the public beacon answers 204 and nothing else", !/NextResponse\.json/.test(beacon) && /status: 204/.test(beacon))
    check("the client page imports no server code", !/lib\/perf\/(read|daily|infra|server-timing)"|next\/headers|server-only/.test(read("app/admin/performance/performance-admin.tsx")))
    check("the console's nav has it, under System", /\{ id: "system", label: "Health" \},\n\s*\{ href: "\/admin\/performance", label: "Performance" \}/.test(read("app/admin/_console/shell.tsx")))
  }

  console.log("\nCopy")
  {
    const files = ["lib/perf/config.ts", "lib/perf/routes.ts", "lib/perf/scoring.ts", "lib/perf/problems.ts", "lib/perf/telemetry.ts", "lib/perf/beacon-client.ts", "lib/perf/server-timing.ts", "lib/perf/read.ts", "lib/perf/daily.ts", "lib/perf/infra.ts", "lib/perf/report.ts", "lib/perf/optimizations.ts", "lib/perf/mark.ts", "lib/perf/site-vitals-inline.ts", "components/perf/perf-beacon.tsx", "app/admin/performance/page.tsx", "app/admin/performance/performance-admin.tsx", "app/api/perf/beacon/route.ts", "app/api/public/m/route.ts", "app/api/public/sv/route.ts", "app/api/perf/admin/route.ts", "supabase/sql/run-now/126_perf_health.sql", "supabase/sql/run-now/132_perf_collect_everywhere.sql"]
    const bad = files.filter((f) => /—|\b(unlock|elevate|seamless|powerful|effortless|effortlessly|supercharge|transform)/i.test(read(f)))
    check("no em dashes and none of the banned words", bad.length === 0, bad.join(", "))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) {
    console.log(failures.map((f) => `  - ${f}`).join("\n"))
    process.exit(1)
  }
}

void main()
