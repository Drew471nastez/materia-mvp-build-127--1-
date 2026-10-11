/**
 * /admin/performance read "insufficient data" nearly everywhere (round 20,
 * W2). Why, and what holds it now:
 *
 *   one page load in five, one API call in five      every one, with caps
 *   server timings waited for 25 rows a quiet          a write after each
 *     serverless instance never had                      response
 *   a browser batch waited for 20 items or a hide      sent at the next idle
 *                                                        moment too
 *   /api/perf/beacon, a path ad blockers match         /api/public/m
 *   storelib.com only                                  OnePages (storelib.me)
 *                                                        and a website's own
 *                                                        checkout too
 *   imported themes' pages never measured              an inline collector
 *   no editor, checkout, webhook or job timings        flow steps, webhooks,
 *                                                        scheduled job runs
 *   a figure under 20 samples showed nothing           a provisional figure,
 *                                                        with its confidence
 *
 * The routes are run against a fake PostgREST on a local port, so what
 * reaches the database is what is checked, not what a mock was told.
 */

import { createServer, type IncomingMessage } from "node:http"
import { readFileSync } from "node:fs"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { NextRequest } from "next/server"

import { PerformanceAdmin } from "@/app/admin/performance/performance-admin"
import { POST as beaconPOST } from "@/app/api/public/m/route"
import { POST as siteVitalsPOST } from "@/app/api/public/sv/route"
import { BEACON_PATH, MIN_RATE_BASE, MIN_SAMPLES, SITE_BEACON_PATH, STEPS, STEP_ROUTES } from "@/lib/perf/config"
import { onePageRoute } from "@/lib/onepage/host-route"
import { recordCronRun } from "@/lib/observability/report"
import type { PerfReport } from "@/lib/perf/report"
import { classify, classifyFor } from "@/lib/perf/routes"
import { NO_EXTRAS, SUB_SCORES, confidenceOf, healthIndex, provisionalFloor, scoreSub, stepFailShare, type Aggregate } from "@/lib/perf/scoring"
import { flushTimings, pendingTimings, timed, underRouteCap } from "@/lib/perf/server-timing"
import { siteVitalsScript } from "@/lib/perf/site-vitals-inline"
import { cleanBatch } from "@/lib/perf/telemetry"

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
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))
/** Until `ok` holds, or three seconds. */
async function until(ok: () => boolean): Promise<void> {
  for (let t = 0; t < 60 && !ok(); t++) await wait(50)
}

function agg(area: string, metric: string, samples: number, p75: number, device = "*", bad = 0, route = "*"): Aggregate {
  return { area, device, route, metric, samples, p50: p75, p75, p95: p75, bad }
}

/* ── A fake PostgREST: every call recorded, answered like Supabase would ── */
type Call = { method: string; path: string; body: unknown }
const calls: Call[] = []
function body(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let b = ""
    req.on("data", (c) => (b += c))
    req.on("end", () => resolve(b))
  })
}
const db = createServer(async (req, res) => {
  const text = await body(req)
  const path = (req.url ?? "").split("?")[0]
  let parsed: unknown = null
  try {
    parsed = text ? JSON.parse(text) : null
  } catch {
    parsed = text
  }
  calls.push({ method: req.method ?? "", path, body: parsed })
  res.setHeader("content-type", "application/json")
  if (path === "/rest/v1/rpc/perf_ingest") return res.end(JSON.stringify(Array.isArray((parsed as { p_rows?: unknown[] })?.p_rows) ? (parsed as { p_rows: unknown[] }).p_rows.length : 0))
  if (path === "/rest/v1/rpc/record_site_vital") return res.end("true")
  if (path === "/rest/v1/store_theme_installs") {
    const row = { creator_id: "6c2b0a51-7a43-4f7e-8d43-6e0f3c3f2a10", status: "published" }
    return res.end(JSON.stringify((req.headers.accept ?? "").includes("vnd.pgrst.object") ? row : [row]))
  }
  if (path === "/rest/v1/cron_runs") return res.end(JSON.stringify([{ id: 7 }]))
  res.end("[]")
})

