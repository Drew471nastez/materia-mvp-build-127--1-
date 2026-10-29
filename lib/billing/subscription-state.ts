/**
 * ===========================================================================
 *  WHAT A CREATOR PAYS FOR, READ WITHOUT EVER GUESSING "FREE"
 * ===========================================================================
 * The billing reads (GET /api/billing/subscription, the billing overview, the
 * upgrade page) used to ask Stripe on every request and, when Stripe was slow
 * or failed, fall through to "no subscription" and write the creator back to
 * the free plan. A timeout is not an answer. This module is the one place
 * those reads go through:
 *
 *  - `readCustomerSubscriptions` asks Stripe with a deadline and says which
 *    of three things happened: Stripe answered (with the list), Stripe
 *    verified the customer does not exist, or Stripe could not be asked.
 *    Only the first two are facts about the subscription.
 *  - `createSubscriptionReader` puts a short per customer cache and a single
 *    flight in front of it, so ten tabs opening Settings make one call.
 *  - `resolveSubscriptionView` turns the database row (written by the Stripe
 *    webhook, lib/billing/subscription-sync.ts) and Stripe's answer into what
 *    a screen shows. When Stripe could not be asked it shows the database's
 *    plan, never Free.
 *
 * Nothing here writes. Plan changes are the webhook's and the reconciliation
 * script's (scripts/reconcile-creator-plans.ts), both through
 * lib/billing/subscription-sync.ts.
 */

export type PaidPlanId = "growth" | "pro"
export type ResolvedPlanId = "free" | PaidPlanId

/** Statuses that keep a paid plan's features. past_due keeps them while Stripe retries the card. */
export const ENTITLED_STATUSES: ReadonlySet<string> = new Set(["active", "trialing", "past_due"])

/** How long a billing read waits for Stripe. Shorter than a page's wait: the database answer is always there. */
export const STRIPE_READ_TIMEOUT_MS = 5_000
/** How long a confirmed Stripe answer is reused for the same customer. */
export const SUBSCRIPTION_CACHE_TTL_MS = 30_000
/** How long a failed read is reused, so an outage is not asked again by every request. */
export const SUBSCRIPTION_FAILURE_TTL_MS = 5_000
/**
 * THE STALENESS WINDOW. When Stripe cannot be asked, the last answer it did
 * give for the customer is served (marked stale) for this long. Past it, or
 * with none, the database's plan (written by the webhook) is served instead.
 * Neither is ever Free because a read failed. A webhook for the customer
 * forgets the last answer (`invalidate`), so a real change is never hidden
 * behind it.
 */
export const SUBSCRIPTION_STALE_IF_ERROR_MS = 15 * 60_000
/**
 * How far past its paid period a stored paying row may be before a read that
 * had to fall back to it says so (`storedExpired`). The plan is still served:
 * an error never downgrades. It is the sign that webhooks were missed and the
 * reconciliation (scripts/reconcile-creator-plans.ts) should run.
 */
export const STORED_PLAN_GRACE_MS = 7 * 24 * 60 * 60_000
const CACHE_MAX_ENTRIES = 2_000

// LIVE Stripe Price IDs (the same defaults the checkout and change routes use)
const PRICE_GROWTH = process.env.PRICE_GROWTH_MONTHLY || "price_1SzBWaBYevnBVyznNCTOXDoS"
const PRICE_PRO = process.env.PRICE_PRO_MONTHLY || "price_1SzBXSBYevnBVyznYjXfOOXX"

export function isPaidPlan(v: unknown): v is PaidPlanId {
  return v === "growth" || v === "pro"
}

/** The paid plan a Stripe price is, or null for a price this code does not know. Never "free". */
export function paidPlanFromPrice(priceId: string | null | undefined): PaidPlanId | null {
  if (!priceId) return null
  if (priceId === PRICE_GROWTH) return "growth"
  if (priceId === PRICE_PRO) return "pro"
  if (priceId.includes("SzBWa")) return "growth"
  if (priceId.includes("SzBXS")) return "pro"
  return null
}

/** Minimal shape of a Stripe subscription this code reads. */
export interface StripeSubLike {
  id: string
  status: string
  customer: string | { id: string }
  created?: number
  cancel_at_period_end?: boolean | null
  canceled_at?: number | null
  ended_at?: number | null
  metadata?: Record<string, string> | null
  items?: { data?: { price?: { id?: string } | null; current_period_start?: number; current_period_end?: number }[] }
  [key: string]: unknown
}

export function customerIdOf(sub: Pick<StripeSubLike, "customer">): string | null {
  const c = sub.customer
  if (typeof c === "string") return c
  return c && typeof c === "object" && typeof c.id === "string" ? c.id : null
}

