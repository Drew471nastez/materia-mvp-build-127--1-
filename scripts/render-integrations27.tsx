/**
 * The /app shell as app/(storelib)/app/layout.tsx draws it (the real sidebar,
 * NavigationLoadingBar and AppStage), for scripts/check-integrations27.mjs:
 *
 *   /app/integrations   the real Integrations page and an integration's page
 *   /app/reviews        the real Storelib Reviews page (Products › Reviews)
 *   /app/orders/1       a page whose bar is sticky (OrderBarFrame), with a
 *                       long body under it
 *   anything else       a plain list page (a flat PaneBar), as a card's app
 *
 * The probe stubs the router with one that moves the address for real, so
 * Back and the tabs are measured through the pages' own code.
 */
import React, { Suspense } from "react"
import { createRoot } from "react-dom/client"
import { usePathname } from "next/navigation"
import { LanguageProvider } from "@/lib/i18n"
import { LocaleProvider } from "@/components/locale-provider"
import { PlatformSettingsProvider } from "@/components/platform/platform-settings-context"
import { AppSidebar } from "@/components/app/sidebar"
import { NavigationLoadingBar } from "@/components/app/navigation-loading-bar"
import { AppStage } from "@/components/app/app-stage"
import { IntegrationsClient } from "@/app/(storelib)/app/integrations/integrations-client"
import { ReviewsClient } from "@/app/(storelib)/app/reviews/reviews-client"
import { GUTTER, LIST_BAR, LIST_WIDTH, ORDER_WIDTH, OrderBarFrame, PaneBar } from "@/app/(storelib)/app/orders/order-parts"
import { railStateOf, railWidth } from "@/lib/ui/app-rail"

const rail = railStateOf(new URLSearchParams(location.search).get("rail"))

/* Copied from app/(storelib)/app/layout.tsx; the probe fails if they ever differ. */
export const ROOT_CLASS = "h-svh overflow-hidden bg-[#111111] md:bg-[#131316] app-no-scrollbar"
export const MAIN_CLASS =
  "h-svh pt-[calc(68px_+_env(safe-area-inset-top,_0px))] md:pt-[calc(58px+env(safe-area-inset-top,_0px))] md:pl-[var(--app-rail-w,240px)] transition-[padding-left] duration-(--rail-ms) ease-(--rail-ease) motion-reduce:transition-none bg-[#f8f9fa] md:bg-white overflow-hidden app-main-content"
export const SCROLL_CLASS = "h-[calc(100svh_-_68px_-_env(safe-area-inset-top,_0px))] md:h-[calc(100svh-58px-env(safe-area-inset-top,_0px))] overflow-y-auto app-content-scroll"

const Rows = () => (
  <div className="space-y-3">
    {Array.from({ length: 14 }, (_, i) => (
      <div key={i} className="h-20 rounded-2xl border border-[#e5e7eb]/60 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]" />
    ))}
  </div>
)

function StandIn({ path }: { path: string }) {
  return (
    <div className="orders-pane h-full overflow-y-auto overflow-x-hidden page-scroll bg-[#f8f9fa]" data-stand-in={path}>
      <PaneBar width={LIST_WIDTH} className={LIST_BAR}>
        <h1 className="text-[24px] font-bold text-[#1a1a2e] sm:text-[28px]">{path}</h1>
      </PaneBar>
      <div className={`mx-auto pb-8 ${LIST_WIDTH} ${GUTTER}`}>
        <Rows />
      </div>
    </div>
  )
}

function OrderStandIn() {
  return (
    <div className="orders-pane h-full overflow-y-auto overflow-x-hidden page-scroll bg-[#f8f9fa]" data-stand-in="/app/orders/1">
      <OrderBarFrame back={<span className="block h-5 w-5 rounded bg-[#e5e7eb]" />} title={<h1 className="text-[20px] font-bold text-[#1a1a2e]">#1042</h1>} subtitle="17 October 2026" />
      <div className={`mx-auto pb-8 ${ORDER_WIDTH} ${GUTTER}`}>
        <Rows />
      </div>
    </div>
  )
}

function Page() {
  const path = usePathname()
  if (path === "/app/integrations") return <IntegrationsClient />
  if (path === "/app/reviews") return <ReviewsClient />
  if (path === "/app/orders/1") return <OrderStandIn />
  return <StandIn path={path} />
}

createRoot(document.getElementById("app")!).render(
  <LocaleProvider>
    <LanguageProvider>
      <PlatformSettingsProvider exploreMarketplace={false} buyerHeaderLight={false} physicalCommerce>
        <Suspense fallback={null}>
          <NavigationLoadingBar />
          <AppStage />
        </Suspense>
        <div className={ROOT_CLASS} data-app-rail={rail} style={{ ["--app-rail-w" as string]: `${railWidth(rail)}px` }}>
          <AppSidebar
            creatorSlug="maralind"
            username="maralind"
            storePublished
            displayName="Mara Lind"
            stripeConnected
            stripeStatus="complete"
            onePagePublished={false}
            setupProgress={{ completed: 7, total: 7 }}
          />
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
