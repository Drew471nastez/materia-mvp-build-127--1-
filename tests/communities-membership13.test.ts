/**
 * ===========================================================================
 *  ROUND 13, WORKER M: A PAID COMMUNITY MEMBERSHIP'S LIFECYCLE (asks 39 to 43)
 * ===========================================================================
 *   POLICY       the owner's refund policy and contact address as they are
 *                kept, the contact form's words, money in the buyer's locale,
 *                the EU withdrawal waiver and where it applies
 *   ACCESS       granted only once the first charge succeeds; past due keeps
 *                a grace; cancelled keeps access until the period ends (the
 *                engine's rules, read through its own functions)
 *   CANCEL       at period end on a stubbed Stripe: one Stripe call, the
 *                reason kept once, resume undoes it, someone else's refused
 *   EMAILS ONCE  the cancellation email is planned once per end date; a
 *                refund emails the member once per Stripe refund, with or
 *                without part 101
 *   REFUND       full and partial, on a stubbed Stripe, the same idempotency
 *                key as Orders, the order row, ending the membership
 *   CONTACT      delivered to the owner's inbox with Reply-To the member,
 *                capped per day, never the owner's address on the page
 *   SOURCE       routes, the engine hook, checkout wiring, part 101
 */
import { readFileSync } from "node:fs"
import { fakeDb } from "./_fake-db"
import {
  CONTACT_DAILY_CAP,
  REFUND_POLICY_MAX,
  WITHDRAWAL_WAIVER,
  buyerLocale,
  centsFromAmount,
  cleanContactEmail,
  cleanContactMessage,
  cleanRefundPolicy,
  contactEmailProblem,
  formatMoney,
  membershipEndsLine,
  membershipStatusLine,
  parseCancelReason,
  parseRefundAmount,
  refundableCents,
  withdrawalWaiverApplies,
} from "@/lib/communities/membership-policy"
import {
  cancellationsWithReasons,
  changeCommunityMembership,
  communityCancellationAfterMembership,
  communityMembershipView,
  communityPayments,
  contactEmail,
  refundCommunityPayment,
  refundsFor,
  resetLifecycleReady,
  sendContactMessage,
  type RefundDeps,
  type RefundLike,
  type SubscriptionDeps,
} from "@/lib/communities/server/membership-lifecycle"
import { grantsAccess, statusFromStripe, transitions, PAST_DUE_GRACE_DAYS } from "@/lib/memberships/state"
import { memberships as membershipWorkflow } from "@/lib/notify/workflows/memberships"
import { renderEmail } from "@/lib/notify/templates"
import { can } from "@/lib/communities/permissions"
import { SQL_PARTS } from "@/lib/admin/sql-parts.generated"
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
    console.log(`  FAIL  ${label}${detail === undefined ? "" : `   ${JSON.stringify(detail)}`}`)
  }
}
const read = (p: string) => readFileSync(p, "utf8")
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")

const DAY = 86_400_000
const NOW = Date.now()
const iso = (t: number) => new Date(t).toISOString()
const C = "00000000-0000-4000-8000-0000000000c1"
const C2 = "00000000-0000-4000-8000-0000000000c2"
const U = "00000000-0000-4000-8000-0000000000a1"
const OTHER = "00000000-0000-4000-8000-0000000000a2"
const OWNER = "00000000-0000-4000-8000-0000000000a9"
const CREATOR = "00000000-0000-4000-8000-0000000000e1"
const P_MEMBER = "00000000-0000-4000-8000-0000000000f1"
const P_ONCE = "00000000-0000-4000-8000-0000000000f2"
const P_ELSE = "00000000-0000-4000-8000-0000000000f3"
const M = "00000000-0000-4000-8000-0000000000d1"
const O1 = "00000000-0000-4000-8000-0000000000b1"
const O2 = "00000000-0000-4000-8000-0000000000b2"
const O3 = "00000000-0000-4000-8000-0000000000b3"
const O4 = "00000000-0000-4000-8000-0000000000b4"

const community = { id: C, name: "Clay Studio", slug: "clay-studio", owner_user_id: OWNER, creator_id: CREATOR }

