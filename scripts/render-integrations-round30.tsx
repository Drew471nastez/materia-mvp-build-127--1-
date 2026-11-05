/**
 * The /app shell as app/(storelib)/app/layout.tsx and components/app/app-layout-wrapper
 * draw it: the real sidebar, the real NavigationLoadingBar and AppStage (how
 * a page arrives, its scroll on a Back, its landing), and the real
 * Integrations page (app/(storelib)/app/integrations/integrations-client.tsx), with
 * physical commerce on. For scripts/check-integrations-round30.mjs, which
 * stubs the router with one that moves the address for real (pushState,
 * popstate), so a card that leaves for one of Storelib's apps and the Back
 * that returns are measured through the shell's own code.
 *
 * Any address other than /app/integrations draws a plain /app page in its
 * place, standing in for the app the card opened.
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
import { GUTTER, LIST_BAR, LIST_WIDTH, PaneBar } from "@/app/(storelib)/app/orders/order-parts"
import { railStateOf, railWidth } from "@/lib/ui/app-rail"

const rail = railStateOf(new URLSearchParams(location.search).get("rail"))

/* Copied from app/(storelib)/app/layout.tsx; the probe fails if they ever differ. */
export const ROOT_CLASS = "h-svh overflow-hidden bg-[#111111] md:bg-[#131316] app-no-scrollbar"
export const MAIN_CLASS =
  "h-svh pt-[calc(68px_+_env(safe-area-inset-top,_0px))] md:pt-[calc(58px+env(safe-area-inset-top,_0px))] md:pl-[var(--app-rail-w,240px)] transition-[padding-left] duration-(--rail-ms) ease-(--rail-ease) motion-reduce:transition-none bg-[#f8f9fa] md:bg-white overflow-hidden app-main-content"
export const SCROLL_CLASS = "h-[calc(100svh_-_68px_-_env(safe-area-inset-top,_0px))] md:h-[calc(100svh-58px-env(safe-area-inset-top,_0px))] overflow-y-auto app-content-scroll"

/** The app a card opened, as any /app list page is drawn. */
function StandIn({ path }: { path: string }) {
  return (
    <div className="orders-pane h-full overflow-y-auto overflow-x-hidden page-scroll bg-[#f8f9fa]" data-stand-in={path}>
      <PaneBar width={LIST_WIDTH} className={LIST_BAR}>
        <h1 className="text-[24px] font-bold text-[#1a1a2e] sm:text-[28px]">{path}</h1>
      </PaneBar>
      <div className={`mx-auto pb-8 ${LIST_WIDTH} ${GUTTER}`}>
        <div className="space-y-3">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="h-20 rounded-2xl border border-[#e5e7eb]/60 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]" />
          ))}
        </div>
      </div>
    </div>
  )
}

function Page() {
  const path = usePathname()
  return path === "/app/integrations" ? <IntegrationsClient /> : <StandIn path={path} />
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
