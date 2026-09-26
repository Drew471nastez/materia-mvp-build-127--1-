/**
 * ===========================================================================
 *  THE NOTIFICATION ENGINE, TOLD FROM WHERE THINGS HAPPEN
 * ===========================================================================
 * The Stripe webhook, the checkout paths, the refund, cashout and account
 * routes raise the engine's events with emit() (lib/notify/outbox.ts, the
 * sale through lib/orders/sale-events.ts) under keys that name the thing, so
 * a second path reporting the same thing is a no-op. The direct creator emails the engine
 * now sends are gone, so nothing is sent twice; the receipts and the seller's
 * sale email stay where they were, the sale email under the engine's
 * preference. And the bugs found on the way stay fixed: the public test
 * email route, profiles read by a column it does not have, email_logs open to
 * every signed in user.
 *
 * Read from source (tests/_source.ts, comments taken out).
 *
 * Run with:  npm run test:push
 */
import { existsSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"
import { readCode } from "./_source"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${label}`)
  } else {
    failed++
    const d = detail === undefined ? "" : `: ${JSON.stringify(detail)}`
    failures.push(label + d)
    console.log(`  FAIL  ${label}${d}`)
  }
}

const has = (src: string, re: RegExp) => re.test(src)
const count = (src: string, re: RegExp) => (src.match(new RegExp(re.source, "g")) ?? []).length

function walk(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.(ts|tsx)$/.test(name)) out.push(p)
  }
  return out
}

const REMOVED = [
  "sendFirstSaleEmail",
  "sendPayoutStatusEmail",
  "sendFirstPayoutEmail",
  "sendPayoutCreatedEmail",
  "sendBankUpdatedEmail",
  "sendPayoutsPausedEmail",
  "sendVerificationRequiredEmail",
  "sendDisputeCreatedEmail",
  "sendDisputeWonEmail",
  "sendDisputeLostEmail",
  "sendWelcomeEmail",
  "send1099KNotificationEmail",
]

console.log("\nThe Stripe webhook raises an event for each thing it hears")
{
  const hook = readCode("app/api/stripe/webhook/route.ts")
  check("payout.created, paid and failed are payout.scheduled, sent and failed", has(hook, /event\.type === "payout\.created" \? "scheduled" : event\.type === "payout\.paid" \? "sent" : event\.type === "payout\.failed" \? "failed" : null/) && has(hook, /name: `payout\.\$\{payoutState\}`/))
  check("keyed by the payout, the key cashout and withdraw use", has(hook, /key: `payout:\$\{payout\.id\}:\$\{payoutState\}`/))
  check("a first payout is said in the payload, not a second email", has(hook, /first,\s*\}/) && has(hook, /\.neq\("stripe_payout_id", payout\.id\)/))
  check("payouts paused or requirements due is payout.action_required", has(hook, /name: "payout\.action_required"/) && has(hook, /const paused = previousPayoutsEnabled && !payoutsEnabled/))
  check("keyed by this event when paused, by what is asked and by when otherwise", has(hook, /key: paused \? `stripe:\$\{event\.id\}` : `stripe_requirements:\$\{account\.id\}:\$\{asked\}`/))
  check("a bank account added or changed is payout_method.*, one key per bank account", has(hook, /event\.type === "account\.external_account\.created" \|\| event\.type === "account\.external_account\.updated"/) && has(hook, /"payout_method\.changed" : "payout_method\.added"/) && count(hook, /key: `payout_method:\$\{bankAccount\.id\}`|`payout_method:\$\{ext\.id\}`/) === 2)
  check("and never its number", !/account_number|routing_number/.test(hook))
  check("a paid checkout raises the order, the sale and the first sale", has(hook, /await raiseSaleEvents\(supabaseAdmin, \{[\s\S]{0,400}correlationId: event\.id,/))
  check("dispute.created, closed and updated", has(hook, /name: "dispute\.created",\s*key: `dispute:\$\{dispute\.id\}:created`/) && count(hook, /name: "dispute\.closed",\s*key: `dispute:\$\{dispute\.id\}:closed`/) === 2 && has(hook, /name: "dispute\.updated",\s*key: `stripe:\$\{event\.id\}`/))
  check("a won and a lost dispute say which", has(hook, /outcome: "won"/) && has(hook, /"warning_closed" : "lost"/))
  check("the creator's plan: created", has(hook, /name: "subscription\.created",\s*key: `subscription:\$\{subscription\.id\}:created`/))
  check("a cancel scheduled for the period's end, once for that end", has(hook, /previous\.cancel_at_period_end === false/) && has(hook, /key: `subscription:\$\{subscription\.id\}:cancel_at:\$\{endsAt \?\? event\.id\}`/))
  check("the plan ended", has(hook, /key: `subscription:\$\{subscription\.id\}:ended`/))
  check("a renewal only, once per invoice", has(hook, /billing_reason === "subscription_cycle"/) && has(hook, /name: "subscription\.renewed",\s*key: `invoice:\$\{invoice\.id\}:paid`/))
  check("a failed plan payment, once per attempt", has(hook, /name: "subscription\.payment_failed",\s*key: `invoice:\$\{invoice\.id\}:failed:/))
  const raised = count(hook, /\bemit\(|\braiseForCreator\(/) - count(hook, /function raiseForCreator\(/) - count(hook, /return \(await emit\(/)
  check("every event names the Stripe event it came from", raised > 0 && count(hook, /correlationId: event\.id/) >= raised + 1, { raised, correlated: count(hook, /correlationId: event\.id/) })
  check("no payment_setup.* or account.* from here: the creators trigger raises those", !/name: "payment_setup\./.test(hook) && !/name: "account\./.test(hook))
  check("the removed senders are not called", REMOVED.every((f) => !hook.includes(f)))
  check("and profiles is not read here at all", !/from\("profiles"\)/.test(hook))
}

console.log("\nThe other paths an order, a refund or a payout is made by")
{
  check("one way in: lib/notify-events is gone, every path calls emit() itself", !existsSync("lib/notify-events"))
  const sale = readCode("lib/orders/sale-events.ts")
  check("the sale module raises through the outbox", has(sale, /import \{ emit \} from "@\/lib\/notify\/outbox"/))
  check("an order's keys name the order", has(sale, /key: `order:\$\{n\.purchase\.orderId\}:created`/) && has(sale, /key: `sale:\$\{line\.orderId\}:created`/))
  check("the first sale is keyed by its order, on the old guard", has(sale, /key: `order:\$\{n\.purchase\.orderId\}:first`/) && has(sale, /first_sale_email_sent/) && has(sale, /update\(\{ first_sale_email_sent: true \}\)/))
  check("a free claim is never a first sale", has(sale, /n\.purchase\.amountCents > 0 &&/))
  for (const f of ["lib/checkout/fulfil-payment.ts", "lib/checkout/fulfil-cart-session.ts", "app/api/checkout/process/route.ts", "app/api/checkout/quick-free/route.ts"]) {
    check(`${f} raises the sale`, /raiseSaleEvents\((admin|supabaseAdmin), \{/.test(readCode(f)))
  }
  const cart = readCode("lib/checkout/fulfil-cart-session.ts")
  check("a basket is one purchase, raised by the caller that owns it", has(cart, /purchase: s\.ownsBasket \? \{ orderId: s\.firstOrderId/))

  const sync = readCode("lib/stripe/refund-sync.ts")
  const route = readCode("app/api/stripe/refund/route.ts")
  const adminRefund = readCode("app/api/admin/orders/refund/route.ts")
  check("charge.refunded raises order.refunded per row and refund", has(sync, /name: "order\.refunded",\s*key: `refund:\$\{row\.id\}:\$\{refund\.id\}`/))
  check("the Orders page under the same key", has(route, /name: "order\.refunded",\s*key: `refund:\$\{orderId\}:\$\{refund\.id\}`/))
  check("the admin refund under the same key", has(adminRefund, /name: "order\.refunded",\s*key: `refund:\$\{o\.id\}:\$\{refundId\}`/))

  for (const f of ["app/api/stripe/cashout/route.ts", "app/api/stripe/withdraw/route.ts"]) {
    const src = readCode(f)
    check(`${f}: payout.scheduled under the webhook's key, no email`, has(src, /name: "payout\.scheduled",\s*key: `payout:\$\{stripePayout\.id\}:scheduled`/) && !/sendPayoutCreatedEmail|from\("profiles"\)/.test(src))
  }
}

console.log("\nEvery caller uses the outbox's emit()")
{
  for (const f of ["app/api/stripe/webhook/route.ts", "lib/stripe/refund-sync.ts", "app/api/stripe/refund/route.ts", "app/api/admin/orders/refund/route.ts", "app/api/stripe/cashout/route.ts", "app/api/stripe/withdraw/route.ts", "app/api/auth/password-changed/route.ts"]) {
    check(`${f} imports emit from lib/notify/outbox`, /import \{ emit(, type EmitInput)? \} from "@\/lib\/notify\/outbox"/.test(readCode(f)))
  }
}

console.log("\nAccount changes")
{
  const pwd = readCode("app/api/auth/password-changed/route.ts")
  check("a password changed in the browser is raised under the trigger's key", has(pwd, /key: `user\.password_changed:\$\{user\.id\}:\$\{Math\.floor\(changedAt \/ 1000\)\}`/))
  check("only for a change that just happened", has(pwd, /Date\.now\(\) - changedAt > FRESH_MS/) && has(pwd, /readCurrentUser\(supabase\)/))
  const verify = readCode("app/api/auth/verify-email-change/route.ts")
  check("an email change is raised by the auth.users trigger alone, not again here", !/user\.email_changed|emit\(/.test(verify))
  check("and the direct notice to the old address is gone", !/sendEmail\(|Your Storelib email was changed/.test(verify))
}

console.log("\nEmails: removed where the engine sends them, kept where it does not")
{
  const email = readCode("lib/email.tsx")
  check("lib/email.tsx no longer has the senders the engine replaced", REMOVED.every((f) => !new RegExp(`function ${f}\\b`).test(email)), REMOVED.filter((f) => new RegExp(`function ${f}\\b`).test(email)))
  const callers = [...walk("app"), ...walk("lib"), ...walk("components")].filter((f) => REMOVED.some((r) => readCode(f).includes(r)))
  check("and nothing calls them", callers.length === 0, callers)
  check("the receipt, the sale email and the refund emails stay", ["sendBuyerDownloadEmail", "sendSellerNotificationEmail", "sendRefundEmails", "sendOrderEmails"].every((f) => new RegExp(`export async function ${f}\\b`).test(email)))
  check("the sale email asks the engine's preference first", has(email, /if \(!\(await sellerWantsSaleEmail\(admin, creatorId\)\)\)/) && has(email, /allowed\(admin, creator\.user_id, entryFor\("NEW_SALE"\), "email"\)/))
  check("after its own once-per-order check", email.indexOf('wasEmailAlreadySent(admin, orderId, "seller_notification")') < email.indexOf("await sellerWantsSaleEmail(admin, creatorId)"))
}

console.log("\nThe bugs found on the way")
{
  check("the public test email route is gone", !existsSync("app/api/test-email/route.ts"))
  const wrong = [...walk("app"), ...walk("lib"), ...walk("components")].filter((f) => /from\("profiles"\)(?:(?!\.from\()[\s\S]){0,240}?\.eq\("user_id"/.test(readCode(f)))
  check("profiles is never read by user_id (its key is id)", wrong.length === 0, wrong)
  const part = readCode("supabase/sql/run-now/42_email_logs_rls.sql")
  check("email_logs: row level security on, nothing for the client roles", /ENABLE ROW LEVEL SECURITY/.test(part) && /REVOKE ALL ON TABLE public\.email_logs FROM anon, authenticated/.test(part) && /GRANT ALL ON TABLE public\.email_logs TO service_role/.test(part))
  const stmts = (sql: string) => sql.split("\n").filter((l) => l.trim() && !l.startsWith("/*"))
  check("the migration holds the same statements", JSON.stringify(stmts(readCode("supabase/migrations/20261007_email_logs_rls.sql"))) === JSON.stringify(stmts(part)) && stmts(part).length === 2)
  check("in the README and the check after", /`42_email_logs_rls\.sql`/.test(readCode("supabase/sql/run-now/README.md")) && /as p42_email_logs_rls/.test(readCode("supabase/sql/run-now/99_check_after.sql")))
  check("this suite runs with the others", readCode("scripts/run-push-tests.mjs").includes('"tests/notify-integration.test.ts"'))
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) {
  console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
  process.exit(1)
}
