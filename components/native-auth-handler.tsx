"use client"

/**
 * components/native-auth-handler.tsx
 *
 * Renders nothing. On mount (native only) registers a Capacitor `appUrlOpen`
 * listener that catches the OAuth deep-link redirect after Google sign-in.
 *
 * Flow:
 *  1. User taps "Continue with Google" on login/signup.
 *  2. startNativeGoogleOAuth() opens SFSafariViewController / Chrome Custom Tab.
 *  3. After consent, Supabase redirects to com.storelib.app://auth/callback?code=…
 *  4. iOS / Android intercepts → fires Capacitor appUrlOpen event.
 *  5. This component catches the event, calls handleNativeOAuthCallback(), and
 *     routes based on the result:
 *       creator  → /app
 *       buyer    → /library
 *       new user → /welcome  (no role chosen yet)
 *       error    → /login?authError=exchange_failed
 */

import { useEffect, useRef } from "react"
import { useRouter } from "next/navigation"

export function NativeAuthHandler() {
  const router = useRouter()
  const listenerRef = useRef<{ remove: () => void } | null>(null)
  const registeredRef = useRef(false)

  useEffect(() => {
    async function register() {
      // Only run inside the Capacitor native wrapper.
      const { Capacitor } = await import("@capacitor/core")
      if (!Capacitor.isNativePlatform()) return
      if (registeredRef.current) return
      registeredRef.current = true

      const { App } = await import("@capacitor/app")
      const { createClient } = await import("@/lib/supabase/client")
      const { handleNativeOAuthCallback } = await import("@/lib/native-bridge")

      const { openTarget } = await import("@/lib/platform/open-in-app")

      listenerRef.current = await App.addListener("appUrlOpen", async ({ url }) => {
        /* "Open in app" from the library in a phone's browser
           (components/library/open-in-app.tsx): go to the page it names. */
        const opened = openTarget(url)
        if (opened) {
          router.push(opened)
          return
        }
        // Only handle URLs that look like our OAuth callback.
        if (!url.includes("/auth/callback") && !url.includes("auth/callback")) return

        // Cover the screen with a neutral overlay immediately so the user
        // never sees the current page flash or partial loading states during
        // the deep-link navigation. The overlay is removed once the destination
        // page has painted (via its own loading/splash logic).
        let overlay: HTMLDivElement | null = null
        try {
          overlay = document.createElement("div")
          overlay.style.cssText =
            "position:fixed;inset:0;z-index:999998;background:#f2f2f2;"
          document.body.appendChild(overlay)
          // Two rAF frames ensure the overlay paints before we navigate.
          await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())))
        } catch { /* ignore — overlay is best-effort */ }

        try {
          const supabase = createClient()
          const { nextPath } = await handleNativeOAuthCallback(url, supabase)
          // Use replace so the callback URL doesn't stay in history.
          router.replace(nextPath)
        } catch (err) {
          console.error("[NativeAuthHandler] appUrlOpen error:", err)
          router.replace("/login?authError=exchange_failed")
        } finally {
          // Remove overlay after navigation starts (generous timeout so
          // loading.tsx and destination page have time to paint first).
          setTimeout(() => { try { overlay?.remove() } catch {} }, 2000)
        }
      })
    }

    register().catch(console.error)

    return () => {
      listenerRef.current?.remove()
      listenerRef.current = null
      registeredRef.current = false
    }
  }, [router])

  return null
}
