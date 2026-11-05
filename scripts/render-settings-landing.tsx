/**
 * scripts/check-settings-landing.mjs: the same page as render-settings-tabs,
 * landing the way the app lands it: the stage's own playEntrance, run on the
 * frame the page is first committed, as components/app/app-stage does.
 *
 * (What follows is render-settings-tabs' description.)
 * The real Settings page (components/app/settings-form-new) with a creator's
 * worth of fixture data, inside a shell shaped like app/(storelib)/app/layout.tsx: the
 * header, <main>, and `.app-content-scroll`, which is what Settings scrolls
 * in. The probe switches its tabs and measures what moves.
 *
 * Supabase and the router are stubs (the probe writes them); every /api call
 * is answered by the probe's server with an empty success after a short
 * wait, like a quick network.
 */
import React from "react"
import { createRoot } from "react-dom/client"

import { LanguageProvider } from "@/lib/i18n"
import { SettingsFormNew } from "@/components/app/settings-form-new"
import { playEntrance } from "@/components/app/app-stage"

const profile = {
  id: "user-1",
  email: "maker@example.com",
  full_name: "Mara Lind",
  display_name: "Mara Lind",
  first_name: "Mara",
  last_name: "Lind",
  username: "maralind",
  avatar_url: null,
  bio: "Prints and patterns",
  country: "SE",
  created_at: "2025-01-01T00:00:00Z",
  updated_at: "2025-01-01T00:00:00Z",
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

function Shell() {
  React.useLayoutEffect(() => {
    const outer = document.querySelector<HTMLElement>(".app-content-scroll")
    if (outer) playEntrance(outer)
  }, [])
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
