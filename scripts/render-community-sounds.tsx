/**
 * Settings, Preferences (round 13, P2 ask 17), for scripts/check-community-sounds.mjs: the real Settings
 * (components/account/account-settings.tsx) opened on Preferences, where the community Sounds switch now
 * sits ("Sounds: likes, comments and posts"), in the account's column on Storelib's page grey.
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { LocaleProvider } from "@/components/locale-provider"
import { PlatformSettingsProvider } from "@/components/platform/platform-settings-context"
import { AccountColumn } from "@/components/account/account-column"
import { AccountSettings } from "@/components/account/account-settings"

function Page() {
  return (
    <div className="min-h-svh bg-[#f8f9fa]" data-page="account">
      <main className="overflow-x-hidden">
        <AccountColumn>
          <AccountSettings
            userId="user-1"
            email="ava@example.com"
            name="Ava Stone"
            bio=""
            bioSupported
            avatarUrl={null}
            createdAt="2025-03-14T10:00:00Z"
            hasPassword
            via=""
            isSeller={false}
            newsletter={false}
            personalized
            username="ava"
            initialSection="preferences"
          />
        </AccountColumn>
      </main>
    </div>
  )
}

createRoot(document.getElementById("app")!).render(
  <PlatformSettingsProvider exploreMarketplace buyerHeaderLight={false}>
    <LocaleProvider>
      <Page />
    </LocaleProvider>
  </PlatformSettingsProvider>,
)
