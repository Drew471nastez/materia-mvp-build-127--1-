/**
 * Settings > Plan: Cancel plan and Resume plan, the reason kept, the small
 * print under the cards gone, and the tab laid out in one column.
 *
 *   npx tsx tests/billing-cancel19.test.ts
 */
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { CANCEL_NOTE_MAX, CANCEL_REASONS, isCancelReason, readCancelFeedback, stripeCancellationDetails } from "@/lib/billing/cancel-reasons"
import * as plans from "@/lib/billing/plans"
import { untt } from "./i18n-source"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n        ${JSON.stringify(detail).slice(0, 300)}`}`)
}
const root = process.cwd()
const read = (p: string) => untt(readFileSync(join(root, p), "utf8"), p)
/* Source with comments taken out, so a rule is about the code and not about what a comment says. */
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")

const BILLING = "components/app/billing/billing-page-client.tsx"
const DIALOG = "components/app/billing/cancel-plan-dialog.tsx"
const CANCEL = "app/api/billing/subscription/cancel/route.ts"
const RESUME = "app/api/billing/subscription/resume/route.ts"
const PART = "supabase/sql/run-now/128_plan_cancellations.sql"
const MIGRATION = "supabase/migrations/20261231_plan_cancellations.sql"

console.log("\nThe reason a creator gives")
{
  check("six reasons, each with its own key", CANCEL_REASONS.length === 6 && new Set(CANCEL_REASONS.map((r) => r.key)).size === 6)
  check("a reason from the list is kept, anything else is none", readCancelFeedback({ reason: "too_expensive" }).reason === "too_expensive" && readCancelFeedback({ reason: "drop table" }).reason === null && !isCancelReason(42))
  check("no body, or a body that is not an object, is nothing said", JSON.stringify(readCancelFeedback(null)) === '{"reason":null,"note":null}' && JSON.stringify(readCancelFeedback("x")) === '{"reason":null,"note":null}')
  check("the note is trimmed, its spaces joined, and cut at the limit", readCancelFeedback({ note: "  too   many\n\nemails " }).note === "too many emails" && readCancelFeedback({ note: "a".repeat(900) }).note?.length === CANCEL_NOTE_MAX && readCancelFeedback({ note: "   " }).note === null)
  check("Stripe hears its own feedback value and the note as the comment", JSON.stringify(stripeCancellationDetails({ reason: "switching", note: "Moving" })) === '{"feedback":"switched_service","comment":"Moving"}')
  check("and nothing at all when nothing was said", stripeCancellationDetails({ reason: null, note: null }) === undefined)
  const stripeValues = new Set(["customer_service", "low_quality", "missing_features", "other", "switched_service", "too_complex", "too_expensive", "unused"])
  check("every reason maps to a value Stripe accepts", CANCEL_REASONS.every((r) => stripeValues.has(r.stripe)))
}

