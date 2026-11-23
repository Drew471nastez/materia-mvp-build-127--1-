/**
 * Round 60: Settings > Plan, the plans page in the app and /pricing, drawn by
 * their real components for scripts/check-billing-plan-r60.mjs.
 *
 *   /pricing                          the public page's client, on its own
 *   /app/settings?tab=billing         the real Settings (settings-form-new) in
 *                                     the real sheet, opened on Plan, over a
 *                                     dashboard shaped stand in; the billing
 *                                     overview is the probe's stub
 *   /app/settings/billing/upgrade     the real layout (a layer) and client
 *
 * `?current=growth&active=1` is somebody on Grow with a live subscription;
 * nothing given is somebody on Free.
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { LanguageProvider } from "@/lib/i18n"
import { SettingsFormNew } from "@/components/app/settings-form-new"
import { SettingsSheet } from "@/components/app/settings-sheet"
import UpgradeLayout from "@/app/(storelib)/app/settings/billing/upgrade/layout"
import { UpgradePageClient } from "@/components/app/billing/upgrade-page-client"
import { PricingPageClient } from "@/app/(storelib)/(marketing)/pricing/pricing-client"

const q = new URLSearchParams(location.search)
const currentPlanId = q.get("current") || "free"
const active = q.get("active") === "1"
const plans = [
  { id: "free", name: "Free", price_cents: 0, billing_period: null },
  { id: "growth", name: "Growth", price_cents: 1400, billing_period: "month" },
  { id: "pro", name: "Pro", price_cents: 9900, billing_period: "month" },
]

const profile = {
  id: "user-1",
  email: "maker@example.com",
  full_name: "Mara Lind",
  display_name: "Mara Lind",
  first_name: "Mara",
  last_name: "Lind",
  username: "maralind",
  avatar_url: null,
  bio: "Prints and patterns",
  country: "SE",
  created_at: "2025-01-01T00:00:00Z",
  updated_at: "2025-01-01T00:00:00Z",
} as never

const creator = {
  id: "creator-1",
  user_id: "user-1",
  slug: "maralind",
  username: "maralind",
  display_name: "Mara Lind",
  stripe_account_id: null,
  store_published: true,
  subscription_plan_id: currentPlanId,
} as never

/* The shell under the sheet: the header, and from 768px the rail. */
function Shell() {
  return (
    <div className="h-svh overflow-hidden bg-[#f8f9fa]">
      <header className="fixed inset-x-0 top-0 z-50 h-[68px] bg-[#111111] md:h-[58px]" />
      <aside className="fixed bottom-0 left-0 top-[58px] hidden w-[240px] bg-white md:block" />
    </div>
  )
}

const mount = document.getElementById("app")!
const path = location.pathname
if (path === "/pricing") {
  createRoot(mount).render(<PricingPageClient />)
} else if (path === "/app/settings/billing/upgrade") {
  document.documentElement.classList.add("app-layout")
  createRoot(mount).render(
    <div style={{ position: "fixed", inset: 0 }}>
      <Shell />
      <UpgradeLayout>
        <UpgradePageClient plans={plans} currentPlanId={currentPlanId} hasActiveSubscription={active} />
      </UpgradeLayout>
    </div>,
  )
} else {
  document.documentElement.classList.add("app-layout")
  createRoot(mount).render(
    <LanguageProvider>
      <Shell />
      <SettingsSheet overlay>
        <div>
          <SettingsFormNew profile={profile} creator={creator} websitePublished initialTab="billing" />
        </div>
      </SettingsSheet>
    </LanguageProvider>,
  )
}
