import "server-only"

/**
 * ===========================================================================
 *  A PAID MEMBERSHIP OF A COMMUNITY: CANCEL, REFUND, CONTACT THE OWNER
 * ===========================================================================
 * Round 13, worker M (asks 39 to 43). Everything here sits ON the memberships
 * engine (lib/memberships/*) and never beside it: billing stays the engine's.
 *
 *   CANCEL      Stripe's cancel_at_period_end on the member's own
 *               subscription, then the engine's sync (lib/memberships/sync
 *               syncSubscription), exactly what /account's Cancel does
 *               (app/api/memberships/[id]/manage). The engine keeps access
 *               until current_period_end (grantsAccess), sends the
 *               confirmation email once per scheduled end
 *               (membership.canceled keyed by the period end) and moves the
 *               community row with it. Here: the reason the member gave is
 *               kept (community_cancellations, part 101) for the owner's
 *               analytics. The SUBSCRIPTION LIVES ON STORELIB'S PLATFORM
 *               ACCOUNT with every payment transferred to the creator's
 *               connected account (lib/memberships/billing.ts), so it is
 *               cancelled there; nothing is asked of the connected account.
 *   REFUND      a payment of the community's products (a membership invoice
 *               or a one time purchase is an order) refunded the way /app's
 *               Orders refunds (app/api/stripe/refund): a destination charge
 *               refund with reverse_transfer, so the creator's share comes
 *               back from their connected account, under the SAME idempotency
 *               key, so a refund started here and one started from Orders are
 *               one refund. The member is emailed once per Stripe refund
 *               (community_refunds holds the refund id unique; before part
 *               101, the refund's own metadata remembers it).
 *   CONTACT     a member writes to the owner: to the address the owner set
 *               for the community, else the seller inbox Storelib already
 *               uses (lib/seller-inbox), with Reply-To the member. The owner's
 *               address never reaches the page. Rate limited by the route,
 *               and capped per day here from the messages table.
 *   ANALYTICS   cancellationsWithReasons and refundsFor, for worker A's
 *               dashboard (ARCH13 contract), bounded reads on indexes.
 *
 * Every Stripe and email call goes through `deps`, so the suite runs it all
 * with a stubbed Stripe (tests/communities-membership13.test.ts); the
 * defaults load the real ones only when called.
 */
import { identity, platformEmail } from "@/lib/emails/layout"
import { grantsAccess } from "@/lib/memberships/state"
import type { MembershipRow } from "@/lib/memberships/server"
import type { CommunityRow } from "../types"
import {
  CANCEL_REASONS,
  CONTACT_DAILY_CAP,
  cleanContactEmail,
  cleanRefundPolicy,
  cleanRefundReason,
  parseRefundAmount,
  refundableCents,
  type CancelReason,
  type CommunityMembershipView,
  type MembershipStateWord,
} from "../membership-policy"
import { audit } from "./audit"
import { isUniqueViolation, missing, nowIso, reasonOf, type Db } from "./db"

/* ── Is part 101 there ────────────────────────────────────────────────── */

const RECHECK_MS = 5 * 60_000
let ready: boolean | null = null
let checkedAt = 0

/** Whether part 101 has run (its tables are there), remembered once it has. */
export async function lifecycleReady(db: Db): Promise<boolean> {
  if (ready === true) return true
  if (ready === false && Date.now() - checkedAt < RECHECK_MS) return false
  try {
    const { error } = await db.from("community_cancellations").select("id", { head: true, count: "exact" }).limit(1)
    ready = !error
    if (error && !missing(error)) console.error(`[communities] membership lifecycle check: ${reasonOf(error)}`)
  } catch {
    ready = false
  }
  checkedAt = Date.now()
  return ready === true
}

/** For the suite: forget what was learned about part 101. */
export function resetLifecycleReady(): void {
  ready = null
  checkedAt = 0
}

/* ── The community's own settings (part 101) ──────────────────────────── */

export interface CommunityPolicy {
  refundPolicy: string | null
  contactEmail: string | null
  contactEmailPublic: boolean
}

/** The owner's refund policy and contact settings; all empty before part 101. Read with the service role: none of it is public. */
export async function communityPolicy(db: Db, communityId: string): Promise<CommunityPolicy> {
  const none: CommunityPolicy = { refundPolicy: null, contactEmail: null, contactEmailPublic: false }
  try {
    const { data, error } = await db.from("communities").select("refund_policy, contact_email, contact_email_public").eq("id", communityId).maybeSingle()
    if (error) {
      if (!missing(error)) console.error(`[communities] policy read: ${reasonOf(error)}`)
      return none
    }
    if (!data) return none
    return { refundPolicy: cleanRefundPolicy(data.refund_policy), contactEmail: cleanContactEmail(data.contact_email), contactEmailPublic: data.contact_email_public === true }
  } catch {
    return none
  }
}

/** What checkout shows for a product that sells a community tier: the community's name and refund policy. Null for any other product. */
export async function checkoutTermsFor(db: Db, product: { id: string; community_id?: string | null }): Promise<{ communityName: string; refundPolicy: string | null } | null> {
  if (!product.community_id) return null
  try {
    const { data, error } = await db.from("communities").select("id, name").eq("id", product.community_id).maybeSingle()
    if (error || !data) return null
    const policy = await communityPolicy(db, data.id)
    return { communityName: data.name as string, refundPolicy: policy.refundPolicy }
  } catch {
    return null
  }
}

/* ── The member's paid membership of a community ─────────────────────── */

interface CommunityProduct {
  id: string
  type: string | null
  title: string | null
  creator_id: string | null
}

