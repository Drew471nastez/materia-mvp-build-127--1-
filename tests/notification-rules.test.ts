/**
 * ===========================================================================
 *  THE NOTIFICATION RULES, THE PLANNER AND THE ENGINE, ON FIXTURE DATA
 * ===========================================================================
 * "Very smart, running 24/7, which actually pushes, not spammy at all, only
 * what's actually important."
 *
 *   1. Every rule fires on the data that should make it fire, stays quiet on
 *      data that should not, and says "cannot tell" when its data is missing.
 *   2. The planner: each thing said once (dedupe key), resolved when fixed,
 *      old rows resolve on their own, cooldowns, the daily limit, one next
 *      step at a time, a digest when opportunities stack.
 *   3. The engine against a store that keeps the database's rules (a unique
 *      dedupe key, a leased claim, a pushed_at taken once): run twice, run
 *      twice at once, run beside a webhook, run out of time, run before the
 *      SQL. No duplicate row, no second push, nothing before the SQL.
 *   4. Push payloads: a short title and a fixed line, no money, no names, no
 *      addresses, a link inside /app.
 *   5. The words: no AI words, no em dashes.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"

import { dedupeKeyOf, planCreator } from "@/lib/notifications/plan"
import { applyPlan, evaluateCreator, KNOWN_KINDS, runNotificationEngine, type NewRow, type NotificationStore, type Pusher, type SnapshotSource } from "@/lib/notifications/engine"
import { COVERS_PAYMENT_SETUP, DIGEST_KIND, RULES, ruleOf } from "@/lib/notifications/rules"
import { stripeRequirementsDue, stripeRestricted, payoutFailed, disputeOpened, payoutsNotConnected, proPaymentFailed, verificationUnfinished, canTakePayments, isPaidProduct } from "@/lib/notifications/rules/payments"
import { domainHttps, domainNotConnected } from "@/lib/notifications/rules/domains"
import { campaignFailed, checkoutReminderOff, emailBounceRate, subscribersNotEmailed } from "@/lib/notifications/rules/email"
import { checkoutNotCompleting, couponExpiring, productMissingFile, productViewsNoSales, receiptNotDelivered } from "@/lib/notifications/rules/products"
import { setupNextStep, websiteNotPublished } from "@/lib/notifications/rules/setup"
import { firstReview, salesMilestone, subscribersMilestone } from "@/lib/notifications/rules/milestones"
import { featureLaunchRule } from "@/lib/notifications/rules/updates"
import { LAUNCHES } from "@/lib/notifications/launches"
import { DAILY_LIMIT, EMAILED_ELSEWHERE, PUSH_CATEGORIES } from "@/lib/notifications/policy"
import { PUSH_BODY, PUSH_TITLE_MAX, appPath, pushPayloadOf, type NotificationPush } from "@/lib/notifications/push"
import { recordOf, missingSchema } from "@/lib/notifications/supabase-store"
import { weekKey, clip, ordinal } from "@/lib/notifications/format"
import type { CreatorSnapshot, ExistingRow, Finding, PlannedRow, Rule } from "@/lib/notifications/types"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${label}`)
  } else {
    failed++
    const d = detail === undefined ? "" : `: ${typeof detail === "string" ? detail : JSON.stringify(detail)}`
    failures.push(label + d)
    console.log(`  FAIL  ${label}${d}`)
  }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

/* ─── Fixtures ──────────────────────────────────────────────────────── */

const DAY = 86_400_000
const HOUR = 3_600_000
const NOW = Date.parse("2026-09-25T12:00:00Z")
const ago = (days: number, from = NOW) => new Date(from - days * DAY).toISOString()
const ahead = (days: number) => new Date(NOW + days * DAY).toISOString()

function base(over: Partial<CreatorSnapshot> = {}): CreatorSnapshot {
  return {
    now: NOW,
    creator: {
      id: "c1",
      userId: "u1",
      createdAt: ago(120),
      stripeAccountId: "acct_1",
      chargesEnabled: true,
      payoutsEnabled: true,
      detailsSubmitted: true,
      hasAvatar: true,
      hasBio: true,
      timeZone: "Europe/Bucharest",
    },
    products: [{ id: "p1", title: "Lightroom presets", status: "published", type: "digital", createdAt: ago(60) }],
    deliverable: ["p1"],
    payouts: [],
    disputes: [],
    domains: [],
    failedCampaigns: [],
    lastCampaignSentAt: ago(3),
    emailHealth: { wentOut: 0, bounced: 0, complained: 0 },
    subscribers: { count: 10, countWeekAgo: 10 },
    sales: { times: [ago(40), ago(30)], first: { productTitle: "Lightroom presets", amountCents: 1200, currency: "usd" }, truncated: false },
    traffic: { views14: {}, orders14: {}, soldRecently: [] },
    checkout: { starts: 0, buyers: 0, orders: 0, soldBefore: true },
    recovery: { recoverable: 0, reminderOn: false, flowId: null },
    coupons: [],
    reviews: { firstRecent: null, olderExists: true },
    undelivered: [],
    ...over,
  }
}
const withCreator = (over: Partial<NonNullable<CreatorSnapshot["creator"]>>, rest: Partial<CreatorSnapshot> = {}) => base({ creator: { ...base().creator!, ...over }, ...rest })
const subjects = (f: Finding[] | undefined) => (f === undefined ? "unknown" : f.filter((x) => !x.baseline).map((x) => x.subject).join(","))

/* ─── 1. Each rule ─────────────────────────────────────────────────── */

console.log("\nCritical: Stripe")
{
  check("payouts off after setup: Stripe paused your payouts", stripeRestricted.evaluate(withCreator({ payoutsEnabled: false }))?.[0]?.title === "Stripe paused your payouts")
  check("card payments off: buyers cannot pay, and only that one is said", subjects(stripeRestricted.evaluate(withCreator({ payoutsEnabled: false, chargesEnabled: false }))) === "charges")
  check("all on: nothing", subjects(stripeRestricted.evaluate(base())) === "")
  check("never finished setting up: not critical (the panel's Set up payments says it)", subjects(stripeRestricted.evaluate(withCreator({ detailsSubmitted: false, payoutsEnabled: false }))) === "")
  check("no creator row: cannot tell", stripeRestricted.evaluate(base({ creator: undefined })) === undefined)
  const neverSold = { sales: { times: [] as string[], first: null, truncated: false } }
  check("payouts off on an account that never sold: Stripe finishing its checks, not a stop", subjects(stripeRestricted.evaluate(withCreator({ payoutsEnabled: false }, neverSold))) === "")
  check("unless Stripe says why (a webhook): then it is a stop", subjects(stripeRestricted.evaluate(withCreator({ payoutsEnabled: false }, { ...neverSold, stripeAccount: { chargesEnabled: true, payoutsEnabled: false, currentlyDue: [], pastDue: ["external_account"], currentDeadline: null, disabledReason: "requirements.past_due" } }))) === "payouts")
  check("and Stripe still verifying is never a stop", subjects(stripeRestricted.evaluate(withCreator({ payoutsEnabled: false }, { stripeAccount: { chargesEnabled: true, payoutsEnabled: false, currentlyDue: [], pastDue: [], currentDeadline: null, disabledReason: "requirements.pending_verification" } }))) === "")
  check("sales unknown and no word from Stripe: cannot tell", stripeRestricted.evaluate(withCreator({ payoutsEnabled: false }, { sales: undefined })) === undefined)
  check("the webhook's account wins over the stored row", subjects(stripeRestricted.evaluate(base({ stripeAccount: { chargesEnabled: true, payoutsEnabled: false, currentlyDue: [], pastDue: [], currentDeadline: null, disabledReason: null } }))) === "payouts")
  check("requirements: only a webhook can tell", stripeRequirementsDue.evaluate(base()) === undefined)
  const due = stripeRequirementsDue.evaluate(base({ stripeAccount: { chargesEnabled: true, payoutsEnabled: true, currentlyDue: ["external_account"], pastDue: [], currentDeadline: Date.parse("2026-10-03T12:00:00Z") / 1000, disabledReason: null } }))
  check("requirements due with a deadline, on the creator's clock", due?.[0]?.title === "Stripe needs more details by Oct 3", due?.[0]?.title)
  check("nothing while the account is still being set up, when Stripe lists everything as due", subjects(stripeRequirementsDue.evaluate(withCreator({ detailsSubmitted: false }, { stripeAccount: { chargesEnabled: true, payoutsEnabled: true, currentlyDue: ["individual.dob.day", "external_account"], pastDue: [], currentDeadline: null, disabledReason: null } }))) === "")
  check("and nothing once Stripe has what it needs",subjects(stripeRequirementsDue.evaluate(base({ stripeAccount: { chargesEnabled: true, payoutsEnabled: true, currentlyDue: [], pastDue: [], currentDeadline: null, disabledReason: null } }))) === "")
  check("and nothing when payouts are already off (one notification is enough)", subjects(stripeRequirementsDue.evaluate(base({ stripeAccount: { chargesEnabled: true, payoutsEnabled: false, currentlyDue: ["x"], pastDue: [], currentDeadline: null, disabledReason: null } }))) === "")
}

