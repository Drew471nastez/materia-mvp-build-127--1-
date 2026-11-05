/**
 * The account, round 11, for scripts/check-account-round11.mjs: the real
 * profile center (components/account/account-hub.tsx) with the real
 * Settings (components/account/account-settings.tsx) under it, in a shell
 * shaped like app/(storelib)/account/layout.tsx: Storelib's real header, the page, a
 * footer, and the phone's real tab bar (components/nav/buyer-tab-bar.tsx)
 * unless `?tabs=no`. The router is the probe's stub: a push changes the
 * path a moment later, the way a page the router already has arrives, and
 * every push, back and prefetch is written down.
 *
 *   /account                 the profile (Activity) with the owner's pills
 *   /account/settings        Settings, opened on Profile
 *   /explore                 a page with only the tab bar, to see what the
 *                            tab bar reads ahead for Profile
 */
import React, { Suspense } from "react"
import { createRoot } from "react-dom/client"
import { usePathname } from "next/navigation"
import { LocaleProvider } from "@/components/locale-provider"
import { PlatformSettingsProvider } from "@/components/platform/platform-settings-context"
import { ConditionalHeader } from "@/components/marketing/conditional-header"
import { BuyerTabBar } from "@/components/nav/buyer-tab-bar"
import { AccountHub } from "@/components/account/account-hub"
import { AccountNavFade } from "@/components/account/account-nav-fade"
import { AccountColumn } from "@/components/account/account-column"
import { AccountSettings } from "@/components/account/account-settings"
import { ProfileActivity, type ActivityItemView } from "@/components/profile/profile-activity"

function svg(w: number, h: number, body: string): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">${body}</svg>`)}`
}
const FACE = svg(128, 128, `<rect width="128" height="128" fill="#9fb3a8"/><circle cx="64" cy="52" r="24" fill="#eef2ee"/><rect x="28" y="86" width="72" height="44" rx="22" fill="#eef2ee"/>`)
const COVER = svg(1600, 600, `<rect width="1600" height="600" fill="#cfdbd5"/><path d="M0 420 C 400 300, 800 520, 1600 360 L1600 600 L0 600 Z" fill="#6f8f7f"/><circle cx="1260" cy="160" r="80" fill="#f2efe6"/>`)

const q = new URLSearchParams(location.search)
const tabs = q.get("tabs") !== "no"

const NOW = Date.parse("2026-10-04T12:00:00Z")
const ACTIVITY: ActivityItemView[] = [
  { key: "a1", at: "2026-10-03T09:00:00Z", kind: "joined", title: "Clay Studio", context: null, excerpt: null, rating: null, href: "/community/clay-studio", imageUrl: FACE },
  { key: "a2", at: "2026-09-20T19:00:00Z", kind: "reviewed", title: "Film Emulation Presets", context: null, excerpt: "The Portra look is the one I keep coming back to.", rating: 5, href: "/p/presets", imageUrl: FACE },
]

function Account() {
  const path = usePathname() || "/account"
  if (path === "/explore") {
    return (
      <AccountColumn>
        <p className="text-[14px] text-[#6b7280]" data-probe-explore="">
          Explore
        </p>
      </AccountColumn>
    )
  }
  return (
    <AccountNavFade>
      <AccountHub identity={{ userId: "user-1", name: "Ava Stone", username: "ava", avatarUrl: FACE, coverUrl: COVER, bio: "Ceramics, slowly.", followers: 12, following: 3 }} communities>
        {path.startsWith("/account/settings") ? (
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
            cover={{ url: COVER, supported: true }}
            privacy={{ showActivity: true, showCommunities: true, supported: true }}
          />
        ) : (
          <ProfileActivity userId="user-1" initial={ACTIVITY} initialNext={null} now={NOW} emptyText="Nothing here yet." />
        )}
      </AccountHub>
    </AccountNavFade>
  )
}

function Shell() {
  return (
    <div className="flex min-h-svh flex-col bg-[#fafafa]" data-page="account">
      <ConditionalHeader onPlatformDomain />
      <main className="flex-1 overflow-x-clip">
        <Account />
      </main>
      {/* The site footer's place (app/(storelib)/account/layout.tsx draws ConditionalFooter here, in a relative isolate). */}
      <div className="relative isolate">
        <footer className="bg-[#111111] px-4 pb-8 pt-10 text-[13px] text-white/70" data-probe-footer="">
          <p>Storelib</p>
          <p className="mt-2" data-probe-footer-last="">
            Terms · Privacy
          </p>
        </footer>
      </div>
      {tabs ? (
        <Suspense fallback={null}>
          <BuyerTabBar />
        </Suspense>
      ) : null}
    </div>
  )
}

createRoot(document.getElementById("app")!).render(
  <PlatformSettingsProvider exploreMarketplace buyerHeaderLight={false}>
    <LocaleProvider>
      <Shell />
    </LocaleProvider>
  </PlatformSettingsProvider>,
)
