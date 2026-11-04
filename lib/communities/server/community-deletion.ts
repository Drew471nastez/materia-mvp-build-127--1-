import "server-only"

/**
 * ===========================================================================
 *  DELETING A COMMUNITY THAT MEMBERS PAY FOR (round 33)
 * ===========================================================================
 * The rules are in ../community-deletion.ts. This is where they run, on the
 * memberships engine and never beside it:
 *
 *   SCHEDULE   scheduleDeletion, from the owner's typed name (the route asks
 *              requireCreatorCommunity(id, "delete"): the owner only). The
 *              community is archived at once (nobody joins, nothing is on
 *              sale, members can still read it), one row in
 *              community_deletions says how and when, and one row per paid
 *              membership in community_deletion_members says what was done
 *              to it. Then as many memberships as fit in a few seconds are
 *              stopped; the community job run (runDueDeletions, every five
 *              minutes) does the rest.
 *   STOP       PERIOD END: Stripe's cancel_at_period_end on the member's
 *              subscription, then the engine's sync (lib/memberships/sync),
 *              exactly what the member's own Cancel does
 *              (./membership-lifecycle changeCommunityMembership). A member
 *              who had already cancelled is left as they were, and Undo
 *              leaves them cancelled too.
 *              NOW: the subscription is cancelled at once (the engine's
 *              sync takes access away), then the unused part of the last
 *              payment is refunded the way Orders refunds: a destination
 *              charge refund with reverse_transfer, so the creator's share
 *              comes back from their connected account.
 *   REFUND ONCE  the amount and the payment are written on the member's row
 *              before Stripe is asked, the refund carries an idempotency key
 *              made of the community, the membership, the payment and the
 *              amount, Stripe is asked first whether a refund with this
 *              membership in its metadata already exists, and the refund id
 *              is kept. A retry, a double tap or two job runs at once make
 *              one refund.
 *   EMAIL      each member once (emailed_at is claimed before sending).
 *   UNDO       undoDeletion, before the date and only for a period end
 *              deletion, and (round 26) only while the plan has a place for
 *              it: every membership this deletion stopped renews again
 *              (cancel_at_period_end false), the community comes back as it
 *              was, and each of those members is told. A resume that fails
 *              is said, and Undo again tries only those.
 *   COMPLETE   when the date comes and every membership is stopped (and
 *              refunded, for NOW): the community is deleted the way it always
 *              was (deleted_at, archived, off sale; rows, posts and orders
 *              kept). A membership somebody started again in between pushes
 *              the date back instead.
 *
 * Every step writes the community's audit log. Every Stripe and email call
 * goes through `deps`, so tests/community-lifecycle-round33.test.ts runs all
 * of it against the in-memory database with a stubbed Stripe.
 *
 * Before part 202 a community nobody pays for is still deleted at once;
 * scheduling one that somebody pays for answers 503 and changes nothing.
 */
import { platformEmail as drawEmail, type EmailSender, type PlatformEmailInput } from "@/lib/emails/layout"
import { inboxPicture } from "@/lib/notify/templates"
import { money } from "@/lib/memberships/state"
import type { CommunityRow } from "../types"
import { canUndoDeletion, deletionDate, deletionRefundKey, emailDate, isDeletionMode, proratedRefundCents, renews, stillPaid, type DeletionMode, type DeletionPlanView, type ScheduledDeletionView } from "../community-deletion"
import { audit } from "./audit"
import { communityGone } from "./community-gone"
import { isUniqueViolation, missing, nowIso, reasonOf, type Db } from "./db"
import { communityProducts, defaultRefundDeps, defaultSubscriptionDeps, type RefundLike } from "./membership-lifecycle"
import { syncTierProducts } from "./tiers"
import { communityRoom } from "./creator-policies"
import { KEEP_LIMIT_TEXT, type CommunityPlan } from "../plan-limit"
import { LOGO_FILE_PX } from "@/lib/emails/brand-mark"

export type DeletionResult<T = unknown> = ({ ok: true } & T) | { ok: false; status: number; error: string; field?: string }
const no = (status: number, error: string, field?: string) => ({ ok: false as const, status, error, field })

/* ── Stripe and email, through deps ───────────────────────────────────── */

export interface PaidMembership {
  id: string
  product_id: string | null
  creator_id: string | null
  buyer_id: string | null
  buyer_email: string | null
  buyer_name: string | null
  stripe_subscription_id: string | null
  status: string
  current_period_end: string | null
  cancel_at_period_end: boolean | null
  past_due_since: string | null
  amount_cents: number | null
  currency: string | null
}

export interface DeletionDeps {
  /** Stripe's subscriptions.update on Storelib's platform account. */
  update: (subscriptionId: string, params: { cancel_at_period_end: boolean }) => Promise<unknown>
  /** The engine's sync: the membership as Stripe has it now. */
  sync: (subscriptionId: string) => Promise<Partial<PaidMembership> | null>
  /** Ends a subscription today, through the engine's sync. */
  endNow: (subscriptionId: string) => Promise<void>
  createRefund: (params: Record<string, unknown>, idempotencyKey: string) => Promise<RefundLike>
  /** A refund already made for this membership's closing, found by its metadata, or null. */
  findRefund: (paymentIntentId: string, membershipId: string) => Promise<RefundLike | null>
  /** The seller's balance and the order's record, as charge.refunded would; never throws. */
  afterRefund: (paymentIntentId: string) => Promise<void>
  sendMail: (mail: { to: string; subject: string; html: string; text: string; fromName: string | null; replyTo: string | null }) => Promise<{ success: boolean }>
  baseUrl: () => string
  now: () => number
  /** The owner's plan, for Keep's place on it (round 26); read where Sites reads it when absent. */
  plan?: (creatorId: string) => Promise<CommunityPlan>
}

