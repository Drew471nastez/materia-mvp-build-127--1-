"use client"

import * as React from "react"

import { ago, num } from "../_console/format"
import { Banner, Figures, Panel, Status } from "../_console/ui"
import { adminPaymentsRead } from "./_fetch"

type Overview = {
  status: string
  stripeConnection: string
  webhookHealth: string
  connectedCreators: number
  paymentsActive: number
  actionRequired: number
  payoutRestricted: number
  failedPayments7d: number
  failedPayouts30d: number
  openDisputes: number
  recentVolume30d: { grossMinor: number; currency: string }
  storelibFeesCollected30d: number
  stripeProcessingCost30d: number
  storelibPaymentMargin30d: number
  health: Record<string, unknown>
}

type Onboarding = { counts?: Record<string, number>; stuck?: Record<string, Array<{ id: string; label: string }>>; unavailable?: boolean }

export function PaymentsOverview() {
  const [overview, setOverview] = React.useState<Overview | null>(null)
  const [onboarding, setOnboarding] = React.useState<Onboarding | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    void Promise.all([adminPaymentsRead<Overview>("/api/admin/payments/overview"), adminPaymentsRead<Onboarding>("/api/admin/payments/onboarding")]).then(
      ([o, ob]) => {
        if (o && "error" in o) setError(o.error)
        else {
          setError(null)
          setOverview(o)
        }
        if (ob && !("error" in ob)) setOnboarding(ob)
      },
    )
  }, [])

  const h = overview?.health as Record<string, string | number | null> | undefined

  return (
    <div className="space-y-6">
      {error ? <Banner tone="bad">{error}</Banner> : null}
      <Panel title="Storelib Payments" meta={overview ? `Status · ${overview.status.replace(/_/g, " ")}` : "Loading…"}>
        {overview ? (
          <Figures
            items={[
              { label: "Stripe connection", value: overview.stripeConnection },
              { label: "Webhook health", value: overview.webhookHealth },
              { label: "Connected creators", value: num(overview.connectedCreators) },
              { label: "Payments active", value: num(overview.paymentsActive) },
              { label: "Action required", value: num(overview.actionRequired) },
              { label: "Payout restricted", value: num(overview.payoutRestricted) },
              { label: "Failed payments (7d)", value: num(overview.failedPayments7d) },
              { label: "Failed payouts (30d)", value: num(overview.failedPayouts30d) },
              { label: "Open disputes", value: num(overview.openDisputes) },
              {
                label: "Recent volume (30d)",
                value: `${(overview.recentVolume30d.grossMinor / 100).toFixed(2)} ${overview.recentVolume30d.currency}`,
              },
              { label: "Storelib fees (30d)", value: `${(overview.storelibFeesCollected30d / 100).toFixed(2)}` },
              { label: "Stripe processing (30d)", value: `${(overview.stripeProcessingCost30d / 100).toFixed(2)}` },
              { label: "Storelib margin (30d)", value: `${(overview.storelibPaymentMargin30d / 100).toFixed(2)}` },
            ]}
          />
        ) : (
          <p className="px-4 py-6 text-[13px] text-[#9b9ba6]">Reading operational state…</p>
        )}
      </Panel>

      <Panel title="Payment system health">
        {h ? (
          <ul className="divide-y divide-white/[0.08] text-[13px]">
            {[
              ["Stripe API", String(h.stripeApi && typeof h.stripeApi === "object" ? (h.stripeApi as { status: string }).status : h.stripeApi)],
              ["Publishable key", String(h.publishableKey)],
              ["Server Stripe key", String(h.serverStripeKey)],
              ["Platform webhook", String(h.platformWebhook)],
              ["Connect webhook", String(h.connectWebhook)],
              ["Webhook events (24h)", String(h.webhookEventsLast24h)],
              ["Last successful webhook", h.lastSuccessfulWebhookAt ? ago(String(h.lastSuccessfulWebhookAt)) : "—"],
              ["Failed webhook processing", String(h.failedWebhookProcessing)],
              ["Fee engine", String(h.feeEngine)],
              ["Fee rule version", String(h.feeRuleVersion)],
              ["Provider", String(h.provider)],
              ["Default currency", String(h.defaultCurrency)],
            ].map(([label, value]) => (
              <li key={label} className="flex items-center justify-between gap-4 px-4 py-2.5">
                <span className="text-[#9b9ba6]">{label}</span>
                <Status value={value} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-4 py-6 text-[13px] text-[#9b9ba6]">Loading health…</p>
        )}
      </Panel>

      {onboarding?.counts ? (
        <Panel title="Payment onboarding funnel" meta={`${onboarding.counts.signed_up ?? 0} creators scanned`}>
          <Figures
            items={[
              { label: "Signed up", value: num(onboarding.counts.signed_up) },
              { label: "Setup started", value: num(onboarding.counts.setup_started) },
              { label: "Account created", value: num(onboarding.counts.account_created) },
              { label: "KYC submitted", value: num(onboarding.counts.kyc_submitted) },
              { label: "Action required", value: num(onboarding.counts.action_required) },
              { label: "Payments active", value: num(onboarding.counts.payments_active) },
              { label: "Payout enabled", value: num(onboarding.counts.payout_enabled) },
            ]}
          />
        </Panel>
      ) : null}
    </div>
  )
}
