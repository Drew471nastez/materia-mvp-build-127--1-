/**
 * ===========================================================================
 *  BACKGROUND JOBS RUN ONCE AND STOP, AND ONE STORE NEVER REACHES ANOTHER'S
 * ===========================================================================
 * The gaps the jobs and isolation audit closed, each held here:
 *
 *   A Stripe event is taken before it is handled (claimStripeEvent), so a
 *   second delivery arriving while the first still runs waits instead of
 *   writing a second order and a second sale on the ledger. The same for an
 *   Airwallex event (claimEvent): a retry is taken by one delivery only.
 *
 *   A physical commerce job whose run is cut off on every attempt is dead
 *   after its last one, rather than taken again every ten minutes for ever
 *   (deadAfterLease). A background translation job is stopped after a day
 *   (jobOutlived), for the same reason.
 *
 *   run-now part 189: username_history could be written by anybody with the
 *   public key (a FOR ALL USING (true) policy naming no role), and
 *   flow_execution_log, with recipients' addresses, had no row level
 *   security at all.
 */
import { readFileSync } from "node:fs"
import { fakeDb } from "./_fake-db"
import { claimStripeEvent, STRIPE_EVENT_HOLD_MS } from "../lib/payments/ledger"
import { claimEvent, EVENT_HOLD_MS } from "../lib/payments/store"
import { deadAfterLease, runJobs } from "../lib/physical/jobs-server"
import { JOB_LIMIT_MS, jobOutlived } from "../lib/markets/translation-jobs"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail?: string) {
  if (ok) {
    passed++
    console.log(`  ok    ${label}`)
  } else {
    failed++
    failures.push(label + (detail ? ` (${detail})` : ""))
    console.log(`  FAIL  ${label}${detail ? ` (${detail})` : ""}`)
  }
}
const read = (p: string) => readFileSync(p, "utf8")

