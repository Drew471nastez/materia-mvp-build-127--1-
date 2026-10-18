import { NextResponse } from "next/server"

import { adminFailure, requireAdmin } from "@/lib/admin/gate"
import { loadActiveFeeConfig } from "@/lib/payments/fees/active"
import { activePaymentProvider } from "@/lib/payments/active-provider"
import { platformChargeCurrencyUpper } from "@/lib/payments/fees/currency-rules"
import { stripeConfigured, stripePublishableKey } from "@/lib/payments/stripe/config"
import { createAdminClient } from "@/lib/supabase/admin"
import { marketplaceGate } from "@/lib/money/marketplace-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const NO_STORE = { "Cache-Control": "no-store" }

function presence(v: string | undefined, prefix?: string) {
  const t = v?.trim()
  if (!t) return "missing"
  if (prefix && !t.startsWith(prefix)) return "invalid"
  return "configured"
}

export async function GET() {
  const denied = await requireAdmin()
  if (denied) return denied
  try {
    const { config, source } = await loadActiveFeeConfig(createAdminClient())
    return NextResponse.json(
      {
        provider: activePaymentProvider(),
        platformCurrency: platformChargeCurrencyUpper(),
        /* The marketplace dollar switch (MARKETPLACE_USD), read only: off, how many stores, or all. Never the ids themselves. */
        marketplaceUsd: (() => {
          const gate = marketplaceGate()
          return gate.mode === "some" ? `on for ${gate.creatorIds.size} ${gate.creatorIds.size === 1 ? "store" : "stores"}` : gate.mode === "all" ? "on for every store" : "off"
        })(),
        chargeModel: "destination_charges",
        connectedAccountModel: "Express",
        applicationFees: true,
        embeddedOnboarding: true,
        embeddedAccountManagement: true,
        webhookRoutes: {
          platform: "/api/stripe/webhook",
          connect: "/api/stripe/webhook/connect",
        },
        feeRuleVersion: config.versionKey,
        feeConfigSource: source,
        secrets: {
          publishableKey: stripePublishableKey() ? "configured" : "missing",
          serverStripeKey: presence(process.env.STRIPE_SECRET_KEY, "sk_"),
          platformWebhook: presence(process.env.STRIPE_WEBHOOK_SECRET, "whsec_"),
          connectWebhook: presence(process.env.STRIPE_CONNECT_WEBHOOK_SECRET, "whsec_"),
        },
        paymentsOperational: stripeConfigured(),
      },
      { headers: NO_STORE },
    )
  } catch (e) {
    return adminFailure("payments configuration", e, "Configuration could not be read.")
  }
}
