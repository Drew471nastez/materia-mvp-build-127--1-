import type React from "react"
import { LocaleProvider } from "@/components/locale-provider"
import { ViewportVars } from "@/components/viewport-vars"
import { NavLanding } from "@/components/ui/nav-landing"
import { BodyScrollRestorer } from "@/components/body-scroll-restorer"
import { StuckLayerGuard } from "@/components/platform/stuck-layer-guard"
import { AppHistoryTracker } from "@/components/platform/app-history-tracker"
import { PlatformSettingsProvider } from "@/components/platform/platform-settings-context"
export const dynamic = "force-dynamic"
export default function Root({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="light" style={{ colorScheme: "light" }} suppressHydrationWarning>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <script dangerouslySetInnerHTML={{ __html: `try{if(/^\\/app(\\/|$)/.test(location.pathname)){document.documentElement.classList.add('app-layout','app-arriving')}}catch(e){}window.__docLoads=(Number(sessionStorage.getItem('docLoads')||0)+1);sessionStorage.setItem('docLoads',String(window.__docLoads))` }} />
        <link rel="stylesheet" href="/probe.css" />
      </head>
      <body className="font-sans antialiased bg-background text-foreground">
        <LocaleProvider>
          <PlatformSettingsProvider exploreMarketplace buyerHeaderLight physicalCommerce={false}>
            {children}
          </PlatformSettingsProvider>
        </LocaleProvider>
        <BodyScrollRestorer />
        <ViewportVars />
        <NavLanding />
        <StuckLayerGuard />
        <AppHistoryTracker />
      </body>
    </html>
  )
}
