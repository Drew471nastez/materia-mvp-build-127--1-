/**
 * ===========================================================================
 *  ROUND 33: MAKING A COMMUNITY, SETTING IT UP, DELETING IT
 * ===========================================================================
 * Held against the in-memory database with a stubbed Stripe and mailer:
 *
 *   DELETE FREE   nobody pays: the typed name deletes it at once, a wrong
 *                 name changes nothing, and before part 202 it still works
 *   PERIOD END    somebody pays: archived and off sale at once, every
 *                 renewing membership set to cancel at its period end (a
 *                 member who had already cancelled is left alone), each
 *                 member emailed once, the date the last paid period ends;
 *                 asking twice is refused; before part 202 nothing changes
 *   UNDO          before the date: only the memberships this deletion
 *                 stopped renew again, the community is published and on
 *                 sale again, the members are told; a deletion now cannot
 *                 be undone; scheduling again after an Undo works
 *   CRON          not due: nothing; due with every membership run out:
 *                 deleted once, written in the audit log; a membership that
 *                 renews again in between is stopped and the date waits
 *   NOW           every membership ends today, the unused part of the last
 *                 payment is refunded (prorated, a destination charge
 *                 refund, an idempotency key), the order says so, and it is
 *                 deleted; a failed refund is retried by the job run under
 *                 the same key and never made twice; a refund Stripe already
 *                 has is found instead of made again
 *   GUARDS        unarchiving and a member's resume are refused meanwhile
 *   SETUP LIST    each step ticked from rows (the group's pictures and
 *                 description, rules, three people from invites and joins,
 *                 a staff post, a phone with the app), the intro hidden
 *                 while its address is empty, a skip counts as done and
 *                 leaves the Overview's list, the payouts step only for the
 *                 owner; progress keys checked; before part 202 a skip says
 *                 not_ready
 *   WIZARD        the create wizard's checks, address and welcome post
 *   SQL, WIRING, COPY
 *
 * Run with:  npm run test:push
 */
import { existsSync, readFileSync } from "node:fs"
import { stripComments } from "./_source"
import { untt } from "./i18n-source"
import { fakeDb } from "./_fake-db"
import { canUndoDeletion, deletionDate, deletionRefundKey, proratedRefundCents, stillPaid } from "@/lib/communities/community-deletion"
import { deletionPlan, runDueDeletions, undoDeletion, type DeletionDeps } from "@/lib/communities/server/community-deletion"
import { deleteCommunity, setArchived } from "@/lib/communities/server/creator"
import { APP_CONFIRMED, INTRO_VIDEO_URL, INTRO_WATCHED, PILL_HIDDEN, progressKey, setupChecklist, skipKey, stepsLeft, type SetupFacts } from "@/lib/communities/setup-checklist"
import { loadSetupChecklist, markSetupProgress } from "@/lib/communities/server/setup-checklist"
import { checkWizard, checkWizardStep, emptyDraft, readDraft, WIZARD_STEPS } from "@/lib/communities/create-wizard"
import type { CommunityRow } from "@/lib/communities/types"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    console.log(`  FAIL  ${name}${detail === undefined ? "" : `\n        ${JSON.stringify(detail)}`}`)
  }
}
const raw = (p: string) => readFileSync(p, "utf8")
const code = (p: string) => stripComments(untt(raw(p), p))
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any

const C = "c0000000-0000-4000-8000-000000000033"
const OWNER = "a0000000-0000-4000-8000-0000000000aa"
const ADMIN = "a0000000-0000-4000-8000-0000000000ad"
const BO = "a0000000-0000-4000-8000-000000000001"
const CY = "a0000000-0000-4000-8000-000000000002"
const CREATOR = "e0000000-0000-4000-8000-000000000001"
const TIER = "b0000000-0000-4000-8000-000000000001"
const PRODUCT = "d0000000-0000-4000-8000-000000000001"
const M_BO = "70000000-0000-4000-8000-000000000001"
const M_CY = "70000000-0000-4000-8000-000000000002"
const O_BO = "80000000-0000-4000-8000-000000000001"
const O_CY = "80000000-0000-4000-8000-000000000002"
const DAY = 86_400_000
const NOW = Date.UTC(2027, 1, 10, 12, 0, 0)
const iso = (ms: number) => new Date(ms).toISOString()

function community(over: Record<string, unknown> = {}): Record<string, Any> {
  return {
    id: C,
    slug: "makers",
    name: "Makers",
    tagline: null,
    description: "",
    logo_url: null,
    cover_url: null,
    creator_id: CREATOR,
    owner_user_id: OWNER,
    access: "paid",
    visibility: "public",
    status: "published",
    member_count: 3,
    benefits: [],
    rules: [],
    classroom_enabled: false,
    events_enabled: false,
    archived_at: null,
    deleted_at: null,
    suspended_at: null,
    ...over,
  }
}

