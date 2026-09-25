/**
 * Renders the two places plans are chosen, on their own: the marketing
 * pricing section (landing page and /pricing) and the in-app upgrade page,
 * once for somebody on Free and once for somebody on the earlier $99 plan.
 * No session, no database. Bundled by scripts/check-pricing-cards.mjs, which
 * stubs the router and next/link.
 *
 * The Billing tab draws the same <PlanCards> with different button labels, so
 * measuring these two surfaces measures it too.
 */
import { renderToStaticMarkup } from "react-dom/server"
import type { ReactElement } from "react"
import { writeFileSync } from "node:fs"
import { join } from "node:path"

import { PricingSection } from "@/components/marketing/pricing-section"
import { UpgradePageClient } from "@/components/app/billing/upgrade-page-client"

const OUT = process.env.OUT_DIR!

/** The rows as the database seeds them: all three, the $99 one included. */
const plans = [
  { id: "free", name: "Free", price_cents: 0 },
  { id: "growth", name: "Growth", price_cents: 2900 },
  { id: "pro", name: "Pro", price_cents: 9900 },
]

/** Onboarding's plan step: the compact cards, in the modal's content width. */
const onboarding = (loadingPlan: string | null) => (
  <div className="mx-auto max-w-[834px] bg-white px-4 py-6 md:px-0">
    <PricingSection
      compact
      hideDetailsLink
      onboardingCallbacks={{ onPlanSelect() {}, loadingPlan, ctaLabels: { free: "Start free", growth: "Get Pro" } }}
    />
  </div>
)

const pages: Record<string, ReactElement> = {
  marketing: <PricingSection hideDetailsLink />,
  onboarding: onboarding(null),
  "onboarding-loading": onboarding("growth"),
  upgrade: <UpgradePageClient plans={plans} currentPlanId="free" hasActiveSubscription={false} />,
  "upgrade-legacy": <UpgradePageClient plans={plans} currentPlanId="pro" hasActiveSubscription />,
}

for (const [name, el] of Object.entries(pages)) {
  writeFileSync(join(OUT, `${name}.html`), renderToStaticMarkup(el))
}
