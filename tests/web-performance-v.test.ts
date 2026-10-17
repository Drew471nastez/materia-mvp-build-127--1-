/**
 * ===========================================================================
 *  WEBSITE SETTINGS › PERFORMANCE, CHECKED (round V, track 2)
 * ===========================================================================
 * Real-user speed for every published website, from the beacon to the tab:
 *
 *   the numbers     a 75th percentile from histogram buckets against the
 *                   exact one on synthetic visits, Google's lines, the bands
 *   what arrives    the beacon checked field by field, paths scrubbed, the
 *                   page type, the device, the country
 *   which site      the host and nothing else: a beacon on A's host is A's
 *                   whatever its body says, storelib.com is nobody's, a bot
 *                   is nothing (the route against a fake PostgREST)
 *   how much        the sampling and its weights, so counts stay honest
 *   the rollup      the same events always give the same day, twice is once
 *   how long        raw 30 days once rolled up, daily rows 13 months
 *   the page        "Not enough visits yet" under 20, a gap in the line
 *                   under 10, no data, insights only from real ratings, and
 *                   the reader that rolls a missed day up on the way
 *   the lab test    Google's answer parsed from a fixture, its 429 recorded
 *   the collector   under 2 KB gzipped, no cookie, nothing about the visitor
 *
 * Tenant isolation in the database itself (creator A cannot read B through
 * any table or the window function) is proved on a real Postgres by
 * scripts/sql-harness/site-rum.sql; the policies it relies on are pinned
 * here too.
 */

import { createServer, type IncomingMessage } from "node:http"
import { readFileSync } from "node:fs"
import { gzipSync } from "node:zlib"
import { NextRequest } from "next/server"

import { POST as vitalsPOST } from "@/app/api/public/vitals/route"
import { SITE_BEACON_PATH } from "@/lib/perf/config"
import { SITE_VITALS_JS, siteVitalsScript } from "@/lib/perf/site-vitals-inline"
import { forgetRumSites, rumSiteOfHost } from "@/lib/website-builder/rum-site"
import { labEvidence, parsePsi, psiRequestUrl, fileNameOf, formatBytes } from "@/lib/website-builder/pagespeed"
import { readPerformance, rollupSiteDay } from "@/lib/website-builder/web-performance-read"
import {
  FAR_SAMPLE_RATE,
  FULL_SAMPLE_UNTIL,
  MAX_PATHS_PER_DAY,
  MID_SAMPLE_RATE,
  MID_SAMPLE_UNTIL,
  MIN_POINT_SAMPLES,
  MIN_SAMPLES,
  OTHER_KEY,
  PERF_THRESHOLDS,
  addUtcDays,
  aggFromDb,
  aggToDb,
  bandsFromHistogram,
  browserFamilyOf,
  bucketOf,
  buildReport,
  cleanRumBeacon,
  countryOf,
  deviceClassFor,
  directionOf,
  emptyHistogram,
  exactP75,
  expectedRowsFor,
  formatPerf,
  mergeAggs,
  normalizePath,
  p75FromHistogram,
  pageTypeOf,
  ratePerf,
  rawExpired,
  rollupEvents,
  rollupExpired,
  sampleRateFor,
  utcDay,
  weightFor,
  windowFor,
  type PerfMetric,
  type RumEvent,
  type RumMetric,
} from "@/lib/website-builder/web-performance"

let passed = 0
let failed = 0
const failures: string[] = []
function check(name: string, ok: boolean, detail?: string) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    failures.push(name + (detail ? ` (${detail})` : ""))
    console.log(`  FAIL  ${name}${detail ? `  (${detail})` : ""}`)
  }
}
const read = (p: string) => readFileSync(p, "utf8")
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")

/* A seeded random, so every run draws the same visits. */
let seed = 20261017
function rnd(): number {
  seed = (seed * 1664525 + 1013904223) % 4294967296
  return seed / 4294967296
}
function normal(): number {
  const u = Math.max(rnd(), 1e-12)
  const v = rnd()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}
const logNormal = (median: number, spread: number) => median * Math.exp(spread * normal())

function histogramOf(metric: RumMetric, values: number[]): number[] {
  const h = emptyHistogram(metric)
  for (const v of values) h[bucketOf(metric, v)] += 1
  return h
}

function event(over: Partial<RumEvent> = {}): RumEvent {
  return {
    at: "2026-10-16T10:00:00.000Z",
    path: "/",
    page_type: "home",
    device: "mobile",
    browser: "Chrome",
    country: "GB",
    lcp_ms: 2000,
    inp_ms: 120,
    cls: 0.02,
    fcp_ms: 1200,
    ttfb_ms: 400,
    nav_ms: null,
    weight: 1,
    ...over,
  }
}