export function defaultDeletionDeps(db: Db): DeletionDeps {
  const sub = defaultSubscriptionDeps(db)
  const refund = defaultRefundDeps(db)
  return {
    update: sub.update,
    sync: sub.sync as DeletionDeps["sync"],
    endNow: refund.endSubscription,
    createRefund: refund.createRefund,
    findRefund: async (paymentIntentId, membershipId) => {
      const { stripe } = await import("@/lib/stripe")
      const list = await stripe.refunds.list({ payment_intent: paymentIntentId, limit: 100 })
      const hit = list.data.find((r) => (r.metadata as Record<string, string> | null)?.close_membership_id === membershipId && r.status !== "failed" && r.status !== "canceled")
      return hit ? { id: hit.id, status: hit.status ?? null, currency: hit.currency ?? null, metadata: (hit.metadata as Record<string, string>) ?? null } : null
    },
    afterRefund: refund.afterRefund,
    sendMail: refund.sendMail,
    baseUrl: refund.baseUrl,
    now: () => Date.now(),
  }
}

/* ── Reading ──────────────────────────────────────────────────────────── */

const PAID_FIELDS = "id, product_id, creator_id, buyer_id, buyer_email, buyer_name, stripe_subscription_id, status, current_period_end, cancel_at_period_end, past_due_since, amount_cents, currency"
const PAGE = 1000

/** Every membership of this community's products that still lets somebody in because they paid, a page at a time. */
export async function paidMemberships(db: Db, communityId: string, now: number = Date.now()): Promise<PaidMembership[]> {
  const ids = (await communityProducts(db, communityId)).filter((p) => p.type === "membership").map((p) => p.id)
  if (!ids.length) return []
  const out: PaidMembership[] = []
  let after: string | null = null
  for (let page = 0; page < 50; page++) {
    let q = db.from("memberships").select(PAID_FIELDS).in("product_id", ids).in("status", ["active", "trialing", "past_due", "canceled"])
    if (after) q = q.gt("id", after)
    const { data, error } = await q.order("id", { ascending: true }).limit(PAGE)
    if (error) {
      if (!missing(error)) console.error(`[communities] deletion memberships: ${reasonOf(error)}`)
      break
    }
    const rows = (data as PaidMembership[] | null) ?? []
    for (const m of rows) if (stillPaid(m, now)) out.push(m)
    if (rows.length < PAGE) break
    after = rows[rows.length - 1].id
  }
  return out
}

export interface DeletionRow {
  community_id: string
  state: "scheduled" | "completed" | "undone"
  mode: DeletionMode
  delete_at: string
  requested_by: string | null
  requested_at: string
  prior_status: string
  prior_archived_at: string | null
  members_total: number
}

export interface DeletionMemberRow {
  community_id: string
  membership_id: string
  stripe_subscription_id: string | null
  buyer_id: string | null
  buyer_email: string | null
  mode: DeletionMode
  period_end: string | null
  was_cancelling: boolean
  cancelled_at: string | null
  refund_order_id: string | null
  refund_cents: number | null
  stripe_refund_id: string | null
  refunded_at: string | null
  emailed_at: string | null
  resumed_at: string | null
  attempts: number
  error: string | null
}

/** The community's deletion row, or null; `ready` is false before part 202. */
export async function readDeletion(db: Db, communityId: string): Promise<{ ready: boolean; row: DeletionRow | null }> {
  try {
    const { data, error } = await db.from("community_deletions").select("*").eq("community_id", communityId).maybeSingle()
    if (error) {
      if (!missing(error)) console.error(`[communities] deletion read: ${reasonOf(error)}`)
      return { ready: !missing(error), row: null }
    }
    return { ready: true, row: (data as DeletionRow | null) ?? null }
  } catch (e) {
    console.error(`[communities] deletion read: ${reasonOf(e)}`)
    return { ready: false, row: null }
  }
}

/** Whether this community is on its way to being deleted: what the archive, resume and publish paths ask first. */
export async function deletionScheduled(db: Db, communityId: string): Promise<boolean> {
  const { row } = await readDeletion(db, communityId)
  return row?.state === "scheduled"
}

async function memberRows(db: Db, communityId: string): Promise<DeletionMemberRow[]> {
  const { data, error } = await db.from("community_deletion_members").select("*").eq("community_id", communityId).limit(5000)
  if (error) return []
  return (data as DeletionMemberRow[] | null) ?? []
}

/** A membership's row is settled when it is stopped and, for a deletion now, its refund is made. */
function settled(r: DeletionMemberRow): boolean {
  return !!r.cancelled_at && (r.mode !== "now" || !r.refund_cents || !!r.stripe_refund_id)
}

function scheduledView(row: DeletionRow, members: DeletionMemberRow[], now: number): ScheduledDeletionView {
  return {
    mode: row.mode,
    deleteAt: row.delete_at,
    requestedAt: row.requested_at,
    stopped: members.filter((m) => !!m.cancelled_at).length,
    total: Math.max(row.members_total, members.length),
    failing: members.filter((m) => !settled(m) && m.attempts > 0).length,
    canUndo: canUndoDeletion(row, now),
  }
}

