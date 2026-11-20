import { moneyCaller } from "@/lib/team/money"
import { recordTeamAction } from "@/lib/team/areas"
import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { stripe } from "@/lib/stripe"
import { stripeIdentityKey } from "@/lib/stripe/resilience"
import { UPGRADE_NOT_FINISHED, UPGRADE_PRORATION, startPlanUpgrade, upgradeLanded, type UpgradedSub } from "@/lib/billing/plan-upgrade"

const PLAN_ORDER: Record<string, number> = { free: 0, growth: 1, pro: 2 }

// LIVE Stripe Price IDs
const PRICE_GROWTH = process.env.PRICE_GROWTH_MONTHLY || "price_1SzBWaBYevnBVyznNCTOXDoS"
const PRICE_PRO = process.env.PRICE_PRO_MONTHLY || "price_1SzBXSBYevnBVyznYjXfOOXX"

function getStripePriceId(planId: string): string | null {
  if (planId === "growth") return PRICE_GROWTH
  if (planId === "pro") return PRICE_PRO
  return null
}

function getPlanIdFromPriceId(priceId: string | undefined): "growth" | "pro" | "free" {
  if (!priceId) return "free"
  if (priceId === PRICE_GROWTH) return "growth"
  if (priceId === PRICE_PRO) return "pro"
  if (priceId.includes("SzBWa")) return "growth"
  if (priceId.includes("SzBXS")) return "pro"
  return "free"
}

function isUpgrade(currentPlanId: string, newPlanId: string): boolean {
  return (PLAN_ORDER[newPlanId] ?? 0) > (PLAN_ORDER[currentPlanId] ?? 0)
}

function safeTimestamp(ts: any): string {
  if (!ts) return new Date().toISOString()
  if (ts instanceof Date) return ts.toISOString()
  if (typeof ts === "string") return ts
  if (typeof ts === "number" && !isNaN(ts)) {
    const d = ts > 1e12 ? new Date(ts) : new Date(ts * 1000)
    return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString()
  }
  return new Date().toISOString()
}

// Extract period dates from subscription (SDK v20: current_period_start/end removed)
// Returns Unix timestamps (seconds)
function getSubscriptionPeriod(sub: any): { periodStart: number; periodEnd: number } {
  // Helper: convert any timestamp to Unix seconds
  function toUnixSeconds(ts: any): number | null {
    if (!ts) return null
    if (typeof ts === "number") return ts > 1e12 ? Math.floor(ts / 1000) : ts
    if (typeof ts === "string") {
      const d = new Date(ts)
      return isNaN(d.getTime()) ? null : Math.floor(d.getTime() / 1000)
    }
    if (ts instanceof Date) return Math.floor(ts.getTime() / 1000)
    return null
  }

  let periodStart: number | null = null
  let periodEnd: number | null = null

  // Priority 1: Legacy top-level fields (pre-v20 API versions)
  if (sub.current_period_start) periodStart = toUnixSeconds(sub.current_period_start)
  if (sub.current_period_end) periodEnd = toUnixSeconds(sub.current_period_end)

  // Priority 2: SDK v20 current_period object (start_date/end_date)
  if (!periodStart && sub.current_period?.start_date) periodStart = toUnixSeconds(sub.current_period.start_date)
  if (!periodEnd && sub.current_period?.end_date) periodEnd = toUnixSeconds(sub.current_period.end_date)

  // Priority 3: latest_invoice period fields (try ALL possible field names)
  const invoice = typeof sub.latest_invoice === "object" && sub.latest_invoice ? sub.latest_invoice : null
  if (invoice) {
    // Try old field names: invoice.period_start / period_end
    if (!periodStart && invoice.period_start) periodStart = toUnixSeconds(invoice.period_start)
    if (!periodEnd && invoice.period_end) periodEnd = toUnixSeconds(invoice.period_end)
    // Try new object format: invoice.period.start_date / end_date
    if (!periodStart && invoice.period?.start_date) periodStart = toUnixSeconds(invoice.period.start_date)
    if (!periodEnd && invoice.period?.end_date) periodEnd = toUnixSeconds(invoice.period.end_date)
    // Try: invoice.period.start / end
    if (!periodStart && invoice.period?.start) periodStart = toUnixSeconds(invoice.period.start)
    if (!periodEnd && invoice.period?.end) periodEnd = toUnixSeconds(invoice.period.end)

    // Priority 4: invoice line items period
    if (!periodStart || !periodEnd) {
      const lineItem = invoice.lines?.data?.[0]
      if (lineItem?.period) {
        if (!periodStart && lineItem.period.start) periodStart = toUnixSeconds(lineItem.period.start)
        if (!periodEnd && lineItem.period.end) periodEnd = toUnixSeconds(lineItem.period.end)
      }
    }
  }

  // Priority 5: Compute from billing_cycle_anchor (use DATE-ONLY comparison)
  if (!periodEnd || (periodStart && periodEnd && periodStart === periodEnd)) {
    const anchor = sub.billing_cycle_anchor || sub.start_date
    if (anchor) {
      const anchorSec = toUnixSeconds(anchor)
      if (anchorSec) {
        const anchorDate = new Date(anchorSec * 1000)
        const now = new Date()
        // Compare by date only (ignore time) so same-day billing anchor advances correctly
        const anchorDay = new Date(anchorDate.getFullYear(), anchorDate.getMonth(), anchorDate.getDate())
        const todayDay = new Date(now.getFullYear(), now.getMonth(), now.getDate())
        while (anchorDay <= todayDay) {
          anchorDate.setMonth(anchorDate.getMonth() + 1)
          anchorDay.setMonth(anchorDay.getMonth() + 1)
        }
        periodEnd = Math.floor(anchorDate.getTime() / 1000)
        if (!periodStart) {
          const startDate = new Date(anchorDate)
          startDate.setMonth(startDate.getMonth() - 1)
          periodStart = Math.floor(startDate.getTime() / 1000)
        }
      }
    }
  }

  // Final fallback
  if (!periodStart) periodStart = Math.floor(Date.now() / 1000)
  if (!periodEnd) periodEnd = periodStart + 30 * 24 * 60 * 60

  console.log("[Change] Period extraction:", { periodStart, periodEnd, hasInvoice: !!invoice, diff: periodEnd - periodStart })
  return { periodStart, periodEnd }
}

