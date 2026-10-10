import type React from "react"
import { LocaleProvider } from "@/components/locale-provider"
import { AccountCommunityChrome } from "@/components/account/account-community-chrome"
import { SettingsSubpageHost } from "@/components/account/settings-subpage"
import { ViewportVars } from "@/components/viewport-vars"
import { NavLanding } from "@/components/ui/nav-landing"
import { BodyScrollRestorer } from "@/components/body-scroll-restorer"
import { PlatformSettingsProvider } from "@/components/platform/platform-settings-context"
export const dynamic = "force-dynamic"
export default function Root({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="light" style={{ colorScheme: "light" }} suppressHydrationWarning>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <script dangerouslySetInnerHTML={{ __html: `try{if(/StorelibApp|Capacitor/.test(navigator.userAgent||''))document.documentElement.classList.add('capacitor')}catch(e){}` }} />
        <link rel="stylesheet" href="/probe.css" />
      </head>
      <body className="font-sans antialiased bg-background text-foreground">
        <LocaleProvider>
          <PlatformSettingsProvider exploreMarketplace buyerHeaderLight physicalCommerce={false}>
            <AccountCommunityChrome />
            {children}
            <SettingsSubpageHost />
          </PlatformSettingsProvider>
        </LocaleProvider>
        <BodyScrollRestorer />
        <ViewportVars />
        <NavLanding />
      </body>
    </html>
  )
}