console.log("\nCritical: getting paid, as checkout decides it")
{
  /* "If the user needs to connect Stripe to get paid, or something is critical, it must appear in notifications." */
  const unsold = { sales: { times: [] as string[], first: null, truncated: false } }
  const never = withCreator({ stripeAccountId: null, chargesEnabled: null, payoutsEnabled: null, detailsSubmitted: null, onboardingStatus: "not_connected" }, unsold)
  const f = payoutsNotConnected.evaluate(never)
  check("a published product and Stripe never connected: critical, connect Stripe", f?.[0]?.subject === "connect" && f[0].title === "Connect Stripe to get paid", f)
  check("it names what is live and that buyers cannot check out", f?.[0]?.message === "Lightroom presets is live, but buyers cannot check out until Stripe is connected.", f?.[0]?.message)
  check("and goes to Payments, where Stripe is connected", f?.[0]?.href === "/app/settings/payments" && f[0].area === "Payments")
  const two = { ...never, products: [...never.products!, { id: "p2", title: "Portrait course", status: "published", type: "course", createdAt: ago(3) }] }
  check("two live: says how many", payoutsNotConnected.evaluate(two)?.[0]?.message.startsWith("Your 2 products are live,") === true)
  const started = withCreator({ stripeAccountId: "acct_9", chargesEnabled: false, payoutsEnabled: false, detailsSubmitted: false, onboardingStatus: "pending" }, unsold)
  const g = payoutsNotConnected.evaluate(started)
  check("connected but onboarding left unfinished: finish setting up Stripe", g?.[0]?.subject === "finish" && g[0].title === "Finish setting up Stripe to get paid", g)
  check("the switches on but onboarding not finished is still unfinished (checkout asks for connected)", subjects(payoutsNotConnected.evaluate(withCreator({ detailsSubmitted: false, onboardingStatus: "pending" }, unsold))) === "finish")
  const waiting = withCreator({ chargesEnabled: false, payoutsEnabled: false, detailsSubmitted: true, onboardingStatus: "pending" }, unsold)
  check("details in, never sold, Stripe has not switched it on: said, since buyers are turned away", payoutsNotConnected.evaluate(waiting)?.[0]?.title === "Stripe has not turned on payments yet")
  check("unless Stripe says it is checking them: a wait with nothing to do", subjects(payoutsNotConnected.evaluate({ ...waiting, stripeAccount: { chargesEnabled: false, payoutsEnabled: false, currentlyDue: [], pastDue: [], currentDeadline: null, disabledReason: "requirements.pending_verification" } })) === "")
  check("switched off on an account that sold: Stripe's own notification says it, not this one", subjects(payoutsNotConnected.evaluate(withCreator({ payoutsEnabled: false, onboardingStatus: "pending" }))) === "" && subjects(stripeRestricted.evaluate(withCreator({ payoutsEnabled: false, onboardingStatus: "pending" }))) === "payouts")
  check("and sales unknown there: cannot tell", payoutsNotConnected.evaluate(withCreator({ chargesEnabled: false, onboardingStatus: "pending" }, { sales: undefined })) === undefined)
  check("connected: nothing", subjects(payoutsNotConnected.evaluate(withCreator({ onboardingStatus: "connected" }))) === "" && subjects(payoutsNotConnected.evaluate(base())) === "")

  /* The owner, October 2026: identity verification is required, and an account left half set up is told so whether anything is published or not. */
  const halfDone = withCreator({ stripeAccountId: "acct_9", chargesEnabled: false, payoutsEnabled: false, detailsSubmitted: false, onboardingStatus: "pending" }, unsold)
  const v = verificationUnfinished.evaluate(halfDone)
  check("setup begun and the identity check never finished: critical, verify your identity", v?.[0]?.subject === "identity" && v[0].title === "Verify your identity to get paid", v)
  check("  it says what it costs them: no checkout, nothing to the bank", v?.[0]?.message.includes("buyers cannot check out") === true && v?.[0]?.href === "/app/payouts")
  check("  with nothing published either: still said, rather than found out on the first sale", subjects(verificationUnfinished.evaluate({ ...halfDone, products: [] })) === "identity")
  check("  nothing in the first day: people stop to find a passport and come back", subjects(verificationUnfinished.evaluate({ ...halfDone, creator: { ...halfDone.creator!, createdAt: ago(0) } })) === "")
  check("  nothing once Stripe has the details", subjects(verificationUnfinished.evaluate(withCreator({ detailsSubmitted: true }, unsold))) === "")
  check("  nothing while Stripe is checking what was sent", subjects(verificationUnfinished.evaluate({ ...halfDone, stripeAccount: { chargesEnabled: false, payoutsEnabled: false, currentlyDue: [], pastDue: [], currentDeadline: null, disabledReason: "requirements.pending_verification" } })) === "")
  check("  and nothing before setup is begun at all", subjects(verificationUnfinished.evaluate(never)) === "")
  check("only drafts: nothing yet, the panel's Set up payments says it", subjects(payoutsNotConnected.evaluate({ ...never, products: [{ id: "p1", title: "X", status: "draft", type: "digital", createdAt: ago(3) }] })) === "")
  check("only free products: nothing, they are handed over without Stripe", subjects(payoutsNotConnected.evaluate({ ...never, products: [{ id: "p1", title: "X", status: "published", type: "digital", createdAt: ago(3), priceCents: 0, payWhatYouWant: false }] })) === "")
  check("pay what you want at 0 needs Stripe", subjects(payoutsNotConnected.evaluate({ ...never, products: [{ id: "p1", title: "X", status: "published", type: "digital", createdAt: ago(3), priceCents: 0, payWhatYouWant: true }] })) === "connect")
  check("a price not read counts as paid", isPaidProduct({}) && isPaidProduct({ priceCents: null }) && !isPaidProduct({ priceCents: 0 }) && isPaidProduct({ priceCents: 900 }))
  check("products unreadable: cannot tell", payoutsNotConnected.evaluate({ ...never, products: undefined }) === undefined)
  check("checkout's own test: an acct_ id, nothing off, onboarding connected",
    canTakePayments({ ...base().creator!, onboardingStatus: "connected" }) && !canTakePayments({ ...base().creator!, onboardingStatus: "pending" })
      && !canTakePayments({ ...base().creator!, stripeAccountId: "junk", onboardingStatus: "connected" }) && canTakePayments(base().creator!)
      && !canTakePayments({ ...base().creator!, onboardingStatus: "connected" }, { chargesEnabled: false, payoutsEnabled: true, currentlyDue: [], pastDue: [], currentDeadline: null, disabledReason: null }))
  check("it covers the panel's own Set up payments to-do", (COVERS_PAYMENT_SETUP as readonly string[]).includes("payouts_not_connected"))

  const late = withCreator({ subscriptionPlan: "growth", subscriptionStatus: "past_due" })
  const pro = proPaymentFailed.evaluate(late)
  /* Changed on purpose (pricing round 5): either paid plan (Grow or Pro) can fail, so the title names neither. */
  check("the Pro plan's card declined: critical, with what it costs", pro?.[0]?.title === "Your plan payment did not go through" && pro[0].message === "Update your card in Billing. Until it is paid, your sales are charged Free plan fees." && pro[0].href === "/app/settings/billing", pro)
  check("unpaid too", subjects(proPaymentFailed.evaluate(withCreator({ subscriptionPlan: "pro", subscriptionStatus: "unpaid" }))) === "subscription")
  check("paid again, or back on Free: nothing", subjects(proPaymentFailed.evaluate(withCreator({ subscriptionPlan: "growth", subscriptionStatus: "active" }))) === "" && subjects(proPaymentFailed.evaluate(withCreator({ subscriptionPlan: "free", subscriptionStatus: "past_due" }))) === "")
  check("plan not read: cannot tell", proPaymentFailed.evaluate(base()) === undefined)
}

console.log("\nCritical: payouts and disputes")
{
  const failedPayout = { id: "po_1", status: "failed", amountCents: 18420, currency: "usd", createdAt: ago(2), failureCode: "invalid_account_number" }
  const f = payoutFailed.evaluate(base({ payouts: [failedPayout] }))
  check("a payout that failed two days ago", f?.[0]?.title === "A payout of $184.20 failed", f?.[0]?.title)
  check("says why in plain words, not Stripe's text", f?.[0]?.message.startsWith("The account number is not right.") === true, f?.[0]?.message)
  check("once ever for that payout", f?.[0]?.period === "")
  check("a later payout that went through fixes it", subjects(payoutFailed.evaluate(base({ payouts: [failedPayout, { ...failedPayout, id: "po_2", status: "paid", createdAt: ago(1) }] }))) === "")
  check("three weeks old: no longer news", subjects(payoutFailed.evaluate(base({ payouts: [{ ...failedPayout, createdAt: ago(20) }] }))) === "")
  check("an unknown code still reads plainly", payoutFailed.evaluate(base({ payouts: [{ ...failedPayout, failureCode: "zzz" }] }))?.[0]?.message.startsWith("The bank sent it back.") === true)
  check("payouts unreadable: cannot tell", payoutFailed.evaluate(base({ payouts: undefined })) === undefined)
  const d = disputeOpened.evaluate(base({ disputes: [{ id: "dp_1", amountCents: 2400, currency: "usd", openedAt: ago(1), closed: false }] }))
  check("an open dispute", d?.[0]?.title === "A buyer disputed a $24.00 payment", d?.[0]?.title)
  check("a closed one is not", subjects(disputeOpened.evaluate(base({ disputes: [{ id: "dp_1", amountCents: 2400, currency: "usd", openedAt: ago(1), closed: true }] }))) === "")
}

console.log("\nCritical and problem: domains")
{
  const dom = { id: "d1", domain: "shop.example.com", status: "ssl_provisioning", sslStatus: "provisioning", verifiedAt: ago(30 / 24), createdAt: ago(3), updatedAt: ago(1) }
  check("verified 30 hours ago and still no HTTPS", domainHttps.evaluate(base({ domains: [dom] }))?.[0]?.title === "HTTPS is not working on shop.example.com")
  check("verified 2 hours ago: still in its normal wait", subjects(domainHttps.evaluate(base({ domains: [{ ...dom, verifiedAt: ago(2 / 24) }] }))) === "")
  check("a failed certificate, at once", subjects(domainHttps.evaluate(base({ domains: [{ ...dom, status: "active", sslStatus: "failed" }] }))) === "d1")
  check("active: nothing", subjects(domainHttps.evaluate(base({ domains: [{ ...dom, status: "active", sslStatus: "active" }] }))) === "")
  const pending = { ...dom, status: "pending", sslStatus: "pending", verifiedAt: null, createdAt: ago(3) }
  check("added three days ago and never verified: a problem", domainNotConnected.evaluate(base({ domains: [pending] }))?.[0]?.title === "shop.example.com is not connected yet")
  check("added yesterday: give it time", subjects(domainNotConnected.evaluate(base({ domains: [{ ...pending, createdAt: ago(1) }] }))) === "")
  const broke = { ...dom, status: "pending", sslStatus: "active", verifiedAt: ago(60), createdAt: ago(60) }
  check("connected once, its records gone since: not connected any more", domainNotConnected.evaluate(base({ domains: [broke] }))?.[0]?.title === "shop.example.com is not connected any more")
  check("but not for the seconds a check in Settings says verifying", subjects(domainNotConnected.evaluate(base({ domains: [{ ...broke, status: "verifying" }] }))) === "")
  check("a status nobody listed is still not connected", subjects(domainNotConnected.evaluate(base({ domains: [{ ...pending, status: "error" }] }))) === "d1")
  check("waiting on HTTPS: domain_https's to say, once", subjects(domainNotConnected.evaluate(base({ domains: [dom] }))) === "" && subjects(domainHttps.evaluate(base({ domains: [dom] }))) === "d1")
  check("live, or on its way to HTTPS: nothing", subjects(domainNotConnected.evaluate(base({ domains: [{ ...dom, status: "active", sslStatus: "active" }, { ...dom, id: "d2", verifiedAt: ago(0.1) }] }))) === "")
}