/** The price first (it is what Stripe bills), then the plan the checkout wrote on the subscription. */
export function paidPlanFromSubscription(sub: StripeSubLike): PaidPlanId | null {
  const fromPrice = paidPlanFromPrice(sub.items?.data?.[0]?.price?.id)
  if (fromPrice) return fromPrice
  const meta = sub.metadata?.plan_id
  return isPaidPlan(meta) ? meta : null
}

/** Entitled first (active, then trialing, then past_due), newest first within each. */
export function preferredSubscription<T extends StripeSubLike>(subs: readonly T[]): T | null {
  const rank = (s: T) => (s.status === "active" ? 0 : s.status === "trialing" ? 1 : s.status === "past_due" ? 2 : 3)
  const sorted = [...subs].sort((a, b) => rank(a) - rank(b) || (b.created ?? 0) - (a.created ?? 0))
  return sorted[0] ?? null
}

// ---------------------------------------------------------------------------
// Stripe errors
// ---------------------------------------------------------------------------

/**
 * Stripe verified the object does not exist (404 resource_missing). This is
 * the only error that says anything about the customer. A timeout, a
 * connection error, a 5xx, a rate limit or an auth error say nothing.
 */
export function isStripeNotFound(error: unknown): boolean {
  const e = error as { type?: string; code?: string; statusCode?: number; raw?: { code?: string } } | null
  if (!e || typeof e !== "object") return false
  if (e.code === "resource_missing" || e.raw?.code === "resource_missing") return true
  return e.type === "StripeInvalidRequestError" && e.statusCode === 404
}

export class StripeDeadlineError extends Error {
  readonly type = "StripeConnectionError"
  readonly code = "storelib_deadline"
  constructor(label: string, ms: number) {
    super(`${label}: Stripe did not answer within ${ms}ms`)
  }
}

/**
 * The call's own `timeout` request option stops the HTTP request; this is
 * the belt to it, for a promise that never settles at all. The losing
 * promise's rejection is swallowed so it is never unhandled.
 */
export function withDeadline<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new StripeDeadlineError(label, ms)), ms)
  })
  promise.catch(() => {})
  return Promise.race([promise, deadline]).finally(() => {
    if (timer) clearTimeout(timer)
  })
}

function failureReason(error: unknown): "timeout" | "unreachable" | "error" {
  const e = error as { type?: string; code?: string; statusCode?: number } | null
  if (e instanceof StripeDeadlineError || e?.code === "ETIMEDOUT" || /timed? ?out/i.test(String((error as Error)?.message ?? ""))) return "timeout"
  if (e?.type === "StripeConnectionError" || e?.type === "StripeAPIError" || (typeof e?.statusCode === "number" && e.statusCode >= 500)) return "unreachable"
  return "error"
}

// ---------------------------------------------------------------------------
// Reading one customer's subscriptions
// ---------------------------------------------------------------------------

export type SubscriptionsRead =
  /** `stale`: Stripe could not be asked just now; this is its last answer, inside SUBSCRIPTION_STALE_IF_ERROR_MS. */
  | { ok: true; customers: string[]; subscriptions: StripeSubLike[]; stale?: boolean }
  | { ok: false; reason: "timeout" | "unreachable" | "error"; message: string }

/** What reading one customer from Stripe needs: the list call, with Stripe's per request options. */
export type ListSubscriptions = (
  params: { customer: string; status: "all"; limit: number; expand: string[] },
  options: { timeout: number },
) => Promise<{ data: StripeSubLike[] }>

type OneCustomerRead =
  | { ok: true; subscriptions: StripeSubLike[]; stale?: boolean }
  | { ok: false; reason: "timeout" | "unreachable" | "error"; message: string }

async function readOneCustomer(list: ListSubscriptions, customerId: string, timeoutMs: number): Promise<OneCustomerRead> {
  try {
    const res = await withDeadline(
      list({ customer: customerId, status: "all", limit: 10, expand: ["data.latest_invoice"] }, { timeout: timeoutMs }),
      timeoutMs + 500,
      "subscriptions.list",
    )
    return { ok: true, subscriptions: Array.isArray(res?.data) ? res.data : [] }
  } catch (error) {
    /* Verified: this customer does not exist on these keys, so it has no subscriptions. */
    if (isStripeNotFound(error)) return { ok: true, subscriptions: [] }
    return { ok: false, reason: failureReason(error), message: error instanceof Error ? error.message : String(error) }
  }
}

interface CacheEntry {
  at: number
  value: OneCustomerRead
}

