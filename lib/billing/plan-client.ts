/**
 * ===========================================================================
 *  ONE /api/billing/subscription REQUEST FOR EVERYTHING ON SCREEN
 * ===========================================================================
 * Settings, the OnePage editor and its Settings tab, and the billing tab each
 * fetched the plan on mount, and Settings refetched on every open, so one
 * screen could ask three times in a second. In the browser this keeps one
 * answer for 15 seconds and one request in flight: callers in the same
 * moment share it. A plan change (components/app/plan-watch.tsx, or the
 * billing tab after the creator acts) asks with `fresh`, which also tells
 * the server to skip its own cache.
 *
 * A failed request answers null, never a made up "free": the caller keeps
 * the plan it already has.
 */
export interface BillingSubscriptionAnswer {
  subscription: { plan_id?: string; status?: string; [key: string]: unknown } | null
  currentPlan: { id?: string; [key: string]: unknown } | null
  status?: string
  source?: "stripe" | "database"
  stale?: boolean
  override?: string
}

const TTL_MS = 15_000
let cached: { at: number; value: BillingSubscriptionAnswer } | null = null
let inFlight: { fresh: boolean; promise: Promise<BillingSubscriptionAnswer | null> } | null = null

export function forgetBillingSubscription(): void {
  cached = null
}

if (typeof window !== "undefined") {
  /* An admin's plan change (components/app/plan-watch.tsx PLAN_CHANGED_EVENT). */
  window.addEventListener("storelib:plan-changed", forgetBillingSubscription)
}

export function fetchBillingSubscription(opts: { fresh?: boolean } = {}): Promise<BillingSubscriptionAnswer | null> {
  const fresh = opts.fresh === true
  if (!fresh && cached && Date.now() - cached.at < TTL_MS) return Promise.resolve(cached.value)
  /* A fresh ask joins a fresh one in flight; an ordinary ask joins either. */
  if (inFlight && (inFlight.fresh || !fresh)) return inFlight.promise
  const promise = fetch(fresh ? "/api/billing/subscription?fresh=1" : "/api/billing/subscription", { cache: "no-store" })
    .then(async (r) => {
      if (!r.ok) return null
      const value = (await r.json()) as BillingSubscriptionAnswer
      cached = { at: Date.now(), value }
      return value
    })
    .catch(() => null)
    .finally(() => {
      if (inFlight?.promise === promise) inFlight = null
    })
  inFlight = { fresh, promise }
  return promise
}

/** The plan id an answer names: the subscription's, else the current plan's. Null for no answer. */
export function planIdOf(answer: BillingSubscriptionAnswer | null): "free" | "growth" | "pro" | null {
  if (!answer) return null
  const id = answer.currentPlan?.id || answer.subscription?.plan_id
  return id === "growth" || id === "pro" ? id : "free"
}
