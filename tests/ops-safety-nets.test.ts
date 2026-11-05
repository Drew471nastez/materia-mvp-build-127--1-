/**
 * ===========================================================================
 *  SAFETY NETS THAT MEASURE: BUDGETS, BUILD MEMORY, SMOKE, LOAD, ROLLBACK
 * ===========================================================================
 * docs/operations/release-safety.md, rollback.md, load-testing.md.
 *
 *   scripts/ci/measure-build.mjs   the build's peak memory, with a ceiling
 *   scripts/perf-budget.mjs        first-load JS per key route, with budgets
 *   scripts/smoke-deploy.mjs       a deployment answers the way it should
 *   scripts/load/storefront.mjs    a read-only load test, never production by accident
 *   lib/perf/cron-health.ts        each scheduled job from its own run records
 *
 * The scripts are RUN here, not read: against a tiny process that eats
 * memory, a build folder made up for the test, and a local server that
 * answers right and then wrong.
 */
import { execFile } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { createServer, type IncomingMessage, type ServerResponse } from "node:http"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { pathToFileURL } from "node:url"
import { cronHealth, lateAfterMinutes } from "../lib/perf/cron-health"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail?: string) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; failures.push(label + (detail ? ` — ${detail}` : "")); console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ""}`) }
}
const read = (p: string) => readFileSync(p, "utf8")
const root = process.cwd()

function run(args: string[], env: Record<string, string> = {}, cwd = root): Promise<{ code: number; out: string }> {
  return new Promise((done) => {
    execFile(process.execPath, args, { cwd, env: { ...process.env, ...env }, timeout: 60_000 }, (error, stdout, stderr) => {
      const code = error ? (typeof (error as { code?: unknown }).code === "number" ? ((error as { code: number }).code) : 1) : 0
      done({ code, out: `${stdout}${stderr}` })
    })
  })
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const load = (p: string): Promise<any> => import(pathToFileURL(resolve(root, p)).href)

async function main() {
  const scratch = mkdtempSync(join(tmpdir(), "ops-nets-"))
  try {
    console.log("\nCI: the build is measured, then held to its budgets")
    {
      const ci = read(".github/workflows/ci.yml")
      const build = ci.indexOf("run: node scripts/ci/measure-build.mjs -- pnpm build")
      const budget = ci.indexOf("run: node scripts/perf-budget.mjs")
      check("the build job runs the build through the memory sampler", build > 0)
      check("  and the budgets after it, in the same job", budget > build && !/\n {2}[\w-]+:\n/.test(ci.slice(build, budget)))
      check("  with the old heap ceiling still set for the build", ci.includes("NODE_OPTIONS: --max-old-space-size=6144"))
      check("  and no fifth install (the ops suite counts four)", (ci.match(/pnpm install --frozen-lockfile/g) ?? []).length === 4)
    }

    console.log("\nBuild memory: sampled from /proc, a ceiling of 7,600 MB")
    {
      const src = read("scripts/ci/measure-build.mjs")
      check("the default ceiling is 7,600 MB", src.includes("BUILD_PEAK_LIMIT_MB || 7600"))
      check("it walks the whole process tree, not just the first process", src.includes("function tree(root)") && src.includes("/proc/${name}/stat"))
      check("it writes the job summary", src.includes("GITHUB_STEP_SUMMARY"))
      if (existsSync("/proc/self/statm")) {
        const summary = join(scratch, "summary.md")
        const eat = ["scripts/ci/measure-build.mjs", "--", process.execPath, "-e", "const b = Buffer.alloc(120 * 1024 * 1024, 1); setTimeout(() => console.log(b.length), 900)"]
        const over = await run(eat, { BUILD_PEAK_LIMIT_MB: "60", GITHUB_STEP_SUMMARY: summary })
        check("a process tree over the ceiling fails", over.code === 1, over.out.slice(-300))
        const peak = Number(/Build peak memory: (\d+) MB RSS/.exec(over.out)?.[1] ?? 0)
        check("  and the peak it measured includes the 120 MB the child held", peak >= 120, `peak ${peak} MB`)
        check("  and the summary has the figure", existsSync(summary) && /Peak RSS \(process tree\) \| \*\*\d+ MB\*\*/.test(read(summary)))
        const under = await run(eat, { BUILD_PEAK_LIMIT_MB: "100000", GITHUB_STEP_SUMMARY: "" })
        check("the same process under a higher ceiling passes", under.code === 0, under.out.slice(-300))
        const broken = await run(["scripts/ci/measure-build.mjs", "--", process.execPath, "-e", "process.exit(3)"], { GITHUB_STEP_SUMMARY: "" })
        check("a build that fails fails the step with its own code", broken.code === 3, broken.out.slice(-200))
      } else {
        check("(no /proc here: the memory run is Linux only)", true)
      }
    }

    console.log("\nPerformance budgets: first-load JS per route")
    {
      const budgets = JSON.parse(read("perf-budgets.json")) as { routes: Record<string, { firstLoadGzipKb: number; measuredGzipKb: number }>; serverOutputMb: { budget: number; measured: number } }
      const { ROUTES } = await load("scripts/perf-budget.mjs")
      const wanted = ["/", "/pricing", "/explore", "/p/[slug]", "/app", "/website-builder/editor/[installId]", "/w/[username]", "/checkout/site"]
      check("the eight key routes are measured", wanted.every((r) => ROUTES.some((x: { route: string }) => x.route === r)))
      check("  and every one has a budget", wanted.every((r) => typeof budgets.routes[r]?.firstLoadGzipKb === "number"))
      check("  each about 10% over what was measured", wanted.every((r) => { const b = budgets.routes[r]; return b.firstLoadGzipKb >= b.measuredGzipKb * 1.09 && b.firstLoadGzipKb <= b.measuredGzipKb * 1.11 + 1 }))
      /* Round 12 (PLATPERF): the dashboard's round trips per move and its memory over a long session, held by scripts/check-dashboard-roundtrips.mjs --budget. */
      const dash = (budgets as { dashboard?: { pages?: Record<string, { api: number; dbServer: number; dbBrowser: number }>; heapGrowthMb?: number; domGrowthNodes?: number } }).dashboard
      check("the dashboard has round trip budgets per page, and a ceiling on memory kept over a session", !!dash && ["/app/products", "/app/orders", "/app/analytics", "/app/emails", "/app/settings", "/app"].every((pg) => typeof dash.pages?.[pg]?.dbServer === "number" && typeof dash.pages?.[pg]?.api === "number") && typeof dash.heapGrowthMb === "number" && typeof dash.domGrowthNodes === "number")
      const roundTrips = readFileSync(join(process.cwd(), "scripts/check-dashboard-roundtrips.mjs"), "utf8")
      check("  and the probe holds a build to them: calls per move, nothing asked twice, no DOM kept", /budgets\.pages\?\.\[r\.href\]/.test(roundTrips) && /asked twice/.test(roundTrips) && /budgets\.domGrowthNodes/.test(roundTrips))
      check("the server output has a budget too", budgets.serverOutputMb.budget >= budgets.serverOutputMb.measured * 1.09 && budgets.serverOutputMb.budget <= budgets.serverOutputMb.measured * 1.11 + 1)

      /* A build folder of our own: two chunks for the runtime, one page with a layout chunk and a page chunk. */
      const next = join(scratch, "next")
      mkdirSync(join(next, "static/chunks"), { recursive: true })
      const chunk = (name: string, kb: number) => {
        let text = ""
        let seed = name.length * 7919
        while (text.length < kb * 1024) { seed = (seed * 1103515245 + 12345) & 0x7fffffff; text += seed.toString(36) }
        writeFileSync(join(next, "static/chunks", name), text)
      }
      chunk("runtime.js", 20); chunk("react.js", 40); chunk("layout.js", 30); chunk("page.js", 10); chunk("polyfill.js", 50)
      writeFileSync(join(next, "build-manifest.json"), JSON.stringify({ polyfillFiles: ["static/chunks/polyfill.js"], rootMainFiles: ["static/chunks/runtime.js", "static/chunks/react.js"] }))
      const pages: Record<string, string> = {}
      /* Changed on purpose (round 12, PLATPERF): ROUTES also measures five dashboard pages, so the fixture build has a page for every route it measures. */
      const measured = ROUTES.map((x: { route: string }) => x.route)
      for (const r of measured) pages[`/fixture${r === "/" ? "" : r}/page`] = r
      writeFileSync(join(next, "app-path-routes-manifest.json"), JSON.stringify(pages))
      for (const page of Object.keys(pages)) {
        const file = join(next, "server/app", `${page}_client-reference-manifest.js`)
        mkdirSync(resolve(file, ".."), { recursive: true })
        writeFileSync(file, `globalThis.__RSC_MANIFEST = globalThis.__RSC_MANIFEST || {};\nglobalThis.__RSC_MANIFEST[${JSON.stringify(page)}] = ${JSON.stringify({ entryJSFiles: { "[project]/app/layout": ["static/chunks/layout.js"], [`[project]/app${page}`]: ["static/chunks/layout.js", "static/chunks/page.js"] } })};\n`)
      }
      writeFileSync(join(next, "server/app/route.js.nft.json"), "x".repeat(2 * 1048576))
      const { measure } = await load("scripts/perf-budget.mjs")
      const m = measure(next)
      const home = m.routes.find((r: { route: string }) => r.route === "/")
      check("a route's first load is the runtime plus every chunk its manifest names, each once", home?.chunks === 4, JSON.stringify(home))
      check("  measured raw at the bytes on disk", Math.abs(home.rawKb - 100) < 1, `${home?.rawKb} KB`)
      check("  and gzipped, smaller", home.gzipKb > 0 && home.gzipKb < home.rawKb)
      check("  the nomodule polyfill is left out", home.rawKb < 140)
      check("the server output leaves out the .nft.json trace lists", m.serverOutputMb < 1, `${m.serverOutputMb} MB`)

      const roomy = join(scratch, "roomy.json")
      const tight = join(scratch, "tight.json")
      writeFileSync(roomy, JSON.stringify({ routes: Object.fromEntries(measured.map((r: string) => [r, { firstLoadGzipKb: 1000 }])), serverOutputMb: { budget: 10 } }))
      writeFileSync(tight, JSON.stringify({ routes: Object.fromEntries(measured.map((r: string) => [r, { firstLoadGzipKb: r === "/app" ? 1 : 1000 }])), serverOutputMb: { budget: 10 } }))
      const ok = await run(["scripts/perf-budget.mjs", "--dir", next, "--budgets", roomy], { GITHUB_STEP_SUMMARY: "" })
      check("every route within budget passes", ok.code === 0, ok.out.slice(-300))
      const over = await run(["scripts/perf-budget.mjs", "--dir", next, "--budgets", tight], { GITHUB_STEP_SUMMARY: "" })
      check("one route over its budget fails the run", over.code === 1 && over.out.includes("/app:") && over.out.includes("over its 1 KB budget"), over.out.slice(-300))
      const none = await run(["scripts/perf-budget.mjs", "--dir", join(scratch, "nothing")], { GITHUB_STEP_SUMMARY: "" })
      check("no build folder is a clear failure, not a pass", none.code === 2 && none.out.includes("Run `pnpm build` first"))
    }

    console.log("\nLoad test: read only, never production by accident")
    {
      const src = read("scripts/load/storefront.mjs")
      const L = await load("scripts/load/storefront.mjs")
      check("storelib.com is refused", typeof L.refuseTarget("https://storelib.com", false) === "string")
      check("  and any subdomain of it", typeof L.refuseTarget("https://demo.storelib.com/", false) === "string")
      check("  unless --i-mean-production", L.refuseTarget("https://storelib.com", true) === null)
      check("a preview and localhost are allowed", L.refuseTarget("https://storelib-abc.vercel.app", false) === null && L.refuseTarget("http://localhost:3100", false) === null)
      check("a lookalike is not mistaken for production", L.refuseTarget("https://notstorelib.com", false) === null)
      check("concurrency is capped at 50", L.clampConcurrency(500) === 50 && L.clampConcurrency(0) === 1 && L.clampConcurrency(8) === 8)
      check("it only ever sends GET", src.includes('method: "GET"') && !/method:\s*"(POST|PUT|PATCH|DELETE)"/.test(src))
      check("it follows no redirect and sends no cookie", src.includes('redirect: "manual"') && !/cookie/i.test(src.replace(/no cookies/gi, "").replace(/no cookie/gi, "")))
      const p = Array.from({ length: 100 }, (_, i) => i + 1)
      check("percentiles are nearest rank", L.percentile(p, 50) === 50 && L.percentile(p, 95) === 95 && L.percentile(p, 99) === 99 && L.percentile([], 50) === null)
      const s = L.summarise([
        { status: 200, ms: 10, cache: "HIT", error: null },
        { status: 200, ms: 20, cache: "MISS", error: null },
        { status: 200, ms: 30, cache: "STALE", error: null },
        { status: 503, ms: 40, cache: null, error: null },
        { status: 0, ms: null, cache: null, error: "TimeoutError" },
        { status: 404, ms: 5, cache: "MISS", error: null },
      ])
      check("errors are failures and 5xx, not 404s", s.errors === 2 && s.notFound === 1 && Math.abs(s.errorRate - 2 / 6) < 1e-9)
      check("the cache ratio is HIT and STALE over answers that carried the header", s.cacheHeaderSeen === 4 && s.cacheHitRatio === 0.5)
      const prod = await run(["scripts/load/storefront.mjs", "--base", "https://storelib.com", "--seconds", "1"])
      check("run against storelib.com it exits before sending anything", prod.code === 2 && prod.out.includes("is production"))
    }

    console.log("\nSmoke: a deployment answers the way Storelib should")
    {
      const S = await load("scripts/smoke-deploy.mjs")
      check("public, no-store, private told apart", S.cacheKind("public, s-maxage=3600") === "public" && S.cacheKind("s-maxage=300, stale-while-revalidate=1") === "public" && S.cacheKind("private, no-cache, no-store, max-age=0") === "no-store" && S.cacheKind("private, no-cache") === "private" && S.cacheKind(null) === "none")
      const plan = S.plan("https://x.vercel.app", undefined) as Array<{ path?: string; url?: string; cache?: string[]; status: number[] }>
      const step = (p: string) => plan.find((c) => c.path === p)
      check("marketing pages must be public", ["/", "/pricing", "/features"].every((p) => JSON.stringify(step(p)?.cache) === '["public"]'))
      check("/explore is built per visitor, so it may be no-store but never fails for that", JSON.stringify(step("/explore")?.cache) === '["no-store","private","public"]')
      check("/app must never be public", !step("/app")?.cache?.includes("public"))
      check("the website checkout must be no-store", JSON.stringify(step("/checkout/site")?.cache) === '["no-store"]')
      check("robots and sitemap are asked for", !!step("/robots.txt") && !!step("/sitemap.xml"))
      check("SMOKE_SITE as a name opens /w/<name> on the deployment", S.plan("https://x.vercel.app", "demo").some((c: { url?: string }) => c.url === "https://x.vercel.app/w/demo"))
      check("  and as an address opens that address, the subdomain itself", S.plan("https://x.vercel.app", "https://demo.storelib.com").some((c: { url?: string }) => c.url === "https://demo.storelib.com"))
      check("the security headers are the ones vercel.json sends", S.SECURITY_HEADERS.every((h: string) => read("vercel.json").toLowerCase().includes(`"${h}"`)))

      let appPublic = false
      const server = createServer((req: IncomingMessage, res: ServerResponse) => {
        const path = (req.url ?? "/").split("?")[0]
        const send = (status: number, headers: Record<string, string>, body = "") => { res.writeHead(status, headers); res.end(body) }
        if (path === "/app") return send(307, appPublic ? { location: "/login", "cache-control": "public, s-maxage=60" } : { location: "/login" })
        if (path === "/checkout/site") return send(200, { "cache-control": "private, no-cache, no-store, max-age=0, must-revalidate" }, "<html></html>")
        if (path === "/robots.txt") return send(200, { "content-type": "text/plain" }, "User-agent: *\nAllow: /\n")
        if (path === "/sitemap.xml") return send(200, { "content-type": "application/xml" }, '<?xml version="1.0"?><urlset></urlset>')
        if (path === "/api/health") return send(200, { "content-type": "application/json", "cache-control": "no-store" }, JSON.stringify({ status: "ok", jobs: [] }))
        if (path === "/w/demo") return send(200, { "cache-control": "private, no-cache" }, "<html></html>")
        return send(200, { "cache-control": "public, s-maxage=3600" }, "<html></html>")
      })
      await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()))
      const port = (server.address() as { port: number }).port
      const base = `http://127.0.0.1:${port}`
      const good = await run(["scripts/smoke-deploy.mjs", "--base", base], { SMOKE_SITE: "demo", GITHUB_STEP_SUMMARY: "", BASE_URL: "" })
      check("a deployment that answers right passes", good.code === 0, good.out.slice(-600))
      check("  and on localhost the vercel.json headers are skipped, not failed", good.out.includes("skip  security header x-frame-options"))
      appPublic = true
      const bad = await run(["scripts/smoke-deploy.mjs", "--base", base], { GITHUB_STEP_SUMMARY: "", BASE_URL: "" })
      check("a dashboard the CDN may hold fails it", bad.code === 1 && bad.out.includes("FAIL  /app: the dashboard is never shared"), bad.out.slice(-600))
      await new Promise<void>((r) => server.close(() => r()))
      const nowhere = await run(["scripts/smoke-deploy.mjs", "--base", `http://127.0.0.1:${port}`], { GITHUB_STEP_SUMMARY: "", BASE_URL: "" })
      check("a deployment that does not answer fails it", nowhere.code === 1)
    }

    console.log("\nPost-deploy: after Vercel says ready, advisory unless the owner says otherwise")
    {
      const wf = read(".github/workflows/post-deploy.yml")
      check("it runs on Vercel's deployment status", /\n {2}deployment_status:/.test(wf))
      check("  only when the deployment succeeded", wf.includes("github.event.deployment_status.state == 'success'"))
      check("  against the deployment's own address", wf.includes("github.event.deployment_status.environment_url"))
      check("  running the smoke script", wf.includes("run: node scripts/smoke-deploy.mjs"))
      check("it is advisory until SMOKE_BLOCKING is true", wf.includes("continue-on-error: ${{ vars.SMOKE_BLOCKING != 'true' }}"))
      check("  and only reads the repository", /permissions:\n {2}contents: read/.test(wf))
      check("  and installs nothing", !wf.includes("pnpm install"))
      const doc = read("docs/operations/release-safety.md")
      check("release-safety says how to make it blocking", doc.includes("### Make it blocking") && doc.includes("SMOKE_BLOCKING") && doc.includes("Deployment Checks") && doc.includes("Smoke the deployment"))
      check("  and names the budgets and the build ceiling", doc.includes("perf-budgets.json") && doc.includes("7,600 MB"))
    }

    console.log("\nRollback runbook")
    {
      const doc = read("docs/operations/rollback.md")
      for (const h of ["## 1. A bad deploy: Vercel Instant Rollback", "## 2. One creator's website: their release", "## 3. Something a SQL part added", "## 4. A feature behind a variable", "## Who checks what afterwards"]) check(`it has "${h.replace(/^#+ /, "")}"`, doc.includes(h))
      const part179 = read("supabase/sql/run-now/179_cache_invalidation_pings.sql")
      const tables = [...part179.matchAll(/CREATE TRIGGER storelib_cache_ping AFTER INSERT OR UPDATE OR DELETE ON (public\.\w+)/g)].map((m) => m[1])
      check("part 179 makes five cache ping triggers", tables.length === 5, tables.join(", "))
      check("  and the runbook disables and enables each of them by its real name", tables.every((t) => new RegExp(`ALTER TABLE ${t.replace(".", "\\.")}\\s+DISABLE TRIGGER storelib_cache_ping;`).test(doc) && new RegExp(`ALTER TABLE ${t.replace(".", "\\.")}\\s+ENABLE TRIGGER storelib_cache_ping;`).test(doc)))
      check("  and the softer switch uses the real table", doc.includes("UPDATE public.storelib_cache_invalidation SET url = NULL") && part179.includes("public.storelib_cache_invalidation"))
      const part180 = read("supabase/sql/run-now/180_site_releases.sql")
      check("a site release is restored through the real live pointer", doc.includes("UPDATE public.site_live_releases") && part180.includes("site_live_releases (install_id uuid PRIMARY KEY") && part180.includes("release_id uuid") && part180.includes("rev bigint"))
      check("  and it says the creator's way is Backups, then Publish", doc.includes("Backups & Versions") && doc.includes("**Publish**"))
      check("  and warns off disabling part 180's trigger", doc.includes("Do not disable `site_live_release_forget`"))
      check("the variables it names are read by the code", ["EXPLORE_MARKETPLACE_ENABLED", "PHYSICAL_COMMERCE_ENABLED"].every((v) => doc.includes(v)) && read("lib/platform/explore-marketplace.ts").includes("EXPLORE_MARKETPLACE_ENABLED") && read("lib/admin/commerce-status.ts").includes("PHYSICAL_COMMERCE_ENABLED") && read("app/api/internal/invalidate/route.ts").includes("CACHE_INVALIDATE_SECRET"))
      const lt = read("docs/operations/load-testing.md")
      check("load-testing.md has targets and the production guard", lt.includes("## Targets") && lt.includes("--i-mean-production"))
    }

    console.log("\nMonitoring: each scheduled job from cron_runs")
    {
      const now = Date.parse("2026-10-15T12:00:00Z")
      const iso = (minAgo: number) => new Date(now - minAgo * 60_000).toISOString()
      const jobs = [
        { path: "/api/cron/notify", schedule: "*/5 * * * *" },
        { path: "/api/cron/physical", schedule: "3,13,23,33,43,53 * * * *" },
        { path: "/api/cron/rollup-daily", schedule: "0 1 * * *" },
        { path: "/api/cron/fx-rates", schedule: "35 15 * * 1-5" },
      ]
      const h = cronHealth(jobs, [
        { job: "/api/cron/notify", started_at: iso(3), ok: true },
        { job: "/api/cron/notify", started_at: iso(8), ok: false },
        { job: "/api/cron/notify", started_at: iso(60 * 30), ok: false },
        { job: "/api/cron/physical", started_at: iso(200), ok: true },
        { job: "/api/cron/rollup-daily", started_at: iso(11 * 60), ok: false },
      ], now)
      const of = (p: string) => h.find((j) => j.job === p)!
      check("a job whose newest run worked is ok", of("/api/cron/notify").state === "ok" && of("/api/cron/notify").lastRun === iso(3))
      check("  with the last day's failures counted, older ones not", of("/api/cron/notify").runs24h === 2 && of("/api/cron/notify").failed24h === 1)
      check("a ten minute job silent for over three hours is late", of("/api/cron/physical").state === "late")
      check("a job whose newest run failed says so", of("/api/cron/rollup-daily").state === "failed")
      check("a job with no run on record says never, not ok", of("/api/cron/fx-rates").state === "never" && of("/api/cron/fx-rates").lastRun === null)
      check("late after six intervals, at least half an hour", lateAfterMinutes("*/5 * * * *") === 30 && lateAfterMinutes("*/15 * * * *") === 90)
      check("  three hours for hourly jobs, comma lists included", lateAfterMinutes("0 * * * *") === 180 && lateAfterMinutes("7,22,37,52 * * * *") === 180)
      check("  thirty hours for daily ones", lateAfterMinutes("0 1 * * *") === 1800)
      check("/api/health uses the same rule", read("app/api/health/route.ts").includes('import { lateAfterMinutes } from "@/lib/perf/cron-health"') && !read("app/api/health/route.ts").includes("function lateAfterMinutes"))
      const r = read("lib/perf/read.ts")
      check("the performance report reads two days of cron_runs, three columns, capped", r.includes('"cron_runs", "job, started_at, ok"') && r.includes(".limit(6000)") && r.includes("cronRuns,"))
      const page = read("app/(storelib)/admin/performance/performance-admin.tsx")
      check("/admin/performance shows each job", page.includes("<JobsPanel report={report} />") && page.includes('title="Scheduled jobs"'))
      check("  and says where cache hits and function memory are, rather than inventing them", page.includes("Vercel, Observability, Edge Requests") && page.includes("Vercel, Observability, Vercel Functions"))
    }
  } finally {
    rmSync(scratch, { recursive: true, force: true })
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) { console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`); process.exit(1) }
}
main()
