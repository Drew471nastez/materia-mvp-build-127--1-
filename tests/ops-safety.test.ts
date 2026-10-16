/**
 * ===========================================================================
 *  NOTHING BROKEN GOES LIVE QUIETLY, AND NOTHING BREAKS UNHEARD
 * ===========================================================================
 * docs/operations/release-safety.md. Before: CI runs the suite, lint, the
 * type error ratchet and a build on every push. After: every error is
 * counted in error_events and told to the owner once (run-now part 68,
 * lib/observability/report), every scheduled job run is recorded, and an
 * outside check asks /api/health every 15 minutes.
 */
import { readFileSync, existsSync } from "node:fs"
import { fingerprintOf, messageOf, recordCronRun, reportError } from "../lib/observability/report"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail?: string) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; failures.push(label + (detail ? ` — ${detail}` : "")); console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ""}`) }
}
const read = (p: string) => readFileSync(p, "utf8")

async function main() {
  console.log("\nBefore it is live: CI")
  {
    const ci = read(".github/workflows/ci.yml")
    check("CI runs on every push to main and every pull request", /push:\s*\n\s*branches: \[main\]/.test(ci) && ci.includes("pull_request:"))
    for (const [job, cmd] of [["Tests", "pnpm test:push"], ["Lint", "pnpm lint"], ["Type errors only go down", "node scripts/ci/typecheck-ratchet.mjs"], ["Production build", "node scripts/ci/measure-build.mjs -- pnpm build"]]) {
      check(`  ${job}: ${cmd}`, ci.includes(`name: ${job}`) && ci.includes(`run: ${cmd}`))
    }
    check("  with the lockfile as it is", (ci.match(/pnpm install --frozen-lockfile/g) ?? []).length === 4)
    check("  and the build without production's secrets", ci.includes("STRIPE_SECRET_KEY: sk_test_placeholder"))
    const ratchet = read("scripts/ci/typecheck-ratchet.mjs")
    check("the ratchet fails when any file has more type errors than its baseline", ratchet.includes("if (n > was) worse.push") && ratchet.includes("process.exit(1)"))
    const baseline = JSON.parse(read(".github/typescript-baseline.json")) as Record<string, number>
    check("the baseline is recorded file by file", Object.keys(baseline).length > 10 && Object.values(baseline).every((n) => Number.isInteger(n) && n > 0))
    check("lint skips the local probe folder, which git ignores", read("eslint.config.mjs").includes("'.wb-probe/**'"))
  }

  console.log("\nAfter it is live: every error counted, the owner told once")
  {
    const sql = read("supabase/sql/run-now/68_errors_and_job_runs.sql")
    check("part 68 and its migration are the same text", sql === read("supabase/migrations/20261018_errors_and_job_runs.sql"))
    check("one row per kind of error, counted", sql.includes("ON CONFLICT (fingerprint) DO UPDATE SET count = e.count + 1"))
    check("the owner is told the first time and at most hourly after", sql.includes("(last_alerted_at IS NULL OR last_alerted_at < now() - p_alert_every)") && sql.includes("p_alert_every interval DEFAULT interval '1 hour'"))
    check("errors and job runs are the server's only", sql.includes("REVOKE ALL ON public.error_events FROM anon, authenticated;") && sql.includes("REVOKE ALL ON public.cron_runs FROM anon, authenticated;"))

    check("a thousand failed orders are one kind of error", fingerprintOf("webhook", "stripe charge.refunded", "order 3f2a1b4c-1111-4222-8333-444455556666 failed at 1200") === fingerprintOf("webhook", "stripe charge.refunded", "order 9d8c7b6a-1111-4222-8333-444455556666 failed at 45"))
    check("  and a different failure is another", fingerprintOf("webhook", "stripe charge.refunded", "timeout") !== fingerprintOf("webhook", "stripe charge.refunded", "permission denied"))
    check("  Stripe ids do not split one kind into many", fingerprintOf("webhook", "x", "no such payout po_1AbC") === fingerprintOf("webhook", "x", "no such payout po_9XyZ"))
    check("messageOf reads an Error, a Supabase error and a string", messageOf(new Error("a")) === "a" && messageOf({ message: "b" }) === "b" && messageOf("c") === "c")

    const env = { ...process.env }
    const calls: Array<{ url: string; body: string }> = []
    const realFetch = globalThis.fetch
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://db.test"
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service"
    process.env.ALERT_WEBHOOK_URL = "https://hooks.test/x"
    delete process.env.ALERT_EMAIL
    let tell = true
    globalThis.fetch = (async (url: string, init?: { body?: string }) => {
      calls.push({ url: String(url), body: String(init?.body ?? "") })
      if (String(url).endsWith("/rpc/storelib_note_error")) return new Response(JSON.stringify(tell), { status: 200 })
      return new Response("[]", { status: 200 })
    }) as typeof fetch
    const quiet = console.error
    console.error = () => {}
    try {
      await reportError({ source: "payments", where: "POST /api/checkout", error: new Error("card of anna@example.com declined"), context: { email: "anna@example.com", apiKey: "sk_live_x", orderId: "o1" } })
      const noted = calls.find((c) => c.url.endsWith("/rpc/storelib_note_error"))
      check("an error is counted in the database", !!noted)
      check("  with the address masked and the secret left out", !!noted && !noted.body.includes("anna@example.com") && noted.body.includes("an***@example.com") && !noted.body.includes("sk_live_x"))
      const hook = calls.find((c) => c.url === "https://hooks.test/x")
      check("  and the owner told on the webhook the first time", !!hook && hook.body.includes("POST /api/checkout") && !hook.body.includes("anna@example.com"))
      calls.length = 0
      tell = false
      await reportError({ source: "payments", where: "POST /api/checkout", error: new Error("again") })
      check("  and not again while the database says it was told within the hour", !calls.some((c) => c.url === "https://hooks.test/x"))
      globalThis.fetch = (async () => { throw new Error("network down") }) as typeof fetch
      let threw = false
      try { await reportError({ source: "server", where: "x", error: new Error("y") }) } catch { threw = true }
      check("reporting never throws, even with the database unreachable", !threw)

      globalThis.fetch = (async (url: string, init?: { method?: string; body?: string }) => {
        calls.push({ url: `${init?.method ?? "GET"} ${String(url)}`, body: String(init?.body ?? "") })
        if (String(url).endsWith("/rest/v1/cron_runs")) return new Response(JSON.stringify([{ id: 7 }]), { status: 201 })
        return new Response("true", { status: 200 })
      }) as typeof fetch
      calls.length = 0
      process.env.CRON_SECRET = "s3cret"
      const knock = await recordCronRun("/api/cron/notify", new Request("https://x/api/cron/notify"), async () => new Response("no", { status: 401 }))
      check("a caller without the cron secret leaves no run behind", knock.status === 401 && calls.length === 0)
      const okRun = await recordCronRun("/api/cron/notify", new Request("https://x/api/cron/notify", { headers: { authorization: "Bearer s3cret" } }), async () => new Response(JSON.stringify({ sent: 3 }), { status: 200 }))
      check("a real run is recorded, started and finished", okRun.status === 200 && calls.some((c) => c.url === "POST https://db.test/rest/v1/cron_runs") && calls.some((c) => c.url === "PATCH https://db.test/rest/v1/cron_runs?id=eq.7" && c.body.includes('"ok":true')))
      calls.length = 0
      await recordCronRun("/api/cron/notify", new Request("https://x/api/cron/notify", { headers: { authorization: "Bearer s3cret" } }), async () => new Response(JSON.stringify({ error: "boom" }), { status: 500 }))
      check("a failed run is recorded as failed and reported", calls.some((c) => c.url.startsWith("PATCH") && c.body.includes('"ok":false')) && calls.some((c) => c.url.endsWith("/rpc/storelib_note_error")))
    } finally {
      globalThis.fetch = realFetch
      console.error = quiet
      process.env = env
    }

    check("every server error reaches it without a catch (onRequestError)", existsSync("instrumentation.ts") && /export const onRequestError: Instrumentation\.onRequestError/.test(read("instrumentation.ts")) && read("instrumentation.ts").includes("reportError"))
    check("the Stripe webhook reports an event it failed", (read("app/api/stripe/webhook/route.ts").match(/reportError\(\{ source: "webhook"/g) ?? []).length === 2)
    check("browser crashes are counted with the rest", read("app/api/client-errors/route.ts").includes('reportError({ source: "client"'))
    check("a failed account deletion step is reported", read("lib/account/delete-account.ts").includes('source: "account"'))
    check("a failed notification is reported", read("lib/notify/log.ts").includes('reportError({ source: "notify"'))
    const crons = ["notifications", "notify", "process-scheduled-emails", "purge-chat-attachments", "release-holds", "rollup-daily", "storage-cleanup", "strip-image-metadata", "memberships", "physical", "community", "fx-rates", "translations", "translation-jobs"]
    for (const c of crons) check(`the ${c} job records every run`, read(`app/api/cron/${c}/route.ts`).includes(`recordCronRun("/api/cron/${c}", request, () =>`))
    const vercel = JSON.parse(read("vercel.json")) as { crons: Array<{ path: string }> }
    check("  and that is every scheduled job", vercel.crons.every((c) => crons.includes(c.path.replace("/api/cron/", ""))), vercel.crons.map((c) => c.path).join(", "))
    check("old job runs and errors are forgotten", read("app/api/cron/storage-cleanup/route.ts").includes('rpc("storelib_purge_ops_logs", {})'))
    const panel = read("app/admin/_console/view-platform.tsx")
    check("the admin lists the errors", panel.includes("<ErrorsPanel errors={data.errors} />") && read("lib/admin/views/system.ts").includes('"error_events"'))
  }

  console.log("\nChecked from outside every 15 minutes")
  {
    const health = read("app/api/health/route.ts")
    check("/api/health answers 503 when the database does not", health.includes('status: "down", database: false') && health.includes("status: 503"))
    check("  and when a job is late or its last run failed", health.includes('last.ok === false ? ("failed" as const)') && health.includes("bad.length ? 503 : 200"))
    check("  and is never cached", health.includes('"Cache-Control": "no-store"'))
    const up = read(".github/workflows/uptime.yml")
    check("the uptime check asks it every 15 minutes, three tries before failing", /cron: "\*\/15 \* \* \* \*"/.test(up) && up.includes("for attempt in 1 2 3") && up.includes("/api/health"))
    check("  and tells the owner", up.includes("if: failure() && env.ALERT_WEBHOOK_URL != ''"))
  }

  console.log("\nThe guide")
  {
    const doc = read("docs/operations/release-safety.md")
    for (const h of ["## Before: CI on every push", "### Make Vercel wait for it", "### Undo a bad deploy", "## After: alerts when something breaks", "### Set it up"]) check(`it has "${h.replace(/^#+ /, "")}"`, doc.includes(h))
    check("it names both alert settings", doc.includes("ALERT_EMAIL") && doc.includes("ALERT_WEBHOOK_URL"))
    check("the admin shows whether they are set", read("lib/admin/schema-expectations.ts").includes('{ name: "ALERT_EMAIL"'))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) { console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`); process.exit(1) }
}
main()
