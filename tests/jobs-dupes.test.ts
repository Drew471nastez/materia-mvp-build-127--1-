/**
 * ===========================================================================
 *  A JOB, A STORE'S TRANSLATION AND AN ORDER, EACH DONE ONCE
 * ===========================================================================
 *
 *   A physical commerce job (lib/physical/jobs-server.ts runJobs) finishes
 *   only on its own claim: commerce_claim_jobs adds one to attempts on every
 *   claim, so a run whose handler outlived its 120 s lease, and whose job
 *   another run took again, writes nothing (finishClaimedJob). Before an
 *   email goes the lease is renewed on the same claim (renewJobLease), and a
 *   run that lost it sends nothing.
 *
 *   Translate changes automatically (lib/markets/auto-translate.ts): before
 *   part 186 the hourly run holds each store by swapping its kept run for the
 *   same run plus claimed_until (claimQuietStore), so a second delivery of
 *   the cron leaves it alone, and the switch reads the same run mid way.
 *   With part 186 the lease is let go only by the run that holds it.
 *
 *   Orders: one row per line of a payment (run-now part 190, a unique index
 *   on (stripe_session_id, receipt_token)), and a racing duplicate read back
 *   rather than answered with an error.
 */
import { readFileSync } from "node:fs"
import { fakeDb } from "./_fake-db"
import { JOB_LEASE_SECONDS, finishClaimedJob, renewJobLease, runJobs } from "../lib/physical/jobs-server"
import { claimQuietStore } from "../lib/markets/auto-translate"
import { existingSessionOrder, isUniqueViolation } from "../lib/orders/session-order"

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

type Row = Record<string, any>

/** store_localization with a compare and set on the jsonb run, as Postgres compares jsonb (here by its JSON text, which is the same object read back). */
function storeDb(rows: Row[]) {
  return {
    rows,
    from() {
      let patch: Row | null = null
      const tests: ((r: Row) => boolean)[] = []
      const q: Row = {
        update(p: Row) {
          patch = p
          return q
        },
        eq(c: string, v: unknown) {
          tests.push((r) => (typeof v === "string" && r[c] && typeof r[c] === "object" ? JSON.stringify(r[c]) === v : r[c] === v))
          return q
        },
        is(c: string, v: unknown) {
          tests.push((r) => (r[c] ?? null) === v)
          return q
        },
        select() {
          return q
        },
        then(ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) {
          const hit = rows.filter((r) => tests.every((t) => t(r)))
          if (patch) for (const r of hit) Object.assign(r, JSON.parse(JSON.stringify(patch)))
          return Promise.resolve({ data: hit.map((r) => ({ creator_id: r.creator_id })), error: null }).then(ok, bad)
        },
      }
      return q
    },
  }
}

