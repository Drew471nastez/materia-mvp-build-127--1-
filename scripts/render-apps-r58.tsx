/**
 * The /app shell with the real Integrations page and the real Reviews page,
 * for scripts/check-apps-r58.mjs (round 58). The same shell classes as
 * scripts/render-integrations-y2.tsx; the router moves the address for real.
 */
import React, { Suspense } from "react"
import { createRoot } from "react-dom/client"
import { usePathname } from "next/navigation"
import { LanguageProvider } from "@/lib/i18n"
import { LocaleProvider } from "@/components/locale-provider"
import { PlatformSettingsProvider } from "@/components/platform/platform-settings-context"
import { AppSidebar } from "@/components/app/sidebar"
import { IntegrationsClient } from "@/app/(storelib)/app/integrations/integrations-client"
import { ReviewsClient } from "@/app/(storelib)/app/reviews/reviews-client"
import { railStateOf, railWidth } from "@/lib/ui/app-rail"

const rail = railStateOf(new URLSearchParams(location.search).get("rail"))
const ROOT_CLASS = "h-svh overflow-hidden bg-[#111111] md:bg-[#131316] app-no-scrollbar"
const MAIN_CLASS =
  "h-svh pt-[calc(68px_+_env(safe-area-inset-top,_0px))] md:pt-[calc(58px+env(safe-area-inset-top,_0px))] md:pl-[var(--app-rail-w,240px)] bg-[#f8f9fa] md:bg-white overflow-hidden app-main-content"
const SCROLL_CLASS = "h-[calc(100svh_-_68px_-_env(safe-area-inset-top,_0px))] md:h-[calc(100svh-58px-env(safe-area-inset-top,_0px))] overflow-y-auto app-content-scroll"

function Page() {
  const path = usePathname()
  if (path === "/app/reviews") return <ReviewsClient />
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
              <Suspense fallback={null}>
                <Page />
              </Suspense>
            </div>
          </main>
        </div>
      </PlatformSettingsProvider>
    </LanguageProvider>
  </LocaleProvider>,
)
