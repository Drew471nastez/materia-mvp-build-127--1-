import "server-only"

/**
 * ===========================================================================
 *  CHANGING PLAN (round AF): upgrade, downgrade, monthly and annual
 * ===========================================================================
 * The rules are in ../plan-change.ts. This reads the member's subscription
 * and the community's plans, asks Stripe for the invoice preview so the
 * member sees the real amounts before confirming, and applies the change:
 *
 *   1. the subscription's one item moves to the new plan's price (the price
 *      the memberships engine keeps for that plan and interval, ensurePrice)
 *   2. its metadata names the new product, so every later sync and webhook
 *      reads the right plan
 *   3. the membership row moves to the new product, then is synced from
 *      Stripe, then the community row follows (reconcileAccess), so the
 *      member's tier and what they can open change on the server only
 *
 * A charge that needs the bank's confirmation or is declined changes
 * nothing (payment_behavior error_if_incomplete). Course and product access
 * the member bought separately is never touched.
 */
import { MEMBERSHIP_COLUMNS, PLAN_COLUMNS, type MembershipRow, type PlanRow } from "@/lib/memberships/server"
import type { JoinOption } from "@/components/community/public/types"
import { canChangePlan, changeKind, nextChargeAt, previewAmounts, prorationFor, type ChangeKind, type PlanInterval, type Proration } from "../plan-change"
import type { CommunityRow } from "../types"
import { audit } from "./audit"
import type { Db } from "./db"
import { membershipFor, type PersonRef } from "./membership-lifecycle"
import { communityOptions } from "./plan-checkout"

export interface PlanChoice {
  tierId: string
  productId: string
  name: string
  description: string | null
  benefits: string[]
  currency: string
  monthlyCents: number | null
  yearlyCents: number | null
  current: { interval: PlanInterval } | null
}

export interface PlanChoices {
  membershipId: string
  status: string
  currentProductId: string
  currentInterval: PlanInterval
  amountCents: number
  currency: string
  canChange: boolean
  /** Why not, in the member's words, when canChange is false. */
  reason: string | null
  plans: PlanChoice[]
}

export interface PlanChangePreview {
  kind: ChangeKind
  proration: Proration
  fromName: string
  toName: string
  interval: PlanInterval
  amountCents: number
  currency: string
  dueNowCents: number
  creditCents: number
  nextChargeAt: string | null
  trialing: boolean
}

type Answer<T> = { ok: true; value: T } | { ok: false; status: number; error: string; message: string }
const no = (status: number, error: string, message: string): Answer<never> => ({ ok: false, status, error, message })

export interface StripeSub {
  id: string
  customer: string | { id: string }
  status: string
  items: { data: { id: string; price?: { id: string } | null }[] }
}

export interface PlanChangeDeps {
  retrieve: (subscriptionId: string) => Promise<StripeSub>
  preview: (params: Record<string, unknown>) => Promise<{ amount_due?: number | null; total?: number | null; lines?: { data?: unknown[] } | null }>
  update: (subscriptionId: string, params: Record<string, unknown>, idempotencyKey: string) => Promise<unknown>
  ensurePrice: (plan: PlanRow, product: { id: string; title: string | null }, interval: PlanInterval) => Promise<{ priceId: string; amountCents: number }>
  sync: (subscriptionId: string) => Promise<unknown>
  reconcile: (communityId: string, userId: string) => Promise<unknown>
  /** The member's email that their plan changed (MEMBERSHIP_PLAN_CHANGED), from the row as it now is. Never throws. */
  tell: (membershipId: string, extra: { fromTitle: string; changeKind: ChangeKind; changeId: string }) => Promise<unknown>
}

export function defaultPlanChangeDeps(db: Db): PlanChangeDeps {
  return {
    retrieve: async (id) => {
      const { stripe } = await import("@/lib/stripe")
      return (await stripe.subscriptions.retrieve(id)) as unknown as StripeSub
    },
    preview: async (params) => {
      const { stripe } = await import("@/lib/stripe")
      return (await stripe.invoices.createPreview(params as never)) as never
    },
    update: async (id, params, idempotencyKey) => {
      const { stripe } = await import("@/lib/stripe")
      return stripe.subscriptions.update(id, params as never, { idempotencyKey })
    },
    ensurePrice: async (plan, product, interval) => {
      const { ensurePrice } = await import("@/lib/memberships/billing")
      return ensurePrice(db as never, plan, product, interval)
    },
    sync: async (id) => {
      const { retrieveSubscription, syncSubscription } = await import("@/lib/memberships/sync")
      return syncSubscription(db as never, id, { subscription: await retrieveSubscription(id) })
    },
    reconcile: async (communityId, userId) => {
      const { reconcileAccess } = await import("./membership")
      return reconcileAccess(db, communityId, userId, { automatic: false })
    },
    tell: async (membershipId, extra) => {
      const row = await fullRow(db, membershipId)
      if (!row) return
      const { notice } = await import("@/lib/memberships/sync")
      await notice(db as never, row, "membership.plan_changed", `membership:${membershipId}:plan:${extra.changeId}`, extra).catch(() => null)
    },
  }
}

