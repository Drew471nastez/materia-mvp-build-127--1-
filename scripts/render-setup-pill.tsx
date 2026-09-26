/**
 * The /app shell (components/app/sidebar) with store setup three of seven
 * steps in, on the Products page, for scripts/check-setup-pill.mjs: the
 * setup pill floating at the bottom right of a desktop window.
 */
import React from "react"
import { createRoot } from "react-dom/client"

import { LanguageProvider } from "@/lib/i18n"
import { LocaleProvider } from "@/components/locale-provider"
import { SWRProvider } from "@/lib/swr-config"
import { AppSidebar } from "@/components/app/sidebar"

function App() {
  return (
    <div className="h-svh overflow-hidden bg-[#111111] md:bg-[#131316]">
      <AppSidebar
        creatorSlug="maralind"
        username="maralind"
        storePublished
        displayName="Mara Lind"
        stripeConnected={false}
        stripeStatus="not_connected"
        onePagePublished
        setupProgress={{ completed: 3, total: 7 }}
        businesses={[]}
      />
      <main className="app-main-content h-svh overflow-hidden rounded-t-[20px] bg-[#f8f9fa] pt-[68px] md:rounded-none md:bg-white md:pl-[240px] md:pt-[58px]">
        <div className="app-content-scroll h-[calc(100svh-68px)] overflow-y-auto md:h-[calc(100svh-58px)]">
          <div className="mx-auto max-w-[1200px] px-4 py-6 sm:px-6 lg:px-8">
            <h1 className="text-[24px] font-bold text-[#1a1a2e] sm:text-[28px]">Products</h1>
            <div className="mt-6 h-[640px] rounded-2xl border border-[#e5e7eb]/60 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]" />
          </div>
        </div>
      </main>
    </div>
  )
}

createRoot(document.getElementById("app")!).render(
  <SWRProvider>
    <LocaleProvider>
      <LanguageProvider>
        <App />
      </LanguageProvider>
    </LocaleProvider>
  </SWRProvider>,
)
