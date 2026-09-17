import type React from "react"
import { redirect } from "next/navigation"
import { headers } from "next/headers"
import { currentUserForRequest, profileForRequest } from "@/lib/auth/request-scope"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { PurchaseSyncProvider } from "@/components/checkout/purchase-sync-provider"
import { NativeAuthGate } from "@/components/native-auth-gate"
import LibraryLoading from "./loading"
import { LibraryBgFix } from "./library-bg-fix"

/**
 * Detect Capacitor WebView from the User-Agent header.
 * In Capacitor, auth is stored in Preferences (not cookies), so
 * server-side session checks may fail on full-page reloads.
 * The client-side NativeAuthGate restores the session asynchronously.
 */
async function isCapacitorWebView(): Promise<boolean> {
  const headersList = await headers()
  const ua = headersList.get("user-agent") || ""
  return /StorelibApp|Capacitor/.test(ua) || (/wv/.test(ua) && /Android/.test(ua))
}

export default async function LibraryLayout({
  children,
}: {
  children: React.ReactNode
}) {
  /**
   * Reading a header and asking Supabase who this is are unrelated, and the
   * second can take up to three seconds. They were awaited one after the
   * other; now the header read happens while the auth request is in flight.
   */
  const [isNative, current] = await Promise.all([
    isCapacitorWebView(),
    /** A blip is not a sign-out. See lib/auth/current-user.ts. */
    currentUserForRequest(),
  ])
  const user = current.user

  if (!user) {
    /** Could not tell, so the client decides with the session it is holding. */
    if (isNative || current.state === "indeterminate") {
      // In Capacitor, session lives in Preferences (not cookies).
      // A full-page reload won't have a server-side session yet —
      // the client will restore it asynchronously from Preferences.
      // Skip the redirect and let NativeAuthGate handle it.
      return (
        <NativeAuthGate requireAuth loadingFallback={<LibraryLoading />}>
          {children}
        </NativeAuthGate>
      )
    }
    redirect("/login")
  }

  // ── Access gates ───────────────────────────────────────────────────────
  /**
   * The page inside this layout needs the display name and avatar off the
   * same row, so both come back in one select. See lib/auth/request-scope.ts.
   */
  const gateCheck = await profileForRequest(user.id)

  // Gate 1: email must be verified
  if (!gateCheck?.email_verified) {
    redirect(`/signup/verify?userId=${user.id}&email=${encodeURIComponent(user.email || "")}`)
  }

  // Gate 2: role must be selected (creator OR buyer with welcome_completed)
  const roleSelected = gateCheck.is_creator === true || gateCheck.welcome_completed === true
  if (!roleSelected) {
    redirect("/signup/success")
  }

  return (
    <NativeAuthGate>
    <div className="bg-[#fafafa] min-h-svh" data-page="library">
      <LibraryBgFix />
      <PurchaseSyncProvider />
      <DashboardSidebar />

      {/* Main content column — sits next to sidebar on desktop */}
      <div className="flex flex-col md:ml-64 md:min-h-svh bg-[#fafafa]">
        {/* Mobile: fixed-height scroll container so overscroll-behavior is honoured
            and iOS rubber-band bounce is fully suppressed.
            Desktop: natural document flow (sidebar owns the full-height layout). */}
        <main
          className={[
            // Mobile: full-viewport-height scroll container so that overscroll-behavior
            // is honoured on the container itself and iOS rubber-band is suppressed.
            // The content is pushed below the fixed header via padding-top.
            "h-svh overflow-y-auto bg-[#fafafa]",
            // Desktop: revert to natural document flow
            "md:h-auto md:overflow-y-visible md:min-h-svh",
            // Mobile top padding accounts for the fixed header (3.5rem) + 1px border-b + status bar
            "pt-[calc(3.5rem+1px+env(safe-area-inset-top,_0px))]",
            "md:pt-[env(safe-area-inset-top,_0px)]",
          ].join(" ")}
          style={{
            // Prevent iOS rubber-band overscroll bounce on the scroll container.
            // CSS overscroll-behavior works on iOS 16+; CapacitorBounceGuard
            // in the root layout handles older versions via touchmove preventDefault.
            // NOTE: WebkitOverflowScrolling is intentionally omitted — that legacy
            // property conflicts with overscroll-behavior:none and can re-enable
            // rubber-band bounce on some iOS versions.
            overscrollBehavior: "none",
            touchAction: "pan-y",
            // In landscape mode, account for left/right safe areas (notch on left,
            // home indicator on right). On mobile the sidebar is not present, so
            // both insets must be respected. On desktop (md+) the sidebar covers
            // the left safe area and the ml-64 class handles the offset, so only
            // the right inset needs to be added via padding.
            paddingLeft: "env(safe-area-inset-left, 0px)",
            paddingRight: "env(safe-area-inset-right, 0px)",
          }}
        >
          <div className="px-4 pt-2 sm:px-6 md:px-8 pb-[max(2rem,env(safe-area-inset-bottom))] library-scroll-content">
            {children}
          </div>
        </main>
      </div>
    </div>
    </NativeAuthGate>
  )
}
