/**
 * ===========================================================================
 *  THE ONE WRITER OF A CREATOR'S PAID PLAN
 * ===========================================================================
 * Called by the Stripe webhook for customer.subscription.created, .updated
 * and .deleted, and by scripts/reconcile-creator-plans.ts. Billing reads
 * (lib/billing/subscription-state.ts) never write.
 *
 * WHAT THE EVENT SAYS IS ONLY A HINT. Stripe delivers events late, twice and
 * out of order, so the event's copy of the subscription can be older than
 * what is true. This lists every subscription on the creator's customers
 * (the event's customer, the stored one, the one on the subscriptions row)
 * from Stripe now, and writes what that list says:
 *
 *  - a paying subscription (active, trialing, past_due) on a known price:
 *    that plan.
 *  - a paying subscription on a price this code does not know: nothing is
 *    written ("unknown_price"); never Free.
 *  - Stripe answered and nothing is paying: Free.
 *  - Stripe could not be asked: it throws, the webhook answers 500 and
 *    Stripe sends the event again. Nothing is written.
 *
 * Applying the same answer twice writes nothing the second time (each write
 * is skipped when the row already says it), so a repeated or reordered
 * event cannot move a plan backwards.
 */
import {
  customerIdOf,
  ENTITLED_STATUSES,
  isPaidPlan,
  isStripeNotFound,
  paidPlanFromPrice,
  paidPlanFromSubscription,
  preferredSubscription,
  safeTimestamp,
  subscriptionPeriod,
  withDeadline,
  type PaidPlanId,
  type StripeSubLike,
} from "./subscription-state"

/* eslint-disable @typescript-eslint/no-explicit-any */
type Db = { from: (table: string) => any }

export const WEBHOOK_STRIPE_TIMEOUT_MS = 10_000

export interface CreatorBilling {
  id: string
  stripe_customer_id: string | null
  subscription_plan_id: string | null
  subscription_status: string | null
  /** The subscriptions row, if any. */
  row: { stripe_subscription_id: string | null; stripe_customer_id: string | null; plan_id: string | null; status: string | null; cancel_at_period_end: boolean | null } | null
}

export interface SyncDeps {
  /** The service role (subscriptions is a money table, written by the server only: run-now part 62). */
  db: Db
  /** subscriptions.list for one customer, status "all". Throws when Stripe could not answer. */
  listSubscriptions(customerId: string): Promise<StripeSubLike[]>
  /** Clears metadata.pending_plan_id once the price already is that plan. Optional. */
  clearPendingPlan?(subscriptionId: string, metadata: Record<string, string>): Promise<void>
  /** Keeps the paid plan on an admin override row (lib/billing/plan-override recordPaidPlan). Optional. */
  recordPaidPlan?(creatorId: string, planId: string, status: string | null): Promise<void>
  log?(message: string, detail?: Record<string, unknown>): void
}

export type SyncOutcome = "paid" | "free" | "unknown_price" | "no_customer"

export interface SyncPlan {
  creatorId: string
  outcome: SyncOutcome
  planId: PaidPlanId | "free" | null
  status: string | null
  chosenSubscriptionId: string | null
  customersRead: string[]
  /** null: nothing to change on creators. */
  creatorUpdate: { subscription_plan_id?: string; subscription_status?: string; stripe_customer_id?: string } | null
  /** null: nothing to change on subscriptions. */
  subscriptionUpsert: Record<string, unknown> | null
  pendingToClear: { id: string; metadata: Record<string, string> } | null
  before: { plan: string | null; status: string | null; customer: string | null }
}

const CREATOR_COLUMNS = "id, stripe_customer_id, subscription_plan_id, subscription_status"
const ROW_COLUMNS = "stripe_subscription_id, stripe_customer_id, plan_id, status, cancel_at_period_end"

async function loadCreator(db: Db, creatorId: string): Promise<CreatorBilling | null> {
  const { data: c, error } = await db.from("creators").select(CREATOR_COLUMNS).eq("id", creatorId).maybeSingle()
  if (error) throw new Error(`creators read failed: ${error.message}`)
  if (!c) return null
  const { data: row, error: rowError } = await db.from("subscriptions").select(ROW_COLUMNS).eq("creator_id", creatorId).maybeSingle()
  if (rowError) throw new Error(`subscriptions read failed: ${rowError.message}`)
  return { ...(c as Omit<CreatorBilling, "row">), row: (row as CreatorBilling["row"]) ?? null }
}

/**
 * Whose subscription this is: the subscriptions row that already names it,
 * else the creator the checkout wrote on it (metadata.creator_id), else the
 * creator whose stored customer it is. Null when none of them is a creator.
 */
