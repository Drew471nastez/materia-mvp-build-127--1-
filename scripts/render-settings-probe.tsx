/**
 * The real Settings page with a creator's worth of fixture data, inside a
 * shell shaped like app/(storelib)/app/layout.tsx, for the probes that compare it with
 * an earlier version of itself (scripts/check-settings-header-country.mjs,
 * scripts/check-domains-design.mjs). The probe writes the entry that calls
 * `mount` with the form it wants: this checkout's, or a copy of an older
 * commit's.
 *
 * `window.__fixture` changes the fixture before it mounts: { profile,
 * creator, tab }.
 */
import React from "react"
import { createRoot } from "react-dom/client"

import { LanguageProvider } from "@/lib/i18n"

type Form = React.ComponentType<Record<string, unknown>>

const base = {
  profile: {
    id: "user-1",
    email: "maker@example.com",
    full_name: "Mara Lind",
    display_name: "Mara Lind",
    first_name: "Mara",
    last_name: "Lind",
    username: "maralind",
    avatar_url: null,
    bio: "Prints and patterns",
    country: "Sweden",
    created_at: "2025-01-01T00:00:00Z",
    updated_at: "2025-01-01T00:00:00Z",
  },
  creator: {
    id: "creator-1",
    user_id: "user-1",
    slug: "maralind",
    username: "maralind",
    display_name: "Mara Lind",
    stripe_account_id: "acct_1",
    store_published: true,
  },
}

export function mount(SettingsForm: Form) {
  const fx = ((window as unknown as { __fixture?: Record<string, unknown> }).__fixture ?? {}) as {
    profile?: Record<string, unknown>
    creator?: Record<string, unknown>
    tab?: string
  }
  const profile = { ...base.profile, ...(fx.profile ?? {}) }
  const creator = { ...base.creator, ...(fx.creator ?? {}) }
  function Shell() {
    return (
      <div className="h-svh overflow-hidden bg-[#111111] md:bg-[#131316]">
        <header className="fixed inset-x-0 top-0 z-50 h-[68px] bg-[#111111] md:h-[58px]" />
        <main className="app-main-content h-svh overflow-hidden rounded-t-[20px] bg-[#f8f9fa] pt-[68px] md:rounded-none md:bg-white md:pl-[240px] md:pt-[58px]">
          <div className="app-content-scroll h-[calc(100svh-68px)] overflow-y-auto md:h-[calc(100svh-58px)]">
            <SettingsForm profile={profile} creator={creator} websitePublished initialTab={fx.tab ?? "general"} />
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
  ;(window as unknown as Record<string, unknown>).__ran = true
}