export async function POST(request: Request) {
  try {
    /* The store's rows, by the store's id (lib/team/money), for the owner and a team member alike. */
    const supabase = createAdminClient()
    const { newPlanId, previewOnly, finish } = await request.json()

    if (!newPlanId) {
      return NextResponse.json({ error: "Plan ID is required" }, { status: 400 })
    }

    // Handle downgrade to Free as a cancellation (cancel at period end, keep features until then)
    if (newPlanId === "free") {
      /* The owner, or a team member who may change the store's billing (round 42, lib/team/money): the store's own plan and Stripe customer, never the member's. */
      const who = await moneyCaller("billing", "manage")
      if (!who.ok) return who.response

      const { data: creator } = await createAdminClient()
        .from("creators")
        .select("id, subscription_plan_id")
        .eq("id", who.creatorId)
        .single()

      if (!creator) {
        return NextResponse.json({ error: "Creator not found" }, { status: 404 })
      }

      const { data: subscriptionRecord } = await supabase
        .from("subscriptions")
        .select("id, stripe_subscription_id")
        .eq("creator_id", creator.id)
        .maybeSingle()

      if (!subscriptionRecord?.stripe_subscription_id) {
        return NextResponse.json({ error: "No active subscription found" }, { status: 400 })
      }

      // Always retrieve subscription to check for existing schedules
      const stripeSub = await stripe.subscriptions.retrieve(
        subscriptionRecord.stripe_subscription_id,
        { expand: ["latest_invoice"] }
      ) as any

      if (previewOnly) {
        const { periodEnd } = getSubscriptionPeriod(stripeSub)
        return NextResponse.json({
          success: true,
          type: "downgrade",
          amountDueTodayCents: 0,
          nextBillingDate: safeTimestamp(periodEnd),
          nextAmountCents: 0,
        })
      }

      // Release any existing subscription schedule first (e.g. from a pending Pro→Growth downgrade)
      const existingScheduleId = stripeSub.schedule
        ? (typeof stripeSub.schedule === "string" ? stripeSub.schedule : stripeSub.schedule.id)
        : null

      if (existingScheduleId) {
        console.log("[Change] Releasing existing schedule before canceling to free:", existingScheduleId)
        try {
          await stripe.subscriptionSchedules.release(existingScheduleId)
        } catch (releaseErr: any) {
          console.warn("[Change] Could not release schedule:", releaseErr.message)
          try {
            await stripe.subscriptionSchedules.cancel(existingScheduleId)
          } catch (cancelErr: any) {
            console.warn("[Change] Could not cancel schedule either:", cancelErr.message)
          }
        }
      }

      // Now safe to cancel at period end
      const canceledSub = await stripe.subscriptions.update(
        subscriptionRecord.stripe_subscription_id,
        {
          cancel_at_period_end: true,
          metadata: { ...stripeSub.metadata, pending_plan_id: "" },
        }
      )

      // Get the period end from the canceled subscription
      const { periodEnd: cancelPeriodEnd } = getSubscriptionPeriod(canceledSub as any)

      await createAdminClient()
        .from("subscriptions")
        .update({
          cancel_at_period_end: true,
          pending_plan_id: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", subscriptionRecord.id)

      /* A team member's change to the owner's plan is on the record with their name (lib/team/areas). */
      await recordTeamAction(who, who.userId, "billing_manage", "billing_plan_changed", { plan_id: newPlanId })
      return NextResponse.json({
        success: true,
        type: "downgrade",
        message: "Your plan will downgrade to Free at the end of your billing cycle. You'll keep all current features until then.",
        effectiveDate: safeTimestamp(cancelPeriodEnd),
        nextBillingDate: safeTimestamp(cancelPeriodEnd),
        nextAmountCents: 0,
        amountDueTodayCents: 0,
      })
    }

    /* The owner, or a team member who may change the store's billing (round 42, lib/team/money): the store's own plan and Stripe customer, never the member's. */
    const who = await moneyCaller("billing", "manage")
    if (!who.ok) return who.response

    const { data: creator } = await createAdminClient()
      .from("creators")
      .select("id, subscription_plan_id")
      .eq("id", who.creatorId)
      .single()

    if (!creator) {
      return NextResponse.json({ error: "Creator not found" }, { status: 404 })
    }

    const stripePriceId = getStripePriceId(newPlanId)
    if (!stripePriceId) {
      return NextResponse.json({ error: "No Stripe price configured for this plan" }, { status: 400 })
    }

    const { data: subscriptionRecord } = await supabase
      .from("subscriptions")
      .select("id, stripe_subscription_id")
      .eq("creator_id", creator.id)
      .maybeSingle()

    if (!subscriptionRecord?.stripe_subscription_id) {
      return NextResponse.json(
        { error: "No active subscription found. Please create a new subscription instead." },
        { status: 400 },
      )
    }

    // Expand latest_invoice to get period dates (SDK v20 removed current_period_start/end)
    let stripeSubscription = await stripe.subscriptions.retrieve(
      subscriptionRecord.stripe_subscription_id,
      { expand: ["latest_invoice"] }
    ) as any
    const subItem = stripeSubscription.items.data[0]
    if (!subItem) {
      return NextResponse.json({ error: "Subscription item not found" }, { status: 400 })
    }

    /*
      THE PLAN IS ON THE RECORD ONLY ONCE STRIPE HAS IT PAID: after a card that paid at once, or (finish) after the
      dialog confirmed a held upgrade with the bank. A finish is believed only when the subscription itself is on the
      new price with nothing held (lib/billing/plan-upgrade upgradeLanded), never because the page says so.
    */
    const recordUpgrade = async (paid: UpgradedSub) => {
      /* Stripe takes neither with a held change, so they follow it here. Never failing the upgrade, which is made. */
      const settled = (await stripe.subscriptions
        .update(subscriptionRecord.stripe_subscription_id, {
          cancel_at_period_end: false,
          metadata: { creator_id: creator.id, plan_id: newPlanId, pending_plan_id: "" },
        })
        .catch(() => null)) as UpgradedSub | null
      const updatedSubscription = (settled ?? paid) as any
      const updatedPeriod = getSubscriptionPeriod(updatedSubscription)

      await createAdminClient()
        .from("subscriptions")
        .update({
          plan_id: newPlanId,
          status: updatedSubscription.status,
          current_period_start: safeTimestamp(updatedPeriod.periodStart),
          current_period_end: safeTimestamp(updatedPeriod.periodEnd),
          pending_plan_id: null,
          cancel_at_period_end: false,
          updated_at: new Date().toISOString(),
        })
        .eq("id", subscriptionRecord.id)

      await createAdminClient()
        .from("creators")
        .update({ subscription_plan_id: newPlanId, subscription_status: updatedSubscription.status })
        .eq("id", creator.id)

      /* A team member's change to the owner's plan is on the record with their name (lib/team/areas). */
      await recordTeamAction(who, who.userId, "billing_manage", "billing_plan_changed", { plan_id: newPlanId })
      return updatedSubscription
    }

    if (finish === true && !previewOnly) {
      if (!upgradeLanded(stripeSubscription, stripePriceId)) {
        return NextResponse.json({ error: UPGRADE_NOT_FINISHED, code: "upgrade_not_paid" }, { status: 409 })
      }
      const done = await recordUpgrade(stripeSubscription)
      return NextResponse.json({
        success: true,
        type: "upgrade",
        message: "Upgrade applied and paid for the rest of this billing cycle.",
        nextBillingDate: safeTimestamp(getSubscriptionPeriod(done).periodEnd),
      })
    }

    const currentPlanId = getPlanIdFromPriceId(subItem.price.id) || creator.subscription_plan_id || "free"
    const upgrading = isUpgrade(currentPlanId, newPlanId)

    const { periodStart, periodEnd } = getSubscriptionPeriod(stripeSubscription)

    /*
      AN UPGRADE IS PAID FOR WHEN IT IS MADE (UPGRADE_PRORATION). It was made with create_prorations, which only
      leaves the difference waiting for the next renewal invoice: the plan changed at once, nothing was charged, the
      dialog had said "You'll be charged {amount} today", and a creator who then moved to Free (cancel at period end,
      which never invoices again) kept the dearer plan for the rest of the period without paying for it. The preview
      is the invoice made now (always_invoice), so the amount shown is the amount charged.
    */
    // Stripe SDK v20: use createPreview instead of retrieveUpcoming
    const upcomingInvoice = await stripe.invoices.createPreview({
      subscription: stripeSubscription.id,
      subscription_details: {
        items: [{ id: subItem.id, price: stripePriceId }],
        proration_behavior: upgrading ? UPGRADE_PRORATION : "none",
      },
    })

    const amountDueNowCents = upgrading ? Math.max(0, upcomingInvoice.amount_due || 0) : 0

    const nextBillingDate = safeTimestamp(periodEnd)
    /* The new plan's own price from its renewal line; an upgrade's preview holds only the difference charged now, so its price is read from Stripe. */
    const renewalLine = upcomingInvoice.lines.data.find((line: any) => line.price?.id === stripePriceId && !line.proration) as any
    const nextAmountCents = subItem.price.id === stripePriceId
      ? subItem.price.unit_amount || 0
      : renewalLine?.amount || (upgrading ? (await stripe.prices.retrieve(stripePriceId)).unit_amount || 0 : 0)

    if (previewOnly) {
      return NextResponse.json({
        success: true,
        type: upgrading ? "upgrade" : "downgrade",
        amountDueTodayCents: upgrading ? Math.max(0, upcomingInvoice.amount_due || 0) : 0,
        nextBillingDate,
        nextAmountCents: Math.abs(nextAmountCents),
      })
    }

    if (upgrading) {
      /*
        Charged now, and only changed when it is paid (lib/billing/plan-upgrade): a card that pays at once is recorded
        here; one the bank wants to confirm (3-D Secure) goes back to the dialog with the payment's secret, and the
        dialog finishes once Stripe.js has confirmed it; a declined card changes nothing.
      */
      const outcome = await startPlanUpgrade(
        { update: (id, params) => stripe.subscriptions.update(id, params as never) as unknown as Promise<UpgradedSub> },
        { subscriptionId: subscriptionRecord.stripe_subscription_id, itemId: subItem.id, priceId: stripePriceId },
      )
      if (outcome.kind === "declined") {
        return NextResponse.json({ error: outcome.error, code: "upgrade_not_paid" }, { status: 402 })
      }
      if (outcome.kind === "needs_action") {
        return NextResponse.json({ success: true, type: "upgrade", needsAction: { clientSecret: outcome.clientSecret } })
      }
      await recordUpgrade(outcome.subscription)
      return NextResponse.json({
        success: true,
        type: "upgrade",
        message: "Upgrade applied and paid for the rest of this billing cycle.",
        amountDueTodayCents: Math.max(0, upcomingInvoice.amount_due || 0),
        nextBillingDate,
        nextAmountCents: Math.abs(nextAmountCents),
      })
    }

    // Downgrade: schedule for end of current period using Subscription Schedules
    try {
      // ALWAYS release any existing schedule first to start fresh
      const existingScheduleId = stripeSubscription.schedule
        ? (typeof stripeSubscription.schedule === "string" ? stripeSubscription.schedule : stripeSubscription.schedule.id)
        : null

      if (existingScheduleId) {
        console.log("[Change] Releasing existing schedule:", existingScheduleId)
        try {
          await stripe.subscriptionSchedules.release(existingScheduleId)
        } catch (releaseErr: any) {
          console.warn("[Change] Could not release schedule:", releaseErr.message)
          // Try cancel if release fails
          try {
            await stripe.subscriptionSchedules.cancel(existingScheduleId)
          } catch (cancelErr: any) {
            console.warn("[Change] Could not cancel schedule either:", cancelErr.message)
          }
        }
        // Re-retrieve subscription after releasing (schedule field will be cleared)
        stripeSubscription = await stripe.subscriptions.retrieve(
          subscriptionRecord.stripe_subscription_id,
          { expand: ["latest_invoice"] }
        ) as any
      }

      /*
        Create a fresh schedule from the current subscription, keyed by what it
        is: this subscription, the schedule released above (if any) and the
        plan it moves to. A retry of the same downgrade gets the same schedule
        instead of Stripe refusing a second one. A key that hands back a
        schedule already released or canceled (a downgrade undone and asked
        again within Stripe's 24 hours) is followed by a key naming that
        schedule, so the new request makes a new one.
      */
      const scheduleParams = { from_subscription: stripeSubscription.id as string }
      let schedule = await stripe.subscriptionSchedules.create(scheduleParams, {
        idempotencyKey: stripeIdentityKey("plan-downgrade-schedule", [stripeSubscription.id, existingScheduleId ?? "none", newPlanId], scheduleParams),
      })
      for (let i = 0; i < 3 && (schedule.status === "released" || schedule.status === "canceled" || schedule.status === "completed"); i++) {
        schedule = await stripe.subscriptionSchedules.create(scheduleParams, {
          idempotencyKey: stripeIdentityKey("plan-downgrade-schedule", [stripeSubscription.id, existingScheduleId ?? "none", newPlanId, `after-${schedule.id}`], scheduleParams),
        })
      }

      // Use Stripe's own phase dates (most reliable - avoids any period extraction issues)
      const currentPhase = schedule.phases?.[0]
      if (!currentPhase) {
        throw new Error("No current phase found in newly created schedule")
      }

      const phaseStart = currentPhase.start_date
      const phaseEnd = currentPhase.end_date

      console.log("[Change] Downgrade schedule:", {
        scheduleId: schedule.id,
        phaseStart,
        phaseEnd,
        computedPeriodStart: periodStart,
        computedPeriodEnd: periodEnd,
      })

      // Update schedule: keep current plan until phase end, then switch to new plan
      await stripe.subscriptionSchedules.update(schedule.id, {
        end_behavior: "release",
        phases: [
          {
            items: [{ price: subItem.price.id, quantity: 1 }],
            start_date: phaseStart,
            end_date: phaseEnd,
            proration_behavior: "none",
          },
          {
            items: [{ price: stripePriceId, quantity: 1 }],
            start_date: phaseEnd,
            proration_behavior: "none",
          },
        ],
      })

      await stripe.subscriptions.update(subscriptionRecord.stripe_subscription_id, {
        metadata: { ...stripeSubscription.metadata, pending_plan_id: newPlanId },
      })

      await createAdminClient()
        .from("subscriptions")
        .update({
          pending_plan_id: newPlanId,
          updated_at: new Date().toISOString(),
        })
        .eq("id", subscriptionRecord.id)

      /* A team member's change to the owner's plan is on the record with their name (lib/team/areas). */
      await recordTeamAction(who, who.userId, "billing_manage", "billing_plan_changed", { plan_id: newPlanId })
      return NextResponse.json({
        success: true,
        type: "downgrade",
        message: "Downgrade scheduled for end of billing cycle. You'll keep all current features until then.",
        effectiveDate: safeTimestamp(periodEnd),
        nextBillingDate,
        nextAmountCents: Math.abs(nextAmountCents),
        amountDueTodayCents: amountDueNowCents,
      })
    } catch (scheduleError: any) {
      console.error("[Change] Subscription schedule error:", scheduleError)
      return NextResponse.json(
        { error: `Failed to schedule downgrade: ${scheduleError.message || "Unknown error"}` },
        { status: 500 }
      )
    }
  } catch (error: any) {
    console.error("Error in POST /api/billing/subscription/change:", error)
    return NextResponse.json({ error: error.message || "Failed to change subscription" }, { status: 500 })
  }
}