async function main() {
  const now = Date.parse("2026-10-16T12:00:00.000Z")
  const iso = (ms: number) => new Date(ms).toISOString()

  console.log("\nA physical commerce job finishes only on its own claim")
  {
    const job = () => ({ id: 1, kind: "send_email", payload: { template: "seller", event: "not.a.seller.event" }, attempts: 1, max_attempts: 6, creator_id: null, status: "running", locked_until: iso(Date.now() + 120_000) })
    const mine = fakeDb({ commerce_jobs: [job()] })
    ;(mine as unknown as { rpc: unknown }).rpc = async () => ({ data: [job()], error: null })
    const out = await runJobs(mine as never, 5)
    check("a run that still holds its claim marks the job done", mine.tables.commerce_jobs[0].status === "done" && out.done === 1, JSON.stringify(mine.tables.commerce_jobs[0]))

    /* The handler outlived its lease and another run took the job again: attempts is one higher now. */
    const lost = fakeDb({ commerce_jobs: [job()] })
    ;(lost as unknown as { rpc: unknown }).rpc = async () => {
      const claimed = job()
      Object.assign(lost.tables.commerce_jobs[0], { attempts: 2, locked_until: iso(Date.now() + 120_000) })
      return { data: [claimed], error: null }
    }
    const lostOut = await runJobs(lost as never, 5)
    const row = lost.tables.commerce_jobs[0]
    check("a run that lost the lease writes nothing: the job stays the other run's", row.status === "running" && row.attempts === 2 && !row.finished_at, JSON.stringify(row))
    check("  and is not counted done", lostOut.done === 0)

    const failing = { ...job(), kind: "no_such_kind" }
    const failDb = fakeDb({ commerce_jobs: [{ ...failing, attempts: 3 }] })
    ;(failDb as unknown as { rpc: unknown }).rpc = async () => ({ data: [failing], error: null })
    await runJobs(failDb as never, 5)
    check("a failure on a lost claim does not mark the other run's job failed", failDb.tables.commerce_jobs[0].status === "running" && !failDb.tables.commerce_jobs[0].last_error)

    const ownFail = fakeDb({ commerce_jobs: [{ ...failing }] })
    ;(ownFail as unknown as { rpc: unknown }).rpc = async () => ({ data: [failing], error: null })
    await runJobs(ownFail as never, 5)
    check("a failure on its own claim is written, for the retry", ownFail.tables.commerce_jobs[0].status === "failed" && !!ownFail.tables.commerce_jobs[0].last_error)

    const filters = mine.log.filter((l) => l.table === "commerce_jobs" && l.op === "update")
    check("every finishing update names the claim: id, running and attempts", filters.length > 0 && filters.every((l) => ["id", "status", "attempts"].every((c) => l.filters.some(([k, col]) => k === "eq" && col === c))))
    const leftOver = mine.log.filter((l) => l.table === "commerce_jobs" && l.op === "update" && !l.filters.some(([k, c]) => k === "eq" && c === "attempts"))
    check("  none without it", leftOver.length === 0)

    const claimed = { id: 7, attempts: 2 }
    const lease = fakeDb({ commerce_jobs: [{ id: 7, status: "running", attempts: 2, locked_until: iso(now + 30_000) }] })
    check("the lease is renewed before an email while it is held", (await renewJobLease(lease as never, claimed, now)) === true && lease.tables.commerce_jobs[0].locked_until === iso(now + JOB_LEASE_SECONDS * 1000))
    const ranOut = fakeDb({ commerce_jobs: [{ id: 7, status: "running", attempts: 2, locked_until: iso(now - 1_000) }] })
    check("  not once it ran out: another run may be taking the job", (await renewJobLease(ranOut as never, claimed, now)) === false && ranOut.tables.commerce_jobs[0].locked_until === iso(now - 1_000))
    const retaken = fakeDb({ commerce_jobs: [{ id: 7, status: "running", attempts: 3, locked_until: iso(now + 100_000) }] })
    check("  not once another run took it", (await renewJobLease(retaken as never, claimed, now)) === false)
    const finished = fakeDb({ commerce_jobs: [{ id: 7, status: "done", attempts: 2, locked_until: null }] })
    check("finishing a job another run already finished changes nothing", (await finishClaimedJob(finished as never, claimed, { status: "failed" })) === false && finished.tables.commerce_jobs[0].status === "done")

    const src = read("lib/physical/jobs-server.ts")
    const sends = src.match(/const sent = await sendEmail\(/g) ?? []
    const guarded = src.match(/await holdLease\(lease\)\n\s+const sent = await sendEmail\(/g) ?? []
    check("every email the queue sends renews the lease right before it goes", sends.length === 4 && guarded.length === sends.length, `${guarded.length} of ${sends.length}`)
    check("  a lost lease ends the run quietly: no failure written, the other run sends it", /if \(e instanceof LostJobLease\) continue/.test(src))
    check("  the dead job's timeline entry only from the run that wrote it dead", /if \(ours && dead && job\.payload\?\.checkoutId\)/.test(src))
  }

  console.log("\nTranslate changes automatically, one run per store")
  {
    const run = { at: iso(now - 2 * 86_400_000), translated: 12, left: 0 }
    const db = storeDb([{ creator_id: "c1", auto_translate_run: { ...run } }])
    const firstRead = { creator_id: "c1", auto_translate_run: { ...run } }
    const secondRead = { creator_id: "c1", auto_translate_run: { ...run } }
    check("the first delivery holds the store", (await claimQuietStore(db as never, firstRead, now)) === true)
    check("  a duplicate delivery that read the same run finds it changed and leaves it", (await claimQuietStore(db as never, secondRead, now)) === false)
    const after = db.rows[0].auto_translate_run
    check("  one that reads it now sees the claim and leaves it", (await claimQuietStore(db as never, { creator_id: "c1", auto_translate_run: after }, now + 60_000)) === false)
    check("  the run the switch shows is unchanged mid way (at, translated, left)", after.at === run.at && after.translated === run.translated && after.left === run.left && !("error" in after))
    check("  a claim that ran out (the run died) is taken over", (await claimQuietStore(db as never, { creator_id: "c1", auto_translate_run: db.rows[0].auto_translate_run }, now + 7 * 60_000)) === true)
    const fresh = storeDb([{ creator_id: "c2", auto_translate_run: null }])
    check("a store never run is held too", (await claimQuietStore(fresh as never, { creator_id: "c2", auto_translate_run: null }, now)) === true)
    check("  and a second delivery leaves it", (await claimQuietStore(fresh as never, { creator_id: "c2", auto_translate_run: null }, now)) === false)

    const server = read("lib/markets/server.ts")
    check("the switch reads only at, translated, left and error from the run", /run = r && typeof r\.at === "string" \? \{ at: r\.at, translated: Number\(r\.translated\) \|\| 0, left: Number\(r\.left\) \|\| 0, \.\.\.\(r\.error === "unavailable"/.test(server))
    const src = read("lib/markets/auto-translate.ts")
    check("the hourly run before part 186 claims each store before translating it", /if \(!\(await claimQuietStore\(db, row, Date\.now\(\)\)\)\) continue[\s\S]{0,80}autoTranslateStore\(db, id, deadlineAt\)/.test(src))
    const settle = src.slice(src.indexOf("async function settleStore"), src.indexOf("export async function runChangedStores"))
    const writes = settle.match(/\.update\(/g) ?? []
    const own = settle.match(/\.eq\("translate_lease_until", lease\)/g) ?? []
    check("with part 186, the store is settled and let go only on this run's own lease", writes.length === 3 && own.length === 3, `${own.length} of ${writes.length}`)
  }

  console.log("\nOne order row per line of a payment")
  {
    const session = "cs_test_1"
    const db = fakeDb({ orders: [] }, { unique: { orders: [["stripe_session_id", "receipt_token"]] } })
    const a = await db.from("orders").insert({ id: "o1", stripe_session_id: session, receipt_token: "tok_line_0", product_id: "p1" }).select("id").single()
    const b = await db.from("orders").insert({ id: "o2", stripe_session_id: session, receipt_token: "tok_line_1", product_id: "p1" }).select("id").single()
    check("a basket's lines, the same product twice, under one session: both written", !a.error && !b.error && db.tables.orders.length === 2)
    const dup = await db.from("orders").insert({ id: "o3", stripe_session_id: session, receipt_token: "tok_line_0", product_id: "p1" }).select("id").single()
    check("the same line again is refused as a unique violation", isUniqueViolation(dup.error) && db.tables.orders.length === 2)
    const back = await existingSessionOrder(db as never, session, "tok_line_0")
    check("  and read back as the order already written", back?.id === "o1")
    check("  nothing to read back for a line never written", (await existingSessionOrder(db as never, session, "tok_line_9")) === null)
    check("another error is not taken for a duplicate", !isUniqueViolation({ code: "23502" }) && !isUniqueViolation(null))

    const sql = read("supabase/sql/run-now/190_orders_one_row_per_payment_line.sql")
    const lines = sql.trim().split("\n")
    check("part 190: a comment, one DO block and the schema reload, one statement per line", lines.length === 3 && lines[0].startsWith("/*") && lines[0].endsWith("*/") && /^DO \$do\$.*END \$do\$;$/.test(lines[1]) && lines[2] === "notify pgrst, 'reload schema';")
    check("  looks for lines already written twice before making the index", lines[1].indexOf("HAVING count(*) > 1") > 0 && lines[1].indexOf("HAVING count(*) > 1") < lines[1].indexOf("CREATE UNIQUE INDEX"))
    check("  and if there are any, a notice with the count and the query to see them, and no index", /IF n > 0 THEN RAISE NOTICE 'part 190 skipped: % payment lines[^']*See them with: select stripe_session_id, receipt_token, count\(\*\)[^']*having count\(\*\) > 1;', n; RETURN; END IF;/.test(lines[1]))
    check("  the index: (stripe_session_id, receipt_token) where both are set, never stripe_session_id alone", /CREATE UNIQUE INDEX IF NOT EXISTS orders_stripe_session_line_key ON public\.orders \(stripe_session_id, receipt_token\) WHERE stripe_session_id IS NOT NULL AND receipt_token IS NOT NULL;/.test(lines[1]) && !/ON public\.orders \(stripe_session_id\)/.test(sql))
    check("  a plain CREATE INDEX, which a paste (one transaction) can run", !/CONCURRENTLY/.test(sql))
    check("  skips a database with no orders table", /IF to_regclass\('public\.orders'\) IS NULL THEN RAISE NOTICE/.test(lines[1]))
    check("  the migration copy is the same", read("supabase/migrations/20270127_orders_one_row_per_payment_line.sql") === sql)
    const after = read("supabase/sql/run-now/99_check_after.sql")
    check("  99_check_after: true once the index is there or there is no orders table", after.includes("(to_regclass('public.orders') is null or to_regclass('public.orders_stripe_session_line_key') is not null) as p190_orders_one_row_per_payment_line"))
    const readme = read("supabase/sql/run-now/README.md")
    check("  its README row names the write lock", /\| `190_orders_one_row_per_payment_line\.sql` \|[^\n]*LOCK[^\n]*\| 3 \| [\d,]+ \|/.test(readme))
    check("  in the generated parts list", read("lib/admin/sql-parts.generated.ts").includes('file: "190_orders_one_row_per_payment_line.sql"'))
    check("  in the four files", read("supabase/sql/run-four/3_of_4_latest.sql").includes("orders_stripe_session_line_key"))

    const hook = read("app/api/stripe/webhook/route.ts")
    const reads = hook.match(/if \(isUniqueViolation\(orderInsertError\)\) \{\s+const written = await existingSessionOrder\(supabaseAdmin, session\.id, receiptToken\)\s+if \(written\) \{[\s\S]{0,300}Already processed/g) ?? []
    check("the webhook reads a racing duplicate back after either insert, never a 500", reads.length === 2)
    check("a basket's lines carry their own receipt token, by their place", /receiptTokenFor: \(index\) => cartReceiptToken\(sessionId, index\)/.test(read("lib/checkout/fulfil-cart-session.ts")) && /const receiptToken = cartReceiptToken\(sessionId, i\)/.test(read("lib/physical/checkout-server.ts")))
    check("  and a duplicate line is already there, not a failure", /* Round AE: both read the other caller's order to finish its follow-ups (lib/checkout/followups.ts). */ /if \(error\?\.code === "23505"\) \{[\s\S]{0,500}return \{ status: "exists", orderId:/.test(read("lib/checkout/fulfil-cart-item.ts")) && /if \(error\?\.code === "23505"\) \{[\s\S]{0,800}?continue\n/.test(read("lib/physical/checkout-server.ts")))
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