/**
 * ROUND 51: PAID TICKETS HOLD A DELETION BACK. Memberships were stopped and
 * refunded through Stripe, but an event somebody bought a ticket for was
 * deleted with the community and its money kept. Each event still to come
 * with a paid ticket is named; the owner cancels it in Events, which refunds
 * every ticket (./event-admin.ts refundEveryTicketFor), and then deletes.
 * Before the tickets part has run there are none.
 */
export async function ticketedEventsAhead(db: Db, communityId: string, now: number = Date.now()): Promise<{ id: string; title: string; sold: number }[]> {
  try {
    const { data: events, error } = await db.from("community_events").select("id, title, starts_at, ends_at, status").eq("community_id", communityId).neq("status", "cancelled").limit(500)
    if (error) {
      if (!missing(error)) console.error(`[communities] deletion events ${communityId}: ${reasonOf(error)}`)
      return []
    }
    const ahead = ((events as { id: string; title: string; starts_at: string; ends_at: string | null }[] | null) ?? []).filter((e) => Date.parse(e.ends_at ?? e.starts_at) > now)
    if (!ahead.length) return []
    const { data: tickets, error: ticketError } = await db.from("community_event_tickets").select("event_id").in("event_id", ahead.map((e) => e.id)).eq("status", "paid").eq("source", "purchase").gt("amount_cents", 0).limit(5000)
    if (ticketError) {
      if (!missing(ticketError)) console.error(`[communities] deletion tickets ${communityId}: ${reasonOf(ticketError)}`)
      return []
    }
    const sold = new Map<string, number>()
    for (const t of (tickets as { event_id: string }[] | null) ?? []) sold.set(t.event_id, (sold.get(t.event_id) ?? 0) + 1)
    return ahead.filter((e) => sold.has(e.id)).map((e) => ({ id: e.id, title: e.title, sold: sold.get(e.id) ?? 0 }))
  } catch (e) {
    console.error(`[communities] deletion tickets ${communityId}: ${reasonOf(e)}`)
    return []
  }
}

/** The refusal while tickets are sold for events ahead. */
export function ticketsHoldText(events: { title: string }[]): string {
  const names = events.slice(0, 3).map((e) => `"${e.title}"`).join(", ")
  return `People bought tickets for ${names}${events.length > 3 ? " and more" : ""}. Cancel ${events.length === 1 ? "that event" : "those events"} in Events and refund the tickets, then delete the community.`
}

const ESTIMATE_SAMPLE = 200

/** What the dialog shows before it asks: who pays, until when, about what a deletion now refunds, and what is scheduled. */
export async function deletionPlan(db: Db, community: Pick<CommunityRow, "id">, now: number = Date.now()): Promise<DeletionPlanView> {
  const [{ ready, row }, paid, ticketedEvents] = await Promise.all([readDeletion(db, community.id), paidMemberships(db, community.id, now), ticketedEventsAhead(db, community.id, now)])
  /* About, as the dialog says: the first ESTIMATE_SAMPLE payments are read and the rest counted at their average. */
  let refund = 0
  let currency = "usd"
  const sample = paid.slice(0, ESTIMATE_SAMPLE)
  const lasts = await Promise.all(sample.map((m) => lastPayment(db, m.id)))
  sample.forEach((m, i) => {
    if (m.currency) currency = m.currency.toLowerCase()
    const last = lasts[i]
    if (last) refund += proratedRefundCents({ paidCents: last.paidCents, refundableCents: last.refundableCents, periodStart: last.periodStart, periodEnd: last.periodEnd, now })
  })
  if (paid.length > sample.length && sample.length) refund = Math.round((refund / sample.length) * paid.length)
  const scheduled = row && row.state === "scheduled" ? scheduledView(row, await memberRows(db, community.id), now) : null
  return { ready, paying: paid.length, lastPaidUntil: paid.length ? deletionDate(paid, now) : null, refundEstimateCents: refund, currency, scheduled, ticketedEvents }
}

/** The membership's last paid payment: its order, what it paid and for which period. */
async function lastPayment(db: Db, membershipId: string): Promise<{ orderId: string; paidCents: number; refundableCents: number; periodStart: string | null; periodEnd: string | null; paymentIntentId: string | null; order: Record<string, unknown> } | null> {
  const { data: inv } = await db.from("membership_invoices").select("order_id, amount_cents, period_start, period_end, paid_at, status").eq("membership_id", membershipId).eq("status", "paid").order("paid_at", { ascending: false }).limit(1)
  const invoice = ((inv as { order_id: string | null; amount_cents: number | null; period_start: string | null; period_end: string | null }[] | null) ?? [])[0]
  if (!invoice?.order_id) return null
  const { data: order } = await db.from("orders").select("*").eq("id", invoice.order_id).maybeSingle()
  if (!order) return null
  const o = order as Record<string, unknown>
  const total = Math.max(0, Math.round(Number(o.amount_cents) || 0))
  const before = o.status === "refunded" ? Math.max(0, Math.round(Number(o.refund_amount_cents) || 0)) : 0
  const refundable = o.status === "completed" || o.status === "refunded" ? Math.max(0, total - before) : 0
  return {
    orderId: invoice.order_id,
    paidCents: Math.max(0, Math.round(Number(invoice.amount_cents) || total)),
    refundableCents: refundable,
    periodStart: invoice.period_start,
    periodEnd: invoice.period_end,
    paymentIntentId: typeof o.stripe_payment_intent_id === "string" ? o.stripe_payment_intent_id : null,
    order: o,
  }
}

