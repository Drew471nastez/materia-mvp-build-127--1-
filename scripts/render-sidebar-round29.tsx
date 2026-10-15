/**
 * The /app shell as app/app/layout.tsx draws it: the real sidebar
 * (components/app/sidebar.tsx, its rail and its collapse control) beside the
 * real Integrations page (app/app/integrations/integrations-client.tsx), with
 * physical commerce on. For scripts/check-sidebar-round29.mjs, which stubs
 * the router, Supabase and every /api answer, and checks that the root and
 * <main> here carry the same classes as the layout's.
 *
 * ?rail=collapsed opens with the sidebar collapsed, as the cookie would.
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { LanguageProvider } from "@/lib/i18n"
import { LocaleProvider } from "@/components/locale-provider"
import { PlatformSettingsProvider } from "@/components/platform/platform-settings-context"
import { AppSidebar } from "@/components/app/sidebar"
import { IntegrationsClient } from "@/app/app/integrations/integrations-client"
import { railStateOf, railWidth } from "@/lib/ui/app-rail"

const rail = railStateOf(new URLSearchParams(location.search).get("rail"))

/* Copied from app/app/layout.tsx; the probe fails if they ever differ. */
export const ROOT_CLASS = "h-svh overflow-hidden bg-[#111111] md:bg-[#131316] app-no-scrollbar"
export const MAIN_CLASS =
  "h-svh pt-[calc(68px_+_env(safe-area-inset-top,_0px))] md:pt-[calc(58px+env(safe-area-inset-top,_0px))] md:pl-[var(--app-rail-w,240px)] transition-[padding-left] duration-(--rail-ms) ease-(--rail-ease) motion-reduce:transition-none bg-[#f8f9fa] md:bg-white overflow-hidden app-main-content"
export const SCROLL_CLASS = "h-[calc(100svh_-_68px_-_env(safe-area-inset-top,_0px))] md:h-[calc(100svh-58px-env(safe-area-inset-top,_0px))] overflow-y-auto app-content-scroll"

createRoot(document.getElementById("app")!).render(
  <LocaleProvider>
  <LanguageProvider>
    <PlatformSettingsProvider exploreMarketplace={false} buyerHeaderLight={false} physicalCommerce>
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
            <IntegrationsClient />
          </div>
        </main>
      </div>
    </PlatformSettingsProvider>
  </LanguageProvider>
  </LocaleProvider>,
)