/** A community with two paying members: Bo renews every month (paid 30 days, 10 used), Cy already cancelled and runs to day 25. */
function world(o: { paid?: boolean; part202?: boolean; extra?: Record<string, Any[]> } = {}) {
  const paid = o.paid !== false
  const tables: Record<string, Any[]> = {
    communities: [community(paid ? {} : { access: "free" })],
    community_tiers: paid ? [{ id: TIER, community_id: C, name: "Members", kind: "paid", billing: "recurring", product_id: PRODUCT, archived_at: null }] : [],
    products: paid ? [{ id: PRODUCT, type: "membership", title: "Makers", creator_id: CREATOR, community_id: C, status: "published" }] : [],
    memberships: paid
      ? [
          { id: M_BO, product_id: PRODUCT, creator_id: CREATOR, buyer_id: BO, buyer_email: "bo@example.com", buyer_name: "Bo", stripe_subscription_id: "sub_bo", status: "active", current_period_end: iso(NOW + 20 * DAY), cancel_at_period_end: false, past_due_since: null, amount_cents: 3000, currency: "usd" },
          { id: M_CY, product_id: PRODUCT, creator_id: CREATOR, buyer_id: CY, buyer_email: "cy@example.com", buyer_name: "Cy", stripe_subscription_id: "sub_cy", status: "canceled", current_period_end: iso(NOW + 25 * DAY), cancel_at_period_end: true, past_due_since: null, amount_cents: 3000, currency: "usd" },
        ]
      : [],
    membership_invoices: paid
      ? [
          { id: "i1", membership_id: M_BO, order_id: O_BO, amount_cents: 3000, status: "paid", period_start: iso(NOW - 10 * DAY), period_end: iso(NOW + 20 * DAY), paid_at: iso(NOW - 10 * DAY) },
          { id: "i2", membership_id: M_CY, order_id: O_CY, amount_cents: 3000, status: "paid", period_start: iso(NOW - 5 * DAY), period_end: iso(NOW + 25 * DAY), paid_at: iso(NOW - 5 * DAY) },
        ]
      : [],
    orders: paid
      ? [
          { id: O_BO, product_id: PRODUCT, creator_id: CREATOR, status: "completed", amount_cents: 3000, refund_amount_cents: null, stripe_payment_intent_id: "pi_bo", currency: "usd", buyer_email: "bo@example.com" },
          { id: O_CY, product_id: PRODUCT, creator_id: CREATOR, status: "completed", amount_cents: 3000, refund_amount_cents: null, stripe_payment_intent_id: "pi_cy", currency: "usd", buyer_email: "cy@example.com" },
        ]
      : [],
    community_members: [
      { id: "m0", community_id: C, user_id: OWNER, role: "owner", status: "active", source: "owner", invite_id: null },
      { id: "m1", community_id: C, user_id: BO, role: "member", status: "active", source: paid ? "subscription" : "free", invite_id: null },
      { id: "m2", community_id: C, user_id: CY, role: "member", status: "active", source: paid ? "subscription" : "free", invite_id: "inv1" },
    ],
    community_audit_log: [],
    ...(o.part202 === false ? {} : { community_deletions: [], community_deletion_members: [], community_setup_progress: [] }),
    ...o.extra,
  }
  return <Any>fakeDb(tables, o.part202 === false ? { failWith: { community_deletions: { code: "42P01", message: 'relation "public.community_deletions" does not exist' }, community_deletion_members: { code: "42P01", message: "missing" }, community_setup_progress: { code: "42P01", message: "missing" } } } : { unique: { community_deletions: [["community_id"]] } })
}

/** Stripe and the mailer, stubbed and recorded. The engine's sync moves the membership the way Stripe would. */
function stub(db: Any, at: { now: number }, o: { failRefund?: number; found?: Record<string, string> } = {}) {
  const calls = { update: [] as Any[], endNow: [] as string[], refunds: [] as Any[], found: [] as string[], mails: [] as Any[], after: [] as string[] }
  let failures = o.failRefund ?? 0
  let n = 0
  const deps: DeletionDeps = {
    update: async (id, params) => {
      calls.update.push([id, params.cancel_at_period_end])
      const m = db.tables.memberships.find((x: Any) => x.stripe_subscription_id === id)
      if (m) Object.assign(m, params.cancel_at_period_end ? { cancel_at_period_end: true, status: "canceled" } : { cancel_at_period_end: false, status: "active" })
    },
    sync: async (id) => ({ ...db.tables.memberships.find((x: Any) => x.stripe_subscription_id === id) }),
    endNow: async (id) => {
      calls.endNow.push(id)
      const m = db.tables.memberships.find((x: Any) => x.stripe_subscription_id === id)
      if (m) Object.assign(m, { status: "expired", current_period_end: iso(at.now), cancel_at_period_end: false })
    },
    createRefund: async (params, key) => {
      calls.refunds.push({ ...params, key })
      if (failures > 0) {
        failures--
        throw new Error("Stripe is down")
      }
      return { id: `re_${++n}`, status: "succeeded", currency: "usd", metadata: params.metadata as Record<string, string> }
    },
    findRefund: async (pi, membershipId) => {
      calls.found.push(`${pi}:${membershipId}`)
      const id = o.found?.[membershipId]
      return id ? { id, status: "succeeded", currency: "usd", metadata: { close_membership_id: membershipId } } : null
    },
    afterRefund: async (pi) => {
      calls.after.push(pi)
    },
    sendMail: async (m) => {
      calls.mails.push(m)
      return { success: true }
    },
    baseUrl: () => "https://storelib.com",
    now: () => at.now,
  }
  return { deps, calls }
}

