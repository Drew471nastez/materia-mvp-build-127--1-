import "server-only"

/**
 * The one Stripe subscription reader of this server instance
 * (lib/billing/subscription-state.ts): a 30 second cache per customer and a
 * single flight, shared by GET /api/billing/subscription, the billing
 * overview and the upgrade page, so the reads a Settings open makes ask
 * Stripe once. It never writes.
 *
 * Per instance: two serverless instances each ask once. The cache is short
 * so a change made in Stripe shows within half a minute, and the routes that
 * change a subscription call `invalidateBillingRead` for their customer.
 */
import { stripe } from "@/lib/stripe"
import {
  createSubscriptionReader,
  resolveSubscriptionView,
  type DbBilling,
  type ListSubscriptions,
  type SubscriptionView,
} from "./subscription-state"

/* eslint-disable @typescript-eslint/no-explicit-any */
const list: ListSubscriptions = (params, options) => stripe.subscriptions.list(params as any, options) as any
/* eslint-enable @typescript-eslint/no-explicit-any */

const g = globalThis as unknown as { __storelibSubscriptionReader?: ReturnType<typeof createSubscriptionReader> }
export const subscriptionReader = (g.__storelibSubscriptionReader ??= createSubscriptionReader({ list }))

export function invalidateBillingRead(customerId?: string | null): void {
  if (customerId) subscriptionReader.invalidate(customerId)
}

type Db = { from: (table: string) => any } // eslint-disable-line @typescript-eslint/no-explicit-any

export interface CreatorBillingRow {
  id: string
  subscription_plan_id: string | null
  subscription_status: string | null
  stripe_customer_id: string | null
}

/** The creator's subscriptions row, as the webhook wrote it. Null when there is none or it could not be read. */
export async function readSubscriptionRow(db: Db, creatorId: string): Promise<DbBilling["row"]> {
  try {
    const { data } = await db
      .from("subscriptions")
      .select("stripe_subscription_id, stripe_customer_id, plan_id, pending_plan_id, status, current_period_start, current_period_end, cancel_at_period_end, canceled_at")
      .eq("creator_id", creatorId)
      .maybeSingle()
    return (data as DbBilling["row"]) ?? null
  } catch {
    return null
  }
}

/**
 * What the creator's billing screens show: Stripe's answer through the
 * shared reader when the creator has a customer, the database's when they do
 * not or Stripe did not answer. Never creates a customer, never writes.
 */
export async function loadSubscriptionView(db: Db, creator: CreatorBillingRow, opts: { fresh?: boolean } = {}): Promise<SubscriptionView> {
  const row = await readSubscriptionRow(db, creator.id)
  const dbBilling: DbBilling = { planId: creator.subscription_plan_id, status: creator.subscription_status, row }
  const customers = [creator.stripe_customer_id, row?.stripe_customer_id]
  if (!customers.some((c) => typeof c === "string" && c.startsWith("cus_"))) return resolveSubscriptionView(dbBilling, null)
  const read = await subscriptionReader.read(customers, { fresh: opts.fresh })
  if (!read.ok) {
    console.warn("[Billing read] Stripe did not answer; serving the stored plan", { creatorId: creator.id, reason: read.reason, message: read.message })
  }
  const view = resolveSubscriptionView(dbBilling, read)
  if (view.drift) {
    console.warn("[Billing read] Stripe and the stored plan differ; left for the webhook and reconciliation", {
      creatorId: creator.id,
      stored: creator.subscription_plan_id,
      stripe: view.planId,
    })
  }
  return view
}