export async function resolveCreatorForSubscription(db: Db, sub: StripeSubLike): Promise<CreatorBilling | null> {
  const byRow = await db.from("subscriptions").select("creator_id").eq("stripe_subscription_id", sub.id).maybeSingle()
  if (byRow.error) throw new Error(`subscriptions read failed: ${byRow.error.message}`)
  if (byRow.data?.creator_id) return loadCreator(db, byRow.data.creator_id)

  const meta = sub.metadata?.creator_id
  if (typeof meta === "string" && /^[0-9a-f-]{36}$/i.test(meta)) {
    const c = await loadCreator(db, meta)
    if (c) return c
  }

  const customer = customerIdOf(sub)
  if (customer) {
    const { data, error } = await db.from("creators").select("id").eq("stripe_customer_id", customer).limit(2)
    if (error) throw new Error(`creators read failed: ${error.message}`)
    /* One creator only: a customer shared by two rows is not guessed at. */
    if (Array.isArray(data) && data.length === 1) return loadCreator(db, data[0].id)
  }
  return null
}

async function listAll(deps: SyncDeps, customers: string[]): Promise<StripeSubLike[]> {
  const out: StripeSubLike[] = []
  for (const customer of customers) {
    try {
      out.push(...(await deps.listSubscriptions(customer)))
    } catch (error) {
      /* Verified missing: no subscriptions there. Anything else is not an answer and stops the sync. */
      if (isStripeNotFound(error)) continue
      throw error
    }
  }
  return out
}

/** What Stripe says the creator's plan is, and the writes that would make the database say it. Writes nothing. */
export async function planCreatorSync(deps: SyncDeps, creator: CreatorBilling, extraCustomers: readonly (string | null | undefined)[] = []): Promise<SyncPlan> {
  const customers = [...new Set([...extraCustomers, creator.stripe_customer_id, creator.row?.stripe_customer_id].filter((c): c is string => typeof c === "string" && c.startsWith("cus_")))]
  const before = { plan: creator.subscription_plan_id, status: creator.subscription_status, customer: creator.stripe_customer_id }
  const base = { creatorId: creator.id, customersRead: customers, before, pendingToClear: null }
  if (!customers.length) {
    return { ...base, outcome: "no_customer", planId: null, status: null, chosenSubscriptionId: null, creatorUpdate: null, subscriptionUpsert: null }
  }

  const subs = (await listAll(deps, customers)).filter((s) => {
    const c = customerIdOf(s)
    return !!c && customers.includes(c)
  })
  const preferred = preferredSubscription(subs)

  if (preferred && ENTITLED_STATUSES.has(preferred.status)) {
    const plan = paidPlanFromSubscription(preferred)
    if (!plan) {
      return { ...base, outcome: "unknown_price", planId: null, status: preferred.status, chosenSubscriptionId: preferred.id, creatorUpdate: null, subscriptionUpsert: null }
    }
    const customer = customerIdOf(preferred) as string
    const update: NonNullable<SyncPlan["creatorUpdate"]> = {}
    if (creator.subscription_plan_id !== plan) update.subscription_plan_id = plan
    if (creator.subscription_status !== preferred.status) update.subscription_status = preferred.status
    /* The customer that pays is the creator's customer (repairs a replacement customer made after a Stripe error). */
    if (creator.stripe_customer_id !== customer) update.stripe_customer_id = customer
    const pending = preferred.metadata?.pending_plan_id
    const period = subscriptionPeriod(preferred)
    const upsert = rowFor(creator.id, preferred, customer, plan, period, isPaidPlan(pending) && pending !== plan ? pending : null)
    return {
      ...base,
      outcome: "paid",
      planId: plan,
      status: preferred.status,
      chosenSubscriptionId: preferred.id,
      creatorUpdate: Object.keys(update).length ? update : null,
      /* Always written: the period dates move on every renewal, and the same values twice change nothing. */
      subscriptionUpsert: upsert,
      /* A scheduled downgrade has happened once the price is the pending plan: its marker can go. */
      pendingToClear: preferred.status === "active" && isPaidPlan(pending) && paidPlanFromPrice(preferred.items?.data?.[0]?.price?.id) === pending ? { id: preferred.id, metadata: (preferred.metadata ?? {}) as Record<string, string> } : null,
    }
  }

  /* Stripe answered for every customer and nothing is paying. */
  const update: NonNullable<SyncPlan["creatorUpdate"]> = {}
  if (creator.subscription_plan_id !== "free") update.subscription_plan_id = "free"
  if (creator.subscription_status !== "active") update.subscription_status = "active"
  let upsert: Record<string, unknown> | null = null
  if (preferred) {
    const plan = paidPlanFromSubscription(preferred) ?? (isPaidPlan(creator.row?.plan_id) ? creator.row!.plan_id : null)
    if (plan) {
      const row = rowFor(creator.id, preferred, customerIdOf(preferred) as string, plan, subscriptionPeriod(preferred), null)
      /* The newest subscription the customers have, so a row is never put back to an older one. */
      upsert = row
    }
  }
  return {
    ...base,
    outcome: "free",
    planId: "free",
    status: preferred?.status ?? null,
    chosenSubscriptionId: preferred?.id ?? null,
    creatorUpdate: Object.keys(update).length ? update : null,
    subscriptionUpsert: upsert,
  }
}

