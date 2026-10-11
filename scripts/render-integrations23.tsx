/**
 * Settings › Integrations as it ships (components/app/settings-form-new in
 * components/app/settings-sheet), physical commerce on, for
 * scripts/check-integrations23.mjs. At 1024px and up the sheet over a page
 * shaped like the dashboard; below it, the page. The router, Supabase and
 * every /api answer are stubs (the probe's server).
 */
import React from "react"
import { createRoot } from "react-dom/client"

import { LanguageProvider } from "@/lib/i18n"
import { PlatformSettingsProvider } from "@/components/platform/platform-settings-context"
import { SettingsFormNew } from "@/components/app/settings-form-new"
import { SettingsSheet } from "@/components/app/settings-sheet"
import { ViewportVars } from "@/components/viewport-vars"

const profile = { id: "user-1", email: "maker@example.com", full_name: "Mara Lind", display_name: "Mara Lind", first_name: "Mara", last_name: "Lind", username: "maralind", avatar_url: null, bio: "", country: "SE", created_at: "2025-01-01T00:00:00Z", updated_at: "2025-01-01T00:00:00Z" } as never
const creator = { id: "creator-1", user_id: "user-1", slug: "maralind", username: "maralind", display_name: "Mara Lind", stripe_account_id: "acct_test", store_published: true, subscription_plan_id: "free" } as never
const desktop = window.matchMedia("(min-width: 1024px)").matches

function Form() {
  return <SettingsFormNew profile={profile} creator={creator} websitePublished initialTab="integrations" />
}

createRoot(document.getElementById("app")!).render(
  <LanguageProvider>
    <PlatformSettingsProvider exploreMarketplace={false} buyerHeaderLight={false} physicalCommerce>
      <ViewportVars />
      {desktop ? (
        <>
          <div className="h-svh overflow-hidden bg-[#131316]">
            <main className="h-svh pl-[240px] pt-[58px]">
              <div className="app-content-scroll h-[calc(100svh-58px)] overflow-y-auto bg-[#f8f9fa] p-6" />
            </main>
          </div>
          <SettingsSheet overlay>
            <Form />
          </SettingsSheet>
        </>
      ) : (
        <div className="h-svh overflow-hidden bg-[#111111]">
          <SettingsSheet>
            <Form />
          </SettingsSheet>
        </div>
      )}
    </PlatformSettingsProvider>
  </LanguageProvider>,
)
