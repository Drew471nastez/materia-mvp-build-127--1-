/**
 * ===========================================================================
 *  MEMBERSHIPS: WHO SEES WHAT, WHAT STRIPE'S EVENTS DO, WHAT THE FEE IS
 * ===========================================================================
 * The rules of lib/memberships, held from their inputs:
 *
 *   ACCESS          active and trialing yes; cancelled until the period
 *                   ends; past due for 7 days; incomplete and expired no.
 *                   The SQL rule row level security uses says the same.
 *   FROM STRIPE     every subscription status to ours, a trial without its
 *                   card still incomplete, the period read from the items
 *                   (API 2025-11-17.clover) and from the old place.
 *   THE WEBHOOK     a subscription's life as a series of Stripe fixtures:
 *                   each step's row and what it causes (welcome, cancel
 *                   notice, resume, end, library rows on and off); a repeat
 *                   causes nothing; a failed payment's grace counted from
 *                   the first failure, not the latest retry.
 *   THE FEE         the same cents the one time checkout takes, as the
 *                   percent a subscription carries, within Stripe's rounding.
 *   WHAT IS SAVED   a plan and an update, checked as the server checks them.
 *   THE NOTICES     one job per event, keyed so a repeat plans nothing new,
 *                   to the member's address, never to /app.
 *   THE EMAIL       a creator's update in their own layout, one picture of
 *                   the creator, the way out in the footer and the header.
 *   THE WIRING      the webhook asks memberships first; the member's pages
 *                   and files are checked on the server; the SQL part.
 */
import "./_membership-env"
import { readFileSync } from "node:fs"
import {
  PAST_DUE_GRACE_DAYS,
  describeStatus,
  feeFromPercent,
  feePercentFor,
  fieldsFromSubscription,
  grantsAccess,
  isMembershipSubscription,
  monthlyValue,
  pricePer,
  reminderLeadDays,
  statusFromStripe,
  transitions,
  yearlySaving,
  type SubscriptionLike,
} from "@/lib/memberships/state"
import { centsFromInput, checkPlan, checkPost, excerpt } from "@/lib/memberships/plan"
import { computeApplicationFee } from "@/lib/billing/fee-calculator"
import { memberships as membershipWorkflow } from "@/lib/notify/workflows/memberships"
import { renderEmail } from "@/lib/notify/templates"
import { REGISTRY } from "@/lib/notify/registry"
import { receiptTokenFor, signToken, verifyToken, ownerFilter, belongsTo } from "@/lib/memberships/server"
import { renderUpdateEmail } from "@/lib/memberships/update-email-render"
import { DEFAULT_BRAND } from "@/lib/email-campaigns/brand"
import type { DomainEvent } from "@/lib/notify/types"

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
    console.log(`  FAIL  ${label}${detail !== undefined ? ` (${JSON.stringify(detail)})` : ""}`)
  }
}
const read = (p: string) => readFileSync(p, "utf8")

const NOW = Date.parse("2026-09-28T12:00:00Z")
const DAY = 86_400_000
const iso = (ms: number) => new Date(ms).toISOString()
const sec = (ms: number) => Math.floor(ms / 1000)

/* ── A subscription as Stripe sends it, for the fixtures ─────────────────── */
function sub(over: Partial<SubscriptionLike> & { periodEnd?: number; amount?: number; interval?: "month" | "year" } = {}): SubscriptionLike {
  const { periodEnd = NOW + 30 * DAY, amount = 900, interval = "month", ...rest } = over
  return {
    id: "sub_fixture",
    status: "active",
    customer: "cus_fixture",
    cancel_at_period_end: false,
    cancel_at: null,
    canceled_at: null,
    ended_at: null,
    trial_end: null,
    default_payment_method: { id: "pm_1", card: { brand: "visa", last4: "4242" } },
    pending_setup_intent: null,
    metadata: { kind: "membership", product_id: "p1", creator_id: "c1", buyer_email: "ana@example.com" },
    items: { data: [{ current_period_start: sec(periodEnd - 30 * DAY), current_period_end: sec(periodEnd), price: { id: "price_1", unit_amount: amount, currency: "usd", recurring: { interval } } }] },
    ...rest,
  }
}

