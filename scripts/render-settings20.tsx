/**
 * The real Settings in the real sheet over a dashboard-shaped page, with a
 * REAL history this time (round 20), for scripts/check-settings20.mjs.
 *
 * The address is the window's own: opening pushes /app/settings, the
 * router's push and replace are pushState and replaceState, and Back is the
 * browser's. The @sheet slot is copied as Next draws it:
 *
 *   a Back or Forward    restores the tree that entry had, so the sheet is
 *                        mounted exactly when the entry is a Settings one
 *   a push or replace    keeps what the slot last drew (a soft navigation
 *                        to a page with no match for @sheet), so the sheet
 *                        stays mounted and draws nothing off Settings
 *
 * Supabase is a stub whose auth listeners the probe can call
 * (window.__auth("TOKEN_REFRESHED")), to stand in for a token refreshed
 * after a long idle.
 */
import React from "react"
import { createRoot } from "react-dom/client"

import { LanguageProvider } from "@/lib/i18n"
import { SettingsFormNew } from "@/components/app/settings-form-new"
import { SettingsSheet } from "@/components/app/settings-sheet"
import { markCommitted } from "@/lib/ui/app-navigation"

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
  subscription_plan_id: "free",
} as never

function Dashboard() {
  return (
    <div className="h-svh overflow-hidden bg-[#131316]">
      <header className="fixed inset-x-0 top-0 z-50 h-[58px] bg-[#111111]" />
      <aside className="fixed bottom-0 left-0 top-[58px] w-[240px] bg-white p-3 max-md:hidden" />
      <main className="h-svh pt-[58px] md:pl-[240px]">
        <div className="app-content-scroll h-[calc(100svh-58px)] overflow-y-auto bg-[#f8f9fa] p-6" data-dashboard="">
          {Array.from({ length: 30 }, (_, i) => (
            <button key={i} type="button" data-card={i} onClick={() => ((window as never as { __cardPresses: number }).__cardPresses += 1)} className="mb-4 block w-full rounded-2xl border border-[#e5e7eb]/60 bg-white p-6 text-left">
              Card {i}
            </button>
          ))}
        </div>
      </main>
    </div>
  )
}

type W = Window & {
  __open: () => void
  __rerender: () => void
  __slotKept: boolean
  __mounts: number
  __cardPresses: number
}

function Probe() {
  React.useEffect(() => {
    ;(window as unknown as W).__mounts += 1
  }, [])
  return null
}

function App() {
  const w = window as unknown as W
  const [, bump] = React.useReducer((n: number) => n + 1, 0)
  const [slot, setSlot] = React.useState(() => location.pathname === "/app/settings")
  React.useLayoutEffect(() => markCommitted(location.pathname, location.search))
  React.useEffect(() => {
    w.__rerender = () => bump()
    w.__open = () => {
      history.pushState({ sheet: true }, "", "/app/settings")
      setSlot(true)
      bump()
    }
    /* A Back or Forward restores that entry's tree: the sheet is up exactly on a Settings entry. */
    const onPop = () => {
      setSlot(location.pathname === "/app/settings")
      bump()
    }
    window.addEventListener("popstate", onPop)
    return () => window.removeEventListener("popstate", onPop)
  }, [w])
  return (
    <>
      <Dashboard />
      {slot ? (
        <SettingsSheet overlay>
          <Probe />
          <div>
            <SettingsFormNew profile={profile} creator={creator} websitePublished initialTab="general" />
          </div>
        </SettingsSheet>
      ) : null}
    </>
  )
}

createRoot(document.getElementById("app")!).render(
  <LanguageProvider>
    <App />
  </LanguageProvider>,
)
