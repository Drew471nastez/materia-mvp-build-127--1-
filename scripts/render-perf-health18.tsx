/**
 * /admin/performance with fixture data, for scripts/check-perf-health18.mjs.
 * The real page component, fed a report built by the real rules: the
 * aggregates below go through healthIndex and rankProblems exactly as
 * lib/perf/read.ts sends them, so every score on screen is computed, not
 * typed in. `?empty=1` renders the page before part 126 has run and before
 * any token is set: nothing measured anywhere.
 */
import * as React from "react"
import { createRoot } from "react-dom/client"

import { PerformanceAdmin } from "@/app/admin/performance/performance-admin"
import { rankProblems, type ErrorGroupRow } from "@/lib/perf/problems"
import type { PerfReport, ScoreDay } from "@/lib/perf/report"
import { NO_EXTRAS, healthIndex, type Aggregate, type Extras } from "@/lib/perf/scoring"

const NOW = Date.UTC(2026, 9, 10, 14, 0, 0)
const params = new URLSearchParams(location.search)

function agg(area: string, device: string, metric: string, samples: number, p75: number, bad = 0, route = "*"): Aggregate {
  return { area, device, route, metric, samples, p50: Math.round(p75 * 0.7 * 1000) / 1000, p75, p95: Math.round(p75 * 1.8 * 1000) / 1000, bad }
}

const AGGS: Aggregate[] = [
  agg("*", "*", "lcp", 1840, 2300), agg("*", "mobile", "lcp", 1100, 2900), agg("*", "desktop", "lcp", 740, 1600),
  agg("*", "*", "inp", 1320, 180), agg("*", "mobile", "inp", 790, 260), agg("*", "desktop", "inp", 530, 90),
  agg("*", "*", "cls", 1840, 0.06), agg("*", "mobile", "cls", 1100, 0.09), agg("*", "desktop", "cls", 740, 0.03),
  agg("*", "*", "fcp", 1810, 1500), agg("*", "mobile", "fcp", 1080, 1900), agg("*", "desktop", "fcp", 730, 1000),
  agg("*", "*", "ttfb", 1830, 520), agg("*", "mobile", "ttfb", 1090, 640), agg("*", "desktop", "ttfb", 740, 380),
  agg("*", "*", "nav", 1570, 380), agg("*", "mobile", "nav", 910, 520), agg("*", "desktop", "nav", 660, 240),
  agg("*", "*", "view", 2400, 1), agg("*", "*", "js_error", 31, 1),
  agg("app", "*", "lcp", 620, 2100), agg("app", "*", "inp", 540, 150), agg("app", "*", "cls", 620, 0.05), agg("app", "*", "nav", 900, 340), agg("app", "*", "view", 1100, 1), agg("app", "*", "js_error", 9, 1),
  agg("builder", "*", "lcp", 140, 3400), agg("builder", "*", "inp", 120, 310), agg("builder", "*", "cls", 140, 0.12), agg("builder", "*", "nav", 60, 610), agg("builder", "*", "view", 160, 1), agg("builder", "*", "js_error", 11, 1),
  agg("explore", "*", "lcp", 380, 2600), agg("explore", "*", "inp", 260, 170), agg("explore", "*", "cls", 380, 0.04), agg("explore", "*", "nav", 210, 420), agg("explore", "*", "view", 420, 1), agg("explore", "*", "js_error", 2, 1),
  agg("community", "*", "lcp", 310, 2400), agg("community", "*", "inp", 240, 230), agg("community", "*", "cls", 310, 0.08), agg("community", "*", "nav", 400, 450), agg("community", "*", "view", 520, 1), agg("community", "*", "js_error", 6, 1),
  agg("creator", "*", "lcp", 140, 2000), agg("creator", "*", "inp", 90, 120), agg("creator", "*", "cls", 140, 0.03), agg("creator", "*", "view", 150, 1),
  agg("product", "*", "lcp", 180, 2800), agg("product", "*", "inp", 110, 140), agg("product", "*", "cls", 180, 0.07), agg("product", "*", "view", 190, 1),
  agg("checkout", "*", "lcp", 60, 1900), agg("checkout", "*", "view", 80, 1), agg("checkout", "*", "js_error", 1, 1),
  agg("sites", "*", "lcp", 900, 2200), agg("sites", "*", "inp", 520, 110), agg("sites", "*", "cls", 900, 0.05), agg("sites", "mobile", "lcp", 600, 2700),
  agg("*", "*", "api", 1260, 310, 3), agg("checkout", "*", "api", 210, 520, 1), agg("community", "*", "api", 640, 380, 2), agg("explore", "*", "api", 180, 140), agg("app", "*", "api", 230, 260),
  agg("builder", "*", "lcp", 120, 3600, 0, "/app/website-builder"),
  agg("explore", "*", "lcp", 300, 2700, 0, "/explore"),
  agg("community", "*", "inp", 180, 260, 0, "/community/:slug"),
  agg("community", "*", "nav", 220, 520, 0, "/community/:slug/learn/:id"),
  agg("community", "*", "api", 340, 640, 2, "/api/community/:id/posts"),
  agg("community", "*", "api", 300, 160, 0, "/api/community/:id/place"),
  agg("checkout", "*", "api", 110, 520, 1, "/api/checkout/process"),
  agg("checkout", "*", "api", 100, 430, 0, "/api/checkout/stripe-session"),
  agg("explore", "*", "api", 180, 140, 0, "/api/explore/communities"),
  agg("app", "*", "api", 230, 260, 0, "/api/dashboard"),
]

