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
  /*
    As components/app/creator-onboarding-modal draws step 4: a full window dialog (Radix's role="dialog", with
    its translate, so a fixed box inside is placed from it) on the dark film, the cards with the step's heading
    (split, so they sit on the film), scrolling inside the dialog (room below, so a scroll away can be tried).
  */
  onboarding: (
    <div role="dialog" aria-modal="true" className="fixed inset-0 h-[100dvh] w-screen translate-x-0 translate-y-0 overflow-clip bg-[#0b0b0f]">
      <div className="app-content-scroll absolute inset-0 overflow-y-auto">
        <div data-onboarding-plans="" className="mx-auto max-w-[1100px] px-4 pt-8 pb-[70vh] [--plan-bleed:16px] sm:px-6 sm:[--plan-bleed:24px]">
          <PricingSection
            compact
            hideDetailsLink
            compactHeading={
              <div className="min-w-0 text-left">
                <h1 className="text-[28px] font-semibold leading-[1.12] tracking-[-0.025em] text-white sm:text-[38px]">Choose your plan</h1>
                <p className="mt-2 text-[15px] leading-[22px] text-white/70">Start free and upgrade when you need to.</p>
              </div>
            }
            onboardingCallbacks={{ onPlanSelect: () => { (window as unknown as { picked?: number }).picked = ((window as unknown as { picked?: number }).picked ?? 0) + 1 }, loadingPlan: null, ctaLabels: { free: "Start free", growth: "Get Grow", pro: "Get Pro" } }}
          />
        </div>
      </div>
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