/* ── Emails ───────────────────────────────────────────────────────────── */

type MailKind = "closing" | "closed" | "staying"

function memberEmail(kind: MailKind, m: { communityName: string; url: string; date: string | null; refund: string | null; logoUrl?: string | null }): { subject: string; html: string; text: string } {
  const name = m.communityName.replace(/[\r\n]+/g, " ").trim() || "This community"
  const date = emailDate(m.date)
  /* From the community, by its own name and picture, as every email it sends its members (lib/notify/templates brandOf). */
  const sender: EmailSender = { kind: "store", name, pictureUrl: inboxPicture(m.logoUrl, LOGO_FILE_PX), picture: "mark", url: m.url }
  const platformEmail = (input: PlatformEmailInput) => drawEmail({ ...input, sender })
  if (kind === "staying") {
    const subject = `${name} is staying open`
    const paragraphs = [`The owner of ${name} changed their mind: the community stays open.`, `Your membership carries on as before and renews on ${date}.`]
    const { html } = platformEmail({ subject, heading: subject, paragraphs, action: { label: "Open the community", url: m.url }, reason: `You pay for a membership of ${name} on Storelib.` })
    return { subject, html, text: [...paragraphs, "", `Open the community: ${m.url}`].join("\n") }
  }
  if (kind === "closed") {
    const subject = `${name} has closed`
    const paragraphs = [`The owner of ${name} closed the community today, so your membership has ended and you will not be charged again.`, m.refund ? `You get ${m.refund} back for the time you had left. It reaches your card in 5 to 10 days.` : "Nothing was left to refund on your last payment."]
    const { html } = platformEmail({ subject, heading: subject, paragraphs, reason: `You paid for a membership of ${name} on Storelib.` })
    return { subject, html, text: paragraphs.join("\n\n") }
  }
  const subject = `${name} is closing on ${date}`
  const paragraphs = [`The owner of ${name} is closing the community. It closes on ${date}.`, `Your membership will not renew and you will not be charged again. You keep full access until then.`]
  const { html } = platformEmail({ subject, heading: `${name} is closing`, paragraphs, action: { label: "Open the community", url: m.url }, reason: `You pay for a membership of ${name} on Storelib.` })
  return { subject, html, text: [...paragraphs, "", `Open the community: ${m.url}`].join("\n") }
}

const sendable = (to: string | null | undefined): to is string => typeof to === "string" && to.includes("@") && !to.endsWith("@storelib.invalid")

/**
 * One email to one member, once: emailed_at is claimed by a conditional
 * update first (only the run that changes it from empty sends), and given
 * back when the send fails, so the next run tries again.
 */
async function emailOnce(db: Db, deps: DeletionDeps, community: Pick<CommunityRow, "id" | "name" | "slug"> & { logo_url?: string | null }, row: DeletionMemberRow, kind: "closing" | "closed", facts: { date: string | null; refundCents: number; currency: string }): Promise<boolean> {
  if (!sendable(row.buyer_email)) return false
  const stamp = nowIso(deps.now())
  const { data } = await db.from("community_deletion_members").update({ emailed_at: stamp }).eq("community_id", community.id).eq("membership_id", row.membership_id).is("emailed_at", null).select("membership_id")
  if (!Array.isArray(data) || data.length !== 1) return false
  const mail = memberEmail(kind, { communityName: community.name, url: `${deps.baseUrl()}/community/${community.slug}`, date: facts.date, refund: facts.refundCents > 0 ? money(facts.refundCents, facts.currency) : null, logoUrl: community.logo_url ?? null })
  const sent = await deps.sendMail({ to: row.buyer_email, ...mail, fromName: community.name, replyTo: null }).catch(() => ({ success: false }))
  if (!sent.success) {
    await db.from("community_deletion_members").update({ emailed_at: null }).eq("community_id", community.id).eq("membership_id", row.membership_id)
    return false
  }
  return true
}

/* ── Stopping one membership ──────────────────────────────────────────── */

async function membershipNow(db: Db, id: string): Promise<PaidMembership | null> {
  const { data } = await db.from("memberships").select(PAID_FIELDS).eq("id", id).maybeSingle()
  return (data as PaidMembership | null) ?? null
}

async function noteFailure(db: Db, row: DeletionMemberRow, e: unknown): Promise<void> {
  const why = reasonOf(e).slice(0, 500)
  console.error(`[communities] deletion of ${row.community_id}: membership ${row.membership_id} not stopped yet: ${why}`)
  await db.from("community_deletion_members").update({ attempts: (row.attempts ?? 0) + 1, error: why, updated_at: nowIso() }).eq("community_id", row.community_id).eq("membership_id", row.membership_id)
}

async function patchRow(db: Db, row: DeletionMemberRow, patch: Partial<DeletionMemberRow>): Promise<void> {
  Object.assign(row, patch)
  await db.from("community_deletion_members").update({ ...patch, updated_at: nowIso() }).eq("community_id", row.community_id).eq("membership_id", row.membership_id)
}

