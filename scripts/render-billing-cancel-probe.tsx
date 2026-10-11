/**
 * Settings opened on its Plan tab, for scripts/check-billing-cancel.mjs:
 * the real SettingsFormNew inside a stand in for the /app shell, as
 * scripts/render-billing-probe.tsx draws it. Supabase, the router and
 * next/link are stubs; the check's server answers every /api call, and
 * holds the subscription's state so Cancel plan and Resume plan go through.
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
  support_email: "help@maralind.com",
} as never

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

createRoot(document.getElementById("app")!).render(
  <LanguageProvider>
    <Shell>
      <SettingsFormNew profile={profile} creator={creator} accountTimeZone="Europe/Bucharest" websitePublished newsletter initialTab={"billing" as never} />
    </Shell>
  </LanguageProvider>,
)