function world(opts: { part101?: boolean } = {}) {
  const part101 = opts.part101 !== false
  const periodEnd = iso(NOW + 20 * DAY)
  const tables: Record<string, Record<string, any>[]> = {
    communities: [{ ...community, refund_policy: "  Refunds within 7 days.\u0007\n\n\n\nAsk first.  ", contact_email: "Owner@Clay.Studio", contact_email_public: false }],
    products: [
      { id: P_MEMBER, type: "membership", title: "Clay Studio", creator_id: CREATOR, community_id: C },
      { id: P_ONCE, type: "community", title: "Clay Studio lifetime", creator_id: CREATOR, community_id: C },
      { id: P_ELSE, type: "digital", title: "Another thing", creator_id: CREATOR, community_id: null },
    ],
    memberships: [
      {
        id: M,
        product_id: P_MEMBER,
        creator_id: CREATOR,
        buyer_id: U,
        buyer_email: "ana@example.com",
        buyer_name: "Ana Lopez",
        title: "Clay Studio",
        stripe_subscription_id: "sub_1",
        billing_interval: "month",
        amount_cents: 1900,
        currency: "usd",
        status: "active",
        current_period_end: periodEnd,
        cancel_at_period_end: false,
        past_due_since: null,
        card_last4: "4242",
        created_at: iso(NOW - 10 * DAY),
      },
    ],
    community_members: [
      { id: "cm1", community_id: C, user_id: U, status: "active", source: "subscription", role: "member" },
      { id: "cm2", community_id: C, user_id: OWNER, status: "active", source: "owner", role: "owner" },
    ],
    profiles: [{ id: OWNER, display_name: "Mara Stone", username: "mara" }],
    creators: [{ id: CREATOR, user_id: OWNER, username: "mara" }],
    orders: [
      { id: O1, product_id: P_MEMBER, buyer_id: U, buyer_email: "ana@example.com", buyer_first_name: "Ana", buyer_last_name: "Lopez", amount_cents: 1900, currency: "usd", status: "completed", stripe_payment_intent_id: "pi_1", receipt_token: "rcpt_1", created_at: iso(NOW - 5 * DAY) },
      { id: O2, product_id: P_ONCE, buyer_id: U, buyer_email: "ana@example.com", buyer_first_name: "Ana", amount_cents: 9900, currency: "usd", status: "completed", stripe_payment_intent_id: "pi_2", receipt_token: "rcpt_2", variant_id: null, created_at: iso(NOW - 4 * DAY) },
      { id: O3, product_id: P_ELSE, buyer_id: U, buyer_email: "ana@example.com", amount_cents: 500, currency: "usd", status: "completed", stripe_payment_intent_id: "pi_3", created_at: iso(NOW - 3 * DAY) },
      { id: O4, product_id: P_MEMBER, buyer_id: U, buyer_email: "ana@example.com", amount_cents: 1900, currency: "usd", status: "disputed", stripe_payment_intent_id: "pi_4", created_at: iso(NOW - 2 * DAY) },
    ],
    membership_invoices: [{ stripe_invoice_id: "in_1", membership_id: M, order_id: O1 }],
    entitlements: [{ id: "e1", buyer_id: U, product_id: P_ONCE, variant_id: null }],
    community_access_products: [],
    community_audit_log: [],
  }
  if (part101) {
    tables.community_cancellations = []
    tables.community_refunds = []
    tables.community_contact_messages = []
  }
  const missingTable = { code: "42P01", message: "relation does not exist" }
  const db = fakeDb(tables, {
    unique: { community_cancellations: [["cancel_key"]], community_refunds: [["stripe_refund_id"]] },
    failWith: part101 ? {} : { community_cancellations: missingTable, community_refunds: missingTable, community_contact_messages: missingTable },
  })
  resetLifecycleReady()
  return { db, tables, periodEnd }
}

/** A Stripe for subscriptions: records each update, and the "sync" writes what Stripe would now say. */
function stubSubscriptions(tables: Record<string, Record<string, any>[]>, fail = false) {
  const calls: { id: string; params: { cancel_at_period_end: boolean } }[] = []
  const deps: SubscriptionDeps = {
    update: async (id, params) => {
      if (fail) throw Object.assign(new Error("stripe down"), { type: "StripeConnectionError" })
      calls.push({ id, params })
      return {}
    },
    sync: async (id) => {
      const row = tables.memberships.find((m) => m.stripe_subscription_id === id)!
      const last = calls[calls.length - 1]
      if (last) {
        row.cancel_at_period_end = last.params.cancel_at_period_end
        row.status = last.params.cancel_at_period_end ? "canceled" : "active"
      }
      return { ...row } as never
    },
  }
  return { calls, deps }
}

/** A Stripe for refunds with its idempotency: the same key answers the same refund. */
function stubRefunds(opts: { status?: string } = {}) {
  const byKey = new Map<string, RefundLike>()
  const byId = new Map<string, RefundLike>()
  const created: { params: Record<string, unknown>; key: string }[] = []
  const mails: { to: string; subject: string; text: string; replyTo: string | null }[] = []
  const events: Record<string, unknown>[] = []
  const ended: string[] = []
  let n = 0
  const deps: RefundDeps = {
    createRefund: async (params, key) => {
      created.push({ params, key })
      const kept = byKey.get(key)
      if (kept) return { ...kept, metadata: { ...(kept.metadata ?? {}) } }
      const r: RefundLike = { id: `re_${++n}`, status: opts.status ?? "succeeded", currency: "usd", metadata: {} }
      byKey.set(key, r)
      byId.set(r.id, r)
      return { ...r }
    },
    retrieveRefund: async (id) => ({ ...byId.get(id)!, metadata: { ...(byId.get(id)!.metadata ?? {}) } }),
    updateRefund: async (id, metadata) => {
      const r = byId.get(id)!
      r.metadata = { ...(r.metadata ?? {}), ...metadata }
    },
    afterRefund: async () => undefined,
    endSubscription: async (id) => void ended.push(id),
    emit: async (e) => void events.push(e),
    sendMail: async (m) => {
      mails.push({ to: m.to, subject: m.subject, text: m.text, replyTo: m.replyTo })
      return { success: true }
    },
    baseUrl: () => "https://storelib.com",
  }
  return { deps, created, mails, events, ended }
}

const ana = { id: U, email: "ana@example.com", emailConfirmed: true }