const ingests = (source: "client" | "server") =>
  calls.filter((c) => c.path === "/rest/v1/rpc/perf_ingest" && (c.body as { p_source?: string })?.p_source === source).flatMap((c) => (c.body as { p_rows: Array<Record<string, unknown>> }).p_rows)

async function main() {
  await new Promise<void>((r) => db.listen(0, "127.0.0.1", () => r()))
  const port = (db.address() as { port: number }).port
  process.env.NEXT_PUBLIC_SUPABASE_URL = `http://127.0.0.1:${port}`
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role"

  console.log("\nWhich pages measure themselves, on which hosts")
  {
    check("storelib.com and the apps: as before", JSON.stringify(classifyFor("storelib.com", "/app/products")) === JSON.stringify({ area: "app", route: "/app/products" }))
    check("a buyer's side of the app is the Dashboard area", classify("/library")?.area === "app" && classify("/library/3f2b7c1e-1111-4222-8333-444455556666")?.route === "/library/:id")
    check("a receipt is checkout", classify("/receipt/abc")?.area === "checkout")
    check("storelib.me/{name} is a creator page, nothing else there is", classifyFor("storelib.me", "/mara")?.route === "/:onepage" && classifyFor("storelib.me", "/mara/x") === null && classifyFor("storelib.me", "/robots.txt") === null)
    check("a website's own checkout and receipt, on a subdomain or a connected domain", classifyFor("mara.storelib.com", "/checkout/site")?.route === "/checkout/site" && classifyFor("shop.example.com", "/checkout/site/thanks/9f8e7d6c")?.route === "/checkout/site/thanks/:id" && classifyFor("shop.example.com", "/receipt")?.area === "checkout")
    check("the website's own pages are left to their own collector", classifyFor("mara.storelib.com", "/") === null && classifyFor("shop.example.com", "/products/hat") === null)
    check("the OnePage host lets the beacon through, and nothing else new", onePageRoute({ host: "storelib.me", pathname: BEACON_PATH, search: "", method: "POST", userAgent: "Mozilla/5.0", mainDomain: "storelib.com" })?.kind === "next" && onePageRoute({ host: "storelib.me", pathname: "/api/perf/admin", search: "", method: "GET", userAgent: "Mozilla/5.0", mainDomain: "storelib.com" })?.kind === "not-found")
    check("first party paths with no word ad blockers match", !/beacon|perf|vital|track|analytic|collect/i.test(BEACON_PATH + SITE_BEACON_PATH) && BEACON_PATH.startsWith("/api/public/") && SITE_BEACON_PATH.startsWith("/api/public/"))
  }

  console.log("\nFlow steps: only the listed ones, in their own area")
  {
    const rows = cleanBatch(
      {
        i: [
          ["step", "builder", "/step/editor/save", 412.4],
          ["step", "app", "/step/editor/save", 412], // wrong area
          ["step", "builder", "/step/editor/anything", 10], // not listed
          ["fail", "checkout", "/step/checkout/intent", 1, "Network Error: https://x.y/?a=b"],
          ["lcp", "app", "/step/editor/open", 100], // a page route can never be a step's
          ["step", "checkout", "/step/checkout/ready", 120_000], // past a minute
        ],
      },
      "mobile",
    )
    check("one step and one failure pass", rows.length === 2, JSON.stringify(rows))
    check("a step keeps its time, rounded", rows[0]?.m === "step" && rows[0]?.v === 412 && rows[0]?.r === "/step/editor/save" && rows[0]?.a === "builder")
    check("a failure keeps a short code and nothing of a message", rows[1]?.m === "fail" && rows[1]?.v === 1 && /^[a-z0-9_]{0,32}$/.test(String(rows[1]?.x)))
    check("every step names a known area and its own lines", STEP_ROUTES.every((r) => r.startsWith("/step/") && STEPS[r].good < STEPS[r].poor))
    const editor = read("app/website-builder/editor/[installId]/page.tsx")
    check("the editor times its opening, its canvas and its saves", /perfStep\("\/step\/editor\/open", sinceScreenStart\(\)\)/.test(editor) && /perfStep\("\/step\/editor\/canvas"/.test(editor) && /perfStep\("\/step\/editor\/save"/.test(editor) && /perfFail\("\/step\/editor\/save"/.test(editor))
    const pay = read("app/checkout/parts/stripe-pay.tsx")
    check("checkout times the form, the intent and the confirm, wallets included", /perfStep\("\/step\/checkout\/ready"/.test(pay) && (pay.match(/timedStep\("\/step\/checkout\/intent"/g) ?? []).length === 2 && (pay.match(/noteConfirm\(t0, /g) ?? []).length === 3)
    check("a declined card is not counted as a failure", /error\.type !== "card_error" && error\.type !== "validation_error"/.test(pay))
  }

  console.log("\nThe collector: every load, idle flushes, caps, steps waiting for it")
  {
    const client = read("lib/perf/beacon-client.ts")
    check("sends to the first party path", /const ENDPOINT = BEACON_PATH/.test(client))
    check("flushes a few seconds after something was measured, at an idle moment", /const FLUSH_AFTER_MS = 4000/.test(client) && /idle\(send, \{ timeout: 2000 \}\)/.test(client))
    check("in chunks the route accepts", /queue\.splice\(0, FLUSH_AT\)/.test(client))
    check("caps per page load", /sentCount >= MAX_ITEMS_PER_PAGE_LOAD/.test(client) && /viewCount <= FULL_VIEWS_PER_PAGE_LOAD \|\| viewCount % VIEW_SAMPLE_AFTER === 0/.test(client) && /stepCount >= MAX_STEPS_PER_PAGE_LOAD/.test(client))
    check("takes the steps that waited, and the ones to come", /waiting\.splice\(0, waiting\.length\)/.test(client) && /waiting\.take = takeStep/.test(client))
    check("a page back from the back/forward cache is a view", /pageshow/.test(client) && /persisted/.test(client))
    check("a page hidden before it loaded has no LCP after that", /visibility-state/.test(client))
    check("on any host classifyFor allows, not storelib.com alone", /isStorelibHost\(host\) && !classifyFor\(host, location\.pathname\)/.test(client))
  }

  console.log("\nAn imported theme's page measures itself")
  {
    const id = "0f6a2c1e-5b7d-4e2a-9c3b-1d2e3f4a5b6c"
    const js = siteVitalsScript(id)
    check("an inline script with the site's id and the site beacon's path", js.startsWith("<script") && js.includes(JSON.stringify(id)) && js.includes(JSON.stringify(SITE_BEACON_PATH)))
    check("never in a frame or a scripted browser, once per page", /window\.self!==window\.top/.test(js) && /navigator\.webdriver/.test(js) && /__slSV/.test(js))
    check("anything that is not an install id is no script at all", siteVitalsScript("x\"><img>") === "")
    check("the body is the shape the site route reads", /JSON\.stringify\(\{s:ID,lcp:/.test(js))
    const site = read("lib/website-builder/compat-site.ts")
    check("added to every live page, never to a preview", /: `\$\{liveNavigationEnd\(\)\}\$\{siteVitalsScript\(row\.id\)\}`/.test(site) && /extraBodyEnd: draft \? `<div/.test(site))
    check("the React collector sends to the same path", /const ENDPOINT = SITE_BEACON_PATH/.test(read("components/website-builder/site-vitals.tsx")))
  }

  console.log("\nThe beacon route stores what passes, through perf_ingest (fake database)")
  {
    calls.length = 0
    const req = new NextRequest(`https://storelib.com${BEACON_PATH}`, {
      method: "POST",
      body: JSON.stringify({ i: [["lcp", "app", "/app", 1820], ["step", "builder", "/step/editor/open", 2400], ["nav", "explore", "/explore", 300], ["evil", "app", "/app", 1]] }),
      headers: { "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Capacitor StorelibWindows/1", "x-forwarded-for": "203.0.113.9" },
    })
    const res = await beaconPOST(req)
    const rows = ingests("client")
    check("answered 204", res.status === 204)
    check("three rows reach perf_ingest, the unknown one never", rows.length === 3, JSON.stringify(rows))
    check("the app on an iPhone is a phone", rows.every((r) => r.d === "mobile"))
    check("with the client cap", (calls.find((c) => c.path === "/rest/v1/rpc/perf_ingest")?.body as { p_cap?: number })?.p_cap === 50_000)
  }

  console.log("\nA published website's vitals land through the new path (fake database)")
  {
    calls.length = 0
    const res = await siteVitalsPOST(
      new NextRequest(`https://shop.example.com${SITE_BEACON_PATH}`, {
        method: "POST",
        body: JSON.stringify({ s: "0f6a2c1e-5b7d-4e2a-9c3b-1d2e3f4a5b6c", lcp: 1500.4, cls: 0.02 }),
        headers: { "user-agent": "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/128 Mobile Safari/537.36", "x-forwarded-for": "203.0.113.10" },
      }),
    )
    const rec = calls.find((c) => c.path === "/rest/v1/rpc/record_site_vital")?.body as Record<string, unknown> | undefined
    check("answered 204 and recorded for the published site", res.status === 204 && rec?.p_lcp === 1500 && rec?.p_device === "mobile", JSON.stringify(rec))
  }

  console.log("\nThe server: every call timed, capped per route, written after the answer")
  {
    calls.length = 0
    const store = new Map<string, { n: number; until: number }>()
    let allowed = 0
    for (let k = 0; k < 10; k++) if (underRouteCap("/api/x", 1_000_000, store, 6)) allowed++
    check("a route past its cap a minute is not recorded for the rest of it", allowed === 6 && underRouteCap("/api/x", 1_061_000, store, 6))
    const before = pendingTimings().length
    const handler = timed("builder", "/api/website-builder/themes/:id/sections", async (_req: Request) => new Response("ok", { status: 200 }))
    const res = await handler(new Request("https://storelib.com/api/website-builder/themes/1/sections", { headers: { "user-agent": "Mozilla/5.0 (Macintosh)" } }))
    check("the answer is untouched", res.status === 200 && (await res.text()) === "ok")
    check("and the call waits to be written", pendingTimings().length === before + 1)
    /* In a request, `after` runs this once the answer has gone (checked in source below); a test has no request. */
    await flushTimings()
    await until(() => ingests("server").length > 0)
    const rows = ingests("server")
    const st = read("lib/perf/server-timing.ts")
    check("every recorded call asks for a write after its answer, one pending at a time", /function push\(row: PerfRow \| null\) \{[\s\S]*?buffer\.push\(row\)\s*schedule\(\)/.test(st) && /if \(pending\) return\s*pending = true\s*try \{\s*after\(flush\)/.test(st))
    check("written without waiting for a batch to fill (the quiet instance case)", rows.some((r) => r.r === "/api/website-builder/themes/:id/sections" && r.a === "builder" && r.s === 200), JSON.stringify(rows))
    check("and the buffer is empty again", pendingTimings().length === 0)

    calls.length = 0
    process.env.CRON_SECRET = "cron-test-secret"
    const out = await recordCronRun("/api/cron/notify", new Request("https://x.vercel.app/api/cron/notify", { headers: { authorization: "Bearer cron-test-secret" } }), async () => new Response("{}", { status: 200 }))
    await flushTimings()
    await until(() => ingests("server").some((r) => r.m === "job"))
    const job = ingests("server").find((r) => r.m === "job")
    check("a scheduled job's run is timed with what it answered", out.status === 200 && job?.a === "infra" && job?.r === "/api/cron/notify" && job?.s === 200, JSON.stringify(job))
    const routes: Array<[string, RegExp]> = [
      /*
        Not the builder's save routes or the community routes: their own suites
        (website-builder-api, communities-security) read each handler as an
        exported async function, and a save's time is measured where it is
        felt, in the editor (/step/editor/save).
      */
      ["app/api/website-builder/themes/[installId]/files/route.ts", /export const GET = timed\("builder"/],
      ["app/api/notifications/route.ts", /export const GET = timed\("app"/],
      ["app/api/v2/search/route.ts", /export const GET = timed\("explore"/],
      ["app/api/checkout/quick-free/route.ts", /export const POST = timed\("checkout"/],
      ["app/api/stripe/webhook/route.ts", /export const POST = timed\("infra"/],
      ["app/api/webhooks/mailgun/route.ts", /export const POST = timed\("infra"/],
      ["app/api/site-theme/site/[username]/[[...path]]/route.ts", /timed\("sites", "\/api\/site-theme\/site", handle\)/],
    ]
    const missing = routes.filter(([f, re]) => !re.test(read(f))).map(([f]) => f)
    check("the routes behind each surface are timed", missing.length === 0, missing.join(", "))
  }

  console.log("\nRule 6: a provisional score, honest about how sure it is")
  {
    check("a quarter of what rule 3 asks is the floor", provisionalFloor(MIN_SAMPLES) === 5 && provisionalFloor(MIN_RATE_BASE) === 13 && provisionalFloor(1) === 1)
    check("low, medium, high", confidenceOf(5, 20) === "low" && confidenceOf(10, 20) === "medium" && confidenceOf(20, 20) === "high" && confidenceOf(4, 20) === null)
    const explore = SUB_SCORES.find((s) => s.id === "explore")!
    const few = scoreSub(explore, [agg("explore", "lcp", 8, 2500), agg("explore", "cls", 12, 0)], NO_EXTRAS)
    check("few samples: no official sub score", few.score === null && few.used === 0)
    check("but a provisional one, their average, as sure as the least sure", few.provisional?.score === 95 && few.provisional?.used === 2 && few.provisional?.confidence === "low", JSON.stringify(few.provisional))
    const lcp = few.measures.find((m) => m.key === "explore.*.lcp")!
    check("the figure keeps its value, marked, with no official score", lcp.score === null && lcp.pscore === 90 && lcp.confidence === "low" && lcp.need === MIN_SAMPLES && !lcp.enough)
    const under = scoreSub(explore, [agg("explore", "lcp", 4, 2500)], NO_EXTRAS)
    check("under the floor it is insufficient data, provisional or not", under.provisional === null && under.measures[0].pscore === null)
    const official = scoreSub(explore, [agg("explore", "lcp", 100, 2500), agg("explore", "cls", 100, 0)], NO_EXTRAS)
    check("an official sub score is its own provisional one, high", official.score === 95 && official.provisional?.score === 95 && official.provisional?.confidence === "high")

    const quiet = healthIndex([agg("explore", "lcp", 8, 2500), agg("explore", "cls", 12, 0), agg("app", "nav", 15, 400), agg("app", "inp", 6, 200)], NO_EXTRAS)
    check("a quiet day: no official Health Index", quiet.score === null)
    check("and a provisional one from the sub scores that have one, weighted", quiet.provisional !== null && quiet.provisional.used === 2 && quiet.provisional.confidence === "low", JSON.stringify(quiet.provisional))
    const empty = healthIndex([], NO_EXTRAS)
    check("nothing measured: nothing at all, provisional included", empty.score === null && empty.provisional === null)

    const builder = SUB_SCORES.find((s) => s.id === "builder")!
    check("the builder scores its flow steps", ["step.editor.open", "step.editor.canvas", "step.editor.save", "fail.editor.save"].every((k) => builder.measures.some((m) => m.key === k)))
    const checkout = SUB_SCORES.find((s) => s.id === "checkout")!
    check("checkout scores the payment form, the intent and the confirm", ["step.checkout.ready", "fail.checkout.ready", "step.checkout.intent", "fail.checkout.intent", "fail.checkout.confirm"].every((k) => checkout.measures.some((m) => m.key === k)))
    const infra = SUB_SCORES.find((s) => s.id === "infra")!
    check("infrastructure reads job runs and webhooks", infra.measures.some((m) => m.key === "infra.job_failures") && infra.measures.some((m) => m.key === "infra.webhooks"))
    const mobile = SUB_SCORES.find((s) => s.id === "mobile")!
    check("mobile also reads what every phone reports (FCP, TTFB)", mobile.measures.some((m) => m.key === "*.mobile.fcp") && mobile.measures.some((m) => m.key === "*.mobile.ttfb"))
    const share = stepFailShare([agg("checkout", "step", 95, 900, "*", 0, "/step/checkout/intent"), agg("checkout", "fail", 5, 1, "*", 0, "/step/checkout/intent")], "/step/checkout/intent")
    check("a step's failure share: failures of all attempts", share.value === 5 && share.base === 100 && share.enough)
    const s = scoreSub(infra, [agg("infra", "job", 300, 2000, "*", 3), agg("infra", "api", 80, 250)], NO_EXTRAS)
    check("with job runs and webhooks, infrastructure scores without a token", s.score !== null && s.used === 2, JSON.stringify(s.measures.map((m) => [m.key, m.score])))
  }

  console.log("\nThe page says provisional where it is, and nothing where nothing was measured")
  {
    const aggs = [agg("explore", "lcp", 8, 2500), agg("explore", "cls", 12, 0), agg("*", "lcp", 9, 2100, "mobile")]
    const report: PerfReport = {
      generatedAt: new Date().toISOString(),
      window: "30d",
      ready: true,
      readyReason: null,
      sampling: { client: 1, server: 1 },
      health: healthIndex(aggs, NO_EXTRAS),
      aggs,
      history: [{ day: new Date(Date.now() - 86_400_000).toISOString().slice(0, 10), score: null, subs: [], provisional: { score: 81, confidence: "low" } }],
      errors: [],
      slow: { available: false, reason: "pg_stat_statements is not enabled" },
      payments: { failed: 0, completed: 0 },
      jobs: { late: 0, known: 0 },
      supabase: { configured: false },
      vercel: { configured: false },
      problems: [],
      optimizations: [],
    }
    const html = renderToStaticMarkup(createElement(PerformanceAdmin, { initial: report }))
    check("the index is provisional, said so, with its confidence", html.includes("data-health-score-provisional") && /Provisional · low confidence/.test(html) && !html.includes("data-health-score=\""))
    check("a figure on few samples shows its number, marked provisional", html.includes("data-figure-provisional") && /Provisional, 9 of 20/.test(html))
    check("a sub score on few samples shows its provisional score", html.includes("data-sub-provisional"))
    check("the history shows a provisional day as such", /81, provisional/.test(html))
    check("the 30 day window is offered", html.includes("30 days"))
    check("the flow steps have their own panel", html.includes("data-steps") && STEP_ROUTES.every((r) => html.includes(`data-step="${r}"`)))
    check("the header says every page load", /Measured on every page load/.test(html))
    check("no em dash in what the page says", !html.includes("—"))
  }

  db.close()
  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) {
    console.log(failures.map((f) => `  - ${f}`).join("\n"))
    process.exit(1)
  }
  process.exit(0)
}

void main()
