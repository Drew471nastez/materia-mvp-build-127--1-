/**
 * The real Settings page on General, for scripts/check-settings-addresses.mjs:
 * the owner's account (andrewrullz, a published website called Luca
 * Dragoste) inside a shell shaped like app/(storelib)/app/layout.tsx.
 *
 * `?site=none` has no published website, `?site=sub` has one at the
 * username's subdomain, and `?site=domain` also has a domain connected to it
 * (the probe's /api/domains answers with it).
 */
import React from "react"
import { createRoot } from "react-dom/client"

import { LanguageProvider } from "@/lib/i18n"
import { SettingsFormNew } from "@/components/app/settings-form-new"

const params = new URLSearchParams(location.search)
const site = params.get("site") || "sub"

const profile = {
  id: "user-1",
  email: "andrew@example.com",
  display_name: "Andrew Rull",
  first_name: "Andrew",
  last_name: "Rull",
  username: "andrewrullz",
  avatar_url: null,
  country: "RO",
  created_at: "2025-01-01T00:00:00Z",
} as never

const creator = {
  id: "creator-1",
  user_id: "user-1",
  slug: "andrewrullz",
  username: "andrewrullz",
  display_name: "Andrew Rull",
  stripe_account_id: null,
  store_published: true,
} as never

const website = site === "none" ? { installId: null, name: null, handle: null } : { installId: "install-1", name: "Luca Dragoste", handle: null }

createRoot(document.getElementById("app")!).render(
  <LanguageProvider>
    <div className="h-svh overflow-hidden bg-[#111111] md:bg-[#131316]">
      <header className="fixed inset-x-0 top-0 z-50 h-[68px] bg-[#111111] md:h-[58px]" />
      <main className="app-main-content h-svh overflow-hidden rounded-t-[20px] bg-[#f8f9fa] pt-[68px] md:rounded-none md:bg-white md:pl-[240px] md:pt-[58px]">
        <div className="app-content-scroll h-[calc(100svh-68px)] overflow-y-auto md:h-[calc(100svh-58px)]">
          <SettingsFormNew profile={profile} creator={creator} websitePublished={site !== "none"} onePageLive website={website} initialTab="general" />
        </div>
      </main>
    </div>
  </LanguageProvider>,
)
