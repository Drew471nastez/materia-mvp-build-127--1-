"use client"

import { useState, useEffect, type ReactNode } from "react"
import { useRouter } from "next/navigation"
import { AuthResolvingScreen } from "@/components/auth/auth-resolving-screen"

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
}: {
  children: ReactNode
  requireAuth?: boolean
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
          // Session found in Preferences — unblock and render children
          setBlocked(false)
          setAuthChecked(true)
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
  // hideAuthLoading() is idempotent, so duplicate calls are harmless.
  useEffect(() => {
    if (blocked || !authChecked) return
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const native = (window as any).StorelibNative
      if (native?.appReady) native.appReady()
    } catch {}
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
    return <AuthResolvingScreen />
  }

  return <>{children}</>
}
