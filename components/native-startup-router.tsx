"use client"

/**
 * components/native-startup-router.tsx
 *
 * Native Capacitor (iOS + Android) startup router.
 *
 * WHY THIS EXISTS:
 *   Capacitor always loads index.html ("/") on cold start. Native users must
 *   never land on the marketing page; they need to reach /welcome (logged out)
 *   or /app|/library (logged in) immediately.
 *
 * SESSION DETECTION — three-layer strategy:
 *
 *   Layer 1 — supabase.auth.getSession()
 *     Reads from Capacitor Preferences (NSUserDefaults / SharedPreferences).
 *     With autoRefreshToken:true, also silently refreshes an expired access
 *     token via network. Returns a valid session object when successful.
 *
 *   Layer 2 — raw Capacitor Preferences read
 *     getSession() returns null when the access token is expired AND the
 *     network is not yet ready (common on iOS cold start immediately after
 *     the app was killed). In this case the session DATA still exists in
 *     Preferences — the user IS logged in, the refresh just couldn't fire.
 *     We read the raw Supabase storage key directly. If it exists, the user
 *     was authenticated; we route optimistically using the cached home route
 *     and let NativeAuthGate handle cookie sync + token refresh on arrival.
 *
 *   Layer 3 — no session data anywhere → /welcome
 *     Only reached when the user genuinely hasn't signed in (or explicitly
 *     signed out, which calls clearNativeHome() and removes the session).
 *
 * ACCOUNT TYPE ROUTING:
 *   After determining a live session (Layer 1), we query the DB once to
 *   get creator vs buyer status and cache the result (sb-native-home) in
 *   Capacitor Preferences. All subsequent cold starts use the cache —
 *   zero DB queries.
 *
 * PLATFORMS:
 *   Native Capacitor at "/" → this router runs, decides destination.
 *   Web browser            → complete no-op, marketing page renders normally.
 *   Any non-"/" route      → no-op (user is already navigating inside the app).
 */

// ── Synchronous flash prevention ──────────────────────────────────────────────
// Runs at JS bundle evaluation time — before React hydrates the DOM —
// so the marketing page is never painted to native users.
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
import { cacheNativeHome, getCachedNativeHome } from "@/lib/native-bridge"

export function NativeStartupRouter() {
  const pathname = usePathname()

  useEffect(() => {
    // Only intercept the root path — the cold-start landing point.
    if (pathname !== "/") return

    async function route() {
      try {
        const { Capacitor } = await import("@capacitor/core")

        if (!Capacitor.isNativePlatform()) {
          // Web browser — restore visibility and let the marketing page render.
          document.documentElement.style.visibility = ""
          return
        }

        const supabase = createClient()

        // ── Layer 1: live session via Supabase SDK ───────────────────────────
        // getSession() reads from Capacitor Preferences and auto-refreshes
        // an expired access token if the network is available.
        const { data: { session } } = await supabase.auth.getSession()

        if (session) {
          // Valid session — use cached home route to avoid a DB query, or
          // fall back to resolving from the DB (first launch after install).
          const cached = await getCachedNativeHome()
          if (cached) {
            document.documentElement.style.visibility = ""
            window.location.replace(cached)
            return
          }
          // No cache yet — query DB, cache result, then navigate.
          const dest = await resolveAndCacheHome(supabase, session.user.id)
          document.documentElement.style.visibility = ""
          window.location.replace(dest)
          return
        }

        // ── Layer 2: raw Preferences check ──────────────────────────────────
        // getSession() returned null. This can happen when the access token
        // expired AND the network wasn't ready yet (iOS cold start race).
        // Check if session data still physically exists in Preferences. If
        // so the user IS authenticated — route optimistically; NativeAuthGate
        // will sync cookies and refresh the token once the destination loads.
        const { Preferences } = await import("@capacitor/preferences")
        const projectRef = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname.split(".")[0]
        const authKey = `sb-${projectRef}-auth-token`
        const { value: rawSession } = await Preferences.get({ key: authKey })

        // Also check localStorage — sessions from app versions before the
        // Preferences storage adapter was added live here.
        let rawLocalSession: string | null = null
        try {
          if (typeof localStorage !== "undefined") {
            rawLocalSession = localStorage.getItem(authKey)
          }
        } catch { /* ignore */ }

        if (rawSession || rawLocalSession) {
          // Session data present — user was logged in. Use cached home if
          // available, otherwise fall back to /app (safe for any account type;
          // NativeAuthGate on /app handles further routing if needed).
          const cached = await getCachedNativeHome()
          document.documentElement.style.visibility = ""
          window.location.replace(cached || "/app")
          return
        }

        // ── Layer 3: no session anywhere → welcome ───────────────────────────
        document.documentElement.style.visibility = ""
        window.location.replace("/welcome")
      } catch {
        // Something went wrong — restore visibility so the user isn't stuck,
        // and fall back to /welcome.
        document.documentElement.style.visibility = ""
        try {
          window.location.replace("/welcome")
        } catch {
          window.location.reload()
        }
      }
    }

    route()
  }, [pathname])

  return null
}

/**
 * Query the DB to determine the user's home route, persist it in Capacitor
 * Preferences, and return it. Falls back to /app on any error.
 */
async function resolveAndCacheHome(
  supabase: ReturnType<typeof createClient>,
  userId: string,
): Promise<string> {
  try {
    const { data: creator } = await supabase
      .from("creators")
      .select("onboarding_completed")
      .eq("user_id", userId)
      .maybeSingle()

    if (creator?.onboarding_completed) {
      await cacheNativeHome("/app")
      return "/app"
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("is_creator, welcome_completed")
      .eq("id", userId)
      .maybeSingle()

    if (profile?.welcome_completed) {
      const dest = profile.is_creator ? "/app" : "/library"
      await cacheNativeHome(dest)
      return dest
    }

    // New user who hasn't chosen a role yet
    return "/signup/success"
  } catch {
    return "/app"
  }
}