async function fullRow(db: Db, id: string): Promise<MembershipRow | null> {
  const { data } = await db.from("memberships").select(MEMBERSHIP_COLUMNS).eq("id", id).maybeSingle()
  return (data as MembershipRow | null) ?? null
}

function choiceOf(o: JoinOption): PlanChoice | null {
  if (o.kind !== "paid" || o.billing !== "recurring" || !o.productId || !o.tierId) return null
  const monthly = o.checkout?.month && o.monthlyCents ? o.monthlyCents : null
  const yearly = o.checkout?.year && o.yearlyCents ? o.yearlyCents : null
  if (!monthly && !yearly) return null
  return { tierId: o.tierId, productId: o.productId, name: o.name, description: o.description ?? null, benefits: o.benefits ?? [], currency: o.currency, monthlyCents: monthly, yearlyCents: yearly, current: null }
}

/** The plans the member can move to, with theirs marked. */
export async function planChoices(db: Db, community: CommunityRow, person: PersonRef): Promise<Answer<PlanChoices>> {
  const lite = await membershipFor(db, community.id, person)
  if (!lite) return no(404, "not_subscribed", "You do not pay for this community.")
  const row = (await fullRow(db, lite.id)) ?? (lite as unknown as MembershipRow)
  const interval: PlanInterval = row.billing_interval === "year" ? "year" : "month"
  const options = await communityOptions(db, community)
  const plans = options.map(choiceOf).filter((c): c is PlanChoice => !!c).map((c) => (c.productId === row.product_id ? { ...c, current: { interval } } : c))
  /* The member's own plan may be archived: it is still theirs, shown as current, never offered to anybody else. */
  if (!plans.some((p) => p.current)) {
    plans.unshift({ tierId: "", productId: row.product_id ?? "", name: row.title || "Your plan", description: null, benefits: [], currency: row.currency || "usd", monthlyCents: interval === "month" ? row.amount_cents : null, yearlyCents: interval === "year" ? row.amount_cents : null, current: { interval } })
  }
  const others = plans.filter((p) => !p.current).length + plans.filter((p) => p.current && p.tierId && p.monthlyCents && p.yearlyCents).length
  let reason: string | null = null
  if (row.cancel_at_period_end || row.status === "canceled") reason = "Resume your membership first, then change plan."
  else if (row.status === "past_due") reason = "Your last payment did not go through. Update your card first."
  else if (!canChangePlan(row)) reason = "This membership cannot be changed right now."
  else if (others === 0) reason = "There is no other plan to move to."
  return {
    ok: true,
    value: { membershipId: row.id, status: row.status, currentProductId: row.product_id ?? "", currentInterval: interval, amountCents: row.amount_cents, currency: (row.currency || "usd").toLowerCase(), canChange: reason === null, reason, plans },
  }
}

interface Prepared {
  row: MembershipRow
  sub: StripeSub
  itemId: string
  target: JoinOption
  plan: PlanRow
  priceId: string
  amountCents: number
  kind: ChangeKind
  proration: Proration
  prorationDate: number
  fromName: string
}

