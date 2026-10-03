/**
 * ONCE A WEEK UNTIL PAYOUTS ARE SET UP (lib/notify/payout-weekly.ts), and the
 * simpler setup form: no business question.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { dayOf, paymentsComplete, wantsPayoutNudge, PAYOUT_NUDGES } from "@/lib/notify/payout-weekly"
import { unfinished } from "@/lib/notify/workflows/unfinished"
import { REGISTRY } from "@/lib/notify/registry"
import { renderEmail } from "@/lib/notify/templates"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; failures.push(label); console.log(`  FAIL  ${label}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ""}`) }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

console.log("\nWho the weekly email is for")
const none = new Set<string>()
check("never connected: yes", wantsPayoutNudge({ id: "c1", user_id: "u1" }, none))
check("started and unfinished: yes", wantsPayoutNudge({ id: "c1", user_id: "u1", stripe_account_id: "x", details_submitted: true, charges_enabled: false, payouts_enabled: false }, none))
check("connected: no", !wantsPayoutNudge({ id: "c1", user_id: "u1", stripe_onboarding_status: "connected" }, none))
check("everything switched on: no", !wantsPayoutNudge({ id: "c1", user_id: "u1", charges_enabled: true, payouts_enabled: true, details_submitted: true }, none))
check("ready on Airwallex: no", !wantsPayoutNudge({ id: "c1", user_id: "u1" }, new Set(["c1"])))
check("a deleted account: no", !wantsPayoutNudge({ id: "c1", user_id: "u1", deleted_at: "2026-01-01T00:00:00Z" }, none))
check("no person to write to: no", !wantsPayoutNudge({ id: "c1", user_id: null }, none))
check("complete reads like the send-time condition", paymentsComplete({ id: "c", user_id: "u", stripe_onboarding_status: "connected" }) && !paymentsComplete({ id: "c", user_id: "u", charges_enabled: true, payouts_enabled: true, details_submitted: false }))
check("every payout setup email counts as told this week", PAYOUT_NUDGES.includes("PAYOUT_SETUP_WEEKLY") && PAYOUT_NUDGES.includes("PAYOUT_SETUP_UNFINISHED_2"))

console.log("\nThe email")
const now = Date.parse("2026-10-03T10:00:00Z")
const event = { name: "payment_setup.weekly_check" as const, key: "payment_setup.weekly_check:c1:2026-10-03", userId: "u1", creatorId: "c1", entityType: "creator" as const, entityId: "c1", payload: { day: dayOf(now), started: false }, occurredAt: new Date(now).toISOString() }
const plan = unfinished(event, { now, userId: "u1", creatorId: "c1" })
const job = plan?.jobs[0]
check("the sweep's event plans one weekly email, sent at once", plan?.jobs.length === 1 && job?.type === "PAYOUT_SETUP_WEEKLY" && job.runAt === new Date(now).toISOString())
check("keyed by the creator and the day, so a sweep that runs twice sends once", job?.idempotencyKey === "PAYOUT_SETUP_WEEKLY:u:u1:c1:week_2026-10-03")
const again = unfinished(event, { now: now + 3600_000, userId: "u1", creatorId: "c1" })
check("the same day an hour later plans the same key", again?.jobs[0]?.idempotencyKey === job?.idempotencyKey)
const entry = REGISTRY.PAYOUT_SETUP_WEEKLY
check("lifecycle, with an unsubscribe, and never sent once payments are set up", entry.category === "lifecycle" && entry.requirement === "optional_product" && entry.condition === "payment_setup_incomplete")
const mail = renderEmail("PAYOUT_SETUP_WEEKLY", { started: false }, { baseUrl: "https://storelib.com" } as never)
const text = JSON.stringify(mail)
check("it says what setup takes, and links to it", /five minutes/.test(text) && /\/app\/settings\?tab=payments/.test(text))
check("no em dash, no business question in it", !/—/.test(text) && !/business/i.test(text))
check("the second reminder no longer says it is the last", !/last reminder about your payouts/.test(read("lib/notify/templates/catalog.ts")))
const cron = read("app/api/cron/notifications/route.ts")
check("the hourly cron sweeps before the worker sends", cron.indexOf("sweepPayoutReminders(") > 0 && cron.indexOf("sweepPayoutReminders(") < cron.indexOf("runNotificationWork("))

console.log("\nSetup is country, name, Stripe's ID check and the bank")
const flow = read("components/app/settings/payments-setup-flow.tsx")
check("no Selling as question", !/Selling as/.test(flow) && !/<Segmented/.test(flow))
check("a new account is an individual", /data\.kind === "business" \? "business" : "individual"/.test(flow))
const connect = read("lib/payments/stripe/connect.ts")
const begin = connect.slice(connect.indexOf("export async function beginStripeOnboarding"), connect.indexOf("export async function upsertRepresentative"))
check("begin keeps the full business profile, so Stripe never asks what the business does", /creatorBusinessProfile\(/.test(begin) && !/product_description: row\?\.bio/.test(begin))

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) { for (const f of failures) console.log(`  - ${f}`); process.exit(1) }
