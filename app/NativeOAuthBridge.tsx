"use client"

/**
 * app/NativeOAuthBridge.tsx
 *
 * Global singleton component — rendered once in app/layout.tsx <body>.
 * Wires up the native OAuth deep-link listener for Android / Capacitor.
 *
 * Why here (app/) rather than components/?
 *   Next.js guarantees this module is loaded as part of the root layout on
 *   every route, so the appUrlOpen listener is registered before the user
 *   can complete OAuth and return to the app — regardless of which page they
 *   were on when they tapped "Sign in with Google".
 *
 * All OAuth logic lives in lib/native-oauth.ts.
 *
 * Loading-overlay handshake:
 *   The native shell shows a white overlay (logo + spinner) on launch.
 *   It must be dismissed only when the first meaningful UI is actually
 *   visible — not just when HTML finishes parsing.
 *
 *   Strategy (belt-and-suspenders):
 *   1. NativeAuthGate (on /app and /library layouts) calls appReady() once
 *      auth resolves and content is about to render — covers the logged-in path.
 *   2. The pathname-watch effect below fires on every client-side route render
 *      (including /login, /signup, deep-link targets) and calls appReady() if
 *      no native auth flow is in progress (nativeAuthInProgress !== "1").
 *   3. A 12-second safety timeout on the native side auto-dismisses the overlay
 *      in the unlikely event appReady() is never called.
 */

import { useEffect } from "react"
import { usePathname } from "next/navigation"
import { setupNativeOAuthListeners } from "@/lib/native-oauth"
import { isNativeApp, isNativeAuthInProgress, nativeAppReady, nativeAuthStart } from "@/lib/native-bridge"

export default function NativeOAuthBridge() {
  // ── One-time listener registration ────────────────────────────────
  useEffect(() => {
    let cleanup: (() => void) | undefined

    setupNativeOAuthListeners().then((fn) => {
      cleanup = fn
    })

    return () => {
      cleanup?.()
    }
  }, []) // mount once — never re-runs

  // ── Per-route appReady() signal ────────────────────────────────────
  // Fires on initial mount AND on every SPA navigation.
  // This covers all routes that don't use NativeAuthGate (e.g. /login,
  // /signup, /reset-password) so the native overlay is always dismissed
  // once React has rendered the page.
  //
  // Guard: if nativeAuthInProgress === "1" a native OAuth or recovery
  // flow is running — do NOT dismiss the overlay yet.  NativeAuthGate
  // (on the destination page) will call appReady() once auth completes.
  const pathname = usePathname()
  useEffect(() => {
    if (!isNativeApp()) return

    const shouldKeepOverlay = () => {
      if (isNativeAuthInProgress()) return true
      if (pathname === "/login" || pathname === "/signup") {
        return Boolean((window as any).__oauthStarting)
      }
      return false
    }

    const onForeground = () => {
      if (shouldKeepOverlay()) {
        nativeAuthStart()
      }
    }

    onForeground()

    const onVisibility = () => {
      if (document.visibilityState === "visible") onForeground()
    }

    window.addEventListener("focus", onForeground)
    window.addEventListener("pageshow", onForeground)
    document.addEventListener("visibilitychange", onVisibility)

    let appHandle: { remove: () => void } | undefined
    import("@capacitor/app")
      .then(({ App }) => App.addListener("resume", onForeground))
      .then((handle) => {
        appHandle = handle
      })
      .catch(() => {
        // Fallback listeners above are enough when the plugin is unavailable.
      })

    return () => {
      window.removeEventListener("focus", onForeground)
      window.removeEventListener("pageshow", onForeground)
      document.removeEventListener("visibilitychange", onVisibility)
      appHandle?.remove()
    }
  }, [pathname])

  useEffect(() => {
    try {
      if (!isNativeApp()) return
      if (isNativeAuthInProgress()) return
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          nativeAppReady()
        })
      })
    } catch {
      // sessionStorage unavailable (SSR) or bridge not present (web) — ignore
    }
  }, [pathname])

  return null
}
