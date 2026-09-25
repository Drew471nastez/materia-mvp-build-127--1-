/**
 * Renders the places plans are chosen, on their own: the marketing pricing
 * section (landing page and /pricing), the onboarding step's compact cards,
 * and the in-app upgrade page, once for somebody on Free and once for
 * somebody on the earlier $99 plan. No session, no database. Bundled by
 * scripts/check-pricing-cards.mjs, which stubs the router and next/link and
 * hands next/image the app's own image settings.
 *
 * The Billing tab draws the same <PlanCards> with different button labels, so
 * measuring these surfaces measures it too.
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

const pages: Record<string, ReactElement> = {
  marketing: <PricingSection hideDetailsLink />,
  onboarding: (
    <div style={{ maxWidth: 860, margin: "0 auto", padding: "24px 16px" }}>
      <PricingSection
        compact
        hideDetailsLink
        onboardingCallbacks={{ onPlanSelect: () => {}, loadingPlan: null, ctaLabels: { free: "Start free", growth: "Get Pro" } }}
      />
    </div>
  ),
  upgrade: <UpgradePageClient plans={plans} currentPlanId="free" hasActiveSubscription={false} />,
  "upgrade-legacy": <UpgradePageClient plans={plans} currentPlanId="pro" hasActiveSubscription />,
}

for (const [name, el] of Object.entries(pages)) {
  writeFileSync(join(OUT, `${name}.html`), renderToStaticMarkup(el))
}
