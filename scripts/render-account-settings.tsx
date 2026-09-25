/**
 * The real Settings page (components/app/settings-form-new) opened on the tab
 * named in `?tab=`, inside the /app shell's scroller, for
 * scripts/check-account-settings.mjs. Supabase and the router are stubs; the
 * probe's server answers every /api call.
 */
import React from "react"
import { createRoot } from "react-dom/client"

import { LanguageProvider } from "@/lib/i18n"
import { SettingsFormNew } from "@/components/app/settings-form-new"

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
} as never

const tab = (new URLSearchParams(location.search).get("tab") || "general") as never

createRoot(document.getElementById("app")!).render(
  <LanguageProvider>
    <div className="h-svh overflow-hidden bg-[#111111] md:bg-[#131316]">
      <header className="fixed inset-x-0 top-0 z-50 h-[68px] bg-[#111111] md:h-[58px]" />
      <main className="app-main-content h-svh overflow-hidden rounded-t-[20px] bg-[#f8f9fa] pt-[68px] md:rounded-none md:bg-white md:pl-[240px] md:pt-[58px]">
        <div className="app-content-scroll h-[calc(100svh-68px)] overflow-y-auto md:h-[calc(100svh-58px)]">
          <SettingsFormNew profile={profile} creator={creator} websitePublished newsletter initialTab={tab} />
        </div>
      </main>
    </div>
  </LanguageProvider>,
)
