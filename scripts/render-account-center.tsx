/**
 * /account as the layout draws it (app/(storelib)/account/layout.tsx), for
 * scripts/check-account-center.mjs: the REAL site header
 * (components/platform/platform-header-client.tsx, with Supabase stubbed by
 * the probe as a signed in buyer), then the main column with the real hub
 * and its pages (scripts/account-hub-demo.tsx), the footer and the phone's
 * tab bar. The page follows the stub router's path, so a press on a pill or
 * a link moves it the way a prefetched page arrives.
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { LocaleProvider } from "@/components/locale-provider"
import { PlatformHeaderClient } from "@/components/platform/platform-header-client"
import { BuyerTabBar } from "@/components/nav/buyer-tab-bar"
import { AccountDemo } from "./account-hub-demo"

try {
  localStorage.clear()
} catch {
  /* no storage: the header starts from nothing */
}

function Shell() {
  return (
    <div className="flex min-h-svh flex-col bg-[#fafafa]" data-page="account">
      <PlatformHeaderClient />
      <main className="flex-1 overflow-x-clip">
        <AccountDemo />
      </main>
      <footer className="bg-[#111] px-4 py-10 text-[13px] text-white/70">Storelib</footer>
      <BuyerTabBar />
    </div>
  )
}

createRoot(document.getElementById("app")!).render(
  <LocaleProvider>
    <Shell />
  </LocaleProvider>,
)