async function prepare(db: Db, community: CommunityRow, person: PersonRef, input: { tierId: unknown; interval: unknown }, deps: PlanChangeDeps): Promise<Answer<Prepared>> {
  const interval: PlanInterval | null = input.interval === "year" ? "year" : input.interval === "month" ? "month" : null
  if (!interval || typeof input.tierId !== "string" || !input.tierId) return no(400, "bad_request", "Choose a plan and how often to pay.")
  const lite = await membershipFor(db, community.id, person)
  if (!lite) return no(404, "not_subscribed", "You do not pay for this community.")
  const row = await fullRow(db, lite.id)
  if (!row) return no(404, "not_subscribed", "You do not pay for this community.")
  if (!canChangePlan(row)) {
    if (row.status === "past_due") return no(409, "past_due", "Your last payment did not go through. Update your card first.")
    return no(409, "not_changeable", "Resume your membership first, then change plan.")
  }
  const options = await communityOptions(db, community)
  const target = options.find((o) => o.tierId === input.tierId)
  if (!target || !choiceOf(target)) return no(409, "plan_unavailable", "That plan isn't available. Choose another.")
  if (interval === "month" ? !(target.checkout?.month && target.monthlyCents) : !(target.checkout?.year && target.yearlyCents)) {
    return no(409, "interval_unavailable", `That plan has no ${interval === "year" ? "annual" : "monthly"} price.`)
  }
  const { data: planData } = await db
    .from("membership_plans")
    .select(`${PLAN_COLUMNS}, stripe_product_id, stripe_monthly_price_id, stripe_monthly_price_cents, stripe_yearly_price_id, stripe_yearly_price_cents`)
    .eq("product_id", target.productId!)
    .maybeSingle()
  const plan = planData as PlanRow | null
  if (!plan) return no(409, "plan_unavailable", "That plan isn't available. Choose another.")
  const amountCents = (interval === "year" ? plan.yearly_price_cents : plan.monthly_price_cents) ?? 0
  const currentInterval: PlanInterval = row.billing_interval === "year" ? "year" : "month"
  const kind = changeKind({ productId: row.product_id ?? "", amountCents: row.amount_cents, interval: currentInterval }, { productId: target.productId!, amountCents, interval })
  if (kind === "same") return no(409, "same_plan", "You are already on this plan.")
  if ((plan.currency || "usd").toLowerCase() !== (row.currency || "usd").toLowerCase()) return no(409, "currency", "That plan is priced in another currency, so it cannot replace this one. Cancel and join it instead.")
  /* Somebody holding the target plan on another subscription already: one membership of a plan per person. */
  if (target.productId !== row.product_id && row.buyer_id) {
    const { data: other } = await db.from("memberships").select("id").eq("buyer_id", row.buyer_id).eq("product_id", target.productId!).in("status", ["active", "trialing", "past_due"]).neq("id", row.id).limit(1)
    if ((other?.length ?? 0) > 0) return no(409, "already_member", "You already have that plan on another membership.")
  }
  let sub: StripeSub
  try {
    sub = await deps.retrieve(row.stripe_subscription_id)
  } catch {
    return no(502, "stripe", "That could not be checked just now. Nothing changed. Try again in a moment.")
  }
  const item = sub.items?.data?.[0]
  if (!item || (sub.items.data.length ?? 0) !== 1) return no(409, "not_changeable", "This membership cannot be changed here. Contact the owner.")
  let price: { priceId: string; amountCents: number }
  try {
    price = await deps.ensurePrice(plan, { id: target.productId!, title: target.name }, interval)
  } catch {
    return no(502, "stripe", "That could not be prepared just now. Nothing changed. Try again in a moment.")
  }
  const { data: fromProduct } = await db.from("products").select("title").eq("id", row.product_id ?? "").maybeSingle()
  return {
    ok: true,
    value: {
      row,
      sub,
      itemId: item.id,
      target,
      plan,
      priceId: price.priceId,
      amountCents: price.amountCents,
      kind,
      proration: prorationFor(kind, row.status === "trialing"),
      prorationDate: Math.floor(Date.now() / 1000),
      fromName: (fromProduct as { title?: string | null } | null)?.title || row.title || "Your plan",
    },
  }
}

function customerOf(sub: StripeSub): string {
  return typeof sub.customer === "string" ? sub.customer : sub.customer.id
}

/** What the change costs now and later, from Stripe's preview. Changes nothing. */
export async function previewPlanChange(db: Db, community: CommunityRow, person: PersonRef, input: { tierId: unknown; interval: unknown }, deps: PlanChangeDeps = defaultPlanChangeDeps(db)): Promise<Answer<PlanChangePreview>> {
  const p = await prepare(db, community, person, input, deps)
  if (!p.ok) return p as Answer<never>
  const v = p.value
  const interval: PlanInterval = input.interval === "year" ? "year" : "month"
  let amounts = { dueNowCents: 0, creditCents: 0 }
  if (v.proration !== "none") {
    try {
      const preview = await deps.preview({
        customer: customerOf(v.sub),
        subscription: v.sub.id,
        subscription_details: { items: [{ id: v.itemId, price: v.priceId }], proration_behavior: v.proration, proration_date: v.prorationDate },
      })
      amounts = previewAmounts(v.proration, preview as never)
    } catch {
      return no(502, "stripe", "The amounts could not be worked out just now. Nothing changed. Try again in a moment.")
    }
  }
  return {
    ok: true,
    value: {
      kind: v.kind,
      proration: v.proration,
      fromName: v.fromName,
      toName: v.target.name,
      interval,
      amountCents: v.amountCents,
      currency: (v.plan.currency || "usd").toLowerCase(),
      ...amounts,
      nextChargeAt: nextChargeAt(v.kind, interval, v.row),
      trialing: v.row.status === "trialing",
    },
  }
}

