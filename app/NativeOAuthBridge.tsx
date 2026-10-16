"use client"

/**
 * app/NativeOAuthBridge.tsx
 *
 * Global singleton component — rendered once in app/layout.tsx <body>.
 *
 * Responsibilities:
 *
 * 1. OAuth listener: registers the Capacitor appUrlOpen listener for
 *    deep-link callbacks (storelib://auth/callback, recovery links).
 *
 * 2. Per-route appReady(): calls nativeAppReady() on every client-side
 *    route render so the native overlay is dismissed once React has
 *    painted the first real UI.  Guards against firing mid-exchange via
 *    the nativeAuthInProgress sessionStorage flag.
 *
 * 3. App-resume reinforcement: listens for the app becoming active after
 *    being backgrounded (user returning from the Chrome Custom Tab after
 *    Google OAuth).  If an OAuth flow is in progress (__oauthStarting or
 *    nativeAuthInProgress), calls nativeAuthStart() to ensure the native
 *    overlay is (re)shown before the WebView renders a visible frame.
 *    This eliminates the brief flash of the login / signup form between
 *    the browser closing and the appUrlOpen handler taking over.
 *
 *    Strategy (belt-and-suspenders):
 *    a) Try Capacitor App.addListener("appStateChange") first.
 *    b) Fall back to document "visibilitychange" if Capacitor is absent.
 */

import { useEffect, useCallback } from "react"
import { usePathname } from "next/navigation"
import { setupNativeOAuthListeners } from "@/lib/native-oauth"
import {
  nativeAppReady,
  nativeAuthStart,
  isNativeAuthInProgress,
} from "@/lib/native-bridge"

export default function NativeOAuthBridge() {
  // ── 1. One-time OAuth listener registration ──────────────────────────────
  useEffect(() => {
    let cleanup: (() => void) | undefined
    setupNativeOAuthListeners().then((fn) => { cleanup = fn })
    return () => { cleanup?.() }
  }, [])

  // ── 2. Per-route appReady() signal ───────────────────────────────────────
  // Fires on initial mount AND on every SPA navigation.
  // nativeAppReady() internally checks nativeAuthInProgress before calling
  // the bridge, so no explicit guard is needed here.
  //
  // IMPORTANT: skip /app and /library — those routes mount NativeAuthGate
  // which calls nativeAppReadyForce() via requestAnimationFrame AFTER the
  // session is verified and content is painted.  Firing here would dismiss
  // the native overlay before NativeAuthGate has confirmed the session,
  // causing the blank/white AuthResolvingScreen to flash briefly.
  const pathname = usePathname()
  useEffect(() => {
    if (pathname.startsWith("/app") || pathname.startsWith("/library") || pathname.startsWith("/account/library")) return
    nativeAppReady()
  }, [pathname])

  // ── 3. App-resume overlay reinforcement ─────────────────────────────────
  // The Chrome Custom Tab is a separate Android Activity.  When it closes,
  // the WebView Activity resumes.  Because handleGoogleSignIn() calls
  // nativeAuthStart() just before Browser.open(), the overlay is already
  // visible when the Activity resumes.  This listener is a belt-and-suspenders
  // fallback — it calls nativeAuthStart() again on resume so even OEM devices
  // that dismiss the overlay unexpectedly are covered.
  const onResume = useCallback(() => {
    if (isNativeAuthInProgress() || (window as any).__oauthStarting) {
      nativeAuthStart()
    }
  }, [])

  useEffect(() => {
    let removeHandle: (() => void) | undefined
    let gone = false

    async function setupResumeListener() {
      try {
        const { Capacitor } = await import("@capacitor/core")
        if (gone || !Capacitor.isNativePlatform()) return

        const { App } = await import("@capacitor/app")
        if (gone) return
        const handle = await App.addListener("appStateChange", ({ isActive }) => {
          if (isActive) onResume()
        })
        /* Unmounted while the bridge answered: the cleanup has run already, so take it off now. */
        if (gone) return void handle.remove()
        removeHandle = () => handle.remove()
      } catch {
        if (gone) return
        // Capacitor plugin unavailable — fall back to visibilitychange
        const fn = () => {
          if (document.visibilityState === "visible") onResume()
        }
        document.addEventListener("visibilitychange", fn)
        removeHandle = () => document.removeEventListener("visibilitychange", fn)
      }
    }

    setupResumeListener()
    return () => {
      gone = true
      removeHandle?.()
    }
  }, [onResume])

  return null
}