const row = (db: Any) => db.tables.communities[0] as CommunityRow & Record<string, Any>
const audits = (db: Any) => db.tables.community_audit_log.map((a: Any) => a.action) as string[]

async function main() {
  /* ── The rules ───────────────────────────────────────────────────────── */
  console.log("\nthe rules")
  check("a renewing or still paid membership counts, an expired one does not", stillPaid({ status: "active", current_period_end: null }, NOW) && stillPaid({ status: "canceled", current_period_end: iso(NOW + DAY) }, NOW) && !stillPaid({ status: "canceled", current_period_end: iso(NOW - DAY) }, NOW) && !stillPaid({ status: "expired", current_period_end: iso(NOW + DAY) }, NOW))
  check("the date is when the last paid period ends, never before now", deletionDate([{ status: "active", current_period_end: iso(NOW + 3 * DAY) }, { status: "canceled", current_period_end: iso(NOW + 9 * DAY) }, { status: "expired", current_period_end: iso(NOW + 99 * DAY) }], NOW) === iso(NOW + 9 * DAY) && deletionDate([], NOW) === iso(NOW))
  check("a refund is the unused share, rounded down", proratedRefundCents({ paidCents: 3000, refundableCents: 3000, periodStart: iso(NOW - 10 * DAY), periodEnd: iso(NOW + 20 * DAY), now: NOW }) === 2000)
  check("never more than is left to refund, and nothing for a period that ended or a free trial", proratedRefundCents({ paidCents: 3000, refundableCents: 500, periodStart: iso(NOW - DAY), periodEnd: iso(NOW + 29 * DAY), now: NOW }) === 500 && proratedRefundCents({ paidCents: 3000, refundableCents: 3000, periodStart: iso(NOW - 40 * DAY), periodEnd: iso(NOW - 10 * DAY), now: NOW }) === 0 && proratedRefundCents({ paidCents: 0, refundableCents: 0, periodStart: iso(NOW - DAY), periodEnd: iso(NOW + DAY), now: NOW }) === 0)
  check("undo only for a period end deletion before its date", canUndoDeletion({ state: "scheduled", mode: "period_end", delete_at: iso(NOW + DAY) }, NOW) && !canUndoDeletion({ state: "scheduled", mode: "now", delete_at: iso(NOW + DAY) }, NOW) && !canUndoDeletion({ state: "scheduled", mode: "period_end", delete_at: iso(NOW - 1) }, NOW))
  check("the refund key names the community, membership, payment and amount", deletionRefundKey(C, M_BO, O_BO, 2000) === `storelib-community-close:${C}:${M_BO}:${O_BO}:2000`)

  /* ── Nobody pays ─────────────────────────────────────────────────────── */
  console.log("\ndelete, nobody pays")
  {
    const db = world({ paid: false })
    const wrong = await deleteCommunity(db, { community: row(db), actorId: OWNER, confirm: "makerz" })
    check("a wrong name changes nothing", !wrong.ok && wrong.status === 400 && wrong.field === "confirm" && !row(db).deleted_at)
    const done = await deleteCommunity(db, { community: row(db), actorId: OWNER, confirm: " Makers " })
    check("the typed name deletes it at once", done.ok && done.deleted === true && !!row(db).deleted_at && row(db).status === "archived")
    check("and it is in the audit log", audits(db).includes("community.deleted"))
    const old = world({ paid: false, part202: false })
    const before = await deleteCommunity(old, { community: row(old), actorId: OWNER, confirm: "makers" })
    check("before part 202 a free one still deletes at once", before.ok && !!row(old).deleted_at)
  }

  /* ── Somebody pays, at the end of what they paid for ─────────────────── */
  console.log("\ndelete, members pay, at period end")
  const at = { now: NOW }
  const db = world()
  const { deps, calls } = stub(db, at)
  {
    const plan = await deletionPlan(db, row(db), NOW)
    check("the plan says who pays, until when, and about what now refunds", plan.ready && plan.paying === 2 && plan.lastPaidUntil === iso(NOW + 25 * DAY) && plan.refundEstimateCents === 2000 + 2500 && plan.scheduled === null, plan)
    const old = world({ part202: false })
    const refused = await deleteCommunity(old, { community: row(old), actorId: OWNER, confirm: "Makers", mode: "period_end" }, stub(old, at).deps)
    check("before part 202 a paid one answers 503 and nothing changes", !refused.ok && refused.status === 503 && row(old).status === "published" && !row(old).deleted_at)

    const done = await deleteCommunity(db, { community: row(db), actorId: OWNER, confirm: "Makers", mode: "period_end" }, deps)
    check("scheduled, not deleted", done.ok && done.deleted === false && !!done.scheduled && !row(db).deleted_at, done)
    check("archived at once: nobody joins, nothing is on sale", row(db).status === "archived" && !!row(db).archived_at && db.tables.products[0].status === "draft")
    check("the date is when the last paid period ends", done.ok && done.scheduled?.deleteAt === iso(NOW + 25 * DAY) && db.tables.community_deletions[0].delete_at === iso(NOW + 25 * DAY))
    check("only the renewing membership was told to stop, at its period end", JSON.stringify(calls.update) === JSON.stringify([["sub_bo", true]]), calls.update)
    check("the one who had already cancelled is left as they were", db.tables.community_deletion_members.find((r: Any) => r.membership_id === M_CY)?.was_cancelling === true)
    check("every membership is stopped", done.ok && done.scheduled?.stopped === 2 && done.scheduled?.total === 2)
    check("each member is emailed once, with the date", calls.mails.length === 2 && calls.mails.every((m: Any) => /is closing on/.test(m.subject) && /will not renew/.test(m.text)) && calls.mails.map((m: Any) => m.to).sort().join() === "bo@example.com,cy@example.com", calls.mails.map((m: Any) => m.subject))
    check("no refund for a period end deletion", calls.refunds.length === 0 && calls.endNow.length === 0)
    check("the audit log has the schedule and each cancellation", audits(db).includes("community.deletion_scheduled") && audits(db).filter((a) => a === "membership.cancelled").length === 2)
    const twice = await deleteCommunity(db, { community: row(db), actorId: OWNER, confirm: "Makers" }, deps)
    check("asking twice is refused", !twice.ok && twice.status === 409)
    await runDueDeletions(db, 5_000, deps)
    check("a job run before the date deletes nothing and emails nobody again", !row(db).deleted_at && calls.mails.length === 2 && db.tables.community_deletions[0].state === "scheduled")

    /* GUARDS */
    const unarchive = await setArchived(db, { community: row(db), actorId: OWNER, archived: false })
    check("unarchiving meanwhile is refused", !unarchive.ok && unarchive.status === 409 && row(db).status === "archived")
    const life = code("lib/communities/server/membership-lifecycle.ts")
    check("a member's resume meanwhile is refused", /input\.action === "resume" && \(await closing\(db, input\.communityId\)\)/.test(life) && /from\("community_deletions"\)\.select\("state"\)/.test(life))
  }

  /* ── Undo ────────────────────────────────────────────────────────────── */
  console.log("\nundo")
  {
    calls.update.length = 0
    calls.mails.length = 0
    const kept = await undoDeletion(db, { community: row(db), actorId: OWNER }, deps)
    check("kept", kept.ok && kept.resumed === 1, kept)
    check("only the membership this deletion stopped renews again", JSON.stringify(calls.update) === JSON.stringify([["sub_bo", false]]) && db.tables.memberships.find((m: Any) => m.id === M_CY).cancel_at_period_end === true, calls.update)
    check("the community is published and on sale again", row(db).status === "published" && row(db).archived_at === null && db.tables.products[0].status === "published")
    check("the member who renews again is told", calls.mails.length === 1 && calls.mails[0].to === "bo@example.com" && /staying open/.test(calls.mails[0].subject))
    check("undone, in the audit log", db.tables.community_deletions[0].state === "undone" && audits(db).includes("community.deletion_undone") && audits(db).includes("membership.resumed"))
    const again = await undoDeletion(db, { community: row(db), actorId: OWNER }, deps)
    check("Keep twice renews nobody twice", again.ok && again.resumed === 0 && calls.update.length === 1)

    /* Scheduled again, then the date comes. */
    calls.update.length = 0
    const re = await deleteCommunity(db, { community: row(db), actorId: OWNER, confirm: "Makers" }, deps)
    check("scheduling again after an Undo works", re.ok && re.deleted === false && db.tables.community_deletions[0].state === "scheduled" && JSON.stringify(calls.update) === JSON.stringify([["sub_bo", true]]))
  }

  /* ── The job run completes it ────────────────────────────────────────── */
  console.log("\nthe job run")
  {
    /* A member starts again on /account in between: the run stops it once more and waits. */
    Object.assign(db.tables.memberships.find((m: Any) => m.id === M_BO), { status: "active", cancel_at_period_end: false })
    at.now = NOW + 26 * DAY
    db.tables.community_deletions[0].delete_at = iso(NOW + 25 * DAY)
    calls.update.length = 0
    Object.assign(db.tables.memberships.find((m: Any) => m.id === M_CY), { status: "canceled", current_period_end: iso(NOW + 25 * DAY) })
    Object.assign(db.tables.memberships.find((m: Any) => m.id === M_BO), { current_period_end: iso(NOW + 50 * DAY) })
    const first = await runDueDeletions(db, 5_000, deps)
    check("a membership that renews again holds the deletion back", first.completed === 0 && !row(db).deleted_at, first)
    const second = await runDueDeletions(db, 5_000, deps)
    check("the next run stops it again", second.completed === 0 && calls.update.some((u: Any) => u[0] === "sub_bo" && u[1] === true), calls.update)
    check("and its paid time moves the date instead of cutting it short", db.tables.community_deletions[0].delete_at === iso(NOW + 50 * DAY), db.tables.community_deletions[0].delete_at)
    at.now = NOW + 51 * DAY
    const third = await runDueDeletions(db, 5_000, deps)
    check("when every paid period has ended, it is deleted", third.completed === 1 && !!row(db).deleted_at && db.tables.community_deletions[0].state === "completed", third)
    check("once, in the audit log as scheduled", audits(db).filter((a) => a === "community.deleted").length === 1 && db.tables.community_audit_log.find((a: Any) => a.action === "community.deleted")?.detail?.scheduled === true)
    const fourth = await runDueDeletions(db, 5_000, deps)
    check("a later run finds nothing to do", fourth.checked === 0)
    const late = await undoDeletion(db, { community: row(db), actorId: OWNER }, deps)
    check("after it is deleted there is nothing to undo", !late.ok)
  }

  /* ── Now, with refunds ───────────────────────────────────────────────── */
  console.log("\ndelete now, with refunds")
  {
    const at2 = { now: NOW }
    const ndb = world()
    const s = stub(ndb, at2, { failRefund: 1 })
    const done = await deleteCommunity(ndb, { community: row(ndb), actorId: OWNER, confirm: "Makers", mode: "now" }, s.deps)
    check("both memberships end today", JSON.stringify(s.calls.endNow.sort()) === JSON.stringify(["sub_bo", "sub_cy"]))
    check("the first refund failed, so it is not deleted yet", done.ok && done.deleted === false && !row(ndb).deleted_at && ndb.tables.community_deletions[0].state === "scheduled", done)
    const bo = ndb.tables.community_deletion_members.find((r: Any) => r.membership_id === M_BO)
    const cy = ndb.tables.community_deletion_members.find((r: Any) => r.membership_id === M_CY)
    check("the amounts were decided before Stripe was asked: 20 of 30 days, 25 of 30", bo.refund_cents === 2000 && cy.refund_cents === 2500, [bo.refund_cents, cy.refund_cents])
    const failedOne = [bo, cy].find((r: Any) => !r.stripe_refund_id)
    check("the failure is kept for the retry", !!failedOne && failedOne.attempts === 1 && /Stripe is down/.test(failedOne.error))
    const firstKey = s.calls.refunds.find((r: Any) => r.metadata.close_membership_id === failedOne.membership_id)?.key
    check("a destination charge refund, with reverse_transfer and the membership in its metadata", s.calls.refunds.every((r: Any) => r.reverse_transfer === true && r.reason === "requested_by_customer" && r.metadata.refund_reason === "community_closed" && r.metadata.community_id === C))
    at2.now = NOW + 60_000
    const run = await runDueDeletions(ndb, 5_000, s.deps)
    const retries = s.calls.refunds.filter((r: Any) => r.metadata.close_membership_id === failedOne.membership_id)
    check("the job run retries under the same key, and deletes it", retries.length === 2 && retries[0].key === firstKey && retries[1].key === firstKey && run.completed === 1 && !!row(ndb).deleted_at, { keys: retries.map((r: Any) => r.key), run })
    check("one refund made per membership", new Set(s.calls.refunds.filter((r: Any) => !r.failed).map((r: Any) => r.metadata.close_membership_id)).size === 2 && ndb.tables.community_deletion_members.every((r: Any) => !!r.stripe_refund_id))
    const order = ndb.tables.orders.find((o: Any) => o.id === O_BO)
    check("the order says it was refunded, by how much", order.status === "refunded" && order.refund_amount_cents === 2000 && order.refund_reason === "community_closed" && s.calls.after.includes("pi_bo"))
    check("each member is told what comes back, once", s.calls.mails.length === 2 && s.calls.mails.some((m: Any) => m.to === "bo@example.com" && /\$20/.test(m.text)) && s.calls.mails.some((m: Any) => m.to === "cy@example.com" && /\$25/.test(m.text)), s.calls.mails.map((m: Any) => m.text))
    const refundsBefore = s.calls.refunds.length
    await runDueDeletions(ndb, 5_000, s.deps)
    check("another run refunds nobody again", s.calls.refunds.length === refundsBefore && s.calls.mails.length === 2)
    const undo = await undoDeletion(ndb, { community: row(ndb), actorId: OWNER }, s.deps)
    check("a deletion now cannot be undone", !undo.ok)
    check("refunds in the audit log", audits(ndb).filter((a) => a === "payment.refunded").length === 2)

    /* Stripe made the refund but the run stopped before it was written down: found, not made again. */
    const fdb = world()
    const f = stub(fdb, { now: NOW }, { found: { [M_BO]: "re_earlier" } })
    await deleteCommunity(fdb, { community: row(fdb), actorId: OWNER, confirm: "Makers", mode: "now" }, f.deps)
    check("a refund Stripe already has is found instead of made again", fdb.tables.community_deletion_members.find((r: Any) => r.membership_id === M_BO).stripe_refund_id === "re_earlier" && !f.calls.refunds.some((r: Any) => r.metadata.close_membership_id === M_BO) && f.calls.refunds.length === 1)
    check("and with everything settled it is deleted at once", !!row(fdb).deleted_at)
  }

  /* ── The setup list ──────────────────────────────────────────────────── */
  console.log("\nthe setup list")
  {
    const fresh: SetupFacts = {
      published: false,
      paid: true,
      paymentsReady: false,
      members: 1,
      invites: 0,
      posts: 0,
      courses: 0,
      events: 0,
      customized: false,
      rules: 0,
      classroomEnabled: false,
      eventsEnabled: false,
      name: "Makers",
      hasLogo: false,
      hasCover: true,
      hasDescription: false,
      invitesSent: 0,
      joinedWithoutInvite: 0,
      staffPosts: 0,
      appInstalled: false,
      progress: new Set(),
      isOwner: true,
    }
    const list = setupChecklist(fresh, "/b", { introUrl: "", ios: null })
    const ids = list.steps.map((s) => s.id).join(",")
    check("the steps, in order", ids === "payouts,group,rules,publish,invite,post,app,customize", ids)
    check("nothing done on day one", list.done === 0 && list.percent === 0)
    check("the group step says what is missing", /a logo and a description/.test(list.steps.find((s) => s.id === "group")!.detail))
    check("the intro is hidden while its address is empty, and the constant is empty", INTRO_VIDEO_URL === "" && !list.steps.some((s) => s.id === "intro"))
    const withIntro = setupChecklist(fresh, "/b", { introUrl: "https://example.com/intro", ios: null })
    check("with an address it is a step that opens the video", withIntro.steps.some((s) => s.id === "intro" && s.href === "https://example.com/intro" && s.external === true))
    check("watched from the list, it is done", setupChecklist({ ...fresh, progress: new Set([INTRO_WATCHED]) }, "/b", { introUrl: "https://example.com/intro", ios: null }).steps.find((s) => s.id === "intro")!.done)
    const app = list.steps.find((s) => s.id === "app")!
    check("the app step offers Google Play, and the App Store once its id is set", app.links?.map((l) => l.store).join() === "android" && /play\.google\.com\/store\/apps\/details\?id=com\.storelib\.app/.test(app.links![0].href) && setupChecklist(fresh, "/b", { introUrl: "", ios: "https://apps.apple.com/app/id123" }).steps.find((s) => s.id === "app")!.links!.map((l) => l.store).join() === "ios,android")
    check("a phone with the app, or I have it, ticks it", setupChecklist({ ...fresh, appInstalled: true }, "/b", { ios: null }).steps.find((s) => s.id === "app")!.done && setupChecklist({ ...fresh, progress: new Set([APP_CONFIRMED]) }, "/b", { ios: null }).steps.find((s) => s.id === "app")!.done)
    const two = setupChecklist({ ...fresh, invitesSent: 1, joinedWithoutInvite: 1 }, "/b", { ios: null }).steps.find((s) => s.id === "invite")!
    check("invites and joins count toward three", !two.done && two.progress?.n === 2 && /2 of 3/.test(two.detail))
    check("three is done", setupChecklist({ ...fresh, invitesSent: 2, joinedWithoutInvite: 1 }, "/b", { ios: null }).steps.find((s) => s.id === "invite")!.done)
    const full = setupChecklist({ ...fresh, hasLogo: true, hasDescription: true, rules: 2, published: true, paymentsReady: true, staffPosts: 1 }, "/b", { ios: null })
    check("the group, rules, publish, post and payouts tick from rows", ["payouts", "group", "rules", "publish", "post"].every((id) => full.steps.find((s) => s.id === id)!.done))
    const skipped = setupChecklist({ ...fresh, progress: new Set([skipKey("rules")]) }, "/b", { ios: null })
    check("a skip counts as done and leaves the Overview's list", skipped.done === 1 && skipped.steps.find((s) => s.id === "rules")!.skipped && !stepsLeft(skipped).some((s) => s.id === "rules"))
    check("the Overview gets only what is left, in its own shape", stepsLeft(full).every((s) => Object.keys(s).sort().join() === "action,detail,href,id,title") && !stepsLeft(full).some((s) => s.id === "group"))
    check("payouts are the owner's step", !setupChecklist({ ...fresh, isOwner: false }, "/b", { ios: null }).steps.some((s) => s.id === "payouts"))
    check("the pill can be hidden on its own", setupChecklist({ ...fresh, progress: new Set([PILL_HIDDEN]) }, "/b", { ios: null }).pillHidden)
    check("progress keys: a skip of a known step, the two ticks, the pill; nothing else", progressKey("skip_rules") === "skip_rules" && progressKey(INTRO_WATCHED) === INTRO_WATCHED && progressKey(APP_CONFIRMED) === APP_CONFIRMED && progressKey(PILL_HIDDEN) === PILL_HIDDEN && progressKey("skip_nope") === null && progressKey("dismissed") === null && progressKey(4) === null)

    const sdb = world({
      extra: {
        push_tokens: [{ id: "t1", user_id: OWNER, platform: "ios", token: "x" }],
        community_feed_posts: [{ id: "p1", community_id: C, author_id: OWNER, status: "published" }],
        community_invites: [{ id: "inv1", community_id: C }],
      },
    })
    Object.assign(row(sdb), { logo_url: "https://x.supabase.co/l.png", cover_url: "https://x.supabase.co/c.png", tagline: "People who make things", rules: [{ title: "Be kind", body: "" }] })
    const served = await loadSetupChecklist(sdb, { community: row(sdb), userId: OWNER, role: "owner", paymentsReady: true })
    const done = (id: string) => served.steps.find((s) => s.id === id)?.done === true
    check("read from rows: the group, the rules, the post, the app", done("group") && done("rules") && done("post") && done("app"), served.steps.map((s) => [s.id, s.done]))
    check("one invite and one member who came without one make 2 of 3", served.steps.find((s) => s.id === "invite")?.progress?.n === 2)
    const bad = await markSetupProgress(sdb, { communityId: C, userId: OWNER, step: "dismissed", on: true })
    check("an unknown key is refused", !bad.ok && bad.status === 400)
    await markSetupProgress(sdb, { communityId: C, userId: OWNER, step: "skip_invite", on: true })
    await markSetupProgress(sdb, { communityId: C, userId: OWNER, step: "skip_invite", on: true })
    check("a skip is one row, however often", sdb.tables.community_setup_progress.filter((r: Any) => r.step === "skip_invite").length === 1)
    const after = await loadSetupChecklist(sdb, { community: row(sdb), userId: OWNER, role: "owner", paymentsReady: true })
    check("and the list reads it", after.steps.find((s) => s.id === "invite")?.skipped === true)
    await markSetupProgress(sdb, { communityId: C, userId: OWNER, step: "skip_invite", on: false })
    check("taken back", sdb.tables.community_setup_progress.length === 0)
    const adminView = await loadSetupChecklist(sdb, { community: row(sdb), userId: ADMIN, role: "admin", paymentsReady: true })
    check("another admin has their own ticks: no phone of theirs, but the owner's post counts", !adminView.steps.find((s) => s.id === "app")?.done && adminView.steps.find((s) => s.id === "post")?.done === true)
    const odb = world({ part202: false })
    const notReady = await markSetupProgress(odb, { communityId: C, userId: OWNER, step: "skip_rules", on: true })
    check("before part 202 a skip says not_ready", !notReady.ok && notReady.status === 503 && notReady.error === "not_ready")
    const oldList = await loadSetupChecklist(odb, { community: row(odb), userId: OWNER, role: "owner", paymentsReady: true })
    check("and the list still reads from rows", oldList.total > 0)
  }

  /* ── The create wizard ───────────────────────────────────────────────── */
  console.log("\nthe create wizard")
  {
    check("five steps", WIZARD_STEPS.join() === "name,look,access,welcome,review")
    const d = emptyDraft()
    check("a name is asked first", checkWizardStep("name", d).ok === false && (checkWizardStep("name", d) as Any).field === "name")
    check("an address that cannot be one is said beside it", (checkWizardStep("name", { ...d, name: "Makers", slug: "a" }) as Any).field === "slug" && (checkWizardStep("name", { ...d, name: "Makers", slug: "app" }) as Any).field === "slug")
    check("a paid community needs a price", (checkWizardStep("access", { ...d, name: "Makers", type: "paid", price: "" }) as Any).field === "price" && checkWizardStep("access", { ...d, name: "Makers", type: "paid", price: "19" }).ok)
    const sent = checkWizard({ name: "Makers", slug: "Makers-Club", description: "", type: "free", welcomeTitle: "Welcome", welcomeBody: "Say hello", spaceName: "Lobby" })
    check("the server reads the address, the first space and the welcome post", sent.ok && sent.value.slug === "makers-club" && sent.value.spaceName === "Lobby" && sent.value.welcome?.title === "Welcome" && sent.value.welcome?.body === "Say hello", sent)
    const noSlug = checkWizard({ name: "Makers", type: "free" })
    check("without them it is the create flow it always was", noSlug.ok && noSlug.value.slug === null && noSlug.value.welcome === null && noSlug.value.spaceName === null)
    check("a saved draft is read back safely", readDraft(JSON.stringify({ ...d, name: "Makers", step: 3 }))?.step === 3 && readDraft("{bad") === null && readDraft(JSON.stringify({ step: 99 }))?.step === 0)
    const flow = createFlow()
    check("create posts the address, the space and the welcome, and 402 still opens the upgrade sheet", /slug: draft\.slug/.test(flow) && /res\.status === 402/.test(flow) && /<UpgradeSheet/.test(flow))
    check("the draft is kept in this browser only, inside try", /localStorage\.setItem\(DRAFT_KEY/.test(flow) && /try \{[^}]*localStorage/.test(flow))
    const server = code("lib/communities/server/creator.ts")
    check("the server takes the address as asked and refuses one that is taken beside its field", /slug: a\.input\.slug \?\? null/.test(server) && /made\.error === "slug_taken"\) return no\(409, "That address is taken\.", "slug"\)/.test(server))
    check("the welcome post is the owner's, pinned, and never fails the create", /createCreatorPost\(db, \{ community, role: "owner", actorId: a\.userId, spaceId: general\.id/.test(server) && /pin: true/.test(server))
  }

  /* ── SQL ─────────────────────────────────────────────────────────────── */
  console.log("\nSQL part 202")
  {
    const file = "202_community_deletion_and_setup.sql"
    const part = raw(`supabase/sql/run-now/${file}`)
    const lines = part.trimEnd().split("\n")
    check("line 1 is the summary, safe to run again", /^\/\* .*\(round 33\), run after part 81\..*Safe to run again\. \*\/$/.test(lines[0]))
    check("one statement per line, notify last", lines.slice(1).every((l) => l.trim().endsWith(";")) && lines[lines.length - 1] === "notify pgrst, 'reload schema';")
    check("only adds", !/DROP TABLE|DROP COLUMN|DELETE FROM|^UPDATE |TRUNCATE/im.test(part) && !/CREATE TABLE public|CREATE INDEX (?!IF NOT EXISTS)/.test(part))
    check("every new table is server only", ["community_deletions", "community_deletion_members", "community_setup_progress"].every((t) => part.includes(`CREATE TABLE IF NOT EXISTS public.${t} (`) && part.includes(`ALTER TABLE public.${t} ENABLE ROW LEVEL SECURITY;`) && part.includes(`REVOKE ALL ON public.${t} FROM PUBLIC, anon, authenticated;`) && part.includes(`GRANT SELECT, INSERT, UPDATE, DELETE ON public.${t} TO service_role;`)))
    check("no policy lets a browser in", !/CREATE POLICY|GRANT [A-Z, ]+ TO (anon|authenticated)/i.test(part))
    check("one row per membership and a refund kept with it", /PRIMARY KEY \(community_id, membership_id\)/.test(part) && /stripe_refund_id text/.test(part) && /refund_cents integer/.test(part))
    check("the migration copy is the part, byte for byte", existsSync("supabase/migrations/20270128_community_deletion_and_setup.sql") && raw("supabase/migrations/20270128_community_deletion_and_setup.sql") === part)
    check("its README row and its check after column", raw("supabase/sql/run-now/README.md").includes(`| \`${file}\` |`) && /as p202_community_deletion_and_setup[,;]/.test(raw("supabase/sql/run-now/99_check_after.sql")))
    check("in the built files and the parts record", raw("supabase/sql/run-four/3_of_4_latest.sql").includes(`-- part ${file}`) && raw("lib/admin/sql-parts.generated.ts").includes(`part: "202", file: "${file}"`))
  }

  /* ── Wiring ──────────────────────────────────────────────────────────── */
  console.log("\nwiring")
  {
    const del = code("app/api/app/community/[id]/delete/route.ts")
    check("delete, its plan and Keep: the owner only, rate limited", (del.match(/requireCreatorCommunity\(id, "delete"\)/g) ?? []).length === 2 && /manageLimit/.test(del) && /body\.undo === true/.test(del))
    const setup = code("app/api/app/community/[id]/setup/route.ts")
    check("the setup list: owners and admins (manage_settings), rate limited writes", /requireCreatorCommunity\(id, "manage_settings"\)/.test(setup) && /manageLimit/.test(setup))
    const cron = code("app/api/cron/community/route.ts")
    check("the job run carries the deletions on, only while communities are on", /on \? await runDueDeletions\(db, 10_000\)/.test(cron))
    const overview = code("lib/communities/server/creator.ts")
    check("the Overview's Set up card reads the setup list", /stepsLeft\(\s*setupChecklist\(/.test(overview) && /setupExtras\(db, c, ctx\.userId\)/.test(overview))
    const sidebar = code("components/app/sidebar.tsx")
    check("on a community's pages the floating pill is the community's own, and the store's steps aside", /<CommunitySetupPill/.test(sidebar) && /!inCommunity/.test(sidebar))
    const pill = code("components/community/creator/setup-pill.tsx")
    check("the pill reads its list, can skip a step and hide itself", /\/api\/app\/community\/\$\{encodeURIComponent\(slug\)\}\/setup/.test(pill) && /skipKey\(/.test(pill) && /PILL_HIDDEN/.test(pill))
    const dialog = code("components/community/creator/delete-community.tsx")
    check("the dialog asks the plan, offers both ways, the typed name, and Keep", /\/delete`, "GET"/.test(dialog) && /"period_end"/.test(dialog) && /"now"/.test(dialog) && /undo: true/.test(dialog) && /typed\.trim\(\) === head\.name\.trim\(\)/.test(dialog))
  }

  /* ── Copy ────────────────────────────────────────────────────────────── */
  console.log("\ncopy")
  const mine = [
    "lib/communities/community-deletion.ts",
    "lib/communities/server/community-deletion.ts",
    "lib/communities/setup-checklist.ts",
    "lib/communities/server/setup-checklist.ts",
    "lib/communities/create-wizard.ts",
    "components/community/creator/create-flow.tsx",
    "components/community/creator/delete-community.tsx",
    "components/community/creator/setup-pill.tsx",
    "app/api/app/community/[id]/delete/route.ts",
    "app/api/app/community/[id]/setup/route.ts",
    "app/api/app/community/route.ts",
    "app/api/get-app/route.ts",
    "supabase/sql/run-now/202_community_deletion_and_setup.sql",
  ]
  for (const f of mine) {
    const text = raw(f)
    check(`${f}: no em dash`, !text.includes("—"))
    check(`${f}: no banned word`, !/\b(unlock|elevate|seamless(ly)?|powerful|effortless(ly)?|supercharge|transform)\b/i.test(text))
  }
  for (const f of mine.filter((x) => x.endsWith(".tsx"))) check(`${f}: a client file imports no server code`, !/from "@\/lib\/communities\/server|next\/headers|"server-only"/.test(code(f)))

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) process.exit(1)
}

function createFlow(): string {
  return code("components/community/creator/create-flow.tsx")
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
