/**
 * The real Settings (components/app/settings-form-new) inside the real sheet
 * (components/app/settings-sheet), over a page shaped like the dashboard, for
 * scripts/check-settings-sheet-desktop.mjs. The probe opens and closes the
 * sheet, presses sections in its column while scrolled down, and measures
 * every frame. The router, Supabase and every /api answer are stubs.
 */
import React from "react"
import { createRoot } from "react-dom/client"

import { LanguageProvider } from "@/lib/i18n"
import { SettingsFormNew } from "@/components/app/settings-form-new"
import { SettingsSheet } from "@/components/app/settings-sheet"
import { isRouteActive } from "@/components/app/sidebar-desktop-nav"
import { markCommitted, useShownPath } from "@/lib/ui/app-navigation"

const ROWS: [string, string][] = [["Dashboard", "/app"], ["Products", "/app/products"], ["Analytics", "/app/analytics"], ["Sales", "/app/orders"], ["Emails", "/app/emails"], ["Payouts", "/app/payouts"], ["Settings", "/app/settings"]]

/* The rail's rows, lit the way the real rail lights them (useShownPath, isRouteActive). */
function Rail() {
  const path = useShownPath()
  return (
    <>
      {ROWS.map(([label, href]) => (
        <div key={label} data-rail-row={label} data-rail-on={isRouteActive(path, href) ? "" : undefined} className="flex h-[38px] items-center rounded-[12px] px-[14px] text-[15px]" style={isRouteActive(path, href) ? { background: "#e8e8e8" } : undefined}>
          {label}
        </div>
      ))}
    </>
  )
}

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

/* The dashboard under the sheet: a rail of rows, a header, and a page with enough in it to cost something to draw. */
function Dashboard() {
  return (
    <div className="h-svh overflow-hidden bg-[#131316]">
      <header className="fixed inset-x-0 top-0 z-50 h-[58px] bg-[#111111]" />
      <aside className="fixed bottom-0 left-0 top-[58px] w-[240px] bg-white p-3" data-rail="">
        <Rail />
      </aside>
      <main className="h-svh pl-[240px] pt-[58px]">
        <div className="app-content-scroll h-[calc(100svh-58px)] overflow-y-auto bg-[#f8f9fa] p-6">
          {Array.from({ length: 40 }, (_, i) => (
            <div key={i} className="mb-4 rounded-2xl border border-[#e5e7eb]/60 bg-white p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
              <p className="text-[15px] font-semibold text-[#1a1a2e]">Card {i}</p>
              <p className="text-[14px] text-[#6b7280]">Orders, visits and payouts for the last week.</p>
            </div>
          ))}
        </div>
      </main>
    </div>
  )
}

function App() {
  const [open, setOpen] = React.useState(false)
  const w = window as unknown as { __open: () => void; __closed: () => void; __path: string }
  /* The address, as the stage commits it (components/app/app-stage markCommitted). */
  React.useLayoutEffect(() => markCommitted(w.__path, ""), [open, w])
  React.useEffect(() => {
    w.__open = () => {
      w.__path = "/app/settings"
      setOpen(true)
    }
    /* The stubbed router's Back: the sheet goes when the address goes back, as the slot does. */
    w.__closed = () => {
      w.__path = "/app"
      setOpen(false)
    }
  }, [w])
  return (
    <>
      <Dashboard />
      {open ? (
        <SettingsSheet overlay>
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
