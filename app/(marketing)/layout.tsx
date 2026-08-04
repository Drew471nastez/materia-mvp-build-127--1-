import type React from "react"
import { Suspense } from "react"
import { ConditionalHeader } from "@/components/marketing/conditional-header"
import { ConditionalFooter } from "@/components/marketing/conditional-footer"
import { GlobalMobileNav } from "@/components/marketing/global-mobile-nav"
import { GlobalMobileTopBar } from "@/components/marketing/global-mobile-topbar"
import { BodyScrollRestorer } from "@/components/body-scroll-restorer"
import { ShellScrollReset } from "@/components/marketing/shell-scroll-reset"
import { TabTransition } from "@/components/marketing/tab-transition"

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    // The minimum height is in CSS, not here: it has to subtract the bottom
    // safe-area inset that <body> already pays for, and `min-h-svh` cannot.
    // See `.marketing-flex-wrapper` in app/globals.css.
    <div className="flex flex-col marketing-flex-wrapper">
      {/* Preconnect to image CDN — saves ~200-400ms on first image request */}
      <link rel="preconnect" href="https://skgtqglupjcnfhfscink.supabase.co" />
      <link rel="dns-prefetch" href="https://skgtqglupjcnfhfscink.supabase.co" />
      <link rel="preconnect" href="https://cdn.sanity.io" />
      <BodyScrollRestorer />
      <Suspense fallback={null}>
        <ShellScrollReset />
      </Suspense>
      <ConditionalHeader />

      <Suspense fallback={null}>
        <GlobalMobileTopBar />
      </Suspense>

      {/* Renders the <main> itself — the tab arrival has to be on the element
          that survives the route swap, not inside it. See tab-transition.tsx. */}
      <TabTransition className="flex-1 [overflow-x:clip]">{children}</TabTransition>

      <Suspense fallback={null}>
        <ConditionalFooter />
      </Suspense>

      <Suspense fallback={null}>
        <GlobalMobileNav />
      </Suspense>
    </div>
  )
}