/** PERIOD END: the subscription stops renewing; access runs to the end of what was paid. */
async function stopAtPeriodEnd(db: Db, deps: DeletionDeps, community: CommunityRow, row: DeletionMemberRow, actorId: string | null): Promise<void> {
  if (!row.cancelled_at) {
    const m = await membershipNow(db, row.membership_id)
    let end = m?.current_period_end ?? row.period_end
    let already = true
    if (m && renews(m) && m.stripe_subscription_id) {
      await deps.update(m.stripe_subscription_id, { cancel_at_period_end: true })
      const next = await deps.sync(m.stripe_subscription_id)
      end = next?.current_period_end ?? end
      already = false
    }
    await patchRow(db, row, { cancelled_at: nowIso(deps.now()), period_end: end ?? null, was_cancelling: already, error: null })
    await audit(db, { communityId: community.id, actorId, actorKind: actorId ? "member" : "system", action: "membership.cancelled", targetType: "member", targetId: row.buyer_id, reason: "community_deleted", detail: { membershipId: row.membership_id, endsAt: end, alreadyCancelling: already } })
  }
  await emailOnce(db, deps, community, row, "closing", { date: row.period_end, refundCents: 0, currency: "usd" })
}

/** NOW: the subscription ends today, then the unused part of the last payment goes back, once. */
async function stopNow(db: Db, deps: DeletionDeps, community: CommunityRow, row: DeletionMemberRow, actorId: string | null): Promise<void> {
  let last: Awaited<ReturnType<typeof lastPayment>> = null
  if (!row.cancelled_at) {
    const m = await membershipNow(db, row.membership_id)
    /* The amount is decided once, before anything is asked of Stripe, and kept: a retry refunds what was decided. */
    if (row.refund_cents === null || row.refund_cents === undefined) {
      last = await lastPayment(db, row.membership_id)
      const cents = last ? proratedRefundCents({ paidCents: last.paidCents, refundableCents: last.refundableCents, periodStart: last.periodStart, periodEnd: last.periodEnd, now: deps.now() }) : 0
      await patchRow(db, row, { refund_order_id: last?.orderId ?? null, refund_cents: cents })
    }
    if (m && m.stripe_subscription_id && stillPaid(m, deps.now())) {
      try {
        await deps.endNow(m.stripe_subscription_id)
      } catch (e) {
        /* Ended already (a run that stopped before writing it down): Stripe refuses a second cancel, and the engine's sync says so. */
        const now = await deps.sync(m.stripe_subscription_id).catch(() => null)
        if (!now || stillPaid({ status: String(now.status ?? ""), current_period_end: now.current_period_end ?? null, past_due_since: now.past_due_since ?? null }, deps.now())) throw e
      }
    }
    await patchRow(db, row, { cancelled_at: nowIso(deps.now()), period_end: nowIso(deps.now()), error: null })
    await audit(db, { communityId: community.id, actorId, actorKind: actorId ? "member" : "system", action: "membership.cancelled", targetType: "member", targetId: row.buyer_id, reason: "community_deleted", detail: { membershipId: row.membership_id, endedNow: true, refundCents: row.refund_cents } })
  }
  if (row.refund_cents && row.refund_cents > 0 && !row.stripe_refund_id && row.refund_order_id) {
    last = last && last.orderId === row.refund_order_id ? last : await lastPaymentOf(db, row.refund_order_id)
    if (!last?.paymentIntentId) throw new Error("the payment has no Stripe payment to refund")
    const cents = row.refund_cents
    const o = last.order
    let refund = await deps.findRefund(last.paymentIntentId, row.membership_id)
    if (!refund) {
      refund = await deps.createRefund(
        {
          payment_intent: last.paymentIntentId,
          amount: cents,
          reason: "requested_by_customer",
          /* Destination charge: the creator's share comes back from their connected account, as from Orders. */
          reverse_transfer: true,
          metadata: { order_id: row.refund_order_id, creator_id: String(o.creator_id ?? community.creator_id ?? ""), product_id: String(o.product_id ?? ""), refund_reason: "community_closed", community_id: community.id, close_membership_id: row.membership_id },
        },
        deletionRefundKey(community.id, row.membership_id, row.refund_order_id, cents),
      )
    }
    if (refund.status === "failed" || refund.status === "canceled") throw new Error(`the refund ${refund.id} ${refund.status}`)
    await patchRow(db, row, { stripe_refund_id: refund.id, refunded_at: nowIso(deps.now()), error: null })
    /* The order's own record, once per refund: a retry that found this refund already written leaves it alone. */
    if (o.stripe_refund_id !== refund.id) {
      const total = Math.max(0, Math.round(Number(o.amount_cents) || 0))
      const before = o.status === "refunded" ? Math.max(0, Math.round(Number(o.refund_amount_cents) || 0)) : 0
      await db.from("orders").update({ status: "refunded" }).eq("id", row.refund_order_id)
      try {
        await db.from("orders").update({ refunded_at: nowIso(deps.now()), refund_reason: "community_closed", refund_amount_cents: Math.min(total, before + cents), stripe_refund_id: refund.id }).eq("id", row.refund_order_id)
      } catch {
        /* Older databases have no refund columns; the status above is enough. */
      }
    }
    await deps.afterRefund(last.paymentIntentId)
    await audit(db, { communityId: community.id, actorId, actorKind: actorId ? "member" : "system", action: "payment.refunded", targetType: "order", targetId: row.refund_order_id, reason: "community_closed", detail: { refundId: refund.id, amountCents: cents, membershipId: row.membership_id } })
  }
  if (settled(row)) await emailOnce(db, deps, community, row, "closed", { date: null, refundCents: row.stripe_refund_id ? row.refund_cents ?? 0 : 0, currency: String(last?.order?.currency ?? "usd").toLowerCase() })
}

