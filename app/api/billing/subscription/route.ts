import { moneyCaller } from "@/lib/team/money"
import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { loadSubscriptionView } from "@/lib/billing/subscription-reader"
import { readPlanOverride } from "@/lib/billing/plan-override"
import { FREE_STANDARD_RATE, ratePercentLabel } from "@/lib/payments/fees/config"
import { isServiceUnavailable } from "@/lib/net/service-error"
import { storeUnavailableResponse } from "@/lib/team/server"

const FREE_PLAN = {
  id: "free",
  name: "Free",
  price_cents: 0,
  billing_period: null,
  fee_percent: FREE_STANDARD_RATE,
  fee_fixed_cents: 25,
  features: [`${ratePercentLabel(FREE_STANDARD_RATE)} + $0.25 per transaction`, "Basic analytics", "Standard support"],
  is_active: true,
}

const GROWTH_PLAN = {
  id: "growth",
  // Sold as "Pro". The id stays "growth": it is the $29 Stripe price.
  name: "Pro",
  price_cents: 2900,
  billing_period: "month",
  fee_percent: 0.03,
  fee_fixed_cents: 25,
  features: ["3% + $0.25 per sale", "Advanced analytics & reports", "Priority email support", "Custom domain support"],
  is_active: true,
}

const PRO_PLAN = {
  // The $99 plan, offered again (wave 13) and sold as "Scale". The id stays "pro": it is the $99 Stripe price.
  id: "pro",
  name: "Scale",
  price_cents: 9900,
  billing_period: "month",
  fee_percent: 0.015,
  fee_fixed_cents: 25,
  features: ["1.5% + $0.25 per sale", "Premium analytics & reports", "Dedicated support", "White-label options", "API access"],
  is_active: true,
}

function getPlanObject(planId: string) {
  if (planId === "growth") return GROWTH_PLAN
  if (planId === "pro") return PRO_PLAN
  return FREE_PLAN
}

/**
 * ===========================================================================
 *  A READ. IT NEVER WRITES, NEVER CREATES A CUSTOMER, NEVER GUESSES FREE.
 * ===========================================================================
 * This used to create a Stripe customer, write the plan Stripe answered into
 * creators and subscriptions, and, when the Stripe call failed or timed out,
 * fall through to "no subscription" and write the creator back to Free. A
 * paying creator lost Pro's fees and features on a slow Stripe minute.
 *
 * Now it reads (lib/billing/subscription-reader.ts): Stripe through a short
 * per customer cache and a single flight, the database (written by the Stripe
 * webhook, lib/billing/subscription-sync.ts) when there is no customer or
 * Stripe did not answer. `source` and `stale` say which. Then a plan set from
 * /admin over it (lib/billing/plan-override.ts), with `override` naming it.
 * The subscription itself is Stripe's, untouched, so its card, invoices and
 * Cancel still describe what they pay.
 *
 * `?fresh=1` skips the cache, for the billing tab right after the creator
 * changed their plan.
 */
export async function GET(request: Request) {
  try {
    /* The owner, or a team member who may see the store's billing (round 42, lib/team/money): the store's own plan and Stripe customer, never the member's. */
    const who = await moneyCaller("billing", "view", { read: true })
    if (!who.ok) return who.response

    const admin = createAdminClient()
    const { data: creator, error: creatorError } = await admin
      .from("creators")
      .select("id, subscription_plan_id, subscription_status, stripe_customer_id")
      .eq("id", who.creatorId)
      .maybeSingle()
    if (creatorError) {
      /* Not "no creator": the plan is unknown, and a client keeps the one it has. */
      return NextResponse.json({ error: "Billing could not be read" }, { status: 503 })
    }
    if (!creator) {
      return NextResponse.json({ error: "Creator not found" }, { status: 404 })
    }

    const fresh = (() => {
      try {
        return new URL(request.url).searchParams.get("fresh") === "1"
      } catch {
        return false
      }
    })()
    const view = await loadSubscriptionView(admin, creator as { id: string; subscription_plan_id: string | null; subscription_status: string | null; stripe_customer_id: string | null }, { fresh })
    const currentPlan = getPlanObject(view.planId)
    const subscription = view.subscription
      ? { ...view.subscription, ...(view.subscription.status === "canceled" ? {} : { subscription_plans: getPlanObject(view.subscription.plan_id) }) }
      : null

    const override = await readPlanOverride(admin, creator.id as string)
    return NextResponse.json(
      {
        subscription,
        currentPlan: override ? getPlanObject(override.planId) : currentPlan,
        status: view.status,
        source: view.source,
        stale: view.stale,
        ...(override ? { override: override.planId } : {}),
      },
      { headers: { "Cache-Control": "private, no-store" } },
    )
  } catch (error) {
    /* The plan override (or the store) could not be read: 503 Try again, never Free (round rel2-auth). */
    if (isServiceUnavailable(error)) return storeUnavailableResponse()
    console.error("Error in GET /api/billing/subscription:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