console.log("\nEmail")
{
  check("6% of 200 bounced: at risk", emailBounceRate.evaluate(base({ emailHealth: { wentOut: 200, bounced: 10, complained: 2 } }))?.[0]?.title === "6% of your recent emails bounced")
  check("2% is not", subjects(emailBounceRate.evaluate(base({ emailHealth: { wentOut: 200, bounced: 4, complained: 0 } }))) === "")
  check("50 sent is too few to judge", subjects(emailBounceRate.evaluate(base({ emailHealth: { wentOut: 50, bounced: 10, complained: 0 } }))) === "")
  const camp = { id: "e1", subject: "Autumn sale starts Friday", status: "failed", scheduledAt: ago(1), createdAt: ago(2) }
  check("a scheduled email that failed", campaignFailed.evaluate(base({ failedCampaigns: [camp] }))?.[0]?.title === "“Autumn sale starts Friday” did not send")
  check("one that reached part of the list", campaignFailed.evaluate(base({ failedCampaigns: [{ ...camp, status: "partially_failed" }] }))?.[0]?.title === "“Autumn sale starts Friday” reached only part of your list")
  check("and it opens that email", campaignFailed.evaluate(base({ failedCampaigns: [camp] }))?.[0]?.href === "/app/emails?email=e1")
  const quiet = subscribersNotEmailed.evaluate(base({ subscribers: { count: 240, countWeekAgo: 238 }, lastCampaignSentAt: ago(45) }))
  check("240 subscribers, last email 45 days ago", quiet?.[0]?.title === "240 subscribers have not heard from you in 45 days", quiet?.[0]?.title)
  check("never emailed", subscribersNotEmailed.evaluate(base({ subscribers: { count: 30, countWeekAgo: 30 }, lastCampaignSentAt: null }))?.[0]?.title === "30 subscribers and no email sent yet")
  check("nothing in the 400 days read, on an older account: not 'never', which may not be true", subscribersNotEmailed.evaluate(withCreator({ createdAt: ago(900) }, { subscribers: { count: 30, countWeekAgo: 30 }, lastCampaignSentAt: null }))?.[0]?.title === "30 subscribers and no email in over a year")
  check("emailed last week: nothing", subjects(subscribersNotEmailed.evaluate(base({ subscribers: { count: 240, countWeekAgo: 238 }, lastCampaignSentAt: ago(6) }))) === "")
  check("a small list: nothing", subjects(subscribersNotEmailed.evaluate(base({ subscribers: { count: 12, countWeekAgo: 12 }, lastCampaignSentAt: null }))) === "")
  check("a new account: nothing yet", subjects(subscribersNotEmailed.evaluate(withCreator({ createdAt: ago(10) }, { subscribers: { count: 60, countWeekAgo: 60 }, lastCampaignSentAt: null }))) === "")
  check("unknown last send: cannot tell", subscribersNotEmailed.evaluate(base({ lastCampaignSentAt: undefined })) === undefined)
  const rec = checkoutReminderOff.evaluate(base({ recovery: { recoverable: 4, reminderOn: false, flowId: null } }))
  check("4 people who agreed to emails left checkout, reminder off", rec?.[0]?.title === "4 buyers left checkout this week" && rec?.[0]?.href === "/app/emails/flow/new")
  check("a reminder made and paused opens that one", checkoutReminderOff.evaluate(base({ recovery: { recoverable: 4, reminderOn: false, flowId: "f9" } }))?.[0]?.href === "/app/emails/flow/f9")
  check("reminder on: nothing", subjects(checkoutReminderOff.evaluate(base({ recovery: { recoverable: 9, reminderOn: true, flowId: null } }))) === "")
  check("two people: nothing", subjects(checkoutReminderOff.evaluate(base({ recovery: { recoverable: 2, reminderOn: false, flowId: null } }))) === "")
}

console.log("\nProducts and checkout")
{
  check("a published digital product with no file", productMissingFile.evaluate(base({ deliverable: [] }))?.[0]?.title === "Lightroom presets has no file to deliver")
  check("with its file: nothing", subjects(productMissingFile.evaluate(base())) === "")
  check("a draft: nothing", subjects(productMissingFile.evaluate(base({ deliverable: [], products: [{ id: "p1", title: "X", status: "draft", type: "digital", createdAt: ago(9) }] }))) === "")
  check("a course has no file to have: nothing", subjects(productMissingFile.evaluate(base({ deliverable: [], products: [{ id: "p1", title: "X", status: "published", type: "course", createdAt: ago(9) }] }))) === "")
  check("published a moment ago: its file may still be uploading", subjects(productMissingFile.evaluate(base({ deliverable: [], products: [{ id: "p1", title: "X", status: "published", type: "digital", createdAt: ago(1 / 24) }] }))) === "")
  check("files unreadable: cannot tell", productMissingFile.evaluate(base({ deliverable: undefined })) === undefined)
  const r = receiptNotDelivered.evaluate(base({ undelivered: [{ orderId: "o1", createdAt: ago(1), productTitle: "Lightroom presets" }] }))
  check("a receipt that did not reach a buyer, linked to its order", r?.[0]?.title === "A receipt for Lightroom presets did not reach the buyer" && r?.[0]?.href === "/app/orders?order=o1", r?.[0])
  check("older than a week: the buyer has written in by now", subjects(receiptNotDelivered.evaluate(base({ undelivered: [{ orderId: "o1", createdAt: ago(9), productTitle: null }] }))) === "")
  check("4 buyers reached Pay, no order, a store that sells", checkoutNotCompleting.evaluate(base({ checkout: { starts: 6, buyers: 4, orders: 0, soldBefore: true } }))?.[0]?.title === "4 buyers reached Pay in the last day and none finished")
  check("one order came through: nothing", subjects(checkoutNotCompleting.evaluate(base({ checkout: { starts: 6, buyers: 4, orders: 1, soldBefore: true } }))) === "")
  check("a store that has never sold: nothing", subjects(checkoutNotCompleting.evaluate(base({ checkout: { starts: 6, buyers: 4, orders: 0, soldBefore: false } }))) === "")
  check("card payments off: Stripe's own notification says it", subjects(checkoutNotCompleting.evaluate(withCreator({ chargesEnabled: false }, { checkout: { starts: 6, buyers: 4, orders: 0, soldBefore: true } }))) === "")
  const traffic = { views14: { p1: 212 }, orders14: { p1: 0 }, soldRecently: [] as string[] }
  check("212 views, no sales in 14 days", productViewsNoSales.evaluate(base({ traffic }))?.[0]?.title === "Lightroom presets: 212 views and no sales in 14 days")
  check("a sale yesterday the rollups have not counted: nothing", subjects(productViewsNoSales.evaluate(base({ traffic: { ...traffic, soldRecently: ["p1"] } }))) === "")
  check("a product ten days old: too soon to say", subjects(productViewsNoSales.evaluate(base({ traffic, products: [{ id: "p1", title: "X", status: "published", type: "digital", createdAt: ago(10) }] }))) === "")
  check("20 views: not enough to say", subjects(productViewsNoSales.evaluate(base({ traffic: { ...traffic, views14: { p1: 20 } } }))) === "")
  const coupon = { id: "k1", code: "AUTUMN10", expiresAt: ahead(2), usageCount: 14, usageLimit: null }
  const k = couponExpiring.evaluate(base({ coupons: [coupon] }))
  check("a coupon in use ends in two days", k?.[0]?.title === "AUTUMN10 ends on Sep 27" && k?.[0]?.message === "Used 14 times. Extend it if it is still bringing in sales.", k?.[0])
  check("unused: nothing", subjects(couponExpiring.evaluate(base({ coupons: [{ ...coupon, usageCount: 0 }] }))) === "")
  check("used up: nothing", subjects(couponExpiring.evaluate(base({ coupons: [{ ...coupon, usageLimit: 14 }] }))) === "")
  check("extended, it is a new ending (the date is in the key)", k?.[0]?.period === coupon.expiresAt.slice(0, 10))
}

console.log("\nNext steps")
{
  const fresh = withCreator({ createdAt: ago(2), hasAvatar: false, hasBio: false }, { products: [], sales: { times: [], first: null, truncated: false } })
  check("no product after a day: add your first product", setupNextStep.evaluate(fresh)?.[0]?.title === "Add your first product")
  check("in the first hours: nothing yet", subjects(setupNextStep.evaluate(withCreator({ createdAt: ago(0.3) }, { products: [] }))) === "")
  const live = withCreator({ createdAt: ago(20), hasAvatar: false }, { products: [{ id: "p1", title: "X", status: "published", type: "digital", createdAt: ago(10) }], sales: { times: [], first: null, truncated: false } })
  check("live products, payouts on, no sale in a week: share, then the photo", subjects(setupNextStep.evaluate(live)) === "sale,branding")
  check("the photo step names what is missing", setupNextStep.evaluate(live)?.[1]?.title === "Add a profile photo")
  check("sales unknown: never tells a seller to get a first sale", subjects(setupNextStep.evaluate({ ...live, sales: undefined })) === "branding")
  const draft = base({ website: { live: false, unpublished: false, draftSince: ago(3) } })
  const w = websiteNotPublished.evaluate(draft)
  check("a website started in the builder three days ago and never published", w?.[0]?.title === "Your website is not live yet" && w[0].href === "/app/website-builder" && w[0].area === "Website", w)
  check("started yesterday: give it time", subjects(websiteNotPublished.evaluate(base({ website: { live: false, unpublished: false, draftSince: ago(1) } }))) === "")
  check("live, or taken down on purpose, or never started: nothing", ["live", "unpublished", "none"].every((k) => subjects(websiteNotPublished.evaluate(base({ website: { live: k === "live", unpublished: k === "unpublished", draftSince: k === "none" ? null : ago(9) } }))) === ""))
  check("the builder unreadable: cannot tell", websiteNotPublished.evaluate(base()) === undefined)
}

console.log("\nMilestones")
{
  const first = salesMilestone.evaluate(base({ sales: { times: [ago(0.1)], first: { productTitle: "Lightroom presets", amountCents: 1200, currency: "usd" }, truncated: false } }))
  check("the first sale, today", first?.[0]?.title === "Your first sale" && first?.[0]?.message === "Lightroom presets sold for $12.00.", first?.[0])
  const ten = Array.from({ length: 10 }, (_, i) => ago(30 - i * 3))
  ten[9] = ago(1)
  const tenth = salesMilestone.evaluate(base({ sales: { times: ten, first: null, truncated: false } }))
  check("the 10th sale, yesterday; the 1st long past is a quiet baseline", subjects(tenth) === "sales_10" && tenth?.some((f) => f.subject === "sales_1" && f.baseline) === true, tenth)
  check("its words", tenth?.find((f) => f.subject === "sales_10")?.title === "Your 10th sale")
  const long = salesMilestone.evaluate(base({ sales: { times: [], first: null, truncated: true } }))
  check("a store read past its cap: all three long past, all quiet", long?.length === 3 && long.every((f) => f.baseline))
  check("the first review, two days ago", firstReview.evaluate(base({ reviews: { firstRecent: { id: "r1", at: ago(2), rating: 5, productId: "p1", productTitle: "Lightroom presets" }, olderExists: false } }))?.[0]?.message === "5 stars on Lightroom presets.")
  check("an older review exists: that was the first, quietly", firstReview.evaluate(base({ reviews: { firstRecent: { id: "r1", at: ago(2), rating: 5, productId: "p1", productTitle: "X" }, olderExists: true } }))?.every((f) => f.baseline) === true)
  check("50 subscribers this week", subscribersMilestone.evaluate(base({ subscribers: { count: 52, countWeekAgo: 45 } }))?.[0]?.title === "50 subscribers")
  check("passed 50 long ago: quiet", subscribersMilestone.evaluate(base({ subscribers: { count: 60, countWeekAgo: 55 } }))?.every((f) => f.baseline) === true)
}