async function lastPaymentOf(db: Db, orderId: string): Promise<Awaited<ReturnType<typeof lastPayment>>> {
  const { data: order } = await db.from("orders").select("*").eq("id", orderId).maybeSingle()
  if (!order) return null
  const o = order as Record<string, unknown>
  return { orderId, paidCents: Number(o.amount_cents) || 0, refundableCents: 0, periodStart: null, periodEnd: null, paymentIntentId: typeof o.stripe_payment_intent_id === "string" ? o.stripe_payment_intent_id : null, order: o }
}

/** Stops what is left to stop, until the deadline. Answers how many were done and how many failed. */
async function processMembers(db: Db, deps: DeletionDeps, community: CommunityRow, deletion: DeletionRow, actorId: string | null, deadline: number): Promise<{ stopped: number; failed: number; pending: number }> {
  const rows = await memberRows(db, community.id)
  let stopped = 0
  let failed = 0
  for (const row of rows) {
    if (settled(row) && (row.emailed_at || !sendable(row.buyer_email))) continue
    if (Date.now() > deadline) break
    if (row.attempts >= 8 && !settled(row)) {
      failed++
      continue
    }
    try {
      if (deletion.mode === "now") await stopNow(db, deps, community, row, actorId)
      else await stopAtPeriodEnd(db, deps, community, row, actorId)
      stopped++
    } catch (e) {
      failed++
      await noteFailure(db, row, e)
    }
  }
  return { stopped, failed, pending: rows.filter((r) => !settled(r)).length }
}

/* ── Scheduling ───────────────────────────────────────────────────────── */

const REQUEST_BUDGET_MS = 8_000

export interface ScheduleInput {
  community: CommunityRow
  actorId: string
  mode: unknown
  /** Paid memberships, when the caller already read them. */
  paid?: PaidMembership[]
}

/**
 * The owner deletes a community somebody pays for: archived now, every
 * membership stopped (see the top of this file), deleted when due. Answers
 * what is scheduled, or `deleted` when a deletion now could finish at once.
 */
export async function scheduleDeletion(db: Db, a: ScheduleInput, deps: DeletionDeps = defaultDeletionDeps(db)): Promise<DeletionResult<{ deleted: boolean; scheduled: ScheduledDeletionView | null }>> {
  const c = a.community
  const now = deps.now()
  const { ready, row: existing } = await readDeletion(db, c.id)
  if (!ready) return no(503, "Deleting a community members pay for is not switched on yet. Archive it for now; nobody can join an archived community.")
  if (existing?.state === "scheduled") return no(409, `It is already being deleted, on ${emailDate(existing.delete_at)}.`)
  const mode: DeletionMode = isDeletionMode(a.mode) ? a.mode : "period_end"
  const paid = a.paid ?? (await paidMemberships(db, c.id, now))
  const deleteAt = mode === "now" ? nowIso(now) : deletionDate(paid, now)
  const record = {
    community_id: c.id,
    state: "scheduled",
    mode,
    delete_at: deleteAt,
    requested_by: a.actorId,
    requested_at: nowIso(now),
    prior_status: c.status,
    prior_archived_at: c.archived_at,
    members_total: paid.length,
    undone_by: null,
    undone_at: null,
    completed_at: null,
    last_error: null,
    updated_at: nowIso(now),
  }
  if (existing) {
    /* An earlier deletion that was undone: this one replaces it, only while it is still not scheduled (two taps make one). */
    const { data, error } = await db.from("community_deletions").update(record).eq("community_id", c.id).neq("state", "scheduled").select("community_id")
    if (error) return no(500, "That did not go through. Nothing changed. Try again.")
    if (!Array.isArray(data) || data.length !== 1) return no(409, "It is already being deleted.")
    await db.from("community_deletion_members").delete().eq("community_id", c.id)
  } else {
    const { error } = await db.from("community_deletions").insert(record)
    if (error) {
      if (isUniqueViolation(error)) return no(409, "It is already being deleted.")
      if (missing(error)) return no(503, "Deleting a community members pay for is not switched on yet. Archive it for now; nobody can join an archived community.")
      console.error(`[communities] deletion schedule ${c.id}: ${reasonOf(error)}`)
      return no(500, "That did not go through. Nothing changed. Try again.")
    }
  }
  /* Nobody new from this moment: archived (read only, refused at join) and off sale. */
  const { error: archiveError } = await db.from("communities").update({ status: "archived", archived_at: c.archived_at ?? nowIso(now) }).eq("id", c.id)
  if (archiveError) {
    await db.from("community_deletions").delete().eq("community_id", c.id).eq("state", "scheduled")
    return no(500, "That did not go through. Nothing changed. Try again.")
  }
  await syncTierProducts(db, { ...c, status: "archived" }, false)
  for (let i = 0; i < paid.length; i += 500) {
    await db.from("community_deletion_members").upsert(
      paid.slice(i, i + 500).map((m) => ({
        community_id: c.id,
        membership_id: m.id,
        stripe_subscription_id: m.stripe_subscription_id,
        buyer_id: m.buyer_id,
        buyer_email: m.buyer_email,
        mode,
        period_end: m.current_period_end,
        was_cancelling: !renews(m),
      })),
      { onConflict: "community_id,membership_id", ignoreDuplicates: true },
    )
  }
  await audit(db, { communityId: c.id, actorId: a.actorId, actorKind: "member", action: "community.deletion_scheduled", targetType: "community", targetId: c.id, targetLabel: c.name, detail: { mode, deleteAt, memberships: paid.length } })
  const deletion = record as unknown as DeletionRow
  const archived: CommunityRow = { ...c, status: "archived", archived_at: c.archived_at ?? nowIso(now) }
  await processMembers(db, deps, archived, deletion, a.actorId, Date.now() + REQUEST_BUDGET_MS)
  if (mode === "now") {
    const done = await completeIfDue(db, deps, archived, deletion)
    if (done === "completed") return { ok: true, deleted: true, scheduled: null }
  }
  return { ok: true, deleted: false, scheduled: scheduledView(deletion, await memberRows(db, c.id), deps.now()) }
}

