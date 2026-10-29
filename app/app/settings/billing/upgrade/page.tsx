import { redirect, unstable_rethrow } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { loadSubscriptionView } from "@/lib/billing/subscription-reader"
import { ENTITLED_STATUSES } from "@/lib/billing/subscription-state"
import { effectivePlanId, readPlanOverride } from "@/lib/billing/plan-override"
import { UpgradePageClient } from "@/components/app/billing/upgrade-page-client"
import { teamPageStore } from "@/lib/team/server"
import { TeamAreaClosed } from "@/components/app/team-area-closed"
import { FREE_STANDARD_RATE, ratePercentLabel } from "@/lib/payments/fees/config"
import { msg } from "@/lib/i18n/text"

const FREE_PLAN = {
  id: "free",
  name: "Free",
  price_cents: 0,
  billing_period: null,
  fee_percent: FREE_STANDARD_RATE,
  fee_fixed_cents: 25,
  // i18n-ignore-next-line: the rate line is a price, the same in every language
  features: [`${ratePercentLabel(FREE_STANDARD_RATE)} + $0.25 per transaction`, msg("Basic analytics"), msg("Standard support")],
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
  // i18n-ignore-next-line
  features: ["3% + $0.25 per transaction", msg("Advanced analytics"), msg("Priority support"), msg("Custom domain")],
  is_active: true,
}

const PRO_PLAN = {
  id: "pro",
  // The earlier $99 plan. No longer offered; kept so its subscribers still resolve.
  name: "Pro",
  price_cents: 9900,
  billing_period: "month",
  fee_percent: 0.015,
  fee_fixed_cents: 25,
  // i18n-ignore-next-line
  features: ["1.5% + $0.25 per transaction", msg("Premium analytics"), msg("Dedicated support"), msg("White-label"), msg("API access")],
  is_active: true,
}

const FALLBACK_PLANS = [FREE_PLAN, GROWTH_PLAN, PRO_PLAN]

export default async function UpgradePage() {
  const supabase = await createClient()

  /* Round 42: changing the plan is the owner's, or a team member's with Change billing, working in the store (lib/team/money). The change routes ask again. */
  const access = await teamPageStore("billing_manage")
  if (access.kind === "signed_out") return null
  if (access.kind === "denied") return <TeamAreaClosed area="billing_manage" store={access.acting.name} permissions={access.acting.permissions} />

  let plans = FALLBACK_PLANS
  let currentPlanId = "free"
  let hasActiveSubscription = false
  let pendingPlanId: string | null = null
  let cancelAtPeriodEnd = false

  try {
    const { data: creator } = await createAdminClient()
      .from("creators")
      .select("id, subscription_plan_id, subscription_status, stripe_customer_id")
      .eq(access.kind === "store" ? "id" : "user_id", access.kind === "store" ? access.creatorId : access.userId)
      .maybeSingle()

    if (!creator) {
      redirect("/sell")
    }

    // Fetch plans
    const { data: dbPlans } = await supabase
      .from("subscription_plans")
      .select("*")
      .eq("is_active", true)
      .order("price_cents", { ascending: true })

    if (dbPlans && dbPlans.length > 0) {
      plans = dbPlans
    }

    /* Through the shared billing reader (lib/billing/subscription-reader.ts): cached, single flight, bounded, and the
       stored plan when Stripe does not answer. A past_due or trialing subscription is a subscription here too, so this
       page never offers a second checkout to someone already paying. */
    const view = await loadSubscriptionView(createAdminClient(), creator)
    currentPlanId = view.planId
    hasActiveSubscription = !!view.subscription && ENTITLED_STATUSES.has(view.subscription.status)
    pendingPlanId = hasActiveSubscription ? view.subscription?.pending_plan_id ?? null : null
    cancelAtPeriodEnd = hasActiveSubscription && view.subscription?.cancel_at_period_end === true
    /* A plan set from /admin is the plan, whatever Stripe sells them (lib/billing/plan-override.ts). */
    currentPlanId = effectivePlanId(currentPlanId, await readPlanOverride(createAdminClient(), creator.id))
  } catch (error) {
    /* redirect("/sell") throws Next's own error: it goes on to Next, not into this catch's fallback. */
    unstable_rethrow(error)
    console.error("Upgrade page data loading error:", error)
  }

  return (
    <UpgradePageClient
      plans={plans}
      currentPlanId={currentPlanId}
      hasActiveSubscription={hasActiveSubscription}
      pendingPlanId={pendingPlanId}
      cancelAtPeriodEnd={cancelAtPeriodEnd}
    />
  )
}