/** The products that sell this community's tiers (products.community_id). */
export async function communityProducts(db: Db, communityId: string): Promise<CommunityProduct[]> {
  const { data, error } = await db.from("products").select("id, type, title, creator_id").eq("community_id", communityId)
  if (error) {
    if (!missing(error)) console.error(`[communities] community products: ${reasonOf(error)}`)
    return []
  }
  return (data as CommunityProduct[] | null) ?? []
}

const MEMBERSHIP_FIELDS =
  "id, product_id, creator_id, buyer_id, buyer_email, buyer_name, title, stripe_subscription_id, billing_interval, amount_cents, currency, status, current_period_end, cancel_at_period_end, past_due_since, card_last4, created_at"

export type MembershipLite = Pick<
  MembershipRow,
  | "id"
  | "product_id"
  | "creator_id"
  | "buyer_id"
  | "buyer_email"
  | "buyer_name"
  | "title"
  | "stripe_subscription_id"
  | "billing_interval"
  | "amount_cents"
  | "currency"
  | "status"
  | "current_period_end"
  | "cancel_at_period_end"
  | "past_due_since"
  | "card_last4"
  | "created_at"
>

export interface PersonRef {
  id: string
  /** Lower case; only a confirmed one finds a membership paid before the account existed. */
  email: string | null
  emailConfirmed: boolean
}

/**
 * The person's subscription to this community: of the community's
 * membership products, the one that lets them in now, else the latest. By
 * their account, or by the confirmed address they paid with.
 */
export async function membershipFor(db: Db, communityId: string, person: PersonRef): Promise<MembershipLite | null> {
  const ids = (await communityProducts(db, communityId)).filter((p) => p.type === "membership").map((p) => p.id)
  if (ids.length === 0) return null
  const pick = (rows: MembershipLite[]) => {
    const sorted = [...rows].sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""))
    return sorted.find((r) => grantsAccess(r)) ?? sorted[0] ?? null
  }
  const { data, error } = await db.from("memberships").select(MEMBERSHIP_FIELDS).eq("buyer_id", person.id).in("product_id", ids).limit(20)
  if (error) {
    if (!missing(error)) console.error(`[communities] membership read: ${reasonOf(error)}`)
    return null
  }
  const own = pick((data as MembershipLite[] | null) ?? [])
  if (own) return own
  if (!person.email || !person.emailConfirmed) return null
  const { data: byEmail } = await db.from("memberships").select(MEMBERSHIP_FIELDS).eq("buyer_email", person.email).is("buyer_id", null).in("product_id", ids).limit(20)
  return pick((byEmail as MembershipLite[] | null) ?? [])
}

const RUNNING = ["active", "trialing", "past_due"]

/** What the Membership page, CancelMembership and the routes show. Never an address beyond the owner's chosen public one. */
export async function communityMembershipView(db: Db, community: Pick<CommunityRow, "id" | "name" | "owner_user_id">, person: PersonRef): Promise<CommunityMembershipView> {
  const [membership, policy, member, isReady] = await Promise.all([
    membershipFor(db, community.id, person),
    communityPolicy(db, community.id),
    db
      .from("community_members")
      .select("status, source, role")
      .eq("community_id", community.id)
      .eq("user_id", person.id)
      .maybeSingle()
      .then((r: { data: { status: string; source: string; role: string } | null }) => r.data, () => null),
    lifecycleReady(db),
  ])
  const ownerName = await ownerNameOf(db, community.owner_user_id).catch(() => null)
  const isOwner = community.owner_user_id === person.id || member?.role === "owner"
  let kind: CommunityMembershipView["kind"] = "none"
  if (membership) kind = "subscription"
  else if (member?.status === "active" && (member.source === "purchase" || member.source === "product")) kind = "purchase"
  else if (member?.status === "active") kind = "free"
  const status = (membership?.status ?? null) as MembershipStateWord | null
  const access = membership ? grantsAccess(membership) : false
  return {
    communityId: community.id,
    communityName: community.name,
    kind,
    membershipId: membership?.id ?? null,
    status,
    access,
    amountCents: membership?.amount_cents ?? 0,
    currency: (membership?.currency || "usd").toLowerCase(),
    interval: membership ? (membership.billing_interval === "year" ? "year" : "month") : null,
    periodEnd: membership?.current_period_end ?? null,
    cancelAtPeriodEnd: membership?.cancel_at_period_end === true,
    canCancel: !!membership && RUNNING.includes(membership.status),
    canResume: !!membership && membership.status === "canceled" && access,
    cardLast4: membership?.card_last4 ?? null,
    manageUrl: membership ? `/account/library/memberships/${membership.id}` : null,
    refundPolicy: policy.refundPolicy,
    contact: { form: isReady && !isOwner && member?.status === "active", publicEmail: policy.contactEmailPublic ? policy.contactEmail : null, ownerName },
  }
}

async function ownerNameOf(db: Db, userId: string | null): Promise<string | null> {
  if (!userId) return null
  const { data } = await db.from("profiles").select("display_name, username").eq("id", userId).maybeSingle()
  return ((data?.display_name as string | null) || (data?.username as string | null) || null) ?? null
}

/* ── Cancelling and resuming ──────────────────────────────────────────── */

export interface SubscriptionDeps {
  /** Stripe's subscriptions.update on Storelib's platform account. */
  update: (subscriptionId: string, params: { cancel_at_period_end: boolean }) => Promise<unknown>
  /** The engine's sync, which writes the row, emails once and moves the community row: the membership as it is now. */
  sync: (subscriptionId: string) => Promise<MembershipLite | null>
}

