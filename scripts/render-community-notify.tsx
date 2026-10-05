/**
 * Settings, Notifications (round 12), for scripts/check-community-notify.mjs:
 * the real Settings (components/account/account-settings.tsx) opened on
 * Notifications, in the account's column on Storelib's page grey. The probe
 * answers GET and PATCH /api/me/push and stands in for the Capacitor bridge:
 *
 *   ?app=1     window.Capacitor says this is the iOS app, and the push
 *              plugin is the probe's (window.__pushStub records every call
 *              and answers with the state the probe set). The app's own
 *              launch step (lib/push/client.ts initPushNotifications, what
 *              components/native-push-init.tsx runs) is run on mount, the
 *              way the app runs it, so the probe can see it never asks.
 *   (none)     a browser: no Capacitor at all.
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { LocaleProvider } from "@/components/locale-provider"
import { PlatformSettingsProvider } from "@/components/platform/platform-settings-context"
import { AccountColumn } from "@/components/account/account-column"
import { AccountSettings } from "@/components/account/account-settings"
import { initPushNotifications } from "@/lib/push/client"

const q = new URLSearchParams((window as unknown as { __probeSearch?: string }).__probeSearch ?? location.search)
const inApp = q.get("app") === "1"

function svg(w: number, h: number, body: string): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">${body}</svg>`)}`
}
const FACE = svg(128, 128, `<rect width="128" height="128" fill="#9fb3a8"/><circle cx="64" cy="52" r="24" fill="#eef2ee"/><rect x="28" y="86" width="72" height="44" rx="22" fill="#eef2ee"/>`)

function Page() {
  React.useEffect(() => {
    if (inApp) void initPushNotifications()
  }, [])
  return (
    <div className="min-h-svh bg-[#f8f9fa]" data-page="account">
      <main className="overflow-x-hidden">
        <AccountColumn>
          <AccountSettings
            userId="user-1"
            email="ava@example.com"
            name="Ava Stone"
            bio="Ceramics, slowly."
            bioSupported
            avatarUrl={FACE}
            createdAt="2025-03-14T10:00:00Z"
            hasPassword
            via=""
            isSeller={false}
            newsletter={false}
            personalized
            username="ava"
            privacy={{ showActivity: true, showCommunities: true, supported: true }}
            initialSection="notifications"
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
