/**
 * The real Settings page (components/app/settings-form-new) for
 * scripts/check-share-pill-settings.mjs, where the address pill sits beside
 * the title. `?user=` is the handle, so the pill can be as long as the
 * owner's own: storelib.com/andrewrullz by default.
 */
import React from "react"
import { createRoot } from "react-dom/client"

import { LanguageProvider } from "@/lib/i18n"
import { SettingsFormNew } from "@/components/app/settings-form-new"

const user = new URLSearchParams(location.search).get("user") || "andrewrullz"

const profile = {
  id: "user-1",
  email: "maker@example.com",
  full_name: "Andrew Rullz",
  display_name: "Andrew Rullz",
  first_name: "Andrew",
  last_name: "Rullz",
  username: user,
  avatar_url: null,
  bio: "",
  country: "US",
  created_at: "2025-01-01T00:00:00Z",
  updated_at: "2025-01-01T00:00:00Z",
} as never

const creator = {
  id: "creator-1",
  user_id: "user-1",
  slug: user,
  username: user,
  display_name: "Andrew Rullz",
  stripe_account_id: null,
  store_published: true,
} as never

function Shell() {
  return (
    <div className="h-svh overflow-hidden bg-[#111111] md:bg-[#131316]">
      <header className="fixed inset-x-0 top-0 z-50 h-[68px] bg-[#111111] md:h-[58px]" />
      <main className="app-main-content h-svh overflow-hidden rounded-t-[20px] bg-[#f8f9fa] pt-[68px] md:rounded-none md:bg-white md:pl-[240px] md:pt-[58px]">
        <div className="app-content-scroll h-[calc(100svh-68px)] overflow-y-auto md:h-[calc(100svh-58px)]">
          <SettingsFormNew profile={profile} creator={creator} websitePublished initialTab="general" />
        </div>
      </main>
    </div>
  )
}

createRoot(document.getElementById("app")!).render(
  <LanguageProvider>
    <Shell />
  </LanguageProvider>,
)