export function defaultSubscriptionDeps(db: Db): SubscriptionDeps {
  return {
    update: async (id, params) => {
      const { stripe } = await import("@/lib/stripe")
      return stripe.subscriptions.update(id, params)
    },
    sync: async (id) => {
      const { retrieveSubscription, syncSubscription } = await import("@/lib/memberships/sync")
      const { row } = await syncSubscription(db, id, { subscription: await retrieveSubscription(id) })
      return row
    },
  }
}

export type LifecycleAnswer<T> = { ok: true; value: T } | { ok: false; status: number; error: string; message: string }

/**
 * Cancel (at the end of the paid period) or resume the person's own
 * subscription to this community. Answers the membership as Stripe now has
 * it. A reason is kept only with a cancel.
 */
export async function changeCommunityMembership(
  db: Db,
  input: { communityId: string; person: PersonRef; action: "cancel" | "resume"; why?: { reason: CancelReason; note: string | null } | null },
  deps: SubscriptionDeps = defaultSubscriptionDeps(db),
): Promise<LifecycleAnswer<MembershipLite>> {
  const row = await membershipFor(db, input.communityId, input.person)
  if (!row) return { ok: false, status: 404, error: "not_subscribed", message: "You do not pay for this community." }
  if (input.action === "cancel" && !RUNNING.includes(row.status)) return { ok: false, status: 409, error: "not_renewing", message: "This membership is not renewing." }
  if (input.action === "resume" && !(row.status === "canceled" && grantsAccess(row)))
    return { ok: false, status: 409, error: "ended", message: "This membership has ended. Join again from the community's page." }
  let next: MembershipLite | null
  try {
    await deps.update(row.stripe_subscription_id, { cancel_at_period_end: input.action === "cancel" })
    next = (await deps.sync(row.stripe_subscription_id)) ?? row
  } catch (e) {
    console.error(`[communities] membership ${input.action} failed for ${row.id}: ${reasonOf(e)}`)
    return { ok: false, status: 502, error: "stripe", message: "That did not go through. Nothing changed. Try again in a moment." }
  }
  if (input.action === "cancel") {
    await recordCancellation(db, { communityId: input.communityId, userId: input.person.id, membershipId: row.id, endsAt: next.current_period_end, why: input.why ?? null })
  } else {
    await markResumed(db, row.id)
  }
  await audit(db, {
    communityId: input.communityId,
    actorId: input.person.id,
    actorKind: "member",
    action: input.action === "cancel" ? "membership.cancelled" : "membership.resumed",
    targetType: "member",
    targetId: input.person.id,
    reason: input.action === "cancel" ? (input.why?.reason ?? null) : null,
    detail: { membershipId: row.id, endsAt: next.current_period_end },
  })
  return { ok: true, value: next }
}

/** Once per scheduled end: the key is the membership and its end date, so a double tap or a webhook after the button is one row. */
export function cancelKey(membershipId: string, endsAt: string | null | undefined): string {
  return `${membershipId}:${endsAt || "open"}`.slice(0, 200)
}

/** Keeps a cancellation, with the reason when one was given (a later call with a reason fills it in). Quiet before part 101. */
export async function recordCancellation(
  db: Db,
  c: { communityId: string; userId: string | null; membershipId: string; endsAt: string | null; why: { reason: CancelReason; note: string | null } | null },
): Promise<boolean> {
  if (!(await lifecycleReady(db))) return false
  const key = cancelKey(c.membershipId, c.endsAt)
  try {
    const { error } = await db.from("community_cancellations").insert({
      community_id: c.communityId,
      user_id: c.userId,
      membership_id: c.membershipId,
      cancel_key: key,
      reason: c.why?.reason ?? null,
      note: c.why?.note ?? null,
      ends_at: c.endsAt,
    })
    if (!error) return true
    if (!isUniqueViolation(error)) {
      if (missing(error)) ready = false
      else console.error(`[communities] cancellation save: ${reasonOf(error)}`)
      return false
    }
    /* Already kept (the sync's hook came first, or the member cancelled, resumed and cancelled again): the reason fills in, and it counts again. */
    const patch: Record<string, unknown> = { resumed_at: null, updated_at: nowIso() }
    if (c.why) Object.assign(patch, { reason: c.why.reason, note: c.why.note })
    await db.from("community_cancellations").update(patch).eq("cancel_key", key)
    return true
  } catch (e) {
    console.error(`[communities] cancellation save: ${reasonOf(e)}`)
    return false
  }
}

/** A resumed membership no longer counts as a cancellation. Quiet before part 101. */
export async function markResumed(db: Db, membershipId: string): Promise<void> {
  if (!(await lifecycleReady(db))) return
  try {
    await db.from("community_cancellations").update({ resumed_at: nowIso(), updated_at: nowIso() }).eq("membership_id", membershipId).is("resumed_at", null)
  } catch (e) {
    console.error(`[communities] cancellation resume: ${reasonOf(e)}`)
  }
}

/**
 * THE ENGINE'S HOOK (lib/memberships/sync.ts applyEffects): a membership whose
 * cancellation was just scheduled or undone, wherever that happened (this
 * community's sheet, /account, the email's link to /account), is counted for
 * every community its product sells. Never throws.
 */
export async function communityCancellationAfterMembership(db: Db, row: Pick<MembershipRow, "id" | "product_id" | "buyer_id" | "current_period_end">, change: "cancelled" | "resumed"): Promise<void> {
  try {
    if (!row.product_id) return
    if (change === "resumed") return void (await markResumed(db, row.id))
    if (!(await lifecycleReady(db))) return
    const { data } = await db.from("products").select("community_id").eq("id", row.product_id).maybeSingle()
    const communityId = (data?.community_id as string | null | undefined) ?? null
    if (!communityId) return
    await recordCancellation(db, { communityId, userId: row.buyer_id, membershipId: row.id, endsAt: row.current_period_end, why: null })
  } catch (e) {
    console.error(`[communities] cancellation hook: ${reasonOf(e)}`)
  }
}