function main() {
  console.log("\nAccess")
  const cases: [string, { status: string; current_period_end: string | null; past_due_since: string | null }, boolean][] = [
    ["active", { status: "active", current_period_end: iso(NOW + DAY), past_due_since: null }, true],
    ["active with a period end in the past (a missed webhook) still active", { status: "active", current_period_end: iso(NOW - DAY), past_due_since: null }, true],
    ["trialing", { status: "trialing", current_period_end: iso(NOW + DAY), past_due_since: null }, true],
    ["cancelled, period still running", { status: "canceled", current_period_end: iso(NOW + 60_000), past_due_since: null }, true],
    ["cancelled, period over", { status: "canceled", current_period_end: iso(NOW - 60_000), past_due_since: null }, false],
    ["cancelled with no period end", { status: "canceled", current_period_end: null, past_due_since: null }, false],
    ["past due 6 days", { status: "past_due", current_period_end: iso(NOW), past_due_since: iso(NOW - 6 * DAY) }, true],
    ["past due 8 days", { status: "past_due", current_period_end: iso(NOW), past_due_since: iso(NOW - 8 * DAY) }, false],
    ["past due, start unknown", { status: "past_due", current_period_end: iso(NOW), past_due_since: null }, true],
    ["incomplete", { status: "incomplete", current_period_end: iso(NOW + DAY), past_due_since: null }, false],
    ["expired", { status: "expired", current_period_end: iso(NOW + DAY), past_due_since: null }, false],
    ["an unknown word", { status: "paused", current_period_end: iso(NOW + DAY), past_due_since: null }, false],
  ]
  for (const [label, m, want] of cases) check(`${label}: ${want ? "access" : "no access"}`, grantsAccess(m, NOW) === want)
  check("the grace is 7 days", PAST_DUE_GRACE_DAYS === 7)

  const sql = read("supabase/sql/run-now/75_memberships.sql")
  const fn = sql.split("\n").find((l) => l.includes("FUNCTION public.membership_grants_access")) ?? ""
  check("the SQL rule grants active and trialing", /WHEN p_status IN \('active', 'trialing'\) THEN true/.test(fn))
  check("the SQL rule grants cancelled until the period end", /WHEN p_status = 'canceled' THEN p_period_end IS NOT NULL AND p_period_end > p_at/.test(fn))
  check("the SQL rule grants past due for the same 7 days", /WHEN p_status = 'past_due' THEN p_past_due_since IS NULL OR p_past_due_since > p_at - interval '7 days'/.test(fn))
  check("and nothing else", /ELSE false END/.test(fn))

  console.log("\nFrom Stripe")
  check("a membership subscription is known by its metadata", isMembershipSubscription(sub()) && !isMembershipSubscription({ metadata: { creator_id: "c1", plan_id: "pro" } }))
  const map: [string, Partial<SubscriptionLike>, string][] = [
    ["incomplete", { status: "incomplete" }, "incomplete"],
    ["incomplete_expired", { status: "incomplete_expired" }, "expired"],
    ["trialing with a card", { status: "trialing" }, "trialing"],
    ["trialing, card not saved yet", { status: "trialing", default_payment_method: null, pending_setup_intent: "seti_1" }, "incomplete"],
    ["trialing, setup intent succeeded", { status: "trialing", default_payment_method: null, pending_setup_intent: { id: "seti_1", status: "succeeded" } }, "trialing"],
    ["trialing, set to cancel", { status: "trialing", cancel_at_period_end: true }, "canceled"],
    ["active", { status: "active" }, "active"],
    ["active, cancel at period end", { status: "active", cancel_at_period_end: true }, "canceled"],
    ["active, cancel_at set (newer API)", { status: "active", cancel_at: sec(NOW + 5 * DAY) }, "canceled"],
    ["past_due", { status: "past_due" }, "past_due"],
    ["unpaid", { status: "unpaid" }, "expired"],
    ["canceled", { status: "canceled" }, "expired"],
    ["paused", { status: "paused" }, "expired"],
  ]
  for (const [label, over, want] of map) check(`${label} is ${want}`, statusFromStripe(sub(over)) === want, statusFromStripe(sub(over)))

  const f = fieldsFromSubscription(sub({ interval: "year", amount: 9000 }), null, NOW)
  check("the period comes from the item (clover)", f.current_period_end === iso(sec(NOW + 30 * DAY) * 1000))
  const legacy = fieldsFromSubscription({ ...sub(), items: { data: [{ price: { id: "p", unit_amount: 500, currency: "usd", recurring: { interval: "month" } } }] }, current_period_end: sec(NOW + 3 * DAY) }, null, NOW)
  check("or from the subscription (older API versions)", legacy.current_period_end === iso(sec(NOW + 3 * DAY) * 1000))
  check("price, interval, card and customer are read", f.amount_cents === 9000 && f.billing_interval === "year" && f.card_last4 === "4242" && f.card_brand === "visa" && f.stripe_customer_id === "cus_fixture")
  check("access begins now: started_at is set", f.started_at === iso(NOW))
  const cancelAt = fieldsFromSubscription(sub({ cancel_at: sec(NOW + 9 * DAY) }), null, NOW)
  check("a scheduled end at cancel_at is the access end", cancelAt.status === "canceled" && cancelAt.current_period_end === iso(sec(NOW + 9 * DAY) * 1000) && cancelAt.cancel_at_period_end)

  console.log("\nThe webhook, step by step")
  /* Each step: what Stripe says now, applied to the row before it. */
  type Row = ReturnType<typeof fieldsFromSubscription>
  let row: Row | null = null
  const apply = (s: SubscriptionLike, at: number) => {
    const next = fieldsFromSubscription(s, row, at)
    const t = transitions(row, next, at)
    row = next
    return t
  }
  let t = apply(sub({ status: "incomplete", default_payment_method: null }), NOW)
  check("created, waiting for the first payment: nothing happens", t.length === 0 && row!.status === "incomplete" && row!.started_at === null, t)
  t = apply(sub(), NOW + 60_000)
  check("paid: welcome and the library rows", t.includes("started") && t.includes("access_on") && row!.status === "active", t)
  t = apply(sub(), NOW + 120_000)
  check("the same event again causes nothing", t.length === 0, t)
  t = apply(sub({ status: "past_due" }), NOW + 31 * DAY)
  const firstFailure = row!.past_due_since
  check("a renewal fails: past due, still with access", row!.status === "past_due" && t.length === 0 && grantsAccess(row!, NOW + 31 * DAY), t)
  apply(sub({ status: "past_due" }), NOW + 34 * DAY)
  check("a retry fails: the grace is still counted from the first failure", row!.past_due_since === firstFailure)
  t = apply(sub({ status: "past_due" }), NOW + 39 * DAY)
  check("8 days on, access has ended (time passing is not an event: the scheduled job and every sync take the library rows back)", !grantsAccess(row!, NOW + 39 * DAY) && t.length === 0, t)
  check("  every sync removes the library rows of a membership without access", /if \(!grantsAccess\(row\)\) await quietly\("removing included products"/.test(read("lib/memberships/sync.ts")))
  check("  and the scheduled job does for a past grace or a period that ran out", /\.eq\("status", "past_due"\)\.lt\("past_due_since"/.test(read("lib/memberships/reminders.ts")) && /\.eq\("status", "canceled"\)\.lt\("current_period_end"/.test(read("lib/memberships/reminders.ts")))
  t = apply(sub({ periodEnd: NOW + 70 * DAY }), NOW + 40 * DAY)
  check("the card is fixed and paid: active, access back, no second welcome", row!.status === "active" && row!.past_due_since === null && t.includes("access_on") && !t.includes("started"), t)
  t = apply(sub({ cancel_at_period_end: true, periodEnd: NOW + 70 * DAY }), NOW + 45 * DAY)
  check("cancelled: one cancel notice, access kept", t.includes("cancel_scheduled") && !t.includes("access_off") && grantsAccess(row!, NOW + 45 * DAY), t)
  t = apply(sub({ cancel_at_period_end: false, periodEnd: NOW + 70 * DAY }), NOW + 46 * DAY)
  check("resumed", t.includes("resumed") && row!.status === "active", t)
  apply(sub({ cancel_at_period_end: true, periodEnd: NOW + 70 * DAY }), NOW + 47 * DAY)
  t = apply(sub({ status: "canceled", cancel_at_period_end: true, ended_at: sec(NOW + 70 * DAY), periodEnd: NOW + 70 * DAY }), NOW + 70 * DAY + 1000)
  check("the period ends: expired, and the end notice once", row!.status === "expired" && t.filter((x) => x === "ended").length === 1 && !grantsAccess(row!, NOW + 70 * DAY + 1000), t)
  t = apply(sub({ status: "canceled", ended_at: sec(NOW + 70 * DAY), periodEnd: NOW + 70 * DAY }), NOW + 71 * DAY)
  check("deleted delivered again: nothing more", t.length === 0, t)

  /* An abandoned checkout: never started, so its end tells nobody. */
  row = null
  apply(sub({ status: "incomplete", default_payment_method: null }), NOW)
  t = apply(sub({ status: "incomplete_expired", default_payment_method: null }), NOW + DAY)
  check("a checkout that never paid expires without an email", !t.includes("ended") && !t.includes("started"), t)

  /* A trial: nothing until the card is saved, then welcome, then its first payment is not a second welcome. */
  row = null
  t = apply(sub({ status: "trialing", default_payment_method: null, pending_setup_intent: "seti_x", trial_end: sec(NOW + 7 * DAY) }), NOW)
  check("a trial without its card is not open", row!.status === "incomplete" && !t.includes("access_on"), t)
  t = apply(sub({ status: "trialing", trial_end: sec(NOW + 7 * DAY) }), NOW + 60_000)
  check("the card saved: the trial starts", row!.status === "trialing" && t.includes("started") && t.includes("access_on"), t)
  t = apply(sub({ status: "active" }), NOW + 7 * DAY)
  check("the trial converts: no second welcome, no access change", t.length === 0, t)

  console.log("\nThe fee")
  for (const plan of ["free", "growth", "pro"] as const) {
    let worst = 0
    let ok = true
    for (let amount = 100; amount <= 100_000; amount += amount < 2_000 ? 1 : 97) {
      const exact = computeApplicationFee({ unitAmount: amount, sellerPlan: plan })
      const pct = feePercentFor(amount, exact)
      const charged = feeFromPercent(amount, pct)
      const allowed = Math.max(1, Math.ceil(amount / 20_000))
      worst = Math.max(worst, Math.abs(charged - exact))
      if (Math.abs(charged - exact) > allowed || pct !== Math.round(pct * 100) / 100) ok = false
    }
    check(`${plan}: the percent charges the one time fee within Stripe's two decimal rounding (worst ${worst} cents)`, ok)
  }
  check("$9 on the free plan is 5% plus 25 cents", computeApplicationFee({ unitAmount: 900, sellerPlan: "free", currency: "USD" }) === 70 && feePercentFor(900, 70) === 7.78 && feeFromPercent(900, 7.78) === 70)
  check("$1 on the free plan: 11 cents (the small-order rate), no fixed part", feePercentFor(100, computeApplicationFee({ unitAmount: 100, sellerPlan: "free", currency: "USD" })) === 11)
  check("nothing charged, no fee", feePercentFor(0, 0) === 0 && feePercentFor(500, -3) === 0)
  /* Changed on purpose (currency round AM): in the plan's own currency, dollars when none was given (lib/money/product-currency PLAN_CURRENCY). */
  /* Changed on purpose (pricing: Grow $14, physical rates). */ /* A membership is digital. */
  check("the checkout takes the fee from the same calculator", /calculatePlatformFeeForCheckout\(amountCents, creatorId, admin, currency \|\| PLAN_CURRENCY, "digital"\)/.test(read("lib/memberships/billing.ts")))
  check("the subscription is paid to the creator with the fee kept", /transfer_data: \{ destination: p\.destination \}/.test(read("lib/memberships/billing.ts")) && /application_fee_percent: p\.feePercent/.test(read("lib/memberships/billing.ts")))
  check("a renewal's fee is set to exact cents while it is a draft", /invoice\.status !== "draft" \|\| invoice\.billing_reason !== "subscription_cycle"/.test(read("lib/memberships/webhook.ts")) && /application_fee_amount: fee\.cents/.test(read("lib/memberships/webhook.ts")))

  console.log("\nWords and numbers")
  check("prices read per interval", pricePer(900, "month") === "$9/month" && pricePer(9950, "year") === "$99.50/year")
  check("a year's saving against twelve months", yearlySaving(1000, 10000) === 16 && yearlySaving(1000, 12000) === 0 && yearlySaving(null, 100) === 0)
  check("reminders: 3 days for a month, 7 for a year", reminderLeadDays("month") === 3 && reminderLeadDays("year") === 7)
  check("monthly value: a year counts a twelfth, a cancelling member nothing", monthlyValue({ status: "active", billing_interval: "year", amount_cents: 12000 }) === 1000 && monthlyValue({ status: "canceled", billing_interval: "month", amount_cents: 900 }) === 0)
  const v = describeStatus({ status: "past_due", current_period_end: iso(NOW), past_due_since: iso(NOW - DAY), billing_interval: "month", amount_cents: 900, currency: "usd", trial_end: null }, NOW)
  check("a past due member is told the date to fix the card by", v.tone === "bad" && /Update your card by Oct 4, 2026/.test(v.line), v)
  const words = JSON.stringify(["active", "trialing", "canceled", "expired", "incomplete"].map((s) => describeStatus({ status: s, current_period_end: iso(NOW + DAY), past_due_since: null, billing_interval: "month", amount_cents: 900, currency: "usd", trial_end: iso(NOW + DAY) }, NOW)))
  check("no status line uses a dash or a banned word", !/[—–]|unlock|seamless|elevate/i.test(words))

  console.log("\nWhat a creator may save")
  check("dollars as typed", centsFromInput("9") === 900 && centsFromInput("$1,200.50") === 120050 && centsFromInput("") === null && Number.isNaN(centsFromInput("nine") as number))
  check("a draft saves without a price", checkPlan({ monthlyPrice: "", yearlyPrice: "" }, { publishing: false }).ok)
  check("on sale needs a price", !checkPlan({ monthlyPrice: "", yearlyPrice: "" }, { publishing: true }).ok)
  check("a price under $1 is refused", !checkPlan({ monthlyPrice: "0.50" }, { publishing: true }).ok)
  check("a trial over 90 days is refused", !checkPlan({ monthlyPrice: "9", trialDays: 120 }, { publishing: true }).ok)
  const plan = checkPlan({ monthlyPrice: "9", yearlyPrice: "90", trialDays: "7", benefits: [" Weekly lessons ", "", "A private chat"], includedProductIds: ["not-an-id", "4f0b1c4e-0e7a-4a8e-9b4c-0e1f2a3b4c5d", "4f0b1c4e-0e7a-4a8e-9b4c-0e1f2a3b4c5d"] }, { publishing: true })
  check("a plan is tidied: blank benefits out, ids checked and once", plan.ok && plan.value.benefits.length === 2 && plan.value.benefits[0] === "Weekly lessons" && plan.value.includedProductIds.length === 1 && plan.value.trialDays === 7, plan)
  const HOST = "abc.supabase.co"
  check("an empty update is refused", !checkPost({ title: "", body: "   " }, HOST).ok)
  const post = checkPost({ title: "Week 3", body: "Line one\r\nLine two\n\n\n\n\nNext", images: [{ url: "https://abc.supabase.co/storage/v1/object/public/product-images/x.jpg" }, { url: "https://evil.example/x.jpg" }, { url: "javascript:alert(1)" }], attachments: [{ assetId: "4f0b1c4e-0e7a-4a8e-9b4c-0e1f2a3b4c5d", name: "notes.pdf", size: 1200 }, { assetId: "../../etc" }] }, HOST)
  check("an update keeps its line breaks and only this project's pictures and real files", post.ok && post.value.body === "Line one\nLine two\n\n\nNext" && post.value.images.length === 1 && post.value.attachments.length === 1, post)
  check("the excerpt stops at a word", excerpt({ body: "word ".repeat(60) }, 40).endsWith("…") && excerpt({ body: "short" }) === "short")

  console.log("\nTelling the member")
  const ev = (name: DomainEvent["name"], key: string, payload: Record<string, unknown>): DomainEvent => ({ name, key, entityType: "membership", entityId: "m1", payload, occurredAt: iso(NOW), creatorId: "c1" })
  const ctx = { now: NOW, userId: null, creatorId: "c1" }
  const base = { buyerEmail: "Ana@Example.com", membershipId: "m1", membershipTitle: "Inner circle", creatorName: "Ana Lopez", amountCents: 900, currency: "usd", interval: "month", periodEnd: "2026-10-28T00:00:00Z" }
  for (const [name, type] of [
    ["membership.started", "MEMBERSHIP_STARTED"],
    ["membership.renewed", "MEMBERSHIP_RENEWED"],
    ["membership.renewal_upcoming", "MEMBERSHIP_RENEWAL_REMINDER"],
    ["membership.payment_failed", "MEMBERSHIP_PAYMENT_FAILED"],
    ["membership.canceled", "MEMBERSHIP_CANCELED"],
    ["membership.ended", "MEMBERSHIP_ENDED"],
  ] as const) {
    const planned = membershipWorkflow(ev(name, `k:${name}`, { ...base, invoiceId: name.includes("renewed") || name.includes("failed") ? "in_1:1" : undefined }), ctx)
    const job = planned?.jobs[0]
    check(`${name}: one ${type} to the member's address`, planned?.jobs.length === 1 && job?.type === type && job.recipientType === "customer" && job.recipientEmail === "ana@example.com" && !job.recipientUserId, job)
    const again = membershipWorkflow(ev(name, `k2:${name}`, { ...base, invoiceId: name.includes("renewed") || name.includes("failed") ? "in_1:1" : undefined }), ctx)
    check(`${name}: raised again, the same job key`, again?.jobs[0]?.idempotencyKey === job?.idempotencyKey)
    const entry = REGISTRY[type]
    check(`${type} is a required billing notice to a customer, email only`, entry.recipient === "customer" && entry.requirement === "required_service" && entry.channels.join() === "email")
    const e = renderEmail(type, { ...base, graceEndsAt: "2026-10-05T00:00:00Z", cardLast4: "4242", endsAt: "2026-10-28T00:00:00Z" }, { baseUrl: "https://storelib.com" })
    check(`${type} links to the membership page, never /app`, e.html.includes("https://storelib.com/account/library/memberships") && !/\/app\//.test(e.html) && !/[—–]/.test(e.text), e.subject)
  }
  const reminderA = membershipWorkflow(ev("membership.renewal_upcoming", "a", { ...base, periodEnd: "2026-10-28T00:00:00Z" }), ctx)?.jobs[0]
  const reminderB = membershipWorkflow(ev("membership.renewal_upcoming", "b", { ...base, periodEnd: "2026-11-28T00:00:00Z" }), ctx)?.jobs[0]
  check("each period gets its own renewal reminder", !!reminderA && !!reminderB && reminderA.idempotencyKey !== reminderB.idempotencyKey)
  check("no address, no job", membershipWorkflow(ev("membership.started", "x", { ...base, buyerEmail: "" }), ctx) === null)
  check("the reminders run from the scheduled job, once per period", /membership:\$\{row\.id\}:renewal:\$\{row\.current_period_end\}/.test(read("lib/memberships/reminders.ts")) && JSON.parse(read("vercel.json")).crons.some((c: { path: string }) => c.path === "/api/cron/memberships"))

  console.log("\nThe creator's update, by email")
  const mail = renderUpdateEmail({
    post: { id: "post1", product_id: "p1", creator_id: "c1", title: "Week 3 <notes>", body: "Hello members\n\nSee https://example.com", images: [{ url: "https://abc.supabase.co/storage/v1/object/public/product-images/a.jpg" }, { url: "https://abc.supabase.co/storage/v1/object/public/product-images/b.jpg" }], attachments: [{ assetId: "a1", name: "secret.pdf", size: 10 }] },
    membershipId: "m1",
    membershipTitle: "Inner circle",
    sender: { name: "Ana Lopez", brand: { ...DEFAULT_BRAND, name: "Ana Lopez" }, avatarUrl: "https://abc.supabase.co/storage/v1/object/public/avatars/ana.jpg" },
  })
  check("the title is escaped", mail.html.includes("Week 3 &lt;notes&gt;") && !mail.html.includes("<notes>"))
  check("one button to the post on the membership page", mail.html.includes("https://storelib.com/account/library/memberships/m1#post-post1"))
  check("files are named, never attached or linked", mail.html.includes("1 file attached") && !mail.html.includes("secret.pdf") && !mail.html.includes("/api/memberships/files"))
  check("the unsubscribe link turns off this membership's emails", mail.html.includes("/api/memberships/unsubscribe?t=") && mail.text.includes("/api/memberships/unsubscribe?t="))
  check("it says why it came", mail.html.includes("You are getting this because you are a member of Inner circle."))
  check("one picture of the creator: the photo, round, in the footer", (mail.html.match(/avatars\/ana\.jpg|ana\.jpg/g) ?? []).length >= 1 && !/sl-logo/.test(mail.html))
  const updates = read("lib/memberships/update-email.ts")
  check("sent with the one-click unsubscribe header", /"List-Unsubscribe-Post": "List-Unsubscribe=One-Click"/.test(updates))
  check("checked at send time: access, the member's choice, suppressions", /grantsAccess\(m\)/.test(updates) && /m\.email_updates/.test(updates) && /isSuppressed\(admin, m\.buyer_email, "optional_product"\)/.test(updates))
  check("each email claimed before it goes, so two runs never send one twice", /\.eq\("status", "pending"\)\s*\.select\("post_id"\)/.test(updates))

  console.log("\nSigned links and receipts")
  const tok = signToken("unsubscribe", "m1")
  check("a signed link names its membership", verifyToken("unsubscribe", tok) === "m1")
  check("a changed id or signature is refused", verifyToken("unsubscribe", tok.replace("m1", "m2")) === null && verifyToken("unsubscribe", `${tok}x`) === null && verifyToken("receipt", tok) === null)
  check("a payment's receipt token is the same for its invoice and differs between invoices", receiptTokenFor("in_1") === receiptTokenFor("in_1") && receiptTokenFor("in_1") !== receiptTokenFor("in_2") && /^m[A-Za-z0-9]{20,}$/.test(receiptTokenFor("in_1")))
  const viewer = { id: "u1", email: "ana@example.com", emailConfirmed: true }
  check("a member's own row, by account or by confirmed email", belongsTo({ buyer_id: "u1", buyer_email: "x@y.z" }, viewer) && belongsTo({ buyer_id: null, buyer_email: "ana@example.com" }, viewer))
  check("never someone else's, and never by an unconfirmed email", !belongsTo({ buyer_id: "u2", buyer_email: "ana@example.com" }, viewer) && !belongsTo({ buyer_id: null, buyer_email: "ana@example.com" }, { ...viewer, emailConfirmed: false }))
  check("the email filter is quoted and cannot add a condition", ownerFilter({ id: "u1", email: 'a",or(id.neq.0)@x.com', emailConfirmed: true }) === 'buyer_id.eq.u1,buyer_email.eq."aorid.neq.0@x.com"')

  console.log("\nThe wiring")
  const webhook = read("app/api/stripe/webhook/route.ts")
  const first = webhook.indexOf("handleMembershipEvent(supabaseAdmin, event)")
  check("the webhook asks memberships before the creator's plan handlers", first > 0 && first < webhook.indexOf('event.type === "customer.subscription.created"') && first < webhook.indexOf('event.type === "invoice.paid"'))
  const hook = read("lib/memberships/webhook.ts")
  check("every subscription and invoice event it needs", ["customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted", "invoice.paid", "invoice.payment_failed", "invoice.created"].every((e) => hook.includes(`"${e}"`)))
  check("Stripe is asked, not the event believed", /stripe\.subscriptions\.retrieve\(id/.test(read("lib/memberships/sync.ts")) && /syncSubscription\(admin, sub\.id\)/.test(hook))
  check("a payment is kept once per invoice, and its order once per receipt token", /onConflict: "stripe_invoice_id"/.test(read("lib/memberships/sync.ts")) && /receiptTokenFor\(invoice\.id\)/.test(read("lib/memberships/sync.ts")))
  const library = read("lib/memberships/library.ts")
  check("without access a member gets titles and dates only", /body: locked \? null : p\.body/.test(library) && /images: locked \? \[\] :/.test(library) && /attachments: locked \? \[\] :/.test(library))
  const files = read("app/api/memberships/files/[postId]/[assetId]/route.ts")
  check("files: signed in, a member with access now, named on the post, through the file checks", /requestViewer\(\)/.test(files) && /canReadMembership\(admin, viewer, post\.product_id\)/.test(files) && /gateDownload\(/.test(files) && /\.eq\("product_id", post\.product_id\)/.test(files))
  check("manage cancels at the period end, never at once", /cancel_at_period_end: true/.test(read("app/api/memberships/[id]/manage/route.ts")) && !/subscriptions\.cancel\(/.test(read("app/api/memberships/[id]/manage/route.ts")))
  check("the checkout will not charge a member twice", /code: "already_member"/.test(read("app/api/memberships/checkout/route.ts")))
  check("a free trial is for a first membership of the product only", /const hadTrial = rows\.some/.test(read("app/api/memberships/checkout/route.ts")))
  check("a refusal from Stripe is written for the admin", /reportError\(\{ source: "payments", where: "memberships checkout"/.test(read("app/api/memberships/checkout/route.ts")))
  check("the part turns row level security on for every membership table", ["membership_plans", "memberships", "membership_invoices", "membership_posts", "membership_post_reads", "membership_post_emails"].every((t) => sql.includes(`ALTER TABLE public.${t} ENABLE ROW LEVEL SECURITY;`)))
  check("members read posts through the one access rule", sql.includes("USING (deleted_at IS NULL AND public.membership_access(product_id))"))
  check("nobody but the server writes", sql.includes("REVOKE ALL ON public.membership_plans, public.memberships, public.membership_invoices, public.membership_posts, public.membership_post_reads, public.membership_post_emails FROM anon, authenticated;") && !/GRANT (INSERT|UPDATE|DELETE)/.test(sql))
  check("the Stripe price ids on a plan are not readable with the public key", /GRANT SELECT \(product_id, creator_id, monthly_price_cents, yearly_price_cents, trial_days, benefits, included_product_ids, currency, updated_at\) ON public\.membership_plans TO anon, authenticated;/.test(sql))
  check("the membership product type keeps every value it had", /replace\(def, 'ARRAY\[', 'ARRAY\[''membership''::text, '\)/.test(sql))
  const clientFiles = ["components/memberships/member-page.tsx", "components/memberships/post-view.tsx", "components/memberships/creator-screen.tsx", "components/memberships/creator-list.tsx", "app/(storelib)/checkout/membership-checkout.tsx"]
  check("no client screen imports server code", clientFiles.every((f) => !/from "@\/lib\/memberships\/(server|sync|access|library|billing|creator|webhook|update-email|reminders|viewer|product-page)"|next\/headers|server-only/.test(read(f))))
  const copy = [...clientFiles, "components/memberships/library-list.tsx", "lib/memberships/state.ts", "lib/notify/templates/catalog.ts"].map(read).join("\n")
  check("no em dash and none of the banned words in the membership copy", !/—/.test(copy) && !/\b(unlock|elevate|seamless|powerful|effortless(ly)?|supercharge)\b/i.test(copy.replace(/\/\*[\s\S]*?\*\//g, "")))

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) {
    for (const f of failures) console.log(`  - ${f}`)
    process.exit(1)
  }
}

main()
