import type React from "react"
import { Suspense } from "react"
import { ConditionalHeader } from "@/components/marketing/conditional-header"
import { ConditionalFooter } from "@/components/marketing/conditional-footer"
import { GlobalMobileNav } from "@/components/marketing/global-mobile-nav"
import { GlobalMobileTopBar } from "@/components/marketing/global-mobile-topbar"
import { BodyScrollRestorer } from "@/components/body-scroll-restorer"
import { ShellScrollReset } from "@/components/marketing/shell-scroll-reset"
import { TabTransition } from "@/components/marketing/tab-transition"
import { PresenceBeacon } from "@/components/presence-beacon"
import { SurfaceClaim } from "@/components/surface-claim"

export default function MarketingLayout({
  children,
  modal,
}: {
  children: React.ReactNode
  /**
   * The parallel slot intercepted routes render into — today, the sell sheet.
   *
   * It is a SIBLING of <main>, deliberately, and not a child. Two reasons, both
   * of which have already cost this app a bug: <main> carries the tab dip, so a
   * sheet inside it would fade with the screen it is supposed to be covering;
   * and anything that ever puts a transform on <main> would become the
   * containing block for the sheet's `position: fixed` root.
   *
   * Rendered last, after the tab bar, so its z-95 sits over the bar's z-80
   * without either of them having to know about the other's stacking context.
   *
   * @modal/default.tsx returns null, so on every route that is not intercepted
   * this is nothing at all.
   */
  modal?: React.ReactNode
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
      {/* THE WHITE LINE AT THE TOP WHEN YOU CHANGE PAGE.
          
          In the app a white bar is pinned over the status-bar strip at z-9999
          (`html.capacitor::before`), and the only thing that takes it down is a
          screen holding a surface claim. The feed, the profile and the top bar
          each held one; the inbox, the sell form and /profile/edit did not — so
          crossing from a screen that claims to one that does not RELEASED the
          strip, the shield came back, and a white band appeared across the top
          of the page for as long as you were on it. Crossing back made it
          vanish again. That is the line, and it was never a loading state.
          
          Claimed here instead, once, for the whole shell. `claimSurface` is a
          stack, so this sits underneath and a screen that wants a different
          colour still pushes its own on top and pops it on the way out — the
          difference is that the stack is never EMPTY while you are inside the
          app, so there is no moment for the shield to return to. White because
          that is what the marketplace is; the one screen that wants something
          else says so for itself. */}
      <SurfaceClaim colour="#ffffff" />
      <BodyScrollRestorer />
      <PresenceBeacon />
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

      {modal}
    </div>
  )
}