/* ── For the owner's analytics (ARCH13 contract with worker A) ────────── */

export interface CancellationsSummary {
  total: number
  /** One per reason; `reason: null` is a cancellation that gave none. */
  counts: { reason: CancelReason | null; count: number }[]
  latest: { reason: CancelReason | null; note: string | null; endsAt: string | null; createdAt: string }[]
}

/** Cancellations still standing (resumed ones do not count), by reason, with the latest few. Null before part 101. */
export async function cancellationsWithReasons(db: Db, communityId: string, opts: { since?: string; limit?: number } = {}): Promise<CancellationsSummary | null> {
  if (!(await lifecycleReady(db))) return null
  const limit = Math.max(1, Math.min(50, opts.limit ?? 8))
  const base = () => {
    let q = db.from("community_cancellations").select("id", { head: true, count: "exact" }).eq("community_id", communityId).is("resumed_at", null)
    if (opts.since) q = q.gte("created_at", opts.since)
    return q
  }
  try {
    const keys: (CancelReason | null)[] = [...CANCEL_REASONS.map((r) => r.key), null]
    const counts = await Promise.all(
      keys.map(async (reason) => {
        const { count, error } = await (reason === null ? base().is("reason", null) : base().eq("reason", reason))
        if (error) throw error
        return { reason, count: Number(count) || 0 }
      }),
    )
    let q = db.from("community_cancellations").select("reason, note, ends_at, created_at").eq("community_id", communityId).is("resumed_at", null)
    if (opts.since) q = q.gte("created_at", opts.since)
    const { data, error } = await q.order("created_at", { ascending: false }).limit(limit)
    if (error) throw error
    const latest = ((data as { reason: CancelReason | null; note: string | null; ends_at: string | null; created_at: string }[] | null) ?? []).map((r) => ({
      reason: r.reason ?? null,
      note: (r.note || "").trim() || null,
      endsAt: r.ends_at ?? null,
      createdAt: r.created_at,
    }))
    return { total: counts.reduce((a, c) => a + c.count, 0), counts, latest }
  } catch (e) {
    if (missing(e as { code?: string })) {
      ready = false
      return null
    }
    console.error(`[communities] cancellations read: ${reasonOf(e)}`)
    return null
  }
}

export interface RefundsSummary {
  count: number
  totalCents: number
  currency: string
  items: { orderId: string; amountCents: number; currency: string; refundedAt: string | null; full: boolean; reason: string | null }[]
}

