/**
 * ===========================================================================
 *  THE ADMIN'S LOGIC, RUN RATHER THAN READ
 * ===========================================================================
 * What a failed query says to the owner, what a refund is allowed to do,
 * which products the spam signals flag, where a creator stands with Stripe,
 * and how the admin's reader behaves when the database refuses a column it
 * does not have yet. Each one is run against inputs, including the ones that
 * went wrong in production.
 *
 * Run with:  npm run test:push
 */
import { loggable, plainReason } from "@/lib/admin/plain-reason"
import { Reader, missingOptional, pageParam, searchText, withoutColumns } from "@/lib/admin/platform-metrics"
import { planRefund } from "@/lib/admin/refund-plan"
import { creatorRef, refundableCents, stripeState } from "@/lib/admin/views/common"
import { productFlag } from "@/lib/admin/views/commerce"
import { CRON_JOBS, ENV_CHECKS } from "@/lib/admin/schema-expectations"
import { readFileSync } from "node:fs"

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

async function main() {
  console.log("\nA failed query is said in plain words, and says nothing else\n")
  {
    const col = plainReason({ code: "42703", message: "column orders.creator_id does not exist" }, "orders")
    check("the owner's error names the column", col.includes("orders.creator_id") && !col.includes("42703"), col)
    const bare = plainReason({ code: "42703", message: 'column "banned_at" does not exist' }, "creators")
    check("and qualifies a bare column with its table", bare.includes("creators.banned_at"), bare)
    const table = plainReason({ code: "PGRST205", message: "Could not find the table 'public.admin_actions' in the schema cache" }, "admin_actions")
    check("a missing table says which SQL to run", table.includes("admin_actions") && table.includes("RUN_ADMIN_CONSOLE.sql"), table)
    const fn = plainReason({ code: "PGRST202", message: "Could not find the function public.admin_order_totals(p_since) in the schema cache" })
    check("so does a missing function", fn.includes("admin_order_totals") && fn.includes("RUN_ADMIN_CONSOLE.sql"), fn)
    const value = plainReason({ code: "22P02", message: 'invalid input syntax for type uuid: "someone@example.com"' })
    check("a value from the request is never repeated back", !value.includes("example.com"), value)
    const unknown = plainReason({ code: "XX000", message: "internal error at /var/lib/postgres with secret detail" })
    check("an unknown error keeps only its code", unknown === "The database refused this query (code XX000).", unknown)
    check("an unreachable database says so", plainReason(new Error("TypeError: fetch failed")) === "The database could not be reached.")
    check("a check constraint says to run the SQL", plainReason({ code: "23514", message: 'new row violates check constraint "products_status_check"' }).includes("RUN_ADMIN_CONSOLE.sql"))
    check("the log line masks an address", !loggable({ message: "duplicate key: someone@example.com" }).includes("someone@"))
  }

  console.log("\nA refund goes ahead only for the amount that was read\n")
  {
    const paid = { id: "o1", status: "completed", amount_cents: 2500, refund_amount_cents: null, stripe_payment_intent_id: "pi_1" }
    const ok = planRefund(paid, 2500)
    check("a paid order refunds its whole amount when that amount is echoed", ok.ok && ok.amount === 2500 && ok.total === 2500)
    check("with the creator route's idempotency key", ok.ok && ok.idempotencyKey === "storelib-refund:o1:0:2500")
    check("a different echo is refused with nothing done", (() => { const p = planRefund(paid, 2400); return !p.ok && p.status === 409 })())
    check("a missing echo is refused too", !planRefund(paid, undefined).ok && !planRefund(paid, "2500").ok)
    const partly = { ...paid, status: "refunded", refund_amount_cents: 1000 }
    const rest = planRefund(partly, 1500)
    check("a partly refunded order refunds what is left", rest.ok && rest.amount === 1500 && rest.total === 2500 && rest.idempotencyKey === "storelib-refund:o1:1000:1500")
    check("a fully refunded order refuses", !planRefund({ ...paid, status: "refunded", refund_amount_cents: 2500 }, 0).ok)
    check("so does a refunded row with no amount recorded", refundableCents({ ...paid, status: "refunded", refund_amount_cents: null }) === 0)
    check("a pending order refuses", !planRefund({ ...paid, status: "pending" }, 2500).ok)
    check("a disputed order refuses", !planRefund({ ...paid, status: "disputed" }, 2500).ok)
    check("a free order with no payment refuses", !planRefund({ ...paid, stripe_payment_intent_id: null }, 2500).ok)
    check("no order refuses with a 404", (() => { const p = planRefund(null, 0); return !p.ok && p.status === 404 })())
  }

  console.log("\nSpam signals flag products, not ordinary ones\n")
  {
    check("a link farm title is flagged", productFlag("jasa backlink murah slot gacor 888", "powersanur999") !== null)
    check("a real product is not", productFlag("Lightroom preset pack", "ana.pop") === null)
    check("a flag says why", (productFlag("slot gacor maxwin", null)?.reasons.length ?? 0) > 0)
  }

  console.log("\nWhere a creator stands with Stripe\n")
  {
    check("no account", stripeState({}) === "none")
    check("account, nothing submitted", stripeState({ stripe_account_id: "acct_1" }) === "pending")
    check("submitted, not enabled", stripeState({ stripe_account_id: "acct_1", details_submitted: true }) === "restricted")
    check("both enabled is ready", stripeState({ stripe_account_id: "acct_1", charges_enabled: true, payouts_enabled: true }) === "ready")
    check("payouts alone is not ready", stripeState({ stripe_account_id: "acct_1", charges_enabled: true, payouts_enabled: false, details_submitted: true }) === "restricted")
    check("a creator reads by handle", creatorRef({ id: "c1", slug: "ana", display_name: "Ana Pop" })?.handle === "ana")
  }

  console.log("\nSearch text cannot change the shape of a filter\n")
  {
    check("commas and brackets are taken out", searchText("a,b)(c%") === "a b c")
    check("and it is bounded", searchText("x".repeat(500)).length === 80)
    check("a page number is a positive whole number", pageParam("3") === 3 && pageParam("-1") === 1 && pageParam("abc") === 1 && pageParam("99999999") === 10000)
  }

  console.log("\nA column that arrives with the SQL is dropped and asked again\n")
  {
    check("the missing optional column is recognised", missingOptional({ code: "42703", message: "column creators.banned_at does not exist" }, ["banned_at", "banned_reason"]) === "banned_at")
    check("a missing column that is not optional is not", missingOptional({ code: "42703", message: "column creators.slug does not exist" }, ["banned_at"]) === null)
    check("the select loses exactly that column", withoutColumns("id, slug, banned_at, banned_reason", ["banned_at"]) === "id, slug, banned_reason")

    /* A fake database that refuses banned_at, then answers. */
    const seen: string[] = []
    const fake = {
      from() {
        let select = ""
        const q: any = { // eslint-disable-line @typescript-eslint/no-explicit-any
          select(cols: string) { select = cols; seen.push(cols); return q },
          order() { return q },
          range() { return q },
          then(resolve: (v: unknown) => void) {
            if (select.includes("banned_at")) resolve({ data: null, error: { code: "42703", message: "column creators.banned_at does not exist" }, count: null })
            else resolve({ data: [{ id: "c1" }], error: null, count: 51 })
          },
        }
        return q
      },
    }
    const r = new Reader()
    ;(r as unknown as { client: unknown }).client = fake
    const page = await r.page("creators", "creators", "id, slug, banned_at", (q) => q.order("created_at"), 2, { optional: ["banned_at"] })
    check("the read succeeds without the column", page !== null && page.rows.length === 1, JSON.stringify({ page, problems: r.problems, seen }))
    check("the total and pages come from the count", page?.total === 51 && page?.pages === 3 && page?.page === 2)
    check("it was asked twice, the second time without it", seen.length === 2 && !seen[1].includes("banned_at"))
    check("a notice says what is missing and what to run", r.notices.some((n) => n.includes("creators.banned_at") && n.includes("RUN_ADMIN_CONSOLE.sql")))
    check("and it is not counted as a failure", r.problems.length === 0)

    const failing = {
      from() {
        const q: any = { select() { return q }, eq() { return q }, then(resolve: (v: unknown) => void) { resolve({ count: null, data: null, error: { code: "42703", message: "column orders.creator_id does not exist" } }) } } // eslint-disable-line @typescript-eslint/no-explicit-any
        return q
      },
    }
    const r2 = new Reader()
    ;(r2 as unknown as { client: unknown }).client = failing
    const errors: unknown[] = []
    const original = console.error
    console.error = (...a: unknown[]) => errors.push(a)
    const n = await r2.count("orders by creator", "orders", (q) => q.eq("creator_id", "x"))
    console.error = original
    check("a refused count is null, not zero", n === null)
    check("and the reason is the plain sentence", r2.reasonFor("orders by creator")?.startsWith("The database has no column orders.creator_id") ?? false, r2.reasonFor("orders by creator") ?? "")
    check("the raw message goes to the server log", errors.length === 1)
  }

  console.log("\nThe System view's lists match the platform\n")
  {
    const vercel = JSON.parse(readFileSync("vercel.json", "utf8")) as { crons: { path: string; schedule: string }[] }
    check(
      "every scheduled job in vercel.json is checked, on its schedule",
      vercel.crons.length === CRON_JOBS.length && vercel.crons.every((c) => CRON_JOBS.some((j) => j.path === c.path && j.schedule === c.schedule)),
    )
    const system = readFileSync("lib/admin/views/system.ts", "utf8")
    check("environment variables leave the server as booleans only", /set: typeof process\.env\[e\.name\] === "string"/.test(system) && !/value: process\.env/.test(system))
    check("the names checked are ones the app reads", ENV_CHECKS.length > 20)
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) {
    console.log("\nFailures:")
    for (const f of failures) console.log(`  - ${f}`)
    process.exit(1)
  }
}

main()
