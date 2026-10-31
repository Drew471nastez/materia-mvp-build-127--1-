/**
 * ===========================================================================
 *  ONE REQUEST, FOLLOWED THROUGH THE LOGS (rel-obs)
 * ===========================================================================
 * Observability gaps from the reliability audit (IMPLEMENTATION_PLAN batch 6):
 *
 *   an error row (error_events) and its log line    carry the request's id (`rid`)
 *   an uncaught server error, a failed cron run     the id is passed from the request, never invented
 *   informational lines logged as errors            logged at their real level, as one JSON line
 *   the load test                                   refuses production hosts, reports p50/p95/p99
 *   /api/health                                     bounded, no-store, per-dependency status
 *
 *   node scripts/run-push-tests.mjs (in the list as tests/rel-obs.test.ts)
 */
import { readFileSync } from "node:fs"
import { execFile } from "node:child_process"
import http from "node:http"
import { pathToFileURL } from "node:url"
import { join } from "node:path"
import { cleanRequestId, requestIdFrom } from "@/lib/net/request-id"
import { reportError, recordCronRun } from "@/lib/observability/report"
import { logEvent, logLine } from "@/lib/net/log"
import { startPhaseTimer, PHASE_SLOW_MS } from "@/lib/perf/phase-timer"
import { stripComments } from "./_source"

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
    console.log(`  FAIL  ${label}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ""}`)
  }
}
const code = (p: string) => stripComments(readFileSync(join(process.cwd(), p), "utf8"))
const realFetch = globalThis.fetch
const realError = console.error

type Sent = { url: string; body: Record<string, unknown> | null }
/** Supabase as reportError and recordCronRun see it: every POST/PATCH captured, answers that say "nothing to tell". */
function fakeSupabase(): Sent[] {
  const sent: Sent[] = []
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    let body: Record<string, unknown> | null = null
    try {
      body = init?.body ? JSON.parse(String(init.body)) : null
    } catch {
      body = null
    }
    sent.push({ url, body })
    if (url.includes("/rest/v1/cron_runs") && init?.method === "POST") return new Response(JSON.stringify([{ id: 7 }]), { status: 201 })
    if (url.includes("/rest/v1/cron_runs")) return new Response("[]", { status: 200 })
    return new Response("false", { status: 200 })
  }) as typeof fetch
  return sent
}
function captureErrors(): string[] {
  const lines: string[] = []
  console.error = (...a: unknown[]) => {
    lines.push(a.map(String).join(" "))
  }
  return lines
}
function restore() {
  globalThis.fetch = realFetch
  console.error = realError
}