const ERRORS: ErrorGroupRow[] = [
  { detail: "TypeError: Cannot read properties of undefined (reading 'blocks')", area: "builder", route: "/app/website-builder", n: 9, lastAt: new Date(NOW - 3 * 3_600_000).toISOString() },
  { detail: "ChunkLoadError: Loading chunk # failed.", area: "community", route: "/community/:slug", n: 4, lastAt: new Date(NOW - 26 * 3_600_000).toISOString() },
  { detail: "AbortError: The user aborted a request.", area: "app", route: "/app/products", n: 3, lastAt: new Date(NOW - 50 * 3_600_000).toISOString() },
]

const day = (back: number) => new Date(NOW - back * 86_400_000).toISOString().slice(0, 10)
const SCORES = [78, 80, 79, 81, null, 83, 82, 84, 80, 79, 83, 85, 84, 86, 82, null, 81, 84, 85, 87, 86, 84, 85, 83, 86, 88]
const HISTORY: ScoreDay[] = SCORES.map((s, i) => ({ day: day(SCORES.length - i), score: s, subs: [] }))

function report(): PerfReport {
  if (params.get("empty") === "1") {
    return {
      generatedAt: new Date(NOW).toISOString(),
      window: "7d",
      ready: false,
      readyReason: "Waiting for database part 126 (supabase/sql/run-now/126_perf_health.sql).",
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
  }
  const extras: Extras = { payments: { failed: 6, completed: 148 }, slowStatements: 1, jobs: { late: 0, known: 5 }, supabaseDown: 0, deployments: null }
  return {
    generatedAt: new Date(NOW).toISOString(),
    window: "7d",
    ready: true,
    readyReason: null,
    sampling: { client: 0.2, server: 0.2 },
    health: healthIndex(AGGS, extras),
    aggs: AGGS,
    history: HISTORY,
    errors: ERRORS,
    slow: {
      available: true,
      slow: 1,
      rows: [
        { query: "SELECT p.id, p.title, p.price_cents FROM public.products p WHERE p.creator_id = $1 AND p.status = $2 ORDER BY p.created_at DESC LIMIT $3", calls: 48210, mean_ms: 4.2, total_ms: 202482, rows: 912000 },
        { query: "SELECT * FROM public.analytics_report($1, $2, $3, $4)", calls: 1840, mean_ms: 212.6, total_ms: 391184, rows: 1840 },
        { query: "with v as (select device, lcp_ms from public.site_web_vitals where install_id = $1 and day between $2 and $3) select ...", calls: 3120, mean_ms: 18.4, total_ms: 57408, rows: 28080 },
        { query: "UPDATE public.community_posts SET comment_count = comment_count + $1 WHERE id = $2", calls: 9210, mean_ms: 1.1, total_ms: 10131, rows: 9210 },
      ],
    },
    payments: extras.payments,
    jobs: extras.jobs,
    supabase: { configured: true, ok: true, services: ["db", "auth", "rest", "storage", "realtime"].map((name) => ({ name, healthy: true })), down: 0, requests: { rest: 412_880, auth: 18_204, storage: 61_330, realtime: 2_104 } },
    vercel: { configured: false },
    problems: rankProblems(AGGS, ERRORS),
    optimizations: [
      { id: "explore-cache", title: "Explore catalogue cached at the edge, refreshed when a listing changes", area: "explore", shippedAt: "2026-10-09", before: { metric: "server render p75, /explore", value: 840, unit: "ms" }, after: { metric: "server render p75, /explore", value: 95, unit: "ms" } },
      { id: "dashboard-parallel", title: "Dashboard reads run together instead of one after another", area: "dashboard", shippedAt: "2026-10-08", before: { metric: "queries in series per request", value: 7, unit: "queries" }, after: { metric: "queries in series per request", value: 2, unit: "queries" } },
      { id: "fonts", title: "Builder fonts no longer block the first paint", area: "storefront", shippedAt: "2026-10-06", note: "measured on a 4x slower CPU" },
    ],
  }
}

createRoot(document.getElementById("root")!).render(<PerformanceAdmin initial={report()} />)