export interface PlanChangeDone {
  kind: ChangeKind
  toName: string
  interval: PlanInterval
  /** Round AG: the bank asks to confirm the upgrade's payment; the page confirms it with Stripe.js, then finishes. */
  needsAction?: { clientSecret: string }
}

type UpdatedSub = { pending_update?: unknown; latest_invoice?: { confirmation_secret?: { client_secret?: string | null } | null; status?: string | null } | string | null }

/**
 * Moves the subscription to the plan, the row after it, and the member's tier after that.
 *
 * AN UPGRADE IS PAID BEFORE IT HAPPENS (payment_behavior pending_if_incomplete): Stripe holds the change until the
 * difference is paid. When the card pays at once the change is made and finished here; when the bank wants to confirm
 * (3-D Secure) the answer carries the payment's secret for the page to confirm in Stripe's own window, and the page then
 * calls finishPlanChange. Unpaid, Stripe drops the held change by itself: nothing changes.
 */
export async function applyPlanChange(db: Db, community: CommunityRow, person: PersonRef, input: { tierId: unknown; interval: unknown }, deps: PlanChangeDeps = defaultPlanChangeDeps(db)): Promise<Answer<PlanChangeDone>> {
  const p = await prepare(db, community, person, input, deps)
  if (!p.ok) return p as Answer<never>
  const v = p.value
  const interval: PlanInterval = input.interval === "year" ? "year" : "month"
  const paidFirst = v.proration === "always_invoice"
  const metadata = { product_id: v.target.productId, title: String(v.target.name).slice(0, 200), interval }
  let updated: UpdatedSub | null = null
  try {
    updated = (await deps.update(
      v.sub.id,
      {
        items: [{ id: v.itemId, price: v.priceId }],
        proration_behavior: v.proration,
        ...(v.proration === "none" ? {} : { proration_date: v.prorationDate }),
        /* Stripe takes no metadata with a held change: it moves in the finish, once paid. */
        ...(paidFirst ? { payment_behavior: "pending_if_incomplete", expand: ["latest_invoice.confirmation_secret"] } : { metadata }),
      },
      `plan-change:${v.row.id}:${v.target.productId}:${interval}:${v.row.product_id}:${v.row.billing_interval}`,
    )) as UpdatedSub | null
  } catch (e) {
    const err = e as { type?: string; code?: string; raw?: { message?: string }; message?: string }
    if (err?.type === "StripeCardError" || err?.code === "card_declined") return no(402, "card", `${err.raw?.message || "Your card was declined."} Nothing changed.`)
    return no(502, "stripe", "That did not go through. Nothing changed. Try again in a moment.")
  }
  if (paidFirst && updated?.pending_update) {
    const invoice = updated.latest_invoice && typeof updated.latest_invoice === "object" ? updated.latest_invoice : null
    const secret = invoice?.confirmation_secret?.client_secret
    if (!secret) return no(402, "card", "Your card could not pay the difference. Nothing changed. Update your card under Card and invoices, then try again.")
    return { ok: true, value: { kind: v.kind, toName: v.target.name, interval, needsAction: { clientSecret: secret } } }
  }
  if (paidFirst) {
    try {
      await deps.update(v.sub.id, { metadata }, `plan-change-meta:${v.row.id}:${v.target.productId}:${interval}`)
    } catch {
      /* The price moved; the next sync reads the product from the row below. */
    }
  }
  await settle(db, community, person, v.row, v.target, interval, v.kind, v.proration, v.fromName, `${v.target.productId}:${interval}:${v.prorationDate}`, deps)
  return { ok: true, value: { kind: v.kind, toName: v.target.name, interval } }
}

