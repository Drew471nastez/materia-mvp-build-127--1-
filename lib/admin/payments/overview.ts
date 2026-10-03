import "server-only"

import { paymentUxStateOf, snapshotFromCreatorRow } from "@/lib/payments/stripe/facts"

import { countRows } from "./count-rows"
import { buildPaymentsHealth } from "./health"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

function isoDaysAgo(days: number) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
}

export async function buildPaymentsOverview(db: Db) {
  const health = await buildPaymentsHealth(db)

  /* Select first, then filter: see ./count-rows. */
  const countCreators = (filter?: Parameters<typeof countRows>[2]) => countRows(db, "creators", filter)

  const creatorsTotal = await countCreators()
  const withAccount = await countCreators((q) => q.not("stripe_account_id", "is", null))
  const chargesEnabled = await countCreators((q) => q.eq("charges_enabled", true))
  const payoutsEnabledCount = await countCreators((q) => q.eq("payouts_enabled", true))
  const actionRequired = await countCreators((q) => q.neq("stripe_onboarding_status", "connected").not("stripe_account_id", "is", null))

  const { count: failedPayouts } = await db
    .from("payouts")
    .select("id", { count: "exact", head: true })
    .eq("status", "failed")
    .gte("created_at", isoDaysAgo(30))

  const { count: openDisputes } = await db.from("orders").select("id", { count: "exact", head: true }).eq("status", "disputed")

  const { count: failedPayments7d } = await db
    .from("orders")
    .select("id", { count: "exact", head: true })
    .in("status", ["failed", "cancelled"])
    .gte("created_at", isoDaysAgo(7))

  const { data: recentOrders, error: recentErr } = await db
    .from("orders")
    .select("amount_cents, fee_cents, stripe_processing_fee_cents, storelib_net_margin_cents")
    .eq("status", "completed")
    .gte("created_at", isoDaysAgo(30))

  let gross30 = 0
  let fees30 = 0
  let processing30 = 0
  let margin30 = 0
  if (!recentErr && recentOrders) {
    for (const o of recentOrders) {
      gross30 += o.amount_cents ?? 0
      fees30 += o.fee_cents ?? 0
      processing30 += o.stripe_processing_fee_cents ?? 0
      margin30 += o.storelib_net_margin_cents ?? 0
    }
  }

  let payoutRestricted = 0
  const { data: creators } = await db
    .from("creators")
    .select("stripe_account_id, charges_enabled, payouts_enabled, details_submitted, stripe_requirements, stripe_onboarding_status")
    .not("stripe_account_id", "is", null)
    .limit(500)
  if (creators) {
    for (const c of creators) {
      const snap = snapshotFromCreatorRow(c)
      const ux = paymentUxStateOf(snap)
      if (ux === "PAYOUTS_RESTRICTED" || ux === "PAYMENTS_RESTRICTED") payoutRestricted++
    }
  }

  let overall: "operational" | "warning" | "action_required" | "degraded" | "configuration_missing" = "operational"
  if (!health.stripeConfigured) overall = "configuration_missing"
  else if (health.stripeApi.status === "degraded") overall = "degraded"
  else if (actionRequired > 0 || (failedPayouts ?? 0) > 0) overall = "warning"
  else if (health.failedWebhookProcessing > 5) overall = "warning"

  return {
    status: overall,
    stripeConnection: health.stripeApi.status === "operational" ? "operational" : health.stripeApi.status,
    webhookHealth:
      health.failedWebhookProcessing > 0 ? "warning" : health.webhookEventsLast24h > 0 ? "operational" : "warning",
    connectedCreators: withAccount,
    paymentsActive: chargesEnabled,
    payoutsActive: payoutsEnabledCount,
    actionRequired,
    payoutRestricted,
    failedPayments7d: failedPayments7d ?? 0,
    failedPayouts30d: failedPayouts ?? 0,
    openDisputes: openDisputes ?? 0,
    creatorsTotal,
    recentVolume30d: { grossMinor: gross30, currency: health.defaultCurrency },
    storelibFeesCollected30d: fees30,
    stripeProcessingCost30d: processing30,
    storelibPaymentMargin30d: margin30,
    health,
  }
}
