import type React from "react"
import { Suspense } from "react"
import { ConditionalHeader } from "@/components/marketing/conditional-header"
import { ConditionalFooter } from "@/components/marketing/conditional-footer"
import { GlobalMobileNav } from "@/components/marketing/global-mobile-nav"
import { BodyScrollRestorer } from "@/components/body-scroll-restorer"

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-svh flex-col marketing-flex-wrapper">
      {/* Preconnect to image CDN — saves ~200-400ms on first image request */}
      <link rel="preconnect" href="https://skgtqglupjcnfhfscink.supabase.co" />
      <link rel="dns-prefetch" href="https://skgtqglupjcnfhfscink.supabase.co" />
      <link rel="preconnect" href="https://cdn.sanity.io" />
      <BodyScrollRestorer />
      <ConditionalHeader />

      <main className="flex-1 [overflow-x:clip]">{children}</main>

      <Suspense fallback={null}>
        <ConditionalFooter />
      </Suspense>

      <Suspense fallback={null}>
        <GlobalMobileNav />
      </Suspense>
    </div>
  )
}