console.log("\nCancel at the period's end, through Stripe")
{
  const cancel = code(CANCEL)
  check("the cancel route reads the reason with readCancelFeedback", /readCancelFeedback\(/.test(cancel) && /await request\.json\(\)/.test(cancel))
  check("still at the period's end, never now", /cancel_at_period_end: true/.test(cancel) && !/subscriptions\.cancel\(/.test(cancel) && !/subscriptions\.del\(/.test(cancel))
  check("the reason goes to Stripe's cancellation_details", /cancellation_details/.test(cancel) && /stripeCancellationDetails\(/.test(cancel))
  check("and to plan_cancellations, written by the server", /from\("plan_cancellations"\)\s*\.insert\(/.test(cancel) && /createAdminClient\(\)/.test(cancel))
  check("a missing table never stops the cancel", /console\.warn\("\[Cancel\] plan_cancellations/.test(cancel))
  check("a body is optional, so the upgrade page's Downgrade to Free still cancels", /\.catch\(\(\) => null\)/.test(cancel) && /fetch\("\/api\/billing\/subscription\/cancel", \{ method: "POST" \}\)/.test(read("components/app/billing/upgrade-page-client.tsx")))
}

console.log("\nResume plan")
{
  check("a resume route exists", existsSync(join(root, RESUME)))
  const resume = code(RESUME)
  check("it undoes the cancel in Stripe, nothing charged", /cancel_at_period_end: false/.test(resume) && !/proration|invoices\.create|checkout/.test(resume))
  check("only a subscription that is still running", /RUNNING\.has\(live\.status\)/.test(resume) && /status: 409/.test(resume))
  check("it signs the user in and finds their own subscription", /moneyCaller\("billing", "manage"\)/.test(resume) && /\.eq\("creator_id", creator\.id\)/.test(resume) /* Changed on purpose (round 42 team): signed in through lib/team/money, which asks auth.getUser() */)
  check("the cancellation row is marked resumed, the reason kept", /resumed_at: new Date\(\)\.toISOString\(\)/.test(resume) && /\.is\("resumed_at", null\)/.test(resume))
}

console.log("\nThe Subscription Overview")
{
  const billing = code(BILLING)
  check("Cancel plan only for a paid plan that is running and not already ending", /const canCancel = Boolean\(isSubscribed && !subscription\.cancel_at_period_end && currentPlan\.price_cents > 0\)/.test(billing) && /\{canCancel \? \(/.test(billing) && /data-billing-cancel=""/.test(billing))
  check("the dialog opens from it", /setCancelOpen\(true\)/.test(billing) && /<CancelPlanDialog\b/.test(billing))
  check("the dialog posts the reason to the cancel route", /fetch\("\/api\/billing\/subscription\/cancel", \{\s*method: "POST",[\s\S]{0,120}JSON\.stringify\(\{ reason: feedback\.reason, note: feedback\.note \}\)/.test(billing))
  check("after a cancel: Pro until the date, and Resume plan", /data-billing-ends=""/.test(billing) && /until \{formatDate\(subscription\.current_period_end\)\}/.test(billing) && /data-billing-resume=""/.test(billing) && /fetch\("\/api\/billing\/subscription\/resume", \{ method: "POST" \}\)/.test(billing))
  check("Resume plan undoes it in place, not a trip to the upgrade page", !/"Keep Pro"/.test(billing))
  const dialog = code(DIALOG)
  check("a dialog on a computer and the shared bottom sheet on a phone", /<SheetDialog\b/.test(dialog) && /phone=\{phone\}/.test(dialog) && /<BottomSheet\b/.test(read("components/ui/sheet-dialog.tsx")))
  check("it says when Pro ends, from the subscription", /endsAt/.test(dialog) && /stays on until/.test(dialog) && /endsAt=\{subscription\?\.current_period_end \?\? null\}/.test(billing))
  check("what Free changes comes from the plan comparison, not typed", /planComparison\(\)/.test(dialog) && /r\.free !== r\.pro/.test(dialog))
  check("the reasons are the list, the note is optional, both buttons are there", /CANCEL_REASONS\.map/.test(dialog) && /Optional/.test(dialog) && /data-cancel-keep=""/.test(dialog) && /data-cancel-confirm=""/.test(dialog))
}

console.log("\nThe small print and the layout")
{
  check("the US dollars and Stripe fees line is gone from Settings > Plan and the in-app upgrade page", ["components/app/billing/billing-page-client.tsx", "components/app/billing/upgrade-page-client.tsx"].every((f) => !/PLAN_FOOTNOTE|Prices in US dollars/.test(read(f))))
  // Changed on purpose (landing round 14): the owner asked for the line gone everywhere, so the public pricing has none and the constant is gone.
  check("the public pricing has none either, and the constant is gone", !/footnote|Prices in US dollars/.test(read("components/marketing/pricing-section.tsx")) && !("PLAN_FOOTNOTE" in plans))
  const billing = code(BILLING)
  check("the plans, the overview and the history share one column", /const PLAN_COLUMN = "/.test(billing) && (billing.match(/PLAN_COLUMN/g) ?? []).length >= 2)
  check("the overview's two cards pair up where the plan cards do (md)", /grid grid-cols-1 gap-5 md:grid-cols-2/.test(billing))
}

console.log("\nSQL part 128")
{
  const part = read(PART)
  const lines = part.trimEnd().split("\n")
  check("one statement per line, a comment first and notify pgrst last", lines[0].startsWith("/*") && lines[0].endsWith("*/") && lines[lines.length - 1] === "notify pgrst, 'reload schema';" && lines.slice(1).every((l) => l.trimEnd().endsWith(";")))
  check("the DO block on one line, and idempotent", lines.filter((l) => /^DO \$do\$/.test(l)).length === 1 && /\$do\$;$/.test(lines[1]) && /CREATE TABLE IF NOT EXISTS public\.plan_cancellations/.test(part) && /CREATE INDEX IF NOT EXISTS/.test(part))
  check("RLS on, nobody but the service role", /ENABLE ROW LEVEL SECURITY/.test(part) && /REVOKE ALL ON public\.plan_cancellations FROM PUBLIC, anon, authenticated/.test(part) && /TO service_role/.test(part) && !/CREATE POLICY/.test(part))
  const keys = /reason IN \(([^)]*)\)/.exec(part)?.[1].split(",").map((s) => s.trim().replace(/'/g, "")) ?? []
  check("the reasons the table allows are the reasons the dialog offers", keys.join() === CANCEL_REASONS.map((r) => r.key).join())
  check("the note limit matches", new RegExp(`char_length\\(note\\) <= ${CANCEL_NOTE_MAX}`).test(part))
  check("a migrations copy, the same text", existsSync(join(root, MIGRATION)) && read(MIGRATION) === part)
  check("a README row and a p128 column in 99_check_after", /\| `128_plan_cancellations\.sql` \|/.test(read("supabase/sql/run-now/README.md")) && /as p128_plan_cancellations/.test(read("supabase/sql/run-now/99_check_after.sql")))
  check("built into the four files", /plan_cancellations/.test(read("supabase/sql/run-four/3_of_4_latest.sql")))
}

console.log("\nThe end of a cancelled plan is the webhook's")
{
  const hook = code("app/api/stripe/webhook/route.ts")
  /* Changed on purpose (billing fail closed): the three subscription events share one sync, lib/billing/subscription-sync.ts,
     which writes Free only when Stripe answered and nothing is paying, and the row's status and cancel_at_period_end from
     Stripe's subscription now. tests/billing-fail-closed.test.ts runs it. */
  const sync = code("lib/billing/subscription-sync.ts")
  check("customer.subscription.deleted moves the creator to Free", /event\.type === "customer\.subscription\.deleted"[\s\S]{0,400}syncFromSubscriptionEvent\(/.test(hook) && /if \(creator\.subscription_plan_id !== "free"\) update\.subscription_plan_id = "free"/.test(sync) && /status: sub\.status/.test(sync))
  check("customer.subscription.updated keeps cancel_at_period_end in step", /cancel_at_period_end: sub\.cancel_at_period_end === true/.test(sync))
}

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed) process.exit(1)
