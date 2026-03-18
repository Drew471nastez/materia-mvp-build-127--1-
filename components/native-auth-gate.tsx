"use client"

import { useState, useEffect, type ReactNode } from "react"
import { useRouter } from "next/navigation"
import { AuthResolvingScreen } from "@/components/auth/auth-resolving-screen"
import { nativeAppReadyForce } from "@/lib/native-bridge"

/**
 * Lightweight client gate for server-rendered layouts.
 *
 * Two modes:
 *
 * 1. Default (requireAuth=false):
 *    Only blocks rendering while native-oauth.ts is actively handling a
 *    deep-link callback (sessionStorage.nativeAuthInProgress === "1").
 *    Does NOT add a boot delay — the server already verified auth via cookies.
 *
 * 2. requireAuth=true (Capacitor full-page reload path):
 *    Used when the server layout skipped the redirect because it's a Capacitor
 *    request (session is in Preferences, not cookies). In this mode the gate
 *    shows a loading screen while the Supabase client restores the session
 *    from Capacitor Preferences, then renders children if a session is found
 *    or redirects to /login if not.
 *
 * Usage in a server layout:
 *   import { NativeAuthGate } from "@/components/native-auth-gate"
 *   return <NativeAuthGate>{children}</NativeAuthGate>           // mode 1
 *   return <NativeAuthGate requireAuth>{children}</NativeAuthGate> // mode 2
 */
export function NativeAuthGate({
  children,
  requireAuth = false,
  loadingFallback,
}: {
  children: ReactNode
  requireAuth?: boolean
  /** Custom loading UI shown while auth resolves (requireAuth mode). Defaults to AuthResolvingScreen. */
  loadingFallback?: ReactNode
}) {
  const router = useRouter()
  // Start as true (blocked) when requireAuth is set — we must verify before rendering.
  // Start as false for the default mode — server already verified auth via cookies.
  const [blocked, setBlocked] = useState(requireAuth)
  const [authChecked, setAuthChecked] = useState(!requireAuth)

  // ── Mode 2: Capacitor full-page reload — restore session from Preferences ──
  useEffect(() => {
    if (!requireAuth) return

    let cancelled = false

    async function checkNativeSession() {
      try {
        // Dynamic import so this only runs on the client in Capacitor
        const { createClient } = await import("@/lib/supabase/client")
        const supabase = createClient()
        const { data: { session } } = await supabase.auth.getSession()

        if (cancelled) return

        if (session) {
          // Session found in Preferences, but Next.js server components read
          // cookies — not Preferences. Route through sync-session to write the
          // session as Set-Cookie headers so the full server layout (sidebar,
          // user data, etc.) renders correctly on the next request.
          const currentPath = window.location.pathname + window.location.search
          const syncUrl =
            `/auth/sync-session` +
            `?access_token=${encodeURIComponent(session.access_token)}` +
            `&refresh_token=${encodeURIComponent(session.refresh_token)}` +
            `&next=${encodeURIComponent(currentPath)}`
          window.location.assign(syncUrl)
          // Do not unblock — we are navigating away.
          // The destination page's NativeAuthGate (mode 1) will call
          // nativeAppReadyForce() once the full layout is painted.
        } else {
          // No session — redirect to login
          router.replace("/login")
        }
      } catch {
        if (!cancelled) router.replace("/login")
      }
    }

    // Give Supabase client up to 4 s to restore from Preferences
    const timeout = window.setTimeout(() => {
      if (!cancelled) router.replace("/login")
    }, 4000)

    checkNativeSession().then(() => window.clearTimeout(timeout))

    return () => {
      cancelled = true
      window.clearTimeout(timeout)
    }
  }, [requireAuth, router])

  // ── Mode 1: Block only during active OAuth callback ──
  useEffect(() => {
    if (requireAuth) return
    try {
      if (sessionStorage.getItem("nativeAuthInProgress") === "1") {
        setBlocked(true)
      }
    } catch {}
  }, [requireAuth])

  // Signal to the native layer that the first meaningful UI is now visible.
  // Wrapped in requestAnimationFrame so it fires AFTER the browser has
  // painted the content — not just after React scheduled the render.
  // nativeAppReadyForce() bypasses the nativeAuthInProgress guard because
  // at this point the session is confirmed and content is ready to show.
  useEffect(() => {
    if (blocked || !authChecked) return
    requestAnimationFrame(() => {
      nativeAppReadyForce()
    })
  }, [blocked, authChecked])

  // Poll for flag removal + safety timeout (mode 1 only)
  useEffect(() => {
    if (requireAuth || !blocked) return
    const poll = window.setInterval(() => {
      try {
        if (sessionStorage.getItem("nativeAuthInProgress") !== "1") {
          setBlocked(false)
        }
      } catch {
        setBlocked(false)
      }
    }, 300)
    const safety = window.setTimeout(() => setBlocked(false), 15_000)
    return () => {
      window.clearInterval(poll)
      window.clearTimeout(safety)
    }
  }, [blocked, requireAuth])

  if (blocked || !authChecked) {
    return <>{loadingFallback ?? <AuthResolvingScreen />}</>
  }

  return <>{children}</>
}