export interface SubscriptionReader {
  /**
   * Every subscription across these customers. `fresh` skips the cache (after
   * the creator changed something) but still joins a read already in flight.
   */
  read(customerIds: readonly (string | null | undefined)[], opts?: { fresh?: boolean }): Promise<SubscriptionsRead>
  invalidate(customerId?: string | null): void
  /** Stripe calls actually made, for tests and logs. */
  readonly calls: number
}

export function createSubscriptionReader(opts: {
  list: ListSubscriptions
  ttlMs?: number
  failureTtlMs?: number
  staleIfErrorMs?: number
  timeoutMs?: number
  now?: () => number
}): SubscriptionReader {
  const ttl = opts.ttlMs ?? SUBSCRIPTION_CACHE_TTL_MS
  const failureTtl = opts.failureTtlMs ?? SUBSCRIPTION_FAILURE_TTL_MS
  const staleIfError = opts.staleIfErrorMs ?? SUBSCRIPTION_STALE_IF_ERROR_MS
  const timeoutMs = opts.timeoutMs ?? STRIPE_READ_TIMEOUT_MS
  const now = opts.now ?? (() => Date.now())
  const cache = new Map<string, CacheEntry>()
  /* The last answer Stripe actually gave per customer, for the staleness window. */
  const lastGood = new Map<string, { at: number; subscriptions: StripeSubLike[] }>()
  const inFlight = new Map<string, Promise<OneCustomerRead>>()
  let calls = 0

  const one = (customerId: string, fresh: boolean): Promise<OneCustomerRead> => {
    const hit = cache.get(customerId)
    if (!fresh && hit && now() - hit.at < (hit.value.ok ? ttl : failureTtl)) return Promise.resolve(hit.value)
    const flying = inFlight.get(customerId)
    if (flying) return flying
    calls++
    const p = readOneCustomer(opts.list, customerId, timeoutMs)
      .then((read) => {
        let value: OneCustomerRead = read
        if (read.ok) {
          if (lastGood.size >= CACHE_MAX_ENTRIES && !lastGood.has(customerId)) {
            const oldest = lastGood.keys().next().value
            if (oldest !== undefined) lastGood.delete(oldest)
          }
          lastGood.delete(customerId)
          lastGood.set(customerId, { at: now(), subscriptions: read.subscriptions })
        } else {
          const good = lastGood.get(customerId)
          if (good && now() - good.at < staleIfError) value = { ok: true, subscriptions: good.subscriptions, stale: true }
        }
        if (cache.size >= CACHE_MAX_ENTRIES) {
          const oldest = cache.keys().next().value
          if (oldest !== undefined) cache.delete(oldest)
        }
        cache.delete(customerId)
        /* A stale answer is kept only as long as a failure would be, so Stripe is asked again soon. */
        cache.set(customerId, { at: value.ok && value.stale ? now() - ttl + failureTtl : now(), value })
        return value
      })
      .finally(() => inFlight.delete(customerId))
    inFlight.set(customerId, p)
    return p
  }

  return {
    async read(customerIds, o) {
      const ids = [...new Set(customerIds.filter((c): c is string => typeof c === "string" && c.startsWith("cus_")))]
      if (!ids.length) return { ok: true, customers: [], subscriptions: [] }
      const results = await Promise.all(ids.map((id) => one(id, o?.fresh === true)))
      const subscriptions = results.flatMap((r) => (r.ok ? r.subscriptions : []))
      const failed = results.find((r): r is Extract<OneCustomerRead, { ok: false }> => !r.ok)
      /* A paying subscription found on any customer is a fact even if another customer could not be read. */
      if (failed && !subscriptions.some((s) => ENTITLED_STATUSES.has(s.status))) {
        return { ok: false, reason: failed.reason, message: failed.message }
      }
      const stale = !!failed || results.some((r) => r.ok && r.stale === true)
      return stale ? { ok: true, customers: ids, subscriptions, stale: true } : { ok: true, customers: ids, subscriptions }
    },
    invalidate(customerId) {
      if (customerId) {
        cache.delete(customerId)
        lastGood.delete(customerId)
      } else {
        cache.clear()
        lastGood.clear()
      }
    },
    get calls() {
      return calls
    },
  }
}

// ---------------------------------------------------------------------------
// Period dates (SDK v20 removed current_period_start/end from the top level)
// ---------------------------------------------------------------------------

