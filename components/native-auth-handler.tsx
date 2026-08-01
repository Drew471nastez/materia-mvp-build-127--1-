"use client"

/**
 * components/native-auth-handler.tsx
 *
 * NOT MOUNTED — do not add this back to a layout. lib/native-oauth.ts, wired up
 * by app/NativeOAuthBridge.tsx, owns the appUrlOpen deep link.
 *
 * Both were mounted at once in app/layout.tsx, and both answered the same
 * appUrlOpen event by calling exchangeCodeForSession() with the same OAuth
 * authorization code. That code is single-use: the second exchange always
 * failed, and this handler responded to that failure by routing to
 * /login?error=oauth_failed — so a sign-in that had genuinely succeeded in the
 * other handler still presented to the user as a failure. It also stopped after
 * establishing the session in Capacitor Preferences, never calling
 * /auth/sync-session, so on the runs where it won the race the Next.js server
 * saw no cookies and bounced the user back out of /app anyway.
 *
 * Kept only for reference. The surviving handler covers everything below plus
 * the recovery, bridge-code and cold-start launch URL paths.
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
 *       error    → /login?error=oauth_failed
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

      listenerRef.current = await App.addListener("appUrlOpen", async ({ url }) => {
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
          router.replace("/login?error=oauth_failed")
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
