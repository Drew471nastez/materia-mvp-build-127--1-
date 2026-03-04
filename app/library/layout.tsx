import type React from "react"
import { redirect } from "next/navigation"
import { headers } from "next/headers"
import { createClient } from "@/lib/supabase/server"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { PurchaseSyncProvider } from "@/components/checkout/purchase-sync-provider"
import { NativeAuthGate } from "@/components/native-auth-gate"
import LibraryLoading from "./loading"

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
  const supabase = await createClient()
  const isNative = await isCapacitorWebView()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    if (isNative) {
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
  const { data: gateCheck } = await supabase
    .from("profiles")
    .select("email_verified, is_creator, welcome_completed")
    .eq("id", user.id)
    .maybeSingle()

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
    <div className="min-h-svh bg-[#fafafa]">
      <PurchaseSyncProvider />
      <DashboardSidebar />

      {/* Main content column — sits next to sidebar on desktop */}
      <div className="flex min-h-svh flex-col md:ml-64">
        {/* Content area — body scrolls naturally (no internal scroll container) */}
        {/* Mobile: 3.5 rem header height + status-bar safe area.
            Desktop: no fixed header above content, but the sidebar starts at
            top-0 with its own pt-[env(safe-area-inset-top)]. The main content
            must also clear the status bar, so we add env(safe-area-inset-top)
            as desktop top-padding. In a browser env() = 0 → md:pt-0. */}
        <main
          className="flex-1 pt-[calc(3.5rem+env(safe-area-inset-top))] md:pt-[env(safe-area-inset-top,_0px)]"
          style={{ WebkitOverflowScrolling: "touch" }}
        >
          <div className="px-4 py-6 sm:px-6 md:px-8 pb-[max(2rem,env(safe-area-inset-bottom))]">
            {children}
          </div>
        </main>
      </div>
    </div>
    </NativeAuthGate>
  )
}
