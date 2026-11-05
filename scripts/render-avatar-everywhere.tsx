/**
 * The /app shell as app/(storelib)/app/layout.tsx mounts it (components/app/sidebar:
 * the black header, the desktop sidebar, the account menu and the phone's
 * account sheet, both headed by the two businesses of one login) with
 * the real Settings page in it, both drawn from one "server" answer the
 * probe's server holds (GET /state). `router.refresh()` asks for it again
 * and draws both with the new answer, which is what the server components
 * do in the app. scripts/check-avatar-everywhere.mjs drives it.
 */
import React from "react"
import { createRoot } from "react-dom/client"

import { LanguageProvider } from "@/lib/i18n"
import { LocaleProvider } from "@/components/locale-provider"
import { SWRProvider } from "@/lib/swr-config"
import { AppSidebar } from "@/components/app/sidebar"
import { SettingsFormNew } from "@/components/app/settings-form-new"

type State = { avatar: string | null }

async function load(): Promise<State> {
  const res = await fetch("/state", { cache: "no-store" })
  return (await res.json()) as State
}

function App({ first }: { first: State }) {
  const [server, setServer] = React.useState(first)
  React.useEffect(() => {
    ;(window as unknown as { __refresh: () => void }).__refresh = () => {
      void load().then((s) => {
        ;(window as unknown as { __refreshed: number }).__refreshed = ((window as unknown as { __refreshed?: number }).__refreshed ?? 0) + 1
        setServer(s)
      })
    }
  }, [])
  const profile = {
    id: "user-1",
    email: "maker@example.com",
    display_name: "Mara Lind",
    first_name: "Mara",
    last_name: "Lind",
    username: "maralind",
    avatar_url: server.avatar,
    country: "Sweden",
    created_at: "2025-01-01T00:00:00Z",
  }
  const creator = { id: "creator-1", user_id: "user-1", slug: "maralind", username: "maralind", display_name: "Mara Lind", stripe_account_id: "acct_1", store_published: true }
  return (
    <div className="h-svh overflow-hidden bg-[#111111] md:bg-[#131316]">
      <AppSidebar
        creatorSlug="maralind"
        username="maralind"
        storePublished
        avatarUrl={server.avatar ?? undefined}
        displayName="Mara Lind"
        stripeConnected
        stripeStatus="connected"
        onePagePublished
        setupProgress={{ completed: 6, total: 6 }}
        businesses={[
          /* As app/(storelib)/app/layout.tsx has them (lib/businesses/server): the one you are in is your profile's photo. */
          { userId: "user-1", name: "Mara Lind", handle: "maralind", avatarUrl: server.avatar, ready: true, current: true, role: "owner" },
          { userId: "user-2", name: "Lind Studio", handle: "lindstudio", avatarUrl: null, ready: true, current: false, role: "member" },
        ]}
      />
      <main className="app-main-content h-svh overflow-hidden rounded-t-[20px] bg-[#f8f9fa] pt-[68px] md:rounded-none md:bg-white md:pl-[240px] md:pt-[58px]">
        <div className="app-content-scroll h-[calc(100svh-68px)] overflow-y-auto md:h-[calc(100svh-58px)]">
          <SettingsFormNew profile={profile as never} creator={creator as never} websitePublished initialTab="general" />
        </div>
      </main>
    </div>
  )
}

void load().then((first) => {
  /* The providers app/(storelib)/layout.tsx and components/app/app-layout-wrapper.tsx put around every /app page. */
  createRoot(document.getElementById("app")!).render(
    <SWRProvider>
      <LocaleProvider>
        <LanguageProvider>
          <App first={first} />
        </LanguageProvider>
      </LocaleProvider>
    </SWRProvider>,
  )
  ;(window as unknown as Record<string, unknown>).__ran = true
})