console.log("\nUpdates: real launches only, once, to accounts that existed before")
{
  const launches = [{ id: "2026-09-bundles", live: "2026-09-20", title: "Sell products together as a bundle", message: "Pick two or more products, set one price, and buyers get every file.", href: "/app/products/new" as const, audience: (s: CreatorSnapshot) => (s.products?.length ?? 0) >= 1 }]
  const rule = featureLaunchRule(launches)
  check("an account from before the launch hears about it", rule.evaluate(base())?.[0]?.title === "Sell products together as a bundle")
  check("an account made after it went live does not", subjects(rule.evaluate(withCreator({ createdAt: "2026-09-22T00:00:00Z" }))) === "")
  check("nor anyone after two weeks", subjects(featureLaunchRule([{ ...launches[0], live: "2026-09-01" }]).evaluate(base())) === "")
  check("nor anyone it is not for", subjects(rule.evaluate(base({ products: [] }))) === "")
  check("once ever per account", rule.evaluate(base())?.[0]?.period === "")
  for (const l of LAUNCHES) {
    check(`launch ${l.id}: a date, a link inside /app, plain words`, /^\d{4}-\d{2}-\d{2}$/.test(l.live) && appPath(l.href) === l.href && plain(`${l.title} ${l.message}`))
  }
  check("launches are the only source of update notifications", RULES.filter((r) => r.category === "update").map((r) => r.kind).join() === "feature_launch")
}

/* ─── 2. The planner ───────────────────────────────────────────────── */

let rowSeq = 0
function row(over: Partial<ExistingRow> & { kind: string; subject_id: string }): ExistingRow {
  return {
    id: `r${++rowSeq}`,
    creator_id: "c1",
    category: ruleOf(over.kind)?.category ?? "opportunity",
    dedupe_key: `${over.kind}:${over.subject_id}:old`,
    created_at: ago(1),
    read_at: null,
    dismissed_at: null,
    resolved_at: null,
    pushed_at: null,
    metadata: {},
    ...over,
  }
}
const plan = (snapshot: CreatorSnapshot, existing: ExistingRow[] = [], rules: readonly Rule[] = RULES, complete = true) => planCreator({ rules, snapshot, existing, now: snapshot.now, complete, knownKinds: KNOWN_KINDS })
const kinds = (rows: PlannedRow[]) => rows.map((r) => `${r.kind}:${r.subject}`).join(",")
const visibleInserts = (p: ReturnType<typeof plan>) => p.inserts.filter((r) => !r.baseline && !r.foldedInto)

console.log("\nThe planner: said once, resolved when fixed")
{
  const paused = withCreator({ payoutsEnabled: false })
  const p1 = plan(paused)
  check("payouts paused becomes one critical row, pushed", kinds(visibleInserts(p1)) === "stripe_restricted:payouts" && visibleInserts(p1)[0].push === true)
  const key = dedupeKeyOf("stripe_restricted", { subject: "payouts" }, NOW)
  check("its dedupe key is kind, subject and day", key === "stripe_restricted:payouts:2026-09-25", key)
  const open = row({ kind: "stripe_restricted", subject_id: "payouts", dedupe_key: "stripe_restricted:payouts:2026-09-24", created_at: ago(1) })
  check("the same key already written: nothing", visibleInserts(plan(paused, [row({ kind: "stripe_restricted", subject_id: "payouts", dedupe_key: key })])).length === 0)
  check("an open row from yesterday: nothing new today", visibleInserts(plan(paused, [open])).length === 0)
  const fixed = plan(base(), [open])
  check("payouts back on: the open row resolves", fixed.resolve.includes(open.id) && visibleInserts(fixed).length === 0)
  check("a creator row that cannot be read resolves nothing", plan(base({ creator: undefined }), [open]).resolve.length === 0)
  const back = plan(paused, [{ ...open, resolved_at: ago(0.5), created_at: ago(3), dedupe_key: "stripe_restricted:payouts:2026-09-22" }])
  check("paused again after it was fixed: said again (a critical cooldown is one day)", kinds(visibleInserts(back)) === "stripe_restricted:payouts")
  const soon = plan(paused, [{ ...open, resolved_at: ago(0.1), created_at: ago(0.5), dedupe_key: "stripe_restricted:payouts:2026-09-25x" }])
  check("but not within the day it was last said", visibleInserts(soon).length === 0)
  const stale = row({ kind: "coupon_expiring", subject_id: "k1", created_at: ago(5) })
  check("an old opportunity resolves on its own (ttl)", plan(base(), [stale]).resolve.includes(stale.id))
  const retired = row({ kind: "a_rule_that_was_removed", subject_id: "x" })
  check("a row of a rule that no longer exists is retired by a full run", plan(base(), [retired]).resolve.includes(retired.id))
  check("but never by an event, which asked only its own rules", !plan(base(), [retired], [payoutFailed], false).resolve.includes(retired.id))
  const otherKind = row({ kind: "stripe_restricted", subject_id: "payouts" })
  check("an event asking about payouts leaves Stripe's row alone", !plan(base(), [otherKind], [payoutFailed], false).resolve.includes(otherKind.id))
  const milestone = row({ kind: "sales_milestone", subject_id: "sales_1", dedupe_key: "sales_milestone:sales_1:", created_at: ago(2), category: "milestone" })
  check("a milestone does not resolve because it stopped being news", !plan(base(), [milestone]).resolve.includes(milestone.id))
  check("and is never said twice", !kinds(plan(base({ sales: { times: [ago(1)], first: null, truncated: false } }), [milestone]).inserts).includes("sales_1"))
}

console.log("\nThe planner: getting paid, said once and gone when fixed")
{
  const unsold = { sales: { times: [] as string[], first: null, truncated: false } }
  const never = withCreator({ stripeAccountId: null, chargesEnabled: null, payoutsEnabled: null, detailsSubmitted: null, onboardingStatus: "not_connected" }, unsold)
  const started = withCreator({ stripeAccountId: "acct_9", chargesEnabled: false, payoutsEnabled: false, detailsSubmitted: false, onboardingStatus: "pending" }, unsold)
  const p1 = plan(never)
  check("becomes one critical row, pushed, never held back by the daily limit", kinds(visibleInserts(p1)).includes("payouts_not_connected:connect") && visibleInserts(p1).find((r) => r.kind === "payouts_not_connected")?.push === true && ruleOf("payouts_not_connected")?.category === "critical")
  const open = row({ kind: "payouts_not_connected", subject_id: "connect", created_at: ago(3), dedupe_key: "payouts_not_connected:connect:2026-09-22", read_at: ago(2) })
  check("still not connected days later, its row open and read: not said again", !kinds(visibleInserts(plan(never, [open]))).includes("payouts_not_connected"))
  check("connected: the row resolves itself", plan(withCreator({ onboardingStatus: "connected" }), [open]).resolve.includes(open.id))
  check("connecting but not finishing: the connect row resolves and finish is said", plan(started, [open]).resolve.includes(open.id) && kinds(visibleInserts(plan(started, [open]))).includes("payouts_not_connected:finish"))
  const today = [1, 2, 3].map((i) => row({ kind: "product_missing_file", subject_id: `x${i}`, category: "problem", created_at: ago(0.1) }))
  check("the daily limit already spent on problems: still said, it is critical", kinds(visibleInserts(plan(never, today))).includes("payouts_not_connected:connect"))
  const w = withCreator({ hasAvatar: false }, { website: { live: false, unpublished: false, draftSince: ago(4) } })
  const step = row({ kind: "setup_next_step", subject_id: "branding", category: "next_step", created_at: ago(3) })
  const alone = kinds(visibleInserts(plan(w))).split(",").filter((k) => k.startsWith("setup_next_step") || k.startsWith("website_not_published"))
  check("the website step and the photo both due: one next step is said, the rest wait", alone.length === 1, alone)
  check("the website step waits while another next step is open: one at a time", kinds(visibleInserts(plan(base({ website: w.website })))).includes("website_not_published:website") && !kinds(visibleInserts(plan(w, [step]))).includes("website_not_published"))
}

