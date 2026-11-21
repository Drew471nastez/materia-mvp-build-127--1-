/**
 * The plan cards where a person picks a plan, drawn on their own for
 * scripts/check-pricing-rate-line.mjs: the marketing section (home and
 * /pricing), the onboarding step's compact cards, and the in-app upgrade page
 * (the Billing tab draws the same <PlanCards>). `?surface=` picks one.
 */
import React from "react"
import { createRoot } from "react-dom/client"

import { PricingSection } from "@/components/marketing/pricing-section"
import UpgradeLayout from "@/app/(storelib)/app/settings/billing/upgrade/layout"
import { UpgradePageClient } from "@/components/app/billing/upgrade-page-client"

const surface = new URLSearchParams(location.search).get("surface") ?? "marketing"

const plans = [
  { id: "free", name: "Free", price_cents: 0, billing_period: null },
  { id: "growth", name: "Grow", price_cents: 1400, billing_period: "month" },
  { id: "pro", name: "Pro", price_cents: 9900, billing_period: "month" },
]

const pages: Record<string, React.ReactElement> = {
  marketing: <PricingSection hideDetailsLink />,
  onboarding: (
    <div style={{ maxWidth: 860, margin: "0 auto", padding: "24px 16px" }}>
      <PricingSection compact hideDetailsLink onboardingCallbacks={{ onPlanSelect: () => {}, loadingPlan: null, ctaLabels: { free: "Start free", growth: "Get Grow", pro: "Get Pro" } }} />
    </div>
  ),
  upgrade: (
    <div className="h-svh overflow-hidden bg-[#f8f9fa]">
      <div className="app-content-scroll h-full overflow-y-auto">
        <UpgradeLayout>
          <UpgradePageClient plans={plans} currentPlanId="free" hasActiveSubscription={false} />
        </UpgradeLayout>
      </div>
    </div>
  ),
}

createRoot(document.getElementById("app")!).render(pages[surface] ?? pages.marketing)