/** How many of the community's payments were refunded, and how much went back. Read from the orders (any refund, from here, Orders or Stripe). Null when the orders cannot be read. */
export async function refundsFor(db: Db, communityId: string, opts: { since?: string; limit?: number } = {}): Promise<RefundsSummary | null> {
  const limit = Math.max(1, Math.min(100, opts.limit ?? 10))
  /* The products made for the community, and the ones its paid tiers sell: a tier can sell a product that names no community. */
  const [made, tiers] = await Promise.all([communityProducts(db, communityId), db.from("community_tiers").select("product_id").eq("community_id", communityId).eq("kind", "paid").limit(50)])
  const tierIds = ((tiers.data as { product_id: string | null }[] | null) ?? []).map((t) => t.product_id).filter((id): id is string => !!id)
  const ids = [...new Set([...made.map((p) => p.id), ...tierIds])]
  if (ids.length === 0) return { count: 0, totalCents: 0, currency: "usd", items: [] }
  try {
    let q = db.from("orders").select("id, amount_cents, refund_amount_cents, currency, refunded_at, refund_reason").in("product_id", ids).eq("status", "refunded")
    if (opts.since) q = q.gte("refunded_at", opts.since)
    /* A summary for a dashboard: the latest thousand refunds are summed, which is every refund a community has in practice. */
    const { data, error } = await q.order("refunded_at", { ascending: false }).limit(1000)
    if (error) {
      if (!missing(error)) console.error(`[communities] refunds read: ${reasonOf(error)}`)
      return null
    }
    const rows = (data as { id: string; amount_cents: number | null; refund_amount_cents: number | null; currency: string | null; refunded_at: string | null; refund_reason: string | null }[] | null) ?? []
    const items = rows.map((r) => {
      const paid = Math.max(0, Number(r.amount_cents) || 0)
      const back = Math.max(0, Number(r.refund_amount_cents) || paid)
      return { orderId: r.id, amountCents: Math.min(back, paid || back), currency: (r.currency || "usd").toLowerCase(), refundedAt: r.refunded_at, full: back >= paid, reason: r.refund_reason ?? null }
    })
    const byCurrency = new Map<string, number>()
    for (const i of items) byCurrency.set(i.currency, (byCurrency.get(i.currency) ?? 0) + 1)
    const currency = [...byCurrency.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "usd"
    return { count: items.length, totalCents: items.filter((i) => i.currency === currency).reduce((a, i) => a + i.amountCents, 0), currency, items: items.slice(0, limit) }
  } catch (e) {
    console.error(`[communities] refunds read: ${reasonOf(e)}`)
    return null
  }
}

/* ── The owner's payments list ────────────────────────────────────────── */

export interface CommunityPayment {
  orderId: string
  productTitle: string
  kind: "membership" | "purchase"
  amountCents: number
  refundedCents: number
  refundableCents: number
  currency: string
  status: string
  createdAt: string
  buyerId: string | null
  buyerName: string
  buyerEmail: string | null
  /** A membership's subscription is still running, so "End their membership" is offered. */
  subscriptionRunning: boolean
}

const PAYMENT_STATUSES = ["completed", "refunded", "disputed"]

/** The community's payments, newest first, for the owner (emails included: only the owner reads this). */
export async function communityPayments(db: Db, communityId: string, opts: { userId?: string | null; limit?: number; before?: string | null } = {}): Promise<CommunityPayment[] | null> {
  const products = await communityProducts(db, communityId)
  if (products.length === 0) return []
  const byId = new Map(products.map((p) => [p.id, p]))
  const limit = Math.max(1, Math.min(50, opts.limit ?? 20))
  let q = db
    .from("orders")
    .select("id, product_id, buyer_id, buyer_email, buyer_first_name, buyer_last_name, amount_cents, refund_amount_cents, currency, status, created_at")
    .in("product_id", [...byId.keys()])
    .in("status", PAYMENT_STATUSES)
  if (opts.userId) q = q.eq("buyer_id", opts.userId)
  if (opts.before) q = q.lte("created_at", opts.before)
  const { data, error } = await q.order("created_at", { ascending: false }).limit(limit)
  if (error) {
    if (!missing(error)) console.error(`[communities] payments read: ${reasonOf(error)}`)
    return null
  }
  const rows = (data as Record<string, any>[] | null) ?? []
  const orderIds = rows.filter((r) => byId.get(r.product_id)?.type === "membership").map((r) => r.id as string)
  const running = new Set<string>()
  if (orderIds.length) {
    const { data: inv } = await db.from("membership_invoices").select("order_id, membership_id").in("order_id", orderIds)
    const mIds = [...new Set(((inv as { order_id: string; membership_id: string }[] | null) ?? []).map((i) => i.membership_id))]
    if (mIds.length) {
      const { data: ms } = await db.from("memberships").select("id, status").in("id", mIds)
      const live = new Set(((ms as { id: string; status: string }[] | null) ?? []).filter((m) => RUNNING.includes(m.status) || m.status === "canceled").map((m) => m.id))
      for (const i of (inv as { order_id: string; membership_id: string }[] | null) ?? []) if (live.has(i.membership_id)) running.add(i.order_id)
    }
  }
  return rows.map((r) => {
    const product = byId.get(r.product_id)
    const paid = Math.max(0, Number(r.amount_cents) || 0)
    const refunded = r.status === "refunded" ? Math.max(0, Number(r.refund_amount_cents) || paid) : 0
    const name = [r.buyer_first_name, r.buyer_last_name].filter(Boolean).join(" ").trim()
    return {
      orderId: r.id,
      productTitle: product?.title || "Membership",
      kind: product?.type === "membership" ? "membership" : "purchase",
      amountCents: paid,
      refundedCents: Math.min(refunded, paid),
      refundableCents: refundableCents(r),
      currency: (r.currency || "usd").toLowerCase(),
      status: r.status,
      createdAt: r.created_at,
      buyerId: r.buyer_id ?? null,
      buyerName: name || (r.buyer_email ? String(r.buyer_email).split("@")[0] : "A member"),
      buyerEmail: r.buyer_email ?? null,
      subscriptionRunning: running.has(r.id),
    }
  })
}

/* ── Refunding a payment ──────────────────────────────────────────────── */

export interface RefundLike {
  id: string
  status: string | null
  currency?: string | null
  metadata?: Record<string, string> | null
}

export interface RefundDeps {
  createRefund: (params: Record<string, unknown>, idempotencyKey: string) => Promise<RefundLike>
  retrieveRefund: (id: string) => Promise<RefundLike>
  updateRefund: (id: string, metadata: Record<string, string>) => Promise<unknown>
  /** Seller balance and the order's own record, as charge.refunded would: never throws. */
  afterRefund: (paymentIntentId: string) => Promise<void>
  /** Ends a subscription now (the owner chose to), through the engine's sync. */
  endSubscription: (subscriptionId: string) => Promise<void>
  /** The engine's notification outbox. */
  emit: (event: Record<string, unknown>) => Promise<unknown>
  sendMail: (mail: { to: string; subject: string; html: string; text: string; fromName: string | null; replyTo: string | null }) => Promise<{ success: boolean }>
  baseUrl: () => string
}

export function defaultRefundDeps(db: Db): RefundDeps {
  return {
    createRefund: async (params, key) => {
      const { stripe } = await import("@/lib/stripe")
      const r = await stripe.refunds.create(params as never, { idempotencyKey: key })
      return { id: r.id, status: r.status ?? null, currency: r.currency ?? null, metadata: (r.metadata as Record<string, string>) ?? null }
    },
    retrieveRefund: async (id) => {
      const { stripe } = await import("@/lib/stripe")
      const r = await stripe.refunds.retrieve(id)
      return { id: r.id, status: r.status ?? null, currency: r.currency ?? null, metadata: (r.metadata as Record<string, string>) ?? null }
    },
    updateRefund: async (id, metadata) => {
      const { stripe } = await import("@/lib/stripe")
      return stripe.refunds.update(id, { metadata })
    },
    afterRefund: async (paymentIntentId) => {
      try {
        const [{ stripe }, { syncChargeRefund }] = await Promise.all([import("@/lib/stripe"), import("@/lib/stripe/refund-sync")])
        const pi = await stripe.paymentIntents.retrieve(paymentIntentId, { expand: ["latest_charge"] })
        const charge = pi.latest_charge && typeof pi.latest_charge === "object" ? pi.latest_charge : null
        if (charge) await syncChargeRefund(db, stripe, charge as never)
      } catch (e) {
        console.error(`[communities] refund ledger now failed; charge.refunded will apply it: ${reasonOf(e)}`)
      }
    },
    endSubscription: async (subscriptionId) => {
      const [{ stripe }, { retrieveSubscription, syncSubscription }] = await Promise.all([import("@/lib/stripe"), import("@/lib/memberships/sync")])
      await stripe.subscriptions.cancel(subscriptionId)
      await syncSubscription(db, subscriptionId, { subscription: await retrieveSubscription(subscriptionId) })
    },
    emit: async (event) => {
      const { emit } = await import("@/lib/notify/outbox")
      return emit(event as never)
    },
    sendMail: async (m) => {
      const { sendEmail, buildFromHeader } = await import("@/lib/mail")
      const r = await sendEmail({ to: m.to, subject: m.subject, html: m.html, text: m.text, from: buildFromHeader(m.fromName || undefined), replyTo: m.replyTo || undefined })
      return { success: r.success }
    },
    baseUrl: () => {
      const site = process.env.SITE_URL || process.env.NEXT_PUBLIC_SITE_URL || "https://storelib.com"
      try {
        return new URL(site).origin
      } catch {
        return "https://storelib.com"
      }
    },
  }
}

export interface RefundInput {
  communityId: string
  communityName: string
  /** The creator account the refund is made as: it must be the one the payment went to. */
  creatorId: string
  actorUserId: string
  orderId: string
  amountCents?: unknown
  reason?: unknown
  endMembership?: boolean
}

export interface RefundDone {
  refundId: string
  status: string | null
  amountCents: number
  full: boolean
  pending: boolean
  emailed: boolean
  endedMembership: boolean
}

/**
 * Refunds one payment of this community's products, all of what is left or
 * part of it, and emails the member once. The order must be a payment of a
 * product this community sells, made to this creator, and paid by card
 * through Stripe (a Storelib Payments sale is refunded from Orders).
 */
export async function refundCommunityPayment(db: Db, input: RefundInput, deps: RefundDeps = defaultRefundDeps(db)): Promise<LifecycleAnswer<RefundDone>> {
  const fail = (status: number, error: string, message: string): LifecycleAnswer<RefundDone> => ({ ok: false, status, error, message })
  const { data: order, error } = await db.from("orders").select("*").eq("id", input.orderId).maybeSingle()
  if (error && !missing(error)) console.error(`[communities] refund order read: ${reasonOf(error)}`)
  if (!order) return fail(404, "not_found", "That payment could not be found.")
  const product = (await communityProducts(db, input.communityId)).find((p) => p.id === order.product_id)
  if (!product) return fail(404, "not_found", "That payment could not be found.")
  if (product.creator_id !== input.creatorId) return fail(403, "forbidden", "Only the account that was paid can refund this.")
  if (order.status !== "completed" && order.status !== "refunded") return fail(409, "not_refundable", order.status === "disputed" ? "This payment is disputed. Stripe settles it with the bank." : "Only a paid payment can be refunded.")
  if (!order.stripe_payment_intent_id) return fail(409, "not_stripe", "This payment was not made by card through Stripe. Refund it from Orders.")
  const already = order.status === "refunded" ? Math.max(0, Number(order.refund_amount_cents) || 0) : 0
  const amount = parseRefundAmount(input.amountCents, refundableCents(order))
  if (amount.ok === false) return fail(400, "bad_amount", amount.error)
  const reason = cleanRefundReason(input.reason)
  const total = Math.max(0, Number(order.amount_cents) || 0)
  const full = already + amount.cents >= total

  let refund: RefundLike
  try {
    refund = await deps.createRefund(
      {
        payment_intent: order.stripe_payment_intent_id,
        amount: amount.cents,
        reason: "requested_by_customer",
        /* Destination charge: the creator's share comes back from their connected account, as from Orders. */
        reverse_transfer: true,
        metadata: { order_id: order.id, creator_id: input.creatorId, product_id: product.id, refund_reason: reason || "requested_by_customer", community_id: input.communityId },
      },
      /* THE SAME KEY AS ORDERS (app/api/stripe/refund): one refund, whichever page it was started from. */
      `storelib-refund:${order.id}:${already}:${amount.cents}`,
    )
  } catch (e) {
    const err = e as { type?: string; raw?: { message?: string } }
    console.error(`[communities] refund failed for ${order.id}: ${reasonOf(e)}`)
    return fail(502, "stripe", err?.type === "StripeInvalidRequestError" && err.raw?.message ? err.raw.message : "The refund could not be made. Nothing was changed. Try again.")
  }
  if (refund.status === "failed" || refund.status === "canceled") return fail(402, "refund_failed", "The refund did not go through. Nothing was changed. Try again, or contact support.")
  const pending = refund.status !== "succeeded"
  const currency = (refund.currency || order.currency || "usd").toLowerCase()

  if (pending) {
    /* Stripe applies it when it settles (charge.refunded, lib/stripe/refund-sync). */
    await deps.updateRefund(refund.id, { settled_by: "webhook" }).catch(() => undefined)
  } else {
    await db.from("orders").update({ status: "refunded" }).eq("id", order.id)
    try {
      await db
        .from("orders")
        .update({ refunded_at: nowIso(), refund_reason: reason || "requested_by_customer", refund_amount_cents: Math.min(total, already + amount.cents), stripe_refund_id: refund.id })
        .eq("id", order.id)
    } catch {
      /* Older databases have no refund columns; the status above is enough. */
    }
    await deps
      .emit({
        name: "order.refunded",
        key: `refund:${order.id}:${refund.id}`,
        userId: input.actorUserId,
        creatorId: input.creatorId,
        entityType: "order",
        entityId: order.id,
        correlationId: refund.id,
        payload: { orderId: order.id, refundId: refund.id, productId: product.id, amountCents: amount.cents, currency, full, reason: reason || "requested_by_customer", buyerEmail: order.buyer_email || null },
      })
      .catch(() => undefined)
    await deps.afterRefund(order.stripe_payment_intent_id)
    /* A one time purchase refunded in full leaves the library, and the community with it (unless something else grants it). */
    if (full && product.type !== "membership" && order.buyer_id) {
      try {
        let q = db.from("entitlements").delete().eq("buyer_id", order.buyer_id).eq("product_id", product.id)
        q = order.variant_id ? q.eq("variant_id", order.variant_id) : q.is("variant_id", null)
        await q
        const { syncCommunityAccessForEntitlement } = await import("./membership")
        await syncCommunityAccessForEntitlement(db, { userId: order.buyer_id, productId: product.id, orderId: order.id, granted: false })
      } catch (e) {
        console.error(`[communities] refund access: ${reasonOf(e)}`)
      }
    }
  }

  /* The owner chose to end the membership now: the subscription is cancelled at once, and the engine takes access away. */
  let endedMembership = false
  if (input.endMembership && product.type === "membership") {
    try {
      const { data: inv } = await db.from("membership_invoices").select("membership_id").eq("order_id", order.id).maybeSingle()
      const { data: m } = inv?.membership_id ? await db.from("memberships").select("id, stripe_subscription_id, status").eq("id", inv.membership_id).maybeSingle() : { data: null }
      if (m?.stripe_subscription_id && m.status !== "expired") {
        await deps.endSubscription(m.stripe_subscription_id)
        endedMembership = true
      }
    } catch (e) {
      console.error(`[communities] refund end membership: ${reasonOf(e)}`)
    }
  }

  const emailed = await emailRefundOnce(db, deps, { order, product, communityId: input.communityId, communityName: input.communityName, refund, amountCents: amount.cents, currency, full, reason, actorUserId: input.actorUserId, endedMembership })
  await audit(db, {
    communityId: input.communityId,
    actorId: input.actorUserId,
    actorKind: "member",
    action: "payment.refunded",
    targetType: "order",
    targetId: order.id,
    reason,
    detail: { refundId: refund.id, amountCents: amount.cents, currency, full, pending, endedMembership },
  })
  return { ok: true, value: { refundId: refund.id, status: refund.status, amountCents: amount.cents, full, pending, emailed, endedMembership } }
}

/**
 * THE MEMBER'S REFUND EMAIL, ONCE PER STRIPE REFUND. Claimed first: a row in
 * community_refunds (the refund id is unique), or before part 101 the
 * refund's own metadata. A second submit that Stripe answers with the same
 * refund (the idempotency key) finds the claim and sends nothing.
 */
async function emailRefundOnce(
  db: Db,
  deps: RefundDeps,
  r: { order: Record<string, any>; product: CommunityProduct; communityId: string; communityName: string; refund: RefundLike; amountCents: number; currency: string; full: boolean; reason: string | null; actorUserId: string; endedMembership: boolean },
): Promise<boolean> {
  const to = typeof r.order.buyer_email === "string" && r.order.buyer_email.includes("@") && !r.order.buyer_email.endsWith("@storelib.invalid") ? r.order.buyer_email : null
  let claimed = false
  if (await lifecycleReady(db)) {
    const { error } = await db.from("community_refunds").insert({
      community_id: r.communityId,
      order_id: r.order.id,
      stripe_refund_id: r.refund.id,
      member_user_id: r.order.buyer_id ?? null,
      amount_cents: r.amountCents,
      currency: r.currency,
      full_refund: r.full,
      reason: r.reason,
      refunded_by: r.actorUserId,
      ended_membership: r.endedMembership,
    })
    if (error) {
      if (isUniqueViolation(error)) return false
      console.error(`[communities] refund record: ${reasonOf(error)}`)
    } else claimed = true
  }
  if (!claimed) {
    const now = await deps.retrieveRefund(r.refund.id).catch(() => r.refund)
    if (now.metadata?.member_emailed === "1") return false
  }
  if (!to) return false
  const mail = await refundEmail(db, deps, r)
  const sent = await deps.sendMail({ to, ...mail }).catch(() => ({ success: false }))
  if (!sent.success) return false
  if (claimed) await db.from("community_refunds").update({ emailed_at: nowIso() }).eq("stripe_refund_id", r.refund.id)
  else await deps.updateRefund(r.refund.id, { member_emailed: "1" }).catch(() => undefined)
  return true
}

async function refundEmail(
  db: Db,
  deps: RefundDeps,
  r: { order: Record<string, any>; product: CommunityProduct; communityName: string; amountCents: number; currency: string },
): Promise<{ subject: string; html: string; text: string; fromName: string | null; replyTo: string | null }> {
  const { renderEmail } = await import("@/lib/notify/templates")
  const { orderNumberOf } = await import("@/lib/receipts/rules")
  const creatorName = r.product.creator_id ? await creatorNameOf(db, r.product.creator_id).catch(() => null) : null
  const rendered = renderEmail(
    "CUSTOMER_REFUND_PROCESSED",
    {
      productTitle: r.product.type === "membership" ? `${r.communityName} membership` : r.product.title || r.communityName,
      amountCents: r.amountCents,
      currency: r.currency,
      orderNumber: orderNumberOf(r.order.id),
      storeName: r.communityName,
      creatorName: creatorName ?? "",
      receiptToken: r.order.receipt_token ?? "",
    },
    { baseUrl: deps.baseUrl(), recipientName: [r.order.buyer_first_name, r.order.buyer_last_name].filter(Boolean).join(" ") || null },
  )
  return { subject: rendered.subject, html: rendered.html, text: rendered.text, fromName: rendered.fromName ?? r.communityName, replyTo: rendered.replyTo ?? null }
}

async function creatorNameOf(db: Db, creatorId: string): Promise<string | null> {
  const { data } = await db.from("creators").select("user_id, display_name, username").eq("id", creatorId).maybeSingle()
  if (!data) return null
  if (data.user_id) {
    const name = await ownerNameOf(db, data.user_id as string)
    if (name) return name
  }
  return (data.display_name as string | null) || (data.username as string | null) || null
}

/* ── Contacting the owner ─────────────────────────────────────────────── */

export interface ContactDeps {
  /** Where the owner reads mail: the community's own address, else their seller inbox. */
  ownerInbox: (community: Pick<CommunityRow, "id" | "creator_id">) => Promise<string | null>
  sendMail: RefundDeps["sendMail"]
  baseUrl: () => string
}

export function defaultContactDeps(db: Db): ContactDeps {
  const refund = defaultRefundDeps(db)
  return {
    ownerInbox: async (community) => {
      const own = (await communityPolicy(db, community.id)).contactEmail
      if (own) return own
      if (!community.creator_id) return null
      const { loginEmailFrom, sellerInbox } = await import("@/lib/seller-inbox")
      return (await sellerInbox(db, community.creator_id, loginEmailFrom(db)))?.to ?? null
    },
    sendMail: refund.sendMail,
    baseUrl: refund.baseUrl,
  }
}

/**
 * A member's message to the owner: kept (part 101), capped at
 * CONTACT_DAILY_CAP a day per member and community, then emailed with
 * Reply-To the member. The member never sees the owner's address.
 */
export async function sendContactMessage(
  db: Db,
  input: { community: Pick<CommunityRow, "id" | "name" | "slug" | "creator_id">; sender: { id: string; name: string; email: string | null }; subject: string; message: string },
  deps: ContactDeps = defaultContactDeps(db),
): Promise<LifecycleAnswer<{ sent: true }>> {
  if (!(await lifecycleReady(db))) return { ok: false, status: 503, error: "not_set_up", message: "Messages to the owner are not set up yet. Try again later." }
  if (!input.sender.email) return { ok: false, status: 409, error: "no_email", message: "Add an email address to your account first, so the owner can reply." }
  const since = new Date(Date.now() - 86_400_000).toISOString()
  const { count, error: countError } = await db
    .from("community_contact_messages")
    .select("id", { head: true, count: "exact" })
    .eq("community_id", input.community.id)
    .eq("sender_id", input.sender.id)
    .gte("created_at", since)
  if (countError) {
    console.error(`[communities] contact count: ${reasonOf(countError)}`)
    return { ok: false, status: 500, error: "failed", message: "That did not go through. Try again." }
  }
  if ((Number(count) || 0) >= CONTACT_DAILY_CAP) return { ok: false, status: 429, error: "rate_limited", message: "You have written to the owner a few times today. Give them time to reply." }
  const to = await deps.ownerInbox(input.community).catch(() => null)
  if (!to) return { ok: false, status: 409, error: "no_inbox", message: "The owner has no address to write to yet, so the message was not sent." }
  const { data: kept, error } = await db
    .from("community_contact_messages")
    .insert({ community_id: input.community.id, sender_id: input.sender.id, subject: input.subject, body: input.message })
    .select("id")
    .single()
  if (error || !kept) {
    console.error(`[communities] contact save: ${reasonOf(error)}`)
    return { ok: false, status: 500, error: "failed", message: "That did not go through. Try again." }
  }
  const mail = contactEmail({
    communityName: input.community.name,
    senderName: input.sender.name,
    senderEmail: input.sender.email,
    subject: input.subject,
    message: input.message,
    link: `${deps.baseUrl()}/app/community/${input.community.id}/members`,
  })
  const sent = await deps.sendMail({ to, subject: mail.subject, html: mail.html, text: mail.text, fromName: mail.fromName, replyTo: input.sender.email }).catch(() => ({ success: false }))
  if (!sent.success) return { ok: false, status: 502, error: "send_failed", message: "The message could not be sent. Try again in a moment." }
  await db.from("community_contact_messages").update({ delivered: true }).eq("id", kept.id)
  return { ok: true, value: { sent: true } }
}

function escape(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

function headerSafe(value: string): string {
  // eslint-disable-next-line no-control-regex
  return value.replace(/[\r\n\t\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim()
}

/** The owner's email for a member's message, in the look of the receipt's Contact seller (lib/receipts/contact.ts). */
export function contactEmail(m: { communityName: string; senderName: string; senderEmail: string; subject: string; message: string; link: string }): { subject: string; fromName: string; html: string; text: string } {
  const who = headerSafe(m.senderName) || "A member"
  const community = headerSafe(m.communityName) || "your community"
  const subject = headerSafe(`${community}: ${m.subject}`).slice(0, 180)
  const fromName = headerSafe(`${who} via Storelib`).replace(/[<>"]/g, "")
  const preview = headerSafe(m.message).slice(0, 110)
  const { html } = platformEmail({
    subject,
    preview,
    label: `${community} · a message from a member`,
    heading: headerSafe(m.subject) || "A message from a member",
    paragraphs: [`From ${who}`],
    quote: { text: m.message },
    closing: [{ html: `Reply to this email and it goes to ${identity(m.senderEmail)}.`, text: `Reply to this email and it goes to ${m.senderEmail}.` }],
    action: { label: "Open your members", url: m.link },
    fallback: false,
    reason: `Sent from the contact form in ${community} on Storelib.`,
  })
  const text = [`${who} wrote to you from ${community}:`, "", `Subject: ${headerSafe(m.subject)}`, "", m.message, "", `Reply to this email and it goes to ${m.senderEmail}.`, `Open your members: ${m.link}`].join("\n")
  return { subject, fromName, html, text }
}