/* ── Completing ───────────────────────────────────────────────────────── */

/**
 * Deletes the community when its date has come and every membership is
 * settled. A membership that renews again (the member started it again in
 * between) is stopped and the date waits for it; one still paid past the
 * date moves the date to its end.
 */
async function completeIfDue(db: Db, deps: DeletionDeps, community: CommunityRow, deletion: DeletionRow): Promise<"completed" | "waiting" | "moved"> {
  const now = deps.now()
  if (deletion.state !== "scheduled") return "waiting"
  const rows = await memberRows(db, community.id)
  if (rows.some((r) => !settled(r))) return "waiting"
  if (Date.parse(deletion.delete_at) > now) return "waiting"
  const paid = await paidMemberships(db, community.id, now)
  const known = new Map(rows.map((r) => [r.membership_id, r]))
  const again = paid.filter((m) => renews(m) || (deletion.mode === "now" && stillPaid(m, now)))
  if (again.length) {
    /* Stopped again on the next pass. A known row keeps its refund: a membership is refunded once, whatever happens after. */
    for (const m of again) {
      if (known.has(m.id)) await db.from("community_deletion_members").update({ cancelled_at: null, was_cancelling: false, attempts: 0, updated_at: nowIso(now) }).eq("community_id", community.id).eq("membership_id", m.id)
      else await db.from("community_deletion_members").upsert({ community_id: community.id, membership_id: m.id, stripe_subscription_id: m.stripe_subscription_id, buyer_id: m.buyer_id, buyer_email: m.buyer_email, mode: deletion.mode, period_end: m.current_period_end, was_cancelling: false }, { onConflict: "community_id,membership_id", ignoreDuplicates: true })
    }
    return "waiting"
  }
  if (deletion.mode === "period_end") {
    const until = deletionDate(paid, now)
    if (Date.parse(until) > now + 1000) {
      await db.from("community_deletions").update({ delete_at: until, updated_at: nowIso(now) }).eq("community_id", community.id).eq("state", "scheduled")
      return "moved"
    }
  }
  /* The claim: only the run that moves it from scheduled deletes it. */
  const { data } = await db.from("community_deletions").update({ state: "completed", completed_at: nowIso(now), updated_at: nowIso(now) }).eq("community_id", community.id).eq("state", "scheduled").select("community_id")
  if (!Array.isArray(data) || data.length !== 1) return "waiting"
  await db.from("communities").update({ status: "archived", archived_at: community.archived_at ?? nowIso(now), deleted_at: nowIso(now) }).eq("id", community.id)
  await syncTierProducts(db, { ...community, status: "archived" }, false)
  await audit(db, { communityId: community.id, actorId: deletion.requested_by, actorKind: "system", action: "community.deleted", targetType: "community", targetId: community.id, targetLabel: community.name, detail: { scheduled: true, mode: deletion.mode, memberships: rows.length, refunded: rows.filter((r) => r.stripe_refund_id).length } })
  /* Round 51: out of everybody's bell, and the engines and stored copies told, as it was before it was archived for the deletion (./community-gone.ts). */
  await communityGone(db, community, deletion.prior_status)
  return "completed"
}

/**
 * THE JOB RUN (app/api/cron/community, every five minutes): every scheduled
 * deletion, the memberships still to stop, and the ones that are due
 * deleted. A few seconds' budget; what is left waits for the next run.
 */
export async function runDueDeletions(db: Db, budgetMs = 10_000, deps: DeletionDeps = defaultDeletionDeps(db)): Promise<{ available: boolean; checked: number; completed: number; stopped: number; failed: number }> {
  const out = { available: true, checked: 0, completed: 0, stopped: 0, failed: 0 }
  const deadline = Date.now() + budgetMs
  const { data, error } = await db.from("community_deletions").select("*").eq("state", "scheduled").order("delete_at", { ascending: true }).limit(25)
  if (error) {
    if (!missing(error)) console.error(`[communities] deletions run: ${reasonOf(error)}`)
    return { ...out, available: !missing(error) }
  }
  for (const deletion of (data as DeletionRow[] | null) ?? []) {
    if (Date.now() > deadline) break
    out.checked++
    const { data: c } = await db.from("communities").select("*").eq("id", deletion.community_id).maybeSingle()
    if (!c) continue
    const community = c as CommunityRow
    try {
      const done = await processMembers(db, deps, community, deletion, null, deadline)
      out.stopped += done.stopped
      out.failed += done.failed
      if ((await completeIfDue(db, deps, community, deletion)) === "completed") out.completed++
    } catch (e) {
      out.failed++
      await db.from("community_deletions").update({ last_error: reasonOf(e).slice(0, 500), updated_at: nowIso() }).eq("community_id", deletion.community_id)
    }
  }
  return out
}

