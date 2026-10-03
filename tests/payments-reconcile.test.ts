/**
 * WHAT CATCHES A WEBHOOK THAT NEVER ARRIVED
 *
 * The webhook is how Storelib learns anything about a seller's Stripe
 * account, and checkout reads what it wrote rather than calling Stripe on a
 * buyer's Pay. A delivery lost for the whole of Stripe's retry window would
 * otherwise leave that row wrong until the seller next opened Payouts, and a
 * seller who never opens Payouts would never fix it: checkout would keep
 * taking money for an account Stripe had restricted, or keep refusing one
 * Stripe had switched on.
 *
 * These read the sweep rather than running it (it talks to Stripe and the
 * database), and pin the promises the rest of the system leans on.
 */
import { readFileSync } from "node:fs"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    console.log(`  FAIL  ${name}${detail === undefined ? "" : `   (${JSON.stringify(detail)})`}`)
  }
}

const sweep = readFileSync("lib/payments/stripe/reconcile.ts", "utf8")
const cron = readFileSync("app/api/cron/notifications/route.ts", "utf8")
const connect = readFileSync("lib/payments/stripe/connect.ts", "utf8")
const webhook = readFileSync("lib/stripe/connect-webhook.ts", "utf8")
const ledger = readFileSync("lib/payments/ledger.ts", "utf8")

console.log("\nThe sweep decides nothing of its own")
check("it reads Stripe through the one sync the webhook uses", /syncStripeAccountFull\(row\.id, "system"\)/.test(sweep))
check("  and has no status, readiness or requirement logic of its own", !/canAcceptPayments\(|getStorelibPaymentsStatus\(|currently_due|past_due/.test(sweep))
check("it writes nothing itself", !/\.update\(|\.upsert\(|\.insert\(/.test(sweep))
check("it sends nothing: the emails belong to the webhook", !/emit\(/.test(sweep))

console.log("\nIt stays small and finishes")
check("oldest first, never-synced first of all", /order\("last_stripe_sync_at", \{ ascending: true, nullsFirst: true \}\)/.test(sweep))
check("only accounts there is something to ask about", /\.not\("stripe_account_id", "is", null\)/.test(sweep))
check("a batch at a time, inside a budget", /limit\(BATCH\)/.test(sweep) && /Date\.now\(\) > deadline/.test(sweep))
check("  and says when it left some behind", /out\.more = true/.test(sweep))
check("one account failing does not end the run", /catch \(e\) \{\s*\n\s*out\.failed\+\+/.test(sweep))

console.log("\nIt is safe before the SQL part has run")
check("a missing column is nothing to do, not an error", /column\|does not exist\|schema cache/.test(sweep) && /return null/.test(sweep))

console.log("\nThe cron runs it without starving anything else")
check("the hourly run calls it", /reconcileStaleAccounts\(/.test(cron))
check("it takes only the time left, and is skipped when there is none", /RECONCILE_BUDGET_MS/.test(cron) && /reconcileMs > 2_000/.test(cron))
check("it cannot fail the cron", /reconcileStaleAccounts\(\{ budgetMs: reconcileMs \}\)\.catch\(\(\) => null\)/.test(cron))

console.log("\nThe webhook stays primary, and a failed delivery is tried again")
check("a handler that failed leaves the event unprocessed", /processed_at: e\.ok \? new Date\(\)\.toISOString\(\) : null/.test(ledger))
check("  and only a processed event is skipped as a duplicate", /return !!data\?\.processed_at/.test(ledger))

console.log("\nAn account that is gone does not keep selling")
check("Storelib disconnected from Stripe's side is let go at once", /account\.application\.deauthorized/.test(webhook) && /releaseConnectedAccount\(creator\.id as string, acctId, "creator_disconnect"\)/.test(webhook))
check("letting an account go clears the cached yes with it", /releaseConnectedAccount[\s\S]*?can_accept_payments: false/.test(connect))
check("  and the masked bank it described", /releaseConnectedAccount[\s\S]*?payout_destination: null/.test(connect))
check("a Stripe blip is never read as gone", /if \(!accountIsGone\(read\.error\)\) throw read\.error/.test(connect))

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
