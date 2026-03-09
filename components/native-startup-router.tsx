"use client"

/**
 * components/native-startup-router.tsx
 *
 * Handles native Capacitor (iOS + Android) startup routing.
 *
 * PROBLEM:
 *   When the native app cold-starts, Capacitor loads the static web export
 *   and lands on "/" — the marketing landing page. Native users should never
 *   see the marketing page; they should land on /welcome (not logged in) or
 *   /app (already logged in).
 *
 * SOLUTION:
 *   1. Module-level synchronous code hides the document BEFORE React hydrates
 *      so the marketing page never flashes on native.
 *   2. useEffect checks the Supabase session and replaces the location.
 *
 * PLATFORMS:
 *   Native Capacitor (iOS / Android) at "/" → session check → /welcome or /app
 *   Web browser                              → complete no-op, marketing page renders normally
 *   Any other route on native               → no-op (already past startup)
 *
 * LOGOUT:
 *   nativeLogOut() in lib/native-bridge.ts navigates to "/" on native.
 *   This component intercepts that "/" load, checks the session (null after
 *   signOut), and routes back to /welcome — same path as cold-start.
 *
 * ADD TO:
 *   app/layout.tsx — rendered once globally alongside NativeOAuthBridge
 */

// ── Synchronous flash prevention ─────────────────────────────────────────────
// Runs at JS bundle evaluation time — before React hydrates the DOM —
// so the marketing page is never painted to native users.
// Guard: only hides on native Capacitor at the root path.
if (typeof window !== "undefined") {
  try {
    const isNative =
      typeof (window as any).Capacitor?.isNativePlatform === "function" &&
      (window as any).Capacitor.isNativePlatform() === true
    if (isNative && window.location.pathname === "/") {
      document.documentElement.style.visibility = "hidden"
    }
  } catch {
    // Non-Capacitor environment — ignore
  }
}

import { useEffect } from "react"
import { usePathname } from "next/navigation"
import { createClient } from "@/lib/supabase/client"

export function NativeStartupRouter() {
  const pathname = usePathname()

  useEffect(() => {
    // Only intercept the root path — the cold-start landing point for the app.
    // All other routes mean the user is already navigating inside the app.
    if (pathname !== "/") return

    async function route() {
      try {
        const { Capacitor } = await import("@capacitor/core")

        if (!Capacitor.isNativePlatform()) {
          // Web browser — restore visibility (belt-and-suspenders; the
          // module-level guard would not have hidden it, but just in case).
          document.documentElement.style.visibility = ""
          return
        }

        // Native app — check for an existing Supabase session.
        // On Capacitor, sessions are stored in Capacitor Preferences
        // (iOS: NSUserDefaults, Android: SharedPreferences) so getSession()
        // is synchronous-like and very fast (no network needed).
        const supabase = createClient()
        const {
          data: { session },
        } = await supabase.auth.getSession()

        if (session) {
          // Already authenticated → go straight to the dashboard.
          window.location.replace("/app")
        } else {
          // Not authenticated → show the native welcome screen.
          window.location.replace("/welcome")
        }
      } catch {
        // Something went wrong — restore visibility so the user isn't
        // stuck on a hidden page, and fall back to /welcome.
        document.documentElement.style.visibility = ""
        try {
          window.location.replace("/welcome")
        } catch {
          // Last resort: hard reload
          window.location.reload()
        }
      }
    }

    route()
  }, [pathname])

  return null
}