async function main() {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://fake.supabase.test"
  process.env.SUPABASE_SERVICE_ROLE_KEY = "fake-service-key"
  delete process.env.ALERT_WEBHOOK_URL
  delete process.env.ALERT_EMAIL

  console.log("\nA request's id, from the headers it came with")
  {
    check("x-request-id first", requestIdFrom(new Headers({ "x-request-id": "req-12345678", "x-vercel-id": "iad1::abc-12345" })) === "req-12345678")
    check("else Vercel's own id", requestIdFrom(new Headers({ "x-vercel-id": "iad1::abc-12345" })) === "iad1::abc-12345")
    check("never a new one: no id is null", requestIdFrom(new Headers()) === null && requestIdFrom(null) === null)
    check("the plain object onRequestError gets works too", requestIdFrom({ "x-request-id": ["req-abcdefgh"], host: "x" }) === "req-abcdefgh")
    check("a header that is not an id is dropped", requestIdFrom(new Headers({ "x-request-id": "<script>alert(1)</script>" })) === null && cleanRequestId("a b c d e f g h") === null)
  }

  console.log("\nAn error row and its log line carry the id")
  {
    const sent = fakeSupabase()
    const lines = captureErrors()
    await reportError({ source: "server", where: "GET /p/[slug]", error: new Error("boom 42"), context: { digest: "d1" }, requestId: "iad1::abc-12345" })
    restore()
    const row = sent.find((s) => s.url.endsWith("/rest/v1/rpc/storelib_note_error"))
    const ctx = (row?.body?.p_context ?? {}) as Record<string, unknown>
    check("error_events context has rid", ctx.rid === "iad1::abc-12345", ctx)
    check("the rest of the context is unchanged", ctx.digest === "d1")
    check("the console line names it", lines.some((l) => l === "[server] GET /p/[slug]: boom 42 (rid iad1::abc-12345)"), lines)

    const sent2 = fakeSupabase()
    const lines2 = captureErrors()
    await reportError({ source: "server", where: "GET /p/[slug]", error: new Error("boom 42") })
    restore()
    const ctx2 = (sent2.find((s) => s.url.endsWith("/rest/v1/rpc/storelib_note_error"))?.body?.p_context ?? {}) as Record<string, unknown>
    check("without one, the row and the line are as before", !("rid" in ctx2) && lines2.includes("[server] GET /p/[slug]: boom 42"), { ctx2, lines2 })
    check("the id is not part of the fingerprint (one row per kind of error)", sent.find((s) => s.url.includes("note_error"))?.body?.p_fingerprint === sent2.find((s) => s.url.includes("note_error"))?.body?.p_fingerprint)

    const sent3 = fakeSupabase()
    captureErrors()
    await reportError({ source: "server", where: "x", error: new Error("y"), requestId: "bad id with spaces" })
    restore()
    const ctx3 = (sent3.find((s) => s.url.includes("note_error"))?.body?.p_context ?? {}) as Record<string, unknown>
    check("an id that is not one is never written", !("rid" in ctx3))
  }

  console.log("\nA failed cron run is reported with its request's id")
  {
    process.env.CRON_SECRET = "cron-secret-for-test"
    const sent = fakeSupabase()
    const lines = captureErrors()
    const req = new Request("https://example.test/api/cron/x", { headers: { authorization: "Bearer cron-secret-for-test", "x-vercel-id": "iad1::cron-98765" } })
    const answer = await recordCronRun("/api/cron/x", req, async () => new Response("nope", { status: 500 }), { maxDurationS: 60 })
    restore()
    delete process.env.CRON_SECRET
    const ctx = (sent.find((s) => s.url.includes("note_error"))?.body?.p_context ?? {}) as Record<string, unknown>
    check("the job's answer is unchanged", answer.status === 500)
    check("the error row carries the cron request's id", ctx.rid === "iad1::cron-98765", ctx)
    check("and its log line", lines.some((l) => l.includes("(rid iad1::cron-98765)")), lines)
  }

  console.log("\nEvery uncaught server error, and the routes that catch their own")
  {
    check("onRequestError passes the id from the request", /requestId: requestIdFrom\(request\.headers\)/.test(code("instrumentation.ts")))
    for (const p of ["app/api/stripe/webhook/route.ts", "app/api/stripe/webhook/connect/route.ts", "app/api/client-errors/route.ts", "app/api/memberships/checkout/route.ts"]) {
      const src = code(p)
      const calls = src.match(/reportError\(\{[^\n]*\}\)/g) ?? []
      check(`${p}: every reportError passes the request id`, calls.length > 0 && calls.every((c) => /requestId: requestIdFrom\(request\.headers\)/.test(c)), calls.length)
    }
    const proxy = code("proxy.ts")
    check("the proxy still sends the id on and back on every response", /request\.headers\.set\(REQUEST_ID_HEADER, rid\)/.test(proxy) && /res\.headers\.set\(REQUEST_ID_HEADER, rid\)/.test(proxy))
    check("reportError never reads next/headers itself (a cached page would turn dynamic)", !/next\/headers/.test(code("lib/observability/report.ts")))
  }

  console.log("\nLog lines at their real level, as one JSON line")
  {
    const seen: { level: string; line: string }[] = []
    const real = { info: console.info, warn: console.warn, error: console.error }
    console.info = (l: unknown) => void seen.push({ level: "info", line: String(l) })
    console.warn = (l: unknown) => void seen.push({ level: "warn", line: String(l) })
    console.error = (l: unknown) => void seen.push({ level: "error", line: String(l) })
    logEvent("info", "translate_models_changed", { provider: "gemini", models: "a, b" })
    logEvent("warn", "rate_limit_count_failed", { bucket: "x", reason: "token eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3OCJ9.c2lnbmF0dXJlLXZhbHVl from someone@example.com" })
    logEvent("info", "cron_scheduled_emails_done", { campaigns: { sent: 2, failed: 0 }, engine: { outcomes: { done: 1 } } })
    const timer = startPhaseTimer("product-timing", "a-slug")
    timer.mark("variants")
    timer.done({ client: 1 })
    console.info = real.info
    console.warn = real.warn
    console.error = real.error
    const parsed = seen.map((s) => ({ ...s, json: (() => { try { return JSON.parse(s.line) } catch { return null } })() }))
    check("info goes to console.info", parsed[0]?.level === "info" && parsed[0]?.json?.evt === "translate_models_changed", parsed[0])
    check("warn goes to console.warn, with no token or address in it", parsed[1]?.level === "warn" && !/eyJ|someone@/.test(parsed[1]?.line ?? "") && /\[jwt\]/.test(parsed[1]?.line ?? ""), parsed[1])
    check("a job's counts stay one line, nested", parsed[2]?.json?.campaigns?.sent === 2 && parsed[2]?.json?.engine?.outcomes?.done === 1 && !parsed[2].line.includes("\n"))
    check("the product page timing is one JSON line at info when fast", parsed[3]?.level === "info" && parsed[3]?.json?.evt === "phase_timing" && parsed[3]?.json?.id === "a-slug" && typeof parsed[3]?.json?.variants === "number" && parsed[3]?.json?.client === 1, parsed[3])
    check("and a warning at or past the slow mark", PHASE_SLOW_MS === 3000 && /total >= PHASE_SLOW_MS \? "warn" : "info"/.test(code("lib/perf/phase-timer.ts")))
    check("logLine keeps its old flat shape", logLine("x", { a: "b", n: 1, z: undefined }) === '{"evt":"x","a":"b","n":1,"z":null}')

    /* The noisiest or misleveled lines in production (Vercel runtime logs, 24h to 2026-10-31): each now a logEvent at its level. */
    const moved: [string, RegExp][] = [
      ["lib/markets/open-translate.ts", /logEvent\("info", "translate_models_changed", \{ msg: "\[translate\] gemini models/],
      ["lib/markets/open-translate.ts", /logEvent\("info", "translate_models_changed", \{ msg: "\[translate\] cloudflare models/],
      ["lib/website-builder/compat-site.ts", /logEvent\("warn", "site_last_good_served"/],
      ["lib/website-builder/published-site.ts", /logEvent\("warn", "site_last_good_served"/],
      ["lib/website-builder/site-releases-server.ts", /logEvent\("warn", "site_release_pointer_unread"/],
      ["app/api/stripe/webhook/route.ts", /logEvent\("info", "stripe_payment_failed"/],
      ["app/api/stripe/webhook/route.ts", /logEvent\("warn", "stripe_invoice_payment_failed"/],
      ["lib/api/rate-limit.ts", /logEvent\("warn", "rate_limit_count_failed"/],
      ["app/(marketing)/explore/page.tsx", /logEvent\("warn", "explore_creators_embed_refused"/],
      ["lib/physical/unconfirmed-delivery-server.ts", /logEvent\("error", "physical_unconfirmed_unread", \{[^\n]*reason:/],
      ["lib/markets/auto-translate.ts", /logEvent\("error", "auto_translate_list_failed", \{[^\n]*reason:/],
      ["app/api/cron/process-scheduled-emails/route.ts", /logEvent\("info", "cron_scheduled_emails_done"/],
      ["lib/perf/phase-timer.ts", /"phase_timing"/],
    ]
    for (const [p, re] of moved) check(`${p}: ${re.source.slice(0, 60)}`, re.test(code(p)))
    check("no model list at error level any more", !/console\.error\(`\[translate\] (gemini|cloudflare) models for translating now/.test(code("lib/markets/open-translate.ts")))
  }

  console.log("\nThe key paths load test (scripts/load/scenarios.mjs)")
  {
    const L = await import(pathToFileURL(join(process.cwd(), "scripts/load/scenarios.mjs")).href)
    check("storelib.com, storelib.me and their subdomains are refused", ["https://storelib.com", "https://storelib.me", "https://demo.storelib.com", "https://x.storelib.me/a"].every((u) => typeof L.refuseTarget(u) === "string"))
    check("  as is any host not known to be staging (a custom domain, a production deployment address)", typeof L.refuseTarget("https://shop.example.com") === "string" && typeof L.refuseTarget("https://storelib-abc123-team.vercel.app") === "string")
    check("  unless --i-know-this-is-production", L.refuseTarget("https://storelib.com", { iKnowThisIsProduction: true }) === null)
    check("local, private addresses, branch previews and LOAD_ALLOW_HOSTS are allowed", ["http://localhost:3100", "http://127.0.0.1:3000", "http://10.1.2.3", "http://192.168.1.4:3000", "https://storelib-git-staging-team.vercel.app"].every((u) => L.refuseTarget(u) === null) && L.refuseTarget("https://staging.example.org", { allowHosts: ["staging.example.org"] }) === null)
    check("a lookalike is not mistaken for production or for staging", typeof L.refuseTarget("https://notstorelib.com") === "string" && typeof L.refuseTarget("https://storelib.com.evil.test") === "string")
    check("checkout never runs against a live Stripe key, whatever is set", typeof L.refuseCheckout("live", "pk_test_abc") === "string" && typeof L.refuseCheckout("unknown", "pk_live_abc") === "string" && typeof L.refuseCheckout("test", "pk_live_abc") === "string")
    check("  runs on a test key seen in the pages, or one confirmed by the env", L.refuseCheckout("test", undefined) === null && L.refuseCheckout("unknown", "pk_test_abc") === null && typeof L.refuseCheckout("unknown", undefined) === "string")
    check("  live wins when a page carries both", L.stripeModeOf(["pk_test_aaaaaaaaaaaa", "pk_live_bbbbbbbbbbbb"]) === "live")
    check("checkout only with --checkout", !L.buildScenarios({ product: "p" }).some((x: { name: string }) => x.name === "checkout") && L.buildScenarios({ product: "p", checkout: true }).some((x: { name: string }) => x.name === "checkout"))
    const sm = L.summarise([{ name: "a", status: 200, ms: 10, error: null }, { name: "a", status: 503, ms: 30, error: null }, { name: "a", status: 0, ms: null, error: "TimeoutError" }, { name: "a", status: 429, ms: 5, error: null }, { name: "a", status: 404, ms: 7, error: null }])
    check("p50/p95/p99 and error rate (5xx and network failures), 4xx and 429 apart", sm.requests === 5 && sm.errors === 2 && sm.errorRate === 0.4 && sm.limited429 === 1 && sm.client4xx === 1 && sm.p50 === 7 && sm.p95 === 30 && sm.p99 === 30, sm)
    let t = 0
    const waits: number[] = []
    const pace = L.pacer(10, () => t, async (ms: number) => { waits.push(ms); t += ms })
    for (let i = 0; i < 5; i++) await pace()
    check("--rate spaces the starts (10 a second: 100 ms apart)", waits.length === 4 && waits.every((w) => Math.abs(w - 100) < 1e-6), waits)

    const run = (args: string[], env: Record<string, string> = {}) =>
      new Promise<{ code: number; out: string }>((done) => {
        execFile(process.execPath, ["scripts/load/scenarios.mjs", ...args], { env: { ...process.env, ...env }, timeout: 30_000 }, (err, stdout, stderr) =>
          done({ code: err ? ((err as { code?: number }).code ?? 1) : 0, out: String(stdout) + String(stderr) }),
        )
      })
    const prod = await run(["--base", "https://storelib.com", "--creator", "x", "--seconds", "1"])
    check("the script exits 2 on production without sending anything", prod.code === 2 && /production/.test(prod.out), prod)

    let posts = 0
    const server = http.createServer((req, res) => {
      if (req.method === "POST") posts++
      if (req.url === "/demo") return res.end('<script src="/c.js"></script>')
      if (req.url === "/c.js") return res.end(process.env.REL_OBS_LIVE === "1" ? "pk_live_xxxxxxxxxxxx" : "pk_test_xxxxxxxxxxxx")
      res.statusCode = req.url === "/favicon.ico" ? 404 : 200
      res.end("ok")
    })
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()))
    const port = (server.address() as { port: number }).port
    const ok = await run(["--base", `http://127.0.0.1:${port}`, "--creator", "demo", "--onepage", "demo", "--creator-id", "00000000-0000-4000-8000-000000000001", "--product", "00000000-0000-4000-8000-000000000002", "--checkout", "--seconds", "2", "--concurrency", "4", "--rate", "50", "--json"])
    const json = (() => { try { return JSON.parse(ok.out.slice(ok.out.indexOf("{\n"))) } catch { return null } })()
    check("against a local stub: every scenario ran and was measured", ok.code === 0 && json?.scenarios?.length === 5 && json.scenarios.every((x: { requests: number; p95: number | null }) => x.requests > 0 && x.p95 !== null) && json.all.errors === 0, { code: ok.code, out: ok.out.slice(0, 400) })
    check("  and the rate cap held (50 a second for 2 s)", (json?.all?.requests ?? 999) <= 110, json?.all?.requests)
    process.env.REL_OBS_LIVE = "1"
    const before = posts
    const live = await run(["--base", `http://127.0.0.1:${port}`, "--creator", "demo", "--product", "00000000-0000-4000-8000-000000000002", "--checkout", "--seconds", "1"], { REL_OBS_LIVE: "1" })
    delete process.env.REL_OBS_LIVE
    check("a target whose pages carry pk_live_ is refused before any request is sent", live.code === 2 && /live Stripe/.test(live.out) && posts === before, { code: live.code, out: live.out.slice(0, 300) })
    server.close()
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) {
    console.log(failures.map((f) => `  - ${f}`).join("\n"))
    process.exit(1)
  }
}

main().catch((e) => {
  restore()
  console.error(e)
  process.exit(1)
})
