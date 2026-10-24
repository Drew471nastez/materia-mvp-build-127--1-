import "server-only"

import { loadActiveFeeConfig } from "@/lib/payments/fees/active"
import { platformChargeCurrencyUpper } from "@/lib/payments/fees/currency-rules"
import { stripeConfigured, stripePublishableKey } from "@/lib/payments/stripe/config"
import { stripe } from "@/lib/stripe"

type Db = {
  from: (table: string) => {
    select: (cols: string, opts?: { count?: "exact" | "planned" | "estimated"; head?: boolean }) => {
      limit: (n: number) => PromiseLike<{ count: number | null; error: { message?: string } | null }>
      order: (col: string, opts: { ascending: boolean }) => {
        limit: (n: number) => PromiseLike<{ data: Array<Record<string, unknown>> | null; error: { message?: string } | null }>
      }
      is: (col: string, val: null) => PromiseLike<{ count: number | null; error: { message?: string } | null }>
    }
  }
}

export type ConfigPresence = "configured" | "missing" | "invalid"

function secretPresence(name: string, value: string | undefined, prefix?: string): ConfigPresence {
  const v = value?.trim()
  if (!v) return "missing"
  if (prefix && !v.startsWith(prefix)) return "invalid"
  return "configured"
}

export async function buildPaymentsHealth(db: Db) {
  const provider = "stripe" as const
  const publishable = stripePublishableKey()
  const serverKey = process.env.STRIPE_SECRET_KEY?.trim()
  const platformWh = process.env.STRIPE_WEBHOOK_SECRET?.trim()
  const connectWh = process.env.STRIPE_CONNECT_WEBHOOK_SECRET?.trim()

  let stripeApi: { status: "operational" | "degraded" | "action_required"; detail?: string } = { status: "action_required", detail: "Stripe key missing" }
  if (serverKey) {
    try {
      await stripe.balance.retrieve()
      stripeApi = { status: "operational" }
    } catch (e) {
      stripeApi = { status: "degraded", detail: e instanceof Error ? e.message.slice(0, 120) : "Unreachable" }
    }
  }

  let lastWebhookOk: string | null = null
  let failedWebhookCount = 0
  let eventsRecent = 0
  try {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const recent = await db
      .from("stripe_webhook_events")
      .select("received_at, processed_at, last_error")
      .order("received_at", { ascending: false })
      .limit(200)
    if (!recent.error && recent.data) {
      for (const row of recent.data) {
        const recv = String(row.received_at ?? "")
        if (recv >= since) eventsRecent++
        if (row.processed_at && !lastWebhookOk) lastWebhookOk = String(row.processed_at)
        if (!row.processed_at && row.last_error) failedWebhookCount++
      }
    }
  } catch {
    /* table may be missing in dev */
  }

  const { config, source } = await loadActiveFeeConfig(db)

  return {
    provider,
    defaultCurrency: platformChargeCurrencyUpper(),
    stripeApi,
    publishableKey: publishable ? "configured" : "missing",
    serverStripeKey: secretPresence("STRIPE_SECRET_KEY", serverKey, "sk_"),
    platformWebhook: secretPresence("STRIPE_WEBHOOK_SECRET", platformWh, "whsec_"),
    connectWebhook: secretPresence("STRIPE_CONNECT_WEBHOOK_SECRET", connectWh, "whsec_"),
    stripeConfigured: stripeConfigured(),
    webhookEventsLast24h: eventsRecent,
    lastSuccessfulWebhookAt: lastWebhookOk,
    failedWebhookProcessing: failedWebhookCount,
    dbConnectivity: "operational" as const,
    paymentService: stripeConfigured() ? "operational" : "configuration_missing",
    connectAccountCreation: stripeConfigured() ? "operational" : "configuration_missing",
    accountSessions: stripeConfigured() ? "operational" : "configuration_missing",
    feeEngine: "operational",
    feeRuleVersion: config.versionKey,
    feeConfigSource: source,
  }
}