/* ── Undo ─────────────────────────────────────────────────────────────── */

/**
 * Before the date, the owner takes it back: the deletion is claimed first
 * (scheduled to undone, so the job run stops touching it), then every
 * membership this deletion stopped renews again and its member is told, and
 * the community is what it was. A membership that could not be resumed is
 * said; Undo again retries only those.
 */
export async function undoDeletion(db: Db, a: { community: CommunityRow; actorId: string }, deps: DeletionDeps = defaultDeletionDeps(db)): Promise<DeletionResult<{ resumed: number; failed: number }>> {
  const c = a.community
  const now = deps.now()
  const { ready, row } = await readDeletion(db, c.id)
  if (!ready || !row) return no(404, "Nothing is being deleted.")
  if (row.state === "scheduled") {
    if (!canUndoDeletion(row, now)) return no(409, row.mode === "now" ? "Memberships already ended with refunds, so this cannot be undone." : "The date has passed, so this cannot be undone.")
    const { data } = await db.from("community_deletions").update({ state: "undone", undone_by: a.actorId, undone_at: nowIso(now), updated_at: nowIso(now) }).eq("community_id", c.id).eq("state", "scheduled").select("community_id")
    if (!Array.isArray(data) || data.length !== 1) return no(409, "Nothing is being deleted.")
    /*
      ROUND 26: A community being deleted takes no place on the plan, so the owner may have made a replacement
      (lib/communities/plan-limit.ts). Kept, it takes one again: counted after the claim, so a create at the same moment
      sees it too, and over the plan the claim is given back and nothing else changes.
    */
    const owner = c.creator_id
    const room = owner ? await communityRoom(db, owner, deps.plan ? await deps.plan(owner) : undefined) : null
    if (room && room.limit.max !== null && room.limit.owned > room.limit.max) {
      await db.from("community_deletions").update({ state: "scheduled", undone_by: null, undone_at: null, updated_at: nowIso(now) }).eq("community_id", c.id).eq("state", "undone")
      return no(402, KEEP_LIMIT_TEXT)
    }
    /* Back as it was: published or a draft, and on sale again when published. An owner who had archived it first finds it archived. */
    const status = row.prior_status === "published" || row.prior_status === "draft" ? row.prior_status : "archived"
    const back = status === "archived" ? { status, archived_at: row.prior_archived_at ?? c.archived_at } : { status, archived_at: row.prior_archived_at }
    await db.from("communities").update(back).eq("id", c.id)
    await syncTierProducts(db, { ...c, status: status as CommunityRow["status"] }, status === "published")
  } else if (row.state !== "undone") return no(409, "It has been deleted.")

  let resumed = 0
  let failed = 0
  for (const m of await memberRows(db, c.id)) {
    if (!m.cancelled_at || m.was_cancelling || m.resumed_at || !m.stripe_subscription_id) continue
    const claim = await db.from("community_deletion_members").update({ resumed_at: nowIso(now) }).eq("community_id", c.id).eq("membership_id", m.membership_id).is("resumed_at", null).select("membership_id")
    if (!Array.isArray(claim.data) || claim.data.length !== 1) continue
    try {
      const live = await membershipNow(db, m.membership_id)
      if (!live || !stillPaid(live, now)) continue
      await deps.update(m.stripe_subscription_id, { cancel_at_period_end: false })
      const next = await deps.sync(m.stripe_subscription_id)
      resumed++
      if (sendable(m.buyer_email)) {
        const mail = memberEmail("staying", { communityName: c.name, url: `${deps.baseUrl()}/community/${c.slug}`, date: next?.current_period_end ?? live.current_period_end, refund: null, logoUrl: (c as { logo_url?: string | null }).logo_url ?? null })
        await deps.sendMail({ to: m.buyer_email, ...mail, fromName: c.name, replyTo: null }).catch(() => ({ success: false }))
      }
      await audit(db, { communityId: c.id, actorId: a.actorId, actorKind: "member", action: "membership.resumed", targetType: "member", targetId: m.buyer_id, reason: "community_kept", detail: { membershipId: m.membership_id } })
    } catch (e) {
      failed++
      console.error(`[communities] undo deletion ${c.id}: membership ${m.membership_id}: ${reasonOf(e)}`)
      await db.from("community_deletion_members").update({ resumed_at: null, error: reasonOf(e).slice(0, 500) }).eq("community_id", c.id).eq("membership_id", m.membership_id)
    }
  }
  await audit(db, { communityId: c.id, actorId: a.actorId, actorKind: "member", action: "community.deletion_undone", targetType: "community", targetId: c.id, targetLabel: c.name, detail: { resumed, failed } })
  if (failed) return no(502, `${failed} ${failed === 1 ? "membership" : "memberships"} could not be renewed again. The community is kept. Press Keep again to retry.`)
  return { ok: true, resumed, failed }
}