async function main() {
  const now = Date.parse("2026-10-15T12:00:00.000Z")
  const iso = (ms: number) => new Date(ms).toISOString()

  console.log("\nA Stripe event, one delivery at a time")
  {
    const db = fakeDb({ stripe_webhook_events: [] }, { unique: { stripe_webhook_events: [["event_id"]] } })
    check("a new event is taken", (await claimStripeEvent(db as never, { id: "evt_1", type: "checkout.session.completed" }, now)) === "run")
    const row = db.tables.stripe_webhook_events.find((r) => r.event_id === "evt_1")
    check("  and recorded unfinished, with no error, before it is handled", !!row && !row.processed_at && !row.last_error && row.received_at === iso(now))
    check("a second delivery while the first runs waits", (await claimStripeEvent(db as never, { id: "evt_1", type: "checkout.session.completed" }, now + 5_000)) === "busy")
    check("  and changes nothing on the row", row!.received_at === iso(now))
    row!.processed_at = iso(now + 10_000)
    check("a delivery after it finished is only acknowledged", (await claimStripeEvent(db as never, { id: "evt_1", type: "checkout.session.completed" }, now + 20_000)) === "done")

    const failedRow = { event_id: "evt_2", type: "invoice.paid", processed_at: null, last_error: "answered 500", attempts: 1, received_at: iso(now - 60_000) }
    db.tables.stripe_webhook_events.push(failedRow)
    check("an event whose last delivery failed is taken again at once", (await claimStripeEvent(db as never, { id: "evt_2", type: "invoice.paid" }, now)) === "run")
    check("  its error cleared and its hold stamped, so a copy now waits", failedRow.last_error === null && failedRow.received_at === iso(now))
    check("  so a copy now waits", (await claimStripeEvent(db as never, { id: "evt_2", type: "invoice.paid" }, now + 1_000)) === "busy")

    const died = { event_id: "evt_3", type: "charge.refunded", processed_at: null, last_error: null, attempts: 0, received_at: iso(now - STRIPE_EVENT_HOLD_MS - 1_000) }
    db.tables.stripe_webhook_events.push(died)
    check("an event held past the hold (its run died) is taken over", (await claimStripeEvent(db as never, { id: "evt_3", type: "charge.refunded" }, now)) === "run")

    const missing = fakeDb({}, { failInsert: { stripe_webhook_events: { code: "42P01", message: "relation does not exist" } } })
    check("before part 64 (no table) the event runs as before", (await claimStripeEvent(missing as never, { id: "evt_4", type: "x" }, now)) === "run")
    const down = { from: () => { throw new Error("network") } }
    check("a database that does not answer never stops a payment event", (await claimStripeEvent(down as never, { id: "evt_5", type: "x" }, now)) === "run")
    check("the hold is longer than any webhook function runs", STRIPE_EVENT_HOLD_MS >= 5 * 60_000)
  }

  console.log("\nThe Stripe routes take the event after its signature, before any handler")
  {
    const route = read("app/api/stripe/webhook/route.ts")
    const verify = route.indexOf("const verified = verifyStripeEvent(")
    const claim = route.indexOf("await claimStripeEvent(")
    const firstHandler = route.indexOf('if (event.type.startsWith("account."))')
    check("main webhook: signature, then the claim, then the handlers", verify > 0 && claim > verify && firstHandler > claim)
    check("main webhook: a busy event is answered 409 so Stripe sends it again", /claim === "busy"\) return NextResponse\.json\([^)]*\{ status: 409 \}\)/.test(route))
    check("main webhook: a taken event answered 4xx is written down, which lets it go", /held\.claimed && answer\.status < 500\) \{[\s\S]{0,200}noteStripeEvent\(supabaseAdmin, \{ id: eventId, type: eventType, account, ok: false/.test(route))
    const connect = read("app/api/stripe/webhook/connect/route.ts")
    check("connect webhook: the claim after the signature, before the handlers", connect.indexOf("claimStripeEvent(") > connect.indexOf("verifyStripeEvent(") && connect.indexOf("claimStripeEvent(") < connect.indexOf("handleConnectAccountEvent(event)"))
    check("connect webhook: a busy event is answered 409", /claim === "busy"\) return NextResponse\.json\([^)]*\{ status: 409 \}\)/.test(connect))
  }

  console.log("\nAn Airwallex event, one delivery at a time")
  {
    const event = { id: "awx_1", name: "payment_intent.succeeded", accountId: null, objectId: null, createdAt: null }
    const db = fakeDb({ payment_webhook_events: [] }, { unique: { payment_webhook_events: [["provider", "event_id"]] } })
    check("a first delivery is fresh", (await claimEvent(event, db as never, now)) === "fresh")
    const row = db.tables.payment_webhook_events[0]
    row.outcome = "processing"
    row.attempts = 1
    row.received_at = iso(now)
    check("a copy while it is processing is busy", (await claimEvent(event, db as never, now + 5_000)) === "busy")
    check("  and is not counted as an attempt", row.attempts === 1)
    row.outcome = "failed"
    check("after a failure the next delivery retries", (await claimEvent(event, db as never, now + 60_000)) === "retry")
    check("  counted, and holding it from now", row.attempts === 2 && row.outcome === "processing" && row.received_at === iso(now + 60_000))
    check("  so a copy now is busy", (await claimEvent(event, db as never, now + 61_000)) === "busy")
    check("a run that died is taken over after the hold", (await claimEvent(event, db as never, now + 60_000 + EVENT_HOLD_MS + 1_000)) === "retry")
    row.outcome = "done"
    check("a finished event is only acknowledged", (await claimEvent(event, db as never, now + 2 * EVENT_HOLD_MS)) === "done")
    const route = read("app/api/payments/airwallex/webhook/route.ts")
    check("the route answers a busy event 409, before handling", /claim === "busy"\) return NextResponse\.json\(\{ error: "retry" \}, \{ status: 409 \}\)/.test(route) && route.indexOf('claim === "busy"') < route.indexOf("handleAirwallexEvent("))
  }

  console.log("\nA physical commerce job cut off on every attempt ends")
  {
    check("a job on its last attempt still runs", deadAfterLease({ attempts: 6, max_attempts: 6 }) === false)
    check("a job claimed past its last attempt does not", deadAfterLease({ attempts: 7, max_attempts: 6 }) === true)
    const jobs = [
      { id: 1, kind: "send_email", payload: { template: "confirmation", checkoutId: "c1" }, attempts: 7, max_attempts: 6, creator_id: "cr1", status: "running" },
    ]
    const db = fakeDb({ commerce_jobs: jobs.map((j) => ({ ...j })) })
    ;(db as unknown as { rpc: unknown }).rpc = async (fn: string) => (fn === "commerce_claim_jobs" ? { data: jobs, error: null } : { data: null, error: null })
    const out = await runJobs(db as never, 5)
    const row = db.tables.commerce_jobs[0]
    check("runJobs marks it dead without running it", row.status === "dead" && !!row.finished_at && row.locked_until === null, JSON.stringify(row))
    check("  and counts it failed", out.failed === 1 && out.done === 0)
    check("  only while it is still running (another run may have finished it)", db.log.some((l) => l.table === "commerce_jobs" && l.op === "update" && l.filters.some(([k, c, v]) => k === "eq" && c === "status" && v === "running")))
  }

  console.log("\nA background translation job ends")
  {
    check("a job started an hour ago carries on", jobOutlived(iso(now - 3_600_000), now) === false)
    check("a job started over a day ago is stopped", jobOutlived(iso(now - JOB_LIMIT_MS - 1), now) === true)
    check("a day is past any job that works (40 rounds, 12 hours of waiting)", JOB_LIMIT_MS >= 20 * 3_600_000)
    check("an unreadable start is not a reason to stop", jobOutlived("not a date", now) === false)
    const src = read("lib/markets/translation-jobs.ts")
    check("runJob checks it before any round", src.indexOf("if (jobOutlived(row.started_at))") > 0 && src.indexOf("if (jobOutlived(row.started_at))") < src.indexOf("while (Date.now() + 15_000 < deadlineAt)"))
  }

  console.log("\nrun-now part 189: username_history and flow_execution_log")
  {
    const part = read("supabase/sql/run-now/189_username_history_and_flow_log_locked.sql")
    check("the part and its migration are the same text", part === read("supabase/migrations/20270126_username_history_and_flow_log_locked.sql"))
    const lines = part.trimEnd().split("\n")
    check("one comment line, then one statement per line", lines[0].startsWith("/*") && lines[0].endsWith("*/") && lines.slice(1).every((l) => l.trim().endsWith(";")))
    check("the policy that let anybody write is dropped", part.includes(`DROP POLICY IF EXISTS "Service role can manage username_history" ON public.username_history;`))
    check("reading stays open, as the redirects already show it", part.includes("CREATE POLICY username_history_read ON public.username_history FOR SELECT TO anon, authenticated USING (true);"))
    check("nothing is written without signing in", part.includes("REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.username_history FROM PUBLIC, anon;"))
    check("a signed in person changes and deletes nothing", part.includes("REVOKE UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.username_history FROM authenticated;"))
    check("and adds only their own row, for their own current username", part.includes("FOR INSERT TO authenticated WITH CHECK (user_id = (SELECT auth.uid()) AND lower(old_username) = lower((SELECT p.username FROM public.profiles p WHERE p.id = (SELECT auth.uid()))));"))
    const settings = read("components/app/settings-form-new.tsx")
    const history = settings.indexOf('supabase.from("username_history").insert({')
    const profileSave = settings.indexOf('.from("profiles")\n        .update({', history)
    check("  which is the row Settings writes from the browser, before the profile's username changes", history > 0 && profileSave > history && /user_id: profile\.id,\s*old_username: oldUsername,/.test(settings))
    check("no select is granted that was not there", !/GRANT SELECT ON public\.username_history/.test(part))
    check("flow_execution_log gets row level security and nothing for the public roles", part.includes("ALTER TABLE public.flow_execution_log ENABLE ROW LEVEL SECURITY; REVOKE ALL ON public.flow_execution_log FROM PUBLIC, anon, authenticated;"))
    check("either table missing is skipped, not an error", (part.match(/IF to_regclass\('public\.(username_history|flow_execution_log)'\) IS NULL THEN RAISE NOTICE/g) ?? []).length === 2)
    const after = read("supabase/sql/run-now/99_check_after.sql")
    /* Changed on purpose (round 32 merge): the community parts 192 to 194 follow it in the check now. */
    check("99_check_after has its column", /as p189_username_history_and_flow_log_locked[,;]/.test(after))
    const readme = read("supabase/sql/run-now/README.md")
    check("the README lists it", readme.includes("| `189_username_history_and_flow_log_locked.sql` |"))
    check("the four files carry it", read("supabase/sql/run-four/3_of_4_latest.sql").includes("-- part 189_username_history_and_flow_log_locked.sql"))
    check("the server's own write to username_history is the admin client's", /const db = createAdminClient\(\)[\s\S]{0,2500}db\.from\("username_history"\)\.insert/.test(read("app/api/profile/username/route.ts")))
  }

  console.log("\nCache keys name the store they hold")
  {
    /* Every unstable_cache that reads one store's rows keys on that store (or on an id that belongs to one store). */
    const files: Array<[string, RegExp]> = [
      ["lib/markets/server.ts", /\["site-localization", creatorId, baseCurrency\]/],
      ["lib/markets/server.ts", /\["site-translations", creatorId, locale\.toLowerCase\(\)\]/],
      ["lib/reviews/storefront-server.ts", /\["storefront-reviews-product", creatorId, productId\]/],
      ["lib/website-builder/published-site.ts", /\["shop-catalogue", creatorId\]/],
      ["lib/website-builder/compat-site.ts", /\["compat-store", creatorId\]/],
      ["lib/store/tracking-server.ts", /\["store-tracking", creatorId\]/],
    ]
    for (const [file, key] of files) check(`${file} keys ${key.source.slice(3, 40)} by the store`, key.test(read(file)))
    const anon = read("lib/storelib-theme/compat/anonymous-cache.ts")
    check("a stranger's cached page is held under its own host's marker", /return `\$\{MARKER_PREFIX\}\$\{host\}~/.test(anon))
    const handler = read("app/api/site-theme/site/[username]/[[...path]]/route.ts")
    check("and the handler refuses a marker for another host", /stranger\.host !== host/.test(handler))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) {
    for (const f of failures) console.log(`  - ${f}`)
    process.exit(1)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
