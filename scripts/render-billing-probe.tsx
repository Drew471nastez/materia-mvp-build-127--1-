/**
 * The places the Monthly and Yearly pill is pressed, hydrated in a real
 * browser for scripts/check-billing-tab.mjs:
 *
 *   ?surface=settings    the real Settings page opened on its Billing tab,
 *                        inside the /app shell's scroller (as
 *                        scripts/render-account-settings.tsx draws it)
 *   ?surface=upgrade     the in-app upgrade page, for somebody on Free
 *   ?surface=marketing   the pricing section of the landing page
 *
 * Supabase, the router and next/link are stubs; the probe's server answers
 * every /api call and stands in for /_next/image.
 */
import React from "react"
import { createRoot } from "react-dom/client"

import { LanguageProvider } from "@/lib/i18n"
import { SettingsFormNew } from "@/components/app/settings-form-new"
import { UpgradePageClient } from "@/components/app/billing/upgrade-page-client"
import { PricingSection } from "@/components/marketing/pricing-section"

const params = new URLSearchParams(location.search)
const surface = params.get("surface") || "settings"

const profile = {
  id: "user-1",
  email: "maker@example.com",
  display_name: "Mara Lind",
  first_name: "Mara",
  last_name: "Lind",
  username: "maralind",
  avatar_url: null,
  country: "SE",
  created_at: "2025-01-01T00:00:00Z",
  personalized_recommendations: true,
} as never

const creator = {
  id: "creator-1",
  user_id: "user-1",
  slug: "maralind",
  username: "maralind",
  display_name: "Mara Lind",
  stripe_account_id: null,
  store_published: true,
  support_email: "help@maralind.com",
} as never

const plans = [
  { id: "free", name: "Free", price_cents: 0 },
  { id: "growth", name: "Growth", price_cents: 2900 },
  { id: "pro", name: "Pro", price_cents: 9900 },
]

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-svh overflow-hidden bg-[#111111] md:bg-[#131316]">
      <header className="fixed inset-x-0 top-0 z-50 h-[68px] bg-[#111111] md:h-[58px]" />
      <main className="app-main-content h-svh overflow-hidden rounded-t-[20px] bg-[#f8f9fa] pt-[68px] md:rounded-none md:bg-white md:pl-[240px] md:pt-[58px]">
        <div data-probe-scroller="" className="app-content-scroll h-[calc(100svh-68px)] overflow-y-auto md:h-[calc(100svh-58px)]">
          {children}
        </div>
      </main>
    </div>
  )
}

const page =
  surface === "upgrade" ? (
    <Shell>
      <UpgradePageClient plans={plans} currentPlanId="free" hasActiveSubscription={false} />
    </Shell>
  ) : surface === "marketing" ? (
    <div data-probe-scroller="" className="bg-[#f8f9fa]">
      <PricingSection hideDetailsLink />
    </div>
  ) : (
    <Shell>
      <SettingsFormNew profile={profile} creator={creator} accountTimeZone="Europe/Bucharest" websitePublished newsletter initialTab={"billing" as never} />
    </Shell>
  )

createRoot(document.getElementById("app")!).render(<LanguageProvider>{page}</LanguageProvider>)
