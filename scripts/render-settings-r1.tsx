/**
 * The real Settings (components/app/settings-form-new) in the real sheet
 * (components/app/settings-sheet), for scripts/check-settings-r1.mjs. At
 * 1024px and up it is the sheet over a page shaped like the dashboard; below
 * it, the page under a header the shape of the app's, with a stand-in for the
 * nav pill's links. ViewportVars is mounted as in app/(storelib)/layout.tsx, so a
 * simulated keyboard (the probe's own visualViewport) reaches every sheet.
 * The router, Supabase and every /api answer are stubs.
 */
import React from "react"
import { createRoot } from "react-dom/client"

import { LanguageProvider } from "@/lib/i18n"
import { SettingsFormNew } from "@/components/app/settings-form-new"
import { SettingsSheet } from "@/components/app/settings-sheet"
import { ViewportVars } from "@/components/viewport-vars"

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
  stripe_account_id: "acct_test",
  store_published: true,
  subscription_plan_id: "free",
} as never

const desktop = window.matchMedia("(min-width: 1024px)").matches

function Form() {
  return (
    <div>
      <SettingsFormNew profile={profile} creator={creator} websitePublished initialTab="general" />
    </div>
  )
}

function Desktop() {
  const [open, setOpen] = React.useState(true)
  const w = window as unknown as { __closed: () => void; __path: string }
  React.useEffect(() => {
    w.__closed = () => {
      w.__path = "/app"
      setOpen(false)
    }
  }, [w])
  return (
    <>
      <div className="h-svh overflow-hidden bg-[#131316]">
        <header className="fixed inset-x-0 top-0 z-50 h-[58px] bg-[#111111]" />
        <main className="h-svh pl-[240px] pt-[58px]">
          <div className="app-content-scroll h-[calc(100svh-58px)] overflow-y-auto bg-[#f8f9fa] p-6">
            {Array.from({ length: 20 }, (_, i) => (
              <div key={i} className="mb-4 rounded-2xl border border-[#e5e7eb]/60 bg-white p-6">Card {i}</div>
            ))}
          </div>
        </main>
      </div>
      {open ? (
        <SettingsSheet overlay>
          <Form />
        </SettingsSheet>
      ) : null}
    </>
  )
}

/* Below 1024px: the app's header over the page, and a stand-in for the nav pill (its links are what a press on the pill is). */
function Phone() {
  return (
    <div className="h-svh overflow-hidden bg-[#111111]">
      <header className="fixed inset-x-0 top-0 z-50 h-[68px] bg-[#111111]" />
      <SettingsSheet>
        <Form />
      </SettingsSheet>
      <nav className="fixed bottom-[max(4px,env(safe-area-inset-bottom))] left-1/2 z-[55] flex h-[60px] -translate-x-1/2 items-center gap-6 rounded-full bg-white px-6 shadow" data-fake-nav="">
        <a href="/app/products" data-fake-nav-link="">Products</a>
        <a href="/app" data-fake-nav-home="">Home</a>
      </nav>
    </div>
  )
}

createRoot(document.getElementById("app")!).render(
  <LanguageProvider>
    <ViewportVars />
    {desktop ? <Desktop /> : <Phone />}
  </LanguageProvider>,
)