function rowFor(creatorId: string, sub: StripeSubLike, customer: string, plan: string, period: { start: string; end: string }, pending: string | null): Record<string, unknown> {
  return {
    creator_id: creatorId,
    stripe_subscription_id: sub.id,
    stripe_customer_id: customer,
    plan_id: plan,
    pending_plan_id: pending,
    status: sub.status,
    current_period_start: period.start,
    current_period_end: period.end,
    cancel_at_period_end: sub.cancel_at_period_end === true,
    canceled_at: sub.canceled_at ? safeTimestamp(sub.canceled_at) : null,
  }
}

/** Writes the plan. Throws on any database error, so the webhook answers 500 and Stripe retries. */
export async function applyCreatorSync(deps: SyncDeps, plan: SyncPlan): Promise<void> {
  const db = deps.db
  if (plan.subscriptionUpsert) {
    const { error } = await db
      .from("subscriptions")
      .upsert({ ...plan.subscriptionUpsert, updated_at: new Date().toISOString() }, { onConflict: "creator_id" })
    if (error) throw new Error(`subscriptions not written: ${error.message}`)
  }
  if (plan.creatorUpdate) {
    const { error } = await db.from("creators").update(plan.creatorUpdate).eq("id", plan.creatorId)
    if (error) throw new Error(`creators plan not written: ${error.message}`)
  }
  if (deps.recordPaidPlan && (plan.outcome === "paid" || plan.outcome === "free")) {
    await deps.recordPaidPlan(plan.creatorId, plan.planId as string, plan.outcome === "free" ? "active" : plan.status)
  }
  if (plan.pendingToClear && deps.clearPendingPlan) {
    try {
      await deps.clearPendingPlan(plan.pendingToClear.id, plan.pendingToClear.metadata)
    } catch (error) {
      /* Cosmetic: the plan is already right. The next event tries again. */
      deps.log?.("[Subscription sync] pending_plan_id not cleared", { error: error instanceof Error ? error.message : String(error) })
    }
  }
  if (plan.creatorUpdate?.subscription_plan_id) {
    deps.log?.("[Subscription sync] plan changed", {
      creatorId: plan.creatorId,
      from: plan.before.plan,
      to: plan.creatorUpdate.subscription_plan_id,
      subscription: plan.chosenSubscriptionId,
      status: plan.status,
    })
  }
}

/** Plan and (unless dryRun) apply. The answer says what was, or would be, written. */
export async function syncCreatorFromStripe(
  deps: SyncDeps,
  creator: CreatorBilling,
  opts: { extraCustomers?: readonly (string | null | undefined)[]; dryRun?: boolean } = {},
): Promise<SyncPlan> {
  const plan = await planCreatorSync(deps, creator, opts.extraCustomers ?? [])
  if (plan.outcome === "unknown_price") {
    deps.log?.("[Subscription sync] paying subscription on an unknown price; plan left as it is", { creatorId: creator.id, subscription: plan.chosenSubscriptionId })
  }
  if (!opts.dryRun) await applyCreatorSync(deps, plan)
  return plan
}

/** The webhook's entry: whose subscription, then the sync. Null when no creator owns it. */
export async function syncFromSubscriptionEvent(deps: SyncDeps, sub: StripeSubLike): Promise<{ creator: CreatorBilling; plan: SyncPlan } | null> {
  const creator = await resolveCreatorForSubscription(deps.db, sub)
  if (!creator) return null
  const plan = await syncCreatorFromStripe(deps, creator, { extraCustomers: [customerIdOf(sub)] })
  return { creator, plan }
}

/** Stripe's subscriptions.list for the sync: every status, bounded in time. */
export function stripeListForSync(list: (params: any, options: any) => Promise<{ data: StripeSubLike[] }>, timeoutMs = WEBHOOK_STRIPE_TIMEOUT_MS) {
  return async (customer: string): Promise<StripeSubLike[]> => {
    const res = await withDeadline(
      list({ customer, status: "all", limit: 20, expand: ["data.latest_invoice"] }, { timeout: timeoutMs }),
      timeoutMs + 500,
      "subscriptions.list",
    )
    return Array.isArray(res?.data) ? res.data : []
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */
