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
import { join } from "node:path"
import { cleanRequestId, requestIdFrom } from "@/lib/net/request-id"
import { reportError, recordCronRun } from "@/lib/observability/report"
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
