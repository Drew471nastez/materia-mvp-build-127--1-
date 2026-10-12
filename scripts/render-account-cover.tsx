/**
 * The profile's cover, set in Settings and drawn on the profile, for
 * scripts/check-account-cover.mjs. Both are the real components:
 *
 *   #settings   /account/settings as the account draws it: the real
 *               AccountSettings (components/account/account-settings.tsx) in
 *               the account's column, its Cover field the creator editor's
 *               control (components/account/cover-field.tsx)
 *   #hero       /account's header (components/profile/profile-hero.tsx) for
 *               the owner, with the cover the probe stored
 *
 * Globals the probe sets before load: __stored (profiles.cover_url as it is
 * stored, crop and all; absent for no cover). PATCH /api/profile/cover is
 * answered here and kept in window.__patches; router.refresh() is counted
 * in window.__refreshes.
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { AccountSettings } from "@/components/account/account-settings"
import { AccountColumn } from "@/components/account/account-column"
import { ProfileHero } from "@/components/profile/profile-hero"

const w = window as unknown as { __stored?: string | null; __page?: string | null; __patches?: unknown[] }
const stored = w.__stored ?? null
/* Round J1: their creator page's cover (window.__page), which Settings shows when they have none of their own. */
const pageCover = w.__page ?? null

const realFetch = window.fetch.bind(window)
window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url
  if (url.includes("/api/profile/cover") && init?.method === "PATCH") {
    const body = JSON.parse(String(init.body || "{}"))
    ;(w.__patches ||= []).push(body)
    return new Response(JSON.stringify({ coverUrl: body.coverUrl ?? null, crop: body.crop ?? null }), { status: 200, headers: { "content-type": "application/json" } })
  }
  if (url.includes("/api/")) return new Response("{}", { status: 200, headers: { "content-type": "application/json" } })
  return realFetch(input, init)
}) as typeof window.fetch

function Settings() {
  return (
    <div className="flex min-h-svh flex-col bg-[#fafafa]" data-page="account">
      <div className="sticky top-0 z-40 h-14 border-b border-[#eceef1] bg-white" />
      <main className="flex-1 overflow-x-hidden">
        <AccountColumn>
          <AccountSettings
            userId="u1"
            email="alex@example.com"
            name="Alex Morgan"
            bio="Buying presets and brushes for retouching work."
            bioSupported
            avatarUrl={null}
            createdAt="2025-03-14T10:00:00Z"
            hasPassword
            via="Google"
            isSeller={false}
            newsletter={false}
            personalized
            username="alexmorgan"
            cover={{ url: stored, supported: true, page: pageCover }}
            privacy={{ showActivity: true, showCommunities: true, supported: true }}
            initialSection="profile"
          />
        </AccountColumn>
      </main>
    </div>
  )
}

function Hero() {
  return (
    <div className="min-h-svh bg-[#fafafa]" data-page="account">
      <div className="sticky top-0 z-40 h-14 border-b border-[#eceef1] bg-white" />
      <main className="overflow-x-hidden">
        <ProfileHero
          person={{ userId: "u1", name: "Alex Morgan", username: "alexmorgan", avatarUrl: null, coverUrl: stored, bio: "Buying presets and brushes for retouching work.", followers: 12, following: 30 }}
          signedIn
          isSelf
        />
      </main>
    </div>
  )
}

createRoot(document.getElementById("app")!).render(location.hash === "#hero" ? <Hero /> : <Settings />)