async function main() {
  // ── 1. The 75th percentile from buckets ─────────────────────────────────
  console.log("\n1. A 75th percentile from histogram buckets is close to the exact one")
  {
    const cases: Array<[string, RumMetric, () => number, number]> = [
      ["LCP, a typical shop (median 1.9 s)", "lcp", () => Math.min(60_000, logNormal(1900, 0.55)), 0.04],
      ["LCP, a slow site (median 3.6 s)", "lcp", () => Math.min(60_000, logNormal(3600, 0.6)), 0.04],
      ["INP (median 110 ms)", "inp", () => Math.min(60_000, logNormal(110, 0.7)), 0.06],
      ["TTFB (median 350 ms)", "ttfb", () => Math.min(60_000, logNormal(350, 0.5)), 0.05],
      ["FCP (median 1.3 s)", "fcp", () => Math.min(60_000, logNormal(1300, 0.45)), 0.04],
    ]
    for (const [label, metric, draw, tolerance] of cases) {
      for (const n of [200, 5000]) {
        const values = Array.from({ length: n }, draw)
        const exact = exactP75(values) as number
        const est = p75FromHistogram(metric, histogramOf(metric, values)) as number
        const err = Math.abs(est - exact) / exact
        check(`${label}, ${n} visits: within ${tolerance * 100}% (exact ${Math.round(exact)}, buckets ${est})`, err <= tolerance, `${(err * 100).toFixed(2)}%`)
      }
    }
    /* CLS: most pages do not move at all. */
    const cls = Array.from({ length: 3000 }, () => (rnd() < 0.55 ? 0 : Math.min(10, logNormal(0.06, 0.9))))
    const exactCls = exactP75(cls) as number
    const estCls = p75FromHistogram("cls", histogramOf("cls", cls)) as number
    check(`CLS with 55% still pages: within 0.01 (exact ${exactCls.toFixed(3)}, buckets ${estCls})`, Math.abs(estCls - exactCls) <= 0.01)
    const still = p75FromHistogram("cls", histogramOf("cls", Array(100).fill(0)))
    check("a page that never moved has a CLS of exactly 0", still === 0)
    check("an empty histogram has no percentile", p75FromHistogram("lcp", emptyHistogram("lcp")) === null && p75FromHistogram("lcp", null) === null)
    const weighted = histogramOf("lcp", [1000, 1000, 1000])
    weighted[bucketOf("lcp", 5000)] += 10
    check("weights count: ten page views kept at one in ten pull the p75 up", (p75FromHistogram("lcp", weighted) as number) > 4000)
  }

  // ── 2. Google's lines ───────────────────────────────────────────────────
  console.log("\n2. Good, Needs improvement and Poor by Google's thresholds")
  {
    const lines: Array<[PerfMetric, number, number]> = [
      ["lcp", 2500, 4000],
      ["inp", 200, 500],
      ["cls", 0.1, 0.25],
      ["fcp", 1800, 3000],
      ["ttfb", 800, 1800],
    ]
    for (const [m, good, poor] of lines) {
      check(`${m}: ${good} / ${poor}`, PERF_THRESHOLDS[m][0] === good && PERF_THRESHOLDS[m][1] === poor)
      const step = m === "cls" ? 0.001 : 1
      check(`${m}: on the line is Good, just over is Needs improvement, over the second is Poor`,
        ratePerf(m, good) === "good" && ratePerf(m, good + step) === "needs-improvement" && ratePerf(m, poor) === "needs-improvement" && ratePerf(m, poor + step) === "poor")
    }
    /* Every line is a bucket edge, so the bands are exact. */
    const values = [100, 2500, 2501, 3999, 4000, 4001, 9000, 12_000]
    const b = bandsFromHistogram("lcp", histogramOf("lcp", values))
    check("bands are exact: 2 Good, 3 Needs improvement, 3 Poor of 8", !!b && b.good === 2 / 8 && b.needsImprovement === 3 / 8 && b.poor === 3 / 8, JSON.stringify(b))
    const bc = bandsFromHistogram("cls", histogramOf("cls", [0, 0.1, 0.11, 0.25, 0.26]))
    check("CLS bands are exact too", !!bc && bc.good === 2 / 5 && bc.needsImprovement === 2 / 5 && bc.poor === 1 / 5, JSON.stringify(bc))
    check("written the way Search Console writes them", formatPerf("lcp", 2140) === "2.1 s" && formatPerf("inp", 180) === "180 ms" && formatPerf("cls", 0.043) === "0.04" && formatPerf("cls", 0.004) === "<0.01")
    check("a change of under 3% is no change; lower is better for every metric", directionOf(2000, 2050) === "same" && directionOf(1800, 2400) === "better" && directionOf(3000, 2400) === "worse" && directionOf(null, 1) === null)
  }

  // ── 3. What arrives ─────────────────────────────────────────────────────
  console.log("\n3. The beacon is checked field by field, and nothing else is read")
  {
    const ok = cleanRumBeacon({ v: 1, p: "/products/hat?ref=mail#reviews", k: "l", w: 390, c: "4g", lcp: 2140.6, inp: 88, cls: 0.043219, fcp: 1200.2, ttfb: 300, email: "a@b.c", s: "0f6a2c1e-5b7d-4e2a-9c3b-1d2e3f4a5b6c" })
    check("a page load with its numbers", !!ok && ok.path === "/products/hat" && ok.pageType === "product" && ok.kind === "load" && ok.lcp === 2141 && ok.cls === 0.0432 && ok.fcp === 1200 && ok.width === 390 && ok.connection === "4g")
    check("  no query, no fragment, and an extra field or a site id in the body is not read",
      !!ok && Object.keys(ok).sort().join() === "cls,connection,fcp,inp,kind,lcp,nav,pageType,path,ttfb,width")
    check("a value past its bound is left out, not clamped", cleanRumBeacon({ v: 1, p: "/", k: "l", lcp: 60_001, fcp: 900 })?.lcp === null && cleanRumBeacon({ v: 1, p: "/", k: "l", lcp: -5, fcp: 900 })?.lcp === null && cleanRumBeacon({ v: 1, p: "/", k: "l", cls: 11, fcp: 900 })?.cls === null)
    check("a page load with no believable number is nothing", cleanRumBeacon({ v: 1, p: "/", k: "l", lcp: "fast", cls: Number.NaN }) === null)
    check("a page change needs its time, and carries no load numbers", cleanRumBeacon({ v: 1, p: "/about", k: "s", lcp: 900 }) === null && cleanRumBeacon({ v: 1, p: "/about", k: "s", nav: 340, lcp: 900, ttfb: 1 })?.lcp === null && cleanRumBeacon({ v: 1, p: "/about", k: "s", nav: 340 })?.nav === 340)
    check("no version, no kind, not a path, or not an object is nothing",
      cleanRumBeacon({ p: "/", k: "l", lcp: 1 }) === null && cleanRumBeacon({ v: 1, p: "/", lcp: 1 }) === null && cleanRumBeacon({ v: 1, p: "https://x.com/", k: "l", lcp: 1 }) === null && cleanRumBeacon([1]) === null && cleanRumBeacon("x") === null)
    check("an unknown connection or a silly width is dropped", cleanRumBeacon({ v: 1, p: "/", k: "l", lcp: 1, c: "wifi", w: 5 })?.connection === null && cleanRumBeacon({ v: 1, p: "/", k: "l", lcp: 1, w: 5 })?.width === null)

    console.log("\n   paths")
    check("lower case, no trailing slash", normalizePath("/Products/Hat/") === "/products/hat")
    check("an order id, a uuid and an email are replaced", normalizePath("/account/orders/1234567") === "/account/orders" && normalizePath("/thanks/3f2b7c1e-1111-4222-8333-444455556666") === "/thanks/:id" && normalizePath("/u/someone@example.com") === "/u/:id")
    check("account pages keep only which one", normalizePath("/account/orders/abc/def") === "/account/orders" && normalizePath("/fr/account/addresses/2") === "/fr/account/addresses")
    check("a long token is replaced", normalizePath("/r/a8f9c2d7e6b5a4c3d2e1f0a9b8c7") === "/r/:id")
    check("climbing, a protocol relative address, the API and Next's files are nothing", normalizePath("/a/../b") === null && normalizePath("//evil.com/x") === null && normalizePath("/api/x") === null && normalizePath("/_next/data") === null && normalizePath("x") === null)
    check("at most eight segments and 160 characters", (normalizePath("/a/b/c/d/e/f/g/h/i/j") ?? "").split("/").length === 9 && (normalizePath("/" + "a".repeat(300)) ?? "x").length <= 160)

    console.log("\n   page types")
    const types: Array<[string, string]> = [
      ["/", "home"], ["/products/hat", "product"], ["/products", "collection"], ["/collections/summer", "collection"], ["/collections/summer/products/hat", "product"],
      ["/search", "search"], ["/cart", "cart"], ["/account", "account"], ["/wishlist", "account"], ["/refund-policy", "policy"], ["/policies/privacy-policy", "policy"],
      ["/pages/about", "page"], ["/pages/shipping-policy", "policy"], ["/about", "page"], ["/blogs/news/launch", "blog"], ["/fr/products/hat", "product"], ["/pt-br", "home"], ["/a/b", "other"],
    ]
    for (const [p, t] of types) check(`${p} is ${t}`, pageTypeOf(p) === t, pageTypeOf(p))

    console.log("\n   device, browser, country")
    check("a phone or a tablet signature is mobile", deviceClassFor("mobile", 1200) === "mobile" && deviceClassFor("tablet", 1024) === "mobile")
    check("a computer signature is desktop, unless the window is narrower than a phone held sideways", deviceClassFor("desktop", 1280) === "desktop" && deviceClassFor("desktop", 390) === "mobile" && deviceClassFor(null, null) === "desktop")
    check("browser families from the parser's names, anything else Other", browserFamilyOf("Safari") === "Safari" && browserFamilyOf("Samsung Internet") === "Samsung Internet" && browserFamilyOf("Netscape") === "Other" && browserFamilyOf(null) === "Other")
    check("the edge's country: two letters, never unknown or Tor", countryOf("gb") === "GB" && countryOf("XX") === null && countryOf("T1") === null && countryOf("GBR") === null && countryOf(null) === null)
  }

  // ── 4. Sampling ─────────────────────────────────────────────────────────
  console.log("\n4. Sampling keeps a busy day small and its counts honest")
  {
    check("every page view up to the full sample, then one in ten, then one in a hundred",
      sampleRateFor(1) === 1 && sampleRateFor(FULL_SAMPLE_UNTIL) === 1 && sampleRateFor(FULL_SAMPLE_UNTIL + 1) === MID_SAMPLE_RATE && sampleRateFor(MID_SAMPLE_UNTIL) === MID_SAMPLE_RATE && sampleRateFor(MID_SAMPLE_UNTIL + 1) === FAR_SAMPLE_RATE)
    check("a kept row stands for 1 over its rate", weightFor(1) === 1 && weightFor(0.1) === 10 && weightFor(0.01) === 100 && weightFor(0) === 1)
    check("a million page views a day leaves about 11,000 rows", Math.round(expectedRowsFor(1_000_000)) === 1000 + 900 + 9900)
    const sql = read("supabase/sql/run-now/210_site_web_performance.sql")
    check("the SQL samples with the same steps it is handed", /v_rate := case when v_seen <= p_full then 1 when v_seen <= p_mid then greatest\(p_mid_rate, 0\.001\) else greatest\(p_far_rate, 0\.001\) end/.test(sql) && /1\.0 \/ v_rate/.test(sql))
    check("  and the route hands it these constants", /p_full: FULL_SAMPLE_UNTIL/.test(code("app/api/public/vitals/route.ts")) && /p_mid_rate: MID_SAMPLE_RATE/.test(code("app/api/public/vitals/route.ts")))
    /* A simulated day of 40,000 page views, sampled the way the SQL does. */
    const lcps: number[] = []
    const kept: RumEvent[] = []
    for (let seen = 1; seen <= 40_000; seen++) {
      const v = Math.min(60_000, logNormal(2200, 0.5))
      lcps.push(v)
      const rate = sampleRateFor(seen)
      if (rate >= 1 || rnd() < rate) kept.push(event({ lcp_ms: Math.round(v), weight: weightFor(rate) }))
    }
    const day = rollupEvents(kept).find((r) => r.dim === "all" && r.device === "mobile")
    check(`the weighted count stands for the 40,000 that arrived (${Math.round(day?.views ?? 0)}, ${kept.length} rows kept)`, !!day && Math.abs(day.views - 40_000) / 40_000 < 0.08 && kept.length < 2400)
    const exact = exactP75(lcps) as number
    const est = p75FromHistogram("lcp", day?.h.lcp) as number
    check(`and the weighted p75 matches all of them (exact ${Math.round(exact)}, sampled ${est})`, Math.abs(est - exact) / exact < 0.06)
    check("the collector never samples in the browser: every page view is sent", !/Math\.random/.test(SITE_VITALS_JS))
  }

  // ── 5. The rollup ───────────────────────────────────────────────────────
  console.log("\n5. A day rolled up twice is the same day")
  {
    const events: RumEvent[] = []
    for (let i = 0; i < 400; i++) {
      events.push(event({
        path: i % 7 === 0 ? "/products/hat" : i % 3 === 0 ? "/collections/all" : "/",
        page_type: i % 7 === 0 ? "product" : i % 3 === 0 ? "collection" : "home",
        device: i % 2 ? "mobile" : "desktop",
        browser: i % 5 === 0 ? "Safari" : "Chrome",
        country: i % 4 === 0 ? "US" : "GB",
        lcp_ms: Math.round(logNormal(2200, 0.5)),
        inp_ms: i % 5 === 0 ? null : Math.round(logNormal(120, 0.6)),
        cls: Math.round(logNormal(0.03, 1) * 1000) / 1000,
      }))
    }
    const once = JSON.stringify(rollupEvents(events))
    const twice = JSON.stringify(rollupEvents(events))
    const shuffled = JSON.stringify(rollupEvents([...events].sort(() => rnd() - 0.5)))
    check("the same events give the same rows", once === twice)
    check("in any order", once === shuffled)
    const rows = rollupEvents(events)
    check("one row per device for the day, and per page, page type, browser and country", rows.filter((r) => r.dim === "all").length === 2 && rows.some((r) => r.dim === "type" && r.key === "product") && rows.some((r) => r.dim === "country" && r.key === "US"))
    const half = mergeAggs(rollupEvents(events.slice(0, 150)), rollupEvents(events.slice(150)))
    const whole = rollupEvents(events)
    const all = (list: typeof whole) => list.find((r) => r.dim === "all" && r.device === "mobile")
    check("two halves summed are the whole (histograms add)", JSON.stringify(all(half)?.h) === JSON.stringify(all(whole)?.h) && all(half)?.views === all(whole)?.views)
    check("a row survives the trip to the database and back", JSON.stringify(aggFromDb(aggToDb(whole[0]) as never)) === JSON.stringify(whole[0]))
    const manyPages = Array.from({ length: MAX_PATHS_PER_DAY + 30 }, (_, i) => event({ path: `/p${i}`, page_type: "page" }))
    const capped = rollupEvents(manyPages).filter((r) => r.dim === "path")
    check(`past ${MAX_PATHS_PER_DAY} pages a day the rest are one "(other)" row`, capped.length === MAX_PATHS_PER_DAY + 1 && capped.some((r) => r.key === OTHER_KEY && r.samples === 30))
    check("Safari's missing INP is a missing value, not a zero", (rows.find((r) => r.dim === "browser" && r.key === "Safari" && r.device === "mobile")?.n.inp ?? -1) === 0)
    const sql = read("supabase/sql/run-now/210_site_web_performance.sql")
    check("the database replaces a day whole, then marks it rolled up", /delete from public\.site_rum_daily where install_id = p_install and day = p_day; insert into public\.site_rum_daily/.test(sql) && /update public\.site_rum_counters set rolled_at = now\(\)/.test(sql))
    check("a late page view for a rolled up day marks it for the rollup again", /do update set seen = public\.site_rum_counters\.seen \+ 1, rolled_at = null/.test(sql))
  }

  // ── 6. Retention ────────────────────────────────────────────────────────
  console.log("\n6. Raw page views 30 days once rolled up, daily rows 13 months")
  {
    const today = "2026-10-17"
    check("29 days old stays", !rawExpired(addUtcDays(today, -29), today, true))
    check("31 days old and rolled up goes", rawExpired(addUtcDays(today, -31), today, true))
    check("31 days old and never rolled up waits for the rollup", !rawExpired(addUtcDays(today, -31), today, false))
    check("36 days old goes whatever", rawExpired(addUtcDays(today, -36), today, false))
    check("daily rows: 399 days stay, 401 go", !rollupExpired(addUtcDays(today, -399), today) && rollupExpired(addUtcDays(today, -401), today))
    const sql = read("supabase/sql/run-now/210_site_web_performance.sql")
    check("the cleanup function does the same", /site_rum_cleanup\(p_raw_days integer default 30, p_rollup_days integer default 400\)/.test(sql) && /c\.rolled_at is not null/.test(sql) && /p_raw_days - 5/.test(sql))
    check("the nightly job runs the rollup and the cleanup", /rollupPendingSiteDays\(admin, Date\.now\(\), 60_000\)/.test(code("app/api/cron/rollup-daily/route.ts")) && /site_rum_cleanup/.test(code("lib/website-builder/web-performance-read.ts")))
  }

  // ── 7. The page's empty states and its report ───────────────────────────
  console.log("\n7. The report says what the data can say, and no more")
  {
    const now = Date.parse("2026-10-17T12:00:00Z")
    const nineteen = rollupEvents(Array.from({ length: MIN_SAMPLES - 1 }, () => event()))
    const twenty = rollupEvents(Array.from({ length: MIN_SAMPLES }, () => event()))
    const r19 = buildReport({ range: "7d", now, current: nineteen, previous: [], points: [], lastViewAt: null })
    const r20 = buildReport({ range: "7d", now, current: twenty, previous: [], points: [], lastViewAt: null })
    check(`${MIN_SAMPLES - 1} page views: "Not enough visits yet" (no number)`, r19.summary.all.metrics.lcp.p75 === null && r19.summary.all.metrics.lcp.rating === null && r19.summary.all.metrics.lcp.bands === null && r19.state === "ready")
    check(`${MIN_SAMPLES} page views: a number and a rating`, r20.summary.all.metrics.lcp.p75 !== null && r20.summary.all.metrics.lcp.rating === "good")
    const empty = buildReport({ range: "24h", now, current: [], previous: [], points: [], lastViewAt: null })
    check("no page views at all is the no-data state, with no insights", empty.state === "no-data" && empty.insights.length === 0 && empty.noInpShare === null)
    const thin = rollupEvents(Array.from({ length: MIN_POINT_SAMPLES - 1 }, () => event()), ["all"])
    const thick = rollupEvents(Array.from({ length: MIN_POINT_SAMPLES }, () => event()), ["all"])
    const rs = buildReport({ range: "7d", now, current: twenty, previous: [], points: [{ t: "2026-10-16T00:00:00.000Z", rows: thin }, { t: "2026-10-17T00:00:00.000Z", rows: thick }], lastViewAt: null })
    check(`a chart point under ${MIN_POINT_SAMPLES} page views is a gap, at ${MIN_POINT_SAMPLES} a value`, rs.series[0].values.mobile.lcp === null && typeof rs.series[1].values.mobile.lcp === "number")
    check("a device with no visits says nothing for it", rs.summary.desktop.metrics.lcp.p75 === null && rs.summary.desktop.samples === 0)

    /* Slow product pages on phones, a fast desktop, with Safari visitors. */
    const slow: RumEvent[] = []
    for (let i = 0; i < 300; i++) slow.push(event({ device: "mobile", path: "/products/hat", page_type: "product", lcp_ms: 3000 + (i % 20) * 50, browser: i % 4 === 0 ? "Safari" : "Chrome", inp_ms: i % 4 === 0 ? null : 120 }))
    for (let i = 0; i < 300; i++) slow.push(event({ device: "mobile", path: "/", page_type: "home", lcp_ms: 2200 }))
    for (let i = 0; i < 200; i++) slow.push(event({ device: "desktop", lcp_ms: 1200 }))
    const before = rollupEvents(Array.from({ length: 300 }, () => event({ device: "mobile", lcp_ms: 1900 })), ["all"])
    const rep = buildReport({
      range: "7d",
      now,
      current: rollupEvents(slow),
      previous: before,
      points: [],
      lastViewAt: "2026-10-17T11:58:00Z",
      evidence: { mobile: labEvidence((parsePsi(JSON.parse(read("tests/fixtures/pagespeed/v5-mobile-shape.json"))) as unknown as { result: never }).result) },
    })
    const worst = rep.insights.find((i) => i.kind === "worst" && i.device === "mobile") as Extract<(typeof rep.insights)[number], { kind: "worst" }> | undefined
    check("the worst metric on mobile is LCP, on product pages, with its real p75", !!worst && worst.metric === "lcp" && worst.pageType === "product" && worst.p75 >= 3500 && worst.p75 <= 4000, JSON.stringify(worst))
    check("  with what the mobile lab test actually found (the 2.1 MB hero image)", worst?.evidence?.kind === "largest-file" && (worst.evidence as { bytes: number }).bytes === 2140533)
    check("desktop, all Good, gets no worst-metric insight", !rep.insights.some((i) => i.kind === "worst" && i.device === "desktop"))
    check("a metric that moved into a worse band since the previous period says so", rep.insights.some((i) => i.kind === "slower" && i.metric === "lcp"))
    check("Safari's share of page views is named for INP", rep.noInpShare !== null && Math.abs(rep.noInpShare - 75 / 800) < 0.001)
    check("the delta is against the previous period's own p75", rep.summary.mobile.metrics.lcp.previous !== null && (rep.summary.mobile.metrics.lcp.previous as number) < 2000)
    const good = buildReport({ range: "7d", now, current: rollupEvents(Array.from({ length: 50 }, () => event())), previous: [], points: [], lastViewAt: null })
    check("all three Core Web Vitals Good says so", good.insights.length === 1 && good.insights[0].kind === "all-good")
    const types = rep.breakdowns.type.mobile
    check("the page type breakdown has the product pages with their own p75", types.some((t) => t.key === "product" && (t.metrics.lcp?.p75 ?? 0) > 3000))
    check("the report never claims to be live: it carries when it was read", rep.updatedAt === new Date(now).toISOString() && rep.lastViewAt === "2026-10-17T11:58:00Z")

    console.log("\n   windows")
    const w7 = windowFor("7d", now)
    check("7 days is today and the six before, compared with the seven before those", w7.days.length === 7 && w7.days[6] === "2026-10-17" && w7.previousDays.length === 7 && w7.previousDays[6] === "2026-10-10")
    const w24 = windowFor("24h", now)
    check("24 hours is 24 hourly points ending with this hour", (w24.end - w24.start) / 3_600_000 === 24 && w24.grain === "hour" && w24.end === Date.parse("2026-10-17T13:00:00Z"))
    check("90 days reads 180 days of daily rows, inside the 13 months kept", windowFor("90d", now).previousDays.length === 90 && utcDay(now) === "2026-10-17")
  }

  // ── 8. The reader, against an in-memory database ────────────────────────
  console.log("\n8. The reader rolls a missed day up, adds today from the raw page views, and asks as the user")
  {
    const now = Date.parse("2026-10-17T12:00:00Z")
    const install = "11111111-1111-4111-8111-111111111111"
    const db = fakeDb()
    /* Yesterday was never rolled up; today has visits too. */
    for (let i = 0; i < 30; i++) db.tables.site_rum_events.push({ install_id: install, ...event({ at: "2026-10-16T09:00:00.000Z", lcp_ms: 2000 + i }) })
    for (let i = 0; i < 25; i++) db.tables.site_rum_events.push({ install_id: install, ...event({ at: "2026-10-17T08:00:00.000Z", lcp_ms: 3000 + i, device: "desktop" }) })
    db.tables.site_rum_counters.push({ install_id: install, day: "2026-10-16", seen: 30, rolled_at: null }, { install_id: install, day: "2026-10-17", seen: 25, rolled_at: null })
    const answer = await readPerformance({ user: db.client("user"), admin: db.client("admin"), installId: install, range: "7d", now, fresh: true })
    check("the missed day was rolled up once, with the service role, for this install only", db.calls.filter((c) => c.startsWith("admin rpc site_rum_replace_day")).length === 1 && db.calls.some((c) => c === `admin rpc site_rum_replace_day ${install} 2026-10-16`))
    check("every other read was the user's own", db.calls.filter((c) => c.startsWith("admin")).every((c) => /site_rum_replace_day|site_rum_events/.test(c)))
    const rep = answer.available ? (answer as { report: ReturnType<typeof buildReport> }).report : null
    check("today's raw page views and yesterday's rollup are both in the figures", !!rep && rep.summary.mobile.samples === 30 && rep.summary.desktop.samples === 25 && rep.summary.all.samples === 55)
    check("one chart point per day, today's from the raw page views", !!rep && rep.series.length === 7 && typeof rep.series[6].values.desktop.lcp === "number" && typeof rep.series[5].values.mobile.lcp === "number")
    const again = await readPerformance({ user: db.client("user"), admin: db.client("admin"), installId: install, range: "7d", now, fresh: true })
    check("read again, nothing is rolled up twice (the day is marked)", db.calls.filter((c) => c.startsWith("admin rpc site_rum_replace_day")).length === 1 && again.available)
    const missing = fakeDb({ missing: true })
    const off = await readPerformance({ user: missing.client("user"), admin: missing.client("admin"), installId: install, range: "7d", now, fresh: true })
    check("before part 210 has run: { available: false }, not an error", off.available === false)
    const n = await rollupSiteDay(db.client("admin"), install, "2026-10-16")
    const n2 = await rollupSiteDay(db.client("admin"), install, "2026-10-16")
    check("rolling the same day up again writes the same rows", n !== null && n === n2 && db.tables.site_rum_daily.filter((r) => r.day === "2026-10-16").length === n)
    const r24 = await readPerformance({ user: db.client("user"), admin: db.client("admin"), installId: install, range: "24h", now, fresh: true })
    const rep24 = r24.available ? (r24 as { report: ReturnType<typeof buildReport> }).report : null
    check("24 hours: hourly points from the raw page views, yesterday morning in the period before", !!rep24 && rep24.series.length === 24 && rep24.summary.desktop.samples === 25 && rep24.summary.mobile.samples === 0 && rep24.summary.mobile.previousViews === 30)
  }

  // ── 9. Which site: the host, and nothing else ───────────────────────────
  console.log("\n9. A beacon belongs to the website at the host it was posted to")
  {
    const server = await fakePostgrest()
    process.env.NEXT_PUBLIC_SUPABASE_URL = `http://127.0.0.1:${server.port}`
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role"
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon"
    forgetRumSites()
    const send = async (host: string, body: unknown, agent = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1", ip = "203.0.113.20", country = "gb") => {
      server.records.length = 0
      const res = await vitalsPOST(new NextRequest(`https://${host}${SITE_BEACON_PATH}`, {
        method: "POST",
        body: typeof body === "string" ? body : JSON.stringify(body),
        headers: { host, "user-agent": agent, "x-forwarded-for": ip, "x-vercel-ip-country": country },
      }))
      return { status: res.status, rec: server.records[0] as Record<string, unknown> | undefined, n: server.records.length, cookie: res.headers.get("set-cookie") }
    }
    const beacon = { v: 1, p: "/products/hat", k: "l", w: 390, c: "4g", lcp: 3100, inp: 140, cls: 0.05, fcp: 1500, ttfb: 420 }
    const a = await send("alpha.storelib.com", beacon)
    check("A's subdomain: recorded for A's live install, answered 204 with no cookie", a.status === 204 && a.rec?.p_install === INSTALL_A && a.rec?.p_creator === CREATOR_A && !a.cookie, JSON.stringify(a.rec))
    check("  with the page, its type, a phone, Safari, the country, the numbers", a.rec?.p_path === "/products/hat" && a.rec?.p_type === "product" && a.rec?.p_device === "mobile" && a.rec?.p_browser === "Safari" && a.rec?.p_country === "GB" && a.rec?.p_lcp === 3100 && a.rec?.p_conn === "4g")
    check("  and nothing about the visitor: no address, no agent", !JSON.stringify(a.rec).includes("203.0.113") && !JSON.stringify(a.rec).includes("iPhone"))
    const b = await send("shop.beta-store.com", beacon, undefined, "203.0.113.21")
    check("B's connected domain: recorded for B", b.rec?.p_install === INSTALL_B && b.rec?.p_creator === CREATOR_B, JSON.stringify(b.rec))
    const claim = await send("alpha.storelib.com", { ...beacon, s: INSTALL_B, install: INSTALL_B, creator: CREATOR_B }, undefined, "203.0.113.22")
    check("a body naming B's site on A's host is still A's", claim.rec?.p_install === INSTALL_A && claim.rec?.p_creator === CREATOR_A)
    const nobody = await send("storelib.com", beacon, undefined, "203.0.113.23")
    const vercel = await send("x.vercel.app", beacon, undefined, "203.0.113.24")
    const pending = await send("pending-domain.com", beacon, undefined, "203.0.113.25")
    const unpublished = await send("gamma.storelib.com", beacon, undefined, "203.0.113.26")
    check("storelib.com, a vercel.app host, an unverified domain and an unpublished site are nobody's", nobody.n === 0 && vercel.n === 0 && pending.n === 0 && unpublished.n === 0)
    const bot = await send("alpha.storelib.com", beacon, "Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)", "203.0.113.27")
    const headless = await send("alpha.storelib.com", beacon, "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/128.0 Safari/537.36", "203.0.113.28")
    const lighthouse = await send("alpha.storelib.com", beacon, "Mozilla/5.0 (Linux; Android 11; moto g power (2022)) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36 Chrome-Lighthouse", "203.0.113.29")
    const empty = await send("alpha.storelib.com", beacon, "", "203.0.113.30")
    check("a crawler, a headless browser, Google's own lab test and an empty agent are dropped", bot.n === 0 && headless.n === 0 && lighthouse.n === 0 && empty.n === 0 && bot.status === 204)
    const big = await send("alpha.storelib.com", JSON.stringify({ ...beacon, pad: "x".repeat(2000) }), undefined, "203.0.113.31")
    const junk = await send("alpha.storelib.com", "not json", undefined, "203.0.113.32")
    check("a body over 1 KB or not JSON is dropped", big.n === 0 && junk.n === 0)
    let recorded = 0
    for (let i = 0; i < 40; i++) recorded += (await send("alpha.storelib.com", beacon, undefined, "198.51.100.7")).n
    check("one address is limited to 30 a minute", recorded === 30, String(recorded))
    const desk = await send("alpha.storelib.com", { ...beacon, w: 1440 }, "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36", "203.0.113.40", "XX")
    check("a computer is desktop, Chrome, and an unknown country is no country", desk.rec?.p_device === "desktop" && desk.rec?.p_browser === "Chrome" && desk.rec?.p_country === null)
    forgetRumSites()
    const direct = await rumSiteOfHost(fakeDb().client("admin"), "alpha.storelib.com")
    check("the host lookup reads nothing for a host it does not know", direct === null)
    server.close()
  }

  // ── 10. The lab test ────────────────────────────────────────────────────
  console.log("\n10. Google PageSpeed Insights, parsed from a fixture")
  {
    const parsed = parsePsi(JSON.parse(read("tests/fixtures/pagespeed/v5-mobile-shape.json")))
    const r = parsed.ok ? (parsed as { result: import("@/lib/website-builder/pagespeed").LabResult }).result : null
    check("parsed: the score out of 100, on mobile", !!r && r.score === 58 && r.strategy === "mobile" && r.url === "https://demo.storelib.com/")
    check("the lab metrics", !!r && Math.round(r.metrics.lcp ?? 0) === 5121 && Math.round(r.metrics.fcp ?? 0) === 2614 && r.metrics.cls === 0.0712 && r.metrics.tbt === 284 && Math.round(r.metrics.ttfb ?? 0) === 186)
    check("what to fix, by time saved, the ones that pass left out", !!r && r.opportunities[0]?.id === "uses-optimized-images" && !r.opportunities.some((o) => o.id === "unminified-css" || o.id === "server-response-time") && r.opportunities.length <= 5)
    check("a per-metric saving is read when the overall one is missing", !!r && r.opportunities.some((o) => o.id === "unused-javascript" && o.savingsMs === 300))
    check("the heaviest files, heaviest first", !!r && r.largestFiles[0]?.bytes === 2140533 && r.largestFiles.length === 3)
    check("the LCP element as it reads", r?.lcpElement === "Summer collection")
    check("kept small: a few kilobytes", JSON.stringify(r).length < 4000, String(JSON.stringify(r).length))
    const quota = parsePsi(JSON.parse(read("tests/fixtures/pagespeed/v5-quota-429.json")), 429)
    check("the recorded 429 (Google's keyless quota used up) is named as such", quota.ok === false && (quota as { error: string }).error === "quota")
    check("a page Google could not load", (parsePsi({ lighthouseResult: { audits: {}, runtimeError: { code: "FAILED_DOCUMENT_REQUEST" } } }) as { error?: string }).error === "unreachable")
    check("anything else is not a result", parsePsi(null).ok === false && parsePsi({ foo: 1 }).ok === false)
    const ev = labEvidence(r)
    check("evidence for LCP is the heavy image; for FCP the blocking files; none for a fast server", ev.lcp?.kind === "largest-file" && ev.fcp?.kind === "render-blocking" && ev.ttfb === undefined)
    check("named for a sentence", fileNameOf("https://images.storelib.com/creators/demo/hero-summer.jpg?w=2") === "hero-summer.jpg" && formatBytes(2140533) === "2.1 MB" && formatBytes(640_000) === "640 KB")
    const url = psiRequestUrl("https://demo.storelib.com/", "desktop", { key: "k", locale: "fr" })
    check("the request: the page, the strategy, performance only, the key when there is one", url.startsWith("https://www.googleapis.com/pagespeedonline/v5/runPagespeed?") && url.includes("strategy=desktop") && url.includes("category=performance") && url.includes("key=k") && url.includes("locale=fr"))
    const route = code("app/api/website-builder/themes/[installId]/performance/lab/route.ts")
    check("the route tests only the site's own address, from the database", /siteOrigin\(creator\.id/.test(route) && /const PATH = /.test(route) && !/body\.url/.test(route))
    check("the key is server side only", /process\.env\.PAGESPEED_API_KEY/.test(route) && !/NEXT_PUBLIC_PAGESPEED/.test(read("components/website-builder/website-settings/performance.tsx") + route))
    check("rate limited per person and per site, and once a minute per strategy", /LIMITS\.siteLabTest/.test(route) && /LAB_COOLDOWN_MS/.test(route))
  }

  // ── 11. The collector on the page ───────────────────────────────────────
  console.log("\n11. The collector is small, late, and sends nothing personal")
  {
    const gz = gzipSync(SITE_VITALS_JS, { level: 9 }).length
    check(`under 2 KB gzipped (${gz} bytes, ${SITE_VITALS_JS.length} raw)`, gz < 2048)
    let parses = true
    try {
      new Function(SITE_VITALS_JS)
    } catch {
      parses = false
    }
    check("it is valid JavaScript", parses)
    check("never in a frame or a scripted browser, once per page", /W\.self!==W\.top/.test(SITE_VITALS_JS) && /N\.webdriver/.test(SITE_VITALS_JS) && /__slSV/.test(SITE_VITALS_JS))
    check("the observers start after load, at an idle moment", /addEventListener\("load",idle/.test(SITE_VITALS_JS) && /requestIdleCallback/.test(SITE_VITALS_JS))
    check("the browser's own observers for every metric, no library", ["largest-contentful-paint", "layout-shift", "event", "first-input", "paint"].every((t) => SITE_VITALS_JS.includes(`"${t}"`)) && /responseStart/.test(SITE_VITALS_JS) && !/"web-vitals"/.test(read("package.json")))
    check("sent once per page view on hide or leave, by beacon, with no credentials", /"visibilitychange"/.test(SITE_VITALS_JS) && /"pagehide"/.test(SITE_VITALS_JS) && /sendBeacon/.test(SITE_VITALS_JS) && /credentials:"omit"/.test(SITE_VITALS_JS) && /if\(v\.sent\)return/.test(SITE_VITALS_JS))
    check("no cookie, no storage, no site id, no layout read", !/cookie|localStorage|sessionStorage|getBoundingClientRect|offsetWidth|install/i.test(SITE_VITALS_JS))
    check("a page change without a reload is its own page view", /pushState/.test(SITE_VITALS_JS) && /popstate/.test(SITE_VITALS_JS) && /view\("s",t0\)/.test(SITE_VITALS_JS))
    check("the tag for an imported theme's head", siteVitalsScript().startsWith("<script data-storelib-vitals=\"\">") && siteVitalsScript().includes(SITE_VITALS_JS))
    check("a Storelib theme's page renders the same script, not a bundle", /dangerouslySetInnerHTML=\{\{ __html: SITE_VITALS_JS \}\}/.test(code("components/website-builder/site-vitals.tsx")) && !/"use client"/.test(read("components/website-builder/site-vitals.tsx")))
  }

  // ── 12. The tab and the tables ──────────────────────────────────────────
  console.log("\n12. The tab is in Website settings, and the tables are the creator's alone")
  {
    const types = read("components/website-builder/website-settings/types.ts")
    check("Performance is listed under Going live", /\{ id: "performance", get label\(\) \{ return tt\("Performance"\) \}, group: "live" \}/.test(types))
    check("and drawn by the settings page", /section === "performance" && <PerformanceSettings ctx=\{ctx\} \/>/.test(read("components/website-builder/project-settings.tsx")))
    const sql = read("supabase/sql/run-now/210_site_web_performance.sql")
    for (const t of ["site_rum_events", "site_rum_counters", "site_rum_daily", "site_lab_tests"]) {
      check(`${t}: row level security, read by its creator only`, new RegExp(`alter table public\\.${t} enable row level security`).test(sql) && new RegExp(`on public\\.${t} for select to authenticated using \\(creator_id in \\(select c\\.id from public\\.creators c where c\\.user_id = auth\\.uid\\(\\)\\)\\)`).test(sql))
    }
    check("nobody writes from a browser", /revoke insert, update, delete on public\.site_rum_events, public\.site_rum_counters, public\.site_rum_daily, public\.site_lab_tests from anon, authenticated/.test(sql) && !/for insert/i.test(sql))
    check("the write, the rollup and the cleanup are the service role's alone", ["record_site_rum", "site_rum_replace_day", "site_rum_cleanup"].every((f) => new RegExp(`revoke all on function public\\.${f}\\([^)]*\\) from public, anon, authenticated`).test(sql)))
    check("the window runs as the asker, so the policy applies", /site_rum_window[\s\S]*?security invoker/.test(sql))
    check("no address, agent or identifier in the page view table", !/\b(ip|user_agent|visitor|session_id|email|url)\b/i.test(sql.split("\n").find((l) => l.startsWith("CREATE TABLE IF NOT EXISTS public.site_rum_events") || l.startsWith("create table if not exists public.site_rum_events")) ?? "x ip"))
    check("every line of part 210 is a note or one whole statement", sql.trim().split("\n").every((l) => (l.startsWith("/*") ? l.endsWith("*/") : l.trim().endsWith(";"))))
    check("the migration says the same", read("supabase/migrations/20270201_v2_site_web_performance.sql").includes("create table if not exists public.site_rum_events"))
    check("listed in the README and the check after", /`210_site_web_performance\.sql`/.test(read("supabase/sql/run-now/README.md")) && /as p210_site_web_performance/.test(read("supabase/sql/run-now/99_check_after.sql")))
    const routeRead = code("app/api/website-builder/themes/[installId]/performance/route.ts")
    check("the read route proves the install is the signed in creator's, then reads as the user", /\.eq\("creator_id", creator\.id\)/.test(routeRead) && /readPerformance\(\{ user: supabase/.test(routeRead))
    const reader = code("lib/website-builder/web-performance-read.ts")
    check("the reader reads with the user's client: the policies decide", /user\.rpc\("site_rum_window"/.test(reader) && /user\s*\.from\("site_rum_daily"\)/.test(reader) && /readEvents\(user, installId/.test(reader))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) {
    console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
    process.exit(1)
  }
}

/* ── An in-memory database the reader can be handed as either client ───── */

type Row = Record<string, unknown>
function fakeDb(opts: { missing?: boolean } = {}) {
  const tables: Record<string, Row[]> = { site_rum_events: [], site_rum_counters: [], site_rum_daily: [], site_lab_tests: [] }
  const calls: string[] = []
  const missing = { code: "42P01", message: 'relation "site_rum_counters" does not exist' }
  function client(who: "user" | "admin") {
    return {
      from(table: string) {
        const filters: Array<(r: Row) => boolean> = []
        let order: { col: string; asc: boolean } | null = null
        let from = 0
        let to = Infinity
        let limit = Infinity
        const q = {
          select() {
            return q
          },
          eq(c: string, v: unknown) {
            filters.push((r) => r[c] === v)
            return q
          },
          is(c: string, v: unknown) {
            filters.push((r) => (r[c] ?? null) === v)
            return q
          },
          gte(c: string, v: string) {
            filters.push((r) => String(r[c]) >= v)
            return q
          },
          lt(c: string, v: string) {
            filters.push((r) => String(r[c]) < v)
            return q
          },
          lte(c: string, v: string) {
            filters.push((r) => String(r[c]) <= v)
            return q
          },
          order(col: string, o?: { ascending?: boolean }) {
            order = { col, asc: o?.ascending !== false }
            return q
          },
          range(a: number, b: number) {
            from = a
            to = b
            return q
          },
          limit(n: number) {
            limit = n
            return q
          },
          maybeSingle() {
            return run().then((r) => ({ data: r.data?.[0] ?? null, error: r.error }))
          },
          then(res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) {
            return run().then(res, rej)
          },
        }
        function run(): Promise<{ data: Row[] | null; error: typeof missing | null }> {
          if (table === "site_rum_events") calls.push(`${who} from site_rum_events`)
          if (opts.missing) return Promise.resolve({ data: null, error: missing })
          let rows = (tables[table] ?? []).filter((r) => filters.every((f) => f(r)))
          if (order) {
            const { col, asc } = order
            rows = [...rows].sort((a, b) => (String(a[col]) < String(b[col]) ? -1 : String(a[col]) > String(b[col]) ? 1 : 0) * (asc ? 1 : -1))
          }
          rows = rows.slice(from, Math.min(to + 1, from + limit))
          return Promise.resolve({ data: rows, error: null })
        }
        return q
      },
      rpc(fn: string, args: Record<string, unknown>) {
        calls.push(`${who} rpc ${fn}${fn === "site_rum_replace_day" ? ` ${args.p_install} ${args.p_day}` : ""}`)
        if (opts.missing) return Promise.resolve({ data: null, error: missing })
        if (fn === "site_rum_replace_day") {
          tables.site_rum_daily = tables.site_rum_daily.filter((r) => !(r.install_id === args.p_install && r.day === args.p_day))
          const rows = (args.p_rows as Row[]).map((r) => ({ ...r, install_id: args.p_install, day: args.p_day }))
          tables.site_rum_daily.push(...rows)
          for (const c of tables.site_rum_counters) if (c.install_id === args.p_install && c.day === args.p_day) c.rolled_at = "now"
          return Promise.resolve({ data: rows.length, error: null })
        }
        if (fn === "site_rum_window") {
          const rows = tables.site_rum_daily
            .filter((r) => r.install_id === args.p_install && String(r.day) >= String(args.p_from) && String(r.day) <= String(args.p_to))
            .map((r) => aggFromDb(r as never))
            .filter((r): r is NonNullable<typeof r> => !!r)
          return Promise.resolve({ data: mergeAggs(rows).map(aggToDb), error: null })
        }
        return Promise.resolve({ data: null, error: null })
      },
    }
  }
  return { tables, calls, client }
}

/* ── A fake PostgREST for the beacon route: the tables a host is resolved with ── */

const CREATOR_A = "aaaaaaaa-0000-4000-8000-000000000001"
const CREATOR_B = "bbbbbbbb-0000-4000-8000-000000000001"
const CREATOR_C = "cccccccc-0000-4000-8000-000000000001"
const INSTALL_A = "aaaaaaaa-1111-4111-8111-000000000001"
const INSTALL_B = "bbbbbbbb-1111-4111-8111-000000000001"

async function fakePostgrest() {
  const tables: Record<string, Row[]> = {
    profiles: [
      { id: "p-alpha", username: "alpha" },
      { id: "p-gamma", username: "gamma" },
    ],
    creators: [
      { id: CREATOR_A, user_id: "p-alpha", slug: "alpha", banned_at: null },
      { id: CREATOR_B, user_id: "p-beta", slug: "beta", banned_at: null },
      { id: CREATOR_C, user_id: "p-gamma", slug: "gamma", banned_at: null },
    ],
    custom_domains: [
      { domain: "shop.beta-store.com", creator_id: CREATOR_B, status: "active", purpose: "website" },
      { domain: "pending-domain.com", creator_id: CREATOR_A, status: "pending", purpose: "website" },
    ],
    store_theme_installs: [
      { id: INSTALL_A, creator_id: CREATOR_A, status: "published", sort_order: 0 },
      { id: "aaaaaaaa-1111-4111-8111-000000000002", creator_id: CREATOR_A, status: "draft", sort_order: 1 },
      { id: INSTALL_B, creator_id: CREATOR_B, status: "published", sort_order: 0 },
      { id: "cccccccc-1111-4111-8111-000000000001", creator_id: CREATOR_C, status: "draft", sort_order: 0 },
    ],
    site_deployments: [],
    website_addresses: [],
    website_address_history: [],
  }
  const records: unknown[] = []
  const body = (req: IncomingMessage) =>
    new Promise<string>((resolve) => {
      let b = ""
      req.on("data", (c) => (b += c))
      req.on("end", () => resolve(b))
    })
  const server = createServer(async (req, res) => {
    const text = await body(req)
    const url = new URL(req.url ?? "/", "http://x")
    res.setHeader("content-type", "application/json")
    if (url.pathname === "/rest/v1/rpc/record_site_rum") {
      records.push(JSON.parse(text))
      return res.end("true")
    }
    const table = url.pathname.replace("/rest/v1/", "")
    let rows = tables[table] ?? []
    for (const [k, v] of url.searchParams) {
      if (["select", "order", "limit", "offset"].includes(k)) continue
      if (v.startsWith("eq.")) rows = rows.filter((r) => String(r[k]) === v.slice(3))
      else if (v.startsWith("in.(")) {
        const set = v.slice(4, -1).split(",").map((s) => s.replace(/^"|"$/g, ""))
        rows = rows.filter((r) => set.includes(String(r[k])))
      }
    }
    if (url.searchParams.get("order")?.startsWith("sort_order")) rows = [...rows].sort((a, b) => Number(a.sort_order) - Number(b.sort_order))
    const limit = Number(url.searchParams.get("limit") ?? "0")
    if (limit > 0) rows = rows.slice(0, limit)
    res.end(JSON.stringify(rows))
  })
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()))
  return { port: (server.address() as { port: number }).port, records, close: () => server.close() }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
