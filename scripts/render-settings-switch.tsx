/**
 * The real Settings (components/app/settings-form-new) in the real sheet
 * (components/app/settings-sheet), over a page shaped like the dashboard,
 * for scripts/check-settings-switch.mjs. Every /api answer comes from the
 * probe's server after a fake delay, so the probe can measure what a press
 * on a section shows while its data is still on its way, and once it is
 * kept. The router and Supabase are stubs the probe writes.
 */
import React from "react"
import { createRoot } from "react-dom/client"

import { LanguageProvider } from "@/lib/i18n"
import { SettingsFormNew } from "@/components/app/settings-form-new"
import { SettingsSheet } from "@/components/app/settings-sheet"
import { PlatformSettingsProvider } from "@/components/platform/platform-settings-context"
import { ErrorScreen } from "@/components/platform/error-screen"

/* What app/(storelib)/app/error.tsx is to the sheet in the app: the boundary over it, with the app's own error screen. */
class AppBoundary extends React.Component<{ children: React.ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null }
  static getDerivedStateFromError(error: Error) {
    return { error }
  }
  render() {
    if (this.state.error) return <div data-app-error-screen=""><ErrorScreen error={this.state.error} home="/app" /></div>
    return this.props.children
  }
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

function Dashboard() {
  return (
    <div className="h-svh overflow-hidden bg-[#131316]">
      <header className="fixed inset-x-0 top-0 z-50 h-[68px] bg-[#111111] md:h-[58px]" />
      <main className="h-svh pt-[68px] md:pl-[240px] md:pt-[58px]">
        <div className="app-content-scroll h-[calc(100svh-58px)] overflow-y-auto bg-[#f8f9fa] p-6">
          {Array.from({ length: 30 }, (_, i) => (
            <div key={i} className="mb-4 rounded-2xl border border-[#e5e7eb]/60 bg-white p-6">
              <p className="text-[15px] font-semibold text-[#1a1a2e]">Card {i}</p>
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
  React.useEffect(() => {
    w.__open = () => {
      w.__path = "/app/settings"
      setOpen(true)
    }
    w.__closed = () => {
      w.__path = "/app"
      setOpen(false)
    }
  }, [w])
  return (
    <>
      <Dashboard />
      {open ? (
        <AppBoundary>
          <SettingsSheet overlay>
            <div>
              <SettingsFormNew profile={profile} creator={creator} websitePublished initialTab="general" />
            </div>
          </SettingsSheet>
        </AppBoundary>
      ) : null}
    </>
  )
}

const physical = (window as unknown as { __physical?: boolean }).__physical === true

createRoot(document.getElementById("app")!).render(
  <PlatformSettingsProvider exploreMarketplace={false} buyerHeaderLight={false} physicalCommerce={physical}>
    <LanguageProvider>
      <App />
    </LanguageProvider>
  </PlatformSettingsProvider>,
)
