/**
 * The /app shell as app/(storelib)/app/layout.tsx draws it, for
 * scripts/check-integrations-y2.mjs:
 *
 *   /app/integrations   the real Integrations page (IntegrationsClient)
 *   /app/settings       the directory as Settings › Integrations draws it,
 *                       in a scroller of the settings sheet's kind
 *                       ([data-settings-sheet-scroll])
 *
 * The router is stubbed with one that moves the address for real, so a card
 * opens its page and Back goes back through the pages' own code.
 */
import React, { Suspense } from "react"
import { createRoot } from "react-dom/client"
import { usePathname } from "next/navigation"
import { LanguageProvider } from "@/lib/i18n"
import { LocaleProvider } from "@/components/locale-provider"
import { PlatformSettingsProvider } from "@/components/platform/platform-settings-context"
import { AppSidebar } from "@/components/app/sidebar"
import { IntegrationsClient } from "@/app/(storelib)/app/integrations/integrations-client"
import { IntegrationsDirectory } from "@/components/app/settings/integrations-directory"
import { railStateOf, railWidth } from "@/lib/ui/app-rail"

const rail = railStateOf(new URLSearchParams(location.search).get("rail"))

/* The same classes as app/(storelib)/app/layout.tsx (scripts/render-integrations27.tsx checks they match). */
const ROOT_CLASS = "h-svh overflow-hidden bg-[#111111] md:bg-[#131316] app-no-scrollbar"
const MAIN_CLASS =
  "h-svh pt-[calc(68px_+_env(safe-area-inset-top,_0px))] md:pt-[calc(58px+env(safe-area-inset-top,_0px))] md:pl-[var(--app-rail-w,240px)] transition-[padding-left] duration-(--rail-ms) ease-(--rail-ease) motion-reduce:transition-none bg-[#f8f9fa] md:bg-white overflow-hidden app-main-content"
const SCROLL_CLASS = "h-[calc(100svh_-_68px_-_env(safe-area-inset-top,_0px))] md:h-[calc(100svh-58px-env(safe-area-inset-top,_0px))] overflow-y-auto app-content-scroll"

function Settings() {
  return (
    <div className="relative h-full bg-[#fafafa]">
      <div className="wb-slim-scroll absolute inset-0 overflow-y-auto overflow-x-clip overscroll-contain" data-settings-sheet-scroll="">
        <div className="mx-auto max-w-[880px] px-4 pb-24 pt-3 sm:px-6">
          <h1 className="mb-4 text-[24px] font-bold text-[#1a1a2e]">Integrations</h1>
          <Suspense fallback={null}>
            <IntegrationsDirectory />
          </Suspense>
        </div>
      </div>
    </div>
  )
}

function Page() {
  const path = usePathname()
  if (path === "/app/settings") return <Settings />
  return <IntegrationsClient />
}

createRoot(document.getElementById("app")!).render(
  <LocaleProvider>
    <LanguageProvider>
      <PlatformSettingsProvider exploreMarketplace={false} buyerHeaderLight={false} physicalCommerce>
        <div className={ROOT_CLASS} data-app-rail={rail} style={{ ["--app-rail-w" as string]: `${railWidth(rail)}px` }}>
          <AppSidebar creatorSlug="maralind" username="maralind" storePublished displayName="Mara Lind" stripeConnected stripeStatus="complete" onePagePublished={false} setupProgress={{ completed: 7, total: 7 }} />
          <main className={MAIN_CLASS}>
            <div className={SCROLL_CLASS}>
              <Page />
            </div>
          </main>
        </div>
      </PlatformSettingsProvider>
    </LanguageProvider>
  </LocaleProvider>,
)