async function main() {
  /* ── Policy ──────────────────────────────────────────────────────────── */
  console.log("\nThe owner's settings, as they are kept (the A <-> M contract)")
  check("REFUND_POLICY_MAX is 2000", REFUND_POLICY_MAX === 2000)
  check("a refund policy is tidied: control characters out, at most one blank line, trimmed", cleanRefundPolicy("  Refunds within 7 days.\u0007\n\n\n\nAsk first.  ") === "Refunds within 7 days.\n\nAsk first.")
  check("an empty refund policy is no policy", cleanRefundPolicy("   \n ") === null && cleanRefundPolicy(42) === null)
  check("a long one is cut at 2000", (cleanRefundPolicy("x".repeat(2500)) ?? "").length === 2000)
  check("a contact address is kept lower case and trimmed", cleanContactEmail("  Help@Clay.Studio ") === "help@clay.studio")
  check("anything that is not a plain address is not kept", [null, "", "help", "a@b", "a b@c.com", "<x@y.com>", "x@y.com, z@w.com"].every((v) => cleanContactEmail(v) === null))
  check("Settings explains a bad address and says nothing for an empty one", contactEmailProblem("help@") !== null && contactEmailProblem("") === null && contactEmailProblem("ok@site.com") === null)

  console.log("\nThe contact form's words")
  check("a subject is needed", !cleanContactMessage({ subject: " ", message: "Hello there, a question" }).ok)
  check("a message of a few words is asked for more", !cleanContactMessage({ subject: "Billing", message: "hi" }).ok)
  const okMsg = cleanContactMessage({ subject: "  Billing\r\nquestion ", message: "Hello\r\n\r\n\r\n\r\nCan I pause?\u0000" })
  check("the subject is one line and the message tidy", okMsg.ok && okMsg.subject === "Billing question" && okMsg.message === "Hello\n\nCan I pause?", okMsg)
  check("a cancel reason is one of the six, a note alone is 'other', nothing is null", parseCancelReason({ reason: "too_expensive" })?.reason === "too_expensive" && parseCancelReason({ note: "moving" })?.reason === "other" && parseCancelReason({}) === null && parseCancelReason({ reason: "hack" }) === null)

  console.log("\nMoney in the community's currency, written the buyer's way (ask 43)")
  check("en-US dollars, whole amounts without cents", formatMoney(1900, "usd", "en-US") === "$19" && formatMoney(1950, "usd", "en-US") === "$19.50")
  check("German euros", formatMoney(1950, "eur", "de-DE") === "19,50 €", formatMoney(1950, "eur", "de-DE"))
  check("yen has no cents (Stripe's amount is whole yen)", formatMoney(1200, "jpy", "en-US") === "¥1,200", formatMoney(1200, "jpy", "en-US"))
  check("an unknown locale falls back, never throws", formatMoney(500, "usd", "zz-INVALID-@@") === "$5")
  check("the buyer's locale comes from Accept-Language", buyerLocale("de-DE,de;q=0.9,en;q=0.8") === "de-DE" && buyerLocale("") === "en-US" && buyerLocale("*") === "en-US")
  check("an owner's typed amount: 12.50, 12,50, $1,000 and yen", centsFromAmount("12.50") === 1250 && centsFromAmount("12,5") === 1250 && centsFromAmount("$1,000") === 100000 && centsFromAmount("1200", "jpy") === 1200 && centsFromAmount("abc") === null)

  console.log("\nThe EU 14 day withdrawal waiver, where it applies")
  check("a buyer in Germany, Norway or the UK is asked", ["DE", "no", "GB"].every((c) => withdrawalWaiverApplies(c)))
  check("a buyer in the US or Canada is not", !withdrawalWaiverApplies("US") && !withdrawalWaiverApplies("CA"))
  check("a buyer whose country is not known is asked (the safe side)", withdrawalWaiverApplies(null) && withdrawalWaiverApplies("") && withdrawalWaiverApplies("XX"))
  check("the waiver says access starts now and the 14 day right ends with it", /right away/.test(WITHDRAWAL_WAIVER) && /14 day right of withdrawal/.test(WITHDRAWAL_WAIVER))

  console.log("\nWhat a cancelled member reads")
  check("'Your membership ends on <date>. No further charges.'", membershipEndsLine("2026-10-31T10:00:00Z") === "Your membership ends on Oct 31, 2026. No further charges.")
  check("the status line for each state", membershipStatusLine({ kind: "subscription", status: "active", periodEnd: "2026-10-31T00:00:00Z", amountCents: 1900, currency: "usd", access: true }) === "Renews on Oct 31, 2026 for $19." && /^Your membership ends on/.test(membershipStatusLine({ kind: "subscription", status: "canceled", periodEnd: "2026-10-31T00:00:00Z", amountCents: 1900, currency: "usd", access: true })) && /first payment/.test(membershipStatusLine({ kind: "subscription", status: "incomplete", periodEnd: null, amountCents: 1900, currency: "usd", access: false })))

  /* ── Access only after the charge (ask 40, the engine's own rules) ───── */
  console.log("\nAccess to a paid community: only once the charge succeeds")
  const sub = (o: Record<string, unknown>) => ({ id: "sub_x", customer: "cus_x", ...o }) as never
  check("a subscription whose first payment is not in is 'incomplete' and lets nobody in", statusFromStripe(sub({ status: "incomplete" })) === "incomplete" && !grantsAccess({ status: "incomplete", current_period_end: iso(NOW + DAY), past_due_since: null }, NOW))
  check("a trial whose card never arrived is still incomplete: no access", statusFromStripe(sub({ status: "trialing", pending_setup_intent: { id: "seti_1", status: "requires_payment_method" } })) === "incomplete")
  check("paid: access", grantsAccess({ status: "active", current_period_end: iso(NOW + 20 * DAY), past_due_since: null }, NOW))
  check("a failed renewal keeps a grace of 7 days, then access ends", PAST_DUE_GRACE_DAYS === 7 && grantsAccess({ status: "past_due", current_period_end: null, past_due_since: iso(NOW - 3 * DAY) }, NOW) && !grantsAccess({ status: "past_due", current_period_end: null, past_due_since: iso(NOW - 8 * DAY) }, NOW))
  check("Stripe giving up (unpaid, incomplete_expired, canceled) is expired: no access", ["unpaid", "incomplete_expired", "canceled"].every((s) => statusFromStripe(sub({ status: s })) === "expired") && !grantsAccess({ status: "expired", current_period_end: iso(NOW + DAY), past_due_since: null }, NOW))
  const join = code("lib/communities/server/membership.ts")
  check("the community follows the membership's access (grantsAccess), not the join button", /grantsAccess/.test(code("lib/memberships/access.ts")) && /syncCommunityAccessForMembership/.test(join) && /reconcileAccess/.test(join))

  /* ── Cancel at period end, on a stubbed Stripe ───────────────────────── */
  console.log("\nCancel at the end of the period (stubbed Stripe)")
  {
    const { db, tables, periodEnd } = world()
    const stripe = stubSubscriptions(tables)
    const before = await communityMembershipView(db, community, ana)
    check("the page sees the subscription: Cancel offered, no Resume", before.kind === "subscription" && before.canCancel && !before.canResume && before.amountCents === 1900 && before.cardLast4 === "4242", before)
    check("the refund policy is shown tidied; the owner's address is not (not public)", before.refundPolicy === "Refunds within 7 days.\n\nAsk first." && before.contact.publicEmail === null && before.contact.form === true && before.contact.ownerName === "Mara Stone")
    const done = await changeCommunityMembership(db, { communityId: C, person: ana, action: "cancel", why: { reason: "too_expensive", note: "Moving" } }, stripe.deps)
    check("one Stripe call: cancel_at_period_end on the member's own subscription", done.ok && stripe.calls.length === 1 && stripe.calls[0].id === "sub_1" && stripe.calls[0].params.cancel_at_period_end === true, stripe.calls)
    const row = tables.memberships[0]
    check("access is kept until the period ends", grantsAccess(row as never, NOW) && grantsAccess(row as never, Date.parse(periodEnd) - 60_000))
    check("and stops at the end of it", !grantsAccess(row as never, Date.parse(periodEnd) + 60_000))
    const after = await communityMembershipView(db, community, ana)
    check("the page now offers Resume, not Cancel", after.status === "canceled" && after.access && after.canResume && !after.canCancel)
    check("the reason is kept once, with the end date", tables.community_cancellations.length === 1 && tables.community_cancellations[0].reason === "too_expensive" && tables.community_cancellations[0].note === "Moving" && tables.community_cancellations[0].ends_at === periodEnd)
    check("and written to the community's audit log", tables.community_audit_log.some((a) => a.action === "membership.cancelled" && a.reason === "too_expensive"))
    const again = await changeCommunityMembership(db, { communityId: C, person: ana, action: "cancel", why: null }, stripe.deps)
    check("cancelling twice is refused, Stripe is not asked again", again.ok === false && again.status === 409 && stripe.calls.length === 1)
    await communityCancellationAfterMembership(db, row as never, "cancelled")
    check("the engine's hook after the same cancellation adds no second row", tables.community_cancellations.length === 1 && tables.community_cancellations[0].reason === "too_expensive")
    const summary = await cancellationsWithReasons(db, C)
    check("the owner's analytics: one cancellation, for 'too expensive', with the note", summary?.total === 1 && summary.counts.find((c) => c.reason === "too_expensive")?.count === 1 && summary.latest[0]?.note === "Moving" && summary.latest[0]?.endsAt === periodEnd, summary)
    const resumed = await changeCommunityMembership(db, { communityId: C, person: ana, action: "resume" }, stripe.deps)
    check("Resume undoes it before the end", resumed.ok && stripe.calls[1]?.params.cancel_at_period_end === false && tables.memberships[0].status === "active")
    check("and a resumed one no longer counts", (await cancellationsWithReasons(db, C))?.total === 0 && !!tables.community_cancellations[0].resumed_at)
  }
  {
    const { db, tables } = world()
    const stripe = stubSubscriptions(tables)
    const bob = { id: OTHER, email: "bob@example.com", emailConfirmed: true }
    const r = await changeCommunityMembership(db, { communityId: C, person: bob, action: "cancel" }, stripe.deps)
    check("someone else cannot cancel Ana's membership", r.ok === false && r.status === 404 && stripe.calls.length === 0)
    const other = await changeCommunityMembership(db, { communityId: C2, person: ana, action: "cancel" }, stripe.deps)
    check("nor can Ana cancel through a community that does not sell it", other.ok === false && other.status === 404 && stripe.calls.length === 0)
    const unconfirmed = { id: OTHER, email: "ana@example.com", emailConfirmed: false }
    tables.memberships[0].buyer_id = null
    check("an unconfirmed address does not find a membership paid with it", (await communityMembershipView(db, community, unconfirmed)).kind !== "subscription")
    check("a confirmed one does (paid before the account existed)", (await communityMembershipView(db, community, { ...unconfirmed, emailConfirmed: true })).kind === "subscription")
  }
  {
    const { db, tables } = world()
    const stripe = stubSubscriptions(tables, true)
    const r = await changeCommunityMembership(db, { communityId: C, person: ana, action: "cancel", why: { reason: "other", note: null } }, stripe.deps)
    check("Stripe down: 502, nothing changed, no cancellation kept", r.ok === false && r.status === 502 && tables.memberships[0].status === "active" && tables.community_cancellations.length === 0)
  }
  {
    const { db, tables } = world({ part101: false })
    const stripe = stubSubscriptions(tables)
    const r = await changeCommunityMembership(db, { communityId: C, person: ana, action: "cancel", why: { reason: "too_busy", note: null } }, stripe.deps)
    check("before part 101 cancelling works the same, only no reason is kept", r.ok && stripe.calls.length === 1 && (await cancellationsWithReasons(db, C)) === null)
    const view = await communityMembershipView(db, community, ana)
    check("and the contact form is not offered yet", view.contact.form === false)
  }
  {
    const { db, tables } = world()
    tables.memberships[0].status = "canceled"
    await communityCancellationAfterMembership(db, tables.memberships[0] as never, "cancelled")
    check("a cancellation made on /account is counted too (the engine's hook), with no reason", tables.community_cancellations.length === 1 && tables.community_cancellations[0].reason === null && tables.community_cancellations[0].community_id === C)
    const s = await cancellationsWithReasons(db, C)
    check("and shows as 'no reason given' (reason null)", s?.counts.find((c) => c.reason === null)?.count === 1)
  }

  /* ── The cancellation email, once ────────────────────────────────────── */
  console.log("\nThe cancellation email: once per end date, in the words asked for")
  const active = { status: "active", current_period_end: iso(NOW + 20 * DAY), past_due_since: null, started_at: iso(NOW - 10 * DAY) }
  const cancelled = { ...active, status: "canceled" }
  check("active to cancelled is one 'cancel_scheduled'", transitions(active, cancelled, NOW).includes("cancel_scheduled"))
  check("a second sync of the same state schedules nothing (no second email)", !transitions(cancelled, cancelled, NOW).includes("cancel_scheduled"))
  const ev = (key: string): DomainEvent => ({ name: "membership.canceled", key, entityType: "membership", entityId: M, payload: { buyerEmail: "ana@example.com", membershipId: M, membershipTitle: "Clay Studio", endsAt: "2026-10-31T00:00:00Z", periodEnd: "2026-10-31T00:00:00Z", amountCents: 1900, currency: "usd", interval: "month" }, occurredAt: iso(NOW), creatorId: CREATOR })
  const wctx = { now: NOW, userId: null, creatorId: CREATOR }
  const p1 = membershipWorkflow(ev("a"), wctx)?.jobs[0]
  const p2 = membershipWorkflow(ev("b"), wctx)?.jobs[0]
  check("raised twice for the same end date, one job key", !!p1 && p1.idempotencyKey === p2?.idempotencyKey)
  check("the engine keys the event by the end date", /membership:\$\{row\.id\}:canceled:\$\{row\.current_period_end \?\? "now"\}/.test(read("lib/memberships/sync.ts")))
  const mail = renderEmail("MEMBERSHIP_CANCELED", ev("a").payload, { baseUrl: "https://storelib.com" })
  check("it reads 'Your membership ends on <date>. No further charges.'", /Your membership of Clay Studio ends on October 31, 2026\. No further charges\./.test(mail.text) && /ends on/.test(mail.subject), { subject: mail.subject })
  const welcome = (w: boolean) => renderEmail("MEMBERSHIP_STARTED", { buyerEmail: "ana@example.com", membershipId: M, membershipTitle: "Clay Studio", amountCents: 1900, currency: "usd", interval: "month", periodEnd: "2026-10-31T00:00:00Z", ...(w ? { withdrawalWaiver: true } : {}) }, { baseUrl: "https://storelib.com" }).text
  check("the welcome email records the withdrawal waiver when checkout asked for it, and only then", /14 day right of withdrawal ends/.test(welcome(true)) && !/withdrawal/.test(welcome(false)))

  /* ── Refunds ─────────────────────────────────────────────────────────── */
  console.log("\nRefunds from /app (stubbed Stripe)")
  function refundInput(orderId: string, over: Record<string, unknown> = {}) {
    const input = { communityId: C, communityName: "Clay Studio", creatorId: CREATOR, actorUserId: OWNER, orderId }
    return { ...input, ...over } as typeof input & Record<string, unknown>
  }
  {
    const { db, tables } = world()
    const s = stubRefunds()
    const r = await refundCommunityPayment(db, refundInput(O1), s.deps)
    const o = tables.orders.find((x) => x.id === O1)!
    check("a full refund of a membership payment goes through", r.ok && r.value.full && r.value.amountCents === 1900 && !r.value.pending, r)
    check("through Stripe as Orders does: reverse transfer, the payment intent, Orders' idempotency key", s.created[0]?.params.reverse_transfer === true && s.created[0]?.params.payment_intent === "pi_1" && s.created[0]?.key === `storelib-refund:${O1}:0:1900`)
    check("the order reads refunded, with the amount and the Stripe refund", o.status === "refunded" && o.refund_amount_cents === 1900 && o.stripe_refund_id === "re_1")
    check("order.refunded is raised under the key charge.refunded uses (told once)", s.events.length === 1 && s.events[0].key === `refund:${O1}:re_1`)
    check("the member gets one email, to their address, from the community", s.mails.length === 1 && s.mails[0].to === "ana@example.com" && /refund/i.test(s.mails[0].subject) && /\$19/.test(s.mails[0].text), s.mails[0])
    check("kept in community_refunds with the email time", tables.community_refunds.length === 1 && !!tables.community_refunds[0].emailed_at && tables.community_refunds[0].full_refund === true)
    const again = await refundCommunityPayment(db, refundInput(O1), s.deps)
    check("nothing is left to refund the second time, and no second email", again.ok === false && again.status === 400 && s.mails.length === 1)
    const summary = await refundsFor(db, C)
    check("the owner's analytics: one refund of $19, in full", summary?.count === 1 && summary.totalCents === 1900 && summary.items[0].full === true && summary.currency === "usd", summary)
  }
  {
    const { db, tables } = world()
    const s = stubRefunds()
    const a = await refundCommunityPayment(db, refundInput(O1, { amountCents: 500, reason: "  Missed a live call  " }), s.deps)
    const o = tables.orders.find((x) => x.id === O1)!
    check("a partial refund of $5 leaves $14", a.ok && !a.value.full && o.refund_amount_cents === 500 && refundableCents(o) === 1400 && o.refund_reason === "Missed a live call")
    const b = await refundCommunityPayment(db, refundInput(O1, { amountCents: 500 }), s.deps)
    check("a second partial refund is a new refund, with its own key and its own email", b.ok && s.created[1].key === `storelib-refund:${O1}:500:500` && s.mails.length === 2 && o.refund_amount_cents === 1000)
    const tooMuch = await refundCommunityPayment(db, refundInput(O1, { amountCents: 5000 }), s.deps)
    check("more than is left is refused before Stripe is asked", tooMuch.ok === false && tooMuch.status === 400 && s.created.length === 2)
    check("parseRefundAmount: nothing means everything left; zero and fractions are refused", parseRefundAmount(undefined, 900).ok && !parseRefundAmount(0, 900).ok && !parseRefundAmount(1.5, 900).ok && !parseRefundAmount(10, 0).ok)
  }
  {
    const { db, tables } = world()
    const s = stubRefunds({ status: "pending" })
    const first = await refundCommunityPayment(db, refundInput(O1), s.deps)
    const second = await refundCommunityPayment(db, refundInput(O1), s.deps)
    check("a double submit while Stripe is still settling: the same refund (idempotency), one email", first.ok && second.ok && first.value.refundId === second.value.refundId && s.mails.length === 1 && s.created.length === 2)
    check("a pending refund leaves the order to the webhook (charge.refunded)", tables.orders.find((x) => x.id === O1)!.status === "completed")
  }
  {
    const { db } = world({ part101: false })
    const s = stubRefunds({ status: "pending" })
    await refundCommunityPayment(db, refundInput(O1), s.deps)
    await refundCommunityPayment(db, refundInput(O1), s.deps)
    check("before part 101 the refund's own metadata keeps it to one email", s.mails.length === 1)
  }
  {
    const { db, tables } = world()
    const s = stubRefunds()
    const r = await refundCommunityPayment(db, refundInput(O1, { endMembership: true }), s.deps)
    check("'End their membership now' ends the subscription of that payment", r.ok && r.value.endedMembership && s.ended.join() === "sub_1")
    const once = await refundCommunityPayment(db, refundInput(O2), s.deps)
    check("a one time purchase refunded in full leaves the library", once.ok && !tables.entitlements.some((e) => e.product_id === P_ONCE))
  }
  {
    const { db } = world()
    const s = stubRefunds()
    const foreign = await refundCommunityPayment(db, refundInput(O3), s.deps)
    check("a payment of a product this community does not sell is not found here", foreign.ok === false && foreign.status === 404 && s.created.length === 0)
    const notMine = await refundCommunityPayment(db, refundInput(O1, { creatorId: "00000000-0000-4000-8000-0000000000ee" }), s.deps)
    check("only the creator account the payment went to can refund it", notMine.ok === false && notMine.status === 403 && s.created.length === 0)
    const disputed = await refundCommunityPayment(db, refundInput(O4), s.deps)
    check("a disputed payment is the bank's to settle", disputed.ok === false && disputed.status === 409 && s.created.length === 0)
    check("money stays with the owner: an admin may not refund (manage_pricing)", can("owner", "manage_pricing") && !can("admin", "manage_pricing") && !can("moderator", "manage_pricing"))
    const list = await communityPayments(db, C)
    check("the owner's payments: this community's only, newest first, with what can still go back", !!list && list.length === 3 && list.every((p) => p.orderId !== O3) && list.find((p) => p.orderId === O1)?.refundableCents === 1900 && list.find((p) => p.orderId === O1)?.subscriptionRunning === true, list)
  }

  /* ── Contact the owner ───────────────────────────────────────────────── */
  console.log("\nContacting the owner")
  {
    const { db, tables } = world()
    const mails: { to: string; subject: string; text: string; replyTo: string | null }[] = []
    const deps = {
      ownerInbox: async () => "owner@clay.studio",
      sendMail: async (m: { to: string; subject: string; text: string; html: string; fromName: string | null; replyTo: string | null }) => {
        mails.push({ to: m.to, subject: m.subject, text: m.text, replyTo: m.replyTo })
        return { success: true }
      },
      baseUrl: () => "https://storelib.com",
    }
    const sender = { id: U, name: "Ana Lopez", email: "ana@example.com" }
    const sent = await sendContactMessage(db, { community, sender, subject: "Pausing", message: "Can I pause for a month?" }, deps)
    check("delivered to the owner's inbox with Reply-To the member", sent.ok && mails.length === 1 && mails[0].to === "owner@clay.studio" && mails[0].replyTo === "ana@example.com" && /Clay Studio: Pausing/.test(mails[0].subject))
    check("kept, and marked delivered", tables.community_contact_messages.length === 1 && tables.community_contact_messages[0].delivered === true)
    for (let i = 1; i < CONTACT_DAILY_CAP; i++) await sendContactMessage(db, { community, sender, subject: `Again ${i}`, message: "One more question here" }, deps)
    const over = await sendContactMessage(db, { community, sender, subject: "Too many", message: "One more question here" }, deps)
    check(`the ${CONTACT_DAILY_CAP + 1}th message in a day is refused and not sent`, over.ok === false && over.status === 429 && mails.length === CONTACT_DAILY_CAP)
    const noEmail = await sendContactMessage(db, { community, sender: { ...sender, id: OTHER, email: null }, subject: "Hi", message: "A question for you" }, deps)
    check("a member with no address to reply to is told so", noEmail.ok === false && noEmail.status === 409)
    const nobody = await sendContactMessage(db, { community, sender: { ...sender, id: OTHER }, subject: "Hi", message: "A question for you" }, { ...deps, ownerInbox: async () => null })
    check("an owner with no inbox: not sent, and said plainly", nobody.ok === false && nobody.status === 409)
    const html = contactEmail({ communityName: "Clay <b>Studio</b>", senderName: "Ana", senderEmail: "ana@example.com", subject: "<script>x</script>", message: "<img src=x onerror=alert(1)>", link: "https://storelib.com/app/community/x/members" }).html
    check("the owner's email escapes what the member wrote", !/<script>|<img src=x/.test(html) && /&lt;script&gt;/.test(html))
  }
  {
    const { db } = world({ part101: false })
    const r = await sendContactMessage(db, { community, sender: { id: U, name: "Ana", email: "ana@example.com" }, subject: "Hi", message: "A question for you" }, { ownerInbox: async () => "o@x.com", sendMail: async () => ({ success: true }), baseUrl: () => "" })
    check("before part 101 the form is not there to send (503)", r.ok === false && r.status === 503)
  }
  {
    const { db, tables } = world()
    tables.communities[0].contact_email_public = true
    const v = await communityMembershipView(db, community, ana)
    check("the owner's address is on the page only when they chose to show it", v.contact.publicEmail === "owner@clay.studio")
    const own = await communityMembershipView(db, community, { id: OWNER, email: "mara@example.com", emailConfirmed: true })
    check("the owner is not offered a form to write to themselves", own.contact.form === false)
  }

  /* ── Source ──────────────────────────────────────────────────────────── */
  console.log("\nRoutes, the engine hook, checkout and part 101")
  const memberRoute = code("app/api/community/[communityId]/membership/route.ts")
  const contactRoute = code("app/api/community/[communityId]/contact/route.ts")
  const paymentsRoute = code("app/api/app/community/[id]/payments/route.ts")
  const refundsRoute = code("app/api/app/community/[id]/refunds/route.ts")
  check("every new route checks the switch first", [memberRoute, contactRoute, paymentsRoute, refundsRoute].every((s) => /const off = await requireCommunitiesOn\(\)\s*if \(off\) return off/.test(s)))
  check("cancel is rate limited and finds only the person's own subscription", /rateLimit\(\{ bucket: "membership-manage"/.test(memberRoute) && /changeCommunityMembership\(db, \{ communityId: community\.id, person: who/.test(memberRoute))
  check("contact: an active member (requireMember), two rate limits", /requireMember\(db, communityId, user\?\.id \?\? null, "view"\)/.test(contactRoute) && /windows: CONTACT_RATE,/.test(contactRoute) && /windows: CONTACT_RATE_ANY/.test(contactRoute))
  check("payments and refunds: the owner only (manage_pricing); refunds rate limited", /requireCreatorCommunity\(id, "manage_pricing"\)/.test(paymentsRoute) && /requireCreatorCommunity\(id, "manage_pricing"\)/.test(refundsRoute) && /rateLimit\(/.test(refundsRoute) && /creatorId: gate\.ctx\.creatorId/.test(refundsRoute))
  const sync = code("lib/memberships/sync.ts")
  check("the engine counts every community cancellation, inside quietly (never breaks billing)", /quietly\("community cancellation", \(\) => communityCancellationAfterMembership\(admin, row,/.test(sync))
  check("the welcome email carries the waiver from the subscription's metadata", /withdrawalWaiver: sub\.metadata\?\.withdrawal_waiver === "accepted"/.test(sync) && /withdrawal_waiver: "accepted"/.test(code("app/api/memberships/checkout/route.ts")))
  const page = code("app/(storelib)/checkout/page.tsx")
  check("checkout reads the community's terms on the server, the country and the locale", /checkoutTermsFor\(admin\(\)/.test(page) && /withdrawalWaiverApplies\(h\.get\("x-vercel-ip-country"\)\)/.test(page) && /buyerLocale\(h\.get\("accept-language"\)\)/.test(page))
  const mc = code("app/(storelib)/checkout/membership-checkout.tsx")
  check("the membership checkout shows the refund policy and the waiver in the consent, and sends it", /<CommunityRefundPolicy terms=\{communityTerms\} \/>/.test(mc) && /until I cancel\{waiver \?/.test(mc) && /withdrawalWaiver: !!waiver/.test(mc))
  check("and writes prices in the plan's currency", /formatMoney\(cents, currency, communityTerms\.locale\)/.test(mc) && /moneyOf\(cents, currency\)/.test(mc))
  check("the one time checkout shows them too", /waiverSentence\(communityTerms\)/.test(code("app/(storelib)/checkout/checkout-client.tsx")) && /<CommunityRefundPolicy terms=\{communityTerms\} \/>/.test(code("app/(storelib)/checkout/checkout-client.tsx")))
  check("the owner's Payments block is mounted on /app's Members, for manage_pricing", /p\.head\.can\.manage_pricing \? <PaymentsSection communityId=\{p\.head\.id\} \/>/.test(code("components/community/creator/members-section.tsx")))

  const sql = read("supabase/sql/run-now/101_community_membership_lifecycle.sql")
  const lines = sql.trimEnd().split("\n")
  check("part 101: a summary line, one statement per line, notify pgrst last", lines[0].startsWith("/*") && lines[0].endsWith("*/") && lines.slice(1, -1).every((l) => /^DO \$do\$ .* END \$do\$;$/.test(l)) && lines[lines.length - 1] === "notify pgrst, 'reload schema';")
  check("part 101: the three columns the A <-> M contract names", /ADD COLUMN IF NOT EXISTS refund_policy text/.test(sql) && /ADD COLUMN IF NOT EXISTS contact_email text/.test(sql) && /ADD COLUMN IF NOT EXISTS contact_email_public boolean NOT NULL DEFAULT false/.test(sql) && /char_length\(refund_policy\) <= 2000/.test(sql))
  check("part 101: none of them readable with the public key", /REVOKE SELECT \(refund_policy, contact_email, contact_email_public\)/.test(sql))
  check("part 101: three server only tables (RLS on, revoked from anon and authenticated)", ["community_cancellations", "community_refunds", "community_contact_messages"].every((t) => new RegExp(`ALTER TABLE public\\.${t} ENABLE ROW LEVEL SECURITY; REVOKE ALL ON public\\.${t} FROM PUBLIC, anon, authenticated;`).test(sql)))
  check("part 101: once per cancellation and per Stripe refund (unique keys)", /UNIQUE \(cancel_key\)/.test(sql) && /UNIQUE \(stripe_refund_id\)/.test(sql))
  check("part 101: the same six reasons as leaving", /reason IN \('not_for_me', 'too_busy', 'too_expensive', 'content', 'people', 'other'\)/.test(sql))
  check("part 101: idempotent (IF NOT EXISTS everywhere it creates)", !/CREATE TABLE public|CREATE INDEX community/.test(sql) && (sql.match(/CREATE TABLE IF NOT EXISTS/g) ?? []).length === 3)
  check("the migrations copy is the same text", read("supabase/migrations/20261117_community_membership_lifecycle.sql") === sql)
  check("README row, check column and the parts record", /`101_community_membership_lifecycle\.sql`/.test(read("supabase/sql/run-now/README.md")) && /as p101_community_membership_lifecycle/.test(read("supabase/sql/run-now/99_check_after.sql")) && SQL_PARTS.some((p) => p.part === "101" && p.file === "101_community_membership_lifecycle.sql"))

  console.log("\nClient code stays client safe, and the copy rules")
  const clientFiles = ["components/community/membership/cancel-membership.tsx", "components/community/membership/contact-owner.tsx", "components/community/membership/refund-dialog.tsx", "components/community/membership/sheet.tsx", "components/community/membership/index.tsx", "components/community/membership/checkout-policy.tsx", "lib/communities/membership-policy.ts"]
  check("no client module imports server code", clientFiles.every((f) => !/from "@\/lib\/communities\/server|next\/headers|server-only|lib\/admin-blog-auth|@\/lib\/stripe"|@\/lib\/memberships\/(server|sync)"/.test(code(f))))
  const mine = [...clientFiles, "lib/communities/server/membership-lifecycle.ts", "app/api/community/[communityId]/membership/route.ts", "app/api/community/[communityId]/contact/route.ts", "app/api/app/community/[id]/payments/route.ts", "app/api/app/community/[id]/refunds/route.ts", "supabase/sql/run-now/101_community_membership_lifecycle.sql"]
  const banned = /—|\bunlock|\belevate|\bseamless|\bpowerful|\beffortless|\bsupercharge|\btransform/i
  check("no em dash and none of the banned words", mine.every((f) => !banned.test(read(f))), mine.filter((f) => banned.test(read(f))))

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) {
    console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
    process.exit(1)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