console.log("\nEvery rule: fires, is said once, and resolves when fixed (a milestone stays)")
{
  const noStripe = { chargesEnabled: true, payoutsEnabled: true, currentlyDue: [] as string[], pastDue: [] as string[], currentDeadline: null, disabledReason: null }
  const cases: Array<[Rule, CreatorSnapshot, CreatorSnapshot]> = [
    [stripeRestricted, withCreator({ payoutsEnabled: false }), base()],
    [stripeRequirementsDue, base({ stripeAccount: { ...noStripe, currentlyDue: ["external_account"] } }), base({ stripeAccount: noStripe })],
    [payoutFailed, base({ payouts: [{ id: "po_1", status: "failed", amountCents: 900, currency: "usd", createdAt: ago(1), failureCode: null }] }), base({ payouts: [] })],
    [disputeOpened, base({ disputes: [{ id: "dp_1", amountCents: 900, currency: "usd", openedAt: ago(1), closed: false }] }), base({ disputes: [{ id: "dp_1", amountCents: 900, currency: "usd", openedAt: ago(1), closed: true }] })],
    [domainHttps, base({ domains: [{ id: "d1", domain: "a.example", status: "active", sslStatus: "failed", verifiedAt: ago(9), createdAt: ago(9), updatedAt: ago(1) }] }), base({ domains: [{ id: "d1", domain: "a.example", status: "active", sslStatus: "active", verifiedAt: ago(9), createdAt: ago(9), updatedAt: ago(0) }] })],
    [domainNotConnected, base({ domains: [{ id: "d1", domain: "a.example", status: "pending", sslStatus: "pending", verifiedAt: null, createdAt: ago(3), updatedAt: ago(3) }] }), base({ domains: [] })],
    [domainNotConnected, base({ domains: [{ id: "d1", domain: "a.example", status: "pending", sslStatus: "active", verifiedAt: ago(30), createdAt: ago(30), updatedAt: ago(1) }] }), base({ domains: [{ id: "d1", domain: "a.example", status: "active", sslStatus: "active", verifiedAt: ago(30), createdAt: ago(30), updatedAt: ago(0) }] })],
    [emailBounceRate, base({ emailHealth: { wentOut: 400, bounced: 30, complained: 0 } }), base({ emailHealth: { wentOut: 400, bounced: 2, complained: 0 } })],
    [productMissingFile, base({ deliverable: [] }), base()],
    [checkoutNotCompleting, base({ checkout: { starts: 5, buyers: 4, orders: 0, soldBefore: true } }), base({ checkout: { starts: 5, buyers: 4, orders: 2, soldBefore: true } })],
    [receiptNotDelivered, base({ undelivered: [{ orderId: "o1", createdAt: ago(1), productTitle: "Lightroom presets" }] }), base({ undelivered: [] })],
    [campaignFailed, base({ failedCampaigns: [{ id: "e1", subject: "Hi", status: "failed", scheduledAt: ago(1), createdAt: ago(2) }] }), base({ failedCampaigns: [] })],
    [setupNextStep, withCreator({ createdAt: ago(2) }, { products: [] }), withCreator({ createdAt: ago(2) })],
    [payoutsNotConnected, withCreator({ stripeAccountId: null, onboardingStatus: "not_connected" }), withCreator({ onboardingStatus: "connected" })],
    [verificationUnfinished, withCreator({ detailsSubmitted: false, chargesEnabled: false, payoutsEnabled: false, onboardingStatus: "pending" }), withCreator({ onboardingStatus: "connected" })],
    [proPaymentFailed, withCreator({ subscriptionPlan: "growth", subscriptionStatus: "past_due" }), withCreator({ subscriptionPlan: "growth", subscriptionStatus: "active" })],
    [websiteNotPublished, base({ website: { live: false, unpublished: false, draftSince: ago(4) } }), base({ website: { live: true, unpublished: false, draftSince: ago(4) } })],
    [checkoutReminderOff, base({ recovery: { recoverable: 4, reminderOn: false, flowId: null } }), base({ recovery: { recoverable: 4, reminderOn: true, flowId: null } })],
    [productViewsNoSales, base({ traffic: { views14: { p1: 90 }, orders14: {}, soldRecently: [] } }), base({ traffic: { views14: { p1: 90 }, orders14: { p1: 1 }, soldRecently: [] } })],
    [subscribersNotEmailed, base({ subscribers: { count: 80, countWeekAgo: 80 }, lastCampaignSentAt: ago(40) }), base({ subscribers: { count: 80, countWeekAgo: 80 }, lastCampaignSentAt: ago(1) })],
    [couponExpiring, base({ coupons: [{ id: "k1", code: "HI", expiresAt: ahead(1), usageCount: 2, usageLimit: null }] }), base({ coupons: [] })],
    [salesMilestone, base({ sales: { times: [ago(0.2)], first: { productTitle: "X", amountCents: 100, currency: "usd" }, truncated: false } }), base({ sales: { times: [ago(9)], first: null, truncated: false } })],
    [firstReview, base({ reviews: { firstRecent: { id: "r1", at: ago(1), rating: 4, productId: "p1", productTitle: "X" }, olderExists: false } }), base({ reviews: { firstRecent: null, olderExists: false } })],
    [subscribersMilestone, base({ subscribers: { count: 51, countWeekAgo: 20 } }), base({ subscribers: { count: 49, countWeekAgo: 51 } })],
    [featureLaunchRule([{ id: "launch-x", live: "2026-09-20", title: "Sell products together as a bundle", message: "Pick two or more products and set one price.", href: "/app/products/new" }]), base(), withCreator({ createdAt: "2026-09-21T00:00:00Z" })],
  ]
  check("every rule has a case here", RULES.every((r) => cases.some(([c]) => c.kind === r.kind)), RULES.map((r) => r.kind).filter((k) => !cases.some(([c]) => c.kind === k)))
  for (const [rule, firing, quiet] of cases) {
    const once = planCreator({ rules: [rule], snapshot: firing, existing: [], now: NOW, complete: false })
    const made = once.inserts.filter((r) => !r.baseline && !r.foldedInto)
    const rows = made.map((r, i) => row({ id: `${rule.kind}-${i}`, kind: r.kind, subject_id: r.subject, category: r.category, dedupe_key: r.dedupeKey, created_at: ago(0.01) }))
    const again = planCreator({ rules: [rule], snapshot: firing, existing: rows, now: NOW, complete: false })
    const later = planCreator({ rules: [rule], snapshot: { ...firing, now: NOW + 3 * HOUR }, existing: rows, now: NOW + 3 * HOUR, complete: false })
    const fixed = planCreator({ rules: [rule], snapshot: quiet, existing: rows, now: NOW, complete: false })
    const resolved = rows.every((r) => fixed.resolve.includes(r.id))
    check(`${rule.kind}: fires, then is said once (again now, and three hours later), then ${rule.resolveWhenGone ? "resolves when fixed" : "stays: it happened"}`,
      made.length >= 1 && made.every((r) => r.kind === rule.kind && r.version === rule.version && r.category === rule.category)
        && again.inserts.filter((r) => !r.baseline).length === 0 && later.inserts.filter((r) => !r.baseline).length === 0
        && (rule.resolveWhenGone ? resolved : fixed.resolve.length === 0),
      { made: made.length, again: again.inserts.length, later: later.inserts.length, resolve: fixed.resolve })
  }
}

console.log("\nThe planner: cooldowns")
{
  const missing = base({ deliverable: [] })
  const dismissed = (days: number) => row({ kind: "product_missing_file", subject_id: "p1", category: "problem", dismissed_at: ago(days - 0.1), created_at: ago(days), dedupe_key: `product_missing_file:p1:${ago(days).slice(0, 10)}` })
  check("dismissed a day ago, still true: not said again yet (3 day cooldown)", visibleInserts(plan(missing, [dismissed(1)])).length === 0)
  check("four days later: said again", kinds(visibleInserts(plan(missing, [dismissed(4)]))) === "product_missing_file:p1")
  const traffic = { views14: { p1: 300, p2: 120 }, orders14: {}, soldRecently: [] as string[] }
  const two = base({ traffic, products: [{ id: "p1", title: "A", status: "published", type: "digital", createdAt: ago(60) }, { id: "p2", title: "B", status: "published", type: "digital", createdAt: ago(60) }] })
  const lastWeek = row({ kind: "product_views_no_sales", subject_id: "p9", created_at: ago(3), category: "opportunity" })
  check("a product with views and no sales, once a week at most across products", visibleInserts(plan(two, [lastWeek])).filter((r) => r.category === "opportunity").length === 0 && plan(two).inserts.some((r) => r.kind === "product_views_no_sales"))
}

console.log("\nThe planner: the daily limit")
{
  const manyMissing = base({
    deliverable: [],
    products: ["a", "b", "c", "d", "e"].map((id) => ({ id, title: `Pack ${id}`, status: "published", type: "digital", createdAt: ago(20) })),
  })
  const p = plan(withCreator({ payoutsEnabled: false }, { ...manyMissing, creator: { ...manyMissing.creator!, payoutsEnabled: false }, payouts: [{ id: "po_1", status: "failed", amountCents: 500, currency: "usd", createdAt: ago(1), failureCode: null }] }))
  const vis = visibleInserts(p)
  check(`critical is never held back: both critical rows, plus ${DAILY_LIMIT} problems`, vis.filter((r) => r.category === "critical").length === 2 && vis.filter((r) => r.category === "problem").length === DAILY_LIMIT, kinds(vis))
  check("the rest wait, counted", p.deferred === 2, p.deferred)
  const today = [row({ kind: "coupon_expiring", subject_id: "k", created_at: ago(0.2), category: "opportunity" }), row({ kind: "first_review", subject_id: "review_1", created_at: ago(0.5), category: "milestone" })]
  check("two said today already: one more", visibleInserts(plan(manyMissing, today)).length === 1)
  const quiet = [row({ kind: "sales_milestone", subject_id: "sales_1", created_at: ago(0.2), category: "milestone", metadata: { baseline: true } }), row({ kind: "coupon_expiring", subject_id: "k", created_at: ago(0.2), category: "opportunity", metadata: { folded_into: "x" } })]
  check("quiet rows (baselines, digest lines) do not count", visibleInserts(plan(manyMissing, quiet)).length === DAILY_LIMIT)
}

console.log("\nThe planner: one next step, one opportunity, a digest")
{
  const live = withCreator({ createdAt: ago(20), hasAvatar: false }, { products: [{ id: "p1", title: "X", status: "published", type: "digital", createdAt: ago(10) }], sales: { times: [], first: null, truncated: false }, reviews: { firstRecent: null, olderExists: false } })
  check("two steps due: only the first is said", kinds(visibleInserts(plan(live)).filter((r) => r.category === "next_step")) === "setup_next_step:sale")
  const openStep = row({ kind: "setup_next_step", subject_id: "sale", category: "next_step", created_at: ago(5) })
  check("one open: nothing else", visibleInserts(plan(live, [openStep])).filter((r) => r.category === "next_step").length === 0)
  const dismissedStep = { ...openStep, dismissed_at: ago(4), dedupe_key: "setup_next_step:sale:2026-09" }
  check("that one dismissed: the next one, not the same one again", kinds(visibleInserts(plan(live, [dismissedStep])).filter((r) => r.category === "next_step")) === "setup_next_step:branding")
  check("but not within two days of the last", visibleInserts(plan(live, [{ ...dismissedStep, created_at: ago(1) }])).filter((r) => r.category === "next_step").length === 0)

  const stacked = base({
    recovery: { recoverable: 5, reminderOn: false, flowId: null },
    subscribers: { count: 240, countWeekAgo: 240 },
    lastCampaignSentAt: ago(50),
    traffic: { views14: { p1: 212 }, orders14: {}, soldRecently: [] },
    coupons: [{ id: "k1", code: "AUTUMN10", expiresAt: ahead(1), usageCount: 3, usageLimit: null }],
  })
  const d = plan(stacked)
  const digest = d.inserts.find((r) => r.kind === DIGEST_KIND)
  check("four opportunities at once: one digest", !!digest && visibleInserts(d).filter((r) => r.category === "opportunity").length === 1, kinds(visibleInserts(d)))
  check("with a line each, the three that matter most, in a few words", digest?.items?.length === 3 && digest.items[0].title === "5 buyers left checkout; the reminder is off" && digest.items[1].title === "Lightroom presets: 212 views, no sales" && digest.items[2].title === "240 subscribers, no email in 50 days", digest?.items)
  check("each line goes to its own page", digest?.items?.map((i) => i.href).join() === "/app/emails/flow/new,/app/products/p1,/app/emails/new", digest?.items)
  check("its lines are written folded into it, so they are not said again", d.inserts.filter((r) => r.foldedInto === digest?.dedupeKey).length === 3)
  check("the fourth waits", d.deferred >= 1)
  check("titled plainly", digest?.title === "3 opportunities this week", digest?.title)
  const recentOpp = row({ kind: DIGEST_KIND, subject_id: "2026-09-24", category: "opportunity", created_at: ago(1), dedupe_key: "opportunity_digest:2026-09-24:" })
  check("an opportunity said yesterday: the next ones wait three days", visibleInserts(plan(stacked, [recentOpp])).filter((r) => r.category === "opportunity").length === 0)
  const single = plan(base({ recovery: { recoverable: 5, reminderOn: false, flowId: null } }))
  check("one opportunity alone is itself, not a digest", kinds(visibleInserts(single)) === "checkout_reminder_off:checkout")
  const lines = d.inserts.filter((r) => r.foldedInto)
  const written = [
    { ...recentOpp, id: "dg", dedupe_key: digest!.dedupeKey, created_at: ago(2) },
    ...lines.map((l, i) => row({ kind: l.kind, subject_id: l.subject, id: `ln${i}`, created_at: ago(2), dismissed_at: ago(2), resolved_at: ago(0.5), metadata: { folded_into: digest!.dedupeKey } })),
  ]
  check("the digest resolves when every line of it has", plan(base(), written).resolve.includes("dg"))
  check("and not while one is still open", !plan(base({ recovery: { recoverable: 5, reminderOn: false, flowId: null } }), written.map((r, i) => (i === 1 ? { ...r, resolved_at: null } : r))).resolve.includes("dg"))
}

console.log("\nThe planner: baselines are silent")
{
  const p = plan(base({ sales: { times: [], first: null, truncated: true }, reviews: { firstRecent: null, olderExists: true }, subscribers: { count: 900, countWeekAgo: 890 } }))
  const quiet = p.inserts.filter((r) => r.baseline)
  check("a big old store: its milestones written quietly, once", quiet.map((r) => r.subject).sort().join() === "review_1,sales_1,sales_10,sales_100,subscribers_50,subscribers_500", quiet.map((r) => r.subject))
  check("never pushed", quiet.every((r) => !r.push))
  const rec = recordOf({ ...quiet[0], creatorId: "c1", userId: "u1", at: ago(0) })
  check("and written read, dismissed and resolved", !!rec.read_at && !!rec.dismissed_at && !!rec.resolved_at)
}

/* ─── 3. The engine, against the database's rules ─────────────────── */

type Stored = ExistingRow & { user_id: string; title: string; message: string; href: string }

class MemoryStore implements NotificationStore {
  rows: Stored[] = []
  state = new Map<string, { lease: number | null; evaluated: number | null }>()
  available = true
  seq = 0
  constructor(public creators: string[], public clock: () => number) {}
  private async tick() {
    await new Promise((r) => setTimeout(r, 0))
  }
  async claimCreators(limit: number, leaseSeconds: number) {
    if (!this.available) return null
    await this.tick()
    /* One statement in Postgres: nothing awaits between choosing and leasing. */
    const t = this.clock()
    for (const id of this.creators) if (!this.state.has(id)) this.state.set(id, { lease: null, evaluated: null })
    const free = [...this.state.entries()]
      .filter(([, s]) => (s.lease === null || s.lease < t) && (s.evaluated === null || s.evaluated < t - 30 * 60_000))
      .sort(([a, x], [b, y]) => (x.evaluated ?? -1) - (y.evaluated ?? -1) || a.localeCompare(b))
      .slice(0, limit)
    for (const [, s] of free) s.lease = t + leaseSeconds * 1000
    return free.map(([id]) => id)
  }
  async finishCreators(ids: string[], at: string) {
    await this.tick()
    for (const id of ids) this.state.set(id, { lease: null, evaluated: Date.parse(at) })
  }
  async existing(ids: string[]) {
    await this.tick()
    return this.rows.filter((r) => ids.includes(r.creator_id)).map((r) => ({ ...r }))
  }
  async insert(r: NewRow) {
    await this.tick()
    /* The unique index: checked and written in one step. */
    if (this.rows.some((x) => x.creator_id === r.creatorId && x.dedupe_key === r.dedupeKey)) return null
    const rec = recordOf(r)
    const id = `n${++this.seq}`
    this.rows.push({
      id,
      creator_id: r.creatorId,
      user_id: r.userId,
      kind: r.kind,
      category: r.category,
      dedupe_key: r.dedupeKey,
      subject_id: r.subject,
      created_at: r.at,
      read_at: rec.read_at as string | null,
      dismissed_at: rec.dismissed_at as string | null,
      resolved_at: rec.resolved_at as string | null,
      pushed_at: null,
      metadata: rec.metadata as Record<string, unknown>,
      title: r.title,
      message: r.message,
      href: r.href,
    })
    return id
  }
  async resolve(creatorId: string, ids: string[], at: string) {
    await this.tick()
    for (const r of this.rows) if (r.creator_id === creatorId && ids.includes(r.id) && !r.resolved_at) r.resolved_at = at
  }
  async claimPush(id: string, at: string) {
    await this.tick()
    const r = this.rows.find((x) => x.id === id)
    if (!r || r.pushed_at) return false
    r.pushed_at = at
    return true
  }
}

class FixtureSource implements SnapshotSource {
  loads = 0
  constructor(public snapshots: Map<string, CreatorSnapshot>) {}
  async load(ids: string[], _parts: ReadonlySet<string>, _existing: ReadonlyMap<string, ExistingRow[]>, now: number) {
    this.loads++
    await new Promise((r) => setTimeout(r, 0))
    return new Map(ids.filter((id) => this.snapshots.has(id)).map((id) => [id, { ...this.snapshots.get(id)!, now }]))
  }
}

class RecordingPusher implements Pusher {
  sent: Array<{ userId: string; push: NotificationPush }> = []
  async send(userId: string, push: NotificationPush) {
    await new Promise((r) => setTimeout(r, 0))
    this.sent.push({ userId, push })
  }
}

function world() {
  const snapshots = new Map<string, CreatorSnapshot>([
    ["c1", withCreator({ id: "c1", userId: "u1", payoutsEnabled: false }, { sales: { times: [ago(0.2)], first: { productTitle: "Lightroom presets", amountCents: 1200, currency: "usd" }, truncated: false }, reviews: { firstRecent: null, olderExists: false } })],
    ["c2", withCreator({ id: "c2", userId: "u2" }, { deliverable: [], recovery: { recoverable: 4, reminderOn: false, flowId: null } })],
    ["c3", withCreator({ id: "c3", userId: "u3" })],
    ["c4", withCreator({ id: "c4", userId: "u4" }, { domains: [{ id: "d4", domain: "a.example", status: "active", sslStatus: "failed", verifiedAt: ago(9), createdAt: ago(9), updatedAt: ago(1) }] })],
  ])
  let t = NOW
  const clock = () => t
  const store = new MemoryStore([...snapshots.keys()], clock)
  const source = new FixtureSource(snapshots)
  const pusher = new RecordingPusher()
  return { snapshots, store, source, pusher, clock, advance: (ms: number) => (t += ms) }
}
const summaryOf = (store: MemoryStore) => store.rows.map((r) => `${r.creator_id}/${r.dedupe_key}`).sort().join("\n")

async function engineSuite() {
  console.log("\nThe engine: one run")
  {
    const w = world()
    const s = await runNotificationEngine({ store: w.store, source: w.source, pusher: w.pusher, deadline: NOW + 250_000, clock: w.clock, batchSize: 2 })
    const visible = w.store.rows.filter((r) => !r.dismissed_at)
    check("every creator evaluated, in batches", s.creators === 4 && s.batches === 2 && s.available, s)
    check("payouts paused, the first sale, a missing file, a checkout reminder, a failed certificate",
      visible.map((r) => `${r.creator_id}:${r.kind}`).sort().join() === "c1:sales_milestone,c1:stripe_restricted,c2:checkout_reminder_off,c2:product_missing_file,c4:domain_https", visible.map((r) => `${r.creator_id}:${r.kind}`))
    check("pushes for critical and milestone rows only, each once", w.pusher.sent.map((p) => `${p.userId}:${p.push.data.kind}`).sort().join() === "u1:sales_milestone,u1:stripe_restricted,u4:domain_https", w.pusher.sent.map((p) => p.push.data.kind))
    check("every pushed row is marked", w.store.rows.filter((r) => r.pushed_at).length === 3)
    check("everyone finished, lease let go", [...w.store.state.values()].every((x) => x.lease === null && x.evaluated === NOW))
    const before = summaryOf(w.store)
    w.advance(HOUR)
    const again = await runNotificationEngine({ store: w.store, source: w.source, pusher: w.pusher, deadline: NOW + HOUR + 250_000, clock: w.clock, batchSize: 2 })
    check("an hour later, the same world: nothing new, nothing pushed again", summaryOf(w.store) === before && w.pusher.sent.length === 3 && again.inserted === 0, again)
    w.snapshots.set("c1", { ...w.snapshots.get("c1")!, creator: { ...w.snapshots.get("c1")!.creator!, payoutsEnabled: true } })
    w.advance(HOUR)
    await runNotificationEngine({ store: w.store, source: w.source, pusher: w.pusher, deadline: NOW + 2 * HOUR + 250_000, clock: w.clock, batchSize: 2 })
    check("payouts back on: resolved, and it drops off", !!w.store.rows.find((r) => r.kind === "stripe_restricted")?.resolved_at)
  }

  console.log("\nThe engine: two runs at once")
  {
    const w = world()
    const [a, b] = await Promise.all([
      runNotificationEngine({ store: w.store, source: w.source, pusher: w.pusher, deadline: NOW + 250_000, clock: w.clock, batchSize: 1 }),
      runNotificationEngine({ store: w.store, source: w.source, pusher: w.pusher, deadline: NOW + 250_000, clock: w.clock, batchSize: 1 }),
    ])
    const keys = w.store.rows.map((r) => `${r.creator_id}/${r.dedupe_key}`)
    check("each creator evaluated by one of them", a.creators + b.creators === 4, { a: a.creators, b: b.creators })
    check("no row written twice", new Set(keys).size === keys.length && w.store.rows.filter((r) => !r.dismissed_at).length === 5)
    check("no push sent twice", w.pusher.sent.length === 3)
  }

  console.log("\nThe engine: two runs at once, with no lease at all (the unique key alone)")
  {
    const w = world()
    const leaky = Object.assign(Object.create(Object.getPrototypeOf(w.store)), w.store) as MemoryStore
    /* Both runs are handed every creator, as if the lease were gone. */
    let handed = 0
    leaky.claimCreators = async () => (handed++ < 2 ? [...w.snapshots.keys()] : [])
    await Promise.all([
      runNotificationEngine({ store: leaky, source: w.source, pusher: w.pusher, deadline: NOW + 250_000, clock: w.clock, batchSize: 4 }),
      runNotificationEngine({ store: leaky, source: w.source, pusher: w.pusher, deadline: NOW + 250_000, clock: w.clock, batchSize: 4 }),
    ])
    const keys = leaky.rows.map((r) => `${r.creator_id}/${r.dedupe_key}`)
    check("still one row per dedupe key", new Set(keys).size === keys.length && leaky.rows.filter((r) => !r.dismissed_at).length === 5, keys)
    check("and one push per row", w.pusher.sent.length === 3, w.pusher.sent.map((p) => p.push.data.kind))
  }

  console.log("\nThe engine: a webhook and the hourly run at the same moment")
  {
    const w = world()
    await Promise.all([
      runNotificationEngine({ store: w.store, source: w.source, pusher: w.pusher, deadline: NOW + 250_000, clock: w.clock, batchSize: 4 }),
      evaluateCreator({ store: w.store, source: w.source, pusher: w.pusher, creatorId: "c1", rules: [stripeRestricted], now: NOW }),
      evaluateCreator({ store: w.store, source: w.source, pusher: w.pusher, creatorId: "c1", rules: [salesMilestone], now: NOW, pushInline: false }),
    ])
    const c1 = w.store.rows.filter((r) => r.creator_id === "c1" && !r.dismissed_at)
    check("one row each", c1.map((r) => r.kind).sort().join() === "sales_milestone,stripe_restricted", c1.map((r) => r.kind))
    check("one push each at most", w.pusher.sent.filter((p) => p.userId === "u1").length <= 2 && new Set(w.pusher.sent.map((p) => `${p.userId}:${p.push.data.kind}`)).size === w.pusher.sent.length)
  }

  console.log("\nThe engine: the sale's own push says the milestone")
  {
    const w = world()
    const r = await evaluateCreator({ store: w.store, source: w.source, pusher: w.pusher, creatorId: "c1", rules: [salesMilestone], now: NOW, pushInline: false })
    check("the milestone row is written", r?.inserted.some((x) => x.row.kind === "sales_milestone" && x.row.title === "Your first sale") === true)
    check("its push is taken by the caller, not sent here", w.pusher.sent.length === 0 && !!w.store.rows.find((x) => x.kind === "sales_milestone")?.pushed_at)
    await runNotificationEngine({ store: w.store, source: w.source, pusher: w.pusher, deadline: NOW + 250_000, clock: w.clock, batchSize: 4 })
    check("and the hourly run does not push it again", !w.pusher.sent.some((p) => p.push.data.kind === "sales_milestone"))
  }

  console.log("\nThe engine: before its SQL, and out of time")
  {
    const w = world()
    w.store.available = false
    const s = await runNotificationEngine({ store: w.store, source: w.source, pusher: w.pusher, deadline: NOW + 250_000, clock: w.clock })
    check("no claim function: not available, nothing read, nothing written", !s.available && w.source.loads === 0 && w.store.rows.length === 0 && w.pusher.sent.length === 0)
    const w2 = world()
    let t = NOW
    /* Each batch takes a minute of the budget. */
    const s2 = await runNotificationEngine({ store: w2.store, source: w2.source, pusher: w2.pusher, deadline: NOW + 150_000, clock: () => (t += 30_000), batchSize: 1 })
    check("the time budget stops it between batches", s2.stoppedForTime && s2.creators > 0 && s2.creators < 4, s2)
    const waiting = [...w2.store.state.entries()].filter(([, x]) => x.evaluated === null).map(([id]) => id)
    const s3 = await runNotificationEngine({ store: w2.store, source: w2.source, pusher: w2.pusher, deadline: t + 250_000, clock: () => t, batchSize: 1 })
    check("and the next run starts with those it did not reach", s3.creators === waiting.length && waiting.length > 0, { waiting, next: s3.creators })
  }

  console.log("\nApplying a plan: pushes are taken before they are sent")
  {
    const w = world()
    const p = plan(withCreator({ payoutsEnabled: false }))
    await applyPlan(w.store, w.pusher, { creatorId: "c1", userId: "u1" }, p, NOW)
    await applyPlan(w.store, w.pusher, { creatorId: "c1", userId: "u1" }, p, NOW)
    check("the same plan twice: one row, one push", w.store.rows.filter((r) => !r.dismissed_at).length === 1 && w.pusher.sent.length === 1)
  }
}

/* ─── 4. Push payloads ─────────────────────────────────────────────── */

function pushSuite() {
  console.log("\nPush payloads: a few words, nothing private")
  const secret = "Jane Doe's private coaching"
  const sensitive = base({
    creator: { ...base().creator!, payoutsEnabled: false },
    products: [{ id: "p1", title: secret, status: "published", type: "digital", createdAt: ago(60) }],
    payouts: [{ id: "po_1", status: "failed", amountCents: 987654, currency: "usd", createdAt: ago(1), failureCode: "no_account" }],
    disputes: [{ id: "dp_1", amountCents: 45600, currency: "eur", openedAt: ago(1), closed: false }],
    domains: [{ id: "d1", domain: "jane-doe-private.example", status: "active", sslStatus: "failed", verifiedAt: ago(5), createdAt: ago(5), updatedAt: ago(1) }],
    emailHealth: { wentOut: 1000, bounced: 90, complained: 3 },
    sales: { times: [ago(0.1)], first: { productTitle: secret, amountCents: 99900, currency: "usd" }, truncated: false },
    reviews: { firstRecent: { id: "r1", at: ago(1), rating: 5, productId: "p1", productTitle: secret }, olderExists: false },
    subscribers: { count: 51, countWeekAgo: 40 },
  })
  const rows: PlannedRow[] = []
  for (const rule of RULES) {
    for (const f of rule.evaluate(sensitive) ?? []) {
      if (f.baseline) continue
      rows.push({ ...planCreator({ rules: [rule], snapshot: sensitive, existing: [], now: NOW, complete: false }).inserts.find((r) => r.subject === f.subject)! })
    }
  }
  const pushing = rows.filter((r) => r && r.push)
  check("push only for critical and milestone kinds", pushing.length > 0 && pushing.every((r) => PUSH_CATEGORIES.includes(r.category)) && rows.filter((r) => r && !PUSH_CATEGORIES.includes(r.category)).every((r) => !r.push))
  check("every critical and milestone rule pushes", RULES.filter((r) => PUSH_CATEGORIES.includes(r.category)).every((r) => r.push) && RULES.filter((r) => !PUSH_CATEGORIES.includes(r.category)).every((r) => !r.push))
  for (const r of pushing) {
    const p = pushPayloadOf(r)
    const text = `${p.title} ${p.body}`
    check(`${r.kind}: "${p.title}"`,
      p.title.length <= PUSH_TITLE_MAX && Object.values(PUSH_BODY).includes(p.body) && !/[$€£]|\d[\d,.]*\s?(usd|eur)|@/i.test(text) && !text.includes("Jane") && !text.includes("example") && !/\d{2,}/.test(text.replace(/\b(10|100|50|500)\b/g, "")),
      p)
    check(`${r.kind}: data is the kind and a link inside /app, nothing else`, Object.keys(p.data).sort().join() === "kind,type,url" && p.data.type === "notification" && p.data.url.startsWith("/app"), p.data)
  }
  {
    /* The getting paid rules name the live product in their message: the push must not. */
    const unpaid = withCreator({ stripeAccountId: null, onboardingStatus: "not_connected", subscriptionPlan: "growth", subscriptionStatus: "past_due" }, { products: [{ id: "p1", title: secret, status: "published", type: "digital", createdAt: ago(60) }] })
    const made = planCreator({ rules: [payoutsNotConnected, proPaymentFailed], snapshot: unpaid, existing: [], now: NOW, complete: false }).inserts
    check("Connect Stripe and the Pro payment push too, in a few plain words", made.length === 2 && made.every((r) => r.push) && made.map((r) => pushPayloadOf(r)).every((p) => !`${p.title} ${p.body}`.includes("Jane") && p.body === PUSH_BODY.critical && p.data.url.startsWith("/app/settings/")), made.map((r) => pushPayloadOf(r)))
  }
  check("a link that is not inside /app becomes /app", appPath("https://evil.example/app") === "/app" && appPath("//evil.example") === "/app" && appPath("/app/payouts") === "/app/payouts" && appPath("/apple") === "/app")
  check("a long title is cut", pushPayloadOf({ kind: "k", category: "milestone", title: "x".repeat(200), pushTitle: null, href: "/app" }).title.length <= PUSH_TITLE_MAX)
  check("the engine sends no email: the ones that need it already have one", Object.keys(EMAILED_ELSEWHERE).every((k) => KNOWN_KINDS.has(k)) && !/sendEmail|lib\/email|lib\/mail/.test(read("lib/notifications/engine.ts") + read("lib/notifications/plan.ts") + read("lib/notifications/events.ts")))
}

/* ─── 5. Words ─────────────────────────────────────────────────────── */

const BANNED = /\b(unlock|elevate|seamless(ly)?|powerful|effortless(ly)?|supercharge|transform|leverage|boost|empower|journey|delve|revolutioni[sz]e|game.?changer)\b/i
function plain(text: string): boolean {
  return !BANNED.test(text) && !text.includes("—") && !text.includes("!")
}