/** The row, the tier, the email and the log, once Stripe has the new plan. */
async function settle(db: Db, community: CommunityRow, person: PersonRef, row: MembershipRow, target: JoinOption, interval: PlanInterval, kind: ChangeKind, proration: Proration, fromName: string, changeId: string, deps: PlanChangeDeps) {
  /* The row follows the subscription to its new product; the sync then writes price, interval and dates from Stripe. */
  await db.from("memberships").update({ product_id: target.productId, title: String(target.name).slice(0, 200) }).eq("id", row.id)
  try {
    await deps.sync(row.stripe_subscription_id)
  } catch {
    /* The webhook brings it in step; the change itself is made. */
  }
  if (row.buyer_id) await deps.reconcile(community.id, row.buyer_id).catch(() => null)
  await deps.tell(row.id, { fromTitle: fromName, changeKind: kind, changeId }).catch(() => null)
  await audit(db, {
    communityId: community.id,
    actorId: person.id,
    actorKind: "member",
    action: kind === "upgrade" ? "membership.upgraded" : kind === "downgrade" ? "membership.downgraded" : "membership.interval_changed",
    targetType: "member",
    targetId: person.id,
    reason: null,
    detail: { membershipId: row.id, fromProductId: row.product_id, toProductId: target.productId, fromInterval: row.billing_interval, toInterval: interval, proration },
  })
}

/**
 * After the page confirmed an upgrade's payment with the bank: finished only when Stripe shows the new price on the
 * subscription and nothing held, so a page that says "paid" cannot move anybody by itself.
 */
export async function finishPlanChange(db: Db, community: CommunityRow, person: PersonRef, input: { tierId: unknown; interval: unknown }, deps: PlanChangeDeps = defaultPlanChangeDeps(db)): Promise<Answer<PlanChangeDone>> {
  const interval: PlanInterval | null = input.interval === "year" ? "year" : input.interval === "month" ? "month" : null
  if (!interval || typeof input.tierId !== "string") return no(400, "bad_request", "Choose a plan and how often to pay.")
  const lite = await membershipFor(db, community.id, person)
  const row = lite ? await fullRow(db, lite.id) : null
  if (!row) return no(404, "not_subscribed", "You do not pay for this community.")
  const target = (await communityOptions(db, community)).find((o) => o.tierId === input.tierId)
  if (!target?.productId) return no(409, "plan_unavailable", "That plan isn't available. Choose another.")
  const { data: planData } = await db
    .from("membership_plans")
    .select(`${PLAN_COLUMNS}, stripe_product_id, stripe_monthly_price_id, stripe_monthly_price_cents, stripe_yearly_price_id, stripe_yearly_price_cents`)
    .eq("product_id", target.productId)
    .maybeSingle()
  if (!planData) return no(409, "plan_unavailable", "That plan isn't available. Choose another.")
  let sub: StripeSub & { pending_update?: unknown }
  let price: { priceId: string }
  try {
    ;[sub, price] = await Promise.all([deps.retrieve(row.stripe_subscription_id) as Promise<StripeSub & { pending_update?: unknown }>, deps.ensurePrice(planData as PlanRow, { id: target.productId, title: target.name }, interval)])
  } catch {
    return no(502, "stripe", "That could not be checked just now. Try again in a moment.")
  }
  const onIt = sub.items?.data?.[0]?.price?.id === price.priceId && !sub.pending_update
  if (!onIt) return no(409, "not_paid", "The payment for the new plan has not gone through, so nothing changed.")
  if (row.product_id === target.productId && (row.billing_interval === "year" ? "year" : "month") === interval) {
    return { ok: true, value: { kind: "same", toName: target.name, interval } }
  }
  try {
    await deps.update(sub.id, { metadata: { product_id: target.productId, title: String(target.name).slice(0, 200), interval } }, `plan-change-meta:${row.id}:${target.productId}:${interval}`)
  } catch {
    /* The price moved; the row below names the product. */
  }
  const { data: fromProduct } = await db.from("products").select("title").eq("id", row.product_id ?? "").maybeSingle()
  const kind = changeKind({ productId: row.product_id ?? "", amountCents: row.amount_cents, interval: row.billing_interval === "year" ? "year" : "month" }, { productId: target.productId, amountCents: ((interval === "year" ? (planData as PlanRow).yearly_price_cents : (planData as PlanRow).monthly_price_cents) ?? 0), interval })
  await settle(db, community, person, row, target, interval, kind, "always_invoice", (fromProduct as { title?: string | null } | null)?.title || row.title || "Your plan", `${target.productId}:${interval}:finish`, deps)
  return { ok: true, value: { kind, toName: target.name, interval } }
}