export function safeTimestamp(ts: unknown): string {
  if (!ts) return new Date().toISOString()
  if (ts instanceof Date) return ts.toISOString()
  if (typeof ts === "string") return ts
  if (typeof ts === "number" && !isNaN(ts)) {
    const d = ts > 1e12 ? new Date(ts) : new Date(ts * 1000)
    return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString()
  }
  return new Date().toISOString()
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export function subscriptionPeriod(sub: any): { start: string; end: string } {
  let periodStart: any = sub.current_period_start || sub.current_period?.start_date || sub.items?.data?.[0]?.current_period_start || null
  let periodEnd: any = sub.current_period_end || sub.current_period?.end_date || sub.items?.data?.[0]?.current_period_end || null
  const inv = typeof sub.latest_invoice === "object" && sub.latest_invoice ? sub.latest_invoice : null
  if (inv) {
    periodStart ||= inv.period_start || inv.period?.start_date || inv.period?.start || inv.lines?.data?.[0]?.period?.start || null
    periodEnd ||= inv.period_end || inv.period?.end_date || inv.period?.end || inv.lines?.data?.[0]?.period?.end || null
  }
  if (!periodEnd || (periodStart && String(periodStart) === String(periodEnd))) {
    const anchor = sub.billing_cycle_anchor || sub.start_date
    if (anchor) {
      const anchorMs = typeof anchor === "number" ? (anchor > 1e12 ? anchor : anchor * 1000) : new Date(anchor).getTime()
      const anchorDate = new Date(anchorMs)
      const now = new Date()
      const anchorDay = new Date(anchorDate.getFullYear(), anchorDate.getMonth(), anchorDate.getDate())
      const todayDay = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      while (anchorDay <= todayDay) {
        anchorDate.setMonth(anchorDate.getMonth() + 1)
        anchorDay.setMonth(anchorDay.getMonth() + 1)
      }
      periodEnd = anchorDate.toISOString()
      if (!periodStart) {
        const startDate = new Date(anchorDate)
        startDate.setMonth(startDate.getMonth() - 1)
        periodStart = startDate.toISOString()
      }
    }
  }
  return { start: safeTimestamp(periodStart), end: safeTimestamp(periodEnd) }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// ---------------------------------------------------------------------------
// What a screen shows
// ---------------------------------------------------------------------------

/** The creator's billing as the database has it (written by the webhook). */
export interface DbBilling {
  planId: string | null
  status: string | null
  row: {
    stripe_subscription_id: string | null
    stripe_customer_id?: string | null
    plan_id: string | null
    pending_plan_id?: string | null
    status: string | null
    current_period_start: string | null
    current_period_end: string | null
    cancel_at_period_end: boolean | null
    canceled_at?: string | null
  } | null
}

export interface SubscriptionJson {
  id: string
  stripe_subscription_id: string
  plan_id: string
  pending_plan_id?: string | null
  status: string
  current_period_start?: string | null
  current_period_end: string | null
  cancel_at_period_end: boolean
  canceled_at?: string | null
}

export interface SubscriptionView {
  planId: ResolvedPlanId
  status: string
  subscription: SubscriptionJson | null
  /** Where the answer came from. "database" when Stripe was not asked or did not answer. */
  source: "stripe" | "database"
  /** Stripe was asked and could not answer: the plan shown is the database's. */
  stale: boolean
  /** Stripe and the database disagree. Nothing is written here; the reconciliation fixes it. */
  drift: boolean
  /**
   * Stale and served from a stored paying row whose period ended more than
   * STORED_PLAN_GRACE_MS ago. The plan is still served (an error never
   * downgrades); this is for the log and the reconciliation.
   */
  storedExpired?: boolean
}

function fromDatabase(db: DbBilling, stale: boolean, now: number = Date.now()): SubscriptionView {
  const planId: ResolvedPlanId = isPaidPlan(db.planId) ? db.planId : "free"
  const row = db.row
  let subscription: SubscriptionJson | null = null
  if (row?.stripe_subscription_id && row.status) {
    const rowPlan = isPaidPlan(row.plan_id) ? row.plan_id : planId
    if (ENTITLED_STATUSES.has(row.status)) {
      subscription = {
        id: row.stripe_subscription_id,
        stripe_subscription_id: row.stripe_subscription_id,
        plan_id: rowPlan,
        pending_plan_id: row.pending_plan_id ?? null,
        status: row.status,
        current_period_start: row.current_period_start,
        current_period_end: row.current_period_end,
        cancel_at_period_end: row.cancel_at_period_end === true,
      }
    } else if (row.status === "canceled" && planId === "free") {
      subscription = {
        id: row.stripe_subscription_id,
        stripe_subscription_id: row.stripe_subscription_id,
        plan_id: rowPlan,
        status: "canceled",
        canceled_at: row.canceled_at ?? null,
        cancel_at_period_end: false,
        current_period_end: row.current_period_end,
      }
    }
  }
  const status = subscription?.status ?? (planId === "free" ? "inactive" : db.status || "active")
  const end = row?.current_period_end ? Date.parse(row.current_period_end) : NaN
  const storedExpired = stale && planId !== "free" && Number.isFinite(end) && now - end > STORED_PLAN_GRACE_MS
  return { planId, status, subscription, source: "database", stale, drift: false, ...(storedExpired ? { storedExpired: true } : {}) }
}

/**
 * Stripe's answer when there is one; the database's when Stripe was not
 * asked (null) or could not answer. Never "free" because a read failed.
 */
export function resolveSubscriptionView(db: DbBilling, stripe: SubscriptionsRead | null, now: number = Date.now()): SubscriptionView {
  if (!stripe) return fromDatabase(db, false, now)
  if (!stripe.ok) return fromDatabase(db, true, now)
  const view = resolveFromStripe(db, stripe)
  if (!stripe.stale) return view
  /*
    A stale answer (the last one Stripe gave, inside the window) never moves a
    paying creator to Free: if it says nothing is paying while the database
    says they pay, the database's plan is shown.
  */
  if (view.planId === "free" && isPaidPlan(db.planId)) return fromDatabase(db, true, now)
  return { ...view, stale: true }
}

function resolveFromStripe(db: DbBilling, stripe: Extract<SubscriptionsRead, { ok: true }>): SubscriptionView {
  const preferred = preferredSubscription(stripe.subscriptions)
  if (preferred && ENTITLED_STATUSES.has(preferred.status)) {
    const known = paidPlanFromSubscription(preferred)
    /* A paying subscription on a price this code does not know: the stored paid plan, flagged, never Free. */
    const plan = known ?? (isPaidPlan(db.planId) ? db.planId : null)
    if (!plan) {
      /* A paying subscription on a price this code does not know: not proof of Free. Show what the database has. */
      return { ...fromDatabase(db, false), drift: true }
    }
    const period = subscriptionPeriod(preferred)
    return {
      planId: plan,
      status: preferred.status,
      subscription: {
        id: preferred.id,
        stripe_subscription_id: preferred.id,
        plan_id: plan,
        pending_plan_id: (preferred.metadata?.pending_plan_id as string) || null,
        status: preferred.status,
        current_period_start: period.start,
        current_period_end: period.end,
        cancel_at_period_end: preferred.cancel_at_period_end === true,
      },
      source: "stripe",
      stale: false,
      drift: !known || db.planId !== plan,
    }
  }

  /* Stripe answered and nothing is paying. Shown as Free; the database is left for the webhook and the reconciliation. */
  const canceled = stripe.subscriptions.filter((s) => s.status === "canceled").sort((a, b) => (b.created ?? 0) - (a.created ?? 0))[0]
  const subscription: SubscriptionJson | null = canceled
    ? {
        id: canceled.id,
        stripe_subscription_id: canceled.id,
        plan_id: paidPlanFromSubscription(canceled) ?? "free",
        status: "canceled",
        canceled_at: canceled.canceled_at ? safeTimestamp(canceled.canceled_at) : null,
        cancel_at_period_end: false,
        current_period_end: canceled.ended_at ? safeTimestamp(canceled.ended_at) : null,
      }
    : null
  return {
    planId: "free",
    status: canceled ? "canceled" : "inactive",
    subscription,
    source: "stripe",
    stale: false,
    drift: isPaidPlan(db.planId),
  }
}

/**
 * Whether a creator may start a plan checkout (/api/billing/subscription/create):
 *  - "paying": Stripe says a subscription is paying (or, when Stripe cannot
 *    be asked, the stored row says so). A second checkout would bill twice.
 *  - "unknown": Stripe cannot be asked and the stored row says they pay.
 *    Nothing is started.
 *  - "clear": nothing is paying.
 * A stale answer (Stripe's last one) is not enough to say "clear" over a
 * stored paying row.
 */
export function alreadyPayingVerdict(
  row: { stripe_subscription_id: string | null; status: string | null } | null,
  stripe: SubscriptionsRead | null,
): "paying" | "unknown" | "clear" {
  const storedPaying = !!row?.stripe_subscription_id && !!row.status && ENTITLED_STATUSES.has(row.status)
  if (stripe && stripe.ok) {
    if (stripe.subscriptions.some((s) => ENTITLED_STATUSES.has(s.status))) return "paying"
    if (stripe.stale && storedPaying) return "unknown"
    return "clear"
  }
  if (stripe && !stripe.ok) return storedPaying ? "unknown" : "clear"
  /* No customer to ask: only the stored row. */
  return storedPaying ? "unknown" : "clear"
}