function wordsSuite() {
  console.log("\nThe words")
  const worlds = [
    base({ deliverable: [], creator: { ...base().creator!, payoutsEnabled: false } }),
    base({ payouts: [{ id: "po_1", status: "failed", amountCents: 500, currency: "usd", createdAt: ago(1), failureCode: "declined" }], disputes: [{ id: "dp", amountCents: 900, currency: "usd", openedAt: ago(1), closed: false }], undelivered: [{ orderId: "o9", createdAt: ago(1), productTitle: "Portrait retouching masterclass for wedding photographers" }] }),
    base({ domains: [{ id: "d", domain: "x.example", status: "pending", sslStatus: "pending", verifiedAt: null, createdAt: ago(4), updatedAt: ago(4) }, { id: "d2", domain: "y.example", status: "active", sslStatus: "failed", verifiedAt: ago(4), createdAt: ago(4), updatedAt: ago(1) }], emailHealth: { wentOut: 300, bounced: 30, complained: 0 }, failedCampaigns: [{ id: "e", subject: "Hello", status: "partially_failed", scheduledAt: ago(1), createdAt: ago(2) }] }),
    base({ recovery: { recoverable: 3, reminderOn: false, flowId: null }, subscribers: { count: 99, countWeekAgo: 40 }, lastCampaignSentAt: null, traffic: { views14: { p1: 90 }, orders14: {}, soldRecently: [] }, coupons: [{ id: "k", code: "HELLO", expiresAt: ahead(1), usageCount: 1, usageLimit: null }], checkout: { starts: 5, buyers: 3, orders: 0, soldBefore: true } }),
    withCreator({ createdAt: ago(2), hasAvatar: false, hasBio: false }, { products: [] }),
    base({ sales: { times: Array.from({ length: 100 }, (_, i) => ago(200 - i * 2)).map((x, i, a) => (i === 99 ? ago(1) : x)), first: null, truncated: false }, reviews: { firstRecent: { id: "r", at: ago(1), rating: 1, productId: null, productTitle: null }, olderExists: false } }),
    base({ stripeAccount: { chargesEnabled: true, payoutsEnabled: true, currentlyDue: ["x"], pastDue: [], currentDeadline: null, disabledReason: null } }),
    withCreator({ stripeAccountId: null, onboardingStatus: "not_connected", subscriptionPlan: "growth", subscriptionStatus: "past_due" }, { website: { live: false, unpublished: false, draftSince: ago(5) } }),
    withCreator({ detailsSubmitted: false, onboardingStatus: "pending" }),
    withCreator({ chargesEnabled: false, payoutsEnabled: false, onboardingStatus: "pending" }, { sales: { times: [], first: null, truncated: false }, domains: [{ id: "d3", domain: "z.example", status: "pending", sslStatus: "active", verifiedAt: ago(20), createdAt: ago(20), updatedAt: ago(1) }] }),
  ]
  const said: string[] = []
  for (const s of worlds) for (const r of RULES) for (const f of r.evaluate(s) ?? []) if (!f.baseline) said.push(f.title, f.message, f.pushTitle ?? "")
  const kindsSaid = new Set<string>()
  for (const s of worlds) for (const r of RULES) if ((r.evaluate(s) ?? []).some((f) => !f.baseline)) kindsSaid.add(r.kind)
  check("every rule was made to speak by these fixtures", RULES.filter((r) => r.kind !== "feature_launch").every((r) => kindsSaid.has(r.kind)), RULES.map((r) => r.kind).filter((k) => !kindsSaid.has(k)))
  const bad = said.filter((t) => t && !plain(t))
  check("no AI words, no em dashes, no exclamation marks", bad.length === 0, bad)
  check("titles are short enough to read at a glance", said.filter((_, i) => i % 3 === 0).every((t) => t.length <= 72), said.filter((_, i) => i % 3 === 0).filter((t) => t.length > 72))
  check("every link stays inside /app", worlds.every((s) => RULES.every((r) => (r.evaluate(s) ?? []).every((f) => appPath(f.href) === f.href))))
  check("1st, 2nd, 3rd, 11th, 100th", [1, 2, 3, 11, 100].map(ordinal).join() === "1st,2nd,3rd,11th,100th")
  check("a long name is cut at a word", clip("Portrait retouching masterclass for wedding photographers", 30) === "Portrait retouching…")
  check("weeks are ISO weeks", weekKey(Date.parse("2026-09-25T12:00:00Z")) === "2026-W39" && weekKey(Date.parse("2027-01-01T12:00:00Z")) === "2026-W53")
}

/* ─── Supabase store: the shape of what is written ─────────────────── */

function storeSuite() {
  console.log("\nWhat a row is in seller_notifications")
  const p = visibleInserts(plan(withCreator({ payoutsEnabled: false })))[0]
  const rec = recordOf({ ...p, creatorId: "c1", userId: "u1", at: ago(0) })
  check("its type is its category, and the kind, key, subject and version are kept", rec.type === "critical" && rec.kind === "stripe_restricted" && rec.dedupe_key === "stripe_restricted:payouts:2026-09-25" && rec.subject_id === "payouts" && rec.rule_version === 1)
  check("unread and open", rec.read_at === null && rec.dismissed_at === null && rec.resolved_at === null)
  check("the word on the row travels in metadata", (rec.metadata as Record<string, unknown>).area === "Payouts")
  check("a missing column or function means the SQL has not run", missingSchema({ code: "PGRST202" }) && missingSchema({ code: "42703" }) && !missingSchema({ code: "23505" }))
  const store = read("lib/notifications/supabase-store.ts")
  check("written ON CONFLICT (creator_id, dedupe_key) DO NOTHING", /upsert\(record, \{ onConflict: "creator_id,dedupe_key", ignoreDuplicates: true \}\)/.test(store))
  check("a push is claimed with pushed_at IS NULL", /update\(\{ pushed_at: at \}\)\.eq\("id", id\)\.is\("pushed_at", null\)\.select\("id"\)/.test(store))
  check("resolved only while open", /update\(\{ resolved_at: at \}\)[^\n]*\.is\("resolved_at", null\)/.test(store))
  check("the claim is the database function, not memory", /rpc\("notification_claim_creators"/.test(store) && !/new Map|new Set/.test(store.replace(/\/\*[\s\S]*?\*\//g, "")))
}

/* ─── The wiring: the cron, the events, the SQL ────────────────────── */

function wiringSuite() {
  console.log("\nRuns every hour, and on the events that matter")
  const vercel = JSON.parse(read("vercel.json")) as { crons: { path: string; schedule: string }[] }
  check("an hourly job at :25, apart from the ones at :00 and :10", vercel.crons.some((c) => c.path === "/api/cron/notifications" && c.schedule === "25 * * * *"))
  const cron = read("app/api/cron/notifications/route.ts")
  check("the job needs CRON_SECRET, and stops taking batches inside its time", /requireBearerSecret\(request, "CRON_SECRET"\)/.test(cron) && /export const maxDuration = 300/.test(cron) && /deadline: started \+ RUN_BUDGET_MS/.test(cron) && /const RUN_BUDGET_MS = 240_000/.test(cron))
  check("and logs counts only", !/creatorId|user_id|email/.test(cron.replace(/\/\*[\s\S]*?\*\//g, "")))
  const hook = read("app/api/stripe/webhook/route.ts")
  /* A connected account's own events are handled in lib/stripe/connect-webhook.ts, which both webhook endpoints call. */
  check("account.updated, payouts and disputes tell the engine, after the answer", /after\(async \(\) => \(await import\("@\/lib\/notifications\/events"\)\)\.noteStripeAccount\(accountCreatorId, account as any\)\)/.test(read("lib/stripe/connect-webhook.ts")) && /handleConnectAccountEvent\(event\)/.test(hook)
    && /\.notePayout\(payoutCreatorId\)/.test(hook) && /\.noteDispute\(disputeCreatorId\)/.test(hook))
  /* Changed on purpose (r57): the review is handed over too, so the seller's phone hears every review once (the first titled as the milestone). */
  check("a review tells it too (the first is a milestone)", /\.noteReview\(reviewCreatorId, push\)/.test(read("app/api/reviews/route.ts")))
  const sale = read("lib/push/notifications.ts")
  /* The words are lib/push/sale-text.ts now; a free claim is never a sales milestone. */
  check("a sale that is a milestone is one push, titled as the milestone", /const milestone = opts\.amountCents > 0 \? await milestoneTitle\(userId\) : null/.test(sale) && /title: milestone \?\? "🎉 You made a sale!"/.test(read("lib/push/sale-text.ts")))
  const events = read("lib/notifications/events.ts")
  check("account.updated also asks whether a live product can now be paid for, so Connect Stripe resolves at once", /\[stripeRestricted, stripeRequirementsDue, payoutsNotConnected\]/.test(events))
  check("events never wait long and never throw", /export const EVENT_BUDGET_MS = 2_500/.test(events) && /within\(/.test(events) && (events.match(/catch \{/g) ?? []).length >= 2)
  /* Changed on purpose (r57): the browser's page is the app's tap target (lib/push/tap.ts appTarget, inside /app only), one function for both. */
  check("a browser push opens the notification's own page, inside /app only", /return pushTapTarget\(data\) \?\? "\/app"/.test(read("lib/push/sender.ts")) && /\/\^\\\/app\(\?:\[\/\?#\]\|\$\)\/\.test\(u\)/.test(read("lib/push/tap.ts")))
  check("so does a tap on the phone", /pushTapTarget\(data\)/.test(read("lib/push/client.ts")) && /if \(type === "notification"\) return appTarget\(data\?\.url\)/.test(read("lib/push/tap.ts")))

  console.log("\nThe SQL: one statement per line, safe twice, the database keeps the promises")
  const part = read("supabase/sql/run-now/29_notification_rules.sql")
  const migration = read("supabase/migrations/20261003_notification_rules.sql")
  const lines = part.trim().split("\n")
  check("every line of the part is a /* */ comment or one whole statement", lines.every((l) => (l.startsWith("/*") && l.endsWith("*/")) || /;\s*$/.test(l)) && !/^\s*--/m.test(part))
  const statements = (sql: string) => sql.split("\n").filter((l) => l.trim() && !l.startsWith("/*") && !l.startsWith("   ") && !l.startsWith(" "))
  check("the migration holds the same statements", JSON.stringify(statements(migration).filter((l) => !l.startsWith("/*"))) === JSON.stringify(statements(part)))
  check("and uses /* */ comments only", !/^\s*--/m.test(migration))
  check("said once: a unique index on (creator_id, dedupe_key)", /CREATE UNIQUE INDEX IF NOT EXISTS seller_notifications_once ON public\.seller_notifications \(creator_id, dedupe_key\);/.test(part))
  check("claimed once: FOR UPDATE SKIP LOCKED, with a lease", /FOR UPDATE SKIP LOCKED/.test(part) && /lease_until = now\(\) \+ make_interval/.test(part))
  check("server only: RLS on, no policies, the function revoked from the public roles", /ENABLE ROW LEVEL SECURITY/.test(part) && !/CREATE POLICY/.test(part) && /REVOKE ALL ON FUNCTION public\.notification_claim_creators\(integer, integer\) FROM PUBLIC, anon, authenticated;/.test(part))
  check("safe twice: IF NOT EXISTS, DROP IF EXISTS, NOT VALID checks", (part.match(/ADD COLUMN IF NOT EXISTS/g) ?? []).length === 8 && /DROP CONSTRAINT IF EXISTS seller_notifications_category_check/.test(part) && (part.match(/NOT VALID;/g) ?? []).length === 2 && /CREATE TABLE IF NOT EXISTS/.test(part))
  check("the type keeps every old kind and takes the categories", /'new_review', 'new_sale', 'new_subscriber', 'payout', 'announcement', 'critical', 'problem', 'next_step', 'opportunity', 'milestone', 'update'/.test(part))
  /* Its number, and its column in 99_check_after.sql (which run-four's file 4 must end with), are the lead's to give. */
  check("listed in the README", /\| `29_notification_rules\.sql` \|/.test(read("supabase/sql/run-now/README.md")))
  const engine = read("lib/notifications/engine.ts") + read("lib/notifications/plan.ts") + read("lib/notifications/snapshot.ts")
  check("no dedupe, lock or cache kept in memory between calls: nothing mutable at module level", !/^(const|let|var) \w+(: [^=]+)? = new (Map|Set|WeakMap)/m.test(engine) && !/^let /m.test(engine) && !/\bglobalThis\b/.test(engine))
}

async function main() {
  await engineSuite()
  pushSuite()
  wordsSuite()
  storeSuite()
  wiringSuite()
  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) {
    console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
    process.exit(1)
  }
}
main()
